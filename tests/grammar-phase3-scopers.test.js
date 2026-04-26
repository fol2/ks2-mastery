// Phase 4 U2 — characterisation tests for the hardened Phase 3 scopers.
//
// The six scopers in `tests/helpers/grammar-phase3-renders.js`
// (scopeDashboard, scopeSession, scopeSummary, scopeBank, scopeTransfer,
// scopeAnalytics) now throw a named error when the
// `data-grammar-phase-root="<phase>"` semantic landmark is missing. Before
// U2, the scopers silently fell back to returning the full HTML on a
// regex no-match — which turned the Phase 3 forbidden-term sweep into a
// false-positive silencer if a DOM refactor dropped a CSS class. See the
// Phase 4 plan's U2 execution note and invariant 12.
//
// These tests feed SYNTHETIC HTML strings directly to the exported
// scopers so the throw path is pinned independently of live harness
// output. A broken production render (landmark attribute missing) is
// simulated via a crafted HTML string; the happy path is simulated with
// a minimal well-formed landmark wrapper; the edge case (landmark
// present but no closing tag) proves the regex no-match throws rather
// than returning unbalanced HTML.
//
// Why a separate file from `grammar-phase3-child-copy.test.js`: those
// tests characterise Phase 3 copy presence/absence against live
// harness renders. The scoper throw path is a lower-level contract that
// belongs in its own file so its error messages stay stable if the
// child-copy test ever re-organises.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  scopeDashboard,
  scopeSession,
  scopeSummary,
  scopeBank,
  scopeTransfer,
  scopeAnalytics,
  renderGrammarChildPhaseFixture,
} from './helpers/grammar-phase3-renders.js';

// Fixed table of (scoper, phase label, expected landmark tag type) so the
// error-path and edge-case loops iterate uniformly.
const SCOPER_MATRIX = Object.freeze([
  { label: 'dashboard', scoper: scopeDashboard, tag: 'section' },
  { label: 'session', scoper: scopeSession, tag: 'section' },
  { label: 'summary', scoper: scopeSummary, tag: 'div' },
  { label: 'bank', scoper: scopeBank, tag: 'section' },
  { label: 'transfer', scoper: scopeTransfer, tag: 'section' },
  { label: 'analytics', scoper: scopeAnalytics, tag: 'section' },
]);

// -----------------------------------------------------------------------------
// Error path — landmark attribute entirely missing
// -----------------------------------------------------------------------------

for (const { label, scoper } of SCOPER_MATRIX) {
  test(`U2: scope${label[0].toUpperCase()}${label.slice(1)} throws when data-grammar-phase-root is missing`, () => {
    // Broken render: a DOM refactor dropped the landmark attribute (and
    // the CSS class too, so even the pre-U2 fallback regex would miss).
    // The hardened scoper must surface the drift as a named throw.
    const brokenHtml = '<main><div>no landmark here</div></main>';
    assert.throws(
      () => scoper(brokenHtml),
      new RegExp(`scope${label[0].toUpperCase()}${label.slice(1)}: no data-grammar-phase-root="${label}" landmark found`),
      `scope${label} must throw when no landmark is present`,
    );
  });
}

// -----------------------------------------------------------------------------
// Error path — landmark attribute present but for a DIFFERENT phase
// -----------------------------------------------------------------------------

for (const { label, scoper } of SCOPER_MATRIX) {
  test(`U2: scope${label[0].toUpperCase()}${label.slice(1)} throws when landmark belongs to a different phase`, () => {
    // A copy-paste error between scenes lands a non-matching landmark in
    // the HTML. The scoper must still throw — it is phase-specific, not
    // just "any landmark".
    const wrongPhase = label === 'dashboard' ? 'session' : 'dashboard';
    const spoofHtml = `<main><section data-grammar-phase-root="${wrongPhase}">content</section></main>`;
    assert.throws(
      () => scoper(spoofHtml),
      new RegExp(`scope${label[0].toUpperCase()}${label.slice(1)}: no data-grammar-phase-root="${label}" landmark found`),
      `scope${label} must reject a landmark for a different phase`,
    );
  });
}

