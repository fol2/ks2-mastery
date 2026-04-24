import { cloneSerialisable } from '../../../src/platform/core/repositories/helpers.js';
import { rewardEventsFromSpellingEvents } from '../../../src/subjects/spelling/event-hooks.js';

export const MONSTER_CODEX_SYSTEM_ID = 'monster-codex';

export function projectSpellingRewards({
  learnerId,
  domainEvents = [],
  gameState = {},
  random = Math.random,
} = {}) {
  let codexState = cloneSerialisable(gameState?.[MONSTER_CODEX_SYSTEM_ID]) || {};
  let wroteCodexState = false;
  const repository = {
    read(_learnerId, systemId) {
      if (systemId !== MONSTER_CODEX_SYSTEM_ID) return {};
      return cloneSerialisable(codexState) || {};
    },
    write(_learnerId, systemId, nextState) {
      if (systemId !== MONSTER_CODEX_SYSTEM_ID) return cloneSerialisable(nextState) || {};
      codexState = cloneSerialisable(nextState) || {};
      wroteCodexState = true;
      return cloneSerialisable(codexState) || {};
    },
  };

  const rewardEvents = rewardEventsFromSpellingEvents(domainEvents, {
    gameStateRepository: repository,
    random,
  });

  return {
    gameState: {
      ...(cloneSerialisable(gameState) || {}),
      [MONSTER_CODEX_SYSTEM_ID]: codexState,
    },
    changedGameState: wroteCodexState
      ? { [MONSTER_CODEX_SYSTEM_ID]: codexState }
      : {},
    rewardEvents,
  };
}
