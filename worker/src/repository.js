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
  POST_MEGA_SEED_SHAPES,
  resolvePostMegaSeedShape,
} from '../../shared/spelling/post-mastery-seed-shapes.js';
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
  appendRecentEventTokens,
  COMMAND_PROJECTION_MODEL_KEY,
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
import { buildPunctuationReadModel } from './subjects/punctuation/read-models.js';
import { listPunctuationEvents } from './subjects/punctuation/events.js';
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
  archiveGrammarTransferEvidenceState,
  createInitialGrammarState,
  deleteGrammarTransferEvidenceState,
} from './subjects/grammar/engine.js';
import { grammarTransferPromptById } from './subjects/grammar/transfer-prompts.js';
import {
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
// U7: bumped from 1 → 2 when the selected-learner-bounded envelope landed.
// Any additive required field on the bootstrap envelope MUST bump this in
// the same PR. `tests/worker-bootstrap-v2.test.js` has a snapshot test that
// fails if the envelope shape changes without a version bump (scenario 15).
const PUBLIC_BOOTSTRAP_CAPACITY_VERSION = 2;
export const BOOTSTRAP_CAPACITY_VERSION = PUBLIC_BOOTSTRAP_CAPACITY_VERSION;

// U7: closed union for `meta.capacity.bootstrapMode` when the public
// bootstrap runs. `full-legacy` covers the `publicReadModels=false` path
// (non-public internal callers still go through the unrestricted bundle).
// `not-modified` is returned when the client's `lastKnownRevision` matches
// the current server hash and we return a < 2 KB short response.
export const BOOTSTRAP_MODES = new Set([
  'selected-learner-bounded',
  'full-legacy',
  'not-modified',
]);

// U7: snapshot for the v2 envelope shape. Locked per-version; a required
// shape change without a `BOOTSTRAP_CAPACITY_VERSION` bump + a snapshot
// update in the same PR fails the release-rule test (scenario 15).
// EVIDENCE_SCHEMA_VERSION is deliberately NOT bumped — that constant
// covers the capacity evidence doc schema (U3), not the bootstrap
// envelope; bootstrap envelope evolution is governed by its own version.
export const BOOTSTRAP_V2_ENVELOPE_SHAPE = Object.freeze({
  version: PUBLIC_BOOTSTRAP_CAPACITY_VERSION,
  requiredTopLevelKeys: Object.freeze([
    'account',
    'eventLog',
    'gameState',
    'learners',
    'meta',
    'monsterVisualConfig',
    'practiceSessions',
    'revision',
    'subjectStates',
    'syncState',
  ]),
  requiredRevisionKeys: Object.freeze([
    'accountRevision',
    'accountLearnerListRevision',
    'bootstrapCapacityVersion',
    'hash',
    'selectedLearnerRevision',
  ]),
});

// U7: the classroom summary paginates at 50 learners per page (plan R11).
const CLASSROOM_LEARNERS_SUMMARY_PAGE_LIMIT = 50;
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
  if (sessionKind === 'boss') return 'Boss Dictation';
  if (sessionKind === 'guardian') return 'Guardian Mission';
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
  // U6 queryCount budget: RETURNING * folds the post-write SELECT into
  // the UPSERT so per-command ensureAccount runs a single query.
  return first(db, `
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, NULL, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      email = COALESCE(excluded.email, adult_accounts.email),
      display_name = COALESCE(excluded.display_name, adult_accounts.display_name),
      platform_role = COALESCE(excluded.platform_role, adult_accounts.platform_role),
      updated_at = excluded.updated_at
    RETURNING *
  `, [session.accountId, session.email, session.displayName, platformRole, nowTs, nowTs]);
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

// U10 follower (MEDIUM — admin-only policy lock): the Grammar Writing
// Try archive + hard-delete routes are destructive data mutations. The
// reviewer convergence chose the stricter gate (admin only, ops 403)
// rather than `requireAdminHubAccess` which grants ops through. Mirrors
// `requireMonsterVisualConfigManager` and emits a dedicated error code
// (`grammar_transfer_admin_forbidden`) so the security test can lock
// the exact policy string.
function requireGrammarTransferAdmin(account) {
  if (accountType(account) === 'demo' || accountPlatformRole(account) !== 'admin') {
    throw new ForbiddenError('Grammar Writing Try archive and delete require an admin account.', {
      code: 'grammar_transfer_admin_forbidden',
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

// U6 hot-path optimisation: every subject command called
// `capacityReadModelTablesAvailable(db)` which issued a SELECT against
// sqlite_master. The presence of the capacity read-model tables does
// not change across the lifetime of a Worker isolate (migrations only
// add them once), so cache the result per underlying DB handle — but
// only the *true* outcome. A transient false would be re-checked on
// the next request so a mid-lifetime migration can unlock the feature
// without restarting the isolate. WeakMap keying on the raw D1 handle
// survives the capacity-wrapped proxy used by `withCapacityCollector`
// because the wrapper exposes `originalDatabase` on its prototype; we
// resolve to the underlying handle before caching.
const capacityReadModelTablesCache = new WeakMap();

function underlyingDbHandle(db) {
  // The capacity-collector wrapper forwards most calls via prototype
  // but keeps a reference to the unwrapped handle on `__rawDb` (set in
  // d1.js). Fall back to `db` itself for raw handles.
  return db && db.__rawDb ? db.__rawDb : db;
}

async function capacityReadModelTablesAvailable(db) {
  const cacheKey = underlyingDbHandle(db);
  if (cacheKey && capacityReadModelTablesCache.has(cacheKey)) {
    return capacityReadModelTablesCache.get(cacheKey);
  }
  try {
    const rows = await all(db, `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name IN (${sqlPlaceholders(CAPACITY_READ_MODEL_TABLES.length)})
    `, CAPACITY_READ_MODEL_TABLES);
    const tableNames = new Set(rows.map((row) => row.name).filter(Boolean));
    const available = CAPACITY_READ_MODEL_TABLES.every((tableName) => tableNames.has(tableName));
    if (available && cacheKey) {
      capacityReadModelTablesCache.set(cacheKey, true);
    }
    return available;
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

async function readDashboardKpis(db, { now, actorAccountId } = {}) {
  await assertAdminHubActor(db, actorAccountId);
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
  // in `worker/src/index.js::runScheduledHandler`; we soft-fail if the
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

async function readOpsErrorEventSummary(db, { now, actorAccountId, status = null, limit = OPS_ERROR_EVENTS_DEFAULT_LIMIT } = {}) {
  const actor = await assertAdminHubActor(db, actorAccountId);
  const actorPlatformRole = normalisePlatformRole(actor?.platform_role);
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

    // U18: drawer-ready SELECT pulls the full column set per row so the
    // client can render an expandable <details> with release-tracking
    // timestamps and per-role redaction. The SELECT columns stay a
    // flat list because the filter-narrowed and total-list paths share
    // the same shape (U19 wires filter predicates through the same
    // projection). Ordering: last_seen DESC to match the triage view.
    const entryRows = statusFilter
      ? await all(db, `
        SELECT id, error_kind, message_first_line, first_frame, route_name, user_agent,
               account_id, occurrence_count, first_seen, last_seen, status,
               first_seen_release, last_seen_release, resolved_in_release,
               last_status_change_at
        FROM ops_error_events
        WHERE status = ?
        ORDER BY last_seen DESC, id DESC
        LIMIT ?
      `, [statusFilter, safeLimit])
      : await all(db, `
        SELECT id, error_kind, message_first_line, first_frame, route_name, user_agent,
               account_id, occurrence_count, first_seen, last_seen, status,
               first_seen_release, last_seen_release, resolved_in_release,
               last_status_change_at
        FROM ops_error_events
        ORDER BY last_seen DESC, id DESC
        LIMIT ?
      `, [safeLimit]);

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
// `mutation_receipts` — the receipts table is pruned on a 30-day
// retention window (or 365 for `admin.*` kinds), so a recompute would
// drift downward as old receipts age out. The counter is the
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

// ---------------------------------------------------------------------------
// P2 U3: admin-gated QA seed harness for post-Mega learner states.
//
// Writes one of the 8 canonical seed shapes into `child_subject_state` for a
// target learner. Routes through the Admin Ops P1 mutation-receipt path with
// `scopeType='platform'` so cross-origin CSRF attempts fail at the receipt
// header check. Atomic via `batch()` (R21) so the child_subject_state upsert
// and the receipt row either both land or neither does — a partial land
// would leave a seed without a receipt (or vice versa) and obscure the
// audit trail.
//
// Edge case — target learner does not yet exist: a learner_profiles row is
// inserted (Name: "Seed learner", Year Group: "Y5", Avatar: "#8A4FFF",
// Goal: empty) and the acting admin is granted owner membership so they
// can later see the seeded learner in the admin hub's learner picker.
// ---------------------------------------------------------------------------
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
  const runtimeSnapshot = resolveRuntimeSnapshot(SEEDED_SPELLING_CONTENT_BUNDLE, {
    referenceBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
  });
  const wordBySlug = Object.fromEntries(
    (runtimeSnapshot?.words || []).map((word) => [word.slug, word]),
  );
  const data = resolvePostMegaSeedShape(shapeName, wordBySlug, todayDay);
  const dataJson = JSON.stringify(data);

  // Auto-create the learner if missing (plan edge case).
  const existingLearner = await first(
    db,
    'SELECT id FROM learner_profiles WHERE id = ?',
    [learnerId],
  );
  const createdLearner = !existingLearner;

  // U3 reviewer follow-up (HIGH adversarial): cross-tenant learner data wipe.
  // Before P2, an admin could type any learnerId and the seed would overwrite
  // another account's learner_profiles + child_subject_state without warning,
  // no undo, no audit pre-image. Two-layer guard:
  //   1. When the target learner already exists and the acting admin has no
  //      membership row for it, REJECT with 409 `seed_requires_membership`
  //      UNLESS the client explicitly passes `confirmOverwrite: true`. The
  //      confirm-flag lets a genuine ops response (debugging another
  //      account's data) proceed — but only with explicit intent.
  //   2. On every overwrite path (own-learner or with confirmOverwrite),
  //      capture the pre-image `data_json` and include it in the mutation
  //      receipt's `response_json.postMegaSeed.previousDataJson` so a future
  //      rollback tool can restore the state without trawling backups.
  let previousDataJson = null;
  if (!createdLearner) {
    const existingMembership = await getMembership(db, actorAccountId, learnerId);
    if (!existingMembership && !confirmOverwrite) {
      throw new ConflictError(
        'Seed target is owned by a different account. Re-submit with confirmOverwrite=true to proceed.',
        {
          code: 'seed_requires_membership',
          learnerId,
          remedy: 'Resubmit the request with `confirmOverwrite: true` in the body to acknowledge the cross-tenant overwrite. The pre-image is captured in the mutation receipt for rollback.',
        },
      );
    }
    const previousRow = await first(
      db,
      `SELECT data_json FROM child_subject_state
         WHERE learner_id = ? AND subject_id = 'spelling'`,
      [learnerId],
    );
    previousDataJson = typeof previousRow?.data_json === 'string' ? previousRow.data_json : null;
  }

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

  // Upsert child_subject_state for (learner, 'spelling') with the seed
  // shape's data JSON. ui_json is reset to 'null' so a stale local UI
  // snapshot does not contaminate the seeded state's read-side projection.
  statements.push(bindStatement(db, `
    INSERT INTO child_subject_state (
      learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id
    )
    VALUES (?, 'spelling', 'null', ?, ?, ?)
    ON CONFLICT(learner_id, subject_id) DO UPDATE SET
      ui_json = 'null',
      data_json = excluded.data_json,
      updated_at = excluded.updated_at,
      updated_by_account_id = excluded.updated_by_account_id
  `, [learnerId, dataJson, ts, actorAccountId]));

  const mutationMeta = {
    policyVersion: MUTATION_POLICY_VERSION,
    kind: POST_MEGA_SEED_MUTATION_KIND,
    scopeType: 'platform',
    scopeId,
    requestId,
    correlationId,
    appliedAt: ts,
    replayed: false,
  };
  const response = {
    postMegaSeed: {
      learnerId,
      shapeName,
      today: todayDay,
      createdLearner,
      dataKeys: Object.keys(data).sort(),
      // U3 reviewer follow-up (HIGH adversarial): capture pre-image so a
      // future rollback tool can restore the prior child_subject_state.
      // `previousDataJson` is the RAW JSON string (possibly null for first-
      // write) — rollback consumers parse with `JSON.parse` only when
      // non-null. The field lives inside `postMegaSeed` so the mutation
      // receipt's `response_json` is self-contained for audit.
      previousDataJson,
      // `confirmedOverwrite` is true when the overwrite was cross-tenant
      // (no membership) and the caller passed `confirmOverwrite: true`. The
      // audit reviewer can filter on this to surface the small set of
      // cross-account seeds that deserve a second look.
      confirmedOverwrite: Boolean(!createdLearner && confirmOverwrite && previousDataJson !== null),
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
  }));

  await batch(db, statements);
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
  const initialState = createInitialGrammarState(record.data || {});
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
  return runAdminGrammarTransferMutation(db, {
    actorAccountId,
    learnerId,
    promptId,
    mutation,
    mutationKind: GRAMMAR_TRANSFER_ARCHIVE_MUTATION_KIND,
    scopeType: GRAMMAR_TRANSFER_ARCHIVE_SCOPE_TYPE,
    scopeTypeForReceipt: GRAMMAR_TRANSFER_ARCHIVE_SCOPE_TYPE,
    nowTs,
    applyStateChange: (state, context) => archiveGrammarTransferEvidenceState(state, context),
  });
}

async function deleteGrammarTransferEvidence(db, {
  actorAccountId,
  learnerId,
  promptId,
  mutation,
  nowTs,
}) {
  return runAdminGrammarTransferMutation(db, {
    actorAccountId,
    learnerId,
    promptId,
    mutation,
    mutationKind: GRAMMAR_TRANSFER_DELETE_MUTATION_KIND,
    scopeType: GRAMMAR_TRANSFER_ARCHIVE_SCOPE_TYPE,
    scopeTypeForReceipt: GRAMMAR_TRANSFER_ARCHIVE_SCOPE_TYPE,
    nowTs,
    applyStateChange: (state, context) => deleteGrammarTransferEvidenceState(state, context),
  });
}

// Suppress unused import until admin read-model consumes them in the
// public repository method registration. The constants are referenced
// inside the repository close below.
void grammarTransferPromptById;

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
      SELECT id, first_seen, occurrence_count, status,
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
        await batch(db, [
          bindStatement(db, `
            UPDATE ops_error_events
            SET last_seen = ?,
                occurrence_count = occurrence_count + 1,
                last_seen_release = ?,
                status = 'open',
                last_status_change_at = ?
            WHERE id = ?
          `, [ts, storedReleaseValue, ts, existing.id]),
          bumpAdminKpiMetricStatement(db, `${KPI_ERROR_STATUS_METRIC_PREFIX}resolved`, ts, -1),
          bumpAdminKpiMetricStatement(db, `${KPI_ERROR_STATUS_METRIC_PREFIX}open`, ts, 1),
        ]);
        return {
          eventId: existing.id,
          deduped: true,
          unavailable: false,
          autoReopened: true,
        };
      }

      await run(db, `
        UPDATE ops_error_events
        SET last_seen = ?,
            occurrence_count = occurrence_count + 1,
            last_seen_release = ?
        WHERE id = ?
      `, [ts, storedReleaseValue, existing.id]);
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

// U7: compact pointer for the selected-learner-bounded envelope. Omits
// the ~450 KB bundled config; the client uses `publishedVersion` +
// `manifestHash` to decide whether its cached config is still current,
// and fetches the full config via its existing lazy path when not.
async function readMonsterVisualConfigPointer(db) {
  try {
    const row = await first(db, `
      SELECT published_version, manifest_hash, published_at, schema_version
      FROM platform_monster_visual_config
      WHERE id = ?
    `, [MONSTER_VISUAL_CONFIG_ID]);
    return {
      schemaVersion: Number(row?.schema_version) || MONSTER_VISUAL_SCHEMA_VERSION,
      manifestHash: row?.manifest_hash || MONSTER_ASSET_MANIFEST.manifestHash,
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
        manifestHash: MONSTER_ASSET_MANIFEST.manifestHash,
        publishedVersion: 0,
        publishedAt: 0,
        compact: true,
      };
    }
    throw error;
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

// U7: SHA-256 revision hash over the stable four-part signature. Truncated
// to 16 bytes hex (32 chars). NOT a password hash — purely a cache-tag
// identifier; `crypto.subtle.digest('SHA-256', ...)` is fine for this use
// per the plan (line 792: "never a password hash").
//
// Input format is strictly:
//   accountId:<id>;accountRevision:<N>;selectedLearnerRevision:<M>;bootstrapCapacityVersion:<V>;accountLearnerListRevision:<L>
//
// The `accountId` prefix (U7 adv-u7-r1-002) salts the hash per account so
// two accounts with identical (N,M,V,L) tuples no longer collide. Without
// this salt, an operator correlating hashes across requests could infer
// state-equivalence between accounts. No user data leaks either way
// because session scope already isolates responses, but the hash-level
// privacy hardening closes the side-channel.
//
// Changing this input format (or the truncation length) is equivalent to
// bumping `BOOTSTRAP_CAPACITY_VERSION` — stale clients will silently
// reject `notModified` responses via the schema check. The version bump
// in U7 from 1→2 already forces pre-U7 clients to miss, so adding the
// accountId salt costs no extra roundtrip on rollout.
export async function computeBootstrapRevisionHash({
  accountId,
  accountRevision,
  selectedLearnerRevision,
  bootstrapCapacityVersion,
  accountLearnerListRevision,
}) {
  const input = [
    `accountId:${String(accountId || '')}`,
    `accountRevision:${Number(accountRevision) || 0}`,
    `selectedLearnerRevision:${Number(selectedLearnerRevision) || 0}`,
    `bootstrapCapacityVersion:${Number(bootstrapCapacityVersion) || 0}`,
    `accountLearnerListRevision:${Number(accountLearnerListRevision) || 0}`,
  ].join(';');
  const bytes = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const out = new Uint8Array(digest).slice(0, 16);
  let hex = '';
  for (let i = 0; i < out.length; i += 1) {
    hex += out[i].toString(16).padStart(2, '0');
  }
  return hex;
}

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

// U7: compact `account.learnerList` entry for unselected learners in the
// selected-learner-bounded response. Hard limit on per-entry payload —
// no avatar blobs, no history, no prompts. Roughly 150 bytes per entry
// after JSON serialisation; 50 entries → ~7.5 KB.
function compactLearnerListEntry(row) {
  if (!row) return null;
  return {
    id: String(row.id || ''),
    name: String(row.name || ''),
    avatarColor: row.avatar_color ? String(row.avatar_color) : null,
    yearGroup: row.year_group ? String(row.year_group) : null,
    revision: Number(row.state_revision) || 0,
  };
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

// U7: resolve the "cold-start" selected learner given optional client
// preference. Precedence (per plan line 756):
//   1. preferredLearnerId (if writable in caller's scope)
//   2. persisted account.selected_learner_id (if still writable)
//   3. first alphabetical by learner id
// Client preference pointing at a non-writable id is silently rejected —
// do NOT leak `clientPreferenceRejected` in the response body per plan
// line 778.
function resolveBootstrapSelectedLearnerId(
  membershipRows,
  persistedSelectedId,
  preferredLearnerId,
) {
  const writableIds = new Set(
    membershipRows.filter((row) => writableRole(row.role)).map((row) => String(row.id)),
  );
  if (!writableIds.size) return null;
  const preferred = preferredLearnerId ? String(preferredLearnerId) : '';
  if (preferred && writableIds.has(preferred)) return preferred;
  if (persistedSelectedId && writableIds.has(String(persistedSelectedId))) {
    return String(persistedSelectedId);
  }
  // Alphabetical fallback.
  const sorted = [...writableIds].sort();
  return sorted[0] || null;
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
} = {}) {
  const account = await first(db, 'SELECT * FROM adult_accounts WHERE id = ?', [accountId]);
  // U7: on the bounded path we omit the ~450 KB `BUNDLED_MONSTER_VISUAL_CONFIG`
  // from the bootstrap response. Clients fetch the full config lazily via
  // the existing monster-visual-config read path; the bootstrap instead
  // ships a compact `{schemaVersion, manifestHash, publishedVersion}`
  // pointer so the client's schema check + cache invalidation still work.
  const fullMonsterVisualConfig = selectedLearnerBounded
    ? null
    : await readBootstrapMonsterVisualRuntimeConfig(db, Date.now());
  const monsterVisualConfigPointer = selectedLearnerBounded
    ? await readMonsterVisualConfigPointer(db)
    : null;
  const monsterVisualConfig = fullMonsterVisualConfig || monsterVisualConfigPointer;
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

  const selectedId = revisionEnvelope
    ? resolveBootstrapSelectedLearnerId(
      membershipRows,
      account?.selected_learner_id,
      preferredLearnerId,
    )
    : (learnerIds.includes(account?.selected_learner_id)
      ? account.selected_learner_id
      : (learnerIds[0] || null));

  if (selectedId !== (account?.selected_learner_id || null)) {
    await run(db, 'UPDATE adult_accounts SET selected_learner_id = ?, updated_at = ? WHERE id = ?', [selectedId, Date.now(), accountId]);
  }

  // U7: the "bounded" mode restricts per-learner reads to the selected
  // learner only. If no selected learner exists (empty account, or
  // cold-start with alphabetical fallback also producing null), the
  // bounded mode degrades to the empty-learners branch further down.
  const boundedToSelected = publicReadModels && selectedLearnerBounded && selectedId;
  const queryLearnerIds = boundedToSelected ? [selectedId] : learnerIds;

  // U7: precompute the revision-envelope ingredients so that both the
  // empty and non-empty branches can stamp them consistently. These
  // queries are free when `revisionEnvelope=false` (we skip them).
  const accountRevisionValue = Number(account?.repo_revision) || 0;
  const accountLearnerListRevision = revisionEnvelope
    ? await readAccountLearnerListRevision(db, accountId)
    : 0;
  const selectedLearnerRevision = selectedId ? (learnerRevisions[selectedId] || 0) : 0;
  const revisionHash = revisionEnvelope
    ? await computeBootstrapRevisionHash({
      accountId,
      accountRevision: accountRevisionValue,
      selectedLearnerRevision,
      bootstrapCapacityVersion: PUBLIC_BOOTSTRAP_CAPACITY_VERSION,
      accountLearnerListRevision,
    })
    : null;

  // U7: compact `account.learnerList` entries for unselected learners.
  // When `boundedToSelected` is false (legacy callers), this stays empty
  // so the legacy envelope is unchanged.
  const learnerListEntries = boundedToSelected
    ? membershipRows
      .filter((row) => String(row.id) !== String(selectedId))
      .map((row) => compactLearnerListEntry(row))
      .filter(Boolean)
    : [];

  if (!learnerIds.length) {
    const emptyMode = boundedToSelected ? 'selected-learner-bounded' : null;
    const capacityMeta = publicReadModels ? bootstrapCapacityMeta({
      publicReadModels,
      learnerCount: 0,
      sessionRows: [],
      eventRows: [],
    }) : null;
    if (capacityMeta && emptyMode) capacityMeta.bootstrapMode = emptyMode;
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
    };
  }

  const placeholders = sqlPlaceholders(queryLearnerIds.length);
  const subjectRows = await all(db, `
    SELECT learner_id, subject_id, ui_json, data_json, updated_at
    FROM child_subject_state
    WHERE learner_id IN (${placeholders})
  `, queryLearnerIds);
  const sessionRows = publicReadModels
    ? await listPublicBootstrapSessionRows(db, queryLearnerIds)
    : await all(db, `
      SELECT id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at
      FROM practice_sessions
      WHERE learner_id IN (${placeholders})
      ORDER BY updated_at DESC, id DESC
    `, queryLearnerIds);
  const gameRows = await all(db, `
    SELECT learner_id, system_id, state_json, updated_at
    FROM child_game_state
    WHERE learner_id IN (${placeholders})
  `, queryLearnerIds);
  const eventRows = publicReadModels
    ? await listPublicBootstrapEventRows(db, queryLearnerIds)
    : await all(db, `
      SELECT id, learner_id, subject_id, system_id, event_type, event_json, created_at
      FROM event_log
      WHERE learner_id IN (${placeholders})
      ORDER BY created_at ASC, id ASC
    `, queryLearnerIds);
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

  const capacityMeta = publicReadModels ? bootstrapCapacityMeta({
    publicReadModels,
    learnerCount: queryLearnerIds.length,
    sessionRows,
    eventRows,
  }) : null;
  if (capacityMeta && boundedToSelected) capacityMeta.bootstrapMode = 'selected-learner-bounded';

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
  };
}

// U7: short-circuit response when `lastKnownRevision` matches the current
// server hash. Returns null if the hash doesn't match (caller should
// build a full bundle instead). ≤ 2 KB body.
async function bootstrapNotModifiedProbe(db, accountId, {
  lastKnownRevision,
  preferredLearnerId = null,
}) {
  if (!lastKnownRevision || typeof lastKnownRevision !== 'string') return null;
  const account = await first(db, 'SELECT id, selected_learner_id, repo_revision FROM adult_accounts WHERE id = ?', [accountId]);
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
  const serverHash = await computeBootstrapRevisionHash({
    accountId,
    accountRevision: accountRevisionValue,
    selectedLearnerRevision,
    bootstrapCapacityVersion: PUBLIC_BOOTSTRAP_CAPACITY_VERSION,
    accountLearnerListRevision,
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
  if (!skipAccessCheck) {
    await requireLearnerWriteAccess(db, accountId, learnerId);
  }
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
    // U6 queryCount budget: skip the no-op "abandon siblings" UPDATE
    // when the caller confirmed the current active session id is the
    // same one we are about to upsert. The UPDATE's `id <> ?` filter
    // means it would match zero rows in that case.
    const shouldEmitAbandon = session.status === 'active'
      && (currentActiveSessionId == null || currentActiveSessionId !== session.id);
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
  // U7: any learner-list mutation (add, remove, rename, avatar-change) runs
  // through this path. Bumping here ensures the revision hash changes even
  // when `repo_revision` (the account CAS revision) happens to stay
  // stable for a non-mutation refresh.
  await bumpAccountLearnerListRevision(db, accountId, nowTs);
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

  // NOTE: non-atomic by design — (a) branching on intermediate read results
  // (existingReceipt short-circuit, repo_revision CAS compare) plus (b) an
  // `apply()` callback that runs its own write path. `withTransaction` was
  // removed in U12 (production D1 no-op). The CAS UPDATE itself
  // (`WHERE repo_revision = ?`) is the authoritative stale-write defence.
  return (async () => {
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
  })();
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

  // NOTE: non-atomic by design — (a) branching on intermediate read results
  // (write-access check, existingReceipt short-circuit, state_revision CAS
  // compare) plus (b) an `apply()` callback that runs its own write path.
  // `withTransaction` was removed in U12 (silent production no-op). The
  // CAS UPDATE (`WHERE state_revision = ?`) is the stale-write defence.
  return (async () => {
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
  })();
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

  await requireLearnerWriteAccess(db, accountId, command.learnerId);

  // U6 queryCount budget: fold the mutation-receipt idempotency lookup
  // and the learner revision read into a single LEFT JOIN so the hot
  // path issues one SELECT instead of two. NULL-padded columns signal
  // "no existing receipt" and a missing `learner_id` signals "learner
  // not found" (and the request terminates the same way as the prior
  // two-query flow).
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
  `, [accountId, nextMutation.requestId, command.learnerId]);

  if (!combinedRow || !combinedRow.learner_id) {
    throw new NotFoundError('Learner was not found.', { learnerId: command.learnerId });
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
    const freshApplyRaw = await applyCommand();
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
      const includeCapacityReadModels = await capacityReadModelTablesAvailable(db);
      const plan = buildSubjectRuntimePersistencePlan(
        db,
        accountId,
        command.learnerId,
        command.subjectId,
        freshRuntimeWrite,
        nowTs,
        {
          guard: attemptGuard,
          // When includeProjection is false we still need capacity read
          // models for the rest of the persistence plan (subject state,
          // practice session, event log, activity feed); the plan only
          // omits the projection read-model write itself.
          includeCapacityReadModels,
          projectionContext: includeProjection ? freshProjectionContext : null,
          skipProjectionReadModelWrite: !includeProjection,
          currentActiveSessionId: freshRuntimeWrite.previousActiveSessionId || null,
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
      response: attemptResponse,
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

    const attemptResults = await batch(db, attemptStatements);
    const attemptCasResult = attemptResults[attemptResults.length - 1] || null;
    const attemptCasChanges = Number(attemptCasResult?.meta?.changes) || 0;
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

  // --- Attempt 1: full batch at the client-declared expectedRevision.
  const firstAttempt = await attemptMutation(originalExpectedRevision, { includeProjection: true });
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
  const secondAttempt = await attemptMutation(freshRevisionAfterFirst, { includeProjection: true });
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
    });
    return secondAttempt.response;
  }

  // --- Attempt 3: projection-skip. Stamp `concurrent-retry-exhausted`
  // so operators see the skip in telemetry, then land the primary state
  // without the projection write so a subsequent command can repair via
  // `stale-catchup`. If this final attempt also fails CAS, we honour the
  // client's stale-write contract.
  const freshRevisionAfterSecond = await readFreshRevision();
  if (capacity && typeof capacity.setDerivedWriteSkipped === 'function') {
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
      const bundle = await bootstrapBundle(db, accountId, options);
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
    } = {}) {
      if (lastKnownRevision) {
        const probe = await bootstrapNotModifiedProbe(db, accountId, {
          lastKnownRevision,
          preferredLearnerId,
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
        publicReadModels,
        selectedLearnerBounded: true,
        preferredLearnerId,
        revisionEnvelope: true,
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
    } = {}) {
      const bundle = await bootstrapBundle(db, accountId, {
        publicReadModels,
        selectedLearnerBounded: true,
        preferredLearnerId,
        revisionEnvelope: true,
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
      return readSubjectRuntimeBundle(db, accountId, learnerId, subjectId, options);
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
    // U9: Punctuation telemetry read. Fires the same
    // `requireLearnerReadAccess` gate the spelling word-bank read uses
    // so a parent / admin with membership can query their learner's
    // telemetry, but a caller without membership gets a 403. The SQL
    // SELECT is delegated to `worker/src/subjects/punctuation/events.js`
    // for test reachability; the repository layer owns the authz gate.
    async readPunctuationEvents(accountId, learnerId, options = {}) {
      await requireLearnerReadAccess(db, accountId, learnerId);
      return listPunctuationEvents({
        db,
        learnerId,
        kind: options.kind || null,
        sinceMs: options.sinceMs ?? null,
        limit: options.limit ?? null,
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
        buildHash: typeof env?.BUILD_HASH === 'string' && env.BUILD_HASH
          ? env.BUILD_HASH
          : null,
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
