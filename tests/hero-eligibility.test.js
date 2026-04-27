import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveEligibility } from '../shared/hero/eligibility.js';
import {
  HERO_SUBJECT_IDS,
  HERO_READY_SUBJECT_IDS,
  HERO_LOCKED_SUBJECT_IDS,
} from '../shared/hero/constants.js';

// ── Helpers ───────────────────────────────────────────────────────────

function makeSnapshot(overrides = {}) {
  return {
    available: true,
    unavailableReason: null,
    signals: {},
    envelopes: [{ intent: 'due-review', launcher: 'smart-practice', effortTarget: 4 }],
    ...overrides,
  };
}

// ── 1. Ready subjects with available providers resolve as eligible ─────

test('Spelling/Grammar/Punctuation with available providers resolve as eligible', () => {
  const snapshots = {
    spelling: makeSnapshot({ envelopes: [{ intent: 'due-review' }] }),
    grammar: makeSnapshot({ envelopes: [{ intent: 'weak-repair' }] }),
    punctuation: makeSnapshot({ envelopes: [{ intent: 'breadth-maintenance' }] }),
  };
  const result = resolveEligibility(snapshots);

  assert.equal(result.eligible.length, 3);
  const eligibleIds = result.eligible.map((e) => e.subjectId);
  assert.ok(eligibleIds.includes('spelling'));
  assert.ok(eligibleIds.includes('grammar'));
  assert.ok(eligibleIds.includes('punctuation'));

  // Reasons should come from the first envelope's intent.
  const spellingEntry = result.eligible.find((e) => e.subjectId === 'spelling');
  assert.equal(spellingEntry.reason, 'due-review');
  const grammarEntry = result.eligible.find((e) => e.subjectId === 'grammar');
  assert.equal(grammarEntry.reason, 'weak-repair');
});

// ── 2. Placeholder subjects resolve as locked ─────────────────────────

test('Arithmetic/Reasoning/Reading resolve as locked with placeholder-engine-not-ready', () => {
  // No snapshots provided at all — placeholders lock with specific reason.
  const result = resolveEligibility({});

  for (const subjectId of HERO_LOCKED_SUBJECT_IDS) {
    const entry = result.locked.find((l) => l.subjectId === subjectId);
    assert.ok(entry, `${subjectId} must appear in locked list`);
    assert.equal(entry.reason, 'placeholder-engine-not-ready');
  }
});

test('Placeholder subjects with an explicit available provider become eligible', () => {
  // If a future engine is wired up, the placeholder lock lifts.
  const snapshots = {
    arithmetic: makeSnapshot({ envelopes: [{ intent: 'starter-growth' }] }),
  };
  const result = resolveEligibility(snapshots);

  const arithmeticEligible = result.eligible.find((e) => e.subjectId === 'arithmetic');
  assert.ok(arithmeticEligible, 'arithmetic should be eligible when provider is available');
  assert.equal(arithmeticEligible.reason, 'starter-growth');
});

// ── 3. Provider returns available:false → locked ──────────────────────

test('Punctuation provider returns available:false → locked list', () => {
  const snapshots = {
    spelling: makeSnapshot(),
    grammar: makeSnapshot(),
    punctuation: makeSnapshot({ available: false, unavailableReason: 'circuit-breaker-open' }),
  };
  const result = resolveEligibility(snapshots);

  const punctEntry = result.locked.find((l) => l.subjectId === 'punctuation');
  assert.ok(punctEntry, 'punctuation must appear in locked list');
  assert.equal(punctEntry.reason, 'circuit-breaker-open');

  const punctEligible = result.eligible.find((e) => e.subjectId === 'punctuation');
  assert.equal(punctEligible, undefined, 'punctuation must not appear in eligible list');
});

test('Provider available:false with no unavailableReason uses fallback', () => {
  const snapshots = {
    spelling: makeSnapshot({ available: false }),
  };
  const result = resolveEligibility(snapshots);
  const entry = result.locked.find((l) => l.subjectId === 'spelling');
  assert.ok(entry);
  assert.equal(entry.reason, 'provider-unavailable');
});

// ── 4. Zero eligible subjects → no throw ──────────────────────────────

test('Zero eligible subjects returns { eligible: [], locked: [...] } without throwing', () => {
  // All providers unavailable or missing.
  const result = resolveEligibility({});

  assert.equal(result.eligible.length, 0);
  assert.equal(result.locked.length, HERO_SUBJECT_IDS.length);
  // No throw — we get here cleanly.
});

test('All six subjects explicitly unavailable produces zero eligible', () => {
  const snapshots = Object.fromEntries(
    HERO_SUBJECT_IDS.map((id) => [id, makeSnapshot({ available: false, unavailableReason: 'maintenance' })]),
  );
  const result = resolveEligibility(snapshots);

  assert.equal(result.eligible.length, 0);
  assert.equal(result.locked.length, 6);
  for (const entry of result.locked) {
    assert.equal(entry.reason, 'maintenance');
  }
});

// ── 5. Provider snapshot is null/undefined → locked ───────────────────

test('Provider snapshot is null → locked with no-provider-registered', () => {
  const snapshots = {
    spelling: null,
    grammar: makeSnapshot(),
  };
  const result = resolveEligibility(snapshots);

  const spellingLocked = result.locked.find((l) => l.subjectId === 'spelling');
  assert.ok(spellingLocked);
  assert.equal(spellingLocked.reason, 'no-provider-registered');
});

test('Provider snapshot is undefined → locked with no-provider-registered', () => {
  const snapshots = {
    spelling: undefined,
    grammar: makeSnapshot(),
  };
  const result = resolveEligibility(snapshots);

  const spellingLocked = result.locked.find((l) => l.subjectId === 'spelling');
  assert.ok(spellingLocked);
  assert.equal(spellingLocked.reason, 'no-provider-registered');
});

