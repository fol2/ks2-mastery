import React from 'react';
import { SpellingSetupScene } from './SpellingSetupScene.jsx';
import { SpellingSessionScene } from './SpellingSessionScene.jsx';
import { SpellingSummaryScene } from './SpellingSummaryScene.jsx';
import { SpellingWordBankScene } from './SpellingWordBankScene.jsx';
import {
  buildSpellingContext,
  heroBgForLearner,
  heroBgForSession,
  heroBgForSetup,
} from './spelling-view-model.js';

function heroBgForPhase(spelling) {
  const learnerId = spelling.learner?.id;
  if (!learnerId) return '';
  if (spelling.ui.phase === 'session') return heroBgForSession(learnerId, spelling.ui.session);
  if (spelling.ui.phase === 'summary') {
    return heroBgForSession(learnerId, { mode: spelling.ui.summary?.mode });
  }
  if (spelling.ui.phase === 'word-bank') return heroBgForLearner(learnerId);
  return heroBgForSetup(learnerId, spelling.prefs);
}

export function SpellingPracticeSurface(props) {
  const {
    appState,
    service,
    repositories,
    subject,
    actions,
  } = props;
  const spelling = buildSpellingContext({ appState, service, repositories, subject });
  const heroBg = heroBgForPhase(spelling);
  const previousHeroBgRef = React.useRef('');
  const previousHeroBg = previousHeroBgRef.current && previousHeroBgRef.current !== heroBg
    ? previousHeroBgRef.current
    : '';
  React.useEffect(() => {
    if (heroBg) previousHeroBgRef.current = heroBg;
  }, [heroBg]);
  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [spelling.ui.phase]);

  if (spelling.ui.phase === 'summary') {
    return <SpellingSummaryScene {...spelling} previousHeroBg={previousHeroBg} actions={actions} />;
  }

  if (spelling.ui.phase === 'session') {
    return <SpellingSessionScene {...spelling} previousHeroBg={previousHeroBg} service={service} actions={actions} />;
  }

  if (spelling.ui.phase === 'word-bank') {
    return (
      <SpellingWordBankScene
        appState={appState}
        learner={spelling.learner}
        analytics={spelling.analytics}
        accent={spelling.accent}
        previousHeroBg={previousHeroBg}
        actions={actions}
      />
    );
  }

  return (
    <SpellingSetupScene
      {...spelling}
      service={service}
      repositories={repositories}
      subject={subject}
      previousHeroBg={previousHeroBg}
      actions={actions}
    />
  );
}
