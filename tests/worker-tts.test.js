import test from 'node:test';
import assert from 'node:assert/strict';

import { sha256 } from '../worker/src/auth.js';
import {
  buildSpellingWordBankAudioCue,
  resolveSpellingAudioRequest,
} from '../worker/src/subjects/spelling/audio.js';
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

async function startSpellingPrompt(server, { accountId = 'adult-a', learnerId = 'learner-a' } = {}) {
  seedAccountLearner(server.DB, { accountId, learnerId });
  const response = await server.fetchAs(accountId, 'https://repo.test/api/subjects/spelling/command', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      command: 'start-session',
      learnerId,
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

function createMemoryR2Bucket({ hit = null, failGet = false } = {}) {
  const objects = new Map();
  const gets = [];
  const puts = [];
  if (hit) {
    objects.set('*', {
      bytes: Uint8Array.from(hit.bytes || [9, 8, 7]),
      contentType: hit.contentType || 'audio/mpeg',
    });
  }
  return {
    gets,
    puts,
    async get(key) {
      gets.push(key);
      if (failGet) throw new Error('R2 get failed.');
      const item = objects.get(key) || objects.get('*');
      if (!item) return null;
      return {
        body: item.bytes,
        httpMetadata: { contentType: item.contentType },
        customMetadata: item.customMetadata || {},
      };
    },
    async put(key, value, options = {}) {
      const bytes = new Uint8Array(await new Response(value).arrayBuffer());
      puts.push({ key, bytes, options });
      objects.set(key, {
        bytes,
        contentType: options.httpMetadata?.contentType || 'application/octet-stream',
        customMetadata: options.customMetadata || {},
      });
    },
  };
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
    assert.equal(calls[0].body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Iapetus');
    assert.match(calls[0].body.contents[0].parts[0].text, /Generate speech only/);
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
  }
});

test('TTS route serves pre-cached Gemini audio before provider generation', async () => {
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    throw new Error('Provider should not be called for cached audio.');
  };
  const bucket = createMemoryR2Bucket({
    hit: {
      bytes: [9, 8, 7],
      contentType: 'audio/mpeg',
    },
  });

  const server = createWorkerRepositoryServer({
    env: {
      SPELLING_AUDIO_BUCKET: bucket,
    },
  });
  try {
    const prompt = await startSpellingPrompt(server);
    const response = await server.fetch('https://repo.test/api/tts', ttsRequest({
      learnerId: prompt.learnerId,
      promptToken: prompt.promptToken,
      provider: 'gemini',
      bufferedGeminiVoice: 'Sulafat',
    }));
    const bytes = new Uint8Array(await response.arrayBuffer());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'audio/mpeg');
    assert.equal(response.headers.get('x-ks2-tts-cache'), 'hit');
    assert.equal(response.headers.get('x-ks2-tts-voice'), 'Sulafat');
    assert.equal(response.headers.get('x-ks2-tts-cache-key'), null);
    assert.deepEqual([...bytes], [9, 8, 7]);
    assert.equal(providerCalls, 0);
    assert.equal(bucket.gets.length, 1);
    assert.match(bucket.gets[0], /\/Sulafat\/standard\/[^/]+\/early\//);
    assert.equal(bucket.puts.length, 0);
    const limiterRows = server.DB.db.prepare(`
      SELECT limiter_key
      FROM request_limits
      WHERE limiter_key LIKE 'tts-%'
    `).all();
    const limiterPrefixes = limiterRows.map((row) => row.limiter_key.split(':')[0]).sort();
    assert.deepEqual(limiterPrefixes, ['tts-account', 'tts-ip']);
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
  }
});

test('TTS route rate limits cached Gemini audio before reading R2', async () => {
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    throw new Error('Provider should not be called for rate-limited cached audio.');
  };
  const bucket = createMemoryR2Bucket({
    hit: {
      bytes: [9, 8, 7],
      contentType: 'audio/mpeg',
    },
  });

  const server = createWorkerRepositoryServer({
    env: {
      SPELLING_AUDIO_BUCKET: bucket,
    },
  });
  try {
    const prompt = await startSpellingPrompt(server);
    await seedRateLimit(server, 'tts-account', 'adult-a', 120);

    const response = await server.fetch('https://repo.test/api/tts', ttsRequest({
      learnerId: prompt.learnerId,
      promptToken: prompt.promptToken,
      provider: 'gemini',
      bufferedGeminiVoice: 'Sulafat',
    }));
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.code, 'tts_rate_limited');
    assert.equal(providerCalls, 0);
    assert.equal(bucket.gets.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
  }
});