// -----------------------------------------------------------------------------
// Edge case — landmark present but closing tag missing (unbalanced HTML)
// -----------------------------------------------------------------------------

for (const { label, scoper, tag } of SCOPER_MATRIX) {
  test(`U2: scope${label[0].toUpperCase()}${label.slice(1)} throws on landmark with no closing tag`, () => {
    // Truncated HTML: landmark is present but the closing tag is gone.
    // The regex must refuse to return unbalanced HTML — silent truncation
    // would let downstream sweeps operate on a half-DOM and miss drift.
    const truncated = `<${tag} data-grammar-phase-root="${label}">content with no closer`;
    assert.throws(
      () => scoper(truncated),
      new RegExp(`scope${label[0].toUpperCase()}${label.slice(1)}: no data-grammar-phase-root="${label}" landmark found`),
      `scope${label} must throw on landmark-present-no-closer`,
    );
  });
}

// -----------------------------------------------------------------------------
// Edge case — dashboard/summary/transfer require a sibling boundary marker
// -----------------------------------------------------------------------------

test('U2: scopeDashboard throws when grown-up-view sibling boundary is missing', () => {
  // Dashboard's regex pins the root `</section>` via lookahead to the
  // sibling `<details class="grammar-grown-up-view">`. If the sibling is
  // absent (e.g. a broken shell), the lookahead fails and the scoper
  // throws rather than walking to the first nested `</section>`.
  const noSibling = '<section data-grammar-phase-root="dashboard"><section>inner</section></section>';
  assert.throws(
    () => scopeDashboard(noSibling),
    /scopeDashboard: no data-grammar-phase-root="dashboard" landmark found/,
  );
});

test('U2: scopeSummary throws when </main> boundary is missing', () => {
  // Summary's regex pins the root `</div>` via lookahead to `</main>`.
  // Without the main close, the lazy match would bind to the first inner
  // `</div>` — the scoper refuses to do that and throws instead.
  const noMain = '<div data-grammar-phase-root="summary"><div>inner</div></div>';
  assert.throws(
    () => scopeSummary(noMain),
    /scopeSummary: no data-grammar-phase-root="summary" landmark found/,
  );
});

test('U2: scopeTransfer throws when </div></main> boundary is missing', () => {
  // Transfer's regex pins the root `</section>` via lookahead to
  // `</div></main>`. Without that sibling pair, the scoper throws.
  const noClosers = '<section data-grammar-phase-root="transfer"><section>inner</section></section>';
  assert.throws(
    () => scopeTransfer(noClosers),
    /scopeTransfer: no data-grammar-phase-root="transfer" landmark found/,
  );
});

// -----------------------------------------------------------------------------
// Happy path — landmark present + correct closing boundary
// -----------------------------------------------------------------------------

test('U2: scopeDashboard returns a narrowed substring on well-formed HTML', () => {
  const html = '<main><section data-grammar-phase-root="dashboard" class="grammar-dashboard">body</section><details class="grammar-grown-up-view">adult</details></main>';
  const scoped = scopeDashboard(html);
  assert.match(scoped, /data-grammar-phase-root="dashboard"/);
  assert.match(scoped, /body/);
  assert.doesNotMatch(scoped, /adult/, 'scoped must exclude the sibling grown-up content');
  assert.ok(scoped.length < html.length, 'scoped must be strictly narrower than full HTML');
});

test('U2: scopeSession returns a narrowed substring on well-formed HTML', () => {
  const html = '<main><nav>nav</nav><section data-grammar-phase-root="session">body</section></main>';
  const scoped = scopeSession(html);
  assert.match(scoped, /data-grammar-phase-root="session"/);
  assert.match(scoped, /body/);
  assert.doesNotMatch(scoped, /nav>nav</, 'scoped must exclude the preceding nav');
  assert.ok(scoped.length < html.length, 'scoped must be strictly narrower than full HTML');
});

