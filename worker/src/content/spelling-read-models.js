import { cloneSerialisable } from '../../../src/platform/core/repositories/helpers.js';
import {
  SPELLING_ANALYTICS_POOL_CATEGORIES,
  SPELLING_ANALYTICS_WORD_GROUP_CATEGORIES,
  SPELLING_POOL_CATEGORIES,
  SPELLING_WORD_BANK_FILTER_IDS,
  normaliseSpellingWordBankFilterId,
  spellingPoolCategoryMatchesWord,
} from '../../../shared/spelling/pool-taxonomy.js';
import { normaliseServerSpellingData } from '../subjects/spelling/engine.js';
import { buildSpellingWordBankAudioCue } from '../subjects/spelling/audio.js';
import { BadRequestError, NotFoundError } from '../errors.js';
import {
  coverageTierForWord,
  coverageTierLabel,
} from '../../../src/subjects/spelling/content/taxonomy.js';
import { isGuardianEligibleSlug } from '../../../src/subjects/spelling/service-contract.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const STAGE_INTERVALS = [0, 1, 3, 7, 14, 30, 60];
const SECURE_STAGE = 4;
const GUARDIAN_RENEWED_RECENTLY_WINDOW_DAYS = 7;
const STATUS_FILTERS = new Set(['all', 'due', 'weak', 'learning', 'secure', 'unseen']);
const YEAR_FILTERS = new Set(SPELLING_WORD_BANK_FILTER_IDS);
const MAX_PAGE_SIZE = 5000;

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normaliseSearchText(value) {
  return cleanText(value).toLowerCase();
}

function positiveInteger(value, fallback) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function todayDay(now = Date.now()) {
  const numeric = Number(now);
  return Math.floor((Number.isFinite(numeric) ? numeric : Date.now()) / DAY_MS);
}

function progressFor(progressMap, slug, now) {
  const raw = progressMap?.[slug];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      stage: 0,
      attempts: 0,
      correct: 0,
      wrong: 0,
      dueDay: todayDay(now),
      lastDay: null,
      lastResult: null,
    };
  }
  return {
    stage: Number(raw.stage) || 0,
    attempts: Number(raw.attempts) || 0,
    correct: Number(raw.correct) || 0,
    wrong: Number(raw.wrong) || 0,
    dueDay: Number.isFinite(Number(raw.dueDay)) ? Number(raw.dueDay) : todayDay(now),
    lastDay: Number.isFinite(Number(raw.lastDay)) ? Number(raw.lastDay) : null,
    lastResult: typeof raw.lastResult === 'string' ? raw.lastResult : null,
  };
}

function stageLabel(stage) {
  const safeStage = Number(stage) || 0;
  if (safeStage >= SECURE_STAGE) return 'Secure';
  if (safeStage <= 0) return 'New / due today';
  const interval = STAGE_INTERVALS[Math.min(safeStage, STAGE_INTERVALS.length - 1)];
  return `Next review in ${interval} day${interval === 1 ? '' : 's'}`;
}

function statusForProgress(progress, now) {
  const total = progress.correct + progress.wrong;
  const today = todayDay(now);
  if (progress.attempts === 0) return 'new';
  if (progress.wrong > 0 && (progress.wrong >= progress.correct || (progress.dueDay <= today && total > 0))) return 'trouble';
  if (progress.dueDay <= today) return 'due';
  if (progress.stage >= SECURE_STAGE) return 'secure';
  return 'learning';
}

function yearMatches(filter, row) {
  return spellingPoolCategoryMatchesWord(normaliseSpellingWordBankFilterId(filter, 'all'), row, { coverageTierForWord });
}

function statusMatches(filter, row) {
  if (filter === 'all') return true;
  if (filter === 'weak') return row.status === 'trouble';
  if (filter === 'unseen') return row.status === 'new';
  return row.status === filter;
}

function categoryFacetCounts(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const counts = {};
  for (const category of SPELLING_POOL_CATEGORIES) {
    const count = safeRows.filter((row) => spellingPoolCategoryMatchesWord(category, row, { coverageTierForWord })).length;
    counts[category.id] = count;
    if (category.statsKey && category.statsKey !== category.id) counts[category.statsKey] = count;
  }
  return counts;
}

