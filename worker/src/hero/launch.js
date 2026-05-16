import { BadRequestError, NotFoundError, ConflictError } from '../errors.js';
import { buildHeroShadowReadModel } from './read-model.js';
import { mapHeroEnvelopeToSubjectPayload } from './launch-adapters/index.js';
import { buildHeroContext, sanitiseHeroContext } from '../../../shared/hero/launch-context.js';
import {
  HERO_P2_SCHEDULER_VERSION,
  HERO_DEFAULT_TIMEZONE,
  HERO_LAUNCH_CONTRACT_VERSION,
  HERO_READY_SUBJECT_IDS,
} from '../../../shared/hero/constants.js';

import { resolveHeroFlagsWithOverride } from '../../../shared/hero/account-override.js';

function envFlagEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

/**
 * Detect any active (non-Hero) subject session from the expanded
 * subject read models. Returns { subjectId } if found, null otherwise.
 */
function detectNonHeroActiveSession(subjectReadModels) {
  for (const subjectId of HERO_READY_SUBJECT_IDS) {
    const entry = subjectReadModels[subjectId];
    if (!entry || typeof entry !== 'object') continue;
    const ui = 'ui' in entry ? entry.ui : null;
    if (!ui || typeof ui !== 'object') continue;
    const session = ui.session;
    if (!session || typeof session !== 'object') continue;
    // Session exists — check if it is a Hero session or a regular session
    const heroCtx = session.heroContext;
    if (heroCtx && typeof heroCtx === 'object' && heroCtx.source === 'hero-mode') {
      continue; // Hero session — skip (handled by activeHeroSession detection)
    }
    // Non-Hero active session: check that the session has meaningful state
    // (not just an empty object from initial seeding)
    if (session.id || session.startedAt || session.mode) {
      return { subjectId };
    }
  }
  return null;
}

