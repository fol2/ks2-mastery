import { resolveRuntimeSnapshot } from '../../../../src/subjects/spelling/content/model.js';
import { readSeededSpellingContentBundle } from '../../generated-spelling-content-seed.js';
import { NotFoundError, isProjectionUnavailableError } from '../../errors.js';
import { combineCommandEvents } from '../../projections/events.js';
import {
  MONSTER_CELEBRATION_REPLAY_REQUEST_TYPE,
  monsterCelebrationReplayEvents,
  monsterCelebrationReplayReferenceIds,
} from '../../projections/monster-replays.js';
import { buildCommandProjectionReadModel } from '../../projections/read-models.js';
import { MONSTER_CODEX_SYSTEM_ID, projectSpellingRewards } from '../../projections/rewards.js';
import {
  COMMAND_PROJECTION_MODEL_KEY,
  COMMAND_PROJECTION_RECENT_EVENT_LIMIT,
  COMMAND_PROJECTION_SCHEMA_VERSION,
  normaliseCommandProjectionPayload,
} from '../../read-models/learner-read-models.js';
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
    {
      eventTypes: [MONSTER_CELEBRATION_REPLAY_REQUEST_TYPE],
      skipAccessCheck: true,
    },
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
    {
      ids: referenceIds,
      skipAccessCheck: true,
    },
  );
  return [...replayRequests, ...referenceEvents];
}

async function readRuntimeContent(context) {
  if (typeof context.repository.readSpellingRuntimeContent === 'function') {
    return context.repository.readSpellingRuntimeContent(context.session.accountId, 'spelling', {
      includeAccountContent: false,
    });
  }
  const contentResult = await context.repository.readSubjectContent(context.session.accountId, 'spelling');
  const seededBundle = await readSeededSpellingContentBundle();
  return {
    ...contentResult,
    snapshot: resolveRuntimeSnapshot(contentResult.content, {
      referenceBundle: seededBundle,
    }),
  };
}

function emptyRewardProjection(domainEvents = []) {
  return buildCommandProjectionReadModel({
    gameState: {},
    domainEvents,
    reactionEvents: [],
    toastEvents: [],
  });
}

function projectionRewardState(projection) {
  const state = projection?.rewards?.state;
  return state && typeof state === 'object' && !Array.isArray(state) ? state : {};
}

function hasProjectionTokenField(rawPayload) {
  return rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
    && Object.prototype.hasOwnProperty.call(rawPayload, 'recentEventTokens')
    && Array.isArray(rawPayload.recentEventTokens);
}

function stampProjectionFallback(context, mode) {
  if (context.capacity && typeof context.capacity.setProjectionFallback === 'function') {
    context.capacity.setProjectionFallback(mode);
  }
}

function degradedProjectionInput({
  projection = emptyRewardProjection(),
  sourceRevision = 0,
  rawRow = null,
  writeBaseline = true,
} = {}) {
  const normalisedProjection = projection && typeof projection === 'object' && !Array.isArray(projection)
    ? projection
    : emptyRewardProjection();
  const projectionContext = writeBaseline
    ? {
      mode: 'degraded',
      projection: normalisedProjection,
      sourceRevision,
      rawRow,
    }
    : null;
  return {
    mode: 'degraded',
    degraded: true,
    projectionState: { gameState: {}, events: [] },
    tokens: [],
    projection: normalisedProjection,
    projectionContext,
    bootstrap: null,
    rawRow,
  };
}

async function resolveSpellingProjectionFromReadModel(context, {
  learnerId,
  currentRevision,
  readModel,
} = {}) {
  const hasPreloadedReadModel = readModel !== undefined;
  if (!hasPreloadedReadModel && typeof context.repository.readLearnerReadModel !== 'function') return null;

  let existingRow;
  if (hasPreloadedReadModel) {
    existingRow = readModel;
  } else {
    try {
      existingRow = await context.repository.readLearnerReadModel(learnerId, COMMAND_PROJECTION_MODEL_KEY);
    } catch {
      stampProjectionFallback(context, 'degraded');
      return degradedProjectionInput({ writeBaseline: false });
    }
  }

  const missing = !existingRow || existingRow.missing;
  const rawPayload = missing ? null : existingRow.model;
  const normalised = rawPayload
    ? normaliseCommandProjectionPayload(rawPayload, { fallbackVersion: 0 })
    : emptyRewardProjection();
  const persistedVersion = Number(normalised?.version) || 0;
  const persistedRevision = existingRow ? Number(existingRow.sourceRevision) || 0 : 0;
  const effectiveRevision = Math.max(0, Number(currentRevision) || 0);
  const minAcceptableRevision = Math.max(0, effectiveRevision - COMMAND_PROJECTION_RECENT_EVENT_LIMIT);

  if (!missing && persistedVersion > COMMAND_PROJECTION_SCHEMA_VERSION) {
    stampProjectionFallback(context, 'newer-opaque');
    return degradedProjectionInput({
      projection: normalised,
      sourceRevision: persistedRevision,
      rawRow: existingRow,
      writeBaseline: false,
    });
  }

  if (!missing
    && persistedVersion === COMMAND_PROJECTION_SCHEMA_VERSION
    && persistedRevision >= minAcceptableRevision
    && hasProjectionTokenField(rawPayload)
  ) {
    stampProjectionFallback(context, 'hit');
    return {
      mode: 'hit',
      degraded: false,
      projectionState: {
        gameState: { [MONSTER_CODEX_SYSTEM_ID]: projectionRewardState(normalised) },
        events: [],
      },
      tokens: Array.isArray(normalised.recentEventTokens) ? normalised.recentEventTokens : [],
      projection: normalised,
      projectionContext: null,
      bootstrap: null,
      rawRow: existingRow,
    };
  }

  stampProjectionFallback(context, 'degraded');
  return degradedProjectionInput({
    projection: normalised,
    sourceRevision: persistedRevision,
    rawRow: existingRow || null,
    writeBaseline: true,
  });
}