test('TTS route stores generated Gemini audio under the buffered batch key', async () => {
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
  const bucket = createMemoryR2Bucket();

  const server = createWorkerRepositoryServer({
    env: {
      GEMINI_API_KEY: 'test-gemini-key',
      GEMINI_TTS_MODEL: 'gemini-custom-tts-preview',
      SPELLING_AUDIO_BUCKET: bucket,
    },
  });
  try {
    const prompt = await startSpellingPrompt(server);
    const response = await server.fetch('https://repo.test/api/tts', ttsRequest({
      learnerId: prompt.learnerId,
      promptToken: prompt.promptToken,
      provider: 'gemini',
      bufferedGeminiVoice: 'Sulafat',
      slow: true,
    }));
    const bytes = new Uint8Array(await response.arrayBuffer());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'audio/wav');
    assert.equal(response.headers.get('x-ks2-tts-cache'), 'stored');
    assert.equal(response.headers.get('x-ks2-tts-model'), 'gemini-custom-tts-preview');
    assert.equal(response.headers.get('x-ks2-tts-voice'), 'Sulafat');
    assert.equal(response.headers.get('x-ks2-tts-cache-key'), null);
    assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'RIFF');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-custom-tts-preview:generateContent');
    assert.equal(calls[0].headers['x-goog-api-key'], 'test-gemini-key');
    assert.equal(calls[0].body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Sulafat');
    assert.match(calls[0].body.contents[0].parts[0].text, /Generate speech only/);
    assert.equal(bucket.puts.length, 1);
    assert.match(bucket.puts[0].key, /spelling-audio\/v1\/gemini-custom-tts-preview\/Sulafat\/slow\/[^/]+\/early\/\d+\.wav$/);
    assert.equal(bucket.puts[0].options.httpMetadata.contentType, 'audio/wav');
    assert.equal(bucket.puts[0].options.customMetadata.model, 'gemini-custom-tts-preview');
    assert.ok(bucket.puts[0].options.customMetadata.contentKey);
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
  }
});

test('TTS buffered Gemini cache reuses matching published content across accounts', async () => {
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return geminiAudioResponse();
  };
  const bucket = createMemoryR2Bucket();

  const server = createWorkerRepositoryServer({
    env: {
      GEMINI_API_KEY: 'test-gemini-key',
      SPELLING_AUDIO_BUCKET: bucket,
    },
  });
  try {
    seedAccountLearner(server.DB, { accountId: 'adult-a', learnerId: 'learner-a' });
    seedAccountLearner(server.DB, { accountId: 'adult-b', learnerId: 'learner-b' });
    const detailAResponse = await server.fetchAs('adult-a', 'https://repo.test/api/subjects/spelling/word-bank?learnerId=learner-a&detailSlug=early');
    const detailBResponse = await server.fetchAs('adult-b', 'https://repo.test/api/subjects/spelling/word-bank?learnerId=learner-b&detailSlug=early');
    const detailA = await detailAResponse.json();
    const detailB = await detailBResponse.json();
    const cueA = detailA.wordBank.detail.audio.dictation;
    const cueB = detailB.wordBank.detail.audio.dictation;

    const responseA = await server.fetchAs('adult-a', 'https://repo.test/api/tts', ttsRequest({
      learnerId: cueA.learnerId,
      promptToken: cueA.promptToken,
      slug: cueA.slug,
      provider: 'gemini',
      bufferedGeminiVoice: 'Iapetus',
    }));
    const responseB = await server.fetchAs('adult-b', 'https://repo.test/api/tts', ttsRequest({
      learnerId: cueB.learnerId,
      promptToken: cueB.promptToken,
      slug: cueB.slug,
      provider: 'gemini',
      bufferedGeminiVoice: 'Iapetus',
    }));

    assert.equal(responseA.status, 200);
    assert.equal(responseA.headers.get('x-ks2-tts-cache'), 'stored');
    assert.equal(responseB.status, 200);
    assert.equal(responseB.headers.get('x-ks2-tts-cache'), 'hit');
    assert.equal(providerCalls, 1);
    assert.equal(bucket.puts.length, 1);
    assert.match(bucket.puts[0].key, /\/Iapetus\/standard\/[^/]+\/early\/\d+\.wav$/);
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
  }
});

