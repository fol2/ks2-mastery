/**
 * Grammar QG P10 — Template certification status.
 *
 * Exports the certification status map and a helper to determine whether a
 * template is blocked from learner-facing scheduling.  The underlying data
 * lives in reports/grammar/grammar-qg-p10-certification-status-map.json (the
 * evidence artefact) but is inlined here as a JS module so static import in
 * Cloudflare Workers works without JSON import assertions.
 *
 * P10 evidence: oracle, review, prompt-cue-render, distractor-audit, marking-matrix.
 */

import { GRAMMAR_TEMPLATE_METADATA } from './content.js';

// Build the certification map at module load time from GRAMMAR_TEMPLATE_METADATA.
// All 78 templates are approved as of P10 certification — this matches the JSON
// artefact committed to reports/grammar/.  If a future phase needs to block a
// template, change the status here AND in the JSON artefact.
const CERTIFICATION_STATUS_MAP = Object.freeze(
  Object.fromEntries(
    GRAMMAR_TEMPLATE_METADATA.map((t) => [
      t.id,
      Object.freeze({ status: 'approved', evidence: Object.freeze(['oracle', 'review', 'prompt-cue-render', 'distractor-audit', 'marking-matrix']) }),
    ]),
  ),
);

/**
 * Test-only override set.  When a templateId is present in this set,
 * isTemplateBlocked returns true regardless of the certification map.
 * Production code never touches this — only test harnesses add/clear entries.
 */
export const _testBlockOverride = new Set();

/**
 * Returns true if the given templateId has status 'blocked' in the
 * certification map.  Unknown template IDs are treated as blocked (fail-closed).
 */
export function isTemplateBlocked(templateId) {
  if (_testBlockOverride.has(templateId)) return true;
  const entry = CERTIFICATION_STATUS_MAP[templateId];
  if (!entry) return true; // fail-closed: unknown templates are blocked
  return entry.status === 'blocked';
}

export { CERTIFICATION_STATUS_MAP };
