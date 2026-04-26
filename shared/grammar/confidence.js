// Grammar confidence — single source of truth for the five-label taxonomy,
// the derivation function, the status machine, and all child-facing copy
// mapping. Imported by both the Worker (`worker/src/subjects/grammar/*.js`)
// and the client (`src/subjects/grammar/*.js`) via relative paths. Keeping
// this module free of any Worker- or client-specific deps (no engine.js,
// no view-model.js) means both environments can consume it without import
// cycles or bundler surprises.
//
// Before U8 this taxonomy was defined in three places:
//   - worker/src/subjects/grammar/read-models.js (authoritative array + deriveGrammarConfidence)
//   - src/subjects/grammar/components/GrammarAnalyticsScene.jsx (adult chip validation)
//   - src/subjects/grammar/components/grammar-view-model.js (child-mapping key set)
// plus two copies of `grammarConceptStatus` (engine.js + client read-model.js).
// U8 consolidates all of them here. Drift becomes impossible by construction.

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// The five internal confidence labels emitted by `deriveGrammarConfidence`.
// Order is "weakest-to-strongest then needs-repair" by semantic intent —
// consumers iterating the frozen array get that semantic order.
//
// Notes:
// - Low-strength detection is delegated to `status === 'weak'`, not to a raw
//   strength threshold. The grammarConceptStatus machine is the authoritative
//   source for "weak"; if it declares a node weak, needs-repair follows.
//   Raw strength alone does not trigger needs-repair because strength can
//   drift below a threshold momentarily after a single wrong answer without
//   the status machine escalating it.
export const GRAMMAR_CONFIDENCE_LABELS = Object.freeze([
  'emerging',
  'building',
  'consolidating',
  'secure',
  'needs-repair',
]);

// Shared horizon for "recent" windows in the confidence projection. Exposed
// so parent hubs and other consumers can describe the signal consistently
// ("missed 2 of the last N attempts"). The engine caps state.recentAttempts
// at 80 at write time; this is the read-side slice.
export const GRAMMAR_RECENT_ATTEMPT_HORIZON = 12;

// Child-facing copy for each of the five internal labels. Adult surfaces
// must never render these — they surface the raw internal label. Keys MUST
// align with GRAMMAR_CONFIDENCE_LABELS.
export const GRAMMAR_CHILD_CONFIDENCE_LABEL_MAP = Object.freeze({
  emerging: 'New',
  building: 'Learning',
  'needs-repair': 'Trouble spot',
  consolidating: 'Nearly secure',
  secure: 'Secure',
});

const CONFIDENCE_LABEL_SET = new Set(GRAMMAR_CONFIDENCE_LABELS);

/**
 * Returns `true` iff `label` is one of the five canonical internal labels.
 * Used by adult chip components to distinguish in-taxonomy labels from
 * out-of-taxonomy garbage (the latter must render `'Unknown'`, never silently
 * fall back to `'emerging'`).
 */
export function isGrammarConfidenceLabel(label) {
  return typeof label === 'string' && CONFIDENCE_LABEL_SET.has(label);
}

/**
 * Translates the five internal labels into child-friendly copy. Accepts
 * `{ label }` so callers can pass the entire confidence projection. Unknown
 * labels fall back to `'Learning'`, matching the Spelling wording default.
 */
export function grammarChildConfidenceLabel({ label } = {}) {
  if (typeof label !== 'string') return 'Learning';
  return GRAMMAR_CHILD_CONFIDENCE_LABEL_MAP[label] || 'Learning';
}

// --- Status machine --------------------------------------------------------

function normaliseMasteryNodeForStatus(value) {
  const raw = isPlainObject(value) ? value : {};
  const attemptsRaw = Number(raw.attempts);
  const correctRaw = Number(raw.correct);
  const wrongRaw = Number(raw.wrong);
  const strengthRaw = Number(raw.strength);
  const intervalRaw = Number(raw.intervalDays);
  const dueAtRaw = Number(raw.dueAt);
  const streakRaw = Number(raw.correctStreak);
  return {
    attempts: Math.max(0, Math.floor(Number.isFinite(attemptsRaw) ? attemptsRaw : 0)),
    correct: Math.max(0, Math.floor(Number.isFinite(correctRaw) ? correctRaw : 0)),
    wrong: Math.max(0, Math.floor(Number.isFinite(wrongRaw) ? wrongRaw : 0)),
    strength: clamp(Number.isFinite(strengthRaw) ? strengthRaw : 0.25, 0.02, 0.99),
    intervalDays: Math.max(0, Number.isFinite(intervalRaw) ? intervalRaw : 0),
    dueAt: Math.max(0, Number.isFinite(dueAtRaw) ? dueAtRaw : 0),
    correctStreak: Math.max(0, Math.floor(Number.isFinite(streakRaw) ? streakRaw : 0)),
  };
}

/**
 * Canonical status machine. Matches the previously-duplicated versions in
 * both `worker/src/subjects/grammar/engine.js` and
 * `src/subjects/grammar/read-model.js` — the thresholds (0.42 weak floor,
 * 0.82 secured floor, 7-day interval, streak ≥ 3) are identical across
 * both; U8 proves that and pins it here.
 *
 * Returns one of: `'new' | 'weak' | 'due' | 'secured' | 'learning'`.
 */
export function grammarConceptStatus(node, now = Date.now()) {
  const current = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const value = normaliseMasteryNodeForStatus(node);
  if (!value.attempts) return 'new';
  if (value.strength < 0.42 || value.wrong > value.correct + 1) return 'weak';
  if ((value.dueAt || 0) <= current) return 'due';
  if (value.strength >= 0.82 && value.intervalDays >= 7 && value.correctStreak >= 3) return 'secured';
  return 'learning';
}

// --- Confidence derivation -------------------------------------------------

/**
 * Projects a mastery node's coarse stats into one of the five internal
 * confidence labels. Lifted verbatim from the Worker read-model U6 work;
 * both client and Worker now import from here.
 *
 * Precedence:
 *   1. attempts ≤ 2                        → 'emerging'    (thin evidence wins)
 *   2. status === 'weak' OR ≥ 2 misses     → 'needs-repair'
 *   3. strength ≥ 0.82, streak ≥ 3, >=7d   → 'secure'
 *   4. strength ≥ 0.82, streak ≥ 3, <7d    → 'consolidating'
 *   5. default                             → 'building'
 */
export function deriveGrammarConfidence(raw) {
  const input = isPlainObject(raw) ? raw : {};
  const { status, attempts, strength, correctStreak, intervalDays, recentMisses } = input;
  const attemptCount = Math.max(0, Number(attempts) || 0);
  const strengthValue = Number.isFinite(Number(strength)) ? Number(strength) : 0.25;
  const streak = Math.max(0, Number(correctStreak) || 0);
  const spacingDays = Math.max(0, Number(intervalDays) || 0);
  const misses = Math.max(0, Number(recentMisses) || 0);

  if (attemptCount <= 2) return 'emerging';
  if (status === 'weak' || misses >= 2) return 'needs-repair';
  if (strengthValue >= 0.82 && streak >= 3 && spacingDays >= 7) return 'secure';
  if (strengthValue >= 0.82 && streak >= 3 && spacingDays < 7) return 'consolidating';
  return 'building';
}
