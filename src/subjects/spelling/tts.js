import { clamp } from '../../platform/core/utils.js';
import {
  DEFAULT_BUFFERED_GEMINI_VOICE,
  DEFAULT_TTS_PROVIDER,
  normaliseBufferedGeminiVoice,
  normaliseTtsProvider,
} from './tts-providers.js';

// SH2-U4 (sys-hardening p2): TTS status channel + watchdog + latency telemetry.
//
// The existing emitter is kept for back-compat (`start` / `loading` / `end`
// events on `tts.subscribe()`). On top of that we surface a state-machine
// status channel so UI consumers can reason about pending / failure UX:
//
//   Legal transitions:
//     idle    -> loading  (fetch start)
//     idle    -> playing  (cache-hit fast path — `speakWithCachedBufferedAudio`
//                          reuses the prefetched blob, so `emitLoading` is
//                          skipped and the status jumps straight to
//                          playing when audio.play() is invoked. No
//                          `loading` latency telemetry emits on this path;
//                          the completed telemetry fires at onended.)
//     loading -> playing  (audio play after remote fetch)
//     loading -> failed   (watchdog fires OR fetch rejects / non-ok)
//     loading -> idle     (abortPending called)
//     playing -> idle     (normal end / stop())
//     playing -> idle -> loading
//                         (replay during playback — `speak()` calls
//                          `stop()` which resets to `idle`, then a new
//                          speak() enters `loading`. Subscribers observe
//                          TWO status events (idle, loading), not one.)
//     failed  -> loading  (user retries via speak())
//     failed  -> idle     (route change / abortPending)
//
// Watchdog contract (KTD F-02 deepening — conservative 15s):
//   Starts on transition to `loading`.
//   Cleared on ANY transition out of `loading`.
//   If it fires while still in `loading`, transitions to `failed`, calls
//   `currentAbort?.abort?.()`, and emits a status event to subscribers.
//
// Latency telemetry: on transition to `playing` or `failed`, and on
// `abortPending()` while in `loading`, emit a `[ks2-tts-latency]`
// structured log line with `wallMs` + `status` (`completed | failed
// | aborted`). `wallMs` is measured from the `loading` transition time.
// Surfaced through `console.log` to match the existing `[ks2-` log
// tokens (grep `[ks2-` across the repo).
//
// abortPending idempotency:
//   - idle   : no-op (no throw, no telemetry emission).
//   - loading: aborts fetch, transitions to `idle`, emits latency as
//              `aborted`. Second consecutive call is a no-op.
//   - playing: abortPending does NOT interfere — playing audio is
//              cleaned up via `stop()`, not `abortPending()`.
//   - failed : transitions to `idle` (clears error surface) without
//              telemetry (the failed transition already emitted).
//
// The watchdog delay is 15_000ms by default; a `watchdogMs` factory
// option allows tests to override it. Tests can also pass a
// `setTimeoutFn` / `clearTimeoutFn` pair and a `now()` clock to keep
// timing deterministic.

export const TTS_WATCHDOG_MS = 15_000;

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
  return typeof window !== 'undefined';
}

function resolveProvider(provider) {
  try {
    return normaliseTtsProvider(typeof provider === 'function' ? provider() : provider);
  } catch {
    return DEFAULT_TTS_PROVIDER;
  }
}

