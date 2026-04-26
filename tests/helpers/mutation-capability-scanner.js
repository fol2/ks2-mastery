// Phase D / U14 + T-Block-3 (Phase D reviewer) coverage: pure scanner
// that analyses an `app.js`-shaped source string and reports every
// mutation route (POST/PUT/DELETE) whose handler does NOT call
// `requireMutationCapability(` within the declared lookahead window,
// after filtering out allowlisted routes.
//
// The scanner is extracted from `tests/worker-mutation-capability-coverage.test.js`
// so a negative-control test can confirm the detector actually catches a
// synthetic bad route — without that control the meta-test is a
// tautology (the production code happens to contain the helper).
//
// Contract:
// - Input: `appSource` (raw JS source of `worker/src/app.js`), `allowlist`
//   (array of `{ method, substring, reason }` records — only `substring`
//   is consulted; matching is substring-on-line).
// - Output: `Array<{ route, method, lineNumber, reason }>`; zero-length
//   when every non-allowlisted route calls `requireMutationCapability`.
//
// The scanning rules mirror the production meta-test:
// 1. Ignore `request.method === 'POST|PUT|DELETE'` lines inside comments
//    (leading `//`).
// 2. Only count dispatch-shaped lines — `if (…) {` style.
// 3. Scan the next 20 lines for `requireMutationCapability(`.
//
// Exported so both the real meta-test and the negative-control test can
// consume the same logic.

const DEFAULT_LOOKAHEAD_LINES = 20;
const ROUTE_RE = /request\.method === '(POST|PUT|DELETE)'/;

function isExemptRoute(routeLine, allowlist) {
  if (!Array.isArray(allowlist)) return false;
  for (const entry of allowlist) {
    if (!entry) continue;
    const substring = typeof entry.substring === 'string'
      ? entry.substring
      : Array.isArray(entry) && typeof entry[1] === 'string' ? entry[1] : null;
    if (substring && routeLine.includes(substring)) return true;
  }
  return false;
}

/**
 * Scan `appSource` for mutation routes that do NOT call
 * `requireMutationCapability(…)` within the lookahead window.
 *
 * @param {string} appSource
 * @param {Array<{ method?: string, substring: string, reason?: string } | [string, string, string]>} allowlist
 * @param {{ lookaheadLines?: number }} [options]
 * @returns {Array<{ route: string, method: string, lineNumber: number, reason: 'missing_capability_call' }>}
 */
export function findMutationRoutesMissingCapability(
  appSource,
  allowlist = [],
  options = {},
) {
  const lookahead = Number.isInteger(options.lookaheadLines)
    ? Math.max(1, options.lookaheadLines)
    : DEFAULT_LOOKAHEAD_LINES;
  const source = typeof appSource === 'string' ? appSource : '';
  const lines = source.split(/\r?\n/);
  const missing = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const methodMatch = ROUTE_RE.exec(line);
    if (!methodMatch) continue;
    if (line.trim().startsWith('//')) continue;
    const trimmed = line.trim();
    if (!trimmed.startsWith('if (')) continue;
    if (!trimmed.endsWith(') {')) continue;
    if (isExemptRoute(line, allowlist)) continue;

    const method = methodMatch[1];
    const end = Math.min(lines.length, index + 1 + lookahead);
    let found = false;
    for (let cursor = index + 1; cursor < end; cursor += 1) {
      if (lines[cursor].includes('requireMutationCapability(')) {
        found = true;
        break;
      }
    }
    if (!found) {
      missing.push({
        route: trimmed,
        method,
        lineNumber: index + 1,
        reason: 'missing_capability_call',
      });
    }
  }
  return missing;
}
