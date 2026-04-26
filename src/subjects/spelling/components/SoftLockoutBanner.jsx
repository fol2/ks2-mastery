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
  React.useEffect(() => {
    const detector = injectedDetector || createSecondTabDetector({ lockName, pollIntervalMs });
    const unsubscribe = detector.subscribe((next) => setState(next));
    detector.start();
    return () => {
      unsubscribe();
      detector.stop?.();
    };
  }, [lockName, pollIntervalMs, injectedDetector]);
  return state;
}

export function SoftLockoutBanner({ state, onAcknowledge, lockName = DEFAULT_LOCK_NAME }) {
  const kind = state?.kind || LOCKOUT_STATES.THIS_TAB_OWNS;
  if (kind === LOCKOUT_STATES.THIS_TAB_OWNS) return null;
  const copy = LOCKOUT_BANNER_COPY[kind];
  if (!copy || !copy.message) return null;
  const showStealButton = kind === LOCKOUT_STATES.OTHER_TAB_ACTIVE && Boolean(copy.actionLabel);
  async function handleSteal(event) {
    event?.preventDefault?.();
    try {
      await stealWriteLock(lockName, async () => null);
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
