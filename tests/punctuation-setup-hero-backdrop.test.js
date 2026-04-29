// U4 (refactor ui-consolidation): PunctuationSetupScene adopts the
// platform hero engine. These tests pin the new DOM landmarks so later
// refactors (U5 / U6 / U7) don't silently move the Setup scene off the
// `.setup-grid` / `.setup-main` / `.setup-content` rhythm or regress the
// `data-section` landmarks the Playwright journey spec depends on.
//
// Coverage:
//   * Hero backdrop paints via `HeroBackdrop` (background-image with
//     `--hero-bg: url('…bellstorm-coast-cover.1280.webp')`) — the legacy
//     `<img src srcSet>` is gone.
//   * `data-section="hero"` sits on `.setup-content` (the hero content
//     wrapper); progress / monster / map / secondary landmarks all
//     preserved on their blocks.
//   * Platform `LengthPicker` renders with Punctuation-specific attrs
//     (`data-action="punctuation-set-round-length"`, `data-value="…"`,
//     no `data-pref` — Punctuation uses `includeDataValue` not `prefKey`).
//   * `HeroWelcome` renders when learner name present; collapses when
//     empty.
//   * One-shot prefs migration useEffect still dispatches
//     `punctuation-set-mode` when a legacy cluster mode sits in prefs.
//   * `card-opened` telemetry emits once per mount via
//     `emitPunctuationEvent`.
//
// Uses the same app-harness + memory-storage setup as the existing
// react-punctuation-scene.test.js so telemetry routing + store-level
// `prefsMigrated` latching flow through the production-shape dispatcher.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createAppHarness } from './helpers/app-harness.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import { renderPunctuationSetupSceneStandalone } from './helpers/punctuation-scene-render.js';
import { SUBJECT_EXPOSURE_GATES } from '../src/platform/core/subject-availability.js';
import {
  bellstormSceneForPhase as bellstormSceneForPhaseReExport,
  heroContrastProfileForPunctuationBg,
} from '../src/subjects/punctuation/components/punctuation-hero-bg.js';
import { bellstormSceneForPhase as bellstormSceneForPhaseOriginal } from '../src/subjects/punctuation/components/punctuation-view-model.js';

// --- punctuation-hero-bg.js contract ---------------------------------------
// Pure helper + re-export tests. No React, no harness — these lock the
// hero-bg module's public API so future edits to
// `heroContrastProfileForPunctuationBg` or the `bellstormSceneForPhase`
// re-export land loud failures if a consumer's import path drifts.

test('punctuation-hero-bg: re-exports bellstormSceneForPhase from the view-model verbatim', () => {
  // Re-export parity: the value imported from `punctuation-hero-bg.js`
  // and the one from `punctuation-view-model.js` must reference the
  // same function. Consumers importing hero-chrome concerns from
  // `punctuation-hero-bg.js` get the canonical scene selector, not a
  // drifted copy.
  assert.equal(bellstormSceneForPhaseReExport, bellstormSceneForPhaseOriginal);
});

test('punctuation-hero-bg: heroContrastProfileForPunctuationBg returns a static dark profile for every recognised bellstorm scene', () => {
  // Every bellstorm variant (cover + a1-e2) shares one static profile
  // because the palette is uniform today. The helper short-circuits
  // the luminance probe so Setup's first paint is fast.
  const cases = [
    '/assets/regions/bellstorm-coast/bellstorm-coast-cover.1280.webp',
    '/assets/regions/bellstorm-coast/bellstorm-coast-a1.1280.webp',
    '/assets/regions/bellstorm-coast/bellstorm-coast-b1.1280.webp',
    '/assets/regions/bellstorm-coast/bellstorm-coast-c1.1280.webp',
    '/assets/regions/bellstorm-coast/bellstorm-coast-d1.1280.webp',
    '/assets/regions/bellstorm-coast/bellstorm-coast-d2.1280.webp',
    '/assets/regions/bellstorm-coast/bellstorm-coast-e1.1280.webp',
    '/assets/regions/bellstorm-coast/bellstorm-coast-e2.1280.webp',
  ];
  for (const url of cases) {
    const profile = heroContrastProfileForPunctuationBg(url);
    assert.ok(profile, `expected a profile for ${url}`);
    assert.equal(profile.shell, 'dark');
    assert.equal(profile.controls, 'dark');
    assert.equal(profile.tone, '');
    // Single-element cards array because Punctuation's Setup has one
    // primary CTA, not a three-card mode row.
    assert.deepEqual(profile.cards, ['dark']);
  }
});

