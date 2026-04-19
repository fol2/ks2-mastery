const GEMINI_TTS_MODEL = "gemini-3.1-flash-tts-preview";
const GEMINI_TTS_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent`;
const OPENAI_TTS_ENDPOINT = "https://api.openai.com/v1/audio/speech";
const OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
const ELEVENLABS_TTS_ENDPOINT = "https://api.elevenlabs.io/v1/text-to-speech";
const ELEVENLABS_VOICES_ENDPOINT = "https://api.elevenlabs.io/v2/voices";
const ELEVENLABS_DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
const ELEVENLABS_TTS_MODELS = [
  "eleven_flash_v2_5",
  "eleven_turbo_v2_5",
  "eleven_v3",
];
const GEMINI_TTS_VOICES = [
  "Schedar",
  "Iapetus",
  "Kore",
  "Achird",
  "Sulafat",
];
const OPENAI_TTS_VOICES = [
  "alloy",
  "ash",
  "coral",
  "sage",
  "shimmer",
  "verse",
];
const FETCH_TIMEOUT_MS = 20000;
const GEMINI_MAX_RETRIES = 2;
const GEMINI_RETRY_BACKOFF_MS = [300, 800];
const ELEVENLABS_VOICE_CACHE_TTL_MS = 10 * 60 * 1000;

let elevenLabsVoicesCache = {
  key: "",
  loadedAt: 0,
  voices: [],
  promise: null,
};

function providerError(message, statusCode = 500, payload = null) {
  const error = new Error(String(message || "Speech generation failed."));
  error.statusCode = Number(statusCode) || 500;
  error.payload = payload;
  error.errorStatus = String(payload?.error?.status || "");
  return error;
}

function geminiApiKeys(env) {
  const primary = String(env.GEMINI_TTS_API_KEY || env.GEMINI_API_KEY || "").trim();
  const backup = String(env.GEMINI_TTS_BACKUP_API_KEY || env.GEMINI_BACKUP_API_KEY || "").trim();
  const keys = [];
  if (primary) keys.push({ apiKey: primary, slot: "primary" });
  if (backup && backup !== primary) keys.push({ apiKey: backup, slot: "backup" });
  return keys;
}

function openAiApiKey(env) {
  return String(env.OPENAI_TTS_API_KEY || env.OPENAI_API_KEY || "").trim();
}

function elevenLabsApiKey(env) {
  return String(env.ELEVENLABS_TTS_API_KEY || env.ELEVENLABS_API_KEY || "").trim();
}

export function ttsProviderConfig(env) {
  return {
    browser: true,
    gemini: geminiApiKeys(env).length > 0,
    openai: Boolean(openAiApiKey(env)),
    elevenlabs: Boolean(elevenLabsApiKey(env)),
  };
}

export function normaliseSpeechRequest(payload) {
  const provider = String(payload?.provider || "").trim().toLowerCase();
  const word = String(payload?.word || "").trim().slice(0, 80);
  const sentence = String(payload?.sentence || "").trim().replace(/\s+/g, " ").slice(0, 280);
  const voice = String(payload?.voice || "").trim().slice(0, 80);
  const model = String(payload?.model || "").trim().slice(0, 80);
  return {
    provider,
    word,
    sentence,
    voice,
    model,
    slow: Boolean(payload?.slow),
  };
}

function buildDictationTranscript(word, sentence) {
  const cleanWord = String(word || "").trim();
  const cleanSentence = String(sentence || "").trim();
  if (!cleanWord) return "";
  return cleanSentence
    ? `The word is ${cleanWord}. ${cleanSentence} The word is ${cleanWord}.`
    : `The word is ${cleanWord}. The word is ${cleanWord}.`;
}

function buildSpeechPrompt(word, sentence, slow) {
  const transcript = buildDictationTranscript(word, sentence);
  const paceDirection = slow
    ? "Speak slowly but crisply, with light spacing between phrases."
    : "Speak clearly at a brisk classroom dictation pace.";
  return [
    "Generate speech only.",
    "Do not speak any instructions, headings, or labels.",
    "Use formal UK English for a KS2 spelling dictation.",
    "Use a clear, neutral southern British classroom accent with precise enunciation.",
    "Sound like a careful primary teacher giving a spelling test.",
    "Avoid casual delivery and avoid American pronunciation.",
    paceDirection,
    "TRANSCRIPT:",
    transcript,
  ].join("\n");
}

function parseRetryDelayMs(value) {
  const match = String(value || "").match(/^([0-9]+(?:\.[0-9]+)?)s$/i);
  return match ? Math.round(Number(match[1]) * 1000) : 0;
}

function createProviderErrorFromPayload(message, statusCode, payload) {
  const error = providerError(message, statusCode, payload);
  const retryInfo = Array.isArray(payload?.error?.details)
    ? payload.error.details.find((detail) => detail?.["@type"] === "type.googleapis.com/google.rpc.RetryInfo")
    : null;
  error.retryDelayMs = retryInfo?.retryDelay ? parseRetryDelayMs(retryInfo.retryDelay) : 0;
  return error;
}

function isTransientGeminiError(error) {
  const status = Number(error?.statusCode) || 0;
  if (status === 408) return false;
  if (status >= 400 && status < 500) return false;
  return status === 0 || (status >= 500 && status < 600);
}

function isGeminiQuotaError(error) {
  const message = String(error?.message || "");
  const statusCode = Number(error?.statusCode) || 0;
  const errorStatus = String(error?.errorStatus || "");
  return statusCode === 429
    || /resource_exhausted/i.test(errorStatus)
    || /quota exceeded|current quota|retry in/i.test(message);
}

async function fetchWithTimeout(url, init = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw providerError("Timed out.", 408);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseGeminiAudioMimeType(mimeType) {
  const rateMatch = String(mimeType || "").match(/rate=(\d+)/i);
  const channelsMatch = String(mimeType || "").match(/channels=(\d+)/i);
  return {
    sampleRate: Number(rateMatch?.[1]) || 24000,
    channels: Number(channelsMatch?.[1]) || 1,
    bitsPerSample: 16,
  };
}

function decodeBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function pcmToWavArrayBuffer(base64Data, mimeType) {
  const pcmBytes = decodeBase64(base64Data);
  if (/audio\/wav/i.test(String(mimeType || ""))) {
    return pcmBytes.buffer.slice(pcmBytes.byteOffset, pcmBytes.byteOffset + pcmBytes.byteLength);
  }
  const info = parseGeminiAudioMimeType(mimeType);
  const sampleRate = info.sampleRate;
  const channels = info.channels;
  const bitsPerSample = info.bitsPerSample;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const buffer = new ArrayBuffer(44 + pcmBytes.length);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  function writeAscii(offset, text) {
    for (let index = 0; index < text.length; index += 1) {
      bytes[offset + index] = text.charCodeAt(index);
    }
  }

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + pcmBytes.length, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(36, "data");
  view.setUint32(40, pcmBytes.length, true);
  bytes.set(pcmBytes, 44);
  return buffer;
}

async function fetchGeminiSpeechWithKey(promptText, voiceName, apiKey) {
  const body = {
    contents: [{ parts: [{ text: promptText }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName } },
      },
    },
  };

  async function runOnce() {
    const response = await fetchWithTimeout(`${GEMINI_TTS_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    const parts = Array.isArray(payload?.candidates?.[0]?.content?.parts)
      ? payload.candidates[0].content.parts
      : [];
    const inlineData = parts.find((part) => part?.inlineData?.data);

    if (response.ok && inlineData?.inlineData) {
      return {
        body: pcmToWavArrayBuffer(inlineData.inlineData.data, inlineData.inlineData.mimeType),
        contentType: "audio/wav",
      };
    }

    const message = payload?.error?.message
      || (payload?.candidates?.[0]?.content ? "Gemini returned no audio." : `Gemini failed with status ${response.status}.`);
    throw createProviderErrorFromPayload(message, response.status, payload);
  }

  async function attempt(retriesDone) {
    try {
      return await runOnce();
    } catch (error) {
      if (retriesDone >= GEMINI_MAX_RETRIES || !isTransientGeminiError(error)) throw error;
      const delayMs = GEMINI_RETRY_BACKOFF_MS[retriesDone] || 800;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return attempt(retriesDone + 1);
    }
  }

  return attempt(0);
}

