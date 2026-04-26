import { monsterIdForSpellingWord, recordMonsterMastery } from '../../platform/game/monster-system.js';
import { SPELLING_EVENT_TYPES } from './events.js';

// Day arithmetic mirrors shared/spelling/service.js. The subscriber derives a
// friendly "next check in N days" body from the event's createdAt + nextDueDay
// without needing a clock — createdAt is the event's own authoritative "today".
const DAY_MS = 24 * 60 * 60 * 1000;

// Toast reward event type. New for U11 — distinct from the pre-existing
// 'reward.monster' shape emitted by recordMonsterMastery so downstream
// consumers can route toast-only events without triggering monster projection.
const REWARD_TOAST_TYPE = 'reward.toast';

function toastEvent({ kind, sourceEvent, title, body }) {
  const learnerId = sourceEvent.learnerId || 'default';
  const sessionId = sourceEvent.sessionId || 'session';
  // Deterministic id mirrors the source event's id so replaying a domain event
  // produces the same toast id (dedupe at the event-log layer). The per-word
  // `wordSlug` fallback keeps renewed/recovered toasts unique within a mission.
  const idParts = [
    'reward.toast',
    kind,
    learnerId,
    sessionId,
    sourceEvent.wordSlug || sourceEvent.id || 'event',
  ];
  return {
    id: idParts.join(':'),
    type: REWARD_TOAST_TYPE,
    kind,
    subjectId: 'spelling',
    learnerId,
    sessionId,
    sourceEventId: sourceEvent.id || null,
    createdAt: Number.isFinite(sourceEvent.createdAt) ? sourceEvent.createdAt : Date.now(),
    toast: { title, body },
  };
}

function renewedToast(event) {
  const word = typeof event.word === 'string' && event.word ? event.word : null;
  const nextDueDay = Number.isInteger(event.nextDueDay) ? event.nextDueDay : null;
  const createdAtMs = Number.isFinite(event.createdAt) ? event.createdAt : null;
  const todayDay = createdAtMs !== null ? Math.floor(createdAtMs / DAY_MS) : null;
  const daysUntilNextCheck = (nextDueDay !== null && todayDay !== null)
    ? Math.max(0, nextDueDay - todayDay)
    : null;

  const canInterpolate = word && Number.isInteger(daysUntilNextCheck);
  const body = canInterpolate
    ? `"${word}" held steady — next check in ${daysUntilNextCheck} ${daysUntilNextCheck === 1 ? 'day' : 'days'}.`
    : 'Held steady. Next check scheduled.';

  return toastEvent({
    kind: 'guardian.renewed',
    sourceEvent: event,
    title: 'Word renewed.',
    body,
  });
}

function recoveredToast(event) {
  const word = typeof event.word === 'string' && event.word ? event.word : null;
  const body = word
    ? `"${word}" is wobble-free again.`
    : 'Wobbling word recovered.';
  return toastEvent({
    kind: 'guardian.recovered',
    sourceEvent: event,
    title: 'Back on guard.',
    body,
  });
}

function missionCompletedToast(event) {
  const renewed = Number.isInteger(event.renewalCount) ? event.renewalCount : 0;
  const recovered = Number.isInteger(event.recoveredCount) ? event.recoveredCount : 0;
  // Wobbled count is intentionally NOT mentioned — MVP copy is positive-only.
  const body = (renewed === 0 && recovered === 0)
    ? 'Guardian round finished.'
    : `${renewed} renewed, ${recovered} recovered.`;
  return toastEvent({
    kind: 'guardian.mission-completed',
    sourceEvent: event,
    title: 'Mission complete.',
    body,
  });
}

function bossCompletedToast(event) {
  const correct = Number.isInteger(event.correct) ? event.correct : 0;
  const length = Number.isInteger(event.length) ? event.length : correct;
  const body = `${correct} of ${length} Mega words landed.`;
  return toastEvent({
    kind: 'boss.completed',
    sourceEvent: event,
    title: 'Boss round complete.',
    body,
  });
}

export function createSpellingRewardSubscriber({ gameStateRepository } = {}) {
  return function spellingRewardSubscriber(events = []) {
    const rewardEvents = [];

    for (const event of Array.isArray(events) ? events : []) {
      if (!event || typeof event.type !== 'string') continue;

      // Legacy branch — unchanged. WORD_SECURED drives monster evolution and
      // writes to the game-state repository. U11 additions below are additive
      // and never touch this path.
      if (event.type === SPELLING_EVENT_TYPES.WORD_SECURED) {
        rewardEvents.push(
          ...recordMonsterMastery(
            event.learnerId,
            monsterIdForSpellingWord(event),
            event.wordSlug,
            gameStateRepository,
          ),
        );
        continue;
      }

      // U11 — Guardian + Boss toast branches. Positive-only: wobbled is
      // intentionally omitted. Each branch emits exactly one reward.toast
      // event and never invokes the game-state repository (no monster
      // projection, no persistent badge, no streak tracking).
      if (event.type === SPELLING_EVENT_TYPES.GUARDIAN_RENEWED) {
        rewardEvents.push(renewedToast(event));
        continue;
      }
      if (event.type === SPELLING_EVENT_TYPES.GUARDIAN_RECOVERED) {
        rewardEvents.push(recoveredToast(event));
        continue;
      }
      if (event.type === SPELLING_EVENT_TYPES.GUARDIAN_MISSION_COMPLETED) {
        rewardEvents.push(missionCompletedToast(event));
        continue;
      }
      if (event.type === SPELLING_EVENT_TYPES.BOSS_COMPLETED) {
        rewardEvents.push(bossCompletedToast(event));
        continue;
      }

      // GUARDIAN_WOBBLED, SESSION_COMPLETED, MASTERY_MILESTONE, RETRY_CLEARED,
      // and any unknown event types fall through silently — preserves the
      // pre-U11 behaviour where non-WORD_SECURED events were ignored.
    }

    return rewardEvents;
  };
}

export function rewardEventsFromSpellingEvents(events, { gameStateRepository } = {}) {
  return createSpellingRewardSubscriber({ gameStateRepository })(events);
}
