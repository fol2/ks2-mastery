// ── Hero Metrics Privacy — shared recursive validator ──────────────
// Zero side-effects. No imports from worker/, src/, react, or node: built-ins.
// Provides recursive privacy validation and stripping for Hero Mode pA2.

/**
 * Fields that must never appear in telemetry payloads at any nesting depth.
 * Superset covering both metric-contract and telemetry-probe requirements.
 */
export const PRIVACY_FORBIDDEN_FIELDS = Object.freeze([
  'rawAnswer',
  'rawPrompt',
  'childFreeText',
  'childInput',
  'answerText',
  'rawText',
  'childContent',
]);

const MAX_DEPTH = 50;

/**
 * Recursively validate that an event payload contains no forbidden fields
 * at any nesting depth. Reports violations with dotted path notation.
 *
 * @param {Record<string, unknown>} eventPayload
 * @returns {{ valid: boolean, violations: string[] }}
 */
export function validateMetricPrivacyRecursive(eventPayload) {
  const violations = [];
  if (!eventPayload || typeof eventPayload !== 'object') {
    return { valid: true, violations };
  }
  walkForViolations(eventPayload, '', 0, violations);
  return { valid: violations.length === 0, violations };
}

/**
 * @param {unknown} node
 * @param {string} path
 * @param {number} depth
 * @param {string[]} violations
 */
function walkForViolations(node, path, depth, violations) {
  if (depth > MAX_DEPTH) return;
  if (node === null || node === undefined || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const itemPath = path ? `${path}[${i}]` : `[${i}]`;
      walkForViolations(node[i], itemPath, depth + 1, violations);
    }
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    const fullPath = path ? `${path}.${key}` : key;
    if (PRIVACY_FORBIDDEN_FIELDS.includes(key)) {
      violations.push(fullPath);
    }
    if (value && typeof value === 'object') {
      walkForViolations(value, fullPath, depth + 1, violations);
    }
  }
}

/**
 * Recursively strip privacy-sensitive fields from an object at any depth.
 * Returns a new object — never mutates the input.
 *
 * @param {unknown} obj
 * @returns {unknown}
 */
export function stripPrivacyFields(obj) {
  return stripRecursive(obj, 0);
}

/**
 * @param {unknown} node
 * @param {number} depth
 * @returns {unknown}
 */
function stripRecursive(node, depth) {
  if (node === null || node === undefined) return node;
  if (typeof node !== 'object') return node;
  if (depth > MAX_DEPTH) return node;

  if (Array.isArray(node)) {
    return node.map((item) => stripRecursive(item, depth + 1));
  }

  const result = {};
  for (const [key, value] of Object.entries(node)) {
    if (PRIVACY_FORBIDDEN_FIELDS.includes(key)) continue;
    result[key] = stripRecursive(value, depth + 1);
  }
  return result;
}
