import {
  reasoningMasteryKey,
  recordReasoningEvidenceMastery,
  REASONING_REWARD_RELEASE_ID,
} from '../../platform/game/monster-system.js';

export const REASONING_EVENT_TYPES = Object.freeze({
  ANSWER_SUBMITTED: 'reasoning.answer-submitted',
  SESSION_STARTED: 'reasoning.session-started',
  SESSION_COMPLETED: 'reasoning.session-completed',
  EVIDENCE_EARNED: 'reasoning.evidence-earned',
});

export function createReasoningRewardSubscriber({ gameStateRepository, random = Math.random } = {}) {
  return function reasoningRewardSubscriber(events = []) {
    const rewardEvents = [];
    for (const event of Array.isArray(events) ? events : []) {
      if (!event || event.type !== REASONING_EVENT_TYPES.EVIDENCE_EARNED) continue;
      const skillId = typeof event.skillId === 'string' ? event.skillId : '';
      if (!skillId) continue;
      const releaseId = typeof event.contentReleaseId === 'string' && event.contentReleaseId
        ? event.contentReleaseId
        : REASONING_REWARD_RELEASE_ID;
      rewardEvents.push(
        ...recordReasoningEvidenceMastery({
          learnerId: event.learnerId,
          skillId,
          releaseId,
          masteryKey: event.masteryKey || reasoningMasteryKey({ skillId, releaseId, itemId: event.itemId }),
          createdAt: event.createdAt,
          gameStateRepository,
          random,
        }),
      );
    }
    return rewardEvents;
  };
}

export function rewardEventsFromReasoningEvents(events, options = {}) {
  return createReasoningRewardSubscriber(options)(events);
}
