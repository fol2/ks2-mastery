import {
  cloneSerialisable,
  currentRepositoryMeta,
  emptyLearnersSnapshot,
  filterSessions,
  gameStateKey,
  normaliseEventLog,
  normaliseLearnersSnapshot,
  normalisePracticeSessionRecord,
  normaliseRepositoryBundle,
  normaliseSubjectStateRecord,
  subjectStateKey,
} from '../../src/platform/core/repositories/helpers.js';
import { stableHash, uid } from '../../src/platform/core/utils.js';
import {
  backfillSpellingWordExplanations,
  buildPublishedSnapshotFromDraft,
  buildSpellingContentSummary,
  normaliseSpellingContentBundle,
  resolveLearnerVisibleSpellingSnapshot,
  resolveRuntimeSnapshot,
  validateSpellingContentBundle,
} from '../../src/subjects/spelling/content/model.js';
import {
  decodeContentOperationSnapshot,
} from '../../src/subjects/spelling/content/release-snapshot-codec.js';
import {
  isSpellingRuntimeReleaseProjection,
} from '../../src/subjects/spelling/content/runtime-release-projection.js';
import {
  readSeededSpellingContentBundle,
  readSeededSpellingContentSummary,
  readSeededSpellingPublishedSnapshot,
} from './spelling-content-seed-loader.js';
import { coverageTierCounts } from '../../src/subjects/spelling/content/taxonomy.js';
import {
  POST_MEGA_SEED_SHAPES,
  resolvePostMegaSeedShape,
} from '../../shared/spelling/post-mastery-seed-shapes.js';
import {
  normalisePlatformRole,
} from '../../src/platform/access/roles.js';
// P3 U6: membership, role-gate, and access-control helpers extracted to
// a focused module. Barrel re-exports at the bottom of this file keep
// all existing consumers working without import-path changes.
import {
  accountPlatformRole,
  accountType,
  getMembership,
  learnerRowToRecord,
  listMembershipRows,
  MEMBERSHIP_ROLES,
  membershipRowToModel,
  normaliseRequestedPlatformRole,
  requireAccountRoleManager,
  requireAdminHubAccess,
  requireGrammarTransferAdmin,
  requireLearnerReadAccess,
  requireLearnerWriteAccess,
  requireMonsterVisualConfigManager,
  requireParentHubAccess,
  requireSubjectContentExportAccess,
  requireSubjectContentWriteAccess,
  writableRole,
} from './membership-repository.js';
// P3 U6: bootstrap constants, revision hash, capacity meta, and
// selected-learner resolver extracted to a focused module.
import {
  bootstrapCapacityMeta,
  BOOTSTRAP_CAPACITY_VERSION,
  BOOTSTRAP_MODES,
  BOOTSTRAP_PHASE_TIMING,
  BOOTSTRAP_V2_ENVELOPE_SHAPE,
  compactLearnerListEntry,
  computeBootstrapRevisionHash,
  computeWritableLearnerStatesDigest,
  PUBLIC_BOOTSTRAP_ACTIVE_SESSION_LIMIT_PER_LEARNER,
  PUBLIC_BOOTSTRAP_ACTIVE_SESSION_LOOKUP_LIMIT_PER_LEARNER,
  PUBLIC_BOOTSTRAP_CAPACITY_VERSION,
  PUBLIC_BOOTSTRAP_RECENT_EVENT_LIMIT_PER_LEARNER,
  PUBLIC_BOOTSTRAP_RECENT_SESSION_LIMIT_PER_LEARNER,
  resolveBootstrapSelectedLearnerId,
} from './bootstrap-repository.js';
// P3 U6: shared pure-utility helpers extracted to a focused module.
import {
  asTs,
  isMissingTableError,
  isPlainObject,
  logMutation,
  MUTATION_POLICY_VERSION,
  mutationPayloadHash,
  safeJsonParse,
  stableClone,
  stableStringify,
} from './repository-helpers.js';
// P4 U9: pure row-transform functions and their associated constants
// extracted to a focused module. Barrel re-exports at the bottom of this
// file keep all existing consumers working without import-path changes.
import {
  contentRowToBundle,
  eventRowToRecord,
  gameStateRowToRecord,
  practiceSessionRowToRecord,
  publicEventRowToRecord,
  PUBLIC_EVENT_TEXT_ENUMS,
  PUBLIC_EVENT_TYPES,
  publicGameStateRowToRecord,
  publicMonsterCodexEntry,
  publicMonsterCodexHasMastery,
  publicMonsterCodexState,
  publicMonsterCodexStateFromSpellingProgress,
  publicMonsterCodexStateWithoutSpellingEntries,
  PUBLIC_MONSTER_BRANCHES,
  PUBLIC_MONSTER_CODEX_SYSTEM_ID,
  PUBLIC_DIRECT_SPELLING_MONSTER_IDS,
  PUBLIC_MONSTER_IDS,
  PUBLIC_SPELLING_MONSTER_IDS,
  PUBLIC_SPELLING_REWARD_TRACK_IDS,
  PUBLIC_PRACTICE_CARD_LABELS,
  publicPracticeLabel,
  publicPracticeSessionRowToRecord,
  publicPracticeSessionSummary,
  publicPunctuationPracticeSessionSummary,
  publicMistakeSummary,
  publicSpellingAnalytics,
  publicSpellingStats,
  PUBLIC_SPELLING_YEAR_LABELS,
  publicSummaryCards,
  safePublicEventEnum,
  safePublicEventNumber,
  safePublicEventText,
  safePublicEventType,
  safeSpellingCurrentCard,
  safeSpellingPrompt,
  safeSpellingSessionProgress,
  secureSpellingProgress,
  spellingProgressFromSubjectRow,
  SPELLING_SECURE_STAGE,
  subjectStateRowToRecord,
} from './row-transforms.js';
// P3 U6: mutation envelope, receipt persistence, and CAS orchestrators.
import {
  buildMutationMeta,
  idempotencyReuseError,
  loadMutationReceipt,
  normaliseMutationInput,
  staleWriteError,
  storeMutationReceipt,
  withAccountMutation,
  withLearnerMutation,
} from './mutation-repository.js';
// monsterIdForSpellingWord → row-transforms.js
import { buildSpellingProgressPools, buildSpellingWordBankReadModel } from './content/spelling-read-models.js';
import { normaliseServerSpellingData } from './subjects/spelling/state-normalisation.js';
import {
  changedSpellingAchievementRows,
  changedSpellingGameplayItems,
  composeSpellingGameplayData,
  materialiseSpellingGameplayStats,
  parseSpellingGameplayStats,
  SPELLING_BOSS_ACHIEVEMENT_PROJECTION_LIMIT,
  spellingAchievementProjectionIds,
  spellingBossAchievementPrefix,
  spellingLearnerData,
} from './subjects/spelling/gameplay-state.js';
import {
  changedGrammarGameplayItems,
  composeGrammarGameplaySubjectRecord,
  grammarStateWithoutItemMastery,
} from './subjects/grammar/gameplay-state.js';
import {
  changedReadingGameplayQuestions,
  composeReadingGameplaySubjectRecord,
  readingStateWithoutQuestionMastery,
} from './subjects/reading/gameplay-state.js';
import {
  changedPunctuationGameplayItems,
  composePunctuationGameplaySubjectRecord,
  punctuationStarItemIds,
  punctuationStateWithoutItemMastery,
} from './subjects/punctuation/gameplay-persistence.js';
import { markGameplayWorkingSet } from './subjects/gameplay-store.js';
import {
  activityFeedRowFromEventRow,
  appendRecentEventTokens,
  COMMAND_PROJECTION_MODEL_KEY,
  COMMAND_PROJECTION_RECENT_EVENT_LIMIT,
  COMMAND_PROJECTION_SCHEMA_VERSION,
  emptyLearnerReadModel,
  mergeRecentEventTokens,
  normaliseActivityFeedRow,
  normaliseCommandProjectionPayload,
  normaliseLearnerReadModelRow,
  normaliseReadModelKey,
  RECENT_EVENT_TOKEN_RING_LIMIT,
} from './read-models/learner-read-models.js';
import {
  eventToken as eventTokenForDedupe,
} from './projections/events.js';
import { buildSpellingAudioCue } from './subjects/spelling/audio.js';
import {
  contentOperationHeroExposureProjectionFromProof,
} from './content-operations/release-projections.js';
import { ARITHMETIC_CONTENT_RELEASE_ID } from '../../shared/arithmetic/metadata.js';
import { READING_CONTENT_RELEASE_ID } from '../../shared/reading/metadata.js';
import { listPunctuationEvents } from './subjects/punctuation/events.js';
import {
  createInitialPunctuationState,
  // normalisePunctuationSummary → row-transforms.js
} from '../../src/subjects/punctuation/service-contract.js';
import { MONSTER_ASSET_MANIFEST_HASH } from '../../src/platform/game/monster-asset-manifest-meta.js';
import { normaliseHeroProgressState } from '../../shared/hero/progress-state.js';
import { projectHeroSubjectRecord } from './hero/subject-projection.js';
import {
  BackendUnavailableError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ProjectionUnavailableError,
} from './errors.js';
import {
  SELF_SUSPEND_FORBIDDEN,
  LAST_ADMIN_LOCKED_OUT,
} from './error-codes.js';
import {
  all,
  batch,
  bindStatement,
  first,
  requireDatabase,
  run,
  scalar,
  sqlPlaceholders,
  withCapacityCollector,
} from './d1.js';
import { getReadModelDerivedWriteBreaker } from './circuit-breaker-server.js';

// WRITABLE_MEMBERSHIP_ROLES / MEMBERSHIP_ROLES → membership-repository.js
// MUTATION_POLICY_VERSION → repository-helpers.js
// PUBLIC_SPELLING_YEAR_LABELS, PUBLIC_PRACTICE_CARD_LABELS,
// PUBLIC_EVENT_TYPES, PUBLIC_MONSTER_CODEX_SYSTEM_ID, PUBLIC_MONSTER_IDS,
// PUBLIC_DIRECT_SPELLING_MONSTER_IDS, PUBLIC_MONSTER_BRANCHES,
// SPELLING_SECURE_STAGE, PUBLIC_EVENT_TEXT_ENUMS → row-transforms.js
// PUBLIC_BOOTSTRAP_* constants, BOOTSTRAP_CAPACITY_VERSION,
// BOOTSTRAP_MODES, BOOTSTRAP_V2_ENVELOPE_SHAPE → bootstrap-repository.js

// U7: the classroom summary paginates at 50 learners per page (plan R11).
const CLASSROOM_LEARNERS_SUMMARY_PAGE_LIMIT = 50;
const PROJECTION_RECENT_EVENT_LIMIT = COMMAND_PROJECTION_RECENT_EVENT_LIMIT;
const CAPACITY_READ_MODEL_TABLES = Object.freeze([
  'learner_read_models',
  'learner_activity_feed',
]);
const COMMAND_PROJECTION_READ_MODEL_VERSION = 1;
const SPELLING_RUNTIME_CONTENT_CACHE_LIMIT = 8;
const CONTENT_OPERATION_REPOSITORY_METHODS = Object.freeze([
  'seedFirstContentOperationRelease',
  'createContentOperationPackage',
  'createContentOperationPackageRevert',
  'readContentOperationPackage',
  'readLatestContentOperationCandidate',
  'updateContentOperationPackage',
  'listContentOperationPackages',
  'appendContentOperation',
  'deleteContentOperation',
  'buildContentOperationCandidate',
  'resolveContentOperationConflict',
  'approveContentOperationCandidate',
  'publishContentOperationPackage',
  'rollbackContentOperationRelease',
  'captureContentOperationReleaseProof',
  'readLatestContentOperationRelease',
  'readContentOperationRelease',
  'listContentOperationReleases',
  'listContentOperationEvents',
  'invalidateContentOperationPackageApproval',
  'recordContentOperationEvent',
]);
// Runtime read paths must not pull a multi-megabyte account content row into
// every bootstrap/Hero request. Public read-model paths use the bundled
// published snapshot; command, admin, export, and word-bank paths still read
// the full editable content row from D1.
const spellingRuntimeContentCache = new Map();
const MONSTER_VISUAL_CONFIG_ID = 'global';
const MONSTER_VISUAL_SCHEMA_VERSION = 1;
const MONSTER_VISUAL_CONFIG_POINTER_CACHE_TTL_MS = 5_000;
const monsterVisualConfigPointerCache = new WeakMap();
let monsterVisualModulesPromise = null;
const MONSTER_VISUAL_SCOPE_TYPE = 'platform';
const MONSTER_VISUAL_SCOPE_ID = 'monster-visual-config';
const CONTENT_OPERATION_ASSET_PROOF_KEY = 'contentOperationsAssets';
const CONTENT_OPERATION_MONSTER_ASSET_RUNTIME_ROUTE = '/api/content-operations/assets/monster-image';

function loadMonsterVisualModules() {
  if (!monsterVisualModulesPromise) {
    monsterVisualModulesPromise = Promise.all([
      import('../../src/platform/game/monster-visual-config.js'),
      import('../../src/platform/game/render/effect-config-defaults.js'),
    ]).then(([visualConfig, effectDefaults]) => ({
      ...visualConfig,
      bundledEffectConfig: effectDefaults.bundledEffectConfig,
    }));
  }
  return monsterVisualModulesPromise;
}

function createLazyContentOperationsRepository(context) {
  let repositoryPromise = null;
  const loadRepository = () => {
    if (!repositoryPromise) {
      repositoryPromise = import('./content-operations/repository.js')
        .then(({ createContentOperationsRepository }) => createContentOperationsRepository(context));
    }
    return repositoryPromise;
  };
  return Object.fromEntries(CONTENT_OPERATION_REPOSITORY_METHODS.map((methodName) => [
    methodName,
    async (...args) => (await loadRepository())[methodName](...args),
  ]));
}
const LEGACY_SPELLING_CONTENT_CUTOVER_COMPATIBILITY = Object.freeze({
  legacyExportRoute: '/api/content/spelling',
  legacyExportMode: 'read_only_after_global_release',
  legacyWriteRoute: '/api/content/spelling',
  legacyWriteMode: 'disabled_after_global_release',
  mutationPath: 'content_operations_package_approval',
});

// safeJsonParse, asTs, isMissingTableError → repository-helpers.js

function isMissingCapacityReadModelTableError(error) {
  return CAPACITY_READ_MODEL_TABLES.some((tableName) => isMissingTableError(error, tableName));
}

// isPlainObject, stableClone, stableStringify, mutationPayloadHash → repository-helpers.js
// subjectStateRowToRecord, safeSpellingPrompt, safeSpellingCurrentCard,
// safeSpellingSessionProgress, publicSpellingStats, publicSpellingAnalytics
// → row-transforms.js

const DAY_MS = 24 * 60 * 60 * 1000;

function spellingTodayDay(now = Date.now()) {
  const numeric = Number(now);
  return Math.floor((Number.isFinite(numeric) ? numeric : Date.now()) / DAY_MS);
}

function compactSpellingProgressEntry(rawValue, now) {
  const raw = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : {};
  return {
    stage: Number.isFinite(Number(raw.stage)) ? Number(raw.stage) : 0,
    attempts: Number.isFinite(Number(raw.attempts)) ? Number(raw.attempts) : 0,
    correct: Number.isFinite(Number(raw.correct)) ? Number(raw.correct) : 0,
    wrong: Number.isFinite(Number(raw.wrong)) ? Number(raw.wrong) : 0,
    dueDay: Number.isFinite(Number(raw.dueDay)) ? Number(raw.dueDay) : spellingTodayDay(now),
  };
}

function emptyCompactSpellingStats() {
  return {
    total: 0,
    secure: 0,
    due: 0,
    fresh: 0,
    trouble: 0,
    attempts: 0,
    correct: 0,
    accuracy: null,
  };
}

function compactSpellingStatsFromData(data = {}, now = Date.now()) {
  const progressMap = normaliseServerSpellingData(data, now).progress || {};
  const today = spellingTodayDay(now);
  const stats = Object.values(progressMap).reduce((acc, rawEntry) => {
    const progress = compactSpellingProgressEntry(rawEntry, now);
    acc.total += 1;
    acc.attempts += progress.attempts;
    acc.correct += progress.correct;
    if (progress.attempts === 0) acc.fresh += 1;
    if (progress.stage >= SPELLING_SECURE_STAGE) acc.secure += 1;
    if (progress.attempts > 0 && progress.dueDay <= today) acc.due += 1;
    if (progress.wrong > 0 && (progress.wrong >= progress.correct || progress.stage < SPELLING_SECURE_STAGE)) {
      acc.trouble += 1;
    }
    return acc;
  }, emptyCompactSpellingStats());
  const withAccuracy = {
    ...stats,
    accuracy: stats.attempts ? Math.round((stats.correct / stats.attempts) * 100) : null,
  };
  const emptyStats = emptyCompactSpellingStats();
  return {
    all: withAccuracy,
    core: { ...withAccuracy },
    y34: { ...emptyStats },
    y56: { ...emptyStats },
    secureExtension: { ...emptyStats },
    extra: { ...emptyStats },
  };
}

async function redactSpellingUiForClient(ui, data = {}, learnerId = '', {
  audio = null,
  contentSnapshot = null,
  stats = null,
  now = Date.now(),
} = {}) {
  const raw = ui && typeof ui === 'object' && !Array.isArray(ui) ? ui : {};
  const session = raw.session && typeof raw.session === 'object' && !Array.isArray(raw.session)
    ? raw.session
    : null;
  const progressPools = stats && typeof stats === 'object' && !Array.isArray(stats)
    ? materialiseSpellingGameplayStats(stats, now)
    : contentSnapshot
      ? buildSpellingProgressPools({ contentSnapshot, data, now })
      : compactSpellingStatsFromData(data, now);
  // Non-bounded legacy bootstrap paths may still derive `postMastery` from a
  // supplied runtime snapshot. The selected-learner-bounded public bootstrap
  // deliberately passes no snapshot so the signed-in shell cannot trip Worker
  // resource limits before the page becomes usable.
  let postMastery = null;
  if (contentSnapshot) {
    try {
      const { getSpellingPostMasteryState } = await import('../../src/subjects/spelling/read-model.js');
      postMastery = getSpellingPostMasteryState({
        subjectStateRecord: { data, ui: raw },
        runtimeSnapshot: contentSnapshot,
        now,
        sourceHint: 'worker',
      });
    } catch (error) {
      globalThis.console?.warn?.('[spelling.bootstrap] postMastery derivation failed, omitting from response', error);
      postMastery = null;
    }
  }
  return {
    subjectId: 'spelling',
    learnerId,
    version: 1,
    phase: typeof raw.phase === 'string' ? raw.phase : 'dashboard',
    awaitingAdvance: Boolean(raw.awaitingAdvance),
    session: session
      ? {
        id: typeof session.id === 'string' ? session.id : '',
        type: typeof session.type === 'string' ? session.type : 'learning',
        mode: typeof session.mode === 'string' ? session.mode : 'smart',
        label: typeof session.label === 'string' ? session.label : 'Spelling round',
        practiceOnly: Boolean(session.practiceOnly),
        fallbackToSmart: Boolean(session.fallbackToSmart),
        phase: typeof session.phase === 'string' ? session.phase : 'question',
        promptCount: Number.isFinite(Number(session.promptCount)) ? Number(session.promptCount) : 0,
        startedAt: Number.isFinite(Number(session.startedAt)) ? Number(session.startedAt) : 0,
        progress: safeSpellingSessionProgress(session.progress),
        currentStage: Number.isFinite(Number(session.currentStage)) ? Number(session.currentStage) : 0,
        currentCard: safeSpellingCurrentCard(session.currentCard),
        serverAuthority: 'worker',
      }
      : null,
    feedback: null,
    summary: null,
    error: typeof raw.error === 'string' ? raw.error : '',
    prefs: cloneSerialisable(data?.prefs) || {},
    stats: publicSpellingStats(progressPools),
    analytics: contentSnapshot ? publicSpellingAnalytics(progressPools, now) : null,
    audio: audio ? cloneSerialisable(audio) : null,
    content: null,
    postMastery,
  };
}

let punctuationReadModelModulesPromise = null;
let grammarReadModelModulePromise = null;
let readingReadModelModulesPromise = null;
let arithmeticReadModelModulesPromise = null;
let reasoningReadModelModulePromise = null;

async function loadPunctuationReadModelModules() {
  if (!punctuationReadModelModulesPromise) {
    punctuationReadModelModulesPromise = Promise.all([
      import('../../shared/punctuation/service.js'),
      import('./subjects/punctuation/read-models.js'),
    ])
      .then(([serviceModule, readModelModule]) => ({
        createPunctuationService: serviceModule.createPunctuationService,
        buildPunctuationReadModel: readModelModule.buildPunctuationReadModel,
      }))
      .catch((error) => {
        punctuationReadModelModulesPromise = null;
        throw error;
      });
  }
  return punctuationReadModelModulesPromise;
}

async function loadGrammarReadModelModule() {
  if (!grammarReadModelModulePromise) {
    grammarReadModelModulePromise = import('./subjects/grammar/read-models.js')
      .catch((error) => {
        grammarReadModelModulePromise = null;
        throw error;
      });
  }
  return grammarReadModelModulePromise;
}

async function loadReadingReadModelModules() {
  if (!readingReadModelModulesPromise) {
    readingReadModelModulesPromise = Promise.all([
      import('./subjects/reading/read-models.js'),
      import('./subjects/reading/engine.js'),
    ])
      .then(([readModelModule, engineModule]) => ({
        buildReadingReadModel: readModelModule.buildReadingReadModel,
        engineInternals: engineModule.__readingEngineInternals,
      }))
      .catch((error) => {
        readingReadModelModulesPromise = null;
        throw error;
      });
  }
  return readingReadModelModulesPromise;
}

async function loadArithmeticReadModelModules() {
  if (!arithmeticReadModelModulesPromise) {
    arithmeticReadModelModulesPromise = Promise.all([
      import('./subjects/arithmetic/read-models.js'),
      import('./subjects/arithmetic/engine.js'),
    ])
      .then(([readModelModule, engineModule]) => ({
        buildArithmeticReadModel: readModelModule.buildArithmeticReadModel,
        engineInternals: engineModule.__arithmeticEngineInternals,
      }))
      .catch((error) => {
        arithmeticReadModelModulesPromise = null;
        throw error;
      });
  }
  return arithmeticReadModelModulesPromise;
}

async function loadReasoningReadModelModule() {
  if (!reasoningReadModelModulePromise) {
    reasoningReadModelModulePromise = import('./subjects/reasoning/read-models.js')
      .catch((error) => {
        reasoningReadModelModulePromise = null;
        throw error;
      });
  }
  return reasoningReadModelModulePromise;
}

function createPunctuationReadModelService(createPunctuationService, data, now) {
  return createPunctuationService({
    repository: {
      readData() {
        return cloneSerialisable(data) || {};
      },
    },
    now: () => now,
    random: () => 0,
  });
}

async function redactPunctuationUiForClient(ui, data = {}, learnerId = '', { now = Date.now() } = {}) {
  const {
    buildPunctuationReadModel,
    createPunctuationService,
  } = await loadPunctuationReadModelModules();
  const service = createPunctuationReadModelService(createPunctuationService, data, now);
  const state = service.initState(ui || createInitialPunctuationState());
  const readModel = buildPunctuationReadModel({
    learnerId,
    state,
    prefs: service.getPrefs(learnerId),
    stats: service.getStats(learnerId),
    analytics: service.getAnalyticsSnapshot(learnerId),
    data,
  });
  if (readModel.summary?.gps) {
    readModel.summary = publicPunctuationPracticeSessionSummary(readModel.summary);
  }
  return readModel;
}

async function redactGrammarUiForClient(ui, data = {}, learnerId = '', { now = Date.now() } = {}) {
  const { buildGrammarReadModel } = await loadGrammarReadModelModule();
  const state = {
    ...(data && typeof data === 'object' && !Array.isArray(data) ? data : {}),
    ...(ui && typeof ui === 'object' && !Array.isArray(ui) ? ui : {}),
  };
  return buildGrammarReadModel({
    learnerId,
    state,
    now,
    aiEnrichment: state.aiEnrichment || null,
  });
}

async function redactReadingUiForClient(ui, data = {}, learnerId = '') {
  const { buildReadingReadModel, engineInternals } = await loadReadingReadModelModules();
  const runtimeData = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const runtimeState = ui && typeof ui === 'object' && !Array.isArray(ui) ? ui : {};
  return buildReadingReadModel({
    learnerId,
    state: runtimeState,
    data: runtimeData,
    stats: engineInternals.buildStats(runtimeData),
    analytics: engineInternals.buildAnalytics(runtimeData),
  });
}

async function redactArithmeticUiForClient(ui, data = {}, learnerId = '') {
  const { buildArithmeticReadModel, engineInternals } = await loadArithmeticReadModelModules();
  const runtimeData = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const runtimeState = ui && typeof ui === 'object' && !Array.isArray(ui) ? ui : {};
  return buildArithmeticReadModel({
    learnerId,
    state: runtimeState,
    data: runtimeData,
    stats: engineInternals.buildStats(runtimeData),
    analytics: engineInternals.buildAnalytics(runtimeData),
  });
}

async function redactReasoningUiForClient(ui, data = {}, learnerId = '', { now = Date.now() } = {}) {
  const { buildReasoningReadModel } = await loadReasoningReadModelModule();
  const runtimeData = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const runtimeState = ui && typeof ui === 'object' && !Array.isArray(ui) ? ui : {};
  return buildReasoningReadModel({
    learnerId,
    state: runtimeState,
    data: runtimeData,
    nowValue: now,
  });
}

function compactText(value, maxLength = 180) {
  if (typeof value !== 'string') return value;
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function compactScalar(value, maxLength = 180) {
  if (value == null) return value;
  if (typeof value === 'string') return compactText(value, maxLength);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return undefined;
}

function compactScalarArray(value, limit = 5, maxLength = 80) {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((entry) => compactScalar(entry, maxLength))
    .filter((entry) => entry !== undefined)
    .slice(0, limit);
}

function compactObjectFields(source, keys, {
  stringMaxLength = 180,
  arrayLimit = 5,
} = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const output = {};
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const value = source[key];
    if (Array.isArray(value)) {
      const compactArray = compactScalarArray(value, arrayLimit, stringMaxLength);
      if (compactArray && compactArray.length) output[key] = compactArray;
      continue;
    }
    const compactValue = compactScalar(value, stringMaxLength);
    if (compactValue !== undefined) output[key] = compactValue;
  }
  return Object.keys(output).length ? output : null;
}

function compactList(value, limit, mapper) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, limit)
    .map((entry) => mapper(entry))
    .filter(Boolean);
}

function compactProgressSnapshot(value) {
  return compactObjectFields(value, [
    'trackedConcepts',
    'totalConcepts',
    'securedConcepts',
    'dueConcepts',
    'weakConcepts',
    'accuracyPercent',
    'streak',
    'streakCount',
    'attempts',
    'correct',
    'wrong',
    'generatedAt',
  ], { stringMaxLength: 80 });
}

function compactSkillAnalyticsEntry(entry) {
  return compactObjectFields(entry, [
    'id',
    'skillId',
    'templateId',
    'strandId',
    'clusterId',
    'domain',
    'name',
    'label',
    'status',
    'strength',
    'attempts',
    'correct',
    'wrong',
    'accuracy',
    'due',
    'dueAt',
    'mastery',
    'secure',
    'lastSeenAt',
  ], { stringMaxLength: 140, arrayLimit: 4 });
}

function compactRecentActivityEntry(entry) {
  return compactObjectFields(entry, [
    'id',
    'itemId',
    'questionId',
    'templateId',
    'templateLabel',
    'questionType',
    'questionTypeLabel',
    'mode',
    'status',
    'correct',
    'score',
    'maxScore',
    'misconception',
    'createdAt',
    'timestamp',
    'skillIds',
    'conceptIds',
  ], { stringMaxLength: 140, arrayLimit: 4 });
}

function compactGrammarConcept(entry) {
  return compactObjectFields(entry, [
    'id',
    'name',
    'domain',
    'status',
    'strength',
    'attempts',
    'correct',
    'wrong',
    'correctStreak',
    'dueAt',
    'intervalDays',
    'punctuationForGrammar',
  ], { stringMaxLength: 180, arrayLimit: 4 });
}

function compactGrammarAnalytics(analytics) {
  if (!analytics || typeof analytics !== 'object' || Array.isArray(analytics)) return null;
  const output = {
    concepts: compactList(analytics.concepts, 24, compactGrammarConcept),
    progressSnapshot: compactProgressSnapshot(analytics.progressSnapshot),
    evidenceSummary: compactList(analytics.evidenceSummary, 3, (entry) => compactObjectFields(entry, [
      'id',
      'label',
      'detail',
    ], { stringMaxLength: 180 })),
    misconceptionPatterns: compactList(analytics.misconceptionPatterns, 5, compactSkillAnalyticsEntry),
    questionTypeSummary: compactList(analytics.questionTypeSummary, 8, compactSkillAnalyticsEntry),
    recentActivity: compactList(analytics.recentActivity, 5, compactRecentActivityEntry),
  };
  return Object.fromEntries(Object.entries(output).filter(([, value]) => (
    value && (!Array.isArray(value) || value.length)
  )));
}

function compactPunctuationAnalytics(analytics) {
  if (!analytics || typeof analytics !== 'object' || Array.isArray(analytics)) return null;
  const scalar = compactObjectFields(analytics, [
    'available',
    'releaseId',
    'attempts',
    'correct',
    'accuracy',
    'sessionsCompleted',
    'rewardUnits',
  ], { stringMaxLength: 120 });
  const output = {
    ...(scalar || {}),
    dailyGoal: analytics.dailyGoal && typeof analytics.dailyGoal === 'object'
      ? compactObjectFields(analytics.dailyGoal, ['target', 'done', 'remaining', 'met'], { stringMaxLength: 80 })
      : undefined,
    streak: analytics.streak && typeof analytics.streak === 'object'
      ? compactObjectFields(analytics.streak, ['current', 'best', 'active'], { stringMaxLength: 80 })
      : undefined,
    skillRows: compactList(analytics.skillRows, 20, compactSkillAnalyticsEntry),
    bySessionMode: compactList(analytics.bySessionMode, 8, compactSkillAnalyticsEntry),
    byItemMode: compactList(analytics.byItemMode, 8, compactSkillAnalyticsEntry),
    weakestFacets: compactList(analytics.weakestFacets, 6, compactSkillAnalyticsEntry),
    misconceptionPatterns: compactList(analytics.misconceptionPatterns, 6, compactSkillAnalyticsEntry),
  };
  return Object.fromEntries(Object.entries(output).filter(([, value]) => (
    value && (!Array.isArray(value) || value.length)
  )));
}

function compactReadingAnalytics(analytics) {
  if (!analytics || typeof analytics !== 'object' || Array.isArray(analytics)) return null;
  const output = {
    ...(compactObjectFields(analytics, ['available', 'generatedAt'], { stringMaxLength: 80 }) || {}),
    skills: compactList(analytics.skills, 20, compactSkillAnalyticsEntry),
    byGenre: compactList(analytics.byGenre, 6, compactSkillAnalyticsEntry),
    byType: compactList(analytics.byType, 8, compactSkillAnalyticsEntry),
    misconceptionPatterns: compactList(analytics.misconceptionPatterns, 6, compactSkillAnalyticsEntry),
    reviewQueue: compactList(analytics.reviewQueue, 6, compactRecentActivityEntry),
    recentActivity: compactList(analytics.recentActivity, 5, compactRecentActivityEntry),
  };
  return Object.fromEntries(Object.entries(output).filter(([, value]) => (
    value && (!Array.isArray(value) || value.length)
  )));
}

function compactArithmeticAnalytics(analytics) {
  if (!analytics || typeof analytics !== 'object' || Array.isArray(analytics)) return null;
  const output = {
    strands: compactList(analytics.strands, 8, compactSkillAnalyticsEntry),
  };
  return Object.fromEntries(Object.entries(output).filter(([, value]) => (
    value && (!Array.isArray(value) || value.length)
  )));
}

function compactReasoningAnalytics(analytics) {
  if (!analytics || typeof analytics !== 'object' || Array.isArray(analytics)) return null;
  const output = {
    ...(compactObjectFields(analytics, ['available'], { stringMaxLength: 80 }) || {}),
    skills: compactList(analytics.skills, 8, compactSkillAnalyticsEntry),
  };
  return Object.fromEntries(Object.entries(output).filter(([, value]) => (
    value && (!Array.isArray(value) || value.length)
  )));
}

const BOOTSTRAP_ANALYTICS_COMPACTORS = Object.freeze({
  grammar: compactGrammarAnalytics,
  punctuation: compactPunctuationAnalytics,
  reading: compactReadingAnalytics,
  arithmetic: compactArithmeticAnalytics,
  reasoning: compactReasoningAnalytics,
});

const BOOTSTRAP_LIGHT_SUBJECTS = new Set(['arithmetic', 'reasoning']);

function compactBootstrapSubjectStats(subjectId, stats) {
  if (!BOOTSTRAP_LIGHT_SUBJECTS.has(subjectId)) return stats;
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return stats;
  const overview = compactObjectFields(stats.overview, [
    'totalQuestions',
    'accuracy',
    'independentAccuracy',
    'due',
    'weak',
    'securedSkills',
    'streakDays',
    'evidenceStars',
    'securedRewardUnits',
  ], { stringMaxLength: 80 });
  return overview ? { overview } : {};
}

function compactBootstrapPublicSubjectUi(subjectId, ui) {
  if (!ui || typeof ui !== 'object' || Array.isArray(ui)) return ui;
  const compact = {};
  for (const key of [
    'subjectId',
    'learnerId',
    'version',
    'releaseId',
    'authority',
    'phase',
    'awaitingAdvance',
    'session',
    'feedback',
    'summary',
    'error',
    'availability',
    'prefs',
    'stats',
    'content',
    'parentSummary',
    'starView',
    'audio',
    'postMastery',
  ]) {
    if (!Object.prototype.hasOwnProperty.call(ui, key)) continue;
    if (key === 'content' && BOOTSTRAP_LIGHT_SUBJECTS.has(subjectId)) continue;
    compact[key] = key === 'stats'
      ? compactBootstrapSubjectStats(subjectId, ui[key])
      : ui[key];
  }
  const compactAnalytics = BOOTSTRAP_ANALYTICS_COMPACTORS[subjectId]?.(ui.analytics);
  if (compactAnalytics && Object.keys(compactAnalytics).length) {
    compact.analytics = compactAnalytics;
  } else if (Object.prototype.hasOwnProperty.call(ui, 'analytics')) {
    compact.analytics = null;
  }
  if (subjectId === 'grammar') {
    compact.capabilities = ui.capabilities && typeof ui.capabilities === 'object'
      ? {
        aiEnrichment: ui.capabilities.aiEnrichment && typeof ui.capabilities.aiEnrichment === 'object'
          ? { enabled: ui.capabilities.aiEnrichment.enabled !== false }
          : undefined,
      }
      : undefined;
  }
  return Object.fromEntries(Object.entries(compact).filter(([, value]) => value !== undefined));
}

const PUBLIC_SUBJECT_READ_MODEL_BUILDERS = Object.freeze({
  async spelling({ record, row, spellingContentSnapshot, now }) {
    const audio = await buildSpellingAudioCue({
      learnerId: row.learner_id,
      state: record.ui,
    });
    return redactSpellingUiForClient(record.ui, record.data, row.learner_id, {
      audio,
      contentSnapshot: spellingContentSnapshot,
      stats: row.spelling_stats_json
        ? parseSpellingGameplayStats(row.spelling_stats_json)
        : null,
      now,
    });
  },
  async punctuation({ record, row, now }) {
    return redactPunctuationUiForClient(record.ui, record.data, row.learner_id, { now });
  },
  grammar({ record, row, now }) {
    return redactGrammarUiForClient(record.ui, record.data, row.learner_id, { now });
  },
  reading({ record, row }) {
    return redactReadingUiForClient(record.ui, record.data, row.learner_id);
  },
  arithmetic({ record, row }) {
    return redactArithmeticUiForClient(record.ui, record.data, row.learner_id);
  },
  reasoning({ record, row, now }) {
    return redactReasoningUiForClient(record.ui, record.data, row.learner_id, { now });
  },
});

async function publicSubjectStateRowToRecord(row, {
  spellingContentSnapshot = null,
  punctuationItemRows = [],
  now = Date.now(),
  compact = false,
} = {}) {
  const storedRecord = subjectStateRowToRecord(row);
  const record = row?.subject_id === 'punctuation'
    ? composePunctuationGameplaySubjectRecord(storedRecord, punctuationItemRows, now)
    : storedRecord;
  const buildPublicUi = PUBLIC_SUBJECT_READ_MODEL_BUILDERS[row.subject_id];
  if (!buildPublicUi) return record;
  const ui = await buildPublicUi({
    record,
    row,
    now,
    spellingContentSnapshot,
  });
  const shouldCompact = compact
    && Object.prototype.hasOwnProperty.call(BOOTSTRAP_ANALYTICS_COMPACTORS, row.subject_id);
  return normaliseSubjectStateRecord({
    ui: shouldCompact ? compactBootstrapPublicSubjectUi(row.subject_id, ui) : ui,
    data: {},
    updatedAt: record.updatedAt,
  });
}

// learnerRowToRecord → membership-repository.js
// gameStateRowToRecord, publicMonsterCodexEntry, publicMonsterCodexState,
// publicGameStateRowToRecord, secureSpellingProgress,
// spellingProgressFromSubjectRow, publicMonsterCodexStateFromSpellingProgress,
// publicMonsterCodexHasMastery → row-transforms.js

async function mergePublicSpellingCodexState(db, accountId, subjectRows, gameState, {
  runtimeSnapshot = null,
  now = Date.now(),
  env = {},
} = {}) {
  const spellingRows = subjectRows.filter((row) => row.subject_id === 'spelling');
  if (!spellingRows.length) return gameState;

  const snapshot = runtimeSnapshot || (await readSpellingContentForReadModels(db, accountId, 'spelling', {
    nowMs: now,
    env,
  })).runtimeSnapshot;

  for (const row of spellingRows) {
    const progress = spellingProgressFromSubjectRow(row);
    if (!progress) continue;
    const key = gameStateKey(row.learner_id, PUBLIC_MONSTER_CODEX_SYSTEM_ID);
    const existingState = publicMonsterCodexState(gameState[key] || {}, { learnerId: row.learner_id });
    const hasExistingSpellingState = PUBLIC_SPELLING_MONSTER_IDS.some((monsterId) => (
      Object.prototype.hasOwnProperty.call(existingState, monsterId)
    ));
    const derived = publicMonsterCodexStateFromSpellingProgress(progress, snapshot, existingState, {
      learnerId: row.learner_id,
      now,
      env,
    });
    if (!derived) continue;
    if (derived.knownWordCount > 0 || hasExistingSpellingState || !publicMonsterCodexHasMastery(existingState)) {
      const existingNonSpellingState = publicMonsterCodexStateWithoutSpellingEntries(existingState);
      gameState[key] = publicMonsterCodexState({
        ...existingNonSpellingState,
        ...derived.state,
      }, { learnerId: row.learner_id });
    }
  }

  return gameState;
}

// practiceSessionRowToRecord, publicPracticeSessionRowToRecord,
// eventRowToRecord, publicPracticeLabel, publicSummaryCards,
// publicMistakeSummary, publicPracticeSessionSummary,
// publicPunctuationPracticeSessionSummary, safePublicEventText,
// safePublicEventNumber, safePublicEventType, safePublicEventEnum,
// publicEventRowToRecord, contentRowToBundle → row-transforms.js

async function readSubjectContentBundle(db, accountId, subjectId = 'spelling') {
  const row = await readSubjectContentRow(db, accountId, subjectId);
  const seededBundle = await readSeededSpellingContentBundle();
  return row ? contentRowToBundle(row, seededBundle) : cloneSerialisable(seededBundle);
}

async function readSubjectContentRow(db, accountId, subjectId = 'spelling') {
  const accountRow = await first(db, 'SELECT * FROM account_subject_content WHERE account_id = ? AND subject_id = ?', [accountId, subjectId]);
  if (accountRow) return accountRow;
  return first(db, `
    SELECT *
    FROM account_subject_content
    WHERE subject_id = ?
    ORDER BY updated_at DESC
    LIMIT 1
  `, [subjectId]);
}

async function readSeededSpellingRuntimeContentBundle(subjectId = 'spelling') {
  const key = spellingRuntimeContentSeedKey(subjectId);
  return readCachedSpellingRuntimeContent(key)
    || rememberSpellingRuntimeContent(key, await buildSeededSpellingRuntimeContent(subjectId));
}

async function readSpellingRuntimeContentReleaseBundle(
  db,
  subjectId,
  releaseRow,
  cachePrefix = 'release',
) {
  if (!releaseRow) return readSeededSpellingRuntimeContentBundle(subjectId);
  const key = spellingRuntimeContentReleaseKey(releaseRow, subjectId, cachePrefix);
  const cached = readCachedSpellingRuntimeContent(key);
  if (cached) return cached;
  const runtimeReleaseRow = await readPublishedContentOperationReleaseRow(db, subjectId, {
    includeRuntimeSnapshot: true,
    releaseId: releaseRow.release_id,
  });
  return rememberSpellingRuntimeContent(
    key,
    await buildSpellingRuntimeContentFromRelease(runtimeReleaseRow, subjectId),
  );
}

async function readPublishedContentOperationReleaseRow(db, subjectId = 'spelling', {
  includeSnapshot = false,
  includeRuntimeSnapshot = false,
  releaseId = null,
} = {}) {
  const releaseFilter = releaseId
    ? 'subject_id = ? AND status = \'published\' AND release_id = ?'
    : 'subject_id = ? AND status = \'published\'';
  const params = releaseId ? [subjectId, releaseId] : [subjectId];
  try {
    return await first(db, `
      SELECT
        release_id,
        subject_id,
        status,
        snapshot_hash,
        ${includeSnapshot ? 'snapshot_json,' : ''}
        ${includeRuntimeSnapshot ? 'runtime_snapshot_json, runtime_summary_json,' : ''}
        proof_json,
        published_at,
        created_at
      FROM content_operation_releases
      WHERE ${releaseFilter}
      ORDER BY published_at DESC, created_at DESC, rowid DESC
      LIMIT 1
    `, params);
  } catch (error) {
    if (isMissingTableError(error, 'content_operation_releases')) return null;
    throw error;
  }
}

async function readActiveContentOperationOverrideReleaseRow(db, accountId, subjectId = 'spelling', {
  includeSnapshot = false,
  includeRuntimeSnapshot = false,
} = {}) {
  try {
    return await first(db, `
      SELECT
        r.release_id,
        r.subject_id,
        r.status,
        r.snapshot_hash,
        ${includeSnapshot ? 'r.snapshot_json AS snapshot_json,' : ''}
        ${includeRuntimeSnapshot ? 'r.runtime_snapshot_json AS runtime_snapshot_json, r.runtime_summary_json AS runtime_summary_json,' : ''}
        r.proof_json,
        r.published_at,
        r.created_at
      FROM content_operation_account_overrides o
      JOIN content_operation_releases r
        ON r.release_id = o.release_id
       AND r.subject_id = o.subject_id
       AND r.status = 'published'
      WHERE o.account_id = ?
        AND o.subject_id = ?
        AND o.active = 1
      ORDER BY o.created_at DESC
      LIMIT 1
    `, [accountId, subjectId]);
  } catch (error) {
    if (
      isMissingTableError(error, 'content_operation_account_overrides')
      || isMissingTableError(error, 'content_operation_releases')
    ) {
      return null;
    }
    throw error;
  }
}

async function readResolvedContentOperationReleaseRow(db, accountId, subjectId = 'spelling', {
  includeSnapshot = false,
  includeRuntimeSnapshot = false,
} = {}) {
  try {
    return await first(db, `
      SELECT
        release_id,
        subject_id,
        status,
        snapshot_hash,
        ${includeSnapshot ? 'snapshot_json,' : ''}
        ${includeRuntimeSnapshot ? 'runtime_snapshot_json, runtime_summary_json,' : ''}
        proof_json,
        published_at,
        created_at,
        release_source
      FROM (
        SELECT
          r.release_id,
          r.subject_id,
          r.status,
          r.snapshot_hash,
          ${includeSnapshot ? 'r.snapshot_json AS snapshot_json,' : ''}
          ${includeRuntimeSnapshot ? 'r.runtime_snapshot_json AS runtime_snapshot_json, r.runtime_summary_json AS runtime_summary_json,' : ''}
          r.proof_json,
          r.published_at,
          r.created_at,
          'override' AS release_source,
          0 AS precedence_rank,
          o.created_at AS precedence_created_at,
          r.rowid AS release_rowid
        FROM content_operation_account_overrides o
        JOIN content_operation_releases r
          ON r.release_id = o.release_id
         AND r.subject_id = o.subject_id
         AND r.status = 'published'
        WHERE o.account_id = ?
          AND o.subject_id = ?
          AND o.active = 1
        UNION ALL
        SELECT
          r.release_id,
          r.subject_id,
          r.status,
          r.snapshot_hash,
          ${includeSnapshot ? 'r.snapshot_json AS snapshot_json,' : ''}
          ${includeRuntimeSnapshot ? 'r.runtime_snapshot_json AS runtime_snapshot_json, r.runtime_summary_json AS runtime_summary_json,' : ''}
          r.proof_json,
          r.published_at,
          r.created_at,
          'global' AS release_source,
          1 AS precedence_rank,
          r.published_at AS precedence_created_at,
          r.rowid AS release_rowid
        FROM content_operation_releases r
        WHERE r.subject_id = ?
          AND r.status = 'published'
      )
      ORDER BY precedence_rank ASC, precedence_created_at DESC, published_at DESC, created_at DESC, release_rowid DESC
      LIMIT 1
    `, [accountId, subjectId, subjectId]);
  } catch (error) {
    if (
      isMissingTableError(error, 'content_operation_account_overrides')
      || isMissingTableError(error, 'content_operation_releases')
    ) {
      return null;
    }
    throw error;
  }
}

function contentOperationReleaseRevisionToken(row) {
  if (!row) return 'bundled';
  return [
    row.release_source === 'override' ? 'override' : 'global',
    row.release_id || '',
    row.snapshot_hash || '',
    Number(row.published_at) || 0,
  ].join(':');
}

async function readHeroCampRewardTracks(db, accountId, subjectId = 'spelling') {
  const releaseRow = await readResolvedContentOperationReleaseRow(db, accountId, subjectId, {
    includeSnapshot: false,
  });
  if (!releaseRow) return null;
  const proof = safeJsonParse(releaseRow.proof_json, null);
  const projection = contentOperationHeroExposureProjectionFromProof(proof);
  return projection ? cloneSerialisable(projection.rewardTracks) : null;
}

function runtimeMonsterAssetReferenceUrl(releaseId, referenceId) {
  return [
    CONTENT_OPERATION_MONSTER_ASSET_RUNTIME_ROUTE,
    encodeURIComponent(String(releaseId || '')),
    encodeURIComponent(String(referenceId || '')),
  ].join('/');
}

function runtimeMonsterAssetKey(monsterId, branch = 'b1', stage = 0) {
  const safeStage = Math.max(0, Math.min(4, Math.floor(Number(stage) || 0)));
  return `${String(monsterId || '').trim()}-${String(branch || 'b1').trim()}-${safeStage}`;
}

function runtimeMonsterAssetReferencesFromReleaseRow(row) {
  const releaseId = typeof row?.release_id === 'string' ? row.release_id : '';
  if (!releaseId) return null;
  const proof = safeJsonParse(row?.proof_json, null);
  const manifest = isPlainObject(proof?.[CONTENT_OPERATION_ASSET_PROOF_KEY]?.assetReferenceManifest)
    ? proof[CONTENT_OPERATION_ASSET_PROOF_KEY].assetReferenceManifest
    : null;
  const references = Array.isArray(manifest?.references) ? manifest.references : [];
  if (!references.length) return null;
  const byAssetKey = {};

  for (const reference of references) {
    if (!isPlainObject(reference)) continue;
    const target = isPlainObject(reference.target) ? reference.target : {};
    const monsterId = typeof target.monsterId === 'string' ? target.monsterId.trim() : '';
    const branchId = typeof target.branchId === 'string' ? target.branchId.trim() : '';
    const stageId = String(target.stageId ?? '').trim();
    const referenceId = typeof reference.referenceId === 'string' ? reference.referenceId.trim() : '';
    if (!monsterId || !branchId || !stageId || !referenceId) continue;
    const assetKey = runtimeMonsterAssetKey(monsterId, branchId, stageId);
    const width = Math.max(0, Math.floor(Number(reference.content?.dimensions?.width) || 0));
    const height = Math.max(0, Math.floor(Number(reference.content?.dimensions?.height) || 0));
    const src = runtimeMonsterAssetReferenceUrl(releaseId, referenceId);
    byAssetKey[assetKey] = {
      assetKey,
      releaseId,
      referenceId,
      packageId: typeof reference.packageId === 'string' ? reference.packageId : '',
      assetUploadId: typeof reference.assetUploadId === 'string' ? reference.assetUploadId : '',
      target: { monsterId, branchId, stageId },
      contentType: typeof reference.content?.contentType === 'string' ? reference.content.contentType : '',
      byteSize: Math.max(0, Math.floor(Number(reference.content?.byteSize) || 0)),
      width: width || null,
      height: height || null,
      src,
    };
  }

  const referenceCount = Object.keys(byAssetKey).length;
  if (!referenceCount) return null;
  const hash = typeof manifest.hash === 'string' && manifest.hash
    ? manifest.hash
    : stableHash(byAssetKey);
  return {
    schemaVersion: 1,
    source: 'content-operation-release',
    releaseId,
    hash,
    referenceCount,
    byAssetKey,
  };
}

function attachRuntimeMonsterAssetReferencesToVisualConfig(monsterVisualConfig, runtimeAssetReferences = null) {
  if (!runtimeAssetReferences) return monsterVisualConfig;
  const output = isPlainObject(monsterVisualConfig) ? cloneSerialisable(monsterVisualConfig) : {};
  output.assetReferenceHash = runtimeAssetReferences.hash || '';
  output.runtimeAssetReferences = runtimeAssetReferences;
  if (isPlainObject(output.config)) {
    output.config = {
      ...output.config,
      runtimeAssetReferences,
    };
  } else {
    output.config = { runtimeAssetReferences };
  }
  return output;
}

async function readSpellingRuntimeContentBundle(db, accountId, subjectId = 'spelling', {
  includeAccountContent = true,
  includeGlobalContent = true,
  nowMs = Date.now(),
  env = {},
} = {}) {
  if (includeGlobalContent) {
    const releaseRow = await readResolvedContentOperationReleaseRow(db, accountId, subjectId);
    if (releaseRow) {
      const cachePrefix = releaseRow.release_source === 'override' ? 'override' : 'release';
      const runtimeContent = await readSpellingRuntimeContentReleaseBundle(
        db,
        subjectId,
        releaseRow,
        cachePrefix,
      );
      return resolveLearnerVisibleRuntimeContent(runtimeContent, { nowMs, env });
    }
  }

  if (!includeAccountContent) {
    return readSeededSpellingRuntimeContentBundle(subjectId);
  }

  const accountRow = await first(db, `
    SELECT
      account_id,
      subject_id,
      updated_at,
      length(content_json) AS content_length,
      NULL AS content_json
    FROM account_subject_content
    WHERE account_id = ? AND subject_id = ?
    LIMIT 1
  `, [accountId, subjectId]);
  if (accountRow) {
    const key = spellingRuntimeContentRowKey(accountRow, subjectId);
    const cached = readCachedSpellingRuntimeContent(key);
    if (cached) return cached;

    const contentRow = await first(db, `
      SELECT
        account_id,
        subject_id,
        updated_at,
        length(content_json) AS content_length,
        content_json
      FROM account_subject_content
      WHERE account_id = ? AND subject_id = ?
    `, [accountId, subjectId]);
    return rememberSpellingRuntimeContent(key, await buildSpellingRuntimeContent(contentRow, subjectId));
  }

  if (includeGlobalContent) {
    const releaseRow = await readPublishedContentOperationReleaseRow(db, subjectId);
    if (releaseRow) {
      const runtimeContent = await readSpellingRuntimeContentReleaseBundle(
        db,
        subjectId,
        releaseRow,
        'release',
      );
      return resolveLearnerVisibleRuntimeContent(runtimeContent, { nowMs, env });
    }
  }

  const row = await first(db, `
    SELECT account_id, subject_id, updated_at, content_length, NULL AS content_json
    FROM (
      SELECT
        account_id,
        subject_id,
        updated_at,
        length(content_json) AS content_length,
        0 AS fallback_rank
      FROM account_subject_content
      WHERE account_id = ? AND subject_id = ?
      UNION ALL
      SELECT
        account_id,
        subject_id,
        updated_at,
        length(content_json) AS content_length,
        1 AS fallback_rank
      FROM account_subject_content
      WHERE subject_id = ? AND account_id <> ?
    )
    ORDER BY fallback_rank ASC, updated_at DESC
    LIMIT 1
  `, [accountId, subjectId, subjectId, accountId]);
  const key = spellingRuntimeContentRowKey(row, subjectId);
  const cached = readCachedSpellingRuntimeContent(key);
  if (cached) return cached;

  let contentRow = row;
  if (row && typeof row.content_json !== 'string') {
    const ownerAccountId = row.account_id || accountId;
    contentRow = await first(db, `
      SELECT
        account_id,
        subject_id,
        updated_at,
        length(content_json) AS content_length,
        content_json
      FROM account_subject_content
      WHERE account_id = ? AND subject_id = ?
    `, [ownerAccountId, subjectId]);
  }

  return rememberSpellingRuntimeContent(key, await buildSpellingRuntimeContent(contentRow, subjectId));
}

async function readSpellingContentForReadModels(db, accountId, subjectId = 'spelling', options = {}) {
  const runtimeContent = await readSpellingRuntimeContentBundle(db, accountId, subjectId, options);
  const contentBundle = runtimeContent?.content || null;
  const runtimeSnapshot = runtimeContent?.snapshot || null;
  const summary = runtimeContent?.summary || null;
  return {
    contentBundle,
    runtimeSnapshot,
    summary,
  };
}

// writableRole → membership-repository.js

// normaliseMutationInput, buildMutationMeta, staleWriteError,
// idempotencyReuseError, loadMutationReceipt, storeMutationReceipt
// → mutation-repository.js

function storeMutationReceiptStatement(db, {
  accountId,
  requestId,
  scopeType,
  scopeId,
  mutationKind,
  requestHash,
  response,
  statusCode = 200,
  correlationId = null,
  appliedAt,
}, { guard = null, exists = null } = {}) {
  const params = [
    accountId,
    requestId,
    scopeType,
    scopeId,
    mutationKind,
    requestHash,
    JSON.stringify(response),
    statusCode,
    correlationId,
    appliedAt,
  ];
  return bindStatement(db, `
    INSERT INTO mutation_receipts (
      account_id,
      request_id,
      scope_type,
      scope_id,
      mutation_kind,
      request_hash,
      response_json,
      status_code,
      correlation_id,
      applied_at
    )
    ${exists ? guardedExistsValueSource(params.length, exists.sql) : guardedValueSource(params.length, guard)}
  `, exists ? guardedExistsParams(params, exists) : guardedParams(params, guard));
}

function subjectCommandReceiptResponse(response = {}, {
  learnerId = null,
  subjectId = null,
  command = null,
} = {}) {
  const mutation = response?.mutation && typeof response.mutation === 'object' && !Array.isArray(response.mutation)
    ? response.mutation
    : {};
  return {
    receiptVersion: 1,
    replayRequiresRefresh: true,
    learnerId: response?.learnerId || learnerId || mutation.scopeId || null,
    subjectId: response?.subjectId || subjectId || null,
    command: response?.command || command || null,
    changed: response?.changed !== false,
    mutation,
  };
}

function accountSnapshotRow(session) {
  const snapshot = session?.accountSnapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  if (snapshot.id !== session?.accountId) return null;
  return {
    id: snapshot.id,
    email: snapshot.email || null,
    display_name: snapshot.display_name || null,
    platform_role: snapshot.platform_role || 'parent',
    selected_learner_id: snapshot.selected_learner_id || null,
    created_at: asTs(snapshot.created_at, 0),
    updated_at: asTs(snapshot.updated_at, 0),
    repo_revision: Number(snapshot.repo_revision) || 0,
    account_type: snapshot.account_type || 'real',
    demo_expires_at: Number(snapshot.demo_expires_at) || null,
  };
}

async function ensureAccount(db, session, nowTs) {
  const sessionPlatformRole = typeof session?.platformRole === 'string' && session.platformRole
    ? normalisePlatformRole(session.platformRole)
    : null;
  const trustedSnapshot = accountSnapshotRow(session);
  if (trustedSnapshot) {
    const nextEmail = session?.email || trustedSnapshot.email || null;
    const nextDisplayName = session?.displayName || trustedSnapshot.display_name || null;
    const nextPlatformRole = sessionPlatformRole || trustedSnapshot.platform_role || 'parent';
    if (
      (trustedSnapshot.email || null) === nextEmail
      && (trustedSnapshot.display_name || null) === nextDisplayName
      && (trustedSnapshot.platform_role || 'parent') === nextPlatformRole
    ) {
      return trustedSnapshot;
    }

    const updated = await first(db, `
      UPDATE adult_accounts
      SET email = ?,
          display_name = ?,
          platform_role = ?,
          updated_at = ?
      WHERE id = ?
      RETURNING *
    `, [nextEmail, nextDisplayName, nextPlatformRole, nowTs, session.accountId]);
    if (updated) return updated;
  }

  const existing = await first(db, 'SELECT * FROM adult_accounts WHERE id = ?', [session.accountId]);
  if (!existing) {
    return first(db, `
      INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, ?, ?)
      RETURNING *
    `, [
      session.accountId,
      session.email || null,
      session.displayName || null,
      sessionPlatformRole || 'parent',
      nowTs,
      nowTs,
    ]);
  }

  const nextEmail = session?.email || existing.email || null;
  const nextDisplayName = session?.displayName || existing.display_name || null;
  const nextPlatformRole = sessionPlatformRole || existing.platform_role || 'parent';
  if (
    (existing.email || null) === nextEmail
    && (existing.display_name || null) === nextDisplayName
    && (existing.platform_role || 'parent') === nextPlatformRole
  ) {
    return existing;
  }

  return first(db, `
    UPDATE adult_accounts
    SET email = ?,
        display_name = ?,
        platform_role = ?,
        updated_at = ?
    WHERE id = ?
    RETURNING *
  `, [nextEmail, nextDisplayName, nextPlatformRole, nowTs, session.accountId]);
}

// listMembershipRows, getMembership, requireLearnerWriteAccess,
// requireLearnerReadAccess, membershipRowToModel, accountPlatformRole,
// accountType, requireParentHubAccess, requireAdminHubAccess,
// requireAccountRoleManager, requireMonsterVisualConfigManager,
// requireGrammarTransferAdmin, requireSubjectContentExportAccess,
// requireSubjectContentWriteAccess, normaliseRequestedPlatformRole
// → membership-repository.js

function runtimeSnapshotForBundle(bundle, referenceBundle) {
  const backfilled = backfillSpellingWordExplanations(bundle, referenceBundle);
  return resolveRuntimeSnapshot(backfilled, { referenceBundle });
}

function spellingRuntimeContentSeedKey(subjectId) {
  // This cache is isolate-local, so a deployment already provides the
  // publication boundary. Avoid parsing the compressed seed merely to name
  // an entry that cannot outlive the Worker version which created it.
  return ['seed', subjectId].join(':');
}

function spellingRuntimeContentRowKey(row, subjectId) {
  if (!row) return spellingRuntimeContentSeedKey(subjectId);
  const contentJson = typeof row.content_json === 'string' ? row.content_json : '';
  const contentLength = Number(row.content_length);
  return [
    'row',
    subjectId,
    row.account_id || '',
    row.updated_at || 0,
    Number.isFinite(contentLength) ? contentLength : contentJson.length,
    stableHash(contentJson),
  ].join(':');
}

function spellingRuntimeContentReleaseKey(row, subjectId, prefix = 'release') {
  if (!row) return spellingRuntimeContentSeedKey(subjectId);
  return [
    prefix,
    subjectId,
    row.release_id || '',
    row.snapshot_hash || '',
    row.published_at || 0,
    row.created_at || 0,
  ].join(':');
}

function rememberSpellingRuntimeContent(key, value) {
  if (spellingRuntimeContentCache.has(key)) spellingRuntimeContentCache.delete(key);
  spellingRuntimeContentCache.set(key, value);
  while (spellingRuntimeContentCache.size > SPELLING_RUNTIME_CONTENT_CACHE_LIMIT) {
    const oldestKey = spellingRuntimeContentCache.keys().next().value;
    spellingRuntimeContentCache.delete(oldestKey);
  }
  return value;
}

function readCachedSpellingRuntimeContent(key) {
  const cached = spellingRuntimeContentCache.get(key);
  if (!cached) return null;
  spellingRuntimeContentCache.delete(key);
  spellingRuntimeContentCache.set(key, cached);
  return cached;
}

function runtimeSentenceCount(snapshot) {
  return snapshot?.words?.reduce((total, word) => {
    const baseCount = Array.isArray(word.sentences) ? word.sentences.length : 0;
    const variantCount = (Array.isArray(word.variants) ? word.variants : [])
      .reduce((sum, variant) => sum + (Array.isArray(variant.sentences) ? variant.sentences.length : 0), 0);
    return total + baseCount + variantCount;
  }, 0) || 0;
}

function runtimeContentSummary(content, snapshot) {
  const summary = buildSpellingContentSummary(content);
  return {
    ...summary,
    runtimeWordCount: snapshot?.words?.length || summary.runtimeWordCount || 0,
    runtimeSentenceCount: runtimeSentenceCount(snapshot) || summary.runtimeSentenceCount || 0,
  };
}

function resolveLearnerVisibleRuntimeContent(runtimeContent, {
  nowMs = Date.now(),
  env = {},
} = {}) {
  if (!runtimeContent?.snapshot) return runtimeContent;
  const snapshot = resolveLearnerVisibleSpellingSnapshot(runtimeContent.snapshot, {
    now: nowMs,
    env,
  });
  return {
    ...runtimeContent,
    snapshot,
    summary: runtimeContent.summary
      ? {
          ...runtimeContent.summary,
          runtimeWordCount: snapshot.words.length,
          runtimeSentenceCount: runtimeSentenceCount(snapshot),
        }
      : runtimeContent.summary,
  };
}

async function buildSpellingRuntimeContent(row, subjectId) {
  if (!row) {
    return buildSeededSpellingRuntimeContent(subjectId);
  }

  const seededBundle = await readSeededSpellingContentBundle();
  const content = contentRowToBundle(row, seededBundle);
  const snapshot = runtimeSnapshotForBundle(content, seededBundle);
  return {
    subjectId,
    content,
    snapshot,
    summary: {
      ...runtimeContentSummary(content, snapshot),
      sourceUpdatedAt: Number(row.updated_at) || 0,
    },
  };
}

async function readSpellingAuthoringContentFromRelease(row, subjectId) {
  const seededBundle = await readSeededSpellingContentBundle();
  if (!row?.snapshot_json) return seededBundle;

  try {
    const snapshotJson = await decodeContentOperationSnapshot(row.snapshot_json);
    return normaliseSpellingContentBundle(JSON.parse(snapshotJson));
  } catch (error) {
    logMutation('warn', 'content_operation_release.authoring_fallback', {
      subjectId,
      releaseId: row?.release_id || '',
      error: error?.message || String(error),
    });
    return seededBundle;
  }
}

async function buildSpellingRuntimeContentFromRelease(row, subjectId) {
  if (!row?.runtime_snapshot_json) {
    logMutation('warn', 'content_operation_release.runtime_projection_missing', {
      subjectId,
      releaseId: row?.release_id || '',
    });
    return buildSeededSpellingRuntimeContent(subjectId);
  }

  try {
    const snapshotJson = await decodeContentOperationSnapshot(row.runtime_snapshot_json);
    const projection = JSON.parse(snapshotJson);
    if (!isSpellingRuntimeReleaseProjection(projection, { releaseId: row.release_id })) {
      throw new Error('Published Spelling runtime projection is invalid or belongs to another release.');
    }
    const persistedSummary = safeJsonParse(row.runtime_summary_json, null);
    return {
      subjectId,
      content: null,
      snapshot: projection.snapshot,
      summary: {
        ...projection.summary,
        ...(isPlainObject(persistedSummary) ? persistedSummary : {}),
        publishedReleaseId: row.release_id || projection.summary.publishedReleaseId || '',
        publishedAt: Number(row.published_at) || projection.summary.publishedAt || 0,
      },
    };
  } catch (error) {
    logMutation('warn', 'content_operation_release.runtime_projection_fallback', {
      subjectId,
      releaseId: row?.release_id || '',
      error: error?.message || String(error),
    });
    return buildSeededSpellingRuntimeContent(subjectId);
  }
}

async function buildSeededSpellingRuntimeContent(subjectId) {
  const [snapshot, summary] = await Promise.all([
    readSeededSpellingPublishedSnapshot(),
    readSeededSpellingContentSummary(),
  ]);
  return {
    subjectId,
    content: null,
    snapshot,
    summary,
  };
}

function accountDirectoryRowToModel(row) {
  const providers = new Set(
    String(row?.identity_providers || '')
      .split(',')
      .map((provider) => provider.trim())
      .filter(Boolean),
  );
  if (Number(row?.has_password) > 0) providers.add('email');
  return {
    id: row?.id || '',
    email: row?.email || '',
    displayName: row?.display_name || '',
    platformRole: normalisePlatformRole(row?.platform_role),
    providers: [...providers].sort(),
    learnerCount: Number(row?.learner_count) || 0,
    selectedLearnerId: row?.selected_learner_id || null,
    repoRevision: Number(row?.repo_revision) || 0,
    createdAt: asTs(row?.created_at, 0),
    updatedAt: asTs(row?.updated_at, 0),
  };
}

async function listAccountDirectoryRows(db) {
  return all(db, `
    SELECT
      a.id,
      a.email,
      a.display_name,
      a.platform_role,
      a.selected_learner_id,
      a.repo_revision,
      a.created_at,
      a.updated_at,
      GROUP_CONCAT(DISTINCT ai.provider) AS identity_providers,
      MAX(CASE WHEN ac.account_id IS NULL THEN 0 ELSE 1 END) AS has_password,
      COUNT(DISTINCT m.learner_id) AS learner_count
    FROM adult_accounts a
    LEFT JOIN account_identities ai ON ai.account_id = a.id
    LEFT JOIN account_credentials ac ON ac.account_id = a.id
    LEFT JOIN account_learner_memberships m ON m.account_id = a.id
    WHERE COALESCE(a.account_type, 'real') <> 'demo'
    GROUP BY
      a.id,
      a.email,
      a.display_name,
      a.platform_role,
      a.selected_learner_id,
      a.repo_revision,
      a.created_at,
      a.updated_at
    ORDER BY a.updated_at DESC, a.email ASC, a.id ASC
  `);
}

async function accountDirectoryPayload(db, actorAccountId) {
  const rows = await listAccountDirectoryRows(db);
  return {
    currentAccount: rows.map(accountDirectoryRowToModel).find((account) => account.id === actorAccountId) || null,
    accounts: rows.map(accountDirectoryRowToModel),
  };
}

async function listAccountDirectory(db, actorAccountId) {
  const actor = await first(db, 'SELECT id, email, display_name, platform_role, repo_revision, account_type FROM adult_accounts WHERE id = ?', [actorAccountId]);
  requireAccountRoleManager(actor);
  return accountDirectoryPayload(db, actorAccountId);
}

async function listLearnerHubSubjectStateRows(db, learnerId) {
  try {
    const rows = await all(db, `
      SELECT learner_id, subject_id, ui_json, data_json, updated_at, NULL AS spelling_stats_json
      FROM child_subject_state
      WHERE learner_id = ?
        AND subject_id IN ('grammar', 'punctuation')
      UNION ALL
      SELECT learner_id, subject_id, ui_json, data_json, updated_at, NULL AS spelling_stats_json
      FROM child_subject_state
      WHERE learner_id = ?
        AND subject_id = 'spelling'
        AND NOT EXISTS (
          SELECT 1
          FROM bounded_gameplay_state_migrations
          WHERE migration_id = '0023' AND state = 'ready'
        )
      UNION ALL
      SELECT learner_id, 'spelling' AS subject_id, ui_json, data_json, updated_at,
             stats_json AS spelling_stats_json
      FROM spelling_learner_state
      WHERE learner_id = ?
        AND EXISTS (
          SELECT 1
          FROM bounded_gameplay_state_migrations
          WHERE migration_id = '0023' AND state = 'ready'
        )
    `, [learnerId, learnerId, learnerId]);
    const spellingRowPresent = rows.some((row) => row?.subject_id === 'spelling');
    if (rows.some((row) => row?.spelling_stats_json != null)) {
      markBoundedGameplayTableAvailable(db, 'spelling');
    }
    await requireBoundedSpellingLearnerState(db, learnerId, spellingRowPresent);
    return rows;
  } catch (error) {
    if (
      !isMissingTableError(error, 'spelling_learner_state')
      && !isMissingTableError(error, 'bounded_gameplay_state_migrations')
    ) throw error;
    if (isMissingTableError(error, 'spelling_learner_state')) {
      await requireLegacyGameplayFallbackAllowed(
        db,
        'spelling',
        'spelling_learner_state',
        error,
      );
    }
    return all(db, `
      SELECT learner_id, subject_id, ui_json, data_json, updated_at, NULL AS spelling_stats_json
      FROM child_subject_state
      WHERE learner_id = ?
        AND subject_id IN ('spelling', 'grammar', 'punctuation')
    `, [learnerId]);
  }
}

async function loadLearnerReadBundle(db, learnerId, { now = Date.now() } = {}) {
  const subjectRows = await listLearnerHubSubjectStateRows(db, learnerId);
  const sessionRows = await all(db, `
    WITH ranked AS (
      SELECT
        id,
        learner_id,
        subject_id,
        session_kind,
        status,
        session_state_json,
        summary_json,
        created_at,
        updated_at,
        ROW_NUMBER() OVER (
          PARTITION BY subject_id
          ORDER BY updated_at DESC, id DESC
        ) AS subject_rank
      FROM practice_sessions
      WHERE learner_id = ?
        AND subject_id IN ('spelling', 'grammar', 'punctuation')
    )
    SELECT id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at
    FROM ranked
    WHERE subject_rank <= 6
    ORDER BY updated_at DESC, id DESC
  `, [learnerId]);
  const gameRows = await all(db, `
    SELECT learner_id, system_id, state_json, updated_at
    FROM child_game_state
    WHERE learner_id = ?
  `, [learnerId]);
  const eventRows = await all(db, `
    SELECT id, learner_id, subject_id, system_id, event_type, event_json, created_at
    FROM (
      SELECT id, learner_id, subject_id, system_id, event_type, event_json, created_at
      FROM event_log
      WHERE learner_id = ?
        AND (
          (subject_id = 'spelling' AND event_type = 'spelling.retry-cleared')
          OR (subject_id = 'grammar' AND event_type = 'grammar.misconception-seen')
        )
      ORDER BY created_at DESC, id DESC
      LIMIT 50
    )
    ORDER BY created_at ASC, id ASC
  `, [learnerId]);

  const subjectStates = {};
  subjectRows.forEach((row) => {
    const record = subjectStateRowToRecord(row);
    if (row.subject_id === 'spelling' && row.spelling_stats_json != null) {
      record.ui = {
        ...record.ui,
        stats: publicSpellingStats(materialiseSpellingGameplayStats(row.spelling_stats_json, now)),
      };
    }
    subjectStates[row.subject_id] = record;
  });

  const gameState = {};
  gameRows.forEach((row) => {
    gameState[gameStateKey(row.learner_id, row.system_id)] = gameStateRowToRecord(row);
  });

  return {
    subjectStates,
    practiceSessions: filterSessions(sessionRows.map(practiceSessionRowToRecord), learnerId),
    gameState,
    eventLog: normaliseEventLog(eventRows.map(eventRowToRecord).filter(Boolean)),
  };
}

function normaliseHistoryLimit(value, { fallback = 10, max = 50 } = {}) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestError('History limit must be a positive integer.', {
      code: 'history_limit_invalid',
      limit: value,
    });
  }
  return Math.min(parsed, max);
}

function encodeHistoryCursor(row, timestampField) {
  const timestamp = Number(row?.[timestampField]) || 0;
  const id = encodeURIComponent(String(row?.id || ''));
  return `${timestamp}:${id}`;
}

function decodeHistoryCursor(rawCursor) {
  if (!rawCursor) return null;
  const separator = String(rawCursor).indexOf(':');
  if (separator <= 0) {
    throw new BadRequestError('History cursor is invalid.', {
      code: 'history_cursor_invalid',
    });
  }
  const timestamp = Number(String(rawCursor).slice(0, separator));
  const id = decodeURIComponent(String(rawCursor).slice(separator + 1));
  if (!Number.isFinite(timestamp) || timestamp < 0 || !id) {
    throw new BadRequestError('History cursor is invalid.', {
      code: 'history_cursor_invalid',
    });
  }
  return { timestamp, id };
}

function pageFromRows(rows, limit, timestampField) {
  const pageRows = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  return {
    rows: pageRows,
    page: {
      limit,
      nextCursor: hasMore && pageRows.length
        ? encodeHistoryCursor(pageRows[pageRows.length - 1], timestampField)
        : null,
      hasMore,
    },
  };
}

function publicHistoryPracticeSessionRowToRecord(row) {
  return normalisePracticeSessionRecord({
    ...publicPracticeSessionRowToRecord(row),
    sessionState: null,
  });
}

function recentSessionLabel(record) {
  if (record?.summary?.label) return record.summary.label;
  if (record?.subjectId === 'grammar') return `Grammar ${record.sessionKind || 'practice'}`;
  if (record?.subjectId === 'punctuation') return `Punctuation ${record.sessionKind || 'practice'}`;
  // Post-Mega spelling modes must not leak as 'SATs 20 test' on the parent
  // hub — Boss and Guardian are distinct from the legacy SATs test path and
  // the recent-session summary copy has to match the scene the child actually
  // ran.
  if (record?.sessionKind === 'boss') return 'Boss Dictation';
  if (record?.sessionKind === 'guardian') return 'Guardian Mission';
  if (record?.sessionKind === 'test') return 'SATs 20 test';
  return 'Smart Review';
}

function recentSessionHeadline(record) {
  const summary = record?.summary || {};
  const cards = Array.isArray(summary.cards) ? summary.cards : [];
  const correctCard = cards.find((card) => String(card?.label || '').toLowerCase().includes('correct'));
  if (correctCard?.value != null) return String(correctCard.value);
  const answered = Number(summary.answered);
  const scoredAnswered = Number(summary.scoredAnswered);
  const nonScoredAnswered = Number(summary.nonScoredAnswered);
  const correct = Number(summary.correct);
  const scoringDenominator = Number.isFinite(scoredAnswered)
    ? scoredAnswered
    : (Number.isFinite(answered) ? Math.max(0, answered - (Number.isFinite(nonScoredAnswered) ? nonScoredAnswered : 0)) : NaN);
  if (Number.isFinite(scoringDenominator) && scoringDenominator > 0 && Number.isFinite(correct)) {
    return `${correct}/${scoringDenominator}`;
  }
  if (Number.isFinite(nonScoredAnswered) && nonScoredAnswered > 0) {
    return 'Saved for review';
  }
  if (Number.isFinite(answered) && answered > 0 && Number.isFinite(correct)) {
    return `${correct}/${answered}`;
  }
  return '';
}

function recentSessionMistakeCount(record) {
  const summary = record?.summary || {};
  if (Array.isArray(summary.mistakes)) return summary.mistakes.length;
  const correct = Number(summary.correct);
  const scoredAnswered = Number(summary.scoredAnswered);
  if (Number.isFinite(scoredAnswered)) {
    return Math.max(0, scoredAnswered - (Number.isFinite(correct) ? correct : 0));
  }
  const answered = Number(summary.answered);
  const nonScoredAnswered = Number(summary.nonScoredAnswered);
  if (Number.isFinite(answered) && Number.isFinite(nonScoredAnswered)) {
    return Math.max(0, answered - nonScoredAnswered - (Number.isFinite(correct) ? correct : 0));
  }
  return Math.max(0, (Number.isFinite(answered) ? answered : 0) - (Number.isFinite(correct) ? correct : 0));
}

function parentRecentSessionFromRecord(record) {
  return {
    id: record.id,
    subjectId: record.subjectId,
    status: record.status,
    sessionKind: record.sessionKind,
    label: recentSessionLabel(record),
    updatedAt: Number(record.updatedAt) || Number(record.createdAt) || 0,
    mistakeCount: recentSessionMistakeCount(record),
    headline: recentSessionHeadline(record),
  };
}

async function resolveParentHistoryAccess(db, accountId, requestedLearnerId = null) {
  const account = await first(db, 'SELECT id, selected_learner_id, repo_revision, platform_role, account_type FROM adult_accounts WHERE id = ?', [accountId]);
  const readableMemberships = await listMembershipRows(db, accountId, { writableOnly: false });
  const defaultLearnerId = account?.selected_learner_id && readableMemberships.some((membership) => membership.id === account.selected_learner_id)
    ? account.selected_learner_id
    : (readableMemberships[0]?.id || null);
  const learnerId = requestedLearnerId || defaultLearnerId;
  if (!learnerId) {
    throw new NotFoundError('No learner is selected for this parent view.', {
      code: 'parent_hub_missing_learner',
    });
  }
  const membership = await requireLearnerReadAccess(db, accountId, learnerId);
  requireParentHubAccess(account, membership);
  return {
    account,
    readableMemberships,
    learnerId,
    membership,
  };
}

async function readParentRecentSessions(db, accountId, {
  learnerId = null,
  limit = null,
  cursor = null,
} = {}) {
  const access = await resolveParentHistoryAccess(db, accountId, learnerId);
  const resolvedLimit = normaliseHistoryLimit(limit);
  const decodedCursor = decodeHistoryCursor(cursor);
  const cursorClause = decodedCursor
    ? 'AND (updated_at < ? OR (updated_at = ? AND id < ?))'
    : '';
  const cursorParams = decodedCursor
    ? [decodedCursor.timestamp, decodedCursor.timestamp, decodedCursor.id]
    : [];
  const rows = await all(db, `
    SELECT id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at
    FROM practice_sessions
    WHERE learner_id = ?
      ${cursorClause}
    ORDER BY updated_at DESC, id DESC
    LIMIT ?
  `, [access.learnerId, ...cursorParams, resolvedLimit + 1]);
  const page = pageFromRows(rows, resolvedLimit, 'updated_at');
  const sessions = page.rows.map(publicHistoryPracticeSessionRowToRecord);
  return {
    learnerId: access.learnerId,
    sessions,
    recentSessions: sessions.map(parentRecentSessionFromRecord),
    page: page.page,
  };
}

async function upsertLearnerReadModel(db, learnerId, modelKey, model, {
  sourceRevision = 0,
  generatedAt = Date.now(),
} = {}) {
  const key = normaliseReadModelKey(modelKey);
  const timestamp = Math.max(0, Number(generatedAt) || Date.now());
  await run(db, `
    INSERT INTO learner_read_models (learner_id, model_key, model_json, source_revision, generated_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(learner_id, model_key) DO UPDATE SET
      model_json = excluded.model_json,
      source_revision = excluded.source_revision,
      generated_at = excluded.generated_at,
      updated_at = excluded.updated_at
  `, [
    learnerId,
    key,
    JSON.stringify(cloneSerialisable(model) || {}),
    Math.max(0, Number(sourceRevision) || 0),
    timestamp,
    timestamp,
  ]);
  return readLearnerReadModel(db, learnerId, key);
}

function bindLearnerReadModelUpsertStatement(db, learnerId, modelKey, model, {
  sourceRevision = 0,
  generatedAt = Date.now(),
  updatedAt = generatedAt,
  guard = null,
} = {}) {
  const key = normaliseReadModelKey(modelKey);
  const timestamp = Math.max(0, Number(updatedAt) || Date.now());
  const params = [
    learnerId,
    key,
    JSON.stringify(cloneSerialisable(model) || {}),
    Math.max(0, Number(sourceRevision) || 0),
    Math.max(0, Number(generatedAt) || timestamp),
    timestamp,
  ];
  try {
    return bindStatement(db, `
      INSERT INTO learner_read_models (learner_id, model_key, model_json, source_revision, generated_at, updated_at)
      ${guardedValueSource(params.length, guard)}
      ON CONFLICT(learner_id, model_key) DO UPDATE SET
        model_json = excluded.model_json,
        source_revision = excluded.source_revision,
        generated_at = excluded.generated_at,
        updated_at = excluded.updated_at
    `, guardedParams(params, guard));
  } catch (error) {
    if (isMissingTableError(error, 'learner_read_models')) return null;
    throw error;
  }
}

async function readLearnerReadModel(db, learnerId, modelKey) {
  const key = normaliseReadModelKey(modelKey);
  let row = null;
  try {
    row = await first(db, `
      SELECT learner_id, model_key, model_json, source_revision, generated_at, updated_at
      FROM learner_read_models
      WHERE learner_id = ? AND model_key = ?
    `, [learnerId, key]);
    markLearnerReadModelsTableAvailable(db);
  } catch (error) {
    if (isMissingTableError(error, 'learner_read_models')) return emptyLearnerReadModel(key);
    throw error;
  }
  return row ? normaliseLearnerReadModelRow(row, key) : emptyLearnerReadModel(key);
}

const learnerReadModelsTableCache = new WeakMap();

function underlyingDbHandle(db) {
  // The capacity-collector wrapper forwards most calls via prototype
  // but keeps a reference to the unwrapped handle on `__rawDb` (set in
  // d1.js). Fall back to `db` itself for raw handles.
  return db && db.__rawDb ? db.__rawDb : db;
}

function markLearnerReadModelsTableAvailable(db) {
  const cacheKey = underlyingDbHandle(db);
  if (cacheKey) learnerReadModelsTableCache.set(cacheKey, true);
}

// Production D1 schema is migration-managed. Do not probe sqlite_master from
// subject-command hot paths: D1 reports that metadata scan as every table and
// index row in the database, which created a first-request rows-read outlier
// for each fresh Worker isolate.
async function capacityReadModelTablesAvailable() {
  return true;
}

async function upsertLearnerActivityFeedRows(db, activityRows = []) {
  let written = 0;
  for (const row of activityRows) {
    if (!row?.id || !row?.learnerId || !row?.activityType || !row?.activity) continue;
    const result = await run(db, `
      INSERT INTO learner_activity_feed (
        id, learner_id, subject_id, activity_type, activity_json,
        source_event_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        learner_id = excluded.learner_id,
        subject_id = excluded.subject_id,
        activity_type = excluded.activity_type,
        activity_json = excluded.activity_json,
        source_event_id = excluded.source_event_id,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `, [
      row.id,
      row.learnerId,
      row.subjectId || null,
      row.activityType,
      JSON.stringify(cloneSerialisable(row.activity) || {}),
      row.sourceEventId || null,
      Math.max(0, Number(row.createdAt) || 0),
      Math.max(0, Number(row.updatedAt) || Date.now()),
    ]);
    written += Math.max(0, Number(result?.meta?.rows_written ?? result?.meta?.changes) || 0);
  }
  return { count: written };
}

function activityFeedRowFromEventRecord(event, {
  id,
  learnerId,
  subjectId = null,
  systemId = null,
  eventType,
  createdAt,
  now = Date.now(),
} = {}) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
  return activityFeedRowFromEventRow({
    id,
    learner_id: learnerId,
    subject_id: subjectId,
    system_id: systemId,
    event_type: eventType,
    event_json: JSON.stringify(event),
    created_at: createdAt,
  }, { now });
}

function bindLearnerActivityFeedUpsertStatement(db, row, { guard = null } = {}) {
  if (!row?.id || !row?.learnerId || !row?.activityType || !row?.activity) return null;
  const params = [
    row.id,
    row.learnerId,
    row.subjectId || null,
    row.activityType,
    JSON.stringify(cloneSerialisable(row.activity) || {}),
    row.sourceEventId || null,
    Math.max(0, Number(row.createdAt) || 0),
    Math.max(0, Number(row.updatedAt) || Date.now()),
  ];
  try {
    return bindStatement(db, `
      INSERT INTO learner_activity_feed (
        id, learner_id, subject_id, activity_type, activity_json,
        source_event_id, created_at, updated_at
      )
      ${guardedValueSource(params.length, guard)}
      ON CONFLICT(id) DO UPDATE SET
        learner_id = excluded.learner_id,
        subject_id = excluded.subject_id,
        activity_type = excluded.activity_type,
        activity_json = excluded.activity_json,
        source_event_id = excluded.source_event_id,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `, guardedParams(params, guard));
  } catch (error) {
    if (isMissingTableError(error, 'learner_activity_feed')) return null;
    throw error;
  }
}

function commandProjectionReadModelFromRuntime(runtime, events, nowTs, {
  existingTokens = [],
  previousProjection = null,
} = {}) {
  const gameState = runtime?.gameState && typeof runtime.gameState === 'object' && !Array.isArray(runtime.gameState)
    ? runtime.gameState
    : {};
  // U6 regression fix: `runtime.gameState` (sourced from
  // `runtimeWrite.gameState`) only contains the *changed* slice —
  // `projectSpellingRewards` returns `{}` when the command did not
  // touch `monster-codex`. A naive `cloneSerialisable(gameState[...])`
  // would therefore clobber a previously persisted `rewards.state`
  // with `{}`, losing `{inklet: {mastered: [...]}}` on every
  // non-mastering follow-up command. When the runtime did not carry
  // codex state, inherit the previous projection's `rewards.state`
  // so the sub-shape (`{inklet, glimmerbug, phaeton, vellhorn}`)
  // survives round-trips.
  const hasCodexUpdate = Object.prototype.hasOwnProperty.call(gameState, PUBLIC_MONSTER_CODEX_SYSTEM_ID);
  const previousRewardState = previousProjection
    && typeof previousProjection === 'object'
    && !Array.isArray(previousProjection)
    && previousProjection.rewards
    && typeof previousProjection.rewards === 'object'
    && !Array.isArray(previousProjection.rewards)
    && previousProjection.rewards.state
    && typeof previousProjection.rewards.state === 'object'
    && !Array.isArray(previousProjection.rewards.state)
    ? cloneSerialisable(previousProjection.rewards.state)
    : null;
  const rewardState = hasCodexUpdate
    ? (cloneSerialisable(gameState[PUBLIC_MONSTER_CODEX_SYSTEM_ID]) || {})
    : (previousRewardState || {});
  const eventList = Array.isArray(events) ? events : [];
  // U6: append each newly-persisted event's token to the ring so the next
  // command can dedupe from the read model without re-scanning event_log.
  const incomingTokens = eventList
    .map((event) => eventTokenForDedupe(event))
    .filter((token) => typeof token === 'string' && token);
  const recentEventTokens = appendRecentEventTokens(existingTokens, incomingTokens, {
    tokenRingLimit: RECENT_EVENT_TOKEN_RING_LIMIT,
  });
  // U6: preserve any non-v1 fields from an existing projection so a rollback
  // reader cannot silently delete a newer writer's payload.
  const extraFields = {};
  if (previousProjection && typeof previousProjection === 'object' && !Array.isArray(previousProjection)) {
    for (const [key, value] of Object.entries(previousProjection)) {
      if (['version', 'generatedAt', 'rewards', 'eventCounts', 'recentEventTokens'].includes(key)) continue;
      extraFields[key] = value;
    }
  }
  return {
    ...extraFields,
    version: COMMAND_PROJECTION_SCHEMA_VERSION,
    generatedAt: Math.max(0, Number(nowTs) || Date.now()),
    rewards: {
      systemId: PUBLIC_MONSTER_CODEX_SYSTEM_ID,
      state: rewardState,
    },
    eventCounts: {
      written: eventList.length,
      domain: eventList.filter((event) => typeof event?.type === 'string' && !event.type.startsWith('reward.')).length,
      reactions: eventList.filter((event) => typeof event?.type === 'string' && event.type.startsWith('reward.')).length,
    },
    recentEventTokens,
  };
}

async function readLearnerActivityFeed(db, learnerId, {
  limit = null,
  cursor = null,
} = {}) {
  const resolvedLimit = normaliseHistoryLimit(limit);
  const decodedCursor = decodeHistoryCursor(cursor);
  const cursorClause = decodedCursor
    ? 'AND (created_at < ? OR (created_at = ? AND id < ?))'
    : '';
  const cursorParams = decodedCursor
    ? [decodedCursor.timestamp, decodedCursor.timestamp, decodedCursor.id]
    : [];
  const rows = await all(db, `
    SELECT id, learner_id, subject_id, activity_type, activity_json, source_event_id, created_at, updated_at
    FROM learner_activity_feed
    WHERE learner_id = ?
      ${cursorClause}
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `, [learnerId, ...cursorParams, resolvedLimit + 1]);
  const page = pageFromRows(rows, resolvedLimit, 'created_at');
  const feedRowCount = rows.length
    ? rows.length
    : Number(await scalar(db, 'SELECT COUNT(*) AS count FROM learner_activity_feed WHERE learner_id = ?', [learnerId], 'count') || 0);
  return {
    learnerId,
    activities: page.rows.map(normaliseActivityFeedRow).filter(Boolean),
    page: page.page,
    hasFeedRows: feedRowCount > 0,
  };
}

async function readParentActivity(db, accountId, {
  learnerId = null,
  limit = null,
  cursor = null,
} = {}) {
  const access = await resolveParentHistoryAccess(db, accountId, learnerId);
  const resolvedLimit = normaliseHistoryLimit(limit);
  const feed = await readLearnerActivityFeed(db, access.learnerId, {
    limit: resolvedLimit,
    cursor,
  });
  if (feed.hasFeedRows) {
    return {
      learnerId: access.learnerId,
      activity: feed.activities.map((entry) => entry.activity),
      page: feed.page,
      source: 'learner_activity_feed',
    };
  }

  const decodedCursor = decodeHistoryCursor(cursor);
  const eventTypes = [...PUBLIC_EVENT_TYPES];
  const eventTypePlaceholders = sqlPlaceholders(eventTypes.length);
  const cursorClause = decodedCursor
    ? 'AND (created_at < ? OR (created_at = ? AND id < ?))'
    : '';
  const cursorParams = decodedCursor
    ? [decodedCursor.timestamp, decodedCursor.timestamp, decodedCursor.id]
    : [];
  const rows = await all(db, `
    SELECT id, learner_id, subject_id, system_id, event_type, event_json, created_at
    FROM event_log
    WHERE learner_id = ?
      AND event_type IN (${eventTypePlaceholders})
      ${cursorClause}
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `, [access.learnerId, ...eventTypes, ...cursorParams, resolvedLimit + 1]);
  const page = pageFromRows(rows, resolvedLimit, 'created_at');
  return {
    learnerId: access.learnerId,
    activity: page.rows.map(publicEventRowToRecord).filter(Boolean),
    page: page.page,
    source: 'event_log',
  };
}

// U7: parent summary — compact lazy-loaded digest for `/api/hubs/parent/summary`.
// The plan says NO demo access at the route level (auth is enforced in
// the worker handler, not here). Here we validate learnerId is in the
// caller's writable set before any query runs (plan line 744), matching
// the existing `requireLearnerWriteAccess` pattern.
async function readParentHubSummary(db, accountId, learnerId) {
  if (!learnerId) {
    throw new BadRequestError('learnerId query parameter is required.', {
      code: 'parent_summary_missing_learner',
    });
  }
  await requireLearnerWriteAccess(db, accountId, learnerId);
  // Keep the summary additive + compact. U7 just stamps the shape; U8+
  // can layer on richer read-model fields without bumping the bootstrap
  // version (this endpoint has its own independent envelope).
  const learnerRow = await first(db, `
    SELECT id, name, year_group, avatar_color, state_revision
    FROM learner_profiles
    WHERE id = ?
  `, [learnerId]);
  const sessionCountRow = await first(db, `
    SELECT COUNT(*) AS count
    FROM practice_sessions
    WHERE learner_id = ?
  `, [learnerId]);
  const recentEventRow = await first(db, `
    SELECT event_type, created_at
    FROM event_log
    WHERE learner_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `, [learnerId]);
  return {
    summary: {
      learnerId,
      learner: learnerRow ? {
        id: learnerRow.id,
        name: learnerRow.name,
        yearGroup: learnerRow.year_group,
        avatarColor: learnerRow.avatar_color,
        revision: Number(learnerRow.state_revision) || 0,
      } : null,
      activity: {
        sessionCount: Number(sessionCountRow?.count) || 0,
        lastEventType: recentEventRow?.event_type || null,
        lastEventAt: recentEventRow?.created_at || null,
      },
    },
  };
}

// U7: classroom summary — paginated list of learners scoped to the
// caller's account. Hard cap 50 per page (plan R11 + scenario 17b).
// Caller MUST have classroom-or-admin role; enforcement is in the
// worker handler.
async function readClassroomLearnersSummary(db, accountId, { cursor = null } = {}) {
  const decoded = decodeClassroomLearnerCursor(cursor);
  const params = [accountId];
  const cursorClause = decoded
    ? 'AND (m.sort_index > ? OR (m.sort_index = ? AND l.id > ?))'
    : '';
  if (decoded) {
    params.push(decoded.sortIndex, decoded.sortIndex, decoded.learnerId);
  }
  // Over-fetch by 1 to tell whether a next page exists.
  params.push(CLASSROOM_LEARNERS_SUMMARY_PAGE_LIMIT + 1);
  const rows = await all(db, `
    SELECT l.id, l.name, l.year_group, l.avatar_color, l.state_revision,
           m.sort_index AS sort_index
    FROM account_learner_memberships m
    JOIN learner_profiles l ON l.id = m.learner_id
    WHERE m.account_id = ?
      ${cursorClause}
    ORDER BY m.sort_index ASC, l.id ASC
    LIMIT ?
  `, params);
  const hasNext = rows.length > CLASSROOM_LEARNERS_SUMMARY_PAGE_LIMIT;
  const pageRows = hasNext ? rows.slice(0, CLASSROOM_LEARNERS_SUMMARY_PAGE_LIMIT) : rows;
  const nextCursor = hasNext
    ? encodeClassroomLearnerCursor({
      sortIndex: pageRows[pageRows.length - 1].sort_index,
      learnerId: pageRows[pageRows.length - 1].id,
    })
    : null;
  return {
    learners: pageRows.map((row) => ({
      id: row.id,
      name: row.name,
      yearGroup: row.year_group,
      avatarColor: row.avatar_color,
      revision: Number(row.state_revision) || 0,
    })),
    nextCursor,
  };
}

function encodeClassroomLearnerCursor({ sortIndex, learnerId }) {
  return `${Number(sortIndex) || 0}:${encodeURIComponent(String(learnerId))}`;
}

function decodeClassroomLearnerCursor(cursor) {
  if (!cursor || typeof cursor !== 'string') return null;
  const idx = cursor.indexOf(':');
  if (idx <= 0) return null;
  const sortIndex = Number(cursor.slice(0, idx));
  if (!Number.isFinite(sortIndex)) return null;
  const learnerId = decodeURIComponent(cursor.slice(idx + 1));
  if (!learnerId) return null;
  return { sortIndex, learnerId };
}

async function listMutationReceiptRows(db, accountId, { requestId = null, scopeId = null, limit = 20 } = {}) {
  const clauses = ['account_id = ?'];
  const params = [accountId];
  if (typeof requestId === 'string' && requestId) {
    clauses.push('request_id = ?');
    params.push(requestId);
  }
  if (typeof scopeId === 'string' && scopeId) {
    clauses.push('scope_id = ?');
    params.push(scopeId);
  }
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  params.push(safeLimit);
  return all(db, `
    SELECT account_id, request_id, scope_type, scope_id, mutation_kind, status_code, correlation_id, applied_at
    FROM mutation_receipts
    WHERE ${clauses.join(' AND ')}
    ORDER BY applied_at DESC, request_id DESC
    LIMIT ?
  `, params);
}

async function readDemoOperationSummary(db, nowTs) {
  const rows = await all(db, `
    SELECT metric_key, metric_count, updated_at
    FROM demo_operation_metrics
  `);
  const activeRow = await first(db, `
    SELECT COUNT(*) AS count
    FROM adult_accounts
    WHERE account_type = 'demo'
      AND demo_expires_at > ?
  `, [nowTs]);
  const metrics = new Map(rows.map((row) => [row.metric_key, row]));
  const count = (key) => Math.max(0, Number(metrics.get(key)?.metric_count) || 0);
  const updatedAt = rows.reduce((latest, row) => Math.max(latest, Number(row.updated_at) || 0), 0);
  return {
    sessionsCreated: count('sessions_created'),
    activeSessions: Math.max(0, Number(activeRow?.count) || 0),
    conversions: count('conversions'),
    cleanupCount: count('cleanup_count'),
    rateLimitBlocks: count('rate_limit_blocks'),
    ttsFallbacks: count('tts_fallbacks'),
    updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Admin ops console read helpers (plan: admin-ops-console-extensions, U2).
// Every helper calls requireAdminHubAccess(account) before any DB query. Reads
// of admin_kpi_metrics / account_ops_metadata / ops_error_events are wrapped
// in isMissingTableError soft-fail per R19 so the admin hub loads cleanly on a
// pre-migration-0010 deploy.
// ---------------------------------------------------------------------------

const OPS_ERROR_STATUSES = Object.freeze(['open', 'investigating', 'resolved', 'ignored']);
const OPS_ACTIVITY_STREAM_DEFAULT_LIMIT = 50;
const OPS_ACTIVITY_STREAM_MAX_LIMIT = 50;
const OPS_ERROR_EVENTS_DEFAULT_LIMIT = 50;
const OPS_ERROR_EVENTS_MAX_LIMIT = 50;
const OPS_ACCOUNT_DIRECTORY_LIMIT = 200;
const ACCOUNT_ID_MASK_LAST_N = 6;
const DENIAL_ACCOUNT_ID_MASK_LAST_N = 8;
const LEARNER_SCOPE_ID_MASK_LAST_N = 8;
const DENIAL_DEFAULT_LIMIT = 50;
const DENIAL_MAX_LIMIT = 200;
const KPI_WINDOW_7D_MS = 7 * 24 * 60 * 60 * 1000;
const KPI_WINDOW_30D_MS = 30 * 24 * 60 * 60 * 1000;
const KPI_ERROR_STATUS_METRIC_PREFIX = 'ops_error_events.status.';
const KPI_ACCOUNT_OPS_UPDATES_METRIC_KEY = 'account_ops_metadata.updates';

function maskAccountIdLastN(accountId, lastN = ACCOUNT_ID_MASK_LAST_N) {
  const value = typeof accountId === 'string' ? accountId : '';
  if (!value) return '';
  return value.length <= lastN ? value : value.slice(-lastN);
}

function maskMutationReceiptScopeId(scopeType, scopeId) {
  const value = typeof scopeId === 'string' ? scopeId : '';
  if (!value) return '';
  // R26: learner-scoped receipts leak learner UUIDs to ops-role viewers when
  // combined with the masked account id; truncate to last 8 chars.
  if (scopeType === 'learner') {
    return value.length <= LEARNER_SCOPE_ID_MASK_LAST_N
      ? value
      : value.slice(-LEARNER_SCOPE_ID_MASK_LAST_N);
  }
  // R26: account-scoped receipts already mask to last 6 chars (same rule as
  // the directory display). Platform-scoped identifiers (e.g. ops-error-event:<id>)
  // are stable plan-local identifiers, not PII, so pass through unchanged.
  if (scopeType === 'account') {
    return maskAccountIdLastN(value, ACCOUNT_ID_MASK_LAST_N);
  }
  return value;
}

async function assertAdminHubActor(db, actorAccountId) {
  const actor = await first(
    db,
    // P3 U1: include selected_learner_id so the actor row can double as the
    // account row inside readAdminHub — avoids a second adult_accounts query.
    'SELECT id, email, display_name, platform_role, repo_revision, account_type, selected_learner_id FROM adult_accounts WHERE id = ?',
    [actorAccountId],
  );
  requireAdminHubAccess(actor);
  return actor;
}

function emptyDashboardKpis(generatedAt) {
  return {
    generatedAt,
    accounts: { total: 0, real: 0, demo: 0 },
    learners: { total: 0, real: 0, demo: 0 },
    demos: { active: 0 },
    practiceSessions: {
      last7d: 0,
      last30d: 0,
      real: { last7d: 0, last30d: 0 },
      demo: { last7d: 0, last30d: 0 },
    },
    eventLog: { last7d: 0 },
    mutationReceipts: {
      last7d: 0,
      real: { last7d: 0 },
      demo: { last7d: 0 },
    },
    errorEvents: {
      byStatus: {
        open: 0,
        investigating: 0,
        resolved: 0,
        ignored: 0,
      },
      byOrigin: { client: 0, server: 0 },
    },
    accountOpsUpdates: { total: 0 },
    cronReconcile: {
      lastSuccessAt: 0,
      lastFailureAt: 0,
      successCount: 0,
    },
  };
}

async function scalarCountSafe(db, sql, params, tableName) {
  try {
    const value = await scalar(db, sql, params);
    return Math.max(0, Number(value) || 0);
  } catch (error) {
    if (tableName && isMissingTableError(error, tableName)) return 0;
    throw error;
  }
}

async function readDashboardKpis(db, { now, actorAccountId, actor = null } = {}) {
  // P3 U1: when a pre-resolved actor row is supplied (from readAdminHub's
  // single assertAdminHubActor call), skip the redundant DB lookup + role
  // check. When absent (narrow-read route path), resolve independently.
  if (!actor) {
    await assertAdminHubActor(db, actorAccountId);
  }
  const nowTs = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const cutoff7d = nowTs - KPI_WINDOW_7D_MS;
  const cutoff30d = nowTs - KPI_WINDOW_30D_MS;

  // P1.5 Phase A (U3): every counter that can be split by account type is
  // now computed twice — once for real accounts (default, also preserves the
  // legacy `*.total` contract), once for demo accounts. The filter rule is
  // shared across all per-account counters: `COALESCE(account_type, 'real')
  // <> 'demo'` is the real bucket (malformed / missing `account_type` values
  // fall into real, matching the existing behaviour at line 1744), and
  // `account_type = 'demo'` is the demo bucket. Learner / practice /
  // mutation counters JOIN to adult_accounts to honour the split.
  //
  // `accounts.total` keeps its historical meaning (real only) so any legacy
  // client that reads `.total` without `.real` still works.
  //
  // Error origin split rule (documented in the UI as "client-origin" vs
  // "server-origin"): rows with a `route_name` starting with `/api/` are
  // emitted from the Worker HTTP routing path (server-origin), including
  // the admin hub's own endpoints; every other row is a SPA URL path like
  // `/subject/spelling` captured by src/platform/ops/error-capture.js
  // (client-origin). NULL `route_name` falls into client-origin because
  // that is the majority case in today's data.
  const [
    accountsReal,
    accountsDemo,
    learnersReal,
    learnersDemo,
    demosActive,
    practice7dReal,
    practice7dDemo,
    practice30dReal,
    practice30dDemo,
    eventLog7d,
    receipts7dReal,
    receipts7dDemo,
    errorsClient,
    errorsServer,
  ] = await Promise.all([
    scalarCountSafe(db, `
      SELECT COUNT(*) AS value
      FROM adult_accounts
      WHERE COALESCE(account_type, 'real') <> 'demo'
    `, []),
    scalarCountSafe(db, `
      SELECT COUNT(*) AS value
      FROM adult_accounts
      WHERE account_type = 'demo'
    `, []),
    // learner_profiles has no account_id column — ownership is tracked in
    // account_learner_memberships with role='owner'. A learner without an
    // owner row (shouldn't happen in practice) is treated as real because
    // the anti-join below drops only rows that DO match a demo owner.
    scalarCountSafe(db, `
      SELECT COUNT(*) AS value
      FROM learner_profiles lp
      WHERE NOT EXISTS (
        SELECT 1 FROM account_learner_memberships alm
        INNER JOIN adult_accounts aa ON aa.id = alm.account_id
        WHERE alm.learner_id = lp.id
          AND alm.role = 'owner'
          AND aa.account_type = 'demo'
      )
    `, []),
    // I2 reviewer fix: use COUNT(DISTINCT lp.id) so a learner with multiple
    // demo-owner memberships (tests guard this case) is counted once, not
    // per-membership. Same applies to the two practice-session demo queries
    // below.
    scalarCountSafe(db, `
      SELECT COUNT(DISTINCT lp.id) AS value
      FROM learner_profiles lp
      INNER JOIN account_learner_memberships alm ON alm.learner_id = lp.id
      INNER JOIN adult_accounts aa ON aa.id = alm.account_id
      WHERE alm.role = 'owner'
        AND aa.account_type = 'demo'
    `, []),
    scalarCountSafe(db, `
      SELECT COUNT(*) AS value
      FROM adult_accounts
      WHERE account_type = 'demo'
        AND demo_expires_at > ?
    `, [nowTs]),
    // practice_sessions.learner_id → account_learner_memberships (role='owner')
    // → adult_accounts. Real is "NOT EXISTS a demo owner" so sessions with
    // no owner row fall into real (defensive default matching the accounts
    // filter convention).
    scalarCountSafe(db, `
      SELECT COUNT(*) AS value
      FROM practice_sessions ps
      WHERE ps.updated_at > ?
        AND NOT EXISTS (
          SELECT 1 FROM account_learner_memberships alm
          INNER JOIN adult_accounts aa ON aa.id = alm.account_id
          WHERE alm.learner_id = ps.learner_id
            AND alm.role = 'owner'
            AND aa.account_type = 'demo'
        )
    `, [cutoff7d]),
    // I2 reviewer fix: DISTINCT ps.id so a session whose learner has
    // multiple demo-owner memberships is counted once per session, not per
    // membership.
    scalarCountSafe(db, `
      SELECT COUNT(DISTINCT ps.id) AS value
      FROM practice_sessions ps
      INNER JOIN account_learner_memberships alm ON alm.learner_id = ps.learner_id
      INNER JOIN adult_accounts aa ON aa.id = alm.account_id
      WHERE ps.updated_at > ?
        AND alm.role = 'owner'
        AND aa.account_type = 'demo'
    `, [cutoff7d]),
    scalarCountSafe(db, `
      SELECT COUNT(*) AS value
      FROM practice_sessions ps
      WHERE ps.updated_at > ?
        AND NOT EXISTS (
          SELECT 1 FROM account_learner_memberships alm
          INNER JOIN adult_accounts aa ON aa.id = alm.account_id
          WHERE alm.learner_id = ps.learner_id
            AND alm.role = 'owner'
            AND aa.account_type = 'demo'
        )
    `, [cutoff30d]),
    // I2 reviewer fix: DISTINCT ps.id (see 7d twin above).
    scalarCountSafe(db, `
      SELECT COUNT(DISTINCT ps.id) AS value
      FROM practice_sessions ps
      INNER JOIN account_learner_memberships alm ON alm.learner_id = ps.learner_id
      INNER JOIN adult_accounts aa ON aa.id = alm.account_id
      WHERE ps.updated_at > ?
        AND alm.role = 'owner'
        AND aa.account_type = 'demo'
    `, [cutoff30d]),
    scalarCountSafe(db, `
      SELECT COUNT(*) AS value
      FROM event_log
      WHERE created_at > ?
    `, [cutoff7d]),
    scalarCountSafe(db, `
      SELECT COUNT(*) AS value
      FROM mutation_receipts mr
      INNER JOIN adult_accounts aa ON aa.id = mr.account_id
      WHERE mr.applied_at > ?
        AND COALESCE(aa.account_type, 'real') <> 'demo'
    `, [cutoff7d]),
    scalarCountSafe(db, `
      SELECT COUNT(*) AS value
      FROM mutation_receipts mr
      INNER JOIN adult_accounts aa ON aa.id = mr.account_id
      WHERE mr.applied_at > ?
        AND aa.account_type = 'demo'
    `, [cutoff7d]),
    // I5 reviewer fix: SQLite `LIKE` is case-sensitive by default. Apply
    // `lower()` on both sides so a route logged with uppercase letters
    // (e.g. `/API/admin/foo` from a legacy beacon) does not silently
    // misclassify as client-origin. The client-side query below keeps the
    // `IS NULL OR NOT LIKE` invariant so the two sides remain strictly
    // exclusive.
    scalarCountSafe(db, `
      SELECT COUNT(*) AS value
      FROM ops_error_events
      WHERE route_name IS NULL OR lower(route_name) NOT LIKE '/api/%'
    `, [], 'ops_error_events'),
    scalarCountSafe(db, `
      SELECT COUNT(*) AS value
      FROM ops_error_events
      WHERE lower(route_name) LIKE '/api/%'
    `, [], 'ops_error_events'),
  ]);

  const errorByStatus = {
    open: 0,
    investigating: 0,
    resolved: 0,
    ignored: 0,
  };
  let accountOpsUpdatesTotal = 0;

  try {
    const statusRows = await all(db, `
      SELECT metric_key, metric_count
      FROM admin_kpi_metrics
      WHERE metric_key LIKE ?
    `, [`${KPI_ERROR_STATUS_METRIC_PREFIX}%`]);
    for (const row of statusRows) {
      const key = typeof row?.metric_key === 'string' ? row.metric_key : '';
      if (!key.startsWith(KPI_ERROR_STATUS_METRIC_PREFIX)) continue;
      const status = key.slice(KPI_ERROR_STATUS_METRIC_PREFIX.length);
      if (!OPS_ERROR_STATUSES.includes(status)) continue;
      errorByStatus[status] = Math.max(0, Number(row?.metric_count) || 0);
    }
    const updatesRow = await first(db, `
      SELECT metric_count
      FROM admin_kpi_metrics
      WHERE metric_key = ?
    `, [KPI_ACCOUNT_OPS_UPDATES_METRIC_KEY]);
    accountOpsUpdatesTotal = Math.max(0, Number(updatesRow?.metric_count) || 0);
  } catch (error) {
    if (!isMissingTableError(error, 'admin_kpi_metrics')) throw error;
    // Soft-fail: counters stay at zero. The admin hub still loads before the
    // migration lands in remote D1.
  }

  // U11: surface cron-driven reconciliation telemetry so the dashboard
  // can warn when automated reconciliation has stalled. Metric keys live
  // in `worker/src/cron/scheduled.js::runScheduledHandler`; we soft-fail if the
  // table is missing so the hub keeps loading pre-migration.
  // I-RE-1 (re-review Important): the cron also runs a retention sweep on
  // request_limits + sessions + receipts. A retention failure alone
  // doesn't trip the reconcile failure timestamp, so the dashboard was
  // silent when retention alone degraded. Surface the retention
  // last-failure-at so the banner predicate can fire on either failure.
  let cronReconcile = {
    lastSuccessAt: 0,
    lastFailureAt: 0,
    successCount: 0,
    retentionLastFailureAt: 0,
  };
  try {
    const cronRows = await all(db, `
      SELECT metric_key, metric_count, updated_at
      FROM admin_kpi_metrics
      WHERE metric_key IN (?, ?, ?, ?)
    `, [
      'capacity.cron.reconcile.success',
      'capacity.cron.reconcile.last_success_at',
      'capacity.cron.reconcile.last_failure_at',
      'capacity.cron.retention.last_failure_at',
    ]);
    for (const row of cronRows) {
      const key = typeof row?.metric_key === 'string' ? row.metric_key : '';
      if (key === 'capacity.cron.reconcile.success') {
        cronReconcile.successCount = Math.max(0, Number(row.metric_count) || 0);
      } else if (key === 'capacity.cron.reconcile.last_success_at') {
        cronReconcile.lastSuccessAt = Math.max(0, Number(row.metric_count) || 0);
      } else if (key === 'capacity.cron.reconcile.last_failure_at') {
        cronReconcile.lastFailureAt = Math.max(0, Number(row.metric_count) || 0);
      } else if (key === 'capacity.cron.retention.last_failure_at') {
        cronReconcile.retentionLastFailureAt = Math.max(0, Number(row.metric_count) || 0);
      }
    }
  } catch (error) {
    if (!isMissingTableError(error, 'admin_kpi_metrics')) throw error;
  }

  return {
    generatedAt: nowTs,
    accounts: {
      total: accountsReal,
      real: accountsReal,
      demo: accountsDemo,
    },
    learners: {
      total: learnersReal + learnersDemo,
      real: learnersReal,
      demo: learnersDemo,
    },
    demos: { active: demosActive },
    practiceSessions: {
      last7d: practice7dReal + practice7dDemo,
      last30d: practice30dReal + practice30dDemo,
      real: { last7d: practice7dReal, last30d: practice30dReal },
      demo: { last7d: practice7dDemo, last30d: practice30dDemo },
    },
    eventLog: { last7d: eventLog7d },
    mutationReceipts: {
      last7d: receipts7dReal + receipts7dDemo,
      real: { last7d: receipts7dReal },
      demo: { last7d: receipts7dDemo },
    },
    errorEvents: {
      byStatus: errorByStatus,
      byOrigin: { client: errorsClient, server: errorsServer },
    },
    accountOpsUpdates: { total: accountOpsUpdatesTotal },
    cronReconcile,
  };
}

async function listRecentMutationReceipts(db, { now, actorAccountId, actor = null, limit = OPS_ACTIVITY_STREAM_DEFAULT_LIMIT } = {}) {
  // P3 U1: skip redundant actor lookup when pre-resolved actor is threaded.
  if (!actor) {
    await assertAdminHubActor(db, actorAccountId);
  }
  const nowTs = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const safeLimit = Math.max(1, Math.min(OPS_ACTIVITY_STREAM_MAX_LIMIT, Number(limit) || OPS_ACTIVITY_STREAM_DEFAULT_LIMIT));
  const rows = await all(db, `
    SELECT account_id, request_id, scope_type, scope_id, mutation_kind, status_code, correlation_id, applied_at
    FROM mutation_receipts
    ORDER BY applied_at DESC, request_id DESC
    LIMIT ?
  `, [safeLimit]);
  return {
    generatedAt: nowTs,
    entries: rows.map((row) => ({
      requestId: typeof row?.request_id === 'string' ? row.request_id : '',
      accountIdMasked: maskAccountIdLastN(row?.account_id),
      mutationKind: typeof row?.mutation_kind === 'string' ? row.mutation_kind : '',
      scopeType: typeof row?.scope_type === 'string' ? row.scope_type : '',
      scopeId: maskMutationReceiptScopeId(row?.scope_type, row?.scope_id),
      correlationId: typeof row?.correlation_id === 'string' ? row.correlation_id : '',
      statusCode: Number(row?.status_code) || 0,
      appliedAt: Number(row?.applied_at) || 0,
    })),
  };
}

// U9 (P3): cross-subject content overview query. Returns a status
// envelope per subject WITHOUT importing subject engines. The live subjects
// are probed via lightweight table queries where they have ops-signal data;
// future subjects are returned as placeholders with static metadata.
//
// R16 compliance: this function performs zero mastery mutations —
// every statement is a SELECT or a COUNT.
const CONTENT_OVERVIEW_SUBJECTS = [
  { subjectKey: 'spelling', displayName: 'Spelling', queryLive: true },
  { subjectKey: 'grammar', displayName: 'Grammar', queryLive: true },
  { subjectKey: 'punctuation', displayName: 'Punctuation', queryLive: true },
  { subjectKey: 'arithmetic', displayName: 'Arithmetic', queryLive: true },
  { subjectKey: 'reasoning', displayName: 'Reasoning', queryLive: false },
  { subjectKey: 'reading', displayName: 'Reading', queryLive: true },
];

async function readSubjectContentOverviewData(db, { now, actorAccountId, actor = null, env = {} } = {}) {
  if (!actor) {
    await assertAdminHubActor(db, actorAccountId);
  }
  const nowTs = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const cutoff7d = nowTs - KPI_WINDOW_7D_MS;

  // Parallel queries for live subject signals. Each query is independent
  // and uses existing tables. We soft-fail on missing tables so the hub
  // loads before the relevant migrations land.

  const spellingContentP = readSpellingContentForReadModels(db, actorAccountId, 'spelling', {
    nowMs: nowTs,
    env,
  }).catch(() => null);

  const spellingErrorsP = scalarCountSafe(db, `
    SELECT COUNT(*) AS value
    FROM ops_error_events
    WHERE (lower(route_name) LIKE '%spelling%' OR lower(message_first_line) LIKE '%spelling%')
      AND last_seen > ?
      AND status <> 'resolved' AND status <> 'ignored'
  `, [cutoff7d], 'ops_error_events');

  // Grammar: errors from ops_error_events
  const grammarErrorsP = scalarCountSafe(db, `
    SELECT COUNT(*) AS value
    FROM ops_error_events
    WHERE (lower(route_name) LIKE '%grammar%' OR lower(message_first_line) LIKE '%grammar%')
      AND last_seen > ?
      AND status <> 'resolved' AND status <> 'ignored'
  `, [cutoff7d], 'ops_error_events');

  // Punctuation: errors from ops_error_events
  const punctuationErrorsP = scalarCountSafe(db, `
    SELECT COUNT(*) AS value
    FROM ops_error_events
    WHERE (lower(route_name) LIKE '%punctuation%' OR lower(message_first_line) LIKE '%punctuation%')
      AND last_seen > ?
      AND status <> 'resolved' AND status <> 'ignored'
  `, [cutoff7d], 'ops_error_events');

  // Arithmetic: errors from ops_error_events
  const arithmeticErrorsP = scalarCountSafe(db, `
    SELECT COUNT(*) AS value
    FROM ops_error_events
    WHERE (lower(route_name) LIKE '%arithmetic%' OR lower(message_first_line) LIKE '%arithmetic%')
      AND last_seen > ?
      AND status <> 'resolved' AND status <> 'ignored'
  `, [cutoff7d], 'ops_error_events');

  // Reading: errors from ops_error_events
  const readingErrorsP = scalarCountSafe(db, `
    SELECT COUNT(*) AS value
    FROM ops_error_events
    WHERE (lower(route_name) LIKE '%reading%' OR lower(message_first_line) LIKE '%reading%')
      AND last_seen > ?
      AND status <> 'resolved' AND status <> 'ignored'
  `, [cutoff7d], 'ops_error_events');

  const [
    spellingContent,
    spellingErrors,
    grammarErrors,
    punctuationErrors,
    arithmeticErrors,
    readingErrors,
  ] = await Promise.all([
    spellingContentP,
    spellingErrorsP,
    grammarErrorsP,
    punctuationErrorsP,
    arithmeticErrorsP,
    readingErrorsP,
  ]);

  // Derive spelling release version and validation errors from the same
  // global-release-aware runtime source used by learner-facing spelling reads.
  let spellingReleaseVersion = null;
  let spellingValidationErrors = 0;
  const spellingSummary = spellingContent?.summary;
  if (spellingSummary && typeof spellingSummary === 'object') {
    const pubVersion = Number(spellingSummary.publishedVersion);
    if (pubVersion > 0) {
      spellingReleaseVersion = String(pubVersion);
    } else {
      const updatedAt = Number(
        spellingSummary.publishedAt
        || spellingSummary.sourceUpdatedAt,
      );
      if (updatedAt > 0) spellingReleaseVersion = `updated:${updatedAt}`;
    }
    spellingValidationErrors = Math.max(0, Number(spellingSummary.errorCount) || 0);
  }

  // Derive support load signal: simple heuristic based on 7d error count.
  function supportSignal(errorCount) {
    if (errorCount >= 10) return 'high';
    if (errorCount >= 3) return 'medium';
    if (errorCount >= 1) return 'low';
    return 'none';
  }

  const subjects = CONTENT_OVERVIEW_SUBJECTS.map((subject) => {
    if (subject.subjectKey === 'spelling') {
      return {
        subjectKey: 'spelling',
        displayName: 'Spelling',
        status: 'live',
        releaseVersion: spellingReleaseVersion,
        validationErrors: spellingValidationErrors,
        errorCount7d: spellingErrors,
        supportLoadSignal: supportSignal(spellingErrors),
        // U6 (P6): release readiness signals
        validationBlockers: spellingValidationErrors > 0
          ? [`${spellingValidationErrors} unresolved validation error${spellingValidationErrors === 1 ? '' : 's'}`]
          : [],
        validationWarnings: [],
        hasRealDiagnostics: true,
        recentErrorCount7d: spellingErrors,
      };
    }
    if (subject.subjectKey === 'grammar') {
      return {
        subjectKey: 'grammar',
        displayName: 'Grammar',
        status: 'live',
        releaseVersion: null,
        validationErrors: 0,
        errorCount7d: grammarErrors,
        supportLoadSignal: supportSignal(grammarErrors),
        // U6 (P6): release readiness signals
        validationBlockers: [],
        validationWarnings: [],
        hasRealDiagnostics: true,
        recentErrorCount7d: grammarErrors,
      };
    }
    if (subject.subjectKey === 'punctuation') {
      return {
        subjectKey: 'punctuation',
        displayName: 'Punctuation',
        status: 'live',
        releaseVersion: null,
        validationErrors: 0,
        errorCount7d: punctuationErrors,
        supportLoadSignal: supportSignal(punctuationErrors),
        // U6 (P6): release readiness signals
        validationBlockers: [],
        validationWarnings: [],
        hasRealDiagnostics: true,
        recentErrorCount7d: punctuationErrors,
      };
    }
    if (subject.subjectKey === 'arithmetic') {
      return {
        subjectKey: 'arithmetic',
        displayName: 'Arithmetic',
        status: 'live',
        releaseVersion: ARITHMETIC_CONTENT_RELEASE_ID,
        validationErrors: 0,
        errorCount7d: arithmeticErrors,
        supportLoadSignal: supportSignal(arithmeticErrors),
        validationBlockers: [],
        validationWarnings: [],
        hasRealDiagnostics: true,
        recentErrorCount7d: arithmeticErrors,
      };
    }
    if (subject.subjectKey === 'reading') {
      return {
        subjectKey: 'reading',
        displayName: 'Reading',
        status: 'live',
        releaseVersion: READING_CONTENT_RELEASE_ID,
        validationErrors: 0,
        errorCount7d: readingErrors,
        supportLoadSignal: supportSignal(readingErrors),
        validationBlockers: [],
        validationWarnings: [],
        hasRealDiagnostics: true,
        recentErrorCount7d: readingErrors,
      };
    }
    // Placeholder subjects: static metadata, no runtime queries
    return {
      subjectKey: subject.subjectKey,
      displayName: subject.displayName,
      status: 'placeholder',
      releaseVersion: null,
      validationErrors: 0,
      errorCount7d: 0,
      supportLoadSignal: 'none',
      // U6 (P6): placeholder subjects have no validation or diagnostics
      validationBlockers: [],
      validationWarnings: [],
      hasRealDiagnostics: false,
      recentErrorCount7d: 0,
    };
  });

  return {
    generatedAt: nowTs,
    subjects,
  };
}

// ---------------------------------------------------------------------------
// U7 (P6): Content quality signals — per-subject learning quality data.
// Uses the same safeSection pattern as admin-debug-bundle: each subject
// query is independently wrapped so failures degrade gracefully.
// ---------------------------------------------------------------------------

async function safeSignalSection(label, fn) {
  try {
    return await fn();
  } catch {
    return null;
  }
}

async function readContentQualitySignalsData(db, {
  actorAccountId,
  actor = null,
  now,
  env = {},
} = {}) {
  if (!actor) {
    await assertAdminHubActor(db, actorAccountId);
  }
  const nowTs = Number.isFinite(Number(now)) ? Number(now) : Date.now();

  // Grammar signals: concept coverage from GRAMMAR_AGGREGATE_CONCEPTS (18 concepts)
  // and per-concept attempt counts from the mastery_evidence table.
  const grammarSignals = await safeSignalSection('grammar', async () => {
    // Concept count is static — 18 KS2 grammar concepts defined in roster.
    const GRAMMAR_CONCEPT_COUNT = 18;

    // Count concepts that have at least one evidence row (any learner).
    const conceptsWithEvidence = await scalarCountSafe(db, `
      SELECT COUNT(DISTINCT concept_id) AS value
      FROM mastery_evidence
      WHERE subject_id = 'grammar'
    `, [], 'mastery_evidence');

    // High wrong-rate concepts: concepts where recent wrong answers exceed 40%.
    let highWrongRateItems = [];
    try {
      const wrongRateRows = await all(db, `
        SELECT concept_id,
               COUNT(*) AS total_attempts,
               SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) AS wrong_count
        FROM mastery_evidence
        WHERE subject_id = 'grammar'
        GROUP BY concept_id
        HAVING wrong_count * 1.0 / total_attempts > 0.4
        ORDER BY wrong_count DESC
        LIMIT 10
      `, []);
      highWrongRateItems = wrongRateRows.map((r) => ({
        id: r.concept_id || '',
        label: r.concept_id || '',
        count: Number(r.wrong_count) || 0,
        detail: `${Number(r.wrong_count) || 0}/${Number(r.total_attempts) || 0} wrong`,
      }));
    } catch {
      // Table may not have is_correct column — degrade gracefully.
    }

    // Template coverage: distinct templateId values used across all grammar evidence.
    let templateValue = 0;
    try {
      const tplCount = await scalar(db, `
        SELECT COUNT(DISTINCT template_id) AS value
        FROM mastery_evidence
        WHERE subject_id = 'grammar' AND template_id IS NOT NULL AND template_id <> ''
      `, []);
      templateValue = Math.max(0, Number(tplCount) || 0);
    } catch {
      // template_id column may not exist in all environments.
    }

    return {
      subjectKey: 'grammar',
      subjectName: 'Grammar',
      signals: {
        skillCoverage: {
          status: conceptsWithEvidence > 0 ? 'available' : 'not_available',
          value: Math.min(conceptsWithEvidence, GRAMMAR_CONCEPT_COUNT),
          total: GRAMMAR_CONCEPT_COUNT,
        },
        templateCoverage: {
          status: templateValue > 0 ? 'available' : 'not_available',
          value: templateValue,
          total: 0, // Total templates not statically known at worker level
        },
        itemCoverage: { status: 'not_available', value: 0, total: 0 },
        commonMisconceptions: { status: 'not_available', items: [] },
        highWrongRate: {
          status: highWrongRateItems.length > 0 ? 'available' : 'not_available',
          items: highWrongRateItems,
        },
        recentlyChangedUnevidenced: { status: 'not_available', items: [] },
      },
    };
  });

  // Spelling signals: word-bank coverage from the global-release-aware
  // runtime content path. Legacy account_subject_content is fallback only
  // before the first content operations release is seeded.
  const spellingSignals = await safeSignalSection('spelling', async () => {
    let wordCount = 0;
    let runtimeCoreCount = 0;
    const spellingContent = await readSpellingContentForReadModels(db, actorAccountId, 'spelling', {
      nowMs: nowTs,
      env,
    });
    const words = Array.isArray(spellingContent.runtimeSnapshot?.words)
      ? spellingContent.runtimeSnapshot.words
      : [];
    wordCount = Number(spellingContent.summary?.runtimeWordCount) || words.length || 0;
    runtimeCoreCount = coverageTierCounts(words).statutoryCore;

    return {
      subjectKey: 'spelling',
      subjectName: 'Spelling',
      signals: {
        skillCoverage: { status: 'not_available', value: 0, total: 0 },
        templateCoverage: { status: 'not_available', value: 0, total: 0 },
        itemCoverage: {
          status: wordCount > 0 ? 'available' : 'not_available',
          value: runtimeCoreCount,
          total: wordCount,
        },
        commonMisconceptions: { status: 'not_available', items: [] },
        highWrongRate: { status: 'not_available', items: [] },
        recentlyChangedUnevidenced: { status: 'not_available', items: [] },
      },
    };
  });

  // Punctuation signals: skill count from the static roster (known at runtime).
  const punctuationSignals = await safeSignalSection('punctuation', async () => {
    // Punctuation skills are defined in shared/punctuation/content.js.
    // We do not import them here — the count is derived from what evidence exists.
    let skillsWithEvidence = 0;
    try {
      skillsWithEvidence = await scalarCountSafe(db, `
        SELECT COUNT(DISTINCT concept_id) AS value
        FROM mastery_evidence
        WHERE subject_id = 'punctuation'
      `, [], 'mastery_evidence');
    } catch {
      // Table may not exist — degrade.
    }

    return {
      subjectKey: 'punctuation',
      subjectName: 'Punctuation',
      signals: {
        skillCoverage: {
          status: skillsWithEvidence > 0 ? 'available' : 'not_available',
          value: skillsWithEvidence,
          total: 0, // Total skills not imported here — content-free leaf
        },
        templateCoverage: { status: 'not_available', value: 0, total: 0 },
        itemCoverage: { status: 'not_available', value: 0, total: 0 },
        commonMisconceptions: { status: 'not_available', items: [] },
        highWrongRate: { status: 'not_available', items: [] },
        recentlyChangedUnevidenced: { status: 'not_available', items: [] },
      },
    };
  });

  // Assemble — filter out null entries (subjects whose query entirely failed).
  const subjectSignals = [grammarSignals, spellingSignals, punctuationSignals]
    .filter(Boolean);

  return {
    generatedAt: nowTs,
    subjectSignals,
  };
}

function normaliseTagsJson(tagsJson) {
  if (tagsJson == null || tagsJson === '') return [];
  try {
    const parsed = JSON.parse(tagsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((tag) => (typeof tag === 'string' ? tag : ''))
      .filter((tag) => tag.length > 0);
  } catch {
    return [];
  }
}

async function readAccountOpsMetadataDirectory(db, { now, actorAccountId, actorPlatformRole = null, actor = null } = {}) {
  // P3 U1: accept a pre-resolved actor to avoid redundant DB round-trip.
  const resolvedActor = actor || await assertAdminHubActor(db, actorAccountId);
  const resolvedPlatformRole = normalisePlatformRole(actorPlatformRole || resolvedActor?.platform_role);
  const nowTs = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  let rows = [];
  try {
    rows = await all(db, `
      SELECT
        a.id AS account_id,
        a.email AS email,
        a.display_name AS display_name,
        a.platform_role AS platform_role,
        COALESCE(om.ops_status, 'active') AS ops_status,
        om.plan_label AS plan_label,
        COALESCE(om.tags_json, '[]') AS tags_json,
        om.internal_notes AS internal_notes,
        COALESCE(om.updated_at, a.updated_at) AS updated_at,
        om.updated_by_account_id AS updated_by_account_id,
        COALESCE(om.row_version, 0) AS row_version
      FROM adult_accounts a
      LEFT JOIN account_ops_metadata om ON om.account_id = a.id
      WHERE COALESCE(a.account_type, 'real') <> 'demo'
      ORDER BY COALESCE(om.updated_at, a.updated_at) DESC, a.id ASC
      LIMIT ?
    `, [OPS_ACCOUNT_DIRECTORY_LIMIT]);
  } catch (error) {
    if (!isMissingTableError(error, 'account_ops_metadata')) throw error;
    // Soft-fail: fall back to the core account list with defaulted metadata.
    rows = await all(db, `
      SELECT
        id AS account_id,
        email AS email,
        display_name AS display_name,
        platform_role AS platform_role,
        'active' AS ops_status,
        NULL AS plan_label,
        '[]' AS tags_json,
        NULL AS internal_notes,
        updated_at AS updated_at,
        NULL AS updated_by_account_id,
        0 AS row_version
      FROM adult_accounts
      WHERE COALESCE(account_type, 'real') <> 'demo'
      ORDER BY updated_at DESC, id ASC
      LIMIT ?
    `, [OPS_ACCOUNT_DIRECTORY_LIMIT]);
  }

  // R25: internal_notes is admin-only; ops-role readers see null.
  const includeNotes = resolvedPlatformRole === 'admin';

  return {
    generatedAt: nowTs,
    accounts: rows.map((row) => ({
      accountId: typeof row?.account_id === 'string' ? row.account_id : '',
      email: typeof row?.email === 'string' ? row.email : null,
      displayName: typeof row?.display_name === 'string' ? row.display_name : null,
      platformRole: normalisePlatformRole(row?.platform_role),
      opsStatus: typeof row?.ops_status === 'string' ? row.ops_status : 'active',
      planLabel: typeof row?.plan_label === 'string' ? row.plan_label : null,
      tags: normaliseTagsJson(row?.tags_json),
      internalNotes: includeNotes
        ? (typeof row?.internal_notes === 'string' ? row.internal_notes : null)
        : null,
      updatedAt: Number(row?.updated_at) || 0,
      updatedByAccountId: typeof row?.updated_by_account_id === 'string' ? row.updated_by_account_id : null,
      // U8 CAS: surface the row_version alongside every admin row so the
      // client can carry it as `expectedRowVersion` on the next mutation.
      rowVersion: Math.max(0, Number(row?.row_version) || 0),
    })),
  };
}

function emptyOpsErrorEventSummary(generatedAt) {
  return {
    generatedAt,
    totals: {
      open: 0,
      investigating: 0,
      resolved: 0,
      ignored: 0,
      all: 0,
    },
    entries: [],
  };
}

// U19: bound on user-supplied filter inputs. 64 chars is generous for a
// route substring; a tighter cap keeps the LIKE pattern short so a
// hostile client cannot force a heavy table scan with a pathological
// trigraph. Values above this cap throw `validation_failed` rather than
// silently truncating — no ambiguity at the dispatch boundary.
const OPS_ERROR_FILTER_ROUTE_MAX_CHARS = 64;

// Phase E adv-e-4: SQLite LIKE metacharacter escape. The admin-supplied
// route substring is bound via a `?` placeholder, so SQL injection is
// already prevented — but `%` and `_` are LIKE wildcards. Without
// escaping them, an admin typing `%` would accidentally match every
// route (e.g. `LIKE '%%%'`). We pair the escape with an `ESCAPE '\\'`
// clause on the LIKE expression so a literal `\` in user input stays
// literal after the double replacement.
function escapeLikePattern(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}
const OPS_ERROR_FILTER_KIND_MAX_CHARS = 128;
// Date range is clamped to the last 90 days. Older events are pruned
// from `ops_error_events` by the retention sweep anyway; a wider
// window would just return empty results with a slow scan.
const OPS_ERROR_FILTER_MAX_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

function validateOpsErrorFilterString(value, field, maxChars) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') {
    throw new BadRequestError(`Filter field ${field} must be a string.`, {
      code: 'validation_failed',
      field,
    });
  }
  if (value.length > maxChars) {
    throw new BadRequestError(`Filter field ${field} exceeds the ${maxChars}-char limit.`, {
      code: 'validation_failed',
      field,
      maxChars,
    });
  }
  return value;
}

function validateOpsErrorFilterTimestamp(value, field) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new BadRequestError(`Filter field ${field} must be a finite timestamp.`, {
      code: 'validation_failed',
      field,
    });
  }
  if (numeric < 0) {
    throw new BadRequestError(`Filter field ${field} must be non-negative.`, {
      code: 'validation_failed',
      field,
    });
  }
  return numeric;
}

function normaliseOpsErrorFilter(rawFilter, { nowTs }) {
  const filter = isPlainObject(rawFilter) ? rawFilter : {};
  const statusValue = typeof filter.status === 'string' && OPS_ERROR_STATUSES.includes(filter.status)
    ? filter.status
    : null;
  const routeValue = validateOpsErrorFilterString(filter.route, 'route', OPS_ERROR_FILTER_ROUTE_MAX_CHARS);
  const kindValue = validateOpsErrorFilterString(filter.kind, 'kind', OPS_ERROR_FILTER_KIND_MAX_CHARS);
  const lastSeenAfter = validateOpsErrorFilterTimestamp(filter.lastSeenAfter, 'lastSeenAfter');
  const lastSeenBefore = validateOpsErrorFilterTimestamp(filter.lastSeenBefore, 'lastSeenBefore');
  if (lastSeenAfter !== null && lastSeenBefore !== null && lastSeenAfter > lastSeenBefore) {
    throw new BadRequestError('Filter lastSeenAfter must be <= lastSeenBefore.', {
      code: 'validation_failed',
      field: 'lastSeenAfter',
    });
  }
  // Reject insanely-old bounds that would trigger a full-table scan. 90d
  // is the retention window, so anything older is definitionally empty.
  const safeNow = Number.isFinite(nowTs) ? nowTs : Date.now();
  const minBound = safeNow - OPS_ERROR_FILTER_MAX_WINDOW_MS;
  if (lastSeenAfter !== null && lastSeenAfter < minBound) {
    throw new BadRequestError(`Filter lastSeenAfter cannot be more than ${OPS_ERROR_FILTER_MAX_WINDOW_MS / (24 * 60 * 60 * 1000)} days in the past.`, {
      code: 'validation_failed',
      field: 'lastSeenAfter',
    });
  }
  // Allow lastSeenBefore in the future (client clock skew + schedule-ahead
  // resolved transitions) but clamp to a 1-day future window so a bogus
  // value cannot slip through as a sentinel.
  const maxFutureBound = safeNow + (24 * 60 * 60 * 1000);
  if (lastSeenBefore !== null && lastSeenBefore > maxFutureBound) {
    throw new BadRequestError('Filter lastSeenBefore cannot be more than 1 day in the future.', {
      code: 'validation_failed',
      field: 'lastSeenBefore',
    });
  }
  // U19: `release` filter reuses the tightened U16 regex so a garbage
  // value cannot poison the WHERE clause. Null passes through.
  let releaseValue = null;
  if (filter.release != null && filter.release !== '') {
    if (typeof filter.release !== 'string' || !OPS_ERROR_RELEASE_REGEX.test(filter.release)) {
      throw new BadRequestError('Filter release must be a SHA-shaped hex string.', {
        code: 'validation_failed',
        field: 'release',
      });
    }
    releaseValue = filter.release;
  }
  const reopenedAfterResolved = filter.reopenedAfterResolved === true
    || filter.reopenedAfterResolved === 'true'
    || filter.reopenedAfterResolved === '1';
  return {
    status: statusValue,
    route: routeValue,
    kind: kindValue,
    lastSeenAfter,
    lastSeenBefore,
    release: releaseValue,
    reopenedAfterResolved,
  };
}

async function readOpsErrorEventSummary(db, {
  now,
  actorAccountId,
  actor: preResolvedActor = null,
  status = null,
  limit = OPS_ERROR_EVENTS_DEFAULT_LIMIT,
  filter = null,
} = {}) {
  // P3 U1: accept a pre-resolved actor to skip the redundant DB lookup.
  const actor = preResolvedActor || await assertAdminHubActor(db, actorAccountId);
  const actorPlatformRole = normalisePlatformRole(actor?.platform_role);
  const nowTs = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const safeLimit = Math.max(1, Math.min(OPS_ERROR_EVENTS_MAX_LIMIT, Number(limit) || OPS_ERROR_EVENTS_DEFAULT_LIMIT));
  // U19: the legacy `status` arg stays supported for backwards-compat
  // — it collapses into the new filter object when the caller has not
  // supplied an explicit filter. Filter fields take precedence when both
  // are provided.
  const explicitFilter = filter ? normaliseOpsErrorFilter(filter, { nowTs }) : null;
  const legacyStatusFilter = typeof status === 'string' && OPS_ERROR_STATUSES.includes(status)
    ? status
    : null;
  const resolvedFilter = explicitFilter || normaliseOpsErrorFilter({ status: legacyStatusFilter }, { nowTs });

  try {
    const totalsRows = await all(db, `
      SELECT status, COUNT(*) AS value
      FROM ops_error_events
      GROUP BY status
    `);
    const totals = {
      open: 0,
      investigating: 0,
      resolved: 0,
      ignored: 0,
      all: 0,
    };
    for (const row of totalsRows) {
      const rawStatus = typeof row?.status === 'string' ? row.status : '';
      const count = Math.max(0, Number(row?.value) || 0);
      if (OPS_ERROR_STATUSES.includes(rawStatus)) {
        totals[rawStatus] = count;
      }
      totals.all += count;
    }

    // U18 / U19: drawer-ready SELECT pulls the full column set per row so
    // the client can render an expandable <details> with release-tracking
    // timestamps and per-role redaction. U19 builds the WHERE clause
    // dynamically from the validated filter object — route uses a
    // case-insensitive LIKE substring; kind uses an exact match; date-
    // range uses `last_seen BETWEEN ?`; release uses first_seen_release;
    // reopenedAfterResolved composites three predicates. All placeholders
    // are parameterised so SQL-metacharacters in user input cannot
    // escape the WHERE clause.
    const whereClauses = [];
    const whereParams = [];
    if (resolvedFilter.status) {
      whereClauses.push('status = ?');
      whereParams.push(resolvedFilter.status);
    }
    if (resolvedFilter.route) {
      // Case-insensitive substring match. The route column is normalised
      // by `normaliseRouteNameServer` on write so it is already lowercase
      // where it came from the client. Admins may still type upper-case
      // (e.g. `/API/`) which we lower to match.
      //
      // Phase E adv-e-4: escape LIKE metacharacters (`%`, `_`, `\`) in
      // the admin-supplied substring so typing `%` finds literal `%`
      // rather than matching every route. The ESCAPE clause tells
      // SQLite that `\` introduces a literal metacharacter. This is
      // defence-in-depth — the filter validator already caps length +
      // rejects control chars, but admins may legitimately want to find
      // a route they know literally contains `%` or `_`.
      whereClauses.push(`lower(route_name) LIKE lower(?) ESCAPE '\\'`);
      whereParams.push(`%${escapeLikePattern(resolvedFilter.route)}%`);
    }
    if (resolvedFilter.kind) {
      whereClauses.push('error_kind = ?');
      whereParams.push(resolvedFilter.kind);
    }
    if (resolvedFilter.lastSeenAfter !== null) {
      whereClauses.push('last_seen >= ?');
      whereParams.push(resolvedFilter.lastSeenAfter);
    }
    if (resolvedFilter.lastSeenBefore !== null) {
      whereClauses.push('last_seen <= ?');
      whereParams.push(resolvedFilter.lastSeenBefore);
    }
    if (resolvedFilter.release) {
      whereClauses.push('first_seen_release = ?');
      whereParams.push(resolvedFilter.release);
    }
    if (resolvedFilter.reopenedAfterResolved) {
      // "Reopened after resolved" = the row is currently `open` AND it
      // has a resolved_in_release stamp (so it WAS resolved at some
      // point) AND last_status_change_at is set (a transition has
      // occurred since the release stamp).
      whereClauses.push("status = 'open'");
      whereClauses.push('resolved_in_release IS NOT NULL');
      whereClauses.push('last_status_change_at IS NOT NULL');
    }
    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const entryRows = await all(db, `
      SELECT id, error_kind, message_first_line, first_frame, route_name, user_agent,
             account_id, occurrence_count, first_seen, last_seen, status,
             first_seen_release, last_seen_release, resolved_in_release,
             last_status_change_at
      FROM ops_error_events
      ${whereSql}
      ORDER BY last_seen DESC, id DESC
      LIMIT ?
    `, [...whereParams, safeLimit]);

    // U18 R25 redaction matrix: admin sees every field. ops-role sees the
    // same metadata but with `accountIdMasked` blanked to null. Public /
    // parent never reach this surface (admin hub is admin-or-ops-only per
    // `assertAdminHubActor`). The read-side enforcement mirrors the
    // `readAccountOpsMetadataDirectory` pattern already in the repo.
    const isAdmin = actorPlatformRole === 'admin';

    return {
      generatedAt: nowTs,
      totals,
      entries: entryRows.map((row) => ({
        id: typeof row?.id === 'string' ? row.id : '',
        errorKind: typeof row?.error_kind === 'string' ? row.error_kind : '',
        messageFirstLine: typeof row?.message_first_line === 'string' ? row.message_first_line : '',
        firstFrame: typeof row?.first_frame === 'string' ? row.first_frame : null,
        routeName: typeof row?.route_name === 'string' ? row.route_name : null,
        userAgent: typeof row?.user_agent === 'string' ? row.user_agent : null,
        // R25: ops-role sees accountIdMasked as null; admin sees the last
        // 6 chars so they can cross-reference to adult_accounts. Parent
        // hub never reads this endpoint.
        accountIdMasked: isAdmin && row?.account_id ? maskAccountIdLastN(row.account_id) : null,
        occurrenceCount: Math.max(0, Number(row?.occurrence_count) || 0),
        firstSeen: Number(row?.first_seen) || 0,
        lastSeen: Number(row?.last_seen) || 0,
        status: typeof row?.status === 'string' ? row.status : 'open',
        // U18 drawer fields — release-tracking columns land unchanged for
        // both roles (the release string itself is not PII; only the
        // account attribution is redacted for ops).
        firstSeenRelease: typeof row?.first_seen_release === 'string' && row.first_seen_release
          ? row.first_seen_release
          : null,
        lastSeenRelease: typeof row?.last_seen_release === 'string' && row.last_seen_release
          ? row.last_seen_release
          : null,
        resolvedInRelease: typeof row?.resolved_in_release === 'string' && row.resolved_in_release
          ? row.resolved_in_release
          : null,
        // `Number(null) === 0` coerces finite, so guard explicitly on the
        // nullish raw value so legacy events pre-migration-0011 report
        // `null` rather than the bogus epoch timestamp.
        lastStatusChangeAt: row?.last_status_change_at == null
          ? null
          : (Number.isFinite(Number(row.last_status_change_at))
            ? Number(row.last_status_change_at)
            : null),
      })),
    };
  } catch (error) {
    if (!isMissingTableError(error, 'ops_error_events')) throw error;
    return emptyOpsErrorEventSummary(nowTs);
  }
}

// ---------------------------------------------------------------------------
// U8 (P3): Request denial log read helper.
// Reads from `admin_request_denials` (migration 0013). R8 visibility:
//   - admin sees accountIdMasked (last 8 chars) so they can cross-reference.
//   - ops sees denial_reason + route only — NO account or learner linkage.
// Soft-fails with isMissingTableError so the panel loads pre-migration.
// ---------------------------------------------------------------------------

async function readAdminRequestDenials(db, {
  now,
  actorAccountId,
  actor: preResolvedActor = null,
  reason = null,
  route = null,
  accountId: filterAccountId = null,
  from = null,
  to = null,
  limit = DENIAL_DEFAULT_LIMIT,
} = {}) {
  const actor = preResolvedActor || await assertAdminHubActor(db, actorAccountId);
  const actorPlatformRole = normalisePlatformRole(actor?.platform_role);
  const nowTs = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const safeLimit = Math.max(1, Math.min(DENIAL_MAX_LIMIT, Number(limit) || DENIAL_DEFAULT_LIMIT));
  const isAdmin = actorPlatformRole === 'admin';

  const whereClauses = [];
  const whereParams = [];

  if (typeof reason === 'string' && reason) {
    whereClauses.push('denial_reason = ?');
    whereParams.push(reason);
  }
  if (typeof route === 'string' && route) {
    whereClauses.push('route_name LIKE ?');
    whereParams.push(`%${route}%`);
  }
  // R9: only admin can filter by account_id — ops never touches account linkage.
  if (isAdmin && typeof filterAccountId === 'string' && filterAccountId) {
    whereClauses.push('account_id LIKE ?');
    whereParams.push(`%${filterAccountId}%`);
  }
  if (from != null && Number.isFinite(Number(from))) {
    whereClauses.push('denied_at >= ?');
    whereParams.push(Number(from));
  }
  if (to != null && Number.isFinite(Number(to))) {
    whereClauses.push('denied_at <= ?');
    whereParams.push(Number(to));
  }

  const whereSql = whereClauses.length > 0
    ? `WHERE ${whereClauses.join(' AND ')}`
    : '';

  try {
    const rows = await all(db, `
      SELECT id, denied_at, denial_reason, route_name, account_id,
             learner_id, session_id_last8, is_demo, release, detail_json
      FROM admin_request_denials
      ${whereSql}
      ORDER BY denied_at DESC, id DESC
      LIMIT ?
    `, [...whereParams, safeLimit]);

    return {
      generatedAt: nowTs,
      entries: rows.map((row) => ({
        id: typeof row?.id === 'string' ? row.id : '',
        deniedAt: Number(row?.denied_at) || 0,
        denialReason: typeof row?.denial_reason === 'string' ? row.denial_reason : '',
        routeName: typeof row?.route_name === 'string' ? row.route_name : null,
        // R8: admin sees last-8 masked account_id; ops sees null.
        accountIdMasked: isAdmin && row?.account_id
          ? maskAccountIdLastN(row.account_id, DENIAL_ACCOUNT_ID_MASK_LAST_N)
          : null,
        isDemo: Boolean(row?.is_demo),
        release: typeof row?.release === 'string' ? row.release : null,
      })),
    };
  } catch (error) {
    if (!isMissingTableError(error, 'admin_request_denials')) throw error;
    return { generatedAt: nowTs, entries: [] };
  }
}

// ---------------------------------------------------------------------------
// U7 (P3): Account search + detail read helpers.
// Search: queries adult_accounts by email/ID/display_name substring match.
//   - 3-char minimum query length to avoid full-table scans.
//   - Admin sees full email; ops sees last 6 chars only.
//   - Bounded to 50 results, filterable by ops_status and platform_role.
// Detail: aggregates account summary, linked learners, recent errors (10),
//   recent denials (10), recent mutations (10), and ops metadata for a
//   single account.  Admin sees full detail; ops sees masked email, no
//   internal notes.
// ---------------------------------------------------------------------------

const ACCOUNT_SEARCH_MIN_QUERY_LENGTH = 3;
const ACCOUNT_SEARCH_DEFAULT_LIMIT = 50;
const ACCOUNT_SEARCH_MAX_LIMIT = 50;
const ACCOUNT_DETAIL_SUB_LIMIT = 10;

function maskEmailLastN(email, lastN = 6) {
  if (typeof email !== 'string' || !email) return null;
  return email.length <= lastN ? email : `***${email.slice(-lastN)}`;
}

async function searchAccounts(db, {
  now,
  actorAccountId,
  actor: preResolvedActor = null,
  query = '',
  opsStatus = null,
  platformRole = null,
  limit = ACCOUNT_SEARCH_DEFAULT_LIMIT,
} = {}) {
  const actor = preResolvedActor || await assertAdminHubActor(db, actorAccountId);
  const actorPlatformRole = normalisePlatformRole(actor?.platform_role);
  const nowTs = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const isAdmin = actorPlatformRole === 'admin';
  const safeLimit = Math.max(1, Math.min(ACCOUNT_SEARCH_MAX_LIMIT, Number(limit) || ACCOUNT_SEARCH_DEFAULT_LIMIT));

  const trimmedQuery = typeof query === 'string' ? query.trim() : '';
  if (trimmedQuery.length < ACCOUNT_SEARCH_MIN_QUERY_LENGTH) {
    return {
      generatedAt: nowTs,
      results: [],
      truncated: false,
      error: 'Query must be at least 3 characters.',
    };
  }

  const whereClauses = [
    '(a.email LIKE ? OR a.id LIKE ? OR a.display_name LIKE ?)',
  ];
  const likePattern = `%${trimmedQuery}%`;
  const whereParams = [likePattern, likePattern, likePattern];

  if (typeof opsStatus === 'string' && opsStatus) {
    whereClauses.push('COALESCE(om.ops_status, \'active\') = ?');
    whereParams.push(opsStatus);
  }
  if (typeof platformRole === 'string' && platformRole) {
    whereClauses.push('a.platform_role = ?');
    whereParams.push(platformRole);
  }

  // Exclude demo accounts from search results — mirrors the ops metadata
  // directory and the KPI counters (demo accounts have their own panel).
  whereClauses.push('COALESCE(a.account_type, \'real\') <> \'demo\'');

  const whereSql = whereClauses.join(' AND ');

  try {
    const rows = await all(db, `
      SELECT
        a.id,
        a.email,
        a.display_name,
        a.platform_role,
        a.created_at,
        a.updated_at,
        COALESCE(om.ops_status, 'active') AS ops_status,
        om.plan_label,
        COUNT(DISTINCT m.learner_id) AS learner_count
      FROM adult_accounts a
      LEFT JOIN account_ops_metadata om ON om.account_id = a.id
      LEFT JOIN account_learner_memberships m ON m.account_id = a.id
      WHERE ${whereSql}
      GROUP BY a.id
      ORDER BY a.updated_at DESC, a.id ASC
      LIMIT ?
    `, [...whereParams, safeLimit + 1]);

    const truncated = rows.length > safeLimit;
    const displayRows = truncated ? rows.slice(0, safeLimit) : rows;

    return {
      generatedAt: nowTs,
      results: displayRows.map((row) => ({
        id: typeof row?.id === 'string' ? row.id : '',
        email: isAdmin
          ? (typeof row?.email === 'string' ? row.email : null)
          : maskEmailLastN(row?.email),
        displayName: typeof row?.display_name === 'string' ? row.display_name : null,
        platformRole: normalisePlatformRole(row?.platform_role),
        opsStatus: typeof row?.ops_status === 'string' ? row.ops_status : 'active',
        planLabel: typeof row?.plan_label === 'string' ? row.plan_label : null,
        learnerCount: Number(row?.learner_count) || 0,
        createdAt: Number(row?.created_at) || 0,
        updatedAt: Number(row?.updated_at) || 0,
      })),
      truncated,
    };
  } catch (error) {
    if (isMissingTableError(error, 'account_ops_metadata')) {
      // Soft-fail: fall back to search without ops_metadata join.
      const fallbackRows = await all(db, `
        SELECT
          a.id,
          a.email,
          a.display_name,
          a.platform_role,
          a.created_at,
          a.updated_at,
          'active' AS ops_status,
          NULL AS plan_label,
          COUNT(DISTINCT m.learner_id) AS learner_count
        FROM adult_accounts a
        LEFT JOIN account_learner_memberships m ON m.account_id = a.id
        WHERE (a.email LIKE ? OR a.id LIKE ? OR a.display_name LIKE ?)
          AND COALESCE(a.account_type, 'real') <> 'demo'
        GROUP BY a.id
        ORDER BY a.updated_at DESC, a.id ASC
        LIMIT ?
      `, [likePattern, likePattern, likePattern, safeLimit]);
      return {
        generatedAt: nowTs,
        results: fallbackRows.map((row) => ({
          id: typeof row?.id === 'string' ? row.id : '',
          email: isAdmin
            ? (typeof row?.email === 'string' ? row.email : null)
            : maskEmailLastN(row?.email),
          displayName: typeof row?.display_name === 'string' ? row.display_name : null,
          platformRole: normalisePlatformRole(row?.platform_role),
          opsStatus: 'active',
          planLabel: null,
          learnerCount: Number(row?.learner_count) || 0,
          createdAt: Number(row?.created_at) || 0,
          updatedAt: Number(row?.updated_at) || 0,
        })),
        truncated: false,
      };
    }
    throw error;
  }
}

async function readAccountDetail(db, {
  now,
  actorAccountId,
  targetAccountId,
  actor: preResolvedActor = null,
} = {}) {
  const actor = preResolvedActor || await assertAdminHubActor(db, actorAccountId);
  const actorPlatformRole = normalisePlatformRole(actor?.platform_role);
  const nowTs = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const isAdmin = actorPlatformRole === 'admin';

  if (typeof targetAccountId !== 'string' || !targetAccountId) {
    throw new NotFoundError('Account not found.', { code: 'account_not_found' });
  }

  // 1. Account summary
  const account = await first(db, `
    SELECT
      a.id, a.email, a.display_name, a.platform_role, a.created_at, a.updated_at,
      a.account_type, a.repo_revision
    FROM adult_accounts a
    WHERE a.id = ?
  `, [targetAccountId]);

  if (!account) {
    throw new NotFoundError('Account not found.', { code: 'account_not_found' });
  }

  // 2. Linked learners
  const learners = await all(db, `
    SELECT
      l.id, l.name, l.year_group, l.created_at, l.updated_at,
      m.role AS membership_role
    FROM account_learner_memberships m
    JOIN learner_profiles l ON l.id = m.learner_id
    WHERE m.account_id = ?
    ORDER BY l.updated_at DESC
  `, [targetAccountId]);

  // 3. Recent errors (linked by account_id in ops_error_events)
  let recentErrors = [];
  try {
    recentErrors = await all(db, `
      SELECT id, fingerprint, error_kind, message_first_line, route_name,
             first_seen, last_seen, occurrence_count, status
      FROM ops_error_events
      WHERE account_id = ?
      ORDER BY last_seen DESC
      LIMIT ?
    `, [targetAccountId, ACCOUNT_DETAIL_SUB_LIMIT]);
  } catch (error) {
    if (!isMissingTableError(error, 'ops_error_events')) throw error;
  }

  // 4. Recent denials (linked by account_id in admin_request_denials)
  let recentDenials = [];
  try {
    recentDenials = await all(db, `
      SELECT id, denied_at, denial_reason, route_name
      FROM admin_request_denials
      WHERE account_id = ?
      ORDER BY denied_at DESC
      LIMIT ?
    `, [targetAccountId, ACCOUNT_DETAIL_SUB_LIMIT]);
  } catch (error) {
    if (!isMissingTableError(error, 'admin_request_denials')) throw error;
  }

  // 5. Recent mutations
  const recentMutations = await all(db, `
    SELECT request_id, mutation_kind, scope_type, scope_id, status_code, applied_at
    FROM mutation_receipts
    WHERE account_id = ?
    ORDER BY applied_at DESC
    LIMIT ?
  `, [targetAccountId, ACCOUNT_DETAIL_SUB_LIMIT]);

  // 6. Ops metadata
  let opsMetadata = null;
  try {
    opsMetadata = await first(db, `
      SELECT ops_status, plan_label, tags_json, internal_notes,
             conversion_source, cancelled_at, cancellation_reason,
             updated_at, updated_by_account_id, row_version
      FROM account_ops_metadata
      WHERE account_id = ?
    `, [targetAccountId]);
  } catch (error) {
    if (!isMissingTableError(error, 'account_ops_metadata')) throw error;
  }

  return {
    generatedAt: nowTs,
    account: {
      id: account.id,
      email: isAdmin
        ? (typeof account.email === 'string' ? account.email : null)
        : maskEmailLastN(account.email),
      displayName: typeof account.display_name === 'string' ? account.display_name : null,
      platformRole: normalisePlatformRole(account.platform_role),
      accountType: account.account_type || 'real',
      repoRevision: Number(account.repo_revision) || 0,
      createdAt: Number(account.created_at) || 0,
      updatedAt: Number(account.updated_at) || 0,
    },
    learners: learners.map((l) => ({
      id: l.id,
      displayName: typeof l.name === 'string' ? l.name : null,
      yearGroup: l.year_group ?? null,
      membershipRole: l.membership_role || 'owner',
      createdAt: Number(l.created_at) || 0,
      updatedAt: Number(l.updated_at) || 0,
    })),
    recentErrors: recentErrors.map((e) => ({
      id: e.id,
      fingerprint: e.fingerprint,
      errorKind: e.error_kind,
      messageFirstLine: e.message_first_line,
      routeName: e.route_name,
      firstSeen: Number(e.first_seen) || 0,
      lastSeen: Number(e.last_seen) || 0,
      occurrenceCount: Number(e.occurrence_count) || 0,
      status: e.status,
    })),
    recentDenials: isAdmin ? recentDenials.map((d) => ({
      id: d.id,
      deniedAt: Number(d.denied_at) || 0,
      denialReason: d.denial_reason,
      routeName: d.route_name,
    })) : [],
    recentMutations: recentMutations.map((m) => ({
      requestId: m.request_id,
      mutationKind: m.mutation_kind,
      scopeType: m.scope_type,
      scopeId: m.scope_id,
      statusCode: m.status_code,
      appliedAt: Number(m.applied_at) || 0,
    })),
    opsMetadata: opsMetadata ? {
      opsStatus: opsMetadata.ops_status || 'active',
      planLabel: typeof opsMetadata.plan_label === 'string' ? opsMetadata.plan_label : null,
      tags: normaliseTagsJson(opsMetadata.tags_json),
      internalNotes: isAdmin
        ? (typeof opsMetadata.internal_notes === 'string' ? opsMetadata.internal_notes : null)
        : null,
      updatedAt: Number(opsMetadata.updated_at) || 0,
      updatedByAccountId: typeof opsMetadata.updated_by_account_id === 'string'
        ? opsMetadata.updated_by_account_id
        : null,
      rowVersion: Math.max(0, Number(opsMetadata.row_version) || 0),
    } : {
      opsStatus: 'active',
      planLabel: null,
      tags: [],
      internalNotes: null,
      updatedAt: 0,
      updatedByAccountId: null,
      rowVersion: 0,
    },
    // U8 (P7): Account lifecycle fields — computed at read-time.
    lifecycleFields: buildLifecycleFields({ account, opsMetadata, nowTs }),
  };
}

// U8 (P7): Build lifecycle fields for account detail response.
function buildLifecycleFields({ account, opsMetadata, nowTs }) {
  const createdAt = Number(account.created_at) || 0;
  const accountAge = createdAt > 0 ? Math.floor((nowTs - createdAt) / 86400000) : 0;
  const opsStatus = opsMetadata?.ops_status || 'active';
  return {
    planLabel: typeof opsMetadata?.plan_label === 'string' ? opsMetadata.plan_label : null,
    accountType: account.account_type || 'real',
    accountAge,
    lastActive: null, // Populated by caller if practice_session data available
    conversionSource: typeof opsMetadata?.conversion_source === 'string' ? opsMetadata.conversion_source : null,
    paymentHold: opsStatus === 'payment_hold',
    suspended: opsStatus === 'suspended',
    cancelledAt: opsMetadata?.cancelled_at != null ? Number(opsMetadata.cancelled_at) : null,
    cancellationReason: typeof opsMetadata?.cancellation_reason === 'string' ? opsMetadata.cancellation_reason : null,
  };
}

async function bumpAdminKpiMetric(db, key, nowTs, delta = 1) {
  if (!(typeof key === 'string' && key)) return;
  const resolvedDelta = Number.isFinite(Number(delta)) ? Number(delta) : 1;
  const ts = Number.isFinite(Number(nowTs)) ? Number(nowTs) : Date.now();
  const seedCount = Math.max(0, resolvedDelta);
  try {
    await run(db, `
      INSERT INTO admin_kpi_metrics (metric_key, metric_count, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(metric_key) DO UPDATE SET
        metric_count = MAX(0, admin_kpi_metrics.metric_count + ?),
        updated_at = ?
    `, [key, seedCount, ts, resolvedDelta, ts]);
  } catch (error) {
    if (isMissingTableError(error, 'admin_kpi_metrics')) return;
    throw error;
  }
}

function bumpAdminKpiMetricStatement(db, key, nowTs, delta = 1, { exists = null } = {}) {
  const resolvedDelta = Number.isFinite(Number(delta)) ? Number(delta) : 1;
  const ts = Number.isFinite(Number(nowTs)) ? Number(nowTs) : Date.now();
  const seedCount = Math.max(0, resolvedDelta);
  const valueParams = [key, seedCount, ts];
  // B-RE-1: when an `exists` guard is supplied, the row is inserted via
  // `INSERT INTO ... SELECT <values> WHERE EXISTS (<guard>) ON CONFLICT`. If
  // the guard does not match (e.g. the caller's UPSERT lost a CAS race and
  // the post-bump row_version does not exist on disk), the SELECT yields
  // zero rows, nothing is inserted and no ON CONFLICT branch fires — the
  // counter bump is a true no-op. The batch commits semantically but the
  // counter was never moved, eliminating drift between successful receipts
  // and `account_ops_metadata.updates` / `admin.account_role.updates`.
  if (exists) {
    return bindStatement(db, `
      INSERT INTO admin_kpi_metrics (metric_key, metric_count, updated_at)
      ${guardedExistsValueSource(valueParams.length, exists.sql)}
      ON CONFLICT(metric_key) DO UPDATE SET
        metric_count = MAX(0, admin_kpi_metrics.metric_count + ?),
        updated_at = ?
    `, [...guardedExistsParams(valueParams, exists), resolvedDelta, ts]);
  }
  return bindStatement(db, `
    INSERT INTO admin_kpi_metrics (metric_key, metric_count, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(metric_key) DO UPDATE SET
      metric_count = MAX(0, admin_kpi_metrics.metric_count + ?),
      updated_at = ?
  `, [...valueParams, resolvedDelta, ts]);
}

// ---------------------------------------------------------------------------
// U10: KPI reconciliation.
//
// Computes the authoritative per-status counts for `ops_error_events`,
// compares against the values reported by the client script (for
// forensic-audit diffing), and writes the server-side values to
// `admin_kpi_metrics`.
//
// I8 (Phase C reviewer): `account_ops_metadata.updates` is NOT in the
// reconcilable set. It is a monotonic event counter incremented on
// every ops-metadata write and deliberately not recomputed from
// `mutation_receipts` — the receipts table is pruned on a 24-hour
// non-admin idempotency window (or 365 days for `admin.*` kinds), so a
// recompute would drift downward as old receipts age out. The counter is the
// cumulative-lifetime count of ops-metadata writes and is preserved
// across retention sweeps by keeping it out of `RECONCILABLE_METRIC_KEYS`.
// Earlier doc comments mistakenly described this counter as
// "reconciled"; that was incorrect and is corrected here.
//
// Single-flight lock semantics (adv-9 hardening):
//   - `admin_kpi_metrics.metric_key = 'reconcile_pending:lock'` holds the
//     lock. `metric_count` encodes the caller's requestId-derived owner
//     hash; `updated_at` records the last heartbeat / acquire.
//   - A stale lock (now - updated_at > 10 min) may be CAS-taken-over via
//     an UPDATE that matches the stale owner hash.
//   - Completion deletes the lock via CAS-on-own-hash so a slow caller
//     never clears a successor's lock.
//
// Mutation receipt (forensic trail): every invocation writes a
// `admin.ops.reconcile_kpis` receipt with `{ clientComputed,
// serverComputed, deltas }` so a rogue admin's tampering is caught at
// audit time.
// ---------------------------------------------------------------------------

const RECONCILE_KPIS_MUTATION_KIND = 'admin.ops.reconcile_kpis';
const RECONCILE_LOCK_METRIC_KEY = 'reconcile_pending:lock';
const RECONCILE_LOCK_STALE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
// Metric keys reconciliation is authoritative for. Derivable-from-source
// counters only — monotonic counters (e.g. `global_budget_exhausted`)
// stay event-driven.
const RECONCILABLE_METRIC_KEYS = Object.freeze([
  `${KPI_ERROR_STATUS_METRIC_PREFIX}open`,
  `${KPI_ERROR_STATUS_METRIC_PREFIX}investigating`,
  `${KPI_ERROR_STATUS_METRIC_PREFIX}resolved`,
  `${KPI_ERROR_STATUS_METRIC_PREFIX}ignored`,
]);

export function reconcileLockHashForRequestId(requestId) {
  // Deterministic integer derived from the caller's `requestId`. The CAS
  // takeover UPDATE matches against the existing-lock hash exactly so two
  // concurrent takeover attempts cannot both succeed.
  //
  // I6 (Phase C reviewer): the earlier implementation was a single FNV-1a
  // 32-bit hash. 32 bits gives a collision probability of ~1 in 4.3×10^9
  // per distinct requestId pair — too low for a long-lived production
  // workload where billions of request IDs accumulate over months. The
  // upgraded implementation composes **two independent FNV-1a 32-bit
  // passes** (forward and reverse seeds) into a 52-bit Number. 52 bits
  // is the largest field that fits safely inside `Number.MAX_SAFE_INTEGER`
  // (JS numbers are IEEE 754 doubles with 53-bit mantissas; using the full
  // 53 bits would sometimes produce values that don't round-trip through
  // JSON or SQLite INTEGER exactly). Collision probability at 52 bits is
  // ~1 in 4.5×10^15 per pair — astronomically safe for any realistic
  // reconciliation cadence.
  //
  // Return shape: a non-negative integer between 0 and 2^52 - 1. The
  // reserved value 0 signals "empty/invalid input" and is still emitted
  // for backwards compatibility with tests that assert `hash(null) === 0`.
  if (typeof requestId !== 'string' || !requestId) return 0;
  // Forward pass — FNV-1a 32-bit.
  let fwd = 2166136261;
  for (let i = 0; i < requestId.length; i += 1) {
    fwd ^= requestId.charCodeAt(i);
    fwd = Math.imul(fwd, 16777619);
  }
  fwd = fwd >>> 0;
  // Reverse pass — different offset basis so the two hashes are
  // independent. Iterating in reverse forces a different prefix-sensitive
  // hash path.
  let rev = 2654435761; // Knuth's multiplicative constant (non-FNV offset)
  for (let i = requestId.length - 1; i >= 0; i -= 1) {
    rev ^= requestId.charCodeAt(i);
    rev = Math.imul(rev, 16777619);
  }
  rev = rev >>> 0;
  // Pack into a 52-bit number: (fwd as high 20 bits) * 2^32 + (rev).
  // High 20 bits come from fwd >>> 12 so we are not wasting entropy on
  // low-order bits already represented in the other pass.
  const high = (fwd >>> 12) & 0xfffff; // 20 bits
  // Result fits in 52 bits: 20 + 32 = 52.
  // Use multiplication rather than bit shift because `<<` operates on
  // 32-bit ints in JS; the multiplication stays in double-precision.
  return high * 0x1_0000_0000 + rev;
}

async function readReconcileLockRow(db) {
  return first(db, `
    SELECT metric_key, metric_count, updated_at
    FROM admin_kpi_metrics
    WHERE metric_key = ?
  `, [RECONCILE_LOCK_METRIC_KEY]);
}

async function recomputeReconcilableCounters(db) {
  // Authoritative recompute from source tables. Each `SELECT COUNT` is
  // the ground truth the reconciliation writes back.
  const statusRows = await all(db, `
    SELECT status, COUNT(*) AS count
    FROM ops_error_events
    GROUP BY status
  `);
  const serverComputed = Object.create(null);
  // Seed every reconcilable status bucket at zero so a status with no
  // rows still reconciles to a write.
  for (const status of OPS_ERROR_STATUSES) {
    serverComputed[`${KPI_ERROR_STATUS_METRIC_PREFIX}${status}`] = 0;
  }
  for (const row of statusRows) {
    const status = typeof row?.status === 'string' ? row.status : '';
    if (!OPS_ERROR_STATUSES.includes(status)) continue;
    serverComputed[`${KPI_ERROR_STATUS_METRIC_PREFIX}${status}`] = Math.max(
      0,
      Number(row.count) || 0,
    );
  }
  return serverComputed;
}

async function readCurrentCounters(db) {
  const current = Object.create(null);
  for (const key of RECONCILABLE_METRIC_KEYS) current[key] = 0;
  const rows = await all(db, `
    SELECT metric_key, metric_count
    FROM admin_kpi_metrics
    WHERE metric_key IN (${RECONCILABLE_METRIC_KEYS.map(() => '?').join(', ')})
  `, RECONCILABLE_METRIC_KEYS);
  for (const row of rows) {
    const key = typeof row?.metric_key === 'string' ? row.metric_key : '';
    if (!(key in current)) continue;
    current[key] = Math.max(0, Number(row.metric_count) || 0);
  }
  return current;
}

function reconcileDiffTable(current, serverComputed, clientComputed) {
  const deltas = Object.create(null);
  for (const key of RECONCILABLE_METRIC_KEYS) {
    const currentValue = Math.max(0, Number(current[key]) || 0);
    const serverValue = Math.max(0, Number(serverComputed[key]) || 0);
    const clientValue = clientComputed && Object.prototype.hasOwnProperty.call(clientComputed, key)
      ? Math.max(0, Number(clientComputed[key]) || 0)
      : null;
    deltas[key] = {
      before: currentValue,
      serverComputed: serverValue,
      clientComputed: clientValue,
      delta: serverValue - currentValue,
      clientServerDelta: clientValue === null ? null : clientValue - serverValue,
    };
  }
  return deltas;
}

export async function reconcileAdminKpiMetricsInternal(db, {
  actorAccountId = null,
  requestId,
  correlationId = null,
  clientComputed = null,
  nowTs,
} = {}) {
  if (typeof requestId !== 'string' || !requestId) {
    throw new BadRequestError('Reconcile requestId is required.', {
      code: 'validation_failed',
      field: 'requestId',
    });
  }
  const ts = Number.isFinite(Number(nowTs)) ? Number(nowTs) : Date.now();
  const ownerHash = reconcileLockHashForRequestId(requestId);
  const receiptAccountId = actorAccountId || 'system';
  const requestHash = mutationPayloadHash(RECONCILE_KPIS_MUTATION_KIND, {
    requestId,
    clientComputed,
  });

  // H2 (Phase C reviewer): idempotency preflight. A retried reconcile with
  // the same requestId must short-circuit to the cached response BEFORE we
  // acquire the single-flight lock, otherwise a client backoff-retry storm
  // forces every caller into the lock and every caller observes 409
  // `reconcile_in_progress` even though the original reconcile already
  // landed. Matches the pattern in `updateAccountOpsMetadata` and
  // `updateOpsErrorEventStatus`.
  const existingReceipt = await loadMutationReceipt(db, receiptAccountId, requestId);
  if (existingReceipt) {
    if (existingReceipt.request_hash !== requestHash) {
      throw idempotencyReuseError({
        kind: RECONCILE_KPIS_MUTATION_KIND,
        scopeType: 'platform',
        scopeId: `reconcile-kpis:${requestId}`,
        requestId,
        correlationId,
      });
    }
    const storedReplay = safeJsonParse(existingReceipt.response_json, {});
    // The receipt body was shaped as `{ reconcile: {...} }`. Re-expand to the
    // canonical return shape and flag it as replayed via `cached: true`.
    const priorReconcile = (storedReplay && typeof storedReplay === 'object' && storedReplay.reconcile)
      ? storedReplay.reconcile
      : {};
    return {
      ok: true,
      cached: true,
      reconciledAt: Number(priorReconcile.appliedAt) || Number(existingReceipt.applied_at) || ts,
      deltas: Array.isArray(priorReconcile.deltas) ? priorReconcile.deltas : [],
      appliedCounts: (priorReconcile.serverComputed && typeof priorReconcile.serverComputed === 'object')
        ? { ...priorReconcile.serverComputed }
        : {},
      clientComputed: priorReconcile.clientComputed && typeof priorReconcile.clientComputed === 'object'
        ? { ...priorReconcile.clientComputed }
        : null,
      serverComputed: priorReconcile.serverComputed && typeof priorReconcile.serverComputed === 'object'
        ? { ...priorReconcile.serverComputed }
        : {},
    };
  }

  // --- Single-flight lock acquisition (INSERT OR IGNORE + CAS-takeover) ---
  // Step 1: optimistic insert.
  await run(db, `
    INSERT OR IGNORE INTO admin_kpi_metrics (metric_key, metric_count, updated_at)
    VALUES (?, ?, ?)
  `, [RECONCILE_LOCK_METRIC_KEY, ownerHash, ts]);

  // Step 2: check who holds the lock.
  let lockRow = await readReconcileLockRow(db);
  let weHoldTheLock = lockRow
    && Number(lockRow.metric_count) === ownerHash;

  if (!weHoldTheLock) {
    const existingOwnerHash = Math.max(0, Number(lockRow?.metric_count) || 0);
    const existingUpdatedAt = Math.max(0, Number(lockRow?.updated_at) || 0);
    const lockAgeMs = ts - existingUpdatedAt;
    if (lockAgeMs <= RECONCILE_LOCK_STALE_WINDOW_MS) {
      // Fresh lock held by another caller — reject.
      throw new ConflictError('Another reconciliation is in progress. Retry in a minute.', {
        code: 'reconcile_in_progress',
        retryable: true,
        lockedSince: existingUpdatedAt,
        staleAfterMs: RECONCILE_LOCK_STALE_WINDOW_MS,
      });
    }
    // Stale — try CAS-takeover.
    const takeoverResult = await run(db, `
      UPDATE admin_kpi_metrics
      SET metric_count = ?, updated_at = ?
      WHERE metric_key = ? AND metric_count = ? AND updated_at = ?
    `, [
      ownerHash,
      ts,
      RECONCILE_LOCK_METRIC_KEY,
      existingOwnerHash,
      existingUpdatedAt,
    ]);
    const rowsAffected = Math.max(0, Number(takeoverResult?.meta?.changes) || 0);
    if (rowsAffected !== 1) {
      // Race-lost takeover — another caller just took over.
      throw new ConflictError('Another reconciliation is in progress. Retry in a minute.', {
        code: 'reconcile_in_progress',
        retryable: true,
      });
    }
    weHoldTheLock = true;
    lockRow = await readReconcileLockRow(db);
  }

  try {
    // --- Reconcile body ---
    const before = await readCurrentCounters(db);
    const serverComputed = await recomputeReconcilableCounters(db);
    const deltas = reconcileDiffTable(before, serverComputed, clientComputed);

    // Assemble the authoritative UPSERTs + mutation receipt in one batch.
    const resolvedCorrelationId = typeof correlationId === 'string' && correlationId
      ? correlationId
      : requestId;
    const appliedCounts = Object.create(null);
    const upserts = [];
    for (const key of RECONCILABLE_METRIC_KEYS) {
      const value = Math.max(0, Number(serverComputed[key]) || 0);
      appliedCounts[key] = value;
      upserts.push(bindStatement(db, `
        INSERT INTO admin_kpi_metrics (metric_key, metric_count, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(metric_key) DO UPDATE SET
          metric_count = excluded.metric_count,
          updated_at = excluded.updated_at
      `, [key, value, ts]));
    }

    const receiptBody = {
      reconcile: {
        requestId,
        correlationId: resolvedCorrelationId,
        appliedAt: ts,
        before,
        serverComputed,
        clientComputed: clientComputed && typeof clientComputed === 'object' ? { ...clientComputed } : null,
        deltas,
      },
    };
    // R21 batch atomicity — every UPSERT + mutation receipt land together.
    await batch(db, [
      ...upserts,
      storeMutationReceiptStatement(db, {
        accountId: receiptAccountId,
        requestId,
        scopeType: 'platform',
        scopeId: `reconcile-kpis:${requestId}`,
        mutationKind: RECONCILE_KPIS_MUTATION_KIND,
        requestHash,
        response: receiptBody,
        correlationId: resolvedCorrelationId,
        appliedAt: ts,
      }),
    ]);

    return {
      ok: true,
      reconciledAt: ts,
      deltas,
      appliedCounts,
      clientComputed: clientComputed && typeof clientComputed === 'object' ? { ...clientComputed } : null,
      serverComputed,
    };
  } finally {
    // Release lock on own hash only so a slow caller does not clear a
    // successor's takeover.
    try {
      await run(db, `
        DELETE FROM admin_kpi_metrics
        WHERE metric_key = ? AND metric_count = ?
      `, [RECONCILE_LOCK_METRIC_KEY, ownerHash]);
    } catch (error) {
      // Release failure is non-fatal — the stale-lock window lets the
      // next caller take over after 10 minutes. Surface via error
      // propagation only if the caller passed us a reportable helper.
      if (!isMissingTableError(error, 'admin_kpi_metrics')) throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// U5: admin ops mutations.
// Two admin-only mutations with batch-based atomicity (R21):
//   1. updateAccountOpsMetadata  — UPSERT account_ops_metadata + receipt
//      + bump admin_kpi_metrics.account_ops_metadata.updates counter.
//   2. updateOpsErrorEventStatus — UPDATE ops_error_events.status + receipt
//      + swap admin_kpi_metrics.ops_error_events.status.<old>/<new> counters.
// withTransaction is NOT used as the atomicity primitive — it degrades to a
// no-op under production D1 per worker/src/d1.js:60-81. Every helper composes
// its writes into a single batch(db, [stmt1, stmt2, ...]) call which is the
// only primitive the platform treats atomically.
// ---------------------------------------------------------------------------

const OPS_STATUS_VALUES = Object.freeze(['active', 'suspended', 'payment_hold']);
const OPS_PLAN_LABEL_MAX_CHARS = 64;
const OPS_TAGS_MAX_COUNT = 10;
const OPS_TAG_MAX_CHARS = 32;
const OPS_INTERNAL_NOTES_MAX_CHARS = 2000;
const ACCOUNT_OPS_METADATA_MUTATION_KIND = 'admin.account_ops_metadata.update';
const OPS_ERROR_EVENT_STATUS_MUTATION_KIND = 'admin.ops_error_event.status-set';
// P2 U3: admin-gated QA seed harness. Writes a named post-Mega shape into
// `child_subject_state.spelling.data` for the target learner. scopeType is
// 'platform' so the mutation-receipt path defeats the cross-origin CSRF
// vector (H9 — a malicious iframe POST with the admin session cookie cannot
// forge a receipt header, and the receipt row proves which admin clicked).
// scopeId is deliberately `post-mega-seed:<learnerId>` so each seed lands
// in its own receipt row for audit.
const POST_MEGA_SEED_MUTATION_KIND = 'admin.spelling.post-mega-seed';
const POST_MEGA_SEED_RESTORE_MUTATION_KIND = 'admin.spelling.post-mega-seed.restore';
const POST_MEGA_SEED_LEARNER_NAME_MAX_CHARS = 64;
// U3 reviewer follow-up (MEDIUM adversarial): the seed harness accepts a
// free-form learnerId string for the "new learner" flow. Without a charset
// guard, an admin can type `alice\nbob`, `<script>`, or other control-char
// payloads that flow straight into SQL literal via `bindStatement` (safe
// against injection thanks to parameterisation, but still ugly for logs /
// audit). The regex mirrors the learner-id naming convention used elsewhere
// (lowercase/digits/hyphen, must start with alphanumeric) and is also
// enforced on the CLI + React manual-id input for consistency.
const POST_MEGA_SEED_LEARNER_ID_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/i;

function normaliseMutationEnvelope(rawMutation, { scopeType, scopeId } = {}) {
  const raw = isPlainObject(rawMutation) ? rawMutation : {};
  const requestId = typeof raw.requestId === 'string' && raw.requestId ? raw.requestId : null;
  const correlationId = typeof raw.correlationId === 'string' && raw.correlationId
    ? raw.correlationId
    : requestId;
  if (!requestId) {
    throw new BadRequestError('Mutation requestId is required.', {
      code: 'mutation_request_id_required',
      scopeType: scopeType || null,
      scopeId: scopeId || null,
    });
  }
  return { requestId, correlationId };
}

function validateAccountOpsPatch(rawPatch) {
  if (!isPlainObject(rawPatch)) {
    throw new BadRequestError('Account ops metadata patch is required.', {
      code: 'validation_failed',
      field: 'patch',
    });
  }
  const patch = {};
  let provided = 0;

  if (Object.prototype.hasOwnProperty.call(rawPatch, 'opsStatus')) {
    const value = rawPatch.opsStatus;
    if (typeof value !== 'string' || !OPS_STATUS_VALUES.includes(value)) {
      throw new BadRequestError('Ops status is not a supported value.', {
        code: 'validation_failed',
        field: 'opsStatus',
        allowed: OPS_STATUS_VALUES,
      });
    }
    patch.opsStatus = value;
    provided += 1;
  }

  if (Object.prototype.hasOwnProperty.call(rawPatch, 'planLabel')) {
    const value = rawPatch.planLabel;
    if (value === null) {
      patch.planLabel = null;
    } else if (typeof value === 'string' && value.length <= OPS_PLAN_LABEL_MAX_CHARS) {
      patch.planLabel = value;
    } else {
      throw new BadRequestError('Plan label must be a string of at most 64 characters.', {
        code: 'validation_failed',
        field: 'planLabel',
        maxChars: OPS_PLAN_LABEL_MAX_CHARS,
      });
    }
    provided += 1;
  }

  if (Object.prototype.hasOwnProperty.call(rawPatch, 'tags')) {
    const value = rawPatch.tags;
    if (!Array.isArray(value) || value.length > OPS_TAGS_MAX_COUNT) {
      throw new BadRequestError('Tags must be an array of at most 10 strings.', {
        code: 'validation_failed',
        field: 'tags',
        maxCount: OPS_TAGS_MAX_COUNT,
      });
    }
    const cleaned = [];
    for (const tag of value) {
      if (typeof tag !== 'string' || tag.length > OPS_TAG_MAX_CHARS) {
        throw new BadRequestError('Each tag must be a string of at most 32 characters.', {
          code: 'validation_failed',
          field: 'tags',
          maxChars: OPS_TAG_MAX_CHARS,
        });
      }
      cleaned.push(tag);
    }
    patch.tags = cleaned;
    provided += 1;
  }

  if (Object.prototype.hasOwnProperty.call(rawPatch, 'internalNotes')) {
    const value = rawPatch.internalNotes;
    if (value === null) {
      patch.internalNotes = null;
    } else if (typeof value === 'string' && value.length <= OPS_INTERNAL_NOTES_MAX_CHARS) {
      patch.internalNotes = value;
    } else {
      throw new BadRequestError('Internal notes must be a string of at most 2000 characters.', {
        code: 'validation_failed',
        field: 'internalNotes',
        maxChars: OPS_INTERNAL_NOTES_MAX_CHARS,
      });
    }
    provided += 1;
  }

  if (provided === 0) {
    throw new BadRequestError('Account ops metadata patch must include at least one field.', {
      code: 'validation_failed',
      field: 'patch',
    });
  }
  return patch;
}

async function loadAccountOpsMetadataRow(db, targetAccountId) {
  // ADV-3 (Phase D reviewer): expose `status_revision` so the
  // stale-session DELETE can gate its EXISTS tuple on the post-bump
  // revision, preventing false positives on tags-only edits.
  return first(db, `
    SELECT account_id, ops_status, plan_label, tags_json, internal_notes,
           updated_at, updated_by_account_id, row_version, status_revision
    FROM account_ops_metadata
    WHERE account_id = ?
  `, [targetAccountId]);
}

// U8 CAS helper: normalise the incoming `expectedRowVersion`. Accepts
// non-negative integers only. Omission is treated as `null` so the mutation
// payload hash remains stable for legacy (pre-CAS) callers during the
// transitional window between worker deploy and client update. On the
// mutation path a null value signals "no CAS pre-image was supplied" and
// is rejected with a 400 so the client is forced to integrate the field.
function normaliseExpectedRowVersion(value) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new BadRequestError('Expected row version must be a non-negative integer.', {
      code: 'validation_failed',
      field: 'expectedRowVersion',
    });
  }
  return numeric;
}

// U8 CAS helper: build the redacted `currentState` echo that accompanies a
// 409 response. `internal_notes` is admin-only (R25); ops-role viewers see
// `null` for that field while all other fields surface unchanged so the
// 409 diff banner can still show them where the row sits.
function buildAccountOpsMetadataConflictState(row, actorPlatformRole, targetAccountId) {
  const includeNotes = actorPlatformRole === 'admin';
  if (!row) {
    return {
      accountId: targetAccountId,
      opsStatus: 'active',
      planLabel: null,
      tags: [],
      internalNotes: null,
      updatedAt: 0,
      updatedByAccountId: null,
      rowVersion: 0,
    };
  }
  return {
    accountId: typeof row.account_id === 'string' ? row.account_id : targetAccountId,
    opsStatus: typeof row.ops_status === 'string' ? row.ops_status : 'active',
    planLabel: typeof row.plan_label === 'string' ? row.plan_label : null,
    tags: normaliseTagsJson(row.tags_json),
    internalNotes: includeNotes
      ? (typeof row.internal_notes === 'string' ? row.internal_notes : null)
      : null,
    updatedAt: Number(row.updated_at) || 0,
    updatedByAccountId: typeof row.updated_by_account_id === 'string' ? row.updated_by_account_id : null,
    rowVersion: Math.max(0, Number(row.row_version) || 0),
  };
}

function accountOpsMetadataRowToModel(row, targetAccountId, includeNotes) {
  if (!row) {
    return {
      accountId: targetAccountId,
      opsStatus: 'active',
      planLabel: null,
      tags: [],
      internalNotes: includeNotes ? null : null,
      updatedAt: 0,
      updatedByAccountId: null,
    };
  }
  return {
    accountId: typeof row.account_id === 'string' ? row.account_id : targetAccountId,
    opsStatus: typeof row.ops_status === 'string' ? row.ops_status : 'active',
    planLabel: typeof row.plan_label === 'string' ? row.plan_label : null,
    tags: normaliseTagsJson(row.tags_json),
    internalNotes: includeNotes
      ? (typeof row.internal_notes === 'string' ? row.internal_notes : null)
      : null,
    updatedAt: Number(row.updated_at) || 0,
    updatedByAccountId: typeof row.updated_by_account_id === 'string' ? row.updated_by_account_id : null,
  };
}

async function updateAccountOpsMetadata(db, {
  actorAccountId,
  targetAccountId,
  patch: rawPatch,
  expectedRowVersion = null,
  mutation,
  nowTs,
} = {}) {
  if (!(typeof targetAccountId === 'string' && targetAccountId)) {
    throw new BadRequestError('Target account id is required.', {
      code: 'target_account_required',
    });
  }
  const actor = await assertAdminHubActor(db, actorAccountId);
  requireAccountRoleManager(actor);

  const patch = validateAccountOpsPatch(rawPatch);

  // U15 guard 1 (self-suspend): an admin must not change their own
  // `ops_status` away from `active`. Fires BEFORE any DB work so the row_version
  // never bumps on a rejected self-suspend. `null` in the patch means
  // "field absent" (partial PATCH); only explicit non-active strings
  // trigger the guard.
  if (Object.prototype.hasOwnProperty.call(patch, 'opsStatus')
    && actorAccountId === targetAccountId
    && patch.opsStatus !== 'active'
    && patch.opsStatus !== null
  ) {
    throw new ForbiddenError('You cannot change your own account status.', {
      code: SELF_SUSPEND_FORBIDDEN,
      accountId: targetAccountId,
    });
  }
  // U8 CAS: `expectedRowVersion` is required on every mutation envelope. It
  // is a non-negative integer representing the `account_ops_metadata.row_version`
  // the client observed at read time. On success, `row_version` bumps by 1;
  // on mismatch, the helper responds with 409 `account_ops_metadata_stale`.
  // Including the field in the payload hash ensures a 409-retry carrying a
  // fresh `expectedRowVersion` is not idempotency-replayed as the original
  // stale attempt.
  const normalisedExpectedRowVersion = normaliseExpectedRowVersion(expectedRowVersion);
  if (normalisedExpectedRowVersion === null) {
    throw new BadRequestError('Expected row version is required for account ops metadata updates.', {
      code: 'validation_failed',
      field: 'expectedRowVersion',
    });
  }
  const actorPlatformRole = normalisePlatformRole(actor?.platform_role);
  const { requestId, correlationId } = normaliseMutationEnvelope(mutation, {
    scopeType: 'account',
    scopeId: targetAccountId,
  });
  const ts = Number.isFinite(Number(nowTs)) ? Number(nowTs) : Date.now();
  const requestHash = mutationPayloadHash(ACCOUNT_OPS_METADATA_MUTATION_KIND, {
    targetAccountId,
    patch,
    expectedRowVersion: normalisedExpectedRowVersion,
  });

  // Idempotency preflight — replay-safe without relying on savepoints.
  const existingReceipt = await loadMutationReceipt(db, actorAccountId, requestId);
  if (existingReceipt) {
    if (existingReceipt.request_hash !== requestHash) {
      throw idempotencyReuseError({
        kind: ACCOUNT_OPS_METADATA_MUTATION_KIND,
        scopeType: 'account',
        scopeId: targetAccountId,
        requestId,
        correlationId,
      });
    }
    const storedReplay = safeJsonParse(existingReceipt.response_json, {});
    return {
      ...storedReplay,
      opsMetadataMutation: {
        ...(storedReplay.opsMetadataMutation || {}),
        requestId,
        correlationId,
        replayed: true,
      },
    };
  }

  const target = await first(db, 'SELECT id, account_type, platform_role FROM adult_accounts WHERE id = ?', [targetAccountId]);
  if (!target) {
    throw new NotFoundError('Target account was not found.', {
      code: 'target_account_not_found',
      accountId: targetAccountId,
    });
  }
  if (accountType(target) === 'demo') {
    throw new ForbiddenError('Demo accounts cannot be managed from account ops metadata controls.', {
      code: 'demo_account_ops_forbidden',
      accountId: targetAccountId,
    });
  }

  // U15 guard 2 (last-active-admin): when the incoming patch takes a
  // platform-role=admin target off `active`, check that at least one
  // other admin remains active across `adult_accounts` × `account_ops_metadata`.
  // The pre-check SELECT is an authoritative count; the existing CAS +
  // post-batch verify catch any sub-millisecond race. When two admins race
  // to suspend each other concurrently, the second committer re-runs this
  // guard on retry and sees the winner as suspended — converging to
  // "exactly one active admin remains".
  if (Object.prototype.hasOwnProperty.call(patch, 'opsStatus')
    && patch.opsStatus !== 'active'
    && patch.opsStatus !== null
    && normalisePlatformRole(target.platform_role) === 'admin'
  ) {
    const otherActiveAdmins = await scalar(db, `
      SELECT COUNT(*) AS n
      FROM adult_accounts a
      LEFT JOIN account_ops_metadata m ON m.account_id = a.id
      WHERE a.platform_role = 'admin'
        AND COALESCE(a.account_type, 'real') <> 'demo'
        AND COALESCE(m.ops_status, 'active') = 'active'
        AND a.id <> ?
    `, [targetAccountId], 'n');
    if (!(Number(otherActiveAdmins) > 0)) {
      throw new ConflictError('Cannot change this account — they are the only active administrator.', {
        code: LAST_ADMIN_LOCKED_OUT,
        accountId: targetAccountId,
      });
    }
  }

  const existingRow = await loadAccountOpsMetadataRow(db, targetAccountId);
  const existingRowVersion = Math.max(0, Number(existingRow?.row_version) || 0);

  // U8 CAS layer 1 — pre-check. Compare the client-supplied expected pre-image
  // against the on-disk `row_version`. The common-case path rejects here so
  // the subsequent batch is never composed when the read-modify-write lost
  // the race (mirrors `updateOpsErrorEventStatus` pattern).
  if (existingRow && existingRowVersion !== normalisedExpectedRowVersion) {
    throw new ConflictError('Account ops metadata has changed since it was last read. Re-read and retry.', {
      code: 'account_ops_metadata_stale',
      retryable: true,
      accountId: targetAccountId,
      expected: normalisedExpectedRowVersion,
      current: existingRowVersion,
      currentState: buildAccountOpsMetadataConflictState(existingRow, actorPlatformRole, targetAccountId),
    });
  }
  // Fresh-row edit: the migration defaults `row_version` to 0, and the first
  // UPSERT must therefore supply `expectedRowVersion = 0`. Reject any other
  // value as stale so a mis-configured client never silently wins on a
  // missing row.
  if (!existingRow && normalisedExpectedRowVersion !== 0) {
    throw new ConflictError('Account ops metadata has changed since it was last read. Re-read and retry.', {
      code: 'account_ops_metadata_stale',
      retryable: true,
      accountId: targetAccountId,
      expected: normalisedExpectedRowVersion,
      current: 0,
      currentState: buildAccountOpsMetadataConflictState(null, actorPlatformRole, targetAccountId),
    });
  }

  const existingTags = normaliseTagsJson(existingRow?.tags_json);
  const mergedOpsStatus = Object.prototype.hasOwnProperty.call(patch, 'opsStatus')
    ? patch.opsStatus
    : (typeof existingRow?.ops_status === 'string' ? existingRow.ops_status : 'active');
  const mergedPlanLabel = Object.prototype.hasOwnProperty.call(patch, 'planLabel')
    ? patch.planLabel
    : (typeof existingRow?.plan_label === 'string' ? existingRow.plan_label : null);
  const mergedTags = Object.prototype.hasOwnProperty.call(patch, 'tags')
    ? patch.tags
    : existingTags;
  const mergedInternalNotes = Object.prototype.hasOwnProperty.call(patch, 'internalNotes')
    ? patch.internalNotes
    : (typeof existingRow?.internal_notes === 'string' ? existingRow.internal_notes : null);
  const mergedTagsJson = JSON.stringify(mergedTags);
  const nextRowVersion = normalisedExpectedRowVersion + 1;
  // ADV-3 (Phase D reviewer): mirror the SQL CASE that bumps
  // `status_revision` only when `ops_status` actually changes.
  // The stale-session DELETE below is EXISTS-guarded on THIS value
  // so a tags-only save never fires the sweep, even if the UPSERT
  // succeeds and bumps `row_version`.
  const existingStatusRevision = Math.max(0, Number(existingRow?.status_revision) || 0);
  const existingOpsStatus = typeof existingRow?.ops_status === 'string' ? existingRow.ops_status : 'active';
  const opsStatusChanged = mergedOpsStatus !== existingOpsStatus;
  const nextStatusRevision = opsStatusChanged ? existingStatusRevision + 1 : existingStatusRevision;
  // ADV-3 sweep threshold: when ops_status changed, any session
  // stamped at status_revision_at_issue < nextStatusRevision is
  // stale. When ops_status did NOT change, we bind -1 so the
  // outer WHERE evaluates to false for every session row
  // (status_revision_at_issue >= 0 always), keeping the sweep off
  // on tags-only / notes-only edits.
  const sweepThreshold = opsStatusChanged ? nextStatusRevision : -1;

  const appliedRow = {
    accountId: targetAccountId,
    opsStatus: mergedOpsStatus,
    planLabel: mergedPlanLabel,
    tags: mergedTags,
    internalNotes: mergedInternalNotes,
    updatedAt: ts,
    updatedByAccountId: actorAccountId,
    rowVersion: nextRowVersion,
  };
  const mutationMeta = {
    policyVersion: MUTATION_POLICY_VERSION,
    kind: ACCOUNT_OPS_METADATA_MUTATION_KIND,
    scopeType: 'account',
    scopeId: targetAccountId,
    requestId,
    correlationId,
    appliedAt: ts,
    replayed: false,
    rowVersion: nextRowVersion,
  };
  const response = {
    accountOpsMetadataEntry: appliedRow,
    opsMetadataMutation: mutationMeta,
  };

  // U8 CAS layer 2 — SQL guard. The UPSERT carries `row_version = ?` in the
  // ON CONFLICT branch. A concurrent write that beat the pre-check SELECT
  // produces zero affected rows; layer 3 (C1 fix) inspects the batch
  // result's `meta.changes` to surface 409. The insert branch fires only
  // on the fresh-row path (expectedRowVersion = 0 → nextRowVersion = 1).
  // U15 extends this UPDATE: `status_revision` bumps only when
  // `ops_status` changes (active→suspended or the reverse), while
  // `row_version` always bumps (CAS invariant). The CASE keeps both
  // counters in a single atomic statement so no follow-up SELECT is
  // needed to decide whether the revision moved.
  // R21 batch atomicity: UPSERT + receipt + counter bump commit together.
  // B-RE-1 (re-review Blocker): the receipt INSERT and counter bump are
  // EXISTS-guarded on a write-signature tuple `(updated_at, updated_by,
  // row_version)` that uniquely identifies THIS batch's UPSERT output.
  // Guarding only on `row_version = nextRowVersion` would not suffice —
  // two writers pre-checking at the same pre-image both compute the same
  // `nextRowVersion`, and the race-winner's commit satisfies the loser's
  // EXISTS check. Adding `updated_at = ts` discriminates the race loser
  // (whose `ts` was never written) from the winner. `batch()` atomicity
  // fires on SQL errors, not on zero-match UPSERTs, so without these
  // guards the receipt + counter would persist against a phantom
  // `appliedRow` and a retry with the same requestId would replay the
  // phantom 200.
  const receiptAndCounterExists = {
    sql: `SELECT 1 FROM account_ops_metadata
          WHERE account_id = ?
            AND updated_at = ?
            AND updated_by_account_id = ?
            AND row_version = ?`,
    params: [targetAccountId, ts, actorAccountId, nextRowVersion],
  };
  const batchResult = await batch(db, [
    bindStatement(db, `
      INSERT INTO account_ops_metadata (
        account_id,
        ops_status,
        plan_label,
        tags_json,
        internal_notes,
        updated_at,
        updated_by_account_id,
        row_version
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        ops_status = excluded.ops_status,
        plan_label = excluded.plan_label,
        tags_json = excluded.tags_json,
        internal_notes = excluded.internal_notes,
        updated_at = excluded.updated_at,
        updated_by_account_id = excluded.updated_by_account_id,
        row_version = account_ops_metadata.row_version + 1,
        status_revision = account_ops_metadata.status_revision
          + CASE WHEN account_ops_metadata.ops_status <> excluded.ops_status THEN 1 ELSE 0 END
      WHERE account_ops_metadata.row_version = ?
    `, [
      targetAccountId,
      mergedOpsStatus,
      mergedPlanLabel,
      mergedTagsJson,
      mergedInternalNotes,
      ts,
      actorAccountId,
      nextRowVersion,
      normalisedExpectedRowVersion,
    ]),
    storeMutationReceiptStatement(db, {
      accountId: actorAccountId,
      requestId,
      scopeType: 'account',
      scopeId: targetAccountId,
      mutationKind: ACCOUNT_OPS_METADATA_MUTATION_KIND,
      requestHash,
      response,
      correlationId,
      appliedAt: ts,
    }, { exists: receiptAndCounterExists }),
    bumpAdminKpiMetricStatement(db, KPI_ACCOUNT_OPS_UPDATES_METRIC_KEY, ts, 1, { exists: receiptAndCounterExists }),
    // U15 stale-session sweep. When the UPSERT bumps `status_revision`,
    // invalidate every `account_sessions` row on the target that was
    // stamped at an older revision.
    //
    // ADV-3 (Phase D reviewer) fix: the EXISTS guard tuple now
    // includes `status_revision = ?`. Without this field the guard
    // would match on any committed UPSERT (tags-only, notes-only,
    // etc.) even though the target row stayed at the old revision.
    // With the extended tuple the DELETE fires IFF the UPSERT
    // actually bumped `status_revision` AND committed with this
    // batch's write signature. A race-loser or a tags-only save
    // consequently writes zero rows here, preserving the existing
    // sessions.
    bindStatement(db, `
      DELETE FROM account_sessions
      WHERE account_id = ?
        AND status_revision_at_issue < ?
        AND EXISTS (
          SELECT 1 FROM account_ops_metadata
          WHERE account_id = ?
            AND updated_at = ?
            AND updated_by_account_id = ?
            AND row_version = ?
            AND status_revision = ?
        )
    `, [
      targetAccountId,
      sweepThreshold,
      targetAccountId,
      ts,
      actorAccountId,
      nextRowVersion,
      nextStatusRevision,
    ]),
  ]);

  // U8 CAS layer 3 (C1 fix) — post-batch verify via batch result rowsAffected.
  // The earlier implementation re-read `row_version` and compared it to
  // `nextRowVersion`, which was tautological: when two writers both
  // pre-check at v=3, their `nextRowVersion` is the same (=4), and both
  // batches commit atomically even though writer B's UPSERT WHERE-clause
  // matched zero rows. Re-reading `row_version` post-batch sees 4 (the
  // value writer A wrote) and compares to B's `nextRowVersion=4` → false
  // success with B's `appliedRow` diverging from the stored row.
  //
  // The authoritative signal is the UPSERT statement's own `meta.changes`:
  // the WHERE-guarded ON CONFLICT branch produces `changes = 0` on a race
  // loss. The insert branch and an unguarded update both produce
  // `changes = 1`. I-RE-2 (re-review Important): the receipt INSERT and
  // counter bump above are EXISTS-guarded on a write-signature tuple
  // `(account_id, updated_at, updated_by_account_id, row_version)` that
  // uniquely identifies THIS batch's UPSERT output (matching on
  // `row_version` alone would not suffice — two racing writers both
  // computing the same `nextRowVersion` would both pass the guard once
  // the winner commits). When the UPSERT loses the CAS, the guard SELECT
  // matches zero rows and the receipt + counter statements each INSERT
  // zero rows. `batch()` atomicity is preserved semantically: a
  // race-loser's batch commits but writes nothing. No drift, no phantom
  // receipt, no replay hazard.
  const upsertChanges = Math.max(0, Number(batchResult?.[0]?.meta?.changes) || 0);
  if (upsertChanges !== 1) {
    // Race-lost. Read the freshest row so the 409 currentState echo is
    // accurate for the banner diff.
    const postBatchRow = await loadAccountOpsMetadataRow(db, targetAccountId);
    const postBatchRowVersion = Math.max(0, Number(postBatchRow?.row_version) || 0);
    throw new ConflictError('Account ops metadata write lost to a concurrent update. Re-read and retry.', {
      code: 'account_ops_metadata_stale',
      retryable: true,
      accountId: targetAccountId,
      expected: nextRowVersion,
      current: postBatchRowVersion,
      currentState: buildAccountOpsMetadataConflictState(postBatchRow, actorPlatformRole, targetAccountId),
    });
  }

  // Return the merged shape so callers (and optimistic clients) get the final row.
  return response;
}

async function updateOpsErrorEventStatus(db, {
  actorAccountId,
  eventId,
  status: nextStatus,
  expectedPreviousStatus = null,
  mutation,
  nowTs,
  buildHash = null,
} = {}) {
  if (!(typeof eventId === 'string' && eventId)) {
    throw new BadRequestError('Error event id is required.', {
      code: 'validation_failed',
      field: 'eventId',
    });
  }
  if (typeof nextStatus !== 'string' || !OPS_ERROR_STATUSES.includes(nextStatus)) {
    throw new BadRequestError('Error event status is not a supported value.', {
      code: 'validation_failed',
      field: 'status',
      allowed: OPS_ERROR_STATUSES,
    });
  }
  // U5 review follow-up (Finding 2): optional client-driven CAS guard.
  // When the client supplies `expectedPreviousStatus`, the handler uses that
  // as the authoritative pre-image and rejects the transition with 409 if
  // the on-disk row has moved off that value. Clients may omit this field
  // for legacy compatibility; the handler then derives the pre-image from
  // the DB row and still carries `AND status = ?` on the UPDATE as
  // defence-in-depth against sub-millisecond races.
  if (expectedPreviousStatus !== null && expectedPreviousStatus !== undefined) {
    if (typeof expectedPreviousStatus !== 'string' || !OPS_ERROR_STATUSES.includes(expectedPreviousStatus)) {
      throw new BadRequestError('Expected previous status is not a supported value.', {
        code: 'validation_failed',
        field: 'expectedPreviousStatus',
        allowed: OPS_ERROR_STATUSES,
      });
    }
  }
  const actor = await assertAdminHubActor(db, actorAccountId);
  requireAccountRoleManager(actor);

  const { requestId, correlationId } = normaliseMutationEnvelope(mutation, {
    scopeType: 'platform',
    scopeId: `ops-error-event:${eventId}`,
  });
  const ts = Number.isFinite(Number(nowTs)) ? Number(nowTs) : Date.now();
  // Include expectedPreviousStatus in the request hash so replays that target
  // a different pre-image (e.g. client re-read after a 409 stale error) are
  // treated as new payloads, not as idempotent duplicates.
  const requestHash = mutationPayloadHash(OPS_ERROR_EVENT_STATUS_MUTATION_KIND, {
    eventId,
    status: nextStatus,
    expectedPreviousStatus: typeof expectedPreviousStatus === 'string' ? expectedPreviousStatus : null,
  });
  const scopeId = `ops-error-event:${eventId}`;

  // Idempotency preflight.
  const existingReceipt = await loadMutationReceipt(db, actorAccountId, requestId);
  if (existingReceipt) {
    if (existingReceipt.request_hash !== requestHash) {
      throw idempotencyReuseError({
        kind: OPS_ERROR_EVENT_STATUS_MUTATION_KIND,
        scopeType: 'platform',
        scopeId,
        requestId,
        correlationId,
      });
    }
    const storedReplay = safeJsonParse(existingReceipt.response_json, {});
    return {
      ...storedReplay,
      opsErrorEventStatusMutation: {
        ...(storedReplay.opsErrorEventStatusMutation || {}),
        requestId,
        correlationId,
        replayed: true,
      },
    };
  }

  const currentRow = await first(db, `
    SELECT id, fingerprint, error_kind, message_first_line, first_frame, route_name,
           user_agent, account_id, occurrence_count, first_seen, last_seen, status
    FROM ops_error_events
    WHERE id = ?
  `, [eventId]);
  if (!currentRow) {
    throw new NotFoundError('Error event was not found.', {
      code: 'not_found',
      eventId,
    });
  }
  const currentStatus = typeof currentRow.status === 'string' ? currentRow.status : 'open';
  // U5 review follow-up (Finding 2): if the client supplied an
  // expectedPreviousStatus, honour it as the authoritative CAS pre-image. A
  // mismatch with the on-disk row means another admin raced ahead; reject
  // immediately so the client re-reads before retrying. Counter bumps never
  // fire in this path because the batch is not assembled.
  if (typeof expectedPreviousStatus === 'string'
    && expectedPreviousStatus !== currentStatus
  ) {
    throw new ConflictError('Error event status has changed since it was last read. Re-read and retry.', {
      code: 'ops_error_event_status_stale',
      retryable: true,
      eventId,
      expected: expectedPreviousStatus,
      current: currentStatus,
    });
  }
  const oldStatus = currentStatus;

  const buildEntry = (statusValue, lastSeenOverride = null) => ({
    id: typeof currentRow.id === 'string' ? currentRow.id : eventId,
    errorKind: typeof currentRow.error_kind === 'string' ? currentRow.error_kind : '',
    messageFirstLine: typeof currentRow.message_first_line === 'string' ? currentRow.message_first_line : '',
    firstFrame: typeof currentRow.first_frame === 'string' ? currentRow.first_frame : null,
    routeName: typeof currentRow.route_name === 'string' ? currentRow.route_name : null,
    userAgent: typeof currentRow.user_agent === 'string' ? currentRow.user_agent : null,
    accountIdMasked: currentRow.account_id ? maskAccountIdLastN(currentRow.account_id) : null,
    occurrenceCount: Math.max(0, Number(currentRow.occurrence_count) || 0),
    firstSeen: Number(currentRow.first_seen) || 0,
    lastSeen: lastSeenOverride == null ? (Number(currentRow.last_seen) || 0) : lastSeenOverride,
    status: statusValue,
  });

  if (oldStatus === nextStatus) {
    // No-op transition — return current row without persisting a receipt or
    // bumping counters. Keeps classroom admins from writing churn when
    // double-clicking the active option.
    return {
      ok: true,
      noop: true,
      opsErrorEvent: buildEntry(oldStatus),
      opsErrorEventStatusMutation: {
        policyVersion: MUTATION_POLICY_VERSION,
        kind: OPS_ERROR_EVENT_STATUS_MUTATION_KIND,
        scopeType: 'platform',
        scopeId,
        requestId,
        correlationId,
        previousStatus: oldStatus,
        status: nextStatus,
        appliedAt: ts,
        replayed: false,
        noop: true,
      },
    };
  }

  // U5 review follow-up (Finding 3): drop `last_seen = ?` from the UPDATE.
  // Status transitions must NOT rewrite the observation timestamp — the admin's
  // resolution time is tracked via the mutation receipt's appliedAt column.
  // Only U6's recordClientErrorEvent (the INSERT ON CONFLICT DO UPDATE path)
  // bumps last_seen, preserving the `ORDER BY last_seen DESC` triage ordering.
  const appliedEvent = buildEntry(nextStatus);
  const mutationMeta = {
    policyVersion: MUTATION_POLICY_VERSION,
    kind: OPS_ERROR_EVENT_STATUS_MUTATION_KIND,
    scopeType: 'platform',
    scopeId,
    requestId,
    correlationId,
    previousStatus: oldStatus,
    status: nextStatus,
    appliedAt: ts,
    replayed: false,
  };
  const response = {
    opsErrorEvent: appliedEvent,
    opsErrorEventStatusMutation: mutationMeta,
  };

  // R21 batch atomicity: status UPDATE, receipt, and swap-counter bumps commit together.
  // U5 review follow-up (Finding 2): UPDATE carries `AND status = ?` as a
  // defence-in-depth CAS guard so that a sub-millisecond race between the
  // line-2410 SELECT above and this batch still produces a no-op UPDATE
  // (rather than overwriting another admin's write) — a post-batch verify
  // SELECT catches that tail window and emits the same 409, accepting narrow
  // counter-drift on the extreme-race path. The primary correctness check
  // is the client-driven `expectedPreviousStatus` guard higher up the
  // function, which rejects stale dispatches before the batch is composed.
  //
  // U15 additions:
  // - Write `last_status_change_at = :ts` on every real transition so
  //   Phase E's auto-reopen cooldown measures the window from the most
  //   recent status change (manual or automatic).
  // - Write `resolved_in_release = :buildHash` only on transitions INTO
  //   `resolved`. Null `buildHash` means the env var was not set, which
  //   Phase E's auto-reopen rule treats as "never auto-reopen" — the
  //   documented opt-out.
  const resolvedInReleaseValue = nextStatus === 'resolved'
    ? (typeof buildHash === 'string' && buildHash ? buildHash : null)
    : null;
  await batch(db, [
    bindStatement(db, `
      UPDATE ops_error_events
      SET status = ?,
          last_status_change_at = ?,
          resolved_in_release = CASE
            WHEN ? = 'resolved' THEN ?
            ELSE resolved_in_release
          END
      WHERE id = ? AND status = ?
    `, [nextStatus, ts, nextStatus, resolvedInReleaseValue, eventId, oldStatus]),
    storeMutationReceiptStatement(db, {
      accountId: actorAccountId,
      requestId,
      scopeType: 'platform',
      scopeId,
      mutationKind: OPS_ERROR_EVENT_STATUS_MUTATION_KIND,
      requestHash,
      response,
      correlationId,
      appliedAt: ts,
    }),
    bumpAdminKpiMetricStatement(db, `${KPI_ERROR_STATUS_METRIC_PREFIX}${oldStatus}`, ts, -1),
    bumpAdminKpiMetricStatement(db, `${KPI_ERROR_STATUS_METRIC_PREFIX}${nextStatus}`, ts, 1),
  ]);

  // Finding 2: post-batch verify to catch the sub-millisecond race window
  // between the line-2410 SELECT and the batch commit. If the status did not
  // land at nextStatus, a racing admin's write took the row first — emit a
  // 409 so the client re-reads and retries. Counter deltas from this call
  // already committed in that tail window (accepted drift in a
  // single-operator context; the expectedPreviousStatus guard higher up
  // prevents the common case).
  const postBatchStatusRow = await first(db, `
    SELECT status FROM ops_error_events WHERE id = ?
  `, [eventId]);
  const postBatchStatus = typeof postBatchStatusRow?.status === 'string' ? postBatchStatusRow.status : null;
  if (postBatchStatus !== nextStatus) {
    throw new ConflictError('Error event status transition lost to a concurrent write. Re-read and retry.', {
      code: 'ops_error_event_status_stale',
      retryable: true,
      eventId,
      expected: nextStatus,
      current: postBatchStatus,
    });
  }

  return response;
}

async function restorePostMegaSeedPreimage(db, {
  actorAccountId,
  learnerId,
  preimageId,
  confirmOverwrite = false,
  mutation = {},
  nowTs,
}) {
  if (!(typeof learnerId === 'string' && learnerId)) {
    throw new BadRequestError('Learner id is required for post-Mega restore.', {
      code: 'learner_id_required',
    });
  }
  if (!(typeof preimageId === 'string' && preimageId)) {
    throw new BadRequestError('Post-Mega preimage id is required.', {
      code: 'post_mega_preimage_id_required',
    });
  }

  const actor = await assertAdminHubActor(db, actorAccountId);
  if (accountPlatformRole(actor) !== 'admin') {
    throw new ForbiddenError('Post-Mega restore is admin-only.', {
      code: 'post_mega_seed_restore_forbidden',
      required: 'platform-role-admin',
    });
  }

  const scopeId = `post-mega-seed-restore:${learnerId}`;
  const { requestId, correlationId } = normaliseMutationEnvelope(mutation, {
    scopeType: 'platform',
    scopeId,
  });
  const ts = Number.isFinite(Number(nowTs)) ? Number(nowTs) : Date.now();
  const requestHash = mutationPayloadHash(POST_MEGA_SEED_RESTORE_MUTATION_KIND, {
    learnerId,
    preimageId,
  });
  const existingReceipt = await loadMutationReceipt(db, actorAccountId, requestId);
  if (existingReceipt) {
    if (existingReceipt.request_hash !== requestHash) {
      throw idempotencyReuseError({
        kind: POST_MEGA_SEED_RESTORE_MUTATION_KIND,
        scopeType: 'platform',
        scopeId,
        requestId,
        correlationId,
      });
    }
    const storedReplay = safeJsonParse(existingReceipt.response_json, {});
    return {
      ...storedReplay,
      postMegaSeedRestoreMutation: {
        ...(storedReplay.postMegaSeedRestoreMutation || {}),
        requestId,
        correlationId,
        replayed: true,
      },
    };
  }

  const learner = await first(
    db,
    'SELECT id, state_revision FROM learner_profiles WHERE id = ?',
    [learnerId],
  );
  if (!learner) {
    throw new NotFoundError('Learner was not found.', {
      code: 'learner_not_found',
      learnerId,
    });
  }
  const membership = await getMembership(db, actorAccountId, learnerId);
  if (!membership && !confirmOverwrite) {
    throw new ConflictError(
      'Restore target is owned by a different account. Re-submit with confirmOverwrite=true to proceed.',
      {
        code: 'seed_restore_requires_membership',
        learnerId,
      },
    );
  }
  const preimage = await first(db, `
    SELECT preimage_id, learner_id, item_count, achievement_count, created_at
    FROM spelling_seed_preimages
    WHERE preimage_id = ? AND learner_id = ?
  `, [preimageId, learnerId]);
  if (!preimage) {
    throw new NotFoundError('Post-Mega seed preimage was not found for this learner.', {
      code: 'post_mega_seed_preimage_not_found',
      learnerId,
      preimageId,
    });
  }
  if (!await boundedGameplayTableAvailable(db, 'spelling')) {
    throw new ConflictError('Bounded Spelling state is not ready for preimage restore.', {
      code: 'bounded_spelling_state_not_ready',
      retryable: true,
    });
  }

  const expectedRevision = Math.max(0, Number(learner.state_revision) || 0);
  const guard = { learnerId, expectedRevision };
  const mutationMeta = {
    policyVersion: MUTATION_POLICY_VERSION,
    kind: POST_MEGA_SEED_RESTORE_MUTATION_KIND,
    scopeType: 'platform',
    scopeId,
    requestId,
    correlationId,
    appliedAt: ts,
    expectedRevision,
    appliedRevision: expectedRevision + 1,
    replayed: false,
  };
  const response = {
    postMegaSeedRestore: {
      learnerId,
      preimageId,
      itemCount: Math.max(0, Number(preimage.item_count) || 0),
      achievementCount: Math.max(0, Number(preimage.achievement_count) || 0),
      preimageCreatedAt: Number(preimage.created_at) || 0,
      confirmedOverwrite: Boolean(!membership && confirmOverwrite),
    },
    postMegaSeedRestoreMutation: mutationMeta,
  };

  const restoreLearnerParams = [learnerId, preimageId, learnerId];
  const restoreItemParams = [learnerId, preimageId];
  const statements = [
    bindStatement(db, `
      INSERT INTO spelling_learner_state (
        learner_id, ui_json, data_json, stats_json, updated_at, updated_by_account_id
      )
      SELECT ?, archive.ui_json, archive.data_json, archive.stats_json,
             archive.source_updated_at, archive.source_updated_by_account_id
      FROM spelling_seed_preimages archive
      WHERE archive.preimage_id = ? AND archive.learner_id = ?
        ${guardedWhere(guard)}
      ON CONFLICT(learner_id) DO UPDATE SET
        ui_json = excluded.ui_json,
        data_json = excluded.data_json,
        stats_json = excluded.stats_json,
        updated_at = excluded.updated_at,
        updated_by_account_id = excluded.updated_by_account_id
    `, guardedParams(restoreLearnerParams, guard)),
    bindStatement(db, `
      DELETE FROM spelling_item_state
      WHERE learner_id = ?
        ${guardedWhere(guard)}
    `, guardedParams([learnerId], guard)),
    bindStatement(db, `
      DELETE FROM spelling_achievement_state
      WHERE learner_id = ?
        ${guardedWhere(guard)}
    `, guardedParams([learnerId], guard)),
    bindStatement(db, `
      INSERT INTO spelling_item_state (
        learner_id, slug, progress_json, guardian_json, pattern_json,
        updated_at, updated_by_account_id
      )
      SELECT ?, item.slug, item.progress_json, item.guardian_json,
             item.pattern_json, item.source_updated_at,
             item.source_updated_by_account_id
      FROM spelling_seed_preimage_items item
      WHERE item.preimage_id = ?
        ${guardedWhere(guard)}
    `, guardedParams(restoreItemParams, guard)),
    bindStatement(db, `
      INSERT INTO spelling_achievement_state (
        learner_id, achievement_id, record_json,
        updated_at, updated_by_account_id
      )
      SELECT ?, achievement.achievement_id, achievement.record_json,
             achievement.source_updated_at,
             achievement.source_updated_by_account_id
      FROM spelling_seed_preimage_achievements achievement
      WHERE achievement.preimage_id = ?
        ${guardedWhere(guard)}
    `, guardedParams(restoreItemParams, guard)),
    bindStatement(db, `
      UPDATE spelling_seed_preimages
      SET last_restored_at = ?, last_restored_by_account_id = ?
      WHERE preimage_id = ? AND learner_id = ?
        ${guardedWhere(guard)}
    `, guardedParams([ts, actorAccountId, preimageId, learnerId], guard)),
    storeMutationReceiptStatement(db, {
      accountId: actorAccountId,
      requestId,
      scopeType: 'platform',
      scopeId,
      mutationKind: POST_MEGA_SEED_RESTORE_MUTATION_KIND,
      requestHash,
      response,
      correlationId,
      appliedAt: ts,
    }, { guard }),
    bindStatement(db, `
      UPDATE learner_profiles
      SET state_revision = state_revision + 1,
          updated_at = ?
      WHERE id = ? AND state_revision = ?
    `, [ts, learnerId, expectedRevision]),
  ];

  const results = await batch(db, statements);
  const casResult = results[results.length - 1] || null;
  const casChanges = Number(casResult?.meta?.changes) || 0;
  if (casChanges !== 1) {
    const currentRevision = Number(await scalar(
      db,
      'SELECT state_revision FROM learner_profiles WHERE id = ?',
      [learnerId],
      'state_revision',
    )) || 0;
    throw staleWriteError({
      kind: POST_MEGA_SEED_RESTORE_MUTATION_KIND,
      scopeType: 'learner',
      scopeId: learnerId,
      requestId,
      correlationId,
      expectedRevision,
      currentRevision,
    });
  }
  return response;
}

// ---------------------------------------------------------------------------
// P2 U3: admin-gated QA seed harness for post-Mega learner states.
//
// Writes one of the 8 canonical seed shapes into the active Spelling store for
// a target learner. Routes through the Admin Ops P1 mutation-receipt path with
// `scopeType='platform'` so cross-origin CSRF attempts fail at the receipt
// header check. Atomic via `batch()` (R21) so the child_subject_state upsert
// and the receipt row either both land or neither does — a partial land
// would leave a seed without a receipt (or vice versa) and obscure the
// audit trail. After 0023, rollback history stays row-addressed in D1 and the
// cold legacy JSON is not read or rewritten.
//
// Edge case — target learner does not yet exist: a learner_profiles row is
// inserted (Name: "Seed learner", Year Group: "Y5", Avatar: "#8A4FFF",
// Goal: empty) and the acting admin is granted owner membership so they
// can later see the seeded learner in the admin hub's learner picker.
// ---------------------------------------------------------------------------
function postMegaSeedPreimageId(actorAccountId, requestId) {
  return `post-mega-seed:${actorAccountId}:${requestId}`;
}

function buildPostMegaSeedPreimageStatements(db, {
  actorAccountId,
  learnerId,
  preimageId,
  requestId,
  nowTs,
  guard,
}) {
  const metadataParams = [
    preimageId,
    actorAccountId,
    requestId,
    nowTs,
    learnerId,
  ];
  const itemParams = [preimageId, learnerId, preimageId];
  return [
    bindStatement(db, `
      INSERT INTO spelling_seed_preimages (
        preimage_id,
        learner_id,
        actor_account_id,
        seed_request_id,
        ui_json,
        data_json,
        stats_json,
        source_updated_at,
        source_updated_by_account_id,
        item_count,
        achievement_count,
        created_at
      )
      SELECT
        ?, state.learner_id, ?, ?, state.ui_json, state.data_json,
        state.stats_json, state.updated_at, state.updated_by_account_id,
        (SELECT COUNT(*) FROM spelling_item_state item WHERE item.learner_id = state.learner_id),
        (SELECT COUNT(*) FROM spelling_achievement_state achievement
          WHERE achievement.learner_id = state.learner_id),
        ?
      FROM spelling_learner_state state
      WHERE state.learner_id = ?
        ${guardedWhere(guard)}
      ON CONFLICT(preimage_id) DO NOTHING
    `, guardedParams(metadataParams, guard)),
    bindStatement(db, `
      INSERT INTO spelling_seed_preimage_items (
        preimage_id,
        slug,
        progress_json,
        guardian_json,
        pattern_json,
        source_updated_at,
        source_updated_by_account_id
      )
      SELECT
        ?, item.slug, item.progress_json, item.guardian_json,
        item.pattern_json, item.updated_at, item.updated_by_account_id
      FROM spelling_item_state item
      WHERE item.learner_id = ?
        AND EXISTS (
          SELECT 1 FROM spelling_seed_preimages archive
          WHERE archive.preimage_id = ?
        )
        ${guardedWhere(guard)}
      ON CONFLICT(preimage_id, slug) DO NOTHING
    `, guardedParams(itemParams, guard)),
    bindStatement(db, `
      INSERT INTO spelling_seed_preimage_achievements (
        preimage_id,
        achievement_id,
        record_json,
        source_updated_at,
        source_updated_by_account_id
      )
      SELECT
        ?, achievement.achievement_id, achievement.record_json,
        achievement.updated_at, achievement.updated_by_account_id
      FROM spelling_achievement_state achievement
      WHERE achievement.learner_id = ?
        AND EXISTS (
          SELECT 1 FROM spelling_seed_preimages archive
          WHERE archive.preimage_id = ?
        )
        ${guardedWhere(guard)}
      ON CONFLICT(preimage_id, achievement_id) DO NOTHING
    `, guardedParams(itemParams, guard)),
  ];
}

async function seedPostMegaLearnerState(db, {
  actorAccountId,
  learnerId,
  shapeName,
  today,
  confirmOverwrite = false,
  mutation = {},
  nowTs,
}) {
  if (!(typeof learnerId === 'string' && learnerId)) {
    throw new BadRequestError('Learner id is required for post-Mega seed.', {
      code: 'learner_id_required',
    });
  }
  if (learnerId.length > POST_MEGA_SEED_LEARNER_NAME_MAX_CHARS) {
    throw new BadRequestError('Learner id is too long.', {
      code: 'learner_id_too_long',
      maxChars: POST_MEGA_SEED_LEARNER_NAME_MAX_CHARS,
    });
  }
  // U3 reviewer follow-up (MEDIUM adversarial): reject control chars / HTML /
  // anything outside `[a-z0-9-]`. `learnerId: 'alice\nbob'` or `<script>` are
  // rejected with 400 `invalid_learner_id` BEFORE any SQL runs. The regex
  // enforces lowercase alphanumeric prefix + hyphen-suffix, matching the
  // platform-wide learner id convention.
  if (!POST_MEGA_SEED_LEARNER_ID_REGEX.test(learnerId)) {
    throw new BadRequestError('Learner id contains invalid characters.', {
      code: 'invalid_learner_id',
      pattern: POST_MEGA_SEED_LEARNER_ID_REGEX.source,
    });
  }
  if (!POST_MEGA_SEED_SHAPES.includes(shapeName)) {
    throw new BadRequestError('Unknown post-Mega seed shape.', {
      code: 'unknown_shape',
      allowed: [...POST_MEGA_SEED_SHAPES],
    });
  }

  // H9 CSRF — only admin-role accounts may invoke. `requireAdminHubAccess`
  // rejects demo accounts and any platformRole other than admin/ops; we
  // further tighten to admin only (ops accounts can view but not seed)
  // because the seed is destructive from the learner's perspective.
  const actor = await assertAdminHubActor(db, actorAccountId);
  if (accountPlatformRole(actor) !== 'admin') {
    throw new ForbiddenError('Post-Mega seed harness is admin-only.', {
      code: 'post_mega_seed_forbidden',
      required: 'platform-role-admin',
    });
  }

  const scopeId = `post-mega-seed:${learnerId}`;
  const { requestId, correlationId } = normaliseMutationEnvelope(mutation, {
    scopeType: 'platform',
    scopeId,
  });
  const ts = Number.isFinite(Number(nowTs)) ? Number(nowTs) : Date.now();
  // U3 reviewer follow-up (HIGH correctness): `Number(null) === 0`, which is
  // finite, so the previous `Number.isFinite(Number(today))` guard coerced
  // `today=null` (the Admin UI's default — it never sends `today`) into day 0
  // (1970-01-01). That produced temporally-nonsensical fixtures (all guardian
  // `nextDueDay` in 1970). Explicitly reject `null`/`undefined` BEFORE the
  // finite check so the ts-derived fallback actually fires for the admin
  // path. `Number('')` is also 0, so string empty is treated the same way.
  const hasTodayOverride = today != null
    && !(typeof today === 'string' && today.trim() === '')
    && Number.isFinite(Number(today));
  const todayDay = hasTodayOverride
    ? Math.floor(Number(today))
    : Math.floor(ts / (24 * 60 * 60 * 1000));
  const requestHash = mutationPayloadHash(POST_MEGA_SEED_MUTATION_KIND, {
    learnerId,
    shapeName,
    today: todayDay,
  });

  // Idempotency preflight — replay-safe.
  const existingReceipt = await loadMutationReceipt(db, actorAccountId, requestId);
  if (existingReceipt) {
    if (existingReceipt.request_hash !== requestHash) {
      throw idempotencyReuseError({
        kind: POST_MEGA_SEED_MUTATION_KIND,
        scopeType: 'platform',
        scopeId,
        requestId,
        correlationId,
      });
    }
    const storedReplay = safeJsonParse(existingReceipt.response_json, {});
    return {
      ...storedReplay,
      postMegaSeedMutation: {
        ...(storedReplay.postMegaSeedMutation || {}),
        requestId,
        correlationId,
        replayed: true,
      },
    };
  }

  // Build the seed shape. Uses the bundled seeded content snapshot so the
  // core-slug list is deterministic and matches what the service layer sees
  // on a fresh deploy. Tests inject a fixed today/learnerId so assertions
  // are reproducible.
  const seededBundle = await readSeededSpellingContentBundle();
  const runtimeSnapshot = resolveRuntimeSnapshot(seededBundle, {
    referenceBundle: seededBundle,
  });
  const wordBySlug = Object.fromEntries(
    (runtimeSnapshot?.words || []).map((word) => [word.slug, word]),
  );
  const data = resolvePostMegaSeedShape(shapeName, wordBySlug, todayDay);
  const dataJson = JSON.stringify(data);

  // Auto-create the learner if missing (plan edge case).
  const existingLearner = await first(
    db,
    'SELECT id, state_revision FROM learner_profiles WHERE id = ?',
    [learnerId],
  );
  const createdLearner = !existingLearner;
  const expectedLearnerRevision = createdLearner
    ? null
    : Math.max(0, Number(existingLearner.state_revision) || 0);
  const guard = createdLearner
    ? null
    : { learnerId, expectedRevision: expectedLearnerRevision };

  // U3 reviewer follow-up (HIGH adversarial): cross-tenant learner data wipe.
  // Before P2, an admin could type any learnerId and the seed would overwrite
  // another account's learner_profiles + child_subject_state without warning,
  // no undo, no audit pre-image. Two-layer guard:
  //   1. When the target learner already exists and the acting admin has no
  //      membership row for it, REJECT with 409 `seed_requires_membership`
  //      UNLESS the client explicitly passes `confirmOverwrite: true`. The
  //      confirm-flag lets a genuine ops response (debugging another
  //      account's data) proceed — but only with explicit intent.
  //   2. On every bounded-state overwrite, archive the current learner row
  //      and item rows inside D1. The receipt carries only a small preimage id;
  //      lifetime word history never crosses the Worker/HTTP boundary.
  let existingMembership = null;
  let previousDataJson = null;
  if (!createdLearner) {
    existingMembership = await getMembership(db, actorAccountId, learnerId);
    if (!existingMembership && !confirmOverwrite) {
      throw new ConflictError(
        'Seed target is owned by a different account. Re-submit with confirmOverwrite=true to proceed.',
        {
          code: 'seed_requires_membership',
          learnerId,
          remedy: 'Resubmit with `confirmOverwrite: true` to acknowledge the cross-tenant overwrite. Bounded state is archived in D1 before the seed is applied.',
        },
      );
    }
  }

  const boundedSpellingReady = await boundedGameplayTableAvailable(db, 'spelling');
  let hasBoundedPreimage = false;
  if (!createdLearner && boundedSpellingReady) {
    const currentBoundedState = await first(
      db,
      'SELECT 1 AS present FROM spelling_learner_state WHERE learner_id = ?',
      [learnerId],
    );
    hasBoundedPreimage = Number(currentBoundedState?.present) === 1;
    await requireBoundedSpellingLearnerState(
      db,
      learnerId,
      hasBoundedPreimage,
      true,
    );
  } else if (!createdLearner) {
    const previousRow = await first(
      db,
      `SELECT data_json FROM child_subject_state
         WHERE learner_id = ? AND subject_id = 'spelling'`,
      [learnerId],
    );
    previousDataJson = typeof previousRow?.data_json === 'string' ? previousRow.data_json : null;
  }
  const preimageId = hasBoundedPreimage
    ? postMegaSeedPreimageId(actorAccountId, requestId)
    : null;

  const statements = [];
  if (createdLearner) {
    statements.push(bindStatement(db, `
      INSERT INTO learner_profiles (
        id, name, year_group, avatar_color, goal, daily_minutes,
        created_at, updated_at, state_revision
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `, [
      learnerId,
      'Seed learner',
      'Y5',
      '#8A4FFF',
      '',
      15,
      ts,
      ts,
    ]));
    statements.push(bindStatement(db, `
      INSERT INTO account_learner_memberships (
        account_id, learner_id, role, sort_index, created_at, updated_at
      )
      VALUES (?, ?, 'owner', 0, ?, ?)
      ON CONFLICT(account_id, learner_id) DO NOTHING
    `, [actorAccountId, learnerId, ts, ts]));
  }

  if (boundedSpellingReady) {
    if (preimageId) {
      statements.push(...buildPostMegaSeedPreimageStatements(db, {
        actorAccountId,
        learnerId,
        preimageId,
        requestId,
        nowTs: ts,
        guard,
      }));
    }
    statements.push(...buildSpellingFullReplacementStatements(
      db,
      actorAccountId,
      learnerId,
      { ui: null, data, updatedAt: ts },
      ts,
      guard,
    ));
  } else {
    // Code is deployed before migration 0023. Until its readiness marker
    // exists, the legacy row remains authoritative and split tables may not
    // exist. Keep only this compatibility branch; after cutover the cold
    // legacy row is deliberately untouched.
    const legacyParams = [learnerId, 'spelling', 'null', dataJson, ts, actorAccountId];
    statements.push(bindStatement(db, `
      INSERT INTO child_subject_state (
        learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id
      )
      ${guardedValueSource(legacyParams.length, guard)}
      ON CONFLICT(learner_id, subject_id) DO UPDATE SET
        ui_json = excluded.ui_json,
        data_json = excluded.data_json,
        updated_at = excluded.updated_at,
        updated_by_account_id = excluded.updated_by_account_id
    `, guardedParams(legacyParams, guard)));
  }

  const mutationMeta = {
    policyVersion: MUTATION_POLICY_VERSION,
    kind: POST_MEGA_SEED_MUTATION_KIND,
    scopeType: 'platform',
    scopeId,
    requestId,
    correlationId,
    appliedAt: ts,
    expectedRevision: expectedLearnerRevision,
    appliedRevision: createdLearner ? 0 : expectedLearnerRevision + 1,
    replayed: false,
  };
  const response = {
    postMegaSeed: {
      learnerId,
      shapeName,
      today: todayDay,
      createdLearner,
      dataKeys: Object.keys(data).sort(),
      preimageId,
      rollbackAuthority: preimageId
        ? 'spelling_seed_preimages'
        : (previousDataJson !== null ? 'legacy_receipt' : null),
      // Kept only for code-before-schema compatibility. Once 0023 is ready,
      // this is always null and the receipt stays independent of profile size.
      previousDataJson: boundedSpellingReady ? null : previousDataJson,
      // `confirmedOverwrite` is true when the overwrite was cross-tenant
      // (no membership) and the caller passed `confirmOverwrite: true`. The
      // audit reviewer can filter on this to surface the small set of
      // cross-account seeds that deserve a second look.
      confirmedOverwrite: Boolean(!createdLearner && !existingMembership && confirmOverwrite),
    },
    postMegaSeedMutation: mutationMeta,
  };
  statements.push(storeMutationReceiptStatement(db, {
    accountId: actorAccountId,
    requestId,
    scopeType: 'platform',
    scopeId,
    mutationKind: POST_MEGA_SEED_MUTATION_KIND,
    requestHash,
    response,
    correlationId,
    appliedAt: ts,
  }, { guard }));
  if (!createdLearner) {
    statements.push(bindStatement(db, `
      UPDATE learner_profiles
      SET state_revision = state_revision + 1,
          updated_at = ?
      WHERE id = ? AND state_revision = ?
    `, [ts, learnerId, expectedLearnerRevision]));
  }

  const results = await batch(db, statements);
  if (!createdLearner) {
    const casResult = results[results.length - 1] || null;
    const casChanges = Number(casResult?.meta?.changes) || 0;
    if (casChanges !== 1) {
      const currentRevision = Number(await scalar(
        db,
        'SELECT state_revision FROM learner_profiles WHERE id = ?',
        [learnerId],
        'state_revision',
      )) || 0;
      throw staleWriteError({
        kind: POST_MEGA_SEED_MUTATION_KIND,
        scopeType: 'learner',
        scopeId: learnerId,
        requestId,
        correlationId,
        expectedRevision: expectedLearnerRevision,
        currentRevision,
      });
    }
  }
  return response;
}

// ---------------------------------------------------------------------------
// U10: Grammar Writing Try — admin archive + hard-delete.
//
// Plan: docs/plans/2026-04-26-001-feat-grammar-phase4-learning-hardening-plan.md §U10
//
// The learner subject-command dispatcher at
// `worker/src/subjects/grammar/commands.js:26-103` never inspects role, so
// U10 adds admin-gated HTTP routes (`worker/src/app.js`) that bypass the
// learner command path and invoke these repository helpers directly. The
// helpers mirror the `requireMonsterVisualConfigManager` pattern — role is
// derived server-side from the actor account, NEVER from the request
// payload. Two-step safety: archive moves the live entry into
// `state.transferEvidenceArchive`, then a separate `delete` call wipes the
// archived slot. An admin that tries to delete before archiving receives
// `archive_required_before_delete` so an accidental hard-delete is
// impossible along the admin path.
//
// Phase 4 invariant 5 ("Writing Try is non-scored") is preserved because
// these helpers mutate only `state.transferEvidence` /
// `state.transferEvidenceArchive`, never the scored slots
// (mastery/retryQueue/misconceptions/recentAttempts). The emitted audit
// events carry `nonScored: true` and are not consumed by the reward
// projection pipeline.
// ---------------------------------------------------------------------------

const GRAMMAR_TRANSFER_ARCHIVE_SCOPE_TYPE = 'grammar-transfer-evidence';
const GRAMMAR_TRANSFER_ARCHIVE_MUTATION_KIND = 'admin.grammar.transfer-evidence.archive';
const GRAMMAR_TRANSFER_DELETE_MUTATION_KIND = 'admin.grammar.transfer-evidence.delete';
// Matches the POST_MEGA_SEED_LEARNER_ID_REGEX guard — archive + delete
// paths must enforce the same charset rules so a forged admin request
// cannot smuggle control chars or HTML into the scopeId / audit log.
const GRAMMAR_ADMIN_LEARNER_ID_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/i;
// Mirrors the per-promptId cap on the learner side. Longer ids are
// rejected with `invalid_prompt_id` BEFORE any DB access runs.
const GRAMMAR_ADMIN_PROMPT_ID_MAX_CHARS = 64;
const GRAMMAR_ADMIN_PROMPT_ID_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/i;
let grammarAdminEngineModulePromise = null;

async function loadGrammarAdminEngineModule() {
  if (!grammarAdminEngineModulePromise) {
    grammarAdminEngineModulePromise = import('./subjects/grammar/engine.js')
      .catch((error) => {
        grammarAdminEngineModulePromise = null;
        throw error;
      });
  }
  return grammarAdminEngineModulePromise;
}

function assertAdminGrammarTransferInputs(learnerId, promptId) {
  if (!(typeof learnerId === 'string' && learnerId)) {
    throw new BadRequestError('Learner id is required for Writing Try admin actions.', {
      code: 'learner_id_required',
    });
  }
  if (!GRAMMAR_ADMIN_LEARNER_ID_REGEX.test(learnerId)) {
    throw new BadRequestError('Learner id contains invalid characters.', {
      code: 'invalid_learner_id',
      pattern: GRAMMAR_ADMIN_LEARNER_ID_REGEX.source,
    });
  }
  if (!(typeof promptId === 'string' && promptId)) {
    throw new BadRequestError('Prompt id is required for Writing Try admin actions.', {
      code: 'grammar_transfer_prompt_id_required',
    });
  }
  if (promptId.length > GRAMMAR_ADMIN_PROMPT_ID_MAX_CHARS || !GRAMMAR_ADMIN_PROMPT_ID_REGEX.test(promptId)) {
    throw new BadRequestError('Prompt id contains invalid characters.', {
      code: 'invalid_prompt_id',
      pattern: GRAMMAR_ADMIN_PROMPT_ID_REGEX.source,
      maxChars: GRAMMAR_ADMIN_PROMPT_ID_MAX_CHARS,
    });
  }
}

async function loadGrammarSubjectStateForAdmin(db, learnerId) {
  const row = await first(db, `
    SELECT learner_id, subject_id, ui_json, data_json, updated_at
    FROM child_subject_state
    WHERE learner_id = ? AND subject_id = 'grammar'
  `, [learnerId]);
  return {
    row,
    record: row ? subjectStateRowToRecord(row) : null,
  };
}

async function runAdminGrammarTransferMutation(db, {
  actorAccountId,
  learnerId,
  promptId,
  mutation,
  mutationKind,
  scopeType,
  scopeTypeForReceipt,
  createInitialState,
  applyStateChange,
  nowTs,
}) {
  assertAdminGrammarTransferInputs(learnerId, promptId);

  // Role gate. `assertAdminHubAccess` rejects demo accounts and any
  // platformRole outside admin/ops; then `requireGrammarTransferAdmin`
  // narrows to admin-only (ops receives 403 `grammar_transfer_admin_
  // forbidden`). The U10 follower MEDIUM chose admin-only because
  // destructive data mutations warrant the tightest gate. The payload
  // is never inspected — the client-supplied body is discarded by the
  // app.js handler, so spoofing `command.payload.actor.role` has no
  // effect.
  //
  // TODO (U10 follower — deferred MEDIUM, IDOR): no per-family
  // membership check today. A platform-admin can archive / delete any
  // learner's Writing Try evidence regardless of their
  // `account_learner_memberships`. This matches the current single-
  // family deployment where a platform-admin is implicitly trusted
  // across every learner. If the product ships multi-family
  // deployments, add a per-family scope here using
  // `canViewLearnerDiagnostics` (src/platform/access/roles.js:28-31)
  // OR a dedicated `requireLearnerFamilyMembership(db, adminId,
  // learnerId)` primitive. Tracked as follow-up work; not blocking
  // Phase 4 because the platform is single-family and the admin-only
  // gate is already narrower than the admin-hub gate.
  const actor = await assertAdminHubActor(db, actorAccountId);
  requireGrammarTransferAdmin(actor);

  const scopeId = `${scopeType}:${learnerId}:${promptId}`;
  const { requestId, correlationId } = normaliseMutationEnvelope(mutation, {
    scopeType: scopeTypeForReceipt,
    scopeId,
  });
  const ts = Number.isFinite(Number(nowTs)) ? Number(nowTs) : Date.now();
  const requestHash = mutationPayloadHash(mutationKind, { learnerId, promptId });

  // Idempotency replay preflight. A duplicate requestId that matches the
  // stored requestHash returns the prior response with `replayed: true`.
  // A mismatched hash is a client bug (or an attack) and raises 409.
  const existingReceipt = await loadMutationReceipt(db, actorAccountId, requestId);
  if (existingReceipt) {
    if (existingReceipt.request_hash !== requestHash) {
      throw idempotencyReuseError({
        kind: mutationKind,
        scopeType: scopeTypeForReceipt,
        scopeId,
        requestId,
        correlationId,
      });
    }
    const storedReplay = safeJsonParse(existingReceipt.response_json, {});
    return {
      ...storedReplay,
      grammarTransferMutation: {
        ...(storedReplay.grammarTransferMutation || {}),
        requestId,
        correlationId,
        replayed: true,
      },
    };
  }

  // U10 follower (HIGH 3): read the learner's `state_revision` up front
  // so the subject-state UPDATE can CAS against it. A concurrent learner
  // save races the admin archive; without this guard the admin UPDATE
  // would silently overwrite the learner's in-flight save. The guard is
  // the same `learner_profiles.state_revision` primitive the learner
  // command path uses (runSubjectCommandMutation + guardedValueSource).
  const learnerRow = await first(
    db,
    'SELECT id, state_revision FROM learner_profiles WHERE id = ?',
    [learnerId],
  );
  if (!learnerRow) {
    // Preserve the pre-follower error code — the security-contract test
    // asserts `grammar_state_not_found` for an unknown learner. We use
    // the Grammar-flavoured code because the route namespace is the
    // admin-grammar path; the learner is missing, which in practice is
    // indistinguishable from "no grammar subject state" for this
    // endpoint.
    throw new NotFoundError('Grammar subject state not found for this learner.', {
      code: 'grammar_state_not_found',
      learnerId,
    });
  }
  const learnerExpectedRevision = Number(learnerRow.state_revision) || 0;

  // Load the learner's Grammar subject state. Admin paths must not
  // auto-create the row — an admin action on a learner with no Grammar
  // evidence is always a lookup error.
  const { row, record } = await loadGrammarSubjectStateForAdmin(db, learnerId);
  if (!row || !record) {
    throw new NotFoundError('Grammar subject state not found for this learner.', {
      code: 'grammar_state_not_found',
      learnerId,
    });
  }

  // Run the pure engine helper against a normalised state. The engine's
  // normaliser defaults `transferEvidence` / `transferEvidenceArchive` to
  // `{}`, so pre-U10 rows without the archive slot are handled safely.
  // The pure helper throws on "archive required" / "entry not found" /
  // "archive_slot_occupied" with a stable error code; we let the error
  // bubble up to the HTTP handler.
  const initialState = createInitialState(record.data || {});
  const state = {
    ...initialState,
    ...(isPlainObject(record.ui) ? cloneSerialisable(record.ui) : {}),
    transferEvidence: isPlainObject(record.data?.transferEvidence)
      ? cloneSerialisable(record.data.transferEvidence)
      : (isPlainObject(record.ui?.transferEvidence) ? cloneSerialisable(record.ui.transferEvidence) : {}),
    transferEvidenceArchive: isPlainObject(record.data?.transferEvidenceArchive)
      ? cloneSerialisable(record.data.transferEvidenceArchive)
      : (isPlainObject(record.ui?.transferEvidenceArchive)
        ? cloneSerialisable(record.ui.transferEvidenceArchive)
        : {}),
  };

  const events = applyStateChange(state, { promptId, learnerId, requestId, now: ts });

  // Persist the mutated slots back into child_subject_state. We write the
  // full data_json and the minimal ui_json patch — the scored slots
  // (mastery/retryQueue/misconceptions/recentAttempts) are untouched so
  // the resulting JSON differs only in the two transfer slots. This is
  // the byte-level guarantee that backs Phase 4 invariant 5.
  const nextDataSource = isPlainObject(record.data) ? cloneSerialisable(record.data) : {};
  nextDataSource.transferEvidence = cloneSerialisable(state.transferEvidence) || {};
  nextDataSource.transferEvidenceArchive = cloneSerialisable(state.transferEvidenceArchive) || {};
  const nextUiSource = isPlainObject(record.ui) ? cloneSerialisable(record.ui) : null;
  if (nextUiSource) {
    nextUiSource.transferEvidence = cloneSerialisable(state.transferEvidence) || {};
    nextUiSource.transferEvidenceArchive = cloneSerialisable(state.transferEvidenceArchive) || {};
  }

  const mutationMeta = {
    policyVersion: MUTATION_POLICY_VERSION,
    kind: mutationKind,
    scopeType: scopeTypeForReceipt,
    scopeId,
    requestId,
    correlationId,
    appliedAt: ts,
    replayed: false,
  };
  const response = {
    grammarTransferEvidence: {
      learnerId,
      promptId,
      events: events.map((event) => cloneSerialisable(event)),
    },
    grammarTransferMutation: mutationMeta,
  };

  // U10 follower (HIGH 3): CAS guard on the subject-state UPDATE. The
  // UPDATE only lands when `learner_profiles.state_revision` still
  // matches the value we read at the top of this function. If a learner
  // command slipped in between (save-transfer-evidence bumps the
  // revision), the UPDATE matches zero rows and we raise `stale_write`.
  // The admin retries with the fresh state, which re-runs the pure
  // helper against post-learner-save evidence (so archive no longer
  // clobbers the learner's save).
  //
  // U10 follower (HIGH 4): the archive + delete audit events are now
  // written to `event_log` inside the SAME batch — forensic trail
  // restored. Shape matches the existing `buildSubjectRuntimePersistencePlan`
  // event row: id / learner_id / subject_id / system_id / event_type /
  // event_json / created_at / actor_account_id. `actor_account_id`
  // stamps the admin for forensics. No row in `activity_feed` — this
  // is an admin audit event, not learner activity.
  const eventStatements = [];
  for (const rawEvent of events) {
    const event = cloneSerialisable(rawEvent) || null;
    if (!event || typeof event !== 'object' || Array.isArray(event)) continue;
    const id = typeof event.id === 'string' && event.id ? event.id : uid('event');
    const createdAt = Number.isFinite(Number(event.createdAt)) ? Number(event.createdAt) : ts;
    const eventType = typeof event.type === 'string' && event.type ? event.type : 'event';
    event.id = id;
    event.learnerId = event.learnerId || learnerId;
    event.subjectId = event.subjectId || 'grammar';
    event.createdAt = createdAt;
    event.actorAccountId = actorAccountId;
    event.actorPlatformRole = accountPlatformRole(actor) || '';
    eventStatements.push(bindStatement(db, `
      INSERT INTO event_log (id, learner_id, subject_id, system_id, event_type, event_json, created_at, actor_account_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        learner_id = excluded.learner_id,
        subject_id = excluded.subject_id,
        system_id = excluded.system_id,
        event_type = excluded.event_type,
        event_json = excluded.event_json,
        created_at = excluded.created_at,
        actor_account_id = excluded.actor_account_id
    `, [
      id,
      event.learnerId,
      event.subjectId,
      event.systemId || null,
      eventType,
      JSON.stringify(event),
      createdAt,
      actorAccountId,
    ]));
  }

  // CAS guard: wraps the subject-state UPDATE in the learner's
  // `state_revision` check. SQLite fires the UPDATE only when the
  // current revision equals the value we read above; otherwise the
  // statement matches zero rows and we detect the race via changes=0.
  const subjectUpdate = bindStatement(db, `
    UPDATE child_subject_state
    SET ui_json = ?,
        data_json = ?,
        updated_at = ?,
        updated_by_account_id = ?
    WHERE learner_id = ? AND subject_id = 'grammar'
      AND EXISTS (
        SELECT 1
        FROM learner_profiles
        WHERE id = ?
          AND state_revision = ?
      )
  `, [
    nextUiSource == null ? 'null' : JSON.stringify(nextUiSource),
    JSON.stringify(nextDataSource),
    ts,
    actorAccountId,
    learnerId,
    learnerId,
    learnerExpectedRevision,
  ]);

  const statements = [
    subjectUpdate,
    ...eventStatements,
    storeMutationReceiptStatement(db, {
      accountId: actorAccountId,
      requestId,
      scopeType: scopeTypeForReceipt,
      scopeId,
      mutationKind,
      requestHash,
      response,
      correlationId,
      appliedAt: ts,
    }),
  ];
  const batchResults = await batch(db, statements);
  const subjectUpdateResult = batchResults[0] || null;
  const casChanges = Number(subjectUpdateResult?.meta?.changes) || 0;
  if (casChanges !== 1) {
    // Concurrent learner save bumped the revision between our read and
    // the CAS UPDATE — the batch leaves zero rows touched. Re-read the
    // current revision for the error payload so the admin client can
    // decide whether to retry.
    const currentRevision = Number(await scalar(
      db,
      'SELECT state_revision FROM learner_profiles WHERE id = ?',
      [learnerId],
      'state_revision',
    )) || 0;
    throw staleWriteError({
      kind: mutationKind,
      scopeType: scopeTypeForReceipt,
      scopeId,
      requestId,
      correlationId,
      expectedRevision: learnerExpectedRevision,
      currentRevision,
    });
  }

  return response;
}

async function archiveGrammarTransferEvidence(db, {
  actorAccountId,
  learnerId,
  promptId,
  mutation,
  nowTs,
}) {
  const grammarEngine = await loadGrammarAdminEngineModule();
  return runAdminGrammarTransferMutation(db, {
    actorAccountId,
    learnerId,
    promptId,
    mutation,
    mutationKind: GRAMMAR_TRANSFER_ARCHIVE_MUTATION_KIND,
    scopeType: GRAMMAR_TRANSFER_ARCHIVE_SCOPE_TYPE,
    scopeTypeForReceipt: GRAMMAR_TRANSFER_ARCHIVE_SCOPE_TYPE,
    createInitialState: grammarEngine.createInitialGrammarState,
    applyStateChange: grammarEngine.archiveGrammarTransferEvidenceState,
    nowTs,
  });
}

async function deleteGrammarTransferEvidence(db, {
  actorAccountId,
  learnerId,
  promptId,
  mutation,
  nowTs,
}) {
  const grammarEngine = await loadGrammarAdminEngineModule();
  return runAdminGrammarTransferMutation(db, {
    actorAccountId,
    learnerId,
    promptId,
    mutation,
    mutationKind: GRAMMAR_TRANSFER_DELETE_MUTATION_KIND,
    scopeType: GRAMMAR_TRANSFER_ARCHIVE_SCOPE_TYPE,
    scopeTypeForReceipt: GRAMMAR_TRANSFER_ARCHIVE_SCOPE_TYPE,
    createInitialState: grammarEngine.createInitialGrammarState,
    applyStateChange: grammarEngine.deleteGrammarTransferEvidenceState,
    nowTs,
  });
}

// ---------------------------------------------------------------------------
// U6: public client error capture ingest.
//
// recordClientErrorEvent persists a client-reported error into
// ops_error_events with tuple-authoritative dedup (R24). The Worker route in
// app.js owns the byte-cap, rate-limit, attribution, and same-regex server-
// side redaction pass; this helper owns the dedup + fingerprint + counter
// bump logic. Behaviour:
//
//   - Re-run expanded redaction (R12 + R28 + R29) defensively: never trust
//     that the client hit the identical regex set.
//   - Compute fingerprint = sha256(errorKind + '|' + messageFirstLine + '|'
//     + firstFrame) server-side; the client-supplied value is ignored.
//   - Preflight by (error_kind, message_first_line, first_frame) tuple (R24).
//     If matched, UPDATE last_seen + increment occurrence_count. The
//     `.status.open` counter is NOT bumped on a dedup hit.
//   - On fresh insert, batch the INSERT (with ON CONFLICT(fingerprint)
//     DO NOTHING to absorb theoretical fingerprint collisions) together with
//     the `.status.open` counter bump.
//   - Missing table (pre-migration deploy) returns `{unavailable: true}` so
//     the route can respond 200 and the client keeps working.
// ---------------------------------------------------------------------------

const SERVER_SENSITIVE_REGEX = /(answer_raw|prompt|learner_name|email|password|session|cookie|token|spelling_word|punctuation_answer|grammar_concept|prompt_token|learner_id)/gi;
// U6 review follow-up (Finding 1): broaden the all-caps match to cross
// underscore boundaries. `\b` in JS regex treats `_` as a word character,
// so the previous `\b[A-Z]{4,}\b` was a no-op on `PRINCIPAL_HANDLER`
// (a single long `\w+` token). The lookaround pair matches a run of 4+
// upper-case letters with any non-letter (including `_`) on either side,
// so snake_case identifiers containing spelling words are scrubbed. The
// 3-letter acronym exemption (URL, TTS, API) still holds.
const SERVER_ALL_CAPS_REGEX = /(?<![A-Za-z])[A-Z]{4,}(?![A-Za-z])/g;
const SERVER_UUID_SEGMENT_REGEX = /^[0-9a-f-]{32,36}$/i;
const SERVER_LEARNER_ID_SEGMENT_REGEX = /^learner-[a-z0-9-]+$/i;
const OPS_ERROR_MESSAGE_MAX_CHARS = 500;
const OPS_ERROR_FIRST_FRAME_MAX_CHARS = 300;
const OPS_ERROR_ROUTE_MAX_CHARS = 128;
const OPS_ERROR_USER_AGENT_MAX_CHARS = 256;
const OPS_ERROR_KIND_MAX_CHARS = 128;

function scrubSensitiveServer(value) {
  return String(value || '').replace(SERVER_SENSITIVE_REGEX, '[redacted]');
}

function scrubAllCapsServer(value) {
  return String(value || '').replace(SERVER_ALL_CAPS_REGEX, '[word]');
}

function firstLineServer(value) {
  return String(value || '').split('\n', 1)[0] || '';
}

function normaliseRouteNameServer(raw) {
  const base = typeof raw === 'string' ? raw : '';
  if (!base) return '';
  const withoutQueryHash = base.split(/[?#]/, 1)[0] || '';
  const capped = withoutQueryHash.slice(0, OPS_ERROR_ROUTE_MAX_CHARS);
  const segments = capped.split('/').map((segment) => {
    if (!segment) return segment;
    if (SERVER_UUID_SEGMENT_REGEX.test(segment) || SERVER_LEARNER_ID_SEGMENT_REGEX.test(segment)) return '[id]';
    return segment;
  });
  // U6 review follow-up (Finding 1): apply the all-caps scrub to the
  // route name as well. KS2 spelling words routed as path segments
  // (e.g. `/word/PRINCIPAL`) previously passed through unredacted.
  // This mirrors the client-side fix so defence-in-depth stays intact.
  return scrubAllCapsServer(scrubSensitiveServer(segments.join('/')));
}

// U16: release-field regex is a strict lowercase-hex 6-40 chars match. No
// case-insensitive flag, no dots/dashes/underscores — anything not SHA-shaped
// (e.g. `principal`, `PRINCIPAL`, `2026.04.25`, `v5-beta`) is rejected. This
// tightening is the Phase B adversarial follow-up: a relaxed `/i` flag would
// let KS2 spelling words (`principal` happens to be all lowercase hex-
// adjacent) smuggle through as a release stamp and leak to the ops-role view.
//
// Exposed for tests + U17 to share the identical guard the ingest route
// applies so auto-reopen condition 3 (incoming `release IS NOT NULL AND SHA-
// shaped`) can trust the stored value without re-validating. Exporting the
// compiled regex object rather than a recomputed literal avoids accidental
// drift between the two sites.
export const OPS_ERROR_RELEASE_REGEX = /^[a-f0-9]{6,40}$/;

// U17: auto-reopen cooldown window. When a new release posts an event that
// matches a resolved fingerprint, the auto-reopen rule requires
// `now - last_status_change_at > OPS_ERROR_AUTO_REOPEN_COOLDOWN_MS` so a
// just-resolved row cannot flip back and forth inside a single deploy
// window. 24h is generous for the single-release deploy cadence P1.5
// targets; canary / blue-green rollouts are documented as "all releases
// treated equal" per the plan — revisit when canary tooling ships.
export const OPS_ERROR_AUTO_REOPEN_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function validateOpsErrorRelease(rawRelease) {
  // Accept three shapes: null / undefined / missing / explicit null literal.
  // Everything else must match the strict regex — we reject malformed
  // eagerly so a client posting `release: 'PRINCIPAL'` surfaces a 400 before
  // the repository attempts a dedup SELECT.
  if (rawRelease === null || rawRelease === undefined) return null;
  if (typeof rawRelease !== 'string') {
    throw new BadRequestError('Error event release must be a string or null.', {
      code: 'validation_failed',
      field: 'release',
    });
  }
  if (!rawRelease) return null;
  // Defence-in-depth: still run the redaction pipeline even though the regex
  // excludes anything the redactors would match. Cheap; future-proofs against
  // accidental regex widening when semver / tagged releases ship.
  const scrubbed = scrubAllCapsServer(scrubSensitiveServer(rawRelease));
  if (!OPS_ERROR_RELEASE_REGEX.test(scrubbed)) {
    throw new BadRequestError('Error event release is not a SHA-shaped hex string (6-40 lowercase hex).', {
      code: 'validation_failed',
      field: 'release',
      expected: OPS_ERROR_RELEASE_REGEX.source,
    });
  }
  return scrubbed;
}

function serverRedactClientEvent(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const errorKindRaw = typeof source.errorKind === 'string' && source.errorKind
    ? source.errorKind
    : 'Error';
  const errorKind = errorKindRaw.slice(0, OPS_ERROR_KIND_MAX_CHARS);

  const messageRaw = typeof source.messageFirstLine === 'string'
    ? source.messageFirstLine
    : (typeof source.message === 'string' ? source.message : '');
  const messageFirstLine = scrubAllCapsServer(
    scrubSensitiveServer(firstLineServer(messageRaw).slice(0, OPS_ERROR_MESSAGE_MAX_CHARS)),
  );

  const firstFrameRaw = typeof source.firstFrame === 'string'
    ? source.firstFrame
    : (typeof source.stack === 'string' ? source.stack : '');
  // U6 review follow-up (Finding 1): apply the all-caps scrub to the
  // first-frame too. Stack frames like `at PRINCIPAL_HANDLER (x.js:1)`
  // previously reached the DB unredacted because only messageFirstLine
  // ran the 4+ letter all-caps rule. Parity with the client-side fix.
  const firstFrame = scrubAllCapsServer(
    scrubSensitiveServer(firstLineServer(firstFrameRaw).slice(0, OPS_ERROR_FIRST_FRAME_MAX_CHARS)),
  );

  const routeName = normaliseRouteNameServer(source.routeName);

  const userAgentRaw = typeof source.userAgent === 'string' ? source.userAgent : '';
  const userAgent = userAgentRaw.slice(0, OPS_ERROR_USER_AGENT_MAX_CHARS);

  // U16: validate + normalise the release field. Throws BadRequestError on
  // non-hex / oversized input so the public ingest route maps it to 400
  // `validation_failed`. Missing / null release is accepted and returned as
  // null so fresh-INSERT writes NULL (which the U17 auto-reopen rule reads
  // as "skip reopen on this event").
  const release = validateOpsErrorRelease(source.release);

  return {
    errorKind,
    messageFirstLine,
    firstFrame,
    routeName,
    userAgent,
    release,
  };
}

async function sha256HexOpsError(text) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(String(text || ''));
  if (!globalThis.crypto?.subtle?.digest) {
    // Extremely unusual runtime — fall back to a deterministic low-quality hash
    // so the fingerprint column never goes NULL. The (error_kind, message,
    // frame) tuple is still the authoritative dedup key per R24, so this is a
    // degradation only for the UNIQUE index cache.
    let hash = 0;
    for (let i = 0; i < bytes.length; i += 1) {
      hash = ((hash << 5) - hash + bytes[i]) | 0;
    }
    return `legacy_${(hash >>> 0).toString(16)}`;
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const bytesOut = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytesOut.length; i += 1) {
    hex += bytesOut[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function generateOpsErrorEventId(nowTs) {
  const random = globalThis.crypto?.randomUUID?.();
  if (typeof random === 'string' && random) return `ops-error-${random}`;
  // Fallback for runtimes without crypto.randomUUID (older mocks).
  const stamp = Number.isFinite(Number(nowTs)) ? Number(nowTs) : Date.now();
  const entropy = Math.random().toString(36).slice(2, 10);
  return `ops-error-${stamp.toString(36)}-${entropy}`;
}

function generateOccurrenceId(nowTs) {
  const random = globalThis.crypto?.randomUUID?.();
  if (typeof random === 'string' && random) return `occ-${random}`;
  const stamp = Number.isFinite(Number(nowTs)) ? Number(nowTs) : Date.now();
  const entropy = Math.random().toString(36).slice(2, 10);
  return `occ-${stamp.toString(36)}-${entropy}`;
}

// U5 (P3): ring-buffer cap for per-fingerprint occurrence rows.
const OPS_ERROR_OCCURRENCE_RING_LIMIT = 20;

// U5 (P3): insert an occurrence row and prune to the ring-buffer cap.
// Runs as a batch so both the INSERT and the DELETE commit atomically.
// Tolerates missing table (pre-migration deploy) — silently no-ops.
async function insertOccurrenceRow(db, {
  eventId,
  occurredAt,
  release = null,
  routeName = null,
  accountId = null,
  userAgent = null,
} = {}) {
  const occId = generateOccurrenceId(occurredAt);
  try {
    await batch(db, [
      bindStatement(db, `
        INSERT INTO ops_error_event_occurrences (id, event_id, occurred_at, release, route_name, account_id, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [occId, eventId, occurredAt, release, routeName, accountId, userAgent]),
      bindStatement(db, `
        DELETE FROM ops_error_event_occurrences
        WHERE event_id = ?
          AND id NOT IN (
            SELECT id FROM ops_error_event_occurrences
            WHERE event_id = ?
            ORDER BY occurred_at DESC
            LIMIT ?
          )
      `, [eventId, eventId, OPS_ERROR_OCCURRENCE_RING_LIMIT]),
    ]);
  } catch (error) {
    // Tolerate missing table — occurrence tracking is additive and must
    // never break error ingest on a pre-migration deploy.
    if (isMissingTableError(error, 'ops_error_event_occurrences')) return;
    throw error;
  }
}

// U5 (P3): read the occurrence timeline for a given event. Returns
// latest-first ordering, capped at `limit` rows (default 20).
async function readErrorEventOccurrences(db, {
  actorAccountId,
  eventId,
  limit = OPS_ERROR_OCCURRENCE_RING_LIMIT,
} = {}) {
  const actor = await assertAdminHubActor(db, actorAccountId);
  const actorPlatformRole = normalisePlatformRole(actor?.platform_role);
  const isAdmin = actorPlatformRole === 'admin';
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || OPS_ERROR_OCCURRENCE_RING_LIMIT));

  if (typeof eventId !== 'string' || !eventId) {
    return { occurrences: [] };
  }

  try {
    const rows = await all(db, `
      SELECT id, event_id, occurred_at, release, route_name, account_id, user_agent
      FROM ops_error_event_occurrences
      WHERE event_id = ?
      ORDER BY occurred_at DESC
      LIMIT ?
    `, [eventId, safeLimit]);

    return {
      occurrences: rows.map((row) => ({
        id: typeof row?.id === 'string' ? row.id : '',
        eventId: typeof row?.event_id === 'string' ? row.event_id : '',
        occurredAt: Number(row?.occurred_at) || 0,
        release: typeof row?.release === 'string' && row.release ? row.release : null,
        routeName: typeof row?.route_name === 'string' ? row.route_name : null,
        // R25-consistent: admin sees account attribution, ops sees null.
        accountId: isAdmin && row?.account_id ? maskAccountIdLastN(row.account_id) : null,
        userAgent: typeof row?.user_agent === 'string' ? row.user_agent : null,
      })),
    };
  } catch (error) {
    if (isMissingTableError(error, 'ops_error_event_occurrences')) {
      return { occurrences: [] };
    }
    throw error;
  }
}

// H2 (reviewer) — preflight dedup probe.
//
// `recordClientErrorEvent` performs the authoritative R24 3-tuple dedup
// INSIDE the write transaction. The public ingest route needs the same
// answer *before* the write so it can consume the fresh-insert bucket
// only when the row would genuinely be new. Without this preflight,
// `recordClientErrorEvent` writes first, returns `deduped: false` for
// the 11th fresh fingerprint, and the route rolls back the bucket too
// late — the row has already been persisted.
//
// This helper runs the identical redaction + tuple SELECT that
// `recordClientErrorEvent` runs, so the "would be a dedup?" answer
// here and the final write decision agree. The SELECT is read-only,
// so calling it on every ingest is cheap (one indexed probe).
//
// Returns `{ wouldBeDedup: boolean, unavailable: boolean }`. Validation
// failures mirror `recordClientErrorEvent` so the ingest route can
// short-circuit consistently.
async function isClientErrorFingerprintKnown(db, { clientEvent } = {}) {
  const redacted = serverRedactClientEvent(clientEvent);
  if (!redacted.errorKind || !redacted.messageFirstLine) {
    throw new BadRequestError('Error event is missing errorKind or messageFirstLine.', {
      code: 'validation_failed',
      field: !redacted.errorKind ? 'errorKind' : 'messageFirstLine',
    });
  }
  try {
    const existing = await first(db, `
      SELECT id
      FROM ops_error_events
      WHERE error_kind = ?
        AND message_first_line = ?
        AND first_frame = ?
      ORDER BY first_seen ASC, id ASC
      LIMIT 1
    `, [redacted.errorKind, redacted.messageFirstLine, redacted.firstFrame || '']);
    return { wouldBeDedup: Boolean(existing?.id), unavailable: false };
  } catch (error) {
    if (isMissingTableError(error, 'ops_error_events')) {
      return { wouldBeDedup: false, unavailable: true };
    }
    throw error;
  }
}

async function recordClientErrorEvent(db, { clientEvent, sessionAccountId = null, nowTs } = {}) {
  const ts = Number.isFinite(Number(nowTs)) ? Number(nowTs) : Date.now();
  const redacted = serverRedactClientEvent(clientEvent);

  // Basic shape validation — empty errorKind / messageFirstLine after redaction
  // points to a malformed client call. Keep the error code stable for tests.
  if (!redacted.errorKind || !redacted.messageFirstLine) {
    throw new BadRequestError('Error event is missing errorKind or messageFirstLine.', {
      code: 'validation_failed',
      field: !redacted.errorKind ? 'errorKind' : 'messageFirstLine',
    });
  }

  const fingerprintSource = `${redacted.errorKind}|${redacted.messageFirstLine}|${redacted.firstFrame || ''}`;
  const fingerprint = await sha256HexOpsError(fingerprintSource);
  const attributedAccountId = typeof sessionAccountId === 'string' && sessionAccountId
    ? sessionAccountId
    : null;

  try {
    // R24: dedup authoritative key is the (errorKind, messageFirstLine,
    // firstFrame) tuple. Fingerprint is a UNIQUE index cache only.
    //
    // U17 extends the SELECT to pull `resolved_in_release` and
    // `last_status_change_at` so the auto-reopen rule can evaluate the
    // 5-condition check inline without a second round-trip.
    const existing = await first(db, `
      SELECT id, fingerprint, first_seen, occurrence_count, status,
             resolved_in_release, last_status_change_at
      FROM ops_error_events
      WHERE error_kind = ?
        AND message_first_line = ?
        AND first_frame = ?
      ORDER BY first_seen ASC, id ASC
      LIMIT 1
    `, [redacted.errorKind, redacted.messageFirstLine, redacted.firstFrame || '']);

    if (existing && typeof existing.id === 'string' && existing.id) {
      // Dedup hit — UPDATE last_seen and bump occurrence_count. Do NOT
      // touch admin_kpi_metrics.ops_error_events.status.open (R22): that
      // counter tracks fresh inserts, not replay-induced bumps.
      //
      // U16: always overwrite `last_seen_release` (even with NULL — a null
      // release legitimately means "this event came from a dirty-tree build
      // or pre-injection client"). `first_seen_release` is preserved: it
      // records the release that FIRST surfaced this fingerprint and is
      // never rewritten on dedup.
      const storedReleaseValue = redacted.release || null;

      // U17: evaluate the 5-condition auto-reopen rule before committing
      // the dedup UPDATE. ALL five must hold for reopen to fire:
      //   1. stored status === 'resolved' (ignored / open / investigating
      //      never auto-reopen — `ignored` is terminal-until-manual and
      //      `open` / `investigating` have no resolution to undo).
      //   2. stored resolved_in_release IS NOT NULL — a legacy resolve
      //      without a release stamp opts out of auto-reopen.
      //   3. incoming release IS NOT NULL and SHA-shaped per the U16
      //      regex. `redacted.release` is already validated by
      //      serverRedactClientEvent at the top of recordClientErrorEvent,
      //      so we only need to assert not-null here.
      //   4. incoming release !== stored resolved_in_release — same-
      //      release recurrence does NOT reopen (prevents churn inside a
      //      release window).
      //   5. now - last_status_change_at > 24h — 24h cooldown. If the
      //      row was resolved or reopened less than 24h ago, skip the
      //      reopen and let the dedup path commit normally.
      const storedStatus = typeof existing.status === 'string' ? existing.status : 'open';
      const storedResolvedInRelease = typeof existing.resolved_in_release === 'string'
        && existing.resolved_in_release
        ? existing.resolved_in_release
        : null;
      const storedLastStatusChangeAt = Number.isFinite(Number(existing.last_status_change_at))
        ? Number(existing.last_status_change_at)
        : null;
      const autoReopenEligible = storedStatus === 'resolved'
        && storedResolvedInRelease !== null
        && storedReleaseValue !== null
        && storedReleaseValue !== storedResolvedInRelease
        && storedLastStatusChangeAt !== null
        && (ts - storedLastStatusChangeAt) > OPS_ERROR_AUTO_REOPEN_COOLDOWN_MS;

      if (autoReopenEligible) {
        // R21 batch atomicity: the status flip, last_seen / occurrence
        // update, and status-counter swap commit together so a crash
        // between them cannot leave the row's status and the counters
        // out of sync.
        //
        // Note per U17 plan: we deliberately do NOT emit a mutation
        // receipt. Auto-reopen is triggered by an anonymous public
        // client event — there is no authenticated actor to scope a
        // receipt to. The reconciliation job (U10) covers the counter
        // drift if anything diverges here.
        //
        // `resolved_in_release` is preserved — it records which release
        // previously resolved this fingerprint, and the next auto-reopen
        // (condition 4) measures against the same column. The forensic
        // history "resolved in X but regressed at Y" stays intact.
        //
        // Phase E adv-e-3: emit a structured Workers log BEFORE the
        // batch commits so every auto-reopen transition is observable
        // from the wrangler tail regardless of whether the CAS guard
        // below ultimately wins the race. A post-commit log would miss
        // the "admin manually flipped concurrently" case because we
        // fall through to the dedup path without re-entering this
        // block.
        try {
          // eslint-disable-next-line no-console
          console.log(JSON.stringify({
            event: 'ops_error_event.auto_reopened',
            fingerprint: typeof existing.fingerprint === 'string' && existing.fingerprint
              ? existing.fingerprint
              : fingerprint,
            eventId: existing.id,
            fromRelease: storedResolvedInRelease,
            toRelease: storedReleaseValue,
            cooldownMs: ts - storedLastStatusChangeAt,
          }));
        } catch {
          // Structured logs are best-effort — never fail the ingest.
        }

        // Phase E adv-e-1: CAS-guarded UPDATE. The status='resolved'
        // predicate in the WHERE clause prevents a double counter-swap
        // when a concurrent admin status change (e.g. admin flipped the
        // row to 'ignored' via /api/admin/ops/error-events/:id/status)
        // lands between our SELECT and our batch. Under concurrency:
        //   - Admin wins → our UPDATE matches zero rows (CAS fail)
        //     → we inspect `meta.changes`, fall through to the normal
        //     dedup UPDATE which bumps last_seen + occurrence_count
        //     + last_seen_release only, leaving status / counters
        //     consistent with the admin's chosen bucket.
        //   - Auto-reopen wins → CAS matches one row, counters swap
        //     correctly. The admin's status change either lost the
        //     race (their subsequent request lands later) or never
        //     fired.
        // The batch result is an array of D1 statement results — the
        // first entry is the UPDATE; `meta.changes` is 1 on match and
        // 0 on CAS fail.
        const autoReopenBatch = await batch(db, [
          bindStatement(db, `
            UPDATE ops_error_events
            SET last_seen = ?,
                occurrence_count = occurrence_count + 1,
                last_seen_release = ?,
                status = 'open',
                last_status_change_at = ?
            WHERE id = ? AND status = 'resolved'
          `, [ts, storedReleaseValue, ts, existing.id]),
          bumpAdminKpiMetricStatement(db, `${KPI_ERROR_STATUS_METRIC_PREFIX}resolved`, ts, -1),
          bumpAdminKpiMetricStatement(db, `${KPI_ERROR_STATUS_METRIC_PREFIX}open`, ts, 1),
        ]);
        const autoReopenChanges = Number(autoReopenBatch?.[0]?.meta?.changes) || 0;
        if (autoReopenChanges === 1) {
          // U5 (P3): record occurrence row for auto-reopen event.
          await insertOccurrenceRow(db, {
            eventId: existing.id,
            occurredAt: ts,
            release: storedReleaseValue,
            routeName: redacted.routeName || null,
            accountId: attributedAccountId,
            userAgent: redacted.userAgent || null,
          });
          return {
            eventId: existing.id,
            deduped: true,
            unavailable: false,
            autoReopened: true,
          };
        }
        // CAS failed (admin or another worker beat us). The batch above
        // still committed the counter swap against the transitional
        // state — but because D1 does not support statement-level
        // rollback inside `batch()`, we accept the counter swap drift
        // and let reconcileAdminKpiMetrics (U10) correct it. The net
        // divergence is bounded: resolved -1 / open +1 on a row that
        // actually landed in (e.g.) 'ignored'. The reconcile job
        // re-derives every status counter from SELECT COUNT(*)
        // GROUP BY status, so drift is capped at one reconcile window.
        //
        // Defensive: also apply the non-auto-reopen dedup UPDATE so
        // `last_seen` / `occurrence_count` / `last_seen_release`
        // advance for this replay. The admin's chosen status (or
        // whatever the concurrent writer set) is untouched because the
        // dedup UPDATE only writes those three columns.
        await run(db, `
          UPDATE ops_error_events
          SET last_seen = ?,
              occurrence_count = occurrence_count + 1,
              last_seen_release = ?
          WHERE id = ?
        `, [ts, storedReleaseValue, existing.id]);
        // U5 (P3): record occurrence row for CAS-fail dedup path.
        await insertOccurrenceRow(db, {
          eventId: existing.id,
          occurredAt: ts,
          release: storedReleaseValue,
          routeName: redacted.routeName || null,
          accountId: attributedAccountId,
          userAgent: redacted.userAgent || null,
        });
        return {
          eventId: existing.id,
          deduped: true,
          unavailable: false,
          // autoReopened is FALSE when the CAS loses — the admin's
          // concurrent change wins semantically. The route should NOT
          // treat this replay as an auto-reopen for rate-limit
          // purposes.
          autoReopened: false,
        };
      }

      await run(db, `
        UPDATE ops_error_events
        SET last_seen = ?,
            occurrence_count = occurrence_count + 1,
            last_seen_release = ?
        WHERE id = ?
      `, [ts, storedReleaseValue, existing.id]);
      // U5 (P3): record occurrence row for normal dedup hit.
      await insertOccurrenceRow(db, {
        eventId: existing.id,
        occurredAt: ts,
        release: storedReleaseValue,
        routeName: redacted.routeName || null,
        accountId: attributedAccountId,
        userAgent: redacted.userAgent || null,
      });
      return {
        eventId: existing.id,
        deduped: true,
        unavailable: false,
      };
    }

    // Fresh insert path. U6 review follow-up (Finding 5): split the INSERT
    // from the `.status.open` counter bump so that a concurrent Worker
    // invocation that lost the INSERT race does NOT also fire the counter
    // bump. The previous implementation batched the INSERT and the bump
    // together; when two invocations both reached this branch before either
    // committed, the first INSERT succeeded + bumped, and the second's
    // `INSERT ... ON CONFLICT DO NOTHING` silently no-opped — but its
    // batched counter-bump statement fired unconditionally, drifting the
    // counter +2 for a single row.
    //
    // Trade-off: R21 (single-batch atomicity) is relaxed for this specific
    // insert. A rare tail window exists between the INSERT commit and the
    // counter bump where a crash could leave the row without the
    // .status.open increment. That one-missing-bump drift is strictly
    // better than one-extra-bump-per-race drift, which compounds under
    // sustained concurrent reports of the same error. The dedup UPDATE
    // path (the common case) is untouched and still commits atomically.
    const eventId = generateOpsErrorEventId(ts);
    // U16: stamp both `first_seen_release` and `last_seen_release` with the
    // incoming release on a fresh insert. NULL is a valid value (dirty-tree
    // build, pre-injection client) — U17's auto-reopen rule reads NULL on
    // `resolved_in_release` as "never auto-reopen", which is the documented
    // opt-out. Writing both columns together keeps the invariant "fresh row
    // has first_seen_release == last_seen_release".
    const freshReleaseValue = redacted.release || null;
    const insertResult = await run(db, `
      INSERT INTO ops_error_events (
        id,
        fingerprint,
        error_kind,
        message_first_line,
        first_frame,
        route_name,
        user_agent,
        account_id,
        first_seen,
        last_seen,
        occurrence_count,
        status,
        first_seen_release,
        last_seen_release
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'open', ?, ?)
      ON CONFLICT(fingerprint) DO NOTHING
    `, [
      eventId,
      fingerprint,
      redacted.errorKind,
      redacted.messageFirstLine,
      redacted.firstFrame || '',
      redacted.routeName || '',
      redacted.userAgent || '',
      attributedAccountId,
      ts,
      ts,
      freshReleaseValue,
      freshReleaseValue,
    ]);
    const insertChanges = Number(insertResult?.meta?.changes) || 0;

    if (insertChanges === 1) {
      // Row is genuinely fresh — bump the status.open counter. Running
      // the prepared statement directly (rather than wrapping in a new
      // batch) keeps the non-atomic window between INSERT and bump as
      // small as possible.
      await bumpAdminKpiMetricStatement(db, `${KPI_ERROR_STATUS_METRIC_PREFIX}open`, ts, 1).run();
      // U5 (P3): record the first occurrence row for this fresh fingerprint.
      await insertOccurrenceRow(db, {
        eventId,
        occurredAt: ts,
        release: freshReleaseValue,
        routeName: redacted.routeName || null,
        accountId: attributedAccountId,
        userAgent: redacted.userAgent || null,
      });
      return {
        eventId,
        deduped: false,
        unavailable: false,
      };
    }

    // Lost the race to a concurrent insert of the same fingerprint (or a
    // pathological SHA-256 collision). Fall through to the dedup UPDATE
    // path on the winning row — bump occurrence_count + last_seen, skip
    // the counter bump. Preserves R24 tuple-authoritative dedup semantics
    // because the winning row has the identical (errorKind, messageFirstLine,
    // firstFrame) tuple (by construction: the fingerprint derives from the
    // same three fields, and the ON CONFLICT key is the fingerprint UNIQUE
    // index).
    const winner = await first(db, `
      SELECT id, first_seen, occurrence_count, status
      FROM ops_error_events
      WHERE error_kind = ?
        AND message_first_line = ?
        AND first_frame = ?
      ORDER BY first_seen ASC, id ASC
      LIMIT 1
    `, [redacted.errorKind, redacted.messageFirstLine, redacted.firstFrame || '']);

    if (winner && typeof winner.id === 'string' && winner.id) {
      // U16: race-loser path mirrors the dedup UPDATE — overwrite
      // `last_seen_release` with the incoming (possibly-null) release so
      // the column tracks the most recent observation, even when two
      // concurrent workers raced the same fingerprint.
      await run(db, `
        UPDATE ops_error_events
        SET last_seen = ?,
            occurrence_count = occurrence_count + 1,
            last_seen_release = ?
        WHERE id = ?
      `, [ts, redacted.release || null, winner.id]);
      // U5 (P3): record occurrence row for race-loser dedup path.
      await insertOccurrenceRow(db, {
        eventId: winner.id,
        occurredAt: ts,
        release: redacted.release || null,
        routeName: redacted.routeName || null,
        accountId: attributedAccountId,
        userAgent: redacted.userAgent || null,
      });
      return {
        eventId: winner.id,
        deduped: true,
        unavailable: false,
      };
    }

    // Extreme edge case: insert no-opped but no row satisfies the tuple
    // lookup (possible only under SHA-256 fingerprint collision with a
    // different tuple). Surface the degradation so the route returns 200
    // without drift; admins lose visibility of this report, which is the
    // safer failure mode than double-counting.
    return {
      eventId: null,
      deduped: false,
      unavailable: false,
    };
  } catch (error) {
    if (isMissingTableError(error, 'ops_error_events') || isMissingTableError(error, 'admin_kpi_metrics')) {
      return {
        eventId: null,
        deduped: false,
        unavailable: true,
      };
    }
    throw error;
  }
}

// The merged config envelope today lives at the top level of `draft_json`
// (and `published_json` / `versions.config_json`): visual fields stay at
// the root, the effect sub-document hangs off `effect`. Existing visual-only
// rows continue to load — readers tolerate `effect == null` and surface the
// bundled defaults.
async function seededMonsterVisualConfig({ source = 'published', version = 1 } = {}) {
  const { BUNDLED_MONSTER_VISUAL_CONFIG, bundledEffectConfig } = await loadMonsterVisualModules();
  return {
    ...cloneSerialisable(BUNDLED_MONSTER_VISUAL_CONFIG),
    schemaVersion: MONSTER_VISUAL_SCHEMA_VERSION,
    manifestHash: MONSTER_ASSET_MANIFEST_HASH,
    source,
    version,
    effect: bundledEffectConfig(),
  };
}

async function normaliseMonsterVisualDraft(rawDraft) {
  if (!isPlainObject(rawDraft)) {
    throw new BadRequestError('Monster visual draft is required.', {
      code: 'monster_visual_draft_required',
    });
  }
  // Thread `effect` through verbatim: the strict-publish validator runs
  // server-side at publish time, so we don't gate save behind it. We DO
  // backfill bundled defaults when the client omits effect, so first-time
  // migrations (visual-only callers in existing tests) keep functioning.
  const cloned = cloneSerialisable(rawDraft);
  const { bundledEffectConfig } = await loadMonsterVisualModules();
  return {
    ...cloned,
    schemaVersion: Number(rawDraft.schemaVersion) || MONSTER_VISUAL_SCHEMA_VERSION,
    manifestHash: rawDraft.manifestHash || MONSTER_ASSET_MANIFEST_HASH,
    source: 'draft',
    effect: isPlainObject(cloned.effect) ? cloned.effect : bundledEffectConfig(),
  };
}

function normaliseMonsterVisualMutation(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const requestId = typeof raw.requestId === 'string' && raw.requestId ? raw.requestId : null;
  const correlationId = typeof raw.correlationId === 'string' && raw.correlationId
    ? raw.correlationId
    : requestId;
  const expectedRevision = Number.isFinite(Number(raw.expectedDraftRevision))
    ? Number(raw.expectedDraftRevision)
    : null;

  if (!requestId) {
    throw new BadRequestError('Monster visual mutation requestId is required.', {
      code: 'mutation_request_id_required',
      scopeType: MONSTER_VISUAL_SCOPE_TYPE,
    });
  }
  if (expectedRevision == null) {
    throw new BadRequestError('Monster visual mutation expectedDraftRevision is required.', {
      code: 'mutation_revision_required',
      scopeType: MONSTER_VISUAL_SCOPE_TYPE,
    });
  }

  return {
    requestId,
    correlationId,
    expectedRevision,
  };
}

async function ensureMonsterVisualConfigRow(db, nowTs) {
  const existing = await first(db, `
    SELECT *
    FROM platform_monster_visual_config
    WHERE id = ?
  `, [MONSTER_VISUAL_CONFIG_ID]);
  if (existing) return existing;

  const initialConfig = await seededMonsterVisualConfig({ source: 'published', version: 1 });
  const json = JSON.stringify(initialConfig);
  await run(db, `
    INSERT OR IGNORE INTO platform_monster_visual_config (
      id,
      draft_json,
      draft_revision,
      draft_updated_at,
      draft_updated_by_account_id,
      published_json,
      published_version,
      published_at,
      published_by_account_id,
      manifest_hash,
      schema_version
    )
    VALUES (?, ?, 0, ?, ?, ?, 1, ?, ?, ?, ?)
  `, [
    MONSTER_VISUAL_CONFIG_ID,
    JSON.stringify({ ...initialConfig, source: 'draft' }),
    nowTs,
    'system',
    json,
    nowTs,
    'system',
    MONSTER_ASSET_MANIFEST_HASH,
    MONSTER_VISUAL_SCHEMA_VERSION,
  ]);
  await run(db, `
    INSERT OR IGNORE INTO platform_monster_visual_config_versions (
      version,
      config_json,
      manifest_hash,
      schema_version,
      published_at,
      published_by_account_id
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    1,
    json,
    MONSTER_ASSET_MANIFEST_HASH,
    MONSTER_VISUAL_SCHEMA_VERSION,
    nowTs,
    'system',
  ]);
  return first(db, `
    SELECT *
    FROM platform_monster_visual_config
    WHERE id = ?
  `, [MONSTER_VISUAL_CONFIG_ID]);
}

async function readMonsterVisualConfigRow(db) {
  return first(db, `
    SELECT *
    FROM platform_monster_visual_config
    WHERE id = ?
  `, [MONSTER_VISUAL_CONFIG_ID]);
}

async function requireMonsterVisualConfigUpdateApplied(db, result, {
  kind,
  mutation,
  expectedRevision,
}) {
  const updateChanges = Number(result?.meta?.changes) || 0;
  if (updateChanges === 1) return;

  const row = await readMonsterVisualConfigRow(db);
  throw staleWriteError({
    kind,
    scopeType: MONSTER_VISUAL_SCOPE_TYPE,
    scopeId: MONSTER_VISUAL_SCOPE_ID,
    requestId: mutation.requestId,
    correlationId: mutation.correlationId,
    expectedRevision,
    currentRevision: Number(row?.draft_revision) || 0,
  });
}

function requireMonsterVisualMutationReceiptStored(result, {
  kind,
  mutation,
}) {
  const receiptChanges = Number(result?.meta?.changes) || 0;
  if (receiptChanges === 1) return;

  throw new ConflictError('Mutation receipt was not stored. Retry the mutation after reloading the latest state.', {
    code: 'mutation_receipt_not_stored',
    retryable: true,
    kind,
    scopeType: MONSTER_VISUAL_SCOPE_TYPE,
    scopeId: MONSTER_VISUAL_SCOPE_ID,
    requestId: mutation.requestId,
    correlationId: mutation.correlationId,
  });
}

async function listMonsterVisualVersionRows(db) {
  return all(db, `
    SELECT version, manifest_hash, schema_version, published_at, published_by_account_id
    FROM platform_monster_visual_config_versions
    ORDER BY version DESC
    LIMIT 20
  `);
}

async function monsterVisualConfigStateFromRow(row, versions = []) {
  const [draftFallback, publishedFallback, { validatePublishedConfigForPublish }] = await Promise.all([
    seededMonsterVisualConfig({ source: 'draft', version: Number(row?.published_version) || 1 }),
    seededMonsterVisualConfig({ source: 'published', version: Number(row?.published_version) || 1 }),
    loadMonsterVisualModules(),
  ]);
  const draft = safeJsonParse(row?.draft_json, draftFallback);
  const published = safeJsonParse(row?.published_json, publishedFallback);
  // Strict combined gate so the admin UI surfaces visual + effect blockers
  // in the same feedback list. Existing visual-only rows still validate
  // (effect bundled defaults are reviewed); the bundled draft fails as
  // before due to unreviewed visual assets.
  const visualForCheck = isPlainObject(draft) ? { ...cloneSerialisable(draft) } : null;
  const effectForCheck = visualForCheck ? visualForCheck.effect : null;
  if (visualForCheck) delete visualForCheck.effect;
  const validation = validatePublishedConfigForPublish({
    visual: visualForCheck,
    effect: effectForCheck,
  });
  return {
    status: {
      schemaVersion: MONSTER_VISUAL_SCHEMA_VERSION,
      manifestHash: MONSTER_ASSET_MANIFEST_HASH,
      draftRevision: Number(row?.draft_revision) || 0,
      draftUpdatedAt: Number(row?.draft_updated_at) || 0,
      draftUpdatedByAccountId: row?.draft_updated_by_account_id || '',
      publishedVersion: Number(row?.published_version) || 1,
      publishedAt: Number(row?.published_at) || 0,
      publishedByAccountId: row?.published_by_account_id || '',
      validation: {
        ok: validation.ok,
        errorCount: validation.errors.length,
        warningCount: validation.warnings.length,
        errors: validation.errors.slice(0, 50),
        warnings: validation.warnings.slice(0, 50),
      },
    },
    draft,
    published,
    versions: (Array.isArray(versions) ? versions : []).map((version) => ({
      version: Number(version.version) || 0,
      manifestHash: version.manifest_hash || '',
      schemaVersion: Number(version.schema_version) || 0,
      publishedAt: Number(version.published_at) || 0,
      publishedByAccountId: version.published_by_account_id || '',
    })),
    mutation: {
      policyVersion: MUTATION_POLICY_VERSION,
      scopeType: MONSTER_VISUAL_SCOPE_TYPE,
      scopeId: MONSTER_VISUAL_SCOPE_ID,
      draftRevision: Number(row?.draft_revision) || 0,
    },
  };
}

async function readMonsterVisualConfigState(db, nowTs) {
  const row = await ensureMonsterVisualConfigRow(db, nowTs);
  const versions = await listMonsterVisualVersionRows(db);
  return monsterVisualConfigStateFromRow(row, versions);
}

async function bundledMonsterVisualRuntimeConfig() {
  const config = await seededMonsterVisualConfig({ source: 'bundled', version: 0 });
  return {
    schemaVersion: MONSTER_VISUAL_SCHEMA_VERSION,
    manifestHash: MONSTER_ASSET_MANIFEST_HASH,
    publishedVersion: 0,
    publishedAt: 0,
    config,
  };
}

async function readPublishedMonsterVisualRuntimeConfig(db, nowTs) {
  const row = await ensureMonsterVisualConfigRow(db, nowTs);
  const fallback = await seededMonsterVisualConfig({
    source: 'published',
    version: Number(row?.published_version) || 1,
  });
  const published = safeJsonParse(
    row?.published_json,
    fallback,
  );
  return {
    schemaVersion: MONSTER_VISUAL_SCHEMA_VERSION,
    manifestHash: row?.manifest_hash || published.manifestHash || MONSTER_ASSET_MANIFEST_HASH,
    publishedVersion: Number(row?.published_version) || Number(published.version) || 1,
    publishedAt: Number(row?.published_at) || 0,
    config: published,
  };
}

async function readBootstrapMonsterVisualRuntimeConfig(db, nowTs) {
  try {
    return await readPublishedMonsterVisualRuntimeConfig(db, nowTs);
  } catch (error) {
    logMutation('warn', 'monster_visual_config.bootstrap_fallback', {
      message: error?.message || 'Monster visual config storage unavailable.',
    });
    return bundledMonsterVisualRuntimeConfig();
  }
}

function cloneMonsterVisualConfigPointer(value) {
  return value && typeof value === 'object' ? { ...value } : value;
}

function monsterVisualConfigPointerCacheKey(db) {
  return db?.__rawDb || db;
}

function invalidateMonsterVisualConfigPointerCache(db) {
  const cacheKey = monsterVisualConfigPointerCacheKey(db);
  if (!cacheKey || (typeof cacheKey !== 'object' && typeof cacheKey !== 'function')) return;
  monsterVisualConfigPointerCache.delete(cacheKey);
}

// U7: compact pointer for the selected-learner-bounded envelope. Omits
// the ~450 KB bundled config; the client uses `publishedVersion` +
// `manifestHash` to decide whether its cached config is still current,
// and fetches the full config via its existing lazy path when not.
async function readMonsterVisualConfigPointerFromStorage(db) {
  try {
    const row = await first(db, `
      SELECT published_version, manifest_hash, published_at, schema_version
      FROM platform_monster_visual_config
      WHERE id = ?
    `, [MONSTER_VISUAL_CONFIG_ID]);
    return {
      schemaVersion: Number(row?.schema_version) || MONSTER_VISUAL_SCHEMA_VERSION,
      manifestHash: row?.manifest_hash || MONSTER_ASSET_MANIFEST_HASH,
      publishedVersion: Number(row?.published_version) || 0,
      publishedAt: Number(row?.published_at) || 0,
      // Marker so clients know this is the compact v2 pointer (no
      // `config` payload); their existing hydration logic falls back to
      // `/api/monster-visual-config` (or the cached bundle) when
      // `config` is absent.
      compact: true,
    };
  } catch (error) {
    if (isMissingTableError(error, 'platform_monster_visual_config')) {
      return {
        schemaVersion: MONSTER_VISUAL_SCHEMA_VERSION,
        manifestHash: MONSTER_ASSET_MANIFEST_HASH,
        publishedVersion: 0,
        publishedAt: 0,
        compact: true,
      };
    }
    throw error;
  }
}

async function readMonsterVisualConfigPointer(db, nowTs = Date.now()) {
  const cacheKey = monsterVisualConfigPointerCacheKey(db);
  const cache = cacheKey && (typeof cacheKey === 'object' || typeof cacheKey === 'function')
    ? monsterVisualConfigPointerCache.get(cacheKey)
    : null;
  if (cache?.value && Number(cache.expiresAt) > Number(nowTs)) {
    return cloneMonsterVisualConfigPointer(cache.value);
  }
  if (cache?.pending) {
    return cloneMonsterVisualConfigPointer(await cache.pending);
  }

  const pending = readMonsterVisualConfigPointerFromStorage(db)
    .then((value) => {
      if (cacheKey && (typeof cacheKey === 'object' || typeof cacheKey === 'function')) {
        const current = monsterVisualConfigPointerCache.get(cacheKey);
        if (current?.pending === pending) {
          monsterVisualConfigPointerCache.set(cacheKey, {
            value: cloneMonsterVisualConfigPointer(value),
            expiresAt: Date.now() + MONSTER_VISUAL_CONFIG_POINTER_CACHE_TTL_MS,
            pending: null,
          });
        }
      }
      return value;
    })
    .catch((error) => {
      if (cacheKey && (typeof cacheKey === 'object' || typeof cacheKey === 'function')) {
        const current = monsterVisualConfigPointerCache.get(cacheKey);
        if (current?.pending === pending) {
          monsterVisualConfigPointerCache.delete(cacheKey);
        }
      }
      throw error;
    });
  if (cacheKey && (typeof cacheKey === 'object' || typeof cacheKey === 'function')) {
    monsterVisualConfigPointerCache.set(cacheKey, {
      value: cache?.value || null,
      expiresAt: Number(cache?.expiresAt) || 0,
      pending,
    });
  }
  return cloneMonsterVisualConfigPointer(await pending);
}

function monsterVisualMutationMeta({ kind, mutation, expectedRevision, appliedRevision }) {
  return buildMutationMeta({
    kind,
    scopeType: MONSTER_VISUAL_SCOPE_TYPE,
    scopeId: MONSTER_VISUAL_SCOPE_ID,
    requestId: mutation.requestId,
    correlationId: mutation.correlationId,
    expectedRevision,
    appliedRevision,
  });
}

function normaliseMonsterVisualRestoreVersion(version) {
  const numeric = Number(version);
  if (!Number.isInteger(numeric) || numeric < 1) {
    throw new BadRequestError('Monster visual restore version must be a positive integer.', {
      code: 'monster_visual_version_invalid',
      version,
    });
  }
  return numeric;
}

async function withMonsterVisualConfigMutation(db, {
  actorAccountId,
  kind,
  payload,
  mutation,
  nowTs,
  apply,
}) {
  const nextMutation = normaliseMonsterVisualMutation(mutation);
  const requestHash = mutationPayloadHash(kind, payload);

  // NOTE: non-atomic by design — (a) branching on intermediate read results
  // (existingReceipt short-circuit, currentRevision CAS compare) plus (b) an
  // `apply()` callback that runs its own `batch()`. `withTransaction` was
  // removed in U12: on production D1 it was a silent no-op and hiding that
  // behind a wrapper would have been misleading. Atomicity for the final
  // commit lives inside `apply()`'s batch; pre-check races degrade to a
  // stale-write 409 or to the R21 CAS guard on the UPDATE.
  return (async () => {
    const actor = await first(db, 'SELECT id, platform_role, account_type FROM adult_accounts WHERE id = ?', [actorAccountId]);
    requireMonsterVisualConfigManager(actor);

    const existingReceipt = await loadMutationReceipt(db, actorAccountId, nextMutation.requestId);
    if (existingReceipt) {
      if (existingReceipt.request_hash !== requestHash) {
        throw idempotencyReuseError({
          kind,
          scopeType: MONSTER_VISUAL_SCOPE_TYPE,
          scopeId: MONSTER_VISUAL_SCOPE_ID,
          requestId: nextMutation.requestId,
          correlationId: nextMutation.correlationId,
        });
      }
      const storedReplay = safeJsonParse(existingReceipt.response_json, {});
      return {
        ...storedReplay,
        monsterVisualConfig: await readMonsterVisualConfigState(db, nowTs),
        monsterVisualMutation: {
          ...(storedReplay.monsterVisualMutation || {}),
          requestId: nextMutation.requestId,
          correlationId: nextMutation.correlationId,
          replayed: true,
        },
      };
    }

    const row = await ensureMonsterVisualConfigRow(db, nowTs);
    const currentRevision = Number(row?.draft_revision) || 0;
    if (currentRevision !== nextMutation.expectedRevision) {
      throw staleWriteError({
        kind,
        scopeType: MONSTER_VISUAL_SCOPE_TYPE,
        scopeId: MONSTER_VISUAL_SCOPE_ID,
        requestId: nextMutation.requestId,
        correlationId: nextMutation.correlationId,
        expectedRevision: nextMutation.expectedRevision,
        currentRevision,
      });
    }

    const appliedRevision = currentRevision + 1;
    const mutationMeta = monsterVisualMutationMeta({
      kind,
      mutation: nextMutation,
      expectedRevision: currentRevision,
      appliedRevision,
    });
    const receipt = {
      accountId: actorAccountId,
      requestId: nextMutation.requestId,
      scopeType: MONSTER_VISUAL_SCOPE_TYPE,
      scopeId: MONSTER_VISUAL_SCOPE_ID,
      mutationKind: kind,
      requestHash,
      response: {
        monsterVisualMutation: mutationMeta,
      },
      correlationId: nextMutation.correlationId,
      appliedAt: nowTs,
    };
    await apply({
      row,
      appliedRevision,
      mutation: nextMutation,
      expectedRevision: nextMutation.expectedRevision,
      kind,
      receipt,
    });
    const state = await readMonsterVisualConfigState(db, nowTs);
    const response = {
      monsterVisualConfig: state,
      monsterVisualMutation: mutationMeta,
    };
    return response;
  })();
}

async function saveMonsterVisualConfigDraft(db, actorAccountId, rawDraft, mutation, nowTs) {
  const draft = await normaliseMonsterVisualDraft(rawDraft);
  return withMonsterVisualConfigMutation(db, {
    actorAccountId,
    kind: 'monster_visual_config.draft.save',
    payload: { draft },
    mutation,
    nowTs,
    apply: async ({
      appliedRevision,
      mutation: nextMutation,
      expectedRevision,
      kind,
      receipt,
    }) => {
      const draftJson = JSON.stringify(draft);
      const [updateResult, receiptResult] = await batch(db, [
        bindStatement(db, `
        UPDATE platform_monster_visual_config
        SET draft_json = ?,
            draft_revision = ?,
            draft_updated_at = ?,
            draft_updated_by_account_id = ?,
            manifest_hash = ?,
            schema_version = ?,
            last_mutation_account_id = ?,
            last_mutation_request_id = ?,
            last_mutation_request_hash = ?,
            last_mutation_kind = ?
        WHERE id = ?
          AND draft_revision = ?
      `, [
          draftJson,
          appliedRevision,
          nowTs,
          actorAccountId,
          MONSTER_ASSET_MANIFEST_HASH,
          MONSTER_VISUAL_SCHEMA_VERSION,
          receipt.accountId,
          receipt.requestId,
          receipt.requestHash,
          receipt.mutationKind,
          MONSTER_VISUAL_CONFIG_ID,
          expectedRevision,
        ]),
        storeMutationReceiptStatement(db, receipt, {
          exists: {
            sql: `
              SELECT 1
              FROM platform_monster_visual_config
              WHERE id = ?
                AND draft_revision = ?
                AND draft_json = ?
                AND draft_updated_at = ?
                AND draft_updated_by_account_id = ?
                AND last_mutation_account_id = ?
                AND last_mutation_request_id = ?
                AND last_mutation_request_hash = ?
                AND last_mutation_kind = ?
            `,
            params: [
              MONSTER_VISUAL_CONFIG_ID,
              appliedRevision,
              draftJson,
              nowTs,
              actorAccountId,
              receipt.accountId,
              receipt.requestId,
              receipt.requestHash,
              receipt.mutationKind,
            ],
          },
        }),
      ]);
      await requireMonsterVisualConfigUpdateApplied(db, updateResult, {
        kind,
        mutation: nextMutation,
        expectedRevision,
      });
      requireMonsterVisualMutationReceiptStored(receiptResult, {
        kind,
        mutation: nextMutation,
      });
      invalidateMonsterVisualConfigPointerCache(db);
    },
  });
}

async function publishMonsterVisualConfig(db, actorAccountId, mutation, nowTs) {
  return withMonsterVisualConfigMutation(db, {
    actorAccountId,
    kind: 'monster_visual_config.publish',
    payload: { publish: true },
    mutation,
    nowTs,
    apply: async ({
      row,
      appliedRevision,
      mutation: nextMutation,
      expectedRevision,
      kind,
      receipt,
    }) => {
      const draft = safeJsonParse(row.draft_json, null);
      // Strict combined gate: visual + effect must both validate. The
      // permissive envelope tolerates a missing effect; publish does not.
      // Existing rows that pre-date the effect sub-document still validate
      // because `normaliseMonsterVisualDraft` and `seededMonsterVisualConfig`
      // now backfill the bundled defaults at save time.
      const visualForPublish = isPlainObject(draft) ? { ...cloneSerialisable(draft) } : null;
      const effectForPublish = visualForPublish ? visualForPublish.effect : null;
      if (visualForPublish) delete visualForPublish.effect;
      const { validatePublishedConfigForPublish } = await loadMonsterVisualModules();
      const validation = validatePublishedConfigForPublish({
        visual: visualForPublish,
        effect: effectForPublish,
      });
      if (!validation.ok) {
        throw new BadRequestError('Monster visual config is not ready to publish.', {
          code: 'monster_visual_publish_blocked',
          validation,
        });
      }
      const nextVersion = (Number(row.published_version) || 1) + 1;
      const published = {
        ...cloneSerialisable(draft),
        source: 'published',
        version: nextVersion,
      };
      const publishedJson = JSON.stringify(published);
      const draftJson = JSON.stringify({ ...published, source: 'draft' });
      const [updateResult, receiptResult] = await batch(db, [
        bindStatement(db, `
        UPDATE platform_monster_visual_config
        SET draft_json = ?,
            draft_revision = ?,
            draft_updated_at = ?,
            draft_updated_by_account_id = ?,
            published_json = ?,
            published_version = ?,
            published_at = ?,
            published_by_account_id = ?,
            manifest_hash = ?,
            schema_version = ?,
            last_mutation_account_id = ?,
            last_mutation_request_id = ?,
            last_mutation_request_hash = ?,
            last_mutation_kind = ?
        WHERE id = ?
          AND draft_revision = ?
          AND published_version = ?
      `, [
          draftJson,
          appliedRevision,
          nowTs,
          actorAccountId,
          publishedJson,
          nextVersion,
          nowTs,
          actorAccountId,
          MONSTER_ASSET_MANIFEST_HASH,
          MONSTER_VISUAL_SCHEMA_VERSION,
          receipt.accountId,
          receipt.requestId,
          receipt.requestHash,
          receipt.mutationKind,
          MONSTER_VISUAL_CONFIG_ID,
          expectedRevision,
          Number(row.published_version) || 1,
        ]),
        storeMutationReceiptStatement(db, receipt, {
          exists: {
            sql: `
              SELECT 1
              FROM platform_monster_visual_config
              WHERE id = ?
                AND draft_revision = ?
                AND draft_json = ?
                AND published_json = ?
                AND published_version = ?
                AND published_at = ?
                AND published_by_account_id = ?
                AND last_mutation_account_id = ?
                AND last_mutation_request_id = ?
                AND last_mutation_request_hash = ?
                AND last_mutation_kind = ?
            `,
            params: [
              MONSTER_VISUAL_CONFIG_ID,
              appliedRevision,
              draftJson,
              publishedJson,
              nextVersion,
              nowTs,
              actorAccountId,
              receipt.accountId,
              receipt.requestId,
              receipt.requestHash,
              receipt.mutationKind,
            ],
          },
        }),
      ]);
      await requireMonsterVisualConfigUpdateApplied(db, updateResult, {
        kind,
        mutation: nextMutation,
        expectedRevision,
      });
      requireMonsterVisualMutationReceiptStored(receiptResult, {
        kind,
        mutation: nextMutation,
      });
      invalidateMonsterVisualConfigPointerCache(db);
      await run(db, `
        DELETE FROM platform_monster_visual_config_versions
        WHERE version NOT IN (
          SELECT version
          FROM platform_monster_visual_config_versions
          ORDER BY version DESC
          LIMIT 20
        )
      `);
    },
  });
}

async function restoreMonsterVisualConfigVersion(db, actorAccountId, version, mutation, nowTs) {
  const safeVersion = normaliseMonsterVisualRestoreVersion(version);
  return withMonsterVisualConfigMutation(db, {
    actorAccountId,
    kind: 'monster_visual_config.restore',
    payload: { version: safeVersion },
    mutation,
    nowTs,
    apply: async ({
      appliedRevision,
      mutation: nextMutation,
      expectedRevision,
      kind,
      receipt,
    }) => {
      const versionRow = await first(db, `
        SELECT version, config_json
        FROM platform_monster_visual_config_versions
        WHERE version = ?
      `, [safeVersion]);
      if (!versionRow) {
        throw new NotFoundError('Monster visual config version was not found.', {
          code: 'monster_visual_version_not_found',
          version: safeVersion,
        });
      }
      const restoredFallback = await seededMonsterVisualConfig({ source: 'draft', version: safeVersion });
      const restored = {
        ...safeJsonParse(versionRow.config_json, restoredFallback),
        source: 'draft',
      };
      const restoredJson = JSON.stringify(restored);
      const [updateResult, receiptResult] = await batch(db, [
        bindStatement(db, `
        UPDATE platform_monster_visual_config
        SET draft_json = ?,
            draft_revision = ?,
            draft_updated_at = ?,
            draft_updated_by_account_id = ?,
            manifest_hash = ?,
            schema_version = ?,
            last_mutation_account_id = ?,
            last_mutation_request_id = ?,
            last_mutation_request_hash = ?,
            last_mutation_kind = ?
        WHERE id = ?
          AND draft_revision = ?
      `, [
          restoredJson,
          appliedRevision,
          nowTs,
          actorAccountId,
          MONSTER_ASSET_MANIFEST_HASH,
          MONSTER_VISUAL_SCHEMA_VERSION,
          receipt.accountId,
          receipt.requestId,
          receipt.requestHash,
          receipt.mutationKind,
          MONSTER_VISUAL_CONFIG_ID,
          expectedRevision,
        ]),
        storeMutationReceiptStatement(db, receipt, {
          exists: {
            sql: `
              SELECT 1
              FROM platform_monster_visual_config
              WHERE id = ?
                AND draft_revision = ?
                AND draft_json = ?
                AND draft_updated_at = ?
                AND draft_updated_by_account_id = ?
                AND last_mutation_account_id = ?
                AND last_mutation_request_id = ?
                AND last_mutation_request_hash = ?
                AND last_mutation_kind = ?
            `,
            params: [
              MONSTER_VISUAL_CONFIG_ID,
              appliedRevision,
              restoredJson,
              nowTs,
              actorAccountId,
              receipt.accountId,
              receipt.requestId,
              receipt.requestHash,
              receipt.mutationKind,
            ],
          },
        }),
      ]);
      await requireMonsterVisualConfigUpdateApplied(db, updateResult, {
        kind,
        mutation: nextMutation,
        expectedRevision,
      });
      requireMonsterVisualMutationReceiptStored(receiptResult, {
        kind,
        mutation: nextMutation,
      });
      invalidateMonsterVisualConfigPointerCache(db);
    },
  });
}

async function updateManagedAccountRole(db, {
  actorAccountId,
  targetAccountId,
  platformRole,
  expectedRepoRevision = null,
  requestId,
  correlationId = requestId,
  nowTs,
} = {}) {
  if (!(typeof targetAccountId === 'string' && targetAccountId)) {
    throw new BadRequestError('Target account id is required.', {
      code: 'target_account_required',
    });
  }
  if (!(typeof requestId === 'string' && requestId)) {
    throw new BadRequestError('Role mutation requestId is required.', {
      code: 'mutation_request_id_required',
      scopeType: 'account-role',
    });
  }

  const nextRole = normaliseRequestedPlatformRole(platformRole);
  const requestHash = mutationPayloadHash('admin.account_role.update', {
    targetAccountId,
    platformRole: nextRole,
    expectedRepoRevision: Number.isInteger(expectedRepoRevision) ? expectedRepoRevision : null,
  });

  // H3 (Phase C reviewer): this site was previously non-atomic — the
  // role-change UPDATE, the directory re-read, and the mutation-receipt
  // INSERT were three separate D1 calls. A failure between the UPDATE
  // and the receipt INSERT would leave the role committed with no audit
  // trail; withTransaction was a production no-op. Fix: compose the
  // UPDATE + receipt INSERT in a single `batch()` so they share D1's
  // atomic commit. The UPDATE's CAS guard combines:
  //   1) `repo_revision = ?` — stale client state rejects with 409
  //      `account_role_stale`.
  //   2) The existing last-admin subquery — surfaces 409
  //      `last_admin_required` when the demotion would empty the admin
  //      pool. When rowsAffected=0 we follow up with a SELECT to tell
  //      the two apart.
  const actor = await first(db, 'SELECT id, email, display_name, platform_role, repo_revision, account_type FROM adult_accounts WHERE id = ?', [actorAccountId]);
  requireAccountRoleManager(actor);

  const existingReceipt = await loadMutationReceipt(db, actorAccountId, requestId);
  if (existingReceipt) {
    if (existingReceipt.request_hash !== requestHash) {
      throw idempotencyReuseError({
        kind: 'admin.account_role.update',
        scopeType: 'account',
        scopeId: targetAccountId,
        requestId,
        correlationId,
      });
    }
    const storedReplay = safeJsonParse(existingReceipt.response_json, {});
    return {
      ...storedReplay,
      roleMutation: {
        ...(storedReplay.roleMutation || {}),
        requestId,
        correlationId,
        replayed: true,
      },
    };
  }

  const target = await first(db, 'SELECT * FROM adult_accounts WHERE id = ?', [targetAccountId]);
  if (!target) {
    throw new NotFoundError('Target account was not found.', {
      code: 'target_account_not_found',
      accountId: targetAccountId,
    });
  }
  if (accountType(target) === 'demo') {
    throw new ForbiddenError('Demo accounts cannot be managed from account role controls.', {
      code: 'demo_account_role_forbidden',
      accountId: targetAccountId,
    });
  }

  const currentRole = normalisePlatformRole(target.platform_role);
  const currentRepoRevision = Math.max(0, Number(target.repo_revision) || 0);
  const normalisedExpectedRepoRevision = Number.isInteger(expectedRepoRevision)
    ? expectedRepoRevision
    : currentRepoRevision;

  // Early CAS check so a 409 reports the right `current` pre-image without
  // needing to invert the UPDATE's rowsAffected signal.
  if (normalisedExpectedRepoRevision !== currentRepoRevision) {
    throw new ConflictError('Account has changed since it was last read. Re-read and retry.', {
      code: 'account_role_stale',
      retryable: true,
      accountId: targetAccountId,
      expected: normalisedExpectedRepoRevision,
      current: currentRepoRevision,
    });
  }

  const nextRepoRevision = currentRepoRevision + 1;

  // Compose the UPDATE statement. The WHERE clause combines repo_revision
  // CAS with the existing last-admin subquery so both invariants are
  // enforced in one SQL round-trip.
  // CONV-2 (Phase D reviewer) fix: the guard must also require
  // `COALESCE(m.ops_status, 'active') = 'active'` on the sibling admin
  // so a suspended-but-still-platform_role-admin account does NOT
  // count as 'the other active admin'. Without the JOIN, demoting
  // the only effectively-active admin would succeed whenever a
  // second admin row existed at any ops_status. The LEFT JOIN lets
  // accounts with no metadata row (legacy pre-0011 installs) still
  // count as active via COALESCE.
  const lastAdminGuard = (currentRole === 'admin' && nextRole !== 'admin')
    ? `AND EXISTS (
         SELECT 1
         FROM adult_accounts a
         LEFT JOIN account_ops_metadata m ON m.account_id = a.id
         WHERE a.platform_role = 'admin'
           AND COALESCE(a.account_type, 'real') <> 'demo'
           AND COALESCE(m.ops_status, 'active') = 'active'
           AND a.id <> ?
       )`
    : '';
  const lastAdminParams = (currentRole === 'admin' && nextRole !== 'admin') ? [targetAccountId] : [];

  // Build response eagerly (before the batch) so the mutation receipt captures
  // the intended effect. The directory re-read happens post-batch.
  const mutationMeta = {
    policyVersion: MUTATION_POLICY_VERSION,
    kind: 'admin.account_role.update',
    scopeType: 'account',
    scopeId: targetAccountId,
    requestId,
    correlationId,
    previousRole: currentRole,
    platformRole: nextRole,
    appliedAt: nowTs,
    replayed: false,
    expectedRepoRevision: normalisedExpectedRepoRevision,
    repoRevision: nextRepoRevision,
  };

  const updateSql = `
    UPDATE adult_accounts
    SET platform_role = ?,
        repo_revision = repo_revision + 1,
        updated_at = ?
    WHERE id = ?
      AND repo_revision = ?
      ${lastAdminGuard}
  `;
  const updateParams = [nextRole, nowTs, targetAccountId, currentRepoRevision, ...lastAdminParams];

  // Receipt body includes the directory shape we'll return post-commit.
  // For the forensic audit trail we store a `post` shape that matches the
  // actual mutation outcome.
  const receiptBody = {
    roleMutation: mutationMeta,
  };

  // B-RE-1 (re-review Blocker): guard the receipt INSERT on a
  // write-signature tuple `(platform_role, repo_revision, updated_at)`
  // that uniquely identifies THIS batch's UPDATE output. Guarding only
  // on `repo_revision = nextRepoRevision` would not suffice if two
  // writers pre-checking at the same pre-image both compute the same
  // `nextRepoRevision`: the race-winner's commit satisfies the loser's
  // EXISTS check. Adding `platform_role = nextRole AND updated_at = nowTs`
  // discriminates the loser (whose row was never touched). Without this
  // guard, both the stale-revision failure mode and the last-admin
  // failure mode would persist a receipt whose response describes a
  // commit that never happened (`batch()` atomicity fires on SQL errors,
  // not on zero-match UPDATEs).
  const receiptExists = {
    sql: `SELECT 1 FROM adult_accounts
          WHERE id = ?
            AND platform_role = ?
            AND repo_revision = ?
            AND updated_at = ?`,
    params: [targetAccountId, nextRole, nextRepoRevision, nowTs],
  };
  const batchResult = await batch(db, [
    bindStatement(db, updateSql, updateParams),
    storeMutationReceiptStatement(db, {
      accountId: actorAccountId,
      requestId,
      scopeType: 'account',
      scopeId: targetAccountId,
      mutationKind: 'admin.account_role.update',
      requestHash,
      response: receiptBody,
      correlationId,
      appliedAt: nowTs,
    }, { exists: receiptExists }),
  ]);
  const updateChanges = Math.max(0, Number(batchResult?.[0]?.meta?.changes) || 0);
  if (updateChanges !== 1) {
    // rowsAffected=0 can mean (a) stale repo_revision, or (b) last-admin
    // guard blocked the demotion. Distinguish via a follow-up SELECT so the
    // 409 body names the right failure mode. The receipt INSERT is
    // EXISTS-guarded on the post-bump `repo_revision` above, so on either
    // failure mode it wrote zero rows — no phantom receipt, no replay
    // hazard (see B-RE-1 commentary).
    const fresh = await first(db, 'SELECT repo_revision, platform_role FROM adult_accounts WHERE id = ?', [targetAccountId]);
    const freshRepoRevision = Math.max(0, Number(fresh?.repo_revision) || 0);
    if (freshRepoRevision !== currentRepoRevision) {
      throw new ConflictError('Account has changed since it was last read. Re-read and retry.', {
        code: 'account_role_stale',
        retryable: true,
        accountId: targetAccountId,
        expected: normalisedExpectedRepoRevision,
        current: freshRepoRevision,
      });
    }
    throw new ConflictError('At least one admin account must remain.', {
      code: 'last_admin_required',
      accountId: targetAccountId,
    });
  }

  const directory = await accountDirectoryPayload(db, actorAccountId);
  const updatedAccount = directory.accounts.find((account) => account.id === targetAccountId) || null;
  return {
    ...directory,
    updatedAccount,
    roleMutation: mutationMeta,
  };
}

async function ensureUniqueOrAccessibleLearnerId(db, accountId, learnerId) {
  const membership = await getMembership(db, accountId, learnerId);
  if (membership) return membership;
  const existing = await scalar(db, 'SELECT id FROM learner_profiles WHERE id = ?', [learnerId]);
  if (existing) {
    throw new ForbiddenError('Learner id already exists outside this account scope.', { learnerId });
  }
  return null;
}

async function countOtherOwners(db, learnerId, excludingAccountId) {
  return Number(await scalar(db, `
    SELECT COUNT(*) AS count
    FROM account_learner_memberships
    WHERE learner_id = ?
      AND account_id != ?
      AND role = 'owner'
  `, [learnerId, excludingAccountId], 'count') || 0);
}

async function findPromotionCandidate(db, learnerId, excludingAccountId) {
  return first(db, `
    SELECT account_id, learner_id, role, sort_index, created_at, updated_at
    FROM account_learner_memberships
    WHERE learner_id = ?
      AND account_id != ?
    ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, created_at ASC, account_id ASC
    LIMIT 1
  `, [learnerId, excludingAccountId]);
}

async function releaseMembershipOrDeleteLearner(db, accountId, learnerId, role, nowTs) {
  if (role !== 'owner') {
    await run(db, 'DELETE FROM account_learner_memberships WHERE account_id = ? AND learner_id = ?', [accountId, learnerId]);
    return 'membership_removed';
  }

  const candidate = await findPromotionCandidate(db, learnerId, accountId);
  if (!candidate) {
    await run(db, 'DELETE FROM learner_profiles WHERE id = ?', [learnerId]);
    return 'learner_deleted';
  }

  const otherOwnerCount = await countOtherOwners(db, learnerId, accountId);
  if (!otherOwnerCount && candidate.role !== 'owner') {
    await run(db, `
      UPDATE account_learner_memberships
      SET role = 'owner', updated_at = ?
      WHERE account_id = ? AND learner_id = ?
    `, [nowTs, candidate.account_id, learnerId]);
  }

  await run(db, 'DELETE FROM account_learner_memberships WHERE account_id = ? AND learner_id = ?', [accountId, learnerId]);
  return 'membership_removed';
}

function rowKey(row, fields = ['id']) {
  return fields.map((field) => String(row?.[field] ?? '')).join('::');
}

function sortSessionRows(rows) {
  return [...rows].sort((a, b) => {
    const updatedDiff = (Number(b.updated_at) || 0) - (Number(a.updated_at) || 0);
    if (updatedDiff !== 0) return updatedDiff;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });
}

function sortEventRowsAscending(rows) {
  return [...rows].sort((a, b) => {
    const createdDiff = (Number(a.created_at) || 0) - (Number(b.created_at) || 0);
    if (createdDiff !== 0) return createdDiff;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

function subjectStateActiveSessionId(row) {
  const ui = safeJsonParse(row?.ui_json, {});
  const sessionId = ui?.session?.id;
  return typeof sessionId === 'string' && sessionId ? sessionId : null;
}

function sortSubjectRowsForActiveSessionLookup(rows) {
  return [...rows].sort((a, b) => {
    const updatedDiff = (Number(b?.updated_at) || 0) - (Number(a?.updated_at) || 0);
    if (updatedDiff !== 0) return updatedDiff;
    return String(a?.subject_id || '').localeCompare(String(b?.subject_id || ''));
  });
}

function listPublicBootstrapActiveSessionIds(subjectRows, learnerIds) {
  const ids = [];
  const idsSeen = new Set();
  const rowsByLearner = new Map();
  const requestedLearners = new Set(learnerIds.map((learnerId) => String(learnerId)));

  for (const row of subjectRows || []) {
    const learnerId = String(row?.learner_id || '');
    if (!requestedLearners.has(learnerId)) continue;
    const rows = rowsByLearner.get(learnerId) || [];
    rows.push(row);
    rowsByLearner.set(learnerId, rows);
  }

  for (const learnerId of learnerIds) {
    const sessionIdsForLearner = new Set();
    const rows = sortSubjectRowsForActiveSessionLookup(rowsByLearner.get(String(learnerId)) || [])
      .slice(0, PUBLIC_BOOTSTRAP_ACTIVE_SESSION_LOOKUP_LIMIT_PER_LEARNER);
    for (const row of rows) {
      const sessionId = subjectStateActiveSessionId(row);
      if (!sessionId || sessionIdsForLearner.has(sessionId)) continue;
      sessionIdsForLearner.add(sessionId);
      if (!idsSeen.has(sessionId)) {
        idsSeen.add(sessionId);
        ids.push(sessionId);
      }
      if (sessionIdsForLearner.size >= PUBLIC_BOOTSTRAP_ACTIVE_SESSION_LIMIT_PER_LEARNER) break;
    }
  }
  return ids;
}

async function listPublicBootstrapSessionRows(db, learnerIds, subjectRows = []) {
  if (!learnerIds.length) return [];
  const rowsById = new Map();
  const placeholders = sqlPlaceholders(learnerIds.length);
  const activeSessionIds = listPublicBootstrapActiveSessionIds(subjectRows, learnerIds);
  if (activeSessionIds.length) {
    const activeRows = await all(db, `
      SELECT id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at
      FROM practice_sessions
      WHERE learner_id IN (${placeholders})
        AND id IN (${sqlPlaceholders(activeSessionIds.length)})
        AND status = 'active'
      ORDER BY updated_at DESC, id DESC
      LIMIT ?
    `, [
      ...learnerIds,
      ...activeSessionIds,
      learnerIds.length * PUBLIC_BOOTSTRAP_ACTIVE_SESSION_LIMIT_PER_LEARNER,
    ]);

    for (const row of activeRows) {
      rowsById.set(rowKey(row), row);
    }
  }

  for (const learnerId of learnerIds) {
    const recentRows = await all(db, `
      SELECT id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at
      FROM practice_sessions
      WHERE learner_id = ?
      ORDER BY updated_at DESC, id DESC
      LIMIT ?
    `, [learnerId, PUBLIC_BOOTSTRAP_RECENT_SESSION_LIMIT_PER_LEARNER]);
    for (const row of recentRows) {
      rowsById.set(rowKey(row), row);
    }
  }

  return sortSessionRows([...rowsById.values()]);
}

async function listPublicBootstrapEventRows(db, learnerIds) {
  if (!learnerIds.length) return [];
  const eventTypes = [...PUBLIC_EVENT_TYPES];
  if (!eventTypes.length) return [];
  const eventTypePlaceholders = sqlPlaceholders(eventTypes.length);
  const rows = [];

  for (const learnerId of learnerIds) {
    rows.push(...await all(db, `
      SELECT id, learner_id, subject_id, system_id, event_type, event_json, created_at
      FROM event_log
      WHERE learner_id = ?
        AND event_type IN (${eventTypePlaceholders})
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `, [learnerId, ...eventTypes, PUBLIC_BOOTSTRAP_RECENT_EVENT_LIMIT_PER_LEARNER]));
  }

  return sortEventRowsAscending(rows);
}

async function listBootstrapSubjectStateRows(db, learnerIds, { publicReadModels = false } = {}) {
  if (!learnerIds.length) return [];
  const placeholders = sqlPlaceholders(learnerIds.length);
  try {
    const rows = await all(db, `
      SELECT learner_id, subject_id, ui_json, data_json, updated_at, NULL AS spelling_stats_json
      FROM child_subject_state
      WHERE learner_id IN (${placeholders})
        AND (
          subject_id <> 'spelling'
          OR NOT EXISTS (
            SELECT 1
            FROM bounded_gameplay_state_migrations
            WHERE migration_id = '0023' AND state = 'ready'
          )
        )
      UNION ALL
      SELECT learner_id, 'spelling' AS subject_id, ui_json, data_json, updated_at, stats_json AS spelling_stats_json
      FROM spelling_learner_state
      WHERE learner_id IN (${placeholders})
        AND EXISTS (
          SELECT 1
          FROM bounded_gameplay_state_migrations
          WHERE migration_id = '0023' AND state = 'ready'
        )
    `, [...learnerIds, ...learnerIds]);
    // The readiness predicate is evaluated inside the existing subject-state
    // read. This keeps bootstrap at one D1 round trip while preserving the
    // code-first rule that table existence alone never changes authority.
    const boundedSpellingLearnerIds = new Set(rows
      .filter((row) => row?.subject_id === 'spelling' && row?.spelling_stats_json != null)
      .map((row) => String(row.learner_id || ''))
      .filter(Boolean));
    if (boundedSpellingLearnerIds.size > 0) {
      markBoundedGameplayTableAvailable(db, 'spelling');
    }
    const boundedReady = boundedSpellingLearnerIds.size > 0
      || await boundedGameplayTableAvailable(db, 'spelling');
    for (const learnerId of learnerIds) {
      await requireBoundedSpellingLearnerState(
        db,
        learnerId,
        boundedSpellingLearnerIds.has(String(learnerId)),
        boundedReady,
      );
    }
    return rows;
  } catch (error) {
    // Migration 0023 deliberately uses a code-first rollout. Until the schema
    // gate runs, the new Worker stays functional on the legacy row; after the
    // table exists this branch is unreachable and production gameplay remains
    // profile-size independent.
    if (
      !isMissingTableError(error, 'spelling_learner_state')
      && !isMissingTableError(error, 'bounded_gameplay_state_migrations')
    ) throw error;
    if (isMissingTableError(error, 'spelling_learner_state')) {
      await requireLegacyGameplayFallbackAllowed(
        db,
        'spelling',
        'spelling_learner_state',
        error,
      );
    }
    return all(db, `
      SELECT learner_id, subject_id, ui_json, data_json, updated_at, NULL AS spelling_stats_json
      FROM child_subject_state
      WHERE learner_id IN (${placeholders})
    `, learnerIds);
  }
}

async function hydrateGenericBootstrapSpellingRows(db, subjectRows, runtimeSnapshot, nowTs) {
  const boundedSpellingRows = (Array.isArray(subjectRows) ? subjectRows : [])
    .filter((row) => row?.subject_id === 'spelling' && row?.spelling_stats_json != null);
  if (!boundedSpellingRows.length) return subjectRows;

  const learnerIds = [...new Set(boundedSpellingRows.map((row) => String(row.learner_id || '')))]
    .filter(Boolean);
  const slugs = [...new Set((runtimeSnapshot?.words || [])
    .map((word) => (typeof word?.slug === 'string' ? word.slug : '')))]
    .filter(Boolean);
  if (!learnerIds.length || !slugs.length) return subjectRows;

  // Generic repository hydration exists for local/internal parity only. Keep
  // it bounded by the current content catalogue: the query never returns a
  // retired or lifetime-only row, regardless of how long the learner has
  // played. Production browser bootstrap uses publicReadModels and never
  // enters this path.
  const itemRows = await all(db, `
    SELECT learner_id, slug, progress_json, guardian_json, pattern_json
    FROM spelling_item_state
    WHERE learner_id IN (SELECT value FROM json_each(?))
      AND slug IN (SELECT value FROM json_each(?))
  `, [JSON.stringify(learnerIds), JSON.stringify(slugs)]);
  const itemsByLearner = new Map();
  for (const item of itemRows) {
    const key = String(item.learner_id || '');
    const items = itemsByLearner.get(key) || [];
    items.push(item);
    itemsByLearner.set(key, items);
  }

  return subjectRows.map((row) => {
    if (row?.subject_id !== 'spelling' || row?.spelling_stats_json == null) return row;
    const record = subjectStateRowToRecord(row);
    const data = composeSpellingGameplayData(
      record.data,
      itemsByLearner.get(String(row.learner_id || '')) || [],
      nowTs,
    );
    if (!Object.keys(data.progress || {}).length) delete data.progress;
    if (!Object.keys(data.guardian || {}).length) delete data.guardian;
    return { ...row, data_json: JSON.stringify(data) };
  });
}

async function readPublicPunctuationItemRows(db, subjectRows) {
  const punctuationRows = (Array.isArray(subjectRows) ? subjectRows : [])
    .filter((row) => row?.subject_id === 'punctuation');
  const entries = await Promise.all(punctuationRows.map(async (row) => {
    const record = subjectStateRowToRecord(row);
    const itemRows = await listPunctuationGameplayItemRows(
      db,
      row.learner_id,
      punctuationStarItemIds(record.data),
    );
    return [subjectStateKey(row.learner_id, row.subject_id), itemRows];
  }));
  return new Map(entries);
}

// U7: SHA-256 revision hash over the stable signature. Truncated to 16
// bytes hex (32 chars). NOT a password hash — purely a cache-tag
// identifier; `crypto.subtle.digest('SHA-256', ...)` is fine for this use
// per the plan (line 792: "never a password hash").
//
// Input format is strictly:
//   accountId:<id>;accountRevision:<N>;selectedLearnerRevision:<M>;
//   bootstrapCapacityVersion:<V>;accountLearnerListRevision:<L>;
//   writableLearnerStatesDigest:<D>
//
// computeBootstrapRevisionHash → bootstrap-repository.js

// computeWritableLearnerStatesDigest → bootstrap-repository.js

// U7: read the sibling-table counter. Missing row is revision 0 (lazy
// creation deferred to the first bump). Tolerant of the helper table not
// yet existing (e.g. partial migration apply mid-deploy).
async function readAccountLearnerListRevision(db, accountId) {
  try {
    const row = await first(
      db,
      'SELECT revision FROM adult_account_list_revisions WHERE account_id = ?',
      [accountId],
    );
    return Number(row?.revision) || 0;
  } catch (error) {
    if (isMissingTableError(error, 'adult_account_list_revisions')) return 0;
    throw error;
  }
}

// U7: bump the sibling-table counter. Creates the row lazily on first
// bump; subsequent bumps increment in place. Swallows missing-table to
// preserve the deploy-order tolerance contract (subjects write before
// the migration finishes applying on the first cold start).
async function bumpAccountLearnerListRevision(db, accountId, nowTs) {
  try {
    await run(db, `
      INSERT INTO adult_account_list_revisions (account_id, revision, updated_at)
      VALUES (?, 1, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        revision = revision + 1,
        updated_at = excluded.updated_at
    `, [accountId, Number(nowTs) || 0]);
  } catch (error) {
    if (isMissingTableError(error, 'adult_account_list_revisions')) return;
    throw error;
  }
}

// compactLearnerListEntry → bootstrap-repository.js

// bootstrapCapacityMeta → bootstrap-repository.js

// resolveBootstrapSelectedLearnerId → bootstrap-repository.js

function bootstrapTimingNowMs() {
  return typeof performance?.now === 'function' ? performance.now() : Date.now();
}

async function measureBootstrapPhase(capacity, name, fn) {
  if (!capacity || typeof capacity.recordBootstrapPhaseTiming !== 'function') {
    return fn();
  }
  const startedAt = bootstrapTimingNowMs();
  try {
    return await fn();
  } finally {
    capacity.recordBootstrapPhaseTiming(name, bootstrapTimingNowMs() - startedAt);
  }
}

function measureBootstrapPhaseSync(capacity, name, fn) {
  if (!capacity || typeof capacity.recordBootstrapPhaseTiming !== 'function') {
    return fn();
  }
  const startedAt = bootstrapTimingNowMs();
  try {
    return fn();
  } finally {
    capacity.recordBootstrapPhaseTiming(name, bootstrapTimingNowMs() - startedAt);
  }
}

function accountSnapshotForBootstrap(account, accountId) {
  return account && String(account.id || '') === String(accountId || '') ? account : null;
}

async function bootstrapBundle(db, accountId, {
  publicReadModels = false,
  // U7: opt-in to the selected-learner-bounded shape. Defaults mirror the
  // pre-U7 unrestricted-per-public behaviour so non-U7 callers (demo
  // reset, internal tests) keep the legacy envelope.
  selectedLearnerBounded = false,
  // U7: cold-start preference (plan line 756).
  preferredLearnerId = null,
  // U7: include `revision` + `account.learnerList` only when the caller
  // is using the v2 envelope shape. Legacy callers get the legacy shape.
  revisionEnvelope = false,
  // P7: the app route already refreshes and reads the account row through
  // ensureAccount() before dispatching bootstrap. Reuse that trusted
  // server-side snapshot to avoid a duplicate adult account point read.
  accountSnapshot = null,
  capacity = null,
  env = {},
} = {}) {
  const snapshot = accountSnapshotForBootstrap(accountSnapshot, accountId);
  const accountPromise = snapshot
    ? measureBootstrapPhaseSync(capacity, BOOTSTRAP_PHASE_TIMING.account, () => snapshot)
    : measureBootstrapPhase(capacity, BOOTSTRAP_PHASE_TIMING.account, () => (
      first(db, 'SELECT * FROM adult_accounts WHERE id = ?', [accountId])
    ));
  // U7: on the bounded path we omit the ~450 KB `BUNDLED_MONSTER_VISUAL_CONFIG`
  // from the bootstrap response. Clients fetch the full config lazily via
  // the existing monster-visual-config read path; the bootstrap instead
  // ships a compact `{schemaVersion, manifestHash, publishedVersion}`
  // pointer so the client's schema check + cache invalidation still work.
  const monsterVisualConfigPromise = measureBootstrapPhase(
    capacity,
    BOOTSTRAP_PHASE_TIMING.monsterVisualConfig,
    async () => ({
      fullMonsterVisualConfig: selectedLearnerBounded
        ? null
        : await readBootstrapMonsterVisualRuntimeConfig(db, Date.now()),
      monsterVisualConfigPointer: selectedLearnerBounded
        ? await readMonsterVisualConfigPointer(db)
        : null,
    }),
  );
  const membershipRowsPromise = measureBootstrapPhase(capacity, BOOTSTRAP_PHASE_TIMING.membership, () => (
    listMembershipRows(db, accountId, { writableOnly: true })
  ));
  const spellingContentReleaseRowPromise = publicReadModels
    ? measureBootstrapPhase(capacity, BOOTSTRAP_PHASE_TIMING.readModel, () => (
      readResolvedContentOperationReleaseRow(db, accountId, 'spelling')
    ))
    : Promise.resolve(null);
  const [
    account,
    { fullMonsterVisualConfig, monsterVisualConfigPointer },
    membershipRows,
    spellingContentReleaseRow,
  ] = await Promise.all([
    accountPromise,
    monsterVisualConfigPromise,
    membershipRowsPromise,
    spellingContentReleaseRowPromise,
  ]);
  const baseMonsterVisualConfig = fullMonsterVisualConfig || monsterVisualConfigPointer;
  const { learnersById, learnerIds, learnerRevisions, selectedId } = await measureBootstrapPhase(
    capacity,
    BOOTSTRAP_PHASE_TIMING.selectedLearner,
    async () => {
      const nextLearnersById = {};
      const nextLearnerIds = [];
      const nextLearnerRevisions = {};

      for (const row of membershipRows) {
        const learner = learnerRowToRecord(row);
        if (!learner) continue;
        nextLearnersById[learner.id] = learner;
        nextLearnerIds.push(learner.id);
        nextLearnerRevisions[learner.id] = Number(row.state_revision) || 0;
      }

      const resolvedSelectedId = revisionEnvelope
        ? resolveBootstrapSelectedLearnerId(
          membershipRows,
          account?.selected_learner_id,
          preferredLearnerId,
        )
        : (nextLearnerIds.includes(account?.selected_learner_id)
          ? account.selected_learner_id
          : (nextLearnerIds[0] || null));

      if (resolvedSelectedId !== (account?.selected_learner_id || null)) {
        await run(db, 'UPDATE adult_accounts SET selected_learner_id = ?, updated_at = ? WHERE id = ?', [resolvedSelectedId, Date.now(), accountId]);
      }

      return {
        learnersById: nextLearnersById,
        learnerIds: nextLearnerIds,
        learnerRevisions: nextLearnerRevisions,
        selectedId: resolvedSelectedId,
      };
    },
  );

  // U7: the "bounded" mode restricts per-learner reads to the selected
  // learner only. If no selected learner exists (empty account, or
  // cold-start with alphabetical fallback also producing null), the
  // bounded mode degrades to the empty-learners branch further down.
  const boundedToSelected = publicReadModels && selectedLearnerBounded && selectedId;
  const queryLearnerIds = boundedToSelected ? [selectedId] : learnerIds;
  // Production stress testing showed sibling subject states can dominate the
  // public bootstrap envelope once learner histories grow. Keep the initial
  // shell genuinely selected-learner bounded; switching learners re-posts
  // bootstrap with `preferredLearnerId` and loads that learner's states.
  const subjectStateLearnerIds = boundedToSelected ? [selectedId] : learnerIds;
  const monsterVisualConfig = attachRuntimeMonsterAssetReferencesToVisualConfig(
    baseMonsterVisualConfig,
    runtimeMonsterAssetReferencesFromReleaseRow(spellingContentReleaseRow),
  );

  // U7: precompute the revision-envelope ingredients so that both the
  // empty and non-empty branches can stamp them consistently. These
  // queries are free when `revisionEnvelope=false` (we skip them).
  const accountRevisionValue = Number(account?.repo_revision) || 0;
  const revisionEnvelopePromise = measureBootstrapPhase(capacity, BOOTSTRAP_PHASE_TIMING.revisionHash, async () => {
    const accountLearnerListRevisionPromise = revisionEnvelope
      ? readAccountLearnerListRevision(db, accountId)
      : Promise.resolve(0);
    const nextSelectedLearnerRevision = selectedId ? (learnerRevisions[selectedId] || 0) : 0;
    // U1 follow-up 2026-04-26 (B1): pin every writable learner's
    // state_revision into the hash input so sibling writes invalidate the
    // `bootstrapNotModifiedProbe` short-circuit.
    const writableLearnerStatesDigestPromise = revisionEnvelope
      ? computeWritableLearnerStatesDigest(membershipRows)
      : Promise.resolve('');
    const [
      nextAccountLearnerListRevision,
      writableLearnerStatesDigest,
    ] = await Promise.all([
      accountLearnerListRevisionPromise,
      writableLearnerStatesDigestPromise,
    ]);
    const spellingContentRevision = revisionEnvelope && publicReadModels
      ? contentOperationReleaseRevisionToken(spellingContentReleaseRow)
      : '';
    const nextRevisionHash = revisionEnvelope
      ? await computeBootstrapRevisionHash({
        accountId,
        accountRevision: accountRevisionValue,
        selectedLearnerRevision: nextSelectedLearnerRevision,
        bootstrapCapacityVersion: PUBLIC_BOOTSTRAP_CAPACITY_VERSION,
        accountLearnerListRevision: nextAccountLearnerListRevision,
        writableLearnerStatesDigest,
        spellingContentRevision,
      })
      : null;
    return {
      accountLearnerListRevision: nextAccountLearnerListRevision,
      selectedLearnerRevision: nextSelectedLearnerRevision,
      revisionHash: nextRevisionHash,
    };
  });
  void revisionEnvelopePromise.catch(() => {});

  // U7: compact `account.learnerList` entries for unselected learners.
  // When `boundedToSelected` is false (legacy callers), this stays empty
  // so the legacy envelope is unchanged.
  const learnerListEntries = measureBootstrapPhaseSync(
    capacity,
    BOOTSTRAP_PHASE_TIMING.learnerList,
    () => (boundedToSelected
      ? membershipRows
        .filter((row) => String(row.id) !== String(selectedId))
        .map((row) => compactLearnerListEntry(row))
        .filter(Boolean)
      : []),
  );

  if (!learnerIds.length) {
    const {
      accountLearnerListRevision,
      selectedLearnerRevision,
      revisionHash,
    } = await revisionEnvelopePromise;
    const emptyMode = boundedToSelected ? 'selected-learner-bounded' : null;
    const capacityMeta = publicReadModels ? bootstrapCapacityMeta({
      publicReadModels,
      learnerCount: 0,
      sessionRows: [],
      eventRows: [],
      // No learners → `subjectStateLearnerIds.length === learnerIds.length`
      // vacuously. Stamp the contract marker as `false` (unbounded) to
      // stay consistent with the non-empty branch's nominal shape.
      subjectStatesBounded: false,
    }) : null;
    if (capacityMeta && emptyMode) capacityMeta.bootstrapMode = emptyMode;
    return measureBootstrapPhaseSync(capacity, BOOTSTRAP_PHASE_TIMING.responseConstruction, () => ({
      ...normaliseRepositoryBundle({
        meta: currentRepositoryMeta(),
        learners: emptyLearnersSnapshot(),
        subjectStates: {},
        practiceSessions: [],
        gameState: {},
        eventLog: [],
      }),
      syncState: {
        policyVersion: MUTATION_POLICY_VERSION,
        accountRevision: accountRevisionValue,
        learnerRevisions: {},
      },
      monsterVisualConfig,
      ...(publicReadModels ? { bootstrapCapacity: capacityMeta } : {}),
      ...(revisionEnvelope ? {
        account: {
          selectedLearnerId: selectedId,
          learnerList: [],
        },
        revision: {
          accountRevision: accountRevisionValue,
          selectedLearnerRevision,
          accountLearnerListRevision,
          bootstrapCapacityVersion: PUBLIC_BOOTSTRAP_CAPACITY_VERSION,
          hash: revisionHash,
        },
      } : {}),
    }));
  }

  const placeholders = sqlPlaceholders(queryLearnerIds.length);
  // Keep a narrow fallback around the selected-state reads. It should rarely
  // fire, but preserving the marker keeps older capacity dashboards readable.
  let subjectStateIdsUsed = subjectStateLearnerIds;
  let subjectStatesFallbackMode = null;
  let subjectRows;
  let gameRows;
  let sessionRowsPromise;
  const startSessionRowsRead = (rowsForActiveSessionLookup) => (
    measureBootstrapPhase(capacity, BOOTSTRAP_PHASE_TIMING.sessions, () => (
      publicReadModels
        ? listPublicBootstrapSessionRows(db, queryLearnerIds, rowsForActiveSessionLookup)
        : all(db, `
          SELECT id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at
          FROM practice_sessions
          WHERE learner_id IN (${placeholders})
          ORDER BY updated_at DESC, id DESC
        `, queryLearnerIds)
    ))
  );
  const eventRowsPromise = measureBootstrapPhase(capacity, BOOTSTRAP_PHASE_TIMING.events, () => (
    publicReadModels
      ? listPublicBootstrapEventRows(db, queryLearnerIds)
      : all(db, `
        SELECT id, learner_id, subject_id, system_id, event_type, event_json, created_at
        FROM event_log
        WHERE learner_id IN (${placeholders})
        ORDER BY created_at ASC, id ASC
      `, queryLearnerIds)
  ));
  void eventRowsPromise.catch(() => {});
  try {
    const subjectRowsPromise = measureBootstrapPhase(capacity, BOOTSTRAP_PHASE_TIMING.subjectState, () => (
      listBootstrapSubjectStateRows(db, subjectStateLearnerIds, { publicReadModels })
    ));
    const subjectStatePlaceholders = sqlPlaceholders(subjectStateLearnerIds.length);
    const gameRowsPromise = measureBootstrapPhase(capacity, BOOTSTRAP_PHASE_TIMING.gameState, () => (
      all(db, `
        SELECT learner_id, system_id, state_json, updated_at
        FROM child_game_state
        WHERE learner_id IN (${subjectStatePlaceholders})
      `, subjectStateLearnerIds)
    ));
    subjectRows = await subjectRowsPromise;
    sessionRowsPromise = startSessionRowsRead(subjectRows);
    void sessionRowsPromise.catch(() => {});
    gameRows = await gameRowsPromise;
  } catch (error) {
    // Only fall back when a selectedId exists — empty/no-learner paths are
    // handled by the earlier `!learnerIds.length` branch, and a null
    // selectedId here would mean an account with writable learners but no
    // resolved selection (should not reach this branch).
    if (!boundedToSelected || !selectedId) throw error;
    logMutation('warn', 'bootstrap.subject_state_fallback', {
      accountId,
      learnerCount: subjectStateLearnerIds.length,
      selectedId,
      error: String(error?.message || error),
    });
    subjectStateIdsUsed = [selectedId];
    subjectStatesFallbackMode = 'degraded-to-selected';
    subjectRows = await measureBootstrapPhase(capacity, BOOTSTRAP_PHASE_TIMING.subjectState, () => (
      listBootstrapSubjectStateRows(db, subjectStateIdsUsed, { publicReadModels })
    ));
    const fallbackPlaceholders = sqlPlaceholders(subjectStateIdsUsed.length);
    gameRows = await measureBootstrapPhase(capacity, BOOTSTRAP_PHASE_TIMING.gameState, () => (
      all(db, `
        SELECT learner_id, system_id, state_json, updated_at
        FROM child_game_state
        WHERE learner_id IN (${fallbackPlaceholders})
      `, subjectStateIdsUsed)
    ));
    sessionRowsPromise = startSessionRowsRead(subjectRows);
    void sessionRowsPromise.catch(() => {});
  }
  const [sessionRows, eventRows] = await Promise.all([
    sessionRowsPromise,
    eventRowsPromise,
  ]);
  const publicReadModelNow = Date.now();
  if (!publicReadModels && subjectRows.some((row) => (
    row?.subject_id === 'spelling' && row?.spelling_stats_json != null
  ))) {
    const genericSpellingContent = await measureBootstrapPhase(
      capacity,
      BOOTSTRAP_PHASE_TIMING.readModel,
      () => readSpellingRuntimeContentBundle(db, accountId, 'spelling', {
        nowMs: publicReadModelNow,
        env,
      }),
    );
    subjectRows = await measureBootstrapPhase(
      capacity,
      BOOTSTRAP_PHASE_TIMING.readModel,
      () => hydrateGenericBootstrapSpellingRows(
        db,
        subjectRows,
        genericSpellingContent?.snapshot || null,
        publicReadModelNow,
      ),
    );
  }
  // Full spelling read-model derivation walks the published runtime snapshot.
  // In the selected-learner-bounded bootstrap shape, avoid that work entirely:
  // the bootstrap carries compact progress aggregates, while heavyweight
  // spelling post-mastery and Word Bank data hydrate through subject commands
  // or dedicated spelling routes after the shell is usable.
  const shouldHydratePublicSpellingReadModel = (row) => (
    publicReadModels
    && row?.subject_id === 'spelling'
    && !boundedToSelected
  );
  const publicSpellingContent = await measureBootstrapPhase(capacity, BOOTSTRAP_PHASE_TIMING.readModel, () => (
    subjectRows.some(shouldHydratePublicSpellingReadModel)
      ? (spellingContentReleaseRow
        ? readSpellingRuntimeContentReleaseBundle(
          db,
          'spelling',
          spellingContentReleaseRow,
          spellingContentReleaseRow.release_source === 'override' ? 'override' : 'release',
        ).then((runtimeContent) => resolveLearnerVisibleRuntimeContent(runtimeContent, {
          nowMs: publicReadModelNow,
          env,
        }))
        : readSeededSpellingRuntimeContentBundle('spelling'))
      : null
  ));
  const publicPunctuationItems = publicReadModels
    ? await measureBootstrapPhase(
        capacity,
        BOOTSTRAP_PHASE_TIMING.readModel,
        () => readPublicPunctuationItemRows(db, subjectRows),
      )
    : new Map();
  const subjectStates = {};
  await measureBootstrapPhase(capacity, BOOTSTRAP_PHASE_TIMING.readModel, async () => {
    for (const row of subjectRows) {
      subjectStates[subjectStateKey(row.learner_id, row.subject_id)] = publicReadModels
        ? await publicSubjectStateRowToRecord(row, {
          spellingContentSnapshot: shouldHydratePublicSpellingReadModel(row)
            ? publicSpellingContent?.snapshot || null
            : null,
          punctuationItemRows: publicPunctuationItems.get(subjectStateKey(row.learner_id, row.subject_id)) || [],
          now: publicReadModelNow,
          compact: Boolean(boundedToSelected),
        })
        : subjectStateRowToRecord(row);
    }
  });

  const gameState = {};
  await measureBootstrapPhase(capacity, BOOTSTRAP_PHASE_TIMING.readModel, async () => {
    gameRows.forEach((row) => {
      const record = publicReadModels
        ? publicGameStateRowToRecord(row)
        : gameStateRowToRecord(row);
      if (record) gameState[gameStateKey(row.learner_id, row.system_id)] = record;
    });
    if (publicReadModels && !boundedToSelected) {
      const spellingCodexSubjectRows = subjectRows;
      await mergePublicSpellingCodexState(db, accountId, spellingCodexSubjectRows, gameState, {
        runtimeSnapshot: publicSpellingContent?.snapshot || null,
        now: publicReadModelNow,
        env,
      });
    }
  });

  const capacityMeta = publicReadModels ? bootstrapCapacityMeta({
    publicReadModels,
    learnerCount: queryLearnerIds.length,
    sessionRows,
    eventRows,
    subjectStatesBounded: Boolean(boundedToSelected),
    subjectStatesFallbackMode,
  }) : null;
  if (capacityMeta && boundedToSelected) capacityMeta.bootstrapMode = 'selected-learner-bounded';
  const {
    accountLearnerListRevision,
    selectedLearnerRevision,
    revisionHash,
  } = await revisionEnvelopePromise;

  return measureBootstrapPhaseSync(capacity, BOOTSTRAP_PHASE_TIMING.responseConstruction, () => ({
    ...normaliseRepositoryBundle({
      meta: currentRepositoryMeta(),
      learners: {
        byId: learnersById,
        allIds: learnerIds,
        selectedId,
      },
      subjectStates,
      practiceSessions: filterSessions(sessionRows.map(publicReadModels
        ? publicPracticeSessionRowToRecord
        : practiceSessionRowToRecord)),
      gameState,
      eventLog: normaliseEventLog(eventRows.map(publicReadModels
        ? publicEventRowToRecord
        : eventRowToRecord).filter(Boolean)),
    }),
    syncState: {
      policyVersion: MUTATION_POLICY_VERSION,
      accountRevision: accountRevisionValue,
      learnerRevisions,
    },
    monsterVisualConfig,
    ...(publicReadModels ? { bootstrapCapacity: capacityMeta } : {}),
    ...(revisionEnvelope ? {
      account: {
        selectedLearnerId: selectedId,
        learnerList: learnerListEntries,
      },
      revision: {
        accountRevision: accountRevisionValue,
        selectedLearnerRevision,
        accountLearnerListRevision,
        bootstrapCapacityVersion: PUBLIC_BOOTSTRAP_CAPACITY_VERSION,
        hash: revisionHash,
      },
    } : {}),
  }));
}

// U7: short-circuit response when `lastKnownRevision` matches the current
// server hash. Returns null if the hash doesn't match (caller should
// build a full bundle instead). ≤ 2 KB body.
async function bootstrapNotModifiedProbe(db, accountId, {
  lastKnownRevision,
  preferredLearnerId = null,
  publicReadModels = false,
  accountSnapshot = null,
  capacity = null,
}) {
  return measureBootstrapPhase(capacity, BOOTSTRAP_PHASE_TIMING.notModifiedProbe, async () => {
    if (!lastKnownRevision || typeof lastKnownRevision !== 'string') return null;
    const account = accountSnapshotForBootstrap(accountSnapshot, accountId)
      || await first(db, 'SELECT id, selected_learner_id, repo_revision FROM adult_accounts WHERE id = ?', [accountId]);
    if (!account) return null;
    const membershipRows = await listMembershipRows(db, accountId, { writableOnly: true });
    const writableSelectedId = resolveBootstrapSelectedLearnerId(
      membershipRows,
      account.selected_learner_id,
      preferredLearnerId,
    );
    const accountRevisionValue = Number(account.repo_revision) || 0;
    const accountLearnerListRevision = await readAccountLearnerListRevision(db, accountId);
    const selectedRow = writableSelectedId
      ? membershipRows.find((row) => String(row.id) === String(writableSelectedId))
      : null;
    const selectedLearnerRevision = Number(selectedRow?.state_revision) || 0;
    // U1 follow-up 2026-04-26 (B1): include every writable learner's
    // state_revision in the hash input so sibling writes are visible to
    // the probe. Must use the SAME `membershipRows` shape as
    // `bootstrapBundle` (from `listMembershipRows(db, accountId,
    // { writableOnly: true })`) for deterministic agreement between the
    // probe and the full-bundle hash.
    const writableLearnerStatesDigest = await computeWritableLearnerStatesDigest(membershipRows);
    const spellingContentReleaseRow = publicReadModels
      ? await readResolvedContentOperationReleaseRow(db, accountId, 'spelling')
      : null;
    const serverHash = await computeBootstrapRevisionHash({
      accountId,
      accountRevision: accountRevisionValue,
      selectedLearnerRevision,
      bootstrapCapacityVersion: PUBLIC_BOOTSTRAP_CAPACITY_VERSION,
      accountLearnerListRevision,
      writableLearnerStatesDigest,
      spellingContentRevision: publicReadModels
        ? contentOperationReleaseRevisionToken(spellingContentReleaseRow)
        : '',
    });
    if (serverHash !== lastKnownRevision) return null;
    return {
      accountRevision: accountRevisionValue,
      selectedLearnerId: writableSelectedId,
      selectedLearnerRevision,
      accountLearnerListRevision,
      bootstrapCapacityVersion: PUBLIC_BOOTSTRAP_CAPACITY_VERSION,
      hash: serverHash,
    };
  });
}

async function readSubjectRuntimeBundle(db, accountId, learnerId, subjectId = 'spelling', {
  // U6 hot-path optimisation: subject command handlers already ran
  // through `runSubjectCommandMutation` which called
  // `requireLearnerWriteAccess`. Skip the duplicate
  // `account_learner_memberships` SELECT so hot-path queryCount stays
  // within ≤12. External callers (worker routes that bypass the
  // command path) MUST omit this flag.
  skipAccessCheck = false,
} = {}) {
  const row = skipAccessCheck
    ? await first(db, `
      SELECT
        state.learner_id AS state_learner_id,
        state.subject_id AS state_subject_id,
        state.ui_json AS state_ui_json,
        state.data_json AS state_data_json,
        state.updated_at AS state_updated_at,
        session.id AS session_id,
        session.learner_id AS session_learner_id,
        session.subject_id AS session_subject_id,
        session.session_kind AS session_kind,
        session.status AS session_status,
        session.session_state_json AS session_state_json,
        session.summary_json AS session_summary_json,
        session.created_at AS session_created_at,
        session.updated_at AS session_updated_at
      FROM (SELECT 1) anchor
      LEFT JOIN (
        SELECT learner_id, subject_id, ui_json, data_json, updated_at
        FROM child_subject_state
        WHERE learner_id = ? AND subject_id = ?
        LIMIT 1
      ) state ON 1 = 1
      LEFT JOIN (
        SELECT id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at
        FROM practice_sessions
        WHERE learner_id = ? AND subject_id = ?
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      ) session ON 1 = 1
    `, [learnerId, subjectId, learnerId, subjectId])
    : await first(db, `
      SELECT
        membership.role AS membership_role,
        state.learner_id AS state_learner_id,
        state.subject_id AS state_subject_id,
        state.ui_json AS state_ui_json,
        state.data_json AS state_data_json,
        state.updated_at AS state_updated_at,
        session.id AS session_id,
        session.learner_id AS session_learner_id,
        session.subject_id AS session_subject_id,
        session.session_kind AS session_kind,
        session.status AS session_status,
        session.session_state_json AS session_state_json,
        session.summary_json AS session_summary_json,
        session.created_at AS session_created_at,
        session.updated_at AS session_updated_at
      FROM (SELECT 1) anchor
      LEFT JOIN account_learner_memberships membership
        ON membership.account_id = ? AND membership.learner_id = ?
      LEFT JOIN (
        SELECT learner_id, subject_id, ui_json, data_json, updated_at
        FROM child_subject_state
        WHERE learner_id = ? AND subject_id = ?
        LIMIT 1
      ) state ON 1 = 1
      LEFT JOIN (
        SELECT id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at
        FROM practice_sessions
        WHERE learner_id = ? AND subject_id = ?
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      ) session ON 1 = 1
    `, [accountId, learnerId, learnerId, subjectId, learnerId, subjectId]);
  if (!skipAccessCheck && !writableRole(row?.membership_role)) {
    throw new ForbiddenError('Learner access denied.', {
      learnerId,
      required: 'owner-or-member',
    });
  }
  const subjectRow = row?.state_learner_id
    ? {
      learner_id: row.state_learner_id,
      subject_id: row.state_subject_id,
      ui_json: row.state_ui_json,
      data_json: row.state_data_json,
      updated_at: row.state_updated_at,
    }
    : null;
  const latestSessionRow = row?.session_id
    ? {
      id: row.session_id,
      learner_id: row.session_learner_id,
      subject_id: row.session_subject_id,
      session_kind: row.session_kind,
      status: row.session_status,
      session_state_json: row.session_state_json,
      summary_json: row.session_summary_json,
      created_at: row.session_created_at,
      updated_at: row.session_updated_at,
    }
    : null;
  return {
    subjectRecord: subjectRow ? subjectStateRowToRecord(subjectRow) : normaliseSubjectStateRecord({}),
    latestSession: latestSessionRow ? practiceSessionRowToRecord(latestSessionRow) : null,
  };
}

function spellingCommandRuntimeFromRow(row, modelKey, { prefix = '' } = {}) {
  const value = (name) => row?.[`${prefix}${name}`];
  const legacyFallbackRequired = !value('state_learner_id')
    && Number(value('legacy_state_exists')) === 1;
  const subjectRow = value('state_learner_id')
    ? {
      learner_id: value('state_learner_id'),
      subject_id: value('state_subject_id'),
      ui_json: value('state_ui_json'),
      data_json: value('state_data_json'),
      updated_at: value('state_updated_at'),
    }
    : null;
  const latestSessionRow = value('session_id')
    ? {
      id: value('session_id'),
      learner_id: value('session_learner_id'),
      subject_id: value('session_subject_id'),
      session_kind: value('session_kind'),
      status: value('session_status'),
      session_state_json: value('session_state_json'),
      summary_json: value('session_summary_json'),
      created_at: value('session_created_at'),
      updated_at: value('session_updated_at'),
    }
    : null;
  const readModelRow = value('read_model_learner_id')
    ? {
      learner_id: value('read_model_learner_id'),
      model_key: value('read_model_key'),
      model_json: value('read_model_json'),
      source_revision: value('read_model_source_revision'),
      generated_at: value('read_model_generated_at'),
      updated_at: value('read_model_updated_at'),
    }
    : null;

  return {
    subjectRecord: subjectRow ? subjectStateRowToRecord(subjectRow) : normaliseSubjectStateRecord({}),
    spellingStats: parseSpellingGameplayStats(value('state_stats_json')),
    latestSession: latestSessionRow ? practiceSessionRowToRecord(latestSessionRow) : null,
    activeSessionId: value('active_session_id') || null,
    commandProjectionReadModel: readModelRow
      ? normaliseLearnerReadModelRow(readModelRow, modelKey)
      : emptyLearnerReadModel(modelKey),
    legacyFallbackRequired,
  };
}

async function readSpellingCommandRuntimeBundle(db, accountId, learnerId, {
  skipAccessCheck = false,
  projectionModelKey = COMMAND_PROJECTION_MODEL_KEY,
} = {}) {
  const modelKey = normaliseReadModelKey(projectionModelKey, COMMAND_PROJECTION_MODEL_KEY);
  const readRuntimeRow = (includeReadModel) => first(db, `
    SELECT
      membership.role AS membership_role,
      state.learner_id AS state_learner_id,
      'spelling' AS state_subject_id,
      state.ui_json AS state_ui_json,
      state.data_json AS state_data_json,
      state.stats_json AS state_stats_json,
      state.updated_at AS state_updated_at,
      session.id AS session_id,
      session.learner_id AS session_learner_id,
      session.subject_id AS session_subject_id,
      session.session_kind AS session_kind,
      session.status AS session_status,
      session.session_state_json AS session_state_json,
      session.summary_json AS session_summary_json,
      session.created_at AS session_created_at,
      session.updated_at AS session_updated_at,
      active_session.id AS active_session_id,
      ${includeReadModel ? `
        read_model.learner_id AS read_model_learner_id,
        read_model.model_key AS read_model_key,
        read_model.model_json AS read_model_json,
        read_model.source_revision AS read_model_source_revision,
        read_model.generated_at AS read_model_generated_at,
        read_model.updated_at AS read_model_updated_at,
      ` : `
        NULL AS read_model_learner_id,
        NULL AS read_model_key,
        NULL AS read_model_json,
        NULL AS read_model_source_revision,
        NULL AS read_model_generated_at,
        NULL AS read_model_updated_at,
      `}
      EXISTS (
        SELECT 1
        FROM child_subject_state legacy_state
        WHERE legacy_state.learner_id = ? AND legacy_state.subject_id = 'spelling'
      ) AS legacy_state_exists,
      EXISTS (
        SELECT 1
        FROM bounded_gameplay_state_migrations
        WHERE migration_id = '0023' AND state = 'ready'
      ) AS bounded_gameplay_ready
    FROM (SELECT 1) anchor
    LEFT JOIN account_learner_memberships membership
      ON membership.account_id = ? AND membership.learner_id = ?
    LEFT JOIN (
      SELECT learner_id, ui_json, data_json, stats_json, updated_at
      FROM spelling_learner_state
      WHERE learner_id = ?
        AND EXISTS (
          SELECT 1
          FROM bounded_gameplay_state_migrations
          WHERE migration_id = '0023' AND state = 'ready'
        )
      LIMIT 1
    ) state ON 1 = 1
    LEFT JOIN (
      SELECT id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at
      FROM practice_sessions
      WHERE learner_id = ? AND subject_id = 'spelling'
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    ) session ON 1 = 1
    LEFT JOIN (
      SELECT id
      FROM practice_sessions
      WHERE learner_id = ? AND subject_id = 'spelling' AND status = 'active'
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    ) active_session ON 1 = 1
    ${includeReadModel ? `
      LEFT JOIN learner_read_models read_model
        ON read_model.learner_id = ? AND read_model.model_key = ?
    ` : ''}
  `, [
    learnerId,
    accountId,
    learnerId,
    learnerId,
    learnerId,
    learnerId,
    ...(includeReadModel ? [learnerId, modelKey] : []),
  ]);
  let row;
  try {
    row = await readRuntimeRow(true);
    markLearnerReadModelsTableAvailable(db);
  } catch (error) {
    if (
      isMissingTableError(error, 'spelling_learner_state')
      || isMissingTableError(error, 'bounded_gameplay_state_migrations')
    ) {
      if (isMissingTableError(error, 'spelling_learner_state')) {
        await requireLegacyGameplayFallbackAllowed(db, 'spelling', 'spelling_learner_state', error);
      }
      return readSubjectRuntimeBundle(db, accountId, learnerId, 'spelling', { skipAccessCheck });
    }
    if (!isMissingTableError(error, 'learner_read_models')) throw error;
    try {
      row = await readRuntimeRow(false);
    } catch (boundedError) {
      if (
        isMissingTableError(boundedError, 'spelling_learner_state')
        || isMissingTableError(boundedError, 'bounded_gameplay_state_migrations')
      ) {
        if (isMissingTableError(boundedError, 'spelling_learner_state')) {
          await requireLegacyGameplayFallbackAllowed(
            db,
            'spelling',
            'spelling_learner_state',
            boundedError,
          );
        }
        return readSubjectRuntimeBundle(db, accountId, learnerId, 'spelling', { skipAccessCheck });
      }
      throw boundedError;
    }
  }

  if (!skipAccessCheck && !writableRole(row?.membership_role)) {
    throw new ForbiddenError('Learner access denied.', {
      learnerId,
      required: 'owner-or-member',
    });
  }

  if (Number(row?.bounded_gameplay_ready) === 1) {
    markBoundedGameplayTableAvailable(db, 'spelling');
  }
  await requireBoundedSpellingLearnerState(
    db,
    learnerId,
    Boolean(row?.state_learner_id),
    Number(row?.bounded_gameplay_ready) === 1,
  );
  const runtime = spellingCommandRuntimeFromRow(row, modelKey);
  if (runtime.legacyFallbackRequired) {
    return readSubjectRuntimeBundle(db, accountId, learnerId, 'spelling', { skipAccessCheck: true });
  }
  delete runtime.legacyFallbackRequired;
  return runtime;
}

async function readSpellingGameplayWorkingSet(db, accountId, learnerId, slugs, {
  skipAccessCheck = false,
  learnerData = {},
  now = Date.now(),
} = {}) {
  if (!skipAccessCheck) {
    await requireLearnerWriteAccess(db, accountId, learnerId);
  }
  if (!await boundedGameplayTableAvailable(db, 'spelling')) {
    return markGameplayWorkingSet(cloneSerialisable(learnerData) || {}, 'legacy');
  }
  const workingSlugs = [...new Set((Array.isArray(slugs) ? slugs : [])
    .filter((slug) => typeof slug === 'string' && slug))];
  const achievementIds = spellingAchievementProjectionIds(learnerId);
  const bossPrefix = spellingBossAchievementPrefix(learnerId);
  // One JSON parameter avoids SQLite/D1 variable limits for a large published
  // catalogue. The composite primary key turns each value into a point lookup;
  // lifetime/orphan rows are neither returned nor parsed by the Worker.
  try {
    const rows = await all(db, `
      SELECT
        'item' AS row_kind,
        slug,
        progress_json,
        guardian_json,
        pattern_json,
        NULL AS achievement_id,
        NULL AS record_json
      FROM spelling_item_state
      WHERE learner_id = ?
        AND slug IN (SELECT value FROM json_each(?))
      UNION ALL
      SELECT
        'achievement' AS row_kind,
        NULL AS slug,
        NULL AS progress_json,
        NULL AS guardian_json,
        NULL AS pattern_json,
        achievement_id,
        record_json
      FROM spelling_achievement_state
      WHERE learner_id = ?
        AND achievement_id IN (SELECT value FROM json_each(?))
      UNION ALL
      SELECT
        'achievement' AS row_kind,
        NULL AS slug,
        NULL AS progress_json,
        NULL AS guardian_json,
        NULL AS pattern_json,
        achievement_id,
        record_json
      FROM (
        SELECT achievement_id, record_json
        FROM spelling_achievement_state
        WHERE learner_id = ?
          AND substr(achievement_id, 1, length(?)) = ?
        ORDER BY updated_at DESC, achievement_id DESC
        LIMIT ?
      ) recent_boss
    `, [
      learnerId,
      JSON.stringify(workingSlugs),
      learnerId,
      JSON.stringify(achievementIds),
      learnerId,
      bossPrefix,
      bossPrefix,
      SPELLING_BOSS_ACHIEVEMENT_PROJECTION_LIMIT,
    ]);
    markBoundedGameplayTableAvailable(db, 'spelling');
    const itemRows = rows.filter((row) => row?.row_kind === 'item');
    const achievementRows = rows.filter((row) => row?.row_kind === 'achievement');
    return markGameplayWorkingSet(
      composeSpellingGameplayData(learnerData, itemRows, now, achievementRows),
      'bounded',
    );
  } catch (error) {
    if (
      isMissingTableError(error, 'spelling_item_state')
      || isMissingTableError(error, 'spelling_achievement_state')
    ) {
      const tableName = isMissingTableError(error, 'spelling_achievement_state')
        ? 'spelling_achievement_state'
        : 'spelling_item_state';
      await requireLegacyGameplayFallbackAllowed(db, 'spelling', tableName, error);
      return markGameplayWorkingSet(cloneSerialisable(learnerData) || {}, 'legacy');
    }
    throw error;
  }
}

async function readGrammarGameplayWorkingSet(db, accountId, learnerId, itemIds, {
  skipAccessCheck = false,
  subjectRecord = {},
} = {}) {
  if (!skipAccessCheck) {
    await requireLearnerWriteAccess(db, accountId, learnerId);
  }
  if (!await boundedGameplayTableAvailable(db, 'grammar')) {
    return markGameplayWorkingSet(cloneSerialisable(subjectRecord) || {}, 'legacy');
  }
  const workingItemIds = [...new Set((Array.isArray(itemIds) ? itemIds : [])
    .filter((itemId) => typeof itemId === 'string' && itemId))];
  if (!workingItemIds.length) {
    return markGameplayWorkingSet(composeGrammarGameplaySubjectRecord(subjectRecord, []), 'bounded');
  }
  try {
    const rows = await all(db, `
      SELECT item_id, mastery_json
      FROM grammar_item_state
      WHERE learner_id = ?
        AND item_id IN (SELECT value FROM json_each(?))
    `, [learnerId, JSON.stringify(workingItemIds)]);
    markBoundedGameplayTableAvailable(db, 'grammar');
    return markGameplayWorkingSet(composeGrammarGameplaySubjectRecord(subjectRecord, rows), 'bounded');
  } catch (error) {
    if (isMissingTableError(error, 'grammar_item_state')) {
      await requireLegacyGameplayFallbackAllowed(db, 'grammar', 'grammar_item_state', error);
      return markGameplayWorkingSet(cloneSerialisable(subjectRecord) || {}, 'legacy');
    }
    throw error;
  }
}

async function readReadingGameplayWorkingSet(db, accountId, learnerId, questionIds, {
  skipAccessCheck = false,
  subjectRecord = {},
} = {}) {
  if (!skipAccessCheck) {
    await requireLearnerWriteAccess(db, accountId, learnerId);
  }
  if (!await boundedGameplayTableAvailable(db, 'reading')) {
    return markGameplayWorkingSet(cloneSerialisable(subjectRecord) || {}, 'legacy');
  }
  const workingQuestionIds = [...new Set((Array.isArray(questionIds) ? questionIds : [])
    .filter((questionId) => typeof questionId === 'string' && questionId))];
  if (!workingQuestionIds.length) {
    return markGameplayWorkingSet(composeReadingGameplaySubjectRecord(subjectRecord, []), 'bounded');
  }
  try {
    const rows = await all(db, `
      SELECT question_id, mastery_json
      FROM reading_question_state
      WHERE learner_id = ?
        AND question_id IN (SELECT value FROM json_each(?))
    `, [learnerId, JSON.stringify(workingQuestionIds)]);
    markBoundedGameplayTableAvailable(db, 'reading');
    return markGameplayWorkingSet(composeReadingGameplaySubjectRecord(subjectRecord, rows), 'bounded');
  } catch (error) {
    if (isMissingTableError(error, 'reading_question_state')) {
      await requireLegacyGameplayFallbackAllowed(db, 'reading', 'reading_question_state', error);
      return markGameplayWorkingSet(cloneSerialisable(subjectRecord) || {}, 'legacy');
    }
    throw error;
  }
}

async function listPunctuationGameplayItemRows(db, learnerId, itemIds) {
  if (!await boundedGameplayTableAvailable(db, 'punctuation')) return null;
  const workingItemIds = [...new Set((Array.isArray(itemIds) ? itemIds : [])
    .filter((itemId) => typeof itemId === 'string' && itemId))];
  if (!workingItemIds.length) return [];
  try {
    const rows = await all(db, `
      SELECT item_id, state_json
      FROM punctuation_item_state
      WHERE learner_id = ?
        AND item_id IN (SELECT value FROM json_each(?))
    `, [learnerId, JSON.stringify(workingItemIds)]);
    markBoundedGameplayTableAvailable(db, 'punctuation');
    return rows;
  } catch (error) {
    // Deploy-order tolerance: before migration 0023 the complete item map is
    // still embedded in child_subject_state, so the composer can safely use it.
    if (isMissingTableError(error, 'punctuation_item_state')) {
      await requireLegacyGameplayFallbackAllowed(db, 'punctuation', 'punctuation_item_state', error);
      return null;
    }
    throw error;
  }
}

async function readPunctuationGameplayWorkingSet(db, accountId, learnerId, itemIds, {
  skipAccessCheck = false,
  subjectRecord = {},
  now = Date.now(),
} = {}) {
  if (!skipAccessCheck) {
    await requireLearnerWriteAccess(db, accountId, learnerId);
  }
  const rows = await listPunctuationGameplayItemRows(db, learnerId, itemIds);
  if (rows == null) return markGameplayWorkingSet(cloneSerialisable(subjectRecord) || {}, 'legacy');
  return markGameplayWorkingSet(composePunctuationGameplaySubjectRecord(subjectRecord, rows, now), 'bounded');
}

function subjectRuntimeRowToRecord(row) {
  if (!row) return normaliseSubjectStateRecord({});
  const ui = safeJsonParse(row.ui_json, null);
  const data = safeJsonParse(row.data_json, {});
  return {
    ui: isPlainObject(ui) ? ui : null,
    data: isPlainObject(data) ? data : {},
    updatedAt: asTs(row.updated_at, 0),
  };
}

async function readSpellingWordBankBundle(db, accountId, learnerId, filters, nowTs, env = {}) {
  if (!(typeof learnerId === 'string' && learnerId)) {
    throw new BadRequestError('Learner id is required for the spelling word bank.', {
      code: 'learner_id_required',
    });
  }
  const { snapshot } = await readSpellingRuntimeContentBundle(db, accountId, 'spelling', {
    includeAccountContent: false,
    nowMs: nowTs,
    env,
  });
  const runtimeRecord = await readSpellingCommandRuntimeBundle(db, accountId, learnerId);
  const workingData = await readSpellingGameplayWorkingSet(
    db,
    accountId,
    learnerId,
    (snapshot?.words || []).map((word) => word?.slug).filter(Boolean),
    {
      skipAccessCheck: true,
      learnerData: runtimeRecord.subjectRecord?.data || {},
      now: nowTs,
    },
  );
  return buildSpellingWordBankReadModel({
    learnerId,
    contentSnapshot: snapshot,
    data: workingData,
    filters,
    now: nowTs,
  });
}

async function readLearnerProjectionBundle(db, accountId, learnerId) {
  await requireLearnerWriteAccess(db, accountId, learnerId);
  const gameRows = await all(db, `
    SELECT learner_id, system_id, state_json, updated_at
    FROM child_game_state
    WHERE learner_id = ?
  `, [learnerId]);
  const eventRows = await all(db, `
    SELECT id, learner_id, subject_id, system_id, event_type, event_json, created_at
    FROM event_log
    WHERE learner_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `, [learnerId, PROJECTION_RECENT_EVENT_LIMIT]);
  const commandProjectionReadModel = await readLearnerReadModel(db, learnerId, COMMAND_PROJECTION_MODEL_KEY);

  return {
    gameState: Object.fromEntries(gameRows.map((row) => [row.system_id, gameStateRowToRecord(row)])),
    events: normaliseEventLog(sortEventRowsAscending(eventRows).map(eventRowToRecord).filter(Boolean)),
    readModels: {
      commandProjection: commandProjectionReadModel,
    },
  };
}

// U6: bounded-fallback rehydrate. Reads the current game state, the most
// recent PROJECTION_RECENT_EVENT_LIMIT events, and returns both. Throws the
// caller's error unchanged so `readLearnerProjectionInput` can classify the
// failure path.
async function readLearnerProjectionBoundedFallback(db, learnerId) {
  const gameRows = await all(db, `
    SELECT learner_id, system_id, state_json, updated_at
    FROM child_game_state
    WHERE learner_id = ?
  `, [learnerId]);
  const eventRows = await all(db, `
    SELECT id, learner_id, subject_id, system_id, event_type, event_json, created_at
    FROM event_log
    WHERE learner_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `, [learnerId, PROJECTION_RECENT_EVENT_LIMIT]);
  const gameState = Object.fromEntries(gameRows.map((row) => [row.system_id, gameStateRowToRecord(row)]));
  const events = normaliseEventLog(
    sortEventRowsAscending(eventRows).map(eventRowToRecord).filter(Boolean),
  );
  return { gameState, events };
}

/**
 * U6 hot-path projection reader. Returns one of:
 *   - `{mode: 'hit', projection, sourceRevision, rawRow}` — persisted row
 *     present and `sourceRevision >= currentRevision - PROJECTION_RECENT_EVENT_LIMIT`
 *   - `{mode: 'miss-rehydrated', projection, sourceRevision, fallbackDurationMs,
 *       bootstrap: {gameState, events}}` — row absent or unusable; bounded
 *     200-event fallback rebuilt the read surface
 *   - `{mode: 'stale-catchup', projection, sourceRevision, fallbackDurationMs,
 *       bootstrap: {gameState, events}}` — row present but stale; bounded
 *     catch-up refreshed it
 *   - `{mode: 'newer-opaque', projection, sourceRevision, rawRow}` — persisted
 *     row version is newer than reader knows; command continues without the
 *     tokens optimisation and MUST NOT overwrite the row
 *
 * Throws `ProjectionUnavailableError` when the persisted row is missing AND
 * the bounded fallback itself fails.
 */
async function readLearnerProjectionInput(db, accountId, learnerId, {
  currentRevision = 0,
  now = Date.now,
  // U6 hot-path optimisation: when the caller has already verified
  // writable-learner access (e.g. `runSubjectCommandMutation` did it
  // on entry), allow skipping the per-call `account_learner_memberships`
  // SELECT to keep the per-command query count within the ≤12 budget.
  // External callers (public API, admin paths) MUST omit this flag.
  skipAccessCheck = false,
} = {}) {
  if (!skipAccessCheck) {
    await requireLearnerWriteAccess(db, accountId, learnerId);
  }
  const readerVersion = COMMAND_PROJECTION_SCHEMA_VERSION;
  const effectiveRevision = Math.max(0, Number(currentRevision) || 0);
  const minAcceptableRevision = Math.max(0, effectiveRevision - PROJECTION_RECENT_EVENT_LIMIT);
  const startFallback = () => {
    const ts = typeof now === 'function' ? Number(now()) : Number(now);
    return Number.isFinite(ts) ? ts : Date.now();
  };

  const existingRow = await readLearnerReadModel(db, learnerId, COMMAND_PROJECTION_MODEL_KEY);
  const missing = !existingRow || existingRow.missing;
  const rawPayload = missing ? null : existingRow.model;
  const normalised = rawPayload
    ? normaliseCommandProjectionPayload(rawPayload, { fallbackVersion: 0 })
    : null;
  const persistedVersion = normalised ? Number(normalised.version) || 0 : 0;
  const persistedRevision = existingRow ? Number(existingRow.sourceRevision) || 0 : 0;
  // U6 round 1 fix (adv-u6-r1-001): a pre-U6 writer persisted the `v1`
  // shape WITHOUT the `recentEventTokens` field (U6 added the field
  // additively). The reader cannot ride the hit path with that row — its
  // normalised tokens would collapse to `[]` and `combineCommandEvents`
  // would admit a duplicate reward event during the single-command
  // migration window. Detect the field's absence (not emptiness; a fresh
  // row may legitimately have `[]` when the learner has no events) and
  // degrade to `miss-rehydrated` so the bounded fallback repopulates the
  // ring on first touch. Self-heals after one command.
  const hasTokenField = !missing && rawPayload && typeof rawPayload === 'object'
    && Object.prototype.hasOwnProperty.call(rawPayload, 'recentEventTokens')
    && Array.isArray(rawPayload.recentEventTokens);
  const preU6MigrationRow = !missing
    && persistedVersion === readerVersion
    && !hasTokenField;

  // Rollback safety: persisted writer is newer than this reader. Never
  // overwrite; hand the caller an opaque input so the command runs without
  // the token-dedupe optimisation.
  if (!missing && persistedVersion > readerVersion) {
    return {
      mode: 'newer-opaque',
      projection: normalised,
      sourceRevision: persistedRevision,
      rawRow: existingRow,
    };
  }

  // Happy path: row present, version compatible, not too stale, AND
  // carries the populated token ring (guard against pre-U6 rows that
  // stamped `version: 1` but never wrote `recentEventTokens`).
  if (!missing
    && persistedVersion === readerVersion
    && persistedRevision >= minAcceptableRevision
    && !preU6MigrationRow
  ) {
    return {
      mode: 'hit',
      projection: normalised,
      sourceRevision: persistedRevision,
      rawRow: existingRow,
    };
  }

  // Migration path: persisted older than reader. Treat as miss-rehydrated
  // and rebuild from the bounded fallback so the next write upgrades the
  // row to the current shape.
  const fallbackStartedAt = startFallback();
  let bootstrap;
  try {
    bootstrap = await readLearnerProjectionBoundedFallback(db, learnerId);
  } catch (error) {
    throw new ProjectionUnavailableError(
      'Command projection bounded fallback rejected.',
      { cause: error?.message || 'unknown', learnerId },
    );
  }
  const fallbackDurationMs = Math.max(0, startFallback() - fallbackStartedAt);

  // Two sub-cases for miss-rehydrated vs stale-catchup.
  const isStaleCatchup = !missing && persistedVersion <= readerVersion && persistedRevision < minAcceptableRevision;
  const fallbackProjection = {
    version: readerVersion,
    rewards: {
      systemId: PUBLIC_MONSTER_CODEX_SYSTEM_ID,
      state: cloneSerialisable(bootstrap.gameState?.[PUBLIC_MONSTER_CODEX_SYSTEM_ID]) || {},
      events: [],
      toastEvents: [],
    },
    eventCounts: { domain: 0, reactions: 0, toasts: 0 },
    recentEventTokens: bootstrap.events
      .map((event) => eventTokenForDedupe(event))
      .filter((token) => typeof token === 'string' && token)
      .slice(-RECENT_EVENT_TOKEN_RING_LIMIT),
  };

  return {
    mode: isStaleCatchup ? 'stale-catchup' : 'miss-rehydrated',
    projection: fallbackProjection,
    sourceRevision: persistedRevision,
    fallbackDurationMs,
    bootstrap,
    rawRow: existingRow,
  };
}

function uniqueStringList(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .filter((entry) => typeof entry === 'string' && entry))];
}

async function readLearnerEventLogEvents(db, accountId, learnerId, {
  ids = [],
  eventTypes = [],
  skipAccessCheck = false,
} = {}) {
  if (!skipAccessCheck) {
    await requireLearnerWriteAccess(db, accountId, learnerId);
  }
  const safeIds = uniqueStringList(ids);
  const safeEventTypes = uniqueStringList(eventTypes);
  if (!safeIds.length && !safeEventTypes.length) return [];

  const clauses = ['learner_id = ?'];
  const params = [learnerId];
  if (safeIds.length) {
    clauses.push(`id IN (${sqlPlaceholders(safeIds.length)})`);
    params.push(...safeIds);
  }
  if (safeEventTypes.length) {
    clauses.push(`event_type IN (${sqlPlaceholders(safeEventTypes.length)})`);
    params.push(...safeEventTypes);
  }

  const rows = await all(db, `
    SELECT id, learner_id, subject_id, system_id, event_type, event_json, created_at
    FROM event_log
    WHERE ${clauses.join(' AND ')}
    ORDER BY created_at ASC, id ASC
  `, params);
  return rows.map(eventRowToRecord).filter(Boolean);
}

function guardedValueSource(valueCount, guard) {
  const placeholders = sqlPlaceholders(valueCount);
  if (!guard) return `VALUES (${placeholders})`;
  return `SELECT ${placeholders}
    WHERE EXISTS (
      SELECT 1
      FROM learner_profiles
      WHERE id = ?
        AND state_revision = ?
    )`;
}

function guardedExistsValueSource(valueCount, existsSql) {
  return `SELECT ${sqlPlaceholders(valueCount)}
    WHERE EXISTS (
      ${existsSql}
    )`;
}

function guardedParams(params, guard) {
  if (!guard) return params;
  return [...params, guard.learnerId, guard.expectedRevision];
}

function guardedExistsParams(params, exists) {
  return [...params, ...(Array.isArray(exists?.params) ? exists.params : [])];
}

function guardedWhere(guard) {
  if (!guard) return '';
  return `
          AND EXISTS (
            SELECT 1
            FROM learner_profiles
            WHERE id = ?
              AND state_revision = ?
          )`;
}

function buildSpellingGameplayStateStatements(db, accountId, learnerId, runtime, nowTs, guard) {
  const statements = [];
  const nextLearnerData = spellingLearnerData(runtime?.data || {});
  const nextStats = parseSpellingGameplayStats(runtime?.spellingGameplay?.stats || {});
  const learnerParams = [
    learnerId,
    JSON.stringify(runtime?.state || null),
    JSON.stringify(nextLearnerData),
    JSON.stringify(nextStats),
    nowTs,
    accountId,
  ];
  statements.push(bindStatement(db, `
    INSERT INTO spelling_learner_state (
      learner_id,
      ui_json,
      data_json,
      stats_json,
      updated_at,
      updated_by_account_id
    )
    ${guardedValueSource(learnerParams.length, guard)}
    ON CONFLICT(learner_id) DO UPDATE SET
      ui_json = excluded.ui_json,
      data_json = excluded.data_json,
      stats_json = excluded.stats_json,
      updated_at = excluded.updated_at,
      updated_by_account_id = excluded.updated_by_account_id
  `, guardedParams(learnerParams, guard)));

  if (runtime?.spellingGameplay?.resetAllItems === true) {
    statements.push(bindStatement(db, `
      DELETE FROM spelling_item_state
      WHERE learner_id = ?
      ${guardedWhere(guard)}
    `, guardedParams([learnerId], guard)));
    statements.push(bindStatement(db, `
      DELETE FROM spelling_achievement_state
      WHERE learner_id = ?
      ${guardedWhere(guard)}
    `, guardedParams([learnerId], guard)));
  }

  const changedItems = changedSpellingGameplayItems(
    runtime?.spellingGameplay?.resetAllItems === true
      ? {}
      : runtime?.spellingGameplay?.previousData || {},
    runtime?.data || {},
  );
  for (const item of changedItems) {
    if (!item.progress && !item.guardian && !item.pattern) {
      statements.push(bindStatement(db, `
        DELETE FROM spelling_item_state
        WHERE learner_id = ? AND slug = ?
        ${guardedWhere(guard)}
      `, guardedParams([learnerId, item.slug], guard)));
      continue;
    }
    const itemParams = [
      learnerId,
      item.slug,
      item.progress ? JSON.stringify(item.progress) : null,
      item.guardian ? JSON.stringify(item.guardian) : null,
      item.pattern ? JSON.stringify(item.pattern) : null,
      nowTs,
      accountId,
    ];
    statements.push(bindStatement(db, `
      INSERT INTO spelling_item_state (
        learner_id,
        slug,
        progress_json,
        guardian_json,
        pattern_json,
        updated_at,
        updated_by_account_id
      )
      ${guardedValueSource(itemParams.length, guard)}
      ON CONFLICT(learner_id, slug) DO UPDATE SET
        progress_json = excluded.progress_json,
        guardian_json = excluded.guardian_json,
        pattern_json = excluded.pattern_json,
        updated_at = excluded.updated_at,
        updated_by_account_id = excluded.updated_by_account_id
    `, guardedParams(itemParams, guard)));
  }
  const changedAchievements = changedSpellingAchievementRows(
    runtime?.spellingGameplay?.resetAllItems === true
      ? {}
      : runtime?.spellingGameplay?.previousData || {},
    runtime?.data || {},
  );
  for (const achievement of changedAchievements) {
    const achievementParams = [
      learnerId,
      achievement.achievementId,
      JSON.stringify(achievement.record),
      nowTs,
      accountId,
    ];
    statements.push(bindStatement(db, `
      INSERT INTO spelling_achievement_state (
        learner_id, achievement_id, record_json, updated_at, updated_by_account_id
      )
      ${guardedValueSource(achievementParams.length, guard)}
      ON CONFLICT(learner_id, achievement_id) DO UPDATE SET
        record_json = excluded.record_json,
        updated_at = excluded.updated_at,
        updated_by_account_id = excluded.updated_by_account_id
    `, guardedParams(achievementParams, guard)));
  }
  return statements;
}

function buildGrammarGameplayItemStatements(db, accountId, learnerId, runtime, nowTs, guard) {
  const statements = [];
  if (runtime?.grammarGameplay?.resetAllItems === true) {
    statements.push(bindStatement(db, `
      DELETE FROM grammar_item_state
      WHERE learner_id = ?
      ${guardedWhere(guard)}
    `, guardedParams([learnerId], guard)));
  }

  const changedItems = changedGrammarGameplayItems(
    runtime?.grammarGameplay?.resetAllItems === true
      ? {}
      : runtime?.grammarGameplay?.previousData || {},
    runtime?.data || {},
  );
  for (const item of changedItems) {
    if (!item.mastery) {
      statements.push(bindStatement(db, `
        DELETE FROM grammar_item_state
        WHERE learner_id = ? AND item_id = ?
        ${guardedWhere(guard)}
      `, guardedParams([learnerId, item.itemId], guard)));
      continue;
    }
    const params = [
      learnerId,
      item.itemId,
      JSON.stringify(item.mastery),
      nowTs,
      accountId,
    ];
    statements.push(bindStatement(db, `
      INSERT INTO grammar_item_state (
        learner_id,
        item_id,
        mastery_json,
        updated_at,
        updated_by_account_id
      )
      ${guardedValueSource(params.length, guard)}
      ON CONFLICT(learner_id, item_id) DO UPDATE SET
        mastery_json = excluded.mastery_json,
        updated_at = excluded.updated_at,
        updated_by_account_id = excluded.updated_by_account_id
    `, guardedParams(params, guard)));
  }
  return statements;
}

function buildReadingGameplayQuestionStatements(db, accountId, learnerId, runtime, nowTs, guard) {
  const statements = [];
  if (runtime?.readingGameplay?.resetAllQuestions === true) {
    statements.push(bindStatement(db, `
      DELETE FROM reading_question_state
      WHERE learner_id = ?
      ${guardedWhere(guard)}
    `, guardedParams([learnerId], guard)));
  }

  const changedQuestions = changedReadingGameplayQuestions(
    runtime?.readingGameplay?.resetAllQuestions === true
      ? {}
      : runtime?.readingGameplay?.previousData || {},
    runtime?.data || {},
  );
  for (const question of changedQuestions) {
    if (!question.mastery) {
      statements.push(bindStatement(db, `
        DELETE FROM reading_question_state
        WHERE learner_id = ? AND question_id = ?
        ${guardedWhere(guard)}
      `, guardedParams([learnerId, question.questionId], guard)));
      continue;
    }
    const params = [
      learnerId,
      question.questionId,
      JSON.stringify(question.mastery),
      nowTs,
      accountId,
    ];
    statements.push(bindStatement(db, `
      INSERT INTO reading_question_state (
        learner_id, question_id, mastery_json, updated_at, updated_by_account_id
      )
      ${guardedValueSource(params.length, guard)}
      ON CONFLICT(learner_id, question_id) DO UPDATE SET
        mastery_json = excluded.mastery_json,
        updated_at = excluded.updated_at,
        updated_by_account_id = excluded.updated_by_account_id
    `, guardedParams(params, guard)));
  }
  return statements;
}

function buildPunctuationGameplayItemStatements(db, accountId, learnerId, runtime, nowTs, guard) {
  const statements = [];
  if (runtime?.punctuationGameplay?.resetAllItems === true) {
    statements.push(bindStatement(db, `
      DELETE FROM punctuation_item_state
      WHERE learner_id = ?
      ${guardedWhere(guard)}
    `, guardedParams([learnerId], guard)));
  }

  const changedItems = changedPunctuationGameplayItems(
    runtime?.punctuationGameplay?.resetAllItems === true
      ? {}
      : runtime?.punctuationGameplay?.previousData || {},
    runtime?.data || {},
  );
  for (const item of changedItems) {
    if (!item.state) {
      statements.push(bindStatement(db, `
        DELETE FROM punctuation_item_state
        WHERE learner_id = ? AND item_id = ?
        ${guardedWhere(guard)}
      `, guardedParams([learnerId, item.itemId], guard)));
      continue;
    }
    const params = [
      learnerId,
      item.itemId,
      JSON.stringify(item.state),
      nowTs,
      accountId,
    ];
    statements.push(bindStatement(db, `
      INSERT INTO punctuation_item_state (
        learner_id, item_id, state_json, updated_at, updated_by_account_id
      )
      ${guardedValueSource(params.length, guard)}
      ON CONFLICT(learner_id, item_id) DO UPDATE SET
        state_json = excluded.state_json,
        updated_at = excluded.updated_at,
        updated_by_account_id = excluded.updated_by_account_id
    `, guardedParams(params, guard)));
  }
  return statements;
}

/**
 * Replace a complete spelling snapshot without producing one D1 statement per
 * word. This path is reserved for legacy import/admin tools; ordinary gameplay
 * writes only the changed item rows above. SQLite expands the JSON once inside
 * the atomic batch, so even a very old profile has constant Worker-side work.
 */
function buildSpellingFullReplacementStatements(db, accountId, learnerId, record, nowTs, guard = null) {
  const next = normaliseSubjectStateRecord(record);
  const dataJson = JSON.stringify(next.data || {});
  const learnerData = spellingLearnerData(next.data || {});
  const stats = compactSpellingStatsFromData(next.data || {}, nowTs);
  const learnerParams = [
    learnerId,
    JSON.stringify(next.ui),
    JSON.stringify(learnerData),
    JSON.stringify(stats),
    nowTs,
    accountId,
  ];
  return [
    bindStatement(db, `
      INSERT INTO spelling_learner_state (
        learner_id, ui_json, data_json, stats_json, updated_at, updated_by_account_id
      )
      ${guardedValueSource(learnerParams.length, guard)}
      ON CONFLICT(learner_id) DO UPDATE SET
        ui_json = excluded.ui_json,
        data_json = excluded.data_json,
        stats_json = excluded.stats_json,
        updated_at = excluded.updated_at,
        updated_by_account_id = excluded.updated_by_account_id
    `, guardedParams(learnerParams, guard)),
    bindStatement(db, `
      DELETE FROM spelling_item_state
      WHERE learner_id = ?
      ${guardedWhere(guard)}
    `, guardedParams([learnerId], guard)),
    bindStatement(db, `
      DELETE FROM spelling_achievement_state
      WHERE learner_id = ?
      ${guardedWhere(guard)}
    `, guardedParams([learnerId], guard)),
    bindStatement(db, `
      WITH
        source(data_json) AS (SELECT ?),
        progress AS (
          SELECT item.key AS slug, item.value AS value
          FROM source, json_each(source.data_json, '$.progress') AS item
          WHERE item.key <> '' AND json_type(item.value) = 'object'
        ),
        guardian AS (
          SELECT item.key AS slug, item.value AS value
          FROM source, json_each(source.data_json, '$.guardian') AS item
          WHERE item.key <> '' AND json_type(item.value) = 'object'
        ),
        pattern AS (
          SELECT item.key AS slug, item.value AS value
          FROM source, json_each(source.data_json, '$.pattern.wobbling') AS item
          WHERE item.key <> '' AND json_type(item.value) = 'object'
        ),
        item_keys AS (
          SELECT slug FROM progress
          UNION SELECT slug FROM guardian
          UNION SELECT slug FROM pattern
        )
      INSERT INTO spelling_item_state (
        learner_id, slug, progress_json, guardian_json, pattern_json,
        updated_at, updated_by_account_id
      )
      SELECT
        ?, item_keys.slug,
        CASE WHEN progress.value IS NOT NULL THEN json(progress.value) ELSE NULL END,
        CASE WHEN guardian.value IS NOT NULL THEN json(guardian.value) ELSE NULL END,
        CASE WHEN pattern.value IS NOT NULL THEN json(pattern.value) ELSE NULL END,
        ?, ?
      FROM item_keys
      LEFT JOIN progress ON progress.slug = item_keys.slug
      LEFT JOIN guardian ON guardian.slug = item_keys.slug
      LEFT JOIN pattern ON pattern.slug = item_keys.slug
      ${guard ? `
        WHERE EXISTS (
          SELECT 1
          FROM learner_profiles
          WHERE id = ? AND state_revision = ?
        )
      ` : ''}
    `, [
      dataJson,
      learnerId,
      nowTs,
      accountId,
      ...(guard ? [guard.learnerId, guard.expectedRevision] : []),
    ]),
    bindStatement(db, `
      WITH source(data_json) AS (SELECT ?)
      INSERT INTO spelling_achievement_state (
        learner_id, achievement_id, record_json, updated_at, updated_by_account_id
      )
      SELECT ?, item.key, json(item.value), ?, ?
      FROM source, json_each(source.data_json, '$.achievements') AS item
      WHERE item.key <> ''
        AND json_type(item.value) = 'object'
        ${guard ? `
          AND EXISTS (
            SELECT 1
            FROM learner_profiles
            WHERE id = ? AND state_revision = ?
          )
        ` : ''}
    `, [
      dataJson,
      learnerId,
      nowTs,
      accountId,
      ...(guard ? [guard.learnerId, guard.expectedRevision] : []),
    ]),
  ];
}

/** Full-snapshot equivalent for Grammar's generated item mastery. */
function buildGrammarFullReplacementStatements(db, accountId, learnerId, record, nowTs) {
  const next = normaliseSubjectStateRecord(record);
  const boundedUi = grammarStateWithoutItemMastery(next.ui);
  const boundedData = grammarStateWithoutItemMastery(next.data);
  return [
    bindStatement(db, `
      INSERT INTO child_subject_state (
        learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id
      )
      VALUES (?, 'grammar', ?, ?, ?, ?)
      ON CONFLICT(learner_id, subject_id) DO UPDATE SET
        ui_json = excluded.ui_json,
        data_json = excluded.data_json,
        updated_at = excluded.updated_at,
        updated_by_account_id = excluded.updated_by_account_id
    `, [learnerId, JSON.stringify(boundedUi), JSON.stringify(boundedData), nowTs, accountId]),
    bindStatement(db, 'DELETE FROM grammar_item_state WHERE learner_id = ?', [learnerId]),
    bindStatement(db, `
      WITH
        source(data_json, ui_json) AS (SELECT ?, ?),
        data_items AS (
          SELECT item.key AS item_id, item.value AS mastery
          FROM source, json_each(source.data_json, '$.mastery.items') AS item
          WHERE item.key <> '' AND json_type(item.value) = 'object'
        ),
        ui_items AS (
          SELECT item.key AS item_id, item.value AS mastery
          FROM source, json_each(source.ui_json, '$.mastery.items') AS item
          WHERE item.key <> '' AND json_type(item.value) = 'object'
        ),
        items AS (
          SELECT item_id, mastery FROM data_items
          UNION ALL
          SELECT ui_items.item_id, ui_items.mastery
          FROM ui_items
          WHERE NOT EXISTS (
            SELECT 1 FROM data_items WHERE data_items.item_id = ui_items.item_id
          )
        )
      INSERT INTO grammar_item_state (
        learner_id, item_id, mastery_json, updated_at, updated_by_account_id
      )
      SELECT ?, item_id, json(mastery), ?, ? FROM items
    `, [JSON.stringify(next.data || {}), JSON.stringify(next.ui || {}), learnerId, nowTs, accountId]),
  ];
}

/** Full-snapshot equivalent for Reading's per-question mastery. */
function buildReadingFullReplacementStatements(db, accountId, learnerId, record, nowTs) {
  const next = normaliseSubjectStateRecord(record);
  const boundedData = readingStateWithoutQuestionMastery(next.data);
  return [
    bindStatement(db, `
      INSERT INTO child_subject_state (
        learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id
      )
      VALUES (?, 'reading', ?, ?, ?, ?)
      ON CONFLICT(learner_id, subject_id) DO UPDATE SET
        ui_json = excluded.ui_json,
        data_json = excluded.data_json,
        updated_at = excluded.updated_at,
        updated_by_account_id = excluded.updated_by_account_id
    `, [learnerId, JSON.stringify(next.ui), JSON.stringify(boundedData), nowTs, accountId]),
    bindStatement(db, 'DELETE FROM reading_question_state WHERE learner_id = ?', [learnerId]),
    bindStatement(db, `
      WITH source(data_json) AS (SELECT ?)
      INSERT INTO reading_question_state (
        learner_id, question_id, mastery_json, updated_at, updated_by_account_id
      )
      SELECT ?, item.key, json(item.value), ?, ?
      FROM source, json_each(source.data_json, '$.questions') AS item
      WHERE item.key <> '' AND json_type(item.value) = 'object'
    `, [JSON.stringify(next.data || {}), learnerId, nowTs, accountId]),
  ];
}

/** Full-snapshot equivalent for Punctuation's per-item memory map. */
function buildPunctuationFullReplacementStatements(db, accountId, learnerId, record, nowTs) {
  const next = normaliseSubjectStateRecord(record);
  const boundedData = punctuationStateWithoutItemMastery(next.data, nowTs);
  return [
    bindStatement(db, `
      INSERT INTO child_subject_state (
        learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id
      )
      VALUES (?, 'punctuation', ?, ?, ?, ?)
      ON CONFLICT(learner_id, subject_id) DO UPDATE SET
        ui_json = excluded.ui_json,
        data_json = excluded.data_json,
        updated_at = excluded.updated_at,
        updated_by_account_id = excluded.updated_by_account_id
    `, [learnerId, JSON.stringify(next.ui), JSON.stringify(boundedData), nowTs, accountId]),
    bindStatement(db, 'DELETE FROM punctuation_item_state WHERE learner_id = ?', [learnerId]),
    bindStatement(db, `
      WITH source(data_json) AS (SELECT ?)
      INSERT INTO punctuation_item_state (
        learner_id, item_id, state_json, updated_at, updated_by_account_id
      )
      SELECT ?, item.key, json(item.value), ?, ?
      FROM source, json_each(source.data_json, '$.progress.items') AS item
      WHERE item.key <> '' AND json_type(item.value) = 'object'
    `, [JSON.stringify(next.data || {}), learnerId, nowTs, accountId]),
  ];
}

const SUBJECT_GAMEPLAY_STORES = Object.freeze({
  grammar: Object.freeze({ runtimeSlot: 'grammarGameplay', kind: 'generated-items', table: 'grammar_item_state', tables: ['grammar_item_state'] }),
  punctuation: Object.freeze({ runtimeSlot: 'punctuationGameplay', kind: 'punctuation-items', table: 'punctuation_item_state', tables: ['punctuation_item_state'] }),
  reading: Object.freeze({ runtimeSlot: 'readingGameplay', kind: 'reading-questions', table: 'reading_question_state', tables: ['reading_question_state'] }),
  spelling: Object.freeze({
    runtimeSlot: 'spellingGameplay',
    kind: 'word-items',
    table: 'spelling_item_state',
    tables: ['spelling_learner_state', 'spelling_item_state', 'spelling_achievement_state'],
  }),
});

const boundedGameplayTableCache = new WeakMap();

function markBoundedGameplayTableAvailable(db, subjectId) {
  const cacheKey = underlyingDbHandle(db);
  if (!cacheKey) return;
  const subjects = boundedGameplayTableCache.get(cacheKey) || new Set();
  subjects.add(subjectId);
  boundedGameplayTableCache.set(cacheKey, subjects);
}

function boundedGameplayTableKnownAvailable(db, subjectId) {
  return boundedGameplayTableCache.get(underlyingDbHandle(db))?.has(subjectId) === true;
}

function boundedGameplayStoreUnavailable(subjectId, tableName, cause) {
  return new BackendUnavailableError(
    `Bounded ${subjectId} gameplay state is unavailable.`,
    {
      code: 'bounded_gameplay_state_unavailable',
      subjectId,
      tableName,
      retryable: true,
      retryAfterSeconds: 5,
      cause: cause?.message || String(cause || 'missing gameplay table'),
    },
  );
}

async function requireBoundedSpellingLearnerState(db, learnerId, rowPresent, ready = null) {
  if (rowPresent) return;
  const boundedReady = ready === null
    ? await boundedGameplayTableAvailable(db, 'spelling')
    : Boolean(ready);
  if (!boundedReady) return;
  throw boundedGameplayStoreUnavailable(
    'spelling',
    'spelling_learner_state',
    new Error(`ready marker exists but learner row is missing for ${learnerId}`),
  );
}

async function requireExistingBoundedSpellingLearnerState(db, learnerId) {
  const row = await first(
    db,
    'SELECT 1 AS present FROM spelling_learner_state WHERE learner_id = ?',
    [learnerId],
  );
  await requireBoundedSpellingLearnerState(db, learnerId, Number(row?.present) === 1, true);
}

function bindResetBoundedSpellingLearnerState(db, accountId, learnerId, nowTs) {
  return bindStatement(db, `
    UPDATE spelling_learner_state
    SET ui_json = ?,
        data_json = ?,
        stats_json = ?,
        updated_at = ?,
        updated_by_account_id = ?
    WHERE learner_id = ?
  `, [
    'null',
    JSON.stringify(spellingLearnerData({})),
    JSON.stringify(compactSpellingStatsFromData({}, nowTs)),
    nowTs,
    accountId,
    learnerId,
  ]);
}

/**
 * A missing split table is deploy-order compatible only before the readiness
 * marker exists. Once 0023 says ready, falling back to the compact legacy row
 * would silently create two authorities and lose writes.
 */
async function requireLegacyGameplayFallbackAllowed(db, subjectId, tableName, cause) {
  if (boundedGameplayTableKnownAvailable(db, subjectId)) {
    throw boundedGameplayStoreUnavailable(subjectId, tableName, cause);
  }
  try {
    const readiness = await first(db, `
      SELECT state
      FROM bounded_gameplay_state_migrations
      WHERE migration_id = '0023'
      LIMIT 1
    `);
    if (readiness?.state === 'ready') {
      markBoundedGameplayTableAvailable(db, subjectId);
      throw boundedGameplayStoreUnavailable(subjectId, tableName, cause);
    }
  } catch (readinessError) {
    if (readinessError instanceof BackendUnavailableError) throw readinessError;
    if (isMissingTableError(readinessError, 'bounded_gameplay_state_migrations')) return;
    throw readinessError;
  }
}

async function boundedGameplayTableAvailable(db, subjectId) {
  const store = SUBJECT_GAMEPLAY_STORES[subjectId];
  if (!store) return false;
  if (boundedGameplayTableKnownAvailable(db, subjectId)) return true;
  try {
    const expectedTables = Array.isArray(store.tables) ? store.tables : [store.table];
    const tablePlaceholders = expectedTables.map(() => '?').join(', ');
    const readiness = await first(db, `
      SELECT
        state,
        (
          SELECT COUNT(*)
          FROM sqlite_schema
          WHERE type = 'table' AND name IN (${tablePlaceholders})
        ) AS gameplay_table_count
      FROM bounded_gameplay_state_migrations
      WHERE migration_id = '0023'
      LIMIT 1
    `, expectedTables);
    if (readiness?.state !== 'ready') return false;
    if (Number(readiness.gameplay_table_count) !== expectedTables.length) {
      throw boundedGameplayStoreUnavailable(
        subjectId,
        expectedTables.join(', '),
        new Error('readiness marker exists but a bounded gameplay table is missing'),
      );
    }
    markBoundedGameplayTableAvailable(db, subjectId);
    return true;
  } catch (error) {
    if (isMissingTableError(error, 'bounded_gameplay_state_migrations')) return false;
    throw error;
  }
}

async function boundedGameplayStoresAvailable(db, subjectIds) {
  for (const subjectId of subjectIds) {
    if (!await boundedGameplayTableAvailable(db, subjectId)) return false;
  }
  return true;
}

async function runtimeForAvailableGameplayStore(db, subjectId, runtime) {
  const store = SUBJECT_GAMEPLAY_STORES[subjectId];
  if (!store || !isPlainObject(runtime?.[store.runtimeSlot])) return runtime;
  if (await boundedGameplayTableAvailable(db, subjectId)) return runtime;
  const fallback = { ...(runtime || {}) };
  delete fallback[store.runtimeSlot];
  return fallback;
}

function activeSubjectGameplayStore(subjectId, runtime) {
  const store = SUBJECT_GAMEPLAY_STORES[subjectId] || null;
  return store && isPlainObject(runtime?.[store.runtimeSlot]) ? store : null;
}

function buildSubjectRuntimePersistencePlan(db, accountId, learnerId, subjectId, runtime, nowTs, {
  guard = null,
  includeCapacityReadModels = true,
  persistEventLog = true,
  persistActivityFeed = true,
  // U6: caller passes the projection input it already loaded so the
  // persisted token ring inherits the prior `recentEventTokens` set and
  // any non-v1 fields from a newer writer are preserved rather than
  // silently deleted on overwrite.
  projectionContext = null,
  // U6 queryCount budget: when the caller knows the current latest
  // active session id (loaded via readSubjectRuntime earlier in the
  // request), skip the "abandon siblings" UPDATE when the runtime
  // write targets the SAME session id. The UPDATE has no effect in
  // that case but still counts towards queryCount on the hot path.
  currentActiveSessionId = null,
  // U6 round 1 fix (adv-u6-r1-002): when the CAS retry path enters the
  // "concurrent-retry-exhausted" degraded mode, the final batch skips
  // the projection read-model write so the primary state can still
  // land. A subsequent command will repopulate the projection via
  // `stale-catchup`.
  skipProjectionReadModelWrite = false,
  skipActivePracticeSessionWrite = false,
  activePracticeSessionKnownAbsent = false,
} = {}) {
  const gameplayStore = activeSubjectGameplayStore(subjectId, runtime);
  const nextState = normaliseSubjectStateRecord({
    ui: gameplayStore?.kind === 'generated-items'
      ? grammarStateWithoutItemMastery(runtime?.state)
      : runtime?.state || null,
    data: gameplayStore?.kind === 'word-items'
      ? spellingLearnerData(runtime?.data || {})
      : gameplayStore?.kind === 'generated-items'
        ? grammarStateWithoutItemMastery(runtime?.data)
        : gameplayStore?.kind === 'reading-questions'
          ? readingStateWithoutQuestionMastery(runtime?.data)
          : gameplayStore?.kind === 'punctuation-items'
            ? punctuationStateWithoutItemMastery(runtime?.data, nowTs)
          : runtime?.data || {},
    updatedAt: nowTs,
  });
  const statements = [];

  if (gameplayStore?.kind === 'word-items') {
    statements.push(...buildSpellingGameplayStateStatements(
      db,
      accountId,
      learnerId,
      runtime,
      nowTs,
      guard,
    ));
  } else {
    const subjectParams = [
      learnerId,
      subjectId,
      JSON.stringify(nextState.ui),
      JSON.stringify(nextState.data),
      nowTs,
      accountId,
    ];
    statements.push(bindStatement(db, `
      INSERT INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id)
      ${guardedValueSource(subjectParams.length, guard)}
      ON CONFLICT(learner_id, subject_id) DO UPDATE SET
        ui_json = excluded.ui_json,
        data_json = excluded.data_json,
        updated_at = excluded.updated_at,
        updated_by_account_id = excluded.updated_by_account_id
    `, guardedParams(subjectParams, guard)));
  }
  if (gameplayStore?.kind === 'generated-items') {
    statements.push(...buildGrammarGameplayItemStatements(
      db,
      accountId,
      learnerId,
      runtime,
      nowTs,
      guard,
    ));
  }
  if (gameplayStore?.kind === 'reading-questions') {
    statements.push(...buildReadingGameplayQuestionStatements(
      db,
      accountId,
      learnerId,
      runtime,
      nowTs,
      guard,
    ));
  }
  if (gameplayStore?.kind === 'punctuation-items') {
    statements.push(...buildPunctuationGameplayItemStatements(
      db,
      accountId,
      learnerId,
      runtime,
      nowTs,
      guard,
    ));
  }

  const session = runtime?.practiceSession
    ? normalisePracticeSessionRecord(runtime.practiceSession)
    : null;
  if (session?.id && session.learnerId === learnerId && session.subjectId === subjectId) {
    const shouldSkipActivePracticeSessionWrite = skipActivePracticeSessionWrite && session.status === 'active';
    if (!shouldSkipActivePracticeSessionWrite) {
      // U6 queryCount budget: skip the no-op "abandon siblings" UPDATE
      // when the caller confirmed the current active session id is the
      // same one we are about to upsert. The UPDATE's `id <> ?` filter
      // means it would match zero rows in that case.
      const activeSessionKnownSame = typeof currentActiveSessionId === 'string'
        && currentActiveSessionId === session.id;
      const shouldEmitAbandon = session.status === 'active'
        && activePracticeSessionKnownAbsent !== true
        && !activeSessionKnownSame;
      if (shouldEmitAbandon) {
        statements.push(bindStatement(db, `
          UPDATE practice_sessions
          SET status = 'abandoned',
              updated_at = ?,
              updated_by_account_id = ?
          WHERE learner_id = ?
            AND subject_id = ?
            AND status = 'active'
            AND id <> ?
            ${guardedWhere(guard)}
        `, guardedParams([nowTs, accountId, learnerId, subjectId, session.id], guard)));
      }

      const createdAt = asTs(session.createdAt, nowTs);
      const updatedAt = asTs(session.updatedAt, nowTs);
      const sessionParams = [
        session.id,
        learnerId,
        subjectId,
        session.sessionKind,
        session.status,
        session.sessionState == null ? null : JSON.stringify(session.sessionState),
        session.summary == null ? null : JSON.stringify(session.summary),
        createdAt,
        updatedAt,
        accountId,
      ];
      statements.push(bindStatement(db, `
        INSERT INTO practice_sessions (
          id,
          learner_id,
          subject_id,
          session_kind,
          status,
          session_state_json,
          summary_json,
          created_at,
          updated_at,
          updated_by_account_id
        )
        ${guardedValueSource(sessionParams.length, guard)}
        ON CONFLICT(id) DO UPDATE SET
          learner_id = excluded.learner_id,
          subject_id = excluded.subject_id,
          session_kind = excluded.session_kind,
          status = excluded.status,
          session_state_json = excluded.session_state_json,
          summary_json = excluded.summary_json,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          updated_by_account_id = excluded.updated_by_account_id
      `, guardedParams(sessionParams, guard)));
    }
  }

  const gameState = runtime?.gameState && typeof runtime.gameState === 'object' && !Array.isArray(runtime.gameState)
    ? runtime.gameState
    : {};
  for (const [systemId, rawState] of Object.entries(gameState)) {
    if (!(typeof systemId === 'string' && systemId)) continue;
    const nextGameState = cloneSerialisable(rawState) || {};
    const gameParams = [learnerId, systemId, JSON.stringify(nextGameState), nowTs, accountId];
    statements.push(bindStatement(db, `
      INSERT INTO child_game_state (learner_id, system_id, state_json, updated_at, updated_by_account_id)
      ${guardedValueSource(gameParams.length, guard)}
      ON CONFLICT(learner_id, system_id) DO UPDATE SET
        state_json = excluded.state_json,
        updated_at = excluded.updated_at,
        updated_by_account_id = excluded.updated_by_account_id
    `, guardedParams(gameParams, guard)));
  }

  const events = Array.isArray(runtime?.events) ? runtime.events : [];
  const persistedEvents = [];
  for (const rawEvent of events) {
    const event = cloneSerialisable(rawEvent) || null;
    if (!event || typeof event !== 'object' || Array.isArray(event)) continue;
    const id = typeof event.id === 'string' && event.id ? event.id : uid('event');
    const createdAt = asTs(event.createdAt, nowTs);
    const eventType = typeof event.type === 'string' && event.type
      ? event.type
      : (typeof event.kind === 'string' && event.kind ? event.kind : 'event');
    event.id = id;
    event.learnerId = event.learnerId || learnerId;
    event.subjectId = event.subjectId || subjectId;
    event.createdAt = createdAt;
    persistedEvents.push(event);
    if (persistEventLog) {
      const eventParams = [
        id,
        event.learnerId,
        event.subjectId || null,
        event.systemId || null,
        eventType,
        JSON.stringify(event),
        createdAt,
        accountId,
      ];
      statements.push(bindStatement(db, `
        INSERT INTO event_log (id, learner_id, subject_id, system_id, event_type, event_json, created_at, actor_account_id)
        ${guardedValueSource(eventParams.length, guard)}
        ON CONFLICT(id) DO UPDATE SET
          learner_id = excluded.learner_id,
          subject_id = excluded.subject_id,
          system_id = excluded.system_id,
          event_type = excluded.event_type,
          event_json = excluded.event_json,
          created_at = excluded.created_at,
          actor_account_id = excluded.actor_account_id
      `, guardedParams(eventParams, guard)));
    }
    if (includeCapacityReadModels && persistActivityFeed) {
      const activityRow = activityFeedRowFromEventRecord(event, {
        id,
        learnerId: event.learnerId,
        subjectId: event.subjectId || null,
        systemId: event.systemId || null,
        eventType,
        createdAt,
        now: nowTs,
      });
      const activityStatement = bindLearnerActivityFeedUpsertStatement(db, activityRow, { guard });
      if (activityStatement) statements.push(activityStatement);
    }
  }
  // U6: always write the projection read model when the capacity tables
  // exist and `projectionContext` was supplied by the caller. A fresh
  // `start-session` may not emit any reward state yet, but the token ring
  // still accumulates so the next command can stay on the hot path. When
  // the caller did not supply `projectionContext` (legacy direct
  // `persistSubjectRuntime` callers), keep the Phase 1 behaviour of only
  // writing when monster-codex state is present so we do not drift the
  // schema unintentionally.
  const shouldWriteProjection = includeCapacityReadModels
    && !skipProjectionReadModelWrite
    && (
      projectionContext != null
      || Object.prototype.hasOwnProperty.call(gameState, PUBLIC_MONSTER_CODEX_SYSTEM_ID)
    );
  if (shouldWriteProjection) {
    const existingTokens = projectionContext?.projection?.recentEventTokens || [];
    // U6: `newer-opaque` MUST NOT overwrite — honour the rollback-safety
    // contract from the plan section.
    const previousProjection = projectionContext?.projection || null;
    const projectionMode = projectionContext?.mode || null;
    if (projectionMode !== 'newer-opaque') {
      const commandProjectionReadModel = commandProjectionReadModelFromRuntime(runtime, persistedEvents, nowTs, {
        existingTokens,
        previousProjection,
      });
      const readModelStatement = bindLearnerReadModelUpsertStatement(
        db,
        learnerId,
        COMMAND_PROJECTION_MODEL_KEY,
        commandProjectionReadModel,
        {
          sourceRevision: guard ? guard.expectedRevision + 1 : 0,
          generatedAt: nowTs,
          updatedAt: nowTs,
          guard,
        },
      );
      if (readModelStatement) statements.push(readModelStatement);
    }
  }

  const summary = {
    key: `${learnerId || 'default'}::${subjectId || 'unknown'}`,
    record: nextState,
    practiceSession: session,
    eventCount: persistedEvents.length,
    gameStateCount: Object.keys(gameState).length,
  };

  return { statements, summary };
}

async function persistSubjectRuntimeBundle(db, accountId, learnerId, subjectId, runtime, nowTs) {
  const includeCapacityReadModels = await capacityReadModelTablesAvailable(db);
  const compatibleRuntime = await runtimeForAvailableGameplayStore(db, subjectId, runtime);
  const plan = buildSubjectRuntimePersistencePlan(db, accountId, learnerId, subjectId, compatibleRuntime, nowTs, {
    includeCapacityReadModels,
  });
  await batch(db, plan.statements);
  return plan.summary;
}

async function writeLearnersSnapshot(db, accountId, snapshot, nowTs) {
  const next = normaliseLearnersSnapshot(snapshot);
  const currentRows = await listMembershipRows(db, accountId, { writableOnly: true });
  const currentMap = new Map(currentRows.map((row) => [row.id, row]));
  const incomingIds = next.allIds.filter((id) => Boolean(next.byId[id]));
  const statements = [];

  for (const [index, learnerId] of incomingIds.entries()) {
    const learner = next.byId[learnerId];
    if (!learner) continue;
    const existingMembership = currentMap.get(learnerId) || await ensureUniqueOrAccessibleLearnerId(db, accountId, learnerId);
    if (existingMembership) {
      if (!MEMBERSHIP_ROLES.has(existingMembership.role) || !writableRole(existingMembership.role)) {
        throw new ForbiddenError('Learner is not writable in this account scope.', { learnerId });
      }
      statements.push(bindStatement(db, `
        UPDATE learner_profiles
        SET name = ?, year_group = ?, avatar_color = ?, goal = ?, daily_minutes = ?, updated_at = ?
        WHERE id = ?
      `, [
        learner.name,
        learner.yearGroup,
        learner.avatarColor,
        learner.goal,
        learner.dailyMinutes,
        nowTs,
        learner.id,
      ]));
      statements.push(bindStatement(db, `
        UPDATE account_learner_memberships
        SET sort_index = ?, updated_at = ?
        WHERE account_id = ? AND learner_id = ?
      `, [index, nowTs, accountId, learner.id]));
      continue;
    }

    statements.push(bindStatement(db, `
      INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `, [
      learner.id,
      learner.name,
      learner.yearGroup,
      learner.avatarColor,
      learner.goal,
      learner.dailyMinutes,
      nowTs,
      nowTs,
    ]));
    statements.push(bindStatement(db, `
      INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
      VALUES (?, ?, 'owner', ?, ?, ?)
    `, [accountId, learner.id, index, nowTs, nowTs]));
  }

  await batch(db, statements);

  for (const row of currentRows) {
    if (incomingIds.includes(row.id)) continue;
    await releaseMembershipOrDeleteLearner(db, accountId, row.id, row.role, nowTs);
  }

  const selectedId = next.selectedId && incomingIds.includes(next.selectedId)
    ? next.selectedId
    : (incomingIds[0] || null);
  await run(db, 'UPDATE adult_accounts SET selected_learner_id = ?, updated_at = ? WHERE id = ?', [selectedId, nowTs, accountId]);
  // U7: any learner-list mutation (add, remove, rename, avatar-change) runs
  // through this path. Bumping here ensures the revision hash changes even
  // when `repo_revision` (the account CAS revision) happens to stay
  // stable for a non-mutation refresh.
  await bumpAccountLearnerListRevision(db, accountId, nowTs);
  return bootstrapBundle(db, accountId);
}

// withAccountMutation, withLearnerMutation → mutation-repository.js

async function readSubjectCommandPreflightRow(db, {
  accountId,
  learnerId,
  requestId,
}) {
  return first(db, `
    SELECT
      l.id AS learner_id,
      l.state_revision AS learner_state_revision,
      m.role AS membership_role,
      r.account_id AS receipt_account_id,
      r.request_id AS receipt_request_id,
      r.scope_type AS receipt_scope_type,
      r.scope_id AS receipt_scope_id,
      r.mutation_kind AS receipt_mutation_kind,
      r.request_hash AS receipt_request_hash,
      r.response_json AS receipt_response_json,
      r.status_code AS receipt_status_code,
      r.correlation_id AS receipt_correlation_id,
      r.applied_at AS receipt_applied_at
    FROM learner_profiles l
    LEFT JOIN account_learner_memberships m
      ON m.account_id = ? AND m.learner_id = l.id
    LEFT JOIN mutation_receipts r
      ON r.account_id = ? AND r.request_id = ?
    WHERE l.id = ?
  `, [accountId, accountId, requestId, learnerId]);
}

async function readSpellingSubjectCommandPreflightRow(db, {
  accountId,
  learnerId,
  requestId,
  modelKey,
}) {
  return first(db, `
    SELECT
      l.id AS learner_id,
      l.state_revision AS learner_state_revision,
      m.role AS membership_role,
      r.account_id AS receipt_account_id,
      r.request_id AS receipt_request_id,
      r.scope_type AS receipt_scope_type,
      r.scope_id AS receipt_scope_id,
      r.mutation_kind AS receipt_mutation_kind,
      r.request_hash AS receipt_request_hash,
      r.response_json AS receipt_response_json,
      r.status_code AS receipt_status_code,
      r.correlation_id AS receipt_correlation_id,
      r.applied_at AS receipt_applied_at,
      state.learner_id AS spelling_state_learner_id,
      'spelling' AS spelling_state_subject_id,
      state.ui_json AS spelling_state_ui_json,
      state.data_json AS spelling_state_data_json,
      state.stats_json AS spelling_state_stats_json,
      state.updated_at AS spelling_state_updated_at,
      session.id AS spelling_session_id,
      session.learner_id AS spelling_session_learner_id,
      session.subject_id AS spelling_session_subject_id,
      session.session_kind AS spelling_session_kind,
      session.status AS spelling_session_status,
      session.session_state_json AS spelling_session_state_json,
      session.summary_json AS spelling_session_summary_json,
      session.created_at AS spelling_session_created_at,
      session.updated_at AS spelling_session_updated_at,
      active_session.id AS spelling_active_session_id,
      read_model.learner_id AS spelling_read_model_learner_id,
      read_model.model_key AS spelling_read_model_key,
      read_model.model_json AS spelling_read_model_json,
      read_model.source_revision AS spelling_read_model_source_revision,
      read_model.generated_at AS spelling_read_model_generated_at,
      read_model.updated_at AS spelling_read_model_updated_at,
      EXISTS (
        SELECT 1
        FROM child_subject_state legacy_state
        WHERE legacy_state.learner_id = ? AND legacy_state.subject_id = 'spelling'
      ) AS spelling_legacy_state_exists,
      EXISTS (
        SELECT 1
        FROM bounded_gameplay_state_migrations
        WHERE migration_id = '0023' AND state = 'ready'
      ) AS spelling_bounded_gameplay_ready
    FROM learner_profiles l
    LEFT JOIN account_learner_memberships m
      ON m.account_id = ? AND m.learner_id = l.id
    LEFT JOIN mutation_receipts r
      ON r.account_id = ? AND r.request_id = ?
    LEFT JOIN (
      SELECT learner_id, ui_json, data_json, stats_json, updated_at
      FROM spelling_learner_state
      WHERE learner_id = ?
        AND EXISTS (
          SELECT 1
          FROM bounded_gameplay_state_migrations
          WHERE migration_id = '0023' AND state = 'ready'
        )
      LIMIT 1
    ) state ON 1 = 1
    LEFT JOIN (
      SELECT id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at
      FROM practice_sessions
      WHERE learner_id = ? AND subject_id = 'spelling'
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    ) session ON 1 = 1
    LEFT JOIN (
      SELECT id
      FROM practice_sessions
      WHERE learner_id = ? AND subject_id = 'spelling' AND status = 'active'
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    ) active_session ON 1 = 1
    LEFT JOIN learner_read_models read_model
      ON read_model.learner_id = l.id AND read_model.model_key = ?
    WHERE l.id = ?
  `, [
    learnerId,
    accountId,
    accountId,
    requestId,
    learnerId,
    learnerId,
    learnerId,
    modelKey,
    learnerId,
  ]);
}

async function runSubjectCommandMutation(db, {
  accountId,
  command,
  applyCommand,
  nowTs,
  // U6 round 1 fix (adv-u6-r1-002): optional per-request capacity
  // collector so the CAS retry path can stamp
  // `derivedWriteSkipped: {reason: 'concurrent-retry-exhausted', ...}`
  // when the projection write is lost to a concurrent winner.
  capacity = null,
}) {
  if (!(typeof command?.learnerId === 'string' && command.learnerId)) {
    throw new BadRequestError('Learner id is required for this mutation.', {
      code: 'learner_id_required',
      kind: 'subject_command',
    });
  }
  if (typeof applyCommand !== 'function') {
    throw new TypeError('runSubjectCommand requires an applyCommand function.');
  }

  const kind = `subject_command.${command.subjectId}.${command.command}`;
  const payload = {
    subjectId: command.subjectId,
    command: command.command,
    learnerId: command.learnerId,
    payload: command.payload,
  };
  const nextMutation = normaliseMutationInput({
    requestId: command.requestId,
    correlationId: command.correlationId,
    expectedLearnerRevision: command.expectedLearnerRevision,
  }, 'learner');
  const requestHash = mutationPayloadHash(kind, payload);

  // U6 queryCount budget: fold the mutation-receipt idempotency lookup
  // and the learner revision read into a single LEFT JOIN so the hot
  // path issues one SELECT instead of two. NULL-padded columns signal
  // "no existing receipt" and a missing `learner_id` signals "learner
  // not found" (and the request terminates the same way as the prior
  // two-query flow). P95 follow-up: also fold the writable membership
  // check into the same query so subject commands do not spend a
  // separate D1 round trip proving access immediately before reading
  // the learner revision.
  // Spelling folds the 0023 readiness check into its normal preflight read.
  // On a ready database this removes an otherwise redundant D1 round trip;
  // before schema, the guarded query falls back to the generic preflight.
  const canPreloadSpellingRuntime = command.subjectId === 'spelling';
  const spellingRuntimeModelKey = COMMAND_PROJECTION_MODEL_KEY;
  let combinedRow;
  let preloadedCommandRuntime = null;
  if (canPreloadSpellingRuntime) {
    try {
      combinedRow = await readSpellingSubjectCommandPreflightRow(db, {
        accountId,
        learnerId: command.learnerId,
        requestId: nextMutation.requestId,
        modelKey: spellingRuntimeModelKey,
      });
      markLearnerReadModelsTableAvailable(db);
      if (Number(combinedRow?.spelling_bounded_gameplay_ready) === 1) {
        markBoundedGameplayTableAvailable(db, 'spelling');
      }
      preloadedCommandRuntime = spellingCommandRuntimeFromRow(combinedRow, spellingRuntimeModelKey, {
        prefix: 'spelling_',
      });
      if (preloadedCommandRuntime.legacyFallbackRequired) preloadedCommandRuntime = null;
    } catch (error) {
      if (
        !isMissingTableError(error, 'learner_read_models')
        && !isMissingTableError(error, 'spelling_learner_state')
        && !isMissingTableError(error, 'bounded_gameplay_state_migrations')
      ) throw error;
      combinedRow = await readSubjectCommandPreflightRow(db, {
        accountId,
        learnerId: command.learnerId,
        requestId: nextMutation.requestId,
      });
      if (isMissingTableError(error, 'learner_read_models')) {
        // Capacity projections are optional during their own rollout, but
        // the 0023 authority check is not. Recover only the two presence
        // bits needed by the fail-closed guard; never read legacy data_json.
        const spellingPresence = await first(db, `
          SELECT
            EXISTS (
              SELECT 1 FROM spelling_learner_state WHERE learner_id = ?
            ) AS spelling_state_present,
            EXISTS (
              SELECT 1
              FROM bounded_gameplay_state_migrations
              WHERE migration_id = '0023' AND state = 'ready'
            ) AS spelling_bounded_gameplay_ready
        `, [command.learnerId]);
        combinedRow = {
          ...combinedRow,
          spelling_state_learner_id: Number(spellingPresence?.spelling_state_present) === 1
            ? command.learnerId
            : null,
          spelling_bounded_gameplay_ready: spellingPresence?.spelling_bounded_gameplay_ready,
        };
      }
    }
  } else {
    combinedRow = await readSubjectCommandPreflightRow(db, {
      accountId,
      learnerId: command.learnerId,
      requestId: nextMutation.requestId,
    });
  }

  if (!combinedRow || !combinedRow.learner_id) {
    throw new NotFoundError('Learner was not found.', { learnerId: command.learnerId });
  }
  if (!writableRole(combinedRow.membership_role)) {
    throw new ForbiddenError('Learner access denied.', {
      learnerId: command.learnerId,
      required: 'owner-or-member',
    });
  }
  if (canPreloadSpellingRuntime) {
    await requireBoundedSpellingLearnerState(
      db,
      command.learnerId,
      Boolean(combinedRow.spelling_state_learner_id),
      combinedRow.spelling_bounded_gameplay_ready == null
        ? null
        : Number(combinedRow.spelling_bounded_gameplay_ready) === 1,
    );
  }

  const existingReceipt = combinedRow.receipt_request_id
    ? {
      account_id: combinedRow.receipt_account_id,
      request_id: combinedRow.receipt_request_id,
      scope_type: combinedRow.receipt_scope_type,
      scope_id: combinedRow.receipt_scope_id,
      mutation_kind: combinedRow.receipt_mutation_kind,
      request_hash: combinedRow.receipt_request_hash,
      response_json: combinedRow.receipt_response_json,
      status_code: combinedRow.receipt_status_code,
      correlation_id: combinedRow.receipt_correlation_id,
      applied_at: combinedRow.receipt_applied_at,
    }
    : null;

  if (existingReceipt) {
    if (existingReceipt.request_hash !== requestHash) {
      throw idempotencyReuseError({
        kind,
        scopeType: 'learner',
        scopeId: command.learnerId,
        requestId: nextMutation.requestId,
        correlationId: nextMutation.correlationId,
      });
    }
    const replayed = safeJsonParse(existingReceipt.response_json, {});
    replayed.mutation = buildMutationMeta({
      ...replayed.mutation,
      kind,
      scopeType: 'learner',
      scopeId: command.learnerId,
      requestId: nextMutation.requestId,
      correlationId: nextMutation.correlationId,
      replayed: true,
    });
    logMutation('info', 'mutation.replayed', {
      kind,
      scopeType: 'learner',
      scopeId: command.learnerId,
      requestId: nextMutation.requestId,
      correlationId: nextMutation.correlationId,
    });
    return replayed;
  }

  const learner = {
    id: combinedRow.learner_id,
    state_revision: combinedRow.learner_state_revision,
  };

  // U6 round 1 fix (adv-u6-r1-002): the initial apply runs against the
  // client's declared `expectedLearnerRevision`. If the CAS fails because
  // a concurrent writer bumped the revision first, we rebase: re-apply
  // against fresh state (capturing the winner's merged projection via
  // `resolveProjectionInput`), rebuild the plan, and attempt CAS once
  // more. If the second attempt also fails, we stamp
  // `derivedWriteSkipped: {reason: 'concurrent-retry-exhausted', ...}`,
  // then make ONE final attempt with the projection write omitted so the
  // primary state (subject record + mutation receipt + learner revision)
  // still lands. The primary state is the source of truth; the derived
  // projection will re-populate via `stale-catchup` on the next command.
  // Bounded to three total attempts — no unbounded retry loop.
  const originalExpectedRevision = nextMutation.expectedRevision;
  const baseRevision = originalExpectedRevision;

  async function attemptMutation(effectiveExpectedRevision, { includeProjection }) {
    // Re-run the command against fresh state for each attempt so the
    // rebased plan sees the concurrent winner's reward/counts/token ring
    // (via the subject handler's internal `resolveProjectionInput` call).
    const freshApplyRaw = await applyCommand(preloadedCommandRuntime
      ? { commandRuntime: preloadedCommandRuntime }
      : undefined);
    preloadedCommandRuntime = null;
    const freshPayload = isPlainObject(freshApplyRaw) ? freshApplyRaw : {};
    const {
      runtimeWrite: freshRuntimeWrite = null,
      projectionContext: freshProjectionContext = null,
      ...freshApplied
    } = freshPayload;
    const mutatesState = Boolean(freshRuntimeWrite) || freshApplied.changed !== false;
    // Observed (no-op) commands inherit the learner's CURRENT revision,
    // not the client's expected revision, so `appliedRevision` stays a
    // source-of-truth value even when the client passes a stale expected.
    const observedCurrentRevision = Number(learner.state_revision) || 0;
    const attemptAppliedRevision = mutatesState
      ? effectiveExpectedRevision + 1
      : observedCurrentRevision;
    const attemptResponse = {
      ...freshApplied,
      mutation: buildMutationMeta({
        kind,
        scopeType: 'learner',
        scopeId: command.learnerId,
        requestId: nextMutation.requestId,
        correlationId: nextMutation.correlationId,
        expectedRevision: effectiveExpectedRevision,
        appliedRevision: attemptAppliedRevision,
      }),
    };
    if (!mutatesState) {
      return { mutatesState: false, response: attemptResponse, appliedRevision: attemptAppliedRevision };
    }
    const attemptGuard = {
      learnerId: command.learnerId,
      expectedRevision: effectiveExpectedRevision,
    };
    const attemptStatements = [];
    if (freshRuntimeWrite) {
      const includeCapacityReadModels = await capacityReadModelTablesAvailable(db, {
        requireActivityFeed: false,
      });
      const compatibleRuntimeWrite = await runtimeForAvailableGameplayStore(
        db,
        command.subjectId,
        freshRuntimeWrite,
      );
      const plan = buildSubjectRuntimePersistencePlan(
        db,
        accountId,
        command.learnerId,
        command.subjectId,
        compatibleRuntimeWrite,
        nowTs,
        {
          guard: attemptGuard,
          // When includeProjection is false we still persist source-of-truth
          // state and receipts. Normal event/activity history remains off on
          // the subject command hot path.
          includeCapacityReadModels,
          persistEventLog: false,
          persistActivityFeed: false,
          projectionContext: includeProjection ? freshProjectionContext : null,
          skipProjectionReadModelWrite: !includeProjection,
          // Feedback progress is source-of-truth in child_subject_state.
          // Keep practice_sessions for start/completion history, not every answer.
          skipActivePracticeSessionWrite: command.command === 'submit-answer',
          currentActiveSessionId: freshRuntimeWrite.previousActiveSessionId,
          activePracticeSessionKnownAbsent: freshRuntimeWrite.activeSessionKnownAbsent === true,
        },
      );
      attemptStatements.push(...plan.statements);
    }
    attemptStatements.push(storeMutationReceiptStatement(db, {
      accountId,
      requestId: nextMutation.requestId,
      scopeType: 'learner',
      scopeId: command.learnerId,
      mutationKind: kind,
      requestHash,
      response: subjectCommandReceiptResponse(attemptResponse, {
        learnerId: command.learnerId,
        subjectId: command.subjectId,
        command: command.command,
      }),
      correlationId: nextMutation.correlationId,
      appliedAt: nowTs,
    }, { guard: attemptGuard }));
    attemptStatements.push(bindStatement(db, `
      UPDATE learner_profiles
      SET state_revision = state_revision + 1,
          updated_at = ?
      WHERE id = ?
        AND state_revision = ?
    `, [nowTs, command.learnerId, effectiveExpectedRevision]));

    // U9 round 1 fix (adv-u9-r1-004): record D1 projection-write health against
    // the server-side `readModelDerivedWrite` breaker. A batch() that throws is
    // a genuine D1 fault (overloaded / disconnect / schema) — recordFailure so
    // consecutive faults trip the breaker. A batch() that returns changes=1 is
    // a healthy commit — recordSuccess so the breaker can leave HALF_OPEN.
    // `changes=0` is a CAS contention signal (concurrent writer), NOT a
    // backend failure — record NEITHER so concurrency does not poison the
    // breaker health.
    let attemptResults;
    try {
      attemptResults = await batch(db, attemptStatements);
    } catch (err) {
      // Only record failure for attempts that actually included the projection
      // write (`includeProjection=true`). Projection-skipped attempts that still
      // throw are exposing a different fault (primary-state path); that is out
      // of scope for the derived-write breaker.
      if (includeProjection) {
        try { derivedWriteBreaker.recordFailure(); } catch { /* never let listener throw mask the D1 error */ }
      }
      throw err;
    }
    const attemptCasResult = attemptResults[attemptResults.length - 1] || null;
    const attemptCasChanges = Number(attemptCasResult?.meta?.changes) || 0;
    if (includeProjection && attemptCasChanges === 1) {
      try { derivedWriteBreaker.recordSuccess(); } catch { /* listener */ }
    }
    return {
      mutatesState: true,
      response: attemptResponse,
      appliedRevision: attemptAppliedRevision,
      casChanges: attemptCasChanges,
    };
  }

  async function readFreshRevision() {
    return Number(await scalar(
      db,
      'SELECT state_revision FROM learner_profiles WHERE id = ?',
      [command.learnerId],
      'state_revision',
    )) || 0;
  }

  // Stale-at-entry snapshot: we only retry on a concurrent-writer race
  // (CAS fails AFTER the batch begins). A mismatch that was already
  // present before the first attempt means the client is simply stale
  // (`expectedLearnerRevision` does not match the current state); in
  // that case the retry path MUST NOT kick in or we would silently
  // re-apply a stale-input command against post-write state.
  const staleAtEntry = (Number(learner.state_revision) || 0) !== originalExpectedRevision;

  // U9: server-side `readModelDerivedWrite` breaker. When open, skip
  // the projection read-model write entirely and stamp
  // `derivedWriteSkipped: {reason: 'breaker-open'}` on the collector
  // (closed-union reuse per U6). The primary state write still runs
  // (`docs/mutation-policy.md` — NEVER mask a failed write as synced;
  // the primary write is the source of truth). A subsequent command
  // will refill the projection via the existing stale-catchup path.
  const derivedWriteBreaker = getReadModelDerivedWriteBreaker();
  const breakerOpen = derivedWriteBreaker.shouldBlockCall();
  if (breakerOpen && capacity && typeof capacity.setDerivedWriteSkipped === 'function') {
    capacity.setDerivedWriteSkipped({ reason: 'breaker-open' });
  }
  if (breakerOpen && capacity && typeof capacity.addSignal === 'function') {
    capacity.addSignal('breakerTransition');
  }

  // --- Attempt 1: full batch at the client-declared expectedRevision.
  const firstAttempt = await attemptMutation(originalExpectedRevision, { includeProjection: !breakerOpen });
  if (!firstAttempt.mutatesState) {
    logMutation('info', 'mutation.observed', {
      kind,
      scopeType: 'learner',
      scopeId: command.learnerId,
      requestId: nextMutation.requestId,
      correlationId: nextMutation.correlationId,
      expectedRevision: originalExpectedRevision,
      appliedRevision: firstAttempt.appliedRevision,
    });
    return firstAttempt.response;
  }
  if (firstAttempt.casChanges === 1) {
    logMutation('info', 'mutation.applied', {
      kind,
      scopeType: 'learner',
      scopeId: command.learnerId,
      requestId: nextMutation.requestId,
      correlationId: nextMutation.correlationId,
      expectedRevision: originalExpectedRevision,
      appliedRevision: firstAttempt.appliedRevision,
    });
    return firstAttempt.response;
  }

  // --- Attempt 2: rebase onto fresh revision with merged projection.
  // Short-circuit when the first attempt's failure is attributable to a
  // stale-at-entry client: no concurrent race happened, so there is
  // nothing to merge; propagate stale_write as the Phase 1 contract.
  if (staleAtEntry) {
    const currentRevision = await readFreshRevision();
    throw staleWriteError({
      kind,
      scopeType: 'learner',
      scopeId: command.learnerId,
      requestId: nextMutation.requestId,
      correlationId: nextMutation.correlationId,
      expectedRevision: originalExpectedRevision,
      currentRevision,
    });
  }
  const freshRevisionAfterFirst = await readFreshRevision();
  // U9 round 1 fix (adv-u9-r1-003): CAS-retry Attempt 2 must re-check the
  // server-side `readModelDerivedWrite` breaker. Pre-fix the projection write
  // was hardcoded `includeProjection: true`; a breaker that opened between
  // Attempts 1 and 2 was silently violated. Re-read the breaker state and
  // preserve the breaker-open reason stamp when the breaker is still open.
  const breakerOpenOnAttempt2 = derivedWriteBreaker.shouldBlockCall();
  if (breakerOpenOnAttempt2 && capacity && typeof capacity.setDerivedWriteSkipped === 'function') {
    capacity.setDerivedWriteSkipped({ reason: 'breaker-open' });
  }
  const secondAttempt = await attemptMutation(freshRevisionAfterFirst, { includeProjection: !breakerOpenOnAttempt2 });
  if (secondAttempt.casChanges === 1) {
    logMutation('info', 'mutation.applied', {
      kind,
      scopeType: 'learner',
      scopeId: command.learnerId,
      requestId: nextMutation.requestId,
      correlationId: nextMutation.correlationId,
      expectedRevision: freshRevisionAfterFirst,
      appliedRevision: secondAttempt.appliedRevision,
      rebased: true,
      projectionSkipped: breakerOpenOnAttempt2 ? 'breaker-open' : null,
    });
    return secondAttempt.response;
  }

  // --- Attempt 3: projection-skip. Stamp `concurrent-retry-exhausted`
  // so operators see the skip in telemetry, then land the primary state
  // without the projection write so a subsequent command can repair via
  // `stale-catchup`. If this final attempt also fails CAS, we honour the
  // client's stale-write contract.
  // U9 round 1 fix (adv-u9-r1-003): preserve the earlier `breaker-open`
  // stamp when the breaker has been open throughout the retry chain. The
  // `concurrent-retry-exhausted` reason only applies when Attempts 2 and
  // 3 actually ran the projection-write path and both lost CAS. When the
  // breaker is open, Attempts 2 and 3 already skipped projection; the
  // authoritative reason is breaker-open, not contention.
  const freshRevisionAfterSecond = await readFreshRevision();
  if (capacity && typeof capacity.setDerivedWriteSkipped === 'function' && !breakerOpen && !breakerOpenOnAttempt2) {
    capacity.setDerivedWriteSkipped({
      reason: 'concurrent-retry-exhausted',
      baseRevision,
      currentRevision: freshRevisionAfterSecond,
    });
  }
  const thirdAttempt = await attemptMutation(freshRevisionAfterSecond, { includeProjection: false });
  if (thirdAttempt.casChanges === 1) {
    logMutation('info', 'mutation.applied', {
      kind,
      scopeType: 'learner',
      scopeId: command.learnerId,
      requestId: nextMutation.requestId,
      correlationId: nextMutation.correlationId,
      expectedRevision: freshRevisionAfterSecond,
      appliedRevision: thirdAttempt.appliedRevision,
      projectionSkipped: 'concurrent-retry-exhausted',
    });
    return thirdAttempt.response;
  }

  const finalCurrentRevision = await readFreshRevision();
  throw staleWriteError({
    kind,
    scopeType: 'learner',
    scopeId: command.learnerId,
    requestId: nextMutation.requestId,
    correlationId: nextMutation.correlationId,
    expectedRevision: originalExpectedRevision,
    currentRevision: finalCurrentRevision,
  });
}

// ─── Hero Mode P3 U3: Hero progress repository helpers ───────────────────────

async function readHeroProgressState(db, learnerId) {
  const row = await first(db, `
    SELECT state_json, updated_at
    FROM child_game_state
    WHERE learner_id = ? AND system_id = 'hero-mode'
  `, [learnerId]);
  if (!row) return normaliseHeroProgressState(null);
  const parsed = safeJsonParse(row.state_json, null);
  return normaliseHeroProgressState(parsed);
}

function buildHeroProgressUpsertStatement(db, learnerId, accountId, state, nowTs, guard) {
  const stateJson = JSON.stringify(state);
  const params = [learnerId, 'hero-mode', stateJson, nowTs, accountId];
  return bindStatement(db, `
    INSERT INTO child_game_state (learner_id, system_id, state_json, updated_at, updated_by_account_id)
    ${guardedValueSource(params.length, guard)}
    ON CONFLICT(learner_id, system_id) DO UPDATE SET
      state_json = excluded.state_json,
      updated_at = excluded.updated_at,
      updated_by_account_id = excluded.updated_by_account_id
  `, guardedParams(params, guard));
}

function buildHeroProgressDailyPatchStatement(db, learnerId, accountId, state, nowTs) {
  const stateJson = JSON.stringify(state);
  return bindStatement(db, `
    INSERT INTO child_game_state (learner_id, system_id, state_json, updated_at, updated_by_account_id)
    VALUES (?, 'hero-mode', ?, ?, ?)
    ON CONFLICT(learner_id, system_id) DO UPDATE SET
      state_json = CASE
        WHEN json_valid(child_game_state.state_json) THEN json_set(
          child_game_state.state_json,
          '$.version', json_extract(excluded.state_json, '$.version'),
          '$.daily', json_extract(excluded.state_json, '$.daily')
        )
        ELSE excluded.state_json
      END,
      updated_at = excluded.updated_at,
      updated_by_account_id = excluded.updated_by_account_id
  `, [learnerId, stateJson, nowTs, accountId]);
}

async function runHeroCommandMutation(db, {
  accountId,
  learnerId,
  command,
  applyCommand,
  nowTs,
}) {
  if (!(typeof learnerId === 'string' && learnerId)) {
    throw new BadRequestError('Learner id is required for this mutation.', {
      code: 'learner_id_required',
      kind: 'hero_command',
    });
  }
  if (typeof applyCommand !== 'function') {
    throw new TypeError('runHeroCommandMutation requires an applyCommand function.');
  }

  const kind = `hero_command.${command.command}`;
  const payload = {
    command: command.command,
    learnerId,
    payload: command.payload,
  };
  const nextMutation = normaliseMutationInput({
    requestId: command.requestId,
    correlationId: command.correlationId,
    expectedLearnerRevision: command.expectedLearnerRevision,
  }, 'learner');
  const requestHash = mutationPayloadHash(kind, payload);

  await requireLearnerWriteAccess(db, accountId, learnerId);

  const combinedRow = await first(db, `
    SELECT
      l.id AS learner_id,
      l.state_revision AS learner_state_revision,
      r.account_id AS receipt_account_id,
      r.request_id AS receipt_request_id,
      r.scope_type AS receipt_scope_type,
      r.scope_id AS receipt_scope_id,
      r.mutation_kind AS receipt_mutation_kind,
      r.request_hash AS receipt_request_hash,
      r.response_json AS receipt_response_json,
      r.status_code AS receipt_status_code,
      r.correlation_id AS receipt_correlation_id,
      r.applied_at AS receipt_applied_at
    FROM learner_profiles l
    LEFT JOIN mutation_receipts r
      ON r.account_id = ? AND r.request_id = ?
    WHERE l.id = ?
  `, [accountId, nextMutation.requestId, learnerId]);

  if (!combinedRow || !combinedRow.learner_id) {
    throw new NotFoundError('Learner was not found.', { learnerId });
  }

  const existingReceipt = combinedRow.receipt_request_id
    ? {
      account_id: combinedRow.receipt_account_id,
      request_id: combinedRow.receipt_request_id,
      scope_type: combinedRow.receipt_scope_type,
      scope_id: combinedRow.receipt_scope_id,
      mutation_kind: combinedRow.receipt_mutation_kind,
      request_hash: combinedRow.receipt_request_hash,
      response_json: combinedRow.receipt_response_json,
      status_code: combinedRow.receipt_status_code,
      correlation_id: combinedRow.receipt_correlation_id,
      applied_at: combinedRow.receipt_applied_at,
    }
    : null;

  if (existingReceipt) {
    if (existingReceipt.request_hash !== requestHash) {
      throw idempotencyReuseError({
        kind,
        scopeType: 'learner',
        scopeId: learnerId,
        requestId: nextMutation.requestId,
        correlationId: nextMutation.correlationId,
      });
    }
    const replayed = safeJsonParse(existingReceipt.response_json, {});
    replayed.mutation = buildMutationMeta({
      ...replayed.mutation,
      kind,
      scopeType: 'learner',
      scopeId: learnerId,
      requestId: nextMutation.requestId,
      correlationId: nextMutation.correlationId,
      replayed: true,
    });
    logMutation('info', 'mutation.replayed', {
      kind,
      scopeType: 'learner',
      scopeId: learnerId,
      requestId: nextMutation.requestId,
      correlationId: nextMutation.correlationId,
    });
    return replayed;
  }

  const learner = {
    id: combinedRow.learner_id,
    state_revision: combinedRow.learner_state_revision,
  };

  const expectedRevision = nextMutation.expectedRevision;
  const currentRevision = Number(learner.state_revision) || 0;
  if (currentRevision !== expectedRevision) {
    throw staleWriteError({
      kind,
      scopeType: 'learner',
      scopeId: learnerId,
      requestId: nextMutation.requestId,
      correlationId: nextMutation.correlationId,
      expectedRevision,
      currentRevision,
    });
  }

  const result = await applyCommand();
  const appliedRevision = expectedRevision + 1;
  const response = {
    ...result,
    mutation: buildMutationMeta({
      kind,
      scopeType: 'learner',
      scopeId: learnerId,
      requestId: nextMutation.requestId,
      correlationId: nextMutation.correlationId,
      expectedRevision,
      appliedRevision,
    }),
  };

  const guard = { learnerId, expectedRevision };
  const statements = [
    buildHeroProgressUpsertStatement(db, learnerId, accountId, result.state, nowTs, guard),
    storeMutationReceiptStatement(db, {
      accountId,
      requestId: nextMutation.requestId,
      scopeType: 'learner',
      scopeId: learnerId,
      mutationKind: kind,
      requestHash,
      response,
      correlationId: nextMutation.correlationId,
      appliedAt: nowTs,
    }, { guard }),
    bindStatement(db, `
      UPDATE learner_profiles
      SET state_revision = state_revision + 1,
          updated_at = ?
      WHERE id = ?
        AND state_revision = ?
    `, [nowTs, learnerId, expectedRevision]),
  ];

  const results = await batch(db, statements);
  const casResult = results[results.length - 1] || null;
  const casChanges = Number(casResult?.meta?.changes) || 0;
  if (casChanges !== 1) {
    const currentRevision = Number(await scalar(
      db,
      'SELECT state_revision FROM learner_profiles WHERE id = ?',
      [learnerId],
      'state_revision',
    )) || 0;
    throw staleWriteError({
      kind,
      scopeType: 'learner',
      scopeId: learnerId,
      requestId: nextMutation.requestId,
      correlationId: nextMutation.correlationId,
      expectedRevision,
      currentRevision,
    });
  }

  logMutation('info', 'mutation.applied', {
    kind,
    scopeType: 'learner',
    scopeId: learnerId,
    requestId: nextMutation.requestId,
    correlationId: nextMutation.correlationId,
    expectedRevision,
    appliedRevision,
  });

  return response;
}

export function createWorkerRepository({ env = {}, now = Date.now, capacity = null } = {}) {
  // U3: when a per-request `capacity` CapacityCollector is supplied, wrap
  // the D1 handle so every .prepare()-backed call contributes row counts
  // and durations to the collector. Absent collector → zero-overhead raw
  // handle (tests, legacy call sites). See `worker/src/logger.js` for the
  // constructor-injection rationale; we deliberately avoid
  // AsyncLocalStorage per the Phase 2 plan.
  const db = withCapacityCollector(requireDatabase(env), capacity);
  const nowFactory = () => asTs(now(), Date.now());

  // Phase E adv-e-5: validate `env.BUILD_HASH` once at the factory
  // boundary. Every downstream consumer (readAdminHub's currentRelease,
  // readAdminOpsErrorEvents' narrow refresh, updateOpsErrorEventStatus
  // which stamps `resolved_in_release` on status→resolved) previously
  // re-ran the regex check inline, which (a) duplicated the predicate
  // and (b) silently ignored a malformed env var without logging. We
  // normalise once here, log a structured warning when the env var is
  // present but does not match the server-side regex, and pass the
  // validated value to the consumers. A null `resolvedBuildHash`
  // disables auto-reopen stamping consistent with the U16 "null ==
  // opt-out" contract.
  const rawBuildHash = typeof env?.BUILD_HASH === 'string' && env.BUILD_HASH
    ? env.BUILD_HASH
    : null;
  const resolvedBuildHash = rawBuildHash && OPS_ERROR_RELEASE_REGEX.test(rawBuildHash)
    ? rawBuildHash
    : null;
  if (rawBuildHash && !resolvedBuildHash) {
    try {
      // eslint-disable-next-line no-console
      console.warn(JSON.stringify({
        event: 'ops.build_hash.malformed_env_var',
        reason: 'BUILD_HASH does not match [a-f0-9]{6,40}; ignored. resolved_in_release will be null until fixed.',
      }));
    } catch {
      // Structured logs are best-effort.
    }
  }
  const contentOperations = createLazyContentOperationsRepository({ db, env, now: nowFactory });

  return {
    ...contentOperations,
    async ensureAccount(session) {
      const nowTs = nowFactory();
      // U6 queryCount budget: the inner `ensureAccount` helper already
      // returns the row via `SELECT * FROM adult_accounts WHERE id = ?`
      // so forwarding its return value avoids the duplicate SELECT that
      // used to run in every command request.
      return ensureAccount(db, session, nowTs);
    },
    async readSession(accountId) {
      return first(db, 'SELECT * FROM adult_accounts WHERE id = ?', [accountId]);
    },
    async bootstrap(accountId, options = {}) {
      const bundle = await bootstrapBundle(db, accountId, { env, ...options, capacity });
      // U3: stamp `bootstrapCapacity` on the collector when the bundle
      // emitted one. The collector is mutated rather than returned —
      // keeps repository call signatures stable across all callers.
      // U3 round 1 (P1 #05): route through `setBootstrapCapacity()` so
      // only allowlisted keys flow to public JSON; any future bundle
      // fields need an explicit allowlist amendment in logger.js.
      if (capacity && bundle?.bootstrapCapacity != null && typeof capacity.setBootstrapCapacity === 'function') {
        capacity.setBootstrapCapacity(bundle.bootstrapCapacity);
      }
      return bundle;
    },
    // U7: POST /api/bootstrap variant. Caller passes either
    // `{lastKnownRevision, preferredLearnerId?}` or nothing; we try a
    // short-circuit probe first, then fall back to a full bounded
    // bundle. Response shape is described in BOOTSTRAP_V2_ENVELOPE_SHAPE.
    async bootstrapV2(accountId, {
      lastKnownRevision = null,
      preferredLearnerId = null,
      publicReadModels = false,
      accountSnapshot = null,
    } = {}) {
      if (lastKnownRevision) {
        const probe = await bootstrapNotModifiedProbe(db, accountId, {
          lastKnownRevision,
          preferredLearnerId,
          publicReadModels,
          accountSnapshot,
          capacity,
        });
        if (probe) {
          // Stamp the minimal capacity meta so U9's
          // `bootstrapCapacityMetadata` breaker does not trip on a
          // legitimate short response (plan line 749).
          if (capacity && typeof capacity.setBootstrapCapacity === 'function') {
            capacity.setBootstrapCapacity({
              version: PUBLIC_BOOTSTRAP_CAPACITY_VERSION,
              mode: 'public-bounded',
            });
          }
          if (capacity && typeof capacity.setBootstrapMode === 'function') {
            capacity.setBootstrapMode('not-modified');
          }
          return {
            ok: true,
            notModified: true,
            revision: {
              accountRevision: probe.accountRevision,
              selectedLearnerRevision: probe.selectedLearnerRevision,
              accountLearnerListRevision: probe.accountLearnerListRevision,
              bootstrapCapacityVersion: probe.bootstrapCapacityVersion,
              hash: probe.hash,
            },
          };
        }
      }
      const bundle = await bootstrapBundle(db, accountId, {
        env,
        publicReadModels,
        selectedLearnerBounded: true,
        preferredLearnerId,
        revisionEnvelope: true,
        accountSnapshot,
        capacity,
      });
      if (capacity && bundle?.bootstrapCapacity != null && typeof capacity.setBootstrapCapacity === 'function') {
        capacity.setBootstrapCapacity(bundle.bootstrapCapacity);
      }
      if (capacity && typeof capacity.setBootstrapMode === 'function') {
        capacity.setBootstrapMode(publicReadModels ? 'selected-learner-bounded' : 'full-legacy');
      }
      return bundle;
    },
    // U7: GET /api/bootstrap v2 variant used when the client passes a
    // query param. Same envelope as bootstrapV2 minus the notModified
    // branch (GET does not carry a body).
    async bootstrapV2Get(accountId, {
      preferredLearnerId = null,
      publicReadModels = false,
      accountSnapshot = null,
    } = {}) {
      const bundle = await bootstrapBundle(db, accountId, {
        env,
        publicReadModels,
        selectedLearnerBounded: true,
        preferredLearnerId,
        revisionEnvelope: true,
        accountSnapshot,
        capacity,
      });
      if (capacity && bundle?.bootstrapCapacity != null && typeof capacity.setBootstrapCapacity === 'function') {
        capacity.setBootstrapCapacity(bundle.bootstrapCapacity);
      }
      if (capacity && typeof capacity.setBootstrapMode === 'function') {
        capacity.setBootstrapMode(publicReadModels ? 'selected-learner-bounded' : 'full-legacy');
      }
      return bundle;
    },
    async readParentHubSummary(accountId, learnerId) {
      return readParentHubSummary(db, accountId, learnerId);
    },
    async readClassroomLearnersSummary(accountId, options = {}) {
      return readClassroomLearnersSummary(db, accountId, options);
    },
    async readSubjectRuntime(accountId, learnerId, subjectId = 'spelling', options = {}) {
      if (subjectId === 'spelling') {
        return readSpellingCommandRuntimeBundle(db, accountId, learnerId, options);
      }
      return readSubjectRuntimeBundle(db, accountId, learnerId, subjectId, options);
    },
    async readSpellingCommandRuntime(accountId, learnerId, options = {}) {
      return readSpellingCommandRuntimeBundle(db, accountId, learnerId, options);
    },
    async readSpellingGameplayWorkingSet(accountId, learnerId, slugs, options = {}) {
      return readSpellingGameplayWorkingSet(db, accountId, learnerId, slugs, options);
    },
    async readGrammarGameplayWorkingSet(accountId, learnerId, itemIds, options = {}) {
      return readGrammarGameplayWorkingSet(db, accountId, learnerId, itemIds, options);
    },
    async readReadingGameplayWorkingSet(accountId, learnerId, questionIds, options = {}) {
      return readReadingGameplayWorkingSet(db, accountId, learnerId, questionIds, options);
    },
    async readPunctuationGameplayWorkingSet(accountId, learnerId, itemIds, options = {}) {
      return readPunctuationGameplayWorkingSet(db, accountId, learnerId, itemIds, options);
    },
    async readLearnerProjectionState(accountId, learnerId) {
      return readLearnerProjectionBundle(db, accountId, learnerId);
    },
    // U6 hot-path reader. Prefer this over `readLearnerProjectionState`
    // inside subject command handlers — it returns a closed-union
    // `{mode, projection, sourceRevision, ...}` payload and throws
    // `ProjectionUnavailableError` when both the row and the bounded
    // fallback are unusable.
    async readLearnerProjectionInput(accountId, learnerId, options = {}) {
      return readLearnerProjectionInput(db, accountId, learnerId, {
        now: nowFactory,
        ...options,
      });
    },
    async readLearnerEventLogEvents(accountId, learnerId, filters = {}) {
      return readLearnerEventLogEvents(db, accountId, learnerId, filters);
    },
    async persistSubjectRuntime(accountId, learnerId, subjectId = 'spelling', runtime = {}) {
      return persistSubjectRuntimeBundle(db, accountId, learnerId, subjectId, runtime, nowFactory());
    },
    async writeLearners(accountId, snapshot, mutation = {}) {
      const nowTs = nowFactory();
      return withAccountMutation(db, {
        accountId,
        kind: 'learners.write',
        payload: { learners: snapshot },
        mutation,
        nowTs,
        apply: async () => {
          const bundle = await writeLearnersSnapshot(db, accountId, snapshot, nowTs);
          return {
            learners: bundle.learners,
            syncState: bundle.syncState,
          };
        },
      });
    },
    async writeSubjectState(accountId, learnerId, subjectId, record, mutation = {}) {
      const nowTs = nowFactory();
      return withLearnerMutation(db, {
        accountId,
        learnerId,
        kind: 'child_subject_state.put',
        payload: {
          learnerId,
          subjectId,
          record,
        },
        mutation,
        nowTs,
        apply: async () => {
          const next = normaliseSubjectStateRecord(record);
          const updatedAt = asTs(next.updatedAt, nowTs);
          const boundedStoreReady = await boundedGameplayTableAvailable(db, subjectId);
          if (subjectId === 'spelling' && boundedStoreReady) {
            await batch(db, buildSpellingFullReplacementStatements(
              db,
              accountId,
              learnerId,
              next,
              updatedAt,
            ));
            return {
              key: `${learnerId || 'default'}::${subjectId || 'unknown'}`,
              record: next,
            };
          }
          if (subjectId === 'grammar' && boundedStoreReady) {
            await batch(db, buildGrammarFullReplacementStatements(
              db,
              accountId,
              learnerId,
              next,
              updatedAt,
            ));
            return {
              key: `${learnerId || 'default'}::${subjectId || 'unknown'}`,
              record: next,
            };
          }
          if (subjectId === 'reading' && boundedStoreReady) {
            await batch(db, buildReadingFullReplacementStatements(
              db,
              accountId,
              learnerId,
              next,
              updatedAt,
            ));
            return {
              key: `${learnerId || 'default'}::${subjectId || 'unknown'}`,
              record: next,
            };
          }
          if (subjectId === 'punctuation' && boundedStoreReady) {
            await batch(db, buildPunctuationFullReplacementStatements(
              db,
              accountId,
              learnerId,
              next,
              updatedAt,
            ));
            return {
              key: `${learnerId || 'default'}::${subjectId || 'unknown'}`,
              record: next,
            };
          }
          await run(db, `
            INSERT INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(learner_id, subject_id) DO UPDATE SET
              ui_json = excluded.ui_json,
              data_json = excluded.data_json,
              updated_at = excluded.updated_at,
              updated_by_account_id = excluded.updated_by_account_id
          `, [
            learnerId,
            subjectId,
            JSON.stringify(next.ui),
            JSON.stringify(next.data),
            updatedAt,
            accountId,
          ]);
          return {
            key: `${learnerId || 'default'}::${subjectId || 'unknown'}`,
            record: next,
          };
        },
      });
    },
    async runSubjectCommand(accountId, command, applyCommand) {
      const nowTs = nowFactory();
      return runSubjectCommandMutation(db, {
        accountId,
        command,
        nowTs,
        applyCommand,
        // U6 round 1 fix (adv-u6-r1-002): thread the per-request capacity
        // collector so the CAS retry path can stamp
        // `derivedWriteSkipped: {reason: 'concurrent-retry-exhausted'}`
        // when the projection write is skipped.
        capacity,
      });
    },
    // Hero Mode P3 U3: hero progress repository public surface.
    async readHeroProgress(learnerId) {
      return readHeroProgressState(db, learnerId);
    },
    // Hero Mode P3 U7: read progress bundle for the v4 read model.
    // Returns both the normalised hero progress state AND recent completed
    // practice sessions (last 24h) for pending-completed detection.
    async readHeroProgressData(learnerId) {
      const [progressState, sessionRows] = await Promise.all([
        readHeroProgressState(db, learnerId),
        all(db, `
          SELECT id, learner_id, subject_id, session_kind, status, summary_json, updated_at
          FROM practice_sessions
          WHERE learner_id = ? AND status = 'completed' AND updated_at > ?
          ORDER BY updated_at DESC
          LIMIT 20
        `, [learnerId, Date.now() - (24 * 60 * 60 * 1000)]),
      ]);
      return { heroProgressState: progressState, recentCompletedSessions: sessionRows };
    },
    // Hero progress markers only change the daily field. Applying that field
    // as an atomic JSON patch preserves a concurrently committed Camp pool or
    // economy update instead of replacing the whole hero-mode row from a
    // stale read-modify-write snapshot.
    async writeHeroProgressDaily(learnerId, accountId, state) {
      const nowTs = nowFactory();
      await requireLearnerWriteAccess(db, accountId, learnerId);
      const stmt = buildHeroProgressDailyPatchStatement(db, learnerId, accountId, state, nowTs);
      await batch(db, [stmt]);
    },
    async runHeroCommand(accountId, learnerId, command, applyCommand) {
      const nowTs = nowFactory();
      return runHeroCommandMutation(db, {
        accountId,
        learnerId,
        command,
        nowTs,
        applyCommand,
      });
    },
    async clearSubjectState(accountId, learnerId, subjectId = null, mutation = {}) {
      const nowTs = nowFactory();
      let boundedStoreReady = false;
      return withLearnerMutation(db, {
        accountId,
        learnerId,
        kind: subjectId ? 'child_subject_state.delete' : 'child_subject_state.clear_learner',
        payload: {
          learnerId,
          subjectId: subjectId || null,
        },
        mutation,
        nowTs,
        preflight: async () => {
          boundedStoreReady = await boundedGameplayStoresAvailable(
            db,
            subjectId
              ? [subjectId]
              : ['spelling', 'grammar', 'reading', 'punctuation'],
          );
          if (boundedStoreReady && (!subjectId || subjectId === 'spelling')) {
            await requireExistingBoundedSpellingLearnerState(db, learnerId);
          }
        },
        apply: async () => {
          if (subjectId) {
            const statements = [
              bindStatement(db, 'DELETE FROM child_subject_state WHERE learner_id = ? AND subject_id = ?', [learnerId, subjectId]),
            ];
            if (subjectId === 'spelling' && boundedStoreReady) {
              statements.push(
                bindResetBoundedSpellingLearnerState(db, accountId, learnerId, nowTs),
                bindStatement(db, 'DELETE FROM spelling_item_state WHERE learner_id = ?', [learnerId]),
                bindStatement(db, 'DELETE FROM spelling_achievement_state WHERE learner_id = ?', [learnerId]),
              );
            }
            if (subjectId === 'grammar' && boundedStoreReady) {
              statements.push(bindStatement(db, 'DELETE FROM grammar_item_state WHERE learner_id = ?', [learnerId]));
            }
            if (subjectId === 'reading' && boundedStoreReady) {
              statements.push(bindStatement(db, 'DELETE FROM reading_question_state WHERE learner_id = ?', [learnerId]));
            }
            if (subjectId === 'punctuation' && boundedStoreReady) {
              statements.push(bindStatement(db, 'DELETE FROM punctuation_item_state WHERE learner_id = ?', [learnerId]));
            }
            await batch(db, statements);
            return { key: `${learnerId || 'default'}::${subjectId || 'unknown'}`, cleared: true };
          }
          const statements = [
            bindStatement(db, 'DELETE FROM child_subject_state WHERE learner_id = ?', [learnerId]),
          ];
          if (boundedStoreReady) {
            statements.push(
              bindResetBoundedSpellingLearnerState(db, accountId, learnerId, nowTs),
              bindStatement(db, 'DELETE FROM spelling_item_state WHERE learner_id = ?', [learnerId]),
              bindStatement(db, 'DELETE FROM spelling_achievement_state WHERE learner_id = ?', [learnerId]),
              bindStatement(db, 'DELETE FROM grammar_item_state WHERE learner_id = ?', [learnerId]),
              bindStatement(db, 'DELETE FROM reading_question_state WHERE learner_id = ?', [learnerId]),
              bindStatement(db, 'DELETE FROM punctuation_item_state WHERE learner_id = ?', [learnerId]),
            );
          }
          await batch(db, statements);
          return { learnerId, cleared: true };
        },
      });
    },
    async writePracticeSession(accountId, record, mutation = {}) {
      const nowTs = nowFactory();
      const next = normalisePracticeSessionRecord(record);
      if (!next.id || !next.learnerId || !next.subjectId) {
        throw new BadRequestError('Practice session records require id, learnerId and subjectId.');
      }
      return withLearnerMutation(db, {
        accountId,
        learnerId: next.learnerId,
        kind: 'practice_sessions.put',
        payload: { record: next },
        mutation,
        nowTs,
        apply: async () => {
          const createdAt = asTs(next.createdAt, nowTs);
          const updatedAt = asTs(next.updatedAt, createdAt);
          await run(db, `
            INSERT INTO practice_sessions (
              id,
              learner_id,
              subject_id,
              session_kind,
              status,
              session_state_json,
              summary_json,
              created_at,
              updated_at,
              updated_by_account_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              learner_id = excluded.learner_id,
              subject_id = excluded.subject_id,
              session_kind = excluded.session_kind,
              status = excluded.status,
              session_state_json = excluded.session_state_json,
              summary_json = excluded.summary_json,
              created_at = excluded.created_at,
              updated_at = excluded.updated_at,
              updated_by_account_id = excluded.updated_by_account_id
          `, [
            next.id,
            next.learnerId,
            next.subjectId,
            next.sessionKind,
            next.status,
            next.sessionState == null ? null : JSON.stringify(next.sessionState),
            next.summary == null ? null : JSON.stringify(next.summary),
            createdAt,
            updatedAt,
            accountId,
          ]);
          return { record: next };
        },
      });
    },
    async clearPracticeSessions(accountId, learnerId, subjectId = null, mutation = {}) {
      const nowTs = nowFactory();
      return withLearnerMutation(db, {
        accountId,
        learnerId,
        kind: subjectId ? 'practice_sessions.delete' : 'practice_sessions.clear_learner',
        payload: {
          learnerId,
          subjectId: subjectId || null,
        },
        mutation,
        nowTs,
        apply: async () => {
          if (subjectId) {
            await run(db, 'DELETE FROM practice_sessions WHERE learner_id = ? AND subject_id = ?', [learnerId, subjectId]);
            return { learnerId, subjectId, cleared: true };
          }
          await run(db, 'DELETE FROM practice_sessions WHERE learner_id = ?', [learnerId]);
          return { learnerId, cleared: true };
        },
      });
    },
    async writeGameState(accountId, learnerId, systemId, state, mutation = {}) {
      const nowTs = nowFactory();
      return withLearnerMutation(db, {
        accountId,
        learnerId,
        kind: 'child_game_state.put',
        payload: {
          learnerId,
          systemId,
          state,
        },
        mutation,
        nowTs,
        apply: async () => {
          const next = cloneSerialisable(state) || {};
          await run(db, `
            INSERT INTO child_game_state (learner_id, system_id, state_json, updated_at, updated_by_account_id)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(learner_id, system_id) DO UPDATE SET
              state_json = excluded.state_json,
              updated_at = excluded.updated_at,
              updated_by_account_id = excluded.updated_by_account_id
          `, [learnerId, systemId, JSON.stringify(next), nowTs, accountId]);
          return {
            key: `${learnerId || 'default'}::${systemId || 'unknown'}`,
            state: next,
          };
        },
      });
    },
    async clearGameState(accountId, learnerId, systemId = null, mutation = {}) {
      const nowTs = nowFactory();
      return withLearnerMutation(db, {
        accountId,
        learnerId,
        kind: systemId ? 'child_game_state.delete' : 'child_game_state.clear_learner',
        payload: {
          learnerId,
          systemId: systemId || null,
        },
        mutation,
        nowTs,
        apply: async () => {
          if (systemId) {
            await run(db, 'DELETE FROM child_game_state WHERE learner_id = ? AND system_id = ?', [learnerId, systemId]);
            return { key: `${learnerId || 'default'}::${systemId || 'unknown'}`, cleared: true };
          }
          await run(db, 'DELETE FROM child_game_state WHERE learner_id = ?', [learnerId]);
          return { learnerId, cleared: true };
        },
      });
    },
    async appendEvent(accountId, event, mutation = {}) {
      const nowTs = nowFactory();
      const next = cloneSerialisable(event) || null;
      if (!next || typeof next !== 'object' || Array.isArray(next)) return { event: null };
      if (!(typeof next.learnerId === 'string' && next.learnerId)) {
        throw new BadRequestError('Event log records currently require learnerId.');
      }
      return withLearnerMutation(db, {
        accountId,
        learnerId: next.learnerId,
        kind: 'event_log.append',
        payload: { event: next },
        mutation,
        nowTs,
        apply: async () => {
          const id = typeof next.id === 'string' && next.id ? next.id : uid('event');
          const createdAt = asTs(next.createdAt, nowTs);
          const eventType = typeof next.type === 'string' && next.type
            ? next.type
            : (typeof next.kind === 'string' && next.kind ? next.kind : 'event');
          next.id = id;
          next.createdAt = createdAt;
          await run(db, `
            INSERT INTO event_log (id, learner_id, subject_id, system_id, event_type, event_json, created_at, actor_account_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              learner_id = excluded.learner_id,
              subject_id = excluded.subject_id,
              system_id = excluded.system_id,
              event_type = excluded.event_type,
              event_json = excluded.event_json,
              created_at = excluded.created_at,
              actor_account_id = excluded.actor_account_id
          `, [
            id,
            next.learnerId,
            next.subjectId || null,
            next.systemId || null,
            eventType,
            JSON.stringify(next),
            createdAt,
            accountId,
          ]);
          const activityRow = activityFeedRowFromEventRecord(next, {
            id,
            learnerId: next.learnerId,
            subjectId: next.subjectId || null,
            systemId: next.systemId || null,
            eventType,
            createdAt,
            now: nowTs,
          });
          if (activityRow) await upsertLearnerActivityFeedRows(db, [activityRow]);
          return { count: next ? 1 : 0, event: next };
        },
      });
    },
    async clearEventLog(accountId, learnerId, mutation = {}) {
      const nowTs = nowFactory();
      return withLearnerMutation(db, {
        accountId,
        learnerId,
        kind: 'event_log.clear_learner',
        payload: { learnerId },
        mutation,
        nowTs,
        apply: async () => {
          await batch(db, [
            bindStatement(db, 'DELETE FROM event_log WHERE learner_id = ?', [learnerId]),
            bindStatement(db, 'DELETE FROM learner_activity_feed WHERE learner_id = ?', [learnerId]),
            bindStatement(db, 'DELETE FROM learner_read_models WHERE learner_id = ?', [learnerId]),
          ]);
          return { learnerId, cleared: true };
        },
      });
    },
    async resetLearnerRuntime(accountId, learnerId, mutation = {}) {
      const nowTs = nowFactory();
      let boundedStoreReady = false;
      return withLearnerMutation(db, {
        accountId,
        learnerId,
        kind: 'learner_runtime.reset',
        payload: { learnerId },
        mutation,
        nowTs,
        preflight: async () => {
          boundedStoreReady = await boundedGameplayStoresAvailable(
            db,
            ['spelling', 'grammar', 'reading', 'punctuation'],
          );
          if (boundedStoreReady) {
            await requireExistingBoundedSpellingLearnerState(db, learnerId);
          }
        },
        apply: async () => {
          const statements = [
            bindStatement(db, 'DELETE FROM child_subject_state WHERE learner_id = ?', [learnerId]),
            bindStatement(db, 'DELETE FROM practice_sessions WHERE learner_id = ?', [learnerId]),
            bindStatement(db, 'DELETE FROM child_game_state WHERE learner_id = ?', [learnerId]),
            bindStatement(db, 'DELETE FROM event_log WHERE learner_id = ?', [learnerId]),
            bindStatement(db, 'DELETE FROM learner_activity_feed WHERE learner_id = ?', [learnerId]),
            bindStatement(db, 'DELETE FROM learner_read_models WHERE learner_id = ?', [learnerId]),
          ];
          if (boundedStoreReady) {
            statements.splice(1, 0,
              bindResetBoundedSpellingLearnerState(db, accountId, learnerId, nowTs),
              bindStatement(db, 'DELETE FROM spelling_item_state WHERE learner_id = ?', [learnerId]),
              bindStatement(db, 'DELETE FROM spelling_achievement_state WHERE learner_id = ?', [learnerId]),
              bindStatement(db, 'DELETE FROM grammar_item_state WHERE learner_id = ?', [learnerId]),
              bindStatement(db, 'DELETE FROM reading_question_state WHERE learner_id = ?', [learnerId]),
              bindStatement(db, 'DELETE FROM punctuation_item_state WHERE learner_id = ?', [learnerId]),
            );
          }
          await batch(db, statements);
          return {
            learnerId,
            reset: true,
          };
        },
      });
    },
    async exportSubjectContent(accountId, subjectId = 'spelling') {
      const account = await first(db, 'SELECT id, repo_revision, platform_role FROM adult_accounts WHERE id = ?', [accountId]);
      requireSubjectContentExportAccess(account);
      const globalRelease = await readPublishedContentOperationReleaseRow(db, subjectId, { includeSnapshot: true });
      if (globalRelease) {
        // This operator-only compatibility export is the sole read path that
        // intentionally hydrates the immutable authoring snapshot.
        const content = await readSpellingAuthoringContentFromRelease(globalRelease, subjectId);
        return {
          subjectId,
          content,
          summary: buildSpellingContentSummary(content),
          compatibility: {
            source: 'content_operation_release',
            releaseId: globalRelease.release_id,
            snapshotHash: globalRelease.snapshot_hash,
            legacyWriteDisabled: true,
            ...LEGACY_SPELLING_CONTENT_CUTOVER_COMPATIBILITY,
          },
          mutation: {
            policyVersion: MUTATION_POLICY_VERSION,
            scopeType: 'account',
            scopeId: accountId,
            accountRevision: Number(account?.repo_revision) || 0,
          },
        };
      }
      const content = await readSubjectContentBundle(db, accountId, subjectId);
      return {
        subjectId,
        content,
        summary: buildSpellingContentSummary(content),
        mutation: {
          policyVersion: MUTATION_POLICY_VERSION,
          scopeType: 'account',
          scopeId: accountId,
          accountRevision: Number(account?.repo_revision) || 0,
        },
      };
    },
    async readSubjectContent(accountId, subjectId = 'spelling') {
      const account = await first(db, 'SELECT id, repo_revision FROM adult_accounts WHERE id = ?', [accountId]);
      const content = await readSubjectContentBundle(db, accountId, subjectId);
      return {
        subjectId,
        content,
        summary: buildSpellingContentSummary(content),
        mutation: {
          policyVersion: MUTATION_POLICY_VERSION,
          scopeType: 'account',
          scopeId: accountId,
          accountRevision: Number(account?.repo_revision) || 0,
        },
      };
    },
    async readSpellingRuntimeContent(accountId, subjectId = 'spelling', options = {}) {
      return readSpellingRuntimeContentBundle(db, accountId, subjectId, {
        ...options,
        nowMs: nowFactory(),
        env,
      });
    },
    async readSpellingWordBank(accountId, learnerId, filters = {}) {
      return readSpellingWordBankBundle(db, accountId, learnerId, filters, nowFactory(), env);
    },
    // U9 → P7-U6: Punctuation telemetry read. Fires the same
    // `requireLearnerReadAccess` gate the spelling word-bank read uses
    // so a parent / admin with membership can query their learner's
    // telemetry, but a caller without membership gets a 403. The SQL
    // SELECT is delegated to `worker/src/subjects/punctuation/events.js`
    // for test reachability; the repository layer owns the authz gate.
    //
    // P7-U6: the read now fires an audit callback that inserts a
    // `punctuation.telemetry-read` mutation receipt so event timeline
    // reads are auditable in the ops activity stream.
    async readPunctuationEvents(accountId, learnerId, options = {}) {
      await requireLearnerReadAccess(db, accountId, learnerId);
      return listPunctuationEvents({
        db,
        learnerId,
        kind: options.kind || null,
        sinceMs: options.sinceMs ?? null,
        limit: options.limit ?? null,
        nowMs: nowFactory(),
        audit: async ({ resultCount, readAtMs }) => {
          const appliedAt = Number.isFinite(readAtMs) ? readAtMs : nowFactory();
          await db.prepare(`
            INSERT INTO mutation_receipts (
              account_id, request_id, scope_type, scope_id,
              mutation_kind, request_hash, response_json,
              status_code, correlation_id, applied_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            accountId,
            `telemetry-read-${appliedAt}-${Math.random().toString(36).slice(2, 8)}`,
            'learner',
            learnerId,
            'punctuation.telemetry-read',
            '',
            JSON.stringify({ resultCount }),
            200,
            null,
            appliedAt,
          ).run();
        },
      });
    },
    async readParentRecentSessions(accountId, options = {}) {
      return readParentRecentSessions(db, accountId, options);
    },
    async readParentActivity(accountId, options = {}) {
      return readParentActivity(db, accountId, options);
    },
    async upsertLearnerReadModel(learnerId, modelKey, model, options = {}) {
      return upsertLearnerReadModel(db, learnerId, modelKey, model, options);
    },
    async readLearnerReadModel(learnerId, modelKey) {
      return readLearnerReadModel(db, learnerId, modelKey);
    },
    async upsertLearnerActivityFeedRows(rows = []) {
      return upsertLearnerActivityFeedRows(db, rows);
    },
    async readLearnerActivityFeed(learnerId, options = {}) {
      return readLearnerActivityFeed(db, learnerId, options);
    },
    async writeSubjectContent(accountId, subjectId = 'spelling', rawContent, mutation = {}) {
      const nowTs = nowFactory();
      const account = await first(db, 'SELECT id, platform_role FROM adult_accounts WHERE id = ?', [accountId]);
      requireSubjectContentWriteAccess(account);
      const globalRelease = await readPublishedContentOperationReleaseRow(db, subjectId);
      if (globalRelease) {
        throw new ConflictError('Legacy spelling content writes are disabled after the global content operations cutover.', {
          code: 'subject_content_legacy_write_cutover',
          subjectId,
          releaseId: globalRelease.release_id,
          snapshotHash: globalRelease.snapshot_hash,
          publishedAt: Number(globalRelease.published_at) || 0,
          compatibility: LEGACY_SPELLING_CONTENT_CUTOVER_COMPATIBILITY,
        });
      }
      const seededBundle = await readSeededSpellingContentBundle();
      const content = backfillSpellingWordExplanations(rawContent, seededBundle);
      const validation = validateSpellingContentBundle(content);
      if (!validation.ok) {
        throw new BadRequestError('Spelling content validation failed.', {
          code: 'content_validation_failed',
          validation: {
            errors: validation.errors,
            warnings: validation.warnings,
          },
        });
      }
      return withAccountMutation(db, {
        accountId,
        kind: 'subject_content.put',
        payload: { subjectId, content: validation.bundle },
        mutation,
        nowTs,
        receiptResponse: (response) => {
          const { content: _content, ...compactResponse } = response;
          return compactResponse;
        },
        replayResponse: async ({ storedReplay }) => {
          const currentContent = await readSubjectContentBundle(db, accountId, subjectId);
          return {
            ...storedReplay,
            subjectId,
            content: currentContent,
            summary: buildSpellingContentSummary(currentContent),
          };
        },
        apply: async () => {
          await run(db, `
            INSERT INTO account_subject_content (account_id, subject_id, content_json, updated_at, updated_by_account_id)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(account_id, subject_id) DO UPDATE SET
              content_json = excluded.content_json,
              updated_at = excluded.updated_at,
              updated_by_account_id = excluded.updated_by_account_id
          `, [
            accountId,
            subjectId,
            JSON.stringify(validation.bundle),
            nowTs,
            accountId,
          ]);
          return {
            subjectId,
            content: validation.bundle,
            summary: buildSpellingContentSummary(validation.bundle),
          };
        },
      });
    },
    async readParentHub(accountId, learnerId = null) {
      const {
        account,
        readableMemberships,
        learnerId: resolvedLearnerId,
        membership,
      } = await resolveParentHistoryAccess(db, accountId, learnerId);
      const learnerRow = await first(db, `
        SELECT l.id, l.name, l.year_group, l.avatar_color, l.goal, l.daily_minutes, l.created_at, l.updated_at
        FROM learner_profiles l
        WHERE l.id = ?
      `, [resolvedLearnerId]);
      const spellingContent = await readSpellingContentForReadModels(db, accountId, 'spelling', {
        nowMs: nowFactory(),
        env,
      });
      const learnerBundle = await loadLearnerReadBundle(db, resolvedLearnerId, { now: nowFactory() });
      const { buildParentHubReadModel } = await import('../../src/platform/hubs/parent-read-model.js');
      const model = buildParentHubReadModel({
        learner: learnerRowToRecord(learnerRow),
        platformRole: accountPlatformRole(account),
        membershipRole: membership.role,
        accessibleLearners: readableMemberships.map(membershipRowToModel),
        selectedLearnerId: resolvedLearnerId,
        subjectStates: learnerBundle.subjectStates,
        practiceSessions: learnerBundle.practiceSessions,
        eventLog: learnerBundle.eventLog,
        gameState: learnerBundle.gameState,
        runtimeSnapshots: { spelling: spellingContent.runtimeSnapshot },
        now: nowFactory,
      });
      return {
        learnerId: resolvedLearnerId,
        parentHub: model,
      };
    },
    async readAdminHub(accountId, {
      learnerId = null,
      requestId = null,
      auditLimit = 20,
    } = {}) {
      // P3 U1 (R22): single assertAdminHubActor call — the resolved actor
      // row is threaded to every downstream helper so the admin-role DB
      // lookup fires exactly once per readAdminHub invocation.
      const actor = await assertAdminHubActor(db, accountId);
      const account = actor;

      // Sequential: memberships depend on account lookup, learner bundles
      // depend on membership list, and only the selected learner's detailed
      // bundle belongs on this request path.
      const memberships = await listMembershipRows(db, accountId, { writableOnly: false });
      const defaultLearnerId = account?.selected_learner_id && memberships.some((membership) => membership.id === account.selected_learner_id)
        ? account.selected_learner_id
        : (memberships[0]?.id || null);
      const selectedLearnerId = learnerId && memberships.some((membership) => membership.id === learnerId)
        ? learnerId
        : defaultLearnerId;
      const spellingContent = await readSpellingContentForReadModels(db, accountId, 'spelling', {
        nowMs: nowFactory(),
        env,
      });
      const hubNow = nowFactory();
      const learnerBundles = {};
      if (selectedLearnerId) {
        learnerBundles[selectedLearnerId] = await loadLearnerReadBundle(db, selectedLearnerId, { now: hubNow });
      }
      const auditEntries = await listMutationReceiptRows(db, accountId, {
        requestId,
        limit: auditLimit,
      });
      const nowTs = hubNow;

      // P3 U1 (R22): parallelise independent queries. These share no
      // read-dependency after the learner bundles are loaded. The pre-
      // resolved `actor` row is threaded so none of them re-query
      // adult_accounts for the admin-role check.
      const [
        demoOperations,
        monsterVisualConfig,
        dashboardKpis,
        opsActivityStream,
        accountOpsMetadata,
        errorLogSummary,
      ] = await Promise.all([
        readDemoOperationSummary(db, nowTs),
        readMonsterVisualConfigState(db, nowTs),
        readDashboardKpis(db, { now: nowTs, actorAccountId: accountId, actor }),
        listRecentMutationReceipts(db, {
          now: nowTs,
          actorAccountId: accountId,
          actor,
          limit: OPS_ACTIVITY_STREAM_DEFAULT_LIMIT,
        }),
        readAccountOpsMetadataDirectory(db, {
          now: nowTs,
          actorAccountId: accountId,
          actorPlatformRole: accountPlatformRole(account),
          actor,
        }),
        readOpsErrorEventSummary(db, {
          now: nowTs,
          actorAccountId: accountId,
          actor,
          limit: OPS_ERROR_EVENTS_DEFAULT_LIMIT,
        }),
      ]);
      // Phase E UX-1: surface the build's current release hash on the
      // admin hub payload so `ErrorLogCentrePanel` can pre-fill the
      // "New in release" filter and the drawer helper text. The value
      // mirrors `buildHash` used on `updateOpsErrorEventStatus` — null
      // when `env.BUILD_HASH` is missing, malformed, or a dirty-tree
      // build. Null is rendered as "unavailable — paste a SHA" in the
      // UI so admins still see the input without a misleading default.
      //
      // Phase E adv-e-5: reads the factory-validated `resolvedBuildHash`
      // instead of re-running the regex inline. A single validation
      // point prevents the three consumers drifting out of sync and
      // ensures the "malformed env var" warning fires exactly once per
      // Worker invocation rather than per GET.
      const currentRelease = resolvedBuildHash;
      const { buildAdminHubReadModel } = await import('../../src/platform/hubs/admin-read-model.js');
      const model = buildAdminHubReadModel({
        account: {
          id: accountId,
          selectedLearnerId,
          repoRevision: Number(account?.repo_revision) || 0,
          platformRole: accountPlatformRole(account),
        },
        platformRole: accountPlatformRole(account),
        spellingContentSummary: spellingContent.summary,
        memberships: memberships.map(membershipRowToModel),
        learnerBundles,
        runtimeSnapshots: { spelling: spellingContent.runtimeSnapshot },
        demoOperations,
        monsterVisualConfig,
        auditEntries: auditEntries.map((row) => ({
          requestId: row.request_id,
          mutationKind: row.mutation_kind,
          scopeType: row.scope_type,
          scopeId: row.scope_id,
          correlationId: row.correlation_id,
          appliedAt: row.applied_at,
          statusCode: row.status_code,
        })),
        auditAvailable: true,
        selectedLearnerId,
        now: nowFactory,
      });
      return {
        adminHub: {
          ...model,
          dashboardKpis,
          opsActivityStream,
          accountOpsMetadata,
          // Phase E UX-1: thread `currentRelease` into the error-log
          // envelope so the admin-read-model normaliser can surface it
          // on `model.errorLogSummary.currentRelease`. Attaching here
          // (rather than on the bare `adminHub` root) keeps the payload
          // shape cohesive — everything the error-log panel needs
          // ships under one key.
          errorLogSummary: {
            ...(errorLogSummary || {}),
            currentRelease,
          },
        },
      };
    },
    async readAdminOpsKpi(accountId) {
      return readDashboardKpis(db, {
        now: nowFactory(),
        actorAccountId: accountId,
      });
    },
    async listAdminOpsActivity(accountId, { limit = OPS_ACTIVITY_STREAM_DEFAULT_LIMIT } = {}) {
      return listRecentMutationReceipts(db, {
        now: nowFactory(),
        actorAccountId: accountId,
        limit,
      });
    },
    async readAdminOpsErrorEvents(accountId, { status = null, limit = OPS_ERROR_EVENTS_DEFAULT_LIMIT, filter = null } = {}) {
      const summary = await readOpsErrorEventSummary(db, {
        now: nowFactory(),
        actorAccountId: accountId,
        status,
        limit,
        filter,
      });
      // Phase E UX-1: narrow refresh path mirrors the full-hub payload
      // so the dispatcher that replaces `model.errorLogSummary` after
      // a filter apply still hydrates `currentRelease`. Without this,
      // clicking "Apply filters" would null-out the pre-fill hint.
      //
      // Phase E adv-e-5: reuses the factory-validated `resolvedBuildHash`
      // for consistency with `readAdminHub`.
      return {
        ...(summary || {}),
        currentRelease: resolvedBuildHash,
      };
    },
    // PR #188 H1: dedicated narrow read that mirrors the other three admin
    // ops GETs. Calls into the shared `readAccountOpsMetadataDirectory`
    // helper so R25 (ops-role internalNotes redaction) is enforced identically
    // whether the caller is the full hub bundle or the narrow per-panel route.
    async readAdminOpsAccountsMetadata(accountId) {
      const actor = await assertAdminHubActor(db, accountId);
      const actorPlatformRole = normalisePlatformRole(actor?.platform_role);
      return readAccountOpsMetadataDirectory(db, {
        now: nowFactory(),
        actorAccountId: accountId,
        actorPlatformRole,
        actor,
      });
    },
    // U9 (P3): cross-subject content overview. Read-only; R16 compliant.
    async readSubjectContentOverview(accountId) {
      const actor = await assertAdminHubActor(db, accountId);
      return readSubjectContentOverviewData(db, {
        now: nowFactory(),
        actorAccountId: accountId,
        actor,
        env,
      });
    },
    // U7 (P6): content quality signals. Read-only; R16 compliant.
    async readContentQualitySignals(accountId) {
      const actor = await assertAdminHubActor(db, accountId);
      return readContentQualitySignalsData(db, {
        now: nowFactory(),
        actorAccountId: accountId,
        actor,
        env,
      });
    },
    // U8 (P3): narrow read for the denial log panel in Debugging section.
    // R8 visibility: admin sees masked account_id (last 8); ops sees
    // denial_reason + route only (no account or learner linkage).
    async readAdminRequestDenials(accountId, {
      reason = null,
      route = null,
      accountId: filterAccountId = null,
      from = null,
      to = null,
      limit = DENIAL_DEFAULT_LIMIT,
    } = {}) {
      return readAdminRequestDenials(db, {
        now: nowFactory(),
        actorAccountId: accountId,
        reason,
        route,
        accountId: filterAccountId,
        from,
        to,
        limit,
      });
    },
    // U6 (P3): Debug Bundle — resolve actor for auth + redaction.
    // Returns { platformRole } so the route can call redactBundleForRole
    // with the correct role. The bundle aggregation itself runs against
    // the raw DB handle (standalone module pattern) but the auth gate
    // goes through the repository's assertAdminHubActor.
    async assertAdminHubActorForBundle(accountId) {
      const actor = await assertAdminHubActor(db, accountId);
      return {
        platformRole: normalisePlatformRole(actor?.platform_role),
      };
    },
    async bumpAdminKpiMetric(key, delta = 1) {
      return bumpAdminKpiMetric(db, key, nowFactory(), delta);
    },
    async listAdminAccounts(accountId) {
      return listAccountDirectory(db, accountId);
    },
    // U7 (P3): account search — admin/ops gated via assertAdminHubActor.
    async searchAccounts(accountId, {
      query = '',
      opsStatus = null,
      platformRole = null,
      limit = ACCOUNT_SEARCH_DEFAULT_LIMIT,
    } = {}) {
      return searchAccounts(db, {
        now: nowFactory(),
        actorAccountId: accountId,
        query,
        opsStatus,
        platformRole,
        limit,
      });
    },
    // U7 (P3): account detail — admin/ops gated via assertAdminHubActor.
    async readAccountDetail(accountId, { targetAccountId } = {}) {
      return readAccountDetail(db, {
        now: nowFactory(),
        actorAccountId: accountId,
        targetAccountId,
      });
    },
    async updateAdminAccountRole(accountId, { targetAccountId, platformRole, expectedRepoRevision = null, requestId, correlationId = null } = {}) {
      return updateManagedAccountRole(db, {
        actorAccountId: accountId,
        targetAccountId,
        platformRole,
        expectedRepoRevision,
        requestId,
        correlationId: correlationId || requestId,
        nowTs: nowFactory(),
      });
    },
    async updateAccountOpsMetadata(accountId, {
      targetAccountId,
      patch,
      expectedRowVersion = null,
      mutation = {},
    } = {}) {
      return updateAccountOpsMetadata(db, {
        actorAccountId: accountId,
        targetAccountId,
        patch,
        expectedRowVersion,
        mutation,
        nowTs: nowFactory(),
      });
    },
    async updateOpsErrorEventStatus(accountId, {
      eventId,
      status,
      expectedPreviousStatus = null,
      mutation = {},
    } = {}) {
      return updateOpsErrorEventStatus(db, {
        actorAccountId: accountId,
        eventId,
        status,
        expectedPreviousStatus,
        mutation,
        nowTs: nowFactory(),
        // U15: forward `env.BUILD_HASH` so `→ resolved` transitions can
        // stamp the `resolved_in_release` column for Phase E's auto-reopen
        // rule. Missing env var → null (no stamp), which is the documented
        // opt-out per the plan.
        //
        // Phase E adv-e-5: reads the factory-validated value so a
        // malformed env var is consistently treated as "no stamp" and
        // emits a single warning at factory boot rather than silently
        // stamping a non-SHA literal that the server-side regex would
        // later reject.
        buildHash: resolvedBuildHash,
      });
    },
    // P2 U3: admin-gated QA seed harness. Dispatches to the
    // `seedPostMegaLearnerState` helper above so the CSRF-safe
    // mutation-receipt + batch-atomic write lives in one place.
    async seedPostMegaLearnerState(accountId, {
      learnerId,
      shapeName,
      today = null,
      confirmOverwrite = false,
      mutation = {},
    } = {}) {
      return seedPostMegaLearnerState(db, {
        actorAccountId: accountId,
        learnerId,
        shapeName,
        today,
        confirmOverwrite,
        mutation,
        nowTs: nowFactory(),
      });
    },
    async restorePostMegaSeedPreimage(accountId, {
      learnerId,
      preimageId,
      confirmOverwrite = false,
      mutation = {},
    } = {}) {
      return restorePostMegaSeedPreimage(db, {
        actorAccountId: accountId,
        learnerId,
        preimageId,
        confirmOverwrite,
        mutation,
        nowTs: nowFactory(),
      });
    },
    async reconcileAdminKpiMetrics(accountId, {
      requestId,
      correlationId = null,
      clientComputed = null,
    } = {}) {
      // admin-only. `requireAccountRoleManager` forbids non-admin
      // actors. Internal reconciliation (cron path) bypasses this by
      // calling `reconcileAdminKpiMetricsInternal` directly.
      const actor = await assertAdminHubActor(db, accountId);
      requireAccountRoleManager(actor);
      return reconcileAdminKpiMetricsInternal(db, {
        actorAccountId: accountId,
        requestId,
        correlationId,
        clientComputed,
        nowTs: nowFactory(),
      });
    },
    // U10: Grammar Writing Try admin archive + hard-delete routes. These
    // are the FIRST admin-scoped subject-data pathway in the repository,
    // mirroring `requireMonsterVisualConfigManager` (config is global,
    // archive/delete is per-learner, but the RBAC primitive is the same:
    // `requireAdminHubAccess` via `assertAdminHubActor`). Role is
    // derived server-side from the actor account ONLY — the body is not
    // inspected for role claims.
    async archiveGrammarTransferEvidence(accountId, { learnerId, promptId, mutation = {} } = {}) {
      return archiveGrammarTransferEvidence(db, {
        actorAccountId: accountId,
        learnerId,
        promptId,
        mutation,
        nowTs: nowFactory(),
      });
    },
    async deleteGrammarTransferEvidence(accountId, { learnerId, promptId, mutation = {} } = {}) {
      return deleteGrammarTransferEvidence(db, {
        actorAccountId: accountId,
        learnerId,
        promptId,
        mutation,
        nowTs: nowFactory(),
      });
    },
    async recordClientErrorEvent({ clientEvent, sessionAccountId = null } = {}) {
      return recordClientErrorEvent(db, {
        clientEvent,
        sessionAccountId,
        nowTs: nowFactory(),
      });
    },
    async isClientErrorFingerprintKnown({ clientEvent } = {}) {
      return isClientErrorFingerprintKnown(db, { clientEvent });
    },
    // U5 (P3): occurrence timeline read. Admin/ops-gated via
    // `assertAdminHubActor` inside the helper.
    async readErrorEventOccurrences(accountId, eventId, { limit } = {}) {
      return readErrorEventOccurrences(db, {
        actorAccountId: accountId,
        eventId,
        limit,
      });
    },
    async saveMonsterVisualConfigDraft(accountId, { draft, mutation = {} } = {}) {
      return saveMonsterVisualConfigDraft(db, accountId, draft, mutation, nowFactory());
    },
    async publishMonsterVisualConfig(accountId, { mutation = {} } = {}) {
      return publishMonsterVisualConfig(db, accountId, mutation, nowFactory());
    },
    async restoreMonsterVisualConfigVersion(accountId, { version, mutation = {} } = {}) {
      return restoreMonsterVisualConfigVersion(db, accountId, version, mutation, nowFactory());
    },
    async resetAccountScope(accountId, mutation = {}) {
      const nowTs = nowFactory();
      return withAccountMutation(db, {
        accountId,
        kind: 'debug.reset',
        payload: { reset: true },
        mutation,
        nowTs,
        apply: async () => {
          const rows = await listMembershipRows(db, accountId, { writableOnly: false });
          for (const row of rows) {
            await releaseMembershipOrDeleteLearner(db, accountId, row.id, row.role, nowTs);
          }
          await run(db, 'UPDATE adult_accounts SET selected_learner_id = NULL, updated_at = ? WHERE id = ?', [nowTs, accountId]);
          await run(db, 'DELETE FROM account_subject_content WHERE account_id = ?', [accountId]);
          // U7: wholesale reset still bumps the list revision so cached
          // clients invalidate on the next bootstrap.
          if (rows.length > 0) {
            await bumpAccountLearnerListRevision(db, accountId, nowTs);
          }
          const bundle = await bootstrapBundle(db, accountId, { env });
          return {
            reset: true,
            learners: bundle.learners,
            syncState: bundle.syncState,
          };
        },
      });
    },
    async membership(accountId, learnerId) {
      return getMembership(db, accountId, learnerId);
    },
    async learnerOwnerCount(learnerId) {
      return Number(await scalar(db, `
        SELECT COUNT(*) AS count
        FROM account_learner_memberships
        WHERE learner_id = ? AND role = 'owner'
      `, [learnerId], 'count') || 0);
    },
    async accessibleLearnerIds(accountId) {
      const rows = await listMembershipRows(db, accountId, { writableOnly: true });
      return rows.map((row) => row.id);
    },
    // Hero Mode P0: public authz gate so the route handler can validate
    // learner access before any data read. Delegates to the module-private
    // `requireLearnerReadAccess` which throws ForbiddenError on failure.
    async requireLearnerReadAccess(accountId, learnerId) {
      return requireLearnerReadAccess(db, accountId, learnerId);
    },
    async readHeroCampRewardTracks(accountId, subjectId = 'spelling') {
      return readHeroCampRewardTracks(db, accountId, subjectId);
    },
    // Hero Mode P0/P2: read per-subject read-model data for the hero
    // providers. Spelling is intentionally sourced from its bounded gameplay
    // record; after migration 0023 the legacy child_subject_state spelling row
    // is cold rollback/history data and is never hydrated by Hero launch. The
    // temporary missing-table branch below exists only so code can deploy
    // before the migration gate. Other subjects use their canonical rows.
    // P2 active session detection inspects `ui` for heroContext.
    async readHeroSubjectReadModels(learnerId, { now = Date.now() } = {}) {
      let rows;
      if (!await boundedGameplayTableAvailable(db, 'spelling')) {
        rows = await all(db, `
          SELECT learner_id, subject_id, data_json, ui_json, updated_at, NULL AS spelling_stats_json
          FROM child_subject_state
          WHERE learner_id = ?
        `, [learnerId]);
      } else try {
        rows = await all(db, `
          SELECT learner_id, subject_id, data_json, ui_json, updated_at, NULL AS spelling_stats_json
          FROM child_subject_state
          WHERE learner_id = ?
            AND subject_id <> 'spelling'
          UNION ALL
          SELECT learner_id, 'spelling' AS subject_id, data_json, ui_json, updated_at,
                 stats_json AS spelling_stats_json
          FROM spelling_learner_state
          WHERE learner_id = ?
        `, [learnerId, learnerId]);
        markBoundedGameplayTableAvailable(db, 'spelling');
        await requireBoundedSpellingLearnerState(
          db,
          learnerId,
          rows.some((row) => row?.subject_id === 'spelling'),
          true,
        );
      } catch (error) {
        if (!isMissingTableError(error, 'spelling_learner_state')) throw error;
        await requireLegacyGameplayFallbackAllowed(
          db,
          'spelling',
          'spelling_learner_state',
          error,
        );
        rows = await all(db, `
          SELECT learner_id, subject_id, data_json, ui_json, updated_at, NULL AS spelling_stats_json
          FROM child_subject_state
          WHERE learner_id = ?
        `, [learnerId]);
      }
      const result = {};
      for (const row of rows) {
        const rawRecord = subjectStateRowToRecord(row);
        const spellingStats = row.subject_id === 'spelling' && row.spelling_stats_json != null
          ? publicSpellingStats(materialiseSpellingGameplayStats(row.spelling_stats_json, now))
          : null;
        const projection = projectHeroSubjectRecord({
          subjectId: row.subject_id,
          data: rawRecord.data,
          ui: rawRecord.ui,
          spellingStats,
          now,
        });
        if (projection.data || projection.ui) {
          result[row.subject_id] = projection;
        }
      }
      return result;
    },
  };
}

// ─── Barrel re-exports ───────────────────────────────────────────────────────
// P3 U6: extracted modules re-exported so existing consumers continue to
// import from './repository.js' without import-path changes.

export {
  accountPlatformRole,
  accountType,
  getMembership,
  learnerRowToRecord,
  listMembershipRows,
  membershipRowToModel,
  normaliseRequestedPlatformRole,
  requireAccountRoleManager,
  requireAdminHubAccess,
  requireGrammarTransferAdmin,
  requireLearnerReadAccess,
  requireLearnerWriteAccess,
  requireMonsterVisualConfigManager,
  requireParentHubAccess,
  requireSubjectContentExportAccess,
  requireSubjectContentWriteAccess,
  writableRole,
} from './membership-repository.js';

export {
  bootstrapCapacityMeta,
  BOOTSTRAP_CAPACITY_VERSION,
  BOOTSTRAP_MODES,
  BOOTSTRAP_V2_ENVELOPE_SHAPE,
  compactLearnerListEntry,
  computeBootstrapRevisionHash,
  computeWritableLearnerStatesDigest,
  PUBLIC_BOOTSTRAP_ACTIVE_SESSION_LIMIT_PER_LEARNER,
  PUBLIC_BOOTSTRAP_ACTIVE_SESSION_LOOKUP_LIMIT_PER_LEARNER,
  PUBLIC_BOOTSTRAP_CAPACITY_VERSION,
  PUBLIC_BOOTSTRAP_RECENT_EVENT_LIMIT_PER_LEARNER,
  PUBLIC_BOOTSTRAP_RECENT_SESSION_LIMIT_PER_LEARNER,
  resolveBootstrapSelectedLearnerId,
} from './bootstrap-repository.js';

// P4 U9: pure row-transform functions and their constants re-exported so
// existing consumers continue to import from './repository.js'.
export {
  contentRowToBundle,
  eventRowToRecord,
  gameStateRowToRecord,
  practiceSessionRowToRecord,
  publicEventRowToRecord,
  PUBLIC_EVENT_TEXT_ENUMS,
  PUBLIC_EVENT_TYPES,
  publicGameStateRowToRecord,
  publicMonsterCodexEntry,
  publicMonsterCodexHasMastery,
  publicMonsterCodexState,
  publicMonsterCodexStateFromSpellingProgress,
  publicMonsterCodexStateWithoutSpellingEntries,
  PUBLIC_MONSTER_BRANCHES,
  PUBLIC_MONSTER_CODEX_SYSTEM_ID,
  PUBLIC_DIRECT_SPELLING_MONSTER_IDS,
  PUBLIC_MONSTER_IDS,
  PUBLIC_SPELLING_MONSTER_IDS,
  PUBLIC_SPELLING_REWARD_TRACK_IDS,
  PUBLIC_PRACTICE_CARD_LABELS,
  publicPracticeLabel,
  publicPracticeSessionRowToRecord,
  publicPracticeSessionSummary,
  publicPunctuationPracticeSessionSummary,
  publicMistakeSummary,
  publicSpellingAnalytics,
  publicSpellingStats,
  PUBLIC_SPELLING_YEAR_LABELS,
  publicSummaryCards,
  safePublicEventEnum,
  safePublicEventNumber,
  safePublicEventText,
  safePublicEventType,
  safeSpellingCurrentCard,
  safeSpellingPrompt,
  safeSpellingSessionProgress,
  secureSpellingProgress,
  spellingProgressFromSubjectRow,
  SPELLING_SECURE_STAGE,
  subjectStateRowToRecord,
} from './row-transforms.js';