function statusFacetCounts(rows, {
  guardianMap = {},
  progressMap = {},
  wordBySlug = {},
  today = 0,
} = {}) {
  const stats = {
    all: 0,
    total: 0,
    secure: 0,
    due: 0,
    trouble: 0,
    weak: 0,
    learning: 0,
    unseen: 0,
    guardianDue: 0,
    wobbling: 0,
    renewedRecently: 0,
    neverRenewed: 0,
  };
  for (const row of Array.isArray(rows) ? rows : []) {
    stats.all += 1;
    stats.total += 1;
    if (row.status === 'secure') stats.secure += 1;
    else if (row.status === 'due') stats.due += 1;
    else if (row.status === 'trouble') {
      stats.trouble += 1;
      stats.weak += 1;
    } else if (row.status === 'learning') stats.learning += 1;
    else if (row.status === 'new') stats.unseen += 1;

    const eligible = isGuardianEligibleSlug(row.slug, progressMap, wordBySlug);
    const guardian = row.slug && guardianMap[row.slug] && typeof guardianMap[row.slug] === 'object'
      ? guardianMap[row.slug]
      : null;
    if (!eligible) continue;
    if (!guardian) {
      if (row.status === 'secure') stats.neverRenewed += 1;
      continue;
    }
    const nextDue = Number.isFinite(Number(guardian.nextDueDay)) ? Math.floor(Number(guardian.nextDueDay)) : Infinity;
    if (row.status === 'secure' && nextDue <= today) stats.guardianDue += 1;
    if (row.status === 'secure' && guardian.wobbling === true) stats.wobbling += 1;
    const lastReviewed = Number(guardian.lastReviewedDay);
    if (Number.isFinite(lastReviewed) && today - Math.floor(lastReviewed) <= GUARDIAN_RENEWED_RECENTLY_WINDOW_DAYS) {
      stats.renewedRecently += 1;
    }
  }
  return stats;
}

function categoryStatusFacets(rows, context = {}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  return Object.fromEntries(SPELLING_POOL_CATEGORIES.map((category) => [
    category.id,
    statusFacetCounts(
      safeRows.filter((row) => spellingPoolCategoryMatchesWord(category, row, { coverageTierForWord })),
      context,
    ),
  ]));
}

function buildWordBankFacets({
  rows,
  filters,
  contentSnapshot,
  progressMap,
  guardianMap,
  now,
} = {}) {
  const queryRows = (Array.isArray(rows) ? rows : [])
    .filter((row) => searchMatches(filters.query, contentSnapshot?.wordBySlug?.[row.slug] || row));
  const categoryRows = queryRows.filter((row) => statusMatches(filters.status, row));
  const statusRows = queryRows.filter((row) => yearMatches(filters.year, row));
  const context = {
    guardianMap,
    progressMap,
    wordBySlug: contentSnapshot?.wordBySlug || {},
    today: todayDay(now),
  };
  return {
    version: 1,
    categories: categoryFacetCounts(categoryRows),
    status: statusFacetCounts(statusRows, context),
    categoryStatus: categoryStatusFacets(categoryRows, context),
  };
}

function searchMatches(query, word) {
  if (!query) return true;
  const fields = [
    word.slug,
    word.word,
    word.family,
    word.yearLabel,
    word.spellingPool === 'extra' ? 'extra' : 'core',
    coverageTierLabel(word.coverageTier),
    word.explanation,
  ].map(normaliseSearchText);
  return fields.some((field) => field.includes(query));
}

function publicWordRow(word, progress, now, { detail = false, audio = null } = {}) {
  const row = {
    slug: word.slug,
    word: word.word,
    family: word.family || '',
    year: word.year,
    yearLabel: word.yearLabel || (word.year === '5-6' ? 'Years 5-6' : word.year === 'extra' ? 'Extra' : 'Years 3-4'),
    spellingPool: word.spellingPool === 'extra' ? 'extra' : 'core',
    coverageTier: coverageTierForWord(word),
    familyWords: Array.isArray(word.familyWords) ? [...word.familyWords] : [],
    status: statusForProgress(progress, now),
    stageLabel: stageLabel(progress.stage),
    progress: cloneSerialisable(progress),
  };

  if (detail) {
    row.sentence = word.sentence || '';
    row.explanation = word.explanation || '';
    row.audio = audio || null;
  }

  return row;
}

function statsForWords(words, progressMap, now) {
  const today = todayDay(now);
  return words.reduce((stats, word) => {
    const progress = progressFor(progressMap, word.slug, now);
    stats.total += 1;
    stats.attempts += progress.attempts;
    stats.correct += progress.correct;
    if (progress.attempts === 0) stats.fresh += 1;
    if (progress.stage >= SECURE_STAGE) stats.secure += 1;
    if (progress.attempts > 0 && progress.dueDay <= today) stats.due += 1;
    if (progress.wrong > 0 && (progress.wrong >= progress.correct || progress.stage < SECURE_STAGE)) stats.trouble += 1;
    return stats;
  }, {
    total: 0,
    secure: 0,
    due: 0,
    fresh: 0,
    trouble: 0,
    attempts: 0,
    correct: 0,
    accuracy: null,
  });
}

function withAccuracy(stats) {
  return {
    ...stats,
    accuracy: stats.attempts ? Math.round((stats.correct / stats.attempts) * 100) : null,
  };
}

function poolsFor(words, progressMap, now) {
  const pools = {};
  for (const category of SPELLING_ANALYTICS_POOL_CATEGORIES) {
    const categoryWords = words.filter((word) => spellingPoolCategoryMatchesWord(category, word, { coverageTierForWord }));
    const stats = withAccuracy(statsForWords(categoryWords, progressMap, now));
    for (const alias of category.analyticsAliases) pools[alias] = stats;
    pools[category.statsKey] = stats;
  }
  return pools;
}

