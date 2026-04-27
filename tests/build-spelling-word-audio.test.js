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

// INTEGRATION: planned → uploaded count parity. Mock everything; assert every
// planned word × voice entry reaches status: uploaded after a simulated run.
test('full simulated generate run lands every planned word entry uploaded', async (t) => {
  const callGemini = async () => ({
    data: Buffer.from('fake-pcm-data').toString('base64'),
    mimeType: 'audio/L16;rate=24000',
  });
  const upload = async () => {};
  const transcode = async () => {};
  const writeWav = async () => {};

  const result = await commandGenerate({
    flags: { concurrency: 8, maxRetries: 0 },
    env: { GEMINI_API_KEY: 'stub-key' },
    dependencies: { callGemini, upload, transcode, writeWav },
  });
  t.after(async () => rm(path.dirname(result.statePath), { recursive: true, force: true }));

  assert.equal(result.summary.planned, WORDS.length * 2);
  assert.equal(result.summary.uploaded, WORDS.length * 2);
  assert.equal(result.summary.failed, 0);
});

// INTEGRATION: rerun with same run-id retries only failed entries.
test('rerun with same --run-id retries only failed entries', async (t) => {
  const tmpKey = 'rerun-fixture-id';
  // First run: Gemini stub fails for slug accident.
  const callGeminiFail = async () => {
    throw new Error('Gemini boom');
  };
  const firstRun = await commandGenerate({
    flags: { slug: ['accident'], runId: tmpKey, concurrency: 1, maxRetries: 0 },
    env: { GEMINI_API_KEY: 'stub-key' },
    dependencies: {
      callGemini: callGeminiFail,
      upload: async () => {},
      transcode: async () => {},
      writeWav: async () => {},
    },
  });
  t.after(async () => rm(path.dirname(firstRun.statePath), { recursive: true, force: true }));

  assert.equal(firstRun.summary.failed, 2);
  for (const entry of firstRun.entries) {
    assert.equal(entry.attempts, 1);
  }

  // Second run with same run-id but a different slug subset succeeds; the
  // previously-failed accident entries are also retried because their
  // status is 'failed' (not 'uploaded').
  let geminiCalls = 0;
  const callGeminiOk = async () => {
    geminiCalls += 1;
    return {
      data: Buffer.from('fake').toString('base64'),
      mimeType: 'audio/L16;rate=24000',
    };
  };
  const secondRun = await commandGenerate({
    flags: { slug: ['accident'], runId: tmpKey, concurrency: 1, maxRetries: 0 },
    env: { GEMINI_API_KEY: 'stub-key' },
    dependencies: {
      callGemini: callGeminiOk,
      upload: async () => {},
      transcode: async () => {},
      writeWav: async () => {},
    },
  });
  assert.equal(secondRun.summary.uploaded, 2);
  assert.equal(secondRun.summary.failed, 0);
  // Each previously-failed entry retried -> 2 fresh Gemini calls.
  assert.equal(geminiCalls, 2);
  for (const entry of secondRun.entries) {
    // attempts increments across runs because mergeWithExistingState
    // preserves the prior count and processEntry adds 1 for this attempt.
    assert.equal(entry.attempts, 2);
  }
});

// AUDIT BLOCKLIST COVERAGE (per ADV-5): pin substring-match behaviour against
// future tightening that would silently drop coverage of `_2`/`_20`/`KEYS`
// variants and CLOUDFLARE_API_TOKEN.
test('audit substring matcher catches GEMINI_API_KEY_2 / _20 / GEMINI_API_KEYS / CLOUDFLARE_API_TOKEN', () => {
  const fixture = [
    'GEMINI_API_KEY_2=foo',
    'GEMINI_API_KEY_20=bar',
    'GEMINI_API_KEYS=baz,qux',
    'CLOUDFLARE_API_TOKEN=xxx',
  ].join('\n');
  // The two production audits both call `text.includes('GEMINI_API_KEY')`
  // and `text.includes('CLOUDFLARE_API_TOKEN')` (verified by inspection).
  // If a future PR refactors them to whole-word match (e.g. \bGEMINI_API_KEY\b)
  // the numbered / pluralised variants would silently slip through and the
  // generator's key-rotation pool secrets could leak. This test pins the
  // substring contract at the matcher boundary.
  assert.equal(auditTokenMatches(fixture, 'GEMINI_API_KEY'), true);
  assert.equal(auditTokenMatches(fixture, 'CLOUDFLARE_API_TOKEN'), true);
  // Sanity: an unrelated token does NOT spuriously match.
  assert.equal(auditTokenMatches(fixture, 'STRIPE_SECRET_KEY'), false);
});

