// U2 (spelling word audio cache): batch generator that pre-fills the R2
// word-only audio cache the Worker began consuming in PR 252. The script
// reads `WORDS` from the spelling content module, mirrors the Worker's
// `bufferedAudioMetadata({ wordOnly: true })` hash + key derivation byte-for-
// byte, requests audio from Gemini's `generateContent` direct API (with a
// rotating key pool), transcodes the PCM response to MP3 via ffmpeg, and
// uploads the resulting object to the production R2 bucket
// `ks2-spelling-buffers` through the existing `wrangler-oauth.mjs` wrapper.
//
// Hash + key derivation MUST stay byte-equal to the Worker. This file relies
// on three guards:
//   1. The shared `buildWordAudioAssetKey` + `buildBufferedWordSpeechPrompt`
//      helpers from `shared/spelling-audio.js` (one source of truth — pinned
//      by `tests/spelling-word-prompt.test.js`).
//   2. An inline `computeWordContentKey` that re-implements
//      `worker/src/auth.js sha256` (SHA-256 → base64url, no `=` padding,
//      `+`→`-`, `/`→`_`) — duplication, not import, because the Worker
//      module pulls runtime dependencies that do not resolve cleanly from
//      `scripts/`. Drift is caught by `tests/build-spelling-word-audio.test.js`
//      `hash byte-equality` integration test, not by the import path.
//   3. A preflight assertion that `cleanText(WORDS[i].word)` matches
//      `cleanText(SEEDED_SPELLING_PUBLISHED_SNAPSHOT.wordBySlug[slug].word)`
//      for every fixture word, before any Gemini spend.
//
// All side-effecting calls (Gemini fetch, ffmpeg execFile, wrangler-oauth
// invocation, REST list) are funnelled through an injectable `dependencies`
// object so the unit tests can stub them without ever reaching production.

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { WORDS } from '../src/subjects/spelling/data/word-data.js';
import { SEEDED_SPELLING_PUBLISHED_SNAPSHOT } from '../src/subjects/spelling/data/content-data.js';
import {
  BUFFERED_GEMINI_VOICE_OPTIONS,
  SPELLING_AUDIO_MODEL,
  buildBufferedWordSpeechPrompt,
  buildWordAudioAssetKey,
} from '../shared/spelling-audio.js';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const workRoot = path.join(rootDir, '.spelling-audio');
const wordRunsRoot = path.join(workRoot, 'word-runs');

const DEFAULT_BUCKET_NAME = process.env.SPELLING_AUDIO_R2_BUCKET || 'ks2-spelling-buffers';
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MAX_RETRIES = 3;
const MAX_API_KEY_INDEX = 20;
const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';
const RUN_PREFIX = 'spelling-audio/v1';

// `cleanText` is duplicated from `worker/src/tts.js:38-40` and
// `worker/src/subjects/spelling/audio.js:7-9` — both Worker copies are
// identical; keep them in sync if either changes. Bare `.trim()` would
// silently diverge on NBSP / tab / double-space input.
export function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

