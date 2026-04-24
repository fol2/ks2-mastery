import { NotFoundError } from '../../errors.js';
import { combineCommandEvents } from '../../projections/events.js';
import { buildCommandProjectionReadModel } from '../../projections/read-models.js';
import { projectGrammarRewards } from '../../projections/rewards.js';
import { createServerGrammarEngine } from './engine.js';
import { buildGrammarReadModel } from './read-models.js';

const GRAMMAR_COMMANDS = Object.freeze([
  'start-session',
  'submit-answer',
  'continue-session',
  'end-session',
  'save-prefs',
  'reset-learner',
]);

export function createGrammarCommandHandlers({ now, random } = {}) {
  async function handleGrammarCommand(command, context) {
    if (!GRAMMAR_COMMANDS.includes(command.command)) {
      throw new NotFoundError('Grammar command is not available.', {
        code: 'subject_command_not_found',
        subjectId: 'grammar',
        command: command.command,
      });
    }

    const nowValue = Number.isFinite(Number(context.now)) ? Number(context.now) : Date.now();
    const runtimeRecord = await context.repository.readSubjectRuntime(
      context.session.accountId,
      command.learnerId,
      'grammar',
    );
    const engine = createServerGrammarEngine({
      now: typeof now === 'function' ? now : () => nowValue,
    });
    const result = engine.apply({
      learnerId: command.learnerId,
      subjectRecord: runtimeRecord.subjectRecord,
      latestSession: runtimeRecord.latestSession,
      command: command.command,
      payload: command.payload,
      requestId: command.requestId,
    });
    const projectionState = await context.repository.readLearnerProjectionState(
      context.session.accountId,
      command.learnerId,
    );
    const projectedRewards = projectGrammarRewards({
      learnerId: command.learnerId,
      domainEvents: result.events,
      gameState: projectionState.gameState,
      random,
    });
    const projectedEvents = combineCommandEvents({
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

    return {
      learnerId: command.learnerId,
      changed: result.changed,
      subjectReadModel: buildGrammarReadModel({
        learnerId: command.learnerId,
        state: result.state,
        projections,
        now: nowValue,
      }),
      projections,
      events: projectedEvents.events,
      domainEvents: projectedEvents.domainEvents,
      reactionEvents: projectedEvents.reactionEvents,
      toastEvents: projectedEvents.toastEvents,
      runtimeWrite: {
        state: result.state,
        data: result.data,
        practiceSession: result.practiceSession,
        gameState: projectedRewards.changedGameState,
        events: projectedEvents.events,
      },
    };
  }

  return Object.fromEntries(GRAMMAR_COMMANDS.map((name) => [name, handleGrammarCommand]));
}
