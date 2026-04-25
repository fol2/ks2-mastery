import React from 'react';
import { GrammarMiniTestReview } from './GrammarMiniTestReview.jsx';
import { grammarSummaryCards } from './grammar-view-model.js';
import { grammarMissedConceptFromUi } from '../module.js';

// Phase 3 U5: child-friendly round-end surface. Regular practice renders
// the five summary cards (Answered / Correct / Trouble spots found / New
// secure / Monster progress) above a three-button primary action row and a
// quiet "Grown-up view" secondary. Mini-test rounds render a score card +
// review mount + two mini-test primary actions (`Review answers`, `Fix
// missed concepts`). No evidence tables, no misconception prose, no parent
// summary draft, no analytics appear in the default child surface — those
// live behind `grammar-open-analytics` (phase: 'analytics').

function isMiniTestSummary(summary) {
  if (!summary) return false;
  if (summary.miniTestReview && Array.isArray(summary.miniTestReview.questions)) return true;
  if (summary.mode === 'satsset') return true;
  return false;
}

function SummaryCards({ cards }) {
  return (
    <div className="grammar-summary-cards" role="list">
      {cards.map((card) => {
        if (card.id === 'monster-progress') {
          const monsters = Array.isArray(card.value) ? card.value : [];
          return (
            <div
              className="grammar-summary-card grammar-summary-card--monster"
              data-card-id={card.id}
              role="listitem"
              key={card.id}
            >
              <div className="grammar-summary-card-label">{card.label}</div>
              <ul className="grammar-summary-monster-list">
                {monsters.map((monster) => (
                  <li className="grammar-summary-monster" key={monster.id} data-monster-id={monster.id}>
                    <strong>{monster.name}</strong>
                    <span>{monster.mastered}/{monster.total}</span>
                  </li>
                ))}
              </ul>
              <div className="grammar-summary-card-detail">{card.detail}</div>
            </div>
          );
        }
        return (
          <div
            className="grammar-summary-card"
            data-card-id={card.id}
            role="listitem"
            key={card.id}
          >
            <div className="grammar-summary-card-label">{card.label}</div>
            <strong className="grammar-summary-card-value">{card.value}</strong>
            <div className="grammar-summary-card-detail">{card.detail}</div>
          </div>
        );
      })}
    </div>
  );
}

function ScoreCard({ summary }) {
  const questions = Array.isArray(summary?.miniTestReview?.questions)
    ? summary.miniTestReview.questions
    : [];
  const total = questions.length || Number(summary?.totalMarks) || 0;
  let correct = 0;
  for (const question of questions) {
    if (question?.marked?.result?.correct === true) correct += 1;
  }
  const percent = total > 0 ? Math.round((correct / total) * 100) : 0;
  return (
    <div className="grammar-summary-score" role="status" aria-live="polite">
      <div className="grammar-summary-score-headline">
        <strong>{correct} of {total} correct</strong>
        <small>{percent}% accuracy</small>
      </div>
      <div className="grammar-summary-score-detail">Mini Test complete</div>
    </div>
  );
}

function PrimaryActions({ buttons, disabled }) {
  return (
    <div className="grammar-summary-primary-actions" role="group" aria-label="Next steps">
      {buttons.map((button) => (
        <button
          key={button.action}
          type="button"
          className={`btn ${button.variant || 'primary'}`}
          data-action={button.action}
          disabled={disabled || button.disabled === true}
          onClick={button.onClick}
        >
          {button.label}
        </button>
      ))}
    </div>
  );
}

function SecondaryActions({ onGrownUp, disabled }) {
  return (
    <div className="grammar-summary-secondary-actions">
      <button
        type="button"
        className="btn ghost"
        data-action="grammar-open-analytics"
        aria-label="Open adult report"
        disabled={disabled}
        onClick={onGrownUp}
      >
        Grown-up view
      </button>
    </div>
  );
}

function firstMissedMiniTestConceptId(summary) {
  const questions = Array.isArray(summary?.miniTestReview?.questions)
    ? summary.miniTestReview.questions
    : [];
  for (const question of questions) {
    const correct = question?.marked?.result?.correct === true;
    if (correct) continue;
    const item = question?.item || {};
    const skillIds = Array.isArray(item.skillIds) ? item.skillIds : [];
    const replayIds = Array.isArray(item.replay?.conceptIds) ? item.replay.conceptIds : [];
    const candidate = skillIds.find((id) => typeof id === 'string' && id)
      || replayIds.find((id) => typeof id === 'string' && id)
      || '';
    if (candidate) return String(candidate).slice(0, 64);
  }
  return '';
}

