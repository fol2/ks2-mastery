// U7 (Admin Console P6): Content quality signals — skill coverage,
// misconceptions, high-wrong-rate per subject.
//
// Content-free leaf: this module MUST NOT import any subject content
// datasets directly. It receives normalised signal data from the Worker
// and produces a rendering-ready model for the UI.
//
// Each subject can independently succeed or fail to provide signals.
// When a subject's quality data is unavailable the model returns
// NOT_AVAILABLE for every signal so the UI can honestly render
// "Not available yet" rather than faking numbers.

export const SIGNAL_STATUS = Object.freeze({
  AVAILABLE: 'available',
  NOT_AVAILABLE: 'not_available',
  PARTIAL: 'partial',
});

// Canonical subject display names (fallback when server omits them).
const SUBJECT_DISPLAY_NAMES = {
  spelling: 'Spelling',
  grammar: 'Grammar',
  punctuation: 'Punctuation',
  arithmetic: 'Arithmetic',
  reasoning: 'Reasoning',
  reading: 'Reading',
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeNonNegativeInt(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : 0;
}

function safeStatus(value) {
  if (value === SIGNAL_STATUS.AVAILABLE) return SIGNAL_STATUS.AVAILABLE;
  if (value === SIGNAL_STATUS.PARTIAL) return SIGNAL_STATUS.PARTIAL;
  return SIGNAL_STATUS.NOT_AVAILABLE;
}

/**
 * Normalise a single coverage signal (skillCoverage, templateCoverage, itemCoverage).
 * Expected shape from worker: { status, value, total }
 */
function normaliseCoverageSignal(raw) {
  if (!isPlainObject(raw)) {
    return { status: SIGNAL_STATUS.NOT_AVAILABLE, value: 0, total: 0 };
  }
  return {
    status: safeStatus(raw.status),
    value: safeNonNegativeInt(raw.value),
    total: safeNonNegativeInt(raw.total),
  };
}

/**
 * Normalise a list signal (commonMisconceptions, highWrongRate, recentlyChangedUnevidenced).
 * Expected shape from worker: { status, items: [] }
 */
function normaliseListSignal(raw) {
  if (!isPlainObject(raw)) {
    return { status: SIGNAL_STATUS.NOT_AVAILABLE, items: [] };
  }
  const items = Array.isArray(raw.items)
    ? raw.items.filter((item) => isPlainObject(item)).map((item) => ({
        id: typeof item.id === 'string' ? item.id : String(item.id || ''),
        label: typeof item.label === 'string' ? item.label : String(item.label || ''),
        count: safeNonNegativeInt(item.count),
        detail: typeof item.detail === 'string' ? item.detail : null,
      }))
    : [];
  return {
    status: safeStatus(raw.status),
    items,
  };
}

/**
 * Normalise a single subject's quality signals into a rendering-ready model.
 *
 * @param {object} raw — single subject envelope from the worker
 * @returns {object} normalised subject quality signal model
 */
function normaliseSubjectSignals(raw) {
  if (!isPlainObject(raw)) {
    return buildNotAvailableEntry('unknown');
  }
  const subjectKey = typeof raw.subjectKey === 'string' && raw.subjectKey
    ? raw.subjectKey
    : 'unknown';
  const subjectName = typeof raw.subjectName === 'string' && raw.subjectName
    ? raw.subjectName
    : (SUBJECT_DISPLAY_NAMES[subjectKey] || subjectKey);
  const hasSignalsObject = isPlainObject(raw.signals);
  const signals = hasSignalsObject ? raw.signals : {};

  return {
    subjectKey,
    subjectName,
    // U10 (P7): metadata flag — true when the worker provided a signals
    // object (even if individual signals are NOT_AVAILABLE). False means
    // the signal infrastructure itself is absent for this subject.
    _signalsProvided: hasSignalsObject,
    signals: {
      skillCoverage: normaliseCoverageSignal(signals.skillCoverage),
      templateCoverage: normaliseCoverageSignal(signals.templateCoverage),
      itemCoverage: normaliseCoverageSignal(signals.itemCoverage),
      commonMisconceptions: normaliseListSignal(signals.commonMisconceptions),
      highWrongRate: normaliseListSignal(signals.highWrongRate),
      recentlyChangedUnevidenced: normaliseListSignal(signals.recentlyChangedUnevidenced),
    },
  };
}

/**
 * Build a fully NOT_AVAILABLE entry for a subject with no data.
 */
function buildNotAvailableEntry(subjectKey) {
  return {
    subjectKey,
    subjectName: SUBJECT_DISPLAY_NAMES[subjectKey] || subjectKey,
    signals: {
      skillCoverage: { status: SIGNAL_STATUS.NOT_AVAILABLE, value: 0, total: 0 },
      templateCoverage: { status: SIGNAL_STATUS.NOT_AVAILABLE, value: 0, total: 0 },
      itemCoverage: { status: SIGNAL_STATUS.NOT_AVAILABLE, value: 0, total: 0 },
      commonMisconceptions: { status: SIGNAL_STATUS.NOT_AVAILABLE, items: [] },
      highWrongRate: { status: SIGNAL_STATUS.NOT_AVAILABLE, items: [] },
      recentlyChangedUnevidenced: { status: SIGNAL_STATUS.NOT_AVAILABLE, items: [] },
    },
  };
}

/**
 * Compute a summary availability level for a subject's signals.
 * Returns 'all' if every signal is AVAILABLE, 'none' if all NOT_AVAILABLE,
 * or 'some' for mixed availability.
 *
 * @param {object} signals — the normalised signals object
 * @returns {'all'|'some'|'none'}
 */
export function summariseAvailability(signals) {
  if (!isPlainObject(signals)) return 'none';
  const entries = Object.values(signals);
  if (entries.length === 0) return 'none';
  const availableCount = entries.filter((s) => s.status === SIGNAL_STATUS.AVAILABLE).length;
  if (availableCount === entries.length) return 'all';
  if (availableCount === 0) return 'none';
  return 'some';
}

/**
 * Build the content quality signals model from the worker response.
 *
 * @param {Array|object|null|undefined} subjectSignals — array of
 *   { subjectKey, subjectName?, signals: {...} } from the Worker,
 *   or null/undefined when the endpoint failed entirely.
 * @returns {Array} normalised array of subject quality signal models
 */
export function buildContentQualitySignals(subjectSignals) {
  if (!Array.isArray(subjectSignals)) {
    return [];
  }
  return subjectSignals
    .map((raw) => normaliseSubjectSignals(raw))
    .filter((entry) => entry.subjectKey !== 'unknown');
}

// ---------------------------------------------------------------
// U10 (P7): Cross-subject quality summary.
//
// Takes the output of buildContentQualitySignals() and reduces it
// into a single summary model for the Quality Summary panel.
// Does NOT modify or replace the existing per-subject model.
// ---------------------------------------------------------------

/**
 * Quality summary status constants.
 */
export const QUALITY_SUMMARY_STATUS = Object.freeze({
  GOOD_SIGNAL: 'good_signal',
  NO_DATA_YET: 'no_data_yet',
  SIGNAL_UNAVAILABLE: 'signal_unavailable',
  VALIDATION_BLOCKED: 'validation_blocked',
});

const QUALITY_SUMMARY_LABELS = Object.freeze({
  [QUALITY_SUMMARY_STATUS.GOOD_SIGNAL]: 'Good learning signal',
  [QUALITY_SUMMARY_STATUS.NO_DATA_YET]: 'No data yet',
  [QUALITY_SUMMARY_STATUS.SIGNAL_UNAVAILABLE]: 'Signal unavailable',
  [QUALITY_SUMMARY_STATUS.VALIDATION_BLOCKED]: 'Content validation blocked',
});

/**
 * Attention priority weight — higher means more urgent.
 */
const ATTENTION_WEIGHT = Object.freeze({
  [QUALITY_SUMMARY_STATUS.VALIDATION_BLOCKED]: 4,
  [QUALITY_SUMMARY_STATUS.NO_DATA_YET]: 3,
  [QUALITY_SUMMARY_STATUS.SIGNAL_UNAVAILABLE]: 2,
  [QUALITY_SUMMARY_STATUS.GOOD_SIGNAL]: 0,
});

/**
 * Derive the quality summary status for a single normalised subject entry.
 *
 * @param {object} subjectEntry — one entry from buildContentQualitySignals()
 * @returns {string} one of QUALITY_SUMMARY_STATUS values
 */
function deriveSubjectStatus(subjectEntry) {
  if (!isPlainObject(subjectEntry) || !isPlainObject(subjectEntry.signals)) {
    return QUALITY_SUMMARY_STATUS.SIGNAL_UNAVAILABLE;
  }

  // If the worker never provided a signals object for this subject, the
  // signal infrastructure is absent — report as "Signal unavailable".
  if (subjectEntry._signalsProvided === false) {
    return QUALITY_SUMMARY_STATUS.SIGNAL_UNAVAILABLE;
  }

  const signals = subjectEntry.signals;
  const allSignals = Object.values(signals);

  // If every signal is NOT_AVAILABLE this subject has no data at all.
  const availableCount = allSignals.filter(
    (s) => s.status === SIGNAL_STATUS.AVAILABLE
  ).length;
  const partialCount = allSignals.filter(
    (s) => s.status === SIGNAL_STATUS.PARTIAL
  ).length;

  if (availableCount === 0 && partialCount === 0) {
    return QUALITY_SUMMARY_STATUS.NO_DATA_YET;
  }

  // Check for validation blockers: if coverage signals exist but total is 0
  // while status claims available, the source data is structurally invalid.
  const coverageKeys = ['skillCoverage', 'templateCoverage', 'itemCoverage'];
  const hasBlocker = coverageKeys.some((key) => {
    const sig = signals[key];
    return sig && sig.status === SIGNAL_STATUS.AVAILABLE && sig.total === 0 && sig.value === 0;
  });
  if (hasBlocker && availableCount <= partialCount) {
    return QUALITY_SUMMARY_STATUS.VALIDATION_BLOCKED;
  }

  // Has at least some real data — good signal.
  if (availableCount > 0) {
    return QUALITY_SUMMARY_STATUS.GOOD_SIGNAL;
  }

  // Partial-only: signal exists but incomplete.
  return QUALITY_SUMMARY_STATUS.SIGNAL_UNAVAILABLE;
}

/**
 * Build a cross-subject quality summary from the output of
 * buildContentQualitySignals(). This is a NEW function and does NOT
 * modify the existing per-subject API.
 *
 * @param {Array} signals — return value of buildContentQualitySignals()
 * @returns {{ subjectRows: Array, coveragePercentage: number, attentionPriority: Array, validationBlockers: Array }}
 */
export function buildContentQualitySummary(signals) {
  if (!Array.isArray(signals) || signals.length === 0) {
    return {
      subjectRows: [],
      coveragePercentage: 0,
      attentionPriority: [],
      validationBlockers: [],
    };
  }

  const subjectRows = signals.map((entry) => {
    const status = deriveSubjectStatus(entry);
    return {
      subject: entry.subjectKey,
      status,
      label: QUALITY_SUMMARY_LABELS[status],
    };
  });

  // Coverage percentage: proportion of subjects with good signal.
  const goodCount = subjectRows.filter(
    (row) => row.status === QUALITY_SUMMARY_STATUS.GOOD_SIGNAL
  ).length;
  const coveragePercentage = subjectRows.length > 0
    ? Math.round((goodCount / subjectRows.length) * 100)
    : 0;

  // Attention priority: subjects needing attention, ordered by urgency.
  const attentionPriority = subjectRows
    .filter((row) => row.status !== QUALITY_SUMMARY_STATUS.GOOD_SIGNAL)
    .sort((a, b) => ATTENTION_WEIGHT[b.status] - ATTENTION_WEIGHT[a.status])
    .map((row) => row.subject);

  // Validation blockers: subjects with structural content issues.
  const validationBlockers = subjectRows
    .filter((row) => row.status === QUALITY_SUMMARY_STATUS.VALIDATION_BLOCKED)
    .map((row) => row.subject);

  return {
    subjectRows,
    coveragePercentage,
    attentionPriority,
    validationBlockers,
  };
}

/**
 * Format a coverage signal as a human-readable string.
 * e.g. "14 / 18 concepts covered"
 *
 * @param {object} signal — normalised coverage signal
 * @param {string} unit — display unit (e.g. "concepts", "templates", "items")
 * @returns {string}
 */
export function formatCoverageLabel(signal, unit) {
  if (!isPlainObject(signal) || signal.status === SIGNAL_STATUS.NOT_AVAILABLE) {
    return 'Not available yet';
  }
  return `${signal.value} / ${signal.total} ${unit} covered`;
}

/**
 * CSS class for a coverage signal chip based on its completeness ratio.
 *
 * @param {object} signal — normalised coverage signal
 * @returns {string} chip class suffix ('good', 'warn', 'bad', or '')
 */
export function coverageChipClass(signal) {
  if (!isPlainObject(signal) || signal.status === SIGNAL_STATUS.NOT_AVAILABLE) return '';
  if (signal.total === 0) return '';
  const ratio = signal.value / signal.total;
  if (ratio >= 0.9) return 'good';
  if (ratio >= 0.6) return 'warn';
  return 'bad';
}
