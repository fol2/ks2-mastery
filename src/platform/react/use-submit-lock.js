// SH2-U1 (sys-hardening p2): JSX-layer double-submit guard hook.
//
// Problem frame (plan §SH2-U1, R1):
//   Fast double-clicks, Enter-key repeats, and mobile double-taps on
//   non-destructive buttons (Submit / Continue / Start / Retry / Finish /
//   Skip on Auth, Admin save, Parent Hub save) could spawn duplicate
//   dispatches at the JSX layer even though the subject-command adapter
//   already dedupes at `pendingKeys` (see
//   `src/platform/runtime/subject-command-actions.js`). The defect is
//   purely UI-layer: the adapter only sees the second call after React
//   has already triggered a visible transition or fired a toast. This
//   hook is the JSX-layer belt-and-braces on top of the adapter-layer
//   dedup — it is NOT a replacement for `pendingKeys` / `pendingCommand`
//   / `composeIsDisabled(ui)` guards, which remain the canonical source
//   of truth for subject commands.
//
// Contract (see `tests/react-use-submit-lock.test.js` for locked
// behaviour):
//   - `run(fn)` once: resolves with `fn`'s result. `locked` transitions
//     `false → true → false`.
//   - `run(fn)` while locked (concurrent call): returns a resolved
//     `undefined` sentinel and does NOT invoke `fn` a second time.
//   - `run(fn)` where `fn` throws: `locked` returns to `false`; the
//     error is re-thrown so callers can surface it via existing error
//     paths (e.g. AuthSurface's `setError`).
//   - `run(fn)` where `fn` returns synchronously (non-promise): the
//     hook still locks for at least one microtask — the `finally`
//     clause only runs after React processes the pending `setLocked(true)`,
//     so any immediately-following `run()` call observes `pendingRef.current === true`
//     and hits the early-return guard.
//
// Why `useRef` + `useState` in tandem:
//   - `useState` drives `locked` so JSX re-renders (button becomes
//     `disabled`, aria-busy flips, etc.) when a submit is in flight.
//   - `useRef` drives `pendingRef.current` so concurrent `run()` calls
//     within the same tick (before React batches the state update) see
//     the updated lock value. Without the ref guard, two synchronous
//     `run()` calls in a single event handler (e.g. a double-tap on
//     mobile that fires two `pointerup` events in the same frame) would
//     both pass the `locked` check because `setLocked(true)` has not yet
//     committed. The ref is the source of truth for the re-entrancy
//     check; the state is the source of truth for rendering.

import { useCallback, useRef, useState } from 'react';

export function useSubmitLock() {
  const [locked, setLocked] = useState(false);
  const pendingRef = useRef(false);

  const run = useCallback(async (fn) => {
    if (pendingRef.current) return undefined;
    pendingRef.current = true;
    setLocked(true);
    try {
      return await fn();
    } finally {
      pendingRef.current = false;
      setLocked(false);
    }
  }, []);

  return { locked, run };
}
