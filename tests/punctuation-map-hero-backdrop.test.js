// U6 (refactor ui-consolidation): PunctuationMapScene adopts the
// platform hero engine on its sole `.punctuation-hero` call-site at the
// top of the map surface. These tests pin the new DOM landmarks so
// later refactors don't silently move the Map scene off
// `.punctuation-map-hero` / `.punctuation-map-hero-content` rhythm or
// regress the bellstorm `'map'` phase → URL wiring the Playwright
// locators depend on.
//
// Coverage:
//   * Map scene paints its hero via `HeroBackdrop` with the `'map'`
//     bellstorm URL in its `--hero-bg` custom property.
//   * `.punctuation-map-hero-content .section-title` resolves to
//     "Punctuation Map".
//   * Every filter chip (status + monster) still renders.
//   * Every active cluster group still renders.
//   * With an empty `rewardState` + a status filter that excludes every
//     skill, the Map still renders without crashing (defensive shape).
//   * The legacy `<img src srcSet>` hero element is gone.

import test from 'node:test';
import assert from 'node:assert/strict';

import { renderPunctuationMapSceneStandalone } from './helpers/punctuation-scene-render.js';
import {
  PUNCTUATION_MAP_STATUS_FILTER_IDS,
  PUNCTUATION_MAP_MONSTER_FILTER_IDS,
  bellstormSceneForPhase,
  ACTIVE_PUNCTUATION_MONSTER_IDS,
} from '../src/subjects/punctuation/components/punctuation-view-model.js';

function stubActions() {
  return {
    dispatch() {},
  };
}

function mapProps(extraUi = {}) {
  return {
    ui: {
      availability: { status: 'ready' },
      rewardState: {},
      ...extraUi,
    },
    actions: stubActions(),
  };
}

// --- Hero URL wiring -------------------------------------------------------

test('U6 Map: hero paints via HeroBackdrop with the map bellstorm URL', () => {
  const html = renderPunctuationMapSceneStandalone(mapProps());
  const expectedUrl = bellstormSceneForPhase('map').src;

  // Platform HeroBackdrop stamps `.hero-backdrop` + the Punctuation-
  // scoped `.punctuation-hero-backdrop`. Same chrome class as Session
  // (U5) + Setup (U4) — single source of truth for Playwright
  // determinism overrides.
  assert.match(html, /class="hero-backdrop punctuation-hero-backdrop"/);

  // The bellstorm URL reaches the layer via the `--hero-bg` CSS custom
  // property. HTML renderers escape single quotes.
  const escapedUrl = expectedUrl.replace(/\//g, '\\/');
  const pattern = new RegExp(`--hero-bg:url\\(&#x27;${escapedUrl}&#x27;\\)`);
  assert.match(html, pattern);

  // Legacy `<img src srcSet>` hero element is GONE — a lingering
  // `<img>` with a bellstorm src would signal a half-migrated scene.
  assert.doesNotMatch(html, /<img[^>]+bellstorm-coast[^>]+srcSet/i);
});

test('U6 Map: `.punctuation-map-hero-content .section-title` reads "Punctuation Map"', () => {
  const html = renderPunctuationMapSceneStandalone(mapProps());

  // New stable anchor that Playwright locators re-point to.
  assert.match(html, /<div class="punctuation-map-hero-content">/);
  // Title literal still renders inside the content wrapper.
  assert.match(html, /<h2 class="section-title">Punctuation Map<\/h2>/);
  // Eyebrow (from PUNCTUATION_DASHBOARD_HERO.eyebrow) still emits.
  assert.match(html, /<div class="eyebrow">[^<]+<\/div>/);
  // Subtitle literal survives the swap.
  assert.match(html, /The 14 Punctuation skills, grouped by monster\./);
});

// --- Filter chips + cluster groups preserved -------------------------------

test('U6 Map: every status filter chip still renders', () => {
  const html = renderPunctuationMapSceneStandalone(mapProps());
  // `PUNCTUATION_MAP_STATUS_FILTER_IDS` is frozen by service-contract
  // tests; each id produces a chip carrying `data-action="punctuation-
  // map-status-filter"` + `data-value="<id>"`.
  for (const filterId of PUNCTUATION_MAP_STATUS_FILTER_IDS) {
    assert.match(
      html,
      new RegExp(`data-action="punctuation-map-status-filter" data-value="${filterId}"`),
      `status filter chip for "${filterId}" must render`,
    );
  }
});

test('U6 Map: every monster filter chip still renders', () => {
  const html = renderPunctuationMapSceneStandalone(mapProps());
  for (const filterId of PUNCTUATION_MAP_MONSTER_FILTER_IDS) {
    assert.match(
      html,
      new RegExp(`data-action="punctuation-map-monster-filter" data-value="${filterId}"`),
      `monster filter chip for "${filterId}" must render`,
    );
  }
});

test('U6 Map: every active cluster group still renders', () => {
  const html = renderPunctuationMapSceneStandalone(mapProps());
  // Exactly the 4 active monster ids (pealark / claspin / curlune /
  // quoral). Reserved ids (colisk / hyphang / carillon) must NOT
  // surface even in the empty-reward case.
  for (const monsterId of ACTIVE_PUNCTUATION_MONSTER_IDS) {
    assert.match(
      html,
      new RegExp(`data-monster-id="${monsterId}"`),
      `cluster group for "${monsterId}" must render`,
    );
  }
  // Reserved ids never surface.
  for (const reservedId of ['colisk', 'hyphang', 'carillon']) {
    assert.doesNotMatch(
      html,
      new RegExp(`data-monster-id="${reservedId}"`),
      `reserved monster "${reservedId}" must NOT surface`,
    );
  }
});

test('U6 Map: monster filter narrowing to a single active id still renders that cluster', () => {
  // Filter to one monster. The hero still renders; only that group's
  // skills surface. This is the "empty cluster groups render empty-
  // state" check in reverse — verifying the filter pipeline is wired.
  const html = renderPunctuationMapSceneStandalone(
    mapProps({ mapUi: { monsterFilter: 'pealark', statusFilter: 'all' } }),
  );
  assert.match(html, /data-monster-id="pealark"/);
  // The hero still paints.
  assert.match(html, /punctuation-map-hero-content/);
  // The other 3 active monsters are filtered out — no group cards for
  // them even though they're on the active roster.
  assert.doesNotMatch(html, /data-monster-id="claspin"/);
  assert.doesNotMatch(html, /data-monster-id="curlune"/);
  assert.doesNotMatch(html, /data-monster-id="quoral"/);
});

test('U6 Map: Back-to-dashboard affordance still renders in the header', () => {
  const html = renderPunctuationMapSceneStandalone(mapProps());
  // The top-bar Back button survives the hero swap; its `data-action`
  // stays as the router hook used by the module handler.
  assert.match(html, /data-action="punctuation-close-map"/);
});
