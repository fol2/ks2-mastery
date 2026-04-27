// All-in-one spelling audio pre-cache loader.
//
// This wraps the production word-audio generator and the sentence cache key
// contract in one operator entrypoint. It can fill word-only Word Bank audio,
// sentence dictation audio, or both for the same slug set and run id.

import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { WORDS } from '../src/subjects/spelling/data/word-data.js';
import { SEEDED_SPELLING_PUBLISHED_SNAPSHOT } from '../src/subjects/spelling/data/content-data.js';
import {
  BUFFERED_AUDIO_SPEED_OPTIONS,
  BUFFERED_GEMINI_VOICE_OPTIONS,
  SPELLING_AUDIO_MODEL,
  SPELLING_AUDIO_ROOT_PREFIX,
} from '../shared/spelling-audio.js';
import {
  applyInventoryToEntries,
  assertWordsSnapshotParity,
  buildPlannedEntries,
  buildSentencePlannedEntries,
  cleanText,
  createRunId,
  getDirectApiKeyPool,
  isGeminiQuotaError,
  isGeminiTransientError,
  listR2Objects,
  loadDotEnv,
  nowIso,
  preflightExternalCommands,
  processEntry,
  readStateFile,
  runWithConcurrency,
  selectVoices,
  selectWords,
  summariseState,
  writeStateFile,
} from './build-spelling-word-audio.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const workRoot = path.join(rootDir, '.spelling-audio');
const precacheRunsRoot = path.join(workRoot, 'precache-runs');

const DEFAULT_BUCKET_NAME = process.env.SPELLING_AUDIO_R2_BUCKET || 'ks2-spelling-buffers';
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_ENV_FILE = '.env';
const VALID_LANES = Object.freeze(['word', 'sentence']);

function readValue(args, index, flagName) {
  const next = args[index + 1];
  if (next == null || next.startsWith('--')) {
    throw new Error(`${flagName} requires a value.`);
  }
  return next;
}

function splitCsv(value) {
  return String(value || '').split(',').map((entry) => entry.trim()).filter(Boolean);
}

export function parsePrecacheArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice() : [];
  const command = args.shift() || 'help';
  const flags = {
    lane: 'all',
    slug: [],
    voice: '',
    speed: '',
    limit: null,
    offset: 0,
    concurrency: DEFAULT_CONCURRENCY,
    maxRetries: DEFAULT_MAX_RETRIES,
    runId: '',
    dryRun: false,
    skipUpload: false,
    fromR2Inventory: false,
    includeVariants: true,
    envFile: DEFAULT_ENV_FILE,
    json: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--lane':
      case '--lanes':
        flags.lane = readValue(args, index, arg);
        index += 1;
        break;
      case '--slug':
        flags.slug.push(...splitCsv(readValue(args, index, arg)));
        index += 1;
        break;
      case '--voice':
        flags.voice = readValue(args, index, arg);
        index += 1;
        break;
      case '--speed':
        flags.speed = readValue(args, index, arg);
        index += 1;
        break;
      case '--limit': {
        const value = Number(readValue(args, index, arg));
        if (!Number.isInteger(value) || value < 0) throw new Error('--limit must be a non-negative integer.');
        flags.limit = value;
        index += 1;
        break;
      }
      case '--offset': {
        const value = Number(readValue(args, index, arg));
        if (!Number.isInteger(value) || value < 0) throw new Error('--offset must be a non-negative integer.');
        flags.offset = value;
        index += 1;
        break;
      }
      case '--concurrency': {
        const value = Number(readValue(args, index, arg));
        if (!Number.isInteger(value) || value < 1) throw new Error('--concurrency must be a positive integer.');
        flags.concurrency = value;
        index += 1;
        break;
      }
      case '--max-retries': {
        const value = Number(readValue(args, index, arg));
        if (!Number.isInteger(value) || value < 0) throw new Error('--max-retries must be a non-negative integer.');
        flags.maxRetries = value;
        index += 1;
        break;
      }
      case '--run-id':
        flags.runId = readValue(args, index, arg);
        index += 1;
        break;
      case '--env-file':
        flags.envFile = readValue(args, index, arg);
        index += 1;
        break;
      case '--skip-env-file':
        flags.envFile = '';
        break;
      case '--dry-run':
        flags.dryRun = true;
        break;
      case '--skip-upload':
        flags.skipUpload = true;
        break;
      case '--from-r2-inventory':
        flags.fromR2Inventory = true;
        break;
      case '--no-variants':
        flags.includeVariants = false;
        break;
      case '--json':
        flags.json = true;
        break;
      case '--help':
      case '-h':
        flags.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return { command, flags };
}

