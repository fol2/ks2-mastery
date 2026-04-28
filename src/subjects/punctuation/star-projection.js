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

import {
  ACTIVE_PUNCTUATION_MONSTER_IDS,
  PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER,
  CLASPIN_REQUIRED_SKILLS,
  SKILL_TO_CLUSTER,
  RU_TO_CLUSTERS,
  MONSTER_CLUSTERS,
  MONSTER_UNIT_COUNT,
  DIRECT_PUNCTUATION_MONSTER_IDS,
} from './punctuation-manifest.js';

export { PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER, ACTIVE_PUNCTUATION_MONSTER_IDS, CLASPIN_REQUIRED_SKILLS };

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

// Star category caps per direct monster.
const TRY_CAP = 10;
const PRACTICE_CAP = 30;
const SECURE_CAP = 35;
const MASTERY_CAP = 25;

// Evidence gates (R11, R12).
const MAX_ATTEMPTS_PER_ITEM = 3;
const MAX_SAME_DAY_EASY_ITEMS = 15;
const MAX_SAME_DAY_PRACTICE_ITEMS = 25;

// Grand Star maximum.
const GRAND_STAR_CAP = 100;

// ---------------------------------------------------------------------------
// U5: Per-monster reward-unit counts and weight multipliers
// ---------------------------------------------------------------------------
// Pealark owns 5 reward units, Claspin 2, Curlune 7.  To make progression
// *feel* similar, smaller clusters get a higher per-unit weight so that
// finishing the same fraction of their units yields roughly the same stage.
//
// The multiplier is applied inside computeSecureStars and computeMasteryStars
// so that raw score scales inversely with cluster size.

// Reference cluster size for normalisation (Pealark = 5 units).
const REFERENCE_UNIT_COUNT = 5;

/**
 * Per-unit weight multiplier: `REFERENCE / monsterUnitCount`.
 * Pealark: 5/5 = 1.0, Claspin: 5/2 = 2.5, Curlune: 5/7 ≈ 0.714
 */
function unitWeightMultiplier(monsterId) {
  const count = MONSTER_UNIT_COUNT[monsterId] || REFERENCE_UNIT_COUNT;
  return REFERENCE_UNIT_COUNT / count;
}

// ---------------------------------------------------------------------------
// U5: Claspin Mega gate — deep-secure evidence requirements
// ---------------------------------------------------------------------------
// Claspin (apostrophe, 2 units) cannot reach Mega (100 stars) with just
// simple secure evidence.  Mega requires ALL of:
//   1. Both units deep secure (securedAt + facet secure with no lapse)
//   2. Mixed sentence context evidence (2+ item modes with secure facets)
//   3. Spaced return after 7+ days (correctSpanDays >= 7 on any facet)
//   4. Both contractions AND possession skills with deep-secure facets
// Without this evidence, Mastery Stars are hard-capped at 15 (giving a
// maximum of 10 + 30 + 35 + 15 = 90 < 100).

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
  // If none matched, fall back to exact reward-unit lookup.
  if (clusters.size === 0 && typeof attempt.rewardUnitId === 'string') {
    const mapped = RU_TO_CLUSTERS.get(attempt.rewardUnitId);
    if (mapped) {
      for (const c of mapped) clusters.add(c);
    }
  }
  return clusters;
}

/**
 * Determine which monster a cluster belongs to.
 */
function monsterForCluster(clusterId) {
  return PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER[clusterId] || null;
}

function attemptEvidenceKey(attempt) {
  return attempt?.evidenceKey || attempt?.variantSignature || attempt?.itemId || '';
}

function itemVariantSignatureAliasMap(attempts) {
  const signaturesByItemId = new Map();
  for (const attempt of attempts) {
    if (!attempt.itemId || !attempt.variantSignature) continue;
    if (!signaturesByItemId.has(attempt.itemId)) signaturesByItemId.set(attempt.itemId, new Set());
    signaturesByItemId.get(attempt.itemId).add(attempt.variantSignature);
  }

  const aliases = new Map();
  for (const [itemId, signatures] of signaturesByItemId) {
    if (signatures.size === 1) aliases.set(itemId, [...signatures][0]);
  }
  return aliases;
}

