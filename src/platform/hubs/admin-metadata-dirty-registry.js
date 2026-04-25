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
    return suppressedRefreshCount;
  }

  function getSuppressedRefreshCount() {
    return suppressedRefreshCount;
  }

  function clear() {
    dirtyAccounts.clear();
    suppressedRefreshCount = 0;
  }

  return {
    setDirty,
    anyDirty,
    recordSuppressedRefresh,
    getSuppressedRefreshCount,
    clear,
  };
}