test('TTS route falls back to provider generation when R2 reads fail', async () => {
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return geminiAudioResponse();
  };
  const bucket = createMemoryR2Bucket({ failGet: true });

  const server = createWorkerRepositoryServer({
    env: {
      GEMINI_API_KEY: 'test-gemini-key',
      SPELLING_AUDIO_BUCKET: bucket,
    },
  });
  try {
    const prompt = await startSpellingPrompt(server);
    const response = await server.fetch('https://repo.test/api/tts', ttsRequest({
      learnerId: prompt.learnerId,
      promptToken: prompt.promptToken,
      provider: 'gemini',
      bufferedGeminiVoice: 'Iapetus',
    }));
    const bytes = new Uint8Array(await response.arrayBuffer());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-ks2-tts-cache'), 'unavailable');
    assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'RIFF');
    assert.equal(providerCalls, 1);
    assert.equal(bucket.puts.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
  }
});

test('TTS cache-only requests warm Gemini audio without returning playback bytes', async () => {
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return geminiAudioResponse();
  };
  const bucket = createMemoryR2Bucket();

  const server = createWorkerRepositoryServer({
    env: {
      GEMINI_API_KEY: 'test-gemini-key',
      SPELLING_AUDIO_BUCKET: bucket,
    },
  });
  try {
    const prompt = await startSpellingPrompt(server);
    const response = await server.fetch('https://repo.test/api/tts', ttsRequest({
      learnerId: prompt.learnerId,
      promptToken: prompt.promptToken,
      provider: 'gemini',
      bufferedGeminiVoice: 'Iapetus',
      cacheOnly: true,
    }));
    const bytes = new Uint8Array(await response.arrayBuffer());

    assert.equal(response.status, 204);
    assert.equal(response.headers.get('x-ks2-tts-cache'), 'stored');
    assert.equal(response.headers.get('x-ks2-tts-cache-key'), null);
    assert.equal(bytes.length, 0);
    assert.equal(providerCalls, 1);
    assert.equal(bucket.puts.length, 1);
    assert.match(bucket.puts[0].key, /\/Iapetus\/standard\/[^/]+\/early\/\d+\.wav$/);
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
  }
});

test('TTS cache-only warmups do not spend user playback quota', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push(String(url));
    if (String(url).includes('generativelanguage')) return geminiAudioResponse();
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    });
  };
  const bucket = createMemoryR2Bucket();

  const server = createWorkerRepositoryServer({
    env: {
      OPENAI_API_KEY: 'test-openai-key',
      GEMINI_API_KEY: 'test-gemini-key',
      SPELLING_AUDIO_BUCKET: bucket,
    },
  });
  try {
    const prompt = await startSpellingPrompt(server);
    await seedRateLimit(server, 'tts-account', 'adult-a', 119);

    const warmup = await server.fetch('https://repo.test/api/tts', ttsRequest({
      learnerId: prompt.learnerId,
      promptToken: prompt.promptToken,
      provider: 'gemini',
      bufferedGeminiVoice: 'Iapetus',
      cacheOnly: true,
    }));
    const playback = await server.fetch('https://repo.test/api/tts', ttsRequest({
      learnerId: prompt.learnerId,
      promptToken: prompt.promptToken,
      provider: 'openai',
      bufferedGeminiVoice: 'Iapetus',
    }));
    const bytes = new Uint8Array(await playback.arrayBuffer());
    const limiterRows = server.DB.db.prepare(`
      SELECT limiter_key, request_count
      FROM request_limits
      WHERE limiter_key LIKE 'tts-%'
    `).all();
    const normalAccount = limiterRows.find((row) => row.limiter_key.startsWith('tts-account:'));
    const prefixes = limiterRows.map((row) => row.limiter_key.split(':')[0]).sort();

    assert.equal(warmup.status, 204);
    assert.equal(warmup.headers.get('x-ks2-tts-cache'), 'stored');
    assert.equal(playback.status, 200);
    assert.deepEqual([...bytes], [1, 2, 3]);
    assert.equal(Number(normalAccount?.request_count), 120);
    assert.deepEqual(prefixes, [
      'tts-account',
      'tts-ip',
      'tts-warmup-account',
      'tts-warmup-ip',
    ]);
    assert.equal(calls.filter((url) => url.includes('generativelanguage')).length, 1);
    assert.equal(calls.filter((url) => url.includes('api.openai.com')).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
  }
});

