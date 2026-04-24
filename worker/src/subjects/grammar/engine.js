import {
  cloneSerialisable,
  normalisePracticeSessionRecord,
} from '../../../../src/platform/core/repositories/helpers.js';
import { BadRequestError, NotFoundError } from '../../errors.js';
import {
  createGrammarQuestion,
  evaluateGrammarQuestion,
  GRAMMAR_CONCEPTS,
  GRAMMAR_CONTENT_RELEASE_ID,
  GRAMMAR_TEMPLATE_METADATA,
  grammarTemplateById,
  serialiseGrammarQuestion,
} from './content.js';

const SUBJECT_ID = 'grammar';
const SERVER_AUTHORITY = 'worker';
const DEFAULT_ROUND_LENGTH = 5;
const DEFAULT_MINI_SET_LENGTH = 8;
const ENABLED_MODES = new Set(['learn', 'smart', 'satsset']);
const LOCKED_MODES = Object.freeze(['trouble', 'surgery', 'builder', 'worked', 'faded']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function timestamp(now = Date.now) {
  const value = typeof now === 'function' ? Number(now()) : Number(now);
  return Number.isFinite(value) ? value : Date.now();
}

function clamp(number, min, max) {
  return Math.min(max, Math.max(min, number));
}

function stableHash(value) {
  const text = String(value || '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function defaultMasteryNode() {
  return {
    attempts: 0,
    correct: 0,
    wrong: 0,
    strength: 0.25,
    intervalDays: 0,
    dueAt: 0,
    lastSeenAt: null,
    lastWrongAt: null,
    correctStreak: 0,
  };
}

function normaliseNode(value) {
  const raw = isPlainObject(value) ? value : {};
  const node = defaultMasteryNode();
  for (const key of Object.keys(node)) {
    if (key.endsWith('At') && key !== 'dueAt') {
      node[key] = typeof raw[key] === 'string' ? raw[key] : null;
    } else {
      const number = Number(raw[key]);
      node[key] = Number.isFinite(number) ? number : node[key];
    }
  }
  node.attempts = Math.max(0, Math.floor(node.attempts));
  node.correct = Math.max(0, Math.floor(node.correct));
  node.wrong = Math.max(0, Math.floor(node.wrong));
  node.correctStreak = Math.max(0, Math.floor(node.correctStreak));
  node.strength = clamp(node.strength, 0.02, 0.99);
  node.intervalDays = Math.max(0, node.intervalDays);
  node.dueAt = Math.max(0, node.dueAt);
  return node;
}

function normaliseNodeMap(value) {
  const raw = isPlainObject(value) ? value : {};
  return Object.fromEntries(Object.entries(raw).map(([key, node]) => [key, normaliseNode(node)]));
}

export function normaliseServerGrammarData(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  return {
    contentReleaseId: typeof raw.contentReleaseId === 'string' && raw.contentReleaseId
      ? raw.contentReleaseId
      : GRAMMAR_CONTENT_RELEASE_ID,
    prefs: isPlainObject(raw.prefs) ? cloneSerialisable(raw.prefs) : {},
    mastery: {
      concepts: normaliseNodeMap(raw.mastery?.concepts),
      templates: normaliseNodeMap(raw.mastery?.templates),
      questionTypes: normaliseNodeMap(raw.mastery?.questionTypes),
      items: normaliseNodeMap(raw.mastery?.items),
    },
    retryQueue: Array.isArray(raw.retryQueue)
      ? raw.retryQueue.filter((entry) => isPlainObject(entry) && entry.templateId && Number.isFinite(Number(entry.seed))).map((entry) => ({
        templateId: String(entry.templateId),
        seed: Number(entry.seed),
        dueAt: Number(entry.dueAt) || 0,
        conceptIds: Array.from(new Set((entry.conceptIds || entry.skillIds || []).map(String).filter(Boolean))),
        reason: typeof entry.reason === 'string' ? entry.reason : 'recent-miss',
      }))
      : [],
    misconceptions: isPlainObject(raw.misconceptions) ? cloneSerialisable(raw.misconceptions) : {},
    recentAttempts: Array.isArray(raw.recentAttempts) ? raw.recentAttempts.slice(-80).map(cloneSerialisable) : [],
  };
}

export function grammarConceptStatus(node, now = Date.now()) {
  const current = Number(now) || Date.now();
  const value = normaliseNode(node);
  if (!value.attempts) return 'new';
  if (value.strength < 0.42 || value.wrong > value.correct + 1) return 'weak';
  if ((value.dueAt || 0) <= current) return 'due';
  if (value.strength >= 0.82 && value.intervalDays >= 7 && value.correctStreak >= 3) return 'secured';
  return 'learning';
}

export function createInitialGrammarState(data = {}) {
  const normalisedData = normaliseServerGrammarData(data);
  return {
    subjectId: SUBJECT_ID,
    version: 1,
    contentReleaseId: normalisedData.contentReleaseId,
    serverAuthority: SERVER_AUTHORITY,
    phase: 'dashboard',
    awaitingAdvance: false,
    prefs: {
      mode: normalisedData.prefs.mode || 'smart',
      roundLength: Number(normalisedData.prefs.roundLength) || DEFAULT_ROUND_LENGTH,
      focusConceptId: normalisedData.prefs.focusConceptId || '',
    },
    mastery: normalisedData.mastery,
    retryQueue: normalisedData.retryQueue,
    misconceptions: normalisedData.misconceptions,
    recentAttempts: normalisedData.recentAttempts,
    session: null,
    feedback: null,
    summary: null,
    error: '',
  };
}

function normaliseGrammarState(rawState, data = {}) {
  const fallback = createInitialGrammarState(data);
  if (!isPlainObject(rawState)) return fallback;
  const normalisedData = normaliseServerGrammarData({
    ...data,
    prefs: rawState.prefs || data.prefs,
    mastery: rawState.mastery || data.mastery,
    retryQueue: rawState.retryQueue || data.retryQueue,
    misconceptions: rawState.misconceptions || data.misconceptions,
    recentAttempts: rawState.recentAttempts || data.recentAttempts,
  });
  return {
    ...fallback,
    contentReleaseId: typeof rawState.contentReleaseId === 'string' && rawState.contentReleaseId
      ? rawState.contentReleaseId
      : normalisedData.contentReleaseId,
    phase: typeof rawState.phase === 'string' ? rawState.phase : fallback.phase,
    awaitingAdvance: Boolean(rawState.awaitingAdvance),
    prefs: {
      ...fallback.prefs,
      ...(isPlainObject(rawState.prefs) ? cloneSerialisable(rawState.prefs) : {}),
    },
    mastery: normalisedData.mastery,
    retryQueue: normalisedData.retryQueue,
    misconceptions: normalisedData.misconceptions,
    recentAttempts: normalisedData.recentAttempts,
    session: isPlainObject(rawState.session) ? cloneSerialisable(rawState.session) : null,
    feedback: isPlainObject(rawState.feedback) ? cloneSerialisable(rawState.feedback) : null,
    summary: isPlainObject(rawState.summary) ? cloneSerialisable(rawState.summary) : null,
    error: typeof rawState.error === 'string' ? rawState.error : '',
    serverAuthority: rawState.serverAuthority === SERVER_AUTHORITY ? SERVER_AUTHORITY : null,
  };
}

function stateData(state) {
  return {
    contentReleaseId: state.contentReleaseId,
    prefs: cloneSerialisable(state.prefs) || {},
    mastery: cloneSerialisable(state.mastery) || {},
    retryQueue: cloneSerialisable(state.retryQueue) || [],
    misconceptions: cloneSerialisable(state.misconceptions) || {},
    recentAttempts: cloneSerialisable(state.recentAttempts) || [],
  };
}

function ensureNode(map, key) {
  if (!map[key]) map[key] = defaultMasteryNode();
  return map[key];
}

function updateNodeFromQuality(node, quality, nowTs) {
  node.attempts += 1;
  node.lastSeenAt = new Date(nowTs).toISOString();
  if (quality >= 4.8) {
    node.correct += 1;
    node.correctStreak += 1;
    node.strength = clamp(node.strength + 0.13, 0.05, 0.99);
    node.intervalDays = node.intervalDays ? Math.min(45, node.intervalDays * 2) : 1;
    node.dueAt = nowTs + node.intervalDays * 86400000;
  } else if (quality >= 4) {
    node.correct += 1;
    node.correctStreak += 1;
    node.strength = clamp(node.strength + 0.09, 0.05, 0.98);
    node.intervalDays = node.intervalDays ? Math.min(28, node.intervalDays * 1.7) : 1;
    node.dueAt = nowTs + node.intervalDays * 86400000;
  } else if (quality >= 3) {
    node.correct += 1;
    node.correctStreak = Math.max(1, node.correctStreak);
    node.strength = clamp(node.strength + 0.04, 0.05, 0.95);
    node.intervalDays = node.intervalDays ? Math.max(0.25, node.intervalDays * 0.9) : 0.25;
    node.dueAt = nowTs + Math.max(6 * 3600000, node.intervalDays * 86400000);
  } else {
    node.wrong += 1;
    node.correctStreak = 0;
    node.strength = clamp(node.strength - (quality > 0 ? 0.08 : 0.15), 0.02, 0.95);
    node.intervalDays = Math.max(0.04, (node.intervalDays || 0.2) * 0.45);
    node.dueAt = nowTs + (quality > 0 ? 20 : 12) * 60000;
    node.lastWrongAt = new Date(nowTs).toISOString();
  }
}

function answerQuality(result, attempt = {}) {
  const attempts = Math.max(1, Number(attempt.attempts) || 1);
  const support = Math.max(0, Number(attempt.supportLevel) || 0);
  if (result.correct) {
    if (support >= 2) return 3;
    if (support === 1) return attempts === 1 ? 3.4 : 3;
    if (attempts === 1) return 5;
    if (attempts === 2) return 3.6;
    return 3.2;
  }
  if (Number(result.score) > 0) return 1.5;
  return 0;
}

function bumpMisconception(state, tag, nowTs) {
  if (!tag) return;
  const current = isPlainObject(state.misconceptions[tag]) ? state.misconceptions[tag] : { count: 0, lastSeenAt: null };
  state.misconceptions[tag] = {
    count: (Number(current.count) || 0) + 1,
    lastSeenAt: new Date(nowTs).toISOString(),
  };
}

function enqueueRetry(state, item, result, nowTs) {
  const dueAt = nowTs + (result.correct ? 6 * 3600000 : 15 * 60000);
  const key = `${item.templateId}::${item.seed}`;
  const existing = state.retryQueue.find((entry) => `${entry.templateId}::${entry.seed}` === key);
  if (existing) {
    existing.dueAt = Math.min(Number(existing.dueAt) || dueAt, dueAt);
    existing.conceptIds = Array.from(new Set([...(existing.conceptIds || []), ...(item.skillIds || [])]));
    if (!result.correct) existing.reason = 'recent-miss';
  } else {
    state.retryQueue.push({
      templateId: item.templateId,
      seed: item.seed,
      dueAt,
      conceptIds: (item.skillIds || []).slice(),
      reason: result.correct ? 'supported-or-shaky' : 'recent-miss',
    });
  }
  state.retryQueue = state.retryQueue
    .filter((entry) => entry && entry.templateId)
    .sort((a, b) => Number(a.dueAt) - Number(b.dueAt))
    .slice(0, 120);
}

function templateFits(template, { mode, focusConceptId } = {}) {
  if (!template) return false;
  if (mode === 'satsset' && !template.satsFriendly) return false;
  if (focusConceptId && !(template.skillIds || []).includes(focusConceptId)) return false;
  return true;
}

function weightedTemplatePick(state, { mode, focusConceptId, seed, nowTs = Date.now() }) {
  const rng = seededRandom(seed);
  const candidates = GRAMMAR_TEMPLATE_METADATA.filter((template) => templateFits(template, { mode, focusConceptId }));
  const pool = candidates.length ? candidates : GRAMMAR_TEMPLATE_METADATA;
  const weighted = pool.map((template) => {
    const conceptNodes = template.skillIds.map((id) => state.mastery.concepts[id] || defaultMasteryNode());
    const averageStrength = conceptNodes.reduce((sum, node) => sum + (Number(node.strength) || 0.25), 0) / Math.max(1, conceptNodes.length);
    const statuses = conceptNodes.map((node) => grammarConceptStatus(node, nowTs));
    let weight = 1 + (1 - averageStrength) * 4;
    if (statuses.includes('new')) weight += 1.5;
    if (statuses.includes('weak')) weight += 2;
    if (statuses.includes('due')) weight += 1.4;
    if (focusConceptId && template.skillIds.includes(focusConceptId)) weight *= 1.8;
    if (template.generative) weight *= 1.15;
    return [template, Math.max(0.05, weight)];
  });
  let roll = rng() * weighted.reduce((sum, item) => sum + item[1], 0);
  for (const [template, weight] of weighted) {
    roll -= weight;
    if (roll <= 0) return grammarTemplateById(template.id);
  }
  return grammarTemplateById(weighted.at(-1)?.[0]?.id || GRAMMAR_TEMPLATE_METADATA[0].id);
}

function takeDueRetry(state, { mode, focusConceptId, nowTs }) {
  const index = state.retryQueue.findIndex((entry) => {
    if (Number(entry.dueAt) > nowTs) return false;
    const template = grammarTemplateById(entry.templateId);
    return templateFits(template, { mode, focusConceptId });
  });
  if (index < 0) return null;
  return state.retryQueue.splice(index, 1)[0] || null;
}

function itemFromTemplate(template, seed) {
  const question = createGrammarQuestion({ templateId: template.id, seed });
  if (!question) {
    throw new NotFoundError('Grammar template is not available.', {
      code: 'grammar_template_not_found',
      subjectId: SUBJECT_ID,
      templateId: template.id,
    });
  }
  return serialiseGrammarQuestion(question);
}

function nextItem(state, { mode, focusConceptId, seed, templateId = '', nowTs = Date.now() } = {}) {
  if (templateId) {
    const template = grammarTemplateById(templateId);
    if (!template) {
      throw new NotFoundError('Grammar template is not available.', {
        code: 'grammar_template_not_found',
        subjectId: SUBJECT_ID,
        templateId,
      });
    }
    return itemFromTemplate(template, seed);
  }
  const retry = takeDueRetry(state, { mode, focusConceptId, nowTs });
  if (retry) return itemFromTemplate(grammarTemplateById(retry.templateId), retry.seed);
  return itemFromTemplate(weightedTemplatePick(state, { mode, focusConceptId, seed, nowTs }), seed);
}

function normaliseMode(value) {
  const mode = String(value || 'smart').trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (mode === 'mini-set' || mode === 'mini' || mode === 'test') return 'satsset';
  return mode || 'smart';
}

function supportedModeOrThrow(mode) {
  if (ENABLED_MODES.has(mode)) return mode;
  throw new BadRequestError('This Grammar mode is not enabled yet.', {
    code: 'grammar_mode_unsupported',
    subjectId: SUBJECT_ID,
    mode,
  });
}

function roundLengthFor(mode, payload = {}, prefs = {}) {
  const fallback = mode === 'satsset' ? DEFAULT_MINI_SET_LENGTH : DEFAULT_ROUND_LENGTH;
  const raw = Number(payload.length ?? payload.roundLength ?? prefs.roundLength ?? fallback);
  return clamp(Number.isFinite(raw) ? Math.floor(raw) : fallback, 1, mode === 'satsset' ? 20 : 15);
}

function serverSessionId(learnerId, { requestId = '', nowTs, baseSeed, mode, focusConceptId = '' }) {
  const discriminator = stableHash(`${learnerId}:${requestId}:${nowTs}:${baseSeed}:${mode}:${focusConceptId}`);
  return `grammar-${nowTs}-${discriminator}`;
}

function buildActiveRecord(learnerId, state, nowTs) {
  if (!state.session || !['session', 'feedback'].includes(state.phase)) return null;
  return normalisePracticeSessionRecord({
    id: state.session.id,
    learnerId,
    subjectId: SUBJECT_ID,
    sessionKind: state.session.mode,
    status: 'active',
    sessionState: cloneSerialisable(state.session),
    summary: null,
    createdAt: state.session.startedAt || nowTs,
    updatedAt: nowTs,
  });
}

function buildCompletedRecord(learnerId, state, latestSession, nowTs) {
  if (state.phase !== 'summary' || !state.summary) return null;
  return normalisePracticeSessionRecord({
    id: state.summary.sessionId || latestSession?.id || `grammar-${nowTs}`,
    learnerId,
    subjectId: SUBJECT_ID,
    sessionKind: state.summary.mode || latestSession?.sessionKind || 'smart',
    status: 'completed',
    sessionState: null,
    summary: cloneSerialisable(state.summary),
    createdAt: latestSession?.createdAt || state.summary.startedAt || nowTs,
    updatedAt: nowTs,
  });
}

function practiceSessionRecord(learnerId, state, latestSession, nowTs) {
  return buildActiveRecord(learnerId, state, nowTs) || buildCompletedRecord(learnerId, state, latestSession, nowTs);
}

function miniSetSeeds(baseSeed, size) {
  return Array.from({ length: size }, (_, index) => (baseSeed + index * 104729) >>> 0);
}

export function buildGrammarMiniSet({ size = DEFAULT_MINI_SET_LENGTH, focusConceptId = '', seed = 1 } = {}) {
  const length = clamp(Math.floor(Number(size) || DEFAULT_MINI_SET_LENGTH), 1, 20);
  const state = createInitialGrammarState();
  return miniSetSeeds(Number(seed) || 1, length).map((itemSeed, index) => {
    const template = weightedTemplatePick(state, {
      mode: 'satsset',
      focusConceptId,
      seed: itemSeed + index,
    });
    return itemFromTemplate(template, itemSeed + index);
  });
}

function startSession(state, payload, nowTs, learnerId) {
  const mode = supportedModeOrThrow(normaliseMode(payload.mode || state.prefs.mode));
  const focusConceptId = typeof payload.focusConceptId === 'string'
    ? payload.focusConceptId
    : (typeof payload.skillId === 'string' ? payload.skillId : state.prefs.focusConceptId || '');
  if (focusConceptId && !GRAMMAR_CONCEPTS.some((concept) => concept.id === focusConceptId)) {
    throw new BadRequestError('Grammar concept is not available.', {
      code: 'grammar_concept_not_found',
      subjectId: SUBJECT_ID,
      conceptId: focusConceptId,
    });
  }
  const roundLength = roundLengthFor(mode, payload, state.prefs);
  const baseSeed = Number.isFinite(Number(payload.seed))
    ? Number(payload.seed)
    : stableHash(`${payload.requestId || ''}:${nowTs}:${focusConceptId}:${mode}`);
  const sessionId = serverSessionId(learnerId, {
    requestId: payload.requestId,
    nowTs,
    baseSeed,
    mode,
    focusConceptId,
  });
  const firstItem = nextItem(state, {
    mode,
    focusConceptId,
    seed: baseSeed,
    nowTs,
    templateId: typeof payload.templateId === 'string' ? payload.templateId : '',
  });
  state.phase = 'session';
  state.awaitingAdvance = false;
  state.feedback = null;
  state.summary = null;
  state.error = '';
  state.prefs = {
    ...state.prefs,
    mode,
    roundLength,
    focusConceptId,
  };
  state.session = {
    id: sessionId,
    type: mode === 'satsset' ? 'mini-set' : 'practice',
    mode,
    focusConceptId,
    startedAt: nowTs,
    targetCount: roundLength,
    answered: 0,
    correct: 0,
    totalScore: 0,
    totalMarks: 0,
    seed: baseSeed,
    currentIndex: 0,
    currentItem: firstItem,
    attemptsForCurrent: 0,
    supportLevel: 0,
    serverAuthority: SERVER_AUTHORITY,
  };
  return [];
}

function completionSummary(state, nowTs) {
  const session = state.session || {};
  return {
    sessionId: session.id || `grammar-${nowTs}`,
    mode: session.mode || 'smart',
    startedAt: session.startedAt || nowTs,
    completedAt: nowTs,
    answered: Number(session.answered) || 0,
    correct: Number(session.correct) || 0,
    totalScore: Number(session.totalScore) || 0,
    totalMarks: Number(session.totalMarks) || 0,
    targetCount: Number(session.targetCount) || 0,
  };
}

function completeSession(state, nowTs, command) {
  if (!state.session || !['session', 'feedback'].includes(state.phase)) {
    throw new BadRequestError('This Grammar session is no longer active.', {
      code: 'grammar_session_stale',
      subjectId: SUBJECT_ID,
    });
  }
  const summary = completionSummary(state, nowTs);
  state.phase = 'summary';
  state.awaitingAdvance = false;
  state.summary = summary;
  state.feedback = null;
  const event = {
    id: `grammar.session.${summary.sessionId}.${command.requestId || nowTs}`,
    type: 'grammar.session-completed',
    subjectId: SUBJECT_ID,
    learnerId: command.learnerId,
    sessionId: summary.sessionId,
    mode: summary.mode,
    answered: summary.answered,
    correct: summary.correct,
    totalScore: summary.totalScore,
    totalMarks: summary.totalMarks,
    createdAt: nowTs,
  };
  state.session = null;
  return [event];
}

function continueSession(state, nowTs) {
  const session = state.session;
  if (!session || !['session', 'feedback'].includes(state.phase)) {
    throw new BadRequestError('This Grammar session is no longer active.', {
      code: 'grammar_session_stale',
      subjectId: SUBJECT_ID,
    });
  }
  if (!state.awaitingAdvance) {
    throw new BadRequestError('This Grammar item is not awaiting the next question.', {
      code: 'grammar_advance_not_ready',
      subjectId: SUBJECT_ID,
    });
  }
  if (session.answered >= session.targetCount) return null;
  const nextIndex = session.currentIndex + 1;
  const itemSeed = (Number(session.seed) + nextIndex * 104729) >>> 0;
  session.currentIndex = nextIndex;
  session.currentItem = nextItem(state, {
    mode: session.mode,
    focusConceptId: session.focusConceptId,
    seed: itemSeed,
    nowTs,
  });
  session.attemptsForCurrent = 0;
  session.supportLevel = 0;
  state.phase = 'session';
  state.awaitingAdvance = false;
  state.feedback = null;
  return [];
}

export function applyGrammarAttemptToState(state, {
  learnerId = '',
  item,
  response = {},
  supportLevel = 0,
  attempts = 1,
  requestId = 'attempt',
  now = Date.now(),
} = {}) {
  if (!item || item.contentReleaseId !== GRAMMAR_CONTENT_RELEASE_ID) {
    throw new BadRequestError('Grammar content release does not match this attempt.', {
      code: 'grammar_content_release_mismatch',
      subjectId: SUBJECT_ID,
      expected: GRAMMAR_CONTENT_RELEASE_ID,
      actual: item?.contentReleaseId || null,
    });
  }
  const question = createGrammarQuestion({ templateId: item.templateId, seed: item.seed });
  if (!question) {
    throw new NotFoundError('Grammar template is not available.', {
      code: 'grammar_template_not_found',
      subjectId: SUBJECT_ID,
      templateId: item.templateId,
    });
  }
  const result = evaluateGrammarQuestion(question, response);
  if (!result) {
    throw new BadRequestError('Grammar answer could not be marked.', {
      code: 'grammar_answer_invalid',
      subjectId: SUBJECT_ID,
    });
  }
  const nowTs = timestamp(now);
  const quality = answerQuality(result, { supportLevel, attempts });
  const conceptIds = (question.skillIds || []).slice();
  const statusesBefore = new Map(conceptIds.map((conceptId) => [
    conceptId,
    grammarConceptStatus(state.mastery.concepts[conceptId] || defaultMasteryNode(), nowTs),
  ]));

  for (const conceptId of conceptIds) {
    updateNodeFromQuality(ensureNode(state.mastery.concepts, conceptId), quality, nowTs);
  }
  updateNodeFromQuality(ensureNode(state.mastery.templates, question.templateId), quality, nowTs);
  updateNodeFromQuality(ensureNode(state.mastery.questionTypes, question.questionType), quality, nowTs);
  updateNodeFromQuality(ensureNode(state.mastery.items, question.itemId), quality, nowTs);

  if (result.misconception) bumpMisconception(state, result.misconception, nowTs);
  if (!result.correct || quality < 4) enqueueRetry(state, serialiseGrammarQuestion(question), result, nowTs);

  const attempt = {
    contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
    templateId: question.templateId,
    itemId: question.itemId,
    seed: question.seed,
    questionType: question.questionType,
    conceptIds,
    response: cloneSerialisable(response) || {},
    result: cloneSerialisable(result) || {},
    supportLevel,
    attempts,
    createdAt: nowTs,
  };
  state.recentAttempts = [...(state.recentAttempts || []), attempt].slice(-80);

  const events = [{
    id: `grammar.answer.${learnerId || 'learner'}.${requestId}.${question.itemId}`,
    type: 'grammar.answer-submitted',
    subjectId: SUBJECT_ID,
    learnerId,
    templateId: question.templateId,
    itemId: question.itemId,
    seed: question.seed,
    questionType: question.questionType,
    conceptIds,
    score: result.score,
    maxScore: result.maxScore,
    correct: Boolean(result.correct),
    misconception: result.misconception || null,
    supportLevel,
    attempts,
    createdAt: nowTs,
  }];
  if (result.misconception) {
    events.push({
      id: `grammar.misconception.${learnerId || 'learner'}.${requestId}.${question.itemId}`,
      type: 'grammar.misconception-seen',
      subjectId: SUBJECT_ID,
      learnerId,
      misconception: result.misconception,
      conceptIds,
      createdAt: nowTs,
    });
  }
  for (const conceptId of conceptIds) {
    const after = grammarConceptStatus(state.mastery.concepts[conceptId], nowTs);
    if (statusesBefore.get(conceptId) !== 'secured' && after === 'secured') {
      events.push({
        id: `grammar.secured.${learnerId || 'learner'}.${conceptId}.${requestId}`,
        type: 'grammar.concept-secured',
        subjectId: SUBJECT_ID,
        learnerId,
        conceptId,
        templateId: question.templateId,
        itemId: question.itemId,
        createdAt: nowTs,
      });
    }
  }
  return { result, quality, events, attempt };
}

function submitAnswer(state, payload, command, nowTs) {
  const session = state.session;
  if (!session || !session.currentItem || !['session', 'feedback'].includes(state.phase)) {
    throw new BadRequestError('This Grammar session is no longer active.', {
      code: 'grammar_session_stale',
      subjectId: SUBJECT_ID,
    });
  }
  if (state.awaitingAdvance) {
    throw new BadRequestError('This Grammar item is already awaiting the next question.', {
      code: 'grammar_session_stale',
      subjectId: SUBJECT_ID,
    });
  }
  const response = isPlainObject(payload.response) ? payload.response : (isPlainObject(payload.answer) ? payload.answer : { answer: payload.answer ?? '' });
  session.attemptsForCurrent = Number(session.attemptsForCurrent || 0) + 1;
  const applied = applyGrammarAttemptToState(state, {
    learnerId: command.learnerId,
    item: session.currentItem,
    response,
    supportLevel: Number(payload.supportLevel ?? session.supportLevel) || 0,
    attempts: session.attemptsForCurrent,
    requestId: command.requestId,
    now: nowTs,
  });
  session.answered += 1;
  session.correct += applied.result.correct ? 1 : 0;
  session.totalScore += Number(applied.result.score) || 0;
  session.totalMarks += Number(applied.result.maxScore) || Number(session.currentItem.marks) || 1;
  state.phase = 'feedback';
  state.awaitingAdvance = true;
  state.feedback = {
    itemId: session.currentItem.itemId,
    templateId: session.currentItem.templateId,
    result: cloneSerialisable(applied.result),
    response: cloneSerialisable(response) || {},
    canContinue: session.answered < session.targetCount,
  };
  return applied.events;
}

function savePrefs(state, payload) {
  const prefs = isPlainObject(payload.prefs) ? payload.prefs : payload;
  const nextMode = prefs.mode ? normaliseMode(prefs.mode) : state.prefs.mode;
  state.prefs = {
    ...state.prefs,
    mode: ENABLED_MODES.has(nextMode) ? nextMode : state.prefs.mode,
    roundLength: roundLengthFor(nextMode, prefs, state.prefs),
    focusConceptId: typeof prefs.focusConceptId === 'string' ? prefs.focusConceptId : state.prefs.focusConceptId,
  };
  return [];
}

function transition(state, { events = [], changed = true } = {}) {
  return {
    ok: true,
    changed,
    state,
    data: stateData(state),
    events,
  };
}

export function createServerGrammarEngine({ now = Date.now } = {}) {
  const clock = () => timestamp(now);

  return {
    apply({
      learnerId,
      subjectRecord = {},
      latestSession = null,
      command,
      payload = {},
      requestId = '',
    } = {}) {
      if (!(typeof learnerId === 'string' && learnerId)) {
        throw new BadRequestError('Learner id is required for Grammar commands.', {
          code: 'learner_id_required',
          subjectId: SUBJECT_ID,
        });
      }
      const nowTs = clock();
      let state = normaliseGrammarState(subjectRecord.ui, subjectRecord.data);
      const rawUiWasServerOwned = !subjectRecord.ui
        || subjectRecord.ui?.serverAuthority === SERVER_AUTHORITY
        || subjectRecord.ui?.session?.serverAuthority === SERVER_AUTHORITY;
      const commandContext = { learnerId, requestId };
      let events = [];

      if (command === 'start-session') {
        events = startSession(state, { ...payload, requestId }, nowTs, learnerId);
      } else if (state.phase === 'session' && !rawUiWasServerOwned) {
        throw new BadRequestError('This Grammar session is no longer active on the server.', {
          code: 'grammar_session_stale',
          subjectId: SUBJECT_ID,
          command,
        });
      } else if (command === 'submit-answer') {
        events = submitAnswer(state, payload, commandContext, nowTs);
      } else if (command === 'continue-session') {
        events = continueSession(state, nowTs) ?? completeSession(state, nowTs, commandContext);
      } else if (command === 'end-session') {
        events = completeSession(state, nowTs, commandContext);
      } else if (command === 'save-prefs') {
        events = savePrefs(state, payload);
      } else if (command === 'reset-learner') {
        state = createInitialGrammarState();
      } else {
        throw new BadRequestError('Unsupported Grammar command.', {
          code: 'grammar_command_unsupported',
          subjectId: SUBJECT_ID,
          command,
        });
      }

      state.serverAuthority = SERVER_AUTHORITY;
      if (state.session) state.session.serverAuthority = SERVER_AUTHORITY;
      return {
        ...transition(state, { events }),
        practiceSession: practiceSessionRecord(learnerId, state, latestSession, nowTs),
      };
    },
  };
}

export {
  ENABLED_MODES as GRAMMAR_ENABLED_MODES,
  LOCKED_MODES as GRAMMAR_LOCKED_MODES,
  SERVER_AUTHORITY as GRAMMAR_SERVER_AUTHORITY,
};
