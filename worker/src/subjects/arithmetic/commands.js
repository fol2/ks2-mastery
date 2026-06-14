import { arithmeticContentSummary } from '../../../../shared/arithmetic/content.js';
import { NotFoundError } from '../../errors.js';
import { combineCommandEvents } from '../../projections/events.js';
import { buildCommandProjectionReadModel } from '../../projections/read-models.js';
import { projectArithmeticRewards } from '../../projections/rewards.js';
import { resolveProjectionInput } from '../projection-input.js';
import { ARITHMETIC_EVENT_TYPES, createServerArithmeticEngine } from './engine.js';
import { buildArithmeticReadModel } from './read-models.js';

export const ARITHMETIC_COMMANDS = Object.freeze([
  'start-session',
  'submit-answer',
  'continue-session',
  'finish-test',
  'end-session',
  'save-prefs',
  'reset-learner',
]);

const ARITHMETIC_PROJECTION_EVENT_TYPES = new Set([
  ARITHMETIC_EVENT_TYPES.REWARD_UNIT_SECURED,
]);

function hasProjectionEvents(events = []) {
  return Array.isArray(events)
    && events.some((event) => ARITHMETIC_PROJECTION_EVENT_TYPES.has(event?.type));
}

export function createArithmeticCommandHandlers({ now, random } = {}) {
  async function handleArithmeticCommand(command, context) {
    if (!ARITHMETIC_COMMANDS.includes(command.command)) {
      throw new NotFoundError('Arithmetic command is not available.', {
        code: 'subject_command_not_found',
        subjectId: 'arithmetic',
        command: command.command,
      });
    }

    const nowValue = Number.isFinite(Number(context.now)) ? Number(context.now) : Date.now();
    const runtimeRecord = await context.repository.readSubjectRuntime(
      context.session.accountId,
      command.learnerId,
      'arithmetic',
      { skipAccessCheck: true },
    );
    const engine = createServerArithmeticEngine({ now: typeof now === 'function' ? now : () => nowValue, random });
    const result = engine.apply({
      learnerId: command.learnerId,
      subjectRecord: runtimeRecord.subjectRecord,
      latestSession: runtimeRecord.latestSession,
      command: command.command,
      payload: command.payload,
      requestId: command.requestId,
    });

    const domainEvents = Array.isArray(result.events) ? result.events : [];
    const needsProjection = result.changed !== false && hasProjectionEvents(domainEvents);
    const projectionInput = needsProjection
      ? await resolveProjectionInput(context, {
          learnerId: command.learnerId,
          currentRevision: Number(command.expectedLearnerRevision) || 0,
          capacity: context.capacity || null,
        })
      : null;
    const projectionState = projectionInput ? projectionInput.projectionState : { gameState: null, events: [] };
    const projectedRewards = needsProjection
      ? projectArithmeticRewards({
          learnerId: command.learnerId,
          domainEvents,
          gameState: projectionState.gameState,
          random,
        })
      : { gameState: projectionState.gameState, changedGameState: null, rewardEvents: [] };
    const projectedEvents = needsProjection
      ? combineCommandEvents({
          domainEvents,
          reactionEvents: projectedRewards.rewardEvents,
          existingEvents: projectionState.events,
          seedTokens: projectionInput?.tokens || [],
        })
      : { events: domainEvents, domainEvents, reactionEvents: [], toastEvents: [] };
    const projections = needsProjection
      ? buildCommandProjectionReadModel({
          gameState: projectedRewards.gameState,
          domainEvents: projectedEvents.domainEvents,
          reactionEvents: projectedEvents.reactionEvents,
          toastEvents: projectedEvents.toastEvents,
        })
      : null;

    const response = {
      learnerId: command.learnerId,
      changed: result.changed,
      subjectReadModel: buildArithmeticReadModel({
        learnerId: command.learnerId,
        state: result.state,
        data: result.data,
        stats: result.stats,
        analytics: result.analytics,
        content: arithmeticContentSummary(),
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
        previousActiveSessionId: runtimeRecord.latestSession?.status === 'active' ? runtimeRecord.latestSession.id : null,
      };
      if (projectionInput) response.projectionContext = projectionInput;
    }

    return response;
  }

  return Object.fromEntries(ARITHMETIC_COMMANDS.map((name) => [name, handleArithmeticCommand]));
}