function normaliseAttempts(rawAttempts) {
  const attempts = rawAttempts.map((raw) => {
    const a = isPlainObject(raw) ? raw : {};
    return {
      ts: Math.max(0, Number(a.ts) || 0),
      itemId: typeof a.itemId === 'string' ? a.itemId : '',
      variantSignature: typeof a.variantSignature === 'string' ? a.variantSignature : '',
      skillIds: Array.isArray(a.skillIds) ? a.skillIds.filter((s) => typeof s === 'string') : [],
      rewardUnitId: typeof a.rewardUnitId === 'string' ? a.rewardUnitId : '',
      correct: a.correct === true,
      supportLevel: Math.max(0, Number(a.supportLevel) || 0),
      supportKind: typeof a.supportKind === 'string' ? a.supportKind : null,
      itemMode: typeof a.itemMode === 'string' ? a.itemMode : '',
      sessionMode: typeof a.sessionMode === 'string' ? a.sessionMode : 'smart',
      testMode: a.testMode === 'gps' ? 'gps' : null,
      meaningful: a.meaningful !== false,
    };
  });
  const itemSignatureAliases = itemVariantSignatureAliasMap(attempts);
  return attempts.map((attempt) => ({
    ...attempt,
    evidenceKey: attempt.variantSignature || itemSignatureAliases.get(attempt.itemId) || attempt.itemId,
  }));
}

function normaliseReleaseId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function releaseIdFromMasteryKey(masteryKey) {
  if (typeof masteryKey !== 'string' || !masteryKey) return '';
  const parts = masteryKey.split(':');
  if (parts.length < 4 || parts[0] !== 'punctuation') return '';
  return normaliseReleaseId(parts[1]);
}

function rewardEntryMasteryKey(storageKey, entry) {
  if (typeof entry.masteryKey === 'string' && entry.masteryKey) return entry.masteryKey;
  return typeof storageKey === 'string' && storageKey ? storageKey : '';
}

function isCurrentReleaseRewardEntry(storageKey, entry, releaseId) {
  const currentReleaseId = normaliseReleaseId(releaseId);
  if (!currentReleaseId) return false;

  const explicitReleaseId = normaliseReleaseId(entry.releaseId);
  const masteryKeyReleaseId = releaseIdFromMasteryKey(rewardEntryMasteryKey(storageKey, entry));

  if (explicitReleaseId) {
    if (masteryKeyReleaseId && masteryKeyReleaseId !== explicitReleaseId) return false;
    return explicitReleaseId === currentReleaseId;
  }

  return masteryKeyReleaseId === currentReleaseId;
}

function currentReleaseRewardEntries(rewardUnits, releaseId) {
  const rows = new Map();
  for (const [storageKey, entry] of Object.entries(isPlainObject(rewardUnits) ? rewardUnits : {})) {
    if (!isPlainObject(entry)) continue;
    if (!isCurrentReleaseRewardEntry(storageKey, entry, releaseId)) continue;
    rows.set(rewardEntryMasteryKey(storageKey, entry) || storageKey, entry);
  }
  return [...rows.values()];
}

// ---------------------------------------------------------------------------
// Per-monster Star computations
// ---------------------------------------------------------------------------

