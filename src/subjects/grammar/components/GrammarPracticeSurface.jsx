import React from 'react';
import { GrammarAnalyticsScene } from './GrammarAnalyticsScene.jsx';
import { GrammarConceptBankScene } from './GrammarConceptBankScene.jsx';
import { GrammarSessionScene } from './GrammarSessionScene.jsx';
import { GrammarSetupScene } from './GrammarSetupScene.jsx';
import { GrammarSummaryScene } from './GrammarSummaryScene.jsx';
import { GrammarTransferScene } from './GrammarTransferScene.jsx';
import { GRAMMAR_MONSTER_ROUTES, GRAMMAR_SUBJECT_ID, normaliseGrammarReadModel } from '../metadata.js';
import { normaliseGrammarRewardState } from '../../../platform/game/monster-system.js';

const MONSTER_CODEX_SYSTEM_ID = 'monster-codex';

// Phase 3 U2 replaces the Grammar Bank placeholder stub with the real
// `GrammarConceptBankScene`. Phase 3 U6b replaces the Writing Try
// placeholder with `GrammarTransferScene` — the non-scored writing
// surface consuming the Worker `transferLane` read model.

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

  // Phase 3 U5: `Grown-up view` on the summary dispatches
  // `grammar-open-analytics`, flipping phase to `'analytics'`. The scene
  // renders full-surface here (not inside a `<details>`) with a back
  // affordance so the adult can return to the summary. U7 scopes the
  // deeper child/adult split; here we only plumb the phase transition.
  if (grammar.phase === 'analytics') {
    return (
      <div className="grammar-surface grammar-surface--analytics">
        <div className="grammar-analytics-back-row">
          <button
            type="button"
            className="btn ghost"
            data-action="grammar-close-analytics"
            aria-label="Back to round summary"
            onClick={() => actions.dispatch('grammar-close-analytics')}
          >
            Back to round summary
          </button>
        </div>
        <GrammarAnalyticsScene {...shared} />
      </div>
    );
  }

  if (grammar.phase === 'bank') {
    return (
      <div className="grammar-surface">
        <GrammarConceptBankScene {...shared} />
      </div>
    );
  }

  if (grammar.phase === 'transfer') {
    return (
      <div className="grammar-surface">
        <GrammarTransferScene {...shared} />
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
