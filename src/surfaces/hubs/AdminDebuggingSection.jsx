import React from 'react';
import { formatTimestamp, isBlocked, selectedWritableLearner } from './hub-utils.js';
import { PanelHeader } from './admin-panel-header.jsx';

// U4+U5: Debugging & Logs section — error log centre + learner support /
// diagnostics panels. Extracted from AdminHubSurface.jsx.

const ERROR_EVENT_STATUS_OPTIONS = ['open', 'investigating', 'resolved', 'ignored'];

function ErrorEventDetailsDrawer({ entry, canViewAccount }) {
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
            <ErrorEventDetailsDrawer entry={entry} canViewAccount={canManage} />
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

export function AdminDebuggingSection({ model, appState, accessContext, actions }) {
  return (
    <>
      <ErrorLogCentrePanel model={model} actions={actions} />
      <LearnerSupportPanel model={model} appState={appState} accessContext={accessContext} actions={actions} />
    </>
  );
}
