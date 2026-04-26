import { NotFoundError } from '../../errors.js';
import { combineCommandEvents } from '../../projections/events.js';
import { buildCommandProjectionReadModel } from '../../projections/read-models.js';
import { projectGrammarRewards } from '../../projections/rewards.js';
import { createServerGrammarEngine } from './engine.js';
import { buildGrammarReadModel } from './read-models.js';
import { resolveProjectionInput } from '../projection-input.js';

const GRAMMAR_COMMANDS = Object.freeze([
  'start-session',
  'submit-answer',
  'save-mini-test-response',
  'move-mini-test',
  'finish-mini-test',
  'continue-session',
  'end-session',
  'save-prefs',
  'retry-current-question',
  'use-faded-support',
  'show-worked-solution',
  'start-similar-problem',
  'request-ai-enrichment',
  'save-transfer-evidence',
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
      // U6 queryCount budget: runSubjectCommandMutation already ran
      // requireLearnerWriteAccess; skip the duplicate membership read.
      { skipAccessCheck: true },
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
    // U6: extend the Punctuation no-op short-circuit pattern — skip the
    // projection load entirely when the engine did not mutate learner
    // state. Otherwise consume the persisted projection hot-path input.
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
      : projectGrammarRewards({
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

    return {
      learnerId: command.learnerId,
      changed: result.changed,
      subjectReadModel: buildGrammarReadModel({
        learnerId: command.learnerId,
        state: result.state,
        projections,
        now: nowValue,
        aiEnrichment: result.aiEnrichment,
      }),
      projections,
      events: projectedEvents.events,
      domainEvents: projectedEvents.domainEvents,
      reactionEvents: projectedEvents.reactionEvents,
      toastEvents: projectedEvents.toastEvents,
      runtimeWrite: result.changed === false
        ? null
        : {
          state: result.state,
          data: result.data,
          practiceSession: result.practiceSession,
          gameState: projectedRewards.changedGameState,
          events: projectedEvents.events,
          // U6 queryCount budget: when the engine re-uses the same
          // practice session id, tell the persistence plan so the
          // no-op abandon UPDATE can be elided.
          previousActiveSessionId: runtimeRecord.latestSession?.status === 'active'
            ? runtimeRecord.latestSession.id
            : null,
        },
      // U6: thread the projection input to the persistence plan (see
      // spelling/commands.js for the rationale).
      projectionContext: result.changed === false ? null : projectionInput,
    };
  }

  return Object.fromEntries(GRAMMAR_COMMANDS.map((name) => [name, handleGrammarCommand]));
}