// PARSE ARGS: smoke for the CSV slug split + unknown flag behaviour.
test('parseArgs splits CSV --slug values and rejects unknown flags', () => {
  const parsed = parseArgs(['dry-run', '--slug', 'accident,beginning', '--voice', 'Iapetus']);
  assert.equal(parsed.command, 'dry-run');
  assert.deepEqual(parsed.flags.slug, ['accident', 'beginning']);
  assert.equal(parsed.flags.voice, 'Iapetus');

  assert.throws(
    () => parseArgs(['generate', '--made-up-flag']),
    /Unknown option: --made-up-flag/,
  );
});

test('parseArgs rejects negative --limit / --offset / --concurrency', () => {
  assert.throws(() => parseArgs(['generate', '--limit', '-1']), /--limit/);
  assert.throws(() => parseArgs(['generate', '--offset', '-2']), /--offset/);
  assert.throws(() => parseArgs(['generate', '--concurrency', '0']), /--concurrency/);
});

// API KEY POOL: demonstrate sort + dedup + comma-list behaviour without
// relying on real env state.
test('getDirectApiKeyPool sorts numbered keys, dedups, and accepts comma-lists', () => {
  const pool = getDirectApiKeyPool({
    GEMINI_API_KEY: 'first',
    GEMINI_API_KEY_3: 'third',
    GEMINI_API_KEY_2: 'second',
    GEMINI_API_KEYS: 'second,fourth fifth',
  });
  assert.deepEqual(pool.map((entry) => entry.envName), [
    'GEMINI_API_KEY',
    'GEMINI_API_KEY_2',
    'GEMINI_API_KEY_3',
    'GEMINI_API_KEYS[2]',
    'GEMINI_API_KEYS[3]',
  ]);
});

test('getDirectApiKeyPool returns empty when no env vars are set', () => {
  const pool = getDirectApiKeyPool({});
  assert.deepEqual(pool, []);
});

// SELECT VOICES: rejects unknown, returns full set when no flag.
test('selectVoices returns both buffered voices when no flag is passed', () => {
  assert.deepEqual(selectVoices(''), ['Iapetus', 'Sulafat']);
});

test('selectVoices rejects an unknown voice value', () => {
  assert.throws(() => selectVoices('UnknownVoice'), /Unknown buffered voice "UnknownVoice"/);
});