async function fetchGeminiSpeech(env, promptText, voiceName) {
  const keys = geminiApiKeys(env);
  if (!keys.length) throw providerError("Gemini is not configured on the server.", 400);

  let lastError = null;
  for (const entry of keys) {
    try {
      return await fetchGeminiSpeechWithKey(promptText, voiceName, entry.apiKey);
    } catch (error) {
      lastError = error;
      if (isGeminiQuotaError(error)) continue;
      throw error;
    }
  }
  throw lastError || providerError("Gemini could not generate speech.", 502);
}

async function buildHttpAudioError(response) {
  const rawText = await response.text();
  let payload = null;
  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch (error) {
    payload = null;
  }
  const message = payload?.error?.message
    || payload?.detail?.message
    || rawText
    || `Speech provider failed with status ${response.status}.`;
  return providerError(message, response.status, payload);
}

async function fetchBinaryAudio(url, headers, body) {
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) throw await buildHttpAudioError(response);

  const audioBuffer = await response.arrayBuffer();
  if (!audioBuffer.byteLength) {
    throw providerError("The provider returned no audio.", response.status);
  }

  return {
    body: audioBuffer,
    contentType: String(response.headers.get("content-type") || "audio/mpeg"),
  };
}

function normaliseElevenLabsVoice(voice) {
  const labels = voice?.labels || {};
  return {
    voiceId: String(voice?.voice_id || ""),
    name: String(voice?.name || "Voice"),
    category: String(voice?.category || "library"),
    accent: String(labels.accent || ""),
    language: String(labels.language || ""),
    description: String(labels.descriptive || labels.use_case || ""),
  };
}

