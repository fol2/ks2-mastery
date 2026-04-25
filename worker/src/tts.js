import { sha256 } from './auth.js';
import { requireDatabase } from './d1.js';
import { BadRequestError, BackendUnavailableError } from './errors.js';
import { readJson } from './http.js';
import { consumeRateLimit } from './rate-limit.js';
import { protectDemoTtsFallback, protectDemoTtsLookup, recordDemoMetric } from './demo/sessions.js';
import { resolveSpellingAudioRequest } from './subjects/spelling/audio.js';
import {
  SPELLING_AUDIO_MODEL,
  buildAudioAssetKey,
  buildBufferedSpeechPrompt,
  normaliseBufferedGeminiVoice,
  speedIdForSlow,
} from '../../shared/spelling-audio.js';

const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech';
const GEMINI_GENERATE_CONTENT_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const TTS_WINDOW_MS = 10 * 60 * 1000;
const TTS_ACCOUNT_LIMIT = 120;
const TTS_IP_LIMIT = 240;
const TTS_LOOKUP_ACCOUNT_LIMIT = 240;
const TTS_LOOKUP_IP_LIMIT = 480;
const TTS_WARMUP_ACCOUNT_LIMIT = 60;
const TTS_WARMUP_IP_LIMIT = 180;
const DEFAULT_MODEL = 'gpt-4o-mini-tts';
const DEFAULT_VOICE = 'marin';
const DEFAULT_FORMAT = 'mp3';
const DEFAULT_PRIMARY_TIMEOUT_MS = 5000;
const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-tts-preview';
const DEFAULT_GEMINI_VOICE = 'Kore';
const DEFAULT_GEMINI_TIMEOUT_MS = 12000;
const DEFAULT_GEMINI_SAMPLE_RATE = 24000;
const BUFFERED_AUDIO_EXTENSIONS = Object.freeze(['mp3', 'wav']);
const REMOTE_TTS_PROVIDERS = new Set(['openai', 'gemini']);

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

// U7: `currentWindowStart` + `consumeRateLimit` extracted to
// `worker/src/rate-limit.js`. TTS uses the shared helper with an
// env-first signature, same shape as before (feasibility F-06).

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

async function protectTtsLookup(env, request, session, now) {
  const accountLimit = await consumeRateLimit(env, {
    bucket: 'tts-lookup-account',
    identifier: session.accountId,
    limit: TTS_LOOKUP_ACCOUNT_LIMIT,
    windowMs: TTS_WINDOW_MS,
    now,
  });
  const ipLimit = await consumeRateLimit(env, {
    bucket: 'tts-lookup-ip',
    identifier: clientIp(request),
    limit: TTS_LOOKUP_IP_LIMIT,
    windowMs: TTS_WINDOW_MS,
    now,
  });

  if (!accountLimit.allowed || !ipLimit.allowed) {
    throw new BadRequestError('Too many dictation audio cache lookups. Please wait a few minutes and try again.', {
      code: 'tts_lookup_rate_limited',
      retryAfterSeconds: Math.max(accountLimit.retryAfterSeconds, ipLimit.retryAfterSeconds),
    });
  }
}

async function allowTtsWarmup(env, request, session, now) {
  const accountLimit = await consumeRateLimit(env, {
    bucket: 'tts-warmup-account',
    identifier: session.accountId,
    limit: TTS_WARMUP_ACCOUNT_LIMIT,
    windowMs: TTS_WINDOW_MS,
    now,
  });
  const ipLimit = await consumeRateLimit(env, {
    bucket: 'tts-warmup-ip',
    identifier: clientIp(request),
    limit: TTS_WARMUP_IP_LIMIT,
    windowMs: TTS_WINDOW_MS,
    now,
  });
  return accountLimit.allowed && ipLimit.allowed;
}

async function recordDemoTtsFallback(env, session, now, response) {
  if (session?.demo) {
    await recordDemoMetric(requireDatabase(env), 'tts_fallbacks', now);
  }
  return response;
}

function normaliseRemoteTtsProvider(value) {
  const provider = cleanText(value).toLowerCase() || 'openai';
  if (REMOTE_TTS_PROVIDERS.has(provider)) return provider;
  throw new BadRequestError('Unsupported dictation audio provider.', {
    code: 'tts_provider_unsupported',
    provider,
  });
}

function normaliseTtsCacheOnly(value) {
  return value === true || cleanText(value).toLowerCase() === 'true';
}