test('U2: scopeSummary returns a narrowed substring on well-formed HTML', () => {
  const html = '<main><nav>nav</nav><div data-grammar-phase-root="summary"><div>inner</div><section>shell</section></div></main>';
  const scoped = scopeSummary(html);
  assert.match(scoped, /data-grammar-phase-root="summary"/);
  assert.match(scoped, /shell/);
  assert.doesNotMatch(scoped, /nav>nav</, 'scoped must exclude the preceding nav');
  assert.ok(scoped.length < html.length, 'scoped must be strictly narrower than full HTML');
});

test('U2: scopeBank returns a narrowed substring on well-formed HTML', () => {
  const html = '<main><nav>nav</nav><section data-grammar-phase-root="bank">body</section></main>';
  const scoped = scopeBank(html);
  assert.match(scoped, /data-grammar-phase-root="bank"/);
  assert.match(scoped, /body/);
  assert.doesNotMatch(scoped, /nav>nav</);
  assert.ok(scoped.length < html.length);
});

test('U2: scopeTransfer returns a narrowed substring on well-formed HTML', () => {
  const html = '<main><div><nav>nav</nav><section data-grammar-phase-root="transfer"><section>inner</section></section></div></main>';
  const scoped = scopeTransfer(html);
  assert.match(scoped, /data-grammar-phase-root="transfer"/);
  assert.match(scoped, /inner/);
  assert.doesNotMatch(scoped, /nav>nav</);
  assert.ok(scoped.length < html.length);
});

test('U2: scopeAnalytics returns a narrowed substring on well-formed HTML', () => {
  const html = '<main><nav>nav</nav><section data-grammar-phase-root="analytics">body</section></main>';
  const scoped = scopeAnalytics(html);
  assert.match(scoped, /data-grammar-phase-root="analytics"/);
  assert.match(scoped, /body/);
  assert.doesNotMatch(scoped, /nav>nav</);
  assert.ok(scoped.length < html.length);
});

// -----------------------------------------------------------------------------
// Follower-up adversarial surface — nested-outer wrapper + duplicate landmark
// -----------------------------------------------------------------------------
//
// A reviewer reproduction fed a landmark nested inside a same-type outer
// wrapper: `<section class="outer"><section data-grammar-phase-root=
// "dashboard">INNER</section><p>OUTER-TEXT</p></section><details class=
// "grammar-grown-up-view">`. The pre-follower lazy-regex scoper returned
// scoped output with the trailing `<p>OUTER-TEXT</p></section>` still
// attached — adult copy would leak into the child sweep. The hardened
// depth-balanced helper either returns only the inner landmark's own
// subtree or throws loud if the expected sibling boundary is violated.
//
// A second attack fed two same-phase landmarks in the same HTML. The
// pre-follower scoper silently merged both subtrees into one scoped
// string; the hardened helper throws with a `duplicate ... landmark`
// message so a stale fixture fails loud.

test('U2: scopeDashboard rejects nested-outer wrapper attack (no trailing OUTER-TEXT leak)', () => {
  // Reviewer's exact reproduction. Either the scoper narrows correctly
  // (no `OUTER-TEXT`) or it throws. Both outcomes are acceptable — the
  // one outcome that is NOT acceptable is returning a scoped string that
  // contains `OUTER-TEXT`, because that is the adult-copy leak this
  // follower is defending against.
  const attack = '<section class="outer"><section data-grammar-phase-root="dashboard">INNER</section><p>OUTER-TEXT</p></section><details class="grammar-grown-up-view">';
  let scoped = null;
  let threw = null;
  try {
    scoped = scopeDashboard(attack);
  } catch (err) {
    threw = err;
  }
  if (threw) {
    assert.match(
      threw.message,
      /scopeDashboard: (no data-grammar-phase-root="dashboard" landmark found|duplicate data-grammar-phase-root="dashboard" landmark)/,
      'throw message must identify the scoper and the failure mode',
    );
    return;
  }
  assert.ok(scoped !== null, 'scoper must either throw or return a narrowed string');
  assert.doesNotMatch(
    scoped,
    /OUTER-TEXT/,
    'scoped output must not carry the trailing outer-wrapper text — adult-copy leak class bug',
  );
});

