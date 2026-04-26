import React from 'react';
import { SpellingSetupScene } from './SpellingSetupScene.jsx';
import { SpellingSessionScene } from './SpellingSessionScene.jsx';
import { SpellingSummaryScene } from './SpellingSummaryScene.jsx';
import { SpellingWordBankScene } from './SpellingWordBankScene.jsx';
import { preloadImages } from '../../../platform/ui/luminance.js';
import {
  buildSpellingContext,
  heroBgForLearner,
  heroBgPreloadUrls,
  heroBgForSession,
  heroBgForSetup,
  selectSpellingSetupTone,
  spellingHeroTone,
} from './spelling-view-model.js';

function setupToneMemoryKey(learnerId) {
  return `ks2.spelling.setupTone.${learnerId || 'anonymous'}`;
}

function readPreviousSetupTone(learnerId) {
  if (typeof window === 'undefined') return spellingHeroTone(learnerId);
  try {
    const storage = window.sessionStorage;
    return storage?.getItem(setupToneMemoryKey(learnerId)) || spellingHeroTone(learnerId);
  } catch (_error) {
    return spellingHeroTone(learnerId);
  }
}

function rememberSetupTone(learnerId, tone) {
  if (!learnerId || !tone || typeof window === 'undefined') return;
  try {
    window.sessionStorage?.setItem(setupToneMemoryKey(learnerId), tone);
  } catch (_error) {
    /* Ignore unavailable browser storage. */
  }
}

function heroBgForPhase(spelling, setupHeroTone) {
  const learnerId = spelling.learner?.id;
  if (!learnerId) return '';
  if (spelling.ui.phase === 'session') {
    return heroBgForSession(learnerId, spelling.ui.session, {
      awaitingAdvance: Boolean(spelling.ui.awaitingAdvance),
    });
  }
  if (spelling.ui.phase === 'summary') {
    const progressTotal = Math.max(1, spelling.ui.summary?.totalWords || 1);
    return heroBgForSession(learnerId, {
      mode: spelling.ui.summary?.mode,
      progress: { done: progressTotal, total: progressTotal },
    }, { complete: true });
  }
  if (spelling.ui.phase === 'word-bank') return heroBgForLearner(learnerId);
  return heroBgForSetup(learnerId, spelling.prefs, { tone: setupHeroTone });
}

export function SpellingPracticeSurface(props) {
  const {
    appState,
    service,
    repositories,
    subject,
    actions,
    runtimeReadOnly = false,
    // P2 U1: `session` is spread from routeContext in SubjectRoute — its
    // `platformRole` gates the adult-only "Why is Guardian locked?" link on
    // the setup scene. Child / parent roles pass undefined and the link
    // never renders; admin / ops adults see it and can jump into the admin
    // hub diagnostic panel.
    session = null,
    // SH2-U4 (sys-hardening p2): TTS port from routeContext, forwarded to
    // the session scene for its status-channel subscription.
    tts = null,
  } = props;
  const platformRole = typeof session?.platformRole === 'string' ? session.platformRole : '';
  const spelling = buildSpellingContext({ appState, service, repositories, subject });
  const learnerId = spelling.learner?.id || '';
  const [setupHeroTone, setSetupHeroTone] = React.useState(() => (
    selectSpellingSetupTone(learnerId, readPreviousSetupTone(learnerId))
  ));
  const previousLearnerRef = React.useRef(learnerId);
  const previousPhaseRef = React.useRef(spelling.ui.phase);
  React.useEffect(() => {
    if (previousLearnerRef.current === learnerId) return;
    previousLearnerRef.current = learnerId;
    setSetupHeroTone(selectSpellingSetupTone(learnerId, readPreviousSetupTone(learnerId)));
  }, [learnerId]);
  React.useEffect(() => {
    const previousPhase = previousPhaseRef.current;
    previousPhaseRef.current = spelling.ui.phase;
    if (learnerId && previousPhase !== 'dashboard' && spelling.ui.phase === 'dashboard') {
      setSetupHeroTone((current) => selectSpellingSetupTone(learnerId, current));
    }
  }, [learnerId, spelling.ui.phase]);
  React.useEffect(() => {
    rememberSetupTone(learnerId, setupHeroTone);
  }, [learnerId, setupHeroTone]);
  const heroBg = heroBgForPhase(spelling, setupHeroTone);
  const preloadedHeroUrls = heroBgPreloadUrls(spelling.learner?.id, spelling.prefs, { setupTone: setupHeroTone });
  const preloadKey = preloadedHeroUrls.join('|');
  const previousHeroBgRef = React.useRef('');
  const previousHeroBg = previousHeroBgRef.current && previousHeroBgRef.current !== heroBg
    ? previousHeroBgRef.current
    : '';
  React.useEffect(() => {
    if (heroBg) previousHeroBgRef.current = heroBg;
  }, [heroBg]);
  React.useEffect(() => {
    preloadImages(preloadedHeroUrls);
  }, [preloadKey]);
  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [spelling.ui.phase]);

  if (spelling.ui.phase === 'summary') {
    return (
      <SpellingSummaryScene
        {...spelling}
        previousHeroBg={previousHeroBg}
        actions={actions}
        runtimeReadOnly={runtimeReadOnly}
      />
    );
  }

  if (spelling.ui.phase === 'session') {
    return (
      <SpellingSessionScene
        {...spelling}
        previousHeroBg={previousHeroBg}
        service={service}
        actions={actions}
        runtimeReadOnly={runtimeReadOnly}
        tts={tts}
      />
    );
  }

  if (spelling.ui.phase === 'word-bank') {
    return (
      <SpellingWordBankScene
        appState={appState}
        learner={spelling.learner}
        analytics={spelling.analytics}
        accent={spelling.accent}
        postMastery={spelling.postMastery}
        previousHeroBg={previousHeroBg}
        actions={actions}
        runtimeReadOnly={runtimeReadOnly}
      />
    );
  }

  return (
    <SpellingSetupScene
      {...spelling}
      service={service}
      repositories={repositories}
      subject={subject}
      setupHeroTone={setupHeroTone}
      previousHeroBg={previousHeroBg}
      actions={actions}
      runtimeReadOnly={runtimeReadOnly}
      platformRole={platformRole}
    />
  );
}
