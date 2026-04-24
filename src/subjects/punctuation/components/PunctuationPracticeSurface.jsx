import React, { useMemo, useState } from 'react';
import {
  bellstormSceneForPhase,
  currentItemInstruction,
  punctuationPhaseLabel,
} from './punctuation-view-model.js';

function learnerName(appState, learnerId) {
  return appState?.learners?.byId?.[learnerId]?.name || 'Learner';
}

function SetupView({ learner, stats, ui, actions }) {
  const scene = bellstormSceneForPhase('setup');
  const content = ui.content || {};
  return (
    <section className="card border-top punctuation-surface" style={{ borderTopColor: '#B8873F' }}>
      <div className="punctuation-hero">
        <img src={scene.src} srcSet={scene.srcSet} sizes="(max-width: 980px) 100vw, 960px" alt="" aria-hidden="true" />
        <div>
          <div className="eyebrow">Bellstorm Coast</div>
          <h2 className="section-title">Punctuation practice</h2>
          <p className="subtitle">{content.publishedScopeCopy || 'This published Punctuation release covers Endmarks, Apostrophe and Speech.'}</p>
        </div>
      </div>
      <div className="stat-grid" style={{ marginTop: 16 }}>
        <div className="stat"><div className="stat-label">Accuracy</div><div className="stat-value">{stats.accuracy || 0}%</div><div className="stat-sub">{learner}</div></div>
        <div className="stat"><div className="stat-label">Secure units</div><div className="stat-value">{stats.securedRewardUnits || 0}</div><div className="stat-sub">{stats.publishedRewardUnits || 4} published</div></div>
        <div className="stat"><div className="stat-label">Due</div><div className="stat-value">{stats.due || 0}</div><div className="stat-sub">Review items</div></div>
      </div>
      <div className="actions" style={{ marginTop: 16 }}>
        <button className="btn primary" type="button" data-punctuation-start onClick={() => actions.dispatch('punctuation-start')}>Start practice</button>
        <button className="btn secondary" type="button" onClick={() => actions.dispatch('punctuation-start', { mode: 'speech' })}>Speech focus</button>
      </div>
    </section>
  );
}

function ChoiceItem({ item, disabled, onSubmit }) {
  const [choiceIndex, setChoiceIndex] = useState('');
  return (
    <form
      style={{ display: 'grid', gap: 12 }}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ choiceIndex });
      }}
    >
      <div className="choice-list" role="radiogroup" aria-label="Punctuation choices">
        {(item.options || []).map((option) => (
          <label className="choice-card" key={`${item.id}-${option.index}`}>
            <input
              type="radio"
              name="choiceIndex"
              value={option.index}
              checked={String(choiceIndex) === String(option.index)}
              onChange={() => setChoiceIndex(String(option.index))}
            />
            <span>{option.text}</span>
          </label>
        ))}
      </div>
      <div className="actions">
        <button className="btn primary" type="submit" disabled={disabled || choiceIndex === ''} data-punctuation-submit>Submit answer</button>
      </div>
    </form>
  );
}

function TextItem({ item, disabled, onSubmit }) {
  const [typed, setTyped] = useState(item.stem || '');
  return (
    <form
      style={{ display: 'grid', gap: 12 }}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ typed });
      }}
    >
      <label className="field">
        <span>Your answer</span>
        <textarea
          className="input"
          name="typed"
          value={typed}
          rows={4}
          data-autofocus="true"
          onChange={(event) => setTyped(event.target.value)}
        />
      </label>
      <div className="actions">
        <button className="btn primary" type="submit" disabled={disabled} data-punctuation-submit>Submit answer</button>
        <button className="btn secondary" type="button" disabled={disabled} onClick={() => setTyped(item.stem || '')}>Reset text</button>
      </div>
    </form>
  );
}

