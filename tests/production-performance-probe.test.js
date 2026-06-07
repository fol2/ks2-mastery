import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyTtsTimingSample,
  parseServerTiming,
  parseArgs,
  runPerformanceProbe,
  summariseMetric,
} from '../scripts/production-performance-probe.mjs';

function headerFrom(init, name) {
  const headers = init?.headers;
  if (typeof headers?.get === 'function') return headers.get(name) || '';
  return headers?.[name] || headers?.[name.toLowerCase()] || '';
}

function response(body, init = {}) {
  const status = Number(init.status) || 200;
  const headers = Object.fromEntries(Object.entries({
    'content-type': 'text/plain',
    ...(init.headers || {}),
  }).map(([key, value]) => [key.toLowerCase(), value]));
  const bytes = body instanceof Uint8Array
    ? body
    : new TextEncoder().encode(String(body ?? ''));
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
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
    async text() {
      return new TextDecoder().decode(bytes);
    },
  };
}

function jsonResponse(payload, init = {}) {
  return response(JSON.stringify(payload), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

test('parseArgs rejects duplicate sample flags that would hide probe shape', () => {
  assert.throws(
    () => parseArgs(['--samples', '1', '--samples', '2']),
    /--samples specified more than once/,
  );
});

test('parseArgs supports low-impact focused probe shape', () => {
  const options = parseArgs([
    '--url', 'ks2.eugnel.uk',
    '--asset-samples', '1',
    '--bootstrap-samples', '2',
    '--tts-samples', '3',
    '--warmup', '0',
    '--word-sample', 'accident',
    '--voices', 'Iapetus',
    '--no-assets',
    '--browser-tts',
  ]);
  assert.equal(options.origin, 'https://ks2.eugnel.uk');
  assert.equal(options.assetSamples, 1);
  assert.equal(options.bootstrapSamples, 2);
  assert.equal(options.ttsSamples, 3);
  assert.equal(options.warmup, 0);
  assert.deepEqual(options.wordSample, ['accident']);
  assert.deepEqual(options.voices, ['Iapetus']);
  assert.equal(options.includeAssets, false);
  assert.equal(options.includeBrowserTts, true);
});

test('summariseMetric reports stable p50 and p95 values', () => {
  assert.deepEqual(summariseMetric([
    { totalMs: 10 },
    { totalMs: 20 },
    { totalMs: 30 },
    { totalMs: 40 },
  ], 'totalMs'), {
    count: 4,
    min: 10,
    p50: 20,
    p95: 40,
    max: 40,
    mean: 25,
  });
});

test('parseServerTiming extracts bounded TTS phase timings only', () => {
  assert.deepEqual(
    parseServerTiming('cf;dur=3, ks2_tts_prompt;dur=12.4, ks2_tts_r2;dur="7", ks2_tts_total;dur=24, bad;dur=x'),
    {
      prompt: 12,
      r2: 7,
      total: 24,
    },
  );
});

test('classifyTtsTimingSample separates R2 and platform overhead cases', () => {
  assert.equal(classifyTtsTimingSample({
    headerMs: 120,
    serverTimingPhases: { r2: 80, prompt: 10, lookup_limit: 5, total: 100 },
  }), 'r2-dominated');
  assert.equal(classifyTtsTimingSample({
    headerMs: 1500,
    serverTimingPhases: { r2: 10, prompt: 20, lookup_limit: 10, total: 100 },
  }), 'client-network-or-platform-overhead');
  assert.equal(classifyTtsTimingSample({ headerMs: 120, serverTimingPhases: {} }), 'unclassified-insufficient-timing');
});

test('runPerformanceProbe captures asset, bootstrap, and TTS timings with request ids', async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const pathname = new URL(String(url)).pathname;
    const echoedRequestId = headerFrom(init, 'x-ks2-request-id');
    if (pathname === '/') {
      return response('<!doctype html><script type="module" src="/src/bundles/app.bundle.js"></script>', {
        headers: {
          'content-type': 'text/html',
          'cache-control': 'no-store',
          'x-ks2-request-id': echoedRequestId,
        },
      });
    }
    if (pathname === '/src/bundles/app.bundle.js') {
      return response('console.log("ok");', {
        headers: {
          'content-type': 'application/javascript',
          'cache-control': 'public, max-age=31536000, immutable',
          'cf-cache-status': 'HIT',
          'x-ks2-request-id': echoedRequestId,
        },
      });
    }
    if (pathname === '/api/demo/session') {
      return jsonResponse({
        ok: true,
        session: { demo: true, accountId: 'account-a', learnerId: 'learner-a' },
      }, {
        status: 201,
        headers: {
          'set-cookie': 'ks2_session=demo; Path=/; HttpOnly',
          'x-ks2-request-id': echoedRequestId,
        },
      });
    }
    if (pathname === '/api/bootstrap') {
      return jsonResponse({
        ok: true,
        learners: {
          selectedId: 'learner-a',
          byId: { 'learner-a': { stateRevision: 0 } },
        },
        meta: {
          capacity: {
            requestId: echoedRequestId,
            queryCount: 9,
            d1DurationMs: 12,
            d1RowsRead: 3,
            d1RowsWritten: 0,
            wallMs: 30,
            responseBytes: 2048,
          },
        },
      }, {
        headers: { 'x-ks2-request-id': echoedRequestId },
      });
    }
    if (pathname === '/api/tts') {
      const body = JSON.parse(init.body || '{}');
      assert.equal(body.cacheLookupOnly, true);
      assert.equal(body.slug, 'accident');
      assert.equal(body.learnerId, 'learner-a');
      assert.equal(headerFrom(init, 'cookie'), 'ks2_session=demo');
      if (body.wordOnly === true) {
        assert.equal(body.scope, 'word-bank');
        return response('', {
          status: 204,
          headers: {
            'x-ks2-tts-cache': 'miss',
            'x-ks2-request-id': echoedRequestId,
            'server-timing': 'ks2_tts_prompt;dur=10, ks2_tts_lookup_limit;dur=8, ks2_tts_r2;dur=5, ks2_tts_total;dur=40',
          },
        });
      }
      return response(new Uint8Array([1, 2, 3, 4]), {
        headers: {
          'content-type': 'audio/mpeg',
          'x-ks2-tts-cache': 'hit',
          'x-ks2-tts-cache-source': 'primary',
          'x-ks2-request-id': echoedRequestId,
          'server-timing': 'ks2_tts_prompt;dur=10, ks2_tts_lookup_limit;dur=8, ks2_tts_r2;dur=5, ks2_tts_total;dur=40',
        },
      });
    }
    return jsonResponse({ ok: false, error: 'unexpected' }, { status: 500 });
  };

  try {
    const report = await runPerformanceProbe({
      origin: 'https://example.test',
      assetSamples: 1,
      bootstrapSamples: 1,
      ttsSamples: 1,
      warmup: 0,
      wordSample: ['accident'],
      voices: ['Iapetus'],
    });
    assert.equal(report.ok, true);
    assert.equal(report.assets.samples.length, 2);
    assert.deepEqual(report.assets.discovery.discoveredScripts, ['/src/bundles/app.bundle.js']);
    assert.match(report.assets.notes.join('\n'), /\/src\/bundles/);
    assert.equal(report.bootstrap.samples.length, 1);
    assert.equal(report.bootstrap.capacity.queryCount.p50, 9);
    assert.equal(report.tts.samples.length, 2);
    const wordLookup = report.tts.samples.find((sample) => sample.mode === 'word-lookup');
    const sentenceCache = report.tts.samples.find((sample) => sample.mode === 'sentence-cache');
    assert.equal(wordLookup.cache, 'miss');
    assert.equal(wordLookup.status, 204);
    assert.equal(sentenceCache.cache, 'hit');
    assert.equal(sentenceCache.source, 'primary');
    assert.deepEqual(sentenceCache.serverTimingPhases, {
      prompt: 10,
      lookup_limit: 8,
      r2: 5,
      total: 40,
    });
    assert.equal(report.tts.phaseSummary.r2.p50, 5);
    assert.equal(report.tts.modeSummary['word-lookup'][0].key, 'accident/Iapetus/miss/no-source');
    assert.equal(report.tts.modeSummary['sentence-cache'][0].key, 'accident/Iapetus/hit/primary');
    assert.equal(report.tts.classifications.mixed, 2);
    assert.match(sentenceCache.clientRequestId, /^ks2_req_/);
    assert.equal(report.session.learnerIdPresent, true);
    assert.equal(report.bootstrap.selectedLearnerIdPresent, true);
    assert.doesNotMatch(JSON.stringify(report), /ks2_session=demo|learner-a|account-a|promptToken/);
    assert.ok(calls.some((call) => new URL(call.url).pathname === '/api/tts'));
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('runPerformanceProbe can use an operator cookie from an environment variable', async () => {
  const previousFetch = globalThis.fetch;
  const previousCookie = process.env.KS2_PROBE_TEST_COOKIE;
  const calls = [];
  process.env.KS2_PROBE_TEST_COOKIE = 'ks2_session=real-session';
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const pathname = new URL(String(url)).pathname;
    const echoedRequestId = headerFrom(init, 'x-ks2-request-id');
    if (pathname === '/api/bootstrap') {
      assert.equal(headerFrom(init, 'cookie'), 'ks2_session=real-session');
      return jsonResponse({
        ok: true,
        learners: {
          selectedId: 'real-learner-id',
          byId: { 'real-learner-id': { stateRevision: 1 } },
        },
        meta: { capacity: { requestId: echoedRequestId, queryCount: 3, d1DurationMs: 4, d1RowsRead: 2, d1RowsWritten: 0, wallMs: 20, responseBytes: 1000 } },
      }, {
        headers: { 'x-ks2-request-id': echoedRequestId },
      });
    }
    if (pathname === '/api/tts') {
      const body = JSON.parse(init.body || '{}');
      assert.equal(body.learnerId, 'real-learner-id');
      assert.equal(headerFrom(init, 'cookie'), 'ks2_session=real-session');
      if (body.wordOnly === true) {
        return response('', {
          status: 204,
          headers: {
            'x-ks2-tts-cache': 'miss',
            'server-timing': 'ks2_tts_prompt;dur=9, ks2_tts_lookup_limit;dur=11, ks2_tts_r2;dur=6, ks2_tts_total;dur=35',
            'x-ks2-request-id': echoedRequestId,
          },
        });
      }
      return response('', {
        headers: {
          'content-type': 'audio/mpeg',
          'x-ks2-tts-cache': 'hit',
          'x-ks2-tts-cache-source': 'primary',
          'server-timing': 'ks2_tts_prompt;dur=9, ks2_tts_lookup_limit;dur=11, ks2_tts_r2;dur=6, ks2_tts_total;dur=35',
          'x-ks2-request-id': echoedRequestId,
        },
      });
    }
    return jsonResponse({ ok: false, error: 'unexpected' }, { status: 500 });
  };

  try {
    const report = await runPerformanceProbe({
      origin: 'https://example.test',
      includeAssets: false,
      bootstrapSamples: 1,
      ttsSamples: 1,
      warmup: 0,
      wordSample: ['accident'],
      voices: ['Iapetus'],
      cookieEnv: 'KS2_PROBE_TEST_COOKIE',
    });

    assert.equal(report.ok, true);
    assert.equal(report.session.source, 'operator-cookie');
    assert.equal(report.session.learnerIdPresent, true);
    assert.equal(report.tts.samples.find((sample) => sample.mode === 'word-lookup').cache, 'miss');
    assert.equal(report.tts.samples.find((sample) => sample.mode === 'sentence-cache').cache, 'hit');
    assert.doesNotMatch(JSON.stringify(report), /real-session|real-learner-id|promptToken/);
    assert.ok(calls.every((call) => new URL(call.url).pathname !== '/api/demo/session'));
  } finally {
    globalThis.fetch = previousFetch;
    if (previousCookie == null) delete process.env.KS2_PROBE_TEST_COOKIE;
    else process.env.KS2_PROBE_TEST_COOKIE = previousCookie;
  }
});

test('runPerformanceProbe records browser TTS play-start samples from an injected runner', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const pathname = new URL(String(url)).pathname;
    const echoedRequestId = headerFrom(init, 'x-ks2-request-id');
    if (pathname === '/api/demo/session') {
      return jsonResponse({
        ok: true,
        session: { demo: true, accountId: 'account-a', learnerId: 'learner-a' },
      }, {
        status: 201,
        headers: {
          'set-cookie': 'ks2_session=demo; Path=/; HttpOnly',
          'x-ks2-request-id': echoedRequestId,
        },
      });
    }
    return jsonResponse({ ok: false, error: 'unexpected' }, { status: 500 });
  };

  try {
    const report = await runPerformanceProbe({
      origin: 'https://example.test',
      includeAssets: false,
      includeBootstrap: false,
      includeTts: false,
      warmup: 0,
      wordSample: ['accident'],
      voices: ['Iapetus'],
      browserTtsRunner: async ({ origin, cookie, learnerId, options }) => {
        assert.equal(origin, 'https://example.test');
        assert.equal(cookie, 'ks2_session=demo');
        assert.equal(learnerId, 'learner-a');
        assert.deepEqual(options.wordSample, ['accident']);
        return {
          ok: true,
          skipped: false,
          samples: [{
            slug: 'accident',
            voice: 'Iapetus',
            status: 200,
            cache: 'hit',
            source: 'primary',
            contentType: 'audio/mpeg',
            requestId: 'ks2_req_browser',
            headerMs: 120,
            blobMs: 20,
            playStartMs: 175,
            totalMs: 180,
            bytes: 12345,
          }],
        };
      },
    });

    assert.equal(report.ok, true);
    assert.equal(report.config.includeBrowserTts, false);
    assert.equal(report.browserTts.ok, true);
    assert.equal(report.browserTts.skipped, false);
    assert.equal(report.browserTts.samples.length, 1);
    assert.equal(report.browserTts.playStartMs.p50, 175);
    assert.equal(report.browserTts.summary[0].key, 'accident/Iapetus/hit/primary');
    assert.equal(report.browserTts.samples[0].requestId, 'ks2_req_browser');
    assert.equal(report.session.learnerIdPresent, true);
    assert.doesNotMatch(JSON.stringify(report), /ks2_session=demo|learner-a|account-a|promptToken/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('runPerformanceProbe treats browser TTS skips as non-fatal', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const pathname = new URL(String(url)).pathname;
    const echoedRequestId = headerFrom(init, 'x-ks2-request-id');
    if (pathname === '/api/demo/session') {
      return jsonResponse({
        ok: true,
        session: { demo: true, accountId: 'account-a', learnerId: 'learner-a' },
      }, {
        status: 201,
        headers: {
          'set-cookie': 'ks2_session=demo; Path=/; HttpOnly',
          'x-ks2-request-id': echoedRequestId,
        },
      });
    }
    return jsonResponse({ ok: false, error: 'unexpected' }, { status: 500 });
  };

  try {
    const report = await runPerformanceProbe({
      origin: 'https://example.test',
      includeAssets: false,
      includeBootstrap: false,
      includeTts: false,
      includeBrowserTts: true,
      warmup: 0,
      wordSample: ['accident'],
      voices: ['Iapetus'],
      browserTtsRunner: async () => ({
        skipped: true,
        skipReason: 'playwright import failed',
        samples: [],
      }),
    });

    assert.equal(report.ok, true);
    assert.equal(report.config.includeBrowserTts, true);
    assert.equal(report.browserTts.ok, true);
    assert.equal(report.browserTts.skipped, true);
    assert.equal(report.browserTts.skipReason, 'playwright import failed');
    assert.deepEqual(report.browserTts.samples, []);
    assert.equal(report.browserTts.playStartMs.count, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
