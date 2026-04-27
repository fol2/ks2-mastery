// P7-U8: Punctuation Doctor diagnostic read model.
//
// Server-side only — lives under `worker/src/` and is forbidden from the
// client bundle by the `FORBIDDEN_MODULES` audit pattern.
//
// Computes a safe diagnostic snapshot that developers/operators can use
// to explain Punctuation state without exposing answer banks, validators,
// or learner answers. Only IDs, counts, booleans, timestamps, and safe
// labels appear in the output.

import { projectPunctuationStars } from '../../../../src/subjects/punctuation/star-projection.js';
import {
  ACTIVE_PUNCTUATION_MONSTER_IDS,
  DIRECT_PUNCTUATION_MONSTER_IDS,
  PUNCTUATION_GRAND_MONSTER_ID,
  PUNCTUATION_CLIENT_REWARD_UNITS,
  MONSTER_CLUSTERS,
  MONSTER_UNIT_COUNT,
  SKILL_TO_CLUSTER,
} from '../../../../src/subjects/punctuation/punctuation-manifest.js';
import {
  stageFor,
  PUNCTUATION_STAR_THRESHOLDS,
  PUNCTUATION_GRAND_STAR_THRESHOLDS,
} from '../../../../src/platform/game/monsters.js';
import {
  PUNCTUATION_RELEASE_ID,
} from '../../../../shared/punctuation/content.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n + 1e-9) : fallback;
}

