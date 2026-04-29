// U6 (Admin Console P6): Release readiness classification for content operations.
//
// Pure logic module that classifies per-subject release readiness based on
// validation blockers, warnings, and lifecycle state. Consumes the normalised
// subject envelope shape and produces rendering-ready badge data.
//
// Content-free leaf invariant: this module MUST NOT import subject content
// datasets, subject engines, or any module that transitively pulls in
// spelling / grammar / punctuation content bundles.

/**
 * Release readiness states.
 * @enum {string}
 */
export const RELEASE_READINESS = Object.freeze({
  READY: 'ready',
  BLOCKED: 'blocked',
  WARNINGS_ONLY: 'warnings_only',
  NOT_APPLICABLE: 'not_applicable',
});

/**
 * Badge metadata for each readiness state.
 * @type {Record<string, { label: string, chipClass: string }>}
 */
const READINESS_BADGE_MAP = Object.freeze({
  [RELEASE_READINESS.READY]: { label: 'Ready', chipClass: 'good' },
  [RELEASE_READINESS.BLOCKED]: { label: 'Blocked', chipClass: 'bad' },
  [RELEASE_READINESS.WARNINGS_ONLY]: { label: 'Warnings', chipClass: 'warn' },
  [RELEASE_READINESS.NOT_APPLICABLE]: { label: 'N/A', chipClass: '' },
});

/**
 * Classify the release readiness state for a single subject.
 *
 * Decision tree:
 *   - placeholder lifecycle → NOT_APPLICABLE (subject not live or gated)
 *   - has validation blockers → BLOCKED
 *   - has warnings but no blockers → WARNINGS_ONLY
 *   - no blockers and no warnings → READY
 *
 * @param {object} subject — normalised subject envelope with:
 *   - validationBlockers: string[] (empty if no validation system exists)
 *   - validationWarnings: string[] (empty if no validation system exists)
 *   - status: 'live' | 'gated' | 'placeholder'
 * @returns {string} one of RELEASE_READINESS values
 */
export function classifyReleaseReadiness(subject) {
  if (!subject || typeof subject !== 'object' || Array.isArray(subject)) {
    return RELEASE_READINESS.NOT_APPLICABLE;
  }
  if (subject.status === 'placeholder') {
    return RELEASE_READINESS.NOT_APPLICABLE;
  }

  const blockers = Array.isArray(subject.validationBlockers) ? subject.validationBlockers : [];
  const warnings = Array.isArray(subject.validationWarnings) ? subject.validationWarnings : [];

  if (blockers.length > 0) return RELEASE_READINESS.BLOCKED;
  if (warnings.length > 0) return RELEASE_READINESS.WARNINGS_ONLY;
  return RELEASE_READINESS.READY;
}

/**
 * Build a release readiness model for an array of normalised subjects.
 *
 * Returns an array of objects, one per subject, containing:
 *   - subjectKey
 *   - readiness (RELEASE_READINESS value)
 *   - badge ({ label, chipClass })
 *   - blockerCount
 *   - warningCount
 *
 * @param {object[]} subjects — array of normalised subject envelopes
 * @returns {Array<{ subjectKey: string, readiness: string, badge: { label: string, chipClass: string }, blockerCount: number, warningCount: number }>}
 */
export function buildReleaseReadinessModel(subjects) {
  if (!Array.isArray(subjects)) return [];
  return subjects.map((subject) => {
    const safe = subject && typeof subject === 'object' && !Array.isArray(subject) ? subject : {};
    const readiness = classifyReleaseReadiness(safe);
    const badge = READINESS_BADGE_MAP[readiness] || READINESS_BADGE_MAP[RELEASE_READINESS.NOT_APPLICABLE];
    const blockers = Array.isArray(safe.validationBlockers) ? safe.validationBlockers : [];
    const warnings = Array.isArray(safe.validationWarnings) ? safe.validationWarnings : [];
    return {
      subjectKey: typeof safe.subjectKey === 'string' ? safe.subjectKey : 'unknown',
      readiness,
      badge,
      blockerCount: blockers.length,
      warningCount: warnings.length,
    };
  });
}

/**
 * Get the badge metadata for a given readiness value.
 *
 * @param {string} readiness — a RELEASE_READINESS value
 * @returns {{ label: string, chipClass: string }}
 */
export function readinessBadge(readiness) {
  return READINESS_BADGE_MAP[readiness] || READINESS_BADGE_MAP[RELEASE_READINESS.NOT_APPLICABLE];
}
