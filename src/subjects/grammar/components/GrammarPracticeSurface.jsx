import React from 'react';
import { GrammarAnalyticsScene } from './GrammarAnalyticsScene.jsx';
import { GrammarSessionScene } from './GrammarSessionScene.jsx';
import { GrammarSetupScene } from './GrammarSetupScene.jsx';
import { GrammarSummaryScene } from './GrammarSummaryScene.jsx';
import { GRAMMAR_SUBJECT_ID, normaliseGrammarReadModel } from '../metadata.js';

function selectedLearner(appState) {
  const learnerId = appState?.learners?.selectedId || '';
  return learnerId ? appState.learners?.byId?.[learnerId] || null : null;
}

export function GrammarPracticeSurface({
  appState,
  subject,
  actions,
  runtimeReadOnly = false,
}) {
  const learner = selectedLearner(appState);
  const grammar = normaliseGrammarReadModel(appState.subjectUi?.[GRAMMAR_SUBJECT_ID], learner?.id || '');
  const shared = {
    subject,
    learner,
    grammar,
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
