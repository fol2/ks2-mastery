// row-transforms.js — Pure row-transform functions and their associated
// constants. Extracted from repository.js (P4 U9) with ZERO behaviour
// change. Every exported symbol is barrel-re-exported from repository.js
// so existing consumers are unaffected.
//
// "Pure" means: row/record in → record out, no `db` parameter, no service
// construction, no async. Functions that instantiate services
// (redactPunctuationUiForClient), are async (publicSubjectStateRowToRecord),
// or take `db` (mergePublicSpellingCodexState) remain in repository.js.

import {
  cloneSerialisable,
  normaliseSubjectStateRecord,
  normalisePracticeSessionRecord,
} from '../../src/platform/core/repositories/helpers.js';
import {
  backfillSpellingWordExplanations,
} from '../../src/subjects/spelling/content/model.js';
import { SEEDED_SPELLING_CONTENT_BUNDLE } from '../../src/subjects/spelling/data/content-data.js';
import {
  normalisePunctuationSummary,
} from '../../src/subjects/punctuation/service-contract.js';
import { MONSTERS_BY_SUBJECT } from '../../src/platform/game/monsters.js';
import { monsterIdForSpellingWord } from '../../src/platform/game/monster-system.js';
import {
  asTs,
  isPlainObject,
  safeJsonParse,
} from './repository-helpers.js';

// ─── Public label / enum constants ──────────────────────────────────────────

export const PUBLIC_SPELLING_YEAR_LABELS = new Map([
  ['3-4', 'Years 3-4'],
  ['5-6', 'Years 5-6'],
  ['extra', 'Extra spellings'],
]);
export const PUBLIC_PRACTICE_CARD_LABELS = new Map([
  ['correct', 'Correct'],
  ['accuracy', 'Accuracy'],
]);
export const PUBLIC_EVENT_TYPES = new Set([
  'spelling.retry-cleared',
  'spelling.word-secured',
  'spelling.mastery-milestone',
  'spelling.session-completed',
  'reward.monster',
  'platform.practice-streak-hit',
]);
export const PUBLIC_MONSTER_CODEX_SYSTEM_ID = 'monster-codex';
export const PUBLIC_SPELLING_MONSTER_IDS = Object.freeze(['inklet', 'glimmerbug', 'phaeton', 'vellhorn']);
export const PUBLIC_PUNCTUATION_MONSTER_IDS = Object.freeze(
  Array.isArray(MONSTERS_BY_SUBJECT?.punctuation)
    ? [...MONSTERS_BY_SUBJECT.punctuation]
    : ['pealark', 'curlune', 'claspin', 'quoral'],
);
export const PUBLIC_GRAMMAR_MONSTER_IDS = Object.freeze(
  Array.isArray(MONSTERS_BY_SUBJECT?.grammar)
    ? [...MONSTERS_BY_SUBJECT.grammar]
    : ['bracehart', 'chronalyx', 'couronnail', 'concordium'],
);
export const PUBLIC_MONSTER_IDS = new Set([
  ...PUBLIC_SPELLING_MONSTER_IDS,
  ...PUBLIC_PUNCTUATION_MONSTER_IDS,
  ...PUBLIC_GRAMMAR_MONSTER_IDS,
]);
export const PUBLIC_DIRECT_SPELLING_MONSTER_IDS = ['inklet', 'glimmerbug', 'vellhorn'];
export const PUBLIC_MONSTER_BRANCHES = new Set(['b1', 'b2']);
export const SPELLING_SECURE_STAGE = 4;
export const PUBLIC_EVENT_TEXT_ENUMS = {
  mode: new Set(['smart', 'trouble', 'single', 'test']),
  sessionType: new Set(['learning', 'test']),
  kind: new Set(['caught', 'evolve', 'mega', 'levelup']),
  monsterId: new Set(PUBLIC_MONSTER_IDS),
  spellingPool: new Set(['core', 'extra']),
  yearBand: new Set(['3-4', '5-6', 'extra']),
  fromPhase: new Set(['retry', 'correction']),
};

// ─── Subject state row transforms ───────────────────────────────────────────

export function subjectStateRowToRecord(row) {
  return normaliseSubjectStateRecord({
    ui: safeJsonParse(row.ui_json, null),
    data: safeJsonParse(row.data_json, {}),
    updatedAt: row.updated_at,
  });
}

// ─── Spelling safe-field helpers ────────────────────────────────────────────

export function safeSpellingPrompt(prompt) {
  if (!prompt || typeof prompt !== 'object' || Array.isArray(prompt)) return null;
  return {
    cloze: typeof prompt.cloze === 'string' ? prompt.cloze : '',
  };
}

export function safeSpellingCurrentCard(card) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return null;
  return {
    prompt: safeSpellingPrompt(card.prompt),
  };
}

export function safeSpellingSessionProgress(progress) {
  if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return null;
  const output = {};
  for (const key of ['done', 'total']) {
    const value = Number(progress[key]);
    if (Number.isFinite(value) && value >= 0) output[key] = Math.floor(value);
  }
  return Object.keys(output).length ? output : null;
}

