import React from 'react';
import { SpellingSetupScene } from './SpellingSetupScene.jsx';
import { SpellingSessionScene } from './SpellingSessionScene.jsx';
import { SpellingSummaryScene } from './SpellingSummaryScene.jsx';
import { SpellingWordBankScene } from './SpellingWordBankScene.jsx';
import { buildSpellingContext } from './spelling-view-model.js';

export function SpellingPracticeSurface(props) {
  const {
    appState,
    service,
    repositories,
    subject,
    actions,
  } = props;
  const spelling = buildSpellingContext({ appState, service, repositories, subject });
  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [spelling.ui.phase]);

  if (spelling.ui.phase === 'summary') {
    return <SpellingSummaryScene {...spelling} actions={actions} />;
  }

  if (spelling.ui.phase === 'session') {
    return <SpellingSessionScene {...spelling} service={service} actions={actions} />;
  }

  if (spelling.ui.phase === 'word-bank') {
    return (
      <SpellingWordBankScene
        appState={appState}
        learner={spelling.learner}
        analytics={spelling.analytics}
        accent={spelling.accent}
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
      actions={actions}
    />
  );
}
