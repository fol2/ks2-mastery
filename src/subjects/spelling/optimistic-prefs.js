import {
  createInitialSpellingState,
  normaliseBoolean,
  normaliseMode,
  normaliseRoundLength,
  normaliseYearFilter,
} from './service-contract.js';

const BOOLEAN_PREF_DEFAULTS = Object.freeze({
  showCloze: true,
  autoSpeak: true,
  extraWordFamilies: false,
});

const DIRECT_PREF_KEYS = new Set([
  'mode',
  'yearFilter',
  'roundLength',
  'showCloze',
  'autoSpeak',
  'extraWordFamilies',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanPatchEntry(key, value, currentPrefs, nextPrefs) {
  if (key === 'mode') return normaliseMode(value, currentPrefs.mode || 'smart');
  if (key === 'yearFilter') return normaliseYearFilter(value, currentPrefs.yearFilter || 'core');
  if (key === 'roundLength') return normaliseRoundLength(value, nextPrefs.mode || currentPrefs.mode || 'smart');
  if (key in BOOLEAN_PREF_DEFAULTS) {
    return normaliseBoolean(value, BOOLEAN_PREF_DEFAULTS[key]);
  }
  return undefined;
}

export function normaliseOptimisticSpellingPrefsPatch(rawPatch = {}, currentPrefs = {}) {
  if (!isPlainObject(rawPatch)) return {};
  const safeCurrent = isPlainObject(currentPrefs) ? currentPrefs : {};
  const output = {};
  const nextPrefs = { ...safeCurrent };

  for (const [key, value] of Object.entries(rawPatch)) {
    if (!DIRECT_PREF_KEYS.has(key)) continue;
    const cleaned = cleanPatchEntry(key, value, safeCurrent, nextPrefs);
    if (cleaned === undefined) continue;
    output[key] = cleaned;
    nextPrefs[key] = cleaned;
  }

  if (Object.prototype.hasOwnProperty.call(output, 'mode')) {
    const nextRoundLength = normaliseRoundLength(nextPrefs.roundLength, nextPrefs.mode);
    if (nextRoundLength !== nextPrefs.roundLength) {
      output.roundLength = nextRoundLength;
      nextPrefs.roundLength = nextRoundLength;
    }
  }

  return output;
}

export function optimisticSpellingPrefsPatchForAction(action, data = {}, currentPrefs = {}) {
  if (action === 'spelling-set-mode') {
    return normaliseOptimisticSpellingPrefsPatch({ mode: data.value }, currentPrefs);
  }

  if (action === 'spelling-set-pref') {
    const pref = String(data.pref || '');
    if (!DIRECT_PREF_KEYS.has(pref)) return {};
    return normaliseOptimisticSpellingPrefsPatch({ [pref]: data.value }, currentPrefs);
  }

  if (action === 'spelling-toggle-pref') {
    const pref = String(data.pref || '');
    if (!(pref in BOOLEAN_PREF_DEFAULTS)) return {};
    const currentValue = normaliseBoolean(currentPrefs[pref], BOOLEAN_PREF_DEFAULTS[pref]);
    return normaliseOptimisticSpellingPrefsPatch({ [pref]: !currentValue }, currentPrefs);
  }

  return {};
}

export function mergePendingOptimisticSpellingPrefsForLearner(entries = [], learnerId = '') {
  const targetLearnerId = String(learnerId || '');
  return (Array.isArray(entries) ? entries : []).reduce((patch, entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return patch;
    if (String(entry.learnerId || '') !== targetLearnerId) return patch;
    if (!isPlainObject(entry.patch)) return patch;
    return {
      ...patch,
      ...entry.patch,
    };
  }, {});
}

export function applyOptimisticSpellingPrefs(ui = {}, rawPatch = {}) {
  const initial = createInitialSpellingState();
  const safeUi = isPlainObject(ui) ? ui : {};
  const currentPrefs = isPlainObject(safeUi.prefs) ? safeUi.prefs : {};
  const patch = normaliseOptimisticSpellingPrefsPatch(rawPatch, currentPrefs);
  if (!Object.keys(patch).length) return safeUi;

  const nextPrefs = { ...currentPrefs, ...patch };
  if (safeUi.phase === 'session' && safeUi.session) {
    return {
      ...safeUi,
      prefs: nextPrefs,
      error: '',
    };
  }

  return {
    ...safeUi,
    version: safeUi.version || initial.version,
    phase: 'dashboard',
    session: null,
    feedback: null,
    summary: null,
    error: '',
    awaitingAdvance: false,
    audio: null,
    prefs: nextPrefs,
  };
}
