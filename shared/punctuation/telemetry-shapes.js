// Phase 4 U9 — Shared Punctuation telemetry shapes.
//
// Single source of truth for the 12 Punctuation telemetry event kinds and
// the per-kind payload allowlist. Imported by BOTH the client emitter
// (U4 — `src/subjects/punctuation/telemetry.js`) AND the Worker handler
// (U9 — `worker/src/subjects/punctuation/events.js`).
//
// **Rejection policy (plan R10 HIGH):** the Worker enforces per-kind
// allowlists by REJECTING (not scrubbing) unknown fields. A field that is
// not on the allowlist causes the `record-event` command to return a 400
// with `code: 'punctuation_event_field_rejected'`. This stops a rogue or
// compromised client from smuggling PII (answer text, prompt text) through
// a denylist that future reviewers might forget to update.
//
// **Client vs Worker split (plan R11):** the client emitter at U4 is
// allowed to silently drop extra fields — it is a defence-in-depth layer
// BEFORE the network round-trip. The Worker still rejects. Both sides
// import `PUNCTUATION_TELEMETRY_ALLOWLIST` from here so an additive
// extension (e.g. a new optional field) lands atomically for both halves.
//
// **No answer / prompt text (plan R10 HIGH):** the `answer-submitted`
// allowlist explicitly excludes `answerText`, `promptText`, and `typed`.
// Any client that tries to send them receives a 400.

/**
 * The 12 event kinds the Punctuation subject emits. Frozen.
 */
export const PUNCTUATION_TELEMETRY_EVENT_KINDS = Object.freeze([
  'card-opened',
  'start-smart-review',
  'first-item-rendered',
  'answer-submitted',
  'feedback-rendered',
  'summary-reached',
  'map-opened',
  'skill-detail-opened',
  'guided-practice-started',
  'unit-secured',
  'monster-progress-changed',
  'command-failed',
]);

/**
 * Per-kind payload allowlist. Each entry is a frozen list of allowed
 * field names. The Worker iterates the client-sent payload's keys and
 * rejects any key not present here.
 */
export const PUNCTUATION_TELEMETRY_PAYLOAD_ALLOWLIST = Object.freeze({
  'card-opened': Object.freeze(['cardId']),
  'start-smart-review': Object.freeze(['roundLength']),
  'first-item-rendered': Object.freeze(['sessionId', 'itemMode']),
  // SECURITY: no answerText / promptText / typed — the whole point of the
  // allowlist is to stop PII from reaching D1 even if a rogue client
  // sends it.
  'answer-submitted': Object.freeze(['sessionId', 'itemId', 'correct']),
  'feedback-rendered': Object.freeze(['sessionId', 'itemId', 'correct']),
  'summary-reached': Object.freeze(['sessionId', 'total', 'correct', 'accuracy']),
  'map-opened': Object.freeze([]),
  'skill-detail-opened': Object.freeze(['skillId']),
  'guided-practice-started': Object.freeze(['skillId', 'roundLength']),
  'unit-secured': Object.freeze(['clusterId', 'monsterId']),
  'monster-progress-changed': Object.freeze(['monsterId', 'stageFrom', 'stageTo']),
  // SECURITY: no raw error messages / stack traces.
  'command-failed': Object.freeze(['command', 'errorCode']),
});

const EVENT_KIND_SET = new Set(PUNCTUATION_TELEMETRY_EVENT_KINDS);

/**
 * Per-kind field-level expected JS typeof, used by the Worker boundary
 * guard. A caller that sends the right field name but the wrong
 * primitive type (e.g. `correct: 'yes'` instead of `correct: true`) is
 * rejected with `punctuation_event_field_type_invalid`.
 *
 * Per-kind rather than per-field because some names legitimately carry
 * different shapes across events: `correct` is a boolean on
 * `answer-submitted` (was the learner's answer correct?) but a count
 * of correct answers on `summary-reached`.
 */
export const PUNCTUATION_TELEMETRY_FIELD_TYPES_BY_KIND = Object.freeze({
  'card-opened': Object.freeze({ cardId: 'string' }),
  'start-smart-review': Object.freeze({ roundLength: 'string' }),
  'first-item-rendered': Object.freeze({ sessionId: 'string', itemMode: 'string' }),
  'answer-submitted': Object.freeze({ sessionId: 'string', itemId: 'string', correct: 'boolean' }),
  'feedback-rendered': Object.freeze({ sessionId: 'string', itemId: 'string', correct: 'boolean' }),
  'summary-reached': Object.freeze({
    sessionId: 'string',
    total: 'number',
    correct: 'number',
    accuracy: 'number',
  }),
  'map-opened': Object.freeze({}),
  'skill-detail-opened': Object.freeze({ skillId: 'string' }),
  'guided-practice-started': Object.freeze({ skillId: 'string', roundLength: 'string' }),
  'unit-secured': Object.freeze({ clusterId: 'string', monsterId: 'string' }),
  'monster-progress-changed': Object.freeze({
    monsterId: 'string',
    stageFrom: 'number',
    stageTo: 'number',
  }),
  'command-failed': Object.freeze({ command: 'string', errorCode: 'string' }),
});

/**
 * Per-kind `Set<string>` view of the allowlist for O(1) membership
 * checks. Shape mirrors `PUNCTUATION_TELEMETRY_PAYLOAD_ALLOWLIST` but
 * is cached once at module load so the Worker hot path does not rebuild
 * the set on every emit.
 */
export const PUNCTUATION_TELEMETRY_FIELD_SETS = Object.freeze(
  Object.fromEntries(
    Object.entries(PUNCTUATION_TELEMETRY_PAYLOAD_ALLOWLIST).map(([kind, fields]) => (
      [kind, new Set(fields)]
    )),
  ),
);

/**
 * O(1) predicate for "is this kind on the whitelist".
 */
export function isPunctuationTelemetryEventKind(value) {
  return typeof value === 'string' && EVENT_KIND_SET.has(value);
}

/**
 * Returns the allowlisted field list for `kind`, or `null` when the
 * kind is not on the whitelist.
 */
export function getPunctuationTelemetryAllowedFields(kind) {
  if (!isPunctuationTelemetryEventKind(kind)) return null;
  return PUNCTUATION_TELEMETRY_PAYLOAD_ALLOWLIST[kind];
}