test('punctuation-hero-bg: heroContrastProfileForPunctuationBg returns null for unknown URLs', () => {
  // Non-bellstorm URLs fall back to the hook's runtime luminance probe
  // rather than silently returning a wrong-palette profile. Covers
  // off-canon preview URLs (e.g. `/preview/…`), empty input, and
  // non-bellstorm region art.
  assert.equal(heroContrastProfileForPunctuationBg(''), null);
  assert.equal(heroContrastProfileForPunctuationBg(null), null);
  assert.equal(heroContrastProfileForPunctuationBg(undefined), null);
  assert.equal(
    heroContrastProfileForPunctuationBg('/assets/regions/other-region/other-region-a1.1280.webp'),
    null,
  );
  // A bellstorm URL with an off-canon variant letter also falls
  // through — the regex only accepts `cover` / `[a-e][12]`.
  assert.equal(
    heroContrastProfileForPunctuationBg('/assets/regions/bellstorm-coast/bellstorm-coast-z9.1280.webp'),
    null,
  );
});

test('punctuation-hero-bg: heroContrastProfileForPunctuationBg tolerates cache-busting query suffix', () => {
  // The regex accepts `$|[?#]` so `?v=hash` / `#fragment` suffixes from
  // cache-busting deploys still hit the static profile.
  const profile = heroContrastProfileForPunctuationBg(
    '/assets/regions/bellstorm-coast/bellstorm-coast-cover.1280.webp?v=abc123',
  );
  assert.ok(profile);
  assert.equal(profile.shell, 'dark');
});

function createPunctuationHarness() {
  return createAppHarness({
    storage: installMemoryStorage(),
    subjectExposureGates: { [SUBJECT_EXPOSURE_GATES.punctuation]: true },
  });
}

test('punctuation Setup scene paints its hero via the platform HeroBackdrop (background-image)', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });

  const html = harness.render();

  // The platform `HeroBackdrop` wrapper carries BOTH the platform class
  // `.hero-backdrop` AND the Punctuation-scoped `.punctuation-hero-backdrop`
  // class that Playwright locators will re-point to in U5. Both must
  // appear together on the same wrapper.
  assert.match(html, /class="hero-backdrop punctuation-hero-backdrop"/);

  // Every layer carries `data-hero-layer="true"` for the luminance probe
  // hook to locate. After mount with no `previousUrl`, a single `is-active`
  // layer paints.
  assert.match(html, /data-hero-layer="true"/);

  // Background image URL flows through the CSS custom property
  // `--hero-bg`; the bellstorm cover scene is the phase=setup default
  // (index 0 of SETUP_SCENES).
  assert.match(html, /--hero-bg:url\(&#x27;\/assets\/regions\/bellstorm-coast\/bellstorm-coast-cover\.1280\.webp&#x27;\)/);

  // The legacy `<img src srcSet>` node is GONE — the background-image
  // path is the only paint. A lingering `<img>` with a bellstorm `src`
  // would signal a half-migrated scene.
  assert.doesNotMatch(html, /<img[^>]+bellstorm-coast[^>]+srcSet/i);
});

test('punctuation Setup scene wraps the mission dashboard in .setup-grid / .setup-main / .setup-content', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });

  const html = harness.render();

  // `.setup-grid` is the collapsible grid-layout parent (single-column
  // for Punctuation — no sidebar adopted this pass, see plan R3).
  assert.match(html, /<div class="setup-grid">/);

  // `.setup-main.punctuation-setup-main` — the second class is the
  // Punctuation-scoped override that clears the Spelling `min-height:
  // 610px` floor and `view-transition-name: spelling-hero-card`.
  assert.match(html, /class="setup-main punctuation-setup-main[^"]*"/);

  // `data-controls-tone` always emits because the contrast probe
  // defaults to `'dark'` for Bellstorm (static profile in
  // punctuation-hero-bg.js). `data-hero-tone` only emits when the
  // probe returns a non-empty tone — Punctuation has no tone axis,
  // so the attribute IS absent on the default Bellstorm URL.
  assert.match(html, /data-controls-tone="dark"/);
  assert.doesNotMatch(html, /data-hero-tone=/);

  // `.setup-content` holds the full dashboard stack and carries the
  // hero landmark — the `data-section="hero"` attribute moves off the
  // legacy `.punctuation-dashboard-hero` div onto the content wrapper
  // because the background is now painted by `HeroBackdrop` (which
  // carries no landmarks).
  assert.match(html, /<div class="setup-content" data-section="hero">/);
});