// ─── Spelling public stats / analytics ──────────────────────────────────────

export function publicSpellingStats(progressPools) {
  if (!isPlainObject(progressPools)) return {};
  return {
    all: cloneSerialisable(progressPools.all || progressPools.core || {}),
    core: cloneSerialisable(progressPools.core || progressPools.all || {}),
    y34: cloneSerialisable(progressPools.y34 || {}),
    y56: cloneSerialisable(progressPools.y56 || {}),
    extra: cloneSerialisable(progressPools.extra || {}),
  };
}

export function publicSpellingAnalytics(progressPools, now) {
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

// ─── Game state row transforms ──────────────────────────────────────────────

export function gameStateRowToRecord(row) {
  return cloneSerialisable(safeJsonParse(row.state_json, {})) || {};
}

function safePublicNonNegativeInt(value, { max = null } = {}) {
  if (value === undefined || value === null) return null;
  const n = Math.floor(Number(value) + 1e-9);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.max(0, n);
  return max == null ? clamped : Math.min(max, clamped);
}

export function publicMonsterCodexEntry(entry) {
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
  const starHighWater = safePublicNonNegativeInt(entry.starHighWater);
  if (starHighWater != null) output.starHighWater = starHighWater;
  const maxStageEver = safePublicNonNegativeInt(entry.maxStageEver, { max: 4 });
  if (maxStageEver != null) output.maxStageEver = maxStageEver;
  return output;
}

export function publicMonsterCodexState(rawState) {
  const state = isPlainObject(rawState) ? rawState : {};
  const output = {};
  for (const monsterId of PUBLIC_MONSTER_IDS) {
    const entry = publicMonsterCodexEntry(state[monsterId]);
    if (entry) output[monsterId] = entry;
  }
  return output;
}

export function publicGameStateRowToRecord(row) {
  if (row.system_id !== PUBLIC_MONSTER_CODEX_SYSTEM_ID) return null;
  return publicMonsterCodexState(gameStateRowToRecord(row));
}

// ─── Spelling progress / codex derivation ───────────────────────────────────

export function secureSpellingProgress(entry) {
  const stage = Number(entry?.stage);
  return Number.isFinite(stage) && stage >= SPELLING_SECURE_STAGE;
}

export function spellingProgressFromSubjectRow(row) {
  const data = safeJsonParse(row?.data_json, {});
  return isPlainObject(data?.progress) ? data.progress : null;
}

export function publicMonsterCodexStateFromSpellingProgress(progress, snapshot, existingState = {}) {
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

export function publicMonsterCodexHasMastery(state) {
  if (!isPlainObject(state)) return false;
  return Object.values(state).some((entry) => Number(entry?.masteredCount) > 0 || entry?.caught === true);
}

// ─── Practice session row transforms ────────────────────────────────────────

export function practiceSessionRowToRecord(row) {
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

export function publicPracticeLabel(sessionKind) {
  if (sessionKind === 'test') return 'SATs 20 test';
  if (sessionKind === 'boss') return 'Boss Dictation';
  if (sessionKind === 'guardian') return 'Guardian Mission';
  return 'Smart Review';
}

export function publicSummaryCards(cards) {
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

export function publicMistakeSummary(mistake) {
  const year = PUBLIC_SPELLING_YEAR_LABELS.has(mistake?.year) ? mistake.year : null;
  return {
    year,
    yearLabel: year ? PUBLIC_SPELLING_YEAR_LABELS.get(year) : null,
  };
}

export function publicPracticeSessionSummary(summary, sessionKind) {
  const raw = isPlainObject(summary) ? summary : {};
  return {
    label: publicPracticeLabel(sessionKind),
    cards: publicSummaryCards(raw.cards),
    mistakes: Array.isArray(raw.mistakes)
      ? raw.mistakes.map(publicMistakeSummary)
      : [],
  };
}

export function publicPunctuationPracticeSessionSummary(summary) {
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

export function publicPracticeSessionRowToRecord(row) {
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

// ─── Event row transforms ───────────────────────────────────────────────────

export function eventRowToRecord(row) {
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

export function safePublicEventText(value) {
  return typeof value === 'string' && value ? value : null;
}

export function safePublicEventNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function safePublicEventType(value) {
  return PUBLIC_EVENT_TYPES.has(value) ? value : null;
}

export function safePublicEventEnum(key, value) {
  const text = safePublicEventText(value);
  const allowed = PUBLIC_EVENT_TEXT_ENUMS[key];
  return text && allowed?.has(text) ? text : null;
}

export function publicEventRowToRecord(row) {
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

// ─── Content row transforms ─────────────────────────────────────────────────

export function contentRowToBundle(row) {
  return backfillSpellingWordExplanations(
    safeJsonParse(row.content_json, SEEDED_SPELLING_CONTENT_BUNDLE),
    SEEDED_SPELLING_CONTENT_BUNDLE,
  );
}
