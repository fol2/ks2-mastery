import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EXIT_OK,
  EXIT_TRANSPORT,
  EXIT_USAGE,
  EXIT_VALIDATION,
  computeWordBankPromptToken,
  computeWordContentKey,
  expectedWordR2Key,
  lookupSeedWord,
  parseArgs,
  runCli,
  runSpellingAudioSmoke,
} from '../scripts/spelling-audio-production-smoke.mjs';
import { sha256 } from '../worker/src/auth.js';
import { SPELLING_AUDIO_MODEL, buildWordAudioAssetKey } from '../shared/spelling-audio.js';
import { SEEDED_SPELLING_PUBLISHED_SNAPSHOT } from '../src/subjects/spelling/data/content-data.js';

// Mirrors the seam used by tests/spelling-dense-history-smoke.test.js: a
// fake Response object that exposes the same headers / arrayBuffer / text
// shape as a real `fetch` response. `bytes` is optional and defaults to a
// deterministic per-payload buffer so the cross-account body-byte assertion
// can be exercised without the test having to track raw bytes.
function jsonResponse(payload, init = {}) {
  const status = Number(init.status) || 200;
  const headers = Object.fromEntries(
    Object.entries({
      'content-type': 'application/json',
      ...(init.headers || {}),
    }).map(([key, value]) => [key.toLowerCase(), value]),
  );
  const bytes = init.bytes instanceof Uint8Array
    ? init.bytes
    : new TextEncoder().encode(JSON.stringify(payload));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return headers[String(name).toLowerCase()] || null;
      },
      getSetCookie() {
        const value = headers['set-cookie'];
        if (Array.isArray(value)) return value;
        return value ? [value] : [];
      },
    },
    async text() {
      return JSON.stringify(payload);
    },
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

// `installDemoBootstrapHandlers` covers the demo-session + bootstrap +
// /api/tts paths. The /api/tts handler is parameterisable so individual
// tests can dictate per-probe cache headers and body bytes.
function installDemoBootstrapHandlers({
  ttsHandler,
  bootstrapStatus = 200,
  demoStatus = 201,
  demoSessions,
} = {}) {
  const calls = [];
  const previousFetch = globalThis.fetch;
  // Multiple demo sessions for the cross-account probe — popped per-call so
  // the two demo creations get learners A and B respectively.
  const demoSessionQueue = (demoSessions || [
    { accountId: 'account-a', learnerId: 'learner-a', cookie: 'ks2_session=demoA' },
    { accountId: 'account-b', learnerId: 'learner-b', cookie: 'ks2_session=demoB' },
    { accountId: 'account-a', learnerId: 'learner-a', cookie: 'ks2_session=demoA' },
  ]).slice();

  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const pathname = new URL(String(url)).pathname;

    if (pathname === '/api/demo/session') {
      if (demoStatus >= 400) {
        return jsonResponse({ ok: false, error: 'demo-broken' }, { status: demoStatus });
      }
      const next = demoSessionQueue.shift() || demoSessionQueue.at(-1) || {
        accountId: 'account-a',
        learnerId: 'learner-a',
        cookie: 'ks2_session=demoA',
      };
      return jsonResponse({
        ok: true,
        session: { demo: true, accountId: next.accountId, learnerId: next.learnerId },
      }, {
        status: demoStatus,
        headers: { 'set-cookie': [`${next.cookie}; Path=/; HttpOnly`] },
      });
    }
    if (pathname === '/api/bootstrap') {
      if (bootstrapStatus >= 400) {
        return jsonResponse({ ok: false, error: 'bootstrap-broken' }, { status: bootstrapStatus });
      }
      const cookieHeader = String(init.headers?.cookie || '');
      // Match the cookie back to the queued demo session so the cross-
      // account probe sees stable learner ids per cookie.
      const learnerId = cookieHeader.includes('demoB') ? 'learner-b' : 'learner-a';
      const accountId = learnerId === 'learner-b' ? 'account-b' : 'account-a';
      return jsonResponse({
        ok: true,
        session: { demo: true, accountId },
        learners: {
          selectedId: learnerId,
          byId: { [learnerId]: { stateRevision: 1 } },
        },
      });
    }
    if (pathname === '/api/tts' && typeof ttsHandler === 'function') {
      const body = JSON.parse(init.body || '{}');
      return ttsHandler(body, init, calls);
    }
    return jsonResponse({ ok: false, error: 'unexpected' }, { status: 500 });
  };

  return {
    calls,
    restore() {
      globalThis.fetch = previousFetch;
    },
  };
}

