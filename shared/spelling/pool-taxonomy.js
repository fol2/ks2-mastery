const STATUTORY_CORE = 'statutory-core';
const SECURE_EXTENSION = 'secure-extension';
const ENRICHMENT_EXTRA = 'enrichment-extra';

const SUPPORTED_MATCH_KEYS = new Set(['coverageTier', 'year', 'all']);

function clonePanel(panel) {
  return panel && typeof panel === 'object' && !Array.isArray(panel)
    ? Object.freeze({ ...panel })
    : null;
}

function freezeCategory(raw) {
  return Object.freeze({
    ...raw,
    match: Object.freeze({ ...(raw.match || {}) }),
    setupPanel: clonePanel(raw.setupPanel),
    wordBankSummary: clonePanel(raw.wordBankSummary),
    analyticsAliases: Object.freeze(Array.isArray(raw.analyticsAliases) ? [...raw.analyticsAliases] : []),
  });
}

const RAW_SPELLING_POOL_CATEGORIES = [
  {
    id: 'all',
    label: 'All',
    shortLabel: 'All',
    statsKey: 'all',
    match: { all: true },
    visibleInSetup: false,
    visibleInWordBankFilter: true,
    visibleInWordBankSummary: false,
    visibleInAnalyticsPool: false,
    visibleInAnalyticsWordGroups: false,
    practiceEligible: false,
    order: 0,
  },
  {
    id: 'core',
    label: 'Core',
    shortLabel: 'Core',
    statsKey: 'core',
    analyticsAliases: ['all'],
    match: { coverageTier: STATUTORY_CORE },
    visibleInSetup: true,
    visibleInWordBankFilter: false,
    visibleInWordBankSummary: true,
    visibleInAnalyticsPool: true,
    visibleInAnalyticsWordGroups: false,
    practiceEligible: true,
    order: 10,
    setupPanel: {
      eyebrow: 'Where you stand',
      totalLabel: 'Total spellings',
      secureLabel: 'Secure',
      dueLabel: 'Due today',
      troubleLabel: 'Weak spots',
      freshLabel: 'Unseen',
      bankSubTemplate: 'Every word {learner} is learning, with progress and difficulty.',
    },
    wordBankSummary: {
      eyebrow: 'Core spellings',
      title: 'Core statutory progress',
      statLabel: 'Words in official statutory pool',
    },
  },
  {
    id: 'y3-4',
    label: 'Years 3-4',
    shortLabel: 'Y3-4',
    statsKey: 'y34',
    match: { coverageTier: STATUTORY_CORE, year: '3-4' },
    visibleInSetup: true,
    visibleInWordBankFilter: true,
    visibleInWordBankSummary: true,
    visibleInAnalyticsPool: true,
    visibleInAnalyticsWordGroups: true,
    practiceEligible: true,
    spellingPool: 'core',
    year: '3-4',
    order: 20,
    setupPanel: {
      eyebrow: 'Years 3-4 pool',
      totalLabel: 'Years 3-4 words',
      secureLabel: 'Secure',
      dueLabel: 'Due today',
      troubleLabel: 'Weak spots',
      freshLabel: 'Unseen',
      bankSubTemplate: 'Years 3-4 words for {learner}, with progress and difficulty.',
      nextFocus: 'Years 3-4 pool selected.',
    },
    wordBankSummary: {
      eyebrow: 'Years 3-4',
      title: 'Lower KS2 spelling pool',
      statLabel: 'Words in pool',
    },
  },
  {
    id: 'y5-6',
    label: 'Years 5-6',
    shortLabel: 'Y5-6',
    statsKey: 'y56',
    match: { coverageTier: STATUTORY_CORE, year: '5-6' },
    visibleInSetup: true,
    visibleInWordBankFilter: true,
    visibleInWordBankSummary: true,
    visibleInAnalyticsPool: true,
    visibleInAnalyticsWordGroups: true,
    practiceEligible: true,
    spellingPool: 'core',
    year: '5-6',
    order: 30,
    setupPanel: {
      eyebrow: 'Years 5-6 pool',
      totalLabel: 'Years 5-6 words',
      secureLabel: 'Secure',
      dueLabel: 'Due today',
      troubleLabel: 'Weak spots',
      freshLabel: 'Unseen',
      bankSubTemplate: 'Years 5-6 words for {learner}, with progress and difficulty.',
      nextFocus: 'Years 5-6 pool selected.',
    },
    wordBankSummary: {
      eyebrow: 'Years 5-6',
      title: 'Upper KS2 spelling pool',
      statLabel: 'Words in pool',
    },
  },
  {
    id: SECURE_EXTENSION,
    label: 'Secure vocabulary',
    shortLabel: 'Secure vocabulary',
    statsKey: 'secureExtension',
    match: { coverageTier: SECURE_EXTENSION },
    visibleInSetup: true,
    visibleInWordBankFilter: true,
    visibleInWordBankSummary: true,
    visibleInAnalyticsPool: true,
    visibleInAnalyticsWordGroups: true,
    practiceEligible: true,
    spellingPool: 'core',
    year: SECURE_EXTENSION,
    order: 40,
    setupPanel: {
      eyebrow: 'Secure vocabulary',
      totalLabel: 'Secure vocabulary words',
      secureLabel: 'Already secure',
      dueLabel: 'Due today',
      troubleLabel: 'Weak spots',
      freshLabel: 'Not tried yet',
      bankSubTemplate: 'Secure vocabulary words for {learner}, with progress and difficulty.',
      nextFocus: 'Secure vocabulary pool selected.',
    },
    wordBankSummary: {
      eyebrow: 'Secure vocabulary',
      title: 'Approved secure-extension progress',
      statLabel: 'Words in secure vocabulary',
    },
  },
  {
    id: 'extra',
    label: 'Extra',
    shortLabel: 'Extra',
    statsKey: 'extra',
    match: { coverageTier: ENRICHMENT_EXTRA },
    visibleInSetup: true,
    visibleInWordBankFilter: true,
    visibleInWordBankSummary: true,
    visibleInAnalyticsPool: true,
    visibleInAnalyticsWordGroups: true,
    practiceEligible: true,
    spellingPool: 'extra',
    year: 'extra',
    order: 50,
    setupPanel: {
      eyebrow: 'Extra pool',
      totalLabel: 'Extra words',
      secureLabel: 'Secure',
      dueLabel: 'Due today',
      troubleLabel: 'Weak spots',
      freshLabel: 'Unseen',
      bankSubTemplate: 'Extra words for {learner}, with progress and difficulty.',
      nextFocus: 'Extra pool selected.',
    },
    wordBankSummary: {
      eyebrow: 'Extra',
      title: 'Expansion spelling pool',
      statLabel: 'Words in enrichment pool',
    },
  },
];