test('Missing key entirely → locked with no-provider-registered for ready subjects', () => {
  // Only grammar provided; spelling and punctuation are missing.
  const snapshots = {
    grammar: makeSnapshot(),
  };
  const result = resolveEligibility(snapshots);

  const spellingLocked = result.locked.find((l) => l.subjectId === 'spelling');
  assert.ok(spellingLocked);
  assert.equal(spellingLocked.reason, 'no-provider-registered');

  const punctLocked = result.locked.find((l) => l.subjectId === 'punctuation');
  assert.ok(punctLocked);
  assert.equal(punctLocked.reason, 'no-provider-registered');
});

// ── 6. Future subject addition requires provider snapshot ─────────────

test('Future subject addition requires provider snapshot, not eligibility code change', () => {
  // Verify that the resolver iterates HERO_SUBJECT_IDS from constants.
  // If constants grows from 6 → 7, the resolver still covers every ID.
  const result = resolveEligibility({});
  const lockedIds = result.locked.map((l) => l.subjectId);
  const allIds = [...HERO_SUBJECT_IDS];

  // Every subject ID from constants must appear somewhere in the output.
  for (const id of allIds) {
    const inEligible = result.eligible.some((e) => e.subjectId === id);
    const inLocked = lockedIds.includes(id);
    assert.ok(inEligible || inLocked, `${id} must appear in eligible or locked`);
  }

  // Total output count matches the constant list length.
  assert.equal(result.eligible.length + result.locked.length, HERO_SUBJECT_IDS.length);
});

// ── 7. available:true but zero envelopes → locked ─────────────────────

test('Provider returns available:true but zero envelopes → locked with no-envelopes-available', () => {
  const snapshots = {
    spelling: makeSnapshot({ envelopes: [] }),
  };
  const result = resolveEligibility(snapshots);

  const spellingLocked = result.locked.find((l) => l.subjectId === 'spelling');
  assert.ok(spellingLocked, 'spelling must appear in locked list');
  assert.equal(spellingLocked.reason, 'no-envelopes-available');

  const spellingEligible = result.eligible.find((e) => e.subjectId === 'spelling');
  assert.equal(spellingEligible, undefined, 'spelling must not appear in eligible list');
});

test('Provider returns available:true with non-array envelopes → locked', () => {
  const snapshots = {
    spelling: makeSnapshot({ envelopes: 'not-an-array' }),
  };
  const result = resolveEligibility(snapshots);

  const entry = result.locked.find((l) => l.subjectId === 'spelling');
  assert.ok(entry);
  assert.equal(entry.reason, 'no-envelopes-available');
});

// ── Edge cases ────────────────────────────────────────────────────────

test('resolveEligibility with null input does not throw', () => {
  const result = resolveEligibility(null);
  assert.equal(result.eligible.length, 0);
  assert.equal(result.locked.length, HERO_SUBJECT_IDS.length);
});

test('resolveEligibility with undefined input does not throw', () => {
  const result = resolveEligibility(undefined);
  assert.equal(result.eligible.length, 0);
  assert.equal(result.locked.length, HERO_SUBJECT_IDS.length);
});

test('Result objects are frozen', () => {
  const snapshots = { spelling: makeSnapshot() };
  const result = resolveEligibility(snapshots);

  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.eligible));
  assert.ok(Object.isFrozen(result.locked));
});

test('Eligible reason falls back to worker-command-ready when envelope has no intent', () => {
  const snapshots = {
    spelling: makeSnapshot({ envelopes: [{ launcher: 'smart-practice' }] }),
  };
  const result = resolveEligibility(snapshots);

  const entry = result.eligible.find((e) => e.subjectId === 'spelling');
  assert.ok(entry);
  assert.equal(entry.reason, 'worker-command-ready');
});

test('Output entries contain exactly subjectId and reason keys', () => {
  const snapshots = {
    spelling: makeSnapshot(),
    grammar: makeSnapshot({ available: false, unavailableReason: 'test' }),
  };
  const result = resolveEligibility(snapshots);

  for (const entry of result.eligible) {
    assert.deepEqual(Object.keys(entry).sort(), ['reason', 'subjectId']);
  }
  for (const entry of result.locked) {
    assert.deepEqual(Object.keys(entry).sort(), ['reason', 'subjectId']);
  }
});

test('Full snapshot with mix of eligible and locked subjects', () => {
  const snapshots = {
    spelling: makeSnapshot({ envelopes: [{ intent: 'due-review' }] }),
    grammar: makeSnapshot({ available: false, unavailableReason: 'circuit-breaker-open' }),
    punctuation: makeSnapshot({ envelopes: [{ intent: 'breadth-maintenance' }] }),
    arithmetic: null,
    reasoning: null,
    reading: null,
  };
  const result = resolveEligibility(snapshots);

  assert.equal(result.eligible.length, 2);
  assert.equal(result.locked.length, 4);
  assert.equal(result.eligible.length + result.locked.length, HERO_SUBJECT_IDS.length);

  const eligibleIds = result.eligible.map((e) => e.subjectId);
  assert.ok(eligibleIds.includes('spelling'));
  assert.ok(eligibleIds.includes('punctuation'));

  const lockedIds = result.locked.map((l) => l.subjectId);
  assert.ok(lockedIds.includes('grammar'));
  assert.ok(lockedIds.includes('arithmetic'));
  assert.ok(lockedIds.includes('reasoning'));
  assert.ok(lockedIds.includes('reading'));
});
