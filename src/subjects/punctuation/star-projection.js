// Pure evidence-to-Stars projection for the Punctuation subject.
//
// Reads from the `progress` shape exposed by `buildPunctuationLearnerReadModel`
// (items, facets, rewardUnits, attempts) and returns per-monster Star
// breakdowns plus a grand Star total.  No side effects, no persistence
// mutations, no Worker imports.
//
// Star categories and caps per direct monster (total = 100):
//   Try Stars       max 10  — meaningful attempt breadth
//   Practice Stars  max 30  — independent correct answers + item variety
//   Secure Stars    max 35  — items reaching the secure memory bucket
//   Mastery Stars   max 25  — deep-secure evidence (facet coverage + no lapse)
//
// Grand Stars derive from breadth + deep-secure evidence across ALL clusters,
// not from summing direct Stars.

import { PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER, ACTIVE_PUNCTUATION_MONSTER_IDS }
  from './components/punctuation-view-model.js';

// Re-export the mapping so downstream consumers (U4) can import from this
// module without reaching into the view-model.
export { PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER };

const DAY_MS = 24 * 60 * 60 * 1000;

// Reward-unit definitions per cluster (client mirror of shared content).
// Imported from the read-model constant rather than duplicated.
import { PUNCTUATION_CLIENT_SKILLS } from './read-model.js';

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const DIRECT_MONSTER_IDS = ACTIVE_PUNCTUATION_MONSTER_IDS.filter(
  (id) => id !== 'quoral',
);

// Build a cluster-to-monster lookup from the view-model constant.
const CLUSTER_TO_MONSTER = { ...PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER };

// Reverse: monster -> Set<clusterId>
const MONSTER_CLUSTERS = new Map();
for (const [clusterId, monsterId] of Object.entries(CLUSTER_TO_MONSTER)) {
  if (!MONSTER_CLUSTERS.has(monsterId)) MONSTER_CLUSTERS.set(monsterId, new Set());
  MONSTER_CLUSTERS.get(monsterId).add(clusterId);
}

// Build skill -> clusterId lookup.
const SKILL_TO_CLUSTER = new Map();
for (const skill of PUNCTUATION_CLIENT_SKILLS) {
  SKILL_TO_CLUSTER.set(skill.id, skill.clusterId);
}

// Star category caps per direct monster.
const TRY_CAP = 10;
const PRACTICE_CAP = 30;
const SECURE_CAP = 35;
const MASTERY_CAP = 25;

// Evidence gates (R11, R12).
const MAX_ATTEMPTS_PER_ITEM = 3;
const MAX_SAME_DAY_EASY_ITEMS = 15;

// Grand Star maximum.
const GRAND_STAR_CAP = 100;

// ---------------------------------------------------------------------------
// Helpers — pure, stateless
// ---------------------------------------------------------------------------

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function dayIndex(ts) {
  return Math.floor(Math.max(0, Number(ts) || 0) / DAY_MS);
}

/** Mirror of `memorySnapshot` from read-model.js:118-139 */
function memorySnapshot(value) {
  const raw = isPlainObject(value) ? value : {};
  const attempts = Math.max(0, Number(raw.attempts) || 0);
  const correct = Math.max(0, Number(raw.correct) || 0);
  const streak = Math.max(0, Number(raw.streak) || 0);
  const lapses = Math.max(0, Number(raw.lapses) || 0);
  const firstCorrectAt = Number.isFinite(Number(raw.firstCorrectAt)) ? Number(raw.firstCorrectAt) : null;
  const lastCorrectAt = Number.isFinite(Number(raw.lastCorrectAt)) ? Number(raw.lastCorrectAt) : null;
  const accuracy = attempts ? correct / attempts : 0;
  const correctSpanDays = firstCorrectAt != null && lastCorrectAt != null
    ? Math.floor((lastCorrectAt - firstCorrectAt) / DAY_MS)
    : 0;
  const secure = streak >= 3 && accuracy >= 0.8 && correctSpanDays >= 7;
  return { attempts, correct, streak, lapses, accuracy, correctSpanDays, secure };
}

/**
 * Determine which clusters an attempt belongs to based on its skillIds
 * and rewardUnitId.
 */
function clustersForAttempt(attempt) {
  const clusters = new Set();
  // Derive from skillIds.
  if (Array.isArray(attempt.skillIds)) {
    for (const skillId of attempt.skillIds) {
      const clusterId = SKILL_TO_CLUSTER.get(skillId);
      if (clusterId) clusters.add(clusterId);
    }
  }
  // If none matched, fall back to reward-unit lookup.
  if (clusters.size === 0 && typeof attempt.rewardUnitId === 'string') {
    for (const skill of PUNCTUATION_CLIENT_SKILLS) {
      if (attempt.rewardUnitId.includes(skill.id.replace(/_/g, '-'))) {
        clusters.add(skill.clusterId);
      }
    }
  }
  return clusters;
}

