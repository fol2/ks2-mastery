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
// - Split match discipline mirrors the sibling Modal test in
//   `tests/react-punctuation-scene.test.js:1022` (word-boundary regex) but
//   fanned out across both key families:
//     * CAMELCASE_KEYS — `correctIndex` / `hiddenQueue` / `rawGenerator` /
//       `queueItemIds` / `unpublished`. JS `\b` treats the internal
//       case-boundary oddly, so substring match is the correct probe — a
//       camelCase identifier has no legitimate child-copy analogue.
//     * WORDBOUNDARY_KEYS — `accepted` / `answers` / `generator` / `responses`
//       / `rubric` / `seed` / `validator`. These are English words that
//       appear legitimately in unrelated copy (e.g. "seed" inside "seeded",
//       "answers" as a child-facing label on the GPS chip row) so a naive
//       substring probe false-positives. Word-boundary regex lets legitimate
//       copy through while still catching a bare-identifier leak.
// - Child-facing copy sanity: "accepted" / "answers" strings are Session-
//   scene-only (GPS chip row) and never land on Map / Modal renders. The
//   scan runs on Map + Modal HTML in isolation so a Session-scene copy
//   string cannot taint the assertion.
// - Map-sweep enrichment: the vanilla sweep seeds no analytics, which means
//   `assembleSkillRows` tags every skill `status: 'new'`. The four non-'new'
//   status filters (`learning` / `due` / `weak` / `secure`) then render an
//   empty SkillCard grid — 20 of 30 combinations contribute zero SkillCard
//   HTML to the redaction probe. We seed a synthetic `analytics.skillRows`
//   payload so each non-'new' status gets at least one skill per monster,
//   and the sweep exercises actual SkillCard rendering under every status.

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

// Synthetic analytics snapshot — one skill per non-'new' status, covering
// the four monsters touched by the fixture clusters (`speech`,
// `apostrophe`, `comma_flow`). `deriveStatusForSkill` in the view-model
// collapses any row with `attempts === 0` to `'new'`, so every synthetic
// row carries `attempts > 0` to let the status flow through.
//
// `assembleSkillRows` maps this against `PUNCTUATION_CLIENT_SKILLS` by
// `skillId`, so the `clusterId` here is informational only (the scene's
// canonical mapping wins). Kept consistent with `PUNCTUATION_CLIENT_SKILLS`
// nonetheless so a future normaliser that surfaces mismatches catches drift.
const SYNTHETIC_SKILL_ROWS = Object.freeze([
  { skillId: 'speech', clusterId: 'speech', status: 'secure', attempts: 5, accuracy: 100, mastery: 3, dueAt: 0 },
  { skillId: 'apostrophe_contractions', clusterId: 'apostrophe', status: 'weak', attempts: 3, accuracy: 40, mastery: 0, dueAt: 1 },
  { skillId: 'comma_clarity', clusterId: 'comma_flow', status: 'due', attempts: 2, accuracy: 60, mastery: 1, dueAt: 1 },
  { skillId: 'list_commas', clusterId: 'comma_flow', status: 'learning', attempts: 1, accuracy: 50, mastery: 0, dueAt: 0 },
]);

function seedSyntheticAnalytics(harness) {
  harness.store.updateSubjectUi('punctuation', {
    analytics: { skillRows: SYNTHETIC_SKILL_ROWS },
  });
}

function applyMapFilters(harness, { statusFilter, monsterFilter }) {
  // `statusFilter: 'all'` / `monsterFilter: 'all'` are the default values
  // seeded by `punctuation-open-map`; dispatching the filter action is
  // still safe (it writes the default back) so the loop can stay
  // uniform. This mirrors production where a learner can click "All"
  // explicitly after narrowing.
  //
  // Paired state-level assertion (learning #7 — silent-no-op guard): we
  // verify the dispatch actually landed in `mapUi` before handing HTML to
  // the redaction probe. A regression that turns a filter handler into a
  // no-op would otherwise pass the sweep silently (the empty-state HTML
  // stays clean of forbidden keys regardless).
  harness.dispatch('punctuation-map-status-filter', { value: statusFilter });
  harness.dispatch('punctuation-map-monster-filter', { value: monsterFilter });
  const mapUi = harness.store.getState().subjectUi.punctuation.mapUi;
  assert.strictEqual(
    mapUi.statusFilter,
    statusFilter,
    `status-filter dispatch must land statusFilter=${statusFilter} in mapUi`,
  );
  assert.strictEqual(
    mapUi.monsterFilter,
    monsterFilter,
    `monster-filter dispatch must land monsterFilter=${monsterFilter} in mapUi`,
  );
}

