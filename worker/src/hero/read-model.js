// Hero Mode — Shadow read-model assembler.
//
// Orchestrates providers, eligibility, and the scheduler into a complete
// shadow response. Pure read-only path — MUST NOT mutate any state, write
// to D1, or increment any revision counter.

import {
  HERO_DEFAULT_EFFORT_TARGET,
  HERO_DEFAULT_TIMEZONE,
  HERO_P1_SCHEDULER_VERSION,
  HERO_SAFETY_FLAGS,
  HERO_READY_SUBJECT_IDS,
} from '../../../shared/hero/constants.js';

import { resolveEligibility } from '../../../shared/hero/eligibility.js';
import { generateHeroSeed, deriveDateKey } from '../../../shared/hero/seed.js';
import { scheduleShadowQuest } from '../../../shared/hero/scheduler.js';
import { deriveTaskId } from '../../../shared/hero/task-envelope.js';
import { buildHeroContext } from '../../../shared/hero/launch-context.js';
import { determineLaunchStatus } from '../../../shared/hero/launch-status.js';
import { mapHeroEnvelopeToSubjectPayload } from './launch-adapters/index.js';
import { runProvider } from './providers/index.js';

function envFlagEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function buildCapabilityRegistry(tasks) {
  const registry = {};
  for (const task of tasks) {
    const subjectId = task.subjectId;
    if (!subjectId) continue;
    if (!registry[subjectId]) {
      registry[subjectId] = { launchers: {} };
    }
    const result = mapHeroEnvelopeToSubjectPayload(task);
    if (result.launchable) {
      registry[subjectId].launchers[task.launcher] = true;
    }
  }
  return registry;
}

/**
 * Assemble the full Hero shadow read model for a learner.
 *
 * @param {Object} params
 * @param {string} params.learnerId
 * @param {Object} params.subjectReadModels — keyed by subjectId, each the
 *   per-subject read-model (or null when absent)
 * @param {number} params.now — epoch milliseconds
 * @param {Object} [params.env] — Worker environment bindings (optional for P0 compat)
 * @returns {Object} shadow read model
 */
export function buildHeroShadowReadModel({
  learnerId,
  subjectReadModels = {},
  now,
  env,
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
    schedulerVersion: HERO_P1_SCHEDULER_VERSION,
    contentReleaseFingerprint: null,
  });

  // 5. Schedule shadow quest
  const quest = scheduleShadowQuest({
    eligibleSnapshots,
    effortTarget: HERO_DEFAULT_EFFORT_TARGET,
    seed,
    schedulerVersion: HERO_P1_SCHEDULER_VERSION,
    dateKey,
  });

  // 6. Enrich tasks with taskId, launchStatus, and heroContext
  const capabilityRegistry = buildCapabilityRegistry(quest.tasks);
  const enrichedTasks = quest.tasks.map((task, ordinal) => {
    const taskId = deriveTaskId(quest.questId, ordinal, task);

    const launchResult = determineLaunchStatus(
      task.subjectId,
      task.launcher,
      capabilityRegistry,
    );

    const heroContext = buildHeroContext({
      quest: { questId: quest.questId, dateKey, timezone: HERO_DEFAULT_TIMEZONE },
      task,
      taskId,
      requestId: null,
      now,
      schedulerVersion: HERO_P1_SCHEDULER_VERSION,
    });

    return {
      ...task,
      taskId,
      launchStatus: launchResult.status,
      launchStatusReason: launchResult.reason || null,
      heroContext,
    };
  });

  // 7. Assemble the full response shape
  return {
    version: 2,
    mode: 'shadow',
    ...HERO_SAFETY_FLAGS,
    dateKey,
    timezone: HERO_DEFAULT_TIMEZONE,
    schedulerVersion: HERO_P1_SCHEDULER_VERSION,
    eligibleSubjects: eligibility.eligible,
    lockedSubjects: eligibility.locked,
    dailyQuest: {
      questId: quest.questId,
      status: quest.status,
      effortTarget: quest.effortTarget,
      effortPlanned: quest.effortPlanned,
      tasks: enrichedTasks,
    },
    launch: {
      enabled: env ? envFlagEnabled(env.HERO_MODE_LAUNCH_ENABLED) : false,
      commandRoute: '/api/hero/command',
      command: 'start-task',
      claimEnabled: false,
      heroStatePersistenceEnabled: false,
    },
    debug: quest.debug,
  };
}
