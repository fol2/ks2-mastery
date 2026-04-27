// Hero Mode P0 — Deterministic shadow scheduler.
//
// Pure function: no Worker, D1, React, Math.random(), or Date.now() imports.
// Given the same inputs, MUST produce the same output every time.
// Imports only from shared/hero/.

import {
  HERO_DEFAULT_EFFORT_TARGET,
  HERO_INTENT_WEIGHTS,
  HERO_MAINTENANCE_INTENTS,
  HERO_SAFETY_FLAGS,
} from './constants.js';

import { createSeededRandom } from './seed.js';

// ── Helpers ──────────────────────────────────────────────────────────

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Derive the subject-mix effort cap fraction based on how many subjects
 * are eligible.
 *
 *   3+ subjects → no single subject exceeds 45% of planned effort
 *   2  subjects → no single subject exceeds 60% of planned effort
 *   1  subject  → 100% (all effort from that subject)
 */
function mixCapFraction(eligibleSubjectCount) {
  if (eligibleSubjectCount >= 3) return 0.45;
  if (eligibleSubjectCount === 2) return 0.60;
  return 1.0;
}

/**
 * Generate a deterministic quest ID from the seed.
 * Uses the seeded RNG to produce a hex suffix.
 */
function deriveQuestId(rng) {
  let hex = '';
  for (let i = 0; i < 8; i++) {
    const nibble = (rng() * 16) | 0;
    hex += nibble.toString(16);
  }
  return `hero-quest-${hex}`;
}

// ── Core scheduler ───────────────────────────────────────────────────

/**
 * Schedule a shadow quest from eligible provider snapshots.
 *
 * @param {Object} params
 * @param {Array<{subjectId: string, signals: Object, envelopes: Array}>} params.eligibleSnapshots
 * @param {number}  [params.effortTarget]      — defaults to HERO_DEFAULT_EFFORT_TARGET (18)
 * @param {number}  params.seed                — from generateHeroSeed
 * @param {string}  [params.schedulerVersion]  — informational
 * @param {string}  [params.dateKey]           — informational
 * @returns {Object} shadow quest descriptor
 */
