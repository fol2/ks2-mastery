// Phase D / U14 + T-Block-3 (Phase D reviewer) negative control for the
// `findMutationRoutesMissingCapability` scanner. The meta-test alone is a
// tautology — the production `app.js` happens to be compliant, so a
// broken regex / counterproductive-lookahead change would still pass.
// These synthetic fixtures exercise the failure modes the detector is
// supposed to catch:
//
// 1. Known-bad synthetic app.js with 3 mutation routes: 2 call
//    `requireMutationCapability`, 1 does not → scanner returns exactly
//    1 entry, identifying the bad route.
// 2. Same fixture with the bad route allowlisted → scanner returns [].
// 3. Known-bad where the capability call is >20 lines after the route
//    check → scanner still flags it (lookahead boundary enforced).
//
// The scanner is imported directly so these tests run without touching
// the real `worker/src/app.js`.
//
// References: docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md §U14

import test from 'node:test';
import assert from 'node:assert/strict';

import { findMutationRoutesMissingCapability } from './helpers/mutation-capability-scanner.js';

// Synthetic app.js-shaped source. Each route obeys the same structural
// pattern the scanner keys off: `if (…request.method === '…') {`.
const SYNTHETIC_APP_JS = `
// SYNTHETIC fixture — NOT production code. Mirrors app.js route-dispatch
// shape so the scanner can exercise its happy path + failure path.

export default {
  fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/good-one' && request.method === 'POST') {
      const session = await auth.requireSession(request);
      requireMutationCapability(session);
      return json({ ok: true });
    }

    if (url.pathname === '/api/good-two' && request.method === 'PUT') {
      const session = await auth.requireSession(request);
      requireMutationCapability(session);
      return json({ ok: true });
    }

    if (url.pathname === '/api/bad-one' && request.method === 'DELETE') {
      const session = await auth.requireSession(request);
      // BUG: forgot to call requireMutationCapability. Scanner must flag.
      return json({ ok: true });
    }

    return json({ ok: false }, 404);
  },
};
`;

test('negative control — scanner flags exactly one non-compliant route', () => {
  const missing = findMutationRoutesMissingCapability(SYNTHETIC_APP_JS, []);
  assert.equal(missing.length, 1, `Expected exactly 1 flagged route; got ${missing.length}: ${JSON.stringify(missing)}`);
  const [entry] = missing;
  assert.equal(entry.method, 'DELETE');
  assert.match(entry.route, /\/api\/bad-one/);
  assert.equal(entry.reason, 'missing_capability_call');
  assert.ok(entry.lineNumber > 0, 'lineNumber should be 1-based');
});

test('negative control — allowlisting the bad route yields empty result', () => {
  const missing = findMutationRoutesMissingCapability(SYNTHETIC_APP_JS, [
    { method: 'DELETE', substring: "'/api/bad-one'", reason: 'intentional test exemption' },
  ]);
  assert.equal(missing.length, 0, `Expected 0 flagged routes after allowlist; got ${missing.length}`);
});

test('negative control — allowlisting uses substring match across method shapes', () => {
  // The tuple-flavour allowlist (matches the real meta-test's array
  // shape) should also be honoured.
  const missing = findMutationRoutesMissingCapability(SYNTHETIC_APP_JS, [
    ['DELETE', "'/api/bad-one'", 'intentional test exemption'],
  ]);
  assert.equal(missing.length, 0);
});

test('negative control — capability call BEYOND the 20-line window is still flagged', () => {
  // Pad the handler body with 25 blank lines so the capability call ends
  // up AFTER the default lookahead. The scanner must STILL flag it.
  const padding = Array.from({ length: 25 }, () => '      // filler line').join('\n');
  const beyondWindow = `
export default {
  fetch(request) {
    if (url.pathname === '/api/bad-far' && request.method === 'POST') {
      const session = await auth.requireSession(request);
${padding}
      requireMutationCapability(session);
      return json({ ok: true });
    }
    return json({ ok: false }, 404);
  },
};
`;
  const missing = findMutationRoutesMissingCapability(beyondWindow, []);
  assert.equal(missing.length, 1, `Expected the capability call >20 lines away to be flagged; got ${missing.length}`);
  assert.equal(missing[0].method, 'POST');
  assert.match(missing[0].route, /\/api\/bad-far/);
});

test('negative control — custom lookaheadLines allows tightening or widening the window', () => {
  // Shrink the lookahead to 2 — the first good fixture (where the
  // capability call is ~2 lines after the route check) may or may not
  // hit the flag depending on spacing. Use lookahead=1 to FORCE a flag.
  const aggressive = findMutationRoutesMissingCapability(SYNTHETIC_APP_JS, [], { lookaheadLines: 1 });
  assert.ok(
    aggressive.length >= 3,
    `lookaheadLines=1 should force every route to flag; got ${aggressive.length}`,
  );
});

test('negative control — empty source returns empty result', () => {
  assert.deepEqual(findMutationRoutesMissingCapability('', []), []);
  assert.deepEqual(findMutationRoutesMissingCapability(null, []), []);
  assert.deepEqual(findMutationRoutesMissingCapability(undefined, []), []);
});

test('negative control — commented-out route is NOT flagged (leading // ignored)', () => {
  const commented = `
export default {
  fetch() {
    // if (url.pathname === '/api/disabled' && request.method === 'POST') {
    //   return json({ ok: true });
    // }
    return json({ ok: false });
  },
};
`;
  assert.deepEqual(findMutationRoutesMissingCapability(commented, []), []);
});