function groupRows(rows) {
  return SPELLING_ANALYTICS_WORD_GROUP_CATEGORIES.map((group) => ({
    key: group.id,
    title: group.label,
    spellingPool: group.spellingPool || 'core',
    year: group.year || group.id,
    words: rows.filter((row) => spellingPoolCategoryMatchesWord(group, row, { coverageTierForWord })),
  }));
}

export function normaliseWordBankFilters(rawValue = {}) {
  const status = STATUS_FILTERS.has(String(rawValue.status || 'all')) ? String(rawValue.status || 'all') : 'all';
  const year = YEAR_FILTERS.has(String(rawValue.year || 'all')) ? String(rawValue.year || 'all') : 'all';
  const page = positiveInteger(rawValue.page, 1);
  const requestedPageSize = positiveInteger(rawValue.pageSize, MAX_PAGE_SIZE);
  return {
    query: normaliseSearchText(rawValue.query || rawValue.search || ''),
    rawQuery: cleanText(rawValue.query || rawValue.search || ''),
    status,
    year,
    page,
    pageSize: Math.min(MAX_PAGE_SIZE, requestedPageSize),
    detailSlug: normaliseSearchText(rawValue.detailSlug || rawValue.slug || ''),
  };
}

export function buildSpellingProgressPools({
  contentSnapshot,
  data,
  now = Date.now(),
} = {}) {
  const words = Array.isArray(contentSnapshot?.words) ? contentSnapshot.words : [];
  const progressMap = normaliseServerSpellingData(data).progress;
  return poolsFor(words, progressMap, now);
}

export async function buildSpellingWordBankReadModel({
  learnerId,
  contentSnapshot,
  data,
  filters: rawFilters = {},
  now = Date.now(),
} = {}) {
  const filters = normaliseWordBankFilters(rawFilters);
  const words = Array.isArray(contentSnapshot?.words) ? contentSnapshot.words : [];
  const spellingData = normaliseServerSpellingData(data, now);
  const progressMap = spellingData.progress;
  const guardianMap = spellingData.guardian;
  const rows = words.map((word) => publicWordRow(word, progressFor(progressMap, word.slug, now), now));
  const filtered = rows
    .filter((row) => yearMatches(filters.year, row))
    .filter((row) => statusMatches(filters.status, row))
    .filter((row) => searchMatches(filters.query, contentSnapshot?.wordBySlug?.[row.slug] || row));
  const start = (filters.page - 1) * filters.pageSize;
  const pageRows = filtered.slice(start, start + filters.pageSize);
  const detailWord = filters.detailSlug
    ? contentSnapshot?.wordBySlug?.[filters.detailSlug]
    : null;

  if (filters.detailSlug && !detailWord) {
    throw new NotFoundError('Spelling word was not found.', {
      code: 'spelling_word_not_found',
      slug: filters.detailSlug,
    });
  }

  const detailProgress = detailWord ? progressFor(progressMap, detailWord.slug, now) : null;
  const detailAudio = detailWord
    ? {
      dictation: await buildSpellingWordBankAudioCue({ learnerId, word: detailWord }),
      word: await buildSpellingWordBankAudioCue({ learnerId, word: detailWord, wordOnly: true }),
    }
    : null;
  const detail = detailWord
    ? publicWordRow(detailWord, detailProgress, now, { detail: true, audio: detailAudio })
    : null;

  return {
    subjectId: 'spelling',
    learnerId,
    version: 1,
    generatedAt: Number(now) || Date.now(),
    analytics: {
      version: 1,
      generatedAt: Number(now) || Date.now(),
      pools: poolsFor(words, progressMap, now),
      wordGroups: groupRows(pageRows),
      wordBank: {
        filters,
        page: filters.page,
        pageSize: filters.pageSize,
        totalRows: rows.length,
        filteredRows: filtered.length,
        returnedRows: pageRows.length,
        hasNextPage: start + pageRows.length < filtered.length,
        facets: buildWordBankFacets({
          rows,
          filters,
          contentSnapshot,
          progressMap,
          guardianMap,
          now,
        }),
      },
    },
    detail,
  };
}

export function checkSpellingWordBankAnswer({
  contentSnapshot,
  slug,
  typed,
} = {}) {
  const safeSlug = normaliseSearchText(slug);
  const word = contentSnapshot?.wordBySlug?.[safeSlug];
  if (!word) {
    throw new NotFoundError('Spelling word was not found.', {
      code: 'spelling_word_not_found',
      slug: safeSlug,
    });
  }
  const answer = normaliseSearchText(typed);
  if (!answer) {
    throw new BadRequestError('A typed answer is required for the drill check.', {
      code: 'spelling_answer_required',
    });
  }
  const accepted = Array.isArray(word.accepted) && word.accepted.length
    ? word.accepted
    : [word.word, word.slug];
  const normalisedAccepted = accepted.map(normaliseSearchText);
  return {
    slug: safeSlug,
    result: normalisedAccepted.includes(answer) ? 'correct' : 'incorrect',
    answer: word.word,
  };
}