// Camel-case / internal-identifier keys: `\b` treats the internal
// case-boundary oddly (e.g. `\bhiddenQueue\b` matches inside `hiddenQueueOn`
// in ways that surprise). These identifiers have no legitimate child-copy
// analogue, so a plain substring probe is both correct and strictest.
const CAMELCASE_KEYS = Object.freeze([
  'correctIndex',
  'hiddenQueue',
  'rawGenerator',
  'queueItemIds',
  'unpublished',
]);

// English-word keys: word-boundary regex so legitimate copy like "seeded"
// or a child-facing "answers" chip label cannot false-positive. Mirrors
// the pattern used by `tests/react-punctuation-scene.test.js:1022` on the
// Modal scan.
const WORDBOUNDARY_KEYS = Object.freeze([
  'accepted',
  'answers',
  'generator',
  'responses',
  'rubric',
  'seed',
  'validator',
]);

function findForbiddenHits(html) {
  const hits = [];
  for (const key of CAMELCASE_KEYS) {
    if (html.includes(key)) hits.push(key);
  }
  for (const key of WORDBOUNDARY_KEYS) {
    const pattern = new RegExp(`\\b${key}\\b`);
    if (pattern.test(html)) hits.push(key);
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
    // Seed synthetic analytics so non-'new' status filters actually render
    // SkillCard HTML (one synthetic row per non-'new' status). Without this
    // seeding, 20 of 30 combinations render empty cards + empty-message only
    // and contribute nothing to the redaction probe.
    seedSyntheticAnalytics(harness);
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

// Coverage-claim check — paired with the synthetic analytics seeding above.
// At least one of the non-'new' status filters (`learning` / `due` / `weak`
// / `secure`) must actually render a SkillCard once the synthetic rows are
// in place. Without this guard, a future refactor that silently drops the
// analytics path would return us to the original 20-of-30-empty shape
// without the sweep failing.
test('U7: Map sweep enrichment actually renders SkillCard HTML under non-\'new\' filters', () => {
  const nonNewStatuses = ['learning', 'due', 'weak', 'secure'];
  for (const statusFilter of nonNewStatuses) {
    const harness = createPunctuationHarness();
    openMapScene(harness);
    seedSyntheticAnalytics(harness);
    harness.dispatch('punctuation-map-status-filter', { value: statusFilter });
    const html = harness.render();
    assert.ok(
      html.includes('punctuation-map-skill-card'),
      `status='${statusFilter}' must render at least one SkillCard (synthetic analytics row)`,
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

  // Content-lock — a rename like `rubric` → `rubricSpec` keeps the length
  // at 12 but silently narrows the sweep's coverage (the renamed key is no
  // longer probed). Pinning the sorted contents forces any rename to land
  // here as a paired update, keeping the oracle and the probe aligned.
  assert.deepEqual(
    [...FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS].sort(),
    [
      'accepted',
      'answers',
      'correctIndex',
      'generator',
      'hiddenQueue',
      'queueItemIds',
      'rawGenerator',
      'responses',
      'rubric',
      'seed',
      'unpublished',
      'validator',
    ],
    'FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS sorted contents must not drift silently',
  );

  // Discipline check: the sum of `CAMELCASE_KEYS` + `WORDBOUNDARY_KEYS`
  // must equal the full forbidden set. A new key landing in the oracle
  // without a matching entry in one of the two probe lists would otherwise
  // be silently skipped by `findForbiddenHits`.
  const probedKeys = [...CAMELCASE_KEYS, ...WORDBOUNDARY_KEYS].sort();
  assert.deepEqual(
    probedKeys,
    [...FORBIDDEN_PUNCTUATION_READ_MODEL_KEYS].sort(),
    'every forbidden key must be probed by exactly one of CAMELCASE_KEYS / WORDBOUNDARY_KEYS',
  );
});
