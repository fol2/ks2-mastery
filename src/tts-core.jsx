// Unified TTS layer for the KS2 spelling feature.
// Ports the four-provider pipeline from legacy preview.html (~800 lines)
// into a single window.KS2_TTS API consumed by the dashboard, settings,
// and spelling game. Engine semantics (voice scoring, Gemini quota,
// caching, UK classroom prompt) are verbatim.
//
// Providers: browser (Web Speech), gemini, openai, elevenlabs.
// Public surface: window.KS2_TTS (see bottom of file).
//
// Legacy line refs:
//   Browser voice scoring ..... 1167-1177
//   ElevenLabs voice scoring .. 1144-1153
//   Dictation transcript ...... 1648-1653
//   Gemini speech prompt ...... 1655-1672
//   Gemini quota state ........ 1362-1487
//   Gemini fetch + failover ... 1678-1826
//   OpenAI / ElevenLabs fetch . 1867-1928
//   speak orchestration ....... 3004-3062
//   Warmup prefetch ........... 1953-1958

(function () {
  // ----- constants (verbatim from legacy 879-918) ---------------------------

  var GEMINI_TTS_MODEL = "gemini-3.1-flash-tts-preview";
  var GEMINI_API_KEY_STORAGE_KEY = "ks2-spelling-gemini-api-key";
  var GEMINI_BACKUP_API_KEY_STORAGE_KEY = "ks2-spelling-gemini-api-key-backup";
  var GEMINI_QUOTA_STORAGE_KEY = "ks2-spelling-gemini-quota-state";
  var OPENAI_API_KEY_STORAGE_KEY = "ks2-spelling-openai-api-key";
  var ELEVENLABS_API_KEY_STORAGE_KEY = "ks2-spelling-elevenlabs-api-key";
  var AUDIO_ENGINE_STORAGE_KEY = "ks2-spelling-audio-engine";
  var BROWSER_VOICE_STORAGE_KEY = "ks2-spelling-browser-voice";
  var GEMINI_VOICE_STORAGE_KEY = "ks2-spelling-gemini-voice";
  var OPENAI_VOICE_STORAGE_KEY = "ks2-spelling-openai-voice";
  var ELEVENLABS_VOICE_STORAGE_KEY = "ks2-spelling-elevenlabs-voice";
  var ELEVENLABS_MODEL_STORAGE_KEY = "ks2-spelling-elevenlabs-model";
  var PLAYBACK_RATE_STORAGE_KEY = "ks2-spelling-playback-rate";

  var GEMINI_TTS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_TTS_MODEL + ":generateContent";
  var OPENAI_TTS_ENDPOINT = "https://api.openai.com/v1/audio/speech";
  var OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
  var ELEVENLABS_TTS_ENDPOINT = "https://api.elevenlabs.io/v1/text-to-speech";
  var ELEVENLABS_VOICES_ENDPOINT = "https://api.elevenlabs.io/v2/voices";

  var GEMINI_TTS_VOICES = [
    ["Schedar", "Even"],
    ["Iapetus", "Clear"],
    ["Kore", "Firm"],
    ["Achird", "Friendly"],
    ["Sulafat", "Warm"],
  ];
  var OPENAI_TTS_VOICES = [
    ["alloy", "Balanced"],
    ["ash", "Warm"],
    ["coral", "Bright"],
    ["sage", "Measured"],
    ["shimmer", "Light"],
    ["verse", "Narrative"],
  ];
  var ELEVENLABS_TTS_MODELS = [
    ["eleven_flash_v2_5", "Flash v2.5"],
    ["eleven_turbo_v2_5", "Turbo v2.5"],
    ["eleven_v3", "Eleven v3"],
  ];
  var ELEVENLABS_DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

  var GEMINI_LOCAL_RPM_LIMIT = 10;
  var GEMINI_LOCAL_RPD_LIMIT = 100;
  var GEMINI_FETCH_TIMEOUT_MS = 20000;
  var AUDIO_CACHE_LIMIT = 18;
  var DEFAULT_RATE = 1.05;
  var SLOW_DELTA = 0.12;
  var MIN_RATE = 0.92;

  // ----- module-local state -------------------------------------------------

  var audioPlayer = new Audio();
  var audioBlobCache = new Map();
  var audioPendingCache = new Map();
  var activeSpeakRequest = 0;
  var speakAbortController = null;
  var activeAudioUrl = "";
  var geminiBackoffUntil = 0;
  var geminiBackoffReason = "";
  var elevenLabsVoices = [];
  var elevenLabsVoicesKey = "";
  var elevenLabsVoicesPromise = null;
  var listeners = new Set(); // config-change subscribers

  // ----- localStorage helpers (legacy 988-1004) -----------------------------

  function loadStoredValue(key) {
    if (!key) return "";
    try {
      return String(localStorage.getItem(key) || "");
    } catch (err) {
      return "";
    }
  }

  function saveStoredValue(key, value) {
    if (!key) return;
    try {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    } catch (err) {
      // ignore; prefs are optional
    }
  }

  // ----- general helpers ----------------------------------------------------

  function parseRetryDelayMs(value) {
    var match = String(value || "").match(/^([0-9]+(?:\.[0-9]+)?)s$/i);
    return match ? Math.round(Number(match[1]) * 1000) : 0;
  }

  function formatDurationShort(ms) {
    var totalMinutes = Math.max(1, Math.ceil(ms / 60000));
    var hours = Math.floor(totalMinutes / 60);
    var minutes = totalMinutes % 60;
    if (hours && minutes) return hours + "h " + minutes + "m";
    if (hours) return hours + "h";
    return minutes + "m";
  }

  function hashString(value) {
    var hash = 2166136261;
    for (var i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function makeAbortError() {
    try { return new DOMException("Aborted", "AbortError"); }
    catch (err) {
      var abortError = new Error("Aborted");
      abortError.name = "AbortError";
      return abortError;
    }
  }

  function isAbortError(error) { return Boolean(error && error.name === "AbortError"); }

  function withAbortSignal(promise, signal) {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(makeAbortError());
    return new Promise(function (resolve, reject) {
      function onAbort() { reject(makeAbortError()); }
      signal.addEventListener("abort", onAbort, { once: true });
      promise.then(
        function (value) { signal.removeEventListener("abort", onAbort); resolve(value); },
        function (error) { signal.removeEventListener("abort", onAbort); reject(error); }
      );
    });
  }

  // ----- cache (legacy 1326-1337, 1828-1848) --------------------------------

  function cacheAudioBlob(cacheKey, audioBlob) {
    if (audioBlobCache.has(cacheKey)) audioBlobCache.delete(cacheKey);
    audioBlobCache.set(cacheKey, audioBlob);
    while (audioBlobCache.size > AUDIO_CACHE_LIMIT) {
      var oldestKey = audioBlobCache.keys().next().value;
      if (!oldestKey) break;
      audioBlobCache.delete(oldestKey);
    }
  }

  function makeSpeechCacheKey(provider, modelName, voiceName, sourceText) {
    return provider + "||" + modelName + "||" + voiceName + "||" + sourceText;
  }

  function requestCachedSpeechAudio(cacheKey, fetcher, signal) {
    if (audioBlobCache.has(cacheKey)) return Promise.resolve(audioBlobCache.get(cacheKey));

    var pendingPromise = audioPendingCache.get(cacheKey);
    if (!pendingPromise) {
      pendingPromise = Promise.resolve()
        .then(fetcher)
        .then(function (audioBlob) { cacheAudioBlob(cacheKey, audioBlob); return audioBlob; })
        .finally(function () { audioPendingCache.delete(cacheKey); });
      audioPendingCache.set(cacheKey, pendingPromise);
    }
    return withAbortSignal(pendingPromise, signal);
  }

  function revokeActiveAudioUrl() {
    if (!activeAudioUrl) return;
    URL.revokeObjectURL(activeAudioUrl);
    activeAudioUrl = "";
  }

  // ----- transcript + Gemini prompt (legacy 1648-1672) ----------------------

  function buildDictationTranscript(word, sentence) {
    var slug = typeof word === "string" ? word : word.word;
    var cleanSentence = String(sentence || "").trim();
    return cleanSentence
      ? "The word is " + slug + ". " + cleanSentence + " The word is " + slug + "."
      : "The word is " + slug + ". The word is " + slug + ".";
  }

  function buildSpeechPrompt(word, sentence, slow) {
    var transcript = buildDictationTranscript(word, sentence);
    var paceDirection = slow
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

  // ----- provider-generic config (legacy 1040-1058) -------------------------

  function providerLabel(provider) {
    if (provider === "gemini") return "Gemini";
    if (provider === "openai") return "OpenAI";
    if (provider === "elevenlabs") return "ElevenLabs";
    return "Browser";
  }

  function providerApiKeyStorageKey(provider) {
    if (provider === "gemini") return GEMINI_API_KEY_STORAGE_KEY;
    if (provider === "openai") return OPENAI_API_KEY_STORAGE_KEY;
    if (provider === "elevenlabs") return ELEVENLABS_API_KEY_STORAGE_KEY;
    return "";
  }

  function providerVoiceStorageKey(provider) {
    if (provider === "browser") return BROWSER_VOICE_STORAGE_KEY;
    if (provider === "gemini") return GEMINI_VOICE_STORAGE_KEY;
    if (provider === "openai") return OPENAI_VOICE_STORAGE_KEY;
    if (provider === "elevenlabs") return ELEVENLABS_VOICE_STORAGE_KEY;
    return "";
  }

  function providerModelStorageKey(provider) {
    if (provider === "elevenlabs") return ELEVENLABS_MODEL_STORAGE_KEY;
    return "";
  }

  function providerNeedsApiKey(provider) { return provider !== "browser"; }

  function defaultVoiceForProvider(provider) {
    if (provider === "gemini") return "Schedar";
    if (provider === "openai") return "alloy";
    if (provider === "elevenlabs") return ELEVENLABS_DEFAULT_VOICE_ID;
    return "";
  }

  function providerModelOptions(provider) {
    if (provider === "browser") return [["browser-device", "Device voice"]];
    if (provider === "gemini") return [[GEMINI_TTS_MODEL, GEMINI_TTS_MODEL]];
    if (provider === "openai") return [[OPENAI_TTS_MODEL, OPENAI_TTS_MODEL]];
    return ELEVENLABS_TTS_MODELS.slice();
  }

  function browserSupportsSpeech() {
    return typeof window !== "undefined"
      && "speechSynthesis" in window
      && "SpeechSynthesisUtterance" in window;
  }

  function loadAudioEngine() {
    var stored = loadStoredValue(AUDIO_ENGINE_STORAGE_KEY);
    if (stored === "browser" || stored === "gemini" || stored === "openai" || stored === "elevenlabs") return stored;
    return browserSupportsSpeech() ? "browser" : "gemini";
  }

  function loadPlaybackRate() {
    var raw = Number(loadStoredValue(PLAYBACK_RATE_STORAGE_KEY));
    if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_RATE;
    return Math.max(0.9, Math.min(1.25, raw));
  }

  function loadGeminiApiKeys() {
    var primary = String(loadStoredValue(GEMINI_API_KEY_STORAGE_KEY) || "").trim();
    var backup = String(loadStoredValue(GEMINI_BACKUP_API_KEY_STORAGE_KEY) || "").trim();
    var keys = [];
    if (primary) keys.push({ apiKey: primary, slot: "primary" });
    if (backup && backup !== primary) keys.push({ apiKey: backup, slot: "backup" });
    return keys;
  }

  // ----- Browser voice scoring (legacy 1167-1204) ---------------------------

  function scoreBrowserVoice(voice) {
    var score = 0;
    if (/Google UK English Female/i.test(voice.name)) score += 120;
    else if (/Google UK English Male/i.test(voice.name)) score += 110;
    else if (/Google UK English/i.test(voice.name)) score += 100;
    if (/^en-GB$/i.test(voice.lang)) score += 40;
    if (/british|united kingdom/i.test(voice.name)) score += 35;
    if (/Google/i.test(voice.name)) score += 10;
    if (/^en/i.test(voice.lang)) score += 5;
    return score;
  }

  function listBrowserVoices() {
    if (!browserSupportsSpeech()) return [];
    var allVoices = window.speechSynthesis.getVoices().slice();
    var preferred = allVoices.filter(function (voice) { return scoreBrowserVoice(voice) > 0; });
    var pool = preferred.length ? preferred : allVoices.filter(function (voice) { return /^en/i.test(voice.lang); });
    return pool
      .sort(function (a, b) { return (scoreBrowserVoice(b) - scoreBrowserVoice(a)) || a.name.localeCompare(b.name); })
      .filter(function (voice, index, array) {
        return array.findIndex(function (item) { return item.voiceURI === voice.voiceURI; }) === index;
      });
  }

  function selectedBrowserVoice() {
    var voices = listBrowserVoices();
    if (!voices.length) return null;
    var voiceUri = loadStoredValue(BROWSER_VOICE_STORAGE_KEY);
    return voices.find(function (voice) { return voice.voiceURI === voiceUri; }) || voices[0];
  }

  function browserVoiceReadyText() {
    var voice = selectedBrowserVoice();
    if (!voice) return "Browser speech unavailable.";
    if (/Google UK English/i.test(voice.name)) return "Google UK browser TTS ready.";
    if (/^en-GB$/i.test(voice.lang)) return "Browser UK TTS ready.";
    return "Browser English TTS ready.";
  }

  function speakBrowserText(text, rate, voiceUri) {
    if (!browserSupportsSpeech()) return Promise.reject(new Error("Browser speech unavailable."));
    window.speechSynthesis.cancel();
    return new Promise(function (resolve, reject) {
      var utterance = new SpeechSynthesisUtterance(text);
      var voices = listBrowserVoices();
      var voice = voices.find(function (item) { return item.voiceURI === voiceUri; }) || voices[0] || null;
      utterance.lang = (voice && voice.lang) ? voice.lang : "en-GB";
      utterance.rate = rate;
      utterance.pitch = 1;
      if (voice) utterance.voice = voice;
      utterance.onend = function () { resolve(); };
      utterance.onerror = function () { reject(new Error("Browser speech unavailable.")); };
      window.speechSynthesis.speak(utterance);
    });
  }

  // ----- ElevenLabs voice catalog (legacy 1144-1267) ------------------------

  function scoreElevenLabsVoice(voice) {
    var accent = String(voice.accent || "");
    var language = String(voice.language || "");
    var score = 0;
    if (/british/i.test(accent)) score += 120;
    if (/uk|british/i.test(voice.name)) score += 90;
    if (voice.category === "premade") score += 40;
    if (/^en/i.test(language)) score += 20;
    return score;
  }

  function normaliseElevenLabsVoice(voice) {
    var labels = (voice && voice.labels) ? voice.labels : {};
    return {
      voiceId: voice.voice_id,
      name: voice.name || "Voice",
      category: voice.category || "library",
      accent: labels.accent || "",
      language: labels.language || "",
      description: labels.descriptive || labels.use_case || "",
    };
  }

  function fetchElevenLabsVoices(apiKey) {
    var requestController = new AbortController();
    var timeoutId = window.setTimeout(function () { requestController.abort(); }, GEMINI_FETCH_TIMEOUT_MS);
    return fetch(ELEVENLABS_VOICES_ENDPOINT, {
      headers: { "xi-api-key": apiKey },
      signal: requestController.signal,
    })
      .then(function (response) {
        return response.text().then(function (rawText) {
          var payload = null;
          try { payload = rawText ? JSON.parse(rawText) : null; } catch (err) { payload = null; }
          if (!response.ok) {
            var message = (payload && payload.detail && payload.detail.message)
              ? payload.detail.message
              : ("ElevenLabs voices failed with status " + response.status + ".");
            throw createProviderError(message, response.status, payload);
          }
          return Array.isArray(payload && payload.voices)
            ? payload.voices.map(normaliseElevenLabsVoice)
            : [];
        });
      })
      .catch(function (err) {
        if (requestController.signal.aborted) {
          throw createProviderError("ElevenLabs voices timed out.", 408, null);
        }
        throw err;
      })
      .finally(function () { window.clearTimeout(timeoutId); });
  }

  function ensureElevenLabsVoices(apiKey) {
    if (!apiKey) return Promise.resolve([]);
    if (elevenLabsVoicesKey === apiKey && elevenLabsVoices.length) return Promise.resolve(elevenLabsVoices);
    if (elevenLabsVoicesPromise) return elevenLabsVoicesPromise;
    elevenLabsVoicesPromise = fetchElevenLabsVoices(apiKey)
      .then(function (voices) {
        var sorted = voices.slice().sort(function (a, b) {
          return (scoreElevenLabsVoice(b) - scoreElevenLabsVoice(a)) || a.name.localeCompare(b.name);
        });
        elevenLabsVoices = sorted;
        elevenLabsVoicesKey = apiKey;
        return sorted;
      })
      .finally(function () { elevenLabsVoicesPromise = null; });
    return elevenLabsVoicesPromise;
  }

  // ----- Gemini quota (legacy 1353-1487) ------------------------------------

  function geminiQuotaEntryId(apiKey, slot) { return slot + "-" + hashString(apiKey); }
  function geminiMinuteWindow(now) { return Math.floor((now || Date.now()) / 60000); }

  function geminiPacificDayKey(now) {
    var ts = now || Date.now();
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Los_Angeles",
        year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date(ts));
    } catch (err) {
      return new Date(ts).toISOString().slice(0, 10);
    }
  }

  function geminiRetryUntilNextDay(now) {
    var ts = now || Date.now();
    var currentDay = geminiPacificDayKey(ts);
    for (var step = 60000; step <= 36 * 60 * 60 * 1000; step += 60000) {
      if (geminiPacificDayKey(ts + step) !== currentDay) return step;
    }
    return 12 * 60 * 60 * 1000;
  }

  function loadGeminiQuotaState() {
    var raw = loadStoredValue(GEMINI_QUOTA_STORAGE_KEY);
    if (!raw) return {};
    try { var parsed = JSON.parse(raw); return (parsed && typeof parsed === "object") ? parsed : {}; }
    catch (err) { return {}; }
  }

  function saveGeminiQuotaState(state) { saveStoredValue(GEMINI_QUOTA_STORAGE_KEY, JSON.stringify(state)); }

  function ensureGeminiQuotaEntry(state, apiKey, slot, now) {
    var ts = now || Date.now();
    var entryId = geminiQuotaEntryId(apiKey, slot);
    var minuteWindow = geminiMinuteWindow(ts);
    var dayKey = geminiPacificDayKey(ts);
    var entry = state[entryId] || { minuteWindow: minuteWindow, minuteCount: 0, dayKey: dayKey, dayCount: 0, remoteBackoffUntil: 0 };
    if (entry.minuteWindow !== minuteWindow) { entry.minuteWindow = minuteWindow; entry.minuteCount = 0; }
    if (entry.dayKey !== dayKey) { entry.dayKey = dayKey; entry.dayCount = 0; }
    if (Number(entry.remoteBackoffUntil) < ts) entry.remoteBackoffUntil = 0;
    state[entryId] = entry;
    return entry;
  }

  function geminiKeyLimitStatus(apiKey, slot, now) {
    var ts = now || Date.now();
    var state = loadGeminiQuotaState();
    var entry = ensureGeminiQuotaEntry(state, apiKey, slot, ts);
    saveGeminiQuotaState(state);
    if (entry.remoteBackoffUntil > ts) {
      return { ok: false, retryDelayMs: entry.remoteBackoffUntil - ts, reason: "Gemini quota hit." };
    }
    if (entry.minuteCount >= GEMINI_LOCAL_RPM_LIMIT) {
      return { ok: false, retryDelayMs: ((entry.minuteWindow + 1) * 60000) - ts, reason: "Gemini local cap " + GEMINI_LOCAL_RPM_LIMIT + " RPM." };
    }
    if (entry.dayCount >= GEMINI_LOCAL_RPD_LIMIT) {
      return { ok: false, retryDelayMs: geminiRetryUntilNextDay(ts), reason: "Gemini local cap " + GEMINI_LOCAL_RPD_LIMIT + " RPD." };
    }
    return { ok: true, retryDelayMs: 0, reason: "" };
  }

  function reserveGeminiKeyUsage(apiKey, slot, now) {
    var ts = now || Date.now();
    var state = loadGeminiQuotaState();
    var entry = ensureGeminiQuotaEntry(state, apiKey, slot, ts);
    entry.minuteCount += 1;
    entry.dayCount += 1;
    saveGeminiQuotaState(state);
  }

  function setGeminiKeyBackoff(apiKey, slot, retryDelayMs, now) {
    var ts = now || Date.now();
    var state = loadGeminiQuotaState();
    var entry = ensureGeminiQuotaEntry(state, apiKey, slot, ts);
    var delayMs = Math.max(retryDelayMs || 0, 60000);
    entry.remoteBackoffUntil = Math.max(Number(entry.remoteBackoffUntil) || 0, ts + delayMs);
    saveGeminiQuotaState(state);
  }

  function clearGeminiKeyBackoff(apiKey, slot, now) {
    var ts = now || Date.now();
    var state = loadGeminiQuotaState();
    var entry = ensureGeminiQuotaEntry(state, apiKey, slot, ts);
    entry.remoteBackoffUntil = 0;
    saveGeminiQuotaState(state);
  }

  function createProviderError(message, statusCode, payload) {
    var error = new Error(message);
    error.statusCode = Number(statusCode) || 0;
    error.errorStatus = (payload && payload.error && payload.error.status) ? String(payload.error.status) : "";
    var retryInfo = (payload && payload.error && Array.isArray(payload.error.details))
      ? payload.error.details.find(function (detail) { return detail && detail["@type"] === "type.googleapis.com/google.rpc.RetryInfo"; })
      : null;
    error.retryDelayMs = (retryInfo && retryInfo.retryDelay) ? parseRetryDelayMs(retryInfo.retryDelay) : 0;
    return error;
  }

  function isGeminiQuotaError(error) {
    var message = String((error && error.message) || "");
    var statusCode = Number(error && error.statusCode) || 0;
    var errorStatus = String((error && error.errorStatus) || "");
    return statusCode === 429
      || /RESOURCE_EXHAUSTED/i.test(errorStatus)
      || /quota exceeded|current quota|retry in/i.test(message);
  }

  function geminiBackoffActive() { return geminiBackoffUntil > Date.now(); }
  function clearGeminiBackoff() { geminiBackoffUntil = 0; geminiBackoffReason = ""; }
  function setGeminiBackoff(error) {
    if (!isGeminiQuotaError(error)) return;
    var retryDelayMs = Math.max(Number(error && error.retryDelayMs) || 0, 5 * 60 * 1000);
    geminiBackoffUntil = Date.now() + retryDelayMs;
    geminiBackoffReason = "Gemini quota hit. Retry in ~" + formatDurationShort(retryDelayMs) + ".";
  }

  function providerErrorText(provider, error) {
    if (provider === "gemini" && geminiBackoffActive()) return geminiBackoffReason || "Gemini quota hit.";
    var message = String((error && error.message) || "").replace(/\s+/g, " ").trim();
    if (provider === "gemini" && isGeminiQuotaError(error)) return geminiBackoffReason || "Gemini quota hit.";
    if (/timed out/i.test(message)) return providerLabel(provider) + " timed out.";
    if (/paid_plan_required/i.test(message)) return providerLabel(provider) + " paid voice.";
    if (/quota exceeded|current quota|resource_exhausted/i.test(message)) return providerLabel(provider) + " quota hit.";
    if (!message) return providerLabel(provider) + " error.";
    var compact = message.length > 72 ? (message.slice(0, 69) + "...") : message;
    return providerLabel(provider) + ": " + compact;
  }

  // ----- Gemini PCM→WAV (legacy 1592-1646) ----------------------------------

  function parseGeminiAudioMimeType(mimeType) {
    var rateMatch = String(mimeType || "").match(/rate=(\d+)/i);
    var channelsMatch = String(mimeType || "").match(/channels=(\d+)/i);
    return {
      sampleRate: Number(rateMatch && rateMatch[1]) || 24000,
      channels: Number(channelsMatch && channelsMatch[1]) || 1,
      bitsPerSample: 16,
    };
  }

  function decodeBase64(base64) {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function pcmToWavBlob(base64Data, mimeType) {
    var pcmBytes = decodeBase64(base64Data);
    if (/audio\/wav/i.test(String(mimeType || ""))) {
      return new Blob([pcmBytes], { type: "audio/wav" });
    }
    var info = parseGeminiAudioMimeType(mimeType);
    var sampleRate = info.sampleRate;
    var channels = info.channels;
    var bitsPerSample = info.bitsPerSample;
    var bytesPerSample = bitsPerSample / 8;
    var blockAlign = channels * bytesPerSample;
    var byteRate = sampleRate * blockAlign;
    var buffer = new ArrayBuffer(44 + pcmBytes.length);
    var view = new DataView(buffer);
    function writeAscii(offset, text) {
      for (var i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
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
    new Uint8Array(buffer, 44).set(pcmBytes);
    return new Blob([buffer], { type: "audio/wav" });
  }

  // ----- Gemini fetch (legacy 1678-1826) ------------------------------------

  function fetchGeminiSpeechWithKey(promptText, voiceName, apiKey) {
    var body = {
      contents: [{ parts: [{ text: promptText }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } },
        },
      },
    };

    function attempt(attemptNumber) {
      var requestController = new AbortController();
      var timeoutId = window.setTimeout(function () { requestController.abort(); }, GEMINI_FETCH_TIMEOUT_MS);
      return fetch(GEMINI_TTS_ENDPOINT + "?key=" + encodeURIComponent(apiKey), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: requestController.signal,
      })
        .then(function (response) {
          return response.json().catch(function () { return null; }).then(function (payload) {
            return { response: response, payload: payload };
          });
        })
        .then(function (result) {
          var response = result.response;
          var payload = result.payload;
          var parts = (payload && payload.candidates && payload.candidates[0] && payload.candidates[0].content && Array.isArray(payload.candidates[0].content.parts))
            ? payload.candidates[0].content.parts
            : [];
          var inlineData = parts.length ? parts.find(function (part) { return part.inlineData && part.inlineData.data; }) : null;
          if (response.ok && inlineData && inlineData.inlineData) {
            clearGeminiBackoff();
            return pcmToWavBlob(inlineData.inlineData.data, inlineData.inlineData.mimeType);
          }
          var errorMessage = (payload && payload.error && payload.error.message)
            ? payload.error.message
            : ((payload && payload.candidates && payload.candidates[0] && payload.candidates[0].content)
              ? "Gemini TTS returned no audio."
              : ("Gemini TTS failed with status " + response.status + "."));
          var error = createProviderError(errorMessage, response.status, payload);
          if (attemptNumber === 1 || response.status < 500) throw error;
          return attempt(attemptNumber + 1);
        })
        .catch(function (err) {
          var timedOut = requestController.signal.aborted;
          if (timedOut) throw createProviderError("Gemini TTS timed out.", 408, null);
          if (attemptNumber === 1) throw err;
          return attempt(attemptNumber + 1);
        })
        .finally(function () { window.clearTimeout(timeoutId); });
    }

    return attempt(0);
  }

  function fetchGeminiSpeech(promptText, voiceName) {
    var geminiKeys = loadGeminiApiKeys();
    if (!geminiKeys.length) return Promise.reject(createProviderError("Add Gemini key.", 401, null));

    var lastError = null;
    var earliestRetryMs = 0;
    var quotaBlocked = false;

    function tryNext(index) {
      if (index >= geminiKeys.length) {
        if (quotaBlocked) {
          var retryDelayMs = Math.max(earliestRetryMs || 0, 60000);
          geminiBackoffUntil = Date.now() + retryDelayMs;
          geminiBackoffReason = "Gemini cap hit. Retry in ~" + formatDurationShort(retryDelayMs) + ".";
          return Promise.reject(createProviderError(geminiBackoffReason, 429, { error: { status: "RESOURCE_EXHAUSTED" } }));
        }
        return Promise.reject(lastError || createProviderError("Gemini TTS failed.", 0, null));
      }
      var entry = geminiKeys[index];
      var localStatus = geminiKeyLimitStatus(entry.apiKey, entry.slot);
      if (!localStatus.ok) {
        quotaBlocked = true;
        if (!earliestRetryMs || localStatus.retryDelayMs < earliestRetryMs) earliestRetryMs = localStatus.retryDelayMs;
        return tryNext(index + 1);
      }
      reserveGeminiKeyUsage(entry.apiKey, entry.slot);
      return fetchGeminiSpeechWithKey(promptText, voiceName, entry.apiKey)
        .then(function (audioBlob) {
          clearGeminiKeyBackoff(entry.apiKey, entry.slot);
          clearGeminiBackoff();
          return audioBlob;
        })
        .catch(function (error) {
          lastError = error;
          if (isGeminiQuotaError(error)) {
            quotaBlocked = true;
            var retryDelayMs = Number(error && error.retryDelayMs) || geminiRetryUntilNextDay();
            setGeminiKeyBackoff(entry.apiKey, entry.slot, retryDelayMs);
            if (!earliestRetryMs || retryDelayMs < earliestRetryMs) earliestRetryMs = retryDelayMs;
            return tryNext(index + 1);
          }
          throw error;
        });
    }
    return tryNext(0);
  }

  function requestGeminiSpeech(promptText, voiceName, signal) {
    var cacheKey = makeSpeechCacheKey("gemini", GEMINI_TTS_MODEL, voiceName, promptText);
    return requestCachedSpeechAudio(cacheKey, function () {
      return fetchGeminiSpeech(promptText, voiceName).catch(function (error) {
        if (isGeminiQuotaError(error) && !geminiBackoffActive()) setGeminiBackoff(error);
        throw error;
      });
    }, signal);
  }

  // ----- OpenAI / ElevenLabs fetch (legacy 1850-1928) ----------------------

  function buildHttpAudioError(provider, response) {
    return response.text().then(function (rawText) {
      var payload = null;
      try { payload = rawText ? JSON.parse(rawText) : null; } catch (err) { payload = null; }
      var message = (payload && payload.error && payload.error.message)
        ? payload.error.message
        : (payload && payload.detail && payload.detail.message)
          ? payload.detail.message
          : (rawText || (providerLabel(provider) + " failed with status " + response.status + "."));
      return createProviderError(String(message).replace(/\s+/g, " ").trim(), response.status, payload);
    });
  }

  function fetchBinaryAudio(provider, url, headers, body) {
    var requestController = new AbortController();
    var timeoutId = window.setTimeout(function () { requestController.abort(); }, GEMINI_FETCH_TIMEOUT_MS);
    return fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body),
      signal: requestController.signal,
    })
      .then(function (response) {
        if (!response.ok) return buildHttpAudioError(provider, response).then(function (err) { throw err; });
        return response.blob().then(function (audioBlob) {
          if (!audioBlob || !audioBlob.size) throw createProviderError(providerLabel(provider) + " returned no audio.", response.status, null);
          return audioBlob;
        });
      })
      .catch(function (err) {
        if (requestController.signal.aborted) throw createProviderError(providerLabel(provider) + " timed out.", 408, null);
        throw err;
      })
      .finally(function () { window.clearTimeout(timeoutId); });
  }

  function fetchOpenAiSpeech(transcript, voiceName, modelName) {
    var apiKey = loadStoredValue(OPENAI_API_KEY_STORAGE_KEY);
    return fetchBinaryAudio("openai", OPENAI_TTS_ENDPOINT, {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey,
    }, {
      model: modelName,
      voice: voiceName,
      input: transcript,
      format: "mp3",
    });
  }

  function requestOpenAiSpeech(transcript, voiceName, modelName, signal) {
    var cacheKey = makeSpeechCacheKey("openai", modelName, voiceName, transcript);
    return requestCachedSpeechAudio(cacheKey, function () { return fetchOpenAiSpeech(transcript, voiceName, modelName); }, signal);
  }

  function fetchElevenLabsSpeech(transcript, voiceId, modelName) {
    var apiKey = loadStoredValue(ELEVENLABS_API_KEY_STORAGE_KEY);
    return fetchBinaryAudio("elevenlabs",
      ELEVENLABS_TTS_ENDPOINT + "/" + encodeURIComponent(voiceId) + "?output_format=mp3_44100_128",
      { "Content-Type": "application/json", "xi-api-key": apiKey },
      { text: transcript, model_id: modelName });
  }

  function requestElevenLabsSpeech(transcript, voiceId, modelName, signal) {
    var cacheKey = makeSpeechCacheKey("elevenlabs", modelName, voiceId, transcript);
    return requestCachedSpeechAudio(cacheKey, function () { return fetchElevenLabsSpeech(transcript, voiceId, modelName); }, signal);
  }

  // ----- Orchestration (legacy 2985-3062) -----------------------------------

  function stopAudioPlayback() {
    activeSpeakRequest += 1;
    if (speakAbortController) { speakAbortController.abort(); speakAbortController = null; }
    if (browserSupportsSpeech()) window.speechSynthesis.cancel();
    audioPlayer.pause();
    audioPlayer.removeAttribute("src");
    audioPlayer.load();
    revokeActiveAudioUrl();
  }

  function currentProviderModel(provider) {
    var storageKey = providerModelStorageKey(provider);
    var storedValue = storageKey ? loadStoredValue(storageKey) : "";
    var options = providerModelOptions(provider);
    if (options.some(function (pair) { return pair[0] === storedValue; })) return storedValue;
    return options[0][0];
  }

  function currentProviderVoice(provider) {
    var storedValue = loadStoredValue(providerVoiceStorageKey(provider));
    return storedValue || defaultVoiceForProvider(provider);
  }

  function requestSelectedProviderSpeech(word, sentence, slow, signal) {
    var provider = loadAudioEngine();
    var transcript = buildDictationTranscript(word, sentence);
    if (provider === "gemini") {
      var promptText = buildSpeechPrompt(word, sentence, slow);
      return requestGeminiSpeech(promptText, currentProviderVoice("gemini"), signal);
    }
    if (provider === "openai") {
      return requestOpenAiSpeech(transcript, currentProviderVoice("openai"), currentProviderModel("openai"), signal);
    }
    if (provider === "elevenlabs") {
      return requestElevenLabsSpeech(transcript, currentProviderVoice("elevenlabs"), currentProviderModel("elevenlabs"), signal);
    }
    return Promise.reject(new Error("Remote audio unavailable."));
  }

  // Speak a single word (with optional cloze sentence context).
  function speak(opts) {
    opts = opts || {};
    var word = opts.word;
    if (!word) return Promise.resolve();

    stopAudioPlayback();
    var requestId = activeSpeakRequest;
    var provider = loadAudioEngine();
    var sentence = opts.sentence || "";
    var slow = Boolean(opts.slow);
    var baseRate = Number(opts.rate) || loadPlaybackRate();
    var playbackRate = slow ? Math.max(MIN_RATE, baseRate - SLOW_DELTA) : baseRate;

    if (provider === "browser") {
      var transcript = buildDictationTranscript(word, sentence);
      return speakBrowserText(transcript, playbackRate, loadStoredValue(BROWSER_VOICE_STORAGE_KEY))
        .catch(function () { /* swallow; UI reflects state */ });
    }

    speakAbortController = new AbortController();
    var controller = speakAbortController;
    return requestSelectedProviderSpeech(word, sentence, slow, controller.signal)
      .then(function (audioBlob) {
        if (requestId !== activeSpeakRequest) return;
        revokeActiveAudioUrl();
        activeAudioUrl = URL.createObjectURL(audioBlob);
        audioPlayer.src = activeAudioUrl;
        audioPlayer.playbackRate = playbackRate;
        return audioPlayer.play();
      })
      .catch(function (err) {
        if (isAbortError(err) || (controller && controller.signal.aborted) || requestId !== activeSpeakRequest) return;
        throw err;
      })
      .finally(function () {
        if (requestId === activeSpeakRequest) speakAbortController = null;
      });
  }

  function warmup(opts) {
    opts = opts || {};
    var provider = loadAudioEngine();
    if (!opts.word || provider !== "gemini" || geminiBackoffActive()) return;
    var promptText = buildSpeechPrompt(opts.word, opts.sentence || "", Boolean(opts.slow));
    var voiceName = currentProviderVoice("gemini");
    requestGeminiSpeech(promptText, voiceName).catch(function () { /* ignore */ });
  }

  // ----- Config surface (for TTSSettings UI) --------------------------------

  function emit() { listeners.forEach(function (fn) { try { fn(); } catch (err) {} }); }

  function subscribe(fn) { listeners.add(fn); return function () { listeners.delete(fn); }; }

  function setEngine(provider) {
    saveStoredValue(AUDIO_ENGINE_STORAGE_KEY, provider || "");
    emit();
  }

  function setVoice(provider, value) { saveStoredValue(providerVoiceStorageKey(provider), value || ""); emit(); }
  function setModel(provider, value) { saveStoredValue(providerModelStorageKey(provider), value || ""); emit(); }
  function setApiKey(provider, value) { saveStoredValue(providerApiKeyStorageKey(provider), value || ""); emit(); }
  function setGeminiBackupApiKey(value) { saveStoredValue(GEMINI_BACKUP_API_KEY_STORAGE_KEY, value || ""); emit(); }
  function setRate(value) {
    var clamped = Math.max(0.9, Math.min(1.25, Number(value) || DEFAULT_RATE));
    saveStoredValue(PLAYBACK_RATE_STORAGE_KEY, String(clamped));
    emit();
  }

  function getConfig() {
    var provider = loadAudioEngine();
    return {
      provider: provider,
      voice: currentProviderVoice(provider),
      model: currentProviderModel(provider),
      apiKey: loadStoredValue(providerApiKeyStorageKey(provider)),
      geminiBackupApiKey: loadStoredValue(GEMINI_BACKUP_API_KEY_STORAGE_KEY),
      rate: loadPlaybackRate(),
      slowDelta: SLOW_DELTA,
    };
  }

  function isReady() {
    var provider = loadAudioEngine();
    if (!providerNeedsApiKey(provider)) return listBrowserVoices().length > 0;
    if (provider === "gemini") return Boolean(loadStoredValue(GEMINI_API_KEY_STORAGE_KEY) || loadStoredValue(GEMINI_BACKUP_API_KEY_STORAGE_KEY));
    return Boolean(loadStoredValue(providerApiKeyStorageKey(provider)));
  }

  function readyLabel() {
    var provider = loadAudioEngine();
    if (provider === "browser") return browserVoiceReadyText();
    if (!isReady()) return "Add " + providerLabel(provider) + " key.";
    if (provider === "gemini" && geminiBackoffActive()) return geminiBackoffReason;
    return providerLabel(provider) + " ready.";
  }

  function geminiQuotaSummary() {
    var keys = loadGeminiApiKeys();
    if (!keys.length) return null;
    var state = loadGeminiQuotaState();
    var primary = keys[0];
    var entry = ensureGeminiQuotaEntry(state, primary.apiKey, primary.slot);
    return {
      minuteCount: entry.minuteCount,
      minuteLimit: GEMINI_LOCAL_RPM_LIMIT,
      dayCount: entry.dayCount,
      dayLimit: GEMINI_LOCAL_RPD_LIMIT,
      backoffActive: geminiBackoffActive(),
      backoffReason: geminiBackoffReason,
    };
  }

  // Browser voice list can populate asynchronously on Chrome.
  if (browserSupportsSpeech()) {
    try {
      window.speechSynthesis.onvoiceschanged = function () { emit(); };
      // Kick the first enumeration so onvoiceschanged fires ASAP.
      window.speechSynthesis.getVoices();
    } catch (err) { /* ignore */ }
  }

  // ----- Public surface -----------------------------------------------------

  window.KS2_TTS = {
    // config
    getConfig: getConfig,
    setEngine: setEngine,
    setVoice: setVoice,
    setModel: setModel,
    setApiKey: setApiKey,
    setGeminiBackupApiKey: setGeminiBackupApiKey,
    setRate: setRate,
    subscribe: subscribe,

    // introspection
    providers: function () { return ["browser", "gemini", "openai", "elevenlabs"]; },
    providerLabel: providerLabel,
    providerNeedsApiKey: providerNeedsApiKey,
    defaultVoiceForProvider: defaultVoiceForProvider,
    modelOptions: providerModelOptions,
    voiceOptions: function (provider) {
      if (provider === "browser") {
        return listBrowserVoices().map(function (v) { return { value: v.voiceURI, label: v.name + " (" + v.lang + ")" }; });
      }
      if (provider === "gemini") return GEMINI_TTS_VOICES.map(function (pair) { return { value: pair[0], label: pair[0] + " (" + pair[1] + ")" }; });
      if (provider === "openai") return OPENAI_TTS_VOICES.map(function (pair) { return { value: pair[0], label: pair[0] + " (" + pair[1] + ")" }; });
      if (provider === "elevenlabs") return elevenLabsVoices.map(function (v) {
        var suffix = v.accent ? " · " + v.accent : "";
        return { value: v.voiceId, label: v.name + suffix };
      });
      return [];
    },
    ensureElevenLabsVoices: function () {
      var key = loadStoredValue(ELEVENLABS_API_KEY_STORAGE_KEY);
      return ensureElevenLabsVoices(key);
    },

    // engine actions
    speak: speak,
    warmup: warmup,
    stop: stopAudioPlayback,

    // diagnostics
    isReady: isReady,
    readyLabel: readyLabel,
    geminiQuotaSummary: geminiQuotaSummary,
    providerErrorText: providerErrorText,

    // shared helpers useful to other modules
    buildDictationTranscript: buildDictationTranscript,
  };
})();