export function selectLanes(laneFlag = 'all') {
  const requested = splitCsv(laneFlag || 'all').map((value) => value.toLowerCase());
  if (!requested.length || requested.includes('all')) return VALID_LANES.slice();
  const unknown = requested.filter((lane) => !VALID_LANES.includes(lane));
  if (unknown.length) throw new Error(`Unknown audio lane(s): ${unknown.join(', ')}. Allowed: all, word, sentence.`);
  return [...new Set(requested)];
}

export function selectSpeeds(speedFlag = '') {
  if (!speedFlag) return BUFFERED_AUDIO_SPEED_OPTIONS.map((speed) => ({ id: speed.id, slow: speed.slow }));
  const requested = splitCsv(speedFlag);
  const byId = new Map(BUFFERED_AUDIO_SPEED_OPTIONS.map((speed) => [speed.id, speed]));
  const speeds = requested.map((speedId) => {
    const speed = byId.get(speedId);
    if (!speed) throw new Error(`Unknown buffered speed "${speedId}". Allowed: ${[...byId.keys()].join(', ')}.`);
    return { id: speed.id, slow: speed.slow };
  });
  return speeds;
}

export function statePathFor(runId) {
  return path.join(precacheRunsRoot, runId, 'state.json');
}

function entryIdentity(entry) {
  return entry.id || [
    entry.kind || 'word',
    entry.voice,
    entry.speed || 'word',
    entry.slug,
    Number.isInteger(entry.sentenceIndex) ? entry.sentenceIndex : 'word',
    entry.contentKey,
  ].join(':');
}

export function mergePrecacheState(plannedEntries, existingState) {
  if (!existingState?.entries?.length) return plannedEntries;
  const previous = new Map();
  for (const entry of existingState.entries) {
    previous.set(entryIdentity(entry), entry);
  }
  return plannedEntries.map((entry) => {
    const prior = previous.get(entryIdentity(entry));
    if (!prior) return entry;
    if (prior.key !== entry.key || prior.contentKey !== entry.contentKey) return entry;
    return {
      ...entry,
      status: prior.status === 'uploaded' ? 'uploaded' : prior.status === 'generated' ? 'generated' : entry.status,
      attempts: Number(prior.attempts || 0),
      lastError: prior.lastError || null,
    };
  });
}

function decorateWordEntries(entries) {
  return entries.map((entry) => ({
    ...entry,
    id: `word:${entry.voice}:${entry.slug}`,
    kind: 'word',
    fileStem: `${entry.slug}-word-${entry.voice}`,
  }));
}

export async function buildPrecacheEntries({
  lanes,
  words,
  voices,
  speeds,
  includeVariants = true,
  model = SPELLING_AUDIO_MODEL,
} = {}) {
  const entries = [];
  if (lanes.includes('word')) {
    entries.push(...decorateWordEntries(await buildPlannedEntries({ words, voices, model })));
  }
  if (lanes.includes('sentence')) {
    entries.push(...await buildSentencePlannedEntries({
      words,
      voices,
      speeds,
      includeVariants,
      model,
    }));
  }
  return entries;
}

