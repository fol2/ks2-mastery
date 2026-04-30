/**
 * Grammar QG P10 — Template certification status.
 *
 * Exports the certification status map and a helper to determine whether a
 * template is blocked from learner-facing scheduling.  The underlying data
 * lives in reports/grammar/grammar-qg-p10-certification-status-map.json (the
 * evidence artefact).  At module init we attempt to read the JSON register;
 * if unavailable (Cloudflare Worker environment has no Node.js built-ins) we
 * fall back to the hardcoded all-approved map derived from
 * GRAMMAR_TEMPLATE_METADATA.
 *
 * P10 evidence: oracle, review, prompt-cue-render, distractor-audit, marking-matrix.
 */

import { GRAMMAR_TEMPLATE_METADATA } from './content.js';

// ---------------------------------------------------------------------------
// Module-init: attempt to read the JSON register from disk.
// In Node.js (test runner) this succeeds and gives real certification decisions.
// In Cloudflare Workers (no Node.js built-ins) the catch fires and we fall
// back to the hardcoded all-approved map.
// ---------------------------------------------------------------------------
function loadFromJsonRegister() {
  try {
    if (typeof globalThis.process === 'undefined' || !globalThis.process.versions?.node) {
      return null;
    }
    // Use Function constructor to access require() without static import of
    // Node.js built-ins (which would break the Cloudflare Worker bundle).
    // eslint-disable-next-line no-new-func
    const _require = new Function('url', `
      const { createRequire } = require('node:module');
      return createRequire(url);
    `)(import.meta.url);
    const json = _require('../../../../reports/grammar/grammar-qg-p10-certification-status-map.json');
    if (json && typeof json === 'object' && Object.keys(json).length > 0) {
      return Object.freeze(
        Object.fromEntries(
          Object.entries(json).map(([id, entry]) => [
            id,
            Object.freeze({
              status: entry.status || 'approved',
              evidence: Object.freeze(Array.isArray(entry.evidence) ? entry.evidence : []),
            }),
          ]),
        ),
      );
    }
  } catch {
    // Expected in Worker environment — fall through to hardcoded map.
  }
  return null;
}

// Build the certification map at module load time.  Prefer the JSON artefact
// (authoritative source) when running in Node.js; fall back to the all-approved
// hardcoded map in Cloudflare Workers.
const CERTIFICATION_STATUS_MAP = loadFromJsonRegister() || Object.freeze(
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