function normaliseTtsCacheLookupOnly(value) {
  return value === true || cleanText(value).toLowerCase() === 'true';
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
  const error = new BackendUnavailableError(`${name} TTS is not configured.`, {
    code: 'tts_not_configured',
    provider,
  });
  error.provider = provider;
  return error;
}

function providerUnavailableError(error, failures = []) {
  if (error instanceof BackendUnavailableError && failures.length <= 1) return error;
  return backendUnavailableFromFailure(error, failures.length ? failures : [error]);
}

function canFallbackProviderError(error) {
  const status = Number(error?.status);
  return !Number.isFinite(status) || status >= 500;
}

function isProviderFailure(error, provider) {
  return error?.provider === provider;
}

function spellingAudioBucket(env = {}) {
  const bucket = env.SPELLING_AUDIO_BUCKET;
  return bucket && typeof bucket.get === 'function' && typeof bucket.put === 'function'
    ? bucket
    : null;
}

function contentTypeForExtension(extension) {
  return extension === 'mp3' ? 'audio/mpeg' : 'audio/wav';
}

async function bufferedAudioMetadata(payload = {}, { model = SPELLING_AUDIO_MODEL } = {}) {
  if (payload.wordOnly) return null;
  const cacheModel = cleanGeminiModel(model) || SPELLING_AUDIO_MODEL;
  const slug = cleanText(payload.slug).toLowerCase();
  const sentenceIndex = Number(payload.sentenceIndex);
  const accountId = cleanText(payload.accountId);
  const word = cleanText(payload.word);
  const sentence = cleanText(payload.sentence);
  if (!accountId || !slug || !word || !sentence || !Number.isInteger(sentenceIndex) || sentenceIndex < 0) return null;
  const voice = normaliseBufferedGeminiVoice(payload.bufferedGeminiVoice);
  const speed = speedIdForSlow(payload.slow);
  const contentKey = await sha256([
    'spelling-audio-content-v2',
    slug,
    String(sentenceIndex),
    word,
    sentence,
  ].join('|'));
  return {
    model: cacheModel,
    voice,
    speed,
    contentKey,
    slug,
    sentenceIndex,
  };
}

function bufferedAudioKey(metadata, extension = 'mp3') {
  return buildAudioAssetKey({
    ...metadata,
    extension,
  });
}

function bufferedAudioHeaders({ metadata, cacheState, contentType }) {
  return {
    'content-type': contentType,
    'cache-control': 'private, max-age=86400',
    'x-ks2-tts-provider': 'gemini',
    'x-ks2-tts-model': metadata.model || SPELLING_AUDIO_MODEL,
    'x-ks2-tts-voice': metadata.voice,
    'x-ks2-tts-cache': cacheState,
  };
}

function objectContentType(object, extension) {
  return cleanText(
    object?.httpMetadata?.contentType
      || object?.httpMetadata?.content_type
      || object?.customMetadata?.contentType,
  ) || contentTypeForExtension(extension);
}

async function readBufferedGeminiAudio(env, payload, options = {}) {
  const metadata = await bufferedAudioMetadata(payload, options);
  if (!metadata) return null;
  const bucket = spellingAudioBucket(env);
  if (!bucket) {
    return {
      object: null,
      metadata,
      key: bufferedAudioKey(metadata, 'wav'),
      extension: 'wav',
      contentType: 'audio/wav',
      cacheUnavailable: true,
    };
  }

  for (const extension of BUFFERED_AUDIO_EXTENSIONS) {
    const key = bufferedAudioKey(metadata, extension);
    let object = null;
    try {
      object = await bucket.get(key);
    } catch {
      return {
        object: null,
        metadata,
        key: bufferedAudioKey(metadata, 'wav'),
        extension: 'wav',
        contentType: 'audio/wav',
        cacheUnavailable: true,
      };
    }
    if (!object) continue;
    return {
      object,
      metadata,
      key,
      extension,
      contentType: objectContentType(object, extension),
    };
  }
  return {
    object: null,
    metadata,
    key: bufferedAudioKey(metadata, 'wav'),
    extension: 'wav',
    contentType: 'audio/wav',
  };
}

function cachedGeminiAudioResponse(cacheHit) {
  return new Response(cacheHit.object.body, {
    status: 200,
    headers: bufferedAudioHeaders({
      metadata: cacheHit.metadata,
      cacheState: 'hit',
      contentType: cacheHit.contentType,
    }),
  });
}

