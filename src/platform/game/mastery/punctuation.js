import { MONSTERS } from '../monsters.js';
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

function punctuationStageFor(mastered, total) {
  const denominator = Math.max(1, Number(total) || 1);
  const ratio = Math.max(0, Math.min(1, (Number(mastered) || 0) / denominator));
  if (ratio >= 1) return 4;
  if (ratio >= 2 / 3) return 3;
  if (ratio >= 1 / 3) return 2;
  if (ratio > 0) return 1;
  return 0;
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
  return {
    mastered,
    publishedTotal: total,
    stage: punctuationStageFor(mastered, total),
    level: Math.min(10, Math.round((mastered / Math.max(1, total)) * 10)),
    caught: mastered >= 1,
    branch: branchForMonster(normalised, monsterId),
    masteredList: punctuationMasteredList(entry, releaseId),
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
  if (!previous.caught && next.caught) {
    return buildPunctuationEvent({ ...payload, kind: 'caught', previous, next });
  }
  if (next.stage > previous.stage) {
    return buildPunctuationEvent({ ...payload, kind: next.stage === 4 ? 'mega' : 'evolve', previous, next });
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

  const after = {
    ...before,
    [monsterId]: {
      ...directEntry,
      caught: true,
      releaseId: scopedReleaseId,
      publishedTotal,
      mastered: [...directMastered, masteryKey],
    },
    [aggregateMonsterId]: {
      ...aggregateEntry,
      caught: true,
      releaseId: scopedReleaseId,
      publishedTotal: aggregatePublishedTotal,
      mastered: aggregateMastered.includes(masteryKey)
        ? aggregateMastered
        : [...aggregateMastered, masteryKey],
    },
  };

  const afterDirect = progressForPunctuationMonster(after, monsterId, { publishedTotal, releaseId: scopedReleaseId });
  const afterAggregate = progressForPunctuationMonster(after, aggregateMonsterId, { publishedTotal: aggregatePublishedTotal, releaseId: scopedReleaseId });
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
