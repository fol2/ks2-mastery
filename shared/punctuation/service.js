import {
  createPunctuationContentIndexes,
  PUNCTUATION_CONTENT_MANIFEST,
  PUNCTUATION_RELEASE_ID,
} from './content.js';
import {
  createPunctuationItemAttemptedEvent,
  createPunctuationMisconceptionObservedEvents,
  createPunctuationSessionCompletedEvent,
  createPunctuationUnitSecuredEvent,
} from './events.js';
import { createPunctuationRuntimeManifest } from './generators.js';
import { parseChoiceIndex } from './choice-index.js';
import { markPunctuationAnswer, normaliseAnswerText } from './marking.js';
import {
  memorySnapshot,
  normaliseMemoryState,
  selectPunctuationItem,
  updateMemoryState,
} from './scheduler.js';
import {
  cloneSerialisable,
  createInitialPunctuationState,
  normaliseNonNegativeInteger,
  normalisePunctuationFeedback,
  normalisePunctuationMode,
  normalisePunctuationPrefs,
  normalisePunctuationRoundLength,
  normalisePunctuationSummary,
  normaliseStringArray,
  normaliseTimestamp,
  PUNCTUATION_PHASES,
  PUNCTUATION_SERVICE_STATE_VERSION,
} from '../../src/subjects/punctuation/service-contract.js';

