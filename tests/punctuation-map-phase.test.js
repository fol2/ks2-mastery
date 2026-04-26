// Phase 3 U5 — Punctuation Map phase + module action handlers.
//
// Service-contract + module-layer assertions for U5. The scene-render side
// lives in `tests/react-punctuation-scene.test.js`; this file is pure-
// function / pure-reducer territory:
//   - `PUNCTUATION_PHASES` extension lock
//   - `normalisePunctuationMapUi` default / fallback behaviour
//   - Module handlers for open / close / filters + skill-detail state
//     (U5 deviation: modal state handlers land here so U6 is JSX-only)
//
// No SSR. No React. Tests use the app harness so state mutations thread
// through the real dispatch pipeline, matching production behaviour.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PUNCTUATION_PHASES,
  normalisePunctuationMapUi,
} from '../src/subjects/punctuation/service-contract.js';
import {
  PUNCTUATION_MAP_MONSTER_FILTER_IDS,
  PUNCTUATION_MAP_STATUS_FILTER_IDS,
} from '../src/subjects/punctuation/components/punctuation-view-model.js';
import { createAppHarness } from './helpers/app-harness.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import { SUBJECT_EXPOSURE_GATES } from '../src/platform/core/subject-availability.js';

function createHarness() {
  return createAppHarness({
    storage: installMemoryStorage(),
    subjectExposureGates: { [SUBJECT_EXPOSURE_GATES.punctuation]: true },
  });
}

function punctuationState(harness) {
  return harness.store.getState().subjectUi.punctuation || {};
}

// ---------------------------------------------------------------------------
// PUNCTUATION_PHASES — `'map'` added, frozen at 7 entries (R17).
// ---------------------------------------------------------------------------

test('U5: PUNCTUATION_PHASES includes `map`', () => {
  assert.equal(PUNCTUATION_PHASES.includes('map'), true);
});

test('U5: PUNCTUATION_PHASES frozen list is exactly the 7 expected phases', () => {
  // Order-insensitive check: the phase strings themselves are the contract,
  // not their position. Length check pins the list so a future unit cannot
  // silently stretch the enum.
  const expected = new Set([
    'setup',
    'active-item',
    'feedback',
    'summary',
    'unavailable',
    'error',
    'map',
  ]);
  assert.equal(PUNCTUATION_PHASES.length, 7);
  for (const phase of PUNCTUATION_PHASES) {
    assert.equal(expected.has(phase), true, `unexpected phase ${phase}`);
  }
  assert.equal(Object.isFrozen(PUNCTUATION_PHASES), true);
});

// ---------------------------------------------------------------------------
// normalisePunctuationMapUi — defaults + fallback behaviour.
// ---------------------------------------------------------------------------

test('U5 normalisePunctuationMapUi: undefined returns full default shape', () => {
  const ui = normalisePunctuationMapUi(undefined);
  assert.deepEqual(ui, {
    statusFilter: 'all',
    monsterFilter: 'all',
    detailOpenSkillId: null,
    detailTab: 'learn',
  });
});

test('U5 normalisePunctuationMapUi: null returns full default shape', () => {
  assert.deepEqual(
    normalisePunctuationMapUi(null),
    { statusFilter: 'all', monsterFilter: 'all', detailOpenSkillId: null, detailTab: 'learn' },
  );
});

test('U5 normalisePunctuationMapUi: valid values pass through unchanged', () => {
  const ui = normalisePunctuationMapUi({
    statusFilter: 'weak',
    monsterFilter: 'pealark',
    detailOpenSkillId: 'speech',
    detailTab: 'practise',
  });
  assert.deepEqual(ui, {
    statusFilter: 'weak',
    monsterFilter: 'pealark',
    detailOpenSkillId: 'speech',
    detailTab: 'practise',
  });
});

