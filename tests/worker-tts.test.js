import test from 'node:test';
import assert from 'node:assert/strict';

import { sha256 } from '../worker/src/auth.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

function seedAccountLearner(DB, { accountId = 'adult-a', learnerId = 'learner-a' } = {}) {
  const now = Date.UTC(2026, 0, 1);
  DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES (?, 'Learner A', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(learnerId, now, now);
  DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
    VALUES (?, ?, ?, 'parent', ?, ?, ?, 0)
  `).run(accountId, `${accountId}@example.test`, 'Adult A', learnerId, now, now);
  DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, ?, 'owner', 0, ?, ?)
  `).run(accountId, learnerId, now, now);
}

async function startSpellingPrompt(server) {
  seedAccountLearner(server.DB);
  const response = await server.fetch('https://repo.test/api/subjects/spelling/command', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      command: 'start-session',
      learnerId: 'learner-a',
      requestId: 'tts-start-1',
      expectedLearnerRevision: 0,
      payload: {
        mode: 'single',
        slug: 'early',
        length: 1,
      },
    }),
  });
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.ok(payload.audio?.promptToken);
  assert.equal(payload.subjectReadModel.session.currentCard.word, undefined);
  return payload.audio;
}

function ttsRequest(body = {}) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function cookieFrom(response) {
  const raw = response.headers.getSetCookie?.() || String(response.headers.get('set-cookie') || '')
    .split(/,\s*(?=ks2_)/)
    .filter(Boolean);
  const cookie = raw
    .map((value) => String(value || '').split(';')[0])
    .find((value) => value.startsWith('ks2_session='));
  return cookie || '';
}