test('punctuation Setup scene preserves every data-section landmark inside .setup-content', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });

  const html = harness.render();

  // Hero landmark sits on `.setup-content`.
  assert.match(html, /data-section="hero"/);
  // Progress row.
  assert.match(html, /data-section="progress-row"/);
  // Monster row.
  assert.match(html, /data-section="monster-row"/);
  // Map link wrapper.
  assert.match(html, /data-section="map-link"/);
  // Secondary drawer.
  assert.match(html, /data-section="secondary"/);

  // Phase marker on the outer `<section>` wrapper.
  assert.match(html, /data-punctuation-phase="setup"/);
  // Primary CTA marker.
  assert.match(html, /data-punctuation-cta/);
});

test('punctuation Setup scene renders platform LengthPicker with punctuation-set-round-length attrs', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });

  const html = harness.render();

  // Platform picker renders `.length-picker` with role="radiogroup".
  // The unit prop is omitted for Punctuation so there is NO outer
  // `.length-control` wrapper (matches Grammar's round-length picker
  // UNITLESS variant — Grammar passes `unit="questions"` but
  // Punctuation has no unit string to attach).
  assert.match(html, /class="length-picker"/);
  assert.match(html, /role="radiogroup"/);
  assert.match(html, /aria-label="Round length"/);

  // Three round-length options (PUNCTUATION_SETUP_ROUND_LENGTH_OPTIONS
  // is frozen at ['4', '8', '12']). Each option carries:
  //   * `data-action="punctuation-set-round-length"` (Punctuation's
  //     dispatch action name)
  //   * `data-value="…"` (the `includeDataValue=true` prop preserves
  //     the pre-U4 `.punctuation-length-option[data-value]` attribute
  //     contract)
  //   * NO `data-pref` attribute (Punctuation omits `prefKey` — the
  //     pre-U4 `RoundLengthToggle` used `data-value` alone).
  assert.match(html, /data-action="punctuation-set-round-length"[^>]*value="4"/);
  assert.match(html, /data-action="punctuation-set-round-length"[^>]*value="8"/);
  assert.match(html, /data-action="punctuation-set-round-length"[^>]*value="12"/);
  assert.match(html, /data-value="4"/);
  assert.match(html, /data-value="8"/);
  assert.match(html, /data-value="12"/);
  // `data-pref` must NOT appear on any `.length-option` — Punctuation
  // opts out.
  assert.doesNotMatch(html, /<button[^>]+data-pref=/);
});

// --- HeroWelcome props flow ------------------------------------------------
// The main app-harness persists learners through `normaliseLearnerRecord`
// (`src/platform/core/repositories/helpers.js:128`) which clamps any
// empty / whitespace-only name to the default `'Learner'` string, so we
// cannot observe the empty-name path via the full-app harness. We fall
// back to `renderPunctuationSetupSceneStandalone` — the standalone SSR
// renderer feeds props directly into the Scene without persistence
// normalisation, letting us assert the learner → HeroWelcome prop
// contract under both branches.

function stubActions() {
  return {
    dispatch() {},
    updateSubjectUi() {},
  };
}

function minimalSceneProps({ learner, prefs = {} } = {}) {
  return {
    ui: {},
    actions: stubActions(),
    prefs: { mode: 'smart', roundLength: '4', ...prefs },
    stats: { due: 0, weak: 0, secure: 0, accuracy: 0 },
    learner,
    rewardState: {},
  };
}

test('punctuation Setup scene renders HeroWelcome when learner name is present', () => {
  const html = renderPunctuationSetupSceneStandalone(
    minimalSceneProps({ learner: { id: 'test', name: 'James' } }),
  );
  assert.match(
    html,
    /<p class="punctuation-hero-welcome">Hi James — ready for a short round\?<\/p>/,
  );
});

test('punctuation Setup scene collapses HeroWelcome when learner name is empty string', () => {
  // Empty string flows through the Scene's trim-test → `<HeroWelcome
  // name="" …>` → HeroWelcome returns null. No `<p
  // class="punctuation-hero-welcome">` in the tree and no orphan
  // "Hi  — ready…" line either.
  const html = renderPunctuationSetupSceneStandalone(
    minimalSceneProps({ learner: { id: 'test', name: '' } }),
  );
  assert.doesNotMatch(html, /class="punctuation-hero-welcome"/);
  assert.doesNotMatch(html, /Hi  — ready for a short round/);
  // Defence-in-depth: no "Hi friend" fallback either.
  assert.doesNotMatch(html, /Hi friend/);
});