export async function resolveHeroStartTaskCommand({ body, repository, env, now, accountId: callerAccountId }) {
  const command = body?.command;
  if (!command) {
    throw new BadRequestError('Hero command is required.', {
      code: 'hero_command_required',
    });
  }
  if (command !== 'start-task') {
    const safeCommand = String(command).slice(0, 64).replace(/[^a-zA-Z0-9_-]/g, '');
    throw new BadRequestError(`Unsupported Hero command: ${safeCommand}`, {
      code: 'hero_command_unsupported',
      command: safeCommand,
    });
  }

  if (body.subjectId !== undefined) {
    throw new BadRequestError('Client must not supply subjectId on Hero commands.', {
      code: 'hero_client_field_rejected',
      field: 'subjectId',
    });
  }
  if (body.payload !== undefined) {
    throw new BadRequestError('Client must not supply payload on Hero commands.', {
      code: 'hero_client_field_rejected',
      field: 'payload',
    });
  }

  const learnerId = typeof body.learnerId === 'string' ? body.learnerId.trim() : '';
  const questId = typeof body.questId === 'string' ? body.questId.trim() : '';
  const taskId = typeof body.taskId === 'string' ? body.taskId.trim() : '';
  const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
  const clientQuestFingerprint = body.questFingerprint !== undefined
    ? body.questFingerprint
    : undefined;
  const correlationId = typeof body.correlationId === 'string' && body.correlationId.trim()
    ? body.correlationId.trim()
    : requestId;
  const expectedLearnerRevision = Number(body.expectedLearnerRevision);

  if (!learnerId) {
    throw new BadRequestError('learnerId is required for Hero start-task.', {
      code: 'hero_learner_id_required',
    });
  }
  if (!questId) {
    throw new BadRequestError('questId is required for Hero start-task.', {
      code: 'hero_quest_id_required',
    });
  }
  if (!taskId) {
    throw new BadRequestError('taskId is required for Hero start-task.', {
      code: 'hero_task_id_required',
    });
  }
  if (!requestId) {
    throw new BadRequestError('requestId is required for Hero start-task.', {
      code: 'command_request_id_required',
    });
  }
  if (!Number.isFinite(expectedLearnerRevision)) {
    throw new BadRequestError('expectedLearnerRevision is required for Hero start-task.', {
      code: 'command_revision_required',
    });
  }

  // Per-account override: team accounts in HERO_INTERNAL_ACCOUNTS get all flags on
  const resolvedEnv = resolveHeroFlagsWithOverride({ env, accountId: callerAccountId });
  const childUiEnabled = envFlagEnabled(resolvedEnv.HERO_MODE_CHILD_UI_ENABLED);

  // Quest fingerprint validation: required when child UI is enabled
  if (childUiEnabled) {
    if (typeof clientQuestFingerprint !== 'string' || !clientQuestFingerprint.trim()) {
      throw new BadRequestError('questFingerprint is required when child UI is enabled.', {
        code: 'hero_quest_fingerprint_required',
      });
    }
  }

  const subjectReadModels = await repository.readHeroSubjectReadModels(learnerId, {
    accountId: callerAccountId,
    now,
  });
  const progressEnabled = envFlagEnabled(resolvedEnv.HERO_MODE_PROGRESS_ENABLED);
  const heroProgressState = progressEnabled && typeof repository.readHeroProgress === 'function'
    ? await repository.readHeroProgress(learnerId)
    : null;
  const heroReadModel = buildHeroShadowReadModel({
    learnerId,
    accountId: callerAccountId || '',
    subjectReadModels,
    now,
    env: resolvedEnv,
    heroProgressState,
    progressEnabled,
  });

  const quest = heroReadModel.dailyQuest;

  // Active session detection (P2 U2). This must run before stale quest
  // validation: a real Hero-launched subject session carries launchRequestId,
  // which intentionally rotates the scheduled quest identity while the active
  // session remains the authoritative next action.
  const activeSession = heroReadModel.activeHeroSession;

  if (activeSession) {
    // Same taskId → safe idempotent-style response
    if (activeSession.taskId === taskId) {
      const matchingTask = quest?.tasks?.find((t) => t.taskId === taskId) || null;
      const matchingProgressTask = heroProgressState?.daily?.tasks?.[taskId] || null;
      const matchingCompletionStatus = matchingTask?.completionStatus
        || progressTaskConflictStatus(matchingProgressTask)
        || 'not-started';
      if (matchingCompletionStatus === 'completed') {
        throw new ConflictError('Hero task is already completed.', {
          code: 'hero_task_already_completed',
          taskId,
          questId,
        });
      }
      if (matchingCompletionStatus === 'completed-unclaimed') {
        throw new ConflictError('Hero task is waiting for its completion claim.', {
          code: 'hero_task_claim_pending',
          taskId,
          questId,
        });
      }
      if (matchingCompletionStatus === 'blocked') {
        throw new ConflictError('Hero task is blocked.', {
          code: 'hero_task_blocked',
          taskId,
          questId,
        });
      }
      const activeQuestId = activeSession.questId || questId;
      const activeSessionEffortTarget = Number(activeSession.effortTarget);
      const activeEffortTarget = Number.isFinite(activeSessionEffortTarget) && activeSessionEffortTarget > 0
        ? activeSessionEffortTarget
        : (Number(matchingTask?.effortTarget) || 0);
      const activeQuestFingerprint = activeSession.questFingerprint
        || (matchingTask ? heroReadModel.questFingerprint : null)
        || null;
      const activeDateKey = activeSession.dateKey || heroReadModel.dateKey;
      const activeTimezone = activeSession.timezone || heroReadModel.timezone || HERO_DEFAULT_TIMEZONE;
      const activeSchedulerVersion = activeSession.schedulerVersion
        || heroReadModel.schedulerVersion
        || HERO_P2_SCHEDULER_VERSION;
      const heroLaunch = {
        version: HERO_LAUNCH_CONTRACT_VERSION,
        status: 'already-started',
        questId: activeQuestId,
        questFingerprint: activeQuestFingerprint,
        taskId,
        dateKey: activeDateKey,
        subjectId: activeSession.subjectId,
        intent: activeSession.intent || matchingTask?.intent || '',
        launcher: activeSession.launcher || matchingTask?.launcher || '',
        effortTarget: activeEffortTarget,
        subjectCommand: 'start-session',
        coinsEnabled: false,
        claimEnabled: false,
        childVisible: childUiEnabled,
        activeSession: {
          subjectId: activeSession.subjectId,
          taskId: activeSession.taskId,
          questId: activeQuestId,
          questFingerprint: activeQuestFingerprint,
        },
      };
      // P3 U4: expose quest metadata for progress marker (already-started path)
      const questContext = {
        questId: activeQuestId,
        questFingerprint: activeQuestFingerprint,
        schedulerVersion: activeSchedulerVersion,
        effortTarget: quest?.effortTarget || activeEffortTarget,
        tasks: matchingTask ? (quest.tasks || []).map(t => ({
          taskId: t.taskId,
          subjectId: t.subjectId,
          intent: t.intent || null,
          launcher: t.launcher || null,
          effortTarget: t.effortTarget || 0,
        })) : [{
          taskId,
          subjectId: activeSession.subjectId,
          intent: activeSession.intent || null,
          launcher: activeSession.launcher || null,
          effortTarget: activeEffortTarget,
        }],
        dateKey: activeDateKey,
        timezone: activeTimezone,
        copyVersion: heroReadModel.ui?.copyVersion || null,
      };
      return { heroLaunch, subjectCommand: null, questContext };
    }

    // Different Hero taskId → conflict
    if (activeSession.launchRequestId && activeSession.launchRequestId === requestId) {
      throw new ConflictError('The same mutation request id was reused for a different payload.', {
        code: 'idempotency_reuse',
        retryable: false,
        kind: 'subject_command.hero.start-task',
        scopeType: 'learner',
        scopeId: learnerId,
        requestId,
        correlationId,
      });
    }
    throw new ConflictError('A different Hero task is already active.', {
      code: 'hero_active_session_conflict',
      activeSession: {
        subjectId: activeSession.subjectId,
        taskId: activeSession.taskId,
      },
    });
  }

  // Non-Hero active session detection also wins over stale quest validation:
  // the contract asks the child to continue/finish existing subject work
  // instead of receiving another generic refresh loop.
  const nonHeroSession = detectNonHeroActiveSession(subjectReadModels);
  if (nonHeroSession) {
    throw new ConflictError('A subject session is already active.', {
      code: 'subject_active_session_conflict',
      activeSession: {
        subjectId: nonHeroSession.subjectId,
      },
    });
  }

  if (!quest || quest.questId !== questId) {
    throw new ConflictError('Hero quest is stale — the daily quest has changed.', {
      code: 'hero_quest_stale',
      clientQuestId: questId,
    });
  }

  // Quest fingerprint mismatch check (child UI mode only)
  if (childUiEnabled && clientQuestFingerprint) {
    if (clientQuestFingerprint.trim() !== heroReadModel.questFingerprint) {
      throw new ConflictError('Quest fingerprint mismatch — the quest has changed since the client read it.', {
        code: 'hero_quest_fingerprint_mismatch',
        clientFingerprint: clientQuestFingerprint.trim(),
      });
    }
  }

  const task = quest.tasks.find((t) => t.taskId === taskId);
  if (!task) {
    throw new NotFoundError('Task not found in the current Hero quest.', {
      code: 'hero_task_not_found',
      taskId,
      questId,
    });
  }

  const completionStatus = task.completionStatus || 'not-started';
  if (completionStatus === 'completed') {
    throw new ConflictError('Hero task is already completed.', {
      code: 'hero_task_already_completed',
      taskId,
      questId,
    });
  }
  if (completionStatus === 'completed-unclaimed') {
    throw new ConflictError('Hero task is waiting for its completion claim.', {
      code: 'hero_task_claim_pending',
      taskId,
      questId,
    });
  }
  if (completionStatus === 'in-progress') {
    throw new ConflictError('Hero task is already in progress.', {
      code: 'hero_active_session_conflict',
      taskId,
      questId,
    });
  }
  if (completionStatus === 'blocked') {
    throw new ConflictError('Hero task is blocked.', {
      code: 'hero_task_blocked',
      taskId,
      questId,
    });
  }

  if (task.launchStatus !== 'launchable') {
    throw new ConflictError('Hero task is not launchable.', {
      code: 'hero_task_not_launchable',
      taskId,
      launchStatus: task.launchStatus,
      reason: task.launchStatusReason || null,
    });
  }

  const adapterResult = mapHeroEnvelopeToSubjectPayload(task);
  if (!adapterResult.launchable) {
    throw new ConflictError('Subject is unavailable for Hero launch.', {
      code: 'hero_subject_unavailable',
      taskId,
      reason: adapterResult.reason || null,
    });
  }

  const heroContext = sanitiseHeroContext(buildHeroContext({
    quest: { questId: quest.questId, dateKey: heroReadModel.dateKey, timezone: HERO_DEFAULT_TIMEZONE },
    task,
    taskId,
    requestId,
    now,
    schedulerVersion: HERO_P2_SCHEDULER_VERSION,
    questFingerprint: heroReadModel.questFingerprint,
  }));

  const subjectCommand = {
    subjectId: adapterResult.subjectId,
    command: 'start-session',
    learnerId,
    requestId,
    correlationId,
    expectedLearnerRevision,
    payload: { ...adapterResult.payload, heroContext },
  };

  const heroLaunch = {
    version: HERO_LAUNCH_CONTRACT_VERSION,
    status: 'started',
    questId,
    questFingerprint: heroReadModel.questFingerprint,
    taskId,
    dateKey: heroReadModel.dateKey,
    subjectId: adapterResult.subjectId,
    intent: task.intent || '',
    launcher: task.launcher || '',
    effortTarget: task.effortTarget || 0,
    subjectCommand: 'start-session',
    coinsEnabled: false,
    claimEnabled: false,
    childVisible: childUiEnabled,
  };

  // P3 U4: expose quest metadata so the caller can initialise hero progress
  const questContext = {
    questId: quest.questId,
    questFingerprint: heroReadModel.questFingerprint,
    schedulerVersion: heroReadModel.schedulerVersion || HERO_P2_SCHEDULER_VERSION,
    effortTarget: quest.effortTarget || 0,
    tasks: (quest.tasks || []).map(t => ({
      taskId: t.taskId,
      subjectId: t.subjectId,
      intent: t.intent || null,
      launcher: t.launcher || null,
      effortTarget: t.effortTarget || 0,
    })),
    dateKey: heroReadModel.dateKey,
    timezone: heroReadModel.timezone || HERO_DEFAULT_TIMEZONE,
    copyVersion: heroReadModel.ui?.copyVersion || null,
  };

  return { heroLaunch, subjectCommand, questContext };
}

function progressTaskConflictStatus(progressTask) {
  if (!progressTask || typeof progressTask !== 'object') return null;
  if (progressTask.status === 'completed') return 'completed';
  if (progressTask.status === 'blocked') return 'blocked';
  return null;
}