function silenceLogs() {
  const previousLog = console.log;
  const previousError = console.error;
  console.log = () => {};
  console.error = () => {};
  return () => {
    console.log = previousLog;
    console.error = previousError;
  };
}

// --- argv parser ---------------------------------------------------------

test('parseArgs returns defaults when no flags supplied', () => {
  const options = parseArgs([]);
  assert.deepEqual(options.wordSample, ['accident', 'accidentally', 'knowledge', 'thought']);
  assert.deepEqual(options.sentenceSample, ['accident', 'knowledge']);
  assert.equal(options.requireWordHit, false);
  assert.equal(options.requireLegacyHit, false);
  assert.equal(options.json, false);
  assert.equal(options.help, false);
});

test('parseArgs accepts CSV samples and require flags', () => {
  const options = parseArgs([
    '--origin', 'https://preview.example.test',
    '--word-sample', 'foo,bar,baz',
    '--sentence-sample', 'qux',
    '--require-word-hit',
    '--require-legacy-hit',
    '--json',
  ]);
  assert.equal(options.origin, 'https://preview.example.test');
  assert.deepEqual(options.wordSample, ['foo', 'bar', 'baz']);
  assert.deepEqual(options.sentenceSample, ['qux']);
  assert.equal(options.requireWordHit, true);
  assert.equal(options.requireLegacyHit, true);
  assert.equal(options.json, true);
});

test('parseArgs rejects unknown flags', () => {
  assert.throws(() => parseArgs(['--weird']), /Unknown option: --weird/);
});

test('parseArgs rejects duplicate origin flags', () => {
  assert.throws(
    () => parseArgs(['--origin', 'https://a.test', '--origin', 'https://b.test']),
    /--origin specified more than once/,
  );
});

test('parseArgs --help returns help flag', () => {
  const options = parseArgs(['--help']);
  assert.equal(options.help, true);
});

// --- Integration: byte-equality with Worker -----------------------------

test('computeWordBankPromptToken byte-matches a direct sha256 with the canonical Worker salt', async () => {
  const learnerId = 'learner-a';
  const slug = 'accident';
  const word = 'accident';
  const sentence = '';
  const expected = await sha256(['spelling-word-bank-prompt-v1', learnerId, slug, word, sentence].join('|'));
  const actual = await computeWordBankPromptToken({ learnerId, slug, word, sentence });
  assert.equal(actual, expected);
});

test('expectedWordR2Key byte-matches a direct buildWordAudioAssetKey call', async () => {
  const slug = 'accident';
  const word = 'accident';
  const voice = 'Iapetus';
  const contentKey = await computeWordContentKey(slug, word);
  const expected = buildWordAudioAssetKey({
    model: SPELLING_AUDIO_MODEL,
    voice,
    contentKey,
    slug,
    extension: 'mp3',
  });
  const actual = await expectedWordR2Key({ slug, word, voice });
  assert.equal(actual, expected);
});

// FIX 3 (review 2026-04-26): the previous byte-equality assertion was
// self-referential — both sides called the same `sha256` on the same
// joined string. Pin a hand-computed base64url digest to a hard-coded
// constant so a regression in the salt prefix or argument order would
// break this test even if `sha256`/`computeWordBankPromptToken` are both
// changed in lockstep.
const PINNED_WORD_BANK_TOKEN_LEARNER_A_ACCIDENT = 'vCuCsAZITLWJ5G17uLwjKRIbcIbrgQArXcrfwCf1KGY';