// PCM → WAV: smoke that the buffer length + RIFF header are correct.
test('pcmToWavBuffer wraps PCM with a RIFF/WAVE header', () => {
  const pcm = Buffer.alloc(100, 0xff);
  const wav = pcmToWavBuffer(pcm.toString('base64'), 'audio/L16;rate=24000');
  assert.equal(wav.length, 44 + 100);
  assert.equal(wav.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(wav.subarray(8, 12).toString('ascii'), 'WAVE');
});

test('pcmToWavBuffer preserves audio/wav payload as-is', () => {
  const wav = Buffer.from('RIFF dummy bytes');
  const result = pcmToWavBuffer(wav.toString('base64'), 'audio/wav');
  assert.equal(result.toString('utf8'), 'RIFF dummy bytes');
});

// EXTRACT AUDIO: shape parity with both inlineData / inline_data variants.
test('extractAudioPayload accepts both inlineData and inline_data shapes', () => {
  assert.deepEqual(extractAudioPayload({
    candidates: [{
      content: { parts: [{ inlineData: { data: 'AA', mimeType: 'audio/wav' } }] },
    }],
  }), { data: 'AA', mimeType: 'audio/wav' });
  assert.deepEqual(extractAudioPayload({
    candidates: [{
      content: { parts: [{ inline_data: { data: 'BB', mime_type: 'audio/wav' } }] },
    }],
  }), { data: 'BB', mime_type: 'audio/wav' });
  assert.equal(extractAudioPayload({}), null);
});

// REQUEST BODY: shape parity with worker/src/tts.js direct call body.
test('buildGeminiRequestBody mirrors the Worker direct-call body shape', () => {
  const body = buildGeminiRequestBody({ wordText: 'accident', voice: 'Iapetus' });
  assert.equal(body.contents[0].parts[0].text.startsWith('Read exactly this KS2 spelling word'), true);
  assert.deepEqual(body.generationConfig.responseModalities, ['AUDIO']);
  assert.equal(body.generationConfig.speechConfig.languageCode, 'en-GB');
  assert.equal(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Iapetus');
});

// LIST R2 OBJECTS: pagination contract — second page is consumed when
// truncated=true, list stops on truncated=false.
test('listR2Objects paginates via cursor / truncated', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(url);
    if (calls.length === 1) {
      return {
        ok: true,
        json: async () => ({
          result: [{ key: 'page1-key' }],
          result_info: { truncated: true, cursor: 'next-cursor' },
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        result: [{ key: 'page2-key' }],
        result_info: { truncated: false },
      }),
    };
  };
  const keys = await listR2Objects({
    accountId: 'fake',
    bucket: 'fake-bucket',
    prefix: 'spelling-audio/v1/',
    apiToken: 'fake-token',
    fetchImpl,
  });
  assert.deepEqual(keys, ['page1-key', 'page2-key']);
  assert.equal(calls.length, 2);
  assert.match(calls[1], /cursor=next-cursor/);
});

test('listR2Objects raises an explicit error when the REST call fails', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 500,
    json: async () => ({}),
  });
  await assert.rejects(
    () => listR2Objects({
      accountId: 'fake',
      bucket: 'fake-bucket',
      prefix: 'p/',
      apiToken: 'fake-token',
      fetchImpl,
    }),
    /R2 list failed \(500\)/,
  );
});

// APPLY INVENTORY: marks matching entries uploaded, leaves others alone.
test('applyInventoryToEntries flips matching entries to uploaded', () => {
  const entries = [
    { key: 'a', status: 'pending' },
    { key: 'b', status: 'pending' },
  ];
  const updated = applyInventoryToEntries(entries, new Set(['a']));
  assert.equal(updated[0].status, 'uploaded');
  assert.equal(updated[1].status, 'pending');
});

// MERGE STATE: discards prior status when key changes (regression guard).
test('mergeWithExistingState discards prior status when key drift detected', () => {
  const planned = [{ slug: 'accident', voice: 'Iapetus', key: 'new-key', contentKey: 'new', status: 'pending', attempts: 0 }];
  const merged = mergeWithExistingState(planned, {
    entries: [
      { slug: 'accident', voice: 'Iapetus', key: 'old-key', contentKey: 'old', status: 'uploaded', attempts: 5 },
    ],
  });
  // Key drift -> we must NOT inherit `uploaded`, otherwise the new R2
  // location is silently mis-marked.
  assert.equal(merged[0].status, 'pending');
});

test('mergeWithExistingState inherits uploaded status when keys match', () => {
  const planned = [{ slug: 'accident', voice: 'Iapetus', key: 'key', contentKey: 'ck', status: 'pending', attempts: 0 }];
  const merged = mergeWithExistingState(planned, {
    entries: [
      { slug: 'accident', voice: 'Iapetus', key: 'key', contentKey: 'ck', status: 'uploaded', attempts: 3 },
    ],
  });
  assert.equal(merged[0].status, 'uploaded');
  assert.equal(merged[0].attempts, 3);
});

// SUMMARY: counts are honest over a mixed-status fixture.
test('summariseState counts pending / generated / uploaded / failed correctly', () => {
  const summary = summariseState([
    { status: 'pending' },
    { status: 'pending' },
    { status: 'generated' },
    { status: 'uploaded' },
    { status: 'failed' },
  ]);
  assert.deepEqual(summary, { planned: 5, pending: 2, generated: 1, uploaded: 1, failed: 1 });
});

// CLEAN TEXT: parity with the Worker copy. NBSP is the canary.
test('cleanText collapses NBSP / tabs / double-space and trims', () => {
  assert.equal(cleanText('  accident word  '), 'accident word');
  assert.equal(cleanText('two\t\tspaces'), 'two spaces');
  assert.equal(cleanText(null), '');
  assert.equal(cleanText(undefined), '');
});

