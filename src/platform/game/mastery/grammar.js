import { MONSTERS } from '../monsters.js';
import {
  branchForMonster,
  DEFAULT_SYSTEM_ID,
  ensureMonsterBranches,
  GRAMMAR_GRAND_MONSTER_ID,
  GRAMMAR_MONSTER_IDS,
  GRAMMAR_RESERVED_MONSTER_IDS,
  isPlainObject,
  masteredList,
  releaseIdForEntry,
  saveMonsterState,
  toastBodyFor,
} from './shared.js';
import {
  GRAMMAR_MONSTER_STAR_MAX,
  applyStarHighWaterLatch,
  computeGrammarMonsterStars,
  deriveGrammarConceptStarEvidence,
  grammarStarDisplayStage,
  grammarStarStageFor,
  grammarStarStageName,
  legacyStarFloorFromStage,
} from './grammar-stars.js';
import {
  GRAMMAR_MONSTER_CONCEPTS,
  GRAMMAR_AGGREGATE_CONCEPTS,
  GRAMMAR_CONCEPT_TO_MONSTER,
} from '../../../../shared/grammar/grammar-concept-roster.js';
export { GRAMMAR_MONSTER_CONCEPTS, GRAMMAR_AGGREGATE_CONCEPTS, GRAMMAR_CONCEPT_TO_MONSTER };

export const GRAMMAR_REWARD_RELEASE_ID = 'grammar-legacy-reviewed-2026-04-24';

function grammarTotal(entry, fallback = 1) {
  const count = Number(entry?.conceptTotal);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : Math.max(1, Number(fallback) || 1);
}

function grammarStageFor(mastered, total) {
  const denominator = Math.max(1, Number(total) || 1);
  const ratio = Math.max(0, Math.min(1, (Number(mastered) || 0) / denominator));
  if (ratio >= 1) return 4;
  if (ratio >= 0.75) return 3;
  if (ratio >= 0.5) return 2;
  if (ratio > 0) return 1;
  return 0;
}