// `computeWordContentKey` is the byte-for-byte equivalent of
// `worker/src/auth.js sha256` — SHA-256 over UTF-8 input, base64url encoded
// with `+`→`-`, `/`→`_`, no `=` padding. Inline duplication is preferred over
// importing from `worker/src/auth.js` because the Worker module pulls
// runtime dependencies that do not resolve cleanly from `scripts/`. The
// drift defence is `tests/build-spelling-word-audio.test.js` (hash
// byte-equality fixture pinned against the same value worker tests use).
export async function computeWordContentKey(slug, word) {
  const input = ['spelling-audio-word-v1', cleanText(slug).toLowerCase(), cleanText(word)].join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  let binary = '';
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

// `parseArgs` follows the existing `scripts/spelling-dense-history-smoke.mjs`
// argv style — no `node:util parseArgs`, no third-party libs. Returns a
// command + flags shape so the test suite can drive it without spawning a
// child process. Repeated `--slug` flags accumulate; CSV inside a single
// flag is split downstream.
export function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice() : [];
  const command = args.shift() || 'help';
  const flags = {
    slug: [],
    voice: '',
    limit: null,
    offset: 0,
    concurrency: DEFAULT_CONCURRENCY,
    maxRetries: DEFAULT_MAX_RETRIES,
    runId: '',
    dryRun: false,
    skipUpload: false,
    fromR2Inventory: false,
    json: false,
  };

  function readValue(index, flagName) {
    const next = args[index + 1];
    if (next == null || next.startsWith('--')) {
      throw new Error(`${flagName} requires a value.`);
    }
    return next;
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--slug': {
        const value = readValue(index, arg);
        for (const slug of String(value).split(',').map((entry) => entry.trim()).filter(Boolean)) {
          flags.slug.push(slug);
        }
        index += 1;
        break;
      }
      case '--voice':
        flags.voice = readValue(index, arg);
        index += 1;
        break;
      case '--limit': {
        const value = Number(readValue(index, arg));
        if (!Number.isInteger(value) || value < 0) throw new Error('--limit must be a non-negative integer.');
        flags.limit = value;
        index += 1;
        break;
      }
      case '--offset': {
        const value = Number(readValue(index, arg));
        if (!Number.isInteger(value) || value < 0) throw new Error('--offset must be a non-negative integer.');
        flags.offset = value;
        index += 1;
        break;
      }
      case '--concurrency': {
        const value = Number(readValue(index, arg));
        if (!Number.isInteger(value) || value < 1) throw new Error('--concurrency must be a positive integer.');
        flags.concurrency = value;
        index += 1;
        break;
      }
      case '--max-retries': {
        const value = Number(readValue(index, arg));
        if (!Number.isInteger(value) || value < 0) throw new Error('--max-retries must be a non-negative integer.');
        flags.maxRetries = value;
        index += 1;
        break;
      }
      case '--run-id':
        flags.runId = readValue(index, arg);
        index += 1;
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

// `assertWordsSnapshotParity` enforces the single most important upstream
// invariant: `WORDS[i].word` matches the published snapshot's
// `wordBySlug[slug].word` after `cleanText` collapse. Worker computes the
// content key from the snapshot side; generator computes it from the WORDS
// side. If they ever diverge, the generator silently produces audio under
// keys the Worker will never read. Mismatch aborts the run before any
// Gemini spend.
export function assertWordsSnapshotParity({ words = WORDS, snapshot = SEEDED_SPELLING_PUBLISHED_SNAPSHOT } = {}) {
  const wordBySlug = snapshot?.wordBySlug || {};
  for (const word of words) {
    const left = cleanText(word.word);
    const snapshotEntry = wordBySlug[word.slug];
    const right = cleanText(snapshotEntry?.word);
    if (!snapshotEntry) {
      throw new Error(`Snapshot is missing slug "${word.slug}"; aborting before any Gemini spend.`);
    }
    if (left !== right) {
      throw new Error(
        `WORDS/snapshot divergence on slug "${word.slug}": WORDS.word=${JSON.stringify(left)}, snapshot.word=${JSON.stringify(right)}.`,
      );
    }
  }
  return true;
}

// `getDirectApiKeyPool` mirrors the historical script's rotation contract:
// `GEMINI_API_KEY` first, then `GEMINI_API_KEY_2`..`_20` in order, then any
// keys parsed from the comma/whitespace-separated `GEMINI_API_KEYS` value.
// Duplicates are dropped (some operators set both `_2` and `KEYS=...`).
export function getDirectApiKeyPool(env = process.env) {
  const seen = new Set();
  const entries = [];

  function pushKey(envName, value) {
    const apiKey = String(value || '').trim();
    if (!apiKey || seen.has(apiKey)) return;
    seen.add(apiKey);
    entries.push({ envName, apiKey });
  }

  pushKey('GEMINI_API_KEY', env.GEMINI_API_KEY);
  const numbered = Object.keys(env)
    .map((key) => {
      const match = key.match(/^GEMINI_API_KEY_(\d+)$/);
      return match ? { key, index: Number(match[1]) } : null;
    })
    .filter(Boolean)
    .filter((item) => item.index >= 2 && item.index <= MAX_API_KEY_INDEX)
    .sort((left, right) => left.index - right.index);
  for (const { key } of numbered) pushKey(key, env[key]);

  const pooled = String(env.GEMINI_API_KEYS || '').split(/[,\s]+/).filter(Boolean);
  for (const [index, value] of pooled.entries()) pushKey(`GEMINI_API_KEYS[${index + 1}]`, value);

  return entries;
}

// `selectVoices` filters the canonical buffered voice list by the operator's
// `--voice` flag. Unknown voices throw — the same validation path the
// historical script used. Matches the contract `bufferedVoiceById`
// enforces in `shared/spelling-audio.js`.
export function selectVoices(voiceFlag) {
  if (!voiceFlag) return BUFFERED_GEMINI_VOICE_OPTIONS.map((voice) => voice.id);
  const requested = String(voiceFlag).split(',').map((value) => value.trim()).filter(Boolean);
  const valid = new Set(BUFFERED_GEMINI_VOICE_OPTIONS.map((voice) => voice.id));
  for (const voice of requested) {
    if (!valid.has(voice)) {
      throw new Error(`Unknown buffered voice "${voice}". Allowed: ${[...valid].join(', ')}.`);
    }
  }
  return requested;
}

// `selectWords` applies `--slug`, `--limit`, and `--offset`. Slug filtering
// is intentional-set (caller-specified, no positional ordering); limit /
// offset only apply when no slugs are passed (matches historical script).
// Unknown slugs throw with an explicit list — the operator must see the
// typo before the run starts.
export function selectWords({ slugs = [], limit = null, offset = 0, words = WORDS } = {}) {
  if (slugs.length) {
    const requested = new Set(slugs);
    const matched = words.filter((word) => requested.has(word.slug));
    const matchedSlugs = new Set(matched.map((word) => word.slug));
    const missing = [...requested].filter((slug) => !matchedSlugs.has(slug));
    if (missing.length) throw new Error(`Unknown spelling slug(s): ${missing.join(', ')}`);
    return matched;
  }
  const start = Math.max(0, offset);
  if (limit == null) return words.slice(start);
  return words.slice(start, start + limit);
}

// `buildPlannedEntries` produces the (word, voice) cartesian-product list
// the rest of the pipeline operates on. Entry shape mirrors the state-file
// row spec from the U2 plan section. R2 key derivation goes through the
// shared helper so any drift between batch and Worker is caught by the
// `R2 key byte-equality` integration test, not by convention.
export async function buildPlannedEntries({
  words,
  voices,
  model = SPELLING_AUDIO_MODEL,
} = {}) {
  const entries = [];
  for (const word of words) {
    for (const voice of voices) {
      const contentKey = await computeWordContentKey(word.slug, word.word);
      const key = buildWordAudioAssetKey({
        model,
        voice,
        contentKey,
        slug: cleanText(word.slug).toLowerCase(),
      });
      entries.push({
        slug: cleanText(word.slug).toLowerCase(),
        word: cleanText(word.word),
        voice,
        key,
        contentKey,
        status: 'pending',
        attempts: 0,
        lastError: null,
      });
    }
  }
  return entries;
}

// `pcmToWavBuffer` is ported (not imported) from the historical script's
// `pcmToWavBuffer` (`worktrees/161a/.../build-spelling-audio.mjs:510-535`).
// Keeping a Node-side `Buffer`-based implementation avoids dragging Worker
// runtime dependencies into the script. Sample rate falls back to 24kHz
// (Gemini default) when the response mime type lacks a `rate=` parameter.
export function pcmToWavBuffer(base64Data, mimeType) {
  const pcmBytes = Buffer.from(String(base64Data || ''), 'base64');
  if (/audio\/wav/i.test(String(mimeType || ''))) return pcmBytes;

  const rateMatch = String(mimeType || '').match(/rate=(\d+)/i);
  const channelsMatch = String(mimeType || '').match(/channels=(\d+)/i);
  const sampleRate = Number(rateMatch?.[1]) || 24000;
  const channels = Number(channelsMatch?.[1]) || 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const wavBuffer = Buffer.alloc(44 + pcmBytes.length);

  wavBuffer.write('RIFF', 0);
  wavBuffer.writeUInt32LE(36 + pcmBytes.length, 4);
  wavBuffer.write('WAVE', 8);
  wavBuffer.write('fmt ', 12);
  wavBuffer.writeUInt32LE(16, 16);
  wavBuffer.writeUInt16LE(1, 20);
  wavBuffer.writeUInt16LE(channels, 22);
  wavBuffer.writeUInt32LE(sampleRate, 24);
  wavBuffer.writeUInt32LE(byteRate, 28);
  wavBuffer.writeUInt16LE(blockAlign, 32);
  wavBuffer.writeUInt16LE(bitsPerSample, 34);
  wavBuffer.write('data', 36);
  wavBuffer.writeUInt32LE(pcmBytes.length, 40);
  pcmBytes.copy(wavBuffer, 44);

  return wavBuffer;
}

// `extractAudioPayload` mirrors the historical script's helper — Gemini
// returns the audio under either `inlineData` (camelCase) or `inline_data`
// (snake_case) depending on transport version, so both shapes are accepted.
export function extractAudioPayload(json) {
  const parts = json?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const part = parts.find((candidate) => candidate?.inlineData?.data || candidate?.inline_data?.data);
  return part?.inlineData || part?.inline_data || null;
}

export function nowIso() {
  return new Date().toISOString();
}

export function createRunId() {
  return nowIso().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function statePathFor(runId) {
  return path.join(wordRunsRoot, runId, 'state.json');
}

async function ensureDir(target) {
  await mkdir(target, { recursive: true });
}

export async function readStateFile(statePath) {
  if (!existsSync(statePath)) return null;
  const raw = await readFile(statePath, 'utf8');
  return JSON.parse(raw);
}

export async function writeStateFile(statePath, state) {
  await ensureDir(path.dirname(statePath));
  const payload = {
    ...state,
    updatedAt: nowIso(),
  };
  await writeFile(statePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

// `mergeWithExistingState` lets `--run-id` rerun preserve the `uploaded`
// status earned by previous attempts. Re-derives `key` + `contentKey` so a
// stale state file from before a `cleanText` rule change cannot quietly mask
// the divergence — keys are re-computed from `WORDS`, only status/attempts
// are inherited.
export function mergeWithExistingState(plannedEntries, existingState) {
  if (!existingState?.entries?.length) return plannedEntries;
  const previous = new Map();
  for (const entry of existingState.entries) {
    if (!entry?.slug || !entry?.voice) continue;
    previous.set(`${entry.slug}__${entry.voice}`, entry);
  }
  return plannedEntries.map((entry) => {
    const key = `${entry.slug}__${entry.voice}`;
    const prior = previous.get(key);
    if (!prior) return entry;
    if (prior.key !== entry.key || prior.contentKey !== entry.contentKey) {
      // Key drift means the previous run targeted a different R2 location;
      // discard the prior status to avoid mis-marking a NEW key as uploaded.
      return entry;
    }
    return {
      ...entry,
      status: prior.status === 'uploaded' ? 'uploaded' : prior.status === 'generated' ? 'generated' : entry.status,
      attempts: Number(prior.attempts || 0),
      lastError: prior.lastError || null,
    };
  });
}

export function summariseState(entries) {
  const totals = { planned: entries.length, pending: 0, generated: 0, uploaded: 0, failed: 0 };
  for (const entry of entries) {
    if (entry.status === 'uploaded') totals.uploaded += 1;
    else if (entry.status === 'generated') totals.generated += 1;
    else if (entry.status === 'failed') totals.failed += 1;
    else totals.pending += 1;
  }
  return totals;
}

// `auditTokenMatches` pins the substring-match contract that
// `scripts/audit-client-bundle.mjs` and `scripts/production-bundle-audit.mjs`
// rely on (verified during ce-doc-review ADV-5 for U2). The numbered
// `GEMINI_API_KEY_2`..`_20`, the comma-list `GEMINI_API_KEYS`, and
// `CLOUDFLARE_API_TOKEN` should ALL be flagged by the existing tokens
// (`'GEMINI_API_KEY'`, `'CLOUDFLARE_API_TOKEN'`) without any blocklist edit.
// Exported so the test suite can pin behaviour here, where the key-rotation
// pool also lives.
export function auditTokenMatches(text, token) {
  return String(text || '').includes(String(token || ''));
}

// REST-API list helper for `reconcile` / `--from-r2-inventory`. Pagination
// follows the `truncated` + `cursor` shape Cloudflare's R2 list endpoint
// returns. `dependencies.fetch` is injectable so the test suite can drive
// the function without making any real network call.
export async function listR2Objects({
  accountId,
  bucket,
  prefix,
  apiToken,
  fetchImpl,
} = {}) {
  if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID is required for R2 reconciliation.');
  if (!apiToken) throw new Error('CLOUDFLARE_API_TOKEN is required for R2 reconciliation.');
  const fetcher = typeof fetchImpl === 'function' ? fetchImpl : fetch;

  const keys = [];
  let cursor = '';
  for (let safety = 0; safety < 1000; safety += 1) {
    const params = new URLSearchParams({ prefix });
    if (cursor) params.set('cursor', cursor);
    const url = `${CLOUDFLARE_API_BASE}/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucket)}/objects?${params.toString()}`;
    const response = await fetcher(url, {
      headers: { authorization: `Bearer ${apiToken}` },
    });
    if (!response.ok) {
      throw new Error(`R2 list failed (${response.status}) for prefix "${prefix}".`);
    }
    const json = await response.json();
    const result = Array.isArray(json?.result) ? json.result : Array.isArray(json?.result?.objects) ? json.result.objects : [];
    for (const object of result) {
      const key = object?.key || object?.name;
      if (key) keys.push(key);
    }
    const truncated = Boolean(json?.result_info?.truncated || json?.truncated);
    const nextCursor = json?.result_info?.cursor || json?.cursor || '';
    if (!truncated || !nextCursor) break;
    cursor = nextCursor;
  }
  return keys;
}

export function applyInventoryToEntries(entries, inventoryKeySet) {
  return entries.map((entry) => (
    inventoryKeySet.has(entry.key) ? { ...entry, status: 'uploaded' } : entry
  ));
}

// `runWithConcurrency` runs N worker promises in parallel, each pulling the
// next index off a shared cursor — same shape as the historical script's
// `mapWithConcurrency`. Errors are caught per-entry so one failure does not
// abort the rest of the run; failures are recorded in entry state.
export async function runWithConcurrency(items, concurrency, worker) {
  const size = Math.max(1, Math.floor(concurrency || 1));
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(size, items.length || 1) }, () => runWorker()));
}

// Build the Gemini direct API request body. Body shape mirrors Worker
// `worker/src/tts.js:687-704` (responseModalities, languageCode 'en-GB',
// prebuiltVoiceConfig.voiceName) so both lanes synthesise from the same
// contract — see `tests/spelling-word-prompt.test.js` for prompt parity.
export function buildGeminiRequestBody({ wordText, voice }) {
  return {
    contents: [{
      parts: [{ text: buildBufferedWordSpeechPrompt({ wordText }) }],
    }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        languageCode: 'en-GB',
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voice,
          },
        },
      },
    },
  };
}

