// P1.5 Phase A (U2): module-scope dirty-row registry for the account ops
// metadata panel. Rows flip their dirty flag through
// `registry.setDirty(accountId, isDirty)`; the panel and cascade dispatcher
// consult `registry.anyDirty()` before firing the metadata-panel's own
// narrow refresh. A suppression counter tracks refreshes that were skipped
// while any row was dirty, and a flush callback is invoked exactly once on
// the transition from "any dirty" → "all clean" if the counter is > 0.
//
// Keeping this separate from main.js lets us unit-test the suppression +
// flush bookkeeping without spinning up the whole app controller.
//
// M8 reviewer fix: the suppression counter is module-private — no external
// consumer reads it. `recordSuppressedRefresh` returns void (no leaky
// return value) and `getSuppressedRefreshCount` is removed. Tests assert
// observable behaviour (flush fires once on dirty→clean) rather than the
// internal counter value.

export function createAccountOpsMetadataDirtyRegistry({ onFlushRequested } = {}) {
  const dirtyAccounts = new Set();
  let suppressedRefreshCount = 0;

  function setDirty(accountId, isDirty) {
    if (!accountId) return;
    if (isDirty) {
      dirtyAccounts.add(accountId);
      return;
    }
    const wasDirty = dirtyAccounts.delete(accountId);
    if (!wasDirty) return;
    if (dirtyAccounts.size === 0 && suppressedRefreshCount > 0) {
      suppressedRefreshCount = 0;
      if (typeof onFlushRequested === 'function') onFlushRequested();
    }
  }

  function anyDirty() {
    return dirtyAccounts.size > 0;
  }

  function recordSuppressedRefresh() {
    suppressedRefreshCount += 1;
  }

  function clear() {
    dirtyAccounts.clear();
    suppressedRefreshCount = 0;
  }

  return {
    setDirty,
    anyDirty,
    recordSuppressedRefresh,
    clear,
  };
}

// B1 reviewer fix: pure helper that decides whether a server prop bump
// should reset the row's dirty flag + savedAt baseline. Extracted so we
// can unit-test the save-acknowledgement lifecycle without a DOM; the
// React component wires this into a `useEffect([account.updatedAt])` and
// mutates its `dirtyRef.current` / `savedAtRef.current` accordingly.
//
// Inputs:
//  - `incomingUpdatedAt` — the `account.updatedAt` from the latest server
//                          prop (may be 0 / undefined before first save).
//  - `savedAt`           — the component's `savedAtRef.current`.
//
// Returns:
//  - { reset: true, nextSavedAt } when the server timestamp has advanced,
//    signalling that the component should clear its dirty flag and
//    update `savedAtRef.current` to `nextSavedAt`.
//  - { reset: false } when the server timestamp is unchanged or stale.
export function decideDirtyResetOnServerUpdate({ incomingUpdatedAt, savedAt }) {
  const next = Number(incomingUpdatedAt) || 0;
  const previous = Number(savedAt) || 0;
  if (next > previous) {
    return { reset: true, nextSavedAt: next };
  }
  return { reset: false };
}