async function resolveSpellingProjectionInput(context, {
  learnerId,
  currentRevision,
  readModel,
} = {}) {
  const lightweightInput = await resolveSpellingProjectionFromReadModel(context, {
    learnerId,
    currentRevision,
    readModel,
  });
  if (lightweightInput) return lightweightInput;

  try {
    return await resolveProjectionInput(context, {
      learnerId,
      currentRevision,
      capacity: context.capacity || null,
    });
  } catch (error) {
    if (!isProjectionUnavailableError(error)) throw error;
    if (context.capacity && typeof context.capacity.setProjectionFallback === 'function') {
      context.capacity.setProjectionFallback('degraded');
    }
    return {
      mode: 'degraded',
      degraded: true,
      projectionState: { gameState: {}, events: [] },
      tokens: [],
      projection: emptyRewardProjection(),
      projectionContext: null,
      bootstrap: null,
      rawRow: null,
    };
  }
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
    const runtimeRecord = context.commandRuntime || (typeof context.repository.readSpellingCommandRuntime === 'function'
      ? await context.repository.readSpellingCommandRuntime(
        context.session.accountId,
        command.learnerId,
        // U6 queryCount budget: runSubjectCommandMutation already ran
        // requireLearnerWriteAccess; skip the duplicate membership read.
        { skipAccessCheck: true },
      )
      : await context.repository.readSubjectRuntime(
        context.session.accountId,
        command.learnerId,
        'spelling',
        { skipAccessCheck: true },
      ));
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
    const domainEvents = Array.isArray(result.events) ? result.events : [];
    // Projection is a derived reward/read-model dependency. If it is
    // temporarily unavailable, keep the primary spelling command flowing and
    // omit reward side effects for this response.
    const projectionInput = await resolveSpellingProjectionInput(context, {
      learnerId: command.learnerId,
      currentRevision: Number(command.expectedLearnerRevision) || 0,
      readModel: runtimeRecord.commandProjectionReadModel,
    });
    const projectionState = projectionInput.projectionState;
    const projectedRewards = projectionInput.degraded
      ? { gameState: {}, changedGameState: {}, rewardEvents: [] }
      : projectSpellingRewards({
        learnerId: command.learnerId,
        domainEvents,
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
    if (!projectionInput.degraded && result.state?.phase === 'summary') {
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
    const projectedEvents = projectionInput.degraded
      ? {
        events: domainEvents,
        domainEvents,
        reactionEvents: [],
        toastEvents: [],
      }
      : combineCommandEvents({
        domainEvents,
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

    const projections = projectionInput.degraded
      ? emptyRewardProjection(projectedEvents.domainEvents)
      : buildCommandProjectionReadModel({
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
        gameState: projectionInput.degraded ? {} : projectedRewards.changedGameState,
        events: projectedEvents.events,
        // U6 queryCount budget: when the engine re-uses the same
        // practice session id, tell the persistence plan so the
        // no-op abandon UPDATE can be elided. The combined command
        // runtime read can also prove "no active session" with null.
        previousActiveSessionId: Object.prototype.hasOwnProperty.call(runtimeRecord, 'activeSessionId')
          ? runtimeRecord.activeSessionId
          : (runtimeRecord.latestSession?.status === 'active' ? runtimeRecord.latestSession.id : undefined),
        activeSessionKnownAbsent: Object.prototype.hasOwnProperty.call(runtimeRecord, 'activeSessionId')
          && runtimeRecord.activeSessionId == null,
      },
      // U6: share the projection input shape with the persistence plan so
      // the `recentEventTokens` ring is appended (not overwritten) and any
      // non-v1 fields from a newer writer are preserved on overwrite.
      projectionContext: projectionInput.projectionContext || (projectionInput.degraded ? null : projectionInput),
    };
  }

  return Object.fromEntries(SPELLING_COMMANDS.map((name) => [name, handleSpellingCommand]));
}