test('U5 normalisePunctuationMapUi: invalid statusFilter falls back to `all`', () => {
  const ui = normalisePunctuationMapUi({ statusFilter: 'garbage' });
  assert.equal(ui.statusFilter, 'all');
});

test('U5 normalisePunctuationMapUi: reserved monster id rejects back to `all`', () => {
  // A rogue payload trying to surface a retired monster id via the Map
  // filter must fall back to `all` rather than pressing the reserved chip.
  for (const reserved of ['colisk', 'hyphang', 'carillon']) {
    const ui = normalisePunctuationMapUi({ monsterFilter: reserved });
    assert.equal(ui.monsterFilter, 'all', `${reserved} leaked into monsterFilter`);
  }
});

test('U5 normalisePunctuationMapUi: invalid detailTab falls back to `learn`', () => {
  const ui = normalisePunctuationMapUi({ detailTab: 'garbage' });
  assert.equal(ui.detailTab, 'learn');
});

test('U5 normalisePunctuationMapUi: empty-string detailOpenSkillId falls back to null', () => {
  const ui = normalisePunctuationMapUi({ detailOpenSkillId: '' });
  assert.equal(ui.detailOpenSkillId, null);
});

test('U5 normalisePunctuationMapUi: non-string detailOpenSkillId falls back to null', () => {
  assert.equal(normalisePunctuationMapUi({ detailOpenSkillId: 123 }).detailOpenSkillId, null);
  assert.equal(normalisePunctuationMapUi({ detailOpenSkillId: {} }).detailOpenSkillId, null);
  assert.equal(normalisePunctuationMapUi({ detailOpenSkillId: [] }).detailOpenSkillId, null);
});

test('U5 normalisePunctuationMapUi: array input coerces to defaults', () => {
  // Arrays are typeof object in JS; the normaliser must guard against them
  // so a [key, value] pair can't accidentally set any field.
  assert.deepEqual(
    normalisePunctuationMapUi(['foo', 'bar']),
    { statusFilter: 'all', monsterFilter: 'all', detailOpenSkillId: null, detailTab: 'learn' },
  );
});

test('U5 normalisePunctuationMapUi: accepts every valid status filter id', () => {
  for (const id of PUNCTUATION_MAP_STATUS_FILTER_IDS) {
    assert.equal(normalisePunctuationMapUi({ statusFilter: id }).statusFilter, id);
  }
});

test('U5 normalisePunctuationMapUi: accepts every valid monster filter id', () => {
  for (const id of PUNCTUATION_MAP_MONSTER_FILTER_IDS) {
    assert.equal(normalisePunctuationMapUi({ monsterFilter: id }).monsterFilter, id);
  }
});

// ---------------------------------------------------------------------------
// Module: `punctuation-open-map` / `punctuation-close-map`
// ---------------------------------------------------------------------------

test('U5 module: punctuation-open-map transitions setup → map with default mapUi', () => {
  const harness = createHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  // Pre-condition: Setup phase.
  assert.equal(punctuationState(harness).phase, 'setup');

  harness.dispatch('punctuation-open-map');

  const next = punctuationState(harness);
  assert.equal(next.phase, 'map');
  assert.deepEqual(next.mapUi, {
    statusFilter: 'all',
    monsterFilter: 'all',
    detailOpenSkillId: null,
    detailTab: 'learn',
  });
});

test('U5 module: punctuation-close-map transitions map → setup and clears detailOpenSkillId', () => {
  const harness = createHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.dispatch('punctuation-open-map');
  harness.dispatch('punctuation-skill-detail-open', { skillId: 'speech' });
  assert.equal(punctuationState(harness).mapUi.detailOpenSkillId, 'speech');

  harness.dispatch('punctuation-close-map');

  const next = punctuationState(harness);
  assert.equal(next.phase, 'setup');
  assert.equal(next.mapUi.detailOpenSkillId, null);
});

