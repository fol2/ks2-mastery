import React from 'react';
import { GrammarAnalyticsScene } from './GrammarAnalyticsScene.jsx';
import { GrammarSessionScene } from './GrammarSessionScene.jsx';
import { GrammarSetupScene } from './GrammarSetupScene.jsx';
import { GrammarSummaryScene } from './GrammarSummaryScene.jsx';
import { GRAMMAR_MONSTER_ROUTES, GRAMMAR_SUBJECT_ID, normaliseGrammarReadModel } from '../metadata.js';
import { normaliseGrammarRewardState } from '../../../platform/game/monster-system.js';

const MONSTER_CODEX_SYSTEM_ID = 'monster-codex';

// Phase 3 U1 removes the adult-diagnostic roadmap placeholders. The
// U6b Writing Try scene and U2 Grammar Bank scene take over the slots
// with real child-facing scenes. Until those ship, U1 routes their
// phase transitions through a minimal stub below so the state machine
// remains safe and a "return" button lets the learner back out.

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

  // Route through `normaliseGrammarRewardState` before `hasGrammarRewardProgress`
  // so a pre-flip learner whose only evidence is under a retired id (e.g.
  // `glossbloom.mastered: [...]`) is detected as a returning learner via the
  // unioned Concordium view. Without the union, `GRAMMAR_MONSTER_ROUTES` now
  // only includes 4 entries and retired-id progress would read as "fresh".
  const normalisedProjected = normaliseGrammarRewardState(projectedState);
  if (hasGrammarRewardProgress(normalisedProjected)) return normalisedProjected;
  const normalisedPersisted = normaliseGrammarRewardState(persistedState);
  if (hasGrammarRewardProgress(normalisedPersisted)) return normalisedPersisted;
  return Object.keys(normalisedProjected).length ? normalisedProjected : normalisedPersisted;
}

function GrammarBankPlaceholderScene({ actions }) {
  // U1 wires the "Grammar Bank" primary mode card; U2 ships the real scene.
  // Until then, this stub honours the state transition and offers a way back
  // so the learner is never stuck.
  return (
    <section className="grammar-bank-placeholder" aria-labelledby="grammar-bank-placeholder-title">
      <h2 id="grammar-bank-placeholder-title">Grammar Bank</h2>
      <p>Your full concept bank lands here soon — browse all 18 grammar concepts with child-friendly statuses.</p>
      <button
        type="button"
        className="btn primary"
        data-action="grammar-back"
        onClick={() => actions.dispatch('grammar-back')}
      >
        Back to Grammar Garden
      </button>
    </section>
  );
}

function GrammarTransferPlaceholderScene({ actions }) {
  // U1 wires the "Writing Try" secondary button; U6b ships the real scene.
  return (
    <section className="grammar-transfer-placeholder" aria-labelledby="grammar-transfer-placeholder-title">
      <h2 id="grammar-transfer-placeholder-title">Writing Try</h2>
      <p>Non-scored writing practice is opening up soon. Nothing you write here will change your Grammar scores.</p>
      <button
        type="button"
        className="btn primary"
        data-action="grammar-back"
        onClick={() => actions.dispatch('grammar-back')}
      >
        Back to Grammar Garden
      </button>
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

  if (grammar.phase === 'bank') {
    return (
      <div className="grammar-surface">
        <GrammarBankPlaceholderScene {...shared} />
      </div>
    );
  }

  if (grammar.phase === 'transfer') {
    return (
      <div className="grammar-surface">
        <GrammarTransferPlaceholderScene {...shared} />
      </div>
    );
  }

  return (
    <div className="grammar-surface">
      <GrammarSetupScene {...shared} />
      {/* Phase 3 U1 keeps the analytics surface reachable but demoted from
          the dashboard primary view — it now lives behind a "Grown-up view"
          disclosure per the U5 summary decision. Until U5/U7 land the
          full split, this stays here as the non-primary grown-up surface. */}
      <details className="grammar-grown-up-view">
        <summary>Grown-up view</summary>
        <GrammarAnalyticsScene {...shared} />
      </details>
    </div>
  );
}