// Default Gemini caller — POST to `${model}:generateContent`. Returns the
// inline data payload (`data` + `mimeType`) for the audio bytes. The caller
// is responsible for retry / key rotation logic; this function only does
// the single fetch + body extraction.
export async function callGeminiSpeech({
  apiKey,
  model,
  voice,
  wordText,
  fetchImpl = fetch,
  timeoutMs = 60000,
} = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-goog-api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(buildGeminiRequestBody({ wordText, voice })),
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const error = new Error(`Gemini TTS direct call failed: ${response.status} ${text}`.trim());
    error.status = response.status;
    throw error;
  }
  const json = await response.json();
  const inline = extractAudioPayload(json);
  if (!inline?.data) throw new Error('Gemini TTS response did not include audio data.');
  return inline;
}

// `transcodeWavToMp3` shells out to `ffmpeg` — ported from the historical
// script. Caller passes pre-resolved on-disk paths; the helper does NOT
// allocate temp files itself (keeps test stubs simple).
export async function transcodeWavToMp3({ wavPath, mp3Path, execFileImpl = execFileAsync } = {}) {
  await execFileImpl('ffmpeg', [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    wavPath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '24000',
    '-codec:a',
    'libmp3lame',
    '-b:a',
    '48k',
    mp3Path,
  ], {
    cwd: rootDir,
    maxBuffer: 20 * 1024 * 1024,
  });
}

