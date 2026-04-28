import React from 'react';
import { PanelHeader } from './admin-panel-header.jsx';
import { formatTimestamp } from './hub-utils.js';
import { decidePanelFrameState, DEFAULT_STALE_THRESHOLD_MS } from '../../platform/hubs/admin-panel-frame.js';

// P5 Unit 1: AdminPanelFrame — unified freshness/failure/empty-state wrapper.
//
// Composes (wraps) the existing PanelHeader with additional frame elements:
//   - Stale-data warning banner when last successful refresh exceeds threshold
//   - Loading skeleton slot when data is in-flight and no previous payload
//   - Empty-state slot for genuinely-empty data (no error, no loading)
//   - Partial-failure indicator with last-success memory
//
// Does NOT replace or break admin-panel-header.jsx — it delegates header
// rendering entirely to PanelHeader.

/**
 * @param {object} props
 * @param {string} props.eyebrow — PanelHeader eyebrow text
 * @param {string} props.title — PanelHeader title
 * @param {string} [props.subtitle] — PanelHeader subtitle
 * @param {number|null} props.refreshedAt — last successful refresh timestamp
 * @param {object|null} props.refreshError — error envelope from last refresh
 * @param {function} [props.onRefresh] — refresh action handler
 * @param {React.ReactNode} [props.headerExtras] — extra content for PanelHeader
 * @param {number} [props.staleThresholdMs] — ms before stale warning (default 300000)
 * @param {number|null} [props.lastSuccessfulRefreshAt] — explicit last-success ts
 * @param {*} props.data — panel's primary data payload for empty/present detection
 * @param {boolean} [props.loading] — whether a refresh is in-flight
 * @param {React.ReactNode} [props.emptyState] — custom empty-state content
 * @param {React.ReactNode} [props.loadingSkeleton] — custom loading skeleton content
 * @param {React.ReactNode} props.children — panel body content
 */
export function AdminPanelFrame({
  eyebrow,
  title,
  subtitle,
  refreshedAt,
  refreshError,
  onRefresh,
  headerExtras,
  staleThresholdMs = DEFAULT_STALE_THRESHOLD_MS,
  lastSuccessfulRefreshAt,
  data,
  loading = false,
  emptyState,
  loadingSkeleton,
  children,
}) {
  const frameState = decidePanelFrameState({
    refreshedAt,
    refreshError,
    data,
    loading,
    staleThresholdMs,
    lastSuccessfulRefreshAt,
  });

  return (
    <section className="card" style={{ marginBottom: 20 }} data-panel-frame={title}>
      <PanelHeader
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        refreshedAt={refreshedAt}
        refreshError={refreshError}
        onRefresh={onRefresh}
        headerExtras={headerExtras}
      />

      {frameState.showStaleWarning ? (
        <div
          className="feedback warn"
          data-panel-frame-stale="true"
          style={{ marginBottom: 12 }}
        >
          <strong>Data may be stale.</strong>
          {' '}Last refreshed {formatTimestamp(frameState.lastSuccessAt)}.
          {onRefresh ? (
            <span>
              {' '}<button className="btn ghost" type="button" onClick={onRefresh}>Refresh now</button>
            </span>
          ) : null}
        </div>
      ) : null}

      {frameState.showLastSuccessTimestamp && !frameState.showStaleWarning ? (
        <div
          className="feedback"
          data-panel-frame-partial-failure="true"
          style={{ marginBottom: 12 }}
        >
          Showing data from {formatTimestamp(frameState.lastSuccessAt)}. A more recent refresh failed.
        </div>
      ) : null}

      {frameState.showLoadingSkeleton ? (
        <div data-panel-frame-loading="true" aria-busy="true">
          {loadingSkeleton || (
            <div className="small muted" style={{ padding: '16px 0' }}>Loading panel data...</div>
          )}
        </div>
      ) : null}

      {frameState.showEmptyState ? (
        <div data-panel-frame-empty="true">
          {emptyState || (
            <p className="small muted" style={{ padding: '16px 0' }}>No data available.</p>
          )}
        </div>
      ) : null}

      {!frameState.showLoadingSkeleton && !frameState.showEmptyState ? children : null}
    </section>
  );
}
