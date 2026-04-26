import {
  cloneSerialisable,
  normalisePracticeSessionRecord,
} from '../../../../src/platform/core/repositories/helpers.js';
import { grammarConceptStatus } from '../../../../shared/grammar/confidence.js';
import { BadRequestError, NotFoundError } from '../../errors.js';
import { compileGrammarAiEnrichment } from './ai-enrichment.js';
import {
  composeAttemptSupport,
  deriveAttemptSupport,
  normaliseStoredAttempt,
  SUPPORT_CONTRACT_VERSION,
  supportLevelForSessionWithContract,
} from './attempt-support.js';
import {
  createGrammarQuestion,
  evaluateGrammarQuestion,
  GRAMMAR_CONCEPTS,
  GRAMMAR_CONTENT_RELEASE_ID,
  GRAMMAR_TEMPLATE_METADATA,
  grammarTemplateById,
  serialiseGrammarQuestion,
} from './content.js';
import {
  buildGrammarMiniPack,
  buildGrammarPracticeQueue,
} from './selection.js';
import {
  GRAMMAR_TRANSFER_HISTORY_PER_PROMPT,
  GRAMMAR_TRANSFER_MAX_PROMPTS,
  GRAMMAR_TRANSFER_WRITING_CAP,
  GRAMMAR_TRANSFER_CHECKLIST_CAP,
  grammarTransferPromptById,
} from './transfer-prompts.js';

const SUBJECT_ID = 'grammar';
const SERVER_AUTHORITY = 'worker';
const DEFAULT_ROUND_LENGTH = 5;
const DEFAULT_MINI_SET_LENGTH = 8;
const DEFAULT_GOAL_TYPE = 'questions';
const TIMED_GOAL_LIMIT_MS = 10 * 60000;
const CLEAR_DUE_GOAL_CAP = 15;
const DEFAULT_SPEECH_RATE = 1;
const MIN_SPEECH_RATE = 0.6;
const MAX_SPEECH_RATE = 1.4;
const MINI_SET_LENGTHS = Object.freeze([8, 12]);
const MINI_SET_MIN_TIME_LIMIT_MS = 6 * 60000;
const MINI_SET_MS_PER_MARK = 54000;
const SHORT_RESPONSE_TEXT_LIMIT = 512;
const LONG_RESPONSE_TEXT_LIMIT = 2000;
const LIST_RESPONSE_LIMIT = 40;
const ENABLED_MODES = new Set(['learn', 'smart', 'satsset', 'trouble', 'surgery', 'builder', 'worked', 'faded']);
const LOCKED_MODES = Object.freeze([]);
const NO_STORED_FOCUS_MODES = new Set(['trouble', 'surgery', 'builder']);
const NO_SESSION_FOCUS_MODES = new Set(['surgery', 'builder']);
const GRAMMAR_CONCEPT_IDS = new Set(GRAMMAR_CONCEPTS.map((concept) => concept.id));
const GOAL_TYPES = new Set(['questions', 'timed', 'due']);

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

function normaliseSpeechRate(value, fallback = DEFAULT_SPEECH_RATE) {
  const numeric = Number(value);
  const base = Number.isFinite(numeric) ? numeric : Number(fallback);
  const safe = Number.isFinite(base) ? base : DEFAULT_SPEECH_RATE;
  return Math.round(clamp(safe, MIN_SPEECH_RATE, MAX_SPEECH_RATE) * 100) / 100;
}

function isGrammarConceptId(value) {
  return typeof value === 'string' && GRAMMAR_CONCEPT_IDS.has(value);
}

function normaliseStoredFocusConceptId(value) {
  return isGrammarConceptId(value) ? value : '';
}

function normaliseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(text)) return true;
    if (['false', '0', 'no', 'off'].includes(text)) return false;
  }
  if (typeof value === 'number') return value !== 0;
  return fallback;
}

function cappedString(value, limit = SHORT_RESPONSE_TEXT_LIMIT) {
  const text = value == null ? '' : String(value);
  return text.length > limit ? text.slice(0, limit) : text;
}

function safeAiText(value, limit = SHORT_RESPONSE_TEXT_LIMIT) {
  return cappedString(value, limit)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeAiTextList(value, limit = 4, textLimit = 180) {
  return (Array.isArray(value) ? value : [])
    .map((entry) => safeAiText(entry, textLimit))
    .filter(Boolean)
    .slice(0, limit);
}

function normalisePersistentAiEnrichment(raw) {
  if (!isPlainObject(raw)) return null;
  if (raw.kind !== 'parent-summary' || raw.status !== 'ready' || raw.nonScored === false) return null;
  const summary = isPlainObject(raw.parentSummary) ? raw.parentSummary : null;
  if (!summary) return null;
  const title = safeAiText(summary.title || 'Parent summary draft', 90);
  const body = safeAiText(summary.body || summary.summary, 520);
  const nextSteps = safeAiTextList(summary.nextSteps, 4, 160);
  if (!body && !title && !nextSteps.length) return null;
  const output = {
    kind: 'parent-summary',
    status: 'ready',
    nonScored: true,
    generatedAt: timestamp(raw.generatedAt || 0),
    parentSummary: {
      title: title || 'Parent summary draft',
      body,
      nextSteps,
    },
  };
  if (raw.source === 'server-validated-ai') output.source = raw.source;
  if (isPlainObject(raw.concept)) {
    output.concept = {
      id: safeAiText(raw.concept.id, 80),
      name: safeAiText(raw.concept.name, 120),
      domain: safeAiText(raw.concept.domain, 80),
    };
  }
  const notices = safeAiTextList(raw.notices, 4, 180);
  if (notices.length) output.notices = notices;
  return output;
}

function optionValue(option) {
  if (Array.isArray(option)) return cappedString(option[0]);
  if (isPlainObject(option)) return cappedString(option.value);
  return cappedString(option);
}

function optionValueSet(options) {
  return new Set(Array.isArray(options) ? options.map(optionValue) : []);
}

function normaliseChoiceValue(value, allowedValues) {
  const text = cappedString(value);
  return allowedValues.size && !allowedValues.has(text) ? '' : text;
}

function normaliseSelectedValues(value, allowedValues) {
  if (!Array.isArray(value)) return [];
  const maxItems = Math.min(
    LIST_RESPONSE_LIMIT,
    allowedValues.size || LIST_RESPONSE_LIMIT,
  );
  const selected = [];
  const seen = new Set();
  for (const item of value.slice(0, LIST_RESPONSE_LIMIT * 2)) {
    const text = cappedString(item);
    if ((allowedValues.size && !allowedValues.has(text)) || seen.has(text)) continue;
    selected.push(text);
    seen.add(text);
    if (selected.length >= maxItems) break;
  }
  return selected;
}

function normaliseFieldResponse(field, value) {
  const allowedValues = optionValueSet(field?.options);
  if (allowedValues.size) return normaliseChoiceValue(value, allowedValues);
  return cappedString(value, field?.kind === 'textarea' ? LONG_RESPONSE_TEXT_LIMIT : SHORT_RESPONSE_TEXT_LIMIT);
}

function normaliseGrammarResponse(inputSpec, response) {
  const raw = isPlainObject(response) ? response : {};
  const spec = isPlainObject(inputSpec) ? inputSpec : {};

  if (spec.type === 'single_choice') {
    return { answer: normaliseChoiceValue(raw.answer, optionValueSet(spec.options)) };
  }

  if (spec.type === 'checkbox_list') {
    return { selected: normaliseSelectedValues(raw.selected, optionValueSet(spec.options)) };
  }

  if (spec.type === 'table_choice') {
    const allowedValues = optionValueSet(spec.columns);
    const output = {};
    for (const row of Array.isArray(spec.rows) ? spec.rows.slice(0, LIST_RESPONSE_LIMIT) : []) {
      const key = typeof row?.key === 'string' ? row.key : '';
      if (!key) continue;
      output[key] = normaliseChoiceValue(raw[key], allowedValues);
    }
    return output;
  }

  if (spec.type === 'multi') {
    const output = {};
    for (const field of Array.isArray(spec.fields) ? spec.fields.slice(0, LIST_RESPONSE_LIMIT) : []) {
      const key = typeof field?.key === 'string' ? field.key : '';
      if (!key) continue;
      output[key] = normaliseFieldResponse(field, raw[key]);
    }
    return output;
  }

  if (spec.type === 'text') {
    return { answer: cappedString(raw.answer, SHORT_RESPONSE_TEXT_LIMIT) };
  }

  return { answer: cappedString(raw.answer, LONG_RESPONSE_TEXT_LIMIT) };
}

function hasNormalisedResponseValue(value) {
  if (Array.isArray(value)) return value.some((entry) => String(entry || '').trim());
  return String(value ?? '').trim().length > 0;
}

function hasNormalisedGrammarResponse(response) {
  if (!isPlainObject(response)) return false;
  return Object.values(response).some((value) => hasNormalisedResponseValue(value));
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
  const prefs = isPlainObject(raw.prefs) ? cloneSerialisable(raw.prefs) : {};
  return {
    contentReleaseId: typeof raw.contentReleaseId === 'string' && raw.contentReleaseId
      ? raw.contentReleaseId
      : GRAMMAR_CONTENT_RELEASE_ID,
    prefs: {
      ...prefs,
      focusConceptId: normaliseStoredFocusConceptId(prefs.focusConceptId),
    },
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
    // Normalise older attempts on load so the U3 item-level fields
    // (firstAttemptIndependent / supportUsed / supportLevelAtScoring) are
    // always present downstream, even for pre-U3 stored state.
    recentAttempts: Array.isArray(raw.recentAttempts)
      ? raw.recentAttempts.slice(-80).map((entry) => normaliseStoredAttempt(cloneSerialisable(entry)))
      : [],
    // U7 non-scored transfer evidence. Stored per promptId with capped history.
    transferEvidence: isPlainObject(raw.transferEvidence) ? cloneSerialisable(raw.transferEvidence) : {},
    // U10 non-scored transfer archive. Admin-managed bucket that receives
    // entries displaced from `transferEvidence` via the admin HTTP routes.
    // Lazy-initialised to `{}` on first access so existing learners do not
    // need a migration write. Learner read-models strip this field; admin
    // read-models expose it under `transferLane.archive`.
    transferEvidenceArchive: isPlainObject(raw.transferEvidenceArchive)
      ? cloneSerialisable(raw.transferEvidenceArchive)
      : {},
    aiEnrichment: normalisePersistentAiEnrichment(raw.aiEnrichment),
  };
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
      goalType: normaliseGoalType(normalisedData.prefs.goalType),
      allowTeachingItems: normaliseBoolean(normalisedData.prefs.allowTeachingItems, false),
      showDomainBeforeAnswer: normaliseBoolean(normalisedData.prefs.showDomainBeforeAnswer, true),
      speechRate: normaliseSpeechRate(normalisedData.prefs.speechRate),
      // U10: additive learner pref for the "Hide from my list" toggle on
      // orphaned Writing Try entries. Defaults to an empty array so a
      // never-saved learner never surfaces the pref through read-models
      // unless they explicitly hide an orphan.
      transferHiddenPromptIds: normaliseTransferHiddenPromptIds(
        normalisedData.prefs.transferHiddenPromptIds,
        [],
      ),
    },
    mastery: normalisedData.mastery,
    retryQueue: normalisedData.retryQueue,
    misconceptions: normalisedData.misconceptions,
    recentAttempts: normalisedData.recentAttempts,
    transferEvidence: normalisedData.transferEvidence || {},
    transferEvidenceArchive: normalisedData.transferEvidenceArchive || {},
    aiEnrichment: normalisedData.aiEnrichment,
    session: null,
    feedback: null,
    summary: null,
    error: '',
  };
}

