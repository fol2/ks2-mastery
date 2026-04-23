import { SEEDED_SPELLING_CONTENT_BUNDLE } from '../../../../src/subjects/spelling/data/content-data.js';
import { resolveRuntimeSnapshot } from '../../../../src/subjects/spelling/content/model.js';
import { NotFoundError } from '../../errors.js';
import { combineCommandEvents } from '../../projections/events.js';
import { buildCommandProjectionReadModel } from '../../projections/read-models.js';
import { projectSpellingRewards } from '../../projections/rewards.js';
import { createServerSpellingEngine } from './engine.js';
import { buildSpellingReadModel } from './read-models.js';

const SPELLING_COMMANDS = Object.freeze([
  'start-session',
  'submit-answer',
  'continue-session',
  'skip-word',
  'end-session',
  'save-prefs',
  'reset-learner',
]);

function contentMeta(contentResult, snapshot) {
  const summary = contentResult?.summary || {};
  return {
    releaseId: summary.publishedReleaseId || '',
    publishedVersion: Number(summary.publishedVersion) || 0,
    publishedAt: Number(summary.publishedAt) || 0,
    runtimeWordCount: Array.isArray(snapshot?.words) ? snapshot.words.length : 0,
  };
}

export function createSpellingCommandHandlers({ now, random } = {}) {
  async function handleSpellingCommand(command, context) {
    if (!SPELLING_COMMANDS.includes(command.command)) {
      throw new NotFoundError('Spelling command is not available.', {
        code: 'subject_command_not_found',
        subjectId: 'spelling',
        command: command.command,
      });
    }

    const nowValue = Number.isFinite(Number(context.now)) ? Number(context.now) : Date.now();
    const runtimeRecord = await context.repository.readSubjectRuntime(
      context.session.accountId,
      command.learnerId,
      'spelling',
    );
    const contentResult = await context.repository.readSubjectContent(context.session.accountId, 'spelling');
    const snapshot = resolveRuntimeSnapshot(contentResult.content, {
      referenceBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
    });
    if (!snapshot?.words?.length) {
      throw new NotFoundError('No published spelling content is available.', {
        code: 'spelling_content_unavailable',
        subjectId: 'spelling',
      });
    }

    const engine = createServerSpellingEngine({
      now: typeof now === 'function' ? now : () => nowValue,
      random,
      contentSnapshot: snapshot,
    });
    const result = engine.apply({
      learnerId: command.learnerId,
      subjectRecord: runtimeRecord.subjectRecord,
      latestSession: runtimeRecord.latestSession,
      command: command.command,
      payload: command.payload,
    });
    const projectionState = await context.repository.readLearnerProjectionState(
      context.session.accountId,
      command.learnerId,
    );
    const projectedRewards = projectSpellingRewards({
      learnerId: command.learnerId,
      domainEvents: result.events,
      gameState: projectionState.gameState,
    });
    const projectedEvents = combineCommandEvents({
      domainEvents: result.events,
      reactionEvents: projectedRewards.rewardEvents,
      existingEvents: projectionState.events,
    });

    await context.repository.persistSubjectRuntime(
      context.session.accountId,
      command.learnerId,
      'spelling',
      {
        state: result.state,
        data: result.data,
        practiceSession: result.practiceSession,
        gameState: projectedRewards.changedGameState,
        events: projectedEvents.events,
      },
    );
    const projections = buildCommandProjectionReadModel({
      gameState: projectedRewards.gameState,
      domainEvents: projectedEvents.domainEvents,
      reactionEvents: projectedEvents.reactionEvents,
      toastEvents: projectedEvents.toastEvents,
    });

    return {
      learnerId: command.learnerId,
      changed: result.changed,
      subjectState: result.state,
      subjectReadModel: buildSpellingReadModel({
        learnerId: command.learnerId,
        state: result.state,
        prefs: result.prefs,
        stats: result.stats,
        analytics: result.analytics,
        audio: result.audio,
        content: contentMeta(contentResult, snapshot),
      }),
      projections,
      events: projectedEvents.events,
      domainEvents: projectedEvents.domainEvents,
      reactionEvents: projectedEvents.reactionEvents,
      toastEvents: projectedEvents.toastEvents,
      audio: result.audio,
    };
  }

  return Object.fromEntries(SPELLING_COMMANDS.map((name) => [name, handleSpellingCommand]));
}