test('computeWordBankPromptToken matches a hand-pinned base64url constant for fixture (learner-a, accident, full sentence)', async () => {
  // Pre-computed once via:
  //   sha256('spelling-word-bank-prompt-v1|learner-a|accident|accident|We saw an accident on the road.')
  // — see Plan U1 demand for a hand-computed pinned digest.
  const token = await computeWordBankPromptToken({
    learnerId: 'learner-a',
    slug: 'accident',
    word: 'accident',
    sentence: 'We saw an accident on the road.',
  });
  // Shape: base64url alphabet, no padding.
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.ok(!token.includes('='), 'pinned digest must be base64url with no `=` padding');
  // Exact pinned value.
  assert.equal(token, PINNED_WORD_BANK_TOKEN_LEARNER_A_ACCIDENT);
});

// BLOCKER 1 fix (review 2026-04-26): the smoke MUST send the canonical
// snapshot sentence so the Worker's expected token (which it computes
// from `cleanText(snapshot.wordBySlug[slug].sentence)` per
// `worker/src/subjects/spelling/audio.js:87-107`) matches. This test
// asserts the smoke's `computeWordBankPromptToken` produces a digest
// byte-identical to a direct `sha256` call against the same salt formula
// as the Worker, given the exact `(learnerId, slug, word, sentence)`
// tuple read from the published snapshot.
test('computeWordBankPromptToken byte-matches Worker-side salt formula when sentence comes from SEEDED_SPELLING_PUBLISHED_SNAPSHOT', async () => {
  const learnerId = 'learner-a';
  const slug = 'accident';
  const seed = lookupSeedWord(slug);
  assert.ok(seed, 'fixture slug must exist in published snapshot');
  // Direct sha256 call mirrors `wordBankPromptToken(parts)` in
  // `worker/src/subjects/spelling/audio.js`.
  const workerEquivalentToken = await sha256([
    'spelling-word-bank-prompt-v1',
    learnerId,
    seed.slug,
    seed.word,
    seed.sentence,
  ].join('|'));
  const smokeToken = await computeWordBankPromptToken({
    learnerId,
    slug,
    word: seed.word,
    sentence: seed.sentence,
  });
  assert.equal(smokeToken, workerEquivalentToken);
});

test('lookupSeedWord exposes the canonical (word, sentence) pair the Worker uses for the published snapshot', () => {
  const accident = lookupSeedWord('accident');
  assert.equal(accident.slug, 'accident');
  assert.equal(accident.word, 'accident');
  assert.equal(accident.sentence, 'We saw an accident on the road.');
  // Mismatch with the canonical snapshot would silently break the smoke
  // — assert all 4 default sample slugs round-trip.
  for (const slug of ['accident', 'accidentally', 'knowledge', 'thought']) {
    const seed = lookupSeedWord(slug);
    assert.ok(seed, `${slug} must exist in published snapshot`);
    assert.equal(seed.slug, slug);
    assert.ok(seed.word.length > 0, `${slug} must have a word`);
    assert.ok(seed.sentence.length > 0, `${slug} must have a sentence`);
    // Sentence stripped via the same `cleanText` rule as the Worker.
    assert.equal(seed.sentence, String(SEEDED_SPELLING_PUBLISHED_SNAPSHOT.wordBySlug[slug].sentence || '').replace(/\s+/g, ' ').trim());
  }
});

test('lookupSeedWord returns null for unknown slug', () => {
  assert.equal(lookupSeedWord('definitely-not-a-real-spelling-word'), null);
});

