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

function responseText(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return 'No response saved.';
  const values = Object.entries(response)
    .flatMap(([key, value]) => {
      if (Array.isArray(value)) return value.map((entry) => String(entry || '').trim()).filter(Boolean);
      const text = String(value ?? '').trim();
      return text ? [`${key === 'answer' ? '' : `${key}: `}${text}`] : [];
    })
    .filter(Boolean);
  return values.length ? values.join('; ') : 'No response saved.';
}

function MiniTestReview({ review }) {
  const questions = Array.isArray(review?.questions) ? review.questions : [];
  if (!questions.length) return null;

  return (
    <section className="card grammar-mini-review" aria-labelledby="grammar-mini-review-title">
      <div className="card-header">
        <div>
          <div className="eyebrow">Delayed feedback</div>
          <h3 className="section-title" id="grammar-mini-review-title">Mini-set review</h3>
        </div>
        <span className="chip">{questions.length} questions</span>
      </div>
      <div className="grammar-mini-review-list">
        {questions.map((question, index) => {
          const result = question.marked?.result || {};
          const item = question.item || {};
          return (
            <article className={`grammar-mini-review-item ${result.correct ? 'correct' : 'review'}`} key={`${question.itemId || question.templateId}-${index}`}>
              <div className="grammar-mini-review-head">
                <span className="chip">Q{index + 1}</span>
                <strong>{item.templateLabel || question.templateLabel || 'Grammar question'}</strong>
                <small>{Number(result.score) || 0}/{Number(result.maxScore) || Number(question.marks) || 1}</small>
              </div>
              <p>{item.promptText || ''}</p>
              <div className="grammar-mini-review-response">
                <span>Your response</span>
                <strong>{responseText(question.response)}</strong>
              </div>
              <div className={`feedback ${result.correct ? 'good' : 'warn'}`}>
                <strong>{result.feedbackShort || (result.correct ? 'Correct.' : 'Review this one.')}</strong>
                {result.feedbackLong ? <div>{result.feedbackLong}</div> : null}
                {result.answerText ? <div className="small muted">Answer: {result.answerText}</div> : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
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
      <MiniTestReview review={summary.miniTestReview} />
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
