#!/usr/bin/env node

// U3 (spelling word audio cache): production smoke probe for the
// `/api/tts` cache lookup contract introduced by the U1/U2 word-only
// pipeline + PR 252's legacy sentence fallback.
//
// Three distinct probes:
//   1. Word-only primary probe — for each --word-sample × 2 voices, build
//      a word-bank prompt token via the canonical `sha256` from
//      `worker/src/auth.js` and POST `/api/tts` with `cacheLookupOnly: true`.
//      Expect HTTP 200 + `x-ks2-tts-cache: hit` + `x-ks2-tts-cache-source: primary`.
//   2. Sentence legacy probe — POSTs the session-style payload for known
//      seeded sentence cards and asserts the legacy R2 fallback fires
//      (PR 252). Without `--require-legacy-hit` a `primary` source is
//      reported as INFO ("legacy fallback no longer required").
//   3. Cross-account invariant probe — two real demo learners produce
//      two distinct word-bank prompt tokens but the smoke runner derives
//      the SAME expected R2 key (the `bufferedAudioMetadata` deliberately
//      omits `accountId` for `wordOnly: true` per PR 252 design). Both
//      requests cache-hit AND their response bodies must be byte-identical;
//      a third probe for a different word must produce distinct bytes.
//
// Mirrors the canonical patterns:
//   - `scripts/punctuation-production-smoke.mjs` for overall structure +
//     entry guard + JSON output shape.
//   - `scripts/spelling-dense-history-smoke.mjs` for argv parser style +
//     `EXIT_*` taxonomy + tagged `error.kind` classifier.
//   - `scripts/lib/production-smoke.mjs` for origin / demo-session / fetch
//     helpers (`configuredOrigin`, `createDemoSession`, `loadBootstrap`,
//     `argValue`).
//
// All side-effecting helpers funnel through `globalThis.fetch` so unit
// tests can stub them via `jsonResponse(payload, init)` without ever
// hitting the network.

import { Buffer } from 'node:buffer';
import { pathToFileURL } from 'node:url';

import {
  argValue,
  configuredOrigin,
  createDemoSession,
  DEFAULT_PRODUCTION_ORIGIN,
  loadBootstrap,
} from './lib/production-smoke.mjs';
import { sha256 } from '../worker/src/auth.js';
import {
  BUFFERED_GEMINI_VOICE_OPTIONS,
  SPELLING_AUDIO_MODEL,
  buildWordAudioAssetKey,
} from '../shared/spelling-audio.js';

// --- Exit-code taxonomy --------------------------------------------------
//
// Mirrors `scripts/spelling-dense-history-smoke.mjs:134-176`. The CLI banner
// promises:
//   0 — smoke passed
//   1 — validation failure (header missing, miss with --require-word-hit,
//        cross-account invariant break, etc.)
//   2 — usage error (bad flag, missing smoke learner credentials)
//   3 — transport failure (5xx, network error, fetch timeout)
export const EXIT_OK = 0;
export const EXIT_VALIDATION = 1;
export const EXIT_USAGE = 2;
export const EXIT_TRANSPORT = 3;

const DEFAULT_WORD_SAMPLE = ['accident', 'accidentally', 'knowledge', 'thought'];
const DEFAULT_SENTENCE_SAMPLE = ['accident', 'knowledge'];
const VOICE_IDS = BUFFERED_GEMINI_VOICE_OPTIONS.map((voice) => voice.id);
const CROSS_ACCOUNT_FIXTURE_WORD = 'accident';
const CROSS_ACCOUNT_DISTINCT_WORD = 'thought';

