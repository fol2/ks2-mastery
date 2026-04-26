// Phase 3 U7 — Punctuation Map + Skill Detail Modal read-model redaction sweep.
//
// Characterisation-only fixture-driven sweep across every rendered Map scene
// state (6 status × 5 monster filter combinations) and every Skill Detail
// modal state (14 skills × 2 tabs). Each render is grepped for every entry in
// `FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS` — zero hits expected.
//
// Why this test file exists (plan U7, line 641-677):
//
// U5 shipped `PunctuationMapScene.jsx` and U6 shipped
// `PunctuationSkillDetailModal.jsx`. Both scenes read from client-held data
// (`PUNCTUATION_CLIENT_SKILLS` + `PUNCTUATION_SKILL_MODAL_CONTENT` + the
// analytics-snapshot `skillRows` + the reward monster state) — no new Worker
// read-model projection was introduced. The Phase 2 U2 recursive
// fail-closed scan in `worker/src/subjects/punctuation/read-models.js`
// therefore still covers the whole child surface.
//
// This test is the regression lock that catches a future unit from either:
//   (a) plumbing a forbidden key from the Worker payload through the Map /
//       Modal render path, or
//   (b) introducing a child-facing copy string that literally reads the
//       internal key name `validator` / `rubric` / `correctIndex` / etc.
//
// The forbidden list comes from `tests/helpers/forbidden-keys.mjs` — the
// single source of truth for the Punctuation read-model key universe
// (aligned with `worker/src/subjects/punctuation/read-models.js` and
// `scripts/punctuation-production-smoke.mjs`).
//
// Scan strategy:
// - Case-sensitive substring match per forbidden key. Mirrors the
//   `doesNotMatch(/accepted|correctIndex|rubric|validator|generator|hiddenQueue/)`
//   pattern already used by `tests/react-punctuation-scene.test.js` lines
//   61-62, 231, 321, 352.
// - We deliberately do not mask HTML attributes because the forbidden list
//   is camel-case / internal-identifier-shaped (`correctIndex`, `hiddenQueue`,
//   `rawGenerator`, `queueItemIds`, `unpublished`, `rubric`, `validator`)
//   or low-frequency in child copy (`seed`, `generator`, `responses`) —
//   any hit is a real leak.
// - Child-facing copy sanity: "accepted" / "answers" strings are Session-
//   scene-only (GPS chip row) and never land on Map / Modal renders. The
//   scan runs on Map + Modal HTML in isolation so a Session-scene copy
//   string cannot taint the assertion.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createAppHarness } from './helpers/app-harness.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import { FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS } from './helpers/forbidden-keys.mjs';
import { SUBJECT_EXPOSURE_GATES } from '../src/platform/core/subject-availability.js';
import {
  PUNCTUATION_MAP_MONSTER_FILTER_IDS,
  PUNCTUATION_MAP_STATUS_FILTER_IDS,
} from '../src/subjects/punctuation/service-contract.js';
import { PUNCTUATION_CLIENT_SKILLS } from '../src/subjects/punctuation/read-model.js';

// ---------------------------------------------------------------------------
// Harness helpers — mirror the `openMapScene` pattern from
// `tests/react-punctuation-scene.test.js` so fixture semantics stay aligned
// with the U5 / U6 tests.
// ---------------------------------------------------------------------------

function createPunctuationHarness() {
  return createAppHarness({
    storage: installMemoryStorage(),
    subjectExposureGates: { [SUBJECT_EXPOSURE_GATES.punctuation]: true },
  });
}

function openMapScene(harness) {
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.dispatch('punctuation-open-map');
}

function applyMapFilters(harness, { statusFilter, monsterFilter }) {
  // `statusFilter: 'all'` / `monsterFilter: 'all'` are the default values
  // seeded by `punctuation-open-map`; dispatching the filter action is
  // still safe (it writes the default back) so the loop can stay
  // uniform. This mirrors production where a learner can click "All"
  // explicitly after narrowing.
  harness.dispatch('punctuation-map-status-filter', { value: statusFilter });
  harness.dispatch('punctuation-map-monster-filter', { value: monsterFilter });
}

