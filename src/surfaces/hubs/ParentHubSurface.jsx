import React from 'react';
import { AdultLearnerSelect } from './AdultLearnerSelect.jsx';
import { ReadOnlyLearnerNotice } from './ReadOnlyLearnerNotice.jsx';
import { AccessDeniedCard, formatTimestamp, isBlocked, selectedWritableLearner } from './hub-utils.js';
import { useSubmitLock } from '../../platform/react/use-submit-lock.js';
import { AdultConfidenceChip } from '../../subjects/grammar/components/AdultConfidenceChip.jsx';
// SH2-U5: the `RecentSessionList` + `CurrentFocus` empty branches re-skin
// through the shared primitive so the three-part copy pattern (what
// happened / is progress safe / what action is available) is consistent
// with MonsterMeadow, Codex, WordBank, Grammar dashboard.
import { EmptyState } from '../../platform/ui/EmptyState.jsx';

function snapshotSubjectId(snapshot = {}) {
  if (snapshot.subjectId) return snapshot.subjectId;
  if (snapshot.totalRewardUnits != null || snapshot.trackedRewardUnits != null) return 'punctuation';
  return snapshot.totalConcepts != null || snapshot.trackedConcepts != null ? 'grammar' : 'spelling';
}

function snapshotChipLabel(snapshot = {}) {
  const subjectId = snapshotSubjectId(snapshot);
  if (subjectId === 'grammar') {
    return `Grammar: ${snapshot.trackedConcepts ?? 0}/${snapshot.totalConcepts ?? 0} concepts`;
  }
  if (subjectId === 'punctuation') {
    return `Punctuation: ${snapshot.securedRewardUnits ?? 0}/${snapshot.totalRewardUnits ?? 0} units`;
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

function StatGrid({
  overview,
  grammarReviewConcepts,
  grammarDueConcepts,
  grammarWeakConcepts,
  punctuationReviewItems,
  punctuationDueItems,
  punctuationWeakItems,
}) {
  const cells = [
    { label: 'Secure words', value: overview.secureWords ?? 0, sub: 'Spelling snapshot' },
    { label: 'Due words', value: overview.dueWords ?? 0, sub: 'Spelling return', tone: 'warn' },
    { label: 'Trouble words', value: overview.troubleWords ?? 0, sub: 'Recent spelling mistakes', tone: 'bad' },
    { label: 'Spelling accuracy', value: overview.accuracyPercent == null ? '—' : `${overview.accuracyPercent}%`, sub: 'Durable word progress' },
    { label: 'Grammar secured', value: overview.secureGrammarConcepts ?? 0, sub: 'Concepts secure' },
    { label: 'Grammar review', value: grammarReviewConcepts, sub: `${grammarDueConcepts} due · ${grammarWeakConcepts} weak`, tone: 'warn' },
    { label: 'Grammar accuracy', value: overview.grammarAccuracyPercent == null ? '—' : `${overview.grammarAccuracyPercent}%`, sub: 'Concept evidence' },
    { label: 'Punctuation secured', value: overview.securePunctuationUnits ?? 0, sub: 'Reward units secure' },
    { label: 'Punctuation review', value: punctuationReviewItems, sub: `${punctuationDueItems} due · ${punctuationWeakItems} weak`, tone: 'warn' },
    { label: 'Punctuation accuracy', value: overview.punctuationAccuracyPercent == null ? '—' : `${overview.punctuationAccuracyPercent}%`, sub: 'Skill evidence' },
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
      ) : (
        <EmptyState
          title="No due work yet"
          body="No due work is surfaced yet. Progress is recorded safely. Check back after a few rounds complete."
        />
      )}
    </div>
  );
}

