// U1 (spelling word audio cache): unit-level guarantees that the new shared
// `buildBufferedWordSpeechPrompt` helper is a byte-equal substitute for the
// inline word-only prompt the Worker carried at `worker/src/tts.js:557`
// before this PR, AND that batch-side R2 keys land at the same path the
// Worker derives via `bufferedAudioMetadata` + `bufferedAudioKey`. This
// suite is the "single source of truth" backstop: if it ever fails the
// pre-fill cache and the live regen cache will diverge.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SPELLING_AUDIO_MODEL,
  buildBufferedWordSpeechPrompt,
  buildWordAudioAssetKey,
} from '../shared/spelling-audio.js';
import { sha256 } from '../worker/src/auth.js';
import { bufferedAudioKey, bufferedAudioMetadata, geminiPrompt } from '../worker/src/tts.js';

// Snapshot captured from `worker/src/tts.js:557` (pre-refactor literal) —
// `Read exactly this KS2 spelling word once in natural British English. Do
// not add any extra words:\n\n${transcript}`. Hard-coded so any future
// edit to the helper that changes a single character fails this test.
const ACCIDENT_PROMPT = 'Read exactly this KS2 spelling word once in natural British English. Do not add any extra words:\n\naccident';
const ACCIDENT_DEMO_PROMPT = 'Read exactly this KS2 spelling word once in natural British English. Do not add any extra words:\n\naccident demo';

// Pinned digests computed once from `sha256(['spelling-audio-word-v1', slug,
// word].join('|'))` using `worker/src/auth.js` `sha256` (SHA-256 →
// base64url, no `=` padding). Hard-coded so a regression in
// `bytesToBase64Url` (or in the join key shape) trips CI before reaching
// production R2.
const ACCIDENT_DIGEST = '_71BbbYsUhNeilGccY6U4YPJ8-8tMfGXZT7P6m6bkls';
const ACCIDENT_DEMO_DIGEST = '47smZ2cRWsCNqnEM7dUZPOr6gksxfCp0JFADmaZT24k';

// Pinned R2 keys for `(slug:'accident', word:'accident')` so a future change
// to `buildWordAudioAssetKey`'s URL shape fails CI explicitly rather than
// silently generating audio under a key the Worker would never read.
const ACCIDENT_KEY_IAPETUS_MP3 = `spelling-audio/v1/${SPELLING_AUDIO_MODEL}/Iapetus/word/${ACCIDENT_DIGEST}/accident.mp3`;
const ACCIDENT_KEY_SULAFAT_MP3 = `spelling-audio/v1/${SPELLING_AUDIO_MODEL}/Sulafat/word/${ACCIDENT_DIGEST}/accident.mp3`;
const ACCIDENT_KEY_IAPETUS_WAV = `spelling-audio/v1/${SPELLING_AUDIO_MODEL}/Iapetus/word/${ACCIDENT_DIGEST}/accident.wav`;
const ACCIDENT_DEMO_KEY_IAPETUS_MP3 = `spelling-audio/v1/${SPELLING_AUDIO_MODEL}/Iapetus/word/${ACCIDENT_DEMO_DIGEST}/accident.mp3`;

const BASE64_URL_RE = /^[A-Za-z0-9_-]+$/;

test('buildBufferedWordSpeechPrompt happy path matches pre-refactor Worker literal', () => {
  assert.equal(
    buildBufferedWordSpeechPrompt({ wordText: 'accident' }),
    ACCIDENT_PROMPT,
  );
});

test('buildBufferedWordSpeechPrompt trims leading/trailing whitespace', () => {
  assert.equal(
    buildBufferedWordSpeechPrompt({ wordText: '  accident  ' }),
    ACCIDENT_PROMPT,
  );
  assert.equal(
    buildBufferedWordSpeechPrompt({ wordText: '\taccident\n' }),
    ACCIDENT_PROMPT,
  );
});