// `uploadObjectToR2` wraps the wrangler-oauth invocation. The `--remote`
// flag is mandatory: wrangler 4.x has no documented default for
// `r2 object put`, and omitting both `--remote` / `--local` may target
// Miniflare local persistence instead of the real production bucket.
export async function uploadObjectToR2({
  bucketName,
  objectKey,
  filePath,
  contentType = 'audio/mpeg',
  execFileImpl = execFileAsync,
} = {}) {
  await execFileImpl('node', [
    './scripts/wrangler-oauth.mjs',
    'r2',
    'object',
    'put',
    `${bucketName}/${objectKey}`,
    '--file',
    filePath,
    '--content-type',
    contentType,
    '--remote',
  ], {
    cwd: rootDir,
    maxBuffer: 20 * 1024 * 1024,
  });
}

// `processEntry` runs one entry through the Gemini → WAV → MP3 → R2 upload
// pipeline. Retry behaviour: on Gemini 429 (or `RESOURCE_EXHAUSTED`), the
// outer caller rotates to the next API key. R2 upload 502/503 retries
// exponentially up to `maxRetries`. Stub-friendly: every side effect is
// injectable through `dependencies` so the test suite can simulate
// failures deterministically.
export async function processEntry({
  entry,
  apiKey,
  model = SPELLING_AUDIO_MODEL,
  bucketName,
  runDir,
  maxRetries = DEFAULT_MAX_RETRIES,
  skipUpload = false,
  dependencies = {},
} = {}) {
  const callGemini = dependencies.callGemini || callGeminiSpeech;
  const writeWav = dependencies.writeWav || (async (target, bytes) => {
    await ensureDir(path.dirname(target));
    await writeFile(target, bytes);
  });
  const transcode = dependencies.transcode || transcodeWavToMp3;
  const upload = dependencies.upload || uploadObjectToR2;

  const audioDir = path.join(runDir, 'audio', entry.voice);
  const wavPath = path.join(audioDir, `${entry.slug}.wav`);
  const mp3Path = path.join(audioDir, `${entry.slug}.mp3`);

  if (entry.status === 'uploaded') return entry;

  // Stage 1: Gemini synthesis (skip if a `generated` MP3 already exists).
  if (entry.status !== 'generated') {
    const inline = await callGemini({
      apiKey,
      model,
      voice: entry.voice,
      wordText: entry.word,
    });
    const wavBytes = pcmToWavBuffer(inline.data, inline.mimeType || inline.mime_type);
    await writeWav(wavPath, wavBytes);
    await transcode({ wavPath, mp3Path });
    entry.status = 'generated';
  }

  if (skipUpload) return entry;

  // Stage 2: R2 upload with bounded retry on transient 5xx responses.
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      await upload({
        bucketName,
        objectKey: entry.key,
        filePath: mp3Path,
        contentType: 'audio/mpeg',
      });
      entry.status = 'uploaded';
      entry.lastError = null;
      return entry;
    } catch (error) {
      lastError = error;
      const message = String(error?.message || error);
      if (!/50[23]/.test(message) || attempt === maxRetries) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(15000, 500 * (2 ** attempt))));
    }
  }
  entry.status = 'generated';
  entry.lastError = String(lastError?.message || lastError || 'Upload failed.');
  throw lastError;
}

