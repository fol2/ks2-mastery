import React from 'react';
import { AdultLearnerSelect } from './AdultLearnerSelect.jsx';
import { ReadOnlyLearnerNotice } from './ReadOnlyLearnerNotice.jsx';
import { AccessDeniedCard, formatTimestamp, isBlocked, selectedWritableLearner } from './hub-utils.js';

function snapshotSubjectId(snapshot = {}) {
  if (snapshot.subjectId) return snapshot.subjectId;
  return snapshot.totalConcepts != null || snapshot.trackedConcepts != null ? 'grammar' : 'spelling';
}

function snapshotChipLabel(snapshot = {}) {
  const subjectId = snapshotSubjectId(snapshot);
  if (subjectId === 'grammar') {
    return `Grammar: ${snapshot.trackedConcepts ?? 0}/${snapshot.totalConcepts ?? 0} concepts`;
  }
  return `Spelling: ${snapshot.trackedWords ?? 0}/${snapshot.totalPublishedWords ?? 0} words`;
}

function HeadlineFigure({ label, value, tone }) {
  return (
    <div className={`parent-hub-figure${tone ? ` is-${tone}` : ''}`}>
      <dt className="parent-hub-figure-label">{label}</dt>
      <dd className="parent-hub-figure-value">{value}</dd>
    </div>
  );
}

function StatGrid({ overview, grammarReviewConcepts, grammarDueConcepts, grammarWeakConcepts }) {
  const cells = [
    { label: 'Secure words', value: overview.secureWords ?? 0, sub: 'Spelling snapshot' },
    { label: 'Due words', value: overview.dueWords ?? 0, sub: 'Spelling return', tone: 'warn' },
    { label: 'Trouble words', value: overview.troubleWords ?? 0, sub: 'Recent spelling mistakes', tone: 'bad' },
    { label: 'Spelling accuracy', value: overview.accuracyPercent == null ? '—' : `${overview.accuracyPercent}%`, sub: 'Durable word progress' },
    { label: 'Grammar secured', value: overview.secureGrammarConcepts ?? 0, sub: 'Concepts secure' },
    { label: 'Grammar review', value: grammarReviewConcepts, sub: `${grammarDueConcepts} due · ${grammarWeakConcepts} weak`, tone: 'warn' },
    { label: 'Grammar accuracy', value: overview.grammarAccuracyPercent == null ? '—' : `${overview.grammarAccuracyPercent}%`, sub: 'Concept evidence' },
  ];
  return (
    <div className="parent-hub-statgrid">
      {cells.map((cell) => (
        <div className={`parent-hub-stat${cell.tone ? ` is-${cell.tone}` : ''}`} key={cell.label}>
          <span className="parent-hub-stat-label">{cell.label}</span>
          <span className="parent-hub-stat-value">{cell.value}</span>
          {cell.sub ? <span className="parent-hub-stat-sub">{cell.sub}</span> : null}
        </div>
      ))}
    </div>
  );
}

