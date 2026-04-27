import { MONSTERS, stageFor, PUNCTUATION_MASTERED_THRESHOLDS, PUNCTUATION_STAR_THRESHOLDS, PUNCTUATION_GRAND_STAR_THRESHOLDS } from '../monsters.js';
import { PUNCTUATION_CURRENT_RELEASE_ID } from '../../../subjects/punctuation/service-contract.js';
import {
  branchForMonster,
  DEFAULT_SYSTEM_ID,
  ensureMonsterBranches,
  isPlainObject,
  masteredList,
  PUNCTUATION_GRAND_MONSTER_ID,
  PUNCTUATION_MONSTER_IDS,
  PUNCTUATION_RESERVED_MONSTER_IDS,
  releaseIdForEntry,
  saveMonsterState,
  toastBodyFor,
} from './shared.js';

// Pre-flip monster ids that should be unioned into the grand view after the
// Phase 2 roster reduction. When a learner had stored progress under the old
// `carillon` aggregate, those mastery keys must still count toward the new
// `quoral` grand monster without requiring a stored-state rewrite. The
// normaliser is read-only — no entries are deleted or mutated on hydrate.
const PUNCTUATION_PRE_FLIP_GRAND_MONSTER_IDS = Object.freeze(['carillon']);

// Legacy stage-to-Star floor mapping for Punctuation. Uses the star
// thresholds as stage boundaries: stage 0 → 0, stage N → threshold[N].
// This mirrors Grammar's LEGACY_STAGE_STAR_FLOOR but derives from the
// Punctuation-specific PUNCTUATION_STAR_THRESHOLDS so that pre-P6
// learners whose stored state has no starHighWater field get seeded
// to their correct visual floor rather than 0.
const PUNCTUATION_LEGACY_STAGE_STAR_FLOOR = Object.freeze([
  0,
  PUNCTUATION_STAR_THRESHOLDS[1] || 0,
  PUNCTUATION_STAR_THRESHOLDS[2] || 0,
  PUNCTUATION_STAR_THRESHOLDS[3] || 0,
  PUNCTUATION_STAR_THRESHOLDS[4] || 0,
]);

function safeStarHighWater(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n + 1e-9) : 0;
}

function punctuationLegacyStarFloor(stage) {
  const s = Math.max(0, Math.min(4, Math.floor(Number(stage) || 0)));
  return PUNCTUATION_LEGACY_STAGE_STAR_FLOOR[s] || 0;
}

/**
 * Seed the starHighWater value for a Punctuation monster entry during writes.
 *
 * If the entry already has a starHighWater field (post-P6 learner), preserve
 * it via safeStarHighWater. If absent (pre-P6 learner), compute the legacy
 * floor from the count-based stage so that writing starHighWater for the first
 * time does not erase the learner's visual floor. Without this, safeStarHighWater
 * would return 0 for undefined, permanently disabling the legacy floor on
 * subsequent reads.
 */
function seedStarHighWater(entry) {
  if (entry.starHighWater !== undefined && entry.starHighWater !== null) {
    return safeStarHighWater(entry.starHighWater);
  }
  // Pre-P6 learner: seed from legacy floor.
  const mastered = punctuationMasteredCount(entry);
  const legacyStage = stageFor(mastered, PUNCTUATION_MASTERED_THRESHOLDS);
  return punctuationLegacyStarFloor(legacyStage);
}

function punctuationMasteredList(entry, releaseId = null) {
  const mastered = masteredList(entry);
  const scopedReleaseId = releaseIdForEntry(entry, releaseId);
  if (!scopedReleaseId) return mastered;
  const releasePrefix = `punctuation:${scopedReleaseId}:`;
  return mastered.filter((key) => key.startsWith(releasePrefix));
}

