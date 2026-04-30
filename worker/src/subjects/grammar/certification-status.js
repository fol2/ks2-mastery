/**
 * Grammar QG P13 — runtime certification status authority.
 *
 * The generated module embeds the certified P11/P12 status decisions in a
 * Worker-safe form. Unknown templates fail closed instead of being inferred
 * from metadata.
 */
import {
  CERTIFICATION_STATUS_MAP,
  GRAMMAR_RUNTIME_CERTIFICATION_RELEASE_ID,
  GRAMMAR_RUNTIME_CERTIFICATION_SOURCE,
  GRAMMAR_RUNTIME_CERTIFICATION_SOURCE_GENERATED_AT,
  GRAMMAR_RUNTIME_CERTIFICATION_STATUS_COUNTS,
  GRAMMAR_RUNTIME_CERTIFICATION_TEMPLATE_COUNT,
} from './certification-status.generated.js';

/**
 * Test-only override set. When a templateId is present in this set,
 * isTemplateBlocked returns true regardless of the certification map.
 * Production code never touches this; only test harnesses add/clear entries.
 */
export const _testBlockOverride = new Set();

export function getTemplateCertificationStatus(templateId) {
  if (typeof templateId !== 'string' || !templateId) return null;
  return CERTIFICATION_STATUS_MAP[templateId] || null;
}

export function isTemplateBlocked(templateId) {
  if (typeof templateId !== 'string' || !templateId) return true;
  if (_testBlockOverride.has(templateId)) return true;

  const entry = CERTIFICATION_STATUS_MAP[templateId];
  if (!entry) return true;
  return entry.status === 'blocked' || entry.status === 'retire_candidate';
}

export {
  CERTIFICATION_STATUS_MAP,
  GRAMMAR_RUNTIME_CERTIFICATION_RELEASE_ID,
  GRAMMAR_RUNTIME_CERTIFICATION_SOURCE,
  GRAMMAR_RUNTIME_CERTIFICATION_SOURCE_GENERATED_AT,
  GRAMMAR_RUNTIME_CERTIFICATION_STATUS_COUNTS,
  GRAMMAR_RUNTIME_CERTIFICATION_TEMPLATE_COUNT,
};
