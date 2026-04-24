import React from 'react';
import { AdultLearnerSelect } from './AdultLearnerSelect.jsx';
import { ReadOnlyLearnerNotice } from './ReadOnlyLearnerNotice.jsx';
import { AccessDeniedCard, formatTimestamp, isBlocked, selectedWritableLearner } from './hub-utils.js';

function HubStrengthList({ title, items = [], emptyText = 'No signal yet.' }) {
  return (
    <section className="card">
      <div className="eyebrow">{title}</div>
      {items.length ? items.map((item, index) => (
        <div className="skill-row" key={`${item.label || 'item'}-${index}`}>
          <div><strong>{item.label || 'Untitled'}</strong></div>
          <div className="small muted">{item.detail || ''}</div>
          <div>{String(item.secureCount ?? item.count ?? '—')}</div>
          <div className="small muted">{item.troubleCount != null ? `${item.troubleCount} trouble` : ''}</div>
        </div>
      )) : <p className="small muted">{emptyText}</p>}
    </section>
  );
}

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

export function ParentHubSurface({ appState, model, hubState = {}, accessContext = {}, actions }) {
  const loadingRemote = accessContext?.shellAccess?.source === 'worker-session' && hubState.status === 'loading' && !model;
  if (loadingRemote) {
    return (
      <section className="card">
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

  return (
    <>
      <section className="subject-header card border-top" style={{ borderTopColor: '#3E6FA8', marginBottom: 18 }}>
        <div className="subject-title-row">
          <div>
            <div className="eyebrow">Parent Hub thin slice</div>
            <h2 className="title" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)' }}>{model.learner.name}</h2>
            <p className="subtitle">Signed-in parent surfaces now use the live Worker hub payload instead of locally assembled synthetic memberships.</p>
          </div>
          <div className="actions" style={{ alignItems: 'flex-end', justifyContent: 'flex-end' }}>
            <AdultLearnerSelect
              learners={accessibleLearners}
              selectedLearnerId={selectedLearnerId}
              label="Adult surface learner"
              disabled={hubState.status === 'loading'}
              onSelect={(value) => actions.dispatch('adult-surface-learner-select', { value })}
            />
            <div className="chip-row">
              <span className="chip good">{model.permissions.platformRoleLabel}</span>
              <span className="chip">{model.permissions.membershipRoleLabel}</span>
              <span className={`chip ${model.permissions.canMutateLearnerData ? 'good' : 'warn'}`}>{model.permissions.accessModeLabel || 'Learner access'}</span>
              <span className="chip">Last activity: {formatTimestamp(model.learner.lastActivityAt)}</span>
            </div>
          </div>
        </div>
        {notice && <div className="feedback warn" style={{ marginTop: 16 }}>{notice}</div>}
        <ReadOnlyLearnerNotice access={accessContext.activeAdultLearnerContext} writableLearner={writableLearner} />
      </section>

      <section className="two-col" style={{ marginBottom: 20 }}>
        <article className="card">
          <div className="eyebrow">Learner overview</div>
          <h3 className="section-title" style={{ fontSize: '1.2rem' }}>Current picture</h3>
          <div className="stat-grid" style={{ marginTop: 16 }}>
            <div className="stat"><div className="stat-label">Secure words</div><div className="stat-value">{overview.secureWords ?? 0}</div><div className="stat-sub">Spelling snapshot</div></div>
            <div className="stat"><div className="stat-label">Due words</div><div className="stat-value">{overview.dueWords ?? 0}</div><div className="stat-sub">Spelling return</div></div>
            <div className="stat"><div className="stat-label">Trouble words</div><div className="stat-value">{overview.troubleWords ?? 0}</div><div className="stat-sub">Recent spelling mistakes</div></div>
            <div className="stat"><div className="stat-label">Spelling accuracy</div><div className="stat-value">{overview.accuracyPercent == null ? '—' : `${overview.accuracyPercent}%`}</div><div className="stat-sub">Durable word progress</div></div>
            <div className="stat"><div className="stat-label">Grammar secured</div><div className="stat-value">{overview.secureGrammarConcepts ?? 0}</div><div className="stat-sub">Concepts secure</div></div>
            <div className="stat"><div className="stat-label">Grammar review</div><div className="stat-value">{grammarReviewConcepts}</div><div className="stat-sub">{grammarDueConcepts} due · {grammarWeakConcepts} weak</div></div>
            <div className="stat"><div className="stat-label">Grammar accuracy</div><div className="stat-value">{overview.grammarAccuracyPercent == null ? '—' : `${overview.grammarAccuracyPercent}%`}</div><div className="stat-sub">Concept evidence</div></div>
          </div>
          <div className="callout" style={{ marginTop: 16 }}>
            <strong>Current focus</strong>
            {dueWork.length ? dueWork.map((entry) => (
              <div style={{ marginTop: 8 }} key={entry.label}>
                <strong>{entry.label}</strong>
                <div className="small muted">{entry.detail || ''}</div>
              </div>
            )) : <div className="small muted" style={{ marginTop: 8 }}>No due work is surfaced yet.</div>}
          </div>
        </article>
        <article className="card soft">
          <div className="eyebrow">Progress snapshot / export</div>
          <h3 className="section-title" style={{ fontSize: '1.2rem' }}>Portable recovery points</h3>
          <p className="subtitle">Parent Hub only surfaces export entry points. It does not invent a separate reporting store.</p>
          <div className="chip-row" style={{ marginTop: 14 }}>
            {progressSnapshots.length ? progressSnapshots.map((snapshot, index) => (
              <span className="chip" key={`${snapshotSubjectId(snapshot)}-${index}`}>{snapshotChipLabel(snapshot)}</span>
            )) : <span className="chip">No subject snapshot</span>}
          </div>
          <div className="actions" style={{ marginTop: 16 }}>
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

      <section className="two-col" style={{ marginBottom: 20 }}>
        <article className="card">
          <div className="eyebrow">Recent sessions</div>
          <h3 className="section-title" style={{ fontSize: '1.2rem' }}>Latest durable session records</h3>
          {recentSessions.length ? recentSessions.map((entry) => (
            <details style={{ marginTop: 12 }} key={entry.id || entry.updatedAt}>
              <summary>{entry.label} · {formatTimestamp(entry.updatedAt)}</summary>
              <div className="small muted" style={{ marginTop: 10 }}>{entry.status} · {entry.sessionKind} · mistakes: {entry.mistakeCount || 0}</div>
              {entry.headline && <div className="small muted" style={{ marginTop: 6 }}>Summary card: {entry.headline}</div>}
            </details>
          )) : <p className="small muted">No completed or active sessions are stored yet.</p>}
        </article>
        <article className="card">
          <div className="eyebrow">Misconception patterns</div>
          <h3 className="section-title" style={{ fontSize: '1.2rem' }}>Where correction is clustering</h3>
          {patterns.length ? patterns.map((entry, index) => (
            <div className="skill-row" key={`${entry.label}-${index}`}>
              <div><strong>{entry.label}</strong></div>
              <div className="small muted">{entry.source || 'pattern'}</div>
              <div>{entry.count || 0}</div>
              <div className="small muted">{formatTimestamp(entry.lastSeenAt)}</div>
            </div>
          )) : <p className="small muted">No durable mistake patterns have been recorded yet.</p>}
        </article>
      </section>

      <section className="two-col">
        <HubStrengthList title="Broad strengths" items={strengths} emptyText="No broad strengths have emerged yet." />
        <HubStrengthList title="Broad weaknesses" items={weaknesses} emptyText="No broad weaknesses have surfaced yet." />
      </section>
    </>
  );
}
