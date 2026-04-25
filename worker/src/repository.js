import {
  cloneSerialisable,
  currentRepositoryMeta,
  emptyLearnersSnapshot,
  filterSessions,
  gameStateKey,
  normaliseEventLog,
  normaliseLearnerRecord,
  normaliseLearnersSnapshot,
  normalisePracticeSessionRecord,
  normaliseRepositoryBundle,
  normaliseSubjectStateRecord,
  subjectStateKey,
} from '../../src/platform/core/repositories/helpers.js';
import { uid } from '../../src/platform/core/utils.js';
import {
  backfillSpellingWordExplanations,
  buildSpellingContentSummary,
  normaliseSpellingContentBundle,
  resolveRuntimeSnapshot,
  validateSpellingContentBundle,
} from '../../src/subjects/spelling/content/model.js';
import { SEEDED_SPELLING_CONTENT_BUNDLE } from '../../src/subjects/spelling/data/content-data.js';
import {
  PLATFORM_ROLES,
  canManageAccountRoles,
  canViewAdminHub,
  canViewParentHub,
  normalisePlatformRole,
} from '../../src/platform/access/roles.js';
import { buildAdminHubReadModel } from '../../src/platform/hubs/admin-read-model.js';
import { buildParentHubReadModel } from '../../src/platform/hubs/parent-read-model.js';
import { monsterIdForSpellingWord } from '../../src/platform/game/monster-system.js';
import { buildSpellingProgressPools, buildSpellingWordBankReadModel } from './content/spelling-read-models.js';
import {
  activityFeedRowFromEventRow,
  COMMAND_PROJECTION_MODEL_KEY,
  emptyLearnerReadModel,
  normaliseActivityFeedRow,
  normaliseLearnerReadModelRow,
  normaliseReadModelKey,
} from './read-models/learner-read-models.js';
import { buildSpellingAudioCue } from './subjects/spelling/audio.js';
import { buildPunctuationReadModel } from './subjects/punctuation/read-models.js';
import { createPunctuationService } from '../../shared/punctuation/service.js';
import {
  createInitialPunctuationState,
  normalisePunctuationSummary,
} from '../../src/subjects/punctuation/service-contract.js';
import {
  BUNDLED_MONSTER_VISUAL_CONFIG,
  MONSTER_VISUAL_SCHEMA_VERSION,
  validateMonsterVisualConfigForPublish,
  validatePublishedConfigForPublish,
} from '../../src/platform/game/monster-visual-config.js';
import { MONSTER_ASSET_MANIFEST } from '../../src/platform/game/monster-asset-manifest.js';
import { bundledEffectConfig } from '../../src/platform/game/render/effect-config-defaults.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from './errors.js';
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
  withTransaction,
} from './d1.js';

const WRITABLE_MEMBERSHIP_ROLES = new Set(['owner', 'member']);
const MEMBERSHIP_ROLES = new Set(['owner', 'member', 'viewer']);
const MUTATION_POLICY_VERSION = 1;
const PUBLIC_SPELLING_YEAR_LABELS = new Map([
  ['3-4', 'Years 3-4'],
  ['5-6', 'Years 5-6'],
  ['extra', 'Extra spellings'],
]);
const PUBLIC_PRACTICE_CARD_LABELS = new Map([
  ['correct', 'Correct'],
  ['accuracy', 'Accuracy'],
]);
const PUBLIC_EVENT_TYPES = new Set([
  'spelling.retry-cleared',
  'spelling.word-secured',
  'spelling.mastery-milestone',
  'spelling.session-completed',
  'reward.monster',
  'platform.practice-streak-hit',
]);
const PUBLIC_BOOTSTRAP_RECENT_SESSION_LIMIT_PER_LEARNER = 5;
const PUBLIC_BOOTSTRAP_ACTIVE_SESSION_LIMIT_PER_LEARNER = 1;
const PUBLIC_BOOTSTRAP_ACTIVE_SESSION_LOOKUP_LIMIT_PER_LEARNER = 5;
const PUBLIC_BOOTSTRAP_RECENT_EVENT_LIMIT_PER_LEARNER = 50;
const PUBLIC_BOOTSTRAP_CAPACITY_VERSION = 1;
const PUBLIC_MONSTER_CODEX_SYSTEM_ID = 'monster-codex';
const PROJECTION_RECENT_EVENT_LIMIT = 200;
const CAPACITY_READ_MODEL_TABLES = Object.freeze([
  'learner_read_models',
  'learner_activity_feed',
]);
const COMMAND_PROJECTION_READ_MODEL_VERSION = 1;
const PUBLIC_MONSTER_IDS = new Set(['inklet', 'glimmerbug', 'phaeton', 'vellhorn']);
const PUBLIC_DIRECT_SPELLING_MONSTER_IDS = ['inklet', 'glimmerbug', 'vellhorn'];
const PUBLIC_MONSTER_BRANCHES = new Set(['b1', 'b2']);
const SPELLING_RUNTIME_CONTENT_CACHE_LIMIT = 8;
const spellingRuntimeContentCache = new Map();
const SPELLING_SECURE_STAGE = 4;
const MONSTER_VISUAL_CONFIG_ID = 'global';
const MONSTER_VISUAL_SCOPE_TYPE = 'platform';
const MONSTER_VISUAL_SCOPE_ID = 'monster-visual-config';
const PUBLIC_EVENT_TEXT_ENUMS = {
  mode: new Set(['smart', 'trouble', 'single', 'test']),
  sessionType: new Set(['learning', 'test']),
  kind: new Set(['caught', 'evolve', 'mega', 'levelup']),
  monsterId: new Set(['inklet', 'glimmerbug', 'phaeton', 'vellhorn']),
  spellingPool: new Set(['core', 'extra']),
  yearBand: new Set(['3-4', '5-6', 'extra']),
  fromPhase: new Set(['retry', 'correction']),
};

function safeJsonParse(text, fallback) {
  if (text == null || text === '') return cloneSerialisable(fallback);
  try {
    return JSON.parse(text);
  } catch {
    return cloneSerialisable(fallback);
  }
}

function asTs(value, fallback) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  return fallback;
}

function isMissingTableError(error, tableName) {
  const message = String(error?.message || '');
  return new RegExp(`no such table:\\s*${tableName}\\b`, 'i').test(message);
}

function isMissingCapacityReadModelTableError(error) {
  return CAPACITY_READ_MODEL_TABLES.some((tableName) => isMissingTableError(error, tableName));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableClone(value) {
  if (Array.isArray(value)) return value.map(stableClone);
  if (isPlainObject(value)) {
    return Object.keys(value)
      .sort()
      .reduce((output, key) => {
        output[key] = stableClone(value[key]);
        return output;
      }, {});
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableClone(cloneSerialisable(value)));
}

function mutationPayloadHash(kind, payload) {
  return stableStringify({ kind, payload: cloneSerialisable(payload) });
}

function subjectStateRowToRecord(row) {
  return normaliseSubjectStateRecord({
    ui: safeJsonParse(row.ui_json, null),
    data: safeJsonParse(row.data_json, {}),
    updatedAt: row.updated_at,
  });
}

function safeSpellingPrompt(prompt) {
  if (!prompt || typeof prompt !== 'object' || Array.isArray(prompt)) return null;
  return {
    cloze: typeof prompt.cloze === 'string' ? prompt.cloze : '',
  };
}

function safeSpellingCurrentCard(card) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return null;
  return {
    prompt: safeSpellingPrompt(card.prompt),
  };
}

function safeSpellingSessionProgress(progress) {
  if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return null;
  const output = {};
  for (const key of ['done', 'total']) {
    const value = Number(progress[key]);
    if (Number.isFinite(value) && value >= 0) output[key] = Math.floor(value);
  }
  return Object.keys(output).length ? output : null;
}

function publicSpellingStats(progressPools) {
  if (!isPlainObject(progressPools)) return {};
  return {
    all: cloneSerialisable(progressPools.all || progressPools.core || {}),
    core: cloneSerialisable(progressPools.core || progressPools.all || {}),
    y34: cloneSerialisable(progressPools.y34 || {}),
    y56: cloneSerialisable(progressPools.y56 || {}),
    extra: cloneSerialisable(progressPools.extra || {}),
  };
}

function publicSpellingAnalytics(progressPools, now) {
  if (!isPlainObject(progressPools)) return null;
  return {
    version: 1,
    generatedAt: Number(now) || Date.now(),
    pools: cloneSerialisable(progressPools),
    wordGroups: [],
    wordBank: {
      source: 'server-bootstrap',
    },
  };
}

function redactSpellingUiForClient(ui, data = {}, learnerId = '', {
  audio = null,
  contentSnapshot = null,
  now = Date.now(),
} = {}) {
  const raw = ui && typeof ui === 'object' && !Array.isArray(ui) ? ui : {};
  const session = raw.session && typeof raw.session === 'object' && !Array.isArray(raw.session)
    ? raw.session
    : null;
  const progressPools = contentSnapshot
    ? buildSpellingProgressPools({ contentSnapshot, data, now })
    : null;
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
    analytics: publicSpellingAnalytics(progressPools, now),
    audio: audio ? cloneSerialisable(audio) : null,
    content: null,
  };
}

