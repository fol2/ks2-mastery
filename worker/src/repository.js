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
import { buildSpellingWordBankReadModel } from './content/spelling-read-models.js';
import { buildSpellingAudioCue } from './subjects/spelling/audio.js';
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
const PUBLIC_MONSTER_CODEX_SYSTEM_ID = 'monster-codex';
const PUBLIC_MONSTER_IDS = new Set(['inklet', 'glimmerbug', 'phaeton', 'vellhorn']);
const PUBLIC_DIRECT_SPELLING_MONSTER_IDS = ['inklet', 'glimmerbug', 'vellhorn'];
const PUBLIC_MONSTER_BRANCHES = new Set(['b1', 'b2']);
const SPELLING_SECURE_STAGE = 4;
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

function redactSpellingUiForClient(ui, data = {}, learnerId = '', { audio = null } = {}) {
  const raw = ui && typeof ui === 'object' && !Array.isArray(ui) ? ui : {};
  const session = raw.session && typeof raw.session === 'object' && !Array.isArray(raw.session)
    ? raw.session
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
    stats: {},
    analytics: null,
    audio: audio ? cloneSerialisable(audio) : null,
    content: null,
  };
}

async function publicSubjectStateRowToRecord(row) {
  const record = subjectStateRowToRecord(row);
  if (row.subject_id !== 'spelling') return record;
  const audio = await buildSpellingAudioCue({
    learnerId: row.learner_id,
    state: record.ui,
  });
  return normaliseSubjectStateRecord({
    ui: redactSpellingUiForClient(record.ui, record.data, row.learner_id, { audio }),
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

async function mergePublicSpellingCodexState(db, accountId, subjectRows, gameState) {
  const spellingRows = subjectRows.filter((row) => row.subject_id === 'spelling');
  if (!spellingRows.length) return gameState;

  const content = await readSubjectContentBundle(db, accountId, 'spelling');
  const snapshot = resolveRuntimeSnapshot(content, {
    referenceBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
  });

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
  if (record.subjectId !== 'spelling') return record;
  return normalisePracticeSessionRecord({
    ...record,
    sessionState: null,
    summary: publicPracticeSessionSummary(record.summary, record.sessionKind),
  });
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
}, { guard = null } = {}) {
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
    ${guardedValueSource(params.length, guard)}
  `, guardedParams(params, guard));
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

async function bootstrapBundle(db, accountId, { publicReadModels = false } = {}) {
  const account = await first(db, 'SELECT * FROM adult_accounts WHERE id = ?', [accountId]);
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
    };
  }

  const placeholders = sqlPlaceholders(learnerIds.length);
  const subjectRows = await all(db, `
    SELECT learner_id, subject_id, ui_json, data_json, updated_at
    FROM child_subject_state
    WHERE learner_id IN (${placeholders})
  `, learnerIds);
  const sessionRows = await all(db, `
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
  const eventRows = await all(db, `
    SELECT id, learner_id, subject_id, system_id, event_type, event_json, created_at
    FROM event_log
    WHERE learner_id IN (${placeholders})
    ORDER BY created_at ASC, id ASC
  `, learnerIds);

  const subjectStates = {};
  for (const row of subjectRows) {
    subjectStates[subjectStateKey(row.learner_id, row.subject_id)] = publicReadModels
      ? await publicSubjectStateRowToRecord(row)
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
    await mergePublicSpellingCodexState(db, accountId, subjectRows, gameState);
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
  const content = await readSubjectContentBundle(db, accountId, 'spelling');
  const snapshot = resolveRuntimeSnapshot(content, {
    referenceBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
  });
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
    ORDER BY created_at ASC, id ASC
  `, [learnerId]);

  return {
    gameState: Object.fromEntries(gameRows.map((row) => [row.system_id, gameStateRowToRecord(row)])),
    events: normaliseEventLog(eventRows.map(eventRowToRecord).filter(Boolean)),
  };
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

function guardedParams(params, guard) {
  if (!guard) return params;
  return [...params, guard.learnerId, guard.expectedRevision];
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

function buildSubjectRuntimePersistencePlan(db, accountId, learnerId, subjectId, runtime, nowTs, { guard = null } = {}) {
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
  const plan = buildSubjectRuntimePersistencePlan(db, accountId, learnerId, subjectId, runtime, nowTs);
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
    const plan = buildSubjectRuntimePersistencePlan(db, accountId, command.learnerId, command.subjectId, runtimeWrite, nowTs, {
      guard,
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

export function createWorkerRepository({ env = {}, now = Date.now } = {}) {
  const db = requireDatabase(env);
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
      return bootstrapBundle(db, accountId, options);
    },
    async readSubjectRuntime(accountId, learnerId, subjectId = 'spelling') {
      return readSubjectRuntimeBundle(db, accountId, learnerId, subjectId);
    },
    async readLearnerProjectionState(accountId, learnerId) {
      return readLearnerProjectionBundle(db, accountId, learnerId);
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
          await run(db, 'DELETE FROM event_log WHERE learner_id = ?', [learnerId]);
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
    async readSpellingWordBank(accountId, learnerId, filters = {}) {
      return readSpellingWordBankBundle(db, accountId, learnerId, filters, nowFactory());
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
      const account = await first(db, 'SELECT id, selected_learner_id, repo_revision, platform_role, account_type FROM adult_accounts WHERE id = ?', [accountId]);
      const readableMemberships = await listMembershipRows(db, accountId, { writableOnly: false });
      const defaultLearnerId = account?.selected_learner_id && readableMemberships.some((membership) => membership.id === account.selected_learner_id)
        ? account.selected_learner_id
        : (readableMemberships[0]?.id || null);
      const resolvedLearnerId = learnerId || defaultLearnerId;
      if (!resolvedLearnerId) {
        throw new NotFoundError('No learner is selected for this parent view.', {
          code: 'parent_hub_missing_learner',
        });
      }
      const membership = await requireLearnerReadAccess(db, accountId, resolvedLearnerId);
      requireParentHubAccess(account, membership);
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
      const demoOperations = await readDemoOperationSummary(db, nowFactory());
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
        adminHub: model,
      };
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
