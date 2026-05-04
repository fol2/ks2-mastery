// U2 (spelling word audio cache): unit suite for the batch generator.
//
// Strategy: import only the pure helpers exported from the script — every
// side effect (Gemini fetch, ffmpeg execFile, wrangler-oauth invocation,
// R2 REST list) is funnelled through an injectable `dependencies` object,
// so the suite never makes a real network call or shells out to `ffmpeg`.
// The pinned digests / R2 keys are byte-equal to the worker-side fixtures
// in `tests/spelling-word-prompt.test.js`; if either side drifts CI fails
// here loudly before any production R2 byte is written.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  SPELLING_AUDIO_MODEL,
  buildWordAudioAssetKey,
} from '../shared/spelling-audio.js';
import {
  cleanText,
  computeWordContentKey,
  parseArgs,
  assertWordsSnapshotParity,
  getDirectApiKeyPool,
  selectVoices,
  selectWords,
  buildPlannedEntries,
  pcmToWavBuffer,
  extractAudioPayload,
  buildGeminiRequestBody,
  applyInventoryToEntries,
  mergeWithExistingState,
  summariseState,
  auditTokenMatches,
  listR2Objects,
  processEntry,
  commandList,
  commandGenerate,
  commandReconcile,
  readStateFile,
  writeStateFile,
  statePathFor,
} from '../scripts/build-spelling-word-audio.mjs';
import { WORDS } from '../src/subjects/spelling/data/word-data.js';
import { SEEDED_SPELLING_PUBLISHED_SNAPSHOT } from '../src/subjects/spelling/data/content-data.js';