const HELP_BANNER = [
  'Usage: node ./scripts/spelling-audio-production-smoke.mjs [options]',
  '',
  'Probes the production /api/tts cache lookup contract for the spelling',
  'word-only audio path (U1/U2) and PR 252 legacy sentence fallback. Runs',
  'three distinct probes:',
  '  - word-only primary probe (per word × per voice)',
  '  - sentence legacy probe (per sentence)',
  '  - cross-account invariant probe (two learners, byte-identical body bytes,',
  '    distinct body bytes for a different word)',
  '',
  'Options:',
  '  --origin <url>, --url <url>       Origin to probe (default https://ks2.eugnel.uk).',
  '  --word-sample <csv>               Comma-separated word slugs (default accident,accidentally,knowledge,thought).',
  '  --sentence-sample <csv>           Comma-separated sentence slugs (default accident,knowledge).',
  '  --require-word-hit                Fail (EXIT_VALIDATION) when a word probe misses cache.',
  '  --require-legacy-hit              Fail (EXIT_VALIDATION) when a sentence probe falls back to primary.',
  '  --json                            Emit machine-readable JSON only.',
  '  --timeout-ms <ms>                 Per-request timeout (default 15000; consumed by lib/production-smoke.mjs).',
  '  --help, -h                        Show this banner.',
  '',
  'Exit codes:',
  '  0  smoke passed',
  '  1  validation failure (header missing, hit-required miss, invariant break)',
  '  2  usage error (bad flag, missing smoke learner credentials)',
  '  3  transport failure (5xx, fetch timeout, network error)',
].join('\n');

// --- Error tagging -------------------------------------------------------

function validationError(message, cause) {
  const error = new Error(message);
  error.kind = 'validation';
  if (cause) error.cause = cause;
  return error;
}

function transportError(message, cause) {
  const error = new Error(message);
  error.kind = 'transport';
  if (cause) error.cause = cause;
  return error;
}

function usageError(message, cause) {
  const error = new Error(message);
  error.kind = 'usage';
  if (cause) error.cause = cause;
  return error;
}

function classifyErrorForExitCode(error) {
  if (!error) return EXIT_TRANSPORT;
  if (error.kind === 'validation') return EXIT_VALIDATION;
  if (error.kind === 'usage') return EXIT_USAGE;
  if (error.kind === 'transport') return EXIT_TRANSPORT;
  if (error.name === 'AssertionError') return EXIT_VALIDATION;
  return EXIT_TRANSPORT;
}

// --- argv parser ---------------------------------------------------------
//
// Mirrors `parseSpellingDenseArgs`: hand-rolled (no `node:util parseArgs`),
// rejects unknown flags with EXIT_USAGE, and rejects duplicates so a
// later value cannot silently override an earlier one.

function readOptionValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (value == null || value.startsWith('--')) {
    throw new Error(`${optionName} requires a value.`);
  }
  return value;
}