function inventoryPrefixes({ lanes, voices, speeds, model = SPELLING_AUDIO_MODEL } = {}) {
  const prefixes = [];
  const encodedModel = encodeURIComponent(model);
  if (lanes.includes('word')) {
    for (const voice of voices) {
      prefixes.push(`${SPELLING_AUDIO_ROOT_PREFIX}/${encodedModel}/${encodeURIComponent(voice)}/word/`);
    }
  }
  if (lanes.includes('sentence')) {
    for (const voice of voices) {
      for (const speed of speeds) {
        prefixes.push(`${SPELLING_AUDIO_ROOT_PREFIX}/${encodedModel}/${encodeURIComponent(voice)}/${encodeURIComponent(speed.id)}/`);
      }
    }
  }
  return prefixes;
}

async function applyR2Inventory({
  entries,
  lanes,
  voices,
  speeds,
  bucketName,
  env,
  dependencies,
} = {}) {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required when --from-r2-inventory is set.');
  }
  const lister = dependencies.listR2Objects || listR2Objects;
  const inventory = new Set();
  for (const prefix of inventoryPrefixes({ lanes, voices, speeds })) {
    const keys = await lister({
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      bucket: bucketName,
      prefix,
      apiToken: env.CLOUDFLARE_API_TOKEN,
      fetchImpl: dependencies.fetchImpl,
    });
    for (const key of keys) inventory.add(key);
  }
  return {
    entries: applyInventoryToEntries(entries, inventory),
    inventorySize: inventory.size,
  };
}

function assertContentParity() {
  assertWordsSnapshotParity({ words: WORDS, snapshot: SEEDED_SPELLING_PUBLISHED_SNAPSHOT });
  const snapshotWordCount = Object.keys(SEEDED_SPELLING_PUBLISHED_SNAPSHOT.wordBySlug || {}).length;
  if (WORDS.length !== snapshotWordCount) {
    throw new Error(`WORDS/snapshot word count mismatch (WORDS=${WORDS.length}, snapshot=${snapshotWordCount}); aborting before Gemini spend.`);
  }
}