function cacheOnlyResponse(cacheState, cacheHit = null) {
  const headers = new Headers({
    'cache-control': 'no-store',
    'x-ks2-tts-cache': cacheState,
  });
  if (cacheHit?.metadata?.model) headers.set('x-ks2-tts-model', cacheHit.metadata.model);
  if (cacheHit?.metadata?.voice) headers.set('x-ks2-tts-voice', cacheHit.metadata.voice);
  return new Response(null, { status: 204, headers });
}

function withFallbackHeader(response, fallbackFrom = '') {
  if (!fallbackFrom) return response;
  const headers = new Headers(response.headers);
  headers.set('x-ks2-tts-fallback-from', fallbackFrom);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function storeBufferedGeminiAudio(env, payload, response, options = {}) {
  const cacheSlot = await readBufferedGeminiAudio(env, payload, options);
  if (!cacheSlot?.metadata || cacheSlot.cacheUnavailable || !spellingAudioBucket(env)) {
    const headers = new Headers(response.headers);
    headers.set('x-ks2-tts-cache', 'unavailable');
    return {
      response: new Response(response.body, { status: response.status, headers }),
      cacheState: 'unavailable',
      key: '',
      metadata: cacheSlot?.metadata || null,
    };
  }
  if (cacheSlot.object) {
    return {
      response: cachedGeminiAudioResponse(cacheSlot),
      cacheState: 'hit',
      key: cacheSlot.key,
      metadata: cacheSlot.metadata,
    };
  }

  const contentType = response.headers.get('content-type') || 'audio/wav';
  const bytes = await response.arrayBuffer();
  try {
    await spellingAudioBucket(env).put(cacheSlot.key, bytes, {
      httpMetadata: { contentType },
      customMetadata: {
        model: cacheSlot.metadata.model,
        voice: cacheSlot.metadata.voice,
        speed: cacheSlot.metadata.speed,
        contentKey: cacheSlot.metadata.contentKey,
        slug: cacheSlot.metadata.slug,
        sentenceIndex: String(cacheSlot.metadata.sentenceIndex),
        source: 'worker-gemini-tts',
      },
    });
    return {
      response: new Response(bytes, {
        status: 200,
        headers: bufferedAudioHeaders({
          metadata: cacheSlot.metadata,
          cacheState: 'stored',
          contentType,
        }),
      }),
      cacheState: 'stored',
      key: cacheSlot.key,
      metadata: cacheSlot.metadata,
    };
  } catch {
    const headers = new Headers(response.headers);
    headers.set('x-ks2-tts-cache', 'store_failed');
    return {
      response: new Response(bytes, { status: 200, headers }),
      cacheState: 'store_failed',
      key: cacheSlot.key,
      metadata: cacheSlot.metadata,
    };
  }
}

function geminiPrompt(payload = {}) {
  const { transcript, slow = false, wordOnly = false } = payload;
  if (wordOnly) {
    return `Read exactly this KS2 spelling word once in natural British English. Do not add any extra words:\n\n${transcript}`;
  }
  if (payload.word && payload.sentence) {
    return buildBufferedSpeechPrompt({
      wordText: payload.word,
      sentence: payload.sentence,
      slow,
    });
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
  repository,
  now = Date.now(),
  fetchFn = fetch,
} = {}) {
  const body = await readJson(request);
  const cacheOnly = normaliseTtsCacheOnly(body?.cacheOnly);
  const cacheLookupOnly = normaliseTtsCacheLookupOnly(body?.cacheLookupOnly);
  const payload = {
    ...(await resolveSpellingAudioRequest({
      repository,
      accountId: session.accountId,
      body,
    })),
    accountId: session.accountId,
    provider: cacheOnly || cacheLookupOnly ? 'gemini' : normaliseRemoteTtsProvider(body?.provider),
    bufferedGeminiVoice: normaliseBufferedGeminiVoice(body?.bufferedGeminiVoice || body?.cachedVoice),
    cacheOnly,
    cacheLookupOnly,
  };
  const openAi = openAiConfig(env);
  const gemini = geminiConfig(env);
  const geminiForPayload = {
    ...gemini,
    voice: payload.bufferedGeminiVoice || gemini.voice,
  };
  if ((cacheOnly || cacheLookupOnly) && payload.wordOnly) return cacheOnlyResponse('uncacheable');
  let protectedRequest = false;
  let protectedLookup = false;
  async function protectAudioRequest() {
    if (protectedRequest) return;
    await protectTts(env, request, session, now);
    await protectDemoTtsFallback({ env, request, session, payload, now });
    protectedRequest = true;
  }
  async function protectLookupRequest() {
    if (protectedLookup) return;
    await protectTtsLookup(env, request, session, now);
    await protectDemoTtsLookup({ env, request, session, now });
    protectedLookup = true;
  }

  async function finish(response, fallbackFrom = '') {
    return await recordDemoTtsFallback(env, session, now, withFallbackHeader(response, fallbackFrom));
  }

  async function tryGemini(fallbackFrom = '') {
    if (!payload.wordOnly) {
      if (cacheLookupOnly) await protectLookupRequest();
      else if (!cacheOnly) await protectAudioRequest();
      const cacheHit = await readBufferedGeminiAudio(env, payload, { model: geminiForPayload.model });
      if (cacheHit?.object) {
        if (cacheLookupOnly) await protectAudioRequest();
        const output = cacheOnly ? cacheOnlyResponse('hit', cacheHit) : cachedGeminiAudioResponse(cacheHit);
        return cacheOnly ? output : await finish(output, fallbackFrom);
      }
      if (cacheLookupOnly && cacheHit?.cacheUnavailable) return cacheOnlyResponse('unavailable', cacheHit);
      if (cacheLookupOnly && !cacheHit?.metadata) return cacheOnlyResponse('uncacheable');
      if (cacheLookupOnly) return cacheOnlyResponse('miss', cacheHit);
      if (cacheOnly && cacheHit?.cacheUnavailable) return cacheOnlyResponse('unavailable', cacheHit);
      if (cacheOnly && !cacheHit?.metadata) return cacheOnlyResponse('uncacheable');
      if (cacheOnly) {
        if (!geminiForPayload.apiKey) return cacheOnlyResponse('unavailable');
        const warmupAllowed = await allowTtsWarmup(env, request, session, now);
        if (!warmupAllowed) return cacheOnlyResponse('skipped_rate_limited');
        await protectDemoTtsFallback({ env, request, session, payload, now });
      }
    }
    if (!geminiForPayload.apiKey) {
      if (cacheOnly) return cacheOnlyResponse('unavailable');
      throw missingProviderConfig('gemini');
    }
    if (!cacheOnly) await protectAudioRequest();
    const response = await requestGeminiSpeech({ config: geminiForPayload, payload, fetchFn });
    const stored = payload.wordOnly
      ? { response, cacheState: 'uncacheable' }
      : await storeBufferedGeminiAudio(env, payload, response, { model: geminiForPayload.model });
    const output = cacheOnly
      ? cacheOnlyResponse(stored.cacheState, { metadata: stored.metadata })
      : stored.response;
    return await finish(output, fallbackFrom);
  }

  async function tryOpenAi(fallbackFrom = '') {
    if (!openAi.apiKey) throw missingProviderConfig('openai');
    await protectAudioRequest();
    const response = await requestOpenAiSpeech({ config: openAi, payload, fetchFn });
    return await finish(response, fallbackFrom);
  }

  function canTryGemini() {
    if (payload.wordOnly) return Boolean(geminiForPayload.apiKey);
    return Boolean(geminiForPayload.apiKey || spellingAudioBucket(env));
  }

  if (payload.provider === 'gemini') {
    try {
      return await tryGemini();
    } catch (error) {
      if (cacheOnly && isProviderFailure(error, 'gemini')) {
        return await finish(cacheOnlyResponse('provider_failed'));
      }
      if (!canFallbackProviderError(error)) throw error;
      if (cacheOnly || !openAi.apiKey) throw providerUnavailableError(error, [error]);
      try {
        return await tryOpenAi('gemini');
      } catch (fallbackError) {
        if (!canFallbackProviderError(fallbackError)) throw fallbackError;
        throw backendUnavailableFromFailure(fallbackError, [error, fallbackError]);
      }
    }
  }

  try {
    return await tryOpenAi();
  } catch (error) {
    if (!canFallbackProviderError(error)) throw error;
    if (!canTryGemini()) throw providerUnavailableError(error, [error]);
    try {
      return await tryGemini('openai');
    } catch (fallbackError) {
      if (!canFallbackProviderError(fallbackError)) throw fallbackError;
      throw backendUnavailableFromFailure(fallbackError, [error, fallbackError]);
    }
  }
}