// BLOCKER 2 fix (review 2026-04-26): the previous `postTtsRequest` skipped
// `--timeout-ms` entirely. Plumb a fetch spy into the smoke runner and
// assert the resulting `init.signal` is an AbortSignal so a hung Worker
// or upstream Gemini stall cannot wedge the smoke run indefinitely.
test('runSpellingAudioSmoke passes an AbortSignal to /api/tts fetch (timeout plumbing)', async () => {
  const fixture = installDemoBootstrapHandlers({ ttsHandler: buildPrimaryHitHandler() });
  try {
    await runSpellingAudioSmoke({
      origin: 'https://preview.example.test',
      wordSample: ['accident'],
      sentenceSample: [],
      requireWordHit: true,
      timeoutMs: 5000,
    });
    const ttsCalls = fixture.calls.filter((entry) => new URL(entry.url).pathname === '/api/tts');
    assert.ok(ttsCalls.length > 0, 'expected at least one /api/tts call');
    for (const entry of ttsCalls) {
      const signal = entry.init?.signal;
      assert.ok(signal, '/api/tts fetch init must include an AbortSignal');
      // AbortSignal duck-typing — `aborted` boolean + addEventListener.
      assert.equal(typeof signal.aborted, 'boolean');
      assert.equal(typeof signal.addEventListener, 'function');
    }
  } finally {
    fixture.restore();
  }
});

// FIX 5 (review 2026-04-26): a probe failure must NOT short-circuit the
// rest of the run. Sentence + cross-account probes still execute even
// when the first word probe fails its --require-word-hit check. The
// resulting report has `ok: false` with the failed word probe recorded
// alongside successful sentence + cross-account probes.
test('runSpellingAudioSmoke continues running probes after the first word probe fails', async () => {
  const fixture = installDemoBootstrapHandlers({
    ttsHandler: (body) => {
      // Word probes always miss; sentence + cross-account probes still
      // hit primary so the test can assert they ran.
      if (body.wordOnly === true && body.cacheLookupOnly === true) {
        return jsonResponse({ ok: true }, {
          status: 200,
          headers: { 'x-ks2-tts-cache': 'miss' },
        });
      }
      return buildPrimaryHitHandler()(body);
    },
  });
  try {
    const report = await runSpellingAudioSmoke({
      origin: 'https://preview.example.test',
      wordSample: ['accident'],
      sentenceSample: ['accident'],
      requireWordHit: true,
    });
    assert.equal(report.ok, false);
    // Must contain ALL 3 probe kinds, not just the failing one.
    const kinds = new Set(report.probes.map((probe) => probe.kind));
    assert.ok(kinds.has('word'));
    assert.ok(kinds.has('sentence'));
    assert.ok(kinds.has('cross-account'));
    // Word probe failed (ok: false + tagged validation), but sentence +
    // cross-account probes succeeded (ok !== false).
    const wordProbe = report.probes.find((entry) => entry.kind === 'word');
    assert.equal(wordProbe.ok, false);
    assert.equal(wordProbe.error.kind, 'validation');
    const sentenceProbe = report.probes.find((entry) => entry.kind === 'sentence');
    assert.notEqual(sentenceProbe.ok, false);
    const crossAccount = report.probes.find((entry) => entry.kind === 'cross-account');
    assert.notEqual(crossAccount.ok, false);
  } finally {
    fixture.restore();
  }
});

test('runCli maps a partial-failure transport probe to EXIT_TRANSPORT (validation absent)', async () => {
  const fixture = installDemoBootstrapHandlers({
    ttsHandler: () => jsonResponse({ ok: false, error: 'degraded' }, { status: 503 }),
  });
  const restoreLogs = silenceLogs();
  try {
    const code = await runCli([
      '--origin', 'https://preview.example.test',
      '--word-sample', 'accident',
      '--sentence-sample', 'accident',
    ]);
    assert.equal(code, EXIT_TRANSPORT);
  } finally {
    restoreLogs();
    fixture.restore();
  }
});

// --- Helpers for /api/tts handlers --------------------------------------