export async function commandPrecache({
  flags = {},
  env = process.env,
  dependencies = {},
} = {}) {
  const dryRun = Boolean(flags.dryRun);
  const lanes = selectLanes(flags.lane);
  const voices = selectVoices(flags.voice);
  const speeds = selectSpeeds(flags.speed);
  const words = selectWords({
    slugs: flags.slug || [],
    limit: flags.limit ?? null,
    offset: flags.offset || 0,
    words: WORDS,
  });
  const bucketName = env.SPELLING_AUDIO_R2_BUCKET || DEFAULT_BUCKET_NAME;

  assertContentParity();
  if (!dryRun) {
    const apiKeys = (dependencies.getDirectApiKeyPool || getDirectApiKeyPool)(env);
    if (!apiKeys.length) {
      throw new Error('At least one of GEMINI_API_KEY, GEMINI_API_KEY_2..GEMINI_API_KEY_20, or GEMINI_API_KEYS must be set.');
    }
    if (typeof dependencies.preflight === 'function') await dependencies.preflight();
  }

  const runId = flags.runId || createRunId();
  const statePath = statePathFor(runId);
  const existing = await readStateFile(statePath);
  let entries = await buildPrecacheEntries({
    lanes,
    words,
    voices,
    speeds,
    includeVariants: flags.includeVariants !== false,
  });
  entries = mergePrecacheState(entries, existing);

  let inventorySize = null;
  if (flags.fromR2Inventory && !dryRun) {
    const inventoryResult = await applyR2Inventory({
      entries,
      lanes,
      voices,
      speeds,
      bucketName,
      env,
      dependencies,
    });
    entries = inventoryResult.entries;
    inventorySize = inventoryResult.inventorySize;
  }

  async function flushState() {
    await writeStateFile(statePath, {
      runId,
      createdAt: existing?.createdAt || nowIso(),
      model: SPELLING_AUDIO_MODEL,
      lanes,
      voices,
      speeds: speeds.map((speed) => speed.id),
      includeVariants: flags.includeVariants !== false,
      bucketName,
      entries,
      summary: summariseState(entries),
      ...(inventorySize == null ? {} : { inventorySize }),
    });
  }

  await flushState();
  if (dryRun) {
    return { runId, statePath, summary: summariseState(entries), entries, dryRun: true, inventorySize };
  }

  const apiKeys = (dependencies.getDirectApiKeyPool || getDirectApiKeyPool)(env);
  const exhausted = new Set();
  let activeKeyIndex = 0;
  function nextKey() {
    for (let offset = 0; offset < apiKeys.length; offset += 1) {
      const index = (activeKeyIndex + offset) % apiKeys.length;
      if (!exhausted.has(index)) return { index, apiKey: apiKeys[index].apiKey };
    }
    return null;
  }

  const signalHook = dependencies.processSignals || process;
  let signalsRegistered = false;
  const handleSignal = (signal) => {
    Promise.resolve(flushState()).finally(() => {
      signalHook.exit?.(signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1);
    });
  };
  const sigintListener = () => handleSignal('SIGINT');
  const sigtermListener = () => handleSignal('SIGTERM');
  if (typeof signalHook.on === 'function') {
    signalHook.on('SIGINT', sigintListener);
    signalHook.on('SIGTERM', sigtermListener);
    signalsRegistered = true;
  }

  try {
    const runDir = path.join(precacheRunsRoot, runId);
    await mkdir(runDir, { recursive: true });
    const remaining = entries.filter((entry) => entry.status !== 'uploaded');
    const concurrency = Number.isFinite(flags.concurrency) && flags.concurrency >= 1
      ? flags.concurrency
      : DEFAULT_CONCURRENCY;
    const maxRetries = Number.isInteger(flags.maxRetries) && flags.maxRetries >= 0
      ? flags.maxRetries
      : DEFAULT_MAX_RETRIES;

    await runWithConcurrency(remaining, concurrency, async (entry) => {
      let lastError = null;
      let transientRetries = 0;
      let usingFallbackPrompt = false;
      while (true) {
        const key = nextKey();
        if (!key) {
          entry.status = 'failed';
          entry.lastError = lastError
            ? `All Gemini API keys exhausted; last error: ${String(lastError?.message || lastError)}`
            : 'All Gemini API keys exhausted.';
          await flushState();
          return;
        }
        entry.attempts = Number(entry.attempts || 0) + 1;
        try {
          await processEntry({
            entry,
            apiKey: key.apiKey,
            model: SPELLING_AUDIO_MODEL,
            bucketName,
            runDir,
            maxRetries,
            skipUpload: Boolean(flags.skipUpload),
            dependencies,
          });
          await flushState();
          return;
        } catch (error) {
          lastError = error;
          if (isGeminiQuotaError(error)) {
            exhausted.add(key.index);
            activeKeyIndex = (key.index + 1) % apiKeys.length;
            continue;
          }
          if (isGeminiTransientError(error) && transientRetries < maxRetries) {
            transientRetries += 1;
            entry.lastError = String(error?.message || error);
            await flushState();
            await new Promise((resolve) => setTimeout(resolve, Math.min(15000, 500 * (2 ** Math.max(0, transientRetries - 1)))));
            continue;
          }
          if (
            isGeminiTransientError(error)
            && !usingFallbackPrompt
            && entry.fallbackPromptText
            && entry.promptText !== entry.fallbackPromptText
          ) {
            usingFallbackPrompt = true;
            transientRetries = 0;
            entry.promptText = entry.fallbackPromptText;
            entry.promptMode = 'fallback-simple';
            entry.lastError = String(error?.message || error);
            await flushState();
            continue;
          }
          break;
        }
      }
      entry.status = entry.status === 'generated' ? 'generated' : 'failed';
      entry.lastError = String(lastError?.message || lastError || 'Pipeline failed.');
      await flushState();
    });
    await flushState();
  } finally {
    if (signalsRegistered && typeof signalHook.removeListener === 'function') {
      signalHook.removeListener('SIGINT', sigintListener);
      signalHook.removeListener('SIGTERM', sigtermListener);
    }
  }

  return { runId, statePath, summary: summariseState(entries), entries, inventorySize };
}

