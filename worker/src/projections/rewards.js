import { cloneSerialisable } from '../../../src/platform/core/repositories/helpers.js';
import { rewardEventsFromGrammarEvents } from '../../../src/subjects/grammar/event-hooks.js';
import { rewardEventsFromPunctuationEvents } from '../../../src/subjects/punctuation/event-hooks.js';
import { rewardEventsFromSpellingEvents } from '../../../src/subjects/spelling/event-hooks.js';

export const MONSTER_CODEX_SYSTEM_ID = 'monster-codex';

export function projectSpellingRewards({
  learnerId,
  domainEvents = [],
  gameState = {},
  random = Math.random,
  // P2 U12 MEDIUM (u12-corr-02): thread `existingEvents` + `repositories`
  // through so the Worker-side subscriber sees the same boot-time event
  // history + `data.achievements` sibling the client sees via
  // `src/platform/events/runtime.js:69`. Without this, the Worker twin's
  // achievement evaluator fires a 7-day unlock on the first mission of any
  // command because prior-day events from the projection state are dropped.
  existingEvents = [],
  repositories = null,
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
    // Threaded through the createSpellingRewardSubscriber context so the U12
    // subscriber's `processLearnerBatch` can filter existingEvents by the
    // active learnerId AND prefer the durable `data.achievements` sibling
    // over a rolling-log reconstruction. Matches the client behaviour in
    // `src/platform/events/runtime.js:69`.
    existingEvents: Array.isArray(existingEvents) ? existingEvents : [],
    repositories,
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

export function projectPunctuationRewards({
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

  const rewardEvents = rewardEventsFromPunctuationEvents(domainEvents, {
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

export function projectGrammarRewards({
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

  const rewardEvents = rewardEventsFromGrammarEvents(domainEvents, {
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
