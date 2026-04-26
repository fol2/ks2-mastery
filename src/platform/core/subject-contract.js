const REQUIRED_STRING_FIELDS = ['id', 'name', 'blurb'];
const REQUIRED_FUNCTION_FIELDS = [
  'initState',
  'getDashboardStats',
  'handleAction',
];
const REACT_PRACTICE_FIELDS = ['PracticeComponent', 'renderPracticeComponent'];

// SH2-U2 (R2): shared post-session-ephemeral fields that every subject's
// `sanitiseUiOnRehydrate()` hook drops. These are the round-completion
// fields that, if echoed across a browser reload on a summary screen,
// would let the learner tap a "Start another round" CTA from a round
// they thought was finished (R2's core hazard).
//
// What STAYS (NOT in this list):
//
//   `session`, `feedback`, `awaitingAdvance`, `pendingCommand` — all
//   part of the resume contract for an in-flight session. A learner
//   who reloads mid-round (or mid-feedback) must be able to pick up
//   where they left off; dropping `awaitingAdvance` / `feedback` would
//   strand them on a session-phase view with no Continue button, and
//   dropping `session` / `pendingCommand` is already locked out by
//   existing resume invariants (`tests/store.test.js::serialisable
//   spelling state survives store persistence for resume`,
//   `tests/spelling-parity.test.js::restored completed spelling card
//   caps progress and resumes auto-advance`,
//   `tests/subject-expansion.test.js::Punctuation production subject
//   keeps a live session when switching learners`).
//
//   The post-round hazard R2 describes — a zombie summary surfacing a
//   "Start another round" CTA after reload — is fully addressed by the
//   summary drop below. Stripping the active-session state fields would
//   break the resume contract without adding any additional R2 safety.
//
// What DROPS, and why:
//
//   summary — the round-completion screen. Its "Start another round"
//   button fires a fresh `start-session` reusing the prior round's mode,
//   so a zombie summary after reload can silently re-enter a round the
//   learner thought they had finished. This is the core post-completion
//   hazard called out explicitly by R2.
//
//   transientUi — subject-local transient UI (e.g. search drafts, modal
//   states) that tests treat as session-ephemeral. Most subjects do not
//   actually nest a transientUi object under their subject UI slice
//   (transient UI lives at `state.transientUi` top-level), but dropping
//   any nested transientUi that accidentally got persisted keeps the
//   fallback safe.
//
// Subjects are free to strip additional subject-specific ephemeral fields
// on top (e.g. Punctuation's `phase: 'map'` + `mapUi` in
// `sanitisePunctuationUiOnRehydrate`), but every subject that ships a hook
// MUST at minimum drop this baseline set. The store's generic fallback
// (subjects without the hook) preserves backwards compatibility via
// shallow-merge defaults.
export const SESSION_EPHEMERAL_FIELDS = Object.freeze([
  'summary',
  'transientUi',
]);

// SH2-U2 helper: drops the baseline session-ephemeral fields on a persisted
// entry while preserving everything else (prefs, settings, subject-level
// static data, content metadata, etc.). Subjects compose this with their
// subject-specific sanitiser to produce the full rehydrate-time payload.
//
// Returns the input untouched when it is not a plain object, matching the
// `sanitisePunctuationUiOnRehydrate` shape. Callers that need to strip
// subject-specific fields should spread the result and remove/coerce those
// additional fields before returning.
export function dropSessionEphemeralFields(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
  const next = { ...entry };
  for (const field of SESSION_EPHEMERAL_FIELDS) {
    if (field in next) delete next[field];
  }
  return next;
}

function hasReactPracticeRenderer(candidate) {
  if (candidate.reactPractice === true) return true;
  return REACT_PRACTICE_FIELDS.some((field) => typeof candidate[field] === 'function');
}

function describeCandidate(candidate) {
  if (candidate?.id) return `subject "${candidate.id}"`;
  if (candidate?.name) return `subject "${candidate.name}"`;
  return 'subject module';
}

export function validateSubjectModule(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError('Subject module must be a plain object.');
  }

  const label = describeCandidate(candidate);

  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof candidate[field] !== 'string' || candidate[field].trim() === '') {
      throw new TypeError(`${label} is missing required string field "${field}".`);
    }
  }

  for (const field of REQUIRED_FUNCTION_FIELDS) {
    if (typeof candidate[field] !== 'function') {
      throw new TypeError(`${label} is missing required function "${field}()".`);
    }
  }

  if (typeof candidate.renderPractice === 'function') {
    throw new TypeError(`${label} uses retired legacy "renderPractice()" rendering. Use "PracticeComponent", "renderPracticeComponent()", or an explicit React practice mapping.`);
  }

  if (!hasReactPracticeRenderer(candidate)) {
    throw new TypeError(`${label} is missing required React practice component or explicit React practice mapping.`);
  }

  if ('available' in candidate && typeof candidate.available !== 'boolean') {
    throw new TypeError(`${label} has invalid "available" flag. Expected a boolean.`);
  }

  if ('exposureGate' in candidate && (typeof candidate.exposureGate !== 'string' || candidate.exposureGate.trim() === '')) {
    throw new TypeError(`${label} has invalid "exposureGate". Expected a non-empty string.`);
  }

  return Object.freeze({
    ...candidate,
    id: candidate.id.trim(),
    name: candidate.name.trim(),
    blurb: candidate.blurb.trim(),
    ...('exposureGate' in candidate ? { exposureGate: candidate.exposureGate.trim() } : {}),
  });
}

export function buildSubjectRegistry(subjects) {
  if (!Array.isArray(subjects) || subjects.length === 0) {
    throw new TypeError('Subject registry requires at least one subject module.');
  }

  const seenIds = new Set();
  const registry = subjects.map((subject) => {
    const validated = validateSubjectModule(subject);
    if (seenIds.has(validated.id)) {
      throw new TypeError(`Subject registry contains duplicate id "${validated.id}".`);
    }
    seenIds.add(validated.id);
    return validated;
  });

  return Object.freeze(registry);
}
