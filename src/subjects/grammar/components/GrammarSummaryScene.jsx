import React from 'react';
import { GrammarAnalyticsScene } from './GrammarAnalyticsScene.jsx';

function SummaryStat({ label, value, detail }) {
  return (
    <div className="grammar-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

export function GrammarSummaryScene({ grammar, rewardState, actions, learner, runtimeReadOnly }) {
  const summary = grammar.summary || {};
  const answered = Number(summary.answered) || 0;
  const correct = Number(summary.correct) || 0;
  const accuracy = answered ? Math.round((correct / answered) * 100) : 0;
  const score = `${Number(summary.totalScore) || 0}/${Number(summary.totalMarks) || Math.max(1, answered)}`;

  return (
    <div className="grammar-summary-shell">
      <section className="card grammar-summary-card" aria-labelledby="grammar-summary-title">
        <div className="eyebrow">Grammar session summary</div>
        <h2 className="section-title" id="grammar-summary-title">
          {learner?.name || 'This learner'} completed a Grammar round
        </h2>
        <div className="grammar-summary-stats">
          <SummaryStat label="Answered" value={answered} detail={summary.mode || 'practice'} />
          <SummaryStat label="Correct" value={correct} detail={`${accuracy}% accuracy`} />
          <SummaryStat label="Score" value={score} detail="marks" />
        </div>
        <div className="actions">
          <button
            className="btn primary"
            type="button"
            disabled={runtimeReadOnly || Boolean(grammar.pendingCommand)}
            onClick={() => actions.dispatch('grammar-start-again')}
          >
            Start another round
          </button>
          <button className="btn secondary" type="button" onClick={() => actions.dispatch('grammar-back')}>
            Back to Grammar setup
          </button>
        </div>
      </section>
      <GrammarAnalyticsScene
        grammar={grammar}
        rewardState={rewardState}
        actions={actions}
        learner={learner}
        runtimeReadOnly={runtimeReadOnly}
      />
    </div>
  );
}