async function postJsonRaw(server, path, body = {}, headers = {}) {
  return server.fetchRaw(`https://repo.test${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function startDemoSpellingPrompt(server) {
  const demo = await postJsonRaw(server, '/api/demo/session');
  const demoPayload = await demo.json();
  const cookie = cookieFrom(demo);
  const bootstrap = await server.fetchRaw('https://repo.test/api/bootstrap', {
    headers: { cookie },
  });
  const bootstrapPayload = await bootstrap.json();
  const learnerId = bootstrapPayload.learners.selectedId;
  const command = await postJsonRaw(server, '/api/subjects/spelling/command', {
    command: 'start-session',
    learnerId,
    requestId: 'demo-tts-start-1',
    expectedLearnerRevision: 0,
    payload: {
      mode: 'single',
      slug: 'early',
      length: 1,
    },
  }, {
    cookie,
    origin: 'https://repo.test',
  });
  const commandPayload = await command.json();
  assert.equal(command.status, 200, JSON.stringify(commandPayload));
  assert.ok(commandPayload.audio?.promptToken);
  const sessionRow = server.DB.db.prepare('SELECT id FROM account_sessions WHERE account_id = ?')
    .get(demoPayload.session.accountId);
  assert.ok(sessionRow?.id);
  return {
    accountId: demoPayload.session.accountId,
    learnerId,
    cookie,
    sessionId: sessionRow?.id,
    audio: commandPayload.audio,
  };
}

async function seedRateLimit(server, bucket, identifier, count) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const windowStartedAt = Math.floor(now / windowMs) * windowMs;
  server.DB.db.prepare(`
    INSERT INTO request_limits (limiter_key, window_started_at, request_count, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(limiter_key) DO UPDATE SET
      window_started_at = excluded.window_started_at,
      request_count = excluded.request_count,
      updated_at = excluded.updated_at
  `).run(`${bucket}:${await sha256(identifier)}`, windowStartedAt, count, now);
}

function geminiAudioResponse(bytes = [1, 0, 2, 0]) {
  return new Response(JSON.stringify({
    candidates: [{
      content: {
        parts: [{
          inlineData: {
            mimeType: 'audio/L16;codec=pcm;rate=24000',
            data: Buffer.from(Uint8Array.from(bytes)).toString('base64'),
          },
        }],
      },
    }],
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

test('TTS route requires an authenticated account session', async () => {
  const server = createWorkerRepositoryServer({
    env: { OPENAI_API_KEY: 'test-openai-key' },
  });
  try {
    const response = await server.fetchRaw('https://repo.test/api/tts', ttsRequest());
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.code, 'unauthenticated');
  } finally {
    server.close();
  }
});

test('TTS route proxies dictation audio through OpenAI without exposing the key', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({
      url,
      headers: init.headers,
      body: JSON.parse(init.body),
    });
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    });
  };

  const server = createWorkerRepositoryServer({
    env: { OPENAI_API_KEY: 'test-openai-key' },
  });
  try {
    const prompt = await startSpellingPrompt(server);
    const response = await server.fetch('https://repo.test/api/tts', ttsRequest({
      learnerId: prompt.learnerId,
      promptToken: prompt.promptToken,
    }));
    const bytes = new Uint8Array(await response.arrayBuffer());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'audio/mpeg');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-ks2-tts-provider'), 'openai');
    assert.deepEqual([...bytes], [1, 2, 3]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.openai.com/v1/audio/speech');
    assert.equal(calls[0].headers.authorization, 'Bearer test-openai-key');
    assert.equal(calls[0].body.model, 'gpt-4o-mini-tts');
    assert.equal(calls[0].body.voice, 'marin');
    assert.equal(calls[0].body.response_format, 'mp3');
    assert.match(calls[0].body.input, /^The word is early\. .*\bearly\b.*\. The word is early\.$/);
    assert.match(calls[0].body.instructions, /British English pronunciation/);
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
  }
});

test('TTS route proxies dictation audio through selected Gemini provider', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({
      url,
      headers: init.headers,
      body: JSON.parse(init.body),
    });
    return geminiAudioResponse();
  };

  const server = createWorkerRepositoryServer({
    env: {
      OPENAI_API_KEY: 'test-openai-key',
      GEMINI_API_KEY: 'test-gemini-key',
    },
  });
  try {
    const prompt = await startSpellingPrompt(server);
    const response = await server.fetch('https://repo.test/api/tts', ttsRequest({
      learnerId: prompt.learnerId,
      promptToken: prompt.promptToken,
      provider: 'gemini',
    }));
    const bytes = new Uint8Array(await response.arrayBuffer());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'audio/wav');
    assert.equal(response.headers.get('x-ks2-tts-provider'), 'gemini');
    assert.equal(response.headers.get('x-ks2-tts-fallback-from'), null);
    assert.equal(response.headers.get('x-ks2-tts-model'), 'gemini-3.1-flash-tts-preview');
    assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'RIFF');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent');
    assert.equal(calls[0].headers['x-goog-api-key'], 'test-gemini-key');
    assert.equal(calls[0].body.generationConfig.responseModalities[0], 'AUDIO');
    assert.equal(calls[0].body.generationConfig.speechConfig.languageCode, 'en-GB');
    assert.equal(calls[0].body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Kore');
    assert.match(calls[0].body.contents[0].parts[0].text, /The word is early/);
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
  }
});

test('TTS route does not fall back when selected OpenAI exceeds the primary timeout', async () => {
  const originalFetch = globalThis.fetch;
  let openAiAborted = false;
  globalThis.fetch = async (url, init = {}) => {
    if (url === 'https://api.openai.com/v1/audio/speech') {
      return await new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          openAiAborted = true;
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    }
    throw new Error(`Unexpected provider call: ${url}`);
  };

  const server = createWorkerRepositoryServer({
    env: {
      OPENAI_API_KEY: 'test-openai-key',
      GEMINI_API_KEY: 'test-gemini-key',
      TTS_PRIMARY_TIMEOUT_MS: '250',
    },
  });
  try {
    const prompt = await startSpellingPrompt(server);
    const response = await server.fetch('https://repo.test/api/tts', ttsRequest({
      learnerId: prompt.learnerId,
      promptToken: prompt.promptToken,
      provider: 'openai',
    }));
    const payload = await response.json();

    assert.equal(response.status, 503);
    assert.equal(payload.code, 'tts_provider_error');
    assert.equal(payload.provider, 'openai');
    assert.equal(payload.providerTimedOut, true);
    assert.equal(openAiAborted, true);
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
  }
});

test('TTS route supports word-only vocabulary audio', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({
      url,
      body: JSON.parse(init.body),
    });
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    });
  };

  const server = createWorkerRepositoryServer({
    env: { OPENAI_API_KEY: 'test-openai-key' },
  });
  try {
    const prompt = await startSpellingPrompt(server);
    const response = await server.fetch('https://repo.test/api/tts', ttsRequest({
      learnerId: prompt.learnerId,
      promptToken: prompt.promptToken,
      wordOnly: true,
    }));

    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.openai.com/v1/audio/speech');
    assert.equal(calls[0].body.input, 'early');
    assert.match(calls[0].body.instructions, /Read exactly the supplied word once/);
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
  }
});

test('TTS route supports server-tokened word bank vocabulary audio', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({
      url,
      body: JSON.parse(init.body),
    });
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    });
  };

  const server = createWorkerRepositoryServer({
    env: { OPENAI_API_KEY: 'test-openai-key' },
  });
  try {
    seedAccountLearner(server.DB);
    const detailResponse = await server.fetch('https://repo.test/api/subjects/spelling/word-bank?learnerId=learner-a&detailSlug=early');
    const detail = await detailResponse.json();
    const cue = detail.wordBank.detail.audio.word;
    const response = await server.fetch('https://repo.test/api/tts', ttsRequest({
      learnerId: cue.learnerId,
      promptToken: cue.promptToken,
      slug: cue.slug,
      wordOnly: true,
    }));

    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.openai.com/v1/audio/speech');
    assert.equal(calls[0].body.input, 'early');
    assert.match(calls[0].body.instructions, /Read exactly the supplied word once/);
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
  }
});

test('TTS route reports missing selected provider configuration clearly', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const prompt = await startSpellingPrompt(server);
    const response = await server.fetch('https://repo.test/api/tts', ttsRequest({
      learnerId: prompt.learnerId,
      promptToken: prompt.promptToken,
    }));
    const payload = await response.json();

    assert.equal(response.status, 503);
    assert.equal(payload.code, 'tts_not_configured');
    assert.equal(payload.provider, 'openai');
  } finally {
    server.close();
  }
});

test('TTS route rejects arbitrary client-supplied transcript text', async () => {
  const server = createWorkerRepositoryServer({
    env: { OPENAI_API_KEY: 'test-openai-key' },
  });
  try {
    seedAccountLearner(server.DB);
    const response = await server.fetch('https://repo.test/api/tts', ttsRequest({
      learnerId: 'learner-a',
      word: 'early',
      sentence: 'The birds sang early in the day.',
    }));
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.code, 'tts_prompt_token_required');
  } finally {
    server.close();
  }
});

test('demo TTS records fallback usage and demo-scoped limiter buckets', async () => {
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return new Response(new Uint8Array([4, 5, 6]), {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    });
  };

  const server = createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
      OPENAI_API_KEY: 'test-openai-key',
    },
  });
  try {
    const prompt = await startDemoSpellingPrompt(server);
    const response = await server.fetchRaw('https://repo.test/api/tts', {
      ...ttsRequest({
        learnerId: prompt.audio.learnerId,
        promptToken: prompt.audio.promptToken,
      }),
      headers: {
        'content-type': 'application/json',
        cookie: prompt.cookie,
      },
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const fallbackMetric = server.DB.db.prepare(`
      SELECT metric_count
      FROM demo_operation_metrics
      WHERE metric_key = 'tts_fallbacks'
    `).get();
    const limiterRows = server.DB.db.prepare(`
      SELECT limiter_key
      FROM request_limits
      WHERE limiter_key LIKE 'demo-tts-%'
    `).all();
    const limiterPrefixes = limiterRows.map((row) => row.limiter_key.split(':')[0]).sort();

    assert.equal(response.status, 200);
    assert.deepEqual([...bytes], [4, 5, 6]);
    assert.equal(providerCalls, 1);
    assert.equal(Number(fallbackMetric?.metric_count), 1);
    assert.deepEqual(limiterPrefixes, [
      'demo-tts-account',
      'demo-tts-fallback-type',
      'demo-tts-ip',
      'demo-tts-session',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
  }
});

test('demo TTS is blocked by the demo session limiter before provider fetch', async () => {
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return new Response(new Uint8Array([4, 5, 6]), {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    });
  };

  const server = createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
      OPENAI_API_KEY: 'test-openai-key',
    },
  });
  try {
    const prompt = await startDemoSpellingPrompt(server);
    await seedRateLimit(server, 'demo-tts-session', prompt.sessionId, 60);

    const response = await server.fetchRaw('https://repo.test/api/tts', {
      ...ttsRequest({
        learnerId: prompt.audio.learnerId,
        promptToken: prompt.audio.promptToken,
      }),
      headers: {
        'content-type': 'application/json',
        cookie: prompt.cookie,
      },
    });
    const payload = await response.json();
    const rateLimitMetric = server.DB.db.prepare(`
      SELECT metric_count
      FROM demo_operation_metrics
      WHERE metric_key = 'rate_limit_blocks'
    `).get();
    const fallbackMetric = server.DB.db.prepare(`
      SELECT metric_count
      FROM demo_operation_metrics
      WHERE metric_key = 'tts_fallbacks'
    `).get();

    assert.equal(response.status, 400);
    assert.equal(payload.code, 'demo_rate_limited');
    assert.equal(providerCalls, 0);
    assert.equal(Number(rateLimitMetric?.metric_count), 1);
    assert.equal(Number(fallbackMetric?.metric_count) || 0, 0);
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
  }
});
