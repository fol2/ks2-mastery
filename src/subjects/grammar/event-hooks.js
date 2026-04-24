import {
  GRAMMAR_REWARD_RELEASE_ID,
  grammarMasteryKey,
  recordGrammarConceptMastery,
} from '../../platform/game/monster-system.js';

export const GRAMMAR_EVENT_TYPES = Object.freeze({
  CONCEPT_SECURED: 'grammar.concept-secured',
});

export function createGrammarRewardSubscriber({
  gameStateRepository,
  random = Math.random,
} = {}) {
  return function grammarRewardSubscriber(events = []) {
    const rewardEvents = [];
    for (const event of Array.isArray(events) ? events : []) {
      if (!event || event.type !== GRAMMAR_EVENT_TYPES.CONCEPT_SECURED) continue;
      const conceptId = typeof event.conceptId === 'string' ? event.conceptId : '';
      const releaseId = typeof event.contentReleaseId === 'string' && event.contentReleaseId
        ? event.contentReleaseId
        : GRAMMAR_REWARD_RELEASE_ID;
      rewardEvents.push(
        ...recordGrammarConceptMastery({
          learnerId: event.learnerId,
          conceptId,
          releaseId,
          masteryKey: event.masteryKey || grammarMasteryKey(conceptId, releaseId),
          createdAt: event.createdAt,
          gameStateRepository,
          random,
        }),
      );
    }
    return rewardEvents;
  };
}

export function rewardEventsFromGrammarEvents(events, options = {}) {
  return createGrammarRewardSubscriber(options)(events);
}