test('U5 module: punctuation-back from map phase resets phase to setup and clears detailOpenSkillId', () => {
  const harness = createHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.dispatch('punctuation-open-map');
  harness.dispatch('punctuation-skill-detail-open', { skillId: 'list_commas' });

  harness.dispatch('punctuation-back');

  const next = punctuationState(harness);
  assert.equal(next.phase, 'setup');
  assert.equal(next.mapUi.detailOpenSkillId, null);
});

// ---------------------------------------------------------------------------
// Module: filter handlers — paired state-level assertions (learning #7).
// ---------------------------------------------------------------------------

test('U5 module: punctuation-map-status-filter accepts each valid value', () => {
  const harness = createHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.dispatch('punctuation-open-map');

  for (const id of PUNCTUATION_MAP_STATUS_FILTER_IDS) {
    harness.dispatch('punctuation-map-status-filter', { value: id });
    assert.equal(
      punctuationState(harness).mapUi.statusFilter,
      id,
      `statusFilter did not update to ${id}`,
    );
  }
});

test('U5 module: punctuation-map-status-filter rejects an invalid value (no state mutation)', () => {
  const harness = createHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.dispatch('punctuation-open-map');
  // Set a known value first so we can prove the invalid dispatch is a no-op.
  harness.dispatch('punctuation-map-status-filter', { value: 'weak' });
  assert.equal(punctuationState(harness).mapUi.statusFilter, 'weak');

  harness.dispatch('punctuation-map-status-filter', { value: 'garbage' });

  // Invalid value: state is unchanged — the handler returned `false` and no
  // `updateSubjectUi` mutation fired. The paired state-level assertion closes
  // the silent-no-op gap (learning #7): an HTML-absence check alone would
  // pass whether the handler genuinely refused the value or just happened
  // not to render the change.
  assert.equal(punctuationState(harness).mapUi.statusFilter, 'weak');
});

test('U5 module: punctuation-map-status-filter rejects missing value', () => {
  const harness = createHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.dispatch('punctuation-open-map');
  harness.dispatch('punctuation-map-status-filter', { value: 'weak' });

  harness.dispatch('punctuation-map-status-filter', {});

  assert.equal(punctuationState(harness).mapUi.statusFilter, 'weak');
});

test('U5 module: punctuation-map-monster-filter accepts each valid active monster id', () => {
  const harness = createHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.dispatch('punctuation-open-map');

  for (const id of PUNCTUATION_MAP_MONSTER_FILTER_IDS) {
    harness.dispatch('punctuation-map-monster-filter', { value: id });
    assert.equal(
      punctuationState(harness).mapUi.monsterFilter,
      id,
      `monsterFilter did not update to ${id}`,
    );
  }
});

test('U5 module: punctuation-map-monster-filter rejects reserved monster ids (no state mutation)', () => {
  const harness = createHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.dispatch('punctuation-open-map');
  harness.dispatch('punctuation-map-monster-filter', { value: 'pealark' });
  assert.equal(punctuationState(harness).mapUi.monsterFilter, 'pealark');

  for (const reserved of ['colisk', 'hyphang', 'carillon']) {
    harness.dispatch('punctuation-map-monster-filter', { value: reserved });
    // Reserved ids never reach the filter list; state must retain the
    // previously-set `pealark` value.
    assert.equal(
      punctuationState(harness).mapUi.monsterFilter,
      'pealark',
      `reserved ${reserved} leaked past the validator`,
    );
  }
});

// ---------------------------------------------------------------------------
// Module: skill-detail state handlers (U5 deviation for U6 readiness).
// ---------------------------------------------------------------------------

test('U5 module: punctuation-skill-detail-open sets detailOpenSkillId and defaults detailTab to `learn`', () => {
  const harness = createHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.dispatch('punctuation-open-map');

  harness.dispatch('punctuation-skill-detail-open', { skillId: 'speech' });

  const state = punctuationState(harness);
  assert.equal(state.mapUi.detailOpenSkillId, 'speech');
  assert.equal(state.mapUi.detailTab, 'learn');
});

