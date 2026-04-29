// Scheduler tuning constants — manifest-leaf module (zero sibling imports).

// Exposure limits
export const MAX_SAME_SIGNATURE_PER_SESSION = 1;
export const MAX_SAME_SIGNATURE_ACROSS_ATTEMPTS = 3;
export const MAX_SAME_SIGNATURE_DAYS = 7;

// Misconception retry
export const MISCONCEPTION_RETRY_WINDOW = 5; // look back N items for misconception match
export const MISCONCEPTION_RETRY_PREFER_DIFFERENT_TEMPLATE = true;

// Spaced return
export const SPACED_RETURN_MIN_DAYS = 3;
export const RETENTION_AFTER_SECURE_MIN_DAYS = 7;

// Reason tags (enum-like frozen object)
export const REASON_TAGS = Object.freeze({
  DUE_REVIEW: 'due-review',
  WEAK_SKILL_REPAIR: 'weak-skill-repair',
  MISCONCEPTION_RETRY: 'misconception-retry',
  SPACED_RETURN: 'spaced-return',
  MIXED_REVIEW: 'mixed-review',
  RETENTION_AFTER_SECURE: 'retention-after-secure',
  BREADTH_GAP: 'breadth-gap',
  FALLBACK: 'fallback',
});

// Weight modifiers for exposure limits
export const EXPOSURE_WEIGHT_BLOCKED = 0.01;
export const EXPOSURE_WEIGHT_PENALISED = 0.1;
export const EXPOSURE_WEIGHT_DAY_AVOIDED = 0.3;