test('buildBufferedWordSpeechPrompt collapses internal NBSP to a single space', () => {
  // U+00A0 (non-breaking space) is matched by the `\s` class in V8/Node,
  // so the Worker's `cleanText` collapses it identically to a regular
  // space. Bare `.trim()` would NOT do this — that is the regression
  // this assertion exists to catch.
  assert.equal(
    buildBufferedWordSpeechPrompt({ wordText: 'accident word' }),
    'Read exactly this KS2 spelling word once in natural British English. Do not add any extra words:\n\naccident word',
  );
});

test('buildBufferedWordSpeechPrompt collapses internal double-space to a single space', () => {
  assert.equal(
    buildBufferedWordSpeechPrompt({ wordText: 'two  spaces' }),
    'Read exactly this KS2 spelling word once in natural British English. Do not add any extra words:\n\ntwo spaces',
  );
});

test('buildBufferedWordSpeechPrompt collapses tabs to a single space', () => {
  assert.equal(
    buildBufferedWordSpeechPrompt({ wordText: 'tab\tseparated' }),
    'Read exactly this KS2 spelling word once in natural British English. Do not add any extra words:\n\ntab separated',
  );
});

test('buildBufferedWordSpeechPrompt accepts empty / null / undefined as empty transcript', () => {
  // Worker's `cleanText('')` and `cleanText(null)` both return `''`. The
  // helper therefore renders the prompt preamble with an empty word line.
  // This mirrors what the Worker would emit if `transcript` ever arrived
  // empty (the live path guards against this further upstream in
  // `resolveSpellingAudioRequest`, but the helper itself is permissive so
  // the batch script can probe inputs without the helper throwing).
  const empty = 'Read exactly this KS2 spelling word once in natural British English. Do not add any extra words:\n\n';
  assert.equal(buildBufferedWordSpeechPrompt({ wordText: '' }), empty);
  assert.equal(buildBufferedWordSpeechPrompt({ wordText: null }), empty);
  assert.equal(buildBufferedWordSpeechPrompt({ wordText: undefined }), empty);
  assert.equal(buildBufferedWordSpeechPrompt({}), empty);
});

test('sha256 of word-only content key is base64url and matches the pinned digest', async () => {
  const digest = await sha256(['spelling-audio-word-v1', 'accident', 'accident'].join('|'));
  assert.match(digest, BASE64_URL_RE);
  assert.ok(!digest.includes('='), 'base64url digest must not carry `=` padding');
  assert.equal(digest, ACCIDENT_DIGEST);
});

test('bufferedAudioMetadata emits the same digest as the pinned word-only fixture', async () => {
  const metadata = await bufferedAudioMetadata({
    wordOnly: true,
    slug: 'accident',
    word: 'accident',
    accountId: 'fixture-account',
    bufferedGeminiVoice: 'Iapetus',
  });
  assert.ok(metadata, 'bufferedAudioMetadata should accept a complete word-only payload');
  assert.equal(metadata.kind, 'word');
  assert.equal(metadata.contentKey, ACCIDENT_DIGEST);
  assert.equal(metadata.slug, 'accident');
  assert.equal(metadata.voice, 'Iapetus');
  assert.equal(metadata.model, SPELLING_AUDIO_MODEL);
});

test('buildWordAudioAssetKey produces byte-equal R2 keys to bufferedAudioKey for both voices', async () => {
  for (const voice of ['Iapetus', 'Sulafat']) {
    const metadata = await bufferedAudioMetadata({
      wordOnly: true,
      slug: 'accident',
      word: 'accident',
      accountId: 'fixture-account',
      bufferedGeminiVoice: voice,
    });
    const helperKey = buildWordAudioAssetKey({
      voice,
      contentKey: metadata.contentKey,
      slug: 'accident',
    });
    const workerKey = bufferedAudioKey(metadata, 'mp3');
    assert.equal(helperKey, workerKey, `Helper and Worker disagree on ${voice} mp3 key.`);
  }

  const iapetusMetadata = await bufferedAudioMetadata({
    wordOnly: true,
    slug: 'accident',
    word: 'accident',
    accountId: 'fixture-account',
    bufferedGeminiVoice: 'Iapetus',
  });
  const sulafatMetadata = await bufferedAudioMetadata({
    wordOnly: true,
    slug: 'accident',
    word: 'accident',
    accountId: 'fixture-account',
    bufferedGeminiVoice: 'Sulafat',
  });
  assert.equal(bufferedAudioKey(iapetusMetadata, 'mp3'), ACCIDENT_KEY_IAPETUS_MP3);
  assert.equal(bufferedAudioKey(sulafatMetadata, 'mp3'), ACCIDENT_KEY_SULAFAT_MP3);
  assert.equal(bufferedAudioKey(iapetusMetadata, 'wav'), ACCIDENT_KEY_IAPETUS_WAV);
});