function isGeminiQuotaError(error) {
  const status = Number(error?.status);
  if (status === 429 || status === 403) return true;
  return /RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(String(error?.message || error));
}

// `commandList` (no API call) prints the planned (slug, voice, key) tuples.
// Used by both `npm run spelling:word-audio -- list | wc -l` (operator
// sanity check) and the test-suite's `list` happy path assertion.
export async function commandList({
  words = WORDS,
  voices = BUFFERED_GEMINI_VOICE_OPTIONS.map((voice) => voice.id),
  model = SPELLING_AUDIO_MODEL,
} = {}) {
  const entries = await buildPlannedEntries({ words, voices, model });
  return entries.map((entry) => ({
    slug: entry.slug,
    voice: entry.voice,
    key: entry.key,
    contentKey: entry.contentKey,
  }));
}

// `commandReconcile` seeds (or refreshes) a state file with `status:
// uploaded` for every key already present in R2. Used after state-file
// loss (e.g. accidental `rm -rf .spelling-audio/`) to avoid burning
// Gemini quota a second time.
export async function commandReconcile({
  runId,
  bucketName = DEFAULT_BUCKET_NAME,
  model = SPELLING_AUDIO_MODEL,
  voices = BUFFERED_GEMINI_VOICE_OPTIONS.map((voice) => voice.id),
  env = process.env,
  dependencies = {},
} = {}) {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required for reconcile.');
  }
  const lister = dependencies.listR2Objects || listR2Objects;

  const inventory = new Set();
  for (const voice of voices) {
    const prefix = `${RUN_PREFIX}/${model}/${voice}/word/`;
    const keys = await lister({
      accountId,
      bucket: bucketName,
      prefix,
      apiToken,
      fetchImpl: dependencies.fetchImpl,
    });
    for (const key of keys) inventory.add(key);
  }

  const planned = await buildPlannedEntries({ words: WORDS, voices, model });
  const entries = applyInventoryToEntries(planned, inventory);
  const resolvedRunId = runId || createRunId();
  const statePath = statePathFor(resolvedRunId);
  const state = await writeStateFile(statePath, {
    runId: resolvedRunId,
    createdAt: nowIso(),
    model,
    voices,
    bucketName,
    entries,
    summary: summariseState(entries),
  });
  return { runId: resolvedRunId, statePath, state, inventorySize: inventory.size };
}

