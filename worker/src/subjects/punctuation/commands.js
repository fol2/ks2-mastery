import {
  PUNCTUATION_CONTENT_MANIFEST,
  PUNCTUATION_MANIFEST_VALIDATION,
} from '../../../../shared/punctuation/content.js';
import { NotFoundError } from '../../errors.js';
import { combineCommandEvents } from '../../projections/events.js';
import { buildCommandProjectionReadModel } from '../../projections/read-models.js';
import { projectPunctuationRewards } from '../../projections/rewards.js';
import { requestPunctuationContextPack } from './ai-enrichment.js';
import { createServerPunctuationEngine } from './engine.js';
import { buildPunctuationReadModel } from './read-models.js';

const PUNCTUATION_COMMANDS = Object.freeze([
  'start-session',
  'submit-answer',
  'continue-session',
  'skip-item',
  'end-session',
  'save-prefs',
  'reset-learner',
  'request-context-pack',
]);

function contentMeta() {
  return {
    releaseId: PUNCTUATION_CONTENT_MANIFEST.releaseId,
    releaseName: PUNCTUATION_CONTENT_MANIFEST.releaseName,
    fullSkillCount: PUNCTUATION_CONTENT_MANIFEST.fullSkillCount,
    publishedSkillCount: PUNCTUATION_CONTENT_MANIFEST.skills.filter((skill) => skill.published).length,
    publishedRewardUnitCount: PUNCTUATION_CONTENT_MANIFEST.rewardUnits.filter((unit) => unit.published).length,
    publishedScopeCopy: PUNCTUATION_CONTENT_MANIFEST.publishedScopeCopy,
    skills: PUNCTUATION_CONTENT_MANIFEST.skills
      .filter((skill) => skill.published)
      .map((skill) => ({
        id: skill.id,
        name: skill.name,
        clusterId: skill.clusterId,
      })),
  };
}

export function createPunctuationCommandHandlers({ now, random } = {}) {
  async function handlePunctuationCommand(command, context) {
    if (!PUNCTUATION_COMMANDS.includes(command.command)) {
      throw new NotFoundError('Punctuation command is not available.', {
        code: 'subject_command_not_found',
        subjectId: 'punctuation',
        command: command.command,
      });
    }

    if (!PUNCTUATION_MANIFEST_VALIDATION.ok) {
      throw new NotFoundError('No published punctuation content is available.', {
        code: 'punctuation_content_unavailable',
        subjectId: 'punctuation',
      });
    }

    const nowValue = Number.isFinite(Number(context.now)) ? Number(context.now) : Date.now();
    const runtimeRecord = await context.repository.readSubjectRuntime(
      context.session.accountId,
      command.learnerId,
      'punctuation',
    );
    const engine = createServerPunctuationEngine({
      now: typeof now === 'function' ? now : () => nowValue,
      random,
    });
    const result = engine.apply({
      learnerId: command.learnerId,
      subjectRecord: runtimeRecord.subjectRecord,
      latestSession: runtimeRecord.latestSession,
      command: command.command,
      payload: command.payload,
    });
    const contextPack = command.command === 'request-context-pack'
      ? await requestPunctuationContextPack({
          env: context.env,
          payload: command.payload,
          manifest: PUNCTUATION_CONTENT_MANIFEST,
        })
      : null;
    const projectionState = result.changed === false
      ? { gameState: null, events: [] }
      : await context.repository.readLearnerProjectionState(
          context.session.accountId,
          command.learnerId,
        );
    const projectedRewards = result.changed === false
      ? { gameState: projectionState.gameState, changedGameState: null, rewardEvents: [] }
      : projectPunctuationRewards({
          learnerId: command.learnerId,
          domainEvents: result.events,
          gameState: projectionState.gameState,
          random,
        });
    const projectedEvents = result.changed === false
      ? { events: [], domainEvents: [], reactionEvents: [], toastEvents: [] }
      : combineCommandEvents({
          domainEvents: result.events,
          reactionEvents: projectedRewards.rewardEvents,
          existingEvents: projectionState.events,
        });
    const projections = buildCommandProjectionReadModel({
      gameState: projectedRewards.gameState,
      domainEvents: projectedEvents.domainEvents,
      reactionEvents: projectedEvents.reactionEvents,
      toastEvents: projectedEvents.toastEvents,
    });

    const response = {
      learnerId: command.learnerId,
      ok: contextPack ? contextPack.status === 'ready' : true,
      changed: result.changed,
      contextPack,
      subjectReadModel: buildPunctuationReadModel({
        learnerId: command.learnerId,
        state: result.state,
        prefs: result.prefs,
        stats: result.stats,
        analytics: result.analytics,
        content: contentMeta(),
        contextPack,
      }),
      projections,
      events: projectedEvents.events,
      domainEvents: projectedEvents.domainEvents,
      reactionEvents: projectedEvents.reactionEvents,
      toastEvents: projectedEvents.toastEvents,
    };
    if (result.changed !== false) {
      response.runtimeWrite = {
        state: result.state,
        data: result.data,
        practiceSession: result.practiceSession,
        gameState: projectedRewards.changedGameState,
        events: projectedEvents.events,
      };
    }
    return response;
  }

  return Object.fromEntries(PUNCTUATION_COMMANDS.map((name) => [name, handlePunctuationCommand]));
}