function RecentSessionList({ sessions }) {
  if (!sessions.length) {
    return (
      <EmptyState
        title="No sessions yet"
        body="No completed or active sessions are stored yet. Progress stays safe. You'll see activity here as learners practise."
      />
    );
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

function uniqueEvidenceRows(rows) {
  const seen = new Set();
  const output = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = row?.id || row?.itemId || row?.templateId || row?.label;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(row);
  }
  return output;
}

function conceptStatusLabel(status) {
  if (status === 'weak') return 'weak';
  if (status === 'due') return 'due';
  if (status === 'secured') return 'secured';
  if (status === 'learning') return 'learning';
  return 'new';
}

function GrammarConceptEvidence({ evidence }) {
  const priorityRows = uniqueEvidenceRows([
    ...(Array.isArray(evidence?.weakConcepts) ? evidence.weakConcepts : []),
    ...(Array.isArray(evidence?.dueConcepts) ? evidence.dueConcepts : []),
  ]);
  const fallbackRows = uniqueEvidenceRows((Array.isArray(evidence?.conceptStatus) ? evidence.conceptStatus : [])
    .filter((entry) => Number(entry.attempts) > 0));
  const rows = (priorityRows.length ? priorityRows : fallbackRows).slice(0, 6);
  return (
    <article className="card parent-hub-card">
      <div className="parent-hub-card-head">
        <p className="eyebrow">Concept status</p>
        <h3 className="parent-hub-card-title">Grammar concepts needing attention</h3>
      </div>
      {rows.length ? (
        <ul className="parent-hub-ledger-list">
          {rows.map((entry) => (
            <li className="parent-hub-ledger-row" key={entry.id || entry.name}>
              <div className="parent-hub-ledger-main">
                <strong>{entry.name || entry.id}</strong>
                <span className="parent-hub-row-detail">{entry.domain || 'Grammar'}</span>
              </div>
              <span className="parent-hub-ledger-figure is-warn">{String(entry.attempts ?? 0)}</span>
              <span className="parent-hub-row-meta">
                {conceptStatusLabel(entry.status)}
                {entry.accuracyPercent == null ? '' : ` · ${entry.accuracyPercent}%`}
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="parent-hub-empty small muted">No Grammar concept evidence has been recorded yet.</p>}
    </article>
  );
}

function GrammarActivityEvidence({ evidence }) {
  const questionTypes = Array.isArray(evidence?.questionTypeSummary) ? evidence.questionTypeSummary.slice(0, 4) : [];
  const activity = Array.isArray(evidence?.recentActivity) ? evidence.recentActivity.slice(0, 4) : [];
  const draft = evidence?.parentSummaryDraft || null;
  return (
    <article className="card parent-hub-card">
      <div className="parent-hub-card-head">
        <p className="eyebrow">Question-type evidence</p>
        <h3 className="parent-hub-card-title">How recent Grammar answers break down</h3>
      </div>
      {questionTypes.length ? (
        <ul className="parent-hub-ledger-list">
          {questionTypes.map((entry) => (
            <li className="parent-hub-ledger-row" key={entry.id || entry.label}>
              <div className="parent-hub-ledger-main">
                <strong>{entry.label || entry.id}</strong>
                <span className="parent-hub-row-detail">{`${entry.correct ?? 0}/${entry.attempts ?? 0} correct`}</span>
              </div>
              <span className="parent-hub-ledger-figure is-warn">{String(entry.wrong ?? 0)}</span>
              <span className="parent-hub-row-meta">{conceptStatusLabel(entry.status)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="parent-hub-empty small muted">No question-type weakness has surfaced yet.</p>}

      <div className="parent-hub-focus" style={{ marginTop: 18 }}>
        <p className="eyebrow">Recent Grammar activity</p>
        {activity.length ? (
          <ol className="parent-hub-focus-list">
            {activity.map((entry, index) => (
              <li className="parent-hub-focus-item" key={entry.itemId || entry.templateId || index}>
                <span className="parent-hub-focus-marker" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <div className="parent-hub-focus-body">
                  <strong>{entry.label || 'Grammar answer'}</strong>
                  <span className="parent-hub-focus-detail">
                    {entry.correct ? 'Correct' : 'Review needed'} · {String(entry.score ?? 0)}/{String(entry.maxScore ?? 1)} · {formatTimestamp(entry.createdAt)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        ) : <p className="parent-hub-empty small muted">No recent Grammar attempts are stored yet.</p>}
      </div>

      {draft ? (
        <div className="feedback good" style={{ marginTop: 18 }}>
          <strong>{draft.title || 'Parent summary draft'}</strong>
          {draft.body ? <div style={{ marginTop: 8 }}>{draft.body}</div> : null}
          {Array.isArray(draft.nextSteps) && draft.nextSteps.length ? (
            <ul style={{ margin: '10px 0 0 18px' }}>
              {draft.nextSteps.map((step) => <li key={step}>{step}</li>)}
            </ul>
          ) : null}
        </div>
      ) : <p className="parent-hub-empty small muted" style={{ marginTop: 18 }}>No parent summary draft has been generated yet.</p>}
    </article>
  );
}

// Phase 4 U7: "Grammar concepts" — per-concept confidence chips grid. The
// client `buildGrammarLearnerReadModel` surfaces a `confidence` projection
// on every row in `conceptStatus`; that is the single source the chips read
// from. Parents see the headline label + sample context + recent-miss count;
// `intervalDays` and `distinctTemplates` are reserved for the Admin Hub
// surface (`showAdminExtras`) and are not rendered here.
function GrammarConceptConfidenceGrid({ evidence, showAdminExtras = false }) {
  const rows = Array.isArray(evidence?.conceptStatus) ? evidence.conceptStatus : [];
  return (
    <article className="card parent-hub-card parent-hub-grammar-concepts">
      <div className="parent-hub-card-head">
        <p className="eyebrow">Concept confidence</p>
        <h3 className="parent-hub-card-title">Grammar concepts</h3>
        <p className="parent-hub-card-lede small muted">
          Adult-facing confidence label plus sample size for every tracked Grammar concept. Sample size is the number of answered attempts that fed the label.
        </p>
      </div>
      {rows.length ? (
        <ul className="parent-hub-grammar-confidence-list" aria-label="Grammar concept confidence chips">
          {rows.map((row) => (
            <li
              className="parent-hub-grammar-confidence-row"
              key={row.id || row.name}
              data-concept-id={row.id || ''}
            >
              <div className="parent-hub-grammar-confidence-main">
                <strong>{row.name || row.id}</strong>
                <span className="parent-hub-row-detail">{row.domain || 'Grammar'}</span>
              </div>
              <AdultConfidenceChip
                confidence={row.confidence || null}
                showAdminExtras={showAdminExtras}
              />
            </li>
          ))}
        </ul>
      ) : <p className="parent-hub-empty small muted">No Grammar concept evidence has been recorded yet.</p>}
    </article>
  );
}

function GrammarEvidencePanel({ evidence }) {
  return (
    <>
      <SectionHead
        title="Grammar evidence"
        note="Concept status, question-type weakness, recent Grammar activity, and adult-facing summary drafts."
      />
      <section className="parent-hub-grid parent-hub-grammar-evidence">
        <GrammarConceptConfidenceGrid evidence={evidence} />
      </section>
      <section className="two-col parent-hub-grid parent-hub-grammar-evidence">
        <GrammarConceptEvidence evidence={evidence} />
        <GrammarActivityEvidence evidence={evidence} />
      </section>
    </>
  );
}

function PunctuationFacetEvidence({ evidence }) {
  const rows = uniqueEvidenceRows(Array.isArray(evidence?.weakestFacets) ? evidence.weakestFacets : []).slice(0, 6);
  return (
    <article className="card parent-hub-card">
      <div className="parent-hub-card-head">
        <p className="eyebrow">Facet evidence</p>
        <h3 className="parent-hub-card-title">Punctuation skills needing attention</h3>
      </div>
      {rows.length ? (
        <ul className="parent-hub-ledger-list">
          {rows.map((entry) => (
            <li className="parent-hub-ledger-row" key={entry.id || entry.label}>
              <div className="parent-hub-ledger-main">
                <strong>{entry.label || entry.skillName || 'Punctuation facet'}</strong>
                <span className="parent-hub-row-detail">{`${entry.correct ?? 0}/${entry.attempts ?? 0} correct`}</span>
              </div>
              <span className="parent-hub-ledger-figure is-warn">{String(entry.wrong ?? 0)}</span>
              <span className="parent-hub-row-meta">
                {entry.status || 'learning'}
                {entry.accuracy == null ? '' : ` · ${entry.accuracy}%`}
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="parent-hub-empty small muted">No Punctuation facet weakness has surfaced yet.</p>}
    </article>
  );
}

function PunctuationActivityEvidence({ evidence }) {
  const sessionModes = Array.isArray(evidence?.bySessionMode) ? evidence.bySessionMode.slice(0, 4) : [];
  const itemModes = Array.isArray(evidence?.byItemMode) ? evidence.byItemMode.slice(0, 4) : [];
  const mistakes = Array.isArray(evidence?.recentMistakes) ? evidence.recentMistakes.slice(0, 4) : [];
  const dailyGoal = evidence?.dailyGoal || null;
  const streak = evidence?.streak || null;
  return (
    <article className="card parent-hub-card">
      <div className="parent-hub-card-head">
        <p className="eyebrow">Mode evidence</p>
        <h3 className="parent-hub-card-title">How recent Punctuation practice breaks down</h3>
      </div>
      {sessionModes.length || itemModes.length ? (
        <ul className="parent-hub-ledger-list">
          {[...sessionModes, ...itemModes].map((entry) => (
            <li className="parent-hub-ledger-row" key={`${entry.id || entry.label}-${entry.subjectId || 'punctuation'}`}>
              <div className="parent-hub-ledger-main">
                <strong>{entry.label || entry.id}</strong>
                <span className="parent-hub-row-detail">{`${entry.correct ?? 0}/${entry.attempts ?? 0} correct`}</span>
              </div>
              <span className="parent-hub-ledger-figure is-warn">{String(entry.wrong ?? 0)}</span>
              <span className="parent-hub-row-meta">{entry.accuracy == null ? 'new' : `${entry.accuracy}%`}</span>
            </li>
          ))}
        </ul>
      ) : <p className="parent-hub-empty small muted">No Punctuation mode evidence has surfaced yet.</p>}

      <div className="parent-hub-focus" style={{ marginTop: 18 }}>
        <p className="eyebrow">Recent Punctuation mistakes</p>
        {mistakes.length ? (
          <ol className="parent-hub-focus-list">
            {mistakes.map((entry, index) => (
              <li className="parent-hub-focus-item" key={entry.itemId || `${entry.label}-${index}`}>
                <span className="parent-hub-focus-marker" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <div className="parent-hub-focus-body">
                  <strong>{entry.label || 'Punctuation attempt'}</strong>
                  <span className="parent-hub-focus-detail">
                    {entry.sessionModeLabel || entry.sessionMode || 'Practice'} · {formatTimestamp(entry.createdAt)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        ) : <p className="parent-hub-empty small muted">No recent Punctuation mistakes are stored yet.</p>}
      </div>

      <div className="chip-row" style={{ marginTop: 18 }}>
        {dailyGoal ? <span className="chip">{`Daily goal: ${dailyGoal.attemptsToday ?? 0}/${dailyGoal.targetAttempts ?? 0}`}</span> : null}
        {streak ? <span className="chip">{`Punctuation streak: ${streak.currentDays ?? 0} day${Number(streak.currentDays) === 1 ? '' : 's'}`}</span> : null}
      </div>
    </article>
  );
}

function PunctuationEvidencePanel({ evidence }) {
  return (
    <>
      <SectionHead
        title="Punctuation evidence"
        note="Skill facets, session modes, item modes, recent mistakes, daily goal, and streak drawn from safe analytics metadata."
      />
      <section className="two-col parent-hub-grid parent-hub-punctuation-evidence">
        <PunctuationFacetEvidence evidence={evidence} />
        <PunctuationActivityEvidence evidence={evidence} />
      </section>
    </>
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
  // SH2-U1: JSX-layer guard for the export action buttons. Parent Hub
  // today has no destructive save buttons (the hub is read-only vs the
  // server); the export buttons are the only user-initiated dispatches
  // on this surface. The hook is belt-and-braces — the export action
  // handler already rate-limits on the adapter side via the adapter's
  // pendingKeys set, but a fast double-click on touch devices can still
  // emit two dispatches before the pendingKeys round-trip lands. The
  // hook closes that window.
  const submitLock = useSubmitLock();
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
  // U9 capacity: Parent Hub's recent-sessions widget and activity feed
  // degrade gracefully when the aggregate parentHub breaker is open.
  // Only the minimal boolean is exposed to components per plan line 878 —
  // never the full breaker state with endpoint names.
  const parentHubDegraded = appState?.persistence?.breakersDegraded?.parentHub === true;
  const strengths = Array.isArray(model.strengths) ? model.strengths : [];
  const weaknesses = Array.isArray(model.weaknesses) ? model.weaknesses : [];
  const patterns = Array.isArray(model.misconceptionPatterns) ? model.misconceptionPatterns : [];
  const progressSnapshots = Array.isArray(model.progressSnapshots) ? model.progressSnapshots : [];
  const grammarEvidence = model.grammarEvidence || {};
  const punctuationEvidence = model.punctuationEvidence || {};
  const grammarDueConcepts = Number(overview.dueGrammarConcepts) || 0;
  const grammarWeakConcepts = Number(overview.weakGrammarConcepts) || 0;
  const grammarReviewConcepts = grammarDueConcepts + grammarWeakConcepts;
  const punctuationDueItems = Number(overview.duePunctuationItems) || 0;
  const punctuationWeakItems = Number(overview.weakPunctuationItems) || 0;
  const punctuationReviewItems = punctuationDueItems + punctuationWeakItems;
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
        note={`Spelling, grammar, and punctuation at a glance for ${firstName}, with the focus parent surfaces are surfacing right now.`}
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
            punctuationReviewItems={punctuationReviewItems}
            punctuationDueItems={punctuationDueItems}
            punctuationWeakItems={punctuationWeakItems}
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
                disabled={isBlocked(entry.action, accessContext) || submitLock.locked}
                aria-disabled={isBlocked(entry.action, accessContext) || submitLock.locked}
                onClick={() => submitLock.run(async () => actions.dispatch(entry.action))}
                key={entry.action}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </article>
      </section>

      <GrammarEvidencePanel evidence={grammarEvidence} />
      <PunctuationEvidencePanel evidence={punctuationEvidence} />

      <SectionHead
        title="Evidence stream"
        note="Recent sessions and the misconceptions they keep uncovering."
      />
      <section className="two-col parent-hub-grid">
        <article className="card parent-hub-card" data-parent-hub-panel="recent-sessions">
          <div className="parent-hub-card-head">
            <p className="eyebrow">Recent sessions</p>
            <h3 className="parent-hub-card-title">Latest durable session records</h3>
          </div>
          {parentHubDegraded ? (
            <div className="feedback warn" data-parent-hub-degraded="recent-sessions">
              <strong>Recent history temporarily unavailable</strong>
              <div style={{ marginTop: 8 }}>
                The recent-sessions summary is taking too long to load right now. Practice is unaffected — this widget will reappear automatically once the feed recovers.
              </div>
            </div>
          ) : (
            <>
              {recentSessionsError ? <div className="feedback warn">{recentSessionsError}</div> : null}
              <RecentSessionList sessions={recentSessions} />
            </>
          )}
        </article>
        <article className="card parent-hub-card" data-parent-hub-panel="activity-feed">
          <div className="parent-hub-card-head">
            <p className="eyebrow">Misconception patterns</p>
            <h3 className="parent-hub-card-title">Where correction is clustering</h3>
          </div>
          {parentHubDegraded ? (
            <div className="feedback warn" data-parent-hub-degraded="activity-feed">
              <strong>Activity feed temporarily unavailable</strong>
              <div style={{ marginTop: 8 }}>
                Misconception patterns will reappear automatically once the feed recovers. Student practice is unaffected.
              </div>
            </div>
          ) : (
            <MisconceptionList patterns={patterns} />
          )}
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
