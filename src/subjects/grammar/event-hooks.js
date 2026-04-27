import {
  GRAMMAR_REWARD_RELEASE_ID,
  grammarMasteryKey,
  recordGrammarConceptMastery,
  updateGrammarStarHighWater,
} from '../../platform/game/monster-system.js';

export const GRAMMAR_EVENT_TYPES = Object.freeze({
  CONCEPT_SECURED: 'grammar.concept-secured',
  STAR_EVIDENCE_UPDATED: 'grammar.star-evidence-updated',
});

export function createGrammarRewardSubscriber({
  gameStateRepository,
  random = Math.random,
} = {}) {
  return function grammarRewardSubscriber(events = []) {
    const rewardEvents = [];
    for (const event of Array.isArray(events) ? events : []) {
      if (!event) continue;

      if (event.type === GRAMMAR_EVENT_TYPES.CONCEPT_SECURED) {
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
        continue;
      }

      if (event.type === GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED) {
        const conceptId = typeof event.conceptId === 'string' ? event.conceptId : '';
        const computedStars = Number(event.computedStars);
        if (!conceptId || !Number.isFinite(computedStars) || computedStars < 1) continue;
        rewardEvents.push(
          ...updateGrammarStarHighWater({
            learnerId: event.learnerId,
            monsterId: event.monsterId,
            conceptId,
            computedStars,
            gameStateRepository,
            random,
          }),
        );
        continue;
      }
    }
    return rewardEvents;
  };
}

export function rewardEventsFromGrammarEvents(events, options = {}) {
  return createGrammarRewardSubscriber(options)(events);
}
