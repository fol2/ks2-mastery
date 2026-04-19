// Unified TTS layer for the spelling flow.
//
// Browser speech still runs on-device. Remote providers now run through
// authenticated Worker endpoints so provider secrets never live in the
// browser.

(function () {
  var GEMINI_TTS_MODEL = "gemini-3.1-flash-tts-preview";
  var OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
  var ELEVENLABS_DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

  var AUDIO_ENGINE_STORAGE_KEY = "ks2-spelling-audio-engine";
  var BROWSER_VOICE_STORAGE_KEY = "ks2-spelling-browser-voice";
  var GEMINI_VOICE_STORAGE_KEY = "ks2-spelling-gemini-voice";
  var OPENAI_VOICE_STORAGE_KEY = "ks2-spelling-openai-voice";
  var ELEVENLABS_VOICE_STORAGE_KEY = "ks2-spelling-elevenlabs-voice";
  var ELEVENLABS_MODEL_STORAGE_KEY = "ks2-spelling-elevenlabs-model";
  var PLAYBACK_RATE_STORAGE_KEY = "ks2-spelling-playback-rate";

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

  var AUDIO_CACHE_LIMIT = 18;
  var FETCH_TIMEOUT_MS = 20000;
  var DEFAULT_RATE = 1.05;
  var SLOW_DELTA = 0.12;
  var MIN_RATE = 0.92;

  var audioPlayer = new Audio();
  var audioBlobCache = new Map();
  var audioPendingCache = new Map();
  var activeSpeakRequest = 0;
  var speakAbortController = null;
  var activeAudioUrl = "";
  var elevenLabsVoices = [];
  var elevenLabsVoicesPromise = null;
  var listeners = new Set();

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
    } catch (err) {}
  }

  function makeAbortError() {
    try { return new DOMException("Aborted", "AbortError"); }
    catch (err) {
      var abortError = new Error("Aborted");
      abortError.name = "AbortError";
      return abortError;
    }
  }

  function isAbortError(error) {
    return Boolean(error && error.name === "AbortError");
  }

  function withAbortSignal(promise, signal) {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(makeAbortError());
    return new Promise(function (resolve, reject) {
      function onAbort() { reject(makeAbortError()); }
      signal.addEventListener("abort", onAbort, { once: true });
      promise.then(
        function (value) {
          signal.removeEventListener("abort", onAbort);
          resolve(value);
        },
        function (error) {
          signal.removeEventListener("abort", onAbort);
          reject(error);
        }
      );
    });
  }

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

  function buildDictationTranscript(word, sentence) {
    var slug = typeof word === "string" ? word : word.word;
    var cleanSentence = String(sentence || "").trim();
    return cleanSentence
      ? "The word is " + slug + ". " + cleanSentence + " The word is " + slug + "."
      : "The word is " + slug + ". The word is " + slug + ".";
  }

  function providerLabel(provider) {
    if (provider === "gemini") return "Gemini";
    if (provider === "openai") return "OpenAI";
    if (provider === "elevenlabs") return "ElevenLabs";
    return "Browser";
  }

  function providerVoiceStorageKey(provider) {
    if (provider === "browser") return BROWSER_VOICE_STORAGE_KEY;
    if (provider === "gemini") return GEMINI_VOICE_STORAGE_KEY;
    if (provider === "openai") return OPENAI_VOICE_STORAGE_KEY;
    if (provider === "elevenlabs") return ELEVENLABS_VOICE_STORAGE_KEY;
    return "";
  }

  function providerModelStorageKey(provider) {
    return provider === "elevenlabs" ? ELEVENLABS_MODEL_STORAGE_KEY : "";
  }

  function browserSupportsSpeech() {
    return typeof window !== "undefined"
      && "speechSynthesis" in window
      && "SpeechSynthesisUtterance" in window;
  }

  function serverProviders() {
    var state = window.KS2App && window.KS2App.getState ? window.KS2App.getState() : null;
    var providers = state && state.tts && state.tts.providers ? state.tts.providers : null;
    return providers || {
      browser: true,
      gemini: false,
      openai: false,
      elevenlabs: false,
    };
  }

  function providerAvailable(provider) {
    if (provider === "browser") return browserSupportsSpeech() && listBrowserVoices().length > 0;
    return Boolean(serverProviders()[provider]);
  }

  function firstAvailableProvider() {
    var providers = serverProviders();
    if (browserSupportsSpeech() && listBrowserVoices().length) return "browser";
    if (providers.gemini) return "gemini";
    if (providers.openai) return "openai";
    if (providers.elevenlabs) return "elevenlabs";
    return browserSupportsSpeech() ? "browser" : "gemini";
  }

  function loadAudioEngine() {
    var stored = loadStoredValue(AUDIO_ENGINE_STORAGE_KEY);
    if (providerAvailable(stored)) return stored;
    return firstAvailableProvider();
  }

  function loadPlaybackRate() {
    var raw = Number(loadStoredValue(PLAYBACK_RATE_STORAGE_KEY));
    if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_RATE;
    return Math.max(0.9, Math.min(1.25, raw));
  }

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

  function createProviderError(message, statusCode) {
    var error = new Error(message);
    error.statusCode = Number(statusCode) || 0;
    return error;
  }

  function fetchJson(url) {
    var controller = new AbortController();
    var timeoutId = window.setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);
    return fetch(url, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (payload) {
          if (!response.ok || payload.ok === false) {
            throw createProviderError(payload.message || "Request failed.", response.status);
          }
          return payload;
        });
      })
      .catch(function (error) {
        if (controller.signal.aborted) throw createProviderError("Timed out.", 408);
        throw error;
      })
      .finally(function () { window.clearTimeout(timeoutId); });
  }

  function fetchBinaryAudio(url, payload) {
    var controller = new AbortController();
    var timeoutId = window.setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);
    return fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
      signal: controller.signal,
    })
      .then(function (response) {
        if (!response.ok) {
          return response.json().catch(function () { return {}; }).then(function (body) {
            throw createProviderError(body.message || "Speech request failed.", response.status);
          });
        }
        return response.blob().then(function (audioBlob) {
          if (!audioBlob || !audioBlob.size) throw createProviderError("The provider returned no audio.", response.status);
          return audioBlob;
        });
      })
      .catch(function (error) {
        if (controller.signal.aborted) throw createProviderError("Timed out.", 408);
        throw error;
      })
      .finally(function () { window.clearTimeout(timeoutId); });
  }

  function fetchElevenLabsVoices() {
    return fetchJson("/api/tts/voices?provider=elevenlabs")
      .then(function (payload) {
        return Array.isArray(payload.voices) ? payload.voices : [];
      });
  }

  function ensureElevenLabsVoices() {
    if (!providerAvailable("elevenlabs")) return Promise.resolve([]);
    if (elevenLabsVoices.length) return Promise.resolve(elevenLabsVoices);
    if (elevenLabsVoicesPromise) return elevenLabsVoicesPromise;
    elevenLabsVoicesPromise = fetchElevenLabsVoices()
      .then(function (voices) {
        elevenLabsVoices = voices.slice();
        return elevenLabsVoices;
      })
      .finally(function () { elevenLabsVoicesPromise = null; });
    return elevenLabsVoicesPromise;
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

  function requestRemoteSpeech(provider, word, sentence, slow, signal) {
    var transcript = buildDictationTranscript(word, sentence);
    var model = currentProviderModel(provider);
    var voice = currentProviderVoice(provider);
    var cacheSource = provider === "gemini"
      ? [word.word || word, sentence || "", slow ? "slow" : "normal"].join("||")
      : transcript;
    var cacheKey = makeSpeechCacheKey(provider, model, voice, cacheSource);
    return requestCachedSpeechAudio(cacheKey, function () {
      return fetchBinaryAudio("/api/tts/speak", {
        provider: provider,
        word: word.word || word,
        sentence: sentence || "",
        slow: Boolean(slow),
        voice: voice,
        model: model,
      });
    }, signal);
  }

  function requestSelectedProviderSpeech(word, sentence, slow, signal) {
    var provider = loadAudioEngine();
    if (!providerAvailable(provider) || provider === "browser") {
      return Promise.reject(new Error("Remote audio unavailable."));
    }
    return requestRemoteSpeech(provider, word, sentence, slow, signal);
  }

  function stopAudioPlayback() {
    activeSpeakRequest += 1;
    if (speakAbortController) {
      speakAbortController.abort();
      speakAbortController = null;
    }
    if (browserSupportsSpeech()) window.speechSynthesis.cancel();
    audioPlayer.pause();
    audioPlayer.removeAttribute("src");
    audioPlayer.load();
    revokeActiveAudioUrl();
  }

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
        .catch(function () {});
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
      .catch(function (error) {
        if (isAbortError(error) || (controller && controller.signal.aborted) || requestId !== activeSpeakRequest) return;
        throw error;
      })
      .finally(function () {
        if (requestId === activeSpeakRequest) speakAbortController = null;
      });
  }

  function warmup(opts) {
    opts = opts || {};
    var provider = loadAudioEngine();
    if (!opts.word || provider !== "gemini" || !providerAvailable("gemini")) return;
    requestRemoteSpeech("gemini", opts.word, opts.sentence || "", Boolean(opts.slow)).catch(function () {});
  }

  function emit() {
    listeners.forEach(function (fn) {
      try { fn(); } catch (err) {}
    });
  }

  function subscribe(fn) {
    listeners.add(fn);
    return function () { listeners.delete(fn); };
  }

  function setEngine(provider) {
    if (!providerAvailable(provider) && provider !== "browser") return;
    saveStoredValue(AUDIO_ENGINE_STORAGE_KEY, provider || "");
    emit();
  }

  function setVoice(provider, value) {
    saveStoredValue(providerVoiceStorageKey(provider), value || "");
    emit();
  }

  function setModel(provider, value) {
    saveStoredValue(providerModelStorageKey(provider), value || "");
    emit();
  }

  function setApiKey() {}
  function setGeminiBackupApiKey() {}

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
      apiKey: "",
      geminiBackupApiKey: "",
      rate: loadPlaybackRate(),
      slowDelta: SLOW_DELTA,
    };
  }

  function isReady() {
    var provider = loadAudioEngine();
    if (provider === "browser") return listBrowserVoices().length > 0;
    return providerAvailable(provider);
  }

  function readyLabel() {
    var provider = loadAudioEngine();
    if (provider === "browser") return browserVoiceReadyText();
    if (!providerAvailable(provider)) return providerLabel(provider) + " is not configured on the server.";
    return providerLabel(provider) + " ready via server.";
  }

  function providerErrorText(provider, error) {
    var message = String((error && error.message) || "").replace(/\s+/g, " ").trim();
    if (/timed out/i.test(message)) return providerLabel(provider) + " timed out.";
    if (/quota exceeded|current quota|resource_exhausted/i.test(message)) return providerLabel(provider) + " quota hit.";
    if (!message) return providerLabel(provider) + " error.";
    var compact = message.length > 72 ? (message.slice(0, 69) + "...") : message;
    return providerLabel(provider) + ": " + compact;
  }

  if (browserSupportsSpeech()) {
    try {
      window.speechSynthesis.onvoiceschanged = function () { emit(); };
      window.speechSynthesis.getVoices();
    } catch (err) {}
  }

  window.KS2_TTS = {
    getConfig: getConfig,
    setEngine: setEngine,
    setVoice: setVoice,
    setModel: setModel,
    setApiKey: setApiKey,
    setGeminiBackupApiKey: setGeminiBackupApiKey,
    setRate: setRate,
    subscribe: subscribe,

    providers: function () { return ["browser", "gemini", "openai", "elevenlabs"]; },
    providerLabel: providerLabel,
    providerNeedsApiKey: function () { return false; },
    providerAvailable: providerAvailable,
    defaultVoiceForProvider: defaultVoiceForProvider,
    modelOptions: providerModelOptions,
    voiceOptions: function (provider) {
      if (provider === "browser") {
        return listBrowserVoices().map(function (voice) {
          return { value: voice.voiceURI, label: voice.name + " (" + voice.lang + ")" };
        });
      }
      if (provider === "gemini") {
        return GEMINI_TTS_VOICES.map(function (pair) { return { value: pair[0], label: pair[0] + " (" + pair[1] + ")" }; });
      }
      if (provider === "openai") {
        return OPENAI_TTS_VOICES.map(function (pair) { return { value: pair[0], label: pair[0] + " (" + pair[1] + ")" }; });
      }
      if (provider === "elevenlabs") {
        return elevenLabsVoices.map(function (voice) {
          var suffix = voice.accent ? " · " + voice.accent : "";
          return { value: voice.voiceId, label: voice.name + suffix };
        });
      }
      return [];
    },
    ensureElevenLabsVoices: ensureElevenLabsVoices,

    speak: speak,
    warmup: warmup,
    stop: stopAudioPlayback,

    isReady: isReady,
    readyLabel: readyLabel,
    geminiQuotaSummary: function () { return null; },
    providerErrorText: providerErrorText,
    buildDictationTranscript: buildDictationTranscript,
  };
})();
