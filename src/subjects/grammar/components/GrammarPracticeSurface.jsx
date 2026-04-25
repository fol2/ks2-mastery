import React from 'react';
import { GrammarAnalyticsScene } from './GrammarAnalyticsScene.jsx';
import { GrammarSessionScene } from './GrammarSessionScene.jsx';
import { GrammarSetupScene } from './GrammarSetupScene.jsx';
import { GrammarSummaryScene } from './GrammarSummaryScene.jsx';
import { GRAMMAR_MONSTER_ROUTES, GRAMMAR_SUBJECT_ID, normaliseGrammarReadModel } from '../metadata.js';

const MONSTER_CODEX_SYSTEM_ID = 'monster-codex';

const GRAMMAR_TRANSFER_PLACEHOLDERS = Object.freeze([
  {
    id: 'paragraph-transfer',
    eyebrow: 'Non-scored transfer',
    title: 'Paragraph transfer',
    copy: 'Coming next: short paragraph application that asks the learner to use Grammar choices in a wider piece of writing.',
    bullets: [
      'No score is recorded from this placeholder.',
      'Teacher review and paragraph marking are not promised in this release.',
    ],
  },
  {
    id: 'writing-application',
    eyebrow: 'Future writing application',
    title: 'Richer writing tasks',
    copy: 'Reserved for sentence-to-writing practice once the deterministic Grammar evidence and reporting path are stable.',
    bullets: [
      'Worker-marked Grammar remains the only score-bearing authority.',
      'Any future writing workflow will ship as its own reviewed capability.',
    ],
  },
]);

function selectedLearner(appState) {
  const learnerId = appState?.learners?.selectedId || '';
  return learnerId ? appState.learners?.byId?.[learnerId] || null : null;
}

function hasGrammarRewardProgress(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  return GRAMMAR_MONSTER_ROUTES.some((route) => {
    const entry = state[route.id];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const mastered = Array.isArray(entry.mastered)
      ? entry.mastered.filter((key) => typeof key === 'string' && key).length
      : 0;
    const masteredCount = Number(entry.masteredCount);
    return mastered > 0 || (Number.isFinite(masteredCount) && masteredCount > 0) || entry.caught === true;
  });
}

function readPersistedRewardState(repositories, learnerId) {
  if (!learnerId || typeof repositories?.gameState?.read !== 'function') return {};
  const state = repositories.gameState.read(learnerId, MONSTER_CODEX_SYSTEM_ID);
  return state && typeof state === 'object' && !Array.isArray(state) ? state : {};
}

function resolveGrammarRewardState({ grammar, learner, repositories }) {
  const projected = grammar.projections?.rewards?.state;
  const projectedState = projected && typeof projected === 'object' && !Array.isArray(projected)
    ? projected
    : {};
  const persistedState = readPersistedRewardState(repositories, learner?.id || '');

  if (hasGrammarRewardProgress(projectedState)) return projectedState;
  if (hasGrammarRewardProgress(persistedState)) return persistedState;
  return Object.keys(projectedState).length ? projectedState : persistedState;
}

function GrammarTransferPlaceholders() {
  return (
    <section className="card grammar-transfer-placeholders" aria-labelledby="grammar-transfer-title">
      <div className="card-header">
        <div>
          <div className="eyebrow">Transfer bridge</div>
          <h3 className="section-title" id="grammar-transfer-title">Writing application roadmap</h3>
        </div>
        <span className="chip">Coming next</span>
      </div>
      <div className="grammar-transfer-grid">
        {GRAMMAR_TRANSFER_PLACEHOLDERS.map((entry) => (
          <article className="grammar-transfer-card" key={entry.id}>
            <div className="eyebrow">{entry.eyebrow}</div>
            <h4>{entry.title}</h4>
            <p>{entry.copy}</p>
            <ul>
              {entry.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
            </ul>
            <button
              className="btn secondary"
              type="button"
              disabled
              data-grammar-transfer-placeholder={entry.id}
            >
              Coming next
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

export function GrammarPracticeSurface({
  appState,
  subject,
  actions,
  repositories,
  runtimeReadOnly = false,
}) {
  const learner = selectedLearner(appState);
  const grammar = normaliseGrammarReadModel(appState.subjectUi?.[GRAMMAR_SUBJECT_ID], learner?.id || '');
  const rewardState = resolveGrammarRewardState({ grammar, learner, repositories });
  const shared = {
    subject,
    learner,
    grammar,
    rewardState,
    actions,
    runtimeReadOnly,
  };

  if (grammar.phase === 'session' || grammar.phase === 'feedback') {
    return <GrammarSessionScene {...shared} />;
  }

  if (grammar.phase === 'summary') {
    return <GrammarSummaryScene {...shared} />;
  }

  return (
    <div className="grammar-surface">
      <GrammarSetupScene {...shared} />
      <GrammarAnalyticsScene {...shared} />
      <GrammarTransferPlaceholders />
    </div>
  );
}