/**
 * Determine which monster a cluster belongs to.
 */
function monsterForCluster(clusterId) {
  return CLUSTER_TO_MONSTER[clusterId] || null;
}

// ---------------------------------------------------------------------------
// Per-monster Star computations
// ---------------------------------------------------------------------------

function computeTryStars(monsterAttempts) {
  // Count meaningful attempts: distinct items with non-zero attempts,
  // capping same-item repeats at MAX_ATTEMPTS_PER_ITEM.
  const perItem = new Map();
  for (const attempt of monsterAttempts) {
    const itemId = attempt.itemId || '';
    if (!itemId) continue;
    const count = perItem.get(itemId) || 0;
    if (count >= MAX_ATTEMPTS_PER_ITEM) continue;
    perItem.set(itemId, count + 1);
  }

  // Cap same-day items.
  const perDay = new Map();
  for (const attempt of monsterAttempts) {
    const day = dayIndex(attempt.ts);
    const itemId = attempt.itemId || '';
    if (!itemId) continue;
    if (!perDay.has(day)) perDay.set(day, new Set());
    perDay.get(day).add(itemId);
  }

  let totalCapped = 0;
  for (const count of perItem.values()) {
    totalCapped += count;
  }

  // Also cap by same-day easy items threshold.
  let sameDayTotal = 0;
  for (const items of perDay.values()) {
    sameDayTotal += Math.min(items.size, MAX_SAME_DAY_EASY_ITEMS);
  }

  const effectiveAttempts = Math.min(totalCapped, sameDayTotal || totalCapped);

  // Scale: 1 Star per meaningful attempt, capped at TRY_CAP.
  return Math.min(TRY_CAP, effectiveAttempts);
}

function computePracticeStars(monsterAttempts) {
  // Independent first-attempt correct: supportLevel === 0 && correct,
  // capping same-item repeats at MAX_ATTEMPTS_PER_ITEM.
  const perItem = new Map();
  let independentCorrect = 0;

  for (const attempt of monsterAttempts) {
    const itemId = attempt.itemId || '';
    if (!itemId) continue;
    const count = perItem.get(itemId) || 0;
    if (count >= MAX_ATTEMPTS_PER_ITEM) continue;
    perItem.set(itemId, count + 1);

    const supportLevel = Math.max(0, Number(attempt.supportLevel) || 0);
    if (supportLevel === 0 && attempt.correct === true) {
      independentCorrect += 1;
    }
  }

  // Distinct item variety bonus: each unique item that was correct adds
  // a fractional Star.
  const correctItems = new Set();
  for (const attempt of monsterAttempts) {
    const supportLevel = Math.max(0, Number(attempt.supportLevel) || 0);
    if (supportLevel === 0 && attempt.correct === true && attempt.itemId) {
      correctItems.add(attempt.itemId);
    }
  }

  // Near-retry corrections count at 0.5 each.
  let nearRetryCorrections = 0;
  const itemAttemptOrder = new Map();
  for (const attempt of monsterAttempts) {
    const itemId = attempt.itemId || '';
    if (!itemId) continue;
    if (!itemAttemptOrder.has(itemId)) itemAttemptOrder.set(itemId, []);
    itemAttemptOrder.get(itemId).push(attempt);
  }
  for (const [, attempts] of itemAttemptOrder) {
    for (let i = 1; i < attempts.length && i < MAX_ATTEMPTS_PER_ITEM; i++) {
      if (!attempts[i - 1].correct && attempts[i].correct) {
        nearRetryCorrections += 1;
      }
    }
  }

  const rawScore = independentCorrect + (correctItems.size * 0.5) + (nearRetryCorrections * 0.5);
  // Scale to cap.
  return Math.min(PRACTICE_CAP, Math.floor(rawScore));
}

function computeSecureStars(monsterClusterIds, items, rewardUnits, releaseId) {
  // Count items that have reached the secure bucket.
  let secureItemCount = 0;
  const itemEntries = isPlainObject(items) ? items : {};
  for (const [, itemState] of Object.entries(itemEntries)) {
    const snap = memorySnapshot(itemState);
    if (snap.secure) secureItemCount += 1;
  }

  // Count secured reward units for this monster's clusters.
  let securedUnitCount = 0;
  const rewardEntries = isPlainObject(rewardUnits) ? rewardUnits : {};
  for (const [, entry] of Object.entries(rewardEntries)) {
    if (!isPlainObject(entry)) continue;
    const entryClusterId = typeof entry.clusterId === 'string' ? entry.clusterId : '';
    if (!monsterClusterIds.has(entryClusterId)) continue;
    const securedAt = Number(entry.securedAt);
    if (Number.isFinite(securedAt) && securedAt > 0) {
      securedUnitCount += 1;
    }
  }

  // Secure Stars scale: secured items contribute + secured reward units
  // contribute a larger share.
  const rawScore = (secureItemCount * 2) + (securedUnitCount * 8);
  return Math.min(SECURE_CAP, rawScore);
}