export const SPELLING_POOL_CATEGORIES = Object.freeze(RAW_SPELLING_POOL_CATEGORIES
  .map(freezeCategory)
  .sort((a, b) => a.order - b.order));

function categoryMap(categories = SPELLING_POOL_CATEGORIES) {
  return new Map((Array.isArray(categories) ? categories : []).map((category) => [category.id, category]));
}

export function validateSpellingPoolCategories(categories = SPELLING_POOL_CATEGORIES) {
  const ids = new Set();
  const statsKeys = new Set();
  for (const category of Array.isArray(categories) ? categories : []) {
    if (!category || typeof category !== 'object' || Array.isArray(category)) {
      throw new Error('Spelling pool category must be an object.');
    }
    if (!category.id || typeof category.id !== 'string') {
      throw new Error('Spelling pool category is missing a string id.');
    }
    if (ids.has(category.id)) {
      throw new Error(`Duplicate Spelling pool category id: ${category.id}`);
    }
    ids.add(category.id);
    if (!category.statsKey || typeof category.statsKey !== 'string') {
      throw new Error(`Spelling pool category ${category.id} is missing a statsKey.`);
    }
    if (statsKeys.has(category.statsKey)) {
      throw new Error(`Duplicate Spelling pool statsKey: ${category.statsKey}`);
    }
    statsKeys.add(category.statsKey);
    const match = category.match && typeof category.match === 'object' && !Array.isArray(category.match)
      ? category.match
      : null;
    if (!match) {
      throw new Error(`Spelling pool category ${category.id} is missing a match descriptor.`);
    }
    for (const key of Object.keys(match)) {
      if (!SUPPORTED_MATCH_KEYS.has(key)) {
        throw new Error(`Unsupported Spelling pool match key "${key}" on ${category.id}.`);
      }
    }
  }
  return true;
}

validateSpellingPoolCategories();

export const SPELLING_SETUP_POOL_CATEGORIES = Object.freeze(SPELLING_POOL_CATEGORIES
  .filter((category) => category.visibleInSetup));