// `commandStatus` reads the latest state file and returns counts + per-entry
// `lastError` so operators can audit a stalled run without grepping JSON.
export async function commandStatus({ runId } = {}) {
  if (!runId) throw new Error('--run-id is required for status.');
  const statePath = statePathFor(runId);
  const state = await readStateFile(statePath);
  if (!state) throw new Error(`No state file for run ${runId} (expected ${statePath}).`);
  const summary = summariseState(state.entries || []);
  const failures = (state.entries || [])
    .filter((entry) => entry.status === 'failed' || entry.lastError)
    .map((entry) => ({ slug: entry.slug, voice: entry.voice, status: entry.status, lastError: entry.lastError, attempts: entry.attempts }));
  return { runId, statePath, summary, failures };
}

// `commandGenerate` is the production driver. With `dryRun: true` it stops
// just before the Gemini call (writes the planned state file). With normal
// flags it runs the pipeline with concurrency + retry. Side effects are all
// injectable through `dependencies` so the test suite never reaches a real
// Gemini endpoint or wrangler invocation.
export async function commandGenerate({
  flags = {},
  env = process.env,
  dependencies = {},
} = {}) {
  const dryRun = Boolean(flags.dryRun);
  const skipUpload = Boolean(flags.skipUpload);
  const fromR2Inventory = Boolean(flags.fromR2Inventory);
  const model = SPELLING_AUDIO_MODEL;

  // Preflight (run once before any work).
  assertWordsSnapshotParity({ words: WORDS, snapshot: SEEDED_SPELLING_PUBLISHED_SNAPSHOT });
  if (WORDS.length !== 236) {
    throw new Error(`WORDS must contain exactly 236 entries (saw ${WORDS.length}); aborting before Gemini spend.`);
  }
  if (!dryRun) {
    const apiKeys = (dependencies.getDirectApiKeyPool || getDirectApiKeyPool)(env);
    if (!apiKeys.length) {
      throw new Error('At least one of GEMINI_API_KEY, GEMINI_API_KEY_2..GEMINI_API_KEY_20, or GEMINI_API_KEYS must be set.');
    }
    if (typeof dependencies.preflight === 'function') {
      await dependencies.preflight();
    }
  }
  if ((flags.fromR2Inventory || flags.command === 'reconcile') && (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN)) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required when --from-r2-inventory is set.');
  }

  const voices = selectVoices(flags.voice);
  const words = selectWords({
    slugs: flags.slug,
    limit: flags.limit,
    offset: flags.offset,
    words: WORDS,
  });

  const planned = await buildPlannedEntries({ words, voices, model });

  // Resolve / inherit state file.
  const runId = flags.runId || createRunId();
  const statePath = statePathFor(runId);
  let entries = planned;
  const existing = await readStateFile(statePath);
  if (existing) entries = mergeWithExistingState(planned, existing);

  // Optional R2 inventory pre-seed (idempotency for state-loss scenarios).
  if (fromR2Inventory && !dryRun) {
    const lister = dependencies.listR2Objects || listR2Objects;
    const inventory = new Set();
    for (const voice of voices) {
      const prefix = `${RUN_PREFIX}/${model}/${voice}/word/`;
      const keys = await lister({
        accountId: env.CLOUDFLARE_ACCOUNT_ID,
        bucket: DEFAULT_BUCKET_NAME,
        prefix,
        apiToken: env.CLOUDFLARE_API_TOKEN,
        fetchImpl: dependencies.fetchImpl,
      });
      for (const key of keys) inventory.add(key);
    }
    entries = applyInventoryToEntries(entries, inventory);
  }

  await writeStateFile(statePath, {
    runId,
    createdAt: existing?.createdAt || nowIso(),
    model,
    voices,
    bucketName: DEFAULT_BUCKET_NAME,
    entries,
    summary: summariseState(entries),
  });

  if (dryRun) {
    return { runId, statePath, summary: summariseState(entries), entries, dryRun: true };
  }

  // Per-entry pipeline with concurrency + key rotation on quota errors.
  const apiKeys = (dependencies.getDirectApiKeyPool || getDirectApiKeyPool)(env);
  const exhausted = new Set();
  let activeKeyIndex = 0;
  function nextKey() {
    for (let offset = 0; offset < apiKeys.length; offset += 1) {
      const candidate = (activeKeyIndex + offset) % apiKeys.length;
      if (!exhausted.has(candidate)) return apiKeys[candidate].apiKey;
    }
    return null;
  }

  const runDir = path.join(wordRunsRoot, runId);
  // Use Number-coalescing rather than `||` so an explicit `--max-retries 0`
  // (which is falsy) is honoured instead of silently falling back to the
  // default. Same applies to `--concurrency`, but that value must be ≥ 1
  // by the parser contract.
  const concurrency = Number.isFinite(flags.concurrency) && flags.concurrency >= 1
    ? flags.concurrency
    : DEFAULT_CONCURRENCY;
  const maxRetries = Number.isInteger(flags.maxRetries) && flags.maxRetries >= 0
    ? flags.maxRetries
    : DEFAULT_MAX_RETRIES;

  const remaining = entries.filter((entry) => entry.status !== 'uploaded');
  await runWithConcurrency(remaining, concurrency, async (entry) => {
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const apiKey = nextKey();
      if (!apiKey) {
        entry.status = 'failed';
        entry.lastError = 'All Gemini API keys exhausted.';
        return;
      }
      entry.attempts = Number(entry.attempts || 0) + 1;
      try {
        await processEntry({
          entry,
          apiKey,
          model,
          bucketName: DEFAULT_BUCKET_NAME,
          runDir,
          maxRetries,
          skipUpload,
          dependencies,
        });
        return;
      } catch (error) {
        lastError = error;
        if (isGeminiQuotaError(error)) {
          exhausted.add(activeKeyIndex);
          activeKeyIndex = (activeKeyIndex + 1) % apiKeys.length;
          continue;
        }
        // Non-quota Gemini failure: do not retry (the error is unlikely to
        // resolve on the same key without operator action). Upload-side
        // 502/503 retries are owned by `processEntry` itself.
        break;
      }
    }
    entry.status = entry.status === 'generated' ? 'generated' : 'failed';
    entry.lastError = String(lastError?.message || lastError || 'Pipeline failed.');
  });

  await writeStateFile(statePath, {
    runId,
    createdAt: existing?.createdAt || nowIso(),
    model,
    voices,
    bucketName: DEFAULT_BUCKET_NAME,
    entries,
    summary: summariseState(entries),
  });

  return { runId, statePath, summary: summariseState(entries), entries };
}

