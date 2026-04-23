import { sha256 } from './auth.js';
import { first, requireDatabase } from './d1.js';
import { BadRequestError, BackendUnavailableError } from './errors.js';
import { readJson } from './http.js';

const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech';
const GEMINI_GENERATE_CONTENT_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const TTS_WINDOW_MS = 10 * 60 * 1000;
const TTS_ACCOUNT_LIMIT = 120;
const TTS_IP_LIMIT = 240;
const DEFAULT_MODEL = 'gpt-4o-mini-tts';
const DEFAULT_VOICE = 'marin';
const DEFAULT_FORMAT = 'mp3';
const DEFAULT_PRIMARY_TIMEOUT_MS = 5000;
const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-tts-preview';
const DEFAULT_GEMINI_VOICE = 'Kore';
const DEFAULT_GEMINI_TIMEOUT_MS = 12000;
const DEFAULT_GEMINI_SAMPLE_RATE = 24000;
const REMOTE_TTS_PROVIDERS = new Set(['openai', 'gemini']);
const MAX_WORD_LENGTH = 80;
const MAX_SENTENCE_LENGTH = 320;

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cleanGeminiModel(value) {
  return cleanText(value).replace(/^models\//, '');
}

function positiveInteger(value, fallback, { min = 1, max = 30000 } = {}) {
  const parsed = Number(cleanText(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function clientIp(request) {
  return cleanText(
    request.headers.get('cf-connecting-ip')
      || request.headers.get('x-forwarded-for')?.split(',')[0]
      || request.headers.get('x-real-ip'),
  ) || 'unknown';
}

function currentWindowStart(timestamp, windowMs) {
  return Math.floor(timestamp / windowMs) * windowMs;
}

async function consumeRateLimit(env, { bucket, identifier, limit, windowMs, now }) {
  if (!bucket || !identifier || !limit || !windowMs) return { allowed: true, retryAfterSeconds: 0 };
  const db = requireDatabase(env);
  const windowStartedAt = currentWindowStart(now, windowMs);
  const limiterKey = `${bucket}:${await sha256(identifier)}`;
  const row = await first(db, `
    INSERT INTO request_limits (limiter_key, window_started_at, request_count, updated_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(limiter_key) DO UPDATE SET
      request_count = CASE
        WHEN request_limits.window_started_at = excluded.window_started_at
          THEN request_limits.request_count + 1
        ELSE 1
      END,
      window_started_at = excluded.window_started_at,
      updated_at = excluded.updated_at
    RETURNING request_count, window_started_at
  `, [limiterKey, windowStartedAt, now]);
  const count = Number(row?.request_count || 1);
  const storedWindow = Number(row?.window_started_at || windowStartedAt);
  return {
    allowed: count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil(((storedWindow + windowMs) - now) / 1000)),
  };
}

async function protectTts(env, request, session, now) {
  const accountLimit = await consumeRateLimit(env, {
    bucket: 'tts-account',
    identifier: session.accountId,
    limit: TTS_ACCOUNT_LIMIT,
    windowMs: TTS_WINDOW_MS,
    now,
  });
  const ipLimit = await consumeRateLimit(env, {
    bucket: 'tts-ip',
    identifier: clientIp(request),
    limit: TTS_IP_LIMIT,
    windowMs: TTS_WINDOW_MS,
    now,
  });

  if (!accountLimit.allowed || !ipLimit.allowed) {
    throw new BadRequestError('Too many dictation audio requests. Please wait a few minutes and try again.', {
      code: 'tts_rate_limited',
      retryAfterSeconds: Math.max(accountLimit.retryAfterSeconds, ipLimit.retryAfterSeconds),
    });
  }
}

function normaliseRemoteTtsProvider(value) {
  const provider = cleanText(value).toLowerCase() || 'openai';
  if (REMOTE_TTS_PROVIDERS.has(provider)) return provider;
  throw new BadRequestError('Unsupported dictation audio provider.', {
    code: 'tts_provider_unsupported',
    provider,
  });
}

function normaliseTtsPayload(body) {
  const word = cleanText(typeof body?.word === 'string' ? body.word : body?.word?.word);
  const sentence = cleanText(body?.sentence);
  const wordOnly = body?.wordOnly === true;

  if (!word) {
    throw new BadRequestError('A spelling word is required for dictation audio.', { code: 'tts_word_required' });
  }
  if (word.length > MAX_WORD_LENGTH || sentence.length > MAX_SENTENCE_LENGTH) {
    throw new BadRequestError('Dictation audio request is too long.', { code: 'tts_input_too_long' });
  }

  let transcript = sentence
    ? `The word is ${word}. ${sentence} The word is ${word}.`
    : `The word is ${word}. The word is ${word}.`;
  if (wordOnly) transcript = word;

  return {
    transcript,
    provider: normaliseRemoteTtsProvider(body?.provider),
    slow: Boolean(body?.slow),
    wordOnly,
  };
}

function ttsInstructions(slow = false, wordOnly = false) {
  if (wordOnly) {
    return 'Use natural British English pronunciation for a KS2 vocabulary preview. Read exactly the supplied word once and do not add extra words.';
  }
  const pace = slow
    ? 'Speak slightly slower than normal, with clear pauses between the word and sentence.'
    : 'Speak at a calm classroom pace, with clear pauses between the word and sentence.';
  return `${pace} Use natural British English pronunciation for a KS2 spelling dictation. Read exactly the supplied text and do not add extra words.`;
}

function openAiConfig(env = {}) {
  return {
    apiKey: cleanText(env.OPENAI_API_KEY),
    model: cleanText(env.OPENAI_TTS_MODEL) || DEFAULT_MODEL,
    voice: cleanText(env.OPENAI_TTS_VOICE) || DEFAULT_VOICE,
    responseFormat: cleanText(env.OPENAI_TTS_FORMAT) || DEFAULT_FORMAT,
    timeoutMs: positiveInteger(env.TTS_PRIMARY_TIMEOUT_MS || env.OPENAI_TTS_TIMEOUT_MS, DEFAULT_PRIMARY_TIMEOUT_MS, {
      min: 250,
      max: 30000,
    }),
  };
}

function geminiConfig(env = {}) {
  return {
    apiKey: cleanText(env.GEMINI_API_KEY),
    model: cleanGeminiModel(env.GEMINI_TTS_MODEL) || DEFAULT_GEMINI_MODEL,
    voice: cleanText(env.GEMINI_TTS_VOICE) || DEFAULT_GEMINI_VOICE,
    timeoutMs: positiveInteger(env.GEMINI_TTS_TIMEOUT_MS, DEFAULT_GEMINI_TIMEOUT_MS, {
      min: 250,
      max: 30000,
    }),
  };
}

function providerFailure(provider, message, extra = {}) {
  const error = new Error(message);
  error.provider = provider;
  Object.assign(error, extra);
  return error;
}

async function fetchWithTimeout(fetchFn, url, init, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return await fetchFn(url, init);
  }

  const controller = new AbortController();
  let timeoutId = null;
  let timedOut = false;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(providerFailure('provider', 'TTS provider timed out.', { timedOut: true }));
    }, timeoutMs);
  });

  const request = Promise.resolve()
    .then(() => fetchFn(url, { ...init, signal: controller.signal }));
  request.catch(() => {});

  try {
    return await Promise.race([request, timeout]);
  } catch (error) {
    if (timedOut || error?.name === 'AbortError') error.timedOut = timedOut || Boolean(error?.timedOut);
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function providerAttempt(error) {
  const attempt = {
    provider: error?.provider || 'unknown',
  };
  if (Number.isFinite(Number(error?.providerStatus))) attempt.status = Number(error.providerStatus);
  if (error?.timedOut) attempt.timedOut = true;
  return attempt;
}

function backendUnavailableFromFailure(error, failures = []) {
  const attempts = failures.filter(Boolean).map(providerAttempt);
  const extra = {
    code: 'tts_provider_error',
    provider: error?.provider || 'unknown',
  };
  if (Number.isFinite(Number(error?.providerStatus))) extra.providerStatus = Number(error.providerStatus);
  if (error?.timedOut) extra.providerTimedOut = true;
  if (attempts.length > 1) extra.providerAttempts = attempts;
  return new BackendUnavailableError(error?.message || 'TTS provider request failed.', extra);
}

function missingProviderConfig(provider) {
  const name = provider === 'gemini' ? 'Gemini' : 'OpenAI';
  return new BackendUnavailableError(`${name} TTS is not configured.`, {
    code: 'tts_not_configured',
    provider,
  });
}

function geminiPrompt({ transcript, slow = false, wordOnly = false }) {
  if (wordOnly) {
    return `Read exactly this KS2 spelling word once in natural British English. Do not add any extra words:\n\n${transcript}`;
  }
  const pace = slow
    ? 'slightly slower than normal, with clear pauses between the word and sentence'
    : 'at a calm classroom pace, with clear pauses between the word and sentence';
  return `Read exactly this KS2 spelling dictation in natural British English ${pace}. Do not add any extra words:\n\n${transcript}`;
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function writeAscii(view, offset, value) {
  for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
}

function pcmToWav(pcm, sampleRate = DEFAULT_GEMINI_SAMPLE_RATE) {
  const channels = 1;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const buffer = new ArrayBuffer(44 + pcm.byteLength);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, pcm.byteLength, true);
  new Uint8Array(buffer, 44).set(pcm);

  return buffer;
}

function sampleRateFromMime(mimeType) {
  const rate = /rate=(\d+)/i.exec(mimeType || '')?.[1];
  return positiveInteger(rate, DEFAULT_GEMINI_SAMPLE_RATE, {
    min: 8000,
    max: 96000,
  });
}

function shouldWrapGeminiAudio(mimeType) {
  return !/audio\/(mpeg|mp3|wav|wave)/i.test(mimeType || '');
}

async function requestOpenAiSpeech({ config, payload, fetchFn }) {
  let response;
  try {
    response = await fetchWithTimeout(fetchFn, OPENAI_SPEECH_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
        accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        model: config.model,
        voice: config.voice,
        input: payload.transcript,
        instructions: ttsInstructions(payload.slow, payload.wordOnly),
        response_format: config.responseFormat,
      }),
    }, config.timeoutMs);
  } catch (error) {
    throw providerFailure('openai', 'OpenAI TTS request failed.', {
      timedOut: Boolean(error?.timedOut),
      cause: error,
    });
  }

  if (!response.ok) {
    throw providerFailure('openai', 'OpenAI TTS request failed.', {
      providerStatus: response.status,
    });
  }

  const contentType = response.headers.get('content-type') || 'audio/mpeg';
  return new Response(response.body, {
    status: 200,
    headers: {
      'content-type': contentType,
      'cache-control': 'no-store',
      'x-ks2-tts-provider': 'openai',
      'x-ks2-tts-model': config.model,
      'x-ks2-tts-voice': config.voice,
    },
  });
}

