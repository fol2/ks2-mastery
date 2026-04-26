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
  configuredTimeoutMs,
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
import { SEEDED_SPELLING_PUBLISHED_SNAPSHOT } from '../src/subjects/spelling/data/content-data.js';

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
    timeoutMs: 0,
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
      // Plumbed into both `runSpellingAudioSmoke(options)` and the
      // shared `lib/production-smoke.mjs` helpers (which read it back via
      // `configuredTimeoutMs()` from process.argv / env).
      assignOnce(arg);
      const parsed = Number(readOptionValue(argv, index, arg));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error('--timeout-ms requires a positive number of milliseconds.');
      }
      options.timeoutMs = parsed;
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
// prefix:
//   `wordBankPromptToken({ learnerId, slug, word, sentence })`
//      → `sha256('spelling-word-bank-prompt-v1' | learnerId | slug | word | sentence)`
// The Worker reads the sentence from the published snapshot
// (`snapshot.wordBySlug[slug].sentence` then `cleanText`) before computing
// its expected token, so the smoke MUST supply the matching sentence or
// the Worker rejects the request with `tts_prompt_stale` (HTTP 400).
// `lookupSeedWord(slug)` reads from `SEEDED_SPELLING_PUBLISHED_SNAPSHOT`
// — the same source the Worker pins for runtime reads.
//
// The cross-account R2 key derivation mirrors `bufferedAudioMetadata`:
//   `contentKey = sha256('spelling-audio-word-v1' | slug | word)`
// — deliberately omits `accountId` so two learners share the same R2 key
// per PR 252 design.

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function lookupSeedWord(slug) {
  const safeSlug = cleanText(slug).toLowerCase();
  const entry = SEEDED_SPELLING_PUBLISHED_SNAPSHOT?.wordBySlug?.[safeSlug] || null;
  if (!entry) return null;
  return {
    slug: entry.slug || safeSlug,
    word: cleanText(entry.word),
    sentence: cleanText(entry.sentence),
  };
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

function abortSignalFor(timeoutMs) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof timer?.unref === 'function') timer.unref();
  return controller.signal;
}

