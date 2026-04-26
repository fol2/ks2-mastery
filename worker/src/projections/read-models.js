import { cloneSerialisable } from '../../../src/platform/core/repositories/helpers.js';
import {
  COMMAND_PROJECTION_SCHEMA_VERSION,
  RECENT_EVENT_TOKEN_RING_LIMIT,
} from '../read-models/learner-read-models.js';
import { MONSTER_CODEX_SYSTEM_ID } from './rewards.js';

export function buildCommandProjectionReadModel({
  gameState = {},
  domainEvents = [],
  reactionEvents = [],
  toastEvents = [],
  recentEventTokens = [],
  tokenRingLimit = RECENT_EVENT_TOKEN_RING_LIMIT,
} = {}) {
  const rewardState = cloneSerialisable(gameState?.[MONSTER_CODEX_SYSTEM_ID]) || {};
  const cleanedTokens = Array.isArray(recentEventTokens)
    ? recentEventTokens.filter((token) => typeof token === 'string' && token)
    : [];
  const limit = Math.max(0, Number(tokenRingLimit) || 0) || RECENT_EVENT_TOKEN_RING_LIMIT;
  const clampedTokens = cleanedTokens.length <= limit
    ? cleanedTokens
    : cleanedTokens.slice(cleanedTokens.length - limit);
  return {
    version: COMMAND_PROJECTION_SCHEMA_VERSION,
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
    recentEventTokens: clampedTokens,
  };
}
