import { monsterIdForSpellingWord, recordMonsterMastery } from '../../platform/game/monster-system.js';
import { SPELLING_EVENT_TYPES } from './events.js';
import {
  ACHIEVEMENT_DEFINITIONS,
  aggregateAchievementState,
  evaluateAchievements,
} from './achievements.js';

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

// U11 Fix 6: Pattern Quest completion toast. Positive-only copy, mirrors
// Boss's shape exactly: `N of 5 ... landed`. `event.patternTitle` is
// provided when the quest-completed event carries the readable pattern
// title; we fall back to the raw patternId for robustness.
function patternQuestCompletedToast(event) {
  const correct = Number.isInteger(event.correctCount) ? event.correctCount : 0;
  const patternLabel = typeof event.patternTitle === 'string' && event.patternTitle
    ? event.patternTitle
    : (typeof event.patternId === 'string' && event.patternId ? event.patternId : 'pattern');
  const body = `Pattern Quest: ${correct}/5 on ${patternLabel}.`;
  return toastEvent({
    kind: 'pattern-quest.completed',
    sourceEvent: event,
    title: 'Quest complete.',
    body,
  });
}

/**
 * P2 U12: Achievement unlock toast. Carries the achievementId so the event-log's
 * `seenTokens` dedup (platform/events/runtime.js) drops a second identical toast
 * regardless of the source domain event id. The `kind: 'reward.achievement'`
 * routes the ToastShelf renderer to the distinct-styling branch without adding
 * a new live region (F3 adversarial: nesting role="status" is UB).
 *
 * Deterministic toast id: `reward.toast:reward.achievement:<achievementId>` —
 * derived from the achievement id, NOT the source event, so local-dispatch +
 * remote-sync echoes of the same domain event produce the exact same toast id
 * and the eventRuntime dedup drops the duplicate.
 */
function achievementUnlockedToast(unlock, sourceEvent) {
  const def = ACHIEVEMENT_DEFINITIONS[unlock.achievementKey];
  const title = def?.title || 'Achievement unlocked';
  const body = def?.body || '';
  const learnerId = sourceEvent.learnerId || 'default';
  const sessionId = sourceEvent.sessionId || 'session';
  const createdAt = Number.isFinite(sourceEvent.createdAt) ? sourceEvent.createdAt : Date.now();
  return {
    id: `reward.toast:reward.achievement:${unlock.id}`,
    type: 'reward.toast',
    kind: 'reward.achievement',
    achievementId: unlock.id,
    achievementKey: unlock.achievementKey,
    subjectId: 'spelling',
    learnerId,
    sessionId,
    sourceEventId: sourceEvent.id || null,
    createdAt,
    toast: { title, body: `Achievement unlocked: ${title}` },
    // Metadata for future consumers (parent/admin audit views); UI ignores.
    unlockedAt: Number.isFinite(unlock.unlockedAt) ? unlock.unlockedAt : createdAt,
  };
}

// P2 U12: achievement-relevant event types. We only call evaluateAchievements
// for these to avoid doing aggregate walks on every WORD_SECURED event. Kept
// as a frozen set so a future achievement-type addition is a single line.
const ACHIEVEMENT_RELEVANT_TYPES = new Set([
  SPELLING_EVENT_TYPES.GUARDIAN_MISSION_COMPLETED,
  SPELLING_EVENT_TYPES.GUARDIAN_RECOVERED,
  SPELLING_EVENT_TYPES.BOSS_COMPLETED,
  SPELLING_EVENT_TYPES.PATTERN_QUEST_COMPLETED,
]);

