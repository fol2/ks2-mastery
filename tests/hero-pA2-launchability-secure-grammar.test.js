/**
 * Hero Mode pA2 U3 — Grammar Launchability Parity.
 *
 * Proves that ALL Grammar learner states produce launchable envelopes
 * after the mini-test → satsset mapping was added.
 *
 * Covers: trouble-practice, smart-practice, mini-test, and unknown launchers.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { grammarProvider } from '../worker/src/hero/providers/grammar.js';
import { mapToSubjectPayload } from '../worker/src/hero/launch-adapters/grammar.js';

// ═══════════════════════════════════════════════════════════════════════
// A) Provider → Adapter integration: learner states
// ═══════════════════════════════════════════════════════════════════════

test('pA2 U3: Grammar learner with weak concepts → trouble-practice → launchable', () => {
  const readModel = {
    stats: { concepts: { total: 10, weak: 3, due: 0, secured: 2, learning: 5, new: 0 } },
    analytics: { concepts: [] },
  };
  const result = grammarProvider(readModel);
  assert.equal(result.available, true);

  const troubleEnv = result.envelopes.find(e => e.launcher === 'trouble-practice');
  assert.ok(troubleEnv, 'trouble-practice envelope emitted for weak concepts');

  const mapped = mapToSubjectPayload(troubleEnv);
  assert.equal(mapped.launchable, true);
  assert.equal(mapped.subjectId, 'grammar');
  assert.deepStrictEqual(mapped.payload, { mode: 'trouble' });
});

test('pA2 U3: Grammar learner with due concepts → smart-practice → launchable', () => {
  const readModel = {
    stats: { concepts: { total: 10, weak: 0, due: 4, secured: 2, learning: 4, new: 0 } },
    analytics: { concepts: [] },
  };
  const result = grammarProvider(readModel);
  assert.equal(result.available, true);

  const smartEnv = result.envelopes.find(e => e.launcher === 'smart-practice');
  assert.ok(smartEnv, 'smart-practice envelope emitted for due concepts');

  const mapped = mapToSubjectPayload(smartEnv);
  assert.equal(mapped.launchable, true);
  assert.equal(mapped.subjectId, 'grammar');
  assert.deepStrictEqual(mapped.payload, { mode: 'smart' });
});

test('pA2 U3: Grammar learner with retention-after-secure concepts → smart-practice → launchable', () => {
  const readModel = {
    stats: { concepts: { total: 10, weak: 0, due: 0, secured: 5, learning: 5, new: 0 } },
    analytics: {
      concepts: [
        { id: 'c1', status: 'secured', confidence: { label: 'consolidating' } },
        { id: 'c2', status: 'secured', confidence: { label: 'consolidating' } },
        { id: 'c3', status: 'secured', confidence: { label: 'secure' } },
      ],
    },
  };
  const result = grammarProvider(readModel);
  assert.equal(result.available, true);

  const retentionEnv = result.envelopes.find(e => e.intent === 'retention-after-secure');
  assert.ok(retentionEnv, 'retention-after-secure envelope emitted');
  assert.equal(retentionEnv.launcher, 'smart-practice');

  const mapped = mapToSubjectPayload(retentionEnv);
  assert.equal(mapped.launchable, true);
  assert.equal(mapped.subjectId, 'grammar');
  assert.deepStrictEqual(mapped.payload, { mode: 'smart' });
});

test('pA2 U3: Grammar learner with secureCount >= 3 only → mini-test → launchable with satsset', () => {
  const readModel = {
    stats: { concepts: { total: 10, weak: 0, due: 0, secured: 5, learning: 5, new: 0 } },
    analytics: { concepts: [] },
  };
  const result = grammarProvider(readModel);
  assert.equal(result.available, true);

  // Only mini-test emitted (no weak, due, or retention-due)
  assert.equal(result.envelopes.length, 1);
  assert.equal(result.envelopes[0].launcher, 'mini-test');
  assert.equal(result.envelopes[0].intent, 'breadth-maintenance');

  const mapped = mapToSubjectPayload(result.envelopes[0]);
  assert.equal(mapped.launchable, true);
  assert.equal(mapped.subjectId, 'grammar');
  assert.deepStrictEqual(mapped.payload, { mode: 'satsset' });
});

test('pA2 U3: Grammar learner where ALL envelopes produced are launchable (no fallback needed)', () => {
  // Learner with weak + due + secure >= 3 → multiple envelopes, all launchable
  const readModel = {
    stats: { concepts: { total: 15, weak: 2, due: 3, secured: 5, learning: 5, new: 0 } },
    analytics: { concepts: [] },
  };
  const result = grammarProvider(readModel);
  assert.equal(result.available, true);
  assert.ok(result.envelopes.length >= 3, 'at least trouble + smart + mini-test');

  const launchers = result.envelopes.map(e => e.launcher);
  assert.ok(launchers.includes('trouble-practice'), 'trouble-practice present');
  assert.ok(launchers.includes('smart-practice'), 'smart-practice present');
  assert.ok(launchers.includes('mini-test'), 'mini-test present');

  // ALL envelopes are launchable
  for (const env of result.envelopes) {
    const mapped = mapToSubjectPayload(env);
    assert.equal(mapped.launchable, true,
      `${env.launcher} (${env.intent}) must be launchable`);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// B) Direct adapter mapping tests
// ═══════════════════════════════════════════════════════════════════════

test('pA2 U3: mapToSubjectPayload mini-test → { launchable: true, subjectId: grammar, payload: { mode: satsset } }', () => {
  const result = mapToSubjectPayload({ launcher: 'mini-test' });
  assert.equal(result.launchable, true);
  assert.equal(result.subjectId, 'grammar');
  assert.deepStrictEqual(result.payload, { mode: 'satsset' });
});

test('pA2 U3: mapToSubjectPayload smart-practice → { launchable: true, payload: { mode: smart } }', () => {
  const result = mapToSubjectPayload({ launcher: 'smart-practice' });
  assert.equal(result.launchable, true);
  assert.equal(result.subjectId, 'grammar');
  assert.deepStrictEqual(result.payload, { mode: 'smart' });
});

test('pA2 U3: mapToSubjectPayload trouble-practice → { launchable: true, payload: { mode: trouble } }', () => {
  const result = mapToSubjectPayload({ launcher: 'trouble-practice' });
  assert.equal(result.launchable, true);
  assert.equal(result.subjectId, 'grammar');
  assert.deepStrictEqual(result.payload, { mode: 'trouble' });
});

test('pA2 U3: mapToSubjectPayload unknown launcher → { launchable: false, reason }', () => {
  const result = mapToSubjectPayload({ launcher: 'banana' });
  assert.equal(result.launchable, false);
  assert.equal(result.reason, 'launcher-not-supported-for-subject');
});