function scoreElevenLabsVoice(voice) {
  let score = 0;
  if (/british/i.test(voice.accent)) score += 120;
  if (/uk|british/i.test(voice.name)) score += 90;
  if (voice.category === "premade") score += 40;
  if (/^en/i.test(voice.language)) score += 20;
  return score;
}

export async function listElevenLabsVoices(env) {
  const apiKey = elevenLabsApiKey(env);
  if (!apiKey) throw providerError("ElevenLabs is not configured on the server.", 400);

  const cacheFresh = elevenLabsVoicesCache.key === apiKey
    && elevenLabsVoicesCache.voices.length
    && (Date.now() - elevenLabsVoicesCache.loadedAt) < ELEVENLABS_VOICE_CACHE_TTL_MS;
  if (cacheFresh) return elevenLabsVoicesCache.voices;

  if (elevenLabsVoicesCache.promise && elevenLabsVoicesCache.key === apiKey) {
    return elevenLabsVoicesCache.promise;
  }

  elevenLabsVoicesCache = {
    ...elevenLabsVoicesCache,
    key: apiKey,
    promise: fetchWithTimeout(ELEVENLABS_VOICES_ENDPOINT, {
      headers: { "xi-api-key": apiKey },
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw providerError(
            payload?.detail?.message || `ElevenLabs voices failed with status ${response.status}.`,
            response.status,
            payload,
          );
        }
        const voices = Array.isArray(payload?.voices)
          ? payload.voices.map(normaliseElevenLabsVoice)
          : [];
        const sorted = voices
          .filter((voice) => voice.voiceId)
          .sort((left, right) => (scoreElevenLabsVoice(right) - scoreElevenLabsVoice(left)) || left.name.localeCompare(right.name));
        elevenLabsVoicesCache = {
          key: apiKey,
          loadedAt: Date.now(),
          voices: sorted,
          promise: null,
        };
        return sorted;
      })
      .catch((error) => {
        elevenLabsVoicesCache = {
          key: apiKey,
          loadedAt: 0,
          voices: [],
          promise: null,
        };
        throw error;
      }),
  };

  return elevenLabsVoicesCache.promise;
}

async function fetchOpenAiSpeech(env, transcript, voiceName) {
  const apiKey = openAiApiKey(env);
  if (!apiKey) throw providerError("OpenAI is not configured on the server.", 400);
  return fetchBinaryAudio(OPENAI_TTS_ENDPOINT, {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  }, {
    model: OPENAI_TTS_MODEL,
    voice: voiceName,
    input: transcript,
    format: "mp3",
  });
}

async function fetchElevenLabsSpeech(env, transcript, voiceId, modelName) {
  const apiKey = elevenLabsApiKey(env);
  if (!apiKey) throw providerError("ElevenLabs is not configured on the server.", 400);
  return fetchBinaryAudio(
    `${ELEVENLABS_TTS_ENDPOINT}/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    {
      text: transcript,
      model_id: modelName,
    },
  );
}

export async function synthesiseSpeech(env, rawPayload) {
  const payload = normaliseSpeechRequest(rawPayload);
  if (!payload.word) throw providerError("A word is required.", 400);

  if (payload.provider === "gemini") {
    if (!ttsProviderConfig(env).gemini) throw providerError("Gemini is not configured on the server.", 400);
    const voice = GEMINI_TTS_VOICES.includes(payload.voice) ? payload.voice : GEMINI_TTS_VOICES[0];
    return fetchGeminiSpeech(env, buildSpeechPrompt(payload.word, payload.sentence, payload.slow), voice);
  }

  if (payload.provider === "openai") {
    if (!ttsProviderConfig(env).openai) throw providerError("OpenAI is not configured on the server.", 400);
    const voice = OPENAI_TTS_VOICES.includes(payload.voice) ? payload.voice : OPENAI_TTS_VOICES[0];
    return fetchOpenAiSpeech(env, buildDictationTranscript(payload.word, payload.sentence), voice);
  }

  if (payload.provider === "elevenlabs") {
    if (!ttsProviderConfig(env).elevenlabs) throw providerError("ElevenLabs is not configured on the server.", 400);
    const model = ELEVENLABS_TTS_MODELS.includes(payload.model) ? payload.model : ELEVENLABS_TTS_MODELS[0];
    const voice = payload.voice || ELEVENLABS_DEFAULT_VOICE_ID;
    return fetchElevenLabsSpeech(env, buildDictationTranscript(payload.word, payload.sentence), voice, model);
  }

  if (payload.provider === "browser") {
    throw providerError("Browser speech is generated on the device.", 400);
  }

  throw providerError("That speech provider is not supported.", 400);
}