function computeTryStars(monsterAttempts) {
  // Count meaningful attempts: distinct items with non-zero attempts,
  // capping same-item repeats at MAX_ATTEMPTS_PER_ITEM.
  const perItem = new Map();
  for (const attempt of monsterAttempts) {
    if (attempt.meaningful === false) continue;
    const evidenceKey = attemptEvidenceKey(attempt);
    if (!evidenceKey) continue;
    const count = perItem.get(evidenceKey) || 0;
    if (count >= MAX_ATTEMPTS_PER_ITEM) continue;
    perItem.set(evidenceKey, count + 1);
  }

  // Cap same-day items.
  const perDay = new Map();
  for (const attempt of monsterAttempts) {
    if (attempt.meaningful === false) continue;
    const day = dayIndex(attempt.ts);
    const evidenceKey = attemptEvidenceKey(attempt);
    if (!evidenceKey) continue;
    if (!perDay.has(day)) perDay.set(day, new Set());
    perDay.get(day).add(evidenceKey);
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
  // U4: Per-calendar-day cap on distinct items (anti-grinding R10).
  const perItem = new Map();
  const perDayCorrectItems = new Map(); // day -> Set<itemId>
  let independentCorrect = 0;

  for (const attempt of monsterAttempts) {
    const evidenceKey = attemptEvidenceKey(attempt);
    if (!evidenceKey) continue;
    const count = perItem.get(evidenceKey) || 0;
    if (count >= MAX_ATTEMPTS_PER_ITEM) continue;
    perItem.set(evidenceKey, count + 1);

    const supportLevel = Math.max(0, Number(attempt.supportLevel) || 0);
    if (supportLevel === 0 && attempt.correct === true) {
      const day = dayIndex(attempt.ts);
      if (!perDayCorrectItems.has(day)) perDayCorrectItems.set(day, new Set());
      const dayItems = perDayCorrectItems.get(day);
      // Only count this item if the day hasn't hit the daily cap yet.
      if (dayItems.size < MAX_SAME_DAY_PRACTICE_ITEMS || dayItems.has(evidenceKey)) {
        dayItems.add(evidenceKey);
        independentCorrect += 1;
      }
    }
  }

  // Distinct item variety bonus: each unique item that was correct adds
  // a fractional Star.  Apply the same per-day cap to the variety set.
  const correctItems = new Set();
  for (const dayItems of perDayCorrectItems.values()) {
    for (const itemId of dayItems) {
      correctItems.add(itemId);
    }
  }

  // Near-retry corrections count at 0.5 each.
  // Only count a fail->correct transition when the correcting attempt's
  // itemId falls within the daily-cap set (perDayCorrectItems) for its day.
  // This ensures near-retries cannot inflate Practice Stars beyond the
  // daily cap even though PRACTICE_CAP currently absorbs the excess.
  let nearRetryCorrections = 0;
  const itemAttemptOrder = new Map();
  for (const attempt of monsterAttempts) {
    const evidenceKey = attemptEvidenceKey(attempt);
    if (!evidenceKey) continue;
    if (!itemAttemptOrder.has(evidenceKey)) itemAttemptOrder.set(evidenceKey, []);
    itemAttemptOrder.get(evidenceKey).push(attempt);
  }
  for (const [evidenceKey, attempts] of itemAttemptOrder) {
    for (let i = 1; i < attempts.length && i < MAX_ATTEMPTS_PER_ITEM; i++) {
      if (!attempts[i - 1].correct && attempts[i].correct && (attempts[i].supportLevel || 0) === 0) {
        const day = dayIndex(attempts[i].ts);
        if (perDayCorrectItems.get(day)?.has(evidenceKey)) {
          nearRetryCorrections += 1;
        }
      }
    }
  }

  const rawScore = independentCorrect + (correctItems.size * 0.5) + (nearRetryCorrections * 0.5);
  // Scale to cap.
  return Math.min(PRACTICE_CAP, Math.floor(rawScore));
}

function computeSecureStars(monsterClusterIds, items, rewardUnitEntries, monsterId, itemSignatureAliases) {
  // Count items that have reached the secure bucket.
  const secureEvidenceKeys = new Set();
  const itemEntries = isPlainObject(items) ? items : {};
  for (const [itemId, itemState] of Object.entries(itemEntries)) {
    const snap = memorySnapshot(itemState);
    if (snap.secure) {
      secureEvidenceKeys.add(itemSignatureAliases.get(itemId) || itemId);
    }
  }
  const secureItemCount = secureEvidenceKeys.size;

  // Count secured reward units for this monster's clusters.
  let securedUnitCount = 0;
  for (const entry of rewardUnitEntries) {
    if (!isPlainObject(entry)) continue;
    const entryClusterId = typeof entry.clusterId === 'string' ? entry.clusterId : '';
    if (!monsterClusterIds.has(entryClusterId)) continue;
    const securedAt = Number(entry.securedAt);
    if (Number.isFinite(securedAt) && securedAt > 0) {
      securedUnitCount += 1;
    }
  }

  // U5: Apply per-monster weight multiplier so smaller clusters (Claspin)
  // earn proportionally more Secure Stars per unit, keeping progression
  // speed psychologically similar across all three direct monsters.
  const w = unitWeightMultiplier(monsterId);
  const rawScore = (secureItemCount * 2 * w) + (securedUnitCount * 8 * w);
  return Math.min(SECURE_CAP, Math.round(rawScore));
}

function computeMasteryStars(monsterClusterIds, facets, rewardUnitEntries, monsterId) {
  // Mastery requires deep-secure evidence:
  //   - Secured reward units with facet coverage across multiple item modes
  //   - No recent lapse in any facet for this cluster

  const facetEntries = isPlainObject(facets) ? facets : {};

  // Check for recent lapse in any facet belonging to this monster's clusters.
  let hasRecentLapse = false;
  const itemModes = new Set();
  let facetSecureCount = 0;
  const skillsWithDeepSecure = new Set();
  let hasSpacedReturn = false;

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
      if (snap.lapses === 0) {
        skillsWithDeepSecure.add(skillId);
      }
    }
    if (snap.attempts > 0) {
      itemModes.add(itemMode);
    }
    if (snap.correctSpanDays >= 7) {
      hasSpacedReturn = true;
    }
  }

  // Recent lapse blocks all Mastery Stars for this monster.
  if (hasRecentLapse) return 0;

  // Count secured units for this monster's clusters.
  let securedUnitCount = 0;
  for (const entry of rewardUnitEntries) {
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

  // U5: Apply per-monster weight multiplier.
  const w = unitWeightMultiplier(monsterId);

  // Raw score: facet coverage breadth + secure facets + secured units.
  const rawScore = (itemModes.size * 3 * w) + (facetSecureCount * 3 * w) + (securedUnitCount * 5 * w);
  let stars = Math.min(MASTERY_CAP, Math.round(rawScore));

  // U5: Claspin Mega gate — without deep-secure evidence across BOTH skills
  // (contractions + possession), mixed item modes, and spaced return, cap
  // Mastery at 15 so the maximum total is 90 (< 100 Mega).
  if (monsterId === 'claspin') {
    const totalUnitsForMonster = MONSTER_UNIT_COUNT.claspin; // 2
    const hasAllUnitsSecured = securedUnitCount >= totalUnitsForMonster;
    const hasBothSkillsDeepSecure =
      CLASPIN_REQUIRED_SKILLS.every(s => skillsWithDeepSecure.has(s));
    const hasMixedModes = itemModes.size >= 2;

    const meetsDeepSecureGate =
      hasAllUnitsSecured && hasBothSkillsDeepSecure && hasMixedModes && hasSpacedReturn;

    if (!meetsDeepSecureGate) {
      stars = Math.min(stars, 15);
    }
  }

  // P6-U5: Curlune Mega breadth gate — Curlune owns 7 reward units across
  // comma_flow (3) and structure (4). Without broad deep-secure evidence
  // (5/7 skills), Mastery Stars are capped at 15 so the maximum total is
  // 10 + 30 + 35 + 15 = 90 (< 100 Mega).
  if (monsterId === 'curlune') {
    const totalUnitsForMonster = MONSTER_UNIT_COUNT.curlune; // 7
    const minDeepSecuredForMega = Math.ceil(totalUnitsForMonster * 0.71); // 5

    // Count deep-secured skills within Curlune's clusters.  Each Curlune
    // skill maps 1:1 to a reward unit, so this is equivalent to counting
    // deep-secured reward units.  Using skills (not cluster-level) avoids
    // over-counting when only a subset of skills in a cluster are deep-secure.
    let deepSecuredSkillCount = 0;
    for (const skillId of skillsWithDeepSecure) {
      const cluster = SKILL_TO_CLUSTER.get(skillId);
      if (cluster && monsterClusterIds.has(cluster)) {
        deepSecuredSkillCount += 1;
      }
    }

    const hasMixedModes = itemModes.size >= 2;

    // Structural parity with Claspin gate: require a minimum number of
    // secured reward units (securedAt > 0) in addition to deep-secure
    // skill evidence.  In practice deep-secure implies secured, but the
    // gate enforces it explicitly so both monsters share the same shape.
    const meetsCurluneMegaGate =
      securedUnitCount >= minDeepSecuredForMega &&
      deepSecuredSkillCount >= minDeepSecuredForMega && hasMixedModes && hasSpacedReturn;

    if (!meetsCurluneMegaGate) {
      stars = Math.min(stars, 15);
    }
  }

  return stars;
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

// ---------------------------------------------------------------------------
// U6: Grand Star tier thresholds (Quoral)
// ---------------------------------------------------------------------------
// The Grand Star is NOT a sum of direct monster Stars. It measures breadth
// and depth of evidence across ALL 14 punctuation units simultaneously.
//
// Quoral tiers and their evidence requirements:
//   Egg     (15)  — 2+ direct monsters progressing, 3+ secured units
//   Hatch   (35)  — all 3 direct monsters progressing, 6+ secured units
//   Evolve  (60)  — 8+ secured/deep-secured units
//   Strong  (80)  — 11+ units secured, GPS/mixed evidence present
//   Grand   (100) — all 14 units deep secure, all 3 monsters at/near Mega
//
// Between tiers, stars are interpolated linearly based on progress within
// the gate requirements of the next tier.

const GRAND_TIERS = Object.freeze([
  // { threshold, minMonsters, minSecured, minDeepSecured, requireMixed }
  { threshold: 0,   minMonsters: 0, minSecured: 0,  minDeepSecured: 0,  requireMixed: false },
  { threshold: 15,  minMonsters: 2, minSecured: 3,  minDeepSecured: 0,  requireMixed: false },
  { threshold: 35,  minMonsters: 3, minSecured: 6,  minDeepSecured: 0,  requireMixed: false },
  { threshold: 60,  minMonsters: 3, minSecured: 8,  minDeepSecured: 4,  requireMixed: false },
  { threshold: 80,  minMonsters: 3, minSecured: 11, minDeepSecured: 8,  requireMixed: true  },
  { threshold: 100, minMonsters: 3, minSecured: 14, minDeepSecured: 14, requireMixed: true  },
]);

// Total reward units across all clusters.
const TOTAL_REWARD_UNITS = 14;

function computeGrandStars(progress, rewardUnitEntries) {
  const facetEntries = isPlainObject(progress.facets) ? progress.facets : {};

  // Count total secured units and deep-secured units across all clusters.
  let totalSecured = 0;
  const monstersWithSecured = new Set();

  for (const entry of rewardUnitEntries) {
    if (!isPlainObject(entry)) continue;
    const securedAt = Number(entry.securedAt);
    if (!Number.isFinite(securedAt) || securedAt <= 0) continue;
    totalSecured += 1;

    const entryClusterId = typeof entry.clusterId === 'string' ? entry.clusterId : '';
    const monsterId = monsterForCluster(entryClusterId);
    if (monsterId) monstersWithSecured.add(monsterId);
  }

  // Deep-secured: facets that are secure AND have no recent lapse.
  let totalDeepSecured = 0;
  const deepSecureSkills = new Set();
  let hasMixedEvidence = false;
  const deepSecureModes = new Set();

  for (const [facetId, facetState] of Object.entries(facetEntries)) {
    const snap = memorySnapshot(facetState);
    const itemMode = facetId.split('::')[1] || '';
    if (snap.secure && snap.lapses === 0) {
      totalDeepSecured += 1;
      const [skillId] = facetId.split('::');
      deepSecureSkills.add(skillId);
      if (itemMode) deepSecureModes.add(itemMode);
    }
  }

  // Mixed evidence: 2+ distinct item modes across deep-secure facets,
  // OR presence of GPS test mode in attempts.
  if (deepSecureModes.size >= 2) hasMixedEvidence = true;
  if (!hasMixedEvidence && Array.isArray(progress.attempts)) {
    for (const attempt of progress.attempts) {
      if (isPlainObject(attempt) && attempt.testMode === 'gps') {
        hasMixedEvidence = true;
        break;
      }
    }
  }

  // Breadth: count distinct direct monsters with secured evidence.
  const directMonstersWithEvidence = [...monstersWithSecured].filter(
    (id) => DIRECT_PUNCTUATION_MONSTER_IDS.includes(id),
  ).length;

  // Determine the highest tier the learner qualifies for, then interpolate
  // within that tier band based on depth progress.
  let qualifiedTierIndex = 0;
  for (let i = 1; i < GRAND_TIERS.length; i++) {
    const tier = GRAND_TIERS[i];
    if (directMonstersWithEvidence < tier.minMonsters) break;
    if (totalSecured < tier.minSecured) break;
    if (totalDeepSecured < tier.minDeepSecured) break;
    if (tier.requireMixed && !hasMixedEvidence) break;
    qualifiedTierIndex = i;
  }

  const currentTier = GRAND_TIERS[qualifiedTierIndex];

  // If at the final tier (100), return the cap.
  if (qualifiedTierIndex === GRAND_TIERS.length - 1) {
    return { grandStars: GRAND_STAR_CAP, total: GRAND_STAR_CAP };
  }

  // Interpolate within the current tier band towards the next tier.
  const nextTier = GRAND_TIERS[qualifiedTierIndex + 1];
  const bandFloor = currentTier.threshold;
  const bandCeiling = nextTier.threshold;
  const bandWidth = bandCeiling - bandFloor;

  // Progress fraction: average of how close we are to the next tier's
  // requirements across all dimensions (secured units, deep-secured, monsters).
  const securedFrac = nextTier.minSecured > currentTier.minSecured
    ? Math.min(1, (totalSecured - currentTier.minSecured) / (nextTier.minSecured - currentTier.minSecured))
    : 1;
  const deepFrac = nextTier.minDeepSecured > currentTier.minDeepSecured
    ? Math.min(1, (totalDeepSecured - currentTier.minDeepSecured) / (nextTier.minDeepSecured - currentTier.minDeepSecured))
    : 1;
  const monsterFrac = nextTier.minMonsters > currentTier.minMonsters
    ? Math.min(1, (directMonstersWithEvidence - currentTier.minMonsters) / (nextTier.minMonsters - currentTier.minMonsters))
    : 1;

  // Use the minimum fraction — all dimensions must progress to advance.
  const progressFrac = Math.min(securedFrac, deepFrac, monsterFrac);

  // Cannot reach the next tier's threshold without meeting its gates.
  const grandStars = Math.min(
    bandFloor + Math.floor(progressFrac * bandWidth),
    bandCeiling - 1, // Cannot reach next tier without meeting its full gates.
  );

  return { grandStars: Math.max(0, grandStars), total: GRAND_STAR_CAP };
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
 * @param {Object} [options] - Optional configuration.
 * @param {boolean} [options.debug] - When true, attaches `_debugMeta` to the
 *   returned starView so the Doctor (U8) can report projection source.
 * @returns {Object} Star breakdown per monster + grand total.
 */
export function projectPunctuationStars(progress, releaseId, options) {
  const safeProgress = isPlainObject(progress) ? progress : {};
  const items = isPlainObject(safeProgress.items) ? safeProgress.items : {};
  const facets = isPlainObject(safeProgress.facets) ? safeProgress.facets : {};
  const rewardUnits = isPlainObject(safeProgress.rewardUnits) ? safeProgress.rewardUnits : {};
  const rawAttempts = Array.isArray(safeProgress.attempts) ? safeProgress.attempts : [];
  const attempts = normaliseAttempts(rawAttempts);
  const itemSignatureAliases = itemVariantSignatureAliasMap(attempts);
  const rewardUnitEntries = currentReleaseRewardEntries(rewardUnits, releaseId);

  // Build per-monster attempt arrays.
  const monsterAttempts = new Map();
  for (const monsterId of DIRECT_PUNCTUATION_MONSTER_IDS) {
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
  for (const monsterId of DIRECT_PUNCTUATION_MONSTER_IDS) {
    const clusterIds = MONSTER_CLUSTERS.get(monsterId) || new Set();
    const mAttempts = monsterAttempts.get(monsterId) || [];
    const mItems = itemsForMonster(items, attempts, clusterIds);

    const tryStars = computeTryStars(mAttempts);
    const practiceStars = computePracticeStars(mAttempts);
    const secureStars = computeSecureStars(clusterIds, mItems, rewardUnitEntries, monsterId, itemSignatureAliases);
    const masteryStars = computeMasteryStars(clusterIds, facets, rewardUnitEntries, monsterId);
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
  const grand = computeGrandStars(safeProgress, rewardUnitEntries);

  const result = { perMonster, grand };

  // P7-U5: When debug mode is requested, attach source metadata so the
  // Punctuation Doctor (U8) can report whether a starView came from
  // fresh projection or a future cache layer.
  if (options?.debug) {
    result._debugMeta = { source: 'fresh' };
  }

  return result;
}