function ActiveItemView({ ui, actions }) {
  const item = ui.session?.currentItem || {};
  const scene = bellstormSceneForPhase('active-item');
  const progress = ui.session?.length ? Math.round(((ui.session.answeredCount || 0) / ui.session.length) * 100) : 0;
  const submit = (payload) => actions.dispatch('punctuation-submit-form', payload);

  return (
    <section className="card border-top punctuation-surface" style={{ borderTopColor: '#B8873F' }}>
      <div className="punctuation-strip">
        <img src={scene.src} srcSet={scene.srcSet} sizes="(max-width: 980px) 100vw, 960px" alt="" aria-hidden="true" />
        <div>
          <div className="eyebrow">{punctuationPhaseLabel(ui.phase)}</div>
          <h2 className="section-title">{item.prompt || 'Punctuation practice'}</h2>
          <p className="subtitle">{currentItemInstruction(item)}</p>
        </div>
      </div>
      {item.stem ? <div className="callout" style={{ marginTop: 14 }}>{item.stem}</div> : null}
      <div className="progress" style={{ marginTop: 14 }}><span style={{ width: `${progress}%` }} /></div>
      <div style={{ marginTop: 16 }}>
        {item.inputKind === 'choice'
          ? <ChoiceItem item={item} disabled={false} onSubmit={submit} />
          : <TextItem item={item} disabled={false} onSubmit={submit} />}
      </div>
      <div className="actions" style={{ marginTop: 16 }}>
        <button className="btn ghost" type="button" onClick={() => actions.dispatch('punctuation-skip')}>Skip</button>
        <button className="btn ghost" type="button" onClick={() => actions.dispatch('punctuation-end-early')}>End session</button>
      </div>
    </section>
  );
}

function FeedbackView({ ui, actions }) {
  const feedback = ui.feedback || {};
  const scene = bellstormSceneForPhase('feedback');
  return (
    <section className="card border-top punctuation-surface" style={{ borderTopColor: feedback.kind === 'success' ? '#2E8479' : '#B8873F' }}>
      <div className="punctuation-strip">
        <img src={scene.src} srcSet={scene.srcSet} sizes="(max-width: 980px) 100vw, 960px" alt="" aria-hidden="true" />
        <div>
          <div className="eyebrow">Feedback</div>
          <h2 className="section-title">{feedback.headline || 'Feedback'}</h2>
          <p className="subtitle">{feedback.body}</p>
        </div>
      </div>
      {feedback.displayCorrection ? (
        <div className={`feedback ${feedback.kind === 'success' ? 'good' : 'warn'}`} style={{ marginTop: 14 }}>
          <strong>Model</strong>
          <div style={{ marginTop: 8 }}>{feedback.displayCorrection}</div>
        </div>
      ) : null}
      {feedback.facets?.length ? (
        <div className="chip-row" style={{ marginTop: 14 }}>
          {feedback.facets.map((facet) => <span className={`chip ${facet.ok ? 'good' : 'warn'}`} key={facet.id}>{facet.label}</span>)}
        </div>
      ) : null}
      <div className="actions" style={{ marginTop: 16 }}>
        <button className="btn primary" type="button" data-punctuation-continue onClick={() => actions.dispatch('punctuation-continue')}>Continue</button>
        <button className="btn secondary" type="button" onClick={() => actions.dispatch('punctuation-end-early')}>Finish now</button>
      </div>
    </section>
  );
}

function SummaryView({ ui, actions }) {
  const summary = ui.summary || {};
  const scene = bellstormSceneForPhase('summary');
  return (
    <section className="card border-top punctuation-surface" style={{ borderTopColor: '#2E8479' }}>
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

  if (ui.phase === 'active-item') return <ActiveItemView ui={ui} actions={actions} />;
  if (ui.phase === 'feedback') return <FeedbackView ui={ui} actions={actions} />;
  if (ui.phase === 'summary') return <SummaryView ui={ui} actions={actions} />;

  return <SetupView learner={learner} stats={stats} ui={ui} actions={actions} />;
}
