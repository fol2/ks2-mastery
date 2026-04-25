import React from 'react';
import { formatTimestamp } from './hub-utils.js';
import { routeAdminRefreshError } from '../../platform/hubs/admin-refresh-error-text.js';

// P1.5 Phase A (U1): shared header chunk for the four admin-ops panels.
// Replaces the duplicated `<div className="card-header">` blocks that each
// panel inlined previously. Renders the "Generated <ts>" chip, a Refresh
// button, and — when a narrow refresh failed since the last success — a
// visible banner routed through `admin-refresh-error-text`.
//
// Inputs:
// - eyebrow / title / subtitle — static panel copy.
// - generatedAt                — server-produced timestamp (number).
// - refreshError               — { code, message, at, correlationId? } | null
//                                as produced by the four refresh helpers in
//                                src/main.js. `null` means no active error.
// - onRefresh                  — click handler for the Refresh button.
// - extraChipRow               — optional array of nodes rendered between
//                                the Generated chip and the Refresh button;
//                                the Ops activity / error log panels use it
//                                to show inline filter controls.
// - actionExtras               — optional extra nodes rendered to the right
//                                of the Refresh button (e.g. secondary
//                                actions). Reserved for later phases.
// - headerExtras               — optional nodes rendered inside the left
//                                column, below the subtitle; used by the
//                                error log centre for its chip totals.
//
// The R27 non-enforcement callout still lives inside `AccountOpsMetadataRow`
// — this header is purely the card-header shell plus the error banner.
export function PanelHeader({
  eyebrow,
  title,
  subtitle,
  generatedAt,
  refreshError,
  onRefresh,
  refreshLabel = 'Refresh',
  actionExtras = null,
  headerExtras = null,
}) {
  const routed = refreshError && typeof refreshError === 'object'
    ? routeAdminRefreshError(refreshError.code, {
        correlationId: refreshError.correlationId || null,
      })
    : null;
  // Do not render a banner when the router hands off to a global handler
  // (session invalidated / account suspended), delegates to row-level UI
  // (account_ops_metadata_stale → Phase C U9), or the error is silent
  // (validation_failed → triggering form owns the 400 message).
  const showBanner = Boolean(
    routed
    && !routed.globalHandler
    && !routed.delegate
    && !routed.silent
    && routed.text,
  );
  const bannerClass = routed?.kind === 'error'
    ? 'feedback bad'
    : routed?.kind === 'info'
      ? 'feedback'
      : 'feedback warn';
  return (
    <>
      <div className="card-header">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h3 className="section-title" style={{ fontSize: '1.2rem' }}>{title}</h3>
          {subtitle ? <p className="small muted">{subtitle}</p> : null}
          {headerExtras}
        </div>
        <div className="actions">
          <span className="chip">Generated {formatTimestamp(generatedAt)}</span>
          {onRefresh ? (
            <button className="btn secondary" type="button" onClick={onRefresh}>
              {refreshLabel}
            </button>
          ) : null}
          {actionExtras}
        </div>
      </div>
      {showBanner ? (
        <div
          className={bannerClass}
          data-admin-refresh-error-code={refreshError.code || 'network'}
          style={{ marginBottom: 14 }}
        >
          <strong>{routed.text}</strong>
          {routed.hasRetry && onRefresh ? (
            <div style={{ marginTop: 6 }}>
              <button className="btn ghost" type="button" onClick={onRefresh}>
                Retry refresh
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
