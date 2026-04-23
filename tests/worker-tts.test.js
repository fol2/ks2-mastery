import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';

function ttsRequest(body = {}) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      word: 'early',
      sentence: 'The birds sang early in the day.',
      ...body,
    }),
  };
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
    const response = await server.fetch('https://repo.test/api/tts', ttsRequest());
    const bytes = new Uint8Array(await response.arrayBuffer());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'audio/mpeg');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual([...bytes], [1, 2, 3]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.openai.com/v1/audio/speech');
    assert.equal(calls[0].headers.authorization, 'Bearer test-openai-key');
    assert.equal(calls[0].body.model, 'gpt-4o-mini-tts');
    assert.equal(calls[0].body.voice, 'marin');
    assert.equal(calls[0].body.response_format, 'mp3');
    assert.equal(calls[0].body.input, 'The word is early. The birds sang early in the day. The word is early.');
    assert.match(calls[0].body.instructions, /British English pronunciation/);
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
  }
});

test('TTS route falls back to Gemini when OpenAI returns a provider error', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({
      url,
      headers: init.headers,
      body: JSON.parse(init.body),
    });
    if (url === 'https://api.openai.com/v1/audio/speech') {
      return new Response(JSON.stringify({ error: 'busy' }), { status: 503 });
    }
    return geminiAudioResponse();
  };

  const server = createWorkerRepositoryServer({
    env: {
      OPENAI_API_KEY: 'test-openai-key',
      GEMINI_API_KEY: 'test-gemini-key',
    },
  });
  try {
    const response = await server.fetch('https://repo.test/api/tts', ttsRequest());
    const bytes = new Uint8Array(await response.arrayBuffer());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'audio/wav');
    assert.equal(response.headers.get('x-ks2-tts-provider'), 'gemini');
    assert.equal(response.headers.get('x-ks2-tts-fallback-from'), 'openai');
    assert.equal(response.headers.get('x-ks2-tts-model'), 'gemini-3.1-flash-tts-preview');
    assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'RIFF');
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent');
    assert.equal(calls[1].headers['x-goog-api-key'], 'test-gemini-key');
    assert.equal(calls[1].body.generationConfig.responseModalities[0], 'AUDIO');
    assert.equal(calls[1].body.generationConfig.speechConfig.languageCode, 'en-GB');
    assert.equal(calls[1].body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Kore');
    assert.match(calls[1].body.contents[0].parts[0].text, /The word is early/);
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
  }
});

test('TTS route falls back to Gemini when OpenAI exceeds the primary timeout', async () => {
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
    return geminiAudioResponse([3, 0, 4, 0]);
  };

  const server = createWorkerRepositoryServer({
    env: {
      OPENAI_API_KEY: 'test-openai-key',
      GEMINI_API_KEY: 'test-gemini-key',
      TTS_PRIMARY_TIMEOUT_MS: '250',
    },
  });
  try {
    const response = await server.fetch('https://repo.test/api/tts', ttsRequest());

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-ks2-tts-provider'), 'gemini');
    assert.equal(response.headers.get('x-ks2-tts-fallback-from'), 'openai');
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
    const response = await server.fetch('https://repo.test/api/tts', ttsRequest({ wordOnly: true }));

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

test('TTS route reports missing OpenAI configuration clearly', async () => {
  const server = createWorkerRepositoryServer();
  try {
    const response = await server.fetch('https://repo.test/api/tts', ttsRequest());
    const payload = await response.json();

    assert.equal(response.status, 503);
    assert.equal(payload.code, 'tts_not_configured');
  } finally {
    server.close();
  }
});
