import { SEEDED_SPELLING_CONTENT_BUNDLE } from '../../../../src/subjects/spelling/data/content-data.js';
import { resolveRuntimeSnapshot } from '../../../../src/subjects/spelling/content/model.js';
import { NotFoundError } from '../../errors.js';
import { combineCommandEvents } from '../../projections/events.js';
import { buildCommandProjectionReadModel } from '../../projections/read-models.js';
import { projectSpellingRewards } from '../../projections/rewards.js';
import { buildSpellingAudioCue } from './audio.js';
import { createServerSpellingEngine } from './engine.js';
import { buildSpellingReadModel } from './read-models.js';
import { checkSpellingWordBankAnswer } from '../../content/spelling-read-models.js';

const SPELLING_COMMANDS = Object.freeze([
  'start-session',
  'submit-answer',
  'continue-session',
  'skip-word',
  'end-session',
  'save-prefs',
  'reset-learner',
  'check-word-bank-drill',
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

function clientAnalytics(analytics) {
  if (!analytics || typeof analytics !== 'object' || Array.isArray(analytics)) return null;
  return {
    ...analytics,
    wordGroups: [],
    wordBank: {
      ...(analytics.wordBank && typeof analytics.wordBank === 'object' && !Array.isArray(analytics.wordBank)
        ? analytics.wordBank
        : {}),
      source: 'server-read-model-api',
    },
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

    if (command.command === 'check-word-bank-drill') {
      return {
        learnerId: command.learnerId,
        changed: false,
        wordBankDrill: checkSpellingWordBankAnswer({
          contentSnapshot: snapshot,
          slug: command.payload?.slug,
          typed: command.payload?.typed,
        }),
        projections: buildCommandProjectionReadModel({
          gameState: {},
          domainEvents: [],
          reactionEvents: [],
          toastEvents: [],
        }),
        events: [],
        domainEvents: [],
        reactionEvents: [],
        toastEvents: [],
      };
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
    const audioCue = await buildSpellingAudioCue({
      learnerId: command.learnerId,
      state: result.state,
      audio: result.audio,
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
      subjectReadModel: buildSpellingReadModel({
        learnerId: command.learnerId,
        state: result.state,
        prefs: result.prefs,
        stats: result.stats,
        analytics: clientAnalytics(result.analytics),
        audio: audioCue,
        content: contentMeta(contentResult, snapshot),
      }),
      projections,
      events: projectedEvents.events,
      domainEvents: projectedEvents.domainEvents,
      reactionEvents: projectedEvents.reactionEvents,
      toastEvents: projectedEvents.toastEvents,
      audio: audioCue,
      runtimeWrite: {
        state: result.state,
        data: result.data,
        practiceSession: result.practiceSession,
        gameState: projectedRewards.changedGameState,
        events: projectedEvents.events,
      },
    };
  }

  return Object.fromEntries(SPELLING_COMMANDS.map((name) => [name, handleSpellingCommand]));
}
