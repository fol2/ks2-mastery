import {
  readingMasteryKey,
  recordReadingSkillMastery,
  READING_REWARD_RELEASE_ID,
} from '../../platform/game/monster-system.js';

export const READING_EVENT_TYPES = Object.freeze({
  ANSWER_SUBMITTED: 'reading.answer-submitted',
  SESSION_STARTED: 'reading.session-started',
  SESSION_COMPLETED: 'reading.session-completed',
  SKILL_SECURED: 'reading.skill-secured',
});

export function createReadingRewardSubscriber({
  gameStateRepository,
  random = Math.random,
} = {}) {
  return function readingRewardSubscriber(events = []) {
    const rewardEvents = [];
    for (const event of Array.isArray(events) ? events : []) {
      if (!event || event.type !== READING_EVENT_TYPES.SKILL_SECURED) continue;
      const skillId = typeof event.skillId === 'string' ? event.skillId : '';
      if (!skillId) continue;
      const releaseId = typeof event.contentReleaseId === 'string' && event.contentReleaseId
        ? event.contentReleaseId
        : READING_REWARD_RELEASE_ID;
      rewardEvents.push(
        ...recordReadingSkillMastery({
          learnerId: event.learnerId,
          skillId,
          releaseId,
          masteryKey: event.masteryKey || readingMasteryKey(skillId, releaseId),
          createdAt: event.createdAt,
          gameStateRepository,
          random,
        }),
      );
    }
    return rewardEvents;
  };
}

export function rewardEventsFromReadingEvents(events, options = {}) {
  return createReadingRewardSubscriber(options)(events);
}
