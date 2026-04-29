// Shared forbidden-key oracles used by:
//   - tests/redaction-access-matrix.test.js (matrix oracle)
//   - scripts/production-bundle-audit.mjs (post-deploy demo bootstrap audit)
//   - scripts/grammar-production-smoke.mjs (grammar read-model smoke)
//   - scripts/punctuation-production-smoke.mjs (punctuation read-model smoke)
//
// This module is the single source of truth for the forbidden-key universe. It
// MUST stay side-effect free: every exported value is a frozen Array, and no
// other runtime behaviour is allowed here. Downstream consumers can lift the
// arrays into Sets if they need membership lookups; we intentionally do not
// pre-freeze Sets here because `Object.freeze(new Set())` does not prevent
// mutation of the underlying Set.
//
// Extension rules (P3 oracle-drift regression lock):
//   - FORBIDDEN_KEYS_EVERYWHERE is the universal floor. Every authenticated HTTP
//     response surface must be clean of these keys.
//   - Subject-specific sets (grammar/punctuation) either extend the universal
//     floor (grammar) or overlap with it (punctuation). For any universal key
//     that could appear on a subject surface, the subject set MUST include it —
//     otherwise subject-side coverage would be weaker than the universal floor,
//     which is exactly the drift we are locking out.
//   - When a new forbidden key is introduced, add it here first; downstream
//     consumers import, so they cannot drift.

export const FORBIDDEN_KEYS_EVERYWHERE = Object.freeze([
  'solutionLines',
  'correctResponse',
  'correctResponses',
  'accepted',
  'answers',
  'evaluate',
  'generator',
  'templates',
  'passwordHash',
  'password_hash',
  'sessionHash',
  'session_hash',
  'sessionId',
  'session_id',
]);

// Grammar read-model surface: strict superset of FORBIDDEN_KEYS_EVERYWHERE.
// The extra entry `template` (singular) is grammar-private — it appears on
// grammar question items as a meta field and must never round-trip to the
// browser. It is NOT in the universal floor because monster visual config
// legitimately uses `template` (effect catalog entries keyed by template
// name), so checking it everywhere would false-positive.
export const FORBIDDEN_GRAMMAR_READ_MODEL_KEYS = Object.freeze([
  ...FORBIDDEN_KEYS_EVERYWHERE,
  'template',
  'answerSpec',
  'generatorFamilyId',
  'golden',
  'nearMiss',
  'variantSignature',
]);

// Grammar session.currentItem surface. Currently identical to the read-model
// surface but kept as a separate export so item-specific keys can be added
// without widening the read-model contract.
export const FORBIDDEN_GRAMMAR_ITEM_KEYS = Object.freeze([
  ...FORBIDDEN_GRAMMAR_READ_MODEL_KEYS,
]);

// Punctuation read-model surface. Not a full superset of the universal floor
// by design: punctuation's internal key vocabulary (correctIndex, rubric,
// validator, seed, rawGenerator, hiddenQueue, queueItemIds, responses,
// unpublished) is disjoint from grammar's. The overlap with the universal
// floor covers the shared concerns ('accepted', 'answers', 'generator').
//
// `variantSignature` has one narrow exception: a generated active
// session.currentItem may carry it as an opaque submission/evidence token. It
// remains forbidden everywhere else, especially GPS review rows and adult
// evidence surfaces.
export const ALLOWED_PUNCTUATION_ACTIVE_ITEM_METADATA_KEYS = Object.freeze([
  'variantSignature',
]);

export const FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS = Object.freeze([
  'accepted',
  'acceptedAnswers',
  'answers',
  'correctIndex',
  'familyId',
  'generatorFamilyId',
  'hiddenQueue',
  'queueItemIds',
  'rawGenerator',
  'rawResponse',
  'reason',
  'responses',
  'rubric',
  'seed',
  'selectedSignatures',
  'selectionReason',
  'generator',
  'templateId',
  'tests',
  'unpublished',
  'validator',
  'validators',
  'variantSignature',
]);

// Punctuation adult evidence surface extends the read-model surface with
// evidence-only keys that may appear in marking records.
export const FORBIDDEN_PUNCTUATION_ADULT_EVIDENCE_KEYS = Object.freeze([
  ...FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS,
  'attemptedAnswer',
  'choiceIndex',
  'correctAnswer',
  'displayCorrection',
  'expected',
  'expectedAnswer',
  'model',
  'rawResponse',
  'response',
  'typed',
]);

// Spelling read-model surface. Mirrors the disjoint keys used by punctuation
// so spelling's post-submit evidence path cannot accidentally expose the raw
// word, target spelling, rubric, or hidden-queue contents. Overlaps with the
// universal floor via `accepted` / `answers`; the remaining entries are
// spelling-specific rename-class risks (e.g. a future refactor renaming
// `currentCard.word` to `canonical` or `target` must still trip this oracle).
//
// `model` is intentionally omitted from this set — it appears legitimately in
// subject read models (e.g. `subjectReadModel.session`) and a blanket ban
// would false-positive. The smoke instead asserts the raw-word and raw-
// sentence positions directly via assertSpellingStartModelShape.
export const FORBIDDEN_SPELLING_READ_MODEL_KEYS = Object.freeze([
  ...FORBIDDEN_KEYS_EVERYWHERE,
  'canonical',
  'target',
  'spelling',
  'correctAnswer',
  'expectedAnswer',
  'expected',
  'typed',
  'rawResponse',
  'answer',
  'validator',
  'rubric',
  'hiddenQueue',
  'queueItemIds',
]);