function normaliseGrammarState(rawState, data = {}) {
  const fallback = createInitialGrammarState(data);
  if (!isPlainObject(rawState)) return fallback;
  const rawPrefs = isPlainObject(rawState.prefs) ? cloneSerialisable(rawState.prefs) : {};
  const normalisedData = normaliseServerGrammarData({
    ...data,
    prefs: rawState.prefs || data.prefs,
    mastery: rawState.mastery || data.mastery,
    retryQueue: rawState.retryQueue || data.retryQueue,
    misconceptions: rawState.misconceptions || data.misconceptions,
    recentAttempts: rawState.recentAttempts || data.recentAttempts,
    transferEvidence: rawState.transferEvidence || data.transferEvidence,
    transferEvidenceArchive: rawState.transferEvidenceArchive || data.transferEvidenceArchive,
    aiEnrichment: rawState.aiEnrichment || data.aiEnrichment,
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
      ...rawPrefs,
      goalType: normaliseGoalType(rawPrefs.goalType || fallback.prefs.goalType),
      allowTeachingItems: normaliseBoolean(rawPrefs.allowTeachingItems, fallback.prefs.allowTeachingItems),
      showDomainBeforeAnswer: normaliseBoolean(rawPrefs.showDomainBeforeAnswer, fallback.prefs.showDomainBeforeAnswer),
      speechRate: normaliseSpeechRate(rawPrefs.speechRate, fallback.prefs.speechRate),
      focusConceptId: Object.prototype.hasOwnProperty.call(rawPrefs, 'focusConceptId')
        ? normaliseStoredFocusConceptId(rawPrefs.focusConceptId)
        : fallback.prefs.focusConceptId,
      // U10: the hidden-prompt list must round-trip through the normaliser
      // so a stale state missing the field never crashes prefs consumers.
      transferHiddenPromptIds: normaliseTransferHiddenPromptIds(
        Object.prototype.hasOwnProperty.call(rawPrefs, 'transferHiddenPromptIds')
          ? rawPrefs.transferHiddenPromptIds
          : fallback.prefs.transferHiddenPromptIds,
        fallback.prefs.transferHiddenPromptIds,
      ),
    },
    mastery: normalisedData.mastery,
    retryQueue: normalisedData.retryQueue,
    misconceptions: normalisedData.misconceptions,
    recentAttempts: normalisedData.recentAttempts,
    transferEvidence: normalisedData.transferEvidence || {},
    transferEvidenceArchive: normalisedData.transferEvidenceArchive || {},
    aiEnrichment: normalisedData.aiEnrichment,
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
    // transferEvidence is included conditionally to keep the persisted payload
    // compact for learners who have not touched the non-scored transfer lane.
    // On reload, normaliseServerGrammarData defaults the slot back to {}, so
    // the asymmetry with always-written slots (retryQueue, misconceptions) is
    // cosmetic only.
    ...(isPlainObject(state.transferEvidence) && Object.keys(state.transferEvidence).length
      ? { transferEvidence: cloneSerialisable(state.transferEvidence) }
      : {}),
    // U10: transferEvidenceArchive is only emitted when non-empty so the
    // persisted payload stays compact for the typical learner who never
    // has an admin action taken against their Writing Try lane. Identical
    // asymmetry to `transferEvidence` above.
    ...(isPlainObject(state.transferEvidenceArchive) && Object.keys(state.transferEvidenceArchive).length
      ? { transferEvidenceArchive: cloneSerialisable(state.transferEvidenceArchive) }
      : {}),
    ...(state.aiEnrichment ? { aiEnrichment: cloneSerialisable(state.aiEnrichment) } : {}),
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

function supportLevelForMode(mode) {
  if (mode === 'worked') return 2;
  if (mode === 'faded') return 1;
  return 0;
}

function supportLevelForSession(mode, prefs = {}, session = null) {
  // Under contract v2 (the new default) Smart + allowTeachingItems no longer
  // forces session support level 1. Sessions started before U3 shipped keep
  // contract v1 semantics via their stamped `supportContractVersion` so that
  // mid-flight submissions honour the contract their UI opened under.
  const contractVersion = (session && Number(session.supportContractVersion))
    || SUPPORT_CONTRACT_VERSION;
  return supportLevelForSessionWithContract({ mode, prefs, contractVersion });
}

function sessionTypeForMode(mode) {
  if (mode === 'satsset') return 'mini-set';
  if (mode === 'trouble') return 'trouble-drill';
  if (mode === 'surgery') return 'sentence-surgery';
  if (mode === 'builder') return 'sentence-builder';
  if (mode === 'worked') return 'worked-example';
  if (mode === 'faded') return 'faded-guidance';
  return 'practice';
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

function templateFitsMode(template, mode) {
  if (!template) return false;
  if (mode === 'satsset' && !template.satsFriendly) return false;
  if (mode === 'surgery' && !(template.tags || []).includes('surgery')) return false;
  if (mode === 'builder' && !(template.tags || []).includes('builder')) return false;
  return true;
}

function templateFits(template, { mode, focusConceptId } = {}) {
  if (!templateFitsMode(template, mode)) return false;
  if (focusConceptId && !(template.skillIds || []).includes(focusConceptId)) return false;
  return true;
}

function weightedTemplatePick(state, { mode, focusConceptId, seed, nowTs = Date.now() }) {
  const [entry] = buildGrammarPracticeQueue({
    mode,
    focusConceptId,
    mastery: state.mastery,
    recentAttempts: state.recentAttempts || [],
    seed,
    size: 1,
    now: nowTs,
  });
  if (!entry) return grammarTemplateById(GRAMMAR_TEMPLATE_METADATA[0].id);
  return grammarTemplateById(entry.templateId);
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
    if (!templateFits(template, { mode, focusConceptId })) {
      throw new BadRequestError('Grammar template is not available for this Grammar mode or focus concept.', {
        code: 'grammar_template_unavailable_for_mode',
        subjectId: SUBJECT_ID,
        mode,
        focusConceptId,
        templateId,
      });
    }
    return itemFromTemplate(template, seed);
  }
  const retry = takeDueRetry(state, { mode, focusConceptId, nowTs });
  if (retry) return itemFromTemplate(grammarTemplateById(retry.templateId), retry.seed);
  return itemFromTemplate(weightedTemplatePick(state, { mode, focusConceptId, seed, nowTs }), seed);
}

function weakestConceptIdForTrouble(state, nowTs) {
  return GRAMMAR_CONCEPTS
    .map((concept) => {
      const node = state.mastery.concepts[concept.id] || defaultMasteryNode();
      return {
        id: concept.id,
        node,
        status: grammarConceptStatus(node, nowTs),
      };
    })
    .filter((entry) => entry.status === 'weak')
    .sort((a, b) => {
      const wrongDelta = (Number(b.node.wrong) || 0) - (Number(a.node.wrong) || 0);
      if (wrongDelta) return wrongDelta;
      const strengthDelta = (Number(a.node.strength) || 0.25) - (Number(b.node.strength) || 0.25);
      if (strengthDelta) return strengthDelta;
      return String(a.id).localeCompare(String(b.id));
    })[0]?.id || '';
}

function normaliseMode(value) {
  const mode = String(value || 'smart').trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (mode === 'mini-set' || mode === 'mini' || mode === 'test') return 'satsset';
  if (mode === 'sentence-surgery') return 'surgery';
  if (mode === 'sentence-builder') return 'builder';
  if (mode === 'worked-example' || mode === 'worked-examples') return 'worked';
  if (mode === 'faded-support' || mode === 'faded-guidance') return 'faded';
  return mode || 'smart';
}

function normaliseGoalType(value) {
  const goal = String(value || DEFAULT_GOAL_TYPE).trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (goal === '10m' || goal === '10-minutes' || goal === 'time' || goal === 'timed-practice') return 'timed';
  if (goal === '15q' || goal === 'fixed' || goal === 'fixed-questions' || goal === 'question-count') return 'questions';
  if (goal === 'clear-due' || goal === 'due-review') return 'due';
  return GOAL_TYPES.has(goal) ? goal : DEFAULT_GOAL_TYPE;
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
  if (mode === 'satsset') return miniSetSizeFor(payload, prefs);
  const fallback = mode === 'satsset' ? DEFAULT_MINI_SET_LENGTH : DEFAULT_ROUND_LENGTH;
  const raw = Number(payload.length ?? payload.roundLength ?? prefs.roundLength ?? fallback);
  return clamp(Number.isFinite(raw) ? Math.floor(raw) : fallback, 1, mode === 'satsset' ? 20 : 15);
}

function miniSetSizeFor(payload = {}, prefs = {}) {
  const raw = Number(payload.setSize ?? payload.miniSetSize ?? payload.length ?? payload.roundLength ?? prefs.roundLength ?? DEFAULT_MINI_SET_LENGTH);
  const requested = Number.isFinite(raw) ? Math.floor(raw) : DEFAULT_MINI_SET_LENGTH;
  if (MINI_SET_LENGTHS.includes(requested)) return requested;
  return requested >= 10 ? 12 : 8;
}

function miniSetTimeLimitMs(items = []) {
  const totalMarks = (Array.isArray(items) ? items : [])
    .reduce((sum, item) => sum + (Number(item?.marks) || 1), 0);
  return Math.max(MINI_SET_MIN_TIME_LIMIT_MS, Math.round(totalMarks * MINI_SET_MS_PER_MARK));
}

function dueRetryCount(state, { mode, focusConceptId, nowTs }) {
  return (Array.isArray(state.retryQueue) ? state.retryQueue : []).filter((entry) => {
    if (Number(entry?.dueAt) > nowTs) return false;
    const template = grammarTemplateById(entry.templateId);
    return templateFits(template, { mode, focusConceptId });
  }).length;
}

function dueConceptCount(state, { focusConceptId, nowTs }) {
  return GRAMMAR_CONCEPTS.filter((concept) => {
    if (focusConceptId && concept.id !== focusConceptId) return false;
    const status = grammarConceptStatus(state.mastery.concepts[concept.id] || defaultMasteryNode(), nowTs);
    return status === 'due' || status === 'weak';
  }).length;
}

function clearDueReviewCount(state, { mode, focusConceptId, nowTs, fallback }) {
  const initialDueCount = dueRetryCount(state, { mode, focusConceptId, nowTs })
    + dueConceptCount(state, { focusConceptId, nowTs });
  return {
    initialDueCount,
    targetCount: clamp(initialDueCount || fallback, 1, CLEAR_DUE_GOAL_CAP),
  };
}

function sessionGoalFor(state, {
  mode,
  payload = {},
  prefs = {},
  roundLength,
  focusConceptId = '',
  nowTs,
} = {}) {
  const goalType = mode === 'satsset'
    ? 'questions'
    : normaliseGoalType(payload.goalType ?? payload.goal ?? prefs.goalType);
  if (goalType === 'timed') {
    const targetCount = clamp(Number(payload.targetCount ?? payload.roundLength ?? roundLength) || CLEAR_DUE_GOAL_CAP, 1, CLEAR_DUE_GOAL_CAP);
    return {
      type: 'timed',
      targetCount,
      startedAt: nowTs,
      timeLimitMs: TIMED_GOAL_LIMIT_MS,
      expiresAt: nowTs + TIMED_GOAL_LIMIT_MS,
    };
  }
  if (goalType === 'due') {
    const due = clearDueReviewCount(state, {
      mode,
      focusConceptId,
      nowTs,
      fallback: roundLength,
    });
    return {
      type: 'due',
      targetCount: due.targetCount,
      initialDueCount: due.initialDueCount,
      startedAt: nowTs,
    };
  }
  return {
    type: 'questions',
    targetCount: roundLength,
    startedAt: nowTs,
  };
}

function sessionGoalExpired(session, nowTs) {
  return session?.goal?.type === 'timed'
    && Number(session.goal.expiresAt) > 0
    && nowTs >= Number(session.goal.expiresAt);
}

function dueReviewAvailable(state, session, nowTs) {
  if (!session) return false;
  return dueRetryCount(state, {
    mode: session.mode,
    focusConceptId: session.focusConceptId,
    nowTs,
  }) > 0 || dueConceptCount(state, {
    focusConceptId: session.focusConceptId,
    nowTs,
  }) > 0;
}

function sessionReadyToComplete(state, session, nowTs) {
  if (!session) return false;
  if (sessionGoalExpired(session, nowTs)) return true;
  if (Number(session.answered) >= Number(session.targetCount)) return true;
  if (
    session.goal?.type === 'due'
    && Number(session.goal.initialDueCount) > 0
    && Number(session.answered) > 0
    && !dueReviewAvailable(state, session, nowTs)
  ) {
    return true;
  }
  return false;
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
  const pack = buildGrammarMiniPack({
    size: length,
    focusConceptId,
    mastery: null,
    recentAttempts: [],
    seed: Number(seed) || 1,
  });
  const seeds = miniSetSeeds(Number(seed) || 1, length);
  return pack.map((entry, index) => {
    const template = grammarTemplateById(entry.templateId);
    return itemFromTemplate(template, seeds[index] + index);
  });
}

function buildStrictMiniTestItems(state, { size, focusConceptId, seed, templateId = '', nowTs } = {}) {
  const length = miniSetSizeFor({ setSize: size });
  const seeds = miniSetSeeds(Number(seed) || 1, length);
  const pack = buildGrammarMiniPack({
    size: length,
    focusConceptId,
    mastery: state?.mastery || null,
    recentAttempts: state?.recentAttempts || [],
    seed: Number(seed) || 1,
    now: nowTs,
  });
  return pack.map((entry, index) => {
    if (index === 0 && templateId) {
      const template = grammarTemplateById(templateId);
      if (!template) {
        throw new NotFoundError('Grammar template is not available.', {
          code: 'grammar_template_not_found',
          subjectId: SUBJECT_ID,
          templateId,
        });
      }
      if (!templateFits(template, { mode: 'satsset', focusConceptId })) {
        throw new BadRequestError('Grammar template is not available for this Grammar mode or focus concept.', {
          code: 'grammar_template_unavailable_for_mode',
          subjectId: SUBJECT_ID,
          mode: 'satsset',
          focusConceptId,
          templateId,
        });
      }
      return itemFromTemplate(template, seeds[index] + index);
    }
    const template = grammarTemplateById(entry.templateId);
    return itemFromTemplate(template, seeds[index] + index);
  });
}

function miniTestQuestionEntries(items = []) {
  return items.map((item, index) => ({
    index,
    item,
    response: {},
    answered: false,
    marked: null,
    savedAt: null,
  }));
}

function startSession(state, payload, nowTs, learnerId) {
  const mode = supportedModeOrThrow(normaliseMode(payload.mode || state.prefs.mode));
  const templateId = typeof payload.templateId === 'string' ? payload.templateId : '';
  const hasPayloadFocusConcept = typeof payload.focusConceptId === 'string' || typeof payload.skillId === 'string';
  const requestedFocusConceptId = typeof payload.focusConceptId === 'string'
    ? payload.focusConceptId
    : (typeof payload.skillId === 'string' ? payload.skillId : '');
  const storedFocusConceptId = normaliseStoredFocusConceptId(state.prefs.focusConceptId);
  const prefsFocusConceptId = NO_SESSION_FOCUS_MODES.has(mode)
    ? ''
    : (hasPayloadFocusConcept
      ? requestedFocusConceptId
      : (NO_STORED_FOCUS_MODES.has(mode) ? '' : storedFocusConceptId));
  const sessionRequestedFocusConceptId = templateId && !hasPayloadFocusConcept
    ? ''
    : prefsFocusConceptId;
  if (prefsFocusConceptId && !isGrammarConceptId(prefsFocusConceptId)) {
    throw new BadRequestError('Grammar concept is not available.', {
      code: 'grammar_concept_not_found',
      subjectId: SUBJECT_ID,
      conceptId: prefsFocusConceptId,
    });
  }
  const sessionFocusConceptId = mode === 'trouble' && !sessionRequestedFocusConceptId
    ? weakestConceptIdForTrouble(state, nowTs)
    : sessionRequestedFocusConceptId;
  const roundLength = roundLengthFor(mode, payload, state.prefs);
  const baseSeed = Number.isFinite(Number(payload.seed))
    ? Number(payload.seed)
    : stableHash(`${payload.requestId || ''}:${nowTs}:${sessionFocusConceptId}:${mode}`);
  const sessionId = serverSessionId(learnerId, {
    requestId: payload.requestId,
    nowTs,
    baseSeed,
    mode,
    focusConceptId: sessionFocusConceptId,
  });
  const sessionGoal = sessionGoalFor(state, {
    mode,
    payload,
    prefs: state.prefs,
    roundLength,
    focusConceptId: sessionFocusConceptId,
    nowTs,
  });
  if (mode === 'satsset') {
    const items = buildStrictMiniTestItems(state, {
      size: roundLength,
      focusConceptId: sessionFocusConceptId,
      seed: baseSeed,
      templateId,
      nowTs,
    });
    const timeLimitMs = miniSetTimeLimitMs(items);
    const questions = miniTestQuestionEntries(items);
    state.phase = 'session';
    state.awaitingAdvance = false;
    state.feedback = null;
    state.summary = null;
    state.error = '';
    state.prefs = {
      ...state.prefs,
      mode,
      roundLength,
      goalType: normaliseGoalType(payload.goalType ?? payload.goal ?? state.prefs.goalType),
      allowTeachingItems: normaliseBoolean(payload.allowTeachingItems ?? state.prefs.allowTeachingItems, false),
      showDomainBeforeAnswer: normaliseBoolean(payload.showDomainBeforeAnswer ?? state.prefs.showDomainBeforeAnswer, true),
      focusConceptId: prefsFocusConceptId,
    };
    state.session = {
      id: sessionId,
      type: 'mini-set',
      mode,
      focusConceptId: sessionFocusConceptId,
      startedAt: nowTs,
      targetCount: questions.length,
      answered: 0,
      correct: 0,
      totalScore: 0,
      totalMarks: items.reduce((sum, item) => sum + (Number(item.marks) || 1), 0),
      seed: baseSeed,
      currentIndex: 0,
      currentItem: questions[0]?.item || null,
      attemptsForCurrent: 0,
      supportLevel: 0,
      supportContractVersion: SUPPORT_CONTRACT_VERSION,
      goal: sessionGoal,
      repair: {
        retryingCurrent: false,
        similarProblems: 0,
      },
      miniTest: {
        setSize: questions.length,
        startedAt: nowTs,
        timeLimitMs,
        expiresAt: nowTs + timeLimitMs,
        currentIndex: 0,
        questions,
        finished: false,
      },
      serverAuthority: SERVER_AUTHORITY,
    };
    return [];
  }
  const firstItem = nextItem(state, {
    mode,
    focusConceptId: sessionFocusConceptId,
    seed: baseSeed,
    nowTs,
    templateId,
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
    goalType: sessionGoal.type,
    allowTeachingItems: normaliseBoolean(payload.allowTeachingItems ?? state.prefs.allowTeachingItems, false),
    showDomainBeforeAnswer: normaliseBoolean(payload.showDomainBeforeAnswer ?? state.prefs.showDomainBeforeAnswer, true),
    focusConceptId: prefsFocusConceptId,
  };
  state.session = {
    id: sessionId,
    type: sessionTypeForMode(mode),
    mode,
    focusConceptId: sessionFocusConceptId,
    startedAt: nowTs,
    targetCount: sessionGoal.targetCount,
    answered: 0,
    correct: 0,
    totalScore: 0,
    totalMarks: 0,
    seed: baseSeed,
    currentIndex: 0,
    currentItem: firstItem,
    attemptsForCurrent: 0,
    supportLevel: supportLevelForSession(mode, state.prefs),
    supportContractVersion: SUPPORT_CONTRACT_VERSION,
    goal: sessionGoal,
    repair: {
      retryingCurrent: false,
      similarProblems: 0,
    },
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
    goal: isPlainObject(session.goal) ? cloneSerialisable(session.goal) : { type: 'questions' },
    timedOut: sessionGoalExpired(session, nowTs),
  };
}

function completeSession(state, nowTs, command) {
  if (!state.session || !['session', 'feedback'].includes(state.phase)) {
    throw new BadRequestError('This Grammar session is no longer active.', {
      code: 'grammar_session_stale',
      subjectId: SUBJECT_ID,
    });
  }
  if (isActiveMiniTestSession(state)) {
    return finishMiniTest(state, nowTs, command, { timedOut: miniTestExpired(state.session, nowTs) });
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

function isActiveMiniTestSession(state) {
  return state.session?.type === 'mini-set' && state.phase === 'session' && !state.session.miniTest?.finished;
}

function miniTestExpired(session, nowTs) {
  return Number(session?.miniTest?.expiresAt) > 0 && nowTs >= Number(session.miniTest.expiresAt);
}

function miniTestCurrentQuestion(session) {
  const miniTest = session?.miniTest;
  if (!miniTest || !Array.isArray(miniTest.questions)) return null;
  const index = clamp(Math.floor(Number(miniTest.currentIndex ?? session.currentIndex) || 0), 0, Math.max(0, miniTest.questions.length - 1));
  return miniTest.questions[index] || null;
}

function syncMiniTestSession(session) {
  const miniTest = session.miniTest;
  const questions = Array.isArray(miniTest?.questions) ? miniTest.questions : [];
  const index = clamp(Math.floor(Number(miniTest?.currentIndex ?? session.currentIndex) || 0), 0, Math.max(0, questions.length - 1));
  const answered = questions.filter((entry) => entry?.answered).length;
  miniTest.currentIndex = index;
  session.currentIndex = index;
  session.currentItem = questions[index]?.item || null;
  session.answered = answered;
  session.targetCount = questions.length || Number(session.targetCount) || 0;
  session.totalMarks = questions.reduce((sum, entry) => sum + (Number(entry?.item?.marks) || 1), 0);
}

function saveMiniTestResponse(state, payload = {}, nowTs = Date.now()) {
  if (!isActiveMiniTestSession(state)) {
    throw new BadRequestError('This Grammar mini-test is no longer active.', {
      code: 'grammar_session_stale',
      subjectId: SUBJECT_ID,
    });
  }
  const session = state.session;
  if (miniTestExpired(session, nowTs)) return null;
  const question = miniTestCurrentQuestion(session);
  if (!question?.item) return [];
  const response = isPlainObject(payload.response) ? payload.response : (isPlainObject(payload.answer) ? payload.answer : { answer: payload.answer ?? '' });
  question.response = normaliseGrammarResponse(question.item.inputSpec, response);
  question.answered = hasNormalisedGrammarResponse(question.response);
  question.savedAt = nowTs;
  syncMiniTestSession(session);
  return [];
}

function moveMiniTest(state, payload = {}, nowTs = Date.now()) {
  if (!isActiveMiniTestSession(state)) {
    throw new BadRequestError('This Grammar mini-test is no longer active.', {
      code: 'grammar_session_stale',
      subjectId: SUBJECT_ID,
    });
  }
  if (miniTestExpired(state.session, nowTs)) return null;
  const session = state.session;
  const questions = Array.isArray(session.miniTest?.questions) ? session.miniTest.questions : [];
  const current = Number(session.miniTest.currentIndex ?? session.currentIndex) || 0;
  const requested = Object.prototype.hasOwnProperty.call(payload, 'index')
    ? Number(payload.index)
    : current + (Number(payload.delta) || 0);
  const nextIndex = clamp(Math.floor(Number.isFinite(requested) ? requested : current), 0, Math.max(0, questions.length - 1));
  session.miniTest.currentIndex = nextIndex;
  syncMiniTestSession(session);
  state.feedback = null;
  state.awaitingAdvance = false;
  return [];
}

function unansweredMiniTestResult(item) {
  return {
    correct: false,
    score: 0,
    maxScore: Number(item?.marks) || 1,
    misconception: null,
    feedbackShort: 'No answer saved.',
    feedbackLong: 'This question was not answered before the mini-set was marked.',
    answerText: '',
    minimalHint: '',
  };
}

function finishMiniTest(state, nowTs, command, { timedOut = false } = {}) {
  if (!isActiveMiniTestSession(state)) {
    throw new BadRequestError('This Grammar mini-test is no longer active.', {
      code: 'grammar_session_stale',
      subjectId: SUBJECT_ID,
    });
  }
  const session = state.session;
  const questions = Array.isArray(session.miniTest?.questions) ? session.miniTest.questions : [];
  const events = [];
  let answered = 0;
  let correct = 0;
  let totalScore = 0;
  let totalMarks = 0;

  questions.forEach((entry, index) => {
    const item = entry?.item;
    const maxMarks = Number(item?.marks) || 1;
    totalMarks += maxMarks;
    if (entry?.answered && item) {
      const applied = applyGrammarAttemptToState(state, {
        learnerId: command.learnerId,
        item,
        response: entry.response,
        supportLevel: 0,
        attempts: 1,
        requestId: `${command.requestId || 'mini-test'}.${index + 1}`,
        now: nowTs,
        mode: state?.session?.mode || 'satsset',
      });
      entry.marked = {
        response: cloneSerialisable(applied.response) || {},
        result: cloneSerialisable(applied.result) || {},
      };
      answered += 1;
      if (applied.result.correct) correct += 1;
      totalScore += Number(applied.result.score) || 0;
      events.push(...applied.events);
    } else {
      entry.marked = {
        response: cloneSerialisable(entry?.response) || {},
        result: unansweredMiniTestResult(item),
      };
    }
  });

  session.miniTest.finished = true;
  session.miniTest.finishedAt = nowTs;
  session.miniTest.timedOut = Boolean(timedOut);
  session.answered = answered;
  session.correct = correct;
  session.totalScore = totalScore;
  session.totalMarks = totalMarks;

  const summary = {
    ...completionSummary(state, nowTs),
    answered,
    correct,
    totalScore,
    totalMarks,
    targetCount: questions.length,
    timedOut: Boolean(timedOut),
    miniTestReview: {
      setSize: questions.length,
      timeLimitMs: Number(session.miniTest.timeLimitMs) || 0,
      startedAt: Number(session.miniTest.startedAt) || session.startedAt || nowTs,
      finishedAt: nowTs,
      questions: questions.map((entry) => ({
        index: Number(entry.index) || 0,
        item: cloneSerialisable(entry.item) || null,
        response: cloneSerialisable(entry.response) || {},
        answered: Boolean(entry.answered),
        marked: cloneSerialisable(entry.marked) || null,
      })),
    },
  };
  state.phase = 'summary';
  state.awaitingAdvance = false;
  state.summary = summary;
  state.feedback = null;
  state.session = null;
  events.push({
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
    timedOut: Boolean(timedOut),
    createdAt: nowTs,
  });
  return events;
}

function saveMiniTestCommand(state, payload, command, nowTs) {
  const saved = saveMiniTestResponse(state, payload, nowTs);
  if (saved === null) return finishMiniTest(state, nowTs, command, { timedOut: true });
  if (Object.prototype.hasOwnProperty.call(payload, 'index')) {
    const moved = moveMiniTest(state, { index: payload.index }, nowTs);
    if (moved === null) return finishMiniTest(state, nowTs, command, { timedOut: true });
    return saved;
  }
  if (!payload.advance) return saved;
  const moved = moveMiniTest(state, { delta: 1 }, nowTs);
  if (moved === null) return finishMiniTest(state, nowTs, command, { timedOut: true });
  return saved;
}

function moveMiniTestCommand(state, payload, command, nowTs) {
  const moved = moveMiniTest(state, payload, nowTs);
  if (moved === null) return finishMiniTest(state, nowTs, command, { timedOut: true });
  return moved;
}

function finishMiniTestCommand(state, payload, command, nowTs) {
  if (isActiveMiniTestSession(state) && !miniTestExpired(state.session, nowTs)) {
    const shouldSaveCurrent = payload.saveCurrent !== false && (
      Object.prototype.hasOwnProperty.call(payload, 'response')
      || Object.prototype.hasOwnProperty.call(payload, 'answer')
    );
    if (shouldSaveCurrent) {
      const saved = saveMiniTestResponse(state, payload, nowTs);
      if (saved === null) return finishMiniTest(state, nowTs, command, { timedOut: true });
    }
  }
  return finishMiniTest(state, nowTs, command, { timedOut: miniTestExpired(state.session, nowTs) });
}

function ensureRepairState(session) {
  if (!isPlainObject(session.repair)) {
    session.repair = {
      retryingCurrent: false,
      similarProblems: 0,
    };
  }
  session.repair.similarProblems = Math.max(0, Math.floor(Number(session.repair.similarProblems) || 0));
  return session.repair;
}

function assertRepairableSession(state) {
  const session = state.session;
  if (!session || !session.currentItem || !['session', 'feedback'].includes(state.phase)) {
    throw new BadRequestError('This Grammar session is no longer active.', {
      code: 'grammar_session_stale',
      subjectId: SUBJECT_ID,
    });
  }
  if (session.type === 'mini-set') {
    throw new BadRequestError('Repair actions are unavailable during a strict Grammar mini-test.', {
      code: 'grammar_repair_unavailable_for_mode',
      subjectId: SUBJECT_ID,
      mode: session.mode,
    });
  }
  return session;
}

function retryCurrentQuestion(state) {
  const session = assertRepairableSession(state);
  if (!state.awaitingAdvance || state.phase !== 'feedback') {
    throw new BadRequestError('Retry is available after an answer has been marked.', {
      code: 'grammar_repair_not_ready',
      subjectId: SUBJECT_ID,
    });
  }
  const repair = ensureRepairState(session);
  repair.retryingCurrent = true;
  state.phase = 'session';
  state.awaitingAdvance = false;
  state.feedback = null;
  state.error = '';
  return [];
}

function useFadedSupport(state) {
  const session = assertRepairableSession(state);
  if (state.phase !== 'session' || state.awaitingAdvance) {
    throw new BadRequestError('Faded support is available before submitting an answer.', {
      code: 'grammar_repair_not_ready',
      subjectId: SUBJECT_ID,
    });
  }
  session.supportLevel = Math.max(Number(session.supportLevel) || 0, 1);
  ensureRepairState(session).requestedFadedSupport = true;
  state.error = '';
  return [];
}

function showWorkedSolution(state) {
  const session = assertRepairableSession(state);
  if (state.phase !== 'feedback' || !state.feedback?.result) {
    throw new BadRequestError('Worked solution is available after an answer has been marked.', {
      code: 'grammar_repair_not_ready',
      subjectId: SUBJECT_ID,
    });
  }
  const result = state.feedback.result || {};
  state.feedback.workedSolution = {
    answerText: typeof result.answerText === 'string' ? result.answerText : '',
    explanation: typeof result.feedbackLong === 'string' ? result.feedbackLong : '',
    check: typeof result.minimalHint === 'string' ? result.minimalHint : '',
  };
  session.supportLevel = Math.max(Number(session.supportLevel) || 0, 2);
  ensureRepairState(session).workedSolutionShown = true;
  state.error = '';
  return [];
}

function startSimilarProblem(state, nowTs) {
  const session = assertRepairableSession(state);
  const repair = ensureRepairState(session);
  const baseItem = session.currentItem;
  const nextSimilarIndex = repair.similarProblems + 1;
  const seed = (Number(baseItem.seed) + nextSimilarIndex * 2654435761) >>> 0;
  const item = nextItem(state, {
    mode: session.mode,
    focusConceptId: session.focusConceptId,
    seed,
    templateId: baseItem.templateId,
    nowTs,
  });
  repair.similarProblems = nextSimilarIndex;
  repair.retryingCurrent = false;
  session.currentIndex = Number(session.currentIndex) + 1;
  session.currentItem = item;
  session.attemptsForCurrent = 0;
  session.supportLevel = supportLevelForSession(session.mode, state.prefs, session);
  session.targetCount = Math.max(Number(session.targetCount) || 0, Number(session.answered) + 1);
  if (isPlainObject(session.goal) && session.goal.type === 'questions') {
    session.goal.targetCount = session.targetCount;
  }
  state.phase = 'session';
  state.awaitingAdvance = false;
  state.feedback = null;
  state.error = '';
  return [];
}

function continueSession(state, nowTs) {
  const session = state.session;
  if (!session || !['session', 'feedback'].includes(state.phase)) {
    throw new BadRequestError('This Grammar session is no longer active.', {
      code: 'grammar_session_stale',
      subjectId: SUBJECT_ID,
    });
  }
  if (sessionReadyToComplete(state, session, nowTs)) return null;
  if (!state.awaitingAdvance) {
    if (isActiveMiniTestSession(state)) return moveMiniTest(state, { delta: 1 }, nowTs);
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
  session.supportLevel = supportLevelForSession(session.mode, state.prefs, session);
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
  mode = '',
  supportUsed = null,
  postMarkingEnrichment = false,
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
  const normalisedResponse = normaliseGrammarResponse(question.inputSpec, response);
  if (!hasNormalisedGrammarResponse(normalisedResponse)) {
    throw new BadRequestError('Choose or type an answer before submitting.', {
      code: 'grammar_answer_required',
      subjectId: SUBJECT_ID,
    });
  }
  const result = evaluateGrammarQuestion(question, normalisedResponse);
  if (!result) {
    throw new BadRequestError('Grammar answer could not be marked.', {
      code: 'grammar_answer_invalid',
      subjectId: SUBJECT_ID,
    });
  }
  const nowTs = timestamp(now);
  // Compose item-level support fields. Under contract v2, post-marking AI
  // enrichment never reduces mastery gain, and `supportUsed` takes precedence
  // over the session-derived level when the command layer names it.
  const attemptSupport = composeAttemptSupport({
    mode,
    sessionSupportLevel: supportLevel,
    attempts,
    supportUsed,
    postMarkingEnrichment,
  });
  // answerQuality still uses `supportLevelAtScoring` to compute the gain.
  // Dual-write: keep legacy `supportLevel` for backcompat readers.
  const quality = answerQuality(result, {
    supportLevel: attemptSupport.supportLevelAtScoring,
    attempts,
  });
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
    response: cloneSerialisable(normalisedResponse) || {},
    result: cloneSerialisable(result) || {},
    // Legacy fields (kept for one release for event-log / backcompat readers).
    supportLevel: attemptSupport.supportLevelAtScoring,
    attempts,
    // U3 item-level fields (new authoritative shape).
    firstAttemptIndependent: attemptSupport.firstAttemptIndependent,
    supportUsed: attemptSupport.supportUsed,
    supportLevelAtScoring: attemptSupport.supportLevelAtScoring,
    mode: typeof mode === 'string' ? mode : '',
    createdAt: nowTs,
  };
  state.recentAttempts = [...(state.recentAttempts || []), attempt].slice(-80);

  const events = [{
    id: `grammar.answer.${learnerId || 'learner'}.${requestId}.${question.itemId}`,
    type: 'grammar.answer-submitted',
    subjectId: SUBJECT_ID,
    learnerId,
    contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
    templateId: question.templateId,
    itemId: question.itemId,
    seed: question.seed,
    questionType: question.questionType,
    conceptIds,
    score: result.score,
    maxScore: result.maxScore,
    correct: Boolean(result.correct),
    misconception: result.misconception || null,
    // Dual-write: legacy `supportLevel` plus the new U3 item-level fields so
    // pre-U3 and post-U3 event-log readers both see consistent projections.
    supportLevel: attemptSupport.supportLevelAtScoring,
    attempts,
    firstAttemptIndependent: attemptSupport.firstAttemptIndependent,
    supportUsed: attemptSupport.supportUsed,
    supportLevelAtScoring: attemptSupport.supportLevelAtScoring,
    mode: typeof mode === 'string' ? mode : '',
    supportContractVersion: SUPPORT_CONTRACT_VERSION,
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
        contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
        conceptId,
        masteryKey: `grammar:${GRAMMAR_CONTENT_RELEASE_ID}:${conceptId}`,
        templateId: question.templateId,
        itemId: question.itemId,
        createdAt: nowTs,
      });
    }
  }
  return { result, quality, events, attempt, response: normalisedResponse };
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
  if (session.type === 'mini-set') {
    const requestedSupportLevel = Number(payload.supportLevel ?? 0) || 0;
    if (requestedSupportLevel > 0) {
      throw new BadRequestError('This Grammar mode does not allow pre-answer support.', {
        code: 'grammar_support_unavailable_for_mode',
        subjectId: SUBJECT_ID,
        mode: session.mode,
      });
    }
    if (miniTestExpired(session, nowTs)) return finishMiniTest(state, nowTs, command, { timedOut: true });
    saveMiniTestResponse(state, payload, nowTs);
    if (payload.advance) moveMiniTest(state, { delta: 1 }, nowTs);
    return [];
  }
  if (sessionGoalExpired(session, nowTs)) return completeSession(state, nowTs, command);
  const response = isPlainObject(payload.response) ? payload.response : (isPlainObject(payload.answer) ? payload.answer : { answer: payload.answer ?? '' });
  const modeSupportLevel = Math.max(0, Number(session.supportLevel) || supportLevelForSession(session.mode, state.prefs, session));
  const requestedSupportLevel = Number(payload.supportLevel ?? modeSupportLevel) || 0;
  if (requestedSupportLevel > modeSupportLevel) {
    throw new BadRequestError('This Grammar mode does not allow pre-answer support.', {
      code: 'grammar_support_unavailable_for_mode',
      subjectId: SUBJECT_ID,
      mode: session.mode,
    });
  }
  const repair = ensureRepairState(session);
  const retryingCurrent = Boolean(repair.retryingCurrent);
  session.attemptsForCurrent = Number(session.attemptsForCurrent || 0) + 1;
  const applied = applyGrammarAttemptToState(state, {
    learnerId: command.learnerId,
    item: session.currentItem,
    response,
    supportLevel: modeSupportLevel,
    attempts: session.attemptsForCurrent,
    requestId: command.requestId,
    now: nowTs,
    mode: session.mode,
  });
  if (!retryingCurrent) {
    session.answered += 1;
    session.correct += applied.result.correct ? 1 : 0;
    session.totalScore += Number(applied.result.score) || 0;
    session.totalMarks += Number(applied.result.maxScore) || Number(session.currentItem.marks) || 1;
  }
  repair.retryingCurrent = false;
  state.phase = 'feedback';
  state.awaitingAdvance = true;
  state.feedback = {
    itemId: session.currentItem.itemId,
    templateId: session.currentItem.templateId,
    result: cloneSerialisable(applied.result),
    response: cloneSerialisable(applied.response) || {},
    canContinue: !sessionReadyToComplete(state, session, nowTs),
  };
  return applied.events;
}

// U10: cap on the number of promptIds a learner may mark as "hidden" in
// the Writing Try orphan surface. Evidence is untouched; the toggle only
// controls the child-facing "Retired prompts" list so a learner can clear
// a clutter of old prompts from their own view. Cap chosen to be 2× the
// global `GRAMMAR_TRANSFER_MAX_PROMPTS` so a learner can hide every entry
// they ever saved (20) plus every currently-catalogued prompt (~20 over
// time as the catalogue churns). Excess ids are dropped on write.
const GRAMMAR_TRANSFER_HIDDEN_PROMPTS_CAP = 40;

// U10 follower (deferred MEDIUM — bounded): cap on the number of
// archived Writing Try entries per learner. Unbounded growth was the
// reviewer concern. Picked 100 to mirror the `prefs.transferHiddenPromptIds:
// cap 40` philosophy (2.5× the max-live cap so long-running accounts
// still accumulate generous history) while still bounded. When an
// admin tries to archive into a slot that would push the archive
// count above the cap, the pure helper raises
// `archive_cap_exceeded` with the cap value in the error payload.
// The admin must delete an existing archived entry before archiving
// another.
const GRAMMAR_TRANSFER_ARCHIVE_CAP = 100;

function normaliseTransferHiddenPromptIds(value, fallback) {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set();
  const out = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const promptId = entry.slice(0, 64);
    if (!promptId || seen.has(promptId)) continue;
    seen.add(promptId);
    out.push(promptId);
    if (out.length >= GRAMMAR_TRANSFER_HIDDEN_PROMPTS_CAP) break;
  }
  if (!Array.isArray(value)) {
    const existing = Array.isArray(fallback) ? fallback : [];
    return existing.slice(0, GRAMMAR_TRANSFER_HIDDEN_PROMPTS_CAP);
  }
  return out;
}

function savePrefs(state, payload) {
  const prefs = isPlainObject(payload.prefs) ? payload.prefs : payload;
  const nextMode = prefs.mode ? normaliseMode(prefs.mode) : state.prefs.mode;
  const nextGoalType = Object.prototype.hasOwnProperty.call(prefs, 'goalType') || Object.prototype.hasOwnProperty.call(prefs, 'goal')
    ? normaliseGoalType(prefs.goalType ?? prefs.goal)
    : normaliseGoalType(state.prefs.goalType);
  const hasFocusConcept = Object.prototype.hasOwnProperty.call(prefs, 'focusConceptId');
  const nextFocusConceptId = NO_STORED_FOCUS_MODES.has(nextMode)
    ? ''
    : (hasFocusConcept
      ? normaliseStoredFocusConceptId(prefs.focusConceptId)
      : normaliseStoredFocusConceptId(state.prefs.focusConceptId));
  // U10: `transferHiddenPromptIds` is an additive learner-only pref driving
  // the child-facing "Hide from my list" toggle on orphaned Writing Try
  // entries. Only the prefs path writes it (never a scored event); the
  // server evidence row is untouched. Malformed arrays fall back to the
  // existing value — the payload can't reset the pref to an empty array
  // unless the client explicitly sends `[]`.
  const hasHiddenPromptIds = Object.prototype.hasOwnProperty.call(prefs, 'transferHiddenPromptIds');
  const nextTransferHiddenPromptIds = hasHiddenPromptIds
    ? normaliseTransferHiddenPromptIds(prefs.transferHiddenPromptIds, state.prefs.transferHiddenPromptIds)
    : normaliseTransferHiddenPromptIds(state.prefs.transferHiddenPromptIds, state.prefs.transferHiddenPromptIds);
  state.prefs = {
    ...state.prefs,
    mode: ENABLED_MODES.has(nextMode) ? nextMode : state.prefs.mode,
    roundLength: roundLengthFor(nextMode, prefs, state.prefs),
    goalType: nextGoalType,
    allowTeachingItems: Object.prototype.hasOwnProperty.call(prefs, 'allowTeachingItems')
      ? normaliseBoolean(prefs.allowTeachingItems, state.prefs.allowTeachingItems)
      : normaliseBoolean(state.prefs.allowTeachingItems, false),
    showDomainBeforeAnswer: Object.prototype.hasOwnProperty.call(prefs, 'showDomainBeforeAnswer')
      ? normaliseBoolean(prefs.showDomainBeforeAnswer, state.prefs.showDomainBeforeAnswer)
      : normaliseBoolean(state.prefs.showDomainBeforeAnswer, true),
    speechRate: Object.prototype.hasOwnProperty.call(prefs, 'speechRate')
      ? normaliseSpeechRate(prefs.speechRate, state.prefs.speechRate)
      : normaliseSpeechRate(state.prefs.speechRate),
    focusConceptId: nextFocusConceptId,
    transferHiddenPromptIds: nextTransferHiddenPromptIds,
  };
  if (state.phase === 'summary') {
    state.phase = 'dashboard';
    state.session = null;
    state.feedback = null;
    state.summary = null;
    state.awaitingAdvance = false;
  }
  return [];
}

// U7 non-scored transfer writing lane. This command is isolated from every
// scored path: it never touches state.mastery, state.retryQueue, reward
// projection, or Concordium progress. Saved evidence is stored under a
// dedicated `transferEvidence` slot, keyed per promptId, with per-prompt
// history capped at GRAMMAR_TRANSFER_HISTORY_PER_PROMPT and a global cap of
// GRAMMAR_TRANSFER_MAX_PROMPTS distinct prompts.
function saveTransferEvidence(state, payload, command, nowTs) {
  if (isActiveMiniTestSession(state)) {
    throw new BadRequestError('Transfer evidence cannot be saved during a strict mini-test.', {
      code: 'grammar_transfer_unavailable_during_mini_test',
      subjectId: SUBJECT_ID,
    });
  }
  const promptId = typeof payload?.promptId === 'string' ? payload.promptId : '';
  const prompt = grammarTransferPromptById(promptId);
  if (!prompt) {
    throw new NotFoundError('Grammar transfer prompt is not available.', {
      code: 'grammar_transfer_prompt_not_found',
      subjectId: SUBJECT_ID,
      promptId,
    });
  }
  const writingRaw = typeof payload?.writing === 'string' ? payload.writing : '';
  const writing = writingRaw.slice(0, GRAMMAR_TRANSFER_WRITING_CAP).trim();
  if (!writing) {
    throw new BadRequestError('Transfer writing is required before saving.', {
      code: 'grammar_transfer_writing_required',
      subjectId: SUBJECT_ID,
      promptId,
    });
  }
  const selfAssessment = (Array.isArray(payload?.selfAssessment) ? payload.selfAssessment : [])
    .slice(0, GRAMMAR_TRANSFER_CHECKLIST_CAP)
    .map((entry) => ({
      key: typeof entry?.key === 'string' ? entry.key.slice(0, 80) : '',
      checked: Boolean(entry?.checked),
    }))
    .filter((entry) => entry.key);
  if (!isPlainObject(state.transferEvidence)) state.transferEvidence = {};
  const existingPromptIds = Object.keys(state.transferEvidence);
  if (!state.transferEvidence[promptId] && existingPromptIds.length >= GRAMMAR_TRANSFER_MAX_PROMPTS) {
    throw new BadRequestError('Grammar transfer evidence quota reached. Revisit an existing prompt instead.', {
      code: 'grammar_transfer_quota_exceeded',
      subjectId: SUBJECT_ID,
      promptId,
      max: GRAMMAR_TRANSFER_MAX_PROMPTS,
    });
  }
  const snapshot = {
    source: 'transfer-lane',
    writing,
    selfAssessment,
    savedAt: nowTs,
    requestId: command?.requestId || null,
  };
  const prior = isPlainObject(state.transferEvidence[promptId])
    ? state.transferEvidence[promptId]
    : { promptId, latest: null, history: [] };
  const previousLatest = prior.latest;
  const history = Array.isArray(prior.history) ? prior.history.slice() : [];
  if (previousLatest) history.unshift(previousLatest);
  // Keep the latest save plus up to (history-cap - 1) prior snapshots.
  while (history.length >= GRAMMAR_TRANSFER_HISTORY_PER_PROMPT) history.pop();
  state.transferEvidence[promptId] = {
    promptId,
    latest: snapshot,
    history,
    updatedAt: nowTs,
  };
  return [{
    id: `grammar.transfer-evidence-saved.${command?.learnerId || 'learner'}.${command?.requestId || 'req'}.${promptId}`,
    type: 'grammar.transfer-evidence-saved',
    subjectId: SUBJECT_ID,
    learnerId: command?.learnerId || '',
    contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
    promptId,
    savedAt: nowTs,
    nonScored: true,
    createdAt: nowTs,
  }];
}

// U10 admin-only archive helper. Moves an entry from
// `state.transferEvidence[promptId]` to
// `state.transferEvidenceArchive[promptId]` and emits a non-scored audit
// event. Pure state-mutation helper — the RBAC check lives in
// `worker/src/repository.js::archiveGrammarTransferEvidence` (mirrors the
// `requireMonsterVisualConfigManager` pattern), NOT here. Callers MUST
// enforce `requireAdminHubAccess(account)` before invoking.
//
// Emits a `grammar.transfer-evidence-archived` event carrying `nonScored:
// true`. The event type is not consumed by the reward projection pipeline
// (see `worker/src/projections/rewards.js`), preserving Phase 4
// invariant 5 "Writing Try is non-scored".
export function archiveGrammarTransferEvidenceState(state, {
  promptId,
  learnerId = '',
  requestId = '',
  now,
} = {}) {
  if (!(typeof promptId === 'string' && promptId)) {
    throw new BadRequestError('Grammar transfer prompt id is required for archive.', {
      code: 'grammar_transfer_prompt_id_required',
      subjectId: SUBJECT_ID,
    });
  }
  if (!isPlainObject(state.transferEvidence)) state.transferEvidence = {};
  if (!isPlainObject(state.transferEvidenceArchive)) state.transferEvidenceArchive = {};
  const entry = state.transferEvidence[promptId];
  if (!isPlainObject(entry)) {
    throw new NotFoundError('Grammar transfer evidence not found for that prompt.', {
      code: 'transfer_evidence_not_found',
      subjectId: SUBJECT_ID,
      promptId,
    });
  }
  // U10 follower (HIGH 1): reject re-archive when the archive slot is
  // already occupied. Without this guard the sequence archive P → learner
  // re-saves P → admin re-archives P silently clobbers the first archive.
  // The admin must explicitly delete the existing archive first — this
  // matches the two-step-delete mental model and preserves forensic
  // evidence. Alternative considered: merge into a `history` array, but
  // REJECT is safer (explicit admin intent required before destructive
  // overwrite). Error code is `archive_slot_occupied`.
  const existingArchive = state.transferEvidenceArchive[promptId];
  if (isPlainObject(existingArchive)) {
    throw new BadRequestError('An archived Writing Try entry already exists for that prompt. Delete the archived entry first.', {
      code: 'archive_slot_occupied',
      subjectId: SUBJECT_ID,
      promptId,
    });
  }
  // U10 follower (deferred MEDIUM — bounded): reject when the archive
  // already holds the cap number of entries. This bounds the growth
  // of `transferEvidenceArchive` per learner so a long-running admin
  // account cannot inflate the state row without bound.
  const archiveKeys = Object.keys(state.transferEvidenceArchive);
  if (archiveKeys.length >= GRAMMAR_TRANSFER_ARCHIVE_CAP) {
    throw new BadRequestError('The Writing Try archive is full. Delete an archived entry before archiving another.', {
      code: 'archive_cap_exceeded',
      subjectId: SUBJECT_ID,
      promptId,
      cap: GRAMMAR_TRANSFER_ARCHIVE_CAP,
    });
  }
  const nowTs = timestamp(now);
  const archived = {
    ...cloneSerialisable(entry),
    archivedAt: nowTs,
  };
  state.transferEvidenceArchive[promptId] = archived;
  delete state.transferEvidence[promptId];
  return [{
    id: `grammar.transfer-evidence-archived.${learnerId || 'learner'}.${requestId || 'req'}.${promptId}`,
    type: 'grammar.transfer-evidence-archived',
    subjectId: SUBJECT_ID,
    learnerId: learnerId || '',
    contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
    promptId,
    archivedAt: nowTs,
    nonScored: true,
    createdAt: nowTs,
  }];
}

// U10 admin-only hard-delete helper. Removes an entry from
// `state.transferEvidenceArchive` (NOT from `state.transferEvidence`) —
// the two-step safety requires the admin to archive first, so an
// accidental delete on a live entry cannot bypass the archive step.
// Rejects with `archive_required_before_delete` when the admin tries to
// delete an entry that has not been archived.
export function deleteGrammarTransferEvidenceState(state, {
  promptId,
  learnerId = '',
  requestId = '',
  now,
} = {}) {
  if (!(typeof promptId === 'string' && promptId)) {
    throw new BadRequestError('Grammar transfer prompt id is required for delete.', {
      code: 'grammar_transfer_prompt_id_required',
      subjectId: SUBJECT_ID,
    });
  }
  if (!isPlainObject(state.transferEvidenceArchive)) state.transferEvidenceArchive = {};
  const archivedEntry = state.transferEvidenceArchive[promptId];
  if (!isPlainObject(archivedEntry)) {
    // Two-step safety: you must archive before you can delete. The live
    // evidence row stays read-only through the admin path; the only way
    // to remove an entry is archive → delete.
    const liveEntry = isPlainObject(state.transferEvidence) ? state.transferEvidence[promptId] : null;
    if (isPlainObject(liveEntry)) {
      throw new BadRequestError('Archive the Writing Try entry before deleting it.', {
        code: 'archive_required_before_delete',
        subjectId: SUBJECT_ID,
        promptId,
      });
    }
    throw new NotFoundError('Grammar transfer evidence not found for that prompt.', {
      code: 'transfer_evidence_not_found',
      subjectId: SUBJECT_ID,
      promptId,
    });
  }
  const nowTs = timestamp(now);
  delete state.transferEvidenceArchive[promptId];
  return [{
    id: `grammar.transfer-evidence-deleted.${learnerId || 'learner'}.${requestId || 'req'}.${promptId}`,
    type: 'grammar.transfer-evidence-deleted',
    subjectId: SUBJECT_ID,
    learnerId: learnerId || '',
    contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
    promptId,
    deletedAt: nowTs,
    nonScored: true,
    createdAt: nowTs,
  }];
}

function requestAiEnrichment(state, payload, nowTs) {
  if (isActiveMiniTestSession(state)) {
    throw new BadRequestError('Grammar enrichment is unavailable until the mini-test is complete.', {
      code: 'grammar_ai_unavailable_for_mini_test',
      subjectId: SUBJECT_ID,
      mode: state.session?.mode || 'satsset',
    });
  }
  return compileGrammarAiEnrichment({
    payload,
    state,
    now: nowTs,
  });
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
      let changed = true;
      let aiEnrichment = null;

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
      } else if (command === 'save-mini-test-response') {
        events = saveMiniTestCommand(state, payload, commandContext, nowTs);
      } else if (command === 'move-mini-test') {
        events = moveMiniTestCommand(state, payload, commandContext, nowTs);
      } else if (command === 'finish-mini-test') {
        events = finishMiniTestCommand(state, payload, commandContext, nowTs);
      } else if (command === 'continue-session') {
        events = continueSession(state, nowTs) ?? completeSession(state, nowTs, commandContext);
      } else if (command === 'end-session') {
        events = completeSession(state, nowTs, commandContext);
      } else if (command === 'save-prefs') {
        events = savePrefs(state, payload);
      } else if (command === 'retry-current-question') {
        events = retryCurrentQuestion(state);
      } else if (command === 'use-faded-support') {
        events = useFadedSupport(state);
      } else if (command === 'show-worked-solution') {
        events = showWorkedSolution(state);
      } else if (command === 'start-similar-problem') {
        events = startSimilarProblem(state, nowTs);
      } else if (command === 'request-ai-enrichment') {
        aiEnrichment = requestAiEnrichment(state, payload, nowTs);
        const persistentAiEnrichment = normalisePersistentAiEnrichment(aiEnrichment);
        if (persistentAiEnrichment) {
          state.aiEnrichment = persistentAiEnrichment;
        }
        changed = Boolean(persistentAiEnrichment);
      } else if (command === 'save-transfer-evidence') {
        events = saveTransferEvidence(state, payload, commandContext, nowTs);
        changed = true;
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
        ...transition(state, { events, changed }),
        aiEnrichment,
        practiceSession: changed ? practiceSessionRecord(learnerId, state, latestSession, nowTs) : null,
      };
    },
  };
}

export {
  ENABLED_MODES as GRAMMAR_ENABLED_MODES,
  LOCKED_MODES as GRAMMAR_LOCKED_MODES,
  SERVER_AUTHORITY as GRAMMAR_SERVER_AUTHORITY,
};

// Re-export the status machine from the shared module so Worker-side consumers
// that import from engine.js (e.g., `./read-models.js`, tests) keep working.
// The single source of truth lives in `shared/grammar/confidence.js`.
export { grammarConceptStatus };
