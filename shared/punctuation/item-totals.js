export const PUNCTUATION_ITEM_TOTALS_VERSION = 1;

const DAY_MS = 24 * 60 * 60 * 1000;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonNegativeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

function nonNegativeInteger(value) {
  return Math.max(0, Math.floor(nonNegativeNumber(value)));
}

function positiveTimestamp(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

/**
 * Return the clock-stable bucket used by the compact lifetime totals.
 * `due` is deliberately represented as `learning`: due status changes merely
 * because time passes, so it cannot be materialised without becoming stale.
 */
export function punctuationStableItemBucket(value) {
  const raw = isPlainObject(value) ? value : {};
  const attempts = nonNegativeNumber(raw.attempts);
  if (attempts <= 0) return 'new';

  const correct = nonNegativeNumber(raw.correct);
  const accuracy = correct / attempts;
  const streak = nonNegativeInteger(raw.streak);
  const lapses = nonNegativeInteger(raw.lapses);
  if (accuracy < 0.65 || (lapses >= 2 && streak === 0)) return 'weak';

  const firstCorrectAt = positiveTimestamp(raw.firstCorrectAt);
  const lastCorrectAt = positiveTimestamp(raw.lastCorrectAt);
  const correctSpanDays = firstCorrectAt != null
    && lastCorrectAt != null
    && lastCorrectAt >= firstCorrectAt
    ? Math.floor((lastCorrectAt - firstCorrectAt) / DAY_MS)
    : 0;
  if (streak >= 3 && accuracy >= 0.8 && correctSpanDays >= 7) return 'secure';
  return 'learning';
}

export function buildPunctuationItemTotals(items = {}) {
  const totals = {
    version: PUNCTUATION_ITEM_TOTALS_VERSION,
    tracked: 0,
    new: 0,
    secure: 0,
    weak: 0,
  };
  if (!isPlainObject(items)) return totals;
  for (const value of Object.values(items)) {
    const bucket = punctuationStableItemBucket(value);
    totals.tracked += 1;
    if (Object.prototype.hasOwnProperty.call(totals, bucket)) totals[bucket] += 1;
  }
  return totals;
}

export function normalisePunctuationItemTotals(value) {
  if (!isPlainObject(value) || Number(value.version) !== PUNCTUATION_ITEM_TOTALS_VERSION) return null;
  return {
    version: PUNCTUATION_ITEM_TOTALS_VERSION,
    tracked: nonNegativeInteger(value.tracked),
    new: nonNegativeInteger(value.new),
    secure: nonNegativeInteger(value.secure),
    weak: nonNegativeInteger(value.weak),
  };
}

export function updatePunctuationItemTotals(itemTotals, {
  hadPrevious,
  previousValue,
  nextValue,
} = {}) {
  const current = normalisePunctuationItemTotals(itemTotals);
  if (!current) return itemTotals;
  const next = { ...current };
  const decrement = (bucket) => {
    if (bucket && Object.prototype.hasOwnProperty.call(next, bucket)) {
      next[bucket] = Math.max(0, next[bucket] - 1);
    }
  };
  const increment = (bucket) => {
    if (bucket && Object.prototype.hasOwnProperty.call(next, bucket)) next[bucket] += 1;
  };
  if (hadPrevious) decrement(punctuationStableItemBucket(previousValue));
  else next.tracked += 1;
  increment(punctuationStableItemBucket(nextValue));
  return next;
}