test('U2: scopeSummary rejects duplicate-landmark attack with clear error', () => {
  // Two stale-landmark `<div>`s in the same HTML would silently merge
  // into one scoped string under the old lazy regex. The follower
  // requires a clear, named throw so the fixture author sees the defect.
  const attack = '<main><div data-grammar-phase-root="summary">STALE</div><div data-grammar-phase-root="summary">FRESH</div></main>';
  assert.throws(
    () => scopeSummary(attack),
    /scopeSummary: duplicate data-grammar-phase-root="summary" landmark/,
    'duplicate-landmark attack must surface a dedicated throw',
  );
});

// -----------------------------------------------------------------------------
// Integration — live harness renders produce HTML that the hardened scopers
// accept without throwing, and the scoped substring is strictly narrower
// than the raw HTML (proving the narrowing actually fires).
// -----------------------------------------------------------------------------

// Phrases that appear only inside the adult `<details class=
// "grammar-grown-up-view">` disclosure. A reviewer finding pointed out
// that the prior integration assertions (landmark present + some
// narrowing) did not catch scope-leak — a regex that captured too much
// would still carry both a landmark substring AND trailing adult copy
// while being length-narrower than `rawHtml`. The absence assertions
// below fail fast on that class of defect for the five child phases.
const ADULT_MARKERS = Object.freeze(['grammar-grown-up-view', 'Evidence snapshot']);

const LIVE_HARNESS_PHASES = Object.freeze([
  'dashboard',
  'session-pre',
  'summary',
  'bank',
  'transfer',
  'analytics',
]);

// Only `analytics` legitimately carries the adult copy; every other live
// phase in the harness is a child scene whose scoped output must exclude
// the disclosure and its adult vocabulary.
const ADULT_LIVE_PHASES = Object.freeze(['analytics']);

for (const phase of LIVE_HARNESS_PHASES) {
  test(`U2: live ${phase} render carries the data-grammar-phase-root landmark`, () => {
    // End-to-end confirmation that the six `Grammar*Scene.jsx` components
    // emit the landmark attribute into their rendered HTML. A React
    // refactor that drops the prop would be surfaced here before the
    // broader Phase 3 gate even runs.
    const { html, rawHtml } = renderGrammarChildPhaseFixture(phase);
    // `html` is the scoped substring. It must contain the landmark and
    // be strictly narrower than the raw rendered surface.
    assert.match(
      html,
      /data-grammar-phase-root="/,
      `${phase} scoped HTML must contain the landmark attribute`,
    );
    assert.ok(
      html.length < rawHtml.length,
      `${phase} scoped HTML (${html.length}) must be strictly narrower than raw HTML (${rawHtml.length})`,
    );
    // Child phases must exclude every adult marker. The analytics phase
    // is exempt — it IS the adult surface and legitimately carries
    // `Evidence snapshot` etc. Splitting the assertion this way makes a
    // silent scope-leak in any child phase fail loud.
    if (!ADULT_LIVE_PHASES.includes(phase)) {
      for (const marker of ADULT_MARKERS) {
        assert.ok(
          !html.includes(marker),
          `${phase} scoped HTML must NOT contain adult marker "${marker}" — scope leak`,
        );
      }
    }
  });
}

// Dedicated characterisation test that names the attack surface explicitly
// for the dashboard live render. A reviewer follow-up flagged the risk that
// a regex variant could still narrow `html.length < rawHtml.length` while
// carrying the adult disclosure — this test spells out that exact guard in
// a standalone case so a future regression cannot silently slip past the
// parameterised loop above.
test('U2: live dashboard scoped HTML excludes the grown-up-view disclosure (adult-copy absence)', () => {
  const { html } = renderGrammarChildPhaseFixture('dashboard');
  assert.ok(
    !html.includes('grammar-grown-up-view'),
    'dashboard scoped HTML must not contain the grown-up-view disclosure class — adult scope leak',
  );
  assert.ok(
    !html.includes('Evidence snapshot'),
    'dashboard scoped HTML must not contain the Evidence snapshot adult phrase — adult scope leak',
  );
});