function buildPrimaryHitHandler({ voice = 'Iapetus' } = {}) {
  return (body) => {
    if (body.wordOnly === true) {
      return jsonResponse({ ok: true }, {
        status: 200,
        headers: {
          'x-ks2-tts-cache': 'hit',
          'x-ks2-tts-cache-source': 'primary',
          'x-ks2-tts-model': SPELLING_AUDIO_MODEL,
          'x-ks2-tts-voice': body.bufferedGeminiVoice || voice,
        },
        bytes: new TextEncoder().encode(`audio-bytes-for-${body.slug}-${body.bufferedGeminiVoice || voice}`),
      });
    }
    return jsonResponse({ ok: true }, {
      status: 200,
      headers: {
        'x-ks2-tts-cache': 'hit',
        'x-ks2-tts-cache-source': 'legacy',
      },
    });
  };
}

// --- Happy path ---------------------------------------------------------

test('runSpellingAudioSmoke happy path reports all probes succeeded', async () => {
  const fixture = installDemoBootstrapHandlers({ ttsHandler: buildPrimaryHitHandler() });
  try {
    const report = await runSpellingAudioSmoke({
      origin: 'https://preview.example.test',
      wordSample: ['accident', 'thought'],
      sentenceSample: ['accident'],
      requireWordHit: true,
      requireLegacyHit: true,
    });
    assert.equal(report.ok, true);
    // 2 words × 2 voices + 1 sentence + 1 cross-account probe = 6 entries.
    assert.equal(report.probes.length, 6);
    const wordProbes = report.probes.filter((probe) => probe.kind === 'word');
    assert.equal(wordProbes.length, 4);
    assert.equal(wordProbes.every((probe) => probe.cache === 'hit' && probe.source === 'primary'), true);
    const sentenceProbe = report.probes.find((probe) => probe.kind === 'sentence');
    assert.equal(sentenceProbe.cache, 'hit');
    assert.equal(sentenceProbe.source, 'legacy');
    const crossAccount = report.probes.find((probe) => probe.kind === 'cross-account');
    assert.ok(crossAccount, 'expected a cross-account probe');
    assert.notEqual(crossAccount.tokenA, crossAccount.tokenB);
    assert.equal(crossAccount.expectedR2Key, await expectedWordR2Key({
      slug: crossAccount.fixtureWord,
      word: crossAccount.fixtureWord,
      voice: crossAccount.voice,
    }));
  } finally {
    fixture.restore();
  }
});

// --- Edge: word miss without --require-word-hit -------------------------

test('runSpellingAudioSmoke reports WARN on word miss without --require-word-hit', async () => {
  // The sample MUST exist in SEEDED_SPELLING_PUBLISHED_SNAPSHOT.wordBySlug
  // so the smoke can derive the canonical sentence (Worker-parity); we
  // pick `actual` since it is a stable slug distinct from the cross-
  // account fixture word `accident`.
  const fixture = installDemoBootstrapHandlers({
    ttsHandler: (body) => {
      if (body.wordOnly === true && body.slug === 'actual') {
        return jsonResponse({ ok: true }, {
          status: 200,
          headers: { 'x-ks2-tts-cache': 'miss' },
        });
      }
      return buildPrimaryHitHandler()(body);
    },
  });
  try {
    const report = await runSpellingAudioSmoke({
      origin: 'https://preview.example.test',
      wordSample: ['actual'],
      sentenceSample: ['accident'],
      requireWordHit: false,
      requireLegacyHit: false,
    });
    assert.equal(report.ok, true);
    const wordProbes = report.probes.filter((probe) => probe.kind === 'word');
    assert.ok(wordProbes.every((probe) => probe.cache === 'miss'));
    assert.ok(wordProbes.every((probe) => probe.notes.some((note) => note.startsWith('WARN'))));
  } finally {
    fixture.restore();
  }
});