// Pinned fixture values — same digests/keys assertion `tests/spelling-word-prompt.test.js`
// pins on the worker side. If the encoding or hash input shape changes,
// CI fails on both files at once.
// `accident` and `accidentally` are both real WORDS slugs (verified via
// `node -e` against `src/subjects/spelling/data/word-data.js` — the plan
// brief's `beginning` example slug does NOT exist in this repo's WORDS
// fixture, so the integration tests use the next adjacent slug instead).
const ACCIDENT_DIGEST = '_71BbbYsUhNeilGccY6U4YPJ8-8tMfGXZT7P6m6bkls';
const ACCIDENT_DEMO_DIGEST = '47smZ2cRWsCNqnEM7dUZPOr6gksxfCp0JFADmaZT24k';
const ACCIDENTALLY_DIGEST = 'QAeEpLBuWwuzCUlLsnpD5ptZeQKhqVBIrk5IaNhwTNY';
const ACCIDENT_KEY_IAPETUS = `spelling-audio/v1/${SPELLING_AUDIO_MODEL}/Iapetus/word/${ACCIDENT_DIGEST}/accident.mp3`;
const ACCIDENT_KEY_SULAFAT = `spelling-audio/v1/${SPELLING_AUDIO_MODEL}/Sulafat/word/${ACCIDENT_DIGEST}/accident.mp3`;
const ACCIDENTALLY_KEY_IAPETUS = `spelling-audio/v1/${SPELLING_AUDIO_MODEL}/Iapetus/word/${ACCIDENTALLY_DIGEST}/accidentally.mp3`;
const ACCIDENTALLY_KEY_SULAFAT = `spelling-audio/v1/${SPELLING_AUDIO_MODEL}/Sulafat/word/${ACCIDENTALLY_DIGEST}/accidentally.mp3`;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function withTempEnv(envOverrides, fn) {
  // Snapshot + restore env vars touched in tests so concurrent test files
  // don't leak through. Setting `undefined` clears the var.
  const saved = {};
  for (const key of Object.keys(envOverrides)) {
    saved[key] = process.env[key];
    if (envOverrides[key] === undefined) delete process.env[key];
    else process.env[key] = envOverrides[key];
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

// HAPPY PATH: list yields one entry per word × voice, and every R2 key
// matches the shared helper.
test('list emits one entry per word × voice with valid R2 keys', async () => {
  const entries = await commandList();
  assert.equal(entries.length, WORDS.length * 2);
  const uniqueSlugs = new Set(entries.map((entry) => entry.slug));
  assert.equal(uniqueSlugs.size, WORDS.length);
  for (const entry of entries) {
    assert.ok(['Iapetus', 'Sulafat'].includes(entry.voice), `Unexpected voice ${entry.voice}`);
    const expected = buildWordAudioAssetKey({
      voice: entry.voice,
      contentKey: entry.contentKey,
      slug: entry.slug,
    });
    assert.equal(entry.key, expected);
    assert.match(entry.contentKey, /^[A-Za-z0-9_-]+$/);
    assert.ok(!entry.contentKey.includes('='), 'base64url contentKey must not carry `=` padding');
  }
  // Smoke: every WORDS slug must appear exactly twice (once per voice).
  const counts = new Map();
  for (const entry of entries) counts.set(entry.slug, (counts.get(entry.slug) || 0) + 1);
  for (const [slug, count] of counts) {
    assert.equal(count, 2, `slug ${slug} appeared ${count} times (expected 2).`);
  }
});

// HAPPY PATH: dry-run --slug accident,accidentally plans 4 entries with
// byte-equal R2 keys and base64url contentKeys against the pinned fixture.
test('dry-run --slug accident,accidentally plans 4 entries with pinned keys', async (t) => {
  // commandGenerate writes state into the canonical .spelling-audio dir.
  // For the dry-run case the side effect is just the state file; we read it
  // back to assert keys, then clean up the state dir.
  const result = await commandGenerate({
    flags: { slug: ['accident', 'accidentally'], dryRun: true },
    env: { ...process.env, GEMINI_API_KEY: 'test-key-fixture' },
    dependencies: {},
  });
  t.after(async () => rm(path.dirname(result.statePath), { recursive: true, force: true }));

  assert.equal(result.summary.planned, 4);
  assert.equal(result.summary.pending, 4);
  const slugs = result.entries.map((entry) => entry.slug).sort();
  assert.deepEqual(slugs, ['accident', 'accident', 'accidentally', 'accidentally']);
  const accidentEntries = result.entries.filter((entry) => entry.slug === 'accident');
  assert.equal(accidentEntries.length, 2);
  for (const entry of accidentEntries) {
    assert.equal(entry.contentKey, ACCIDENT_DIGEST);
    assert.ok(entry.key === ACCIDENT_KEY_IAPETUS || entry.key === ACCIDENT_KEY_SULAFAT);
  }
  const accidentallyEntries = result.entries.filter((entry) => entry.slug === 'accidentally');
  assert.equal(accidentallyEntries.length, 2);
  for (const entry of accidentallyEntries) {
    assert.equal(entry.contentKey, ACCIDENTALLY_DIGEST);
    assert.ok(entry.key === ACCIDENTALLY_KEY_IAPETUS || entry.key === ACCIDENTALLY_KEY_SULAFAT);
  }
});

// EDGE: unknown --slug rejects with an explicit error message.
test('selectWords rejects an unknown --slug with an explicit error', () => {
  assert.throws(
    () => selectWords({ slugs: ['this-slug-does-not-exist'] }),
    /Unknown spelling slug\(s\): this-slug-does-not-exist/,
  );
});

// EDGE: limit/offset slice the WORDS list deterministically.
test('--limit 1 --offset 0 plans the first WORDS entry', () => {
  const words = selectWords({ slugs: [], limit: 1, offset: 0 });
  assert.equal(words.length, 1);
  assert.equal(words[0].slug, 'accident');
});

test('--offset at the final index --limit 1 plans the last WORDS entry', () => {
  const words = selectWords({ slugs: [], limit: 1, offset: WORDS.length - 1 });
  assert.equal(words.length, 1);
  assert.equal(words[0].slug, WORDS[WORDS.length - 1].slug);
});

// EDGE: WORDS / snapshot mismatch fixture aborts BEFORE Gemini call.
test('assertWordsSnapshotParity aborts when snapshot wordBySlug.word diverges', () => {
  const fakeWords = [{ slug: 'accident', word: 'accident' }];
  const fakeSnapshot = {
    wordBySlug: { accident: { slug: 'accident', word: 'incident' } },
  };
  assert.throws(
    () => assertWordsSnapshotParity({ words: fakeWords, snapshot: fakeSnapshot }),
    /WORDS\/snapshot divergence on slug "accident"/,
  );
});

test('assertWordsSnapshotParity aborts when snapshot is missing a slug', () => {
  const fakeWords = [{ slug: 'orphan-slug', word: 'orphan' }];
  const fakeSnapshot = { wordBySlug: {} };
  assert.throws(
    () => assertWordsSnapshotParity({ words: fakeWords, snapshot: fakeSnapshot }),
    /Snapshot is missing slug "orphan-slug"/,
  );
});

test('assertWordsSnapshotParity passes for the in-repo WORDS + snapshot pair', () => {
  // Should be true today — locks in the invariant for future content edits.
  assert.equal(
    assertWordsSnapshotParity({ words: WORDS, snapshot: SEEDED_SPELLING_PUBLISHED_SNAPSHOT }),
    true,
  );
});

// ERROR: missing all GEMINI_API_KEY* → preflight fails before any work.
test('commandGenerate aborts when no GEMINI_API_KEY* / GEMINI_API_KEYS are set', async () => {
  await withTempEnv({
    GEMINI_API_KEY: undefined,
    GEMINI_API_KEY_2: undefined,
    GEMINI_API_KEY_3: undefined,
    GEMINI_API_KEYS: undefined,
  }, async () => {
    await assert.rejects(
      commandGenerate({
        flags: { slug: ['accident'] },
        env: {
          // Empty env (we strip GEMINI_API_KEY* above; pass empty).
        },
      }),
      /At least one of GEMINI_API_KEY/,
    );
  });
});

// ERROR: stub-failed Gemini call → entry marked failed; rerun with same
// runId retries only failed entries (other entries already in 'uploaded'
// remain uploaded).
test('failed Gemini call records lastError and increments attempts', async (t) => {
  const callGemini = async () => {
    const error = new Error('Gemini boom');
    throw error;
  };
  const result = await commandGenerate({
    flags: { slug: ['accident'], voice: 'Iapetus', concurrency: 1, maxRetries: 0 },
    env: { GEMINI_API_KEY: 'stub-key' },
    dependencies: {
      callGemini,
      // upload + transcode never reached because callGemini throws first.
      upload: async () => {
        throw new Error('upload should not be called when Gemini fails');
      },
      transcode: async () => {
        throw new Error('transcode should not be called when Gemini fails');
      },
      writeWav: async () => {},
    },
  });
  t.after(async () => rm(path.dirname(result.statePath), { recursive: true, force: true }));

  assert.equal(result.summary.planned, 1);
  assert.equal(result.summary.failed, 1);
  assert.equal(result.summary.uploaded, 0);
  const entry = result.entries[0];
  assert.equal(entry.status, 'failed');
  assert.equal(entry.attempts, 1);
  assert.match(entry.lastError, /Gemini boom/);
});

// ERROR: stub-failed wrangler put → entry stays at status 'generated'
// (mp3 on disk) and the upload is retried on the next run via processEntry.
test('failed wrangler put leaves entry at status "generated" with lastError set', async (t) => {
  const callGemini = async () => ({
    data: Buffer.from('fake-pcm').toString('base64'),
    mimeType: 'audio/L16;rate=24000',
  });
  let uploadCalls = 0;
  const upload = async () => {
    uploadCalls += 1;
    const error = new Error('wrangler put failed: 503 Service Unavailable');
    throw error;
  };
  const result = await commandGenerate({
    flags: { slug: ['accident'], voice: 'Iapetus', concurrency: 1, maxRetries: 1 },
    env: { GEMINI_API_KEY: 'stub-key' },
    dependencies: {
      callGemini,
      upload,
      transcode: async () => {},
      writeWav: async () => {},
    },
  });
  t.after(async () => rm(path.dirname(result.statePath), { recursive: true, force: true }));

  assert.equal(result.summary.planned, 1);
  assert.equal(result.summary.uploaded, 0);
  const entry = result.entries[0];
  assert.equal(entry.status, 'generated');
  assert.match(entry.lastError, /503 Service Unavailable/);
  // Two attempts total: original + 1 retry under maxRetries = 1.
  assert.ok(uploadCalls >= 2, `expected at least 2 upload attempts, saw ${uploadCalls}`);
});

// ERROR: state-file deleted → --from-r2-inventory reconstructs uploaded
// status from the R2 listing (mocked REST fetch).
test('reconcile reconstructs uploaded status from a mocked R2 inventory', async (t) => {
  const inventoryKeys = [ACCIDENT_KEY_IAPETUS, ACCIDENT_KEY_SULAFAT];
  let listCalls = 0;
  const listR2 = async ({ prefix }) => {
    listCalls += 1;
    return inventoryKeys.filter((key) => key.startsWith(prefix));
  };

  const result = await withTempEnv({
    CLOUDFLARE_ACCOUNT_ID: 'fake-account',
    CLOUDFLARE_API_TOKEN: 'fake-token',
  }, async () => commandReconcile({
    runId: 'reconcile-fixture',
    dependencies: { listR2Objects: listR2 },
  }));
  t.after(async () => rm(path.dirname(result.statePath), { recursive: true, force: true }));

  assert.equal(listCalls, 2, 'should call list once per voice');
  const accidentEntries = result.state.entries.filter((entry) => entry.slug === 'accident');
  assert.equal(accidentEntries.length, 2);
  for (const entry of accidentEntries) {
    assert.equal(entry.status, 'uploaded');
  }
  // Other entries (e.g. accidentally — the next adjacent slug) stay pending.
  const accidentallyEntries = result.state.entries.filter((entry) => entry.slug === 'accidentally');
  assert.equal(accidentallyEntries.length, 2);
  for (const entry of accidentallyEntries) {
    assert.equal(entry.status, 'pending');
  }
  assert.equal(result.state.summary.uploaded, 2);
});

// INTEGRATION: hash byte-equality fixture pinned against worker.
test('computeWordContentKey produces the pinned base64url digest for accident', async () => {
  const digest = await computeWordContentKey('accident', 'accident');
  assert.equal(digest, ACCIDENT_DIGEST);
  assert.match(digest, /^[A-Za-z0-9_-]+$/);
  assert.ok(!digest.includes('='));
});

// INTEGRATION: cleanText parity — `'  accident demo  '` collapses to
// `'accident demo'`, both should produce the same key.
test('computeWordContentKey applies cleanText collapse identically to Worker', async () => {
  const dirty = await computeWordContentKey('accident', '  accident demo  ');
  const clean = await computeWordContentKey('accident', 'accident demo');
  assert.equal(dirty, clean);
  assert.equal(dirty, ACCIDENT_DEMO_DIGEST);
});

// INTEGRATION: R2 key byte-equality vs `buildWordAudioAssetKey` (shared helper).
test('buildPlannedEntries R2 key matches buildWordAudioAssetKey output', async () => {
  const entries = await buildPlannedEntries({
    words: [{ slug: 'accident', word: 'accident' }],
    voices: ['Iapetus', 'Sulafat'],
  });
  for (const entry of entries) {
    const expected = buildWordAudioAssetKey({
      voice: entry.voice,
      contentKey: entry.contentKey,
      slug: entry.slug,
    });
    assert.equal(entry.key, expected);
  }
});