async function postTtsRequest({ origin, cookie, body, timeoutMs }) {
  const url = new URL('/api/tts', origin);
  // `--timeout-ms` (parsed by `parseArgs`, also honoured via env
  // `KS2_SMOKE_TIMEOUT_MS`) is plumbed through `configuredTimeoutMs()` so
  // production hangs (Gemini outage, Worker cold-start) bound the smoke
  // run rather than wedging it indefinitely.
  const effectiveTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : configuredTimeoutMs();
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
      signal: abortSignalFor(effectiveTimeoutMs),
    });
  } catch (error) {
    // `AbortError` from `AbortSignal.timeout` should still classify as
    // EXIT_TRANSPORT — keep the kind tag stable.
    throw transportError(`POST /api/tts failed or timed out after ${effectiveTimeoutMs}ms: ${error?.message || error}`, error);
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
  timeoutMs,
}) {
  // BLOCKER fix (2026-04-26 review): the Worker's `wordBankPromptParts`
  // (`worker/src/subjects/spelling/audio.js:87-107`) reads the seed
  // snapshot and includes `cleanText(word.sentence)` in its expected
  // token. An empty-sentence token mismatches → 400 `tts_prompt_stale`.
  // Look up the canonical `(word, sentence)` pair from the published
  // snapshot so the smoke's token matches what the Worker computes.
  const seed = lookupSeedWord(slug);
  if (!seed || !seed.word) {
    throw validationError(
      `Word probe ${slug}/${voice}: slug missing from SEEDED_SPELLING_PUBLISHED_SNAPSHOT.wordBySlug — update the smoke fixture or seed.`,
    );
  }
  const word = seed.word;
  const sentence = seed.sentence;
  const promptToken = await computeWordBankPromptToken({ learnerId, slug, word, sentence });
  const expectedKey = await expectedWordR2Key({ slug, word, voice });

  const response = await postTtsRequest({
    origin,
    cookie,
    timeoutMs,
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
  timeoutMs,
}) {
  // For legacy sentence probes we still need a session-style prompt token;
  // since the smoke runner does not have an active session id (no spelling
  // round was started), the Worker validates the prompt against the
  // word-bank fallback in `resolveSpellingAudioRequest`. We compute the
  // word-bank token here so the Worker accepts the request and then runs
  // the cache lookup on the legacy R2 key shape (the legacy fallback
  // applies to sentence-shaped metadata, not the wordOnly path).
  // Sentence is loaded from the snapshot to match what the Worker computes
  // (see BLOCKER fix in `runWordProbe`).
  const seed = lookupSeedWord(slug);
  if (!seed || !seed.word) {
    throw validationError(
      `Sentence probe ${slug}: slug missing from SEEDED_SPELLING_PUBLISHED_SNAPSHOT.wordBySlug — update the smoke fixture or seed.`,
    );
  }
  const word = seed.word;
  const promptToken = await computeWordBankPromptToken({
    learnerId,
    slug,
    word,
    sentence: seed.sentence,
  });

  const response = await postTtsRequest({
    origin,
    cookie,
    timeoutMs,
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
  timeoutMs,
}) {
  // Two real demo sessions — Worker validates `learnerId` against the
  // session at `worker/src/subjects/spelling/audio.js:114-118`, so faked
  // learner ids would be rejected.
  const sessionA = await createDemoSession(origin);
  const bootstrapA = await loadBootstrap(origin, sessionA.cookie, { expectedSession: sessionA.session });
  const sessionB = await createDemoSession(origin);
  const bootstrapB = await loadBootstrap(origin, sessionB.cookie, { expectedSession: sessionB.session });

  // BLOCKER fix: load fixture/distinct sentences from the snapshot so the
  // tokens match what the Worker computes (see `runWordProbe`).
  const fixtureSeed = lookupSeedWord(fixtureWord);
  const distinctSeed = lookupSeedWord(distinctWord);
  if (!fixtureSeed || !fixtureSeed.word) {
    throw validationError(
      `Cross-account probe: fixture word ${fixtureWord} missing from SEEDED_SPELLING_PUBLISHED_SNAPSHOT.wordBySlug.`,
    );
  }
  if (!distinctSeed || !distinctSeed.word) {
    throw validationError(
      `Cross-account probe: distinct word ${distinctWord} missing from SEEDED_SPELLING_PUBLISHED_SNAPSHOT.wordBySlug.`,
    );
  }
  const fixtureWordText = fixtureSeed.word;
  const fixtureSentence = fixtureSeed.sentence;
  const distinctWordText = distinctSeed.word;
  const distinctSentence = distinctSeed.sentence;

  const tokenA = await computeWordBankPromptToken({
    learnerId: bootstrapA.learnerId,
    slug: fixtureWord,
    word: fixtureWordText,
    sentence: fixtureSentence,
  });
  const tokenB = await computeWordBankPromptToken({
    learnerId: bootstrapB.learnerId,
    slug: fixtureWord,
    word: fixtureWordText,
    sentence: fixtureSentence,
  });
  const expectedKeyA = await expectedWordR2Key({ slug: fixtureWord, word: fixtureWordText, voice });
  const expectedKeyB = await expectedWordR2Key({ slug: fixtureWord, word: fixtureWordText, voice });
  const expectedKeyDistinct = await expectedWordR2Key({
    slug: distinctWord,
    word: distinctWordText,
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
    timeoutMs,
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
    timeoutMs,
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
    timeoutMs,
    body: {
      wordOnly: true,
      scope: 'word-bank',
      slug: distinctWord,
      learnerId: bootstrapA.learnerId,
      promptToken: await computeWordBankPromptToken({
        learnerId: bootstrapA.learnerId,
        slug: distinctWord,
        word: distinctWordText,
        sentence: distinctSentence,
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

// Wrap a probe runner so a thrown error becomes a structured probe entry
// rather than short-circuiting the entire run. Operator gets the full
// matrix of pass/fail in one report instead of "first failure only" —
// makes triage faster when several probes regress at once.
async function safeRunProbe(kindLabel, runner) {
  try {
    return await runner();
  } catch (error) {
    const kind = error?.kind === 'transport'
      ? 'transport'
      : error?.kind === 'usage'
        ? 'usage'
        : 'validation';
    return {
      kind: kindLabel,
      ok: false,
      error: {
        kind,
        message: error?.message || String(error),
      },
      notes: [`error[${kind}]: ${error?.message || String(error)}`],
    };
  }
}

// Compute the worst-classification exit code from the failed probes:
// validation > transport (validation surfaces a contract regression while
// transport may resolve on retry; we want validation to dominate so the
// operator's eye lands on the contract break first).
function worstProbeExitCode(probes) {
  let worst = EXIT_OK;
  for (const probe of probes) {
    if (probe.ok !== false) continue;
    const kind = probe.error?.kind || 'validation';
    if (kind === 'validation') return EXIT_VALIDATION;
    if (kind === 'transport' && worst !== EXIT_VALIDATION) worst = EXIT_TRANSPORT;
    if (kind === 'usage' && worst === EXIT_OK) worst = EXIT_USAGE;
  }
  return worst;
}

export async function runSpellingAudioSmoke(options = {}) {
  const origin = options.origin || configuredOrigin();
  const startedAt = new Date().toISOString();
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : configuredTimeoutMs();

  // Primary demo session — used for word-only + sentence probes. The
  // cross-account probe internally creates two more demo sessions.
  // Demo + bootstrap failures still throw (no point producing a probe
  // matrix when we cannot authenticate at all).
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
      probes.push(await safeRunProbe('word', () => runWordProbe({
        origin,
        cookie: demo.cookie,
        learnerId: bootstrap.learnerId,
        slug,
        voice,
        requireWordHit: options.requireWordHit,
        timeoutMs,
      })));
    }
  }
  for (const slug of options.sentenceSample) {
    probes.push(await safeRunProbe('sentence', () => runSentenceProbe({
      origin,
      cookie: demo.cookie,
      learnerId: bootstrap.learnerId,
      slug,
      requireLegacyHit: options.requireLegacyHit,
      timeoutMs,
    })));
  }
  probes.push(await safeRunProbe('cross-account', () => runCrossAccountProbe({ origin, timeoutMs })));

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
  if (report.ok) return EXIT_OK;
  // Map exit code from the worst probe.kind classification — validation
  // dominates transport so contract regressions are visible first.
  return worstProbeExitCode(report.probes);
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
