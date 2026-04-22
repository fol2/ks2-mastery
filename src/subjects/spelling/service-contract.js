export const SPELLING_SERVICE_STATE_VERSION = 1;

export const SPELLING_ROOT_PHASES = Object.freeze(['dashboard', 'session', 'summary', 'word-bank']);
export const SPELLING_MODES = Object.freeze(['smart', 'trouble', 'test', 'single']);
export const SPELLING_YEAR_FILTERS = Object.freeze(['all', 'y3-4', 'y5-6']);
export const SPELLING_SESSION_TYPES = Object.freeze(['learning', 'test']);
export const SPELLING_SESSION_PHASES = Object.freeze(['question', 'retry', 'correction']);
export const SPELLING_FEEDBACK_KINDS = Object.freeze(['success', 'error', 'info', 'warn']);

export function createInitialSpellingState() {
  return {
    version: SPELLING_SERVICE_STATE_VERSION,
    phase: 'dashboard',
    session: null,
    feedback: null,
    summary: null,
    error: '',
    awaitingAdvance: false,
  };
}

export function defaultLearningStatus(needed = 1) {
  return {
    attempts: 0,
    successes: 0,
    needed,
    hadWrong: false,
    wrongAnswers: [],
    done: false,
    applied: false,
  };
}

export function normaliseMode(value, fallback = 'smart') {
  return SPELLING_MODES.includes(value) ? value : fallback;
}

export function normaliseYearFilter(value, fallback = 'all') {
  return SPELLING_YEAR_FILTERS.includes(value) ? value : fallback;
}

export function normaliseRoundLength(value, mode = 'smart') {
  if (mode === 'test') return 20;
  if (value === 'all') return 'all';
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : '20';
}

export function normaliseBoolean(value, fallback = false) {
  if (value === true || value === false) return value;
  return fallback;
}

export function normaliseString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

export function normaliseOptionalString(value) {
  return typeof value === 'string' && value ? value : null;
}

export function normaliseNonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function normaliseTimestamp(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function normaliseStringArray(value, filterFn = null) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => typeof entry === 'string' && entry)
    .filter((entry) => (typeof filterFn === 'function' ? filterFn(entry) : true));
}

export function normaliseFeedback(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const feedback = {
    kind: SPELLING_FEEDBACK_KINDS.includes(value.kind) ? value.kind : 'info',
    headline: normaliseString(value.headline),
    answer: normaliseString(value.answer),
    body: normaliseString(value.body),
    footer: normaliseString(value.footer),
    familyWords: normaliseStringArray(value.familyWords),
  };

  if (!feedback.headline && !feedback.answer && !feedback.body && !feedback.footer && !feedback.familyWords.length) {
    return null;
  }

  return feedback;
}

export function normaliseSummaryCard(card) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return null;
  const label = normaliseString(card.label);
  const sub = normaliseString(card.sub);
  const value = typeof card.value === 'number' || typeof card.value === 'string'
    ? card.value
    : '';
  if (!label && value === '' && !sub) return null;
  return { label, value, sub };
}

/* Derive the round-level totals the UI needs for the summary scene from the
   engine's card list. The legacy engine emits different card shapes for the
   learning and test flows — learning cards expose the total on the first
   card ("Words in round" / "Practice words") while test cards encode it as
   "correct/total" on the "Score" card. Keeping the derivation here means
   every UI that reads a summary gets the same normalised shape without the
   legacy engine changing. */
function deriveSummaryTotals(mode, cards, mistakes) {
  const firstValue = cards.length ? cards[0].value : '';
  let totalWords = 0;
  let correct = 0;

  if (mode === 'test') {
    const scoreCard = cards.find((card) => card.label === 'Score');
    if (scoreCard && typeof scoreCard.value === 'string') {
      const match = /^(\d+)\s*\/\s*(\d+)$/.exec(scoreCard.value);
      if (match) {
        correct = Number(match[1]);
        totalWords = Number(match[2]);
      }
    }
    if (!totalWords) {
      const correctCard = cards.find((card) => card.label === 'Correct');
      if (correctCard && typeof correctCard.value === 'number') {
        correct = correctCard.value;
      }
      totalWords = correct + mistakes.length;
    }
  } else {
    if (typeof firstValue === 'number') {
      totalWords = firstValue;
    } else {
      const parsed = Number.parseInt(String(firstValue ?? ''), 10);
      totalWords = Number.isFinite(parsed) ? parsed : 0;
    }
    correct = Math.max(0, totalWords - mistakes.length);
  }

  totalWords = Math.max(0, totalWords);
  correct = Math.max(0, Math.min(totalWords, correct));
  const accuracy = totalWords > 0 ? Math.round((correct / totalWords) * 100) : null;
  return { totalWords, correct, accuracy };
}

export function normaliseSummary(value, isKnownSlug) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const cards = Array.isArray(value.cards)
    ? value.cards.map(normaliseSummaryCard).filter(Boolean)
    : [];
  const mistakes = Array.isArray(value.mistakes)
    ? value.mistakes
        .map((word) => {
          if (!word || typeof word !== 'object' || Array.isArray(word)) return null;
          if (!isKnownSlug(word.slug)) return null;
          return {
            slug: word.slug,
            word: normaliseString(word.word),
            family: normaliseString(word.family),
            year: normaliseString(word.year),
            yearLabel: normaliseString(word.yearLabel),
            familyWords: normaliseStringArray(word.familyWords),
          };
        })
        .filter(Boolean)
    : [];
  const mode = normaliseMode(value.mode, 'smart');
  const derived = deriveSummaryTotals(mode, cards, mistakes);
  const providedTotal = Number(value.totalWords);
  const providedCorrect = Number(value.correct);
  const providedAccuracy = value.accuracy;
  const totalWords = Number.isInteger(providedTotal) && providedTotal >= 0
    ? providedTotal
    : derived.totalWords;
  const correct = Number.isInteger(providedCorrect) && providedCorrect >= 0
    ? Math.min(totalWords, providedCorrect)
    : derived.correct;
  const accuracy = typeof providedAccuracy === 'number' && Number.isFinite(providedAccuracy)
    ? providedAccuracy
    : derived.accuracy;
  return {
    mode,
    label: normaliseString(value.label, 'Spelling round'),
    message: normaliseString(value.message, 'Round complete.'),
    cards,
    mistakes,
    elapsedMs: normaliseNonNegativeInteger(value.elapsedMs, 0),
    totalWords,
    correct,
    accuracy,
  };
}

export function normaliseStats(value) {
  const stats = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    total: normaliseNonNegativeInteger(stats.total, 0),
    secure: normaliseNonNegativeInteger(stats.secure, 0),
    due: normaliseNonNegativeInteger(stats.due, 0),
    fresh: normaliseNonNegativeInteger(stats.fresh, 0),
    trouble: normaliseNonNegativeInteger(stats.trouble, 0),
    attempts: normaliseNonNegativeInteger(stats.attempts, 0),
    correct: normaliseNonNegativeInteger(stats.correct, 0),
    accuracy: typeof stats.accuracy === 'number' || stats.accuracy === null
      ? stats.accuracy
      : null,
  };
}

export function cloneSerialisable(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}