const SUBJECT_ID = 'punctuation';
const SERVER_AUTHORITY = 'worker';
const GENERATED_ITEMS_PER_FAMILY = 4;
const MAX_GPS_QUEUE_LENGTH = 12;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_TARGET_ATTEMPTS = 4;
const ITEM_MODE_LABELS = Object.freeze({
  choose: 'Choice',
  insert: 'Insert punctuation',
  fix: 'Proofreading',
  transfer: 'Transfer writing',
  combine: 'Sentence combining',
  paragraph: 'Paragraph repair',
});
const SESSION_MODE_LABELS = Object.freeze({
  smart: 'Smart review',
  guided: 'Guided learn',
  weak: 'Weak spots',
  gps: 'GPS test',
  endmarks: 'Endmarks focus',
  apostrophe: 'Apostrophe focus',
  speech: 'Speech focus',
  comma_flow: 'Comma / flow focus',
  boundary: 'Boundary focus',
  structure: 'Structure focus',
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function timestamp(now = Date.now) {
  const value = typeof now === 'function' ? Number(now()) : Number(now);
  return Number.isFinite(value) ? value : Date.now();
}

function randomSuffix(random = Math.random) {
  const value = typeof random === 'function' ? Number(random()) : Math.random();
  const bounded = Number.isFinite(value) ? Math.max(0, Math.min(0.999999, value)) : 0;
  return Math.floor(bounded * 0xffffffff).toString(36).padStart(6, '0').slice(0, 8);
}

function uid(prefix, now = Date.now, random = Math.random) {
  return `${prefix}-${timestamp(now).toString(36)}-${randomSuffix(random)}`;
}

export class PunctuationServiceError extends Error {
  constructor(message, { code = 'punctuation_command_failed', details = {} } = {}) {
    super(message);
    this.name = 'PunctuationServiceError';
    this.code = code;
    this.details = details;
  }
}

function serviceError(code, message, details = {}) {
  return new PunctuationServiceError(message, { code, details });
}

function createNoopRepository() {
  let data = createInitialPunctuationData();
  let practiceSession = null;
  return {
    readData() {
      return cloneSerialisable(data);
    },
    writeData(_learnerId, nextData) {
      data = normalisePunctuationData(nextData);
      return cloneSerialisable(data);
    },
    syncPracticeSession(_learnerId, _state, record) {
      practiceSession = cloneSerialisable(record);
      return cloneSerialisable(practiceSession);
    },
    abandonPracticeSession() {
      return null;
    },
    resetLearner() {
      data = createInitialPunctuationData();
      practiceSession = null;
    },
    practiceSession() {
      return cloneSerialisable(practiceSession);
    },
  };
}

export function createInitialPunctuationData() {
  return {
    prefs: { mode: 'smart', roundLength: '4' },
    progress: {
      items: {},
      facets: {},
      rewardUnits: {},
      attempts: [],
      sessionsCompleted: 0,
    },
  };
}

export function normalisePunctuationData(value) {
  const raw = isPlainObject(value) ? value : {};
  const progress = isPlainObject(raw.progress) ? raw.progress : {};
  const normaliseMap = (input) => {
    const output = {};
    if (!isPlainObject(input)) return output;
    for (const [key, entry] of Object.entries(input)) {
      if (typeof key !== 'string' || !key) continue;
      output[key] = normaliseMemoryState(entry);
    }
    return output;
  };

  const rewardUnits = {};
  if (isPlainObject(progress.rewardUnits)) {
    for (const [key, entry] of Object.entries(progress.rewardUnits)) {
      if (!key || !isPlainObject(entry)) continue;
      rewardUnits[key] = {
        masteryKey: typeof entry.masteryKey === 'string' && entry.masteryKey ? entry.masteryKey : key,
        releaseId: typeof entry.releaseId === 'string' ? entry.releaseId : PUNCTUATION_RELEASE_ID,
        clusterId: typeof entry.clusterId === 'string' ? entry.clusterId : '',
        rewardUnitId: typeof entry.rewardUnitId === 'string' ? entry.rewardUnitId : '',
        securedAt: normaliseTimestamp(entry.securedAt, 0),
      };
    }
  }

  return {
    prefs: normalisePunctuationPrefs(raw.prefs),
    progress: {
      items: normaliseMap(progress.items),
      facets: normaliseMap(progress.facets),
      rewardUnits,
      attempts: Array.isArray(progress.attempts)
        ? progress.attempts
            .filter(isPlainObject)
            .map((attempt) => ({
              ts: normaliseTimestamp(attempt.ts, 0),
              sessionId: typeof attempt.sessionId === 'string' ? attempt.sessionId : null,
              itemId: typeof attempt.itemId === 'string' ? attempt.itemId : '',
              variantSignature: typeof attempt.variantSignature === 'string' ? attempt.variantSignature : '',
              mode: typeof attempt.mode === 'string' ? attempt.mode : '',
              itemMode: typeof attempt.itemMode === 'string'
                ? attempt.itemMode
                : (typeof attempt.mode === 'string' ? attempt.mode : ''),
              skillIds: normaliseStringArray(attempt.skillIds),
              rewardUnitId: typeof attempt.rewardUnitId === 'string' ? attempt.rewardUnitId : '',
              sessionMode: typeof attempt.sessionMode === 'string' ? attempt.sessionMode : '',
              testMode: attempt.testMode === 'gps' ? 'gps' : null,
              supportLevel: normaliseNonNegativeInteger(attempt.supportLevel, 0),
              supportKind: typeof attempt.supportKind === 'string'
                ? attempt.supportKind
                : (normaliseNonNegativeInteger(attempt.supportLevel, 0) > 0 ? 'guided' : null),
              meaningful: attempt.meaningful !== false,
              correct: attempt.correct === true,
              misconceptionTags: normaliseStringArray(attempt.misconceptionTags),
              facetOutcomes: Array.isArray(attempt.facetOutcomes)
                ? attempt.facetOutcomes.map(normaliseFacetForReview).filter(Boolean)
                : [],
            }))
            .slice(-1000)
        : [],
      sessionsCompleted: normaliseNonNegativeInteger(progress.sessionsCompleted, 0),
    },
  };
}

function normaliseItemForState(item) {
  if (!item) return null;
  const safe = {
    id: item.id,
    mode: item.mode,
    skillIds: Array.isArray(item.skillIds) ? [...item.skillIds] : [],
    clusterId: item.clusterId || null,
    rewardUnitId: item.rewardUnitId || null,
    prompt: item.prompt || '',
    stem: item.stem || '',
    explanation: item.explanation || '',
    inputKind: item.mode === 'choose' ? 'choice' : 'text',
    model: item.model || '',
    source: item.source || 'fixed',
  };
  if (typeof item.variantSignature === 'string' && item.variantSignature) {
    safe.variantSignature = item.variantSignature;
  }
  if (item.mode === 'choose') {
    safe.options = Array.isArray(item.options)
      ? item.options.map((option, index) => {
          if (isPlainObject(option)) {
            const optionIndex = Number(option.index);
            return {
              text: typeof option.text === 'string' ? option.text : '',
              index: Number.isInteger(optionIndex) && optionIndex >= 0 ? optionIndex : index,
            };
          }
          return { text: typeof option === 'string' ? option : '', index };
        })
      : [];
  }
  return safe;
}

function normaliseFacetForReview(value) {
  if (!isPlainObject(value)) return null;
  const id = typeof value.id === 'string' ? value.id : '';
  if (!id) return null;
  return {
    id,
    ok: value.ok === true,
    label: typeof value.label === 'string' ? value.label : '',
  };
}

function normaliseGpsResponse(value) {
  if (!isPlainObject(value)) return null;
  const itemId = typeof value.itemId === 'string' ? value.itemId : '';
  if (!itemId) return null;
  return {
    itemId,
    mode: typeof value.mode === 'string' ? value.mode : '',
    skillIds: normaliseStringArray(value.skillIds),
    rewardUnitId: typeof value.rewardUnitId === 'string' ? value.rewardUnitId : '',
    prompt: typeof value.prompt === 'string' ? value.prompt : '',
    stem: typeof value.stem === 'string' ? value.stem : '',
    attemptedAnswer: typeof value.attemptedAnswer === 'string' ? value.attemptedAnswer.slice(0, 500) : '',
    displayCorrection: typeof value.displayCorrection === 'string' ? value.displayCorrection : '',
    explanation: typeof value.explanation === 'string' ? value.explanation : '',
    correct: value.correct === true,
    misconceptionTags: normaliseStringArray(value.misconceptionTags),
    facets: Array.isArray(value.facets) ? value.facets.map(normaliseFacetForReview).filter(Boolean) : [],
  };
}

function normaliseGpsSession(value) {
  if (!isPlainObject(value)) {
    return {
      queueItemIds: [],
      responses: [],
      delayedFeedback: true,
    };
  }
  return {
    queueItemIds: normaliseStringArray(value.queueItemIds).slice(0, MAX_GPS_QUEUE_LENGTH),
    responses: Array.isArray(value.responses)
      ? value.responses.map(normaliseGpsResponse).filter(Boolean).slice(0, MAX_GPS_QUEUE_LENGTH)
      : [],
    delayedFeedback: true,
  };
}

function guidedTeachBoxForSkill(skillId, supportLevel = 0) {
  const skill = PUNCTUATION_CONTENT_MANIFEST.skills.find((entry) => entry.id === skillId && entry.published);
  if (!skill) return null;
  const level = normaliseNonNegativeInteger(supportLevel, 0);
  if (level <= 0) return null;
  const box = {
    skillId: skill.id,
    name: skill.name,
    rule: skill.rule || '',
    selfCheckPrompt: 'Check the rule, compare the examples, then try the item without looking for the answer pattern.',
  };
  if (level >= 2) {
    box.workedExample = {
      before: skill.workedBad || '',
      after: skill.workedGood || '',
    };
    box.contrastExample = {
      before: skill.contrastBad || '',
      after: skill.contrastGood || '',
    };
  }
  return box;
}

function guidedSessionReadModel(skillId, supportLevel) {
  if (!skillId) return null;
  return {
    skillId,
    supportLevel: normaliseNonNegativeInteger(supportLevel, 0),
    teachBox: guidedTeachBoxForSkill(skillId, supportLevel),
  };
}

function normaliseWeakFocus(value) {
  if (!isPlainObject(value)) return null;
  return {
    skillId: typeof value.skillId === 'string' ? value.skillId : '',
    skillName: typeof value.skillName === 'string' ? value.skillName : '',
    mode: typeof value.mode === 'string' ? value.mode : '',
    clusterId: typeof value.clusterId === 'string' ? value.clusterId : null,
    bucket: typeof value.bucket === 'string' ? value.bucket : '',
    source: typeof value.source === 'string' ? value.source : '',
  };
}

function normaliseSession(value) {
  if (!isPlainObject(value)) return null;
  const guidedSkillId = typeof value.guidedSkillId === 'string' ? value.guidedSkillId : null;
  const guidedSupportLevel = normaliseNonNegativeInteger(value.guidedSupportLevel, 0);
  const mode = normalisePunctuationMode(value.mode);
  return {
    id: typeof value.id === 'string' && value.id ? value.id : '',
    releaseId: typeof value.releaseId === 'string' ? value.releaseId : PUNCTUATION_RELEASE_ID,
    mode,
    length: Math.max(1, normaliseNonNegativeInteger(value.length, 4)),
    phase: value.phase === 'feedback' ? 'feedback' : 'active-item',
    startedAt: normaliseTimestamp(value.startedAt, 0),
    updatedAt: normaliseTimestamp(value.updatedAt, 0),
    answeredCount: normaliseNonNegativeInteger(value.answeredCount, 0),
    correctCount: normaliseNonNegativeInteger(value.correctCount, 0),
    currentItemId: typeof value.currentItemId === 'string' ? value.currentItemId : '',
    currentItem: normaliseItemForState(value.currentItem),
    recentItemIds: normaliseStringArray(value.recentItemIds).slice(-10),
    securedUnits: normaliseStringArray(value.securedUnits),
    misconceptionTags: normaliseStringArray(value.misconceptionTags),
    guidedSkillId,
    guidedSupportLevel,
    guided: mode === 'guided'
      ? (isPlainObject(value.guided) ? cloneSerialisable(value.guided) : guidedSessionReadModel(guidedSkillId, guidedSupportLevel))
      : null,
    weakFocus: mode === 'weak' ? normaliseWeakFocus(value.weakFocus) : null,
    gps: mode === 'gps' ? normaliseGpsSession(value.gps) : null,
    serverAuthority: value.serverAuthority === SERVER_AUTHORITY ? SERVER_AUTHORITY : null,
  };
}

function normaliseState(value) {
  const fallback = createInitialPunctuationState();
  const raw = isPlainObject(value) ? cloneSerialisable(value) : {};
  const phase = PUNCTUATION_PHASES.includes(raw.phase) ? raw.phase : fallback.phase;
  return {
    ...fallback,
    ...raw,
    version: PUNCTUATION_SERVICE_STATE_VERSION,
    phase,
    session: normaliseSession(raw.session),
    feedback: normalisePunctuationFeedback(raw.feedback),
    summary: normalisePunctuationSummary(raw.summary),
    error: typeof raw.error === 'string' ? raw.error : '',
    availability: isPlainObject(raw.availability)
      ? {
          // Accepted statuses: 'ready' (default), 'degraded' (runtime still
          // writable but UI should pause mutations), 'unavailable' (exposure
          // gate off or content missing). Anything else coerces to 'ready'.
          status: (raw.availability.status === 'unavailable'
            || raw.availability.status === 'degraded')
            ? raw.availability.status
            : 'ready',
          code: typeof raw.availability.code === 'string' ? raw.availability.code : null,
          message: typeof raw.availability.message === 'string' ? raw.availability.message : '',
        }
      : fallback.availability,
  };
}

function markServerOwnedState(state) {
  const next = cloneSerialisable(state) || createInitialPunctuationState();
  if (next.session) next.session.serverAuthority = SERVER_AUTHORITY;
  return next;
}

function stateTransition(state, { events = [], changed = true, ok = true } = {}) {
  return {
    ok,
    changed,
    state: cloneSerialisable(state),
    events: Array.isArray(events) ? events.filter(Boolean).map(cloneSerialisable) : [],
    audio: null,
  };
}

function itemForId(indexes, itemId) {
  return indexes.itemById.get(itemId) || null;
}

function rewardUnitForItem(indexes, item) {
  return indexes.rewardUnitById.get(item?.rewardUnitId) || null;
}

function facetKey(skillId, mode) {
  return `${skillId}::${mode}`;
}

function publishedSkill(indexes, skillId) {
  const skill = indexes.skillById.get(skillId);
  return skill?.published ? skill : null;
}

function chooseGuidedSkill(data, indexes, requestedSkillId, now = Date.now) {
  if (publishedSkill(indexes, requestedSkillId)) return requestedSkillId;
  const rows = indexes.publishedSkillIds.map((skillId, order) => {
    const items = indexes.itemsBySkill.get(skillId) || [];
    const snaps = items.map((item) => memorySnapshot(data.progress.items[item.id], now));
    const hasWeak = snaps.some((snap) => snap.bucket === 'weak');
    const hasDue = snaps.some((snap) => snap.bucket === 'due');
    const mastery = snaps.length ? snaps.reduce((sum, snap) => sum + snap.mastery, 0) / snaps.length : 0;
    const attempts = snaps.reduce((sum, snap) => sum + snap.attempts, 0);
    const rank = hasWeak ? 0 : hasDue ? 1 : attempts ? 2 : 3;
    return { skillId, rank, mastery, order };
  });
  rows.sort((a, b) => a.rank - b.rank || a.mastery - b.mastery || a.order - b.order);
  return rows[0]?.skillId || indexes.publishedSkillIds[0] || null;
}

function sessionFocus(session = {}, indexes = PUNCTUATION_CONTENT_INDEXES) {
  const skills = new Set();
  for (const itemId of session.recentItemIds || []) {
    const item = indexes.itemById.get(itemId);
    for (const skillId of item?.skillIds || []) skills.add(skillId);
  }
  return [...skills];
}

function currentPublishedRewardUnits(data, indexes = PUNCTUATION_CONTENT_INDEXES) {
  const publishedKeys = new Set(indexes.publishedRewardUnits.map((unit) => unit.masteryKey));
  return Object.entries(data.progress.rewardUnits)
    .filter(([key, unit]) => publishedKeys.has(unit.masteryKey || key))
    .map(([, unit]) => unit);
}

function statsFromData(data, indexes = PUNCTUATION_CONTENT_INDEXES, now = Date.now) {
  const publishedItems = indexes.items.filter((item) => indexes.skillById.get(item.skillIds?.[0])?.published);
  const snaps = publishedItems.map((item) => memorySnapshot(data.progress.items[item.id], now));
  const attempts = data.progress.attempts.length;
  const correct = data.progress.attempts.filter((attempt) => attempt.correct).length;
  const trackedRewardUnits = currentPublishedRewardUnits(data, indexes);
  const securedRewardUnitCount = trackedRewardUnits.filter(
    (entry) => normaliseTimestamp(entry.securedAt, 0) > 0,
  ).length;
  return {
    total: publishedItems.length,
    secure: snaps.filter((snap) => snap.bucket === 'secure').length,
    due: snaps.filter((snap) => snap.bucket === 'due').length,
    fresh: snaps.filter((snap) => snap.bucket === 'new').length,
    weak: snaps.filter((snap) => snap.bucket === 'weak').length,
    attempts,
    correct,
    accuracy: attempts ? Math.round((correct / attempts) * 100) : 0,
    publishedRewardUnits: indexes.publishedRewardUnits.length,
    trackedRewardUnits: trackedRewardUnits.length,
    securedRewardUnits: securedRewardUnitCount,
    sessionsCompleted: data.progress.sessionsCompleted,
  };
}

function percent(correct, attempts) {
  const total = Math.max(0, Number(attempts) || 0);
  if (!total) return null;
  return Math.round((Math.max(0, Number(correct) || 0) / total) * 100);
}

function humanLabel(value) {
  return String(value || '')
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function itemModeLabel(value) {
  return ITEM_MODE_LABELS[value] || humanLabel(value) || 'Practice item';
}

function sessionModeLabel(value) {
  return SESSION_MODE_LABELS[value] || humanLabel(value) || 'Practice session';
}

function primarySkill(indexes, skillIds = []) {
  const firstSkillId = Array.isArray(skillIds) ? skillIds.find((entry) => typeof entry === 'string' && entry) : '';
  return firstSkillId ? indexes.skillById.get(firstSkillId) : null;
}

function skillNames(indexes, skillIds = []) {
  return normaliseStringArray(skillIds)
    .map((skillId) => indexes.skillById.get(skillId)?.name || humanLabel(skillId))
    .filter(Boolean);
}

function groupAttemptAccuracy(attempts, keyFn, labelFn) {
  const groups = new Map();
  for (const attempt of attempts) {
    const id = keyFn(attempt) || 'unknown';
    const current = groups.get(id) || {
      subjectId: SUBJECT_ID,
      id,
      label: labelFn(id),
      attempts: 0,
      correct: 0,
      wrong: 0,
      accuracy: null,
    };
    current.attempts += 1;
    if (attempt.correct) current.correct += 1;
    else current.wrong += 1;
    current.accuracy = percent(current.correct, current.attempts);
    groups.set(id, current);
  }
  return [...groups.values()]
    .sort((a, b) => b.attempts - a.attempts || String(a.label).localeCompare(String(b.label)));
}

function facetRowsFromData(data, indexes, now) {
  return Object.entries(data.progress.facets || {})
    .map(([id, rawState]) => {
      const [skillId, itemMode] = id.split('::');
      const snap = memorySnapshot(rawState, now);
      const state = snap.state;
      const skill = indexes.skillById.get(skillId);
      const attempts = Number(state.attempts) || 0;
      return {
        subjectId: SUBJECT_ID,
        id,
        skillId,
        skillName: skill?.name || humanLabel(skillId),
        itemMode: itemMode || '',
        itemModeLabel: itemModeLabel(itemMode),
        label: `${skill?.name || humanLabel(skillId)} · ${itemModeLabel(itemMode)}`,
        status: snap.bucket,
        attempts,
        correct: Number(state.correct) || 0,
        wrong: Number(state.incorrect) || 0,
        accuracy: percent(state.correct, attempts),
        mastery: snap.mastery,
        dueAt: Number(state.dueAt) || 0,
        lastSeenAt: Number(state.lastSeen) || 0,
      };
    })
    .filter((entry) => entry.attempts > 0)
    .sort((a, b) => {
      const statusOrder = { weak: 0, due: 1, learning: 2, new: 3, secure: 4 };
      return (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
        || a.mastery - b.mastery
        || b.wrong - a.wrong
        || b.lastSeenAt - a.lastSeenAt
        || String(a.label).localeCompare(String(b.label));
    });
}

function recentMistakesFromAttempts(attempts, indexes) {
  return attempts
    .filter((attempt) => attempt.correct !== true)
    .slice(-8)
    .reverse()
    .map((attempt) => {
      const itemMode = attempt.itemMode || attempt.mode || '';
      const names = skillNames(indexes, attempt.skillIds);
      const primary = primarySkill(indexes, attempt.skillIds);
      return {
        subjectId: SUBJECT_ID,
        itemId: attempt.itemId || '',
        label: `${primary?.name || names[0] || 'Punctuation'} · ${itemModeLabel(itemMode)}`,
        itemMode,
        itemModeLabel: itemModeLabel(itemMode),
        sessionMode: attempt.sessionMode || 'smart',
        sessionModeLabel: sessionModeLabel(attempt.sessionMode || 'smart'),
        skillIds: normaliseStringArray(attempt.skillIds),
        skillNames: names,
        rewardUnitId: attempt.rewardUnitId || '',
        misconceptionTags: normaliseStringArray(attempt.misconceptionTags).slice(0, 6),
        facetOutcomes: Array.isArray(attempt.facetOutcomes)
          ? attempt.facetOutcomes
              .filter((facet) => facet && facet.ok !== true)
              .map((facet) => ({
                id: facet.id,
                label: facet.label || humanLabel(facet.id),
                ok: false,
              }))
              .slice(0, 6)
          : [],
        supportLevel: normaliseNonNegativeInteger(attempt.supportLevel, 0),
        supportKind: attempt.supportKind || null,
        testMode: attempt.testMode || null,
        createdAt: normaliseTimestamp(attempt.ts, 0),
      };
    });
}

function misconceptionPatternsFromAttempts(attempts) {
  const patterns = new Map();
  for (const attempt of attempts) {
    for (const tag of normaliseStringArray(attempt.misconceptionTags)) {
      const current = patterns.get(tag) || {
        subjectId: SUBJECT_ID,
        id: tag,
        label: `${humanLabel(tag)} pattern`,
        count: 0,
        lastSeenAt: 0,
        source: 'punctuation-attempts',
      };
      current.count += 1;
      current.lastSeenAt = Math.max(current.lastSeenAt, normaliseTimestamp(attempt.ts, 0));
      patterns.set(tag, current);
    }
  }
  return [...patterns.values()]
    .sort((a, b) => b.count - a.count || b.lastSeenAt - a.lastSeenAt)
    .slice(0, 8);
}

function dayIndex(value) {
  return Math.floor(normaliseTimestamp(value, 0) / DAY_MS);
}

function streakSummary(attempts, now) {
  const today = dayIndex(timestamp(now));
  const activeDays = [...new Set(attempts
    .map((attempt) => dayIndex(attempt.ts))
    .filter((day) => Number.isFinite(day) && day >= 0))]
    .sort((a, b) => a - b);
  const activeDaySet = new Set(activeDays);
  let currentDays = 0;
  for (let day = today; day >= 0 && activeDaySet.has(day); day -= 1) currentDays += 1;
  let bestDays = 0;
  let run = 0;
  let previous = null;
  for (const day of activeDays) {
    run = previous != null && day === previous + 1 ? run + 1 : 1;
    bestDays = Math.max(bestDays, run);
    previous = day;
  }
  return {
    currentDays,
    bestDays,
    activeDays: activeDays.length,
  };
}

function dailyGoalSummary(attempts, now) {
  const today = dayIndex(timestamp(now));
  const attemptsToday = attempts.filter((attempt) => dayIndex(attempt.ts) === today);
  return {
    targetAttempts: DAILY_TARGET_ATTEMPTS,
    attemptsToday: attemptsToday.length,
    correctToday: attemptsToday.filter((attempt) => attempt.correct).length,
    completed: attemptsToday.length >= DAILY_TARGET_ATTEMPTS,
    progressPercent: Math.min(100, Math.round((attemptsToday.length / DAILY_TARGET_ATTEMPTS) * 100)),
  };
}

function analyticsFromData(data, indexes = PUNCTUATION_CONTENT_INDEXES, now = Date.now) {
  const skillRows = indexes.skills.map((skill) => {
    const items = indexes.itemsBySkill.get(skill.id) || [];
    const snaps = items.map((item) => memorySnapshot(data.progress.items[item.id], now));
    const attempts = snaps.reduce((sum, snap) => sum + snap.attempts, 0);
    const correct = items.reduce((sum, item) => sum + (data.progress.items[item.id]?.correct || 0), 0);
    return {
      skillId: skill.id,
      name: skill.name,
      clusterId: skill.clusterId,
      published: Boolean(skill.published),
      attempts,
      correct,
      accuracy: attempts ? Math.round((correct / attempts) * 100) : 0,
      secure: snaps.filter((snap) => snap.secure).length,
      due: snaps.filter((snap) => snap.bucket === 'due').length,
      weak: snaps.filter((snap) => snap.bucket === 'weak').length,
      mastery: snaps.length ? Math.round(snaps.reduce((sum, snap) => sum + snap.mastery, 0) / snaps.length) : 0,
    };
  });
  const attempts = data.progress.attempts;
  const correct = attempts.filter((attempt) => attempt.correct).length;
  const weakestFacets = facetRowsFromData(data, indexes, now);
  return {
    releaseId: PUNCTUATION_RELEASE_ID,
    attempts: attempts.length,
    correct,
    accuracy: attempts.length ? Math.round((correct / attempts.length) * 100) : 0,
    sessionsCompleted: data.progress.sessionsCompleted,
    skillRows,
    rewardUnits: currentPublishedRewardUnits(data, indexes),
    bySessionMode: groupAttemptAccuracy(attempts, (attempt) => attempt.sessionMode || 'smart', sessionModeLabel),
    byItemMode: groupAttemptAccuracy(attempts, (attempt) => attempt.itemMode || attempt.mode || 'unknown', itemModeLabel),
    weakestFacets: weakestFacets.slice(0, 8),
    recentMistakes: recentMistakesFromAttempts(attempts, indexes),
    misconceptionPatterns: misconceptionPatternsFromAttempts(attempts),
    dailyGoal: dailyGoalSummary(attempts, now),
    streak: streakSummary(attempts, now),
  };
}

function activePracticeSessionRecord(learnerId, state, now) {
  const session = state.session;
  if (!session) return null;
  return {
    id: session.id,
    learnerId,
    subjectId: SUBJECT_ID,
    sessionKind: session.mode || 'smart',
    status: 'active',
    sessionState: cloneSerialisable(session),
    summary: null,
    createdAt: session.startedAt || timestamp(now),
    updatedAt: timestamp(now),
  };
}

function completedPracticeSessionRecord(learnerId, session, summary, now) {
  return {
    id: session?.id || uid('punctuation-session', now),
    learnerId,
    subjectId: SUBJECT_ID,
    sessionKind: session?.mode || 'smart',
    status: 'completed',
    sessionState: null,
    summary: cloneSerialisable(summary),
    createdAt: session?.startedAt || timestamp(now),
    updatedAt: timestamp(now),
  };
}

function abandonedPracticeSessionRecord(learnerId, session, now) {
  if (!session) return null;
  return {
    id: session.id,
    learnerId,
    subjectId: SUBJECT_ID,
    sessionKind: session.mode || 'smart',
    status: 'abandoned',
    sessionState: cloneSerialisable(session),
    summary: null,
    createdAt: session.startedAt || timestamp(now),
    updatedAt: timestamp(now),
  };
}

function roundLengthFromPrefs(prefs = {}) {
  const value = normalisePunctuationRoundLength(prefs.roundLength || prefs.length);
  if (value === 'all') return 8;
  return Math.max(1, Number.parseInt(value, 10) || 4);
}

function roundLengthForSession(prefs = {}, options = {}) {
  if (prefs.mode !== 'gps') return roundLengthFromPrefs(prefs);
  const value = normalisePunctuationRoundLength(options.testLength ?? options.roundLength ?? options.length ?? prefs.roundLength);
  if (value === 'all') return 8;
  return Math.min(MAX_GPS_QUEUE_LENGTH, Math.max(1, Number.parseInt(value, 10) || 4));
}

function prefsForSession(session = {}, fallback = {}) {
  return normalisePunctuationPrefs({
    ...fallback,
    mode: session.mode || fallback.mode,
    roundLength: session.length || fallback.roundLength || fallback.length,
  });
}

function answerDisplayText(item, answer = {}) {
  if (item?.mode === 'choose') {
    const index = parseChoiceIndex(answer.choiceIndex ?? answer.value ?? answer.typed);
    const option = index != null && Array.isArray(item.options)
      ? item.options.find((entry, fallbackIndex) => {
          if (isPlainObject(entry)) return Number(entry.index) === index;
          return fallbackIndex === index;
        })
      : null;
    if (isPlainObject(option)) return normaliseAnswerText(option.text);
    if (typeof option === 'string') return normaliseAnswerText(option);
    return index != null ? `Choice ${index + 1}` : '';
  }
  return normaliseAnswerText(answer.typed ?? answer.answer ?? '');
}

function punctuationAnswerTextHasContent(value) {
  return normaliseAnswerText(value).length > 0;
}

function isMeaningfulPunctuationAnswer(item, answer = {}) {
  if (item?.inputKind === 'choice' || item?.mode === 'choose') {
    const raw = isPlainObject(answer) ? answer.choiceIndex ?? answer.value ?? answer.typed : answer;
    return parseChoiceIndex(raw) != null;
  }
  const rawText = isPlainObject(answer)
    ? answer.typed ?? answer.answer ?? answer.paragraph ?? answer.text ?? ''
    : answer;
  return punctuationAnswerTextHasContent(rawText);
}

function reviewItemFromResult({ item, answer, result }) {
  return {
    itemId: item.id,
    mode: item.mode,
    skillIds: Array.isArray(item.skillIds) ? [...item.skillIds] : [],
    rewardUnitId: item.rewardUnitId || '',
    prompt: item.prompt || '',
    stem: item.stem || '',
    attemptedAnswer: answerDisplayText(item, answer),
    displayCorrection: result.expected || item.model || '',
    explanation: item.explanation || result.note || '',
    correct: result.correct === true,
    misconceptionTags: Array.isArray(result.misconceptionTags) ? [...result.misconceptionTags] : [],
    facets: Array.isArray(result.facets) ? result.facets.map(normaliseFacetForReview).filter(Boolean) : [],
  };
}

function resultFromReviewResponse(response = {}) {
  return {
    correct: response.correct === true,
    expected: response.displayCorrection || '',
    note: response.explanation || '',
    misconceptionTags: normaliseStringArray(response.misconceptionTags),
    facets: Array.isArray(response.facets) ? response.facets.map(normaliseFacetForReview).filter(Boolean) : [],
  };
}

function applyMarkedAttemptToProgress({
  data,
  indexes,
  session,
  item,
  result,
  nowValue,
  supportLevel = 0,
  meaningfulAttempt = true,
} = {}) {
  const guidedSupport = supportLevel > 0;
  const rewardUnit = rewardUnitForItem(indexes, item);

  data.progress.items[item.id] = updateMemoryState(data.progress.items[item.id], result.correct, nowValue, {
    supported: guidedSupport,
  });
  for (const skillId of item.skillIds || []) {
    data.progress.facets[facetKey(skillId, item.mode)] = updateMemoryState(
      data.progress.facets[facetKey(skillId, item.mode)],
      result.correct,
      nowValue,
      { supported: guidedSupport },
    );
  }

  const nextItemSnap = memorySnapshot(data.progress.items[item.id], nowValue);
  const securedRows = [];
  if (rewardUnit && nextItemSnap.secure && !data.progress.rewardUnits[rewardUnit.masteryKey]) {
    data.progress.rewardUnits[rewardUnit.masteryKey] = {
      masteryKey: rewardUnit.masteryKey,
      releaseId: rewardUnit.releaseId,
      clusterId: rewardUnit.clusterId,
      rewardUnitId: rewardUnit.rewardUnitId,
      securedAt: nowValue,
    };
    securedRows.push({ masteryKey: rewardUnit.masteryKey, item, rewardUnit });
  }

  data.progress.attempts.push({
    ts: nowValue,
    sessionId: session.id,
    itemId: item.id,
    variantSignature: item.variantSignature || '',
    mode: item.mode,
    itemMode: item.mode,
    skillIds: item.skillIds || [],
    rewardUnitId: item.rewardUnitId || '',
    sessionMode: session.mode || '',
    testMode: session.mode === 'gps' ? 'gps' : null,
    supportLevel,
    supportKind: supportLevel > 0 ? 'guided' : null,
    meaningful: meaningfulAttempt !== false,
    correct: result.correct,
    misconceptionTags: result.misconceptionTags || [],
    facetOutcomes: Array.isArray(result.facets)
      ? result.facets.map(normaliseFacetForReview).filter(Boolean)
      : [],
  });
  data.progress.attempts = data.progress.attempts.slice(-1000);

  return { securedRows };
}

function attemptEventsForReviewResponses({ learnerId, session, responses, indexes, createdAt }) {
  const events = [];
  for (const [index, response] of responses.entries()) {
    const item = itemForId(indexes, response.itemId);
    if (!item) continue;
    const eventSession = {
      ...session,
      answeredCount: index,
    };
    const result = resultFromReviewResponse(response);
    events.push(createPunctuationItemAttemptedEvent({
      learnerId,
      session: eventSession,
      item,
      result,
      answer: response.attemptedAnswer || '',
      createdAt,
    }));
    events.push(...createPunctuationMisconceptionObservedEvents({
      learnerId,
      session: eventSession,
      item,
      result,
      createdAt,
    }));
  }
  return events;
}

function unitEventsForSecuredRows({ learnerId, session, securedRows, createdAt }) {
  return securedRows.map(({ masteryKey, item, rewardUnit }) => createPunctuationUnitSecuredEvent({
    learnerId,
    session,
    item,
    rewardUnit,
    masteryKey,
    createdAt,
  }));
}

function gpsRecommendedMode(responses = []) {
  const missed = responses.filter((entry) => entry && entry.correct !== true);
  if (missed.length) {
    return {
      recommendedMode: 'weak',
      recommendedLabel: 'Weak spots',
    };
  }
  return {
    recommendedMode: 'smart',
    recommendedLabel: 'Smart review',
  };
}

// Phase 4 U5 review follow-on (FINDING A — scaffold-without-producer):
// `skillsExercised` is the dedup-flat set of skillIds the learner touched
// across every item surfaced this round. Derived from `session.recentItemIds`
// via `indexes.itemById` so the producer reads the same source of truth as
// `sessionFocus()` (which narrows to the wobbly subset). Empty when the
// session has no recent items (e.g. an end-without-any-answer). Pre-fix, the
// field was absent and the normaliser coerced it to `[]`, so `SkillsExercisedRow`
// never rendered in production — three of U5's four marquee features were
// dead UX (adversarial + correctness + testing converged finding).
function sessionSkillsExercised(session = {}, indexes = PUNCTUATION_CONTENT_INDEXES) {
  const recent = Array.isArray(session.recentItemIds) ? session.recentItemIds : [];
  if (!recent.length) return [];
  const seen = new Set();
  const ordered = [];
  for (const itemId of recent) {
    const item = indexes.itemById.get(itemId);
    if (!item) continue;
    const skillIds = Array.isArray(item.skillIds) ? item.skillIds : [];
    for (const skillId of skillIds) {
      if (typeof skillId !== 'string' || !skillId || seen.has(skillId)) continue;
      seen.add(skillId);
      ordered.push(skillId);
    }
  }
  return ordered;
}

// Phase 5 U2: count-based stage helper mirroring `stageFor(n, PUNCTUATION_MASTERED_THRESHOLDS)`
// in `src/platform/game/monsters.js`. Inlined here so the Worker-bundled
// service does NOT depend on platform/game imports. The threshold values
// [1, 1, 2, 4, 14] MUST match PUNCTUATION_MASTERED_THRESHOLDS in monsters.js.
// A parity test in `tests/punctuation-mastery.test.js` asserts identical
// results for all n in 0..15.
export function punctuationSessionSummaryStage(mastered) {
  const thresholds = [1, 1, 2, 4, 14];
  const count = Number(mastered) || 0;
  for (let stage = 4; stage >= 1; stage -= 1) {
    if (count >= thresholds[stage]) return stage;
  }
  return 0;
}

// Phase 4 U5 review follow-on (FINDING A): derive a single stage delta for
// the monster-progress teaser from the session's `securedUnits` (just-added
// this round) + `data.progress.rewardUnits` (total after). Reconstructs the
// before-round mastered count per monster and compares stages. Returns the
// first advancing active-monster delta in roster order (never the grand
// monster `quoral`, which aggregates and would double-up with a direct
// monster advance — the scene's `extractMonsterProgress` filter would reject
// reserved ids anyway; excluding `quoral` here keeps the scalar signal
// monster-specific). Returns null when no active monster advanced — the
// scene then renders no teaser and emits no telemetry, same as today's
// fallback (fixture-only) path. Does NOT touch engine files (scheduler,
// marking, generators, content): reads the already-tracked `session.securedUnits`
// + `data.progress.rewardUnits` and consults `indexes.rewardUnitByKey` +
// `indexes.clusterById` — indexes already built at service-init time.
const PUNCTUATION_ACTIVE_MONSTER_ROSTER = Object.freeze(['pealark', 'claspin', 'curlune', 'quoral']);
const PUNCTUATION_GRAND_ROSTER_MONSTER_ID = 'quoral';

function monsterProgressForSession(session = {}, data = {}, indexes = PUNCTUATION_CONTENT_INDEXES) {
  const securedThisRound = normaliseStringArray(session?.securedUnits);
  if (!securedThisRound.length) return null;
  const progressRewardUnits = (data && data.progress && isPlainObject(data.progress.rewardUnits))
    ? data.progress.rewardUnits
    : {};
  const afterKeys = Object.keys(progressRewardUnits);
  if (!afterKeys.length) return null;
  const securedSet = new Set(securedThisRound);

  // Published-reward-unit total per active monster (denominator). We only
  // count published units on the active roster; the grand monster is
  // excluded because it aggregates across all monsters and reporting an
  // advance there would duplicate the direct monster signal.
  const publishedPerMonster = new Map();
  for (const unit of indexes.publishedRewardUnits || []) {
    const cluster = indexes.clusterById.get(unit.clusterId);
    const monsterId = cluster && typeof cluster.monsterId === 'string' ? cluster.monsterId : '';
    if (!monsterId || monsterId === PUNCTUATION_GRAND_ROSTER_MONSTER_ID) continue;
    publishedPerMonster.set(monsterId, (publishedPerMonster.get(monsterId) || 0) + 1);
  }

  // Count secured reward units per monster, before and after this round.
  const afterPerMonster = new Map();
  const beforePerMonster = new Map();
  for (const masteryKey of afterKeys) {
    const unit = indexes.rewardUnitByKey.get(masteryKey);
    if (!unit) continue;
    const cluster = indexes.clusterById.get(unit.clusterId);
    const monsterId = cluster && typeof cluster.monsterId === 'string' ? cluster.monsterId : '';
    if (!monsterId || monsterId === PUNCTUATION_GRAND_ROSTER_MONSTER_ID) continue;
    afterPerMonster.set(monsterId, (afterPerMonster.get(monsterId) || 0) + 1);
    if (!securedSet.has(masteryKey)) {
      beforePerMonster.set(monsterId, (beforePerMonster.get(monsterId) || 0) + 1);
    }
  }

  // First advancing active monster in roster order. Roster order is
  // deterministic so multi-monster rounds (rare — a 4-item round would
  // need to secure reward units spanning two monsters) report the same
  // monster every time, making test fixtures and Admin replay stable.
  for (const monsterId of PUNCTUATION_ACTIVE_MONSTER_ROSTER) {
    if (monsterId === PUNCTUATION_GRAND_ROSTER_MONSTER_ID) continue;
    const after = afterPerMonster.get(monsterId) || 0;
    const before = beforePerMonster.get(monsterId) || 0;
    if (after <= before) continue;
    const publishedTotal = publishedPerMonster.get(monsterId) || 0;
    const stageTo = punctuationSessionSummaryStage(after, publishedTotal);
    const stageFrom = punctuationSessionSummaryStage(before, publishedTotal);
    if (stageTo > stageFrom) {
      return { monsterId, stageFrom, stageTo };
    }
  }
  return null;
}

function sessionSummary(session, data, indexes, now = Date.now) {
  const total = Number(session?.answeredCount) || 0;
  const correct = Number(session?.correctCount) || 0;
  const summary = {
    label: 'Punctuation session summary',
    message: session?.mode === 'gps' && total ? 'GPS test complete.' : (total ? 'Session complete.' : 'Session ended.'),
    total,
    correct,
    accuracy: total ? Math.round((correct / total) * 100) : 0,
    sessionId: session?.id || null,
    completedAt: timestamp(now),
    focus: sessionFocus(session, indexes),
    // Phase 4 U5 review follow-on (FINDING A): wire producer so the Summary
    // scene's SkillsExercisedRow + MonsterProgressTeaser + `monster-
    // progress-changed` emit fire in production. Prior to this fix, these
    // fields were absent from the payload and the normaliser's default
    // coercion to `[]` / `null` meant three U5 marquee features were dead
    // UX outside of tests that hand-seeded `extraSummary`.
    skillsExercised: sessionSkillsExercised(session, indexes),
    monsterProgress: monsterProgressForSession(session, data, indexes),
    securedUnits: normaliseStringArray(session?.securedUnits),
    misconceptionTags: normaliseStringArray(session?.misconceptionTags),
    publishedScope: PUNCTUATION_CONTENT_MANIFEST.publishedScopeCopy,
    rewardProgress: {
      secured: currentPublishedRewardUnits(data, indexes).length,
      published: indexes.publishedRewardUnits.length,
    },
  };
  if (session?.mode === 'gps') {
    const reviewItems = Array.isArray(session.gps?.responses)
      ? session.gps.responses.map((entry, index) => ({
          index: index + 1,
          ...normaliseGpsResponse(entry),
        })).filter((entry) => entry.itemId)
      : [];
    summary.label = 'Punctuation GPS test summary';
    summary.gps = {
      delayedFeedback: true,
      ...gpsRecommendedMode(reviewItems),
      reviewItems,
    };
  }
  return summary;
}

function buildGpsQueue({ session, data, indexes, prefs, now, random }) {
  const length = Math.min(MAX_GPS_QUEUE_LENGTH, Math.max(1, Number(session.length) || 4));
  const queue = [];
  let draftSession = {
    ...session,
    recentItemIds: [],
    currentItemId: '',
    answeredCount: 0,
  };
  for (let index = 0; index < length; index += 1) {
    const selection = selectPunctuationItem({
      indexes,
      progress: data.progress,
      session: { ...draftSession, answeredCount: index },
      prefs,
      now,
      random,
    });
    if (!selection.item) break;
    queue.push(selection.item.id);
    draftSession = {
      ...draftSession,
      currentItemId: selection.item.id,
      recentItemIds: [...draftSession.recentItemIds, selection.item.id].slice(-10),
    };
  }
  return queue;
}

function selectionForSession({ session, data, indexes, prefs, now, random }) {
  if (session.mode === 'gps') {
    const queueItemIds = Array.isArray(session.gps?.queueItemIds) ? session.gps.queueItemIds : [];
    const nextItemId = queueItemIds[session.answeredCount] || '';
    const item = itemForId(indexes, nextItemId);
    if (item) {
      return {
        item,
        weakFocus: null,
      };
    }
    throw serviceError(
      'punctuation_gps_queue_stale',
      'The fixed Punctuation GPS queue no longer matches the active content release.',
      {
        itemId: nextItemId,
        answeredCount: session.answeredCount,
        queueLength: queueItemIds.length,
      },
    );
  }
  return selectPunctuationItem({
    indexes,
    progress: data.progress,
    session,
    prefs,
    now,
    random,
  });
}

function nextActiveState({ learnerId, session, data, indexes, prefs, now, random }) {
  const selection = selectionForSession({ session, data, indexes, prefs, now, random });
  if (!selection.item) {
    throw serviceError('punctuation_content_unavailable', 'No published Punctuation content is available.');
  }
  const nextSession = {
    ...session,
    phase: 'active-item',
    updatedAt: timestamp(now),
    currentItemId: selection.item.id,
    currentItem: normaliseItemForState(selection.item),
    recentItemIds: [...(session.recentItemIds || []), selection.item.id].slice(-10),
    weakFocus: session.mode === 'weak' ? normaliseWeakFocus(selection.weakFocus) : null,
  };
  return {
    version: PUNCTUATION_SERVICE_STATE_VERSION,
    phase: 'active-item',
    session: nextSession,
    feedback: null,
    summary: null,
    error: '',
    availability: { status: 'ready', code: null, message: '' },
    learnerId,
  };
}

function readData(repository, learnerId) {
  return normalisePunctuationData(repository.readData?.(learnerId));
}

function writeData(repository, learnerId, data) {
  return repository.writeData?.(learnerId, normalisePunctuationData(data)) || normalisePunctuationData(data);
}

function syncPracticeSession(repository, learnerId, state, now) {
  if (state.phase === 'active-item' || state.phase === 'feedback') {
    return repository.syncPracticeSession?.(learnerId, state, activePracticeSessionRecord(learnerId, state, now)) || null;
  }
  if (state.phase === 'summary') {
    return repository.syncPracticeSession?.(
      learnerId,
      state,
      completedPracticeSessionRecord(learnerId, state.session, state.summary, now),
    ) || null;
  }
  return null;
}

export function createPunctuationService({
  repository = createNoopRepository(),
  now = Date.now,
  random = Math.random,
  manifest = createPunctuationRuntimeManifest({
    manifest: PUNCTUATION_CONTENT_MANIFEST,
    generatedPerFamily: GENERATED_ITEMS_PER_FAMILY,
  }),
  indexes = createPunctuationContentIndexes(manifest),
} = {}) {
  const clock = () => timestamp(now);
  const activeReleaseId = manifest.releaseId || PUNCTUATION_RELEASE_ID;

  function assertGpsReleaseCurrent(session, command) {
    if (session?.mode !== 'gps') return;
    const sessionReleaseId = typeof session.releaseId === 'string' && session.releaseId
      ? session.releaseId
      : PUNCTUATION_RELEASE_ID;
    if (sessionReleaseId === activeReleaseId) return;
    throw serviceError(
      'punctuation_gps_release_stale',
      'The active Punctuation GPS test was started against an older content release.',
      {
        command,
        sessionId: typeof session.id === 'string' ? session.id : '',
        sessionReleaseId,
        releaseId: activeReleaseId,
      },
    );
  }

  function assertExpectedSessionContext(session, expectedContext, command) {
    if (!session) return;
    const context = isPlainObject(expectedContext) ? expectedContext : {};
    const expectedSessionId = typeof context.expectedSessionId === 'string' && context.expectedSessionId
      ? context.expectedSessionId
      : null;
    const expectedItemId = typeof context.expectedItemId === 'string' && context.expectedItemId
      ? context.expectedItemId
      : null;
    const expectedReleaseId = typeof context.expectedReleaseId === 'string' && context.expectedReleaseId
      ? context.expectedReleaseId
      : null;
    const rawExpectedAnsweredCount = context.expectedAnsweredCount;
    const hasExpectedAnsweredCount = (
      (typeof rawExpectedAnsweredCount === 'number' || typeof rawExpectedAnsweredCount === 'string')
      && rawExpectedAnsweredCount !== ''
      && Number.isFinite(Number(rawExpectedAnsweredCount))
    );
    const expectedAnsweredCount = hasExpectedAnsweredCount ? Number(rawExpectedAnsweredCount) : null;
    const requiresExpectedContext = session.mode === 'gps';
    const missingRequiredContext = requiresExpectedContext && (
      !expectedSessionId
      || !expectedItemId
      || !expectedReleaseId
      || !hasExpectedAnsweredCount
    );

    if (
      missingRequiredContext
      || (expectedSessionId && expectedSessionId !== session.id)
      || (expectedItemId && expectedItemId !== session.currentItemId)
      || (expectedReleaseId && expectedReleaseId !== session.releaseId)
      || (hasExpectedAnsweredCount && expectedAnsweredCount !== session.answeredCount)
    ) {
      throw serviceError(
        'punctuation_command_stale',
        'The Punctuation command no longer matches the active session item.',
        {
          command,
          expectedSessionId,
          sessionId: session.id || '',
          expectedItemId,
          itemId: session.currentItemId || '',
          expectedAnsweredCount,
          answeredCount: session.answeredCount,
          expectedReleaseId,
          releaseId: session.releaseId || '',
          missingExpectedContext: missingRequiredContext,
        },
      );
    }
  }

  function requireActiveItem(ui, command = 'submit-answer') {
    const state = normaliseState(ui);
    if (state.phase !== 'active-item' || !state.session?.currentItemId) {
      throw serviceError('punctuation_session_stale', 'There is no active Punctuation item to submit.', {
        command,
        phase: state.phase,
      });
    }
    assertGpsReleaseCurrent(state.session, command);
    return state;
  }

  function requireFeedback(ui, command = 'continue-session') {
    const state = normaliseState(ui);
    if (state.phase !== 'feedback' || !state.session) {
      throw serviceError('punctuation_transition_invalid', 'This Punctuation command is not valid in the current phase.', {
        command,
        phase: state.phase,
      });
    }
    return state;
  }

  function finaliseGpsSession({ learnerId, state, data, session, responses, nowValue }) {
    assertGpsReleaseCurrent(session, 'finalise-gps');
    const securedRows = [];
    const resolvedResponses = responses.map((response, index) => {
      const responseItem = itemForId(indexes, response.itemId);
      if (!responseItem) {
        throw serviceError(
          'punctuation_gps_response_stale',
          'A completed Punctuation GPS response no longer matches the active content release.',
          {
            itemId: response.itemId,
            responseIndex: index,
            sessionId: session.id,
          },
        );
      }
      return { index, response, responseItem };
    });
    for (const { index, response, responseItem } of resolvedResponses) {
      const applied = applyMarkedAttemptToProgress({
        data,
        indexes,
        session: { ...session, answeredCount: index },
        item: responseItem,
        result: resultFromReviewResponse(response),
        nowValue,
        supportLevel: 0,
        meaningfulAttempt: punctuationAnswerTextHasContent(response.attemptedAnswer),
      });
      securedRows.push(...applied.securedRows);
    }
    const nextSession = {
      ...session,
      securedUnits: [...new Set([
        ...(session.securedUnits || []),
        ...securedRows.map((entry) => entry.masteryKey),
      ])],
    };
    data.progress.sessionsCompleted += responses.length > 0 ? 1 : 0;
    writeData(repository, learnerId, data);
    const summary = sessionSummary(nextSession, data, indexes, clock);
    const nextState = {
      ...state,
      phase: 'summary',
      session: nextSession,
      feedback: null,
      summary,
      error: '',
    };
    syncPracticeSession(repository, learnerId, nextState, clock);
    const events = responses.length > 0
      ? [
          ...attemptEventsForReviewResponses({
            learnerId,
            session: nextSession,
            responses,
            indexes,
            createdAt: nowValue,
          }),
          ...unitEventsForSecuredRows({
            learnerId,
            session: nextSession,
            securedRows,
            createdAt: nowValue,
          }),
          createPunctuationSessionCompletedEvent({ learnerId, session: nextSession, summary, createdAt: nowValue }),
        ]
      : [];
    return stateTransition(nextState, { events });
  }

  const service = {
    initState(rawState) {
      return normaliseState(rawState);
    },
    getPrefs(learnerId) {
      return cloneSerialisable(readData(repository, learnerId).prefs);
    },
    savePrefs(learnerId, patch = {}) {
      const current = readData(repository, learnerId);
      const next = {
        ...current,
        prefs: normalisePunctuationPrefs({
          ...current.prefs,
          ...(isPlainObject(patch) ? patch : {}),
        }),
      };
      return cloneSerialisable(writeData(repository, learnerId, next).prefs);
    },
    getStats(learnerId) {
      return statsFromData(readData(repository, learnerId), indexes, clock);
    },
    getAnalyticsSnapshot(learnerId) {
      return analyticsFromData(readData(repository, learnerId), indexes, clock);
    },
    startSession(learnerId, options = {}) {
      const current = readData(repository, learnerId);
      const prefs = normalisePunctuationPrefs({ ...current.prefs, ...options });
      const requestedGuidedSkillId = typeof options?.skillId === 'string'
        ? options.skillId
        : (typeof options?.guidedSkillId === 'string' ? options.guidedSkillId : null);
      const guidedSkillId = prefs.mode === 'guided'
        ? chooseGuidedSkill(current, indexes, requestedGuidedSkillId, clock)
        : null;
      const session = {
        id: uid('punctuation-session', clock, random),
        releaseId: activeReleaseId,
        mode: prefs.mode,
        length: roundLengthForSession(prefs, options),
        phase: 'active-item',
        startedAt: clock(),
        updatedAt: clock(),
        answeredCount: 0,
        correctCount: 0,
        currentItemId: '',
        currentItem: null,
        recentItemIds: [],
        securedUnits: [],
        misconceptionTags: [],
        guidedSkillId,
        guidedSupportLevel: guidedSkillId ? 2 : 0,
        guided: guidedSkillId ? guidedSessionReadModel(guidedSkillId, 2) : null,
        weakFocus: null,
        gps: prefs.mode === 'gps' ? { queueItemIds: [], responses: [], delayedFeedback: true } : null,
      };
      if (session.mode === 'gps') {
        session.gps.queueItemIds = buildGpsQueue({
          session,
          data: current,
          indexes,
          prefs,
          now: clock,
          random,
        });
        session.length = session.gps.queueItemIds.length || session.length;
      }
      const state = nextActiveState({ learnerId, session, data: current, indexes, prefs, now: clock, random });
      syncPracticeSession(repository, learnerId, state, clock);
      return stateTransition(state);
    },
    submitAnswer(learnerId, uiState, rawAnswer = '', expectedContext = {}) {
      const state = requireActiveItem(uiState, 'submit-answer');
      assertExpectedSessionContext(state.session, expectedContext, 'submit-answer');
      const data = readData(repository, learnerId);
      const item = itemForId(indexes, state.session.currentItemId);
      if (!item) {
        throw serviceError('punctuation_item_unsupported', 'The active Punctuation item is no longer available.', {
          itemId: state.session.currentItemId,
        });
      }
      const answer = isPlainObject(rawAnswer)
        ? rawAnswer
        : { typed: normaliseAnswerText(rawAnswer) };
      const result = markPunctuationAnswer({ item, answer });
      const nowValue = clock();
      const supportLevel = state.session.mode === 'guided'
        ? normaliseNonNegativeInteger(state.session.guidedSupportLevel, 0)
        : 0;
      const reviewResponse = reviewItemFromResult({ item, answer, result });
      const meaningfulAttempt = isMeaningfulPunctuationAnswer(item, answer);
      if (state.session.mode === 'gps') {
        const gps = normaliseGpsSession(state.session.gps);
        const nextResponses = [...gps.responses, reviewResponse].slice(0, MAX_GPS_QUEUE_LENGTH);
        const nextSession = {
          ...state.session,
          phase: 'active-item',
          answeredCount: state.session.answeredCount + 1,
          correctCount: state.session.correctCount + (result.correct ? 1 : 0),
          updatedAt: nowValue,
          securedUnits: normaliseStringArray(state.session.securedUnits),
          misconceptionTags: [...new Set([...(state.session.misconceptionTags || []), ...(result.misconceptionTags || [])])],
          guided: null,
          guidedSupportLevel: 0,
          gps: {
            ...gps,
            responses: nextResponses,
            delayedFeedback: true,
          },
        };

        if (nextSession.answeredCount >= nextSession.length) {
          return finaliseGpsSession({
            learnerId,
            state,
            data,
            session: nextSession,
            responses: nextResponses,
            nowValue,
          });
        }

        const nextState = nextActiveState({
          learnerId,
          session: nextSession,
          data,
          indexes,
          prefs: prefsForSession(nextSession, data.prefs),
          now: clock,
          random,
        });
        syncPracticeSession(repository, learnerId, nextState, clock);
        return stateTransition(nextState, { events: [] });
      }

      const { securedRows } = applyMarkedAttemptToProgress({
        data,
        indexes,
        session: state.session,
        item,
        result,
        nowValue,
        supportLevel,
        meaningfulAttempt,
      });
      const securedUnits = securedRows.map((entry) => entry.masteryKey);
      writeData(repository, learnerId, data);

      const nextSession = {
        ...state.session,
        phase: 'feedback',
        answeredCount: state.session.answeredCount + 1,
        correctCount: state.session.correctCount + (result.correct ? 1 : 0),
        updatedAt: nowValue,
        securedUnits: [...new Set([...(state.session.securedUnits || []), ...securedUnits])],
        misconceptionTags: [...new Set([...(state.session.misconceptionTags || []), ...(result.misconceptionTags || [])])],
        guidedSupportLevel: state.session.mode === 'guided'
          ? (result.correct ? Math.max(0, supportLevel - 1) : 2)
          : 0,
      };
      nextSession.guided = state.session.mode === 'guided'
        ? guidedSessionReadModel(nextSession.guidedSkillId, nextSession.guidedSupportLevel)
        : null;
      const feedback = {
        kind: result.correct ? 'success' : 'error',
        headline: result.correct ? 'Correct.' : 'Not quite.',
        body: result.note || item.explanation || '',
        attemptedAnswer: answerDisplayText(item, answer),
        displayCorrection: result.expected || item.model || '',
        explanation: item.explanation || '',
        misconceptionTags: result.misconceptionTags || [],
        facets: result.facets || [],
      };
      const nextState = {
        ...state,
        phase: 'feedback',
        session: nextSession,
        feedback,
        summary: null,
        error: '',
      };
      syncPracticeSession(repository, learnerId, nextState, clock);

      const attemptEvent = createPunctuationItemAttemptedEvent({
        learnerId,
        session: state.session,
        item,
        result,
        answer: feedback.attemptedAnswer,
        createdAt: nowValue,
      });
      const misconceptionEvents = createPunctuationMisconceptionObservedEvents({
        learnerId,
        session: state.session,
        item,
        result,
        createdAt: nowValue,
      });
      const unitEvents = unitEventsForSecuredRows({
        learnerId,
        session: state.session,
        securedRows,
        createdAt: nowValue,
      });

      return stateTransition(nextState, {
        events: [attemptEvent, ...misconceptionEvents, ...unitEvents],
      });
    },
    continueSession(learnerId, uiState) {
      const state = requireFeedback(uiState, 'continue-session');
      const data = readData(repository, learnerId);
      if (state.session.answeredCount >= state.session.length) {
        data.progress.sessionsCompleted += 1;
        writeData(repository, learnerId, data);
        const summary = sessionSummary(state.session, data, indexes, clock);
        const nextState = {
          ...state,
          phase: 'summary',
          feedback: state.feedback,
          summary,
          error: '',
        };
        syncPracticeSession(repository, learnerId, nextState, clock);
        return stateTransition(nextState, {
          events: [createPunctuationSessionCompletedEvent({ learnerId, session: state.session, summary, createdAt: clock() })],
        });
      }
      const nextState = nextActiveState({
        learnerId,
        session: { ...state.session, phase: 'active-item' },
        data,
        indexes,
        prefs: prefsForSession(state.session, data.prefs),
        now: clock,
        random,
      });
      syncPracticeSession(repository, learnerId, nextState, clock);
      return stateTransition(nextState);
    },
    skipItem(learnerId, uiState, expectedContext = {}) {
      const state = requireActiveItem(uiState, 'skip-item');
      assertExpectedSessionContext(state.session, expectedContext, 'skip-item');
      if (state.session.mode === 'gps') {
        return service.submitAnswer(learnerId, state, state.session.currentItem?.inputKind === 'choice'
          ? { choiceIndex: null }
          : { typed: '' }, expectedContext);
      }
      const data = readData(repository, learnerId);
      const nextSession = {
        ...state.session,
        answeredCount: state.session.answeredCount + 1,
      };
      if (nextSession.answeredCount >= nextSession.length) {
        data.progress.sessionsCompleted += 1;
        writeData(repository, learnerId, data);
        const summary = sessionSummary(nextSession, data, indexes, clock);
        const nextState = {
          ...state,
          phase: 'summary',
          session: nextSession,
          feedback: null,
          summary,
          error: '',
        };
        syncPracticeSession(repository, learnerId, nextState, clock);
        return stateTransition(nextState, {
          events: [createPunctuationSessionCompletedEvent({ learnerId, session: nextSession, summary, createdAt: clock() })],
        });
      }
      const nextState = nextActiveState({
        learnerId,
        session: nextSession,
        data,
        indexes,
        prefs: prefsForSession(nextSession, data.prefs),
        now: clock,
        random,
      });
      syncPracticeSession(repository, learnerId, nextState, clock);
      return stateTransition(nextState);
    },
    endSession(learnerId, uiState, expectedContext = {}) {
      const state = normaliseState(uiState);
      if (!state.session) return stateTransition(createInitialPunctuationState());
      if (state.phase === 'summary') return stateTransition(state, { changed: false });
      assertGpsReleaseCurrent(state.session, state.session.mode === 'gps' ? 'finalise-gps' : 'end-session');
      assertExpectedSessionContext(state.session, expectedContext, 'end-session');
      const data = readData(repository, learnerId);
      if (state.session.mode === 'gps') {
        const nowValue = clock();
        const gps = normaliseGpsSession(state.session.gps);
        const responses = gps.responses;
        const nextSession = {
          ...state.session,
          answeredCount: responses.length,
          correctCount: responses.filter((response) => response.correct).length,
          gps: {
            ...gps,
            responses,
            delayedFeedback: true,
          },
          misconceptionTags: [...new Set(responses.flatMap((response) => response.misconceptionTags || []))],
        };
        return finaliseGpsSession({
          learnerId,
          state,
          data,
          session: nextSession,
          responses,
          nowValue,
        });
      }
      data.progress.sessionsCompleted += state.session.answeredCount > 0 ? 1 : 0;
      writeData(repository, learnerId, data);
      const summary = sessionSummary(state.session, data, indexes, clock);
      const nextState = {
        ...state,
        phase: 'summary',
        feedback: state.feedback,
        summary,
        error: '',
      };
      syncPracticeSession(repository, learnerId, nextState, clock);
      return stateTransition(nextState, {
        events: [createPunctuationSessionCompletedEvent({ learnerId, session: state.session, summary, createdAt: clock() })],
      });
    },
    abandonSession(learnerId, uiState) {
      const state = normaliseState(uiState);
      if (state.session) {
        repository.abandonPracticeSession?.(learnerId, state, abandonedPracticeSessionRecord(learnerId, state.session, clock));
      }
      return stateTransition(createInitialPunctuationState());
    },
    resetLearner(learnerId) {
      repository.resetLearner?.(learnerId);
      return stateTransition(createInitialPunctuationState());
    },
  };

  service.markServerOwnedState = markServerOwnedState;
  return service;
}
