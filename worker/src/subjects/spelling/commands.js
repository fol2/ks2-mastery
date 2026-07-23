import { resolveRuntimeSnapshot } from '../../../../src/subjects/spelling/content/model.js';
import { readSeededSpellingContentBundle } from '../../spelling-content-seed-loader.js';
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
import {
  materialiseSpellingGameplayStats,
  spellingGameplayStatsAreCurrent,
  spellingGameplayStatsWithDueSchedule,
  updateSpellingGameplayStats,
} from './gameplay-state.js';
import {
  buildSpellingPublicSubjectReadModel,
  buildSpellingReadModel,
} from './read-models.js';
import { checkSpellingWordBankAnswer } from '../../content/spelling-read-models.js';
import { resolveProjectionInput } from '../projection-input.js';
import { isLegacyGameplayWorkingSet } from '../gameplay-store.js';
import { COMMAND_PHASE_TIMING } from '../command-contract.js';

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

function spellingStatsOptions(contentResult, now) {
  const summary = contentResult?.summary || {};
  return {
    releaseId: summary.publishedReleaseId || '',
    publishedVersion: Number(summary.publishedVersion) || 0,
    now,
  };
}

function addSessionSlug(output, value) {
  if (typeof value === 'string' && value) output.add(value);
  else if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (typeof value.slug === 'string' && value.slug) output.add(value.slug);
  }
}

function activeSpellingSession(runtimeRecord) {
  const uiSession = runtimeRecord?.subjectRecord?.ui?.session;
  if (uiSession && typeof uiSession === 'object' && !Array.isArray(uiSession)) return uiSession;
  const persisted = runtimeRecord?.latestSession?.sessionState;
  return persisted && typeof persisted === 'object' && !Array.isArray(persisted) ? persisted : null;
}

function activeSessionSlugs(runtimeRecord) {
  const session = activeSpellingSession(runtimeRecord);
  if (!session) return [];
  const output = new Set();
  for (const value of [
    session.currentSlug,
    session.currentPrompt,
    session.currentCard,
    session.patternQuestCard,
  ]) addSessionSlug(output, value);
  for (const key of [
    'uniqueWords',
    'queue',
    'results',
    'patternQuestCards',
    'patternQuestResults',
    'patternQuestWobbledSlugs',
    'patternQuestSeedSlugs',
  ]) {
    for (const value of Array.isArray(session[key]) ? session[key] : []) addSessionSlug(output, value);
  }
  for (const key of ['status', 'guardianResults', 'sentenceHistory']) {
    const map = session[key];
    if (!map || typeof map !== 'object' || Array.isArray(map)) continue;
    for (const slug of Object.keys(map)) addSessionSlug(output, slug);
  }
  return [...output];
}

function continueWillFinish(runtimeRecord) {
  if (runtimeRecord?.subjectRecord?.ui?.awaitingAdvance !== true) return false;
  const session = activeSpellingSession(runtimeRecord);
  if (!session) return false;
  if (session.mode === 'pattern-quest') {
    const cards = Array.isArray(session.patternQuestCards) ? session.patternQuestCards : [];
    return (Number(session.patternQuestCardIndex) || 0) >= cards.length;
  }
  const queue = Array.isArray(session.queue) ? session.queue : [];
  if (session.type === 'test' || session.mode === 'boss') return queue.length === 0;
  const status = session.status && typeof session.status === 'object' && !Array.isArray(session.status)
    ? session.status
    : {};
  return queue.every((slug) => status[slug]?.done === true);
}

