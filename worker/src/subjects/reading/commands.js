import { readingContentSummary } from '../../../../shared/reading/content.js';
import { NotFoundError } from '../../errors.js';
import { combineCommandEvents } from '../../projections/events.js';
import { buildCommandProjectionReadModel } from '../../projections/read-models.js';
import { projectReadingRewards } from '../../projections/rewards.js';
import { resolveProjectionInput } from '../projection-input.js';
import { createServerReadingEngine } from './engine.js';
import { buildReadingReadModel } from './read-models.js';

export const READING_COMMANDS = Object.freeze([
  'start-session',
  'submit-answer',
  'save-response',
  'continue-session',
  'move-question',
  'mark-section',
  'mark-session',
  'end-session',
  'save-prefs',
  'reset-learner',
]);

export function createReadingCommandHandlers({ now, random } = {}) {
  async function handleReadingCommand(command, context) {
    if (!READING_COMMANDS.includes(command.command)) {
      throw new NotFoundError('Reading command is not available.', {
        code: 'subject_command_not_found',
        subjectId: 'reading',
        command: command.command,
      });
    }

    const nowValue = Number.isFinite(Number(context.now)) ? Number(context.now) : Date.now();
    const runtimeRecord = await context.repository.readSubjectRuntime(
      context.session.accountId,
      command.learnerId,
      'reading',
      { skipAccessCheck: true },
    );
    const engine = createServerReadingEngine({
      now: typeof now === 'function' ? now : () => nowValue,
      random,
    });
    const result = engine.apply({
      learnerId: command.learnerId,
      subjectRecord: runtimeRecord.subjectRecord,
      latestSession: runtimeRecord.latestSession,
      command: command.command,
      payload: command.payload,
      requestId: command.requestId,
    });

    const projectionInput = result.changed === false
      ? null
      : await resolveProjectionInput(context, {
          learnerId: command.learnerId,
          currentRevision: Number(command.expectedLearnerRevision) || 0,
          capacity: context.capacity || null,
        });
    const projectionState = projectionInput
      ? projectionInput.projectionState
      : { gameState: null, events: [] };
    const projectedRewards = result.changed === false
      ? { gameState: projectionState.gameState, changedGameState: null, rewardEvents: [] }
      : projectReadingRewards({
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
          seedTokens: projectionInput?.tokens || [],
        });
    const projections = buildCommandProjectionReadModel({
      gameState: projectedRewards.gameState,
      domainEvents: projectedEvents.domainEvents,
      reactionEvents: projectedEvents.reactionEvents,
      toastEvents: projectedEvents.toastEvents,
    });

    const response = {
      learnerId: command.learnerId,
      changed: result.changed,
      subjectReadModel: buildReadingReadModel({
        learnerId: command.learnerId,
        state: result.state,
        data: result.data,
        stats: result.stats,
        analytics: result.analytics,
        content: readingContentSummary(),
        projections,
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
        previousActiveSessionId: runtimeRecord.latestSession?.status === 'active'
          ? runtimeRecord.latestSession.id
          : null,
      };
      response.projectionContext = projectionInput;
    }

    return response;
  }

  return Object.fromEntries(READING_COMMANDS.map((name) => [name, handleReadingCommand]));
}
