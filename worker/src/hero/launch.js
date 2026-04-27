import { BadRequestError, NotFoundError, ConflictError } from '../errors.js';
import { buildHeroShadowReadModel } from './read-model.js';
import { mapHeroEnvelopeToSubjectPayload } from './launch-adapters/index.js';
import { buildHeroContext, sanitiseHeroContext } from '../../../shared/hero/launch-context.js';
import {
  HERO_P1_SCHEDULER_VERSION,
  HERO_DEFAULT_TIMEZONE,
  HERO_LAUNCH_CONTRACT_VERSION,
} from '../../../shared/hero/constants.js';

export async function resolveHeroStartTaskCommand({ body, repository, env, now }) {
  const command = body?.command;
  if (!command) {
    throw new BadRequestError('Hero command is required.', {
      code: 'hero_command_required',
    });
  }
  if (command !== 'start-task') {
    throw new BadRequestError(`Unsupported Hero command: ${command}`, {
      code: 'hero_command_unsupported',
      command,
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
  const correlationId = typeof body.correlationId === 'string' && body.correlationId.trim()
    ? body.correlationId.trim()
    : requestId;
  const expectedLearnerRevision = Number(body.expectedLearnerRevision);

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

  const subjectReadModels = await repository.readHeroSubjectReadModels(learnerId);
  const heroReadModel = buildHeroShadowReadModel({
    learnerId,
    subjectReadModels,
    now,
    env,
  });

  const quest = heroReadModel.dailyQuest;
  if (!quest || quest.questId !== questId) {
    throw new ConflictError('Hero quest is stale — the daily quest has changed.', {
      code: 'hero_quest_stale',
      clientQuestId: questId,
      serverQuestId: quest?.questId || null,
    });
  }

  const task = quest.tasks.find((t) => t.taskId === taskId);
  if (!task) {
    throw new NotFoundError('Task not found in the current Hero quest.', {
      code: 'hero_task_not_found',
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
    schedulerVersion: HERO_P1_SCHEDULER_VERSION,
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
    taskId,
    dateKey: heroReadModel.dateKey,
    subjectId: adapterResult.subjectId,
    intent: task.intent || '',
    launcher: task.launcher || '',
    effortTarget: task.effortTarget || 0,
    subjectCommand: 'start-session',
    coinsEnabled: false,
    claimEnabled: false,
    childVisible: false,
  };

  return { heroLaunch, subjectCommand };
}
