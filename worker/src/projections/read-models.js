import { cloneSerialisable } from '../../../src/platform/core/repositories/helpers.js';
import { MONSTER_CODEX_SYSTEM_ID } from './rewards.js';

export function buildCommandProjectionReadModel({
  gameState = {},
  domainEvents = [],
  reactionEvents = [],
  toastEvents = [],
} = {}) {
  const rewardState = cloneSerialisable(gameState?.[MONSTER_CODEX_SYSTEM_ID]) || {};
  return {
    version: 1,
    rewards: {
      systemId: MONSTER_CODEX_SYSTEM_ID,
      state: rewardState,
      events: cloneSerialisable(reactionEvents) || [],
      toastEvents: cloneSerialisable(toastEvents) || [],
    },
    eventCounts: {
      domain: Array.isArray(domainEvents) ? domainEvents.length : 0,
      reactions: Array.isArray(reactionEvents) ? reactionEvents.length : 0,
      toasts: Array.isArray(toastEvents) ? toastEvents.length : 0,
    },
  };
}