function resolveBufferedVoice(bufferedVoice) {
  try {
    return normaliseBufferedGeminiVoice(typeof bufferedVoice === 'function' ? bufferedVoice() : bufferedVoice);
  } catch {
    return DEFAULT_BUFFERED_GEMINI_VOICE;
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

function isProviderTestPayload(payload = {}) {
  return playbackKind(payload) === 'test';
}

function remotePromptRequest(payload = {}, providerId = DEFAULT_TTS_PROVIDER, bufferedVoiceId = DEFAULT_BUFFERED_GEMINI_VOICE) {
  const learnerId = typeof payload.learnerId === 'string' ? payload.learnerId : '';
  const promptToken = typeof payload.promptToken === 'string' ? payload.promptToken : '';
  if (!learnerId || !promptToken) return null;
  const body = {
    learnerId,
    promptToken,
    slow: Boolean(payload.slow),
    provider: providerId,
    bufferedGeminiVoice: normaliseBufferedGeminiVoice(payload.bufferedGeminiVoice, bufferedVoiceId),
  };
  if (payload.wordOnly) body.wordOnly = true;
  if (payload.cacheOnly) body.cacheOnly = true;
  if (payload.cacheLookupOnly) body.cacheLookupOnly = true;
  if (typeof payload.slug === 'string' && payload.slug) body.slug = payload.slug;
  if (typeof payload.scope === 'string' && payload.scope) body.scope = payload.scope;
  return body;
}

export function createPlatformTts({
  fetchFn = globalThis.fetch?.bind(globalThis),
  endpoint = '/api/tts',
  remoteEnabled = shouldUseRemoteTts(),
  provider = DEFAULT_TTS_PROVIDER,
  bufferedVoice = DEFAULT_BUFFERED_GEMINI_VOICE,
  watchdogMs = TTS_WATCHDOG_MS,
  setTimeoutFn = (typeof globalThis.setTimeout === 'function' ? globalThis.setTimeout.bind(globalThis) : null),
  clearTimeoutFn = (typeof globalThis.clearTimeout === 'function' ? globalThis.clearTimeout.bind(globalThis) : null),
  now = () => Date.now(),
  logger = (typeof globalThis.console?.log === 'function' ? globalThis.console.log.bind(globalThis.console) : null),
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

  // SH2-U4: status state-machine + watchdog + telemetry.
  let status = 'idle';
  // `loadingStartedAt` is `null` when no load is in flight and a
  // numeric timestamp (including 0 from tests with a fake clock) while
  // loading. Do NOT use `0` as the sentinel — `clock.now()` legitimately
  // returns 0 on the first frame of a deterministic clock, which would
  // suppress telemetry emission on that case.
  let loadingStartedAt = null;
  let loadingKind = '';
  let watchdogTimer = null;

  function getStatus() {
    return status;
  }

  function clearWatchdog() {
    if (watchdogTimer !== null && typeof clearTimeoutFn === 'function') {
      clearTimeoutFn(watchdogTimer);
    }
    watchdogTimer = null;
  }

  function emitLatencyLog(statusTag) {
    if (typeof logger !== 'function') return;
    if (loadingStartedAt === null) return;
    const wallMs = Math.max(0, Math.round(now() - loadingStartedAt));
    const kind = loadingKind || 'normal';
    try {
      logger(`[ks2-tts-latency] status=${statusTag} wallMs=${wallMs} kind=${kind}`);
    } catch { /* swallow logger failure */ }
  }

  function setStatus(next, { telemetry = '' } = {}) {
    if (status === next) return;
    const previous = status;
    status = next;

    if (next === 'loading') {
      loadingStartedAt = now();
      clearWatchdog();
      if (typeof setTimeoutFn === 'function' && watchdogMs > 0) {
        watchdogTimer = setTimeoutFn(() => {
          // Watchdog fires: only act if we're still in `loading`.
          if (status !== 'loading') return;
          try { currentAbort?.abort?.(); } catch { /* noop */ }
          emitLatencyLog('failed');
          status = 'failed';
          watchdogTimer = null;
          // After the failed transition the loading stamp has served
          // its purpose; clearing it here prevents a subsequent
          // `abortPending()` from `failed` state from re-using the
          // old stamp should it ever log telemetry again.
          loadingStartedAt = null;
          loadingKind = '';
          emit({ type: 'status', status: 'failed', previous: 'loading', reason: 'watchdog' });
        }, watchdogMs);
      }
    } else if (previous === 'loading') {
      // Any exit from loading clears the watchdog and (optionally) logs.
      clearWatchdog();
      if (telemetry === 'completed' || telemetry === 'failed' || telemetry === 'aborted') {
        emitLatencyLog(telemetry);
      }
      if (next !== 'loading') {
        // Reset loadingStartedAt only when we leave `loading` — nested
        // transitions through `loading` (replay) compute a fresh wallMs.
        if (telemetry) {
          // keep loadingStartedAt reset so subsequent telemetry does not
          // re-use a stale stamp.
          loadingStartedAt = null;
          loadingKind = '';
        }
      }
    }

    emit({ type: 'status', status: next, previous });
  }

  function abortPending() {
    // Idempotent: only acts when a fetch is in flight.
    if (status === 'loading') {
      try { currentAbort?.abort?.(); } catch { /* noop */ }
      setStatus('idle', { telemetry: 'aborted' });
      return;
    }
    if (status === 'failed') {
      // Dismiss the failed state — no extra telemetry (the transition to
      // failed already emitted its own latency log).
      setStatus('idle');
      return;
    }
    // idle / playing: no-op.
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
    try { currentAbort?.abort?.(); } catch { /* noop */ }
    cleanupAudio();
    resolvePending(false);
    stopBrowserSpeech();
    // Reset the status machine. `stop()` subsumes a full abort of both
    // playing audio AND any outstanding fetch. Transitions depend on
    // where we were. We emit the status change BEFORE the `end` event
    // so `end` stays the final observable signal on every playback
    // (legacy tests assert `events.at(-1).type === 'end'`).
    if (status === 'loading') {
      // Same semantics as abortPending while loading.
      setStatus('idle', { telemetry: 'aborted' });
    } else if (status === 'playing' || status === 'failed') {
      setStatus('idle');
    }
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
        // Browser speech has no loading phase — transition straight back
        // to idle from playing (if we reached playing). Status change
        // fires BEFORE `end` per the legacy contract.
        if (status === 'playing') setStatus('idle');
        emit({ type: 'end' });
        resolve(true);
      };
      utterance.onerror = () => {
        if (status === 'playing' || status === 'loading') setStatus('idle');
        emit({ type: 'end' });
        resolve(false);
      };
      // Browser path skips the loading phase — it's synchronous from the
      // caller's perspective. Set status BEFORE emitting `start` so the
      // observable order is `status(playing)`, then `start`.
      setStatus('playing');
      emit({ type: 'start', kind: playbackKind({ kind, slow }) });
      window.speechSynthesis.speak(utterance);
    });
  }

  function prefetchBufferedAudio(payload = {}, providerId, bufferedVoiceId) {
    if (
      providerId === 'gemini'
      || isProviderTestPayload(payload)
      || !remoteEnabled
      || typeof fetchFn !== 'function'
      || !payload.promptToken
    ) {
      return;
    }
    const requestBody = remotePromptRequest(
      { ...payload, cacheOnly: true },
      'gemini',
      bufferedVoiceId,
    );
    if (!requestBody) return;
    fetchFn(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }).catch(() => {});
  }

  async function speakWithCachedBufferedAudio(payload = {}, bufferedVoiceId, token) {
    if (
      !remoteEnabled
      || typeof fetchFn !== 'function'
      || typeof Audio === 'undefined'
      || typeof URL === 'undefined'
      || !payload.promptToken
    ) {
      return false;
    }
    return await speakWithRemote(
      { ...payload, cacheLookupOnly: true },
      'gemini',
      bufferedVoiceId,
      token,
      { emitLoading: false, emitMissEnd: false },
    );
  }

  async function speakWithRemote(
    payload = {},
    providerId,
    bufferedVoiceId,
    token,
    { emitLoading = true, emitMissEnd = true } = {},
  ) {
    if (!remoteEnabled || typeof fetchFn !== 'function' || typeof Audio === 'undefined' || typeof URL === 'undefined') {
      return false;
    }
    const requestBody = remotePromptRequest(payload, providerId, bufferedVoiceId);
    if (!requestBody) return false;

    currentAbort = new AbortController();
    const kindId = playbackKind(payload);
    if (emitLoading) {
      emit({ type: 'loading', kind: kindId, provider: providerId });
      loadingKind = kindId;
      setStatus('loading');
    }
    try {
      const response = await fetchFn(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: {
          accept: 'audio/*',
          'content-type': 'application/json',
        },
        signal: currentAbort.signal,
        body: JSON.stringify(requestBody),
      });
      if (response.status === 204) {
        if (emitLoading && token === playbackId && status === 'loading') setStatus('idle', { telemetry: 'completed' });
        if (emitMissEnd && token === playbackId) emit({ type: 'end' });
        return false;
      }
      if (!response.ok) {
        if (emitLoading && token === playbackId && status === 'loading') setStatus('failed', { telemetry: 'failed' });
        if (emitMissEnd && token === playbackId) emit({ type: 'end' });
        return false;
      }
      const blob = await response.blob();
      if (token !== playbackId) return false;

      currentObjectUrl = URL.createObjectURL(blob);
      currentAudio = new Audio(currentObjectUrl);
      return await new Promise((resolve) => {
        pendingResolve = resolve;
        currentAudio.onended = () => {
          // Emit the status transition BEFORE the `end` event so legacy
          // consumers that only look at `end` (e.g. the existing
          // spelling-tts test suite) still see `end` as the final event
          // of the playback.
          if (status === 'playing') setStatus('idle');
          emit({ type: 'end' });
          cleanupAudio();
          resolvePending(true);
        };
        currentAudio.onerror = () => {
          if (status === 'playing' || status === 'loading') setStatus('idle');
          emit({ type: 'end' });
          cleanupAudio();
          resolvePending(false);
        };
        currentAudio.onabort = () => {
          if (status === 'playing' || status === 'loading') setStatus('idle');
          emit({ type: 'end' });
          cleanupAudio();
          resolvePending(false);
        };
        // Transition to `playing` covers two paths:
        //   1. loading -> playing: normal remote fetch where `emitLoading`
        //      ran, so `status === 'loading'`. Emits `completed` latency
        //      telemetry measured from the `loading` entry.
        //   2. idle -> playing: cache-hit fast path via
        //      `speakWithCachedBufferedAudio` where `emitLoading: false`
        //      was passed, so no `loading` transition occurred. Audio is
        //      playing immediately, so the audio-playing invariant
        //      (`status === 'playing' when audio.play() runs`) must hold.
        //      No latency telemetry emits on this path because there was
        //      no `loading` timer to close out.
        if (status === 'loading') setStatus('playing', { telemetry: 'completed' });
        else if (status === 'idle') setStatus('playing');
        emit({ type: 'start', kind: kindId });
        currentAudio.play().catch(() => {
          if (status === 'playing' || status === 'loading') setStatus('idle');
          emit({ type: 'end' });
          cleanupAudio();
          resolvePending(false);
        });
      });
    } catch {
      if (emitLoading && token === playbackId && status === 'loading') setStatus('failed', { telemetry: 'failed' });
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
    const bufferedVoiceId = resolveBufferedVoice(payload.bufferedGeminiVoice || bufferedVoice);
    const providerTest = isProviderTestPayload(payload);
    if (!providerTest && providerId !== 'gemini' && providerId !== 'browser') {
      const cached = await speakWithCachedBufferedAudio(payload, bufferedVoiceId, token);
      if (cached) return true;
      if (token !== playbackId) return false;
    }
    prefetchBufferedAudio(payload, providerId, bufferedVoiceId);
    if (providerId === 'browser') return speakWithBrowser(payload);
    return await speakWithRemote(payload, providerId, bufferedVoiceId, token);
  }

  return {
    isReady: available,
    speak,
    stop,
    subscribe,
    warmup() {},
    // SH2-U4: status channel contract.
    getStatus,
    abortPending,
  };
}

export const createBrowserTts = createPlatformTts;
