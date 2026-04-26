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
  parseArgs,
  runCli,
  runSpellingAudioSmoke,
} from '../scripts/spelling-audio-production-smoke.mjs';
import { sha256 } from '../worker/src/auth.js';
import { SPELLING_AUDIO_MODEL, buildWordAudioAssetKey } from '../shared/spelling-audio.js';

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
  const ttsHandler = (body) => {
    if (body.wordOnly === true) {
      return jsonResponse({ ok: true }, {
        status: 200,
        headers: { 'x-ks2-tts-cache': 'miss' },
      });
    }
    return jsonResponse({ ok: true }, {
      status: 200,
      headers: { 'x-ks2-tts-cache': 'hit', 'x-ks2-tts-cache-source': 'legacy' },
    });
  };
  const primaryFixture = installDemoBootstrapHandlers({ ttsHandler: buildPrimaryHitHandler() });
  // Swap the handler after demo bootstrap responds; we want word probes to
  // miss but the cross-account probe (which shares the same handler) to
  // still hit. Simpler: install a single combined handler that misses on
  // word probes when the slug matches the sample, and hits on the cross-
  // account fixture word. To keep this test focused on the WARN path we
  // restrict the sample to a single word DISTINCT from the fixture.
  primaryFixture.restore();
  const fixture = installDemoBootstrapHandlers({
    ttsHandler: (body) => {
      if (body.wordOnly === true && body.slug === 'beginning') {
        return jsonResponse({ ok: true }, {
          status: 200,
          headers: { 'x-ks2-tts-cache': 'miss' },
        });
      }
      return ttsHandler === ttsHandler ? buildPrimaryHitHandler()(body) : ttsHandler(body);
    },
  });
  try {
    const report = await runSpellingAudioSmoke({
      origin: 'https://preview.example.test',
      wordSample: ['beginning'],
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

test('runSpellingAudioSmoke throws validation when word probe misses with --require-word-hit', async () => {
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
    await assert.rejects(
      () => runSpellingAudioSmoke({
        origin: 'https://preview.example.test',
        wordSample: ['accident'],
        sentenceSample: ['accident'],
        requireWordHit: true,
      }),
      /--require-word-hit/,
    );
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

test('runSpellingAudioSmoke cross-account probe rejects when fixture-word bodies diverge', async () => {
  const fixture = installDemoBootstrapHandlers({
    demoSessions: [
      { accountId: 'account-a', learnerId: 'learner-a', cookie: 'ks2_session=demoA' },
      { accountId: 'account-b', learnerId: 'learner-b', cookie: 'ks2_session=demoB' },
      { accountId: 'account-a', learnerId: 'learner-a', cookie: 'ks2_session=demoA' },
    ],
    ttsHandler: (body, init, calls) => {
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
    await assert.rejects(
      () => runSpellingAudioSmoke({
        origin: 'https://preview.example.test',
        wordSample: [],
        sentenceSample: [],
      }),
      /response bodies diverged/,
    );
  } finally {
    fixture.restore();
  }
});

test('runSpellingAudioSmoke cross-account probe rejects when distinct-word body collapses to fixture bytes', async () => {
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
    await assert.rejects(
      () => runSpellingAudioSmoke({
        origin: 'https://preview.example.test',
        wordSample: [],
        sentenceSample: [],
      }),
      /produced byte-identical body/,
    );
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
