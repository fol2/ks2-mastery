import { monsterIdForSpellingWord, recordMonsterMastery } from '../../platform/game/monster-system.js';
import { SPELLING_EVENT_TYPES } from './events.js';
import {
  ACHIEVEMENT_DEFINITIONS,
  ACHIEVEMENT_PROGRESS_KEY_PREFIX,
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

/**
 * P2 U12 CRITICAL (u12-adv-01): per-learner scoping.
 *
 * `context.existingEvents` from the event runtime is the DEVICE-WIDE rolling
 * event log (capped at 1000 by local.js:425). Prior to this fix, passing it
 * verbatim into `aggregateAchievementState` meant learner B's evaluator saw
 * learner A's Guardian mission days and fired learner A's 7-day unlock on
 * learner B's very first mission. The fix filters the event log by the
 * active learnerId BEFORE any aggregation / currentAchievements build.
 *
 * The streak subscriber at `src/platform/events/streaks.js:74` follows the
 * same pattern — it calls `eventLog.list(event.learnerId)` to pre-scope the
 * history per learner. We do the equivalent filter inline because this
 * subscriber's context surface is `existingEvents: []`, not a repository
 * handle.
 */
function filterEventsByLearner(events, learnerId) {
  const safeEvents = Array.isArray(events) ? events : [];
  if (!learnerId) return [];
  return safeEvents.filter((evt) => evt?.learnerId === learnerId);
}

/**
 * P2 U12 HIGH (u12-adv-02): authoritative currentAchievements from
 * `data.achievements`.
 *
 * After the 1000-event cap in local.js rolls the original unlock reward.toast
 * off the log, rebuilding `currentAchievements` from the rolling event log
 * means `currentAchievements[id] === undefined` and the next achievement-
 * relevant event re-emits the unlock toast. The durable source of truth is
 * the persisted `data.achievements` sibling (which is sticky + INSERT-OR-
 * IGNORE in the repository). When `context.repositories` is threaded in, we
 * read the per-learner sibling; otherwise we fall back to the event-log
 * reconstruction (tests + fresh hosts without a repo handle).
 */
function readCurrentAchievementsFromRepo(repositories, learnerId) {
  try {
    const record = repositories?.subjectStates?.read?.(learnerId, 'spelling');
    const raw = record?.data?.achievements;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const output = {};
    for (const [id, entry] of Object.entries(raw)) {
      if (typeof id !== 'string' || !id) continue;
      // Progress-key rows (`_progress:*`) are aggregate state, not unlock
      // rows. Exclude them so the evaluator's `currentAchievements[id]`
      // idempotency check cannot mis-fire on a progress key.
      if (id.startsWith(ACHIEVEMENT_PROGRESS_KEY_PREFIX)) continue;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const unlockedAt = Number(entry.unlockedAt);
      output[id] = {
        unlockedAt: Number.isFinite(unlockedAt) && unlockedAt >= 0 ? unlockedAt : 0,
      };
    }
    return output;
  } catch {
    return null;
  }
}

function reconstructCurrentAchievementsFromEvents(events) {
  const output = {};
  const safeEvents = Array.isArray(events) ? events : [];
  for (const prior of safeEvents) {
    if (
      prior?.type === 'reward.toast'
      && prior?.kind === 'reward.achievement'
      && typeof prior.achievementId === 'string'
    ) {
      const unlockedAt = Number(prior.unlockedAt);
      output[prior.achievementId] = {
        unlockedAt: Number.isFinite(unlockedAt) && unlockedAt >= 0 ? unlockedAt : 0,
      };
    }
  }
  return output;
}

/**
 * Per-learner batch processor. Runs the full achievement pipeline over one
 * learner's events with learner-scoped existingEvents + learner-scoped
 * currentAchievements. Called once per distinct learnerId when a batch
 * carries multiple learners.
 */
function processLearnerBatch({
  events,
  learnerId,
  gameStateRepository,
  repositories,
  contextExistingEvents,
}) {
  const rewardEvents = [];

  // CRITICAL u12-adv-01: scope existingEvents to THIS learner only.
  const existingEventsForLearner = filterEventsByLearner(contextExistingEvents, learnerId);

  // Aggregate over prior domain events (learner-scoped) so evaluateAchievements
  // sees the full history. The evaluator for THIS event contributes its own
  // day / slug / completion entry internally.
  const priorAggregate = aggregateAchievementState(existingEventsForLearner);

  // HIGH u12-adv-02: prefer the durable `data.achievements` sibling (survives
  // event-log rotation). Fall back to rebuilding from the learner-scoped
  // event log only when the repo handle is unavailable (test harnesses /
  // fresh boots without a repositories context).
  const repoCurrent = readCurrentAchievementsFromRepo(repositories, learnerId);
  const currentAchievements = repoCurrent !== null
    ? repoCurrent
    : reconstructCurrentAchievementsFromEvents(existingEventsForLearner);

  // Track per-id dedup within THIS batch so replaying the same event inside
  // one publish() call still emits exactly one achievement toast.
  const emittedAchievementIds = new Set();
  let cumulativeAggregate = priorAggregate;

  for (const event of events) {
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
    // (e.g. "Mission complete.") before the achievement toast.
    if (ACHIEVEMENT_RELEVANT_TYPES.has(event.type)) {
      const evtLearnerId = event.learnerId || 'default';
      const result = evaluateAchievements(event, currentAchievements, evtLearnerId, {
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
      cumulativeAggregate = aggregateAchievementState([event], cumulativeAggregate);
    }
  }

  return rewardEvents;
}

export function createSpellingRewardSubscriber({ gameStateRepository } = {}) {
  return function spellingRewardSubscriber(events = [], context = {}) {
    const safeEvents = Array.isArray(events) ? events : [];
    if (safeEvents.length === 0) return [];

    const contextExistingEvents = Array.isArray(context?.existingEvents) ? context.existingEvents : [];
    const repositories = context?.repositories || null;

    // CRITICAL u12-adv-01: group the batch by learnerId and run the
    // achievement pipeline once per learner so one learner's events can
    // never contribute to another learner's aggregate state. Event order
    // within each learner's group is preserved.
    const groups = new Map();
    const order = [];
    for (const evt of safeEvents) {
      if (!evt || typeof evt !== 'object' || Array.isArray(evt)) continue;
      const learnerId = typeof evt.learnerId === 'string' && evt.learnerId ? evt.learnerId : 'default';
      if (!groups.has(learnerId)) {
        groups.set(learnerId, []);
        order.push(learnerId);
      }
      groups.get(learnerId).push(evt);
    }

    const rewardEvents = [];
    for (const learnerId of order) {
      const learnerEvents = groups.get(learnerId) || [];
      rewardEvents.push(...processLearnerBatch({
        events: learnerEvents,
        learnerId,
        gameStateRepository,
        repositories,
        contextExistingEvents,
      }));
    }
    return rewardEvents;
  };
}

export function rewardEventsFromSpellingEvents(events, {
  gameStateRepository,
  // P2 U12 MEDIUM: Worker projection path threads boot-time event history
  // + the repository handle so the subscriber can (a) filter by learnerId
  // and (b) read the durable `data.achievements` sibling. Default empty so
  // the zero-arg callers (tests, fresh hosts) keep working unchanged.
  existingEvents = [],
  repositories = null,
} = {}) {
  return createSpellingRewardSubscriber({ gameStateRepository })(events, {
    existingEvents,
    repositories,
  });
}