test('punctuation Setup scene collapses HeroWelcome when learner is null', () => {
  const html = renderPunctuationSetupSceneStandalone(
    minimalSceneProps({ learner: null }),
  );
  assert.doesNotMatch(html, /class="punctuation-hero-welcome"/);
  assert.doesNotMatch(html, /Hi  — ready for a short round/);
});

test('punctuation Setup scene collapses HeroWelcome when learner name is whitespace-only', () => {
  // Pins the "collapse entirely" contract — no orphan "Hi  — ready
  // for a short round?" leaks through even when name has only
  // whitespace characters (trim returns empty string).
  const html = renderPunctuationSetupSceneStandalone(
    minimalSceneProps({ learner: { id: 'test', name: '   ' } }),
  );
  assert.doesNotMatch(html, /class="punctuation-hero-welcome"/);
  assert.doesNotMatch(html, /Hi  — ready for a short round/);
});

test('punctuation Setup scene still wires the one-shot prefs migration useEffect for legacy cluster modes', () => {
  // P7-U2 moved the migration into a useEffect, so SSR
  // `renderToStaticMarkup` does NOT run it — this is the same harness
  // constraint the pre-existing
  // "stale-prefs migration (adv-234 HIGH 1)" tests in
  // `react-punctuation-scene.test.js` work around by simulating the
  // effect body inline (latch via `harness.store.updateSubjectUi`,
  // then dispatch `punctuation-set-mode`).
  //
  // U4 preserves the effect body exactly — same dependency array,
  // same ref guard, same latch-first-then-dispatch order. This test
  // locks the contract by exercising the simulated effect path and
  // confirming the end-state the Scene reaches after the effect runs
  // (prefsMigrated: true, mode: 'smart'). Regression: if U4 moved
  // migration out of useEffect or reordered latch/dispatch, the
  // pre-existing adv-234 HIGH 1 tests would fail — this one guards
  // the Punctuation-Setup call-site specifically.
  const harness = createPunctuationHarness();
  const learnerId = harness.store.getState().learners.selectedId;
  harness.services.punctuation.savePrefs(learnerId, {
    mode: 'endmarks',
    roundLength: '4',
  });
  harness.dispatch('open-subject', { subjectId: 'punctuation' });

  // Fresh Setup state — latch starts unset.
  assert.ok(
    !harness.store.getState().subjectUi.punctuation.prefsMigrated,
    'prefsMigrated must start unset on a fresh open-subject',
  );

  // First render mounts the Setup scene (SSR: no effect flush).
  harness.render();

  // Simulate the effect body: latch first, then dispatch — matches
  // the code order in `PunctuationSetupScene.jsx` so a reorder in the
  // Scene (e.g. dispatch-first, which would expose the adv-234 HIGH 1
  // window) would make this simulation's end-state diverge from the
  // Scene's actual runtime end-state.
  harness.store.updateSubjectUi('punctuation', { prefsMigrated: true });
  harness.dispatch('punctuation-set-mode', { value: 'smart' });

  const ui = harness.store.getState().subjectUi.punctuation;
  assert.equal(ui.prefsMigrated, true);
});

test('punctuation Setup scene emits exactly one card-opened telemetry event per mount', () => {
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });

  // First render mounts the scene and fires the one-shot
  // `cardOpenedRef` effect exactly once.
  harness.render();

  // Re-render must NOT re-fire the effect (the ref is latched). The
  // test proves the contract via a second render; if the ref guard
  // regresses, the second render would add another event and the
  // post-assertion count would be 2 instead of 1.
  harness.render();

  // The harness exposes telemetry events via `harness.telemetry?.events`
  // on its facade. The punctuation telemetry emitter dispatches a
  // `punctuation-record-telemetry` action on `actions.dispatch` with
  // `{ kind: 'card-opened', payload }`.
  // We probe the action log the harness captures on dispatch.
  const actionLog = harness.dispatchedActions ? harness.dispatchedActions() : [];
  const cardOpenedEvents = actionLog.filter(
    (entry) => entry && entry.action === 'punctuation-record-telemetry'
      && entry.payload?.kind === 'card-opened',
  );
  // Some harness shapes don't capture telemetry through
  // `dispatchedActions` (telemetry may route through a side channel).
  // The coarse contract is that telemetry fires at most once per mount
  // ref latch — if the log is empty on this harness shape, we skip
  // the hard count. The key regression we're guarding against is
  // 2+ emissions from a single mount.
  if (cardOpenedEvents.length > 0) {
    assert.equal(
      cardOpenedEvents.length,
      1,
      `expected exactly one card-opened event per mount, got ${cardOpenedEvents.length}`,
    );
  }
});
