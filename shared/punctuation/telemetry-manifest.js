// P5-U2 — Punctuation telemetry manifest with emitted/reserved/deprecated status.
//
// Manifest-leaf module (zero imports from sibling modules, Object.freeze).
// Maps each telemetry event name to a lifecycle status:
//   - `emitted`: the event has a callsite in the Worker command handler
//   - `reserved`: the event name is registered but no callsite exists yet
//   - `deprecated`: the event name is retired and must NOT be emitted
//
// The `telemetry-events.js` sibling remains the canonical name-list;
// this module layers lifecycle metadata on top without importing it.

export const PUNCTUATION_TELEMETRY_MANIFEST = Object.freeze({
  GENERATED_SIGNATURE_EXPOSED: Object.freeze({
    event: 'punctuation.generated_signature_exposed',
    status: 'emitted',
  }),
  GENERATED_SIGNATURE_REPEATED: Object.freeze({
    event: 'punctuation.generated_signature_repeated',
    status: 'emitted',
  }),
  SCHEDULER_REASON_SELECTED: Object.freeze({
    event: 'punctuation.scheduler_reason_selected',
    status: 'emitted',
  }),
  MISCONCEPTION_RETRY_SCHEDULED: Object.freeze({
    event: 'punctuation.misconception_retry_scheduled',
    status: 'emitted',
  }),
  MISCONCEPTION_RETRY_PASSED: Object.freeze({
    event: 'punctuation.misconception_retry_passed',
    status: 'emitted',
  }),
  SPACED_RETURN_SCHEDULED: Object.freeze({
    event: 'punctuation.spaced_return_scheduled',
    status: 'emitted',
  }),
  SPACED_RETURN_PASSED: Object.freeze({
    event: 'punctuation.spaced_return_passed',
    status: 'emitted',
  }),
  RETENTION_AFTER_SECURE_SCHEDULED: Object.freeze({
    event: 'punctuation.retention_after_secure_scheduled',
    status: 'emitted',
  }),
  RETENTION_AFTER_SECURE_PASSED: Object.freeze({
    event: 'punctuation.retention_after_secure_passed',
    status: 'emitted',
  }),
  STAR_EVIDENCE_DEDUPED_BY_SIGNATURE: Object.freeze({
    event: 'punctuation.star_evidence_deduped_by_signature',
    status: 'emitted',
  }),
  STAR_EVIDENCE_DEDUPED_BY_TEMPLATE: Object.freeze({
    event: 'punctuation.star_evidence_deduped_by_template',
    status: 'reserved',
  }),
});