test('TTS cache-only cache hits do not spend warmup quota', async () => {
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    throw new Error('Provider should not be called for cache-only hits.');
  };
  const bucket = createMemoryR2Bucket({
    hit: {
      bytes: [9, 8, 7],
      contentType: 'audio/mpeg',
    },
  });

  const server = createWorkerRepositoryServer({
    env: {
      GEMINI_API_KEY: 'test-gemini-key',
      SPELLING_AUDIO_BUCKET: bucket,
    },
  });
  try {
    const prompt = await startSpellingPrompt(server);
    await seedRateLimit(server, 'tts-warmup-account', 'adult-a', 60);

    const response = await server.fetch('https://repo.test/api/tts', ttsRequest({
      learnerId: prompt.learnerId,
      promptToken: prompt.promptToken,
      provider: 'gemini',
      bufferedGeminiVoice: 'Iapetus',
      cacheOnly: true,
    }));
    const warmupAccount = server.DB.db.prepare(`
      SELECT request_count
      FROM request_limits
      WHERE limiter_key LIKE 'tts-warmup-account:%'
    `).get();

    assert.equal(response.status, 204);
    assert.equal(response.headers.get('x-ks2-tts-cache'), 'hit');
    assert.equal(response.headers.get('x-ks2-tts-cache-key'), null);
    assert.equal(providerCalls, 0);
    assert.equal(bucket.gets.length, 1);
    assert.equal(bucket.puts.length, 0);
    assert.equal(Number(warmupAccount?.request_count), 60);
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
  }
});

test('TTS cache-only warmups are skipped when the warmup quota is exhausted', async () => {
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return geminiAudioResponse();
  };
  const bucket = createMemoryR2Bucket();

  const server = createWorkerRepositoryServer({
    env: {
      GEMINI_API_KEY: 'test-gemini-key',
      SPELLING_AUDIO_BUCKET: bucket,
    },
  });
  try {
    const prompt = await startSpellingPrompt(server);
    await seedRateLimit(server, 'tts-warmup-account', 'adult-a', 60);

    const response = await server.fetch('https://repo.test/api/tts', ttsRequest({
      learnerId: prompt.learnerId,
      promptToken: prompt.promptToken,
      provider: 'gemini',
      bufferedGeminiVoice: 'Iapetus',
      cacheOnly: true,
    }));

    assert.equal(response.status, 204);
    assert.equal(response.headers.get('x-ks2-tts-cache'), 'skipped_rate_limited');
    assert.equal(providerCalls, 0);
    assert.equal(bucket.gets.length, 2);
    assert.equal(bucket.puts.length, 0);
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

test('TTS route rejects word-only audio for an active spelling prompt token', async () => {
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
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.code, 'tts_word_only_scope_invalid');
    assert.equal(calls.length, 0);
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

test('word-bank vocabulary audio tokens do not require example sentences', async () => {
  const word = {
    slug: 'century',
    word: 'century',
    sentence: '',
  };
  const repository = {
    async readSubjectRuntime() {
      return { subjectRecord: { ui: { phase: 'dashboard' } } };
    },
    async readSpellingRuntimeContent() {
      return {
        snapshot: {
          wordBySlug: { century: word },
        },
      };
    },
  };

  const wordCue = await buildSpellingWordBankAudioCue({
    learnerId: 'learner-a',
    word,
    wordOnly: true,
  });
  const dictationCue = await buildSpellingWordBankAudioCue({
    learnerId: 'learner-a',
    word,
  });

  assert.ok(wordCue.promptToken);
  assert.ok(dictationCue.promptToken);
  assert.equal(wordCue.promptToken, dictationCue.promptToken);

  const wordRequest = await resolveSpellingAudioRequest({
    repository,
    accountId: 'adult-a',
    body: {
      learnerId: 'learner-a',
      promptToken: wordCue.promptToken,
      slug: 'century',
      wordOnly: true,
    },
  });
  const dictationRequest = await resolveSpellingAudioRequest({
    repository,
    accountId: 'adult-a',
    body: {
      learnerId: 'learner-a',
      promptToken: dictationCue.promptToken,
      slug: 'century',
    },
  });

  assert.equal(wordRequest.transcript, 'century');
  assert.equal(dictationRequest.transcript, 'The word is century. The word is century.');
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

test('production bootstrap returns a redacted replay audio cue for the active spelling prompt', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({
      url,
      body: JSON.parse(init.body),
    });
    return new Response(new Uint8Array([7, 8, 9]), {
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
    const bootstrap = await server.fetchRaw('https://repo.test/api/bootstrap', {
      headers: { cookie: prompt.cookie },
    });
    const payload = await bootstrap.json();
    const spelling = payload.subjectStates[`${prompt.learnerId}::spelling`]?.ui;

    assert.equal(bootstrap.status, 200, JSON.stringify(payload));
    assert.equal(spelling.session.currentCard.word, undefined);
    assert.equal(spelling.session.currentCard.prompt.sentence, undefined);
    assert.ok(spelling.audio?.promptToken);
    assert.equal(spelling.audio.learnerId, prompt.learnerId);
    assert.equal(spelling.audio.promptToken, prompt.audio.promptToken);
    assert.equal(JSON.stringify(spelling).includes('early'), false);

    const replay = await server.fetchRaw('https://repo.test/api/tts', {
      ...ttsRequest({
        learnerId: spelling.audio.learnerId,
        promptToken: spelling.audio.promptToken,
      }),
      headers: {
        'content-type': 'application/json',
        cookie: prompt.cookie,
      },
    });
    const bytes = new Uint8Array(await replay.arrayBuffer());

    assert.equal(replay.status, 200);
    assert.deepEqual([...bytes], [7, 8, 9]);
    assert.equal(calls.length, 1);
    assert.match(calls[0].body.input, /The word is early\./);
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
  }
});

test('spelling commands keep a replay cue when auto-play audio is disabled', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAccountLearner(server.DB);
    const prefsResponse = await server.fetch('https://repo.test/api/subjects/spelling/command', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        command: 'save-prefs',
        learnerId: 'learner-a',
        requestId: 'tts-prefs-autoplay-off',
        expectedLearnerRevision: 0,
        payload: {
          prefs: {
            autoSpeak: false,
            mode: 'single',
            roundLength: '1',
          },
        },
      }),
    });
    const prefsPayload = await prefsResponse.json();
    assert.equal(prefsResponse.status, 200, JSON.stringify(prefsPayload));

    const startResponse = await server.fetch('https://repo.test/api/subjects/spelling/command', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        command: 'start-session',
        learnerId: 'learner-a',
        requestId: 'tts-start-autoplay-off',
        expectedLearnerRevision: 1,
        payload: {
          mode: 'single',
          slug: 'early',
          length: 1,
        },
      }),
    });
    const startPayload = await startResponse.json();

    assert.equal(startResponse.status, 200, JSON.stringify(startPayload));
    assert.equal(startPayload.audio, null);
    assert.ok(startPayload.subjectReadModel.audio?.promptToken);
    assert.equal(startPayload.subjectReadModel.audio.learnerId, 'learner-a');
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