function safeStarHighWater(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Seed the starHighWater value for a monster entry during writes.
 *
 * If the entry already has a starHighWater field (post-P5 learner), preserve
 * it via safeStarHighWater. If absent (pre-P5 learner), compute the legacy
 * floor from the ratio-based stage so that writing starHighWater for the first
 * time does not erase the learner's visual floor. Without this, safeStarHighWater
 * would return 0 for undefined, permanently disabling the legacy floor on
 * subsequent reads.
 */
function seedStarHighWater(entry, total) {
  if (entry.starHighWater !== undefined && entry.starHighWater !== null) {
    return safeStarHighWater(entry.starHighWater);
  }
  // Pre-P5 learner: seed from legacy floor.
  const mastered = grammarMasteredCount(entry);
  const legacyStage = grammarStageFor(mastered, total);
  return legacyStarFloorFromStage(legacyStage);
}

function grammarMonsterConceptTotal(monsterId) {
  if (monsterId === GRAMMAR_GRAND_MONSTER_ID) return GRAMMAR_AGGREGATE_CONCEPTS.length;
  return GRAMMAR_MONSTER_CONCEPTS[monsterId]?.length || MONSTERS[monsterId]?.masteredMax || 1;
}

export function monsterIdForGrammarConcept(conceptId) {
  return GRAMMAR_CONCEPT_TO_MONSTER[conceptId] || null;
}

export function grammarMasteryKey(conceptId, releaseId = GRAMMAR_REWARD_RELEASE_ID) {
  return `grammar:${releaseId}:${conceptId}`;
}

export function grammarConceptIdFromMasteryKey(key, releaseId = GRAMMAR_REWARD_RELEASE_ID) {
  if (typeof key !== 'string' || !key) return '';
  const prefix = `grammar:${releaseId}:`;
  if (key.startsWith(prefix)) return key.slice(prefix.length);
  return '';
}

// Phase 3 U0 read-time normaliser. Unions mastery keys stored under the
// retired direct ids (Glossbloom / Loomrill / Mirrane) into Concordium's
// aggregate view for display purposes only. Retired entries remain
// untouched in the returned object so Admin tooling and asset pipelines
// that read raw state still resolve them. Dedupe happens by concept id
// (via `grammarConceptIdFromMasteryKey`) rather than raw string equality,
// so retired entries carrying a different `releaseId` than the post-flip
// Concordium entry still collapse to one concept slot.
export function normaliseGrammarRewardState(rawState = {}, releaseId = GRAMMAR_REWARD_RELEASE_ID) {
  const source = isPlainObject(rawState) ? rawState : {};
  if (!GRAMMAR_RESERVED_MONSTER_IDS.length) return source;

  const currentGrandEntry = isPlainObject(source[GRAMMAR_GRAND_MONSTER_ID])
    ? source[GRAMMAR_GRAND_MONSTER_ID]
    : { mastered: [], caught: false };
  const grandScopedReleaseId = releaseIdForEntry(currentGrandEntry, releaseId) || releaseId;
  const grandMasteredKeys = masteredList(currentGrandEntry);
  const conceptToKey = new Map();
  for (const key of grandMasteredKeys) {
    const conceptId = grammarConceptIdFromMasteryKey(key, grandScopedReleaseId);
    if (!conceptId || conceptToKey.has(conceptId)) continue;
    conceptToKey.set(conceptId, key);
  }

  let addedFromRetired = false;
  let caughtFromRetired = false;
  for (const retiredId of GRAMMAR_RESERVED_MONSTER_IDS) {
    const retiredEntry = source[retiredId];
    if (!isPlainObject(retiredEntry)) continue;
    if (retiredEntry.caught === true) caughtFromRetired = true;
    const retiredScopedReleaseId = releaseIdForEntry(retiredEntry, releaseId) || releaseId;
    for (const retiredKey of masteredList(retiredEntry)) {
      const conceptId = grammarConceptIdFromMasteryKey(retiredKey, retiredScopedReleaseId);
      if (!conceptId || conceptToKey.has(conceptId)) continue;
      // Prefer the post-flip release mastery key so the aggregate view stays
      // consistent with freshly recorded concepts. Fall back to the retired
      // key only when the release cannot be normalised.
      const preferredKey = grammarMasteryKey(conceptId, releaseId);
      conceptToKey.set(conceptId, preferredKey);
      addedFromRetired = true;
    }
  }

  if (!addedFromRetired && !caughtFromRetired) return source;

  const unionedMastered = Array.from(conceptToKey.values());
  return {
    ...source,
    [GRAMMAR_GRAND_MONSTER_ID]: {
      ...currentGrandEntry,
      caught: currentGrandEntry.caught === true || caughtFromRetired || addedFromRetired,
      mastered: unionedMastered,
    },
  };
}

function grammarMasteredList(entry, releaseId = GRAMMAR_REWARD_RELEASE_ID) {
  const scopedReleaseId = releaseIdForEntry(entry, releaseId) || GRAMMAR_REWARD_RELEASE_ID;
  const conceptIds = new Set();
  const keys = [];
  for (const key of masteredList(entry)) {
    const conceptId = grammarConceptIdFromMasteryKey(key, scopedReleaseId);
    if (!conceptId || conceptIds.has(conceptId)) continue;
    conceptIds.add(conceptId);
    keys.push(key);
  }
  return keys;
}

function grammarMasteredCount(entry, releaseId = GRAMMAR_REWARD_RELEASE_ID) {
  const mastered = masteredList(entry);
  if (mastered.length) return grammarMasteredList(entry, releaseId).length;
  const count = Number(entry?.masteredCount);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

export function progressForGrammarMonster(state, monsterId, { conceptTotal = null, releaseId = GRAMMAR_REWARD_RELEASE_ID, conceptNodes = null, recentAttempts = null } = {}) {
  const entry = isPlainObject(state?.[monsterId]) ? state[monsterId] : { mastered: [], caught: false };
  const mastered = grammarMasteredCount(entry, releaseId);
  const total = grammarTotal(entry, conceptTotal || grammarMonsterConceptTotal(monsterId));

  // Legacy ratio-based stage — always computed for backward compat.
  const legacyStage = grammarStageFor(mastered, total);

  // --- Star computation ---
  // When conceptNodes are provided (client read path), derive Stars from
  // evidence tiers. When absent (reward-layer callers), fall back to 0
  // computed Stars + legacy floor from the old stage — existing callers
  // that don't pass conceptNodes still get correct legacy staging.
  let computedStars = 0;
  if (conceptNodes && typeof conceptNodes === 'object') {
    const conceptIds = monsterId === GRAMMAR_GRAND_MONSTER_ID
      ? GRAMMAR_AGGREGATE_CONCEPTS
      : (GRAMMAR_MONSTER_CONCEPTS[monsterId] || []);
    const evidenceMap = {};
    const attempts = Array.isArray(recentAttempts) ? recentAttempts : [];
    for (const conceptId of conceptIds) {
      evidenceMap[conceptId] = deriveGrammarConceptStarEvidence({
        conceptId,
        conceptNode: conceptNodes[conceptId] || null,
        recentAttempts: attempts,
      });
    }
    const starResult = computeGrammarMonsterStars(monsterId, evidenceMap);
    computedStars = starResult.stars;
  }

  // Persisted high-water mark. Corrupted values (NaN, negative) → 0.
  const rawHW = Number(entry.starHighWater);
  const persistedHW = Number.isFinite(rawHW) && rawHW > 0 ? Math.floor(rawHW) : 0;

  // Determine legacy floor for pre-P5 learners (no starHighWater field).
  // Post-P5 learners with starHighWater present skip the legacy floor.
  const hasStarHighWater = entry.starHighWater !== undefined && entry.starHighWater !== null;
  const legacyFloor = hasStarHighWater ? 0 : legacyStage;

  const { displayStars, updatedHighWater } = applyStarHighWaterLatch({
    computedStars,
    starHighWater: persistedHW,
    legacyStage: legacyFloor,
  });

  // Star-derived stage for backward compat: max(legacyStage, starDerivedStage).
  const starDerivedStage = grammarStarStageFor(displayStars);
  const stage = Math.max(legacyStage, starDerivedStage);

  // Level calculation: max of legacy ratio-based level and Star-based level.
  // Legacy: Math.round(mastered/total * 10), capped at 10.
  // Star-based: every 10 Stars is one level, capped at 10.
  const legacyLevel = Math.min(10, Math.round((mastered / Math.max(1, total)) * 10));
  const starLevel = Math.min(10, Math.floor(displayStars / 10));
  const level = Math.max(legacyLevel, starLevel);

  return {
    mastered,
    conceptTotal: total,
    stage,
    level,
    caught: mastered >= 1 || displayStars >= 1,
    branch: branchForMonster(state, monsterId),
    masteredList: grammarMasteredList(entry, releaseId),
    // Star fields
    stars: displayStars,
    starMax: GRAMMAR_MONSTER_STAR_MAX,
    displayStage: grammarStarDisplayStage(displayStars),
    stageName: grammarStarStageName(displayStars),
    starHighWater: updatedHighWater,
  };
}

function buildGrammarEvent({
  learnerId,
  kind,
  monsterId,
  previous,
  next,
  releaseId,
  conceptId,
  masteryKey,
  createdAt = Date.now(),
} = {}) {
  const monster = MONSTERS[monsterId];
  return {
    id: `reward.monster:${learnerId || 'default'}:grammar:${releaseId}:${conceptId}:${monsterId}:${kind}`,
    type: 'reward.monster',
    kind,
    learnerId,
    subjectId: 'grammar',
    systemId: DEFAULT_SYSTEM_ID,
    releaseId,
    conceptId,
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

function grammarEventFromTransition(payload, previous, next) {
  if (!previous.caught && next.caught) {
    return buildGrammarEvent({ ...payload, kind: 'caught', previous, next });
  }
  if (next.stage > previous.stage) {
    return buildGrammarEvent({ ...payload, kind: next.stage === 4 ? 'mega' : 'evolve', previous, next });
  }
  if (next.level > previous.level) {
    return buildGrammarEvent({ ...payload, kind: 'levelup', previous, next });
  }
  return null;
}

// Phase 3 U0 writer self-heal. When a learner had pre-flip direct evidence
// under a retired id (Glossbloom / Loomrill / Mirrane) for the same concept
// now being recorded, seed the post-flip direct's `mastered[]` silently and
// suppress the `caught` event for the seed path. Without this, the existing
// early-out at line 190 only consults the current direct's `mastered[]`, so
// a pre-flip Glossbloom-caught learner answering any remapped concept would
// cause the writer to re-fire a spurious Bracehart `caught` toast. The
// persistence path delivers the state delta; the emission path independently
// decides whether to emit — see the cross-direct re-emission landmine
// flagged in docs/plans/james/punctuation/punctuation-p2-completion-report.md
// §2.U5.
function retiredStateHoldsConcept({ before, conceptId, releaseId }) {
  for (const retiredId of GRAMMAR_RESERVED_MONSTER_IDS) {
    const retiredEntry = before?.[retiredId];
    if (!isPlainObject(retiredEntry)) continue;
    const retiredScopedReleaseId = releaseIdForEntry(retiredEntry, releaseId) || releaseId;
    for (const retiredKey of masteredList(retiredEntry)) {
      const retiredConceptId = grammarConceptIdFromMasteryKey(retiredKey, retiredScopedReleaseId);
      if (retiredConceptId === conceptId) return true;
    }
  }
  return false;
}

export function recordGrammarConceptMastery({
  learnerId,
  conceptId,
  releaseId = GRAMMAR_REWARD_RELEASE_ID,
  masteryKey = grammarMasteryKey(conceptId, releaseId),
  createdAt = Date.now(),
  gameStateRepository,
  random = Math.random,
} = {}) {
  if (!GRAMMAR_AGGREGATE_CONCEPTS.includes(conceptId) || !masteryKey) return [];
  const directMonsterId = monsterIdForGrammarConcept(conceptId);
  const before = ensureMonsterBranches(learnerId, gameStateRepository, {
    random,
    monsterIds: GRAMMAR_MONSTER_IDS,
  });
  const aggregateEntry = isPlainObject(before[GRAMMAR_GRAND_MONSTER_ID])
    ? before[GRAMMAR_GRAND_MONSTER_ID]
    : { mastered: [], caught: false };
  const aggregateMastered = masteredList(aggregateEntry);
  const directEntry = directMonsterId && isPlainObject(before[directMonsterId])
    ? before[directMonsterId]
    : { mastered: [], caught: false };
  const directMastered = directMonsterId ? masteredList(directEntry) : [];

  // Pre-flip learners with evidence under retired ids must have their new
  // direct silently seeded before any emission decision runs. The seed
  // persists the state delta but does not emit a `caught` event for the
  // direct — the learner already earned that milestone under the retired id.
  const shouldSelfHealDirect = Boolean(directMonsterId)
    && !directMastered.includes(masteryKey)
    && retiredStateHoldsConcept({ before, conceptId, releaseId });

  if (aggregateMastered.includes(masteryKey) && (!directMonsterId || directMastered.includes(masteryKey))) {
    return [];
  }

  const beforeAggregate = progressForGrammarMonster(before, GRAMMAR_GRAND_MONSTER_ID, {
    conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
  });
  const beforeDirect = directMonsterId
    ? progressForGrammarMonster(before, directMonsterId, {
      conceptTotal: grammarMonsterConceptTotal(directMonsterId),
    })
    : null;

  // Ratchet starHighWater: preserve the existing high-water mark on each
  // monster entry. For pre-P5 learners (no starHighWater field), seed the
  // value from the legacy floor so that writing it for the first time does
  // not erase the learner's visual stage. The actual Star computation
  // happens on the client read path (which has access to concept nodes);
  // the reward layer only preserves the latch field so it survives
  // round-trips.
  const aggregateHW = seedStarHighWater(aggregateEntry, GRAMMAR_AGGREGATE_CONCEPTS.length);

  const after = {
    ...before,
    [GRAMMAR_GRAND_MONSTER_ID]: {
      ...aggregateEntry,
      caught: true,
      conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
      releaseId,
      mastered: aggregateMastered.includes(masteryKey)
        ? aggregateMastered
        : [...aggregateMastered, masteryKey],
      starHighWater: aggregateHW,
    },
  };

  if (directMonsterId) {
    const directHW = seedStarHighWater(directEntry, grammarMonsterConceptTotal(directMonsterId));
    after[directMonsterId] = {
      ...directEntry,
      caught: true,
      conceptTotal: grammarMonsterConceptTotal(directMonsterId),
      releaseId,
      mastered: directMastered.includes(masteryKey)
        ? directMastered
        : [...directMastered, masteryKey],
      starHighWater: directHW,
    };
  }

  const afterAggregate = progressForGrammarMonster(after, GRAMMAR_GRAND_MONSTER_ID, {
    conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
  });
  const afterDirect = directMonsterId
    ? progressForGrammarMonster(after, directMonsterId, {
      conceptTotal: grammarMonsterConceptTotal(directMonsterId),
    })
    : null;
  saveMonsterState(learnerId, after, gameStateRepository);

  const events = [];
  if (directMonsterId && !shouldSelfHealDirect) {
    const directEvent = grammarEventFromTransition({
      learnerId,
      monsterId: directMonsterId,
      releaseId,
      conceptId,
      masteryKey,
      createdAt,
    }, beforeDirect, afterDirect);
    if (directEvent) events.push(directEvent);
  }

  const aggregateEvent = grammarEventFromTransition({
    learnerId,
    monsterId: GRAMMAR_GRAND_MONSTER_ID,
    releaseId,
    conceptId,
    masteryKey,
    createdAt,
  }, beforeAggregate, afterAggregate);
  if (aggregateEvent) events.push(aggregateEvent);

  return events;
}

/**
 * Lightweight latch-write for sub-secure Star evidence.
 *
 * Updates `starHighWater = max(existing, computedStars)` on the specified
 * monster only, without touching the `mastered[]` array (that stays exclusive
 * to concept-secured via `recordGrammarConceptMastery`).
 *
 * The caller (event-hooks subscriber) is responsible for passing the correct
 * `monsterId` from each `star-evidence-updated` event. The command handler
 * emits one event per monster with monster-specific `computedStars`, so each
 * call updates exactly one monster — preventing cross-inflation where a
 * direct monster's higher Stars would overwrite Concordium's lower value.
 *
 * Sets `caught: true` if Stars >= 1 and was previously false, emitting a
 * `caught` reward event for the newly-caught monster.
 *
 * Returns an array of reward events (caught event if the monster newly
 * crossed the threshold, otherwise empty).
 */
export function updateGrammarStarHighWater({
  learnerId,
  monsterId,
  conceptId,
  computedStars,
  gameStateRepository,
  random = Math.random,
} = {}) {
  if (!GRAMMAR_AGGREGATE_CONCEPTS.includes(conceptId)) return [];
  const stars = Math.max(0, Math.floor(Number(computedStars) || 0));
  if (stars < 1) return [];

  // Resolve the target monster. When monsterId is provided, use it directly.
  // Fall back to the direct monster for the concept (backward compat).
  const targetMonsterId = monsterId || monsterIdForGrammarConcept(conceptId) || GRAMMAR_GRAND_MONSTER_ID;

  const before = ensureMonsterBranches(learnerId, gameStateRepository, {
    random,
    monsterIds: GRAMMAR_MONSTER_IDS,
  });

  const entry = isPlainObject(before[targetMonsterId])
    ? before[targetMonsterId]
    : { mastered: [], caught: false };
  const existingHW = safeStarHighWater(entry.starHighWater);
  if (stars <= existingHW) {
    // No change needed — existing high-water already covers this update.
    return [];
  }

  const wasCaught = entry.caught === true;
  const nowCaught = wasCaught || stars >= 1;
  const total = grammarMonsterConceptTotal(targetMonsterId);
  const after = {
    ...before,
    [targetMonsterId]: {
      ...entry,
      caught: nowCaught,
      conceptTotal: total,
      starHighWater: Math.min(GRAMMAR_MONSTER_STAR_MAX, stars),
    },
  };

  saveMonsterState(learnerId, after, gameStateRepository);

  const events = [];
  if (!wasCaught && nowCaught) {
    const beforeProgress = progressForGrammarMonster(before, targetMonsterId, {
      conceptTotal: total,
    });
    const afterProgress = progressForGrammarMonster(after, targetMonsterId, {
      conceptTotal: total,
    });
    const ev = grammarEventFromTransition({
      learnerId,
      monsterId: targetMonsterId,
      releaseId: GRAMMAR_REWARD_RELEASE_ID,
      conceptId,
      masteryKey: grammarMasteryKey(conceptId),
      createdAt: Date.now(),
    }, beforeProgress, afterProgress);
    if (ev) events.push(ev);
  }

  return events;
}

export function activeGrammarMonsterSummaryFromState(state = {}) {
  return grammarMonsterSummaryFromState(state)
    .filter((entry) => entry.progress.caught || entry.progress.mastered > 0);
}

export function grammarMonsterSummaryFromState(state = {}) {
  return GRAMMAR_MONSTER_IDS.map((monsterId) => ({
    subjectId: 'grammar',
    monster: MONSTERS[monsterId],
    progress: progressForGrammarMonster(state, monsterId, {
      conceptTotal: grammarMonsterConceptTotal(monsterId),
    }),
  }));
}
