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
  // Hot-path response may omit the fat monster-codex snapshot when the
  // command did not change it. Clients keep their cached gameState.
  includeRewardState = true,
  // recentEventTokens are for server-side dedupe persistence only; omit from
  // the HTTP response unless a caller explicitly needs them.
  includeRecentEventTokens = true,
} = {}) {
  const cleanedTokens = Array.isArray(recentEventTokens)
    ? recentEventTokens.filter((token) => typeof token === 'string' && token)
    : [];
  const limit = Math.max(0, Number(tokenRingLimit) || 0) || RECENT_EVENT_TOKEN_RING_LIMIT;
  const clampedTokens = cleanedTokens.length <= limit
    ? cleanedTokens
    : cleanedTokens.slice(cleanedTokens.length - limit);
  const rewards = {
    systemId: MONSTER_CODEX_SYSTEM_ID,
    events: cloneSerialisable(reactionEvents) || [],
    toastEvents: cloneSerialisable(toastEvents) || [],
  };
  if (includeRewardState) {
    rewards.state = cloneSerialisable(gameState?.[MONSTER_CODEX_SYSTEM_ID]) || {};
  }
  return {
    version: COMMAND_PROJECTION_SCHEMA_VERSION,
    rewards,
    eventCounts: {
      domain: Array.isArray(domainEvents) ? domainEvents.length : 0,
      reactions: Array.isArray(reactionEvents) ? reactionEvents.length : 0,
      toasts: Array.isArray(toastEvents) ? toastEvents.length : 0,
    },
    ...(includeRecentEventTokens ? { recentEventTokens: clampedTokens } : {}),
  };
}