test('U5 module: punctuation-skill-detail-open honours explicit `practise` tab', () => {
  const harness = createHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.dispatch('punctuation-open-map');

  harness.dispatch('punctuation-skill-detail-open', { skillId: 'comma_clarity', tab: 'practise' });

  const state = punctuationState(harness);
  assert.equal(state.mapUi.detailOpenSkillId, 'comma_clarity');
  assert.equal(state.mapUi.detailTab, 'practise');
});

test('U5 module: punctuation-skill-detail-open falls back to `learn` on invalid tab', () => {
  const harness = createHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.dispatch('punctuation-open-map');

  harness.dispatch('punctuation-skill-detail-open', { skillId: 'speech', tab: 'garbage' });

  assert.equal(punctuationState(harness).mapUi.detailTab, 'learn');
});

test('U5 module: punctuation-skill-detail-open rejects empty / non-string skillId', () => {
  const harness = createHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.dispatch('punctuation-open-map');
  harness.dispatch('punctuation-skill-detail-open', { skillId: 'speech' });
  assert.equal(punctuationState(harness).mapUi.detailOpenSkillId, 'speech');

  harness.dispatch('punctuation-skill-detail-open', { skillId: '' });
  harness.dispatch('punctuation-skill-detail-open', { skillId: 123 });
  harness.dispatch('punctuation-skill-detail-open', {});

  // Invalid payloads return `false` — state retains the previous skillId.
  assert.equal(punctuationState(harness).mapUi.detailOpenSkillId, 'speech');
});

test('U5 module: punctuation-skill-detail-close resets detailOpenSkillId to null', () => {
  const harness = createHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.dispatch('punctuation-open-map');
  harness.dispatch('punctuation-skill-detail-open', { skillId: 'speech' });

  harness.dispatch('punctuation-skill-detail-close');

  assert.equal(punctuationState(harness).mapUi.detailOpenSkillId, null);
});

test('U5 module: punctuation-skill-detail-tab switches tabs within an open detail', () => {
  const harness = createHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.dispatch('punctuation-open-map');
  harness.dispatch('punctuation-skill-detail-open', { skillId: 'speech' });
  assert.equal(punctuationState(harness).mapUi.detailTab, 'learn');

  harness.dispatch('punctuation-skill-detail-tab', { value: 'practise' });

  assert.equal(punctuationState(harness).mapUi.detailTab, 'practise');
});

test('U5 module: punctuation-skill-detail-tab rejects invalid tab values', () => {
  const harness = createHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.dispatch('punctuation-open-map');
  harness.dispatch('punctuation-skill-detail-open', { skillId: 'speech', tab: 'practise' });
  assert.equal(punctuationState(harness).mapUi.detailTab, 'practise');

  harness.dispatch('punctuation-skill-detail-tab', { value: 'garbage' });

  // Invalid value: handler returns false, state is unchanged.
  assert.equal(punctuationState(harness).mapUi.detailTab, 'practise');
});

// ---------------------------------------------------------------------------
// Adversarial reviewer HIGH adv-219-001 — `mapUi` + `phase: 'map'` must NOT
// survive a page reload. The plan (line 565, 583) pins the Map phase and its
// filter state as session-ephemeral: there is no D1 persistence path and a
// fresh harness over the same localStorage must land on `phase: 'setup'` with
// mapUi defaulted (or absent). This test reproduces the reload by
// instantiating a second `createAppHarness` over the same `MemoryStorage`.
// ---------------------------------------------------------------------------

