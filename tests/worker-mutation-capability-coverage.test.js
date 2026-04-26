// Phase D / U14 coverage meta-test: every mutation-receipt-bearing route
// in `worker/src/app.js` must call `requireMutationCapability(session)`
// within 20 lines of its `request.method === 'PUT|POST|DELETE'` check, or
// appear in the documented allowlist below.
//
// Why: a future PR adding a new mutation route could silently forget the
// capability helper, enabling `payment_hold` accounts to write. This
// structural assertion fails CI the moment such a route lands.
//
// T-Block-3 (Phase D reviewer) fix: the scanning logic is extracted into
// `tests/helpers/mutation-capability-scanner.js` so a sibling negative-
// control test (`worker-mutation-capability-scanner-negative.test.js`)
// can prove the detector actually finds a bad route. Without that
// control, this meta-test was a tautology — the production code happens
// to contain the helper, so the test could have been broken and still
// passed.
//
// References: docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md §U14

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { findMutationRoutesMissingCapability } from './helpers/mutation-capability-scanner.js';

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

// Adapter: convert the legacy `[method, substring, reason]` shape into the
// `{ substring }` record the scanner expects.
function asScannerAllowlist(tuples) {
  return tuples.map(([method, substring, reason]) => ({ method, substring, reason }));
}

test('U14 coverage — every mutation route calls requireMutationCapability', () => {
  const source = readFileSync(APP_JS, 'utf8');
  const missing = findMutationRoutesMissingCapability(
    source,
    asScannerAllowlist(ALLOWLIST),
  );
  if (missing.length) {
    const report = missing
      .map((entry) => `  line ${entry.lineNumber}: ${entry.route}`)
      .join('\n');
    assert.fail(`The following mutation routes must call requireMutationCapability(session) within 20 lines (or be added to the test's ALLOWLIST with a reason):\n${report}`);
  }
});

test('U14 coverage — meta-test scanner finds at least one mutation route in app.js', () => {
  // Sanity: if the regex ever stops matching (e.g. the codebase switches
  // to `request.method.toUpperCase() === 'POST'`), the meta-test would
  // silently pass because `missing.length === 0`. Prove we actually found
  // routes by invoking the scanner with an empty allowlist and asserting
  // the raw match count exceeds a floor.
  const source = readFileSync(APP_JS, 'utf8');
  // We expect SOME routes to be in the allowlist (exempt) but the RAW
  // scan without any allowlist should see at least one handler we
  // already know exists. Bypass the exempt filter by passing []; any
  // route not calling `requireMutationCapability` would surface.
  // Since the production code IS compliant, the unfiltered list should
  // only report allowlisted routes — we expect at least 3 of them so
  // the scanner is demonstrably live.
  const unfilteredMisses = findMutationRoutesMissingCapability(source, []);
  assert.ok(
    unfilteredMisses.length >= 3,
    `Expected the scanner to surface at least the allowlisted routes; got ${unfilteredMisses.length}. Scanner regex may be broken.`,
  );
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