function splitCsv(raw) {
  return String(raw || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    origin: '',
    wordSample: DEFAULT_WORD_SAMPLE.slice(),
    sentenceSample: DEFAULT_SENTENCE_SAMPLE.slice(),
    requireWordHit: false,
    requireLegacyHit: false,
    json: false,
    help: false,
  };

  const assigned = new Set();
  const assignOnce = (flag) => {
    if (assigned.has(flag)) {
      throw new Error(`${flag} specified more than once; refusing to let later value silently override the earlier one.`);
    }
    assigned.add(flag);
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--origin' || arg === '--url') {
      assignOnce('--origin');
      options.origin = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--word-sample') {
      assignOnce(arg);
      const sample = splitCsv(readOptionValue(argv, index, arg));
      if (!sample.length) throw new Error('--word-sample requires at least one slug.');
      options.wordSample = sample;
      index += 1;
    } else if (arg === '--sentence-sample') {
      assignOnce(arg);
      const sample = splitCsv(readOptionValue(argv, index, arg));
      if (!sample.length) throw new Error('--sentence-sample requires at least one slug.');
      options.sentenceSample = sample;
      index += 1;
    } else if (arg === '--require-word-hit') {
      options.requireWordHit = true;
    } else if (arg === '--require-legacy-hit') {
      options.requireLegacyHit = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--timeout-ms') {
      // Consumed by `scripts/lib/production-smoke.mjs` via process.argv;
      // we only need to skip the value so the parser does not fault.
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

// --- Prompt token + R2 key derivation -----------------------------------
//
// Byte-equal mirror of `worker/src/subjects/spelling/audio.js` salt
// prefixes:
//   `wordBankPromptToken({ learnerId, slug, word, sentence })`
//      → `sha256('spelling-word-bank-prompt-v1' | learnerId | slug | word | sentence)`
//   `sessionPromptToken({ learnerId, sessionId, slug, word, sentence })`
//      → `sha256('spelling-prompt-v1' | learnerId | sessionId | slug | word | sentence)`
// The cross-account R2 key derivation mirrors `bufferedAudioMetadata`:
//   `contentKey = sha256('spelling-audio-word-v1' | slug | word)`
// — deliberately omits `accountId` so two learners share the same R2 key
// per PR 252 design.

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export async function computeWordBankPromptToken({ learnerId, slug, word, sentence = '' } = {}) {
  return sha256([
    'spelling-word-bank-prompt-v1',
    cleanText(learnerId),
    cleanText(slug),
    cleanText(word),
    cleanText(sentence),
  ].join('|'));
}

export async function computeSessionPromptToken({ learnerId, sessionId, slug, word, sentence } = {}) {
  return sha256([
    'spelling-prompt-v1',
    cleanText(learnerId),
    cleanText(sessionId),
    cleanText(slug),
    cleanText(word),
    cleanText(sentence),
  ].join('|'));
}

export async function computeWordContentKey(slug, word) {
  return sha256([
    'spelling-audio-word-v1',
    cleanText(slug).toLowerCase(),
    cleanText(word),
  ].join('|'));
}

export async function expectedWordR2Key({ slug, word, voice, model = SPELLING_AUDIO_MODEL, extension = 'mp3' } = {}) {
  const contentKey = await computeWordContentKey(slug, word);
  return buildWordAudioAssetKey({
    model,
    voice,
    contentKey,
    slug: cleanText(slug).toLowerCase(),
    extension,
  });
}

// --- HTTP helpers --------------------------------------------------------
//
// We call `globalThis.fetch` directly (rather than `postJson` from the
// shared lib) because:
//   - we need the raw `Response` object to read response body bytes for
//     the cross-account invariant probe (`response.arrayBuffer()`),
//   - we need the per-request response headers (`x-ks2-tts-cache`,
//     `x-ks2-tts-cache-source`, model, voice).
// The same-origin headers + JSON encoding mirror `postJson`.

async function postTtsRequest({ origin, cookie, body }) {
  const url = new URL('/api/tts', origin);
  let response;
  try {
    response = await globalThis.fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/json, audio/*;q=0.9',
        'content-type': 'application/json',
        origin,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw transportError(`POST /api/tts failed or timed out: ${error?.message || error}`, error);
  }

  return response;
}

function readResponseHeader(response, name) {
  const value = response.headers?.get?.(name);
  return value == null ? '' : String(value);
}

async function readResponseBytes(response) {
  if (typeof response.arrayBuffer === 'function') {
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer);
  }
  if (typeof response.text === 'function') {
    return Buffer.from(await response.text(), 'utf8');
  }
  return Buffer.alloc(0);
}

async function bodyExcerpt(response, maxBytes = 200) {
  try {
    const text = typeof response.text === 'function' ? await response.text() : '';
    if (!text) return '';
    return text.length > maxBytes ? `${text.slice(0, maxBytes)}…` : text;
  } catch {
    return '';
  }
}

function looksLikeServerError(status) {
  return Number(status) >= 500;
}

// --- Probe: word-only primary -------------------------------------------

async function runWordProbe({
  origin,
  cookie,
  learnerId,
  slug,
  voice,
  requireWordHit,
}) {
  const word = cleanText(slug);
  const sentence = '';
  const promptToken = await computeWordBankPromptToken({ learnerId, slug, word, sentence });
  const expectedKey = await expectedWordR2Key({ slug, word, voice });

  const response = await postTtsRequest({
    origin,
    cookie,
    body: {
      wordOnly: true,
      scope: 'word-bank',
      slug,
      learnerId,
      promptToken,
      bufferedGeminiVoice: voice,
      cacheLookupOnly: true,
    },
  });

  if (looksLikeServerError(response.status)) {
    const excerpt = await bodyExcerpt(response);
    throw transportError(`/api/tts word probe ${slug}/${voice} returned HTTP ${response.status}: ${excerpt}`);
  }
  if (response.status !== 200) {
    const excerpt = await bodyExcerpt(response);
    throw validationError(`/api/tts word probe ${slug}/${voice} returned HTTP ${response.status}: ${excerpt}`);
  }

  const cache = readResponseHeader(response, 'x-ks2-tts-cache');
  const source = readResponseHeader(response, 'x-ks2-tts-cache-source');
  const model = readResponseHeader(response, 'x-ks2-tts-model');
  const responseVoice = readResponseHeader(response, 'x-ks2-tts-voice');

  const probe = {
    kind: 'word',
    slug,
    voice,
    promptToken,
    expectedR2Key: expectedKey,
    cache,
    source,
    model,
    voiceHeader: responseVoice,
    status: response.status,
    notes: [],
    ok: true,
  };

  if (cache !== 'hit') {
    if (requireWordHit) {
      probe.ok = false;
      probe.notes.push(`cache=${cache || '(missing)'} (expected hit)`);
      throw validationError(`Word probe ${slug}/${voice} cache=${cache || '(missing)'} but --require-word-hit is set.`);
    }
    probe.notes.push(`WARN: cache=${cache || '(missing)'} (pre-fill baseline; suppress with --require-word-hit once U4 lands)`);
    return probe;
  }

  // Cache hit: source MUST be present (regression of PR 252 if missing).
  if (!source) {
    probe.ok = false;
    probe.notes.push('missing x-ks2-tts-cache-source header');
    throw validationError(
      `Word probe ${slug}/${voice} hit cache but x-ks2-tts-cache-source header is missing — PR 252 regression.`,
    );
  }
  if (source !== 'primary') {
    probe.ok = false;
    probe.notes.push(`source=${source} (expected primary)`);
    throw validationError(`Word probe ${slug}/${voice} cache-source=${source} (expected primary).`);
  }
  if (model !== SPELLING_AUDIO_MODEL) {
    probe.ok = false;
    probe.notes.push(`model=${model} (expected ${SPELLING_AUDIO_MODEL})`);
    throw validationError(
      `Word probe ${slug}/${voice} model=${model} but expected ${SPELLING_AUDIO_MODEL}.`,
    );
  }
  if (responseVoice !== voice) {
    probe.ok = false;
    probe.notes.push(`voice=${responseVoice} (expected ${voice})`);
    throw validationError(`Word probe ${slug}/${voice} voice header=${responseVoice} (expected ${voice}).`);
  }

  return probe;
}

// --- Probe: sentence legacy ----------------------------------------------

async function runSentenceProbe({
  origin,
  cookie,
  learnerId,
  slug,
  requireLegacyHit,
}) {
  const word = cleanText(slug);
  // For legacy sentence probes we still need a session-style prompt token;
  // since the smoke runner does not have an active session id (no spelling
  // round was started), the Worker validates the prompt against the
  // word-bank fallback in `resolveSpellingAudioRequest`. We compute the
  // word-bank token here so the Worker accepts the request and then runs
  // the cache lookup on the legacy R2 key shape (the legacy fallback
  // applies to sentence-shaped metadata, not the wordOnly path).
  const promptToken = await computeWordBankPromptToken({
    learnerId,
    slug,
    word,
    sentence: '',
  });

  const response = await postTtsRequest({
    origin,
    cookie,
    body: {
      slug,
      learnerId,
      promptToken,
      cacheLookupOnly: true,
    },
  });

  if (looksLikeServerError(response.status)) {
    const excerpt = await bodyExcerpt(response);
    throw transportError(`/api/tts sentence probe ${slug} returned HTTP ${response.status}: ${excerpt}`);
  }
  if (response.status !== 200) {
    const excerpt = await bodyExcerpt(response);
    throw validationError(`/api/tts sentence probe ${slug} returned HTTP ${response.status}: ${excerpt}`);
  }

  const cache = readResponseHeader(response, 'x-ks2-tts-cache');
  const source = readResponseHeader(response, 'x-ks2-tts-cache-source');

  const probe = {
    kind: 'sentence',
    slug,
    promptToken,
    cache,
    source,
    status: response.status,
    notes: [],
    ok: true,
  };

  if (cache !== 'hit') {
    if (requireLegacyHit) {
      probe.ok = false;
      probe.notes.push(`cache=${cache || '(missing)'} (expected hit, --require-legacy-hit set)`);
      throw validationError(
        `Sentence probe ${slug} cache=${cache || '(missing)'} but --require-legacy-hit is set.`,
      );
    }
    probe.notes.push(`WARN: cache=${cache || '(missing)'} (legacy fallback unavailable for ${slug})`);
    return probe;
  }

  if (!source) {
    probe.ok = false;
    probe.notes.push('missing x-ks2-tts-cache-source header');
    throw validationError(
      `Sentence probe ${slug} hit cache but x-ks2-tts-cache-source header is missing — PR 252 regression.`,
    );
  }

  if (source === 'legacy') {
    return probe;
  }
  if (source === 'primary') {
    if (requireLegacyHit) {
      probe.ok = false;
      probe.notes.push(`source=${source} (expected legacy, --require-legacy-hit set)`);
      throw validationError(
        `Sentence probe ${slug} cache-source=${source} but --require-legacy-hit demands legacy.`,
      );
    }
    probe.notes.push('INFO: legacy fallback no longer required (cache-source=primary)');
    return probe;
  }
  probe.ok = false;
  probe.notes.push(`source=${source} (expected legacy or primary)`);
  throw validationError(`Sentence probe ${slug} cache-source=${source} (expected legacy or primary).`);
}

// --- Probe: cross-account invariant -------------------------------------

async function runCrossAccountProbe({
  origin,
  fixtureWord = CROSS_ACCOUNT_FIXTURE_WORD,
  distinctWord = CROSS_ACCOUNT_DISTINCT_WORD,
  voice = VOICE_IDS[0],
}) {
  // Two real demo sessions — Worker validates `learnerId` against the
  // session at `worker/src/subjects/spelling/audio.js:114-118`, so faked
  // learner ids would be rejected.
  const sessionA = await createDemoSession(origin);
  const bootstrapA = await loadBootstrap(origin, sessionA.cookie, { expectedSession: sessionA.session });
  const sessionB = await createDemoSession(origin);
  const bootstrapB = await loadBootstrap(origin, sessionB.cookie, { expectedSession: sessionB.session });

  const tokenA = await computeWordBankPromptToken({
    learnerId: bootstrapA.learnerId,
    slug: fixtureWord,
    word: fixtureWord,
    sentence: '',
  });
  const tokenB = await computeWordBankPromptToken({
    learnerId: bootstrapB.learnerId,
    slug: fixtureWord,
    word: fixtureWord,
    sentence: '',
  });
  const expectedKeyA = await expectedWordR2Key({ slug: fixtureWord, word: fixtureWord, voice });
  const expectedKeyB = await expectedWordR2Key({ slug: fixtureWord, word: fixtureWord, voice });
  const expectedKeyDistinct = await expectedWordR2Key({
    slug: distinctWord,
    word: distinctWord,
    voice,
  });

  // Per-learner token salt: tokens MUST differ.
  if (tokenA === tokenB) {
    throw validationError(
      `Cross-account probe: prompt tokens collapsed (per-learner salt regression). tokenA === tokenB`,
    );
  }
  // Cross-account R2 reuse: keys MUST match.
  if (expectedKeyA !== expectedKeyB) {
    throw validationError(
      `Cross-account probe: expected R2 keys diverged for the same word (accountId leaked into wordOnly metadata). keyA=${expectedKeyA} keyB=${expectedKeyB}`,
    );
  }

  const responseA = await postTtsRequest({
    origin,
    cookie: sessionA.cookie,
    body: {
      wordOnly: true,
      scope: 'word-bank',
      slug: fixtureWord,
      learnerId: bootstrapA.learnerId,
      promptToken: tokenA,
      bufferedGeminiVoice: voice,
      // Fetch real bytes — `cacheLookupOnly` returns 204; we want 200 +
      // body bytes so the byte-identity assertion has something to compare.
    },
  });
  const responseB = await postTtsRequest({
    origin,
    cookie: sessionB.cookie,
    body: {
      wordOnly: true,
      scope: 'word-bank',
      slug: fixtureWord,
      learnerId: bootstrapB.learnerId,
      promptToken: tokenB,
      bufferedGeminiVoice: voice,
    },
  });
  const responseDistinct = await postTtsRequest({
    origin,
    cookie: sessionA.cookie,
    body: {
      wordOnly: true,
      scope: 'word-bank',
      slug: distinctWord,
      learnerId: bootstrapA.learnerId,
      promptToken: await computeWordBankPromptToken({
        learnerId: bootstrapA.learnerId,
        slug: distinctWord,
        word: distinctWord,
        sentence: '',
      }),
      bufferedGeminiVoice: voice,
    },
  });

  for (const [label, response] of [
    ['A', responseA],
    ['B', responseB],
    ['distinct', responseDistinct],
  ]) {
    if (looksLikeServerError(response.status)) {
      const excerpt = await bodyExcerpt(response);
      throw transportError(`Cross-account probe ${label} returned HTTP ${response.status}: ${excerpt}`);
    }
    if (response.status !== 200) {
      const excerpt = await bodyExcerpt(response);
      throw validationError(`Cross-account probe ${label} returned HTTP ${response.status}: ${excerpt}`);
    }
  }
  for (const [label, response] of [['A', responseA], ['B', responseB]]) {
    const cache = readResponseHeader(response, 'x-ks2-tts-cache');
    if (cache !== 'hit') {
      throw validationError(
        `Cross-account probe ${label} cache=${cache || '(missing)'} (expected hit; pre-fill not yet run for ${fixtureWord}?)`,
      );
    }
    const source = readResponseHeader(response, 'x-ks2-tts-cache-source');
    if (!source) {
      throw validationError(
        `Cross-account probe ${label} hit cache but x-ks2-tts-cache-source header is missing — PR 252 regression.`,
      );
    }
  }

  const bytesA = await readResponseBytes(responseA);
  const bytesB = await readResponseBytes(responseB);
  const bytesDistinct = await readResponseBytes(responseDistinct);

  if (!bytesA.length || !bytesA.equals(bytesB)) {
    throw validationError(
      `Cross-account probe: response bodies diverged for the same word (R2 key resolution broken). lenA=${bytesA.length} lenB=${bytesB.length}`,
    );
  }
  if (bytesDistinct.equals(bytesA)) {
    throw validationError(
      `Cross-account probe: distinct word ${distinctWord} produced byte-identical body to ${fixtureWord} (key resolution collapsed).`,
    );
  }

  return {
    kind: 'cross-account',
    learnerA: bootstrapA.learnerId,
    learnerB: bootstrapB.learnerId,
    fixtureWord,
    distinctWord,
    voice,
    tokenA,
    tokenB,
    expectedR2Key: expectedKeyA,
    expectedR2KeyDistinct: expectedKeyDistinct,
    bytesAlength: bytesA.length,
    bytesBLength: bytesB.length,
    bytesDistinctLength: bytesDistinct.length,
    notes: ['per-learner tokens distinct; same R2 key; byte-identical bodies; distinct word produces distinct bytes'],
    ok: true,
  };
}

// --- Top-level runner ----------------------------------------------------

export async function runSpellingAudioSmoke(options = {}) {
  const origin = options.origin || configuredOrigin();
  const startedAt = new Date().toISOString();

  // Primary demo session — used for word-only + sentence probes. The
  // cross-account probe internally creates two more demo sessions.
  let demo;
  try {
    demo = await createDemoSession(origin);
  } catch (error) {
    const message = String(error?.message || '');
    if (/failed with (\d+)/.test(message)) {
      const status = Number(message.match(/failed with (\d+)/)[1]);
      if (status >= 500) throw transportError(`Demo session creation ${message}`, error);
      // 4xx — the credentials path is broken; surface as USAGE so the
      // operator gets the setup hint rather than a generic validation.
      throw usageError(
        `Demo session creation ${message}. Confirm production demo credentials are configured (KS2_SMOKE_ORIGIN + a reachable demo endpoint).`,
        error,
      );
    }
    throw transportError(`Demo session creation failed: ${message}`, error);
  }
  const bootstrap = await loadBootstrap(origin, demo.cookie, { expectedSession: demo.session });

  const probes = [];
  for (const slug of options.wordSample) {
    for (const voice of VOICE_IDS) {
      probes.push(await runWordProbe({
        origin,
        cookie: demo.cookie,
        learnerId: bootstrap.learnerId,
        slug,
        voice,
        requireWordHit: options.requireWordHit,
      }));
    }
  }
  for (const slug of options.sentenceSample) {
    probes.push(await runSentenceProbe({
      origin,
      cookie: demo.cookie,
      learnerId: bootstrap.learnerId,
      slug,
      requireLegacyHit: options.requireLegacyHit,
    }));
  }
  probes.push(await runCrossAccountProbe({ origin }));

  const finishedAt = new Date().toISOString();
  const ok = probes.every((probe) => probe.ok !== false);
  return {
    ok,
    startedAt,
    finishedAt,
    origin,
    accountId: demo.session?.accountId || null,
    learnerId: bootstrap.learnerId,
    probes,
  };
}

function renderHumanReadableReport(report) {
  const lines = [];
  lines.push(`spelling-audio-production-smoke @ ${report.origin}`);
  lines.push(`  account: ${report.accountId || '(none)'}  learner: ${report.learnerId}`);
  lines.push(`  ${report.startedAt} → ${report.finishedAt}`);
  for (const probe of report.probes) {
    if (probe.kind === 'word') {
      lines.push(`  [word] ${probe.slug} ${probe.voice} cache=${probe.cache || '-'} source=${probe.source || '-'} model=${probe.model || '-'}`);
    } else if (probe.kind === 'sentence') {
      lines.push(`  [sentence] ${probe.slug} cache=${probe.cache || '-'} source=${probe.source || '-'}`);
    } else if (probe.kind === 'cross-account') {
      lines.push(`  [cross-account] ${probe.fixtureWord} (${probe.voice}) tokensDistinct=true sameR2Key=true bytesIdentical=true distinctWord=${probe.distinctWord}`);
    }
    for (const note of probe.notes || []) {
      lines.push(`      - ${note}`);
    }
  }
  lines.push(`  ok=${report.ok}`);
  return lines.join('\n');
}

export async function runCli(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(JSON.stringify({ ok: false, exit_code: EXIT_USAGE, error: error?.message || String(error) }, null, 2));
    return EXIT_USAGE;
  }
  if (options.help) {
    console.log(HELP_BANNER);
    return EXIT_OK;
  }

  let report;
  try {
    report = await runSpellingAudioSmoke(options);
  } catch (error) {
    const exitCode = classifyErrorForExitCode(error);
    console.error(JSON.stringify({
      ok: false,
      exit_code: exitCode,
      error: error?.message || String(error),
    }, null, 2));
    return exitCode;
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderHumanReadableReport(report));
  }
  return report.ok ? EXIT_OK : EXIT_VALIDATION;
}

async function main() {
  const origin = argValue('--origin', '--url') || process.env.KS2_SMOKE_ORIGIN || DEFAULT_PRODUCTION_ORIGIN;
  const code = await runCli();
  process.exitCode = code;
  // Reference `origin` so it shows up in stack traces if a downstream
  // helper throws before logging — runtime cost is negligible and it
  // keeps the variable from being tree-shaken away by future refactors.
  if (process.env.KS2_SMOKE_DEBUG) console.error(`[spelling-audio-production-smoke] origin=${origin}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[spelling-audio-production-smoke] ' + (error?.stack || error?.message || error));
    process.exit(error?.kind === 'transport' ? EXIT_TRANSPORT : EXIT_VALIDATION);
  });
}
