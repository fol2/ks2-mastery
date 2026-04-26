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
// - refreshedAt                — server-produced timestamp (number) from the
//                                last successful refresh. Named `refreshedAt`
//                                (M7 reviewer fix) to match the sibling
//                                maintained by `composeSuccess`; the display
//                                label remains "Generated <ts>" because the
//                                value conceptually represents "when the
//                                server produced this payload".
// - refreshError               — { code, message, at, correlationId? } | null
//                                as produced by the four refresh helpers in
//                                src/main.js. `null` means no active error.
// - onRefresh                  — click handler for the Refresh button.
// - headerExtras               — optional nodes rendered inside the left
//                                column, below the subtitle; used by the
//                                error log centre for its chip totals.
//
// M6 reviewer fix: `refreshLabel`, `actionExtras`, and `ctaKind` were
// unused by every call-site and are removed. If a later phase needs them
// back, they should be reintroduced with a live consumer in the same PR.
//
// The R27 non-enforcement callout still lives inside `AccountOpsMetadataRow`
// — this header is purely the card-header shell plus the error banner.
export function PanelHeader({
  eyebrow,
  title,
  subtitle,
  refreshedAt,
  refreshError,
  onRefresh,
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
          {/* SH2-U8: inline style prop migrated to `.admin-panel-header-title`
              (font-size override 1.2rem vs .section-title default 1.35rem).
              See docs/hardening/csp-inline-style-inventory.md. */}
          <h3 className="section-title admin-panel-header-title">{title}</h3>
          {subtitle ? <p className="small muted">{subtitle}</p> : null}
          {headerExtras}
        </div>
        <div className="actions">
          <span className="chip">Generated {formatTimestamp(refreshedAt)}</span>
          {onRefresh ? (
            <button className="btn secondary" type="button" onClick={onRefresh}>
              Refresh
            </button>
          ) : null}
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
