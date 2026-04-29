// P6-U8 — Punctuation telemetry manifest with lifecycle status and test classification.
//
// Manifest-leaf module (zero imports from sibling modules, Object.freeze).
// Maps each telemetry event name to a lifecycle status:
//   - `emitted`: the event has a callsite in the Worker command handler
//   - `reserved`: the event name is registered but no callsite exists yet
//   - `deprecated`: the event name is retired and must NOT be emitted
//
// Test classification (`testLevel`):
//   - `proof`:  the command-path test deterministically forces the event to fire;
//               the test CANNOT pass without the event being emitted.
//   - `smoke`:  the command-path test exercises a scenario that MAY trigger the
//               event depending on scheduling randomness; useful coverage but
//               not a guarantee of emission on every run.
//   - `null`:   no test applies (reserved/deprecated events with no callsite).
//
// The `telemetry-events.js` sibling remains the canonical name-list;
// this module layers lifecycle metadata on top without importing it.

export const PUNCTUATION_TELEMETRY_MANIFEST = Object.freeze({
  GENERATED_SIGNATURE_EXPOSED: Object.freeze({
    event: 'punctuation.generated_signature_exposed',
    status: 'emitted',
    testLevel: 'smoke',
  }),
  GENERATED_SIGNATURE_REPEATED: Object.freeze({
    event: 'punctuation.generated_signature_repeated',
    status: 'emitted',
    testLevel: 'smoke',
  }),
  SCHEDULER_REASON_SELECTED: Object.freeze({
    event: 'punctuation.scheduler_reason_selected',
    status: 'emitted',
    testLevel: 'proof',
  }),
  MISCONCEPTION_RETRY_SCHEDULED: Object.freeze({
    event: 'punctuation.misconception_retry_scheduled',
    status: 'emitted',
    testLevel: 'smoke',
  }),
  MISCONCEPTION_RETRY_PASSED: Object.freeze({
    event: 'punctuation.misconception_retry_passed',
    status: 'emitted',
    testLevel: 'smoke',
  }),
  SPACED_RETURN_SCHEDULED: Object.freeze({
    event: 'punctuation.spaced_return_scheduled',
    status: 'emitted',
    testLevel: 'smoke',
  }),
  SPACED_RETURN_PASSED: Object.freeze({
    event: 'punctuation.spaced_return_passed',
    status: 'emitted',
    testLevel: 'smoke',
  }),
  RETENTION_AFTER_SECURE_SCHEDULED: Object.freeze({
    event: 'punctuation.retention_after_secure_scheduled',
    status: 'emitted',
    testLevel: 'smoke',
  }),
  RETENTION_AFTER_SECURE_PASSED: Object.freeze({
    event: 'punctuation.retention_after_secure_passed',
    status: 'emitted',
    testLevel: 'smoke',
  }),
  STAR_EVIDENCE_DEDUPED_BY_SIGNATURE: Object.freeze({
    event: 'punctuation.star_evidence_deduped_by_signature',
    status: 'emitted',
    testLevel: 'smoke',
  }),
  STAR_EVIDENCE_DEDUPED_BY_TEMPLATE: Object.freeze({
    event: 'punctuation.star_evidence_deduped_by_template',
    status: 'reserved',
    testLevel: null,
  }),
});