export const SPELLING_WORD_BANK_FILTER_CATEGORIES = Object.freeze(SPELLING_POOL_CATEGORIES
  .filter((category) => category.visibleInWordBankFilter));
export const SPELLING_WORD_BANK_SUMMARY_CATEGORIES = Object.freeze(SPELLING_POOL_CATEGORIES
  .filter((category) => category.visibleInWordBankSummary));
export const SPELLING_ANALYTICS_POOL_CATEGORIES = Object.freeze(SPELLING_POOL_CATEGORIES
  .filter((category) => category.visibleInAnalyticsPool));
export const SPELLING_ANALYTICS_WORD_GROUP_CATEGORIES = Object.freeze(SPELLING_POOL_CATEGORIES
  .filter((category) => category.visibleInAnalyticsWordGroups));

export const SPELLING_SETUP_POOL_IDS = Object.freeze(SPELLING_SETUP_POOL_CATEGORIES.map((category) => category.id));
export const SPELLING_WORD_BANK_FILTER_IDS = Object.freeze(SPELLING_WORD_BANK_FILTER_CATEGORIES.map((category) => category.id));

export function spellingPoolCategoryById(id, categories = SPELLING_POOL_CATEGORIES) {
  return categoryMap(categories).get(String(id || '')) || null;
}

export function normaliseSpellingPoolCategoryId(value, fallback = 'core', categories = SPELLING_POOL_CATEGORIES) {
  const candidate = String(value || '').trim();
  return spellingPoolCategoryById(candidate, categories)?.id
    || spellingPoolCategoryById(fallback, categories)?.id
    || 'core';
}

export function normaliseSpellingSetupPoolId(value, fallback = 'core') {
  const candidate = String(value || '').trim();
  if (SPELLING_SETUP_POOL_IDS.includes(candidate)) return candidate;
  return SPELLING_SETUP_POOL_IDS.includes(fallback) ? fallback : 'core';
}

export function normaliseSpellingWordBankFilterId(value, fallback = 'all') {
  const candidate = String(value || '').trim();
  if (SPELLING_WORD_BANK_FILTER_IDS.includes(candidate)) return candidate;
  return SPELLING_WORD_BANK_FILTER_IDS.includes(fallback) ? fallback : 'all';
}

export function spellingSetupPoolOptions() {
  return SPELLING_SETUP_POOL_CATEGORIES.map((category) => ({
    value: category.id,
    label: category.shortLabel || category.label,
  }));
}

export function spellingWordBankFilterOptions() {
  return SPELLING_WORD_BANK_FILTER_CATEGORIES.map((category) => ({
    id: category.id,
    label: category.label,
  }));
}

export function spellingPoolStatsKey(id, fallback = 'core') {
  const category = spellingPoolCategoryById(id) || spellingPoolCategoryById(fallback);
  return category?.statsKey || 'core';
}

function normaliseCoverageTierFromWord(word, helpers = {}) {
  if (typeof helpers.coverageTierForWord === 'function') {
    const resolved = helpers.coverageTierForWord(word);
    if (typeof resolved === 'string' && resolved) return resolved;
  }
  const raw = typeof word?.coverageTier === 'string' ? word.coverageTier.trim().toLowerCase() : '';
  if (raw === STATUTORY_CORE || raw === SECURE_EXTENSION || raw === ENRICHMENT_EXTRA) return raw;
  if (word?.spellingPool === 'extra' || word?.year === 'extra') return ENRICHMENT_EXTRA;
  return STATUTORY_CORE;
}

export function spellingPoolCategoryMatchesWord(categoryOrId, word, helpers = {}) {
  const category = typeof categoryOrId === 'string'
    ? spellingPoolCategoryById(categoryOrId)
    : categoryOrId;
  if (!category || !word) return false;
  const match = category.match || {};
  if (match.all === true) return true;
  const tier = normaliseCoverageTierFromWord(word, helpers);
  if (match.coverageTier && tier !== match.coverageTier) return false;
  if (match.year && word.year !== match.year) return false;
  return true;
}

export function spellingPoolCategoryForWord(word, categories = SPELLING_ANALYTICS_WORD_GROUP_CATEGORIES, helpers = {}) {
  return (Array.isArray(categories) ? categories : [])
    .find((category) => spellingPoolCategoryMatchesWord(category, word, helpers)) || null;
}
