import test from 'node:test';
import assert from 'node:assert/strict';

import { createPlatformTts, TTS_WATCHDOG_MS } from '../src/subjects/spelling/tts.js';

// SH2-U4 (sys-hardening p2): TTS status-channel invariants.
//
// The TTS client surfaces four statuses via `getStatus()` and emits
// `{ type: 'status', status, previous }` events through the existing
// `subscribe()` channel. This test pins every legal transition, the
// watchdog timeout, abortPending idempotency, and the latency-telemetry
// log format (`[ks2-tts-latency]`).
//
// Tests use an injected `setTimeoutFn` / `clearTimeoutFn` / `now()` so
// watchdog timing is deterministic — no real-time waits. The TTS port
// already supports these overrides for exactly this purpose.

function makeManualClock() {
  let current = 0;
  const timers = new Map();
  let nextId = 1;
  return {
    now: () => current,
    setTimeoutFn(fn, ms) {
      const id = nextId++;
      timers.set(id, { fn, runAt: current + ms });
      return id;
    },
    clearTimeoutFn(id) {
      timers.delete(id);
    },
    advanceBy(ms) {
      current += ms;
      for (const [id, entry] of [...timers.entries()]) {
        if (entry.runAt <= current) {
          timers.delete(id);
          try { entry.fn(); } catch { /* surface timer error */ }
        }
      }
    },
    get timerCount() { return timers.size; },
  };
}

function makeFakeAudio({ onPlay } = {}) {
  return class FakeAudio {
    constructor(src) {
      this.src = src;
      this.onended = null;
      this.onerror = null;
      this.onabort = null;
    }
    play() {
      if (typeof onPlay === 'function') onPlay(this);
      return Promise.resolve();
    }
    pause() {}
    removeAttribute() {}
    load() {}
  };
}

function withAudioGlobals(fn, options) {
  const originalAudio = globalThis.Audio;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  globalThis.Audio = makeFakeAudio(options || {});
  URL.createObjectURL = () => 'blob:tts-test';
  URL.revokeObjectURL = () => {};
  return fn().finally(() => {
    globalThis.Audio = originalAudio;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });
}

test('tts status channel: initial status is idle', () => {
  const tts = createPlatformTts({ remoteEnabled: false, fetchFn: null });
  assert.equal(tts.getStatus(), 'idle');
});

test('tts status channel: idle -> loading -> playing -> idle on happy path', async (t) => {
  const clock = makeManualClock();
  const events = [];
  const logs = [];
  let audioInstance = null;

  await withAudioGlobals(async () => {
    const tts = createPlatformTts({
      remoteEnabled: true,
      provider: 'gemini',
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
      now: clock.now,
      logger: (line) => logs.push(line),
      fetchFn: async () => new Response(new Blob([new Uint8Array([1, 2, 3])]), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      }),
    });
    tts.subscribe((event) => {
      if (event?.type === 'status') events.push(event);
    });

    const speakPromise = tts.speak({
      learnerId: 'learner-a',
      promptToken: 'prompt-token-a',
      word: { word: 'early' },
    });
    // Yield microtasks so the fetch + blob resolve and the status flips
    // to `playing`.
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Let the play() chain resolve.
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Fire the synthetic `onended` to close the playing promise.
    if (audioInstance) audioInstance.onended?.();
    // Eventually capture the audio instance via the onPlay hook.
    await speakPromise.catch(() => {});
  }, {
    onPlay(instance) {
      audioInstance = instance;
      // Simulate the audio finishing on the next microtask.
      setTimeout(() => instance.onended?.(), 0);
    },
  });

  // The sequence must include loading -> playing -> idle, irrespective
  // of any extra `cacheLookupOnly` loading pulse the platform may emit
  // for non-gemini providers (gemini case is single-pipeline).
  const statuses = events.map((e) => e.status);
  assert.ok(statuses.includes('loading'), `expected 'loading' in ${statuses.join(',')}`);
  assert.ok(statuses.includes('playing'), `expected 'playing' in ${statuses.join(',')}`);
  assert.equal(statuses.at(-1), 'idle', `expected last status to be 'idle', got ${statuses.at(-1)}`);

  // Watchdog must have been cleared on the loading -> playing transition.
  assert.equal(clock.timerCount, 0, 'watchdog timer should be cleared once loading ended');

  // Latency telemetry: at least one `[ks2-tts-latency]` log line emitted
  // with `status=completed`.
  assert.ok(
    logs.some((line) => line.includes('[ks2-tts-latency]') && line.includes('status=completed')),
    `expected a completed latency log, got ${JSON.stringify(logs)}`,
  );
});