test('U5 persistence: phase=map and mapUi filter/detail state do not survive reload', () => {
  const storage = installMemoryStorage();

  const h1 = createAppHarness({
    storage,
    subjectExposureGates: { [SUBJECT_EXPOSURE_GATES.punctuation]: true },
  });
  h1.dispatch('open-subject', { subjectId: 'punctuation' });
  h1.dispatch('punctuation-open-map');
  h1.dispatch('punctuation-map-status-filter', { value: 'weak' });
  h1.dispatch('punctuation-map-monster-filter', { value: 'pealark' });
  h1.dispatch('punctuation-skill-detail-open', { skillId: 'speech' });

  // Pre-condition: live state reflects the Map-phase interactions.
  const pre = h1.store.getState().subjectUi.punctuation;
  assert.equal(pre.phase, 'map');
  assert.equal(pre.mapUi.statusFilter, 'weak');
  assert.equal(pre.mapUi.monsterFilter, 'pealark');
  assert.equal(pre.mapUi.detailOpenSkillId, 'speech');

  // Simulate reload by constructing a second harness over the same storage.
  // `createAppHarness` re-hydrates from the repositories, which in turn read
  // from `localStorage` (the MemoryStorage we installed above).
  const h2 = createAppHarness({
    storage,
    subjectExposureGates: { [SUBJECT_EXPOSURE_GATES.punctuation]: true },
  });
  const post = h2.store.getState().subjectUi.punctuation;

  // Phase must NOT survive: learner returns to Setup after a reload. This
  // guards the plan's "mapUi is session-ephemeral" invariant (line 565, 583)
  // against the current shallow-merge `buildSubjectUiState` path which would
  // otherwise echo `phase: 'map'` straight back from `localStorage`.
  assert.notEqual(post.phase, 'map', 'phase "map" must NOT survive a reload');
  assert.equal(post.phase, 'setup', 'phase must coerce to "setup" on rehydrate');

  // mapUi must NOT carry persisted filter / detail state. Either the field is
  // stripped entirely or it matches the default shape.
  const mapUi = post.mapUi;
  const isStrippedOrDefault = mapUi === undefined
    || (
      mapUi.statusFilter === 'all'
      && mapUi.monsterFilter === 'all'
      && mapUi.detailOpenSkillId === null
    );
  assert.ok(
    isStrippedOrDefault,
    `mapUi must NOT carry persisted filter / detail state, got ${JSON.stringify(mapUi)}`,
  );
});

// ---------------------------------------------------------------------------
// Adversarial reviewer HIGH adv-219-002 — `punctuation-open-map` must guard
// against orphan-session creation. The shallow-merge path preserves `session`
// / `feedback` / `summary` when called mid-session, which leaves a zombie
// session pinned under `phase: 'map'`. The guard restricts open-map to the
// phases where Map is a legitimate affordance: `'setup'` and `'summary'`.
// ---------------------------------------------------------------------------

test('U5 open-map guard: refuses to dispatch from active-item phase', () => {
  // State-level assertion only: `harness.dispatch` always returns `true` at
  // the app-controller layer (it wraps handle-subject-action inside a
  // try/finally and returns `true` unconditionally). The guard's failure
  // mode surfaces as a no-op on `state.phase` / `state.session` — paired
  // state-level checks close the silent-no-op gap (learning #7).
  const harness = createHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  // Put the subject into `active-item` with a live session. A plain
  // updateSubjectUi write is enough — the guard is phase-level and does not
  // care how the session was seeded.
  harness.store.updateSubjectUi('punctuation', {
    phase: 'active-item',
    session: { id: 'zombie-session', currentItem: { id: 'item-1' } },
  });
  assert.equal(punctuationState(harness).phase, 'active-item');

  harness.dispatch('punctuation-open-map');

  assert.equal(
    punctuationState(harness).phase,
    'active-item',
    'phase must remain active-item (guard refused the transition)',
  );
  assert.ok(
    punctuationState(harness).session,
    'session must NOT be orphaned into phase=map',
  );
  assert.equal(
    punctuationState(harness).mapUi,
    undefined,
    'mapUi must NOT be seeded from a refused open-map dispatch',
  );
});