function safeNonNegInt(value) {
  return Math.max(0, safeInt(value, 0));
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Mirrors star-projection.js memorySnapshot — secure bucket check. */
function isSecureFacet(facetState) {
  const raw = isPlainObject(facetState) ? facetState : {};
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
  return { secure, lapses };
}

// ---------------------------------------------------------------------------
// Per-monster reward-unit counting
// ---------------------------------------------------------------------------

function countRewardUnitsForMonster(rewardUnits, monsterClusterIds) {
  const entries = isPlainObject(rewardUnits) ? rewardUnits : {};
  let tracked = 0;
  let secured = 0;
  let deepSecured = 0;

  // We cannot check deep-secure here (needs facets), so return partial.
  for (const [, entry] of Object.entries(entries)) {
    if (!isPlainObject(entry)) continue;
    const clusterId = typeof entry.clusterId === 'string' ? entry.clusterId : '';
    if (!monsterClusterIds.has(clusterId)) continue;
    tracked += 1;
    const securedAt = Number(entry.securedAt);
    if (Number.isFinite(securedAt) && securedAt > 0) {
      secured += 1;
    }
  }

  return { tracked, secured, deepSecured };
}

function countDeepSecuredForMonster(rewardUnits, facets, monsterClusterIds) {
  const rewardEntries = isPlainObject(rewardUnits) ? rewardUnits : {};
  const facetEntries = isPlainObject(facets) ? facets : {};

  // Build cluster -> skill lookup.
  const clusterToSkills = new Map();
  for (const [skillId, clusterId] of SKILL_TO_CLUSTER.entries()) {
    if (!monsterClusterIds.has(clusterId)) continue;
    if (!clusterToSkills.has(clusterId)) clusterToSkills.set(clusterId, new Set());
    clusterToSkills.get(clusterId).add(skillId);
  }

  let deepSecuredCount = 0;
  for (const [, entry] of Object.entries(rewardEntries)) {
    if (!isPlainObject(entry)) continue;
    const clusterId = typeof entry.clusterId === 'string' ? entry.clusterId : '';
    if (!monsterClusterIds.has(clusterId)) continue;
    const securedAt = Number(entry.securedAt);
    if (!Number.isFinite(securedAt) || securedAt <= 0) continue;

    const skillIds = clusterToSkills.get(clusterId);
    if (!skillIds) continue;

    let hasDeepSecureFacet = false;
    for (const [facetId, facetState] of Object.entries(facetEntries)) {
      const [skillId] = facetId.split('::');
      if (!skillIds.has(skillId)) continue;
      const snap = isSecureFacet(facetState);
      if (snap.secure && snap.lapses === 0) {
        hasDeepSecureFacet = true;
        break;
      }
    }
    if (hasDeepSecureFacet) deepSecuredCount += 1;
  }

  return deepSecuredCount;
}

// ---------------------------------------------------------------------------
// Mega-blocked reasons
// ---------------------------------------------------------------------------

function megaBlockedReasons(monsterId, monsterStar, rewardUnitCounts) {
  const reasons = [];
  const totalUnits = MONSTER_UNIT_COUNT[monsterId] || 0;

  if (monsterStar.total < 100) {
    reasons.push('insufficient total stars');
  }

  if (monsterId === 'claspin') {
    if (rewardUnitCounts.secured < totalUnits) {
      reasons.push('insufficient secured units');
    }
    if (rewardUnitCounts.deepSecured < totalUnits) {
      reasons.push('insufficient deep-secured units');
    }
  }

  if (monsterId === 'curlune') {
    const minDeepSecured = Math.ceil(totalUnits * 0.71); // 5 of 7
    if (rewardUnitCounts.deepSecured < minDeepSecured) {
      reasons.push(`insufficient breadth (${rewardUnitCounts.deepSecured}/${minDeepSecured} deep-secured)`);
    }
    if (rewardUnitCounts.secured < minDeepSecured) {
      reasons.push(`insufficient secured units (${rewardUnitCounts.secured}/${minDeepSecured})`);
    }
  }

  if (monsterId === 'pealark') {
    if (rewardUnitCounts.secured < totalUnits) {
      reasons.push('insufficient secured units');
    }
    if (rewardUnitCounts.deepSecured < totalUnits) {
      reasons.push('insufficient deep-secured units');
    }
  }

  return reasons;
}

// ---------------------------------------------------------------------------
// Main diagnostic builder
// ---------------------------------------------------------------------------

/**
 * Build a safe Punctuation diagnostic snapshot.
 *
 * @param {Object} subjectState - The subject state record (contains `data.progress`).
 * @param {Object} codexEntries - Per-monster codex state (starHighWater, maxStageEver, etc.).
 * @param {Object} [telemetryStats] - Optional telemetry statistics.
 * @returns {Object} Diagnostic payload — safe for operator consumption.
 */
export function buildPunctuationDiagnostic(subjectState, codexEntries, telemetryStats) {
  const state = isPlainObject(subjectState) ? subjectState : {};
  const data = isPlainObject(state.data) ? state.data : {};
  const progress = isPlainObject(data.progress) ? data.progress : {};
  const codex = isPlainObject(codexEntries) ? codexEntries : {};
  const telemetry = isPlainObject(telemetryStats) ? telemetryStats : {};

  // Project live stars.
  const starLedger = projectPunctuationStars(progress, PUNCTUATION_RELEASE_ID, { debug: true });
  const rewardUnits = isPlainObject(progress.rewardUnits) ? progress.rewardUnits : {};
  const facets = isPlainObject(progress.facets) ? progress.facets : {};

  // Build per-monster diagnostic entries.
  const monsters = {};
  for (const monsterId of DIRECT_PUNCTUATION_MONSTER_IDS) {
    const monsterStar = starLedger.perMonster[monsterId] || {
      tryStars: 0, practiceStars: 0, secureStars: 0, masteryStars: 0, total: 0,
    };
    const clusterIds = MONSTER_CLUSTERS.get(monsterId) || new Set();

    // Codex state for this monster.
    const monsterCodex = isPlainObject(codex[monsterId]) ? codex[monsterId] : {};
    const starHighWater = safeNonNegInt(monsterCodex.starHighWater);
    const maxStageEver = safeNonNegInt(monsterCodex.maxStageEver);
    const liveStars = Math.floor(monsterStar.total + 1e-9);
    const stage = stageFor(liveStars, PUNCTUATION_STAR_THRESHOLDS);
    const delta = liveStars - starHighWater;

    // Reward unit counts.
    const ruCounts = countRewardUnitsForMonster(rewardUnits, clusterIds);
    ruCounts.deepSecured = countDeepSecuredForMonster(rewardUnits, facets, clusterIds);

    monsters[monsterId] = {
      monsterId,
      liveStars,
      starHighWater,
      delta,
      stage,
      maxStageEver,
      tryStars: Math.floor(monsterStar.tryStars + 1e-9),
      practiceStars: Math.floor(monsterStar.practiceStars + 1e-9),
      secureStars: Math.floor(monsterStar.secureStars + 1e-9),
      masteryStars: Math.floor(monsterStar.masteryStars + 1e-9),
      megaBlocked: megaBlockedReasons(monsterId, monsterStar, ruCounts),
      rewardUnitsTracked: ruCounts.tracked,
      rewardUnitsSecured: ruCounts.secured,
      rewardUnitsDeepSecured: ruCounts.deepSecured,
    };
  }

  // Quoral (grand monster).
  const grandCodex = isPlainObject(codex[PUNCTUATION_GRAND_MONSTER_ID])
    ? codex[PUNCTUATION_GRAND_MONSTER_ID]
    : {};
  const grandStars = Math.floor((starLedger.grand?.grandStars ?? 0) + 1e-9);
  const grandStage = stageFor(grandStars, PUNCTUATION_GRAND_STAR_THRESHOLDS);
  const grandStarHighWater = safeNonNegInt(grandCodex.starHighWater);
  const grandMaxStageEver = safeNonNegInt(grandCodex.maxStageEver);

  // Cross-monster breadth for grand.
  let totalSecured = 0;
  let totalDeepSecured = 0;
  const monstersWithSecured = [];

  for (const monsterId of DIRECT_PUNCTUATION_MONSTER_IDS) {
    const entry = monsters[monsterId];
    if (entry && entry.rewardUnitsSecured > 0) {
      monstersWithSecured.push(monsterId);
    }
    totalSecured += (entry?.rewardUnitsSecured || 0);
    totalDeepSecured += (entry?.rewardUnitsDeepSecured || 0);
  }

  const grand = {
    monsterId: PUNCTUATION_GRAND_MONSTER_ID,
    grandStars,
    grandStage,
    grandStarHighWater,
    grandMaxStageEver,
    grandDelta: grandStars - grandStarHighWater,
    monstersWithSecured,
    totalSecured,
    totalDeepSecured,
    totalRewardUnits: PUNCTUATION_CLIENT_REWARD_UNITS.length,
  };

  // Latch state per monster.
  const latchState = {};
  for (const monsterId of ACTIVE_PUNCTUATION_MONSTER_IDS) {
    if (monsterId === PUNCTUATION_GRAND_MONSTER_ID) {
      latchState[monsterId] = {
        latchLeadsLive: grandStarHighWater > grandStars,
        liveLeadsLatch: grandStars > grandStarHighWater,
      };
    } else {
      const entry = monsters[monsterId];
      if (entry) {
        latchState[monsterId] = {
          latchLeadsLive: entry.starHighWater > entry.liveStars,
          liveLeadsLatch: entry.liveStars > entry.starHighWater,
        };
      }
    }
  }

  // Session context from state.
  const sessionCtx = {
    sessionId: typeof state.sessionId === 'string' ? state.sessionId : null,
    commandCount: safeNonNegInt(state.commandCount),
    lastCommandAt: safeNonNegInt(state.lastCommandAt),
  };

  // Telemetry summary (safe counts only).
  const telemetrySummary = {};
  if (isPlainObject(telemetry.perKind)) {
    for (const [kind, stats] of Object.entries(telemetry.perKind)) {
      telemetrySummary[kind] = {
        eventsAccepted: safeNonNegInt(stats.accepted),
        eventsDropped: safeNonNegInt(stats.dropped),
        eventsDeduped: safeNonNegInt(stats.deduped),
        eventsRateLimited: safeNonNegInt(stats.rateLimited),
        lastEventAt: safeNonNegInt(stats.lastEventAt),
      };
    }
  }

  // Projection metadata from the debug star ledger.
  const projectionSource = starLedger._debugMeta?.source || 'fresh';

  return {
    subjectId: 'punctuation',
    generatedAt: Date.now(),
    releaseId: PUNCTUATION_RELEASE_ID,
    monsters,
    grand,
    latchState,
    sessionContext: sessionCtx,
    telemetrySummary,
    projectionSource,
    totalPublishedRewardUnits: PUNCTUATION_CLIENT_REWARD_UNITS.length,
    activeMonsterIds: [...ACTIVE_PUNCTUATION_MONSTER_IDS],
    directMonsterIds: [...DIRECT_PUNCTUATION_MONSTER_IDS],
  };
}
