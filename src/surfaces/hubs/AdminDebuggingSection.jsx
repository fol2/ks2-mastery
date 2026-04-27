import React from 'react';
import { formatTimestamp, isBlocked } from './hub-utils.js';
import { PanelHeader } from './admin-panel-header.jsx';
import { formatOccurrenceTimestamp } from '../../platform/hubs/admin-occurrence-timeline.js';
import { normaliseDenialEntry } from '../../platform/hubs/admin-denial-panel.js';
import {
  BUNDLE_SECTION_LABELS,
  BUNDLE_SECTIONS,
  isSectionEmpty,
  formatBundleTimestamp,
} from '../../platform/hubs/admin-debug-bundle-panel.js';

// U4+U5: Debugging & Logs section — error log centre + learner support /
// diagnostics panels. Extracted from AdminHubSurface.jsx.
// U8 (P3): + denial log panel below error centre.
// U6 (P3): + debug bundle panel below denial log.

const ERROR_EVENT_STATUS_OPTIONS = ['open', 'investigating', 'resolved', 'ignored'];

// U5 (P3): occurrence timeline sub-component. Renders inside the error
// drawer once the occurrences have been fetched. Lazy-loaded via the
// `onLoad` callback when the drawer is first expanded.
function OccurrenceTimeline({ eventId, occurrences, loading, onLoad, canViewAccount }) {
  const rows = Array.isArray(occurrences) ? occurrences : [];
  const loaded = rows.length > 0 || loading === false;
  return (
    <div data-testid={`occurrence-timeline-${eventId}`} style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
              <th style={{ textAlign: 'left', padding: '2px 6px' }}>When</th>
              <th style={{ textAlign: 'left', padding: '2px 6px' }}>Release</th>
              <th style={{ textAlign: 'left', padding: '2px 6px' }}>Route</th>
              {canViewAccount ? <th style={{ textAlign: 'left', padding: '2px 6px' }}>Account</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((occ) => (
              <tr key={occ.id || occ.occurredAt} data-testid={`occurrence-row-${occ.id}`}>
                <td className="muted" style={{ padding: '2px 6px' }}>{formatOccurrenceTimestamp(occ.occurredAt)}</td>
                <td style={{ padding: '2px 6px', fontFamily: 'monospace' }}>{occ.release ? String(occ.release).slice(0, 7) : '—'}</td>
                <td className="muted" style={{ padding: '2px 6px' }}>{occ.routeName || '—'}</td>
                {canViewAccount ? <td className="muted" style={{ padding: '2px 6px' }}>{occ.accountId || 'anon'}</td> : null}
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
        <dd>×{Number(entry.occurrenceCount) || 1} (timeline aggregated — per-event history deferred)</dd>

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

function ErrorLogCentrePanel({ model, actions }) {
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
      <div className="chip-row" style={{ marginTop: 8 }}>
        <span className="chip">{String(Number(totals.open) || 0)} open</span>
        <span className="chip">{String(Number(totals.investigating) || 0)} investigating</span>
        <span className="chip">{String(Number(totals.resolved) || 0)} resolved</span>
        <span className="chip">{String(Number(totals.ignored) || 0)} ignored</span>
      </div>
      <div className="chip-row" style={{ marginTop: 8 }}>
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
        className="filters"
        style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}
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
      <div className="chip-row" style={{ marginTop: 8 }}>
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
    <section className="card" style={{ marginBottom: 20 }}>
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

function LearnerSupportPanel({ model, appState, accessContext, actions }) {
  const selectedDiagnostics = model.learnerSupport?.selectedDiagnostics || null;
  const accessibleLearners = Array.isArray(model.learnerSupport?.accessibleLearners) ? model.learnerSupport.accessibleLearners : [];
  const selectedLearnerId = model.learnerSupport?.selectedLearnerId || selectedDiagnostics?.learnerId || '';
  const classroomSummaryDegraded = appState?.persistence?.breakersDegraded?.classroomSummary === true;
  const selectedGrammarEvidence = selectedDiagnostics?.grammarEvidence || {};
  const selectedPunctuationEvidence = selectedDiagnostics?.punctuationEvidence || {};
  const selectedPunctuationRelease = selectedPunctuationEvidence.releaseDiagnostics
    || model.learnerSupport?.punctuationReleaseDiagnostics
    || {};

  return (
    <article className="card" data-admin-hub-panel="classroom-summary" style={{ marginBottom: 20 }}>
      <div className="eyebrow">Learner support / diagnostics</div>
      <h3 className="section-title" style={{ fontSize: '1.2rem' }}>Readable learners</h3>
      {classroomSummaryDegraded ? (
        <div className="feedback warn" data-admin-hub-degraded="classroom-summary">
          <strong>Classroom summary temporarily unavailable</strong>
          <div style={{ marginTop: 8 }}>
            Per-learner Grammar and Punctuation summary stats are taking too long to load. The learner list remains available below — use Select to drill into an individual learner. Practice is unaffected.
          </div>
        </div>
      ) : null}
      {accessibleLearners.length ? accessibleLearners.map((entry) => (
        <div className="skill-row" key={entry.learnerId}>
          <div>
            <strong>{entry.learnerName}</strong>
            <div className="small muted">{entry.yearGroup} · {entry.membershipRoleLabel} · {entry.accessModeLabel || (entry.writable ? 'Writable learner' : 'Read-only learner')}</div>
          </div>
          {classroomSummaryDegraded ? null : (
            <>
              <div className="small muted">Focus: {entry.currentFocus?.label || '—'}</div>
              <div>{String(entry.overview?.dueWords ?? 0)} due</div>
              <div className="small muted">
                Grammar: {String(entry.grammarEvidence?.progressSnapshot?.dueConcepts ?? entry.overview?.dueGrammarConcepts ?? 0)} due / {String(entry.grammarEvidence?.progressSnapshot?.weakConcepts ?? entry.overview?.weakGrammarConcepts ?? 0)} weak
              </div>
              <div className="small muted">
                Punctuation: {String(entry.punctuationEvidence?.progressSnapshot?.dueItems ?? entry.overview?.duePunctuationItems ?? 0)} due / {String(entry.punctuationEvidence?.progressSnapshot?.weakItems ?? entry.overview?.weakPunctuationItems ?? 0)} weak
              </div>
            </>
          )}
          <div><button className="btn ghost" type="button" onClick={() => actions.dispatch('adult-surface-learner-select', { value: entry.learnerId })}>Select</button></div>
        </div>
      )) : <p className="small muted">No learner diagnostics are accessible from this account scope yet.</p>}
      {selectedDiagnostics && (
        <div className="callout" style={{ marginTop: 16 }}>
          <strong>{selectedDiagnostics.learnerName}</strong>
          <div style={{ marginTop: 8 }}>
            Secure: {String(selectedDiagnostics.overview?.secureWords ?? 0)} · Due: {String(selectedDiagnostics.overview?.dueWords ?? 0)} · Trouble: {String(selectedDiagnostics.overview?.troubleWords ?? 0)}
          </div>
          <div style={{ marginTop: 8 }}>
            <strong>Grammar diagnostics</strong>: secured {String(selectedGrammarEvidence.progressSnapshot?.securedConcepts ?? selectedDiagnostics.overview?.secureGrammarConcepts ?? 0)} · due {String(selectedGrammarEvidence.progressSnapshot?.dueConcepts ?? selectedDiagnostics.overview?.dueGrammarConcepts ?? 0)} · weak {String(selectedGrammarEvidence.progressSnapshot?.weakConcepts ?? selectedDiagnostics.overview?.weakGrammarConcepts ?? 0)}
          </div>
          <div style={{ marginTop: 8 }}>
            <strong>Punctuation diagnostics</strong>: secured {String(selectedPunctuationEvidence.progressSnapshot?.securedRewardUnits ?? selectedDiagnostics.overview?.securePunctuationUnits ?? 0)} · due {String(selectedPunctuationEvidence.progressSnapshot?.dueItems ?? selectedDiagnostics.overview?.duePunctuationItems ?? 0)} · weak {String(selectedPunctuationEvidence.progressSnapshot?.weakItems ?? selectedDiagnostics.overview?.weakPunctuationItems ?? 0)}
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>
            Punctuation release: {selectedPunctuationRelease.releaseId || 'unknown'} · tracked units {String(selectedPunctuationRelease.trackedRewardUnitCount ?? 0)} · sessions {String(selectedPunctuationRelease.sessionCount ?? 0)} · weak patterns {String(selectedPunctuationRelease.weakPatternCount ?? 0)} · exposure {selectedPunctuationRelease.productionExposureStatus || 'unknown'}
          </div>
          {selectedGrammarEvidence.questionTypeSummary?.[0] ? (
            <div className="small muted" style={{ marginTop: 8 }}>
              Question-type focus: {selectedGrammarEvidence.questionTypeSummary[0].label || selectedGrammarEvidence.questionTypeSummary[0].id}
            </div>
          ) : null}
          {selectedPunctuationEvidence.weakestFacets?.[0] ? (
            <div className="small muted" style={{ marginTop: 8 }}>
              Punctuation focus: {selectedPunctuationEvidence.weakestFacets[0].label || selectedPunctuationEvidence.weakestFacets[0].id}
            </div>
          ) : null}
          <div className="small muted" style={{ marginTop: 8 }}>{selectedDiagnostics.currentFocus?.detail || 'No current focus surfaced.'}</div>
        </div>
      )}
      <div className="actions" style={{ marginTop: 16 }}>
        {(model.learnerSupport.entryPoints || []).map((entry) => (
          <button
            className="btn secondary"
            type="button"
            disabled={isBlocked(entry.action, accessContext)}
            onClick={() => actions.dispatch(entry.action, { subjectId: entry.subjectId, tab: entry.tab })}
            key={`${entry.action}-${entry.label}`}
          >
            {entry.label}
          </button>
        ))}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// U8 (P3): Denial log panel — surfaces request denial events (R8).
// R8 visibility: admin sees account_id (masked last 8); ops sees reason +
// route only — NO account or learner linkage (prevents child activity
// disclosure).
// ---------------------------------------------------------------------------

const DENIAL_REASON_OPTIONS = [
  'suspended_account',
  'rate_limited',
  'forbidden',
  'invalid_session',
  'demo_expired',
];

function DenialLogPanel({ model, actions }) {
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
            {DENIAL_REASON_OPTIONS.map((reason) => (
              <option value={reason} key={reason}>{reason}</option>
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
            <strong>{entry.denialReason || 'unknown'}</strong>
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

// ---------------------------------------------------------------------------
// U6 (P3): Debug Bundle panel — evidence packet generator.
// Search form + generate button + collapsible result sections.
// JSON copy is admin-only (R4 ops export restriction).
// ---------------------------------------------------------------------------

function DebugBundleSectionTable({ label, rows, columns }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return <p className="small muted">No data.</p>;
  }
  return (
    <table className="small" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key} style={{ textAlign: 'left', padding: '2px 6px' }}>{col.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => (
          <tr key={row.id || row.requestId || idx}>
            {columns.map((col) => (
              <td key={col.key} className="muted" style={{ padding: '2px 6px', fontFamily: col.mono ? 'monospace' : 'inherit' }}>
                {col.render ? col.render(row) : (row[col.key] != null ? String(row[col.key]) : '—')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DebugBundleResult({ bundleData }) {
  if (!bundleData) return null;
  const bundle = bundleData.bundle || {};

  return (
    <div data-testid="debug-bundle-result" style={{ marginTop: 12 }}>
      <div className="small muted" style={{ marginBottom: 8 }}>
        Generated: {formatBundleTimestamp(bundle.generatedAt)}
        {bundle.buildHash ? ` · Build: ${String(bundle.buildHash).slice(0, 7)}` : ''}
      </div>

      {BUNDLE_SECTIONS.map((sectionKey) => {
        const label = BUNDLE_SECTION_LABELS[sectionKey];
        const isEmpty = isSectionEmpty(bundle, sectionKey);
        const value = bundle[sectionKey];
        return (
          <details key={sectionKey} data-testid={`bundle-section-${sectionKey}`} style={{ marginBottom: 8 }}>
            <summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>
              {label} {isEmpty ? <span className="muted">(empty)</span> : null}
            </summary>
            <div style={{ padding: '4px 0 4px 12px' }}>
              {sectionKey === 'accountSummary' && value ? (
                <dl className="small" style={{ display: 'grid', gridTemplateColumns: '120px 1fr', rowGap: 2 }}>
                  <dt className="muted">Account ID</dt><dd>{value.accountId || '—'}</dd>
                  <dt className="muted">Email</dt><dd>{value.email || '—'}</dd>
                  <dt className="muted">Name</dt><dd>{value.displayName || '—'}</dd>
                  <dt className="muted">Role</dt><dd>{value.platformRole || '—'}</dd>
                  <dt className="muted">Type</dt><dd>{value.accountType || '—'}</dd>
                </dl>
              ) : null}
              {sectionKey === 'linkedLearners' ? (
                <DebugBundleSectionTable
                  label={label}
                  rows={value}
                  columns={[
                    { key: 'learnerName', label: 'Name' },
                    { key: 'learnerId', label: 'ID', mono: true },
                    { key: 'yearGroup', label: 'Year' },
                    { key: 'membershipRole', label: 'Role' },
                  ]}
                />
              ) : null}
              {sectionKey === 'recentErrors' ? (
                <DebugBundleSectionTable
                  label={label}
                  rows={value}
                  columns={[
                    { key: 'status', label: 'Status' },
                    { key: 'errorKind', label: 'Kind' },
                    { key: 'messageFirstLine', label: 'Message' },
                    { key: 'occurrenceCount', label: 'Count' },
                    { key: 'routeName', label: 'Route' },
                  ]}
                />
              ) : null}
              {sectionKey === 'errorOccurrences' ? (
                <DebugBundleSectionTable
                  label={label}
                  rows={value}
                  columns={[
                    { key: 'occurredAt', label: 'When', render: (r) => formatBundleTimestamp(r.occurredAt) },
                    { key: 'routeName', label: 'Route' },
                    { key: 'release', label: 'Release', mono: true },
                  ]}
                />
              ) : null}
              {sectionKey === 'recentDenials' ? (
                <DebugBundleSectionTable
                  label={label}
                  rows={value}
                  columns={[
                    { key: 'deniedAt', label: 'When', render: (r) => formatBundleTimestamp(r.deniedAt) },
                    { key: 'denialReason', label: 'Reason' },
                    { key: 'routeName', label: 'Route' },
                  ]}
                />
              ) : null}
              {sectionKey === 'recentMutations' ? (
                <DebugBundleSectionTable
                  label={label}
                  rows={value}
                  columns={[
                    { key: 'appliedAt', label: 'When', render: (r) => formatBundleTimestamp(r.appliedAt) },
                    { key: 'mutationKind', label: 'Kind' },
                    { key: 'scopeType', label: 'Scope' },
                    { key: 'scopeId', label: 'Scope ID', mono: true },
                  ]}
                />
              ) : null}
              {sectionKey === 'capacityState' ? (
                <DebugBundleSectionTable
                  label={label}
                  rows={value}
                  columns={[
                    { key: 'metricKey', label: 'Metric' },
                    { key: 'metricCount', label: 'Count' },
                    { key: 'updatedAt', label: 'Updated', render: (r) => formatBundleTimestamp(r.updatedAt) },
                  ]}
                />
              ) : null}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function DebugBundlePanel({ model, actions }) {
  const debugBundle = model?.debugBundle || {};
  const bundleData = debugBundle.data || null;
  const loading = debugBundle.loading === true;
  const error = debugBundle.error || null;
  const canExportJson = bundleData?.canExportJson === true;
  const humanSummary = bundleData?.humanSummary || '';

  const [accountId, setAccountId] = React.useState('');
  const [learnerId, setLearnerId] = React.useState('');
  const [timeFrom, setTimeFrom] = React.useState('');
  const [timeTo, setTimeTo] = React.useState('');
  const [fingerprint, setFingerprint] = React.useState('');
  const [routeFilter, setRouteFilter] = React.useState('');
  const [copyFeedback, setCopyFeedback] = React.useState('');

  // R7: pre-fill from error drawer link.
  const prefill = debugBundle.prefill || null;
  React.useEffect(() => {
    if (prefill?.fingerprint) setFingerprint(prefill.fingerprint);
    if (prefill?.accountId) setAccountId(prefill.accountId);
    if (prefill?.route) setRouteFilter(prefill.route);
  }, [prefill?.fingerprint, prefill?.accountId, prefill?.route]);

  const generateBundle = () => {
    const payload = {};
    if (accountId.trim()) payload.account_id = accountId.trim();
    if (learnerId.trim()) payload.learner_id = learnerId.trim();
    const fromTs = Date.parse(timeFrom);
    if (Number.isFinite(fromTs)) payload.time_from = fromTs;
    const toTs = Date.parse(timeTo);
    if (Number.isFinite(toTs)) payload.time_to = toTs;
    if (fingerprint.trim()) payload.error_fingerprint = fingerprint.trim();
    if (routeFilter.trim()) payload.route = routeFilter.trim();
    actions.dispatch('admin-debug-bundle-generate', payload);
  };

  const copyJson = async () => {
    if (!canExportJson || !bundleData?.bundle) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(bundleData.bundle, null, 2));
      setCopyFeedback('JSON copied');
      setTimeout(() => setCopyFeedback(''), 2000);
    } catch {
      setCopyFeedback('Copy failed');
      setTimeout(() => setCopyFeedback(''), 2000);
    }
  };

  const copySummary = async () => {
    if (!humanSummary) return;
    try {
      await navigator.clipboard.writeText(humanSummary);
      setCopyFeedback('Summary copied');
      setTimeout(() => setCopyFeedback(''), 2000);
    } catch {
      setCopyFeedback('Copy failed');
      setTimeout(() => setCopyFeedback(''), 2000);
    }
  };

  return (
    <section className="card" style={{ marginBottom: 20 }} data-testid="debug-bundle-panel">
      <PanelHeader
        eyebrow="Debug tools"
        title="Debug Bundle"
        refreshedAt={bundleData?.bundle?.generatedAt}
        refreshError={error}
        onRefresh={generateBundle}
      />

      <div
        className="filters"
        style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}
        data-testid="debug-bundle-search-form"
      >
        <label className="field">
          <span>Account ID or email</span>
          <input type="text" className="input" name="bundleAccountId" value={accountId} maxLength={128} onChange={(e) => setAccountId(e.target.value)} placeholder="acct-xxxx or name@example.com" data-testid="bundle-input-account" />
        </label>
        <label className="field">
          <span>Learner ID</span>
          <input type="text" className="input" name="bundleLearnerId" value={learnerId} maxLength={128} onChange={(e) => setLearnerId(e.target.value)} placeholder="learner-xxxx" data-testid="bundle-input-learner" />
        </label>
        <label className="field">
          <span>From</span>
          <input type="datetime-local" className="input" name="bundleTimeFrom" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} data-testid="bundle-input-from" />
        </label>
        <label className="field">
          <span>To</span>
          <input type="datetime-local" className="input" name="bundleTimeTo" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} data-testid="bundle-input-to" />
        </label>
        <label className="field">
          <span>Error fingerprint</span>
          <input type="text" className="input" name="bundleFingerprint" value={fingerprint} maxLength={128} onChange={(e) => setFingerprint(e.target.value)} placeholder="fp-xxxx" data-testid="bundle-input-fingerprint" />
        </label>
        <label className="field">
          <span>Route filter</span>
          <input type="text" className="input" name="bundleRoute" value={routeFilter} maxLength={64} onChange={(e) => setRouteFilter(e.target.value)} placeholder="/api/" data-testid="bundle-input-route" />
        </label>
      </div>

      <div className="chip-row" style={{ marginTop: 10 }}>
        <button className="btn" type="button" disabled={loading} onClick={generateBundle} data-testid="bundle-generate-btn">
          {loading ? 'Generating...' : 'Generate Debug Bundle'}
        </button>
        {bundleData ? (
          <>
            {canExportJson ? (
              <button className="btn ghost" type="button" onClick={copyJson} data-testid="bundle-copy-json-btn">
                Copy JSON
              </button>
            ) : null}
            <button className="btn ghost" type="button" onClick={copySummary} data-testid="bundle-copy-summary-btn">
              Copy Summary
            </button>
          </>
        ) : null}
        {copyFeedback ? <span className="chip good" data-testid="bundle-copy-feedback">{copyFeedback}</span> : null}
      </div>

      {error && !bundleData ? (
        <div className="feedback warn" style={{ marginTop: 10 }} data-testid="debug-bundle-error">
          {typeof error === 'string' ? error : 'Failed to generate debug bundle.'}
        </div>
      ) : null}

      {!bundleData && !loading && !error ? (
        <p className="small muted" style={{ marginTop: 10 }} data-testid="debug-bundle-empty-state">
          Enter search criteria and click Generate to create a debug evidence bundle.
        </p>
      ) : null}

      <DebugBundleResult bundleData={bundleData} />
    </section>
  );
}

export function AdminDebuggingSection({ model, appState, accessContext, actions }) {
  return (
    <>
      <ErrorLogCentrePanel model={model} actions={actions} />
      <DenialLogPanel model={model} actions={actions} />
      <DebugBundlePanel model={model} actions={actions} />
      <LearnerSupportPanel model={model} appState={appState} accessContext={accessContext} actions={actions} />
    </>
  );
}