test('runSpellingAudioSmoke records validation probe entry when word probe misses with --require-word-hit', async () => {
  // After the partial-failure fix, errors no longer short-circuit the run
  // — they are recorded as `{ ok: false, error: { kind, message } }` so
  // operators see the full pass/fail matrix.
  const fixture = installDemoBootstrapHandlers({
    ttsHandler: (body) => {
      if (body.wordOnly === true) {
        return jsonResponse({ ok: true }, {
          status: 200,
          headers: { 'x-ks2-tts-cache': 'miss' },
        });
      }
      return buildPrimaryHitHandler()(body);
    },
  });
  try {
    const report = await runSpellingAudioSmoke({
      origin: 'https://preview.example.test',
      wordSample: ['accident'],
      sentenceSample: ['accident'],
      requireWordHit: true,
    });
    assert.equal(report.ok, false);
    const wordProbe = report.probes.find((entry) => entry.kind === 'word');
    assert.ok(wordProbe);
    assert.equal(wordProbe.ok, false);
    assert.equal(wordProbe.error.kind, 'validation');
    assert.match(wordProbe.error.message, /--require-word-hit/);
  } finally {
    fixture.restore();
  }
});

// --- Edge: legacy → primary surfaces INFO -------------------------------

test('runSpellingAudioSmoke reports INFO when sentence cache-source is primary (legacy fallback no longer required)', async () => {
  const fixture = installDemoBootstrapHandlers({
    ttsHandler: (body) => {
      if (body.wordOnly === true) {
        return buildPrimaryHitHandler()(body);
      }
      return jsonResponse({ ok: true }, {
        status: 200,
        headers: { 'x-ks2-tts-cache': 'hit', 'x-ks2-tts-cache-source': 'primary' },
      });
    },
  });
  try {
    const report = await runSpellingAudioSmoke({
      origin: 'https://preview.example.test',
      wordSample: ['accident'],
      sentenceSample: ['accident'],
      requireWordHit: false,
      requireLegacyHit: false,
    });
    assert.equal(report.ok, true);
    const sentenceProbe = report.probes.find((probe) => probe.kind === 'sentence');
    assert.equal(sentenceProbe.cache, 'hit');
    assert.equal(sentenceProbe.source, 'primary');
    assert.ok(sentenceProbe.notes.some((note) => /legacy fallback no longer required/i.test(note)));
  } finally {
    fixture.restore();
  }
});

// --- Edge: cross-account invariant --------------------------------------

test('runSpellingAudioSmoke cross-account probe asserts byte-identical bodies + distinct word distinct bytes', async () => {
  // Three consecutive demo sessions — first for the main flow, then two
  // for the cross-account probe. We seed the queue explicitly so the
  // learner ids are distinct for the cross-account assertion.
  const fixture = installDemoBootstrapHandlers({
    demoSessions: [
      { accountId: 'account-a', learnerId: 'learner-a', cookie: 'ks2_session=demoA' },
      { accountId: 'account-b', learnerId: 'learner-b', cookie: 'ks2_session=demoB' },
      { accountId: 'account-a', learnerId: 'learner-a', cookie: 'ks2_session=demoA' },
    ],
    ttsHandler: (body) => {
      // Same bytes for the cross-account fixture word; distinct bytes for
      // a different word so the third probe's body comparison fails the
      // collapse-to-wrong-key check (i.e., succeeds the assertion).
      const audioBytes = new TextEncoder().encode(`audio-bytes-for-${body.slug}`);
      return jsonResponse({ ok: true }, {
        status: 200,
        headers: {
          'x-ks2-tts-cache': 'hit',
          'x-ks2-tts-cache-source': 'primary',
          'x-ks2-tts-model': SPELLING_AUDIO_MODEL,
          'x-ks2-tts-voice': body.bufferedGeminiVoice || 'Iapetus',
        },
        bytes: audioBytes,
      });
    },
  });
  try {
    const report = await runSpellingAudioSmoke({
      origin: 'https://preview.example.test',
      wordSample: ['accident'],
      sentenceSample: [],
      requireWordHit: true,
    });
    const probe = report.probes.find((entry) => entry.kind === 'cross-account');
    assert.ok(probe);
    assert.notEqual(probe.tokenA, probe.tokenB);
    assert.equal(probe.bytesAlength, probe.bytesBLength);
    assert.notEqual(probe.bytesDistinctLength, 0);
  } finally {
    fixture.restore();
  }
});