// PROCESS ENTRY: rerun skips entries already marked uploaded.
test('processEntry returns immediately when entry is already uploaded', async () => {
  const entry = { slug: 'accident', voice: 'Iapetus', key: 'k', contentKey: 'ck', status: 'uploaded', attempts: 0 };
  let called = false;
  const result = await processEntry({
    entry,
    apiKey: 'k',
    bucketName: 'b',
    runDir: '/tmp/x',
    dependencies: {
      callGemini: async () => { called = true; return {}; },
      upload: async () => { called = true; },
      transcode: async () => {},
      writeWav: async () => {},
    },
  });
  assert.equal(result.status, 'uploaded');
  assert.equal(called, false);
});

// STATE FILE: round-trip via writeStateFile / readStateFile.
test('writeStateFile + readStateFile round-trip JSON state', async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'state-test-'));
  t.after(async () => rm(tmpDir, { recursive: true, force: true }));
  const targetPath = path.join(tmpDir, 'state.json');
  await writeStateFile(targetPath, {
    runId: 'fixture',
    entries: [{ slug: 'accident', status: 'pending' }],
  });
  const loaded = await readStateFile(targetPath);
  assert.equal(loaded.runId, 'fixture');
  assert.equal(loaded.entries[0].slug, 'accident');
  assert.ok(loaded.updatedAt);
});

test('readStateFile returns null for a missing path (no throw)', async () => {
  const result = await readStateFile('/tmp/this/does/not/exist.json');
  assert.equal(result, null);
});

test('statePathFor uses the .spelling-audio/word-runs/<runId>/state.json layout', () => {
  const target = statePathFor('rfix');
  assert.match(target, /\.spelling-audio[/\\]word-runs[/\\]rfix[/\\]state\.json$/);
});

// FIX 1 (review 2026-04-26): `--max-retries 0` + non-quota Gemini error
// must produce exactly ONE attempt + status `failed`. Pins the
// break-immediately semantics for the non-quota path.
test('--max-retries 0 + non-quota Gemini error → exactly 1 attempt, status failed', async (t) => {
  let geminiCalls = 0;
  const callGemini = async () => {
    geminiCalls += 1;
    const error = new Error('Gemini malformed response');
    // No status; not a quota signature.
    throw error;
  };
  const result = await commandGenerate({
    flags: { slug: ['accident'], voice: 'Iapetus', concurrency: 1, maxRetries: 0 },
    env: { GEMINI_API_KEY: 'stub-key' },
    dependencies: {
      callGemini,
      upload: async () => {},
      transcode: async () => {},
      writeWav: async () => {},
      processSignals: { on() {}, removeListener() {}, exit() {} },
    },
  });
  t.after(async () => rm(path.dirname(result.statePath), { recursive: true, force: true }));

  assert.equal(geminiCalls, 1, `expected exactly 1 Gemini call, saw ${geminiCalls}`);
  const entry = result.entries[0];
  assert.equal(entry.status, 'failed');
  assert.equal(entry.attempts, 1);
  assert.match(entry.lastError, /Gemini malformed response/);
});

// FIX 1 (review 2026-04-26): `--max-retries 0` + quota error rotating
// through 2 keys → key rotation happens, entry succeeds on the 2nd key.
// Proves quota rotation is INDEPENDENT of the retry budget — a single
// 429 on key #1 must not fail the entry while key #2 is healthy.
test('--max-retries 0 + quota error rotates through 2 keys + succeeds on 2nd', async (t) => {
  const seenKeys = [];
  const callGemini = async ({ apiKey }) => {
    seenKeys.push(apiKey);
    if (apiKey === 'first-key') {
      const quotaError = new Error('429 RESOURCE_EXHAUSTED');
      quotaError.status = 429;
      throw quotaError;
    }
    return {
      data: Buffer.from('fake-pcm').toString('base64'),
      mimeType: 'audio/L16;rate=24000',
    };
  };
  const result = await commandGenerate({
    flags: { slug: ['accident'], voice: 'Iapetus', concurrency: 1, maxRetries: 0 },
    env: { GEMINI_API_KEY: 'first-key', GEMINI_API_KEY_2: 'second-key' },
    dependencies: {
      callGemini,
      upload: async () => {},
      transcode: async () => {},
      writeWav: async () => {},
      processSignals: { on() {}, removeListener() {}, exit() {} },
    },
  });
  t.after(async () => rm(path.dirname(result.statePath), { recursive: true, force: true }));

  // Two Gemini calls: first-key (429), then second-key (success).
  assert.deepEqual(seenKeys, ['first-key', 'second-key']);
  const entry = result.entries[0];
  assert.equal(entry.status, 'uploaded');
  assert.equal(entry.attempts, 2);
});

