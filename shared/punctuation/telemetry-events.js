// U11 — Punctuation learning-health telemetry event names.
//
// Manifest-leaf module (zero imports from sibling modules).
// Consumed by the command handler to emit scheduler and evidence telemetry.

export const PUNCTUATION_TELEMETRY_EVENTS = Object.freeze({
  GENERATED_SIGNATURE_EXPOSED: 'punctuation.generated_signature_exposed',
  GENERATED_SIGNATURE_REPEATED: 'punctuation.generated_signature_repeated',
  SCHEDULER_REASON_SELECTED: 'punctuation.scheduler_reason_selected',
  MISCONCEPTION_RETRY_SCHEDULED: 'punctuation.misconception_retry_scheduled',
  MISCONCEPTION_RETRY_PASSED: 'punctuation.misconception_retry_passed',
  SPACED_RETURN_SCHEDULED: 'punctuation.spaced_return_scheduled',
  SPACED_RETURN_PASSED: 'punctuation.spaced_return_passed',
  RETENTION_AFTER_SECURE_SCHEDULED: 'punctuation.retention_after_secure_scheduled',
  RETENTION_AFTER_SECURE_PASSED: 'punctuation.retention_after_secure_passed',
  STAR_EVIDENCE_DEDUPED_BY_SIGNATURE: 'punctuation.star_evidence_deduped_by_signature',
  STAR_EVIDENCE_DEDUPED_BY_TEMPLATE: 'punctuation.star_evidence_deduped_by_template',
});