function punctuationMasteredCount(entry, releaseId = null) {
  const mastered = masteredList(entry);
  if (mastered.length) return punctuationMasteredList(entry, releaseId).length;
  const count = Number(entry?.masteredCount);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

// Grand aggregate must always read the release denominator even when the
// stored `publishedTotal` lags (e.g. a learner whose only pre-flip Quoral
// evidence was the single Speech-core key has publishedTotal: 1 persisted).
// The caller supplies the authoritative fallback via `fallback`; we prefer
// that fallback for the grand monster regardless of stored publishedTotal.
function punctuationTotal(entry, fallback = 1, { monsterId = null } = {}) {
  const fallbackTotal = Math.max(1, Number(fallback) || 1);
  if (monsterId === PUNCTUATION_GRAND_MONSTER_ID) return fallbackTotal;
  const count = Number(entry?.publishedTotal);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : fallbackTotal;
}

// Read-time normaliser for Punctuation monster state. Produces a view that
// rolls pre-flip grand evidence (carillon.mastered) into the new grand
// creature (quoral.mastered) for display purposes only. Stored state is
// untouched — running this N times returns equivalent views and never
// mutates `state` or its nested arrays. Reserved monster entries stay
// visible to Admin tooling that reads raw state directly; the helper
// exposes them under a `reserved` map so active surfaces can ignore them.
export function normalisePunctuationMonsterState(state = {}) {
  const source = isPlainObject(state) ? state : {};
  const view = { ...source };

  // Union pre-flip grand evidence into the current grand monster's view
  // without losing the stored pre-flip entry. The union dedupes by mastery
  // key so a learner who already has the same key on both ends does not
  // double-count.
  if (PUNCTUATION_PRE_FLIP_GRAND_MONSTER_IDS.length) {
    const currentGrandEntry = isPlainObject(source[PUNCTUATION_GRAND_MONSTER_ID])
      ? source[PUNCTUATION_GRAND_MONSTER_ID]
      : { mastered: [], caught: false };
    const currentGrandMastered = masteredList(currentGrandEntry);
    const combined = new Set(currentGrandMastered);
    let caughtFromPreFlip = false;
    for (const legacyId of PUNCTUATION_PRE_FLIP_GRAND_MONSTER_IDS) {
      const legacyEntry = source[legacyId];
      if (!isPlainObject(legacyEntry)) continue;
      if (legacyEntry.caught) caughtFromPreFlip = true;
      for (const key of masteredList(legacyEntry)) {
        // Skip malformed keys rather than throwing; the scheduler will log
        // a telemetry warning when it encounters them downstream.
        if (typeof key === 'string' && key.length > 0) combined.add(key);
      }
    }
    // Only layer the union when at least one pre-flip key actually contributes.
    // Otherwise keep the stored currentGrandEntry untouched so tests that
    // assert identity on a post-flip-only learner still pass.
    if (combined.size > currentGrandMastered.length || caughtFromPreFlip) {
      view[PUNCTUATION_GRAND_MONSTER_ID] = {
        ...currentGrandEntry,
        caught: currentGrandEntry.caught === true || caughtFromPreFlip,
        mastered: Array.from(combined),
      };
    }
  }

  return view;
}

// Expose the reserved view for Admin tooling. Returns a plain object of
// reserved monster ids -> stored entries (or nulls). Active surfaces never
// need this.
export function reservedPunctuationMonsterEntries(state = {}) {
  const source = isPlainObject(state) ? state : {};
  const reserved = {};
  for (const id of PUNCTUATION_RESERVED_MONSTER_IDS) {
    reserved[id] = isPlainObject(source[id]) ? source[id] : null;
  }
  return reserved;
}

export function activePunctuationMonsterSummaryFromState(state = {}) {
  return punctuationMonsterSummaryFromState(state)
    .filter((entry) => entry.progress.caught || entry.progress.mastered > 0);
}

export function progressForPunctuationMonster(state, monsterId, { publishedTotal = null, releaseId = PUNCTUATION_CURRENT_RELEASE_ID } = {}) {
  // Run every progress read through the normaliser so pre-flip grand
  // evidence (carillon.mastered) contributes to the new grand view
  // without requiring a stored-state rewrite.
  const normalised = normalisePunctuationMonsterState(state);
  const entry = isPlainObject(normalised?.[monsterId]) ? normalised[monsterId] : { mastered: [], caught: false };
  const mastered = punctuationMasteredCount(entry, releaseId);
  const fallback = publishedTotal || MONSTERS[monsterId]?.masteredMax || 1;
  const total = punctuationTotal(entry, fallback, { monsterId });

  // Persisted high-water mark. Corrupted values (NaN, negative) → 0.
  const rawHW = Number(entry.starHighWater);
  const persistedHW = Number.isFinite(rawHW) && rawHW > 0 ? Math.floor(rawHW + 1e-9) : 0;

  return {
    mastered,
    publishedTotal: total,
    stage: stageFor(mastered, PUNCTUATION_MASTERED_THRESHOLDS),
    level: Math.min(10, Math.round((mastered / Math.max(1, total)) * 10)),
    caught: mastered >= 1,
    branch: branchForMonster(normalised, monsterId),
    masteredList: punctuationMasteredList(entry, releaseId),
    starHighWater: persistedHW,
    // Star-derived stage from the monotonic starHighWater latch.
    // Used by punctuationEventFromTransition to align toast events
    // with the Star surface so a child never sees a toast that
    // contradicts the Star-derived stage.
    // Quoral (grand monster) uses GRAND thresholds [1,10,25,50,100]
    // while direct monsters use STAR thresholds [1,10,30,60,100].
    starStage: stageFor(
      persistedHW,
      monsterId === PUNCTUATION_GRAND_MONSTER_ID
        ? PUNCTUATION_GRAND_STAR_THRESHOLDS
        : PUNCTUATION_STAR_THRESHOLDS,
    ),
  };
}

function buildPunctuationEvent({
  learnerId,
  kind,
  monsterId,
  previous,
  next,
  releaseId,
  clusterId,
  rewardUnitId,
  masteryKey,
  createdAt = Date.now(),
} = {}) {
  const monster = MONSTERS[monsterId];
  return {
    id: `reward.monster:${learnerId || 'default'}:punctuation:${releaseId}:${clusterId}:${rewardUnitId}:${monsterId}:${kind}`,
    type: 'reward.monster',
    kind,
    learnerId,
    subjectId: 'punctuation',
    systemId: DEFAULT_SYSTEM_ID,
    releaseId,
    clusterId,
    rewardUnitId,
    masteryKey,
    monsterId,
    monster,
    previous,
    next,
    createdAt,
    toast: {
      title: monster?.name || 'Reward update',
      body: toastBodyFor(kind),
    },
  };
}

function punctuationEventFromTransition(payload, previous, next) {
  // Effective stage = max(mastered-stage, star-stage) so that a learner
  // whose Stars have advanced beyond the count-based stage does not see a
  // contradictory evolve/mega toast.  Pre-Star learners (starStage absent
  // or 0) fall back to the mastered stage naturally.
  const prevEffective = Math.max(previous.stage, previous.starStage || 0);
  const nextEffective = Math.max(next.stage, next.starStage || 0);

  if (!previous.caught && next.caught) {
    return buildPunctuationEvent({ ...payload, kind: 'caught', previous, next });
  }
  if (nextEffective > prevEffective) {
    return buildPunctuationEvent({ ...payload, kind: nextEffective === 4 ? 'mega' : 'evolve', previous, next });
  }
  if (next.level > previous.level) {
    return buildPunctuationEvent({ ...payload, kind: 'levelup', previous, next });
  }
  return null;
}

export function recordPunctuationRewardUnitMastery({
  learnerId,
  releaseId,
  clusterId,
  rewardUnitId,
  masteryKey,
  monsterId,
  publishedTotal = 1,
  aggregateMonsterId = PUNCTUATION_GRAND_MONSTER_ID,
  aggregatePublishedTotal = 1,
  createdAt = Date.now(),
  gameStateRepository,
  random = Math.random,
} = {}) {
  if (!MONSTERS[monsterId] || !masteryKey) return [];
  const scopedReleaseId = typeof releaseId === 'string' && releaseId ? releaseId : PUNCTUATION_CURRENT_RELEASE_ID;
  const expectedMasteryKey = `punctuation:${scopedReleaseId}:${clusterId}:${rewardUnitId}`;
  if (masteryKey !== expectedMasteryKey) return [];
  const before = ensureMonsterBranches(learnerId, gameStateRepository, {
    random,
    monsterIds: PUNCTUATION_MONSTER_IDS,
  });
  const directEntry = isPlainObject(before[monsterId]) ? before[monsterId] : { mastered: [], caught: false };
  const directMastered = masteredList(directEntry);
  if (directMastered.includes(masteryKey)) return [];

  const aggregateEntry = isPlainObject(before[aggregateMonsterId]) ? before[aggregateMonsterId] : { mastered: [], caught: false };
  const aggregateMastered = masteredList(aggregateEntry);
  const beforeDirect = progressForPunctuationMonster(before, monsterId, { publishedTotal, releaseId: scopedReleaseId });
  const beforeAggregate = progressForPunctuationMonster(before, aggregateMonsterId, { publishedTotal: aggregatePublishedTotal, releaseId: scopedReleaseId });

  // Ratchet starHighWater: preserve the existing high-water mark on each
  // monster entry. For pre-P6 learners (no starHighWater field), seed the
  // value from the legacy floor so that writing it for the first time does
  // not erase the learner's visual stage. The actual Star computation
  // happens on the client read path; the reward layer only preserves the
  // latch field so it survives round-trips.
  const directHW = seedStarHighWater(directEntry);
  const aggregateHW = seedStarHighWater(aggregateEntry);

  const after = {
    ...before,
    [monsterId]: {
      ...directEntry,
      caught: true,
      releaseId: scopedReleaseId,
      publishedTotal,
      mastered: [...directMastered, masteryKey],
      starHighWater: directHW,
    },
    [aggregateMonsterId]: {
      ...aggregateEntry,
      caught: true,
      releaseId: scopedReleaseId,
      publishedTotal: aggregatePublishedTotal,
      mastered: aggregateMastered.includes(masteryKey)
        ? aggregateMastered
        : [...aggregateMastered, masteryKey],
      starHighWater: aggregateHW,
    },
  };

  const afterDirect = progressForPunctuationMonster(after, monsterId, { publishedTotal, releaseId: scopedReleaseId });
  const afterAggregate = progressForPunctuationMonster(after, aggregateMonsterId, { publishedTotal: aggregatePublishedTotal, releaseId: scopedReleaseId });

  // Persist maxStageEver: the high-water mark stage for each monster entry.
  // This survives even if the mastered count later decreases (defensive).
  after[monsterId] = {
    ...after[monsterId],
    maxStageEver: Math.max(afterDirect.stage, directEntry.maxStageEver || 0),
  };
  after[aggregateMonsterId] = {
    ...after[aggregateMonsterId],
    maxStageEver: Math.max(afterAggregate.stage, aggregateEntry.maxStageEver || 0),
  };

  saveMonsterState(learnerId, after, gameStateRepository);

  const events = [];
  const directEvent = punctuationEventFromTransition({
    learnerId,
    monsterId,
    releaseId: scopedReleaseId,
    clusterId,
    rewardUnitId,
    masteryKey,
    createdAt,
  }, beforeDirect, afterDirect);
  if (directEvent) events.push(directEvent);

  const aggregateEvent = punctuationEventFromTransition({
    learnerId,
    monsterId: aggregateMonsterId,
    releaseId: scopedReleaseId,
    clusterId: 'published_release',
    rewardUnitId,
    masteryKey,
    createdAt,
  }, beforeAggregate, afterAggregate);
  if (aggregateEvent) events.push(aggregateEvent);

  return events;
}

export function punctuationMonsterSummaryFromState(state = {}, { clusterTotals = {}, aggregateTotal = 1, releaseId = PUNCTUATION_CURRENT_RELEASE_ID } = {}) {
  return PUNCTUATION_MONSTER_IDS.map((monsterId) => ({
    subjectId: 'punctuation',
    monster: MONSTERS[monsterId],
    progress: progressForPunctuationMonster(state, monsterId, {
      publishedTotal: monsterId === PUNCTUATION_GRAND_MONSTER_ID
        ? aggregateTotal
        : (clusterTotals[monsterId] || MONSTERS[monsterId]?.masteredMax || 1),
      releaseId,
    }),
  }));
}
