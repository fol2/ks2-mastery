// P5 Unit 1: AdminPanelFrame — pure logic for unified freshness/failure/empty
// state contract across all admin panels.
//
// decidePanelFrameState takes the panel's refresh envelope and returns a
// declarative state object indicating which UI elements to show. The React
// wrapper (AdminPanelFrame.jsx) consumes this to conditionally render stale
// banners, loading skeletons, empty-state slots, and retry affordances.

/** Default stale threshold: 5 minutes. */
export const DEFAULT_STALE_THRESHOLD_MS = 300_000;

/**
 * Decide what frame elements a panel should display.
 *
 * @param {object} opts
 * @param {number|null|undefined} opts.refreshedAt — timestamp (ms) of last successful data refresh
 * @param {object|null|undefined} opts.refreshError — error envelope from last refresh attempt
 * @param {*} opts.data — panel's primary data payload (array, object, or falsy)
 * @param {boolean} opts.loading — whether a refresh is currently in-flight
 * @param {number} [opts.staleThresholdMs] — ms before data is considered stale (default 300000)
 * @param {number|null|undefined} [opts.lastSuccessfulRefreshAt] — explicit last-success timestamp (falls back to refreshedAt)
 * @param {number} [opts.now] — current time for testability (defaults to Date.now())
 * @returns {{ showStaleWarning: boolean, showLoadingSkeleton: boolean, showEmptyState: boolean, showRetry: boolean, showLastSuccessTimestamp: boolean, lastSuccessAt: number|null }}
 */
export function decidePanelFrameState({
  refreshedAt,
  refreshError,
  data,
  loading,
  staleThresholdMs = DEFAULT_STALE_THRESHOLD_MS,
  lastSuccessfulRefreshAt,
  now,
} = {}) {
  const currentTime = typeof now === 'number' && Number.isFinite(now) ? now : Date.now();
  const threshold = typeof staleThresholdMs === 'number' && staleThresholdMs > 0
    ? staleThresholdMs
    : DEFAULT_STALE_THRESHOLD_MS;

  // Resolve the most authoritative last-success timestamp.
  const lastSuccess = resolveTimestamp(lastSuccessfulRefreshAt) || resolveTimestamp(refreshedAt);

  // Staleness: data is stale when the last successful refresh exceeds threshold
  // AND we actually have data to be stale about. Empty + stale is contradictory.
  const hasData = dataIsPresent(data);
  const ageMs = lastSuccess ? currentTime - lastSuccess : Infinity;
  const showStaleWarning = lastSuccess > 0 && ageMs > threshold && !loading && hasData;

  // Loading skeleton: show when actively loading AND we have no existing data.
  const showLoadingSkeleton = Boolean(loading) && !hasData;

  // Empty state: no data, no loading, no error (i.e. data genuinely empty).
  const hasError = Boolean(refreshError && typeof refreshError === 'object');
  const showEmptyState = !hasData && !loading && !hasError;

  // Retry: show when there is an error and we are not currently loading.
  const showRetry = hasError && !loading;

  // Last-success timestamp: show when we have an error but also have a
  // prior successful timestamp to reassure the user.
  const showLastSuccessTimestamp = hasError && lastSuccess > 0;

  return {
    showStaleWarning,
    showLoadingSkeleton,
    showEmptyState,
    showRetry,
    showLastSuccessTimestamp,
    lastSuccessAt: lastSuccess || null,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveTimestamp(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function dataIsPresent(data) {
  if (data == null) return false;
  if (Array.isArray(data)) return data.length > 0;
  if (typeof data === 'object') return Object.keys(data).length > 0;
  return Boolean(data);
}
