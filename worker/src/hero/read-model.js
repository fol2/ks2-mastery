// Hero Mode — Shadow read-model assembler (v3 / v4).
//
// Orchestrates providers, eligibility, and the scheduler into a complete
// shadow response. Pure read-only path — MUST NOT mutate any state, write
// to D1, or increment any revision counter.
//
// v3 adds: questFingerprint, ui block, activeHeroSession, childLabel,
// childReason, copyVersion, and HERO_MODE_CHILD_UI_ENABLED gate.
//
// v4 adds: progress merge, per-task completionStatus, pending completed
// session detection, progress/claim blocks, writesEnabled, and mode='progress'.

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
import { deriveTaskCompletionStatus, deriveDailyCompletionStatus } from '../../../shared/hero/completion-status.js';
import { mapHeroEnvelopeToSubjectPayload } from './launch-adapters/index.js';
import { runProvider } from './providers/index.js';

function envFlagEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function safeParseJson(text) {
  if (text == null || text === '') return null;
  try { return JSON.parse(text); } catch { return null; }
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
 * Detect a pending completed Hero session — a task that was started but not
 * yet claimed where a matching completed practice_session already exists.
 */
function detectPendingCompletedSession(heroProgressState, recentCompletedSessions, activeHeroSession) {
  if (!heroProgressState?.daily?.tasks) return null;

  for (const [taskId, task] of Object.entries(heroProgressState.daily.tasks)) {
    if (task.status !== 'started' || task.claimRequestId) continue;

    // Skip if an active hero session is running for this task (not yet completed)
    if (activeHeroSession && activeHeroSession.taskId === taskId) continue;

    // Look for a completed practice session matching this task
    const matchingSession = recentCompletedSessions.find(row => {
      if (row.subject_id !== task.subjectId) return false;
      const summary = safeParseJson(row.summary_json);
      if (!summary?.heroContext) return false;
      return summary.heroContext.taskId === taskId &&
             summary.heroContext.questId === task.questId;
    });

    if (matchingSession) {
      return {
        taskId,
        questId: task.questId,
        questFingerprint: task.questFingerprint,
        subjectId: task.subjectId,
        practiceSessionId: matchingSession.id,
      };
    }
  }
  return null;
}

/**
 * Assemble the full Hero shadow read model for a learner (v3/v4).
 *
 * @param {Object} params
 * @param {string} params.learnerId
 * @param {string} [params.accountId] — account owner ID (for fingerprint)
 * @param {Object} params.subjectReadModels — keyed by subjectId, each the
 *   per-subject read-model (or null when absent)
 * @param {number} params.now — epoch milliseconds
 * @param {Object} [params.env] — Worker environment bindings (optional for P0 compat)
 * @param {Object} [params.heroProgressState] — normalised hero progress state (v4)
 * @param {Array}  [params.recentCompletedSessions] — recent completed practice session rows (v4)
 * @param {boolean} [params.progressEnabled] — whether progress mode is enabled (v4)
 * @returns {Object} shadow read model v3 or v4
 */
export function buildHeroShadowReadModel({
  learnerId,
  accountId,
  subjectReadModels = {},
  now,
  env,
  heroProgressState = null,
  recentCompletedSessions = [],
  progressEnabled = false,
} = {}) {
  const dateKey = deriveDateKey(now, HERO_DEFAULT_TIMEZONE);
  const safeEnv = env || {};

  // Feature flag hierarchy
  const shadowEnabled = envFlagEnabled(safeEnv.HERO_MODE_SHADOW_ENABLED);
  const launchEnabled = envFlagEnabled(safeEnv.HERO_MODE_LAUNCH_ENABLED);
  const childUiEnabled = envFlagEnabled(safeEnv.HERO_MODE_CHILD_UI_ENABLED);

  // 1. Run each provider via the provider registry.
  //    subjectReadModels is keyed by subjectId. Each value is either:
  //    - { data, ui } (P2 expanded shape from repository), or
  //    - a raw data object (P0/P1 compat from unit tests).
  //    Providers always receive the data portion only.
  const subjectSnapshots = {};
  for (const subjectId of HERO_READY_SUBJECT_IDS) {
    const entry = subjectReadModels[subjectId] || null;
    // Support both { data, ui } (P2) and raw data object (P0 compat)
    const readModel = entry && typeof entry === 'object' && 'data' in entry
      ? entry.data
      : entry;
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

  // 10. Detect active Hero session from ui_json.
  //     Inspect each subject's ui field for session.heroContext.source === 'hero-mode'.
  let activeHeroSession = null;
  for (const subjectId of HERO_READY_SUBJECT_IDS) {
    const entry = subjectReadModels[subjectId];
    if (!entry || typeof entry !== 'object') continue;
    const ui_data = 'ui' in entry ? entry.ui : null;
    if (!ui_data || typeof ui_data !== 'object') continue;
    const session = ui_data.session;
    if (!session || typeof session !== 'object') continue;
    const heroCtx = session.heroContext;
    if (!heroCtx || typeof heroCtx !== 'object') continue;
    if (heroCtx.source !== 'hero-mode') continue;
    activeHeroSession = {
      subjectId,
      questId: heroCtx.questId || null,
      questFingerprint: heroCtx.questFingerprint || null,
      taskId: heroCtx.taskId || null,
      intent: heroCtx.intent || null,
      launcher: heroCtx.launcher || null,
      status: 'in-progress',
    };
    break;
  }

  // 11. If progress is NOT enabled, return v3 shape unchanged.
  if (!progressEnabled) {
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
      activeHeroSession,
      debug: quest.debug,
    };
  }

  // 12. V4: merge scheduled tasks with persisted progress state
  const daily = heroProgressState?.daily || null;
  const progressTasks = daily?.tasks || {};
  const progressDateMatch = daily?.dateKey === dateKey;

  // Merge enriched tasks with progress: derive completionStatus per task
  const mergedTasks = enrichedTasks.map(task => {
    const progressTask = progressDateMatch ? (progressTasks[task.taskId] || null) : null;
    const completionStatus = deriveTaskCompletionStatus(progressTask, activeHeroSession);
    return {
      ...task,
      completionStatus,
      completedAt: progressTask?.completedAt || null,
      effortCompleted: progressTask?.status === 'completed' ? (progressTask.effortTarget || 0) : 0,
      canClaim: completionStatus === 'completed-unclaimed',
    };
  });

  // Orphan handling: tasks in progress but not in current schedule (preserved as completed)
  if (progressDateMatch) {
    const scheduledTaskIds = new Set(enrichedTasks.map(t => t.taskId));
    for (const [taskId, progressTask] of Object.entries(progressTasks)) {
      if (scheduledTaskIds.has(taskId)) continue;
      if (progressTask.status !== 'completed') continue;
      // Preserve orphaned completed task
      mergedTasks.push({
        taskId,
        subjectId: progressTask.subjectId,
        intent: progressTask.intent,
        launcher: progressTask.launcher,
        effortTarget: progressTask.effortTarget || 0,
        completionStatus: 'completed',
        completedAt: progressTask.completedAt || null,
        effortCompleted: progressTask.effortTarget || 0,
        canClaim: false,
        heroContext: null,
        launchStatus: 'not-launchable',
        launchStatusReason: 'orphaned-completed',
        childLabel: null,
        childReason: null,
      });
    }
  }

  // 13. Compute aggregate progress fields
  const effortCompleted = mergedTasks.reduce((sum, t) => sum + (t.effortCompleted || 0), 0);
  const completedTaskIds = mergedTasks
    .filter(t => t.completionStatus === 'completed')
    .map(t => t.taskId);
  const completedTaskCount = completedTaskIds.length;

  // Determine daily quest status from progress
  const dailyProgressStatus = progressDateMatch
    ? deriveDailyCompletionStatus(daily)
    : 'none';
  const questStatus = dailyProgressStatus === 'completed' ? 'completed'
    : dailyProgressStatus === 'active' ? 'active'
    : quest.status;

  // 14. Detect pending completed session
  const pendingCompletedHeroSession = detectPendingCompletedSession(
    heroProgressState,
    recentCompletedSessions,
    activeHeroSession,
  );

  // 15. Determine claim availability
  const canClaim = mergedTasks.some(t => t.canClaim);
  const pendingClaimTaskId = pendingCompletedHeroSession?.taskId || null;

  // 16. Assemble v4 response shape
  return {
    version: 4,
    mode: 'progress',
    childVisible: childUiEnabled,
    coinsEnabled: false,
    writesEnabled: true,
    dateKey,
    timezone: HERO_DEFAULT_TIMEZONE,
    schedulerVersion: HERO_P2_SCHEDULER_VERSION,
    questFingerprint,
    eligibleSubjects: eligibility.eligible,
    lockedSubjects: eligibility.locked,
    dailyQuest: {
      questId: quest.questId,
      status: questStatus,
      effortTarget: quest.effortTarget,
      effortPlanned: quest.effortPlanned,
      effortCompleted,
      taskCount: mergedTasks.length,
      completedTaskCount,
      tasks: mergedTasks,
    },
    progress: {
      enabled: true,
      stateVersion: 1,
      dateKey,
      status: dailyProgressStatus,
      effortCompleted,
      effortPlanned: quest.effortPlanned,
      completedTaskIds,
      justCompletedTaskId: null,
      canClaim,
      pendingClaimTaskId,
    },
    launch: {
      enabled: launchEnabled,
      commandRoute: '/api/hero/command',
      command: 'start-task',
      claimEnabled: true,
      heroStatePersistenceEnabled: true,
    },
    claim: {
      enabled: true,
      commandRoute: '/api/hero/command',
      command: 'claim-task',
    },
    ui,
    activeHeroSession,
    pendingCompletedHeroSession,
    debug: quest.debug,
  };
}