function findForbiddenHits(html) {
  const hits = [];
  for (const key of FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS) {
    if (html.includes(key)) {
      hits.push(key);
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Map scene sweep — 6 status × 5 monster = 30 render states.
// ---------------------------------------------------------------------------

test('U7: Map scene SSR is clean across 30 status × monster filter combinations', () => {
  // Dimensionality lock — if a future unit stretches either filter list,
  // this constant-check forces a deliberate update to the sweep and its
  // expected combination count in the PR body.
  assert.equal(PUNCTUATION_MAP_STATUS_FILTER_IDS.length, 6, 'status filter list must stay at 6 entries');
  assert.equal(PUNCTUATION_MAP_MONSTER_FILTER_IDS.length, 5, 'monster filter list must stay at 5 entries');

  const combinations = [];
  for (const statusFilter of PUNCTUATION_MAP_STATUS_FILTER_IDS) {
    for (const monsterFilter of PUNCTUATION_MAP_MONSTER_FILTER_IDS) {
      combinations.push({ statusFilter, monsterFilter });
    }
  }
  assert.equal(combinations.length, 30, 'sweep must cover exactly 30 filter combinations');

  for (const combo of combinations) {
    const harness = createPunctuationHarness();
    openMapScene(harness);
    applyMapFilters(harness, combo);
    const html = harness.render();

    const hits = findForbiddenHits(html);
    assert.deepEqual(
      hits,
      [],
      `Map scene leaked forbidden read-model keys at ${combo.statusFilter}/${combo.monsterFilter}: ${hits.join(', ')}`,
    );
  }
});

// ---------------------------------------------------------------------------
// Skill Detail modal sweep — 14 skills × 2 tabs = 28 render states.
// ---------------------------------------------------------------------------

test('U7: Skill Detail modal SSR is clean across 14 skills × 2 tabs (28 combinations)', () => {
  // Dimensionality lock — a future unit adding a 15th published skill must
  // either join the sweep by extending `PUNCTUATION_CLIENT_SKILLS` (and this
  // assertion surfaces the need) or revise the plan. Either way, the sweep
  // is the first thing to update.
  assert.equal(PUNCTUATION_CLIENT_SKILLS.length, 14, 'published skill list must stay at 14 entries');

  const combinations = [];
  for (const skill of PUNCTUATION_CLIENT_SKILLS) {
    for (const detailTab of ['learn', 'practise']) {
      combinations.push({ skillId: skill.id, detailTab });
    }
  }
  assert.equal(combinations.length, 28, 'sweep must cover exactly 28 skill × tab combinations');

  for (const combo of combinations) {
    const harness = createPunctuationHarness();
    openMapScene(harness);
    harness.dispatch('punctuation-skill-detail-open', {
      skillId: combo.skillId,
      tab: combo.detailTab,
    });
    const html = harness.render();

    const hits = findForbiddenHits(html);
    assert.deepEqual(
      hits,
      [],
      `Modal leaked forbidden read-model keys at skill=${combo.skillId} tab=${combo.detailTab}: ${hits.join(', ')}`,
    );
  }
});

// ---------------------------------------------------------------------------
// Phase 2 redaction contract unchanged — the universal forbidden key list
// shape hasn't widened nor narrowed. Pairs with the characterisation-only
// claim in the PR body: U7 does not weaken Phase 2 redaction.
// ---------------------------------------------------------------------------

test('U7: FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS is unchanged at 12 entries (Phase 2 contract)', () => {
  // Phase 2 U2 shipped the 12-entry list. U7 is characterisation-only —
  // we confirm alignment rather than extend the list. A future unit that
  // introduces a new Worker projection must extend
  // `tests/helpers/forbidden-keys.mjs` first (the single source of truth)
  // and this assertion forces that discipline.
  assert.equal(FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS.length, 12);
  assert.equal(Object.isFrozen(FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS), true);
});