test('cleanText-bearing input round-trips to the same R2 key as the pre-cleaned form', async () => {
  // The batch generator will be fed raw `(slug, word)` pairs from the
  // dataset. If a future content edit ever introduces stray whitespace
  // around `word` we want the helper to land on the SAME R2 key the
  // Worker would derive — otherwise pre-fill silently misses live
  // lookups. This pair confirms `cleanText` collapse is applied
  // generator-side.
  const dirtyMetadata = await bufferedAudioMetadata({
    wordOnly: true,
    slug: 'accident',
    word: '  accident demo  ',
    accountId: 'fixture-account',
    bufferedGeminiVoice: 'Iapetus',
  });
  const cleanMetadata = await bufferedAudioMetadata({
    wordOnly: true,
    slug: 'accident',
    word: 'accident demo',
    accountId: 'fixture-account',
    bufferedGeminiVoice: 'Iapetus',
  });
  assert.equal(dirtyMetadata.contentKey, ACCIDENT_DEMO_DIGEST);
  assert.equal(cleanMetadata.contentKey, ACCIDENT_DEMO_DIGEST);

  const dirtyKey = bufferedAudioKey(dirtyMetadata, 'mp3');
  const cleanKey = bufferedAudioKey(cleanMetadata, 'mp3');
  assert.equal(dirtyKey, cleanKey);
  assert.equal(dirtyKey, ACCIDENT_DEMO_KEY_IAPETUS_MP3);

  // Helper-side parity: the `buildBufferedWordSpeechPrompt` output is
  // also byte-identical when fed dirty vs clean wordText, which is the
  // precondition for byte-identical Gemini synthesis on both lanes.
  assert.equal(
    buildBufferedWordSpeechPrompt({ wordText: '  accident demo  ' }),
    ACCIDENT_DEMO_PROMPT,
  );
  assert.equal(
    buildBufferedWordSpeechPrompt({ wordText: 'accident demo' }),
    ACCIDENT_DEMO_PROMPT,
  );
});

test('Worker geminiPrompt(wordOnly) returns the same string as the shared helper', () => {
  // Single-source guarantee post-refactor: if these ever diverge, the
  // Worker has dropped the helper call and reintroduced an inline literal.
  const worker = geminiPrompt({ wordOnly: true, transcript: 'accident' });
  const helper = buildBufferedWordSpeechPrompt({ wordText: 'accident' });
  assert.equal(worker, helper);
  assert.equal(worker, ACCIDENT_PROMPT);
});

test('Worker geminiPrompt(wordOnly) applies cleanText collapse identically to the shared helper', () => {
  // testing-1 review pin (PR #286, anchor 60): the Worker entry point
  // `geminiPrompt({ wordOnly: true, transcript })` flows `transcript`
  // through `cleanText()` in `resolveSpellingAudioRequest` upstream, so
  // by the time the helper sees `wordText` it should already be
  // collapsed. This assertion pins the contract at the Worker boundary
  // so that if a future refactor accidentally bypasses cleanText for
  // the wordOnly lane (or the helper stops re-applying it), CI fails
  // before pre-fill cache and live-regen cache silently diverge on
  // dirty inputs.
  const dirtyWorker = geminiPrompt({ wordOnly: true, transcript: '  accident demo  ' });
  const dirtyHelper = buildBufferedWordSpeechPrompt({ wordText: '  accident demo  ' });
  const cleanHelper = buildBufferedWordSpeechPrompt({ wordText: 'accident demo' });
  assert.equal(dirtyWorker, dirtyHelper);
  assert.equal(dirtyWorker, cleanHelper);
  assert.equal(dirtyWorker, ACCIDENT_DEMO_PROMPT);
});