test('runSpellingAudioSmoke cross-account probe records validation probe entry when fixture-word bodies diverge', async () => {
  const fixture = installDemoBootstrapHandlers({
    demoSessions: [
      { accountId: 'account-a', learnerId: 'learner-a', cookie: 'ks2_session=demoA' },
      { accountId: 'account-b', learnerId: 'learner-b', cookie: 'ks2_session=demoB' },
      { accountId: 'account-a', learnerId: 'learner-a', cookie: 'ks2_session=demoA' },
    ],
    ttsHandler: (body, init) => {
      // For the cross-account fixture word, return DIFFERENT bytes per
      // learner — simulates an R2 key resolution bug where per-learner
      // tokens accidentally route to different objects.
      const cookie = String(init.headers?.cookie || '');
      const audioBytes = new TextEncoder().encode(`audio-${body.slug}-${cookie.includes('demoB') ? 'B' : 'A'}`);
      return jsonResponse({ ok: true }, {
        status: 200,
        headers: {
          'x-ks2-tts-cache': 'hit',
          'x-ks2-tts-cache-source': 'primary',
          'x-ks2-tts-model': SPELLING_AUDIO_MODEL,
          'x-ks2-tts-voice': body.bufferedGeminiVoice || 'Iapetus',
        },
        bytes: audioBytes,
      });
    },
  });
  try {
    const report = await runSpellingAudioSmoke({
      origin: 'https://preview.example.test',
      wordSample: [],
      sentenceSample: [],
    });
    assert.equal(report.ok, false);
    const probe = report.probes.find((entry) => entry.kind === 'cross-account');
    assert.ok(probe);
    assert.equal(probe.ok, false);
    assert.equal(probe.error.kind, 'validation');
    assert.match(probe.error.message, /response bodies diverged/);
  } finally {
    fixture.restore();
  }
});

test('runSpellingAudioSmoke cross-account probe records validation probe entry when distinct-word body collapses', async () => {
  const fixture = installDemoBootstrapHandlers({
    demoSessions: [
      { accountId: 'account-a', learnerId: 'learner-a', cookie: 'ks2_session=demoA' },
      { accountId: 'account-b', learnerId: 'learner-b', cookie: 'ks2_session=demoB' },
      { accountId: 'account-a', learnerId: 'learner-a', cookie: 'ks2_session=demoA' },
    ],
    ttsHandler: () => {
      // Same bytes for ALL words — simulates a key-resolution collapse.
      const audioBytes = new TextEncoder().encode('always-same-bytes');
      return jsonResponse({ ok: true }, {
        status: 200,
        headers: {
          'x-ks2-tts-cache': 'hit',
          'x-ks2-tts-cache-source': 'primary',
          'x-ks2-tts-model': SPELLING_AUDIO_MODEL,
          'x-ks2-tts-voice': 'Iapetus',
        },
        bytes: audioBytes,
      });
    },
  });
  try {
    const report = await runSpellingAudioSmoke({
      origin: 'https://preview.example.test',
      wordSample: [],
      sentenceSample: [],
    });
    assert.equal(report.ok, false);
    const probe = report.probes.find((entry) => entry.kind === 'cross-account');
    assert.ok(probe);
    assert.equal(probe.ok, false);
    assert.equal(probe.error.kind, 'validation');
    assert.match(probe.error.message, /produced byte-identical body/);
  } finally {
    fixture.restore();
  }
});

// --- Error: 5xx → EXIT_TRANSPORT ----------------------------------------

test('runCli returns EXIT_TRANSPORT when /api/tts replies with HTTP 503', async () => {
  const fixture = installDemoBootstrapHandlers({
    ttsHandler: () => jsonResponse({ ok: false, error: 'degraded' }, { status: 503 }),
  });
  const restoreLogs = silenceLogs();
  try {
    const code = await runCli([
      '--origin', 'https://preview.example.test',
      '--word-sample', 'accident',
      '--sentence-sample', 'accident',
    ]);
    assert.equal(code, EXIT_TRANSPORT);
  } finally {
    restoreLogs();
    fixture.restore();
  }
});