function computeMasteryStars(monsterClusterIds, facets, rewardUnits) {
  // Mastery requires deep-secure evidence:
  //   - Secured reward units with facet coverage across multiple item modes
  //   - No recent lapse in any facet for this cluster

  const facetEntries = isPlainObject(facets) ? facets : {};
  const rewardEntries = isPlainObject(rewardUnits) ? rewardUnits : {};

  // Check for recent lapse in any facet belonging to this monster's clusters.
  let hasRecentLapse = false;
  const itemModes = new Set();
  let facetSecureCount = 0;

  for (const [facetId, facetState] of Object.entries(facetEntries)) {
    const [skillId] = facetId.split('::');
    const itemMode = facetId.split('::')[1] || '';
    const skillCluster = SKILL_TO_CLUSTER.get(skillId);
    if (!skillCluster || !monsterClusterIds.has(skillCluster)) continue;

    const snap = memorySnapshot(facetState);
    if (snap.lapses > 0 && snap.streak === 0) {
      hasRecentLapse = true;
    }
    if (snap.secure) {
      facetSecureCount += 1;
    }
    if (snap.attempts > 0) {
      itemModes.add(itemMode);
    }
  }

  // Recent lapse blocks all Mastery Stars for this monster.
  if (hasRecentLapse) return 0;

  // Count secured units for this monster's clusters.
  let securedUnitCount = 0;
  for (const [, entry] of Object.entries(rewardEntries)) {
    if (!isPlainObject(entry)) continue;
    const entryClusterId = typeof entry.clusterId === 'string' ? entry.clusterId : '';
    if (!monsterClusterIds.has(entryClusterId)) continue;
    const securedAt = Number(entry.securedAt);
    if (Number.isFinite(securedAt) && securedAt > 0) {
      securedUnitCount += 1;
    }
  }

  // Mastery gates: need facet coverage across 2+ item modes AND secured units.
  if (itemModes.size < 2) return 0;
  if (securedUnitCount === 0) return 0;

  // Raw score: facet coverage breadth + secure facets + secured units.
  const rawScore = (itemModes.size * 3) + (facetSecureCount * 3) + (securedUnitCount * 5);
  return Math.min(MASTERY_CAP, rawScore);
}

// ---------------------------------------------------------------------------
// Per-monster item filter
// ---------------------------------------------------------------------------

/**
 * Filter `progress.items` to only those belonging to the given monster's
 * clusters. Uses the attempt history to map itemId -> cluster.
 */
function itemsForMonster(items, attempts, monsterClusterIds) {
  const itemToCluster = new Map();
  for (const attempt of attempts) {
    if (!attempt.itemId) continue;
    for (const clusterId of clustersForAttempt(attempt)) {
      if (monsterClusterIds.has(clusterId)) {
        itemToCluster.set(attempt.itemId, clusterId);
      }
    }
  }
  const filtered = {};
  const itemEntries = isPlainObject(items) ? items : {};
  for (const [itemId, state] of Object.entries(itemEntries)) {
    if (itemToCluster.has(itemId)) {
      filtered[itemId] = state;
    }
  }
  return filtered;
}

// ---------------------------------------------------------------------------
// Grand Stars
// ---------------------------------------------------------------------------

