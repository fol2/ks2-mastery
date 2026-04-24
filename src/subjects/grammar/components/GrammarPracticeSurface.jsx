import React from 'react';
import { GrammarAnalyticsScene } from './GrammarAnalyticsScene.jsx';
import { GrammarSessionScene } from './GrammarSessionScene.jsx';
import { GrammarSetupScene } from './GrammarSetupScene.jsx';
import { GrammarSummaryScene } from './GrammarSummaryScene.jsx';
import { GRAMMAR_MONSTER_ROUTES, GRAMMAR_SUBJECT_ID, normaliseGrammarReadModel } from '../metadata.js';

const MONSTER_CODEX_SYSTEM_ID = 'monster-codex';

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
    </div>
  );
}
