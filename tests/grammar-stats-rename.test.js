import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGrammarReadModel } from '../worker/src/subjects/grammar/read-models.js';
import { normaliseGrammarReadModel } from '../src/subjects/grammar/metadata.js';
import { assertNoForbiddenGrammarReadModelKeys } from '../scripts/grammar-production-smoke.mjs';

// Phase 4 U1 composition test. Neither the Worker-emit unit test nor the
// client-normaliser unit test in isolation catches the case where the Worker
// emits a clean read-model but the client normaliser's deep-merge re-introduces
// a forbidden key (or vice versa). This end-to-end test threads the Worker's
// actual `buildGrammarReadModel` output through the client's
// `normaliseGrammarReadModel` and asserts the round-trip is clean against the
// shared forbidden-key universal floor. It is the load-bearing guard for the
// two-layer rename.

test('U1: buildGrammarReadModel → normaliseGrammarReadModel round-trip exposes no forbidden keys', () => {
  const workerRm = buildGrammarReadModel({ learnerId: 'learner-a', state: {} });
  const clientRm = normaliseGrammarReadModel(workerRm, 'learner-a');

  assert.doesNotThrow(() => assertNoForbiddenGrammarReadModelKeys(clientRm, 'grammar.composition'));
});

test('U1: Worker-emitted stats uses contentStats, never templates', () => {
  const workerRm = buildGrammarReadModel({ learnerId: 'learner-a', state: {} });

  assert.ok(workerRm.stats, 'Worker read-model should expose a stats block.');
  assert.equal(workerRm.stats.templates, undefined, 'Worker stats must not expose the forbidden `templates` key.');
  assert.ok(workerRm.stats.contentStats, 'Worker stats should expose the renamed `contentStats` block.');
  assert.equal(typeof workerRm.stats.contentStats.total, 'number', '`contentStats.total` should be numeric.');
  assert.equal(typeof workerRm.stats.contentStats.selectedResponse, 'number', '`contentStats.selectedResponse` should be numeric.');
  assert.equal(typeof workerRm.stats.contentStats.constructedResponse, 'number', '`contentStats.constructedResponse` should be numeric.');
});

test('U1: normaliseGrammarReadModel drops a legacy `stats.templates` payload via allow-list picker', () => {
  // Legacy raw payload simulating a pre-P4 Worker emit that still carries
  // `stats.templates`. The allow-list picker must drop the forbidden key and
  // never let it leak into the client read-model.
  const legacyRaw = {
    stats: {
      concepts: { total: 18, new: 18, learning: 0, weak: 0, due: 0, secured: 0 },
      templates: { total: 51, selectedResponse: 31, constructedResponse: 20 },
    },
  };
  const clientRm = normaliseGrammarReadModel(legacyRaw, 'learner-a');

  assert.equal(clientRm.stats.templates, undefined, 'Legacy `templates` must be dropped by the picker.');
  assert.ok(clientRm.stats.contentStats, 'Picker must still expose `contentStats` (from the fallback).');
  assert.equal(clientRm.stats.concepts.total, 18, 'Picker must preserve `stats.concepts.total` from raw input.');

  assert.doesNotThrow(() => assertNoForbiddenGrammarReadModelKeys(clientRm, 'grammar.legacy'));
});

test('U1: normaliseGrammarReadModel passes through Worker `contentStats` unchanged', () => {
  const workerRm = buildGrammarReadModel({ learnerId: 'learner-a', state: {} });
  const clientRm = normaliseGrammarReadModel(workerRm, 'learner-a');

  assert.deepEqual(clientRm.stats.contentStats, workerRm.stats.contentStats, 'Client should mirror Worker `contentStats` verbatim.');
});