export function createSpellingRewardSubscriber({ gameStateRepository } = {}) {
  return function spellingRewardSubscriber(events = [], context = {}) {
    const rewardEvents = [];
    const safeEvents = Array.isArray(events) ? events : [];

    // P2 U12: Build the aggregate achievement state by walking the event log
    // (when available) PLUS the current incoming batch. The event runtime
    // (platform/events/runtime.js) passes { existingEvents } into the
    // subscriber so boot-time event history is visible; without it we still
    // work correctly from in-batch events (tests + fresh hosts).
    //
    // `currentAchievements` is derived by walking unlock reaction events we
    // previously emitted — the subscriber is stateless, so the event log is
    // our source of truth for "have we already unlocked this id".
    const existingEvents = Array.isArray(context?.existingEvents) ? context.existingEvents : [];

    // Aggregate over prior domain events so evaluateAchievements sees the full
    // history. The evaluator for THIS event contributes its own day / slug /
    // completion entry internally (so it works even if the same event is also
    // inside priorAggregate — idempotent set.add).
    const priorAggregate = aggregateAchievementState(existingEvents);

    // Walk prior reaction events for already-emitted achievement toasts so the
    // evaluator's caller-side idempotency check (`currentAchievements[id]`)
    // prevents re-unlocking.
    const currentAchievements = {};
    for (const prior of existingEvents) {
      if (
        prior?.type === 'reward.toast'
        && prior?.kind === 'reward.achievement'
        && typeof prior.achievementId === 'string'
      ) {
        const unlockedAt = Number(prior.unlockedAt);
        currentAchievements[prior.achievementId] = {
          unlockedAt: Number.isFinite(unlockedAt) && unlockedAt >= 0 ? unlockedAt : 0,
        };
      }
    }

    // Track per-id dedup within THIS batch so replaying the same event inside
    // one publish() call still emits exactly one achievement toast.
    const emittedAchievementIds = new Set();
    // Cumulative aggregate that grows as we walk the batch; the evaluator
    // always works on `cumulativeAggregate + THIS event` via the evaluator's
    // internal set.add.
    let cumulativeAggregate = priorAggregate;

    for (const event of safeEvents) {
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

      // U11 — Guardian + Boss + Pattern Quest toast branches. Positive-only:
      // wobbled is intentionally omitted. Each branch emits exactly one
      // reward.toast event and never invokes the game-state repository
      // (no monster projection, no persistent badge, no streak tracking).
      // Fix 6: the Pattern Quest branch was missing in the initial U11 ship —
      // quest-completed events fell through to the silent-default and no
      // toast ever surfaced at round-end.
      if (event.type === SPELLING_EVENT_TYPES.GUARDIAN_RENEWED) {
        rewardEvents.push(renewedToast(event));
      } else if (event.type === SPELLING_EVENT_TYPES.GUARDIAN_RECOVERED) {
        rewardEvents.push(recoveredToast(event));
      } else if (event.type === SPELLING_EVENT_TYPES.GUARDIAN_MISSION_COMPLETED) {
        rewardEvents.push(missionCompletedToast(event));
      } else if (event.type === SPELLING_EVENT_TYPES.BOSS_COMPLETED) {
        rewardEvents.push(bossCompletedToast(event));
      } else if (event.type === SPELLING_EVENT_TYPES.PATTERN_QUEST_COMPLETED) {
        rewardEvents.push(patternQuestCompletedToast(event));
      }

      // P2 U12: achievement evaluation side-branch. Runs AFTER the toast
      // fan-out so a completed round always surfaces its own completion toast
      // (e.g. "Mission complete.") before the achievement toast. The evaluator
      // is pure; we add the event's contribution into cumulativeAggregate
      // afterwards so the NEXT event in the same batch sees updated state.
      if (ACHIEVEMENT_RELEVANT_TYPES.has(event.type)) {
        const learnerId = event.learnerId || 'default';
        const result = evaluateAchievements(event, currentAchievements, learnerId, {
          aggregateState: cumulativeAggregate,
        });
        for (const unlock of result.unlocks || []) {
          if (!unlock || typeof unlock.id !== 'string') continue;
          if (emittedAchievementIds.has(unlock.id)) continue;
          if (currentAchievements[unlock.id]) continue;
          emittedAchievementIds.add(unlock.id);
          currentAchievements[unlock.id] = {
            unlockedAt: Number.isFinite(unlock.unlockedAt) ? unlock.unlockedAt : 0,
          };
          rewardEvents.push(achievementUnlockedToast(unlock, event));
        }
        // Accumulate this event's contribution AFTER evaluation so a future
        // same-kind event in the batch sees its contribution. We pass the
        // array `[event]` so aggregateAchievementState folds in one entry.
        cumulativeAggregate = aggregateAchievementState([event], cumulativeAggregate);
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