test('U5 open-map guard: refuses to dispatch from feedback phase', () => {
  const harness = createHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'feedback',
    feedback: { kind: 'success', headline: 'Great!', body: '' },
  });

  harness.dispatch('punctuation-open-map');

  assert.equal(
    punctuationState(harness).phase,
    'feedback',
    'phase must remain feedback (guard refused the transition)',
  );
  assert.ok(
    punctuationState(harness).feedback,
    'feedback payload must NOT be wiped by a refused open-map dispatch',
  );
});

test('U5 open-map guard: allowed from setup phase', () => {
  const harness = createHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  assert.equal(punctuationState(harness).phase, 'setup');

  harness.dispatch('punctuation-open-map');

  assert.equal(punctuationState(harness).phase, 'map');
  assert.ok(punctuationState(harness).mapUi, 'mapUi must seed on successful open-map');
});

test('U5 open-map guard: allowed from summary phase', () => {
  // Per plan line 519 — the Summary scene offers an "Open Punctuation Map"
  // next-action button. Guard must permit the transition out of summary.
  const harness = createHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.store.updateSubjectUi('punctuation', {
    phase: 'summary',
    summary: { label: 'Punctuation session summary', total: 0, correct: 0 },
    session: null,
    feedback: null,
  });

  harness.dispatch('punctuation-open-map');

  assert.equal(punctuationState(harness).phase, 'map');
});

// ---------------------------------------------------------------------------
// Adversarial reviewer MEDIUM adv-219-004 — `punctuation-skill-detail-open`
// must validate skillId against the published PUNCTUATION_CLIENT_SKILLS list.
// An arbitrary string lands a rogue detailOpenSkillId in state and, in U6,
// would render an empty / malformed modal.
// ---------------------------------------------------------------------------

test('U5 skill-detail-open: rejects skillId not in PUNCTUATION_CLIENT_SKILLS', () => {
  // State-level assertion only — see comment on the open-map guard tests
  // above (harness.dispatch returns true unconditionally at the controller
  // layer). The handler's refusal surfaces as state retaining the prior
  // value; learning #7's silent-no-op gap is closed by the paired check.
  const harness = createHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.dispatch('punctuation-open-map');
  // Seed a known-good value so we can prove the invalid dispatch is a no-op.
  harness.dispatch('punctuation-skill-detail-open', { skillId: 'speech' });
  assert.equal(punctuationState(harness).mapUi.detailOpenSkillId, 'speech');

  harness.dispatch('punctuation-skill-detail-open', {
    skillId: 'nonexistent_xyz',
  });

  assert.equal(
    punctuationState(harness).mapUi.detailOpenSkillId,
    'speech',
    'state must retain prior skillId when an unknown id is dispatched',
  );
});

test('U5 skill-detail-open: accepts every published PUNCTUATION_CLIENT_SKILLS id', async () => {
  const { PUNCTUATION_CLIENT_SKILLS } = await import('../src/subjects/punctuation/read-model.js');
  const harness = createHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.dispatch('punctuation-open-map');

  for (const skill of PUNCTUATION_CLIENT_SKILLS) {
    harness.dispatch('punctuation-skill-detail-open', { skillId: skill.id });
    assert.equal(
      punctuationState(harness).mapUi.detailOpenSkillId,
      skill.id,
      `published id ${skill.id} must be accepted`,
    );
  }
});

test('U5 normalisePunctuationMapUi: rejects detailOpenSkillId not in PUNCTUATION_CLIENT_SKILLS', async () => {
  // Second-line defence: even if a rogue payload reaches the normaliser
  // directly (e.g. via a raw service-contract call), detailOpenSkillId must
  // reset to null for unknown ids.
  const ui = normalisePunctuationMapUi({ detailOpenSkillId: 'nonexistent_xyz' });
  assert.equal(ui.detailOpenSkillId, null);
});
