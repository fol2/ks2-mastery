import React, { useMemo, useState } from 'react';
import {
  bellstormSceneForPhase,
  composeIsDisabled,
} from './punctuation-view-model.js';
import { PunctuationMapScene } from './PunctuationMapScene.jsx';
import { PunctuationSessionScene } from './PunctuationSessionScene.jsx';

function learnerName(appState, learnerId) {
  return appState?.learners?.byId?.[learnerId]?.name || 'Learner';
}

function newlineTextStyle(value) {
  return String(value || '').includes('\n') ? { whiteSpace: 'pre-wrap' } : undefined;
}

function SetupView({ learner, stats, ui, actions }) {
  const scene = bellstormSceneForPhase('setup');
  const content = ui.content || {};
  const guidedSkills = Array.isArray(content.skills) ? content.skills : [];
  const [guidedSkillId, setGuidedSkillId] = useState(guidedSkills[0]?.id || '');
  const selectedGuidedSkillId = guidedSkillId || guidedSkills[0]?.id || '';
  const isDisabled = composeIsDisabled(ui);
  return (
    <section className="card border-top punctuation-surface" style={{ borderTopColor: '#B8873F' }}>
      <div className="punctuation-hero">
        <img src={scene.src} srcSet={scene.srcSet} sizes="(max-width: 980px) 100vw, 960px" alt="" aria-hidden="true" />
        <div>
          <div className="eyebrow">Bellstorm Coast</div>
          <h2 className="section-title">Punctuation practice</h2>
          <p className="subtitle">{content.publishedScopeCopy || 'Punctuation covers the 14-skill KS2 progression with Smart Review, Guided focus, Weak Spots, GPS tests, sentence combining, paragraph repair, and transfer practice.'}</p>
        </div>
      </div>
      <div className="stat-grid" style={{ marginTop: 16 }}>
        <div className="stat"><div className="stat-label">Accuracy</div><div className="stat-value">{stats.accuracy || 0}%</div><div className="stat-sub">{learner}</div></div>
        <div className="stat"><div className="stat-label">Secure units</div><div className="stat-value">{stats.securedRewardUnits || 0}</div><div className="stat-sub">{stats.publishedRewardUnits || 14} published</div></div>
        <div className="stat"><div className="stat-label">Due</div><div className="stat-value">{stats.due || 0}</div><div className="stat-sub">Review items</div></div>
      </div>
      <div className="actions" style={{ marginTop: 16 }}>
        <button className="btn primary" type="button" disabled={isDisabled} data-punctuation-start onClick={() => actions.dispatch('punctuation-start')}>Start practice</button>
        {guidedSkills.length ? (
          <label className="field" style={{ minWidth: 220 }}>
            <span>Guided skill</span>
            <select
              className="input"
              value={selectedGuidedSkillId}
              disabled={isDisabled}
              onChange={(event) => setGuidedSkillId(event.target.value)}
            >
              {guidedSkills.map((skill) => (
                <option key={skill.id} value={skill.id}>{skill.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          className="btn secondary"
          type="button"
          disabled={isDisabled}
          data-punctuation-guided-start
          onClick={() => actions.dispatch('punctuation-start', { mode: 'guided', skillId: selectedGuidedSkillId || undefined })}
        >
          Guided learn
        </button>
        <button
          className="btn secondary"
          type="button"
          disabled={isDisabled}
          data-punctuation-weak-start
          onClick={() => actions.dispatch('punctuation-start', { mode: 'weak' })}
        >
          Weak spots
        </button>
        <button
          className="btn secondary"
          type="button"
          disabled={isDisabled}
          data-punctuation-gps-start
          onClick={() => actions.dispatch('punctuation-start', { mode: 'gps', roundLength: '8' })}
        >
          GPS test
        </button>
        <button className="btn secondary" type="button" disabled={isDisabled} data-punctuation-endmarks-start onClick={() => actions.dispatch('punctuation-start', { mode: 'endmarks' })}>Endmarks focus</button>
        <button className="btn secondary" type="button" disabled={isDisabled} data-punctuation-apostrophe-start onClick={() => actions.dispatch('punctuation-start', { mode: 'apostrophe' })}>Apostrophe focus</button>
        <button className="btn secondary" type="button" disabled={isDisabled} onClick={() => actions.dispatch('punctuation-start', { mode: 'speech' })}>Speech focus</button>
        <button className="btn secondary" type="button" disabled={isDisabled} onClick={() => actions.dispatch('punctuation-start', { mode: 'comma_flow' })}>Comma focus</button>
        <button className="btn secondary" type="button" disabled={isDisabled} onClick={() => actions.dispatch('punctuation-start', { mode: 'boundary' })}>Boundary focus</button>
        <button className="btn secondary" type="button" disabled={isDisabled} onClick={() => actions.dispatch('punctuation-start', { mode: 'structure' })}>Structure focus</button>
      </div>
    </section>
  );
}

function SummaryView({ ui, actions }) {
  const summary = ui.summary || {};
  const scene = bellstormSceneForPhase('summary');
  const gpsReview = Array.isArray(summary.gps?.reviewItems) ? summary.gps.reviewItems : [];
  return (
    <section className="card border-top punctuation-surface" data-punctuation-summary style={{ borderTopColor: '#2E8479' }}>
      <div className="punctuation-strip">
        <img src={scene.src} srcSet={scene.srcSet} sizes="(max-width: 980px) 100vw, 960px" alt="" aria-hidden="true" />
        <div>
          <div className="eyebrow">Summary</div>
          <h2 className="section-title">Punctuation session summary</h2>
          <p className="subtitle">{summary.message || 'Session complete.'}</p>
        </div>
      </div>
      <div className="stat-grid" style={{ marginTop: 16 }}>
        <div className="stat"><div className="stat-label">Answered</div><div className="stat-value">{summary.total || 0}</div><div className="stat-sub">This session</div></div>
        <div className="stat"><div className="stat-label">Correct</div><div className="stat-value">{summary.correct || 0}</div><div className="stat-sub">Clean attempts</div></div>
        <div className="stat"><div className="stat-label">Accuracy</div><div className="stat-value">{summary.accuracy || 0}%</div><div className="stat-sub">Session score</div></div>
      </div>
      {gpsReview.length ? (
        <div className="callout punctuation-gps-review" style={{ marginTop: 16 }}>
          <strong>GPS review</strong>
          <div className="small muted" style={{ marginTop: 6 }}>
            Next: {summary.gps?.recommendedLabel || 'Smart review'}
          </div>
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            {gpsReview.map((entry) => (
              <div key={`${entry.index}-${entry.itemId}`} className={`feedback ${entry.correct ? 'good' : 'warn'}`}>
                <strong>{entry.index}. {entry.correct ? 'Correct' : 'Review'}</strong>
                <div style={{ marginTop: 6 }}>{entry.prompt}</div>
                {entry.attemptedAnswer ? <div className="small" style={{ marginTop: 6 }}>Answer: {entry.attemptedAnswer}</div> : null}
                {entry.displayCorrection ? (
                  <div className="small" style={{ marginTop: 6, ...newlineTextStyle(entry.displayCorrection) }}>
                    Model: {entry.displayCorrection}
                  </div>
                ) : null}
                {entry.misconceptionTags?.length ? (
                  <div className="chip-row" style={{ marginTop: 8 }}>
                    {entry.misconceptionTags.map((tag) => <span className="chip warn" key={`${entry.itemId}-${tag}`}>{tag}</span>)}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="actions" style={{ marginTop: 16 }}>
        <button className="btn primary" type="button" onClick={() => actions.dispatch('punctuation-start-again')}>Start again</button>
        <button className="btn secondary" type="button" onClick={() => actions.dispatch('punctuation-back')}>Back to dashboard</button>
      </div>
    </section>
  );
}

export function PunctuationPracticeSurface({ appState, service, actions }) {
  const learnerId = appState.learners.selectedId;
  const ui = service?.initState?.(appState.subjectUi?.punctuation, learnerId) || appState.subjectUi?.punctuation || {};
  const stats = useMemo(() => service?.getStats?.(learnerId) || ui.stats || {}, [learnerId, service, ui.stats]);
  const learner = learnerName(appState, learnerId);

  // Phase 3 U3: `active-item` + `feedback` route through the consolidated
  // `PunctuationSessionScene`. Summary stays inline until U4; Map routes
  // to the U5 scene; Setup remains the default SetupView (U2 owns redesign).
  if (ui.phase === 'active-item' || ui.phase === 'feedback') {
    return <PunctuationSessionScene ui={ui} actions={actions} />;
  }
  if (ui.phase === 'summary') return <SummaryView ui={ui} actions={actions} />;
  if (ui.phase === 'map') return <PunctuationMapScene ui={ui} actions={actions} />;

  return <SetupView learner={learner} stats={stats} ui={ui} actions={actions} />;
}
