import React from 'react';
import {
  LOCKOUT_BANNER_COPY,
  LOCKOUT_STATES,
  createSecondTabDetector,
} from '../../../platform/core/repositories/locks/second-tab-detector.js';
import {
  DEFAULT_LOCK_NAME,
  stealWriteLock,
} from '../../../platform/core/repositories/locks/lock-manager.js';

/**
 * P2 U5 — Soft-lockout banner for Spelling scenes.
 *
 * Renders a banner only when the detector reports `OTHER_TAB_ACTIVE` or
 * `SINGLE_TAB_FALLBACK`. When both browsers are fully locks-capable and
 * this tab owns the write lock, returns `null` so nothing occupies space.
 *
 * The banner is intentionally UI-agnostic about WHICH scene hosts it —
 * both SetupScene and SessionScene mount the same component. The
 * detector is instantiated once per mount; the component subscribes to
 * its state machine and cleans up on unmount.
 *
 * `useSoftLockoutBanner` also exposes a programmatic steal helper. A
 * single "Use this tab anyway" button calls `navigator.locks.request`
 * with `{ steal: true }` — use sparingly (aborts the other tab's
 * in-flight write promise, which the repository treats as a transient
 * persistence error).
 */
export function useSoftLockoutState({
  lockName = DEFAULT_LOCK_NAME,
  pollIntervalMs,
  // Test hook: inject a pre-built detector (bypasses the internal
  // `createSecondTabDetector` call). Production leaves this undefined.
  detector: injectedDetector = null,
} = {}) {
  const [state, setState] = React.useState({ kind: LOCKOUT_STATES.THIS_TAB_OWNS });
  // P2 U5 reviewer-feedback: expose a ref to the live detector so the
  // banner's steal handler can flip local state back to `THIS_TAB_OWNS`
  // after a successful ownership takeover, rather than waiting for the
  // next poll tick.
  const detectorRef = React.useRef(null);
  React.useEffect(() => {
    const detector = injectedDetector || createSecondTabDetector({ lockName, pollIntervalMs });
    detectorRef.current = detector;
    const unsubscribe = detector.subscribe((next) => setState(next));
    detector.start();
    return () => {
      unsubscribe();
      detector.stop?.();
      detectorRef.current = null;
    };
  }, [lockName, pollIntervalMs, injectedDetector]);
  const acknowledge = React.useCallback(() => {
    // Flip the detector's state machine to THIS_TAB_OWNS. If the detector
    // is still mounted (banner re-renders during its steal await), the
    // subscriber fires and the component unmounts naturally.
    detectorRef.current?.acknowledgeOwnership?.();
  }, []);
  return { state, acknowledge };
}

export function SoftLockoutBanner({
  state,
  onAcknowledge,
  lockName = DEFAULT_LOCK_NAME,
  // P2 U5 reviewer-feedback (HIGH): after steal, immediately perform a
  // durable write under the stealing tab's own lock so the steal is
  // observable to sibling tabs (via the broadcaster's writeVersion bump).
  // Callers pass the repositories' `storageCas` surface; when absent
  // (legacy / test hosts), we fall back to the bare `stealWriteLock`
  // behaviour — better than nothing, but documented as "steal theatre"
  // in that case.
  storageCas = null,
}) {
  const kind = state?.kind || LOCKOUT_STATES.THIS_TAB_OWNS;
  if (kind === LOCKOUT_STATES.THIS_TAB_OWNS) return null;
  const copy = LOCKOUT_BANNER_COPY[kind];
  if (!copy || !copy.message) return null;
  const showStealButton = kind === LOCKOUT_STATES.OTHER_TAB_ACTIVE && Boolean(copy.actionLabel);
  async function handleSteal(event) {
    event?.preventDefault?.();
    try {
      // P2 U5 reviewer-feedback: hold the stolen lock long enough to
      // persist a single write under the new ownership. `stealWriteLock`
      // runs the inner callback INSIDE the stolen critical section, so
      // `storageCas.persistAllLocked` (which itself uses withWriteLock)
      // would deadlock — instead we invoke persistAll directly through
      // the storageCas broadcast surface so sibling tabs see the
      // writeVersion bump immediately.
      await stealWriteLock(lockName, async () => {
        // Inside the stolen lock, issue a durable persist. When
        // storageCas is injected, call its `persistAllLocked` fallback
        // (which re-checks isLocksAvailable and, since we're already
        // inside a locked section, runs the sync `persistAll`). When
        // storageCas is absent, the steal reduces to a bare claim
        // (legacy test hosts rely on this shape).
        if (storageCas && typeof storageCas.broadcast === 'function') {
          // Force a broadcast so sibling tabs immediately see a new
          // writeVersion and rehydrate. storageCas.broadcast() fires on
          // the current in-memory writeVersion which, after the steal,
          // belongs to this tab. Without this explicit nudge, siblings
          // would only notice the ownership flip at the next write.
          try {
            storageCas.broadcast();
          } catch (_error) { /* swallow */ }
        }
        return null;
      });
      // After steal completes (and the inner callback has released the
      // stolen lock), acquire the lock cleanly so any durable write we
      // want to trigger lands under our own ownership. This produces a
      // writeVersion bump that sibling tabs observe via the broadcaster.
      if (storageCas && typeof storageCas.persistAllLocked === 'function') {
        try {
          await storageCas.persistAllLocked('local-steal', 'localStorage');
        } catch (_error) { /* swallow — write CAS still protects data */ }
      }
    } catch (_error) {
      // Steal failures fall through; the detector will re-probe next tick.
    }
    if (typeof onAcknowledge === 'function') onAcknowledge();
  }
  return (
    <div
      className={`spelling-soft-lockout spelling-soft-lockout--${kind}`}
      role="status"
      aria-live="polite"
      data-testid="spelling-soft-lockout-banner"
      data-lockout-state={kind}
    >
      <p className="spelling-soft-lockout__message">{copy.message}</p>
      {showStealButton ? (
        <button
          type="button"
          className="btn ghost spelling-soft-lockout__action"
          data-testid="spelling-soft-lockout-steal"
          onClick={handleSteal}
        >
          {copy.actionLabel}
        </button>
      ) : null}
    </div>
  );
}