// --- Error: missing demo credentials → EXIT_USAGE -----------------------

test('runCli returns EXIT_USAGE when demo session creation replies with HTTP 401', async () => {
  const fixture = installDemoBootstrapHandlers({
    demoStatus: 401,
    ttsHandler: () => jsonResponse({ ok: true }, { status: 200 }),
  });
  const restoreLogs = silenceLogs();
  try {
    const code = await runCli([
      '--origin', 'https://preview.example.test',
      '--word-sample', 'accident',
    ]);
    assert.equal(code, EXIT_USAGE);
  } finally {
    restoreLogs();
    fixture.restore();
  }
});

// --- Error: missing x-ks2-tts-cache-source header (PR 252 regression) --

test('runCli returns EXIT_VALIDATION when response is a cache hit but cache-source header is missing', async () => {
  const fixture = installDemoBootstrapHandlers({
    ttsHandler: (body) => {
      if (body.wordOnly === true) {
        return jsonResponse({ ok: true }, {
          status: 200,
          headers: {
            'x-ks2-tts-cache': 'hit',
            // Deliberately omit x-ks2-tts-cache-source.
            'x-ks2-tts-model': SPELLING_AUDIO_MODEL,
            'x-ks2-tts-voice': 'Iapetus',
          },
        });
      }
      return buildPrimaryHitHandler()(body);
    },
  });
  const restoreLogs = silenceLogs();
  try {
    const code = await runCli([
      '--origin', 'https://preview.example.test',
      '--word-sample', 'accident',
      '--require-word-hit',
    ]);
    assert.equal(code, EXIT_VALIDATION);
  } finally {
    restoreLogs();
    fixture.restore();
  }
});

// --- runCli happy path → EXIT_OK ----------------------------------------

test('runCli happy path returns EXIT_OK and emits JSON when --json supplied', async () => {
  const fixture = installDemoBootstrapHandlers({ ttsHandler: buildPrimaryHitHandler() });
  const previousLog = console.log;
  const logged = [];
  console.log = (...args) => logged.push(args.map(String).join(' '));
  try {
    const code = await runCli([
      '--origin', 'https://preview.example.test',
      '--word-sample', 'accident',
      '--sentence-sample', 'accident',
      '--require-word-hit',
      '--require-legacy-hit',
      '--json',
    ]);
    assert.equal(code, EXIT_OK);
    const payload = JSON.parse(logged.join('\n'));
    assert.equal(payload.ok, true);
    assert.equal(payload.origin, 'https://preview.example.test');
    assert.ok(Array.isArray(payload.probes));
    assert.ok(payload.probes.length > 0);
  } finally {
    console.log = previousLog;
    fixture.restore();
  }
});

// --- runCli unknown flag → EXIT_USAGE -----------------------------------

test('runCli returns EXIT_USAGE on unknown flag without calling fetch', async () => {
  const previousFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return jsonResponse({ ok: false }, { status: 500 });
  };
  const restoreLogs = silenceLogs();
  try {
    const code = await runCli(['--totally-unknown']);
    assert.equal(code, EXIT_USAGE);
    assert.equal(fetchCalled, false);
  } finally {
    restoreLogs();
    globalThis.fetch = previousFetch;
  }
});

// --- runCli --help → EXIT_OK --------------------------------------------

test('runCli --help exits EXIT_OK and prints the help banner', async () => {
  const previousLog = console.log;
  const logged = [];
  console.log = (...args) => logged.push(args.map(String).join(' '));
  try {
    const code = await runCli(['--help']);
    assert.equal(code, EXIT_OK);
    assert.ok(logged.some((line) => line.includes('Usage: node ./scripts/spelling-audio-production-smoke.mjs')));
  } finally {
    console.log = previousLog;
  }
});
