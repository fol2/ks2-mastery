import { clamp } from '../../platform/core/utils.js';
import { DEFAULT_TTS_PROVIDER, normaliseTtsProvider } from './tts-providers.js';

export function buildDictationTranscript({ word, sentence } = {}) {
  const spokenWord = typeof word === 'string' ? word : word?.word;
  return sentence
    ? `The word is ${spokenWord}. ${sentence} The word is ${spokenWord}.`
    : `The word is ${spokenWord}. The word is ${spokenWord}.`;
}

export function buildWordOnlyTranscript({ word } = {}) {
  return String(typeof word === 'string' ? word : word?.word || '').trim();
}

function buildSpeechTranscript({ word, sentence, wordOnly = false } = {}) {
  return wordOnly
    ? buildWordOnlyTranscript({ word })
    : buildDictationTranscript({ word, sentence });
}

function shouldUseRemoteTts() {
  if (typeof window === 'undefined') return false;
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get('local') !== '1';
  } catch {
    return true;
  }
}

function resolveProvider(provider) {
  try {
    return normaliseTtsProvider(typeof provider === 'function' ? provider() : provider);
  } catch {
    return DEFAULT_TTS_PROVIDER;
  }
}

function browserVoiceScore(voice) {
  if (!voice) return -1;
  const name = `${voice.name || ''} ${voice.voiceURI || ''}`.toLowerCase();
  const lang = String(voice.lang || '').toLowerCase();
  let score = 0;
  if (lang === 'en-gb') score += 80;
  else if (lang.startsWith('en-gb')) score += 70;
  else if (lang.startsWith('en')) score += 35;
  if (name.includes('google')) score += 30;
  if (name.includes('uk') || name.includes('british') || name.includes('united kingdom')) score += 20;
  if (name.includes('female')) score += 15;
  if (name.includes('english')) score += 5;
  if (voice.default) score += 1;
  return score;
}

function chooseBrowserVoice(speechSynthesis) {
  const voices = typeof speechSynthesis?.getVoices === 'function'
    ? speechSynthesis.getVoices()
    : [];
  return voices
    .filter((voice) => browserVoiceScore(voice) > 0)
    .sort((a, b) => browserVoiceScore(b) - browserVoiceScore(a))[0] || null;
}

function playbackKind({ kind = '', slow = false } = {}) {
  const explicit = String(kind || '').trim();
  return explicit || (slow ? 'slow' : 'normal');
}

function remotePromptRequest(payload = {}, providerId = DEFAULT_TTS_PROVIDER) {
  const learnerId = typeof payload.learnerId === 'string' ? payload.learnerId : '';
  const promptToken = typeof payload.promptToken === 'string' ? payload.promptToken : '';
  if (!learnerId || !promptToken) return null;
  const body = {
    learnerId,
    promptToken,
    slow: Boolean(payload.slow),
    provider: providerId,
  };
  if (payload.wordOnly) body.wordOnly = true;
  return body;
}

export function createPlatformTts({
  fetchFn = globalThis.fetch?.bind(globalThis),
  endpoint = '/api/tts',
  remoteEnabled = shouldUseRemoteTts(),
  provider = DEFAULT_TTS_PROVIDER,
} = {}) {
  let playbackId = 0;
  let currentAbort = null;
  let currentAudio = null;
  let currentObjectUrl = null;
  let pendingResolve = null;

  const listeners = new Set();
  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  function emit(event) {
    for (const l of listeners) {
      try { l(event); } catch { /* ignore listener errors */ }
    }
  }

  function available() {
    return typeof window !== 'undefined'
      && 'speechSynthesis' in window
      && 'SpeechSynthesisUtterance' in window;
  }

  function stopBrowserSpeech() {
    if (!available()) return;
    window.speechSynthesis.cancel();
  }

  function cleanupAudio() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.removeAttribute('src');
      currentAudio.load?.();
    }
    currentAudio = null;
    if (currentObjectUrl && typeof URL !== 'undefined') {
      URL.revokeObjectURL(currentObjectUrl);
    }
    currentObjectUrl = null;
    currentAbort = null;
  }

  function resolvePending(value) {
    const resolve = pendingResolve;
    pendingResolve = null;
    if (typeof resolve === 'function') resolve(value);
  }

  function stop() {
    playbackId += 1;
    currentAbort?.abort?.();
    cleanupAudio();
    resolvePending(false);
    stopBrowserSpeech();
    emit({ type: 'end' });
  }

  function speakWithBrowser({ word, sentence, slow = false, wordOnly = false, kind = '' } = {}) {
    if (!available()) return Promise.resolve(false);
    stopBrowserSpeech();
    const transcript = buildSpeechTranscript({ word, sentence, wordOnly });
    const Utterance = window.SpeechSynthesisUtterance;
    const utterance = new Utterance(transcript);
    utterance.lang = 'en-GB';
    const voice = chooseBrowserVoice(window.speechSynthesis);
    if (voice) utterance.voice = voice;
    utterance.rate = clamp(slow ? 0.9 : 1.02, 0.8, 1.2);
    return new Promise((resolve) => {
      utterance.onend = () => {
        emit({ type: 'end' });
        resolve(true);
      };
      utterance.onerror = () => {
        emit({ type: 'end' });
        resolve(false);
      };
      emit({ type: 'start', kind: playbackKind({ kind, slow }) });
      window.speechSynthesis.speak(utterance);
    });
  }

  async function speakWithRemote(payload = {}, providerId, token) {
    if (!remoteEnabled || typeof fetchFn !== 'function' || typeof Audio === 'undefined' || typeof URL === 'undefined') {
      return false;
    }
    const requestBody = remotePromptRequest(payload, providerId);
    if (!requestBody) return false;

    currentAbort = new AbortController();
    const kindId = playbackKind(payload);
    emit({ type: 'loading', kind: kindId, provider: providerId });
    try {
      const response = await fetchFn(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: {
          accept: 'audio/mpeg',
          'content-type': 'application/json',
        },
        signal: currentAbort.signal,
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) {
        if (token === playbackId) emit({ type: 'end' });
        return false;
      }
      const blob = await response.blob();
      if (token !== playbackId) return false;

      currentObjectUrl = URL.createObjectURL(blob);
      currentAudio = new Audio(currentObjectUrl);
      return await new Promise((resolve) => {
        pendingResolve = resolve;
        currentAudio.onended = () => {
          emit({ type: 'end' });
          cleanupAudio();
          resolvePending(true);
        };
        currentAudio.onerror = () => {
          emit({ type: 'end' });
          cleanupAudio();
          resolvePending(false);
        };
        currentAudio.onabort = () => {
          emit({ type: 'end' });
          cleanupAudio();
          resolvePending(false);
        };
        emit({ type: 'start', kind: kindId });
        currentAudio.play().catch(() => {
          emit({ type: 'end' });
          cleanupAudio();
          resolvePending(false);
        });
      });
    } catch {
      if (token === playbackId) emit({ type: 'end' });
      return false;
    } finally {
      if (token === playbackId) currentAbort = null;
    }
  }

  async function speak(payload = {}) {
    stop();
    const token = playbackId;
    const providerId = resolveProvider(payload.provider || provider);
    if (providerId === 'browser') return speakWithBrowser(payload);
    return await speakWithRemote(payload, providerId, token);
  }

  return {
    isReady: available,
    speak,
    stop,
    subscribe,
    warmup() {},
  };
}

export const createBrowserTts = createPlatformTts;