function CurrentFocus({ items }) {
  return (
    <div className={`parent-hub-focus${items.length ? '' : ' is-empty'}`}>
      <p className="eyebrow">Current focus</p>
      {items.length ? (
        <ol className="parent-hub-focus-list">
          {items.map((entry, index) => (
            <li className="parent-hub-focus-item" key={`${entry.label || 'item'}-${index}`}>
              <span className="parent-hub-focus-marker" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <div className="parent-hub-focus-body">
                <strong>{entry.label}</strong>
                {entry.detail ? <span className="parent-hub-focus-detail">{entry.detail}</span> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : <p className="parent-hub-empty small muted">No due work is surfaced yet.</p>}
    </div>
  );
}

function RecentSessionList({ sessions }) {
  if (!sessions.length) {
    return <p className="parent-hub-empty small muted">No completed or active sessions are stored yet.</p>;
  }
  return (
    <ol className="parent-hub-session-list">
      {sessions.map((entry) => {
        const mistakes = entry.mistakeCount || 0;
        const tone = mistakes ? 'warn' : 'good';
        return (
          <li className="parent-hub-session-item" key={entry.id || entry.updatedAt}>
            <details>
              <summary>
                <span className="parent-hub-session-label">{entry.label}</span>
                <span className="parent-hub-session-time">{formatTimestamp(entry.updatedAt)}</span>
              </summary>
              <div className="parent-hub-session-meta">
                <span className="chip">{entry.status}</span>
                <span className="chip">{entry.sessionKind}</span>
                <span className={`chip ${tone}`}>{`${mistakes} mistake${mistakes === 1 ? '' : 's'}`}</span>
              </div>
              {entry.headline ? <p className="parent-hub-session-summary">{entry.headline}</p> : null}
            </details>
          </li>
        );
      })}
    </ol>
  );
}

function MisconceptionList({ patterns }) {
  if (!patterns.length) {
    return <p className="parent-hub-empty small muted">No durable mistake patterns have been recorded yet.</p>;
  }
  return (
    <ul className="parent-hub-pattern-list">
      {patterns.map((entry, index) => (
        <li className="parent-hub-pattern-item" key={`${entry.label}-${index}`}>
          <div className="parent-hub-pattern-main">
            <strong>{entry.label}</strong>
            <span className="parent-hub-row-detail">{entry.source || 'pattern'}</span>
          </div>
          <span className="parent-hub-pattern-count">{entry.count || 0}</span>
          <span className="parent-hub-row-meta">{formatTimestamp(entry.lastSeenAt)}</span>
        </li>
      ))}
    </ul>
  );
}

function HubLedgerCard({ title, items, emptyText, tone }) {
  return (
    <article className="card parent-hub-card parent-hub-card--ledger">
      <div className="parent-hub-card-head">
        <p className="eyebrow">{title}</p>
      </div>
      {items.length ? (
        <ul className="parent-hub-ledger-list">
          {items.map((item, index) => (
            <li className="parent-hub-ledger-row" key={`${item.label || 'item'}-${index}`}>
              <div className="parent-hub-ledger-main">
                <strong>{item.label || 'Untitled'}</strong>
                {item.detail ? <span className="parent-hub-row-detail">{item.detail}</span> : null}
              </div>
              <span className={`parent-hub-ledger-figure${tone ? ` is-${tone}` : ''}`}>
                {String(item.secureCount ?? item.count ?? '—')}
              </span>
              <span className="parent-hub-row-meta">
                {item.troubleCount != null ? `${item.troubleCount} trouble` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="parent-hub-empty small muted">{emptyText}</p>}
    </article>
  );
}

function SectionHead({ title, note }) {
  return (
    <div className="home-section-head parent-hub-section-head">
      <div>
        <h2 className="section-title">{title}</h2>
        {note ? <p className="codex-section-note">{note}</p> : null}
      </div>
    </div>
  );
}

export function ParentHubSurface({ appState, model, hubState = {}, accessContext = {}, actions }) {
  const loadingRemote = accessContext?.shellAccess?.source === 'worker-session' && hubState.status === 'loading' && !model;
  if (loadingRemote) {
    return (
      <section className="card parent-hub-loading">
        <div className="feedback warn">
          <strong>Loading Parent Hub</strong>
          <div style={{ marginTop: 8 }}>Loading live learner access and summary from the Worker hub route.</div>
        </div>
      </section>
    );
  }

  if (!model && hubState.status === 'error') {
    return (
      <AccessDeniedCard
        title="Parent Hub could not be loaded right now"
        detail={hubState.error || 'The live Worker parent hub payload could not be loaded.'}
        onBack={actions.navigateHome}
      />
    );
  }

  if (!model?.permissions?.canViewParentHub) {
    return (
      <AccessDeniedCard
        title="Parent Hub is not available for the current surface role"
        detail="Parent Hub requires a parent or admin platform role plus readable learner membership. Operations has a separate permission bucket."
        onBack={actions.navigateHome}
      />
    );
  }

  const overview = model.learnerOverview || {};
  const dueWork = Array.isArray(model.dueWork) ? model.dueWork : [];
  const recentSessions = Array.isArray(model.recentSessions) ? model.recentSessions : [];
  const recentSessionsError = hubState.recentSessionsStatus === 'error'
    ? (hubState.recentSessionsError || 'Recent sessions could not be loaded.')
    : '';
  const strengths = Array.isArray(model.strengths) ? model.strengths : [];
  const weaknesses = Array.isArray(model.weaknesses) ? model.weaknesses : [];
  const patterns = Array.isArray(model.misconceptionPatterns) ? model.misconceptionPatterns : [];
  const progressSnapshots = Array.isArray(model.progressSnapshots) ? model.progressSnapshots : [];
  const grammarDueConcepts = Number(overview.dueGrammarConcepts) || 0;
  const grammarWeakConcepts = Number(overview.weakGrammarConcepts) || 0;
  const grammarReviewConcepts = grammarDueConcepts + grammarWeakConcepts;
  const accessibleLearners = Array.isArray(model.accessibleLearners) ? model.accessibleLearners : [];
  const selectedLearnerId = model.selectedLearnerId || model.learner?.id || '';
  const notice = hubState.notice || accessContext.adultSurfaceNotice || '';
  const writableLearner = selectedWritableLearner(appState);

  const learnerName = model.learner?.name || 'Learner';
  const firstName = (learnerName.split(' ')[0] || learnerName).trim() || learnerName;
  const accuracyValue = overview.accuracyPercent == null ? '—' : `${overview.accuracyPercent}%`;

  return (
    <>
      <section className="parent-hub-hero">
        <span className="parent-hub-hero-art" aria-hidden="true" />
        <div className="parent-hub-hero-copy">
          <p className="eyebrow">Parent Hub thin slice</p>
          <h1 className="parent-hub-title">{learnerName}</h1>
          <p className="parent-hub-lede">
            Signed-in parent surfaces now use the live Worker hub payload instead of locally assembled synthetic memberships.
          </p>
          <div className="chip-row parent-hub-chips">
            <span className="chip good">{model.permissions.platformRoleLabel}</span>
            <span className="chip">{model.permissions.membershipRoleLabel}</span>
            <span className={`chip ${model.permissions.canMutateLearnerData ? 'good' : 'warn'}`}>
              {model.permissions.accessModeLabel || 'Learner access'}
            </span>
            <span className="chip">{`Last activity · ${formatTimestamp(model.learner.lastActivityAt)}`}</span>
          </div>
        </div>

        <aside className="parent-hub-hero-aside">
          <div className="parent-hub-learner-select">
            <AdultLearnerSelect
              learners={accessibleLearners}
              selectedLearnerId={selectedLearnerId}
              label="Adult surface learner"
              disabled={hubState.status === 'loading'}
              onSelect={(value) => actions.dispatch('adult-surface-learner-select', { value })}
            />
          </div>
          <dl className="parent-hub-figures">
            <HeadlineFigure label="Secure words" value={overview.secureWords ?? 0} tone="good" />
            <HeadlineFigure label="Due" value={overview.dueWords ?? 0} tone="warn" />
            <HeadlineFigure label="Trouble" value={overview.troubleWords ?? 0} tone="bad" />
            <HeadlineFigure label="Accuracy" value={accuracyValue} />
          </dl>
        </aside>
      </section>

      {notice ? <div className="feedback warn parent-hub-notice">{notice}</div> : null}
      <ReadOnlyLearnerNotice access={accessContext.activeAdultLearnerContext} writableLearner={writableLearner} />

      <SectionHead
        title="Learner overview"
        note={`Spelling and grammar at a glance for ${firstName}, with the focus parent surfaces are surfacing right now.`}
      />
      <section className="two-col parent-hub-grid">
        <article className="card parent-hub-card parent-hub-card--overview">
          <div className="parent-hub-card-head">
            <p className="eyebrow">Current picture</p>
            <h3 className="parent-hub-card-title">{`Where ${firstName} stands`}</h3>
          </div>
          <StatGrid
            overview={overview}
            grammarReviewConcepts={grammarReviewConcepts}
            grammarDueConcepts={grammarDueConcepts}
            grammarWeakConcepts={grammarWeakConcepts}
          />
          <CurrentFocus items={dueWork} />
        </article>

        <article className="card soft parent-hub-card parent-hub-card--snapshot">
          <div className="parent-hub-card-head">
            <p className="eyebrow">Progress snapshot / export</p>
            <h3 className="parent-hub-card-title">Portable recovery points</h3>
            <p className="parent-hub-card-lede">
              Parent Hub only surfaces export entry points. It does not invent a separate reporting store.
            </p>
          </div>
          <div className="chip-row parent-hub-snapshot-chips">
            {progressSnapshots.length ? progressSnapshots.map((snapshot, index) => (
              <span className="chip" key={`${snapshotSubjectId(snapshot)}-${index}`}>{snapshotChipLabel(snapshot)}</span>
            )) : <span className="chip">No subject snapshot</span>}
          </div>
          <div className="actions parent-hub-snapshot-actions">
            {(model.exportEntryPoints || []).map((entry) => (
              <button
                className="btn secondary"
                type="button"
                disabled={isBlocked(entry.action, accessContext)}
                aria-disabled={isBlocked(entry.action, accessContext)}
                onClick={() => actions.dispatch(entry.action)}
                key={entry.action}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </article>
      </section>

      <SectionHead
        title="Evidence stream"
        note="Recent sessions and the misconceptions they keep uncovering."
      />
      <section className="two-col parent-hub-grid">
        <article className="card parent-hub-card">
          <div className="parent-hub-card-head">
            <p className="eyebrow">Recent sessions</p>
            <h3 className="parent-hub-card-title">Latest durable session records</h3>
          </div>
          {recentSessionsError ? <div className="feedback warn">{recentSessionsError}</div> : null}
          <RecentSessionList sessions={recentSessions} />
        </article>
        <article className="card parent-hub-card">
          <div className="parent-hub-card-head">
            <p className="eyebrow">Misconception patterns</p>
            <h3 className="parent-hub-card-title">Where correction is clustering</h3>
          </div>
          <MisconceptionList patterns={patterns} />
        </article>
      </section>

      <SectionHead
        title="Durable signal"
        note="Broad strengths and broad weaknesses, drawn from durable learner progress."
      />
      <section className="two-col parent-hub-grid">
        <HubLedgerCard
          title="Broad strengths"
          items={strengths}
          emptyText="No broad strengths have emerged yet."
          tone="good"
        />
        <HubLedgerCard
          title="Broad weaknesses"
          items={weaknesses}
          emptyText="No broad weaknesses have surfaced yet."
          tone="warn"
        />
      </section>
    </>
  );
}
