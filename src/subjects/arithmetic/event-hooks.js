import {
  arithmeticMasteryKey,
  recordArithmeticRewardUnitMastery,
  ARITHMETIC_REWARD_RELEASE_ID,
} from '../../platform/game/monster-system.js';

export const ARITHMETIC_EVENT_TYPES = Object.freeze({
  ANSWER_SUBMITTED: 'arithmetic.answer-submitted',
  SESSION_STARTED: 'arithmetic.session-started',
  SESSION_COMPLETED: 'arithmetic.session-completed',
  REWARD_UNIT_SECURED: 'arithmetic.reward-unit-secured',
});

export function createArithmeticRewardSubscriber({ gameStateRepository, random = Math.random } = {}) {
  return function arithmeticRewardSubscriber(events = []) {
    const rewardEvents = [];
    for (const event of Array.isArray(events) ? events : []) {
      if (!event || event.type !== ARITHMETIC_EVENT_TYPES.REWARD_UNIT_SECURED) continue;
      const rewardUnitId = typeof event.rewardUnitId === 'string' ? event.rewardUnitId : '';
      if (!rewardUnitId) continue;
      const releaseId = typeof event.contentReleaseId === 'string' && event.contentReleaseId ? event.contentReleaseId : ARITHMETIC_REWARD_RELEASE_ID;
      rewardEvents.push(
        ...recordArithmeticRewardUnitMastery({
          learnerId: event.learnerId,
          rewardUnitId,
          releaseId,
          masteryKey: event.masteryKey || arithmeticMasteryKey(rewardUnitId, releaseId),
          createdAt: event.createdAt,
          gameStateRepository,
          random,
        }),
      );
    }
    return rewardEvents;
  };
}

export function rewardEventsFromArithmeticEvents(events, options = {}) {
  return createArithmeticRewardSubscriber(options)(events);
}