function printUsage() {
  console.log([
    'Usage:',
    '  npm run spelling:word-audio -- list',
    '  npm run spelling:word-audio -- reconcile [--run-id <id>]',
    '  npm run spelling:word-audio -- dry-run [--slug a,b] [--limit N] [--offset N] [--voice <id>]',
    '  npm run spelling:word-audio -- generate [--slug a,b] [--limit N] [--offset N] [--voice <id>]',
    '                                          [--concurrency 4] [--max-retries 3] [--dry-run]',
    '                                          [--skip-upload] [--from-r2-inventory] [--run-id <id>]',
    '  npm run spelling:word-audio -- status --run-id <id>',
    '',
    'Reads GEMINI_API_KEY (+ GEMINI_API_KEY_2..GEMINI_API_KEY_20, GEMINI_API_KEYS) from the environment.',
    'Reconcile + --from-r2-inventory require CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.',
  ].join('\n'));
}

async function preflightExternalCommands({
  env = process.env,
  execFileImpl = execFileAsync,
} = {}) {
  await execFileImpl('ffmpeg', ['-version'], { cwd: rootDir, maxBuffer: 4 * 1024 * 1024 });
  await execFileImpl('node', ['./scripts/wrangler-oauth.mjs', 'whoami'], {
    cwd: rootDir,
    maxBuffer: 4 * 1024 * 1024,
    env: { ...env },
  });
}