async function requestGeminiSpeech({ config, payload, fetchFn }) {
  const url = `${GEMINI_GENERATE_CONTENT_URL}/${encodeURIComponent(config.model)}:generateContent`;
  let response;
  try {
    response = await fetchWithTimeout(fetchFn, url, {
      method: 'POST',
      headers: {
        'x-goog-api-key': config.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: geminiPrompt(payload),
          }],
        }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            languageCode: 'en-GB',
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: config.voice,
              },
            },
          },
        },
      }),
    }, config.timeoutMs);
  } catch (error) {
    throw providerFailure('gemini', 'Gemini TTS request failed.', {
      timedOut: Boolean(error?.timedOut),
      cause: error,
    });
  }

  if (!response.ok) {
    throw providerFailure('gemini', 'Gemini TTS request failed.', {
      providerStatus: response.status,
    });
  }

  const json = await response.json().catch(() => null);
  const part = json?.candidates?.[0]?.content?.parts?.find((candidatePart) => (
    candidatePart?.inlineData?.data || candidatePart?.inline_data?.data
  ));
  const inlineData = part?.inlineData || part?.inline_data;
  const audioData = inlineData?.data;
  const sourceMimeType = cleanText(inlineData?.mimeType || inlineData?.mime_type);
  if (!audioData) {
    throw providerFailure('gemini', 'Gemini TTS response did not include audio.');
  }

  const audioBytes = base64ToBytes(audioData);
  const body = shouldWrapGeminiAudio(sourceMimeType)
    ? pcmToWav(audioBytes, sampleRateFromMime(sourceMimeType))
    : audioBytes;
  const contentType = shouldWrapGeminiAudio(sourceMimeType)
    ? 'audio/wav'
    : sourceMimeType || 'audio/wav';

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': contentType,
      'cache-control': 'no-store',
      'x-ks2-tts-provider': 'gemini',
      'x-ks2-tts-model': config.model,
      'x-ks2-tts-voice': config.voice,
    },
  });
}

export async function handleTextToSpeechRequest({
  env,
  request,
  session,
  now = Date.now(),
  fetchFn = fetch,
} = {}) {
  const openAi = openAiConfig(env);
  const gemini = geminiConfig(env);

  await protectTts(env, request, session, now);
  const payload = normaliseTtsPayload(await readJson(request));

  if (payload.provider === 'gemini') {
    if (!gemini.apiKey) throw missingProviderConfig('gemini');
    try {
      return await requestGeminiSpeech({ config: gemini, payload, fetchFn });
    } catch (error) {
      throw backendUnavailableFromFailure(error, [error]);
    }
  }

  if (!openAi.apiKey) throw missingProviderConfig('openai');
  try {
    return await requestOpenAiSpeech({ config: openAi, payload, fetchFn });
  } catch (error) {
    throw backendUnavailableFromFailure(error, [error]);
  }
}
