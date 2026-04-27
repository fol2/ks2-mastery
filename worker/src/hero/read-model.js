// Hero Mode — Shadow read-model assembler (v3).
//
// Orchestrates providers, eligibility, and the scheduler into a complete
// shadow response. Pure read-only path — MUST NOT mutate any state, write
// to D1, or increment any revision counter.
//
// v3 adds: questFingerprint, ui block, activeHeroSession, childLabel,
// childReason, copyVersion, and HERO_MODE_CHILD_UI_ENABLED gate.

import {
  HERO_DEFAULT_EFFORT_TARGET,
  HERO_DEFAULT_TIMEZONE,
  HERO_P2_SCHEDULER_VERSION,
  HERO_P2_COPY_VERSION,
  HERO_SAFETY_FLAGS,
  HERO_READY_SUBJECT_IDS,
} from '../../../shared/hero/constants.js';

import { resolveEligibility } from '../../../shared/hero/eligibility.js';
import { generateHeroSeed, deriveDateKey } from '../../../shared/hero/seed.js';
import { scheduleShadowQuest } from '../../../shared/hero/scheduler.js';
import { deriveTaskId } from '../../../shared/hero/task-envelope.js';
import { buildHeroContext } from '../../../shared/hero/launch-context.js';
import { determineLaunchStatus } from '../../../shared/hero/launch-status.js';
import { deriveHeroQuestFingerprint } from '../../../shared/hero/quest-fingerprint.js';
import { resolveChildLabel, resolveChildReason } from '../../../shared/hero/hero-copy.js';
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
 * Derive the ui.reason code from the flag hierarchy and task state.
 */
function resolveUiReason({ shadowEnabled, launchEnabled, childUiEnabled, hasEligibleSubjects, hasLaunchableTasks }) {
  if (!shadowEnabled) return 'shadow-disabled';
  if (!launchEnabled) return 'launch-disabled';
  if (!childUiEnabled) return 'child-ui-disabled';
  if (!hasEligibleSubjects) return 'no-eligible-subjects';
  if (!hasLaunchableTasks) return 'no-launchable-tasks';
  return 'enabled';
}

/**
 * Assemble the full Hero shadow read model for a learner (v3).
 *
 * @param {Object} params
 * @param {string} params.learnerId
 * @param {string} [params.accountId] — account owner ID (for fingerprint)
 * @param {Object} params.subjectReadModels — keyed by subjectId, each the
 *   per-subject read-model (or null when absent)
 * @param {number} params.now — epoch milliseconds
 * @param {Object} [params.env] — Worker environment bindings (optional for P0 compat)
 * @returns {Object} shadow read model v3
 */
export function buildHeroShadowReadModel({
  learnerId,
  accountId,
  subjectReadModels = {},
  now,
  env,
} = {}) {
  const dateKey = deriveDateKey(now, HERO_DEFAULT_TIMEZONE);
  const safeEnv = env || {};

  // Feature flag hierarchy
  const shadowEnabled = envFlagEnabled(safeEnv.HERO_MODE_SHADOW_ENABLED);
  const launchEnabled = envFlagEnabled(safeEnv.HERO_MODE_LAUNCH_ENABLED);
  const childUiEnabled = envFlagEnabled(safeEnv.HERO_MODE_CHILD_UI_ENABLED);

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
    schedulerVersion: HERO_P2_SCHEDULER_VERSION,
    contentReleaseFingerprint: null,
  });

  // 5. Schedule shadow quest
  const quest = scheduleShadowQuest({
    eligibleSnapshots,
    effortTarget: HERO_DEFAULT_EFFORT_TARGET,
    seed,
    schedulerVersion: HERO_P2_SCHEDULER_VERSION,
    dateKey,
  });

  // 6. Enrich tasks with taskId, launchStatus, heroContext, childLabel, childReason
  const capabilityRegistry = buildCapabilityRegistry(quest.tasks);
  const hasLaunchableTasks = quest.tasks.some((task) => {
    const result = determineLaunchStatus(task.subjectId, task.launcher, capabilityRegistry);
    return result.launchable;
  });

  // 7. Derive quest fingerprint
  const eligibleSubjectIds = eligibility.eligible.map((e) => e.subjectId);
  const lockedSubjectIds = eligibility.locked.map((e) => e.subjectId);

  // Build per-subject provider snapshot fingerprints
  const providerSnapshotFingerprints = {};
  for (const subjectId of [...eligibleSubjectIds, ...lockedSubjectIds]) {
    const snap = subjectSnapshots[subjectId];
    if (snap && typeof snap.contentReleaseFingerprint === 'string') {
      providerSnapshotFingerprints[subjectId] = snap.contentReleaseFingerprint;
    }
    // Otherwise omitted — deriveHeroQuestFingerprint uses the missing marker
  }

  const taskDigests = quest.tasks.map((task, ordinal) => ({
    taskId: deriveTaskId(quest.questId, ordinal, task),
    intent: task.intent,
    launcher: task.launcher,
    subjectId: task.subjectId,
  }));

  const questFingerprint = deriveHeroQuestFingerprint({
    learnerId,
    accountId: accountId || '',
    dateKey,
    timezone: HERO_DEFAULT_TIMEZONE,
    schedulerVersion: HERO_P2_SCHEDULER_VERSION,
    eligibleSubjectIds,
    lockedSubjectIds,
    providerSnapshotFingerprints,
    taskDigests,
  });

  // 8. Enrich tasks
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
      schedulerVersion: HERO_P2_SCHEDULER_VERSION,
      questFingerprint,
    });

    return {
      ...task,
      taskId,
      launchStatus: launchResult.status,
      launchStatusReason: launchResult.reason || null,
      heroContext,
      childLabel: resolveChildLabel(task.intent, task.subjectId),
      childReason: resolveChildReason(task.intent),
    };
  });

  // 9. Resolve ui block
  const uiReason = resolveUiReason({
    shadowEnabled,
    launchEnabled,
    childUiEnabled,
    hasEligibleSubjects: eligibility.eligible.length > 0,
    hasLaunchableTasks,
  });

  const ui = {
    enabled: uiReason === 'enabled',
    surface: 'dashboard-card',
    reason: uiReason,
    copyVersion: HERO_P2_COPY_VERSION,
  };

  // 10. Assemble the full v3 response shape
  return {
    version: 3,
    mode: 'shadow',
    childVisible: childUiEnabled,
    coinsEnabled: HERO_SAFETY_FLAGS.coinsEnabled,
    writesEnabled: HERO_SAFETY_FLAGS.writesEnabled,
    dateKey,
    timezone: HERO_DEFAULT_TIMEZONE,
    schedulerVersion: HERO_P2_SCHEDULER_VERSION,
    questFingerprint,
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
      enabled: launchEnabled,
      commandRoute: '/api/hero/command',
      command: 'start-task',
      claimEnabled: false,
      heroStatePersistenceEnabled: false,
    },
    ui,
    activeHeroSession: null,
    debug: quest.debug,
  };
}
