import { clamp } from '../../platform/core/utils.js';

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

export function createPlatformTts({
  fetchFn = globalThis.fetch?.bind(globalThis),
  endpoint = '/api/tts',
  remoteEnabled = shouldUseRemoteTts(),
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

  function speakWithBrowser({ word, sentence, slow = false, wordOnly = false } = {}) {
    if (!available()) return Promise.resolve(false);
    stopBrowserSpeech();
    const transcript = buildSpeechTranscript({ word, sentence, wordOnly });
    const utterance = new SpeechSynthesisUtterance(transcript);
    utterance.lang = 'en-GB';
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
      emit({ type: 'start', kind: slow ? 'slow' : 'normal' });
      window.speechSynthesis.speak(utterance);
    });
  }

  async function speakWithRemote({ word, sentence, slow = false }, token) {
    if (!remoteEnabled || typeof fetchFn !== 'function' || typeof Audio === 'undefined' || typeof URL === 'undefined') {
      return false;
    }

    currentAbort = new AbortController();
    try {
      const response = await fetchFn(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: {
          accept: 'audio/mpeg',
          'content-type': 'application/json',
        },
        signal: currentAbort.signal,
        body: JSON.stringify({ word, sentence, slow }),
      });
      if (!response.ok) return false;
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
        emit({ type: 'start', kind: slow ? 'slow' : 'normal' });
        currentAudio.play().catch(() => {
          emit({ type: 'end' });
          cleanupAudio();
          resolvePending(false);
        });
      });
    } catch {
      return false;
    } finally {
      if (token === playbackId) currentAbort = null;
    }
  }

  async function speak(payload = {}) {
    stop();
    const token = playbackId;
    const playedRemote = await speakWithRemote(payload, token);
    if (playedRemote || token !== playbackId) return playedRemote;
    return speakWithBrowser(payload);
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