test('demo cache-only warmups use demo TTS guards and metrics', async () => {
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return geminiAudioResponse();
  };
  const bucket = createMemoryR2Bucket();

  const server = createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
      GEMINI_API_KEY: 'test-gemini-key',
      SPELLING_AUDIO_BUCKET: bucket,
    },
  });
  try {
    const prompt = await startDemoSpellingPrompt(server);
    const response = await server.fetchRaw('https://repo.test/api/tts', {
      ...ttsRequest({
        learnerId: prompt.audio.learnerId,
        promptToken: prompt.audio.promptToken,
        provider: 'gemini',
        bufferedGeminiVoice: 'Iapetus',
        cacheOnly: true,
      }),
      headers: {
        'content-type': 'application/json',
        cookie: prompt.cookie,
      },
    });
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

    assert.equal(response.status, 204);
    assert.equal(response.headers.get('x-ks2-tts-cache'), 'stored');
    assert.equal(providerCalls, 1);
    assert.equal(bucket.puts.length, 1);
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

test('demo cache-only warmups are blocked by demo limiter before provider fetch', async () => {
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return geminiAudioResponse();
  };
  const bucket = createMemoryR2Bucket();

  const server = createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
      GEMINI_API_KEY: 'test-gemini-key',
      SPELLING_AUDIO_BUCKET: bucket,
    },
  });
  try {
    const prompt = await startDemoSpellingPrompt(server);
    await seedRateLimit(server, 'demo-tts-session', prompt.sessionId, 60);

    const response = await server.fetchRaw('https://repo.test/api/tts', {
      ...ttsRequest({
        learnerId: prompt.audio.learnerId,
        promptToken: prompt.audio.promptToken,
        provider: 'gemini',
        bufferedGeminiVoice: 'Iapetus',
        cacheOnly: true,
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
    assert.equal(bucket.puts.length, 0);
    assert.equal(Number(rateLimitMetric?.metric_count), 1);
    assert.equal(Number(fallbackMetric?.metric_count) || 0, 0);
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
  }
});