function commandWorkingSlugs(command, runtimeRecord, allCurrentSlugs, statsCurrent) {
  if (command.command === 'reset-learner') {
    return { slugs: [], completeCatalogue: true };
  }
  if (command.command === 'save-prefs') {
    return { slugs: [], completeCatalogue: false };
  }
  if (!statsCurrent) {
    return { slugs: allCurrentSlugs, completeCatalogue: true };
  }
  if (command.command === 'start-session') {
    const payloadWords = Array.isArray(command.payload?.words)
      ? command.payload.words.filter((slug) => typeof slug === 'string' && slug)
      : [];
    const explicit = payloadWords.length
      ? payloadWords
      : typeof command.payload?.slug === 'string' && command.payload.slug
        ? [command.payload.slug]
        : [];
    if (explicit.length) return { slugs: explicit, completeCatalogue: false };
    if (command.payload?.mode === 'test') return { slugs: [], completeCatalogue: false };
    // Smart, Trouble, Guardian, Boss and Pattern Quest selection all inspect
    // current published progress. This cost is tied to catalogue size once at
    // round creation, never to lifetime history or to each answer.
    return { slugs: allCurrentSlugs, completeCatalogue: true };
  }
  if (command.command === 'continue-session' && continueWillFinish(runtimeRecord)) {
    return { slugs: allCurrentSlugs, completeCatalogue: true };
  }
  return { slugs: activeSessionSlugs(runtimeRecord), completeCatalogue: false };
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

function commandTimingNowMs() {
  return typeof performance?.now === 'function' ? performance.now() : Date.now();
}

async function measureCommandPhase(capacity, name, fn) {
  if (!capacity || typeof capacity.recordCommandPhaseTiming !== 'function') {
    return fn();
  }
  const startedAt = commandTimingNowMs();
  try {
    return await fn();
  } finally {
    capacity.recordCommandPhaseTiming(name, commandTimingNowMs() - startedAt);
  }
}

async function readRuntimeContent(context) {
  if (typeof context.repository.readSpellingRuntimeContent === 'function') {
    return context.repository.readSpellingRuntimeContent(
      context.session.accountId,
      'spelling',
      {
        includeAccountContent: false,
      },
    );
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
    const capacity = context.capacity || null;
    let runtimeRecord = context.commandRuntime || (typeof context.repository.readSpellingCommandRuntime === 'function'
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
    const contentResult = await measureCommandPhase(
      capacity,
      COMMAND_PHASE_TIMING.content,
      () => readRuntimeContent(context),
    );
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

    const allCurrentSlugs = snapshot.words.map((word) => word?.slug).filter(Boolean);
    const statsOptions = spellingStatsOptions(contentResult, nowValue);
    const statsCurrent = spellingGameplayStatsAreCurrent(
      runtimeRecord.spellingStats,
      snapshot.words,
      statsOptions,
    );
    const workingSetPlan = commandWorkingSlugs(
      command,
      runtimeRecord,
      allCurrentSlugs,
      statsCurrent,
    );
    if (typeof context.repository.readSpellingGameplayWorkingSet === 'function') {
      const workingData = await measureCommandPhase(
        capacity,
        COMMAND_PHASE_TIMING.workingSet,
        () => context.repository.readSpellingGameplayWorkingSet(
          context.session.accountId,
          command.learnerId,
          workingSetPlan.slugs,
          {
            skipAccessCheck: true,
            learnerData: runtimeRecord.subjectRecord?.data || {},
            now: nowValue,
          },
        ),
      );
      runtimeRecord = {
        ...runtimeRecord,
        subjectRecord: {
          ...runtimeRecord.subjectRecord,
          data: workingData,
        },
      };
    }
    const usesBoundedGameplayStore = !isLegacyGameplayWorkingSet(runtimeRecord.subjectRecord?.data);
    const completeCatalogue = workingSetPlan.completeCatalogue || !usesBoundedGameplayStore;
    const aggregateProgress = usesBoundedGameplayStore && !completeCatalogue && statsCurrent
      ? {
        stats: materialiseSpellingGameplayStats(runtimeRecord.spellingStats, nowValue),
        baselineProgress: runtimeRecord.subjectRecord?.data?.progress || {},
      }
      : null;

    const result = await measureCommandPhase(capacity, COMMAND_PHASE_TIMING.engineApply, async () => {
      const engine = createServerSpellingEngine({
        now: typeof now === 'function' ? now : () => nowValue,
        random,
        contentSnapshot: snapshot,
        aggregateProgress,
        completeCatalogue,
      });
      return engine.apply({
        learnerId: command.learnerId,
        subjectRecord: runtimeRecord.subjectRecord,
        latestSession: runtimeRecord.latestSession,
        command: command.command,
        payload: command.payload,
      });
    });
    const domainEvents = Array.isArray(result.events) ? result.events : [];
    // Projection is a derived reward/read-model dependency. If it is
    // temporarily unavailable, keep the primary spelling command flowing and
    // omit reward side effects for this response.
    const {
      projectionInput,
      projectedRewards,
      projectedEvents,
      projections,
    } = await measureCommandPhase(capacity, COMMAND_PHASE_TIMING.rewardProjection, async () => {
      const nextProjectionInput = await resolveSpellingProjectionInput(context, {
        learnerId: command.learnerId,
        currentRevision: Number(command.expectedLearnerRevision) || 0,
        readModel: runtimeRecord.commandProjectionReadModel,
      });
      const projectionState = nextProjectionInput.projectionState;
      const nextProjectedRewards = nextProjectionInput.degraded
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
      if (!nextProjectionInput.degraded && result.state?.phase === 'summary') {
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
      const nextProjectedEvents = nextProjectionInput.degraded
        ? {
          events: domainEvents,
          domainEvents,
          reactionEvents: [],
          toastEvents: [],
        }
        : combineCommandEvents({
          domainEvents,
          reactionEvents: [...nextProjectedRewards.rewardEvents, ...replayEvents],
          existingEvents: projectionState.events,
          seedTokens: nextProjectionInput.tokens || [],
        });
      // Omit fat rewards.state from the HTTP body when this command did not
      // mutate monster-codex. Clients keep their cached gameState
      // (applyCommandResultToCache only overwrites when state is present).
      // Also omit recentEventTokens — they exist for server persist/dedupe.
      const rewardsChanged = nextProjectedRewards.changedGameState
        && typeof nextProjectedRewards.changedGameState === 'object'
        && Object.prototype.hasOwnProperty.call(
          nextProjectedRewards.changedGameState,
          MONSTER_CODEX_SYSTEM_ID,
        );
      const nextProjections = nextProjectionInput.degraded
        ? emptyRewardProjection(nextProjectedEvents.domainEvents)
        : buildCommandProjectionReadModel({
          gameState: nextProjectedRewards.gameState,
          domainEvents: nextProjectedEvents.domainEvents,
          reactionEvents: nextProjectedEvents.reactionEvents,
          toastEvents: nextProjectedEvents.toastEvents,
          includeRewardState: Boolean(rewardsChanged),
          includeRecentEventTokens: false,
        });
      return {
        projectionInput: nextProjectionInput,
        projectedRewards: nextProjectedRewards,
        projectedEvents: nextProjectedEvents,
        projections: nextProjections,
      };
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

    let persistedSpellingStats = runtimeRecord.spellingStats || {};
    if (usesBoundedGameplayStore) {
      if (completeCatalogue) {
        persistedSpellingStats = spellingGameplayStatsWithDueSchedule(
          result.stats,
          snapshot.words,
          result.data,
          statsOptions,
        );
      } else if (statsCurrent) {
        persistedSpellingStats = updateSpellingGameplayStats(
          runtimeRecord.spellingStats,
          snapshot.words,
          runtimeRecord.subjectRecord?.data || {},
          result.data,
          nowValue,
          statsOptions,
        );
      }
    }
    const responseStats = usesBoundedGameplayStore
      ? materialiseSpellingGameplayStats(persistedSpellingStats, nowValue)
      : result.stats;

    const { subjectReadModel, publicSubjectReadModel } = await measureCommandPhase(
      capacity,
      COMMAND_PHASE_TIMING.readModelBuild,
      async () => {
        const nextSubjectReadModel = buildSpellingReadModel({
          learnerId: command.learnerId,
          state: result.state,
          prefs: result.prefs,
          stats: responseStats,
          analytics: clientAnalytics({
            ...result.analytics,
            pools: responseStats,
          }),
          audio: replayAudioCue,
          content: contentMeta(contentResult, snapshot),
        });
        // Atomic public projection for bootstrap: keep this thinner than the
        // command response so every answer does not rewrite a fat UI blob.
        const nextPublicSubjectReadModel = buildSpellingPublicSubjectReadModel({
          learnerId: command.learnerId,
          state: result.state,
          prefs: result.prefs,
          stats: responseStats,
          // Bootstrap replays the active prompt via this token; keep it on the
          // public projection even though feedback/analytics stay stripped.
          audio: replayAudioCue,
          postMastery: result.postMastery || null,
        });
        return {
          subjectReadModel: nextSubjectReadModel,
          publicSubjectReadModel: nextPublicSubjectReadModel,
        };
      },
    );

    return {
      learnerId: command.learnerId,
      changed: result.changed,
      subjectReadModel,
      publicSubjectReadModel,
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
        ...(usesBoundedGameplayStore ? {
          spellingGameplay: {
            previousData: runtimeRecord.subjectRecord?.data || {},
            stats: persistedSpellingStats,
            resetAllItems: command.command === 'reset-learner',
          },
        } : {}),
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