// FIX 1 (review 2026-04-26): `--max-retries 2` + non-quota Gemini error
// should STILL produce exactly 1 attempt — the retry budget is reserved
// for upload-side 5xx (handled in `processEntry`) and a future
// transport-error lane. Non-quota errors break immediately because
// they will not resolve on the same key without operator action.
test('--max-retries 2 + non-quota Gemini error → exactly 1 attempt (break-immediately semantics)', async (t) => {
  let geminiCalls = 0;
  const callGemini = async () => {
    geminiCalls += 1;
    const error = new Error('Gemini server bug');
    throw error;
  };
  const result = await commandGenerate({
    flags: { slug: ['accident'], voice: 'Iapetus', concurrency: 1, maxRetries: 2 },
    env: { GEMINI_API_KEY: 'stub-key' },
    dependencies: {
      callGemini,
      upload: async () => {},
      transcode: async () => {},
      writeWav: async () => {},
      processSignals: { on() {}, removeListener() {}, exit() {} },
    },
  });
  t.after(async () => rm(path.dirname(result.statePath), { recursive: true, force: true }));

  assert.equal(geminiCalls, 1, `expected exactly 1 Gemini call, saw ${geminiCalls}`);
  const entry = result.entries[0];
  assert.equal(entry.status, 'failed');
  assert.equal(entry.attempts, 1);
});

test('transient Gemini 5xx retries within the bounded retry budget', async (t) => {
  let geminiCalls = 0;
  const callGemini = async () => {
    geminiCalls += 1;
    if (geminiCalls === 1) {
      const error = new Error('Gemini TTS direct call failed: 503 UNAVAILABLE');
      error.status = 503;
      throw error;
    }
    return {
      data: Buffer.from('fake-pcm').toString('base64'),
      mimeType: 'audio/L16;rate=24000',
    };
  };
  const result = await commandGenerate({
    flags: { slug: ['accident'], voice: 'Iapetus', concurrency: 1, maxRetries: 2 },
    env: { GEMINI_API_KEY: 'stub-key' },
    dependencies: {
      callGemini,
      upload: async () => {},
      transcode: async () => {},
      writeWav: async () => {},
      processSignals: { on() {}, removeListener() {}, exit() {} },
    },
  });
  t.after(async () => rm(path.dirname(result.statePath), { recursive: true, force: true }));

  assert.equal(geminiCalls, 2);
  const entry = result.entries[0];
  assert.equal(entry.status, 'uploaded');
  assert.equal(entry.attempts, 2);
  assert.equal(entry.lastError, null);
});

// FIX 2a (review 2026-04-26): atomic state file — corrupt JSON on read
// throws a clear, actionable error pointing the operator at
// `--from-r2-inventory`, NOT a raw `SyntaxError` stack trace. Simulated
// by writing a half-payload (`{`) directly to the state path.
test('readStateFile rejects corrupt JSON with a clear actionable error', async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'corrupt-state-'));
  t.after(async () => rm(tmpDir, { recursive: true, force: true }));
  const statePath = path.join(tmpDir, 'state.json');
  // Simulate a SIGINT mid-write: a half-flushed payload.
  await writeFile(statePath, '{', 'utf8');

  await assert.rejects(
    () => readStateFile(statePath),
    /state file corrupt at .*state\.json.*delete and re-run with --from-r2-inventory/,
  );
});

