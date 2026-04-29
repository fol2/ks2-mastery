import React from 'react';
import { formatTimestamp } from './hub-utils.js';
import { PanelHeader } from './admin-panel-header.jsx';
import { formatOccurrenceTimestamp } from '../../platform/hubs/admin-occurrence-timeline.js';
import '../styles/admin-panels.css';

// U8 (P4): Error log centre panel — extracted from AdminDebuggingSection.jsx.
// Contains ErrorLogCentrePanel + OccurrenceTimeline + ErrorEventDetailsDrawer.

const ERROR_EVENT_STATUS_OPTIONS = ['open', 'investigating', 'resolved', 'ignored'];

// U5 (P3): occurrence timeline sub-component. Renders inside the error
// drawer once the occurrences have been fetched. Lazy-loaded via the
// `onLoad` callback when the drawer is first expanded.
function OccurrenceTimeline({ eventId, occurrences, loading, onLoad, canViewAccount }) {
  const rows = Array.isArray(occurrences) ? occurrences : [];
  const loaded = rows.length > 0 || loading === false;
  return (
    <div data-testid={`occurrence-timeline-${eventId}`} className="admin-mt-12">
      <div className="admin-flex-row">
        <strong className="small">Occurrence timeline</strong>
        {!loaded && typeof onLoad === 'function' ? (
          <button
            className="btn ghost small"
            type="button"
            data-testid={`occurrence-load-${eventId}`}
            disabled={loading}
            onClick={() => onLoad(eventId)}
          >
            {loading ? 'Loading...' : 'Load timeline'}
          </button>
        ) : null}
      </div>
      {rows.length > 0 ? (
        <table className="small" style={{ marginTop: 6, width: '100%', borderCollapse: 'collapse' }} data-testid={`occurrence-table-${eventId}`}>
          <thead>
            <tr>
              <th className="admin-th-left">When</th>
              <th className="admin-th-left">Release</th>
              <th className="admin-th-left">Route</th>
              {canViewAccount ? <th className="admin-th-left">Account</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((occ) => (
              <tr key={occ.id || occ.occurredAt} data-testid={`occurrence-row-${occ.id}`}>
                <td className="muted admin-cell-pad">{formatOccurrenceTimestamp(occ.occurredAt)}</td>
                <td className="admin-cell-pad" style={{ fontFamily: 'monospace' }}>{occ.release ? String(occ.release).slice(0, 7) : '—'}</td>
                <td className="muted admin-cell-pad">{occ.routeName || '—'}</td>
                {canViewAccount ? <td className="muted admin-cell-pad">{occ.accountId || 'anon'}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {loaded && rows.length === 0 ? (
        <p className="small muted" data-testid={`occurrence-empty-${eventId}`}>No occurrence history recorded.</p>
      ) : null}
    </div>
  );
}

function ErrorEventDetailsDrawer({ entry, canViewAccount, onLoadOccurrences }) {
  if (!entry) return null;
  const releaseFallback = (value) => (typeof value === 'string' && value ? value : 'unknown');
  const lastStatusChangeAt = Number.isFinite(Number(entry.lastStatusChangeAt))
    ? Number(entry.lastStatusChangeAt)
    : null;
  const statusLabel = entry.status || 'open';
  const firstSeenShort = typeof entry.firstSeenRelease === 'string' && entry.firstSeenRelease
    ? ` · since ${String(entry.firstSeenRelease).slice(0, 7)}`
    : '';
  const resolvedShort = (entry.status === 'resolved'
    && typeof entry.resolvedInRelease === 'string'
    && entry.resolvedInRelease)
    ? ` · fixed in ${String(entry.resolvedInRelease).slice(0, 7)}`
    : '';
  return (
    <details data-testid={`error-event-drawer-${entry.id}`} style={{ gridColumn: '1 / -1', marginTop: 8 }}>
      <summary
        className="small muted"
        style={{ cursor: 'pointer' }}
        data-testid="error-event-drawer-summary"
      >
        Details — {statusLabel}{firstSeenShort}{resolvedShort}
      </summary>
      <dl className="small" style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '180px 1fr', rowGap: 4 }}>
        <dt className="muted">Error kind</dt>
        <dd>{entry.errorKind || '—'}</dd>

        <dt className="muted">Message (first line)</dt>
        <dd data-testid="error-drawer-message">{entry.messageFirstLine || '—'}</dd>

        <dt className="muted">First frame</dt>
        <dd style={{ fontFamily: 'monospace' }}>{entry.firstFrame || '—'}</dd>

        <dt className="muted">Route</dt>
        <dd>{entry.routeName || '—'}</dd>

        <dt className="muted">User agent</dt>
        <dd style={{ wordBreak: 'break-all' }}>{entry.userAgent || '—'}</dd>

        <dt className="muted">Occurrences</dt>
        <dd>×{Number(entry.occurrenceCount) || 1} (per-event occurrence timeline available below)</dd>

        <dt className="muted">First seen</dt>
        <dd>{formatTimestamp(entry.firstSeen)}</dd>

        <dt className="muted">Last seen</dt>
        <dd>{formatTimestamp(entry.lastSeen)}</dd>

        <dt className="muted">First seen release</dt>
        <dd data-testid="error-drawer-first-release">{releaseFallback(entry.firstSeenRelease)}</dd>

        <dt className="muted">Last seen release</dt>
        <dd data-testid="error-drawer-last-release">{releaseFallback(entry.lastSeenRelease)}</dd>

        <dt className="muted">Resolved in release</dt>
        <dd data-testid="error-drawer-resolved-release">{releaseFallback(entry.resolvedInRelease)}</dd>

        <dt className="muted">Last status change</dt>
        <dd data-testid="error-drawer-status-change">
          {lastStatusChangeAt ? formatTimestamp(lastStatusChangeAt) : 'status unchanged'}
        </dd>

        {canViewAccount ? (
          <React.Fragment>
            <dt className="muted">Linked account (last 6)</dt>
            <dd data-testid="error-drawer-account">
              {entry.accountIdMasked || 'anonymous'}
            </dd>
          </React.Fragment>
        ) : null}
      </dl>
      <OccurrenceTimeline
        eventId={entry.id}
        occurrences={entry.occurrences}
        loading={entry.occurrencesLoading}
        onLoad={onLoadOccurrences}
        canViewAccount={canViewAccount}
      />
    </details>
  );
}

export function ErrorLogCentrePanel({ model, actions }) {
  const summary = model?.errorLogSummary || {};
  const totals = summary.totals || {};
  const entries = Array.isArray(summary.entries) ? summary.entries : [];
  const statusFilters = ERROR_EVENT_STATUS_OPTIONS;
  const canManage = model?.permissions?.platformRole === 'admin';
  const savingEventId = summary.savingEventId || '';
  const currentRelease = typeof summary.currentRelease === 'string' && summary.currentRelease
    ? summary.currentRelease
    : null;
  const [filterRoute, setFilterRoute] = React.useState('');
  const [filterKind, setFilterKind] = React.useState('');
  const [filterLastSeenAfter, setFilterLastSeenAfter] = React.useState('');
  const [filterLastSeenBefore, setFilterLastSeenBefore] = React.useState('');
  const [filterRelease, setFilterRelease] = React.useState(currentRelease || '');
  const [filterReopened, setFilterReopened] = React.useState(false);

  const dispatchFilter = (statusOverride) => {
    const payload = {
      status: statusOverride || null,
      route: filterRoute.trim() || null,
      kind: filterKind.trim() || null,
      release: filterRelease.trim() || null,
      reopenedAfterResolved: Boolean(filterReopened),
    };
    const afterTs = Date.parse(filterLastSeenAfter);
    if (Number.isFinite(afterTs)) payload.lastSeenAfter = afterTs;
    const beforeTs = Date.parse(filterLastSeenBefore);
    if (Number.isFinite(beforeTs)) payload.lastSeenBefore = beforeTs;
    actions.dispatch('admin-ops-error-events-refresh', payload);
  };

  const clearFilters = () => {
    setFilterRoute('');
    setFilterKind('');
    setFilterLastSeenAfter('');
    setFilterLastSeenBefore('');
    setFilterRelease(currentRelease || '');
    setFilterReopened(false);
    actions.dispatch('admin-ops-error-events-refresh', { status: null });
  };

  const filtersActive = Boolean(
    filterRoute
      || filterKind
      || filterLastSeenAfter
      || filterLastSeenBefore
      || (filterRelease && filterRelease !== currentRelease)
      || filterReopened,
  );

  const headerExtras = (
    <>
      <div className="chip-row admin-mt-8">
        <span className="chip">{String(Number(totals.open) || 0)} open</span>
        <span className="chip">{String(Number(totals.investigating) || 0)} investigating</span>
        <span className="chip">{String(Number(totals.resolved) || 0)} resolved</span>
        <span className="chip">{String(Number(totals.ignored) || 0)} ignored</span>
      </div>
      <div className="chip-row admin-mt-8">
        {statusFilters.map((status) => (
          <button
            className="btn ghost"
            type="button"
            key={status}
            onClick={() => actions.dispatch('admin-ops-error-events-refresh', { status })}
          >
            Show {status}
          </button>
        ))}
      </div>
      <div
        className="filters admin-filter-grid"
        data-testid="error-centre-filters"
      >
        <label className="field">
          <span>Route contains</span>
          <input
            type="text"
            className="input"
            name="errorFilterRoute"
            value={filterRoute}
            maxLength={64}
            onChange={(event) => setFilterRoute(event.target.value)}
            placeholder="/api/"
          />
        </label>
        <label className="field">
          <span>Kind</span>
          <input
            type="text"
            className="input"
            name="errorFilterKind"
            value={filterKind}
            maxLength={128}
            onChange={(event) => setFilterKind(event.target.value)}
            placeholder="TypeError"
          />
        </label>
        <label className="field">
          <span>Last seen after</span>
          <input
            type="datetime-local"
            className="input"
            name="errorFilterLastSeenAfter"
            value={filterLastSeenAfter}
            onChange={(event) => setFilterLastSeenAfter(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Last seen before</span>
          <input
            type="datetime-local"
            className="input"
            name="errorFilterLastSeenBefore"
            value={filterLastSeenBefore}
            onChange={(event) => setFilterLastSeenBefore(event.target.value)}
          />
        </label>
        <label className="field">
          <span>New in release (SHA)</span>
          <input
            id="error-filter-release"
            aria-describedby="error-filter-release-hint"
            type="text"
            className="input"
            name="errorFilterRelease"
            value={filterRelease}
            maxLength={40}
            onChange={(event) => setFilterRelease(event.target.value)}
            placeholder="abc1234"
            data-testid="error-centre-filter-release"
          />
          <span
            id="error-filter-release-hint"
            className="small muted"
            data-testid="error-centre-filter-release-hint"
          >
            {currentRelease
              ? `Current deploy: ${String(currentRelease).slice(0, 7)}`
              : 'Current deploy unavailable — paste a SHA'}
          </span>
        </label>
        <label className="field" style={{ alignSelf: 'end' }}>
          <span>Reopened after resolved</span>
          <input
            type="checkbox"
            name="errorFilterReopened"
            checked={filterReopened}
            onChange={(event) => setFilterReopened(event.target.checked)}
          />
        </label>
      </div>
      <div className="chip-row admin-mt-8">
        <button
          className="btn"
          type="button"
          data-testid="error-centre-filter-apply"
          onClick={() => dispatchFilter(null)}
        >
          Apply filters
        </button>
        <button
          className="btn ghost"
          type="button"
          data-testid="error-centre-filter-reset"
          onClick={clearFilters}
        >
          Clear filters
        </button>
        {filtersActive && (
          <span
            className="chip warn"
            data-testid="error-centre-filters-active-chip"
          >
            Filters active
          </span>
        )}
      </div>
    </>
  );
  return (
    <section className="card admin-card-mb">
      <PanelHeader
        eyebrow="Error log"
        title="Error log centre"
        refreshedAt={summary.refreshedAt ?? summary.generatedAt}
        refreshError={summary.refreshError || null}
        onRefresh={() => actions.dispatch('admin-ops-error-events-refresh', { status: null })}
        headerExtras={headerExtras}
      />
      {entries.length ? entries.map((entry) => {
        const isSaving = savingEventId === entry.id;
        return (
          <div className="skill-row" key={entry.id} data-testid={`error-event-row-${entry.id}`}>
            <div>
              <strong>{entry.errorKind || 'Error'}</strong>
              <div className="small muted">{entry.messageFirstLine || ''}</div>
            </div>
            <div className="small muted">{entry.routeName || ''}</div>
            <div>×{Number(entry.occurrenceCount) || 1}</div>
            <div className="small muted">First {formatTimestamp(entry.firstSeen)}</div>
            <div className="small muted">Last {formatTimestamp(entry.lastSeen)}</div>
            <div>
              {canManage ? (
                <label className="field" style={{ minWidth: 150 }}>
                  <span>Status</span>
                  <select
                    className="select"
                    name="errorEventStatus"
                    value={entry.status || 'open'}
                    disabled={isSaving}
                    onChange={(event) => actions.dispatch('ops-error-event-status-set', { eventId: entry.id, status: event.target.value })}
                  >
                    {ERROR_EVENT_STATUS_OPTIONS.map((option) => (
                      <option value={option} key={option}>{option}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className="chip">{entry.status || 'open'}</span>
              )}
            </div>
            <ErrorEventDetailsDrawer
              entry={entry}
              canViewAccount={canManage}
              onLoadOccurrences={(eventId) => actions.dispatch('admin-ops-load-occurrences', { eventId })}
            />
          </div>
        );
      }) : (
        <p
          className="small muted"
          data-testid="error-centre-empty-state"
        >
          {filtersActive
            ? 'No errors match the current filters.'
            : 'No error events recorded.'}
        </p>
      )}
    </section>
  );
}