function computeGrandStars(progress, releaseId) {
  const rewardEntries = isPlainObject(progress.rewardUnits) ? progress.rewardUnits : {};
  const facetEntries = isPlainObject(progress.facets) ? progress.facets : {};

  // Count total secured units and deep-secured units across all clusters.
  let totalSecured = 0;
  let totalDeepSecured = 0;
  const monstersWithSecured = new Set();

  for (const [, entry] of Object.entries(rewardEntries)) {
    if (!isPlainObject(entry)) continue;
    const securedAt = Number(entry.securedAt);
    if (!Number.isFinite(securedAt) || securedAt <= 0) continue;
    totalSecured += 1;

    const entryClusterId = typeof entry.clusterId === 'string' ? entry.clusterId : '';
    const monsterId = monsterForCluster(entryClusterId);
    if (monsterId) monstersWithSecured.add(monsterId);
  }

  // Deep-secured: facets that are secure AND have no recent lapse.
  for (const [, facetState] of Object.entries(facetEntries)) {
    const snap = memorySnapshot(facetState);
    if (snap.secure && snap.lapses === 0) {
      totalDeepSecured += 1;
    }
  }

  // Breadth gates: count distinct direct monsters with secured evidence.
  const directMonstersWithEvidence = [...monstersWithSecured].filter(
    (id) => DIRECT_MONSTER_IDS.includes(id),
  ).length;

  // Breadth scoring:
  //   0 direct monsters with secured → 0 grand stars
  //   1 direct monster → cap at 15
  //   2 direct monsters → cap at 50
  //   3 direct monsters → full range (100)
  let breadthCap;
  if (directMonstersWithEvidence === 0) breadthCap = 0;
  else if (directMonstersWithEvidence === 1) breadthCap = 15;
  else if (directMonstersWithEvidence === 2) breadthCap = 50;
  else breadthCap = GRAND_STAR_CAP;

  if (breadthCap === 0) return { grandStars: 0, total: GRAND_STAR_CAP };

  // Formula: weighted sum of secured count + deep-secured count.
  //   - Each secured unit contributes 4 points.
  //   - Each deep-secured facet contributes 2 points.
  const rawScore = (totalSecured * 4) + (totalDeepSecured * 2);
  const grandStars = Math.min(breadthCap, Math.min(GRAND_STAR_CAP, rawScore));

  return { grandStars, total: GRAND_STAR_CAP };
}

// ---------------------------------------------------------------------------
// Main projection function
// ---------------------------------------------------------------------------

/**
 * Pure function: projects Star counts from the learner's punctuation progress.
 *
 * @param {Object} progress - The progress sub-object from the subject state
 *   record: `{ items, facets, rewardUnits, attempts }`.
 * @param {string} releaseId - The current release identifier (used for
 *   reward-unit filtering).
 * @returns {Object} Star breakdown per monster + grand total.
 */
export function projectPunctuationStars(progress, releaseId) {
  const safeProgress = isPlainObject(progress) ? progress : {};
  const items = isPlainObject(safeProgress.items) ? safeProgress.items : {};
  const facets = isPlainObject(safeProgress.facets) ? safeProgress.facets : {};
  const rewardUnits = isPlainObject(safeProgress.rewardUnits) ? safeProgress.rewardUnits : {};
  const rawAttempts = Array.isArray(safeProgress.attempts) ? safeProgress.attempts : [];

  // Normalise attempts: ensure required fields are present.
  const attempts = rawAttempts.map((raw) => {
    const a = isPlainObject(raw) ? raw : {};
    return {
      ts: Math.max(0, Number(a.ts) || 0),
      itemId: typeof a.itemId === 'string' ? a.itemId : '',
      skillIds: Array.isArray(a.skillIds) ? a.skillIds.filter((s) => typeof s === 'string') : [],
      rewardUnitId: typeof a.rewardUnitId === 'string' ? a.rewardUnitId : '',
      correct: a.correct === true,
      supportLevel: Math.max(0, Number(a.supportLevel) || 0),
      supportKind: typeof a.supportKind === 'string' ? a.supportKind : null,
      itemMode: typeof a.itemMode === 'string' ? a.itemMode : '',
      sessionMode: typeof a.sessionMode === 'string' ? a.sessionMode : 'smart',
      testMode: a.testMode === 'gps' ? 'gps' : null,
    };
  });

  // Build per-monster attempt arrays.
  const monsterAttempts = new Map();
  for (const monsterId of DIRECT_MONSTER_IDS) {
    monsterAttempts.set(monsterId, []);
  }
  for (const attempt of attempts) {
    const clusters = clustersForAttempt(attempt);
    for (const clusterId of clusters) {
      const monsterId = monsterForCluster(clusterId);
      if (monsterId && monsterAttempts.has(monsterId)) {
        monsterAttempts.get(monsterId).push(attempt);
      }
    }
  }

  // Project per-monster Stars.
  const perMonster = {};
  for (const monsterId of DIRECT_MONSTER_IDS) {
    const clusterIds = MONSTER_CLUSTERS.get(monsterId) || new Set();
    const mAttempts = monsterAttempts.get(monsterId) || [];
    const mItems = itemsForMonster(items, attempts, clusterIds);

    const tryStars = computeTryStars(mAttempts);
    const practiceStars = computePracticeStars(mAttempts);
    const secureStars = computeSecureStars(clusterIds, mItems, rewardUnits, releaseId);
    const masteryStars = computeMasteryStars(clusterIds, facets, rewardUnits);
    const total = tryStars + practiceStars + secureStars + masteryStars;

    perMonster[monsterId] = {
      tryStars,
      practiceStars,
      secureStars,
      masteryStars,
      total,
    };
  }

  // Grand Stars.
  const grand = computeGrandStars(safeProgress, releaseId);

  return { perMonster, grand };
}
