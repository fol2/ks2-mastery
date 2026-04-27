// Hero Mode P0 — Shadow read-model assembler.
//
// Orchestrates providers, eligibility, and the scheduler into a complete
// shadow response. Pure read-only path — MUST NOT mutate any state, write
// to D1, or increment any revision counter.

import {
  HERO_DEFAULT_EFFORT_TARGET,
  HERO_DEFAULT_TIMEZONE,
  HERO_SCHEDULER_VERSION,
  HERO_SAFETY_FLAGS,
  HERO_READY_SUBJECT_IDS,
} from '../../../shared/hero/constants.js';

import { resolveEligibility } from '../../../shared/hero/eligibility.js';
import { generateHeroSeed, deriveDateKey } from '../../../shared/hero/seed.js';
import { scheduleShadowQuest } from '../../../shared/hero/scheduler.js';
import { runProvider } from './providers/index.js';

/**
 * Assemble the full Hero shadow read model for a learner.
 *
 * This is the P0 shadow-only path: no writes, no coins, no child UI.
 * The response shape matches origin doc section 2.
 *
 * @param {Object} params
 * @param {string} params.learnerId
 * @param {Object} params.subjectReadModels — keyed by subjectId, each the
 *   per-subject read-model (or null when absent)
 * @param {number} params.now — epoch milliseconds
 * @returns {Object} shadow read model
 */
export function buildHeroShadowReadModel({
  learnerId,
  subjectReadModels = {},
  now,
} = {}) {
  const dateKey = deriveDateKey(now, HERO_DEFAULT_TIMEZONE);

  // 1. Run each provider via the provider registry
  const subjectSnapshots = {};
  for (const subjectId of HERO_READY_SUBJECT_IDS) {
    const readModel = subjectReadModels[subjectId] || null;
    const snapshot = runProvider(subjectId, readModel);
    if (snapshot) {
      subjectSnapshots[subjectId] = snapshot;
    }
  }

  // 2. Resolve eligibility
  const eligibility = resolveEligibility(subjectSnapshots);

  // 3. Build eligible snapshots for the scheduler
  const eligibleSnapshots = eligibility.eligible.map((entry) => {
    const snap = subjectSnapshots[entry.subjectId];
    return snap || null;
  }).filter(Boolean);

  // 4. Generate deterministic seed
  const seed = generateHeroSeed({
    learnerId,
    dateKey,
    timezone: HERO_DEFAULT_TIMEZONE,
    schedulerVersion: HERO_SCHEDULER_VERSION,
    contentReleaseFingerprint: null,
  });

  // 5. Schedule shadow quest
  const quest = scheduleShadowQuest({
    eligibleSnapshots,
    effortTarget: HERO_DEFAULT_EFFORT_TARGET,
    seed,
    schedulerVersion: HERO_SCHEDULER_VERSION,
    dateKey,
  });

  // 6. Assemble the full response shape (origin doc section 2)
  return {
    version: 1,
    mode: 'shadow',
    ...HERO_SAFETY_FLAGS,
    dateKey,
    timezone: HERO_DEFAULT_TIMEZONE,
    schedulerVersion: HERO_SCHEDULER_VERSION,
    eligibleSubjects: eligibility.eligible,
    lockedSubjects: eligibility.locked,
    dailyQuest: {
      questId: quest.questId,
      status: quest.status,
      effortTarget: quest.effortTarget,
      effortPlanned: quest.effortPlanned,
      tasks: quest.tasks,
    },
    debug: quest.debug,
  };
}
