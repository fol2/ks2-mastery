import { useMemo } from 'react';
import { PunctuationMapScene } from './PunctuationMapScene.jsx';
import { PunctuationSessionScene } from './PunctuationSessionScene.jsx';
import { PunctuationSetupScene } from './PunctuationSetupScene.jsx';
import { PunctuationSummaryScene } from './PunctuationSummaryScene.jsx';

const MONSTER_CODEX_SYSTEM_ID = 'monster-codex';

function learnerRecord(appState, learnerId) {
  const record = appState?.learners?.byId?.[learnerId];
  return record && typeof record === 'object' && !Array.isArray(record) ? record : null;
}

// U4 follower (HIGH 1): resolve the monster-codex reward state via the
// `repositories.gameState` port — the same path the punctuation reward
// subscriber writes to (`src/subjects/punctuation/event-hooks.js`) and the
// same path Grammar uses in `GrammarPracticeSurface.resolveGrammarRewardState`.
// Reading into `ui.rewardState` keeps both `PunctuationMapScene` and
// `PunctuationSummaryScene` driven off one canonical path — the pre-fix
// Summary scene read a `ui.rewards.monsters.punctuation` path that was
// never populated in production, so every live learner saw zero monster
// progress regardless of actual mastery.
function resolvePunctuationRewardState(repositories, learnerId) {
  if (!learnerId || typeof repositories?.gameState?.read !== 'function') return {};
  const state = repositories.gameState.read(learnerId, MONSTER_CODEX_SYSTEM_ID);
  return state && typeof state === 'object' && !Array.isArray(state) ? state : {};
}

// Phase 3 U2 removed the legacy `SetupView` from this module. The
// Setup phase now delegates to `PunctuationSetupScene.jsx`, which
// renders the dashboard hero + today cards + three primary mode
// cards + Open Map secondary card + round-length toggle + active
// monster strip. See `./PunctuationSetupScene.jsx` for the current
// implementation and the one-shot stale-prefs migration.

export function PunctuationPracticeSurface({ appState, service, actions, repositories }) {
  const learnerId = appState.learners.selectedId;
  const ui = service?.initState?.(appState.subjectUi?.punctuation, learnerId) || appState.subjectUi?.punctuation || {};
  const stats = useMemo(() => service?.getStats?.(learnerId) || ui.stats || {}, [learnerId, service, ui.stats]);
  const learner = learnerRecord(appState, learnerId);
  // U2: prefer `ui.prefs` so the display collapse stays coherent across
  // re-renders; fall back to the service read (which hits the data
  // repository) when `ui.prefs` has not yet been mirrored (e.g. first
  // Setup visit on a pre-U2 subject state). Service read is side-effect
  // free.
  const prefs = (ui && typeof ui === 'object' && !Array.isArray(ui) && ui.prefs)
    ? ui.prefs
    : (service?.getPrefs?.(learnerId) || {});
  // U4 follower (HIGH 1): monster-codex reward state resolved from the
  // canonical `repositories.gameState` port (Grammar precedent). Falls
  // back to `ui.rewardState` when a host does not wire `repositories`
  // (test harnesses, pre-U2 surfaces) so the Setup/Map active-monster
  // strips still render the service-seeded path.
  const rewardState = useMemo(
    () => {
      const persisted = resolvePunctuationRewardState(repositories, learnerId);
      if (persisted && Object.keys(persisted).length > 0) return persisted;
      const fromUi = ui && typeof ui === 'object' && !Array.isArray(ui) ? ui.rewardState : null;
      return fromUi && typeof fromUi === 'object' && !Array.isArray(fromUi) ? fromUi : persisted;
    },
    [repositories, learnerId, ui],
  );

  // Phase 3 U3: `active-item` + `feedback` route through the consolidated
  // `PunctuationSessionScene`. Phase 3 U4: `summary` routes through the new
  // `PunctuationSummaryScene`. Map routes to the U5 scene; Setup remains
  // the default SetupView (U2 owns redesign).
  if (ui.phase === 'active-item' || ui.phase === 'feedback') {
    return <PunctuationSessionScene ui={ui} actions={actions} />;
  }
  if (ui.phase === 'summary') {
    return (
      <PunctuationSummaryScene
        ui={ui}
        actions={actions}
        appState={appState}
        rewardState={rewardState}
      />
    );
  }
  if (ui.phase === 'map') return <PunctuationMapScene ui={ui} actions={actions} />;

  // U2: every non-session / non-map / non-unavailable / non-error phase
  // falls through to the Setup scene. The Phase 2 enum still includes
  // `'setup'`, `'unavailable'`, and `'error'`; the latter two keep
  // their Phase 2 behaviour (the parent shell handles unavailable /
  // error banners). Unknown phase strings default to Setup so a rogue
  // payload doesn't land the learner on a broken blank scene.
  return (
    <PunctuationSetupScene
      ui={ui}
      actions={actions}
      prefs={prefs}
      stats={stats}
      learner={learner}
      rewardState={rewardState}
    />
  );
}
