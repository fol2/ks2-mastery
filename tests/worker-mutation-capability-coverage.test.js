// Phase D / U14 coverage meta-test: every mutation-receipt-bearing route
// in `worker/src/app.js` must call `requireMutationCapability(session)`
// within 20 lines of its `request.method === 'PUT|POST|DELETE'` check, or
// appear in the documented allowlist below.
//
// Why: a future PR adding a new mutation route could silently forget the
// capability helper, enabling `payment_hold` accounts to write. This
// structural assertion fails CI the moment such a route lands.
//
// References: docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md §U14

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_JS = path.join(rootDir, 'worker', 'src', 'app.js');

// Routes that are EXEMPT from the capability check, with the documented
// reason. Each entry is `[method, pathnameSubstring, reason]`. The
// pathnameSubstring is matched against the exact route-check expression
// the test sees on the source line (e.g. `url.pathname === '/api/auth/login'`
// or `oauthStart && request.method === 'POST'`).
const ALLOWLIST = [
  // Public / unauthenticated endpoints — they fire BEFORE `requireSession`.
  ['POST', "'/api/security/csp-report'", 'unauthenticated CSP report endpoint'],
  ['POST', "'/api/demo/session'", 'creates a NEW demo session; no existing session to check'],
  ['POST', "'/api/auth/register'", 'mints a new session for an account that did not exist yet'],
  ['POST', "'/api/auth/login'", 'mints a new session; no prior session to check capability on'],
  ['POST', "'/api/auth/logout'", 'logout should always work regardless of ops_status'],
  ['POST', 'oauthStart', 'OAuth start mints a new session; capability check happens at createSession'],
  ['POST', 'oauthCallback', 'OAuth callback is completed before any session exists'],
  ['GET', 'oauthCallback', 'OAuth callback is completed before any session exists'],
  ['POST', "'/api/ops/error-event'", 'Public client-error ingest; authenticated state not required'],
];

function isExemptRoute(routeLine) {
  return ALLOWLIST.some(([, substring]) => routeLine.includes(substring));
}

test('U14 coverage — every mutation route calls requireMutationCapability', () => {
  const source = readFileSync(APP_JS, 'utf8');
  const lines = source.split(/\r?\n/);

  // Find every `request.method === 'POST|PUT|DELETE'` check line that is
  // also part of a route handler dispatch (i.e. an `if (...)` that
  // introduces a route block — the current codebase style). The filter
  // explicitly ignores lines like `const payload = request.method === 'POST'
  // ? ... : ...` inside an existing handler body (ternary payload selector).
  const ROUTE_RE = /request\.method === '(POST|PUT|DELETE)'/;
  const matches = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!ROUTE_RE.test(line)) continue;
    // Skip lines that are inside a comment.
    if (line.trim().startsWith('//')) continue;
    // Only count lines that look like route dispatch — they start with
    // `if (` (optionally after whitespace) and end with `) {` so they are
    // a handler entry, not a value expression.
    const trimmed = line.trim();
    if (!trimmed.startsWith('if (')) continue;
    if (!trimmed.endsWith(') {')) continue;
    matches.push({ line: index + 1, text: line });
  }
  assert.ok(matches.length > 0, 'expected at least one mutation route to be discovered');

  const missing = [];
  for (const { line, text } of matches) {
    if (isExemptRoute(text)) continue;
    // Look in the next 20 lines for `requireMutationCapability(`.
    const end = Math.min(lines.length, line + 20);
    let found = false;
    for (let lookahead = line; lookahead < end; lookahead += 1) {
      if (lines[lookahead].includes('requireMutationCapability(')) {
        found = true;
        break;
      }
    }
    if (!found) {
      missing.push({ line, text: text.trim() });
    }
  }

  if (missing.length) {
    const report = missing
      .map((entry) => `  line ${entry.line}: ${entry.text}`)
      .join('\n');
    assert.fail(`The following mutation routes must call requireMutationCapability(session) within 20 lines (or be added to the test's ALLOWLIST with a reason):\n${report}`);
  }
});

test('U14 coverage — allowlist entries reference real lines in app.js', () => {
  // Defence against stale allowlist entries that no longer map to a real
  // route. Every allowlisted entry must correspond to at least one live
  // route-check line.
  const source = readFileSync(APP_JS, 'utf8');
  const stale = [];
  for (const [, substring, reason] of ALLOWLIST) {
    if (!source.includes(substring)) {
      stale.push({ substring, reason });
    }
  }
  if (stale.length) {
    const report = stale
      .map((entry) => `  "${entry.substring}" (${entry.reason})`)
      .join('\n');
    assert.fail(`Allowlist entries reference substrings that no longer exist in app.js:\n${report}`);
  }
});