export function GrammarSummaryScene({ grammar, rewardState, actions, learner, runtimeReadOnly }) {
  const summary = grammar.summary || {};
  const pending = Boolean(grammar.pendingCommand);
  const disabled = Boolean(runtimeReadOnly) || pending;
  // `rewardState` is resolved upstream by `GrammarPracticeSurface` so the
  // summary monster progress reflects the learner's real unioned cluster
  // totals (projected + persisted view). Fall back to the grammar
  // projection slice defensively when the surface was rendered without the
  // resolved prop (e.g. a direct snapshot harness render).
  const effectiveRewardState = rewardState || grammar.projections?.rewards?.state || {};
  const miniTest = isMiniTestSummary(summary);
  const cards = grammarSummaryCards(summary, effectiveRewardState);
  const handleGrownUp = () => actions.dispatch('grammar-open-analytics');
  // U5 follower: regular-practice `Practise missed` is a silent no-op
  // when there is no actionable missed / weak / due concept. Compute the
  // same concept id that `grammar-practise-missed` would resolve inside
  // the module, then gate the button via `disabled` so the child sees a
  // muted state instead of a deceptive tap target. Mirrors the mini-test
  // branch's `missedConceptId` pattern.
  const regularMissedConceptId = miniTest ? '' : grammarMissedConceptFromUi(grammar);

  if (miniTest) {
    const missedConceptId = firstMissedMiniTestConceptId(summary);
    // U5 follower: `Fix missed concepts` is the product-suggested next
    // step after a Mini Test, so it takes the primary variant and leads
    // the row. `Review answers` is a lower-stakes scroll affordance and
    // drops to secondary. Order mirrors the hierarchy: primary first.
    const buttons = [
      {
        action: 'grammar-practise-missed',
        label: 'Fix missed concepts',
        variant: 'primary',
        disabled: !missedConceptId,
        onClick: () => actions.dispatch('grammar-practise-missed'),
      },
      {
        action: 'grammar-review-mini-test',
        label: 'Review answers',
        variant: 'secondary',
        onClick: () => {
          if (typeof globalThis?.document?.getElementById === 'function') {
            const node = globalThis.document.getElementById('grammar-mini-review-title');
            if (node && typeof node.scrollIntoView === 'function') {
              node.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }
        },
      },
    ];
    return (
      <div className="grammar-summary-shell grammar-summary-shell--mini-test">
        <section className="card grammar-summary-card-wrap" aria-labelledby="grammar-summary-title">
          <div className="eyebrow">Mini Test complete</div>
          <h2 className="section-title" id="grammar-summary-title">
            Nice work, {learner?.name || 'friend'} — results are in
          </h2>
          <ScoreCard summary={summary} />
          <PrimaryActions buttons={buttons} disabled={disabled} />
          <SecondaryActions onGrownUp={handleGrownUp} disabled={disabled} />
        </section>
        <GrammarMiniTestReview
          review={summary.miniTestReview}
          actions={actions}
          runtimeReadOnly={runtimeReadOnly}
          pending={pending}
        />
      </div>
    );
  }

  // Regular practice branch.
  const buttons = [
    {
      action: 'grammar-practise-missed',
      label: 'Practise missed',
      variant: 'primary',
      disabled: !regularMissedConceptId,
      onClick: () => actions.dispatch('grammar-practise-missed'),
    },
    {
      action: 'grammar-start-again',
      label: 'Start another round',
      variant: 'primary',
      onClick: () => actions.dispatch('grammar-start-again'),
    },
    {
      action: 'grammar-open-concept-bank',
      label: 'Open Grammar Bank',
      variant: 'secondary',
      onClick: () => actions.dispatch('grammar-open-concept-bank'),
    },
  ];

  return (
    <div className="grammar-summary-shell">
      <section className="card grammar-summary-card-wrap" aria-labelledby="grammar-summary-title">
        <div className="eyebrow">Grammar round complete</div>
        <h2 className="section-title" id="grammar-summary-title">
          Nice work — round complete
        </h2>
        <SummaryCards cards={cards} />
        <PrimaryActions buttons={buttons} disabled={disabled} />
        <SecondaryActions onGrownUp={handleGrownUp} disabled={disabled} />
      </section>
    </div>
  );
}