// CLI entry point. Skipped under `import`, so the test suite can pull the
// pure helpers above without triggering execution.
async function runCli(argv) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    console.error(String(error?.message || error));
    process.exit(2);
  }

  if (parsed.flags.help || parsed.command === 'help') {
    printUsage();
    return;
  }

  try {
    switch (parsed.command) {
      case 'list': {
        const entries = await commandList();
        for (const entry of entries) {
          console.log(`${entry.slug}\t${entry.voice}\t${entry.key}`);
        }
        break;
      }
      case 'reconcile': {
        const result = await commandReconcile({ runId: parsed.flags.runId });
        console.log(JSON.stringify({
          runId: result.runId,
          statePath: result.statePath,
          summary: result.state.summary,
          inventorySize: result.inventorySize,
        }, null, 2));
        break;
      }
      case 'dry-run': {
        const result = await commandGenerate({
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
        const result = await commandGenerate({ flags: parsed.flags });
        console.log(JSON.stringify({
          runId: result.runId,
          statePath: result.statePath,
          summary: result.summary,
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

// `loadDotEnv` is not invoked from CLI by default — operators rely on
// shell-provided env. Provided as an explicit opt-in helper so a future
// runbook change can wire it in if needed without re-deriving the parsing
// logic.
export function loadDotEnv(envPath) {
  if (!envPath || !existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] != null) continue;
    process.env[key] = rawValue.trim().replace(/^(['"])(.*)\1$/, '$2');
  }
}