export function scheduleShadowQuest({
  eligibleSnapshots,
  effortTarget,
  seed,
  schedulerVersion,
  dateKey,
} = {}) {
  const target = Number.isFinite(Number(effortTarget))
    ? Number(effortTarget)
    : HERO_DEFAULT_EFFORT_TARGET;

  const snapshots = Array.isArray(eligibleSnapshots) ? eligibleSnapshots : [];
  const rng = createSeededRandom(seed >>> 0);

  // ── Zero-eligible fast path ──────────────────────────────────────
  if (snapshots.length === 0) {
    const questId = deriveQuestId(rng);
    return {
      questId,
      status: 'shadow',
      effortTarget: target,
      effortPlanned: 0,
      tasks: [],
      debug: {
        candidateCount: 0,
        rejectedCandidates: [],
        subjectMix: {},
        safety: {
          noWrites: !HERO_SAFETY_FLAGS.writesEnabled,
          noCoins: !HERO_SAFETY_FLAGS.coinsEnabled,
          noChildUi: !HERO_SAFETY_FLAGS.childVisible,
          noSubjectMutation: true,
        },
        reason: 'zero-eligible-subjects',
      },
    };
  }

  // ── 1. Collect candidate envelopes ───────────────────────────────
  const candidates = [];
  const eligibleSubjectCount = snapshots.length;

  for (const snapshot of snapshots) {
    if (!isPlainObject(snapshot)) continue;
    const subjectId = snapshot.subjectId;
    const signals = isPlainObject(snapshot.signals) ? snapshot.signals : {};
    const envelopes = Array.isArray(snapshot.envelopes) ? snapshot.envelopes : [];
    const isMegaLike = signals.megaLike === true;

    for (const envelope of envelopes) {
      if (!isPlainObject(envelope)) continue;

      // Mega treatment (origin 11.4): if the snapshot signals megaLike:true,
      // reject non-maintenance envelopes at the scheduler level.
      const intent = typeof envelope.intent === 'string' ? envelope.intent : '';
      if (isMegaLike && !HERO_MAINTENANCE_INTENTS.has(intent)) {
        continue;
      }

      candidates.push({
        envelope,
        subjectId: typeof subjectId === 'string' ? subjectId : '',
        intent,
        isMegaLike,
      });
    }
  }

  // ── 2. Score each candidate ──────────────────────────────────────
  // score = intentWeight * (1 + seedJitter)
  // seedJitter is a small perturbation in [-0.1, +0.1) from the seeded RNG.
  const scored = candidates.map((candidate) => {
    const intentWeight = HERO_INTENT_WEIGHTS[candidate.intent] ?? 0.10;
    const jitter = (rng() * 0.2) - 0.1; // range [-0.1, +0.1)
    const score = intentWeight * (1 + jitter);
    return { ...candidate, score };
  });

  // ── 3. Sort by score descending (deterministic tie-break) ────────
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Tie-break: alphabetical subjectId, then intent
    if (a.subjectId !== b.subjectId) return a.subjectId < b.subjectId ? -1 : 1;
    return a.intent < b.intent ? -1 : a.intent > b.intent ? 1 : 0;
  });

  // ── 4. Greedy selection with subject-mix cap ─────────────────────
  const capFraction = mixCapFraction(eligibleSubjectCount);
  const effortBySubject = {};
  let effortPlanned = 0;
  const selected = [];
  const rejectedCandidates = [];

  for (const candidate of scored) {
    if (effortPlanned >= target) break;

    const envEffort = Number.isFinite(Number(candidate.envelope.effortTarget))
      ? Number(candidate.envelope.effortTarget)
      : 1;

    const subjectEffort = effortBySubject[candidate.subjectId] || 0;
    const projectedSubjectEffort = subjectEffort + envEffort;

    // Subject mix cap: skip if adding this would push the subject's share
    // above the cap.  We measure against the effort target (not the running
    // total) so that early selections are not blocked by small-integer
    // rounding — e.g. 4/8 = 50% would reject a second subject in a 3-subject
    // quest.  Using the target as the denominator means the cap is stable
    // across the entire selection.  For a single eligible subject the cap
    // is 1.0 so this check is a no-op.
    const capBudget = target * capFraction;
    if (capFraction < 1.0 && projectedSubjectEffort > capBudget) {
      rejectedCandidates.push({
        subjectId: candidate.subjectId,
        intent: candidate.intent,
        reason: `subject-mix-cap-exceeded (${candidate.subjectId}: ${projectedSubjectEffort} > ${capBudget})`,
      });
      continue;
    }

    effortBySubject[candidate.subjectId] = projectedSubjectEffort;
    effortPlanned += envEffort;
    selected.push(candidate.envelope);
  }

  // ── 5. Build quest ID deterministically ──────────────────────────
  const questId = deriveQuestId(rng);

  // ── 6. Build debug info ──────────────────────────────────────────
  const subjectMix = { ...effortBySubject };
  const debugReasons = [];

  if (eligibleSubjectCount === 1) {
    const singleSubject = snapshots[0]?.subjectId || 'unknown';
    debugReasons.push(`single-eligible-subject: all effort from ${singleSubject}`);
  }

  if (effortPlanned < target) {
    debugReasons.push(
      `available-effort-below-target: planned ${effortPlanned} < target ${target}`
    );
  }

  const allMegaLike = snapshots.length > 0 &&
    snapshots.every((s) => isPlainObject(s.signals) && s.signals.megaLike === true);

  if (allMegaLike) {
    debugReasons.push('all-subjects-mega-like: maintenance-only quest');
  }

  return {
    questId,
    status: 'shadow',
    effortTarget: target,
    effortPlanned,
    tasks: selected,
    debug: {
      candidateCount: candidates.length,
      rejectedCandidates,
      subjectMix,
      safety: {
        noWrites: !HERO_SAFETY_FLAGS.writesEnabled,
        noCoins: !HERO_SAFETY_FLAGS.coinsEnabled,
        noChildUi: !HERO_SAFETY_FLAGS.childVisible,
        noSubjectMutation: true,
      },
      ...(debugReasons.length > 0 ? { reason: debugReasons.join('; ') } : {}),
    },
  };
}
