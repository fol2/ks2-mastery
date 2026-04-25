// Grammar attempt-support contract.
//
// Historical shape (pre-U3): each attempt stored `{ supportLevel, attempts }`
// where supportLevel came from either `supportLevelForMode` (worked=2, faded=1)
// or `supportLevelForSession` (Smart + allowTeachingItems=true forced 1).
// That session-level promotion penalised independent first-attempt answers in
// Smart Review whenever teaching items were enabled, which was unfair.
//
// New shape (U3 / supportContractVersion 2): each attempt stores
//   firstAttemptIndependent: boolean
//   supportUsed: 'none' | 'nudge' | 'faded' | 'worked' | 'ai-explanation-after-marking'
//   supportLevelAtScoring: 0 | 1 | 2
// where support attribution is driven by what actually happened on the attempt
// (mode + any in-session repair escalation), not by the session's settings.
//
// `deriveAttemptSupport` is the single authoritative mapping from legacy
// fields to new fields. It is used by:
//   (a) state reload — normalises older `state.recentAttempts[i]` on load
//   (b) event-log replay — projects older `grammar.answer-submitted` events
//
// The same function is called in both paths so state and events cannot drift.

export const SUPPORT_CONTRACT_VERSION = 2;

export const SUPPORT_USED_VALUES = Object.freeze([
  'none',
  'nudge',
  'faded',
  'worked',
  'ai-explanation-after-marking',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clampSupportLevel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric >= 2) return 2;
  if (numeric >= 1) return 1;
  return 0;
}

function normaliseSupportUsed(value) {
  return typeof value === 'string' && SUPPORT_USED_VALUES.includes(value) ? value : '';
}

function deriveSupportUsedFromLegacy({ mode, supportLevel, attempts }) {
  const level = clampSupportLevel(supportLevel);
  const trimmedMode = typeof mode === 'string' ? mode.trim().toLowerCase() : '';

  if (trimmedMode === 'worked') return 'worked';
  if (trimmedMode === 'faded') return 'faded';

  // Smart + allowTeachingItems used to force session support level 1.
  // Under contract v2 that's wrong, but for legacy attempts we can only
  // infer: supportLevel 1 with no faded/worked mode => the old teaching-item
  // promotion, so attribute `faded` conservatively (the actual UI showed
  // faded content for that session). Using 'none' would erase support
  // evidence that the learner was shown.
  if (level >= 2) return 'worked';
  if (level >= 1) return 'faded';

  // supportLevel === 0 and mode is not worked/faded. If attempts > 1 the
  // learner retried, which is a weaker signal than independent but not
  // support; the review doc considers retry without worked/faded a nudge.
  const attemptCount = Math.max(1, Number(attempts) || 1);
  if (attemptCount >= 2) return 'nudge';
  return 'none';
}

export function deriveAttemptSupport({ mode, supportLevel, attempts } = {}) {
  const supportUsed = deriveSupportUsedFromLegacy({ mode, supportLevel, attempts });
  const attemptCount = Math.max(1, Number(attempts) || 1);
  let supportLevelAtScoring = 0;
  if (supportUsed === 'worked') supportLevelAtScoring = 2;
  else if (supportUsed === 'faded') supportLevelAtScoring = 1;
  else if (supportUsed === 'ai-explanation-after-marking') supportLevelAtScoring = 0;
  else if (supportUsed === 'nudge') supportLevelAtScoring = 0;
  // Fall through: 'none' => 0

  const firstAttemptIndependent = attemptCount === 1 && supportUsed === 'none';

  return {
    firstAttemptIndependent,
    supportUsed: supportUsed || 'none',
    supportLevelAtScoring,
  };
}

// Normalise a stored attempt record from disk (which may be pre-U3) into a
// shape that carries both legacy and new fields. Idempotent — calling on an
// already-normalised record returns the same shape.
export function normaliseStoredAttempt(attempt) {
  if (!isPlainObject(attempt)) return attempt;
  const existingSupportUsed = normaliseSupportUsed(attempt.supportUsed);
  if (existingSupportUsed && typeof attempt.supportLevelAtScoring === 'number') {
    // Already U3-shaped; just confirm backcompat fields are consistent.
    return {
      ...attempt,
      firstAttemptIndependent: Boolean(attempt.firstAttemptIndependent),
      supportUsed: existingSupportUsed,
      supportLevelAtScoring: clampSupportLevel(attempt.supportLevelAtScoring),
    };
  }
  const mode = typeof attempt.mode === 'string' ? attempt.mode : '';
  const derived = deriveAttemptSupport({
    mode,
    supportLevel: attempt.supportLevel,
    attempts: attempt.attempts,
  });
  return {
    ...attempt,
    firstAttemptIndependent: derived.firstAttemptIndependent,
    supportUsed: derived.supportUsed,
    supportLevelAtScoring: derived.supportLevelAtScoring,
  };
}

// Build the new-shape fields for a fresh attempt submission.
// `supportUsed` takes precedence when explicitly provided by the command
// layer (e.g., post-marking AI enrichment). Otherwise derived from the
// session's mode + the learner's in-session support escalation.
export function composeAttemptSupport({
  mode = '',
  sessionSupportLevel = 0,
  attempts = 1,
  supportUsed = null,
  postMarkingEnrichment = false,
} = {}) {
  if (postMarkingEnrichment) {
    return {
      firstAttemptIndependent: Math.max(1, Number(attempts) || 1) === 1,
      supportUsed: 'ai-explanation-after-marking',
      supportLevelAtScoring: 0,
    };
  }
  const explicit = normaliseSupportUsed(supportUsed);
  if (explicit) {
    const attemptCount = Math.max(1, Number(attempts) || 1);
    let level = 0;
    if (explicit === 'worked') level = 2;
    else if (explicit === 'faded') level = 1;
    return {
      firstAttemptIndependent: attemptCount === 1 && explicit === 'none',
      supportUsed: explicit,
      supportLevelAtScoring: level,
    };
  }
  return deriveAttemptSupport({
    mode,
    supportLevel: sessionSupportLevel,
    attempts,
  });
}

// Session-level support promotion. Under contract v1 (pre-U3), Smart Review
// + allowTeachingItems promoted session support level to 1. Under v2 (U3+),
// only the mode decides: worked => 2, faded => 1, otherwise 0. Individual
// attempts escalate via in-session repair (useFadedSupport / showWorkedSolution)
// which bumps session.supportLevel directly.
export function supportLevelForSessionWithContract({ mode, prefs = {}, contractVersion = SUPPORT_CONTRACT_VERSION } = {}) {
  if (typeof mode !== 'string') return 0;
  const trimmed = mode.trim().toLowerCase();
  if (trimmed === 'worked') return 2;
  if (trimmed === 'faded') return 1;
  if (contractVersion < 2 && trimmed === 'smart') {
    const allowTeaching = prefs && (prefs.allowTeachingItems === true
      || prefs.allowTeachingItems === 1
      || prefs.allowTeachingItems === 'true');
    if (allowTeaching) return 1;
  }
  return 0;
}