// FIX 2a (review 2026-04-26): writeStateFile is atomic — uses tmp + rename.
// Verified by inspecting the `<path>.tmp` artefact does NOT linger after a
// successful write (rename consumes it). A leaking `.tmp` would indicate
// the rename path is broken and partial writes could corrupt the target.
test('writeStateFile is atomic via tmp + rename (no .tmp.* lingers)', async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'atomic-state-'));
  t.after(async () => rm(tmpDir, { recursive: true, force: true }));
  const statePath = path.join(tmpDir, 'state.json');
  await writeStateFile(statePath, { runId: 'atomic-fixture', entries: [] });
  // Target exists.
  const loaded = await readStateFile(statePath);
  assert.equal(loaded.runId, 'atomic-fixture');
  // No staged tmp files linger in the target dir — unique-suffix tmp is
  // required because concurrent flushState writers would race a fixed
  // `<path>.tmp`.
  const { readdir: readdirFs } = await import('node:fs/promises');
  const remaining = await readdirFs(tmpDir);
  const stragglers = remaining.filter((name) => name.includes('.tmp'));
  assert.deepEqual(stragglers, [], `expected no .tmp.* stragglers, saw ${stragglers.join(', ')}`);
});

// FIX 2b (review 2026-04-26): SIGINT + SIGTERM handlers are registered
// during `commandGenerate` and removed on normal completion. Asserted
// via a `processSignals` spy injected through `dependencies` — proves
// the handler-registration contract without leaking real signal
// listeners onto the actual `process` object.
test('commandGenerate registers + removes SIGINT/SIGTERM handlers', async (t) => {
  const registered = [];
  const removed = [];
  const spy = {
    on(signal, listener) {
      registered.push({ signal, listener });
    },
    removeListener(signal, listener) {
      removed.push({ signal, listener });
    },
    exit() {},
  };
  const result = await commandGenerate({
    flags: { slug: ['accident'], voice: 'Iapetus', concurrency: 1, maxRetries: 0 },
    env: { GEMINI_API_KEY: 'stub-key' },
    dependencies: {
      callGemini: async () => ({ data: Buffer.from('x').toString('base64'), mimeType: 'audio/L16;rate=24000' }),
      upload: async () => {},
      transcode: async () => {},
      writeWav: async () => {},
      processSignals: spy,
    },
  });
  t.after(async () => rm(path.dirname(result.statePath), { recursive: true, force: true }));

  // Both signals registered exactly once.
  const registeredSignals = registered.map((entry) => entry.signal).sort();
  assert.deepEqual(registeredSignals, ['SIGINT', 'SIGTERM']);
  // Both signals removed on normal completion (matched by listener identity).
  const removedSignals = removed.map((entry) => entry.signal).sort();
  assert.deepEqual(removedSignals, ['SIGINT', 'SIGTERM']);
  for (const { signal, listener } of registered) {
    const matchingRemoval = removed.find((entry) => entry.signal === signal && entry.listener === listener);
    assert.ok(matchingRemoval, `listener for ${signal} was registered but never removed`);
  }
});

// FIX 2b (review 2026-04-26): per-entry state flush — the state file is
// written after EVERY entry's status mutation, not only at the end of
// `commandGenerate`. Verified by injecting a fault on the second entry
// and reading the on-disk state to confirm the first entry's `uploaded`
// status was persisted before the crash propagated.
test('commandGenerate flushes state after every entry (no end-of-run-only writes)', async (t) => {
  let calls = 0;
  // Two entries planned (accident × 2 voices). First call succeeds, second
  // call fails — partial progress must be on disk after both finish.
  const callGemini = async () => {
    calls += 1;
    if (calls === 1) {
      return {
        data: Buffer.from('first-ok').toString('base64'),
        mimeType: 'audio/L16;rate=24000',
      };
    }
    throw new Error('second-fails-non-quota');
  };
  const result = await commandGenerate({
    flags: { slug: ['accident'], concurrency: 1, maxRetries: 0 },
    env: { GEMINI_API_KEY: 'stub-key' },
    dependencies: {
      callGemini,
      upload: async () => {},
      transcode: async () => {},
      writeWav: async () => {},
      processSignals: { on() {}, removeListener() {}, exit() {} },
    },
  });
  t.after(async () => rm(path.dirname(result.statePath), { recursive: true, force: true }));

  // On disk: read the state file directly (not the in-memory result), to
  // prove the first entry's success WAS persisted before the second failed.
  const onDisk = await readStateFile(result.statePath);
  const uploaded = onDisk.entries.filter((entry) => entry.status === 'uploaded');
  const failed = onDisk.entries.filter((entry) => entry.status === 'failed');
  assert.equal(uploaded.length, 1, 'first entry should be persisted as uploaded');
  assert.equal(failed.length, 1, 'second entry should be persisted as failed');
});