function createPunctuationReadModelService(data, now) {
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

function redactPunctuationUiForClient(ui, data = {}, learnerId = '', { now = Date.now() } = {}) {
  const service = createPunctuationReadModelService(data, now);
  const state = service.initState(ui || createInitialPunctuationState());
  const readModel = buildPunctuationReadModel({
    learnerId,
    state,
    prefs: service.getPrefs(learnerId),
    stats: service.getStats(learnerId),
    analytics: service.getAnalyticsSnapshot(learnerId),
  });
  if (readModel.summary?.gps) {
    readModel.summary = publicPunctuationPracticeSessionSummary(readModel.summary);
  }
  return readModel;
}

async function publicSubjectStateRowToRecord(row, { spellingContentSnapshot = null, now = Date.now() } = {}) {
  const record = subjectStateRowToRecord(row);
  if (row.subject_id === 'punctuation') {
    return normaliseSubjectStateRecord({
      ui: redactPunctuationUiForClient(record.ui, record.data, row.learner_id, { now }),
      data: {},
      updatedAt: record.updatedAt,
    });
  }
  if (row.subject_id !== 'spelling') return record;
  const audio = await buildSpellingAudioCue({
    learnerId: row.learner_id,
    state: record.ui,
  });
  return normaliseSubjectStateRecord({
    ui: redactSpellingUiForClient(record.ui, record.data, row.learner_id, {
      audio,
      contentSnapshot: spellingContentSnapshot,
      now,
    }),
    data: {},
    updatedAt: record.updatedAt,
  });
}

function learnerRowToRecord(row) {
  return normaliseLearnerRecord({
    id: row.id,
    name: row.name,
    yearGroup: row.year_group,
    avatarColor: row.avatar_color,
    goal: row.goal,
    dailyMinutes: row.daily_minutes,
    createdAt: row.created_at,
  }, row.id);
}

function gameStateRowToRecord(row) {
  return cloneSerialisable(safeJsonParse(row.state_json, {})) || {};
}

function publicMonsterCodexEntry(entry) {
  if (!isPlainObject(entry)) return null;
  const masteredCount = Number(entry.masteredCount);
  const mastered = Array.isArray(entry.mastered)
    ? entry.mastered.filter((slug) => typeof slug === 'string' && slug).length
    : Number.isFinite(masteredCount) && masteredCount > 0
      ? Math.floor(masteredCount)
      : 0;
  const output = {
    masteredCount: mastered,
    caught: Boolean(entry.caught) || mastered > 0,
  };
  if (PUBLIC_MONSTER_BRANCHES.has(entry.branch)) output.branch = entry.branch;
  return output;
}

function publicMonsterCodexState(rawState) {
  const state = isPlainObject(rawState) ? rawState : {};
  const output = {};
  for (const monsterId of PUBLIC_MONSTER_IDS) {
    const entry = publicMonsterCodexEntry(state[monsterId]);
    if (entry) output[monsterId] = entry;
  }
  return output;
}

function publicGameStateRowToRecord(row) {
  if (row.system_id !== PUBLIC_MONSTER_CODEX_SYSTEM_ID) return null;
  return publicMonsterCodexState(gameStateRowToRecord(row));
}

function secureSpellingProgress(entry) {
  const stage = Number(entry?.stage);
  return Number.isFinite(stage) && stage >= SPELLING_SECURE_STAGE;
}

function spellingProgressFromSubjectRow(row) {
  const data = safeJsonParse(row?.data_json, {});
  return isPlainObject(data?.progress) ? data.progress : null;
}

function publicMonsterCodexStateFromSpellingProgress(progress, snapshot, existingState = {}) {
  if (!isPlainObject(progress)) return null;
  const counts = Object.fromEntries(PUBLIC_DIRECT_SPELLING_MONSTER_IDS.map((monsterId) => [monsterId, 0]));
  const words = Array.isArray(snapshot?.words) ? snapshot.words : [];
  let knownWordCount = 0;

  for (const word of words) {
    if (!word?.slug || !isPlainObject(progress[word.slug])) continue;
    knownWordCount += 1;
    if (!secureSpellingProgress(progress[word.slug])) continue;
    const monsterId = monsterIdForSpellingWord(word);
    if (monsterId in counts) counts[monsterId] += 1;
  }

  const nextState = {};
  for (const monsterId of PUBLIC_DIRECT_SPELLING_MONSTER_IDS) {
    const existing = isPlainObject(existingState?.[monsterId]) ? existingState[monsterId] : {};
    nextState[monsterId] = {
      masteredCount: counts[monsterId],
      caught: counts[monsterId] > 0,
      ...(PUBLIC_MONSTER_BRANCHES.has(existing.branch) ? { branch: existing.branch } : {}),
    };
  }

  const phaetonCount = counts.inklet + counts.glimmerbug;
  const existingPhaeton = isPlainObject(existingState?.phaeton) ? existingState.phaeton : {};
  nextState.phaeton = {
    masteredCount: phaetonCount,
    caught: phaetonCount >= 3,
    ...(PUBLIC_MONSTER_BRANCHES.has(existingPhaeton.branch) ? { branch: existingPhaeton.branch } : {}),
  };

  return {
    state: publicMonsterCodexState(nextState),
    knownWordCount,
  };
}

function publicMonsterCodexHasMastery(state) {
  if (!isPlainObject(state)) return false;
  return Object.values(state).some((entry) => Number(entry?.masteredCount) > 0 || entry?.caught === true);
}

async function mergePublicSpellingCodexState(db, accountId, subjectRows, gameState, { runtimeSnapshot = null } = {}) {
  const spellingRows = subjectRows.filter((row) => row.subject_id === 'spelling');
  if (!spellingRows.length) return gameState;

  const snapshot = runtimeSnapshot || runtimeSnapshotForBundle(await readSubjectContentBundle(db, accountId, 'spelling'));

  for (const row of spellingRows) {
    const progress = spellingProgressFromSubjectRow(row);
    if (!progress) continue;
    const key = gameStateKey(row.learner_id, PUBLIC_MONSTER_CODEX_SYSTEM_ID);
    const existingState = publicMonsterCodexState(gameState[key] || {});
    const derived = publicMonsterCodexStateFromSpellingProgress(progress, snapshot, existingState);
    if (!derived) continue;
    if (derived.knownWordCount > 0 || !publicMonsterCodexHasMastery(existingState)) {
      gameState[key] = derived.state;
    }
  }

  return gameState;
}

function practiceSessionRowToRecord(row) {
  return normalisePracticeSessionRecord({
    id: row.id,
    learnerId: row.learner_id,
    subjectId: row.subject_id,
    sessionKind: row.session_kind,
    status: row.status,
    sessionState: safeJsonParse(row.session_state_json, null),
    summary: safeJsonParse(row.summary_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function publicPracticeSessionRowToRecord(row) {
  const record = practiceSessionRowToRecord(row);
  if (record.subjectId === 'spelling') {
    return normalisePracticeSessionRecord({
      ...record,
      sessionState: null,
      summary: publicPracticeSessionSummary(record.summary, record.sessionKind),
    });
  }
  if (record.subjectId === 'punctuation') {
    return normalisePracticeSessionRecord({
      ...record,
      sessionState: null,
      summary: publicPunctuationPracticeSessionSummary(record.summary),
    });
  }
  return record;
}

function eventRowToRecord(row) {
  const parsed = safeJsonParse(row.event_json, {});
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const event = {
    ...parsed,
    id: typeof parsed.id === 'string' && parsed.id ? parsed.id : row.id,
    learnerId: parsed.learnerId || row.learner_id || null,
    subjectId: parsed.subjectId || row.subject_id || null,
    systemId: parsed.systemId || row.system_id || null,
    createdAt: Number.isFinite(Number(parsed.createdAt)) ? Number(parsed.createdAt) : asTs(row.created_at, 0),
  };
  if (typeof event.type !== 'string' || !event.type) {
    event.type = row.event_type || event.kind || 'event';
  }
  return event;
}

function publicPracticeLabel(sessionKind) {
  if (sessionKind === 'test') return 'SATs 20 test';
  return 'Smart Review';
}

function publicSummaryCards(cards) {
  if (!Array.isArray(cards)) return [];
  return cards
    .map((card) => {
      const key = String(card?.label || '').trim().toLowerCase();
      const label = PUBLIC_PRACTICE_CARD_LABELS.get(key);
      const value = String(card?.value || '').trim();
      if (!label || !/^\d+(?:\/\d+)?%?$/.test(value)) return null;
      return { label, value };
    })
    .filter(Boolean);
}

function publicMistakeSummary(mistake) {
  const year = PUBLIC_SPELLING_YEAR_LABELS.has(mistake?.year) ? mistake.year : null;
  return {
    year,
    yearLabel: year ? PUBLIC_SPELLING_YEAR_LABELS.get(year) : null,
  };
}

function publicPracticeSessionSummary(summary, sessionKind) {
  const raw = isPlainObject(summary) ? summary : {};
  return {
    label: publicPracticeLabel(sessionKind),
    cards: publicSummaryCards(raw.cards),
    mistakes: Array.isArray(raw.mistakes)
      ? raw.mistakes.map(publicMistakeSummary)
      : [],
  };
}

function publicPunctuationPracticeSessionSummary(summary) {
  const safe = normalisePunctuationSummary(summary);
  if (!safe) return null;
  return {
    ...safe,
    gps: safe.gps
      ? {
        delayedFeedback: safe.gps.delayedFeedback,
        recommendedMode: safe.gps.recommendedMode,
        recommendedLabel: safe.gps.recommendedLabel,
        reviewItems: [],
      }
      : null,
  };
}

function safePublicEventText(value) {
  return typeof value === 'string' && value ? value : null;
}

function safePublicEventNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safePublicEventType(value) {
  return PUBLIC_EVENT_TYPES.has(value) ? value : null;
}

function safePublicEventEnum(key, value) {
  const text = safePublicEventText(value);
  const allowed = PUBLIC_EVENT_TEXT_ENUMS[key];
  return text && allowed?.has(text) ? text : null;
}

function publicEventRowToRecord(row) {
  const event = eventRowToRecord(row);
  if (!event) return null;
  const type = safePublicEventType(safePublicEventText(event.type) || safePublicEventText(row.event_type));
  if (!type) return null;
  const output = {
    type,
    learnerId: safePublicEventText(event.learnerId),
    subjectId: event.subjectId === 'spelling' ? 'spelling' : null,
    createdAt: safePublicEventNumber(event.createdAt) ?? asTs(row.created_at, 0),
  };

  [
    'mode',
    'sessionType',
    'kind',
    'monsterId',
    'spellingPool',
    'yearBand',
    'fromPhase',
  ].forEach((key) => {
    const value = safePublicEventEnum(key, event[key]);
    if (value) output[key] = value;
  });

  [
    'totalWords',
    'mistakeCount',
    'milestone',
    'secureCount',
    'stage',
    'attemptCount',
    'streakDays',
  ].forEach((key) => {
    const value = safePublicEventNumber(event[key]);
    if (value != null) output[key] = value;
  });

  return output;
}

function contentRowToBundle(row) {
  return backfillSpellingWordExplanations(
    safeJsonParse(row.content_json, SEEDED_SPELLING_CONTENT_BUNDLE),
    SEEDED_SPELLING_CONTENT_BUNDLE,
  );
}

async function readSubjectContentBundle(db, accountId, subjectId = 'spelling') {
  const row = await first(db, 'SELECT * FROM account_subject_content WHERE account_id = ? AND subject_id = ?', [accountId, subjectId]);
  return row ? contentRowToBundle(row) : cloneSerialisable(SEEDED_SPELLING_CONTENT_BUNDLE);
}

async function readSpellingRuntimeContentBundle(db, accountId, subjectId = 'spelling') {
  const row = await first(db, `
    SELECT account_id, subject_id, content_json, updated_at
    FROM account_subject_content
    WHERE account_id = ? AND subject_id = ?
  `, [accountId, subjectId]);
  const key = spellingRuntimeContentRowKey(row, subjectId);
  return readCachedSpellingRuntimeContent(key)
    || rememberSpellingRuntimeContent(key, buildSpellingRuntimeContent(row, subjectId));
}

function writableRole(role) {
  return WRITABLE_MEMBERSHIP_ROLES.has(role);
}

function normaliseMutationInput(rawValue, scopeType) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const requestId = typeof raw.requestId === 'string' && raw.requestId ? raw.requestId : null;
  const correlationId = typeof raw.correlationId === 'string' && raw.correlationId
    ? raw.correlationId
    : requestId;
  const expectedRevisionKey = scopeType === 'account'
    ? 'expectedAccountRevision'
    : 'expectedLearnerRevision';
  const expectedRevision = Number.isFinite(Number(raw[expectedRevisionKey]))
    ? Number(raw[expectedRevisionKey])
    : null;

  if (!requestId) {
    throw new BadRequestError('Mutation requestId is required for write routes.', {
      code: 'mutation_request_id_required',
      scopeType,
    });
  }

  if (expectedRevision == null) {
    throw new BadRequestError(`Mutation ${expectedRevisionKey} is required for write routes.`, {
      code: 'mutation_revision_required',
      scopeType,
    });
  }

  return {
    requestId,
    correlationId,
    expectedRevision,
    expectedRevisionKey,
  };
}

function buildMutationMeta({
  kind,
  scopeType,
  scopeId,
  requestId,
  correlationId,
  expectedRevision,
  appliedRevision,
  replayed = false,
} = {}) {
  return {
    policyVersion: MUTATION_POLICY_VERSION,
    kind,
    scopeType,
    scopeId,
    requestId,
    correlationId,
    expectedRevision,
    appliedRevision,
    replayed,
  };
}

function staleWriteError({ kind, scopeType, scopeId, requestId, correlationId, expectedRevision, currentRevision }) {
  return new ConflictError('Mutation rejected because this state changed in another tab or device. Retry sync to reload the latest state, then repeat the action.', {
    code: 'stale_write',
    retryable: false,
    kind,
    scopeType,
    scopeId,
    requestId,
    correlationId,
    expectedRevision,
    currentRevision,
  });
}

function idempotencyReuseError({ kind, scopeType, scopeId, requestId, correlationId }) {
  return new ConflictError('The same mutation request id was reused for a different payload.', {
    code: 'idempotency_reuse',
    retryable: false,
    kind,
    scopeType,
    scopeId,
    requestId,
    correlationId,
  });
}

function logMutation(level, event, details = {}) {
  const payload = {
    event,
    ...cloneSerialisable(details),
    at: new Date().toISOString(),
  };
  const fn = globalThis.console?.[level] || globalThis.console?.log;
  if (!fn) return;
  try {
    fn('[ks2-worker]', JSON.stringify(payload));
  } catch {
    fn('[ks2-worker]', payload);
  }
}

async function loadMutationReceipt(db, accountId, requestId) {
  return first(db, `
    SELECT account_id, request_id, scope_type, scope_id, mutation_kind, request_hash, response_json, status_code, correlation_id, applied_at
    FROM mutation_receipts
    WHERE account_id = ? AND request_id = ?
  `, [accountId, requestId]);
}

async function storeMutationReceipt(db, {
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
}) {
  await run(db, `
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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
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
  ]);
}

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

async function ensureAccount(db, session, nowTs) {
  const platformRole = normalisePlatformRole(session?.platformRole);
  await run(db, `
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, NULL, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      email = COALESCE(excluded.email, adult_accounts.email),
      display_name = COALESCE(excluded.display_name, adult_accounts.display_name),
      platform_role = COALESCE(excluded.platform_role, adult_accounts.platform_role),
      updated_at = excluded.updated_at
  `, [session.accountId, session.email, session.displayName, platformRole, nowTs, nowTs]);

  return first(db, 'SELECT * FROM adult_accounts WHERE id = ?', [session.accountId]);
}

async function listMembershipRows(db, accountId, { writableOnly = false } = {}) {
  const allowedRoles = writableOnly ? ['owner', 'member'] : ['owner', 'member', 'viewer'];
  const rolePlaceholders = sqlPlaceholders(allowedRoles.length);
  return all(db, `
    SELECT
      m.account_id,
      m.learner_id,
      m.role,
      m.sort_index,
      m.created_at AS membership_created_at,
      m.updated_at AS membership_updated_at,
      l.id,
      l.name,
      l.year_group,
      l.avatar_color,
      l.goal,
      l.daily_minutes,
      l.created_at,
      l.updated_at,
      l.state_revision
    FROM account_learner_memberships m
    JOIN learner_profiles l ON l.id = m.learner_id
    WHERE m.account_id = ?
      AND m.role IN (${rolePlaceholders})
    ORDER BY m.sort_index ASC, l.created_at ASC, l.id ASC
  `, [accountId, ...allowedRoles]);
}

async function getMembership(db, accountId, learnerId) {
  return first(db, `
    SELECT account_id, learner_id, role, sort_index, created_at, updated_at
    FROM account_learner_memberships
    WHERE account_id = ? AND learner_id = ?
  `, [accountId, learnerId]);
}

async function requireLearnerWriteAccess(db, accountId, learnerId) {
  const membership = await getMembership(db, accountId, learnerId);
  if (!membership || !writableRole(membership.role)) {
    throw new ForbiddenError('Learner access denied.', {
      learnerId,
      required: 'owner-or-member',
    });
  }
  return membership;
}

async function requireLearnerReadAccess(db, accountId, learnerId) {
  const membership = await getMembership(db, accountId, learnerId);
  if (!membership || !MEMBERSHIP_ROLES.has(membership.role)) {
    throw new ForbiddenError('Learner access denied.', {
      learnerId,
      required: 'owner-member-or-viewer',
    });
  }
  return membership;
}

function membershipRowToModel(row) {
  return {
    learnerId: row?.learner_id || row?.id || '',
    role: row?.role || 'viewer',
    sortIndex: Number(row?.sort_index) || 0,
    stateRevision: Number(row?.state_revision) || 0,
    learner: learnerRowToRecord(row),
  };
}

function accountPlatformRole(account) {
  return normalisePlatformRole(account?.platform_role);
}

function accountType(account) {
  return account?.account_type === 'demo' ? 'demo' : 'real';
}

function requireParentHubAccess(account, membership) {
  if (!canViewParentHub({ platformRole: accountPlatformRole(account), membershipRole: membership?.role })) {
    throw new ForbiddenError('Parent Hub access denied.', {
      code: 'parent_hub_forbidden',
      required: 'platform-role-parent-or-admin plus readable learner membership',
      learnerId: membership?.learner_id || null,
    });
  }
}

function requireAdminHubAccess(account) {
  if (accountType(account) === 'demo' || !canViewAdminHub({ platformRole: accountPlatformRole(account) })) {
    throw new ForbiddenError('Admin / operations access denied.', {
      code: 'admin_hub_forbidden',
      required: 'platform-role-admin-or-ops',
    });
  }
}

function requireAccountRoleManager(account) {
  if (accountType(account) === 'demo' || !canManageAccountRoles({ platformRole: accountPlatformRole(account) })) {
    throw new ForbiddenError('Account role management requires an admin account.', {
      code: 'account_roles_forbidden',
      required: 'platform-role-admin',
    });
  }
}

function requireMonsterVisualConfigManager(account) {
  if (accountType(account) === 'demo' || accountPlatformRole(account) !== 'admin') {
    throw new ForbiddenError('Monster visual config changes require an admin account.', {
      code: 'monster_visual_config_forbidden',
      required: 'platform-role-admin',
    });
  }
}

function requireSubjectContentExportAccess(account) {
  if (!canViewAdminHub({ platformRole: accountPlatformRole(account) })) {
    throw new ForbiddenError('Spelling content export requires an admin or operations account.', {
      code: 'subject_content_export_forbidden',
      required: 'platform-role-admin-or-ops',
    });
  }
}

function requireSubjectContentWriteAccess(account) {
  if (accountPlatformRole(account) !== 'admin') {
    throw new ForbiddenError('Spelling content import requires an admin account.', {
      code: 'subject_content_write_forbidden',
      required: 'platform-role-admin',
    });
  }
}

function normaliseRequestedPlatformRole(value) {
  const role = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!PLATFORM_ROLES.includes(role)) {
    throw new BadRequestError('Unknown platform role.', {
      code: 'unknown_platform_role',
      allowed: PLATFORM_ROLES,
    });
  }
  return role;
}

function runtimeSnapshotForBundle(bundle) {
  const backfilled = backfillSpellingWordExplanations(bundle, SEEDED_SPELLING_CONTENT_BUNDLE);
  return resolveRuntimeSnapshot(backfilled, { referenceBundle: SEEDED_SPELLING_CONTENT_BUNDLE });
}

function spellingRuntimeContentSeedKey(subjectId) {
  const publication = SEEDED_SPELLING_CONTENT_BUNDLE.publication || {};
  return [
    'seed',
    subjectId,
    publication.currentReleaseId || '',
    publication.publishedVersion || 0,
    publication.updatedAt || 0,
  ].join(':');
}

function spellingRuntimeContentRowKey(row, subjectId) {
  if (!row) return spellingRuntimeContentSeedKey(subjectId);
  return row.content_json || `row:${subjectId}:${row.updated_at || 0}:empty`;
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

function buildSpellingRuntimeContent(row, subjectId) {
  const content = row
    ? contentRowToBundle(row)
    : backfillSpellingWordExplanations(SEEDED_SPELLING_CONTENT_BUNDLE, SEEDED_SPELLING_CONTENT_BUNDLE);
  const snapshot = runtimeSnapshotForBundle(content);
  return {
    subjectId,
    content,
    snapshot,
    summary: runtimeContentSummary(content, snapshot),
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

async function loadLearnerReadBundle(db, learnerId) {
  const subjectRows = await all(db, `
    SELECT learner_id, subject_id, ui_json, data_json, updated_at
    FROM child_subject_state
    WHERE learner_id = ?
  `, [learnerId]);
  const sessionRows = await all(db, `
    SELECT id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at
    FROM practice_sessions
    WHERE learner_id = ?
    ORDER BY updated_at DESC, id DESC
  `, [learnerId]);
  const gameRows = await all(db, `
    SELECT learner_id, system_id, state_json, updated_at
    FROM child_game_state
    WHERE learner_id = ?
  `, [learnerId]);
  const eventRows = await all(db, `
    SELECT id, learner_id, subject_id, system_id, event_type, event_json, created_at
    FROM event_log
    WHERE learner_id = ?
    ORDER BY created_at ASC, id ASC
  `, [learnerId]);

  const subjectStates = {};
  subjectRows.forEach((row) => {
    subjectStates[row.subject_id] = subjectStateRowToRecord(row);
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
  if (record?.sessionKind === 'test') return 'SATs 20 test';
  return 'Smart Review';
}

function recentSessionHeadline(record) {
  const summary = record?.summary || {};
  const cards = Array.isArray(summary.cards) ? summary.cards : [];
  const correctCard = cards.find((card) => String(card?.label || '').toLowerCase().includes('correct'));
  if (correctCard?.value != null) return String(correctCard.value);
  const answered = Number(summary.answered);
  const correct = Number(summary.correct);
  if (Number.isFinite(answered) && answered > 0 && Number.isFinite(correct)) {
    return `${correct}/${answered}`;
  }
  return '';
}

function parentRecentSessionFromRecord(record) {
  return {
    id: record.id,
    subjectId: record.subjectId,
    status: record.status,
    sessionKind: record.sessionKind,
    label: recentSessionLabel(record),
    updatedAt: Number(record.updatedAt) || Number(record.createdAt) || 0,
    mistakeCount: Array.isArray(record?.summary?.mistakes)
      ? record.summary.mistakes.length
      : Math.max(0, (Number(record?.summary?.answered) || 0) - (Number(record?.summary?.correct) || 0)),
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
  } catch (error) {
    if (isMissingTableError(error, 'learner_read_models')) return emptyLearnerReadModel(key);
    throw error;
  }
  return row ? normaliseLearnerReadModelRow(row, key) : emptyLearnerReadModel(key);
}

async function capacityReadModelTablesAvailable(db) {
  try {
    const rows = await all(db, `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name IN (${sqlPlaceholders(CAPACITY_READ_MODEL_TABLES.length)})
    `, CAPACITY_READ_MODEL_TABLES);
    const tableNames = new Set(rows.map((row) => row.name).filter(Boolean));
    return CAPACITY_READ_MODEL_TABLES.every((tableName) => tableNames.has(tableName));
  } catch (error) {
    if (isMissingCapacityReadModelTableError(error)) return false;
    throw error;
  }
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

function commandProjectionReadModelFromRuntime(runtime, events, nowTs) {
  const gameState = runtime?.gameState && typeof runtime.gameState === 'object' && !Array.isArray(runtime.gameState)
    ? runtime.gameState
    : {};
  const rewardState = cloneSerialisable(gameState[PUBLIC_MONSTER_CODEX_SYSTEM_ID]) || {};
  const eventList = Array.isArray(events) ? events : [];
  return {
    version: COMMAND_PROJECTION_READ_MODEL_VERSION,
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
const LEARNER_SCOPE_ID_MASK_LAST_N = 8;
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
    'SELECT id, email, display_name, platform_role, repo_revision, account_type FROM adult_accounts WHERE id = ?',
    [actorAccountId],
  );
  requireAdminHubAccess(actor);
  return actor;
}

function emptyDashboardKpis(generatedAt) {
  return {
    generatedAt,
    accounts: { total: 0 },
    learners: { total: 0 },
    demos: { active: 0 },
    practiceSessions: { last7d: 0, last30d: 0 },
    eventLog: { last7d: 0 },
    mutationReceipts: { last7d: 0 },
    errorEvents: {
      byStatus: {
        open: 0,
        investigating: 0,
        resolved: 0,
        ignored: 0,
      },
    },
    accountOpsUpdates: { total: 0 },
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

async function readDashboardKpis(db, { now, actorAccountId } = {}) {
  await assertAdminHubActor(db, actorAccountId);
  const nowTs = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const cutoff7d = nowTs - KPI_WINDOW_7D_MS;
  const cutoff30d = nowTs - KPI_WINDOW_30D_MS;

  const [
    accountsTotal,
    learnersTotal,
    demosActive,
    practice7d,
    practice30d,
    eventLog7d,
    receipts7d,
  ] = await Promise.all([
    scalarCountSafe(db, `
      SELECT COUNT(*) AS value
      FROM adult_accounts
      WHERE COALESCE(account_type, 'real') <> 'demo'
    `, []),
    scalarCountSafe(db, `
      SELECT COUNT(*) AS value
      FROM learner_profiles
    `, []),
    scalarCountSafe(db, `
      SELECT COUNT(*) AS value
      FROM adult_accounts
      WHERE account_type = 'demo'
        AND demo_expires_at > ?
    `, [nowTs]),
    scalarCountSafe(db, `
      SELECT COUNT(*) AS value
      FROM practice_sessions
      WHERE updated_at > ?
    `, [cutoff7d]),
    scalarCountSafe(db, `
      SELECT COUNT(*) AS value
      FROM practice_sessions
      WHERE updated_at > ?
    `, [cutoff30d]),
    scalarCountSafe(db, `
      SELECT COUNT(*) AS value
      FROM event_log
      WHERE created_at > ?
    `, [cutoff7d]),
    scalarCountSafe(db, `
      SELECT COUNT(*) AS value
      FROM mutation_receipts
      WHERE applied_at > ?
    `, [cutoff7d]),
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

  return {
    generatedAt: nowTs,
    accounts: { total: accountsTotal },
    learners: { total: learnersTotal },
    demos: { active: demosActive },
    practiceSessions: { last7d: practice7d, last30d: practice30d },
    eventLog: { last7d: eventLog7d },
    mutationReceipts: { last7d: receipts7d },
    errorEvents: { byStatus: errorByStatus },
    accountOpsUpdates: { total: accountOpsUpdatesTotal },
  };
}

async function listRecentMutationReceipts(db, { now, actorAccountId, limit = OPS_ACTIVITY_STREAM_DEFAULT_LIMIT } = {}) {
  await assertAdminHubActor(db, actorAccountId);
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

async function readAccountOpsMetadataDirectory(db, { now, actorAccountId, actorPlatformRole = null } = {}) {
  const actor = await assertAdminHubActor(db, actorAccountId);
  const resolvedPlatformRole = normalisePlatformRole(actorPlatformRole || actor?.platform_role);
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
        om.updated_by_account_id AS updated_by_account_id
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
        NULL AS updated_by_account_id
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

async function readOpsErrorEventSummary(db, { now, actorAccountId, status = null, limit = OPS_ERROR_EVENTS_DEFAULT_LIMIT } = {}) {
  await assertAdminHubActor(db, actorAccountId);
  const nowTs = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const safeLimit = Math.max(1, Math.min(OPS_ERROR_EVENTS_MAX_LIMIT, Number(limit) || OPS_ERROR_EVENTS_DEFAULT_LIMIT));
  const statusFilter = typeof status === 'string' && OPS_ERROR_STATUSES.includes(status) ? status : null;

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

    const entryRows = statusFilter
      ? await all(db, `
        SELECT id, error_kind, message_first_line, first_frame, route_name, user_agent,
               account_id, occurrence_count, first_seen, last_seen, status
        FROM ops_error_events
        WHERE status = ?
        ORDER BY last_seen DESC, id DESC
        LIMIT ?
      `, [statusFilter, safeLimit])
      : await all(db, `
        SELECT id, error_kind, message_first_line, first_frame, route_name, user_agent,
               account_id, occurrence_count, first_seen, last_seen, status
        FROM ops_error_events
        ORDER BY last_seen DESC, id DESC
        LIMIT ?
      `, [safeLimit]);

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
        accountIdMasked: row?.account_id ? maskAccountIdLastN(row.account_id) : null,
        occurrenceCount: Math.max(0, Number(row?.occurrence_count) || 0),
        firstSeen: Number(row?.first_seen) || 0,
        lastSeen: Number(row?.last_seen) || 0,
        status: typeof row?.status === 'string' ? row.status : 'open',
      })),
    };
  } catch (error) {
    if (!isMissingTableError(error, 'ops_error_events')) throw error;
    return emptyOpsErrorEventSummary(nowTs);
  }
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

function bumpAdminKpiMetricStatement(db, key, nowTs, delta = 1) {
  const resolvedDelta = Number.isFinite(Number(delta)) ? Number(delta) : 1;
  const ts = Number.isFinite(Number(nowTs)) ? Number(nowTs) : Date.now();
  const seedCount = Math.max(0, resolvedDelta);
  return bindStatement(db, `
    INSERT INTO admin_kpi_metrics (metric_key, metric_count, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(metric_key) DO UPDATE SET
      metric_count = MAX(0, admin_kpi_metrics.metric_count + ?),
      updated_at = ?
  `, [key, seedCount, ts, resolvedDelta, ts]);
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
  return first(db, `
    SELECT account_id, ops_status, plan_label, tags_json, internal_notes,
           updated_at, updated_by_account_id
    FROM account_ops_metadata
    WHERE account_id = ?
  `, [targetAccountId]);
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
  const { requestId, correlationId } = normaliseMutationEnvelope(mutation, {
    scopeType: 'account',
    scopeId: targetAccountId,
  });
  const ts = Number.isFinite(Number(nowTs)) ? Number(nowTs) : Date.now();
  const requestHash = mutationPayloadHash(ACCOUNT_OPS_METADATA_MUTATION_KIND, {
    targetAccountId,
    patch,
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

  const target = await first(db, 'SELECT id, account_type FROM adult_accounts WHERE id = ?', [targetAccountId]);
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

  const existingRow = await loadAccountOpsMetadataRow(db, targetAccountId);
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

  const appliedRow = {
    accountId: targetAccountId,
    opsStatus: mergedOpsStatus,
    planLabel: mergedPlanLabel,
    tags: mergedTags,
    internalNotes: mergedInternalNotes,
    updatedAt: ts,
    updatedByAccountId: actorAccountId,
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
  };
  const response = {
    accountOpsMetadataEntry: appliedRow,
    opsMetadataMutation: mutationMeta,
  };

  // R21 batch atomicity: UPSERT + receipt + counter bump commit together.
  await batch(db, [
    bindStatement(db, `
      INSERT INTO account_ops_metadata (
        account_id,
        ops_status,
        plan_label,
        tags_json,
        internal_notes,
        updated_at,
        updated_by_account_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        ops_status = excluded.ops_status,
        plan_label = excluded.plan_label,
        tags_json = excluded.tags_json,
        internal_notes = excluded.internal_notes,
        updated_at = excluded.updated_at,
        updated_by_account_id = excluded.updated_by_account_id
    `, [
      targetAccountId,
      mergedOpsStatus,
      mergedPlanLabel,
      mergedTagsJson,
      mergedInternalNotes,
      ts,
      actorAccountId,
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
    }),
    bumpAdminKpiMetricStatement(db, KPI_ACCOUNT_OPS_UPDATES_METRIC_KEY, ts, 1),
  ]);

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
  await batch(db, [
    bindStatement(db, `
      UPDATE ops_error_events
      SET status = ?
      WHERE id = ? AND status = ?
    `, [nextStatus, eventId, oldStatus]),
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

  return {
    errorKind,
    messageFirstLine,
    firstFrame,
    routeName,
    userAgent,
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
    const existing = await first(db, `
      SELECT id, first_seen, occurrence_count, status
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
      await run(db, `
        UPDATE ops_error_events
        SET last_seen = ?,
            occurrence_count = occurrence_count + 1
        WHERE id = ?
      `, [ts, existing.id]);
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
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'open')
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
    ]);
    const insertChanges = Number(insertResult?.meta?.changes) || 0;

    if (insertChanges === 1) {
      // Row is genuinely fresh — bump the status.open counter. Running
      // the prepared statement directly (rather than wrapping in a new
      // batch) keeps the non-atomic window between INSERT and bump as
      // small as possible.
      await bumpAdminKpiMetricStatement(db, `${KPI_ERROR_STATUS_METRIC_PREFIX}open`, ts, 1).run();
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
      await run(db, `
        UPDATE ops_error_events
        SET last_seen = ?,
            occurrence_count = occurrence_count + 1
        WHERE id = ?
      `, [ts, winner.id]);
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
function seededMonsterVisualConfig({ source = 'published', version = 1 } = {}) {
  return {
    ...cloneSerialisable(BUNDLED_MONSTER_VISUAL_CONFIG),
    schemaVersion: MONSTER_VISUAL_SCHEMA_VERSION,
    manifestHash: MONSTER_ASSET_MANIFEST.manifestHash,
    source,
    version,
    effect: bundledEffectConfig(),
  };
}

function normaliseMonsterVisualDraft(rawDraft) {
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
  return {
    ...cloned,
    schemaVersion: Number(rawDraft.schemaVersion) || MONSTER_VISUAL_SCHEMA_VERSION,
    manifestHash: rawDraft.manifestHash || MONSTER_ASSET_MANIFEST.manifestHash,
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

  const initialConfig = seededMonsterVisualConfig({ source: 'published', version: 1 });
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
    MONSTER_ASSET_MANIFEST.manifestHash,
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
    MONSTER_ASSET_MANIFEST.manifestHash,
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

function monsterVisualConfigStateFromRow(row, versions = []) {
  const draft = safeJsonParse(row?.draft_json, seededMonsterVisualConfig({ source: 'draft', version: Number(row?.published_version) || 1 }));
  const published = safeJsonParse(row?.published_json, seededMonsterVisualConfig({ source: 'published', version: Number(row?.published_version) || 1 }));
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
      manifestHash: MONSTER_ASSET_MANIFEST.manifestHash,
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

function bundledMonsterVisualRuntimeConfig() {
  const config = seededMonsterVisualConfig({ source: 'bundled', version: 0 });
  return {
    schemaVersion: MONSTER_VISUAL_SCHEMA_VERSION,
    manifestHash: MONSTER_ASSET_MANIFEST.manifestHash,
    publishedVersion: 0,
    publishedAt: 0,
    config,
  };
}

async function readPublishedMonsterVisualRuntimeConfig(db, nowTs) {
  const row = await ensureMonsterVisualConfigRow(db, nowTs);
  const published = safeJsonParse(
    row?.published_json,
    seededMonsterVisualConfig({ source: 'published', version: Number(row?.published_version) || 1 }),
  );
  return {
    schemaVersion: MONSTER_VISUAL_SCHEMA_VERSION,
    manifestHash: row?.manifest_hash || published.manifestHash || MONSTER_ASSET_MANIFEST.manifestHash,
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

  return withTransaction(db, async () => {
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
  });
}

async function saveMonsterVisualConfigDraft(db, actorAccountId, rawDraft, mutation, nowTs) {
  const draft = normaliseMonsterVisualDraft(rawDraft);
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
          MONSTER_ASSET_MANIFEST.manifestHash,
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
          MONSTER_ASSET_MANIFEST.manifestHash,
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
      const restored = {
        ...safeJsonParse(versionRow.config_json, seededMonsterVisualConfig({ source: 'draft', version: safeVersion })),
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
          MONSTER_ASSET_MANIFEST.manifestHash,
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
    },
  });
}

async function updateManagedAccountRole(db, {
  actorAccountId,
  targetAccountId,
  platformRole,
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
  });

  return withTransaction(db, async () => {
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
    if (currentRole === 'admin' && nextRole !== 'admin') {
      const updateResult = await run(db, `
        UPDATE adult_accounts
        SET platform_role = ?,
            updated_at = ?
        WHERE id = ?
          AND EXISTS (
            SELECT 1
            FROM adult_accounts
            WHERE platform_role = 'admin'
              AND COALESCE(account_type, 'real') <> 'demo'
              AND id <> ?
          )
      `, [nextRole, nowTs, targetAccountId, targetAccountId]);
      const updateChanges = Number(updateResult?.meta?.changes) || 0;
      if (updateChanges !== 1) {
        throw new ConflictError('At least one admin account must remain.', {
          code: 'last_admin_required',
          accountId: targetAccountId,
        });
      }
    } else {
      await run(db, `
        UPDATE adult_accounts
        SET platform_role = ?,
            updated_at = ?
        WHERE id = ?
      `, [nextRole, nowTs, targetAccountId]);
    }

    const directory = await accountDirectoryPayload(db, actorAccountId);
    const updatedAccount = directory.accounts.find((account) => account.id === targetAccountId) || null;
    const response = {
      ...directory,
      updatedAccount,
      roleMutation: {
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
      },
    };

    await storeMutationReceipt(db, {
      accountId: actorAccountId,
      requestId,
      scopeType: 'account',
      scopeId: targetAccountId,
      mutationKind: 'admin.account_role.update',
      requestHash,
      response,
      correlationId,
      appliedAt: nowTs,
    });

    return response;
  });
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

async function listPublicBootstrapActiveSessionIds(db, learnerIds) {
  const ids = [];
  for (const learnerId of learnerIds) {
    const rows = await all(db, `
      SELECT ui_json
      FROM child_subject_state
      WHERE learner_id = ?
      ORDER BY updated_at DESC, subject_id ASC
      LIMIT ?
    `, [learnerId, PUBLIC_BOOTSTRAP_ACTIVE_SESSION_LOOKUP_LIMIT_PER_LEARNER]);
    const sessionIdsForLearner = new Set();
    for (const row of rows) {
      const sessionId = subjectStateActiveSessionId(row);
      if (!sessionId || sessionIdsForLearner.has(sessionId)) continue;
      sessionIdsForLearner.add(sessionId);
      ids.push(sessionId);
      if (sessionIdsForLearner.size >= PUBLIC_BOOTSTRAP_ACTIVE_SESSION_LIMIT_PER_LEARNER) break;
    }
  }
  return ids;
}

async function listPublicBootstrapSessionRows(db, learnerIds) {
  if (!learnerIds.length) return [];
  const rowsById = new Map();
  const placeholders = sqlPlaceholders(learnerIds.length);
  const activeSessionIds = await listPublicBootstrapActiveSessionIds(db, learnerIds);
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

function bootstrapCapacityMeta({
  publicReadModels,
  learnerCount,
  sessionRows,
  eventRows,
}) {
  if (!publicReadModels) return null;
  const sessionActiveLimit = learnerCount * PUBLIC_BOOTSTRAP_ACTIVE_SESSION_LIMIT_PER_LEARNER;
  const sessionRecentLimit = learnerCount * PUBLIC_BOOTSTRAP_RECENT_SESSION_LIMIT_PER_LEARNER;
  const sessionLimit = sessionActiveLimit + sessionRecentLimit;
  const eventRecentLimit = learnerCount * PUBLIC_BOOTSTRAP_RECENT_EVENT_LIMIT_PER_LEARNER;
  return {
    version: PUBLIC_BOOTSTRAP_CAPACITY_VERSION,
    mode: 'public-bounded',
    limits: {
      activeSessionsPerLearner: PUBLIC_BOOTSTRAP_ACTIVE_SESSION_LIMIT_PER_LEARNER,
      recentSessionsPerLearner: PUBLIC_BOOTSTRAP_RECENT_SESSION_LIMIT_PER_LEARNER,
      recentEventsPerLearner: PUBLIC_BOOTSTRAP_RECENT_EVENT_LIMIT_PER_LEARNER,
    },
    learners: {
      returned: learnerCount,
    },
    practiceSessions: {
      returned: sessionRows.length,
      bounded: true,
      atOrAboveRecentLimit: learnerCount > 0 && sessionRows.length >= sessionRecentLimit,
      atOrAboveMaximumLimit: learnerCount > 0 && sessionRows.length >= sessionLimit,
    },
    eventLog: {
      returned: eventRows.length,
      bounded: true,
      atOrAboveRecentLimit: learnerCount > 0 && eventRows.length >= eventRecentLimit,
    },
  };
}

async function bootstrapBundle(db, accountId, { publicReadModels = false } = {}) {
  const account = await first(db, 'SELECT * FROM adult_accounts WHERE id = ?', [accountId]);
  const monsterVisualConfig = await readBootstrapMonsterVisualRuntimeConfig(db, Date.now());
  const membershipRows = await listMembershipRows(db, accountId, { writableOnly: true });
  const learnersById = {};
  const learnerIds = [];
  const learnerRevisions = {};

  for (const row of membershipRows) {
    const learner = learnerRowToRecord(row);
    if (!learner) continue;
    learnersById[learner.id] = learner;
    learnerIds.push(learner.id);
    learnerRevisions[learner.id] = Number(row.state_revision) || 0;
  }

  const selectedId = learnerIds.includes(account?.selected_learner_id)
    ? account.selected_learner_id
    : (learnerIds[0] || null);

  if (selectedId !== (account?.selected_learner_id || null)) {
    await run(db, 'UPDATE adult_accounts SET selected_learner_id = ?, updated_at = ? WHERE id = ?', [selectedId, Date.now(), accountId]);
  }

  if (!learnerIds.length) {
    return {
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
        accountRevision: Number(account?.repo_revision) || 0,
        learnerRevisions: {},
      },
      monsterVisualConfig,
      ...(publicReadModels ? {
        bootstrapCapacity: bootstrapCapacityMeta({
          publicReadModels,
          learnerCount: 0,
          sessionRows: [],
          eventRows: [],
        }),
      } : {}),
    };
  }

  const placeholders = sqlPlaceholders(learnerIds.length);
  const subjectRows = await all(db, `
    SELECT learner_id, subject_id, ui_json, data_json, updated_at
    FROM child_subject_state
    WHERE learner_id IN (${placeholders})
  `, learnerIds);
  const sessionRows = publicReadModels
    ? await listPublicBootstrapSessionRows(db, learnerIds)
    : await all(db, `
      SELECT id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at
      FROM practice_sessions
      WHERE learner_id IN (${placeholders})
      ORDER BY updated_at DESC, id DESC
    `, learnerIds);
  const gameRows = await all(db, `
    SELECT learner_id, system_id, state_json, updated_at
    FROM child_game_state
    WHERE learner_id IN (${placeholders})
  `, learnerIds);
  const eventRows = publicReadModels
    ? await listPublicBootstrapEventRows(db, learnerIds)
    : await all(db, `
      SELECT id, learner_id, subject_id, system_id, event_type, event_json, created_at
      FROM event_log
      WHERE learner_id IN (${placeholders})
      ORDER BY created_at ASC, id ASC
    `, learnerIds);
  const publicSpellingContent = publicReadModels && subjectRows.some((row) => row.subject_id === 'spelling')
    ? await readSpellingRuntimeContentBundle(db, accountId, 'spelling')
    : null;
  const publicReadModelNow = Date.now();
  const subjectStates = {};
  for (const row of subjectRows) {
    subjectStates[subjectStateKey(row.learner_id, row.subject_id)] = publicReadModels
      ? await publicSubjectStateRowToRecord(row, {
        spellingContentSnapshot: publicSpellingContent?.snapshot || null,
        now: publicReadModelNow,
      })
      : subjectStateRowToRecord(row);
  }

  const gameState = {};
  gameRows.forEach((row) => {
    const record = publicReadModels
      ? publicGameStateRowToRecord(row)
      : gameStateRowToRecord(row);
    if (record) gameState[gameStateKey(row.learner_id, row.system_id)] = record;
  });
  if (publicReadModels) {
    await mergePublicSpellingCodexState(db, accountId, subjectRows, gameState, {
      runtimeSnapshot: publicSpellingContent?.snapshot || null,
    });
  }

  return {
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
      accountRevision: Number(account?.repo_revision) || 0,
      learnerRevisions,
    },
    monsterVisualConfig,
    ...(publicReadModels ? {
      bootstrapCapacity: bootstrapCapacityMeta({
        publicReadModels,
        learnerCount: learnerIds.length,
        sessionRows,
        eventRows,
      }),
    } : {}),
  };
}

async function readSubjectRuntimeBundle(db, accountId, learnerId, subjectId = 'spelling') {
  await requireLearnerWriteAccess(db, accountId, learnerId);
  const row = await first(db, `
    SELECT learner_id, subject_id, ui_json, data_json, updated_at
    FROM child_subject_state
    WHERE learner_id = ? AND subject_id = ?
  `, [learnerId, subjectId]);
  const latestSession = await first(db, `
    SELECT id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at
    FROM practice_sessions
    WHERE learner_id = ? AND subject_id = ?
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
  `, [learnerId, subjectId]);
  return {
    subjectRecord: row ? subjectStateRowToRecord(row) : normaliseSubjectStateRecord({}),
    latestSession: latestSession ? practiceSessionRowToRecord(latestSession) : null,
  };
}

async function readSpellingWordBankBundle(db, accountId, learnerId, filters, nowTs) {
  if (!(typeof learnerId === 'string' && learnerId)) {
    throw new BadRequestError('Learner id is required for the spelling word bank.', {
      code: 'learner_id_required',
    });
  }
  const runtimeRecord = await readSubjectRuntimeBundle(db, accountId, learnerId, 'spelling');
  const { snapshot } = await readSpellingRuntimeContentBundle(db, accountId, 'spelling');
  return buildSpellingWordBankReadModel({
    learnerId,
    contentSnapshot: snapshot,
    data: runtimeRecord.subjectRecord?.data || {},
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

function uniqueStringList(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .filter((entry) => typeof entry === 'string' && entry))];
}

async function readLearnerEventLogEvents(db, accountId, learnerId, { ids = [], eventTypes = [] } = {}) {
  await requireLearnerWriteAccess(db, accountId, learnerId);
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

function buildSubjectRuntimePersistencePlan(db, accountId, learnerId, subjectId, runtime, nowTs, {
  guard = null,
  includeCapacityReadModels = true,
} = {}) {
  const nextState = normaliseSubjectStateRecord({
    ui: runtime?.state || null,
    data: runtime?.data || {},
    updatedAt: nowTs,
  });
  const statements = [];

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

  const session = runtime?.practiceSession
    ? normalisePracticeSessionRecord(runtime.practiceSession)
    : null;
  if (session?.id && session.learnerId === learnerId && session.subjectId === subjectId) {
    if (session.status === 'active') {
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
    const activityRow = activityFeedRowFromEventRecord(event, {
      id,
      learnerId: event.learnerId,
      subjectId: event.subjectId || null,
      systemId: event.systemId || null,
      eventType,
      createdAt,
      now: nowTs,
    });
    if (includeCapacityReadModels) {
      const activityStatement = bindLearnerActivityFeedUpsertStatement(db, activityRow, { guard });
      if (activityStatement) statements.push(activityStatement);
    }
  }
  if (includeCapacityReadModels && Object.prototype.hasOwnProperty.call(gameState, PUBLIC_MONSTER_CODEX_SYSTEM_ID)) {
    const commandProjectionReadModel = commandProjectionReadModelFromRuntime(runtime, persistedEvents, nowTs);
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
  const plan = buildSubjectRuntimePersistencePlan(db, accountId, learnerId, subjectId, runtime, nowTs, {
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
  return bootstrapBundle(db, accountId);
}

async function withAccountMutation(db, {
  accountId,
  kind,
  payload,
  mutation,
  nowTs,
  apply,
  receiptResponse = (response) => response,
  replayResponse = null,
}) {
  const nextMutation = normaliseMutationInput(mutation, 'account');
  const requestHash = mutationPayloadHash(kind, payload);

  return withTransaction(db, async () => {
    const existingReceipt = await loadMutationReceipt(db, accountId, nextMutation.requestId);
    if (existingReceipt) {
      if (existingReceipt.request_hash !== requestHash) {
        throw idempotencyReuseError({
          kind,
          scopeType: 'account',
          scopeId: accountId,
          requestId: nextMutation.requestId,
          correlationId: nextMutation.correlationId,
        });
      }
      const storedReplay = safeJsonParse(existingReceipt.response_json, {});
      const replayed = typeof replayResponse === 'function'
        ? await replayResponse({ storedReplay, existingReceipt, mutation: nextMutation })
        : storedReplay;
      replayed.mutation = buildMutationMeta({
        ...replayed.mutation,
        kind,
        scopeType: 'account',
        scopeId: accountId,
        requestId: nextMutation.requestId,
        correlationId: nextMutation.correlationId,
        replayed: true,
      });
      logMutation('info', 'mutation.replayed', {
        kind,
        scopeType: 'account',
        scopeId: accountId,
        requestId: nextMutation.requestId,
        correlationId: nextMutation.correlationId,
      });
      return replayed;
    }

    const account = await first(db, 'SELECT id, repo_revision FROM adult_accounts WHERE id = ?', [accountId]);
    if (!account) throw new NotFoundError('Account scope was not found.', { accountId });

    const casMeta = await run(db, `
      UPDATE adult_accounts
      SET repo_revision = repo_revision + 1,
          updated_at = ?
      WHERE id = ?
        AND repo_revision = ?
    `, [nowTs, accountId, nextMutation.expectedRevision]);
    const casChanges = Number(casMeta?.meta?.changes) || 0;
    if (casChanges !== 1) {
      const currentRevision = Number(await scalar(db, 'SELECT repo_revision FROM adult_accounts WHERE id = ?', [accountId], 'repo_revision')) || 0;
      throw staleWriteError({
        kind,
        scopeType: 'account',
        scopeId: accountId,
        requestId: nextMutation.requestId,
        correlationId: nextMutation.correlationId,
        expectedRevision: nextMutation.expectedRevision,
        currentRevision,
      });
    }

    const appliedRevision = nextMutation.expectedRevision + 1;
    const applied = await apply();
    const response = {
      ...applied,
      mutation: buildMutationMeta({
        kind,
        scopeType: 'account',
        scopeId: accountId,
        requestId: nextMutation.requestId,
        correlationId: nextMutation.correlationId,
        expectedRevision: nextMutation.expectedRevision,
        appliedRevision,
      }),
    };
    await storeMutationReceipt(db, {
      accountId,
      requestId: nextMutation.requestId,
      scopeType: 'account',
      scopeId: accountId,
      mutationKind: kind,
      requestHash,
      response: receiptResponse(response),
      correlationId: nextMutation.correlationId,
      appliedAt: nowTs,
    });
    logMutation('info', 'mutation.applied', {
      kind,
      scopeType: 'account',
      scopeId: accountId,
      requestId: nextMutation.requestId,
      correlationId: nextMutation.correlationId,
      expectedRevision: nextMutation.expectedRevision,
      appliedRevision,
    });
    return response;
  });
}

async function withLearnerMutation(db, {
  accountId,
  learnerId,
  kind,
  payload,
  mutation,
  nowTs,
  apply,
}) {
  if (!(typeof learnerId === 'string' && learnerId)) {
    throw new BadRequestError('Learner id is required for this mutation.', { code: 'learner_id_required', kind });
  }

  const nextMutation = normaliseMutationInput(mutation, 'learner');
  const requestHash = mutationPayloadHash(kind, payload);

  return withTransaction(db, async () => {
    await requireLearnerWriteAccess(db, accountId, learnerId);
    const existingReceipt = await loadMutationReceipt(db, accountId, nextMutation.requestId);
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

    const learner = await first(db, 'SELECT id FROM learner_profiles WHERE id = ?', [learnerId]);
    if (!learner) throw new NotFoundError('Learner was not found.', { learnerId });

    const casMeta = await run(db, `
      UPDATE learner_profiles
      SET state_revision = state_revision + 1,
          updated_at = ?
      WHERE id = ?
        AND state_revision = ?
    `, [nowTs, learnerId, nextMutation.expectedRevision]);
    const casChanges = Number(casMeta?.meta?.changes) || 0;
    if (casChanges !== 1) {
      const currentRevision = Number(await scalar(db, 'SELECT state_revision FROM learner_profiles WHERE id = ?', [learnerId], 'state_revision')) || 0;
      throw staleWriteError({
        kind,
        scopeType: 'learner',
        scopeId: learnerId,
        requestId: nextMutation.requestId,
        correlationId: nextMutation.correlationId,
        expectedRevision: nextMutation.expectedRevision,
        currentRevision,
      });
    }

    const appliedRevision = nextMutation.expectedRevision + 1;
    const applied = await apply();
    const response = {
      ...applied,
      mutation: buildMutationMeta({
        kind,
        scopeType: 'learner',
        scopeId: learnerId,
        requestId: nextMutation.requestId,
        correlationId: nextMutation.correlationId,
        expectedRevision: nextMutation.expectedRevision,
        appliedRevision,
      }),
    };
    await storeMutationReceipt(db, {
      accountId,
      requestId: nextMutation.requestId,
      scopeType: 'learner',
      scopeId: learnerId,
      mutationKind: kind,
      requestHash,
      response,
      correlationId: nextMutation.correlationId,
      appliedAt: nowTs,
    });
    logMutation('info', 'mutation.applied', {
      kind,
      scopeType: 'learner',
      scopeId: learnerId,
      requestId: nextMutation.requestId,
      correlationId: nextMutation.correlationId,
      expectedRevision: nextMutation.expectedRevision,
      appliedRevision,
    });
    return response;
  });
}

async function runSubjectCommandMutation(db, {
  accountId,
  command,
  applyCommand,
  nowTs,
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

  await requireLearnerWriteAccess(db, accountId, command.learnerId);
  const existingReceipt = await loadMutationReceipt(db, accountId, nextMutation.requestId);
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

  const learner = await first(db, 'SELECT id, state_revision FROM learner_profiles WHERE id = ?', [command.learnerId]);
  if (!learner) throw new NotFoundError('Learner was not found.', { learnerId: command.learnerId });

  const appliedRaw = await applyCommand();
  const appliedPayload = isPlainObject(appliedRaw) ? appliedRaw : {};
  const { runtimeWrite = null, ...applied } = appliedPayload;
  const currentRevision = Number(learner.state_revision) || 0;
  const mutatesLearnerState = Boolean(runtimeWrite) || applied.changed !== false;
  const appliedRevision = mutatesLearnerState ? nextMutation.expectedRevision + 1 : currentRevision;
  const response = {
    ...applied,
    mutation: buildMutationMeta({
      kind,
      scopeType: 'learner',
      scopeId: command.learnerId,
      requestId: nextMutation.requestId,
      correlationId: nextMutation.correlationId,
      expectedRevision: nextMutation.expectedRevision,
      appliedRevision,
    }),
  };
  if (!mutatesLearnerState) {
    logMutation('info', 'mutation.observed', {
      kind,
      scopeType: 'learner',
      scopeId: command.learnerId,
      requestId: nextMutation.requestId,
      correlationId: nextMutation.correlationId,
      expectedRevision: nextMutation.expectedRevision,
      appliedRevision,
    });
    return response;
  }
  const guard = {
    learnerId: command.learnerId,
    expectedRevision: nextMutation.expectedRevision,
  };
  const statements = [];
  if (runtimeWrite) {
    const includeCapacityReadModels = await capacityReadModelTablesAvailable(db);
    const plan = buildSubjectRuntimePersistencePlan(db, accountId, command.learnerId, command.subjectId, runtimeWrite, nowTs, {
      guard,
      includeCapacityReadModels,
    });
    statements.push(...plan.statements);
  }
  statements.push(storeMutationReceiptStatement(db, {
    accountId,
    requestId: nextMutation.requestId,
    scopeType: 'learner',
    scopeId: command.learnerId,
    mutationKind: kind,
    requestHash,
    response,
    correlationId: nextMutation.correlationId,
    appliedAt: nowTs,
  }, { guard }));
  statements.push(bindStatement(db, `
    UPDATE learner_profiles
    SET state_revision = state_revision + 1,
        updated_at = ?
    WHERE id = ?
      AND state_revision = ?
  `, [nowTs, command.learnerId, nextMutation.expectedRevision]));

  const results = await batch(db, statements);
  const casResult = results[results.length - 1] || null;
  const casChanges = Number(casResult?.meta?.changes) || 0;
  if (casChanges !== 1) {
    const currentRevision = Number(await scalar(db, 'SELECT state_revision FROM learner_profiles WHERE id = ?', [command.learnerId], 'state_revision')) || 0;
    throw staleWriteError({
      kind,
      scopeType: 'learner',
      scopeId: command.learnerId,
      requestId: nextMutation.requestId,
      correlationId: nextMutation.correlationId,
      expectedRevision: nextMutation.expectedRevision,
      currentRevision,
    });
  }

  logMutation('info', 'mutation.applied', {
    kind,
    scopeType: 'learner',
    scopeId: command.learnerId,
    requestId: nextMutation.requestId,
    correlationId: nextMutation.correlationId,
    expectedRevision: nextMutation.expectedRevision,
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

  return {
    async ensureAccount(session) {
      const nowTs = nowFactory();
      await ensureAccount(db, session, nowTs);
      return first(db, 'SELECT * FROM adult_accounts WHERE id = ?', [session.accountId]);
    },
    async readSession(accountId) {
      return first(db, 'SELECT * FROM adult_accounts WHERE id = ?', [accountId]);
    },
    async bootstrap(accountId, options = {}) {
      const bundle = await bootstrapBundle(db, accountId, options);
      // U3: stamp `bootstrapCapacity` on the collector when the bundle
      // emitted one. The collector is mutated rather than returned —
      // keeps repository call signatures stable across all callers.
      if (capacity && bundle?.bootstrapCapacity != null) {
        capacity.bootstrapCapacity = bundle.bootstrapCapacity;
      }
      return bundle;
    },
    async readSubjectRuntime(accountId, learnerId, subjectId = 'spelling') {
      return readSubjectRuntimeBundle(db, accountId, learnerId, subjectId);
    },
    async readLearnerProjectionState(accountId, learnerId) {
      return readLearnerProjectionBundle(db, accountId, learnerId);
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
      });
    },
    async clearSubjectState(accountId, learnerId, subjectId = null, mutation = {}) {
      const nowTs = nowFactory();
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
        apply: async () => {
          if (subjectId) {
            await run(db, 'DELETE FROM child_subject_state WHERE learner_id = ? AND subject_id = ?', [learnerId, subjectId]);
            return { key: `${learnerId || 'default'}::${subjectId || 'unknown'}`, cleared: true };
          }
          await run(db, 'DELETE FROM child_subject_state WHERE learner_id = ?', [learnerId]);
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
      return withLearnerMutation(db, {
        accountId,
        learnerId,
        kind: 'learner_runtime.reset',
        payload: { learnerId },
        mutation,
        nowTs,
        apply: async () => {
          await batch(db, [
            bindStatement(db, 'DELETE FROM child_subject_state WHERE learner_id = ?', [learnerId]),
            bindStatement(db, 'DELETE FROM practice_sessions WHERE learner_id = ?', [learnerId]),
            bindStatement(db, 'DELETE FROM child_game_state WHERE learner_id = ?', [learnerId]),
            bindStatement(db, 'DELETE FROM event_log WHERE learner_id = ?', [learnerId]),
            bindStatement(db, 'DELETE FROM learner_activity_feed WHERE learner_id = ?', [learnerId]),
            bindStatement(db, 'DELETE FROM learner_read_models WHERE learner_id = ?', [learnerId]),
          ]);
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
    async readSpellingRuntimeContent(accountId, subjectId = 'spelling') {
      return readSpellingRuntimeContentBundle(db, accountId, subjectId);
    },
    async readSpellingWordBank(accountId, learnerId, filters = {}) {
      return readSpellingWordBankBundle(db, accountId, learnerId, filters, nowFactory());
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
      const content = backfillSpellingWordExplanations(rawContent, SEEDED_SPELLING_CONTENT_BUNDLE);
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
      const contentBundle = await readSubjectContentBundle(db, accountId, 'spelling');
      const learnerBundle = await loadLearnerReadBundle(db, resolvedLearnerId);
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
        runtimeSnapshots: { spelling: runtimeSnapshotForBundle(contentBundle) },
        now: nowFactory,
      });
      return {
        learnerId: resolvedLearnerId,
        parentHub: model,
      };
    },
    async readAdminHub(accountId, { learnerId = null, requestId = null, auditLimit = 20 } = {}) {
      const account = await first(db, 'SELECT id, selected_learner_id, repo_revision, platform_role, account_type FROM adult_accounts WHERE id = ?', [accountId]);
      requireAdminHubAccess(account);
      const memberships = await listMembershipRows(db, accountId, { writableOnly: false });
      const contentBundle = await readSubjectContentBundle(db, accountId, 'spelling');
      const learnerBundles = {};
      for (const row of memberships) {
        learnerBundles[row.id] = await loadLearnerReadBundle(db, row.id);
      }
      const defaultLearnerId = account?.selected_learner_id && memberships.some((membership) => membership.id === account.selected_learner_id)
        ? account.selected_learner_id
        : (memberships[0]?.id || null);
      const selectedLearnerId = learnerId || defaultLearnerId;
      const auditEntries = await listMutationReceiptRows(db, accountId, {
        requestId,
        limit: auditLimit,
      });
      const nowTs = nowFactory();
      const demoOperations = await readDemoOperationSummary(db, nowTs);
      const monsterVisualConfig = await readMonsterVisualConfigState(db, nowTs);
      const dashboardKpis = await readDashboardKpis(db, { now: nowTs, actorAccountId: accountId });
      const opsActivityStream = await listRecentMutationReceipts(db, {
        now: nowTs,
        actorAccountId: accountId,
        limit: OPS_ACTIVITY_STREAM_DEFAULT_LIMIT,
      });
      const accountOpsMetadata = await readAccountOpsMetadataDirectory(db, {
        now: nowTs,
        actorAccountId: accountId,
        actorPlatformRole: accountPlatformRole(account),
      });
      const errorLogSummary = await readOpsErrorEventSummary(db, {
        now: nowTs,
        actorAccountId: accountId,
        limit: OPS_ERROR_EVENTS_DEFAULT_LIMIT,
      });
      const model = buildAdminHubReadModel({
        account: {
          id: accountId,
          selectedLearnerId,
          repoRevision: Number(account?.repo_revision) || 0,
          platformRole: accountPlatformRole(account),
        },
        platformRole: accountPlatformRole(account),
        spellingContentBundle: contentBundle,
        memberships: memberships.map(membershipRowToModel),
        learnerBundles,
        runtimeSnapshots: { spelling: runtimeSnapshotForBundle(contentBundle) },
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
          errorLogSummary,
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
    async readAdminOpsErrorEvents(accountId, { status = null, limit = OPS_ERROR_EVENTS_DEFAULT_LIMIT } = {}) {
      return readOpsErrorEventSummary(db, {
        now: nowFactory(),
        actorAccountId: accountId,
        status,
        limit,
      });
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
      });
    },
    async bumpAdminKpiMetric(key, delta = 1) {
      return bumpAdminKpiMetric(db, key, nowFactory(), delta);
    },
    async listAdminAccounts(accountId) {
      return listAccountDirectory(db, accountId);
    },
    async updateAdminAccountRole(accountId, { targetAccountId, platformRole, requestId, correlationId = null } = {}) {
      return updateManagedAccountRole(db, {
        actorAccountId: accountId,
        targetAccountId,
        platformRole,
        requestId,
        correlationId: correlationId || requestId,
        nowTs: nowFactory(),
      });
    },
    async updateAccountOpsMetadata(accountId, { targetAccountId, patch, mutation = {} } = {}) {
      return updateAccountOpsMetadata(db, {
        actorAccountId: accountId,
        targetAccountId,
        patch,
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
      });
    },
    async recordClientErrorEvent({ clientEvent, sessionAccountId = null } = {}) {
      return recordClientErrorEvent(db, {
        clientEvent,
        sessionAccountId,
        nowTs: nowFactory(),
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
          const bundle = await bootstrapBundle(db, accountId);
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
  };
}
