import React from 'react';
import { formatTimestamp } from './hub-utils.js';
import { PanelHeader } from './admin-panel-header.jsx';
import { normaliseDenialEntry } from '../../platform/hubs/admin-denial-panel.js';

// U8 (P4): Denial log panel — extracted from AdminDebuggingSection.jsx.
// Contains DenialLogPanel + DENIAL_REASON_OPTIONS + DENIAL_REASON_LABEL_MAP.

// ---------------------------------------------------------------------------
// U8 (P3): Denial log panel — surfaces request denial events (R8).
// R8 visibility: admin sees account_id (masked last 8); ops sees reason +
// route only — NO account or learner linkage (prevents child activity
// disclosure).
// ---------------------------------------------------------------------------

// Values must match DENIAL_* constants in worker/src/error-codes.js (lines 20-24).
const DENIAL_REASON_OPTIONS = [
  { value: 'account_suspended',   label: 'Account Suspended' },
  { value: 'payment_hold',        label: 'Payment Hold' },
  { value: 'session_invalidated', label: 'Session Invalidated' },
  { value: 'csrf_rejection',      label: 'CSRF / Same-Origin' },
  { value: 'rate_limit_exceeded', label: 'Rate Limited' },
];

/** Reverse-lookup: code → friendly label for denial row rendering. */
const DENIAL_REASON_LABEL_MAP = Object.fromEntries(
  DENIAL_REASON_OPTIONS.map(({ value, label }) => [value, label]),
);

export function DenialLogPanel({ model, actions }) {
  const denialLog = model?.denialLog || {};
  const rawEntries = Array.isArray(denialLog.entries) ? denialLog.entries : [];
  const entries = rawEntries.map(normaliseDenialEntry);
  const canViewAccount = model?.permissions?.platformRole === 'admin';

  const [filterReason, setFilterReason] = React.useState('');
  const [filterRoute, setFilterRoute] = React.useState('');
  const [filterFrom, setFilterFrom] = React.useState('');
  const [filterTo, setFilterTo] = React.useState('');

  const dispatchRefresh = () => {
    const payload = {};
    if (filterReason) payload.reason = filterReason;
    if (filterRoute.trim()) payload.route = filterRoute.trim();
    const fromTs = Date.parse(filterFrom);
    if (Number.isFinite(fromTs)) payload.from = fromTs;
    const toTs = Date.parse(filterTo);
    if (Number.isFinite(toTs)) payload.to = toTs;
    actions.dispatch('admin-ops-request-denials-refresh', payload);
  };

  const clearFilters = () => {
    setFilterReason('');
    setFilterRoute('');
    setFilterFrom('');
    setFilterTo('');
    actions.dispatch('admin-ops-request-denials-refresh', {});
  };

  const filtersActive = Boolean(filterReason || filterRoute || filterFrom || filterTo);

  const headerExtras = (
    <>
      <div
        className="filters"
        style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}
        data-testid="denial-panel-filters"
      >
        <label className="field">
          <span>Denial reason</span>
          <select
            className="select"
            name="denialFilterReason"
            value={filterReason}
            onChange={(event) => setFilterReason(event.target.value)}
            data-testid="denial-filter-reason"
          >
            <option value="">All reasons</option>
            {DENIAL_REASON_OPTIONS.map(({ value, label }) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Route contains</span>
          <input
            type="text"
            className="input"
            name="denialFilterRoute"
            value={filterRoute}
            maxLength={64}
            onChange={(event) => setFilterRoute(event.target.value)}
            placeholder="/api/"
            data-testid="denial-filter-route"
          />
        </label>
        <label className="field">
          <span>From</span>
          <input
            type="datetime-local"
            className="input"
            name="denialFilterFrom"
            value={filterFrom}
            onChange={(event) => setFilterFrom(event.target.value)}
            data-testid="denial-filter-from"
          />
        </label>
        <label className="field">
          <span>To</span>
          <input
            type="datetime-local"
            className="input"
            name="denialFilterTo"
            value={filterTo}
            onChange={(event) => setFilterTo(event.target.value)}
            data-testid="denial-filter-to"
          />
        </label>
      </div>
      <div className="chip-row" style={{ marginTop: 8 }}>
        <button
          className="btn"
          type="button"
          data-testid="denial-filter-apply"
          onClick={dispatchRefresh}
        >
          Apply filters
        </button>
        <button
          className="btn ghost"
          type="button"
          data-testid="denial-filter-reset"
          onClick={clearFilters}
        >
          Clear filters
        </button>
        {filtersActive && (
          <span
            className="chip warn"
            data-testid="denial-filters-active-chip"
          >
            Filters active
          </span>
        )}
      </div>
    </>
  );

  return (
    <section className="card" style={{ marginBottom: 20 }} data-testid="denial-log-panel">
      <PanelHeader
        eyebrow="Request denials"
        title="Denial log"
        refreshedAt={denialLog.refreshedAt ?? denialLog.generatedAt}
        refreshError={denialLog.refreshError || null}
        onRefresh={() => actions.dispatch('admin-ops-request-denials-refresh', {})}
        headerExtras={headerExtras}
      />
      {entries.length ? entries.map((entry) => (
        <div className="skill-row" key={entry.id} data-testid={`denial-row-${entry.id}`}>
          <div>
            <strong>{DENIAL_REASON_LABEL_MAP[entry.denialReason] || entry.denialReason || 'unknown'}</strong>
          </div>
          <div className="small muted">{entry.routeName || '—'}</div>
          <div className="small muted">{formatTimestamp(entry.deniedAt)}</div>
          {canViewAccount ? (
            <div className="small muted" data-testid={`denial-account-${entry.id}`}>
              {entry.accountIdMasked || 'anonymous'}
            </div>
          ) : null}
          {entry.isDemo ? <span className="chip">demo</span> : null}
        </div>
      )) : (
        <p
          className="small muted"
          data-testid="denial-panel-empty-state"
        >
          {filtersActive
            ? 'No denials match the current filters.'
            : 'No request denials recorded.'}
        </p>
      )}
    </section>
  );
}