test('tts status channel: 500 response transitions loading -> failed and emits failed latency', async () => {
  const clock = makeManualClock();
  const events = [];
  const logs = [];
  await withAudioGlobals(async () => {
    const tts = createPlatformTts({
      remoteEnabled: true,
      provider: 'gemini',
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
      now: clock.now,
      logger: (line) => logs.push(line),
      fetchFn: async () => new Response('oops', {
        status: 500,
        headers: { 'content-type': 'text/plain' },
      }),
    });
    tts.subscribe((event) => {
      if (event?.type === 'status') events.push(event);
    });
    await tts.speak({
      learnerId: 'learner-a',
      promptToken: 'prompt-token-a',
      word: { word: 'early' },
    });
  });

  const statuses = events.map((e) => e.status);
  assert.ok(statuses.includes('loading'), 'must enter loading before failing');
  assert.ok(statuses.includes('failed'), 'must transition to failed on 500');
  assert.ok(
    logs.some((line) => line.includes('[ks2-tts-latency]') && line.includes('status=failed')),
    `expected a failed latency log, got ${JSON.stringify(logs)}`,
  );
});

test('tts status channel: watchdog fires after 15s of loading without resolution', async () => {
  const clock = makeManualClock();
  const events = [];
  const logs = [];
  // A fetch that never resolves until we abort it.
  let fetchRejector = null;
  const fetchFn = (url, init) => {
    return new Promise((_resolve, reject) => {
      fetchRejector = reject;
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    });
  };
  await withAudioGlobals(async () => {
    const tts = createPlatformTts({
      remoteEnabled: true,
      provider: 'gemini',
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
      now: clock.now,
      logger: (line) => logs.push(line),
      fetchFn,
    });
    tts.subscribe((event) => {
      if (event?.type === 'status') events.push(event);
    });

    const speakPromise = tts.speak({
      learnerId: 'learner-a',
      promptToken: 'prompt-token-b',
      word: { word: 'early' },
    });
    // Wait a microtask so the fetch starts and status becomes loading.
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(tts.getStatus(), 'loading', 'status should be loading');

    // Advance the clock by the full watchdog window.
    clock.advanceBy(TTS_WATCHDOG_MS);
    assert.equal(tts.getStatus(), 'failed', 'watchdog should have flipped status to failed');
    // Cleanup: surface the aborted fetch so the promise resolves.
    if (fetchRejector) fetchRejector(new Error('test-abort'));
    await speakPromise.catch(() => {});
  });

  assert.equal(TTS_WATCHDOG_MS, 15000, 'watchdog contract must remain at 15 seconds');
  assert.ok(
    events.some((e) => e.status === 'failed' && e.reason === 'watchdog'),
    'watchdog must emit a status=failed event with reason=watchdog',
  );
  assert.ok(
    logs.some((line) => line.includes('[ks2-tts-latency]') && line.includes('status=failed')),
    'watchdog timeout must emit a failed latency log',
  );
});

