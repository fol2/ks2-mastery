import { SEEDED_SPELLING_CONTENT_BUNDLE } from '../../../../src/subjects/spelling/data/content-data.js';
import { resolveRuntimeSnapshot } from '../../../../src/subjects/spelling/content/model.js';
import { NotFoundError } from '../../errors.js';
import { combineCommandEvents } from '../../projections/events.js';
import {
  MONSTER_CELEBRATION_REPLAY_REQUEST_TYPE,
  monsterCelebrationReplayEvents,
  monsterCelebrationReplayReferenceIds,
} from '../../projections/monster-replays.js';
import { buildCommandProjectionReadModel } from '../../projections/read-models.js';
import { projectSpellingRewards } from '../../projections/rewards.js';
import { buildSpellingAudioCue } from './audio.js';
import { createServerSpellingEngine } from './engine.js';
import { buildSpellingReadModel } from './read-models.js';
import { checkSpellingWordBankAnswer } from '../../content/spelling-read-models.js';
import { resolveProjectionInput } from '../projection-input.js';

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

async function replayContextEvents(context, learnerId) {
  const replayRequests = await context.repository.readLearnerEventLogEvents(
    context.session.accountId,
    learnerId,
    { eventTypes: [MONSTER_CELEBRATION_REPLAY_REQUEST_TYPE] },
  );
  const { sourceIds, replayIds } = monsterCelebrationReplayReferenceIds(replayRequests, {
    learnerId,
    subjectId: 'spelling',
  });
  const referenceIds = [...new Set([...sourceIds, ...replayIds])];
  if (!referenceIds.length) return replayRequests;
  const referenceEvents = await context.repository.readLearnerEventLogEvents(
    context.session.accountId,
    learnerId,
    { ids: referenceIds },
  );
  return [...replayRequests, ...referenceEvents];
}

async function readRuntimeContent(context) {
  if (typeof context.repository.readSpellingRuntimeContent === 'function') {
    return context.repository.readSpellingRuntimeContent(context.session.accountId, 'spelling');
  }
  const contentResult = await context.repository.readSubjectContent(context.session.accountId, 'spelling');
  return {
    ...contentResult,
    snapshot: resolveRuntimeSnapshot(contentResult.content, {
      referenceBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
    }),
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
      // U6 queryCount budget: runSubjectCommandMutation already ran
      // requireLearnerWriteAccess; skip the duplicate membership read.
      { skipAccessCheck: true },
    );
    const contentResult = await readRuntimeContent(context);
    const snapshot = contentResult.snapshot;
    if (!snapshot?.words?.length) {
      throw new NotFoundError('No published spelling content is available.', {
        code: 'spelling_content_unavailable',
        subjectId: 'spelling',
      });
    }

    if (command.command === 'check-word-bank-drill') {
      // U6: pure read-model command that does not alter learner state.
      // Short-circuit BEFORE touching the projection; leave
      // `meta.capacity.projectionFallback` at null so operators can
      // distinguish "no-op" from "hit" in telemetry.
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
    // U6: consume the persisted projection read model as the hot-path
    // input. The loader throws `ProjectionUnavailableError` when both the
    // row and the bounded fallback fail; that flows up to the 503
    // `projection_unavailable` response in the route handler.
    const projectionInput = await resolveProjectionInput(context, {
      learnerId: command.learnerId,
      currentRevision: Number(command.expectedLearnerRevision) || 0,
      capacity: context.capacity || null,
    });
    const projectionState = projectionInput.projectionState;
    const projectedRewards = projectSpellingRewards({
      learnerId: command.learnerId,
      domainEvents: result.events,
      gameState: projectionState.gameState,
      // P2 U12 MEDIUM (u12-corr-02): thread the bounded-fallback event list
      // so the achievement subscriber sees prior Guardian mission history +
      // Pattern Quest completions from earlier commands. Without this, the
      // Worker-twin achievement path never unlocks Guardian 7-day — each
      // command starts from an empty `existingEvents` list and cumulative
      // state collapses to just `result.events`. Matches client path at
      // `src/platform/events/runtime.js:69` where `existingEvents` is
      // `repositories.eventLog.list()`.
      existingEvents: projectionState.events,
    });
    let replayEvents = [];
    if (result.state?.phase === 'summary') {
      const replayContext = await replayContextEvents(context, command.learnerId);
      replayEvents = monsterCelebrationReplayEvents([
        ...projectionState.events,
        ...replayContext,
      ], {
        learnerId: command.learnerId,
        subjectId: 'spelling',
        now: nowValue,
      });
    }
    // On the hot path (`hit`), `projectionState.events` is empty and we
    // pass the persisted token ring as `seedTokens` so
    // `combineCommandEvents` can dedupe without re-scanning the event log.
    // On miss/stale/newer-opaque the events list is populated from the
    // bounded fallback and tokens are either the refreshed ring or null
    // (newer-opaque).
    const projectedEvents = combineCommandEvents({
      domainEvents: result.events,
      reactionEvents: [...projectedRewards.rewardEvents, ...replayEvents],
      existingEvents: projectionState.events,
      seedTokens: projectionInput.tokens || [],
    });
    const replayAudioCue = await buildSpellingAudioCue({
      learnerId: command.learnerId,
      state: result.state,
    });
    const transitionAudioCue = result.audio ? await buildSpellingAudioCue({
      learnerId: command.learnerId,
      state: result.state,
      audio: result.audio,
    }) : null;

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
        audio: replayAudioCue,
        content: contentMeta(contentResult, snapshot),
      }),
      // P2 U4: additive — client `applyCommandResponse` merges this into
      // `subjectUi.spelling.postMastery`, keeping the Setup scene post-Mega
      // gate in lockstep with the worker. Old clients that never read this
      // field continue to work.
      postMastery: result.postMastery,
      projections,
      events: projectedEvents.events,
      domainEvents: projectedEvents.domainEvents,
      reactionEvents: projectedEvents.reactionEvents,
      toastEvents: projectedEvents.toastEvents,
      audio: transitionAudioCue,
      runtimeWrite: {
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
      // U6: share the projection input shape with the persistence plan so
      // the `recentEventTokens` ring is appended (not overwritten) and any
      // non-v1 fields from a newer writer are preserved on overwrite.
      projectionContext: projectionInput,
    };
  }

  return Object.fromEntries(SPELLING_COMMANDS.map((name) => [name, handleSpellingCommand]));
}