export async function commandStatus({ runId } = {}) {
  if (!runId) throw new Error('--run-id is required for status.');
  const statePath = statePathFor(runId);
  const state = await readStateFile(statePath);
  if (!state) throw new Error(`No state file for run ${runId} (expected ${statePath}).`);
  const summary = summariseState(state.entries || []);
  const failures = (state.entries || [])
    .filter((entry) => entry.status === 'failed' || entry.lastError)
    .map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      slug: entry.slug,
      voice: entry.voice,
      speed: entry.speed,
      status: entry.status,
      attempts: entry.attempts,
      lastError: entry.lastError,
    }));
  return { runId, statePath, summary, failures };
}

function printUsage() {
  console.log([
    'Usage:',
    '  npm run spelling:audio-cache -- list [--lane all|word|sentence] [--slug a,b] [--voice <id>] [--speed standard,slow]',
    '  npm run spelling:audio-cache -- dry-run [--lane all|word|sentence] [--slug a,b] [--no-variants]',
    '  npm run spelling:audio-cache -- generate [--lane all|word|sentence] [--slug a,b] [--voice <id>]',
    '                                             [--speed standard,slow] [--concurrency 4] [--max-retries 3]',
    '                                             [--skip-upload] [--from-r2-inventory] [--run-id <id>]',
    '                                             [--env-file .env] [--no-variants]',
    '  npm run spelling:audio-cache -- status --run-id <id>',
    '',
    'Lanes:',
    '  word      Word Bank word-only audio, one object per slug × voice.',
    '  sentence  Dictation sentence audio, one object per prompt sentence × voice × speed.',
    '  all       Both lanes in one resumable state file.',
    '',
    'The CLI loads .env by default when it exists. Use --skip-env-file to rely only on shell env.',
  ].join('\n'));
}

function maybeLoadEnvFile(flags) {
  if (!flags.envFile) return;
  const envPath = path.resolve(rootDir, flags.envFile);
  if (existsSync(envPath)) loadDotEnv(envPath);
}

async function runCli(argv) {
  let parsed;
  try {
    parsed = parsePrecacheArgs(argv);
  } catch (error) {
    console.error(String(error?.message || error));
    process.exit(2);
  }

  maybeLoadEnvFile(parsed.flags);

  if (parsed.flags.help || parsed.command === 'help') {
    printUsage();
    return;
  }

  try {
    switch (parsed.command) {
      case 'list': {
        const lanes = selectLanes(parsed.flags.lane);
        const voices = selectVoices(parsed.flags.voice);
        const speeds = selectSpeeds(parsed.flags.speed);
        const words = selectWords({
          slugs: parsed.flags.slug,
          limit: parsed.flags.limit,
          offset: parsed.flags.offset,
          words: WORDS,
        });
        const entries = await buildPrecacheEntries({
          lanes,
          words,
          voices,
          speeds,
          includeVariants: parsed.flags.includeVariants,
        });
        for (const entry of entries) {
          console.log([entry.kind, entry.slug, entry.word, entry.voice, entry.speed || 'word', entry.key].join('\t'));
        }
        break;
      }
      case 'dry-run': {
        const result = await commandPrecache({
          flags: { ...parsed.flags, dryRun: true },
        });
        console.log(JSON.stringify({
          runId: result.runId,
          statePath: result.statePath,
          summary: result.summary,
          dryRun: true,
        }, null, 2));
        break;
      }
      case 'generate': {
        await preflightExternalCommands();
        const result = await commandPrecache({ flags: parsed.flags });
        console.log(JSON.stringify({
          runId: result.runId,
          statePath: result.statePath,
          summary: result.summary,
          ...(result.inventorySize == null ? {} : { inventorySize: result.inventorySize }),
        }, null, 2));
        break;
      }
      case 'status': {
        const result = await commandStatus({ runId: parsed.flags.runId });
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      default:
        console.error(`Unknown command: ${parsed.command}`);
        printUsage();
        process.exit(2);
    }
  } catch (error) {
    console.error(String(error?.message || error));
    process.exit(1);
  }
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirect) {
  await runCli(process.argv.slice(2));
}
