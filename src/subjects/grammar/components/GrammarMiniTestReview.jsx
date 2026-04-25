import React from 'react';

// Post-finish mini-test review surface. Mounted from `GrammarSummaryScene`
// once the Worker sets `grammar.phase === 'summary'` and populates
// `grammar.summary.miniTestReview`.
//
// The Worker is the single source of truth for marking: it stamps each
// question with `marked.result.correct` (or leaves the entry unanswered
// with `feedbackShort === 'No answer saved.'`). This component never
// recomputes correctness — it only renders the projected shape and
// surfaces a `Practise this later` button that dispatches
// `grammar-focus-concept` with the question's primary concept id.
//
// Copy stays child-facing: unanswered questions render as `Blank` (not
// `Wrong`), the expandable row uses `<details><summary>` so it also works
// in the SSR harness, and the score card is a plain `X of N correct` line
// with a percentage caption.

function countsFrom(questions) {
  let correct = 0;
  let answered = 0;
  for (const question of questions) {
    if (question.answered) answered += 1;
    if (question.marked?.result?.correct === true) correct += 1;
  }
  return { correct, answered, total: questions.length };
}

function renderResponseText(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return '';
  const entries = Object.entries(response)
    .flatMap(([key, value]) => {
      if (Array.isArray(value)) return value.map((entry) => String(entry || '').trim()).filter(Boolean);
      const text = String(value ?? '').trim();
      return text ? [key === 'answer' ? text : `${key}: ${text}`] : [];
    })
    .filter(Boolean);
  return entries.join('; ');
}

function questionConceptId(question) {
  const item = question?.item || {};
  const skillIds = Array.isArray(item.skillIds) ? item.skillIds : [];
  const replayIds = Array.isArray(item.replay?.conceptIds) ? item.replay.conceptIds : [];
  const first = skillIds.find((id) => typeof id === 'string' && id)
    || replayIds.find((id) => typeof id === 'string' && id)
    || '';
  return String(first || '').slice(0, 64);
}

function truncatePrompt(text, limit = 160) {
  const value = String(text || '').trim();
  if (!value) return '';
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1).trimEnd()}...`;
}

function ReviewItem({ question, index, onPractiseLater, disabled }) {
  const marked = question?.marked || {};
  const result = marked.result || {};
  const item = question?.item || {};
  const isAnswered = Boolean(question?.answered);
  const isCorrect = isAnswered && result.correct === true;
  const responseText = renderResponseText(question?.response);
  const learnerAnswer = isAnswered && responseText ? responseText : 'Blank';
  // Only offer `Practise this later` when the question is not secure (wrong
  // or blank). A correct answer does not need a focused-practice hand-off.
  const showPractiseLater = !isCorrect;
  const conceptId = questionConceptId(question);
  const statusLabel = isCorrect ? 'Correct' : (isAnswered ? 'Not quite' : 'Blank');
  const toneClass = isCorrect ? 'good' : (isAnswered ? 'warn' : 'muted');
  const promptText = truncatePrompt(item.promptText);

  return (
    <details
      className={`grammar-mini-review-item ${isCorrect ? 'correct' : isAnswered ? 'wrong' : 'blank'}`}
      data-index={index}
    >
      <summary className="grammar-mini-review-summary">
        <span className="chip">Q{index + 1}</span>
        <strong>{item.templateLabel || question?.templateLabel || 'Grammar question'}</strong>
        <span className={`chip ${toneClass}`}>{statusLabel}</span>
      </summary>
      <div className="grammar-mini-review-body">
        {promptText ? <p className="grammar-mini-review-prompt">{promptText}</p> : null}
        <dl className="grammar-mini-review-answers">
          <div>
            <dt>Your answer</dt>
            <dd>{learnerAnswer}</dd>
          </div>
          {result.answerText ? (
            <div>
              <dt>Correct answer</dt>
              <dd>{result.answerText}</dd>
            </div>
          ) : null}
          {result.feedbackShort || result.feedbackLong ? (
            <div>
              <dt>Why</dt>
              <dd>
                {result.feedbackShort ? <strong>{result.feedbackShort}</strong> : null}
                {result.feedbackLong ? <span>{result.feedbackLong}</span> : null}
              </dd>
            </div>
          ) : null}
        </dl>
        {showPractiseLater && conceptId ? (
          <div className="grammar-mini-review-actions">
            <button
              type="button"
              className="btn secondary sm"
              data-action="grammar-focus-concept"
              data-concept-id={conceptId}
              disabled={disabled}
              onClick={() => onPractiseLater(conceptId)}
            >
              Practise this later
            </button>
          </div>
        ) : null}
      </div>
    </details>
  );
}

export function GrammarMiniTestReview({ review, actions, runtimeReadOnly, pending }) {
  const questions = Array.isArray(review?.questions) ? review.questions : [];
  if (!questions.length) return null;

  const { correct, total } = countsFrom(questions);
  const percent = total > 0 ? Math.round((correct / total) * 100) : 0;
  const disabled = Boolean(runtimeReadOnly || pending);

  const handlePractise = (conceptId) => {
    if (!conceptId) return;
    actions?.dispatch?.('grammar-focus-concept', { conceptId });
  };

  return (
    <section className="card grammar-mini-review" aria-labelledby="grammar-mini-review-title">
      <div className="card-header">
        <div>
          <div className="eyebrow">Your results</div>
          <h3 className="section-title" id="grammar-mini-review-title">Mini Test results</h3>
        </div>
        <span className="chip">{total} questions</span>
      </div>
      <div className="grammar-mini-review-score" role="status" aria-live="polite">
        <strong>{correct} of {total} correct</strong>
        <small>{percent}% accuracy</small>
      </div>
      <div className="grammar-mini-review-list">
        {questions.map((question, index) => (
          <ReviewItem
            key={`${question.itemId || question.templateId || 'q'}-${index}`}
            question={question}
            index={index}
            onPractiseLater={handlePractise}
            disabled={disabled}
          />
        ))}
      </div>
    </section>
  );
}