test('tts status channel: abortPending() while loading transitions to idle and emits aborted latency', async () => {
  const clock = makeManualClock();
  const events = [];
  const logs = [];
  const fetchFn = (url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  });
  await withAudioGlobals(async () => {
    const tts = createPlatformTts({
      remoteEnabled: true,
      provider: 'gemini',
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
      now: clock.now,
      logger: (line) => logs.push(line),
      fetchFn,
    });
    tts.subscribe((event) => {
      if (event?.type === 'status') events.push(event);
    });
    const speakPromise = tts.speak({
      learnerId: 'learner-a',
      promptToken: 'prompt-token-c',
      word: { word: 'early' },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(tts.getStatus(), 'loading', 'status must be loading before abort');

    // Advance part-way through so `wallMs` is non-zero when telemetry emits.
    clock.advanceBy(4000);
    tts.abortPending();
    assert.equal(tts.getStatus(), 'idle', 'abortPending while loading must flip to idle');
    assert.equal(clock.timerCount, 0, 'abortPending must clear the watchdog timer');
    await speakPromise.catch(() => {});
  });

  assert.ok(
    logs.some((line) => line.includes('[ks2-tts-latency]') && line.includes('status=aborted')),
    `expected an aborted latency log, got ${JSON.stringify(logs)}`,
  );
});

test('tts status channel: abortPending() is idempotent — second call is a no-op', async () => {
  const clock = makeManualClock();
  const logs = [];
  const tts = createPlatformTts({
    remoteEnabled: false,
    fetchFn: null,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    now: clock.now,
    logger: (line) => logs.push(line),
  });
  // idle -> abortPending should be a pure no-op.
  tts.abortPending();
  tts.abortPending();
  assert.equal(tts.getStatus(), 'idle');
  assert.equal(logs.length, 0, 'abortPending on idle must never log telemetry');
});

test('tts status channel: abortPending() from failed state transitions to idle', async () => {
  const clock = makeManualClock();
  await withAudioGlobals(async () => {
    const tts = createPlatformTts({
      remoteEnabled: true,
      provider: 'gemini',
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
      now: clock.now,
      fetchFn: async () => new Response('bad', { status: 500 }),
    });
    await tts.speak({
      learnerId: 'learner-a',
      promptToken: 'prompt-token-d',
      word: { word: 'early' },
    });
    assert.equal(tts.getStatus(), 'failed', 'precondition: status is failed after 500');
    tts.abortPending();
    assert.equal(tts.getStatus(), 'idle', 'abortPending from failed must flip to idle');
  });
});

test('tts status channel: subscribe returns an unsubscribe fn that stops delivery', () => {
  const tts = createPlatformTts({ remoteEnabled: false, fetchFn: null });
  const events = [];
  const unsubscribe = tts.subscribe((event) => events.push(event));
  assert.equal(typeof unsubscribe, 'function', 'subscribe must return a function');
  unsubscribe();
  // After unsubscribe, no events delivered even if we dispatch (stop
  // dispatches an `end` event unconditionally).
  tts.stop();
  assert.equal(events.length, 0, 'no events delivered to unsubscribed listener');
});

test('tts status channel: watchdog is cleared on transition away from loading', async () => {
  const clock = makeManualClock();
  const events = [];
  await withAudioGlobals(async () => {
    const tts = createPlatformTts({
      remoteEnabled: true,
      provider: 'gemini',
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
      now: clock.now,
      fetchFn: async () => new Response(new Blob([new Uint8Array([1, 2, 3])]), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      }),
    });
    tts.subscribe((event) => {
      if (event?.type === 'status') events.push(event);
    });
    const speakPromise = tts.speak({
      learnerId: 'learner-a',
      promptToken: 'prompt-token-e',
      word: { word: 'early' },
    });
    // Yield so the fetch resolves. The fake Audio never calls onended
    // spontaneously so the state will pass through `loading` then
    // `playing`. We care about timerCount after loading ends.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(clock.timerCount, 0, 'watchdog timer must be cleared once loading ended');
    // Advance past the watchdog window — status must NOT flip to failed.
    clock.advanceBy(TTS_WATCHDOG_MS + 100);
    assert.notEqual(tts.getStatus(), 'failed', 'watchdog should not fire after the loading phase ends');
    // Clean up.
    tts.stop();
    await speakPromise.catch(() => {});
  });
});
