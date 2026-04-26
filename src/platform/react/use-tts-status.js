import React from 'react';

// SH2-U4 (sys-hardening p2): React hook wrapper around the TTS port's
// `subscribe()` + `getStatus()` channel. The port is the primary
// contract; this hook is a thin subscriber so JSX consumers can read
// `status` reactively without hand-rolling a `useEffect` every time.
//
// The hook defaults `status` to `'idle'` when the port is absent (noop
// ttsPort in tests) or when the port does not implement the channel
// (legacy adapters). Any `ttsPort` instance that exposes `subscribe()`
// and `getStatus()` wires through transparently.
//
// Return value is ONLY `status`. The port lifecycle (speak / stop /
// abortPending) stays on the port itself — we do NOT expose imperative
// methods through the hook to keep the subscription boundary narrow.

/**
 * @param {object | null | undefined} ttsPort
 *   The TTS port (e.g. `createPlatformTts({ ... })` return value or the
 *   noop port from `side-effect-ports.js`). Falsy values resolve to
 *   `'idle'`.
 * @returns {'idle' | 'loading' | 'playing' | 'failed'}
 */
export function useTtsStatus(ttsPort) {
  const initial = typeof ttsPort?.getStatus === 'function'
    ? safeGetStatus(ttsPort)
    : 'idle';
  const [status, setStatus] = React.useState(initial);

  React.useEffect(() => {
    if (!ttsPort || typeof ttsPort.subscribe !== 'function') return undefined;
    // Sync up in case the status changed between `useState` init and
    // the effect running on mount (e.g. a speak() fired in a parent
    // useEffect that ran earlier).
    setStatus(safeGetStatus(ttsPort));
    const unsubscribe = ttsPort.subscribe((event) => {
      if (event?.type !== 'status') return;
      const next = typeof event.status === 'string' ? event.status : safeGetStatus(ttsPort);
      setStatus(next);
    });
    return () => {
      try { unsubscribe?.(); } catch { /* noop */ }
    };
  }, [ttsPort]);

  return status;
}

function safeGetStatus(ttsPort) {
  try {
    const value = ttsPort?.getStatus?.();
    if (value === 'loading' || value === 'playing' || value === 'failed') return value;
    return 'idle';
  } catch {
    return 'idle';
  }
}
