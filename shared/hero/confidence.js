// shared/hero/confidence.js
// Extracted from hero-pA3-telemetry-extract.mjs and hero-pA3-metrics-summary.mjs
// to eliminate duplication.

/**
 * Classify statistical confidence based on observation count.
 * @param {number} count - number of observations
 * @returns {'high'|'medium'|'low'|'insufficient'}
 */
export function classifyConfidence(count) {
  if (count >= 100) return 'high';
  if (count >= 30) return 'medium';
  if (count >= 10) return 'low';
  return 'insufficient';
}
