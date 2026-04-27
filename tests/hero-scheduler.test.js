import test from 'node:test';
import assert from 'node:assert/strict';

import { scheduleShadowQuest } from '../shared/hero/scheduler.js';
import { buildTaskEnvelope } from '../shared/hero/task-envelope.js';
import { normaliseQuestShape } from '../shared/hero/contracts.js';
import { generateHeroSeed, createSeededRandom } from '../shared/hero/seed.js';
import {
  HERO_DEFAULT_EFFORT_TARGET,
  HERO_MAINTENANCE_INTENTS,
  HERO_INTENT_WEIGHTS,
} from '../shared/hero/constants.js';

// ── Helpers ──────────────────────────────────────────────────────────

function makeEnvelope(overrides = {}) {
  return buildTaskEnvelope({
    subjectId: 'grammar',
    intent: 'due-review',
    launcher: 'smart-practice',
    effortTarget: 4,
    reasonTags: ['due-concepts'],
    debugReason: 'Grammar due concepts for review.',
    ...overrides,
  });
}

function makeSnapshot(subjectId, signals = {}, envelopes = []) {
  return {
    subjectId,
    signals: { dueCount: 0, weakCount: 0, secureCount: 0, megaLike: false, postMegaAvailable: false, retentionDueCount: 0, ...signals },
    envelopes,
  };
}

const FIXED_SEED = generateHeroSeed({
  learnerId: 'learner-fixture-001',
  dateKey: '2026-04-27',
  timezone: 'Europe/London',
  schedulerVersion: 'hero-p0-shadow-v1',
  contentReleaseFingerprint: 'grammar-legacy-reviewed-2026-04-24:punctuation-v1:spelling-v1',
});

/**
 * Build a three-subject eligible snapshot set with realistic envelopes.
 */
function threeSubjectSnapshots() {
  return [
    makeSnapshot('spelling', { dueCount: 15, weakCount: 8, secureCount: 50 }, [
      makeEnvelope({ subjectId: 'spelling', intent: 'due-review', launcher: 'smart-practice', effortTarget: 6, reasonTags: ['due-concepts'], debugReason: 'Spelling has 15 due words.' }),
      makeEnvelope({ subjectId: 'spelling', intent: 'weak-repair', launcher: 'trouble-practice', effortTarget: 6, reasonTags: ['weak', 'recent-miss'], debugReason: 'Spelling has 8 trouble words.' }),
      makeEnvelope({ subjectId: 'spelling', intent: 'breadth-maintenance', launcher: 'mini-test', effortTarget: 5, reasonTags: ['breadth'], debugReason: 'Spelling breadth mini-test.' }),
    ]),
    makeSnapshot('grammar', { dueCount: 5, weakCount: 3, secureCount: 4, retentionDueCount: 1 }, [
      makeEnvelope({ subjectId: 'grammar', intent: 'due-review', launcher: 'smart-practice', effortTarget: 6, reasonTags: ['due-concepts'], debugReason: 'Grammar has 5 due concepts.' }),
      makeEnvelope({ subjectId: 'grammar', intent: 'weak-repair', launcher: 'trouble-practice', effortTarget: 6, reasonTags: ['weak-concepts', 'needs-repair'], debugReason: 'Grammar has 3 weak concepts.' }),
      makeEnvelope({ subjectId: 'grammar', intent: 'retention-after-secure', launcher: 'smart-practice', effortTarget: 4, reasonTags: ['retention', 'consolidating'], debugReason: 'Grammar retention.' }),
    ]),
    makeSnapshot('punctuation', { dueCount: 12, weakCount: 4, secureCount: 20 }, [
      makeEnvelope({ subjectId: 'punctuation', intent: 'due-review', launcher: 'smart-practice', effortTarget: 6, reasonTags: ['due-concepts'], debugReason: 'Punctuation has 12 due items.' }),
      makeEnvelope({ subjectId: 'punctuation', intent: 'weak-repair', launcher: 'trouble-practice', effortTarget: 6, reasonTags: ['weak-concepts'], debugReason: 'Punctuation has 4 weak items.' }),
      makeEnvelope({ subjectId: 'punctuation', intent: 'breadth-maintenance', launcher: 'gps-check', effortTarget: 5, reasonTags: ['breadth'], debugReason: 'Punctuation breadth check.' }),
    ]),
  ];
}

// ── 1. Pinned determinism fixture ────────────────────────────────────

test('same learner + same date + same version + same fingerprint → same quest (pinned fixture)', () => {
  const snapshots = threeSubjectSnapshots();
  const params = {
    eligibleSnapshots: snapshots,
    effortTarget: HERO_DEFAULT_EFFORT_TARGET,
    seed: FIXED_SEED,
    schedulerVersion: 'hero-p0-shadow-v1',
    dateKey: '2026-04-27',
  };

  const quest1 = scheduleShadowQuest(params);
  const quest2 = scheduleShadowQuest(params);

  // Exact structural equality — deterministic down to the last field.
  assert.deepEqual(quest1, quest2);

  // Sanity checks on the pinned output.
  assert.equal(quest1.status, 'shadow');
  assert.equal(quest1.effortTarget, 18);
  assert.ok(quest1.questId.startsWith('hero-quest-'));
  assert.ok(quest1.tasks.length > 0);
  assert.ok(quest1.effortPlanned > 0);
  assert.ok(quest1.effortPlanned <= quest1.effortTarget + 10); // reasonable upper bound
});

// ── 2. Different date usually changes quest ──────────────────────────

test('different date usually changes quest', () => {
  const snapshots = threeSubjectSnapshots();

  const seedDay1 = generateHeroSeed({
    learnerId: 'learner-fixture-001',
    dateKey: '2026-04-27',
    timezone: 'Europe/London',
    schedulerVersion: 'hero-p0-shadow-v1',
    contentReleaseFingerprint: 'fp1',
  });
  const seedDay2 = generateHeroSeed({
    learnerId: 'learner-fixture-001',
    dateKey: '2026-04-28',
    timezone: 'Europe/London',
    schedulerVersion: 'hero-p0-shadow-v1',
    contentReleaseFingerprint: 'fp1',
  });

  const quest1 = scheduleShadowQuest({ eligibleSnapshots: snapshots, seed: seedDay1 });
  const quest2 = scheduleShadowQuest({ eligibleSnapshots: snapshots, seed: seedDay2 });

  // The quest IDs must differ (different seeds produce different RNG sequences).
  assert.notEqual(quest1.questId, quest2.questId);
});

// ── 3. Due/retention tasks outrank random breadth in scoring ─────────

test('due-review and retention-after-secure tasks outrank breadth-maintenance', () => {
  const snapshots = [
    makeSnapshot('grammar', { dueCount: 5 }, [
      makeEnvelope({ subjectId: 'grammar', intent: 'due-review', effortTarget: 4, debugReason: 'due' }),
      makeEnvelope({ subjectId: 'grammar', intent: 'retention-after-secure', effortTarget: 4, debugReason: 'retention' }),
      makeEnvelope({ subjectId: 'grammar', intent: 'breadth-maintenance', effortTarget: 4, debugReason: 'breadth' }),
    ]),
  ];

  const quest = scheduleShadowQuest({ eligibleSnapshots: snapshots, seed: 42, effortTarget: 8 });

  // With weight 0.60 for due-review and retention vs 0.15 for breadth,
  // the first two tasks should be the high-weight intents.
  assert.ok(quest.tasks.length >= 2, 'should select at least 2 tasks');
  const firstTwoIntents = quest.tasks.slice(0, 2).map((t) => t.intent);
  assert.ok(
    firstTwoIntents.includes('due-review') || firstTwoIntents.includes('retention-after-secure'),
    `first two tasks should include high-weight intents, got: ${JSON.stringify(firstTwoIntents)}`
  );

  // Breadth should be last if present.
  if (quest.tasks.length === 3) {
    assert.equal(quest.tasks[2].intent, 'breadth-maintenance');
  }
});

// ── 4. Weak/recent-miss tasks outrank secure maintenance ─────────────

test('weak-repair tasks outrank breadth-maintenance in scoring', () => {
  const snapshots = [
    makeSnapshot('spelling', { weakCount: 5 }, [
      makeEnvelope({ subjectId: 'spelling', intent: 'weak-repair', launcher: 'trouble-practice', effortTarget: 6, debugReason: 'weak' }),
      makeEnvelope({ subjectId: 'spelling', intent: 'breadth-maintenance', launcher: 'mini-test', effortTarget: 5, debugReason: 'breadth' }),
    ]),
  ];

  const quest = scheduleShadowQuest({ eligibleSnapshots: snapshots, seed: 100, effortTarget: 11 });

  // weak-repair weight = 0.25, breadth-maintenance weight = 0.15.
  // With small jitter, weak-repair should rank first.
  assert.ok(quest.tasks.length >= 1);
  assert.equal(quest.tasks[0].intent, 'weak-repair');
});

// ── 5. Subject effort caps respected: 3 subjects (45% cap) ──────────

test('subject effort caps respected when 3 subjects eligible (none exceeds 45%)', () => {
  // Each subject has multiple moderate envelopes so the greedy algorithm can
  // interleave and the cap is actually exercised.
  const snapshots = [
    makeSnapshot('spelling', { dueCount: 10, weakCount: 5 }, [
      makeEnvelope({ subjectId: 'spelling', intent: 'due-review', effortTarget: 4, debugReason: 'spelling due' }),
      makeEnvelope({ subjectId: 'spelling', intent: 'weak-repair', launcher: 'trouble-practice', effortTarget: 4, debugReason: 'spelling weak' }),
      makeEnvelope({ subjectId: 'spelling', intent: 'due-review', effortTarget: 4, debugReason: 'spelling due 2' }),
      makeEnvelope({ subjectId: 'spelling', intent: 'breadth-maintenance', launcher: 'mini-test', effortTarget: 4, debugReason: 'spelling breadth' }),
    ]),
    makeSnapshot('grammar', { dueCount: 5, weakCount: 3 }, [
      makeEnvelope({ subjectId: 'grammar', intent: 'due-review', effortTarget: 4, debugReason: 'grammar due' }),
      makeEnvelope({ subjectId: 'grammar', intent: 'weak-repair', launcher: 'trouble-practice', effortTarget: 4, debugReason: 'grammar weak' }),
      makeEnvelope({ subjectId: 'grammar', intent: 'retention-after-secure', effortTarget: 4, debugReason: 'grammar retention' }),
      makeEnvelope({ subjectId: 'grammar', intent: 'breadth-maintenance', launcher: 'mini-test', effortTarget: 4, debugReason: 'grammar breadth' }),
    ]),
    makeSnapshot('punctuation', { dueCount: 8, weakCount: 2 }, [
      makeEnvelope({ subjectId: 'punctuation', intent: 'due-review', effortTarget: 4, debugReason: 'punctuation due' }),
      makeEnvelope({ subjectId: 'punctuation', intent: 'weak-repair', launcher: 'trouble-practice', effortTarget: 4, debugReason: 'punctuation weak' }),
      makeEnvelope({ subjectId: 'punctuation', intent: 'retention-after-secure', effortTarget: 4, debugReason: 'punctuation retention' }),
      makeEnvelope({ subjectId: 'punctuation', intent: 'breadth-maintenance', launcher: 'gps-check', effortTarget: 4, debugReason: 'punctuation breadth' }),
    ]),
  ];

  const quest = scheduleShadowQuest({ eligibleSnapshots: snapshots, seed: 77, effortTarget: 24 });

  // Must have tasks from multiple subjects.
  assert.ok(quest.tasks.length >= 3, `should select at least 3 tasks, got ${quest.tasks.length}`);

  // Check that no single subject exceeds 45% of planned effort.
  const mix = quest.debug.subjectMix;
  for (const [subjectId, effort] of Object.entries(mix)) {
    const fraction = effort / quest.effortPlanned;
    assert.ok(
      fraction <= 0.46, // small epsilon for rounding
      `${subjectId} exceeds 45% cap: ${effort}/${quest.effortPlanned} = ${(fraction * 100).toFixed(1)}%`
    );
  }
});

// ── 6. Subject effort caps respected: 2 subjects (60% cap) ──────────

test('subject effort caps respected when 2 subjects eligible (none exceeds 60%)', () => {
  // Both subjects have multiple envelopes so the cap is exercised.
  const snapshots = [
    makeSnapshot('spelling', { dueCount: 10, weakCount: 5 }, [
      makeEnvelope({ subjectId: 'spelling', intent: 'due-review', effortTarget: 4, debugReason: 'spelling due' }),
      makeEnvelope({ subjectId: 'spelling', intent: 'weak-repair', launcher: 'trouble-practice', effortTarget: 4, debugReason: 'spelling weak' }),
      makeEnvelope({ subjectId: 'spelling', intent: 'due-review', effortTarget: 4, debugReason: 'spelling due 2' }),
      makeEnvelope({ subjectId: 'spelling', intent: 'breadth-maintenance', launcher: 'mini-test', effortTarget: 4, debugReason: 'spelling breadth' }),
    ]),
    makeSnapshot('grammar', { dueCount: 5, weakCount: 3 }, [
      makeEnvelope({ subjectId: 'grammar', intent: 'due-review', effortTarget: 4, debugReason: 'grammar due' }),
      makeEnvelope({ subjectId: 'grammar', intent: 'weak-repair', launcher: 'trouble-practice', effortTarget: 4, debugReason: 'grammar weak' }),
      makeEnvelope({ subjectId: 'grammar', intent: 'retention-after-secure', effortTarget: 4, debugReason: 'grammar retention' }),
      makeEnvelope({ subjectId: 'grammar', intent: 'breadth-maintenance', launcher: 'mini-test', effortTarget: 4, debugReason: 'grammar breadth' }),
    ]),
  ];

  const quest = scheduleShadowQuest({ eligibleSnapshots: snapshots, seed: 55, effortTarget: 20 });

  // Must have tasks from both subjects.
  assert.ok(quest.tasks.length >= 3, `should select at least 3 tasks, got ${quest.tasks.length}`);

  const mix = quest.debug.subjectMix;
  for (const [subjectId, effort] of Object.entries(mix)) {
    const fraction = effort / quest.effortPlanned;
    assert.ok(
      fraction <= 0.61, // small epsilon for rounding
      `${subjectId} exceeds 60% cap: ${effort}/${quest.effortPlanned} = ${(fraction * 100).toFixed(1)}%`
    );
  }
});

// ── 7. Single eligible subject fills quest with debug explanation ─────

test('single eligible subject fills quest with debug explanation', () => {
  const snapshots = [
    makeSnapshot('grammar', { dueCount: 5, weakCount: 3 }, [
      makeEnvelope({ subjectId: 'grammar', intent: 'due-review', effortTarget: 10, debugReason: 'grammar due' }),
      makeEnvelope({ subjectId: 'grammar', intent: 'weak-repair', launcher: 'trouble-practice', effortTarget: 9, debugReason: 'grammar weak' }),
    ]),
  ];

  const quest = scheduleShadowQuest({ eligibleSnapshots: snapshots, seed: 33, effortTarget: 18 });

  // All tasks should come from grammar.
  for (const task of quest.tasks) {
    assert.equal(task.subjectId, 'grammar');
  }

  // Debug reason should explain single-eligible-subject.
  assert.ok(quest.debug.reason, 'debug.reason must be present');
  assert.ok(
    quest.debug.reason.includes('single-eligible-subject'),
    `debug.reason should mention single-eligible-subject, got: ${quest.debug.reason}`
  );
});

// ── 8. Mega subjects receive only maintenance-style envelopes ────────

test('fully secured/Mega subjects receive only maintenance-style envelopes', () => {
  const snapshots = [
    makeSnapshot('spelling', { megaLike: true, postMegaAvailable: true, dueCount: 2, weakCount: 1, secureCount: 195 }, [
      // Providers would have filtered these, but scheduler must enforce.
      makeEnvelope({ subjectId: 'spelling', intent: 'post-mega-maintenance', launcher: 'guardian-check', effortTarget: 4, reasonTags: ['post-mega', 'guardian'], debugReason: 'Spelling post-mega maintenance.' }),
      makeEnvelope({ subjectId: 'spelling', intent: 'retention-after-secure', launcher: 'smart-practice', effortTarget: 4, reasonTags: ['retention'], debugReason: 'Spelling retention.' }),
      // This non-maintenance envelope should be rejected by the scheduler.
      makeEnvelope({ subjectId: 'spelling', intent: 'due-review', launcher: 'smart-practice', effortTarget: 6, reasonTags: ['due'], debugReason: 'Spelling due review — should be rejected for Mega.' }),
      makeEnvelope({ subjectId: 'spelling', intent: 'weak-repair', launcher: 'trouble-practice', effortTarget: 6, reasonTags: ['weak'], debugReason: 'Spelling weak repair — should be rejected for Mega.' }),
    ]),
    makeSnapshot('grammar', { dueCount: 5 }, [
      makeEnvelope({ subjectId: 'grammar', intent: 'due-review', effortTarget: 6, debugReason: 'grammar due' }),
    ]),
  ];

  const quest = scheduleShadowQuest({ eligibleSnapshots: snapshots, seed: 88, effortTarget: 18 });

  // Spelling tasks should only contain maintenance intents.
  const spellingTasks = quest.tasks.filter((t) => t.subjectId === 'spelling');
  for (const task of spellingTasks) {
    assert.ok(
      HERO_MAINTENANCE_INTENTS.has(task.intent),
      `Mega spelling task should be maintenance, got: ${task.intent}`
    );
  }
});

// ── 9. Every task includes reasonTags and debugReason ─────────────────

test('every task includes reasonTags and debugReason', () => {
  const snapshots = threeSubjectSnapshots();
  const quest = scheduleShadowQuest({ eligibleSnapshots: snapshots, seed: FIXED_SEED, effortTarget: 18 });

  assert.ok(quest.tasks.length > 0);
  for (const task of quest.tasks) {
    assert.ok(Array.isArray(task.reasonTags), `task should have reasonTags array, got: ${typeof task.reasonTags}`);
    assert.equal(typeof task.debugReason, 'string', `task should have debugReason string`);
  }
});

// ── 10. No coin reward fields except coinsEnabled:false in safety ────

test('scheduler output contains no coin reward fields except coinsEnabled:false in safety', () => {
  const snapshots = threeSubjectSnapshots();
  const quest = scheduleShadowQuest({ eligibleSnapshots: snapshots, seed: FIXED_SEED });

  // Top-level quest should not have coin/reward/xp fields.
  const topKeys = Object.keys(quest);
  assert.ok(!topKeys.includes('coins'));
  assert.ok(!topKeys.includes('reward'));
  assert.ok(!topKeys.includes('xp'));
  assert.ok(!topKeys.includes('coinsEnabled'));

  // Safety debug block must assert no coins.
  assert.equal(quest.debug.safety.noCoins, true);

  // Each task should not have coin fields.
  for (const task of quest.tasks) {
    const taskKeys = Object.keys(task);
    assert.ok(!taskKeys.includes('coins'), `task should not have coins field`);
    assert.ok(!taskKeys.includes('reward'), `task should not have reward field`);
    assert.ok(!taskKeys.includes('xp'), `task should not have xp field`);
  }
});

// ── 11. Zero eligible subjects returns safe empty quest ──────────────

test('zero eligible subjects returns safe empty quest', () => {
  const quest = scheduleShadowQuest({ eligibleSnapshots: [], seed: 12345 });

  assert.equal(quest.status, 'shadow');
  assert.equal(quest.effortTarget, HERO_DEFAULT_EFFORT_TARGET);
  assert.equal(quest.effortPlanned, 0);
  assert.deepEqual(quest.tasks, []);
  assert.ok(quest.questId.startsWith('hero-quest-'));
  assert.equal(quest.debug.candidateCount, 0);
  assert.ok(quest.debug.reason.includes('zero-eligible-subjects'));
  assert.equal(quest.debug.safety.noWrites, true);
  assert.equal(quest.debug.safety.noCoins, true);
  assert.equal(quest.debug.safety.noChildUi, true);
  assert.equal(quest.debug.safety.noSubjectMutation, true);
});

// ── 12. Total available effort < effortTarget → take what's available ─

test('total available effort < effortTarget → takes what is available with debug reason', () => {
  const snapshots = [
    makeSnapshot('grammar', { dueCount: 2 }, [
      makeEnvelope({ subjectId: 'grammar', intent: 'due-review', effortTarget: 3, debugReason: 'grammar due small' }),
    ]),
    makeSnapshot('spelling', { dueCount: 1 }, [
      makeEnvelope({ subjectId: 'spelling', intent: 'due-review', effortTarget: 2, debugReason: 'spelling due small' }),
    ]),
  ];

  const quest = scheduleShadowQuest({ eligibleSnapshots: snapshots, seed: 200, effortTarget: 18 });

  // Total available = 3 + 2 = 5, well below target of 18.
  assert.equal(quest.effortPlanned, 5);
  assert.equal(quest.tasks.length, 2);
  assert.ok(quest.debug.reason, 'debug.reason must be present');
  assert.ok(
    quest.debug.reason.includes('available-effort-below-target'),
    `debug.reason should mention below-target, got: ${quest.debug.reason}`
  );
});

// ── 13. All subjects Mega-like → valid low-effort maintenance quest ──

test('all subjects Mega-like → valid low-effort maintenance quest', () => {
  const snapshots = [
    makeSnapshot('spelling', { megaLike: true, postMegaAvailable: true, secureCount: 195, dueCount: 2 }, [
      makeEnvelope({ subjectId: 'spelling', intent: 'post-mega-maintenance', launcher: 'guardian-check', effortTarget: 4, reasonTags: ['post-mega'], debugReason: 'Spelling post-mega.' }),
      makeEnvelope({ subjectId: 'spelling', intent: 'retention-after-secure', launcher: 'smart-practice', effortTarget: 3, reasonTags: ['retention'], debugReason: 'Spelling retention.' }),
    ]),
    makeSnapshot('grammar', { megaLike: true, secureCount: 30 }, [
      makeEnvelope({ subjectId: 'grammar', intent: 'retention-after-secure', launcher: 'smart-practice', effortTarget: 4, reasonTags: ['retention'], debugReason: 'Grammar retention.' }),
      makeEnvelope({ subjectId: 'grammar', intent: 'post-mega-maintenance', launcher: 'mini-test', effortTarget: 5, reasonTags: ['post-mega'], debugReason: 'Grammar post-mega.' }),
      // Non-maintenance — should be rejected.
      makeEnvelope({ subjectId: 'grammar', intent: 'due-review', effortTarget: 6, debugReason: 'grammar due — rejected' }),
    ]),
    makeSnapshot('punctuation', { megaLike: true, secureCount: 80 }, [
      makeEnvelope({ subjectId: 'punctuation', intent: 'retention-after-secure', launcher: 'smart-practice', effortTarget: 4, reasonTags: ['retention'], debugReason: 'Punctuation retention.' }),
    ]),
  ];

  const quest = scheduleShadowQuest({ eligibleSnapshots: snapshots, seed: 300, effortTarget: 18 });

  // All tasks should be maintenance-only.
  for (const task of quest.tasks) {
    assert.ok(
      HERO_MAINTENANCE_INTENTS.has(task.intent),
      `all-mega quest task should be maintenance, got: ${task.intent}`
    );
  }

  // Debug should explain all-mega.
  assert.ok(quest.debug.reason, 'debug.reason must be present');
  assert.ok(
    quest.debug.reason.includes('all-subjects-mega-like'),
    `debug.reason should mention all-subjects-mega-like, got: ${quest.debug.reason}`
  );

  // Quest should still be valid.
  assert.equal(quest.status, 'shadow');
  assert.ok(quest.tasks.length > 0);
});

// ── 14. Scheduler output passes quest normaliser from U1 ─────────────

test('scheduler output passes normaliseQuestShape from U1 contracts', () => {
  const snapshots = threeSubjectSnapshots();
  const quest = scheduleShadowQuest({ eligibleSnapshots: snapshots, seed: FIXED_SEED, effortTarget: 18 });

  const normalised = normaliseQuestShape(quest);

  assert.equal(normalised.questId, quest.questId);
  assert.equal(normalised.status, quest.status);
  assert.equal(normalised.effortTarget, quest.effortTarget);
  assert.equal(normalised.effortPlanned, quest.effortPlanned);
  assert.equal(normalised.tasks.length, quest.tasks.length);
});

// ── Additional structural tests ──────────────────────────────────────

test('scheduler returns correct shape for all fields', () => {
  const snapshots = threeSubjectSnapshots();
  const quest = scheduleShadowQuest({ eligibleSnapshots: snapshots, seed: FIXED_SEED });

  assert.equal(typeof quest.questId, 'string');
  assert.ok(quest.questId.startsWith('hero-quest-'));
  assert.equal(quest.status, 'shadow');
  assert.equal(typeof quest.effortTarget, 'number');
  assert.equal(typeof quest.effortPlanned, 'number');
  assert.ok(Array.isArray(quest.tasks));
  assert.ok(typeof quest.debug === 'object' && quest.debug !== null);
  assert.equal(typeof quest.debug.candidateCount, 'number');
  assert.ok(Array.isArray(quest.debug.rejectedCandidates));
  assert.ok(typeof quest.debug.subjectMix === 'object');
  assert.ok(typeof quest.debug.safety === 'object');
});

test('scheduler handles null/undefined eligibleSnapshots gracefully', () => {
  const quest1 = scheduleShadowQuest({ eligibleSnapshots: null, seed: 42 });
  const quest2 = scheduleShadowQuest({ eligibleSnapshots: undefined, seed: 42 });

  assert.deepEqual(quest1.tasks, []);
  assert.deepEqual(quest2.tasks, []);
  assert.ok(quest1.debug.reason.includes('zero-eligible-subjects'));
  assert.ok(quest2.debug.reason.includes('zero-eligible-subjects'));
});

test('scheduler handles missing params gracefully', () => {
  const quest = scheduleShadowQuest();
  assert.deepEqual(quest.tasks, []);
  assert.equal(quest.effortTarget, HERO_DEFAULT_EFFORT_TARGET);
  assert.ok(quest.debug.reason.includes('zero-eligible-subjects'));
});

test('scheduler does not use Math.random (determinism by construction)', () => {
  // Run the same inputs 10 times and verify identical output each time.
  const snapshots = threeSubjectSnapshots();
  const params = { eligibleSnapshots: snapshots, seed: 999, effortTarget: 18 };
  const baseline = scheduleShadowQuest(params);
  for (let i = 0; i < 10; i++) {
    const result = scheduleShadowQuest(params);
    assert.deepEqual(result, baseline, `run ${i} diverged from baseline`);
  }
});

test('effortPlanned does not exceed effortTarget by more than one envelope', () => {
  const snapshots = threeSubjectSnapshots();
  const quest = scheduleShadowQuest({ eligibleSnapshots: snapshots, seed: FIXED_SEED, effortTarget: 18 });

  // The greedy algorithm stops when effortPlanned >= effortTarget,
  // so it can exceed by at most the effort of the last envelope selected.
  // The largest envelope in our fixture is 6.
  const maxOvershoot = 6;
  assert.ok(
    quest.effortPlanned <= quest.effortTarget + maxOvershoot,
    `effortPlanned ${quest.effortPlanned} overshoots target ${quest.effortTarget} by more than ${maxOvershoot}`
  );
});

test('debug.candidateCount reflects actual candidate pool after mega filtering', () => {
  const snapshots = [
    makeSnapshot('spelling', { megaLike: true }, [
      makeEnvelope({ subjectId: 'spelling', intent: 'post-mega-maintenance', effortTarget: 4, debugReason: 'maintenance' }),
      makeEnvelope({ subjectId: 'spelling', intent: 'due-review', effortTarget: 6, debugReason: 'should be filtered' }),
    ]),
  ];

  const quest = scheduleShadowQuest({ eligibleSnapshots: snapshots, seed: 42, effortTarget: 10 });

  // Only the maintenance envelope should survive mega filtering.
  assert.equal(quest.debug.candidateCount, 1);
});

test('HERO_INTENT_WEIGHTS coverage: all six intents have defined weights', () => {
  const expectedIntents = [
    'due-review', 'weak-repair', 'retention-after-secure',
    'post-mega-maintenance', 'breadth-maintenance', 'starter-growth',
  ];
  for (const intent of expectedIntents) {
    assert.ok(
      typeof HERO_INTENT_WEIGHTS[intent] === 'number',
      `HERO_INTENT_WEIGHTS missing weight for ${intent}`
    );
  }
});

test('subject mix cap correctly rejects when one subject dominates (3 subjects)', () => {
  // Spelling has many envelopes that together far exceed 45% — the cap should
  // prevent it from consuming the entire quest.
  const snapshots = [
    makeSnapshot('spelling', { dueCount: 10, weakCount: 5 }, [
      makeEnvelope({ subjectId: 'spelling', intent: 'due-review', effortTarget: 4, debugReason: 'spelling due 1' }),
      makeEnvelope({ subjectId: 'spelling', intent: 'due-review', effortTarget: 4, debugReason: 'spelling due 2' }),
      makeEnvelope({ subjectId: 'spelling', intent: 'weak-repair', launcher: 'trouble-practice', effortTarget: 4, debugReason: 'spelling weak' }),
      makeEnvelope({ subjectId: 'spelling', intent: 'due-review', effortTarget: 4, debugReason: 'spelling due 3' }),
    ]),
    makeSnapshot('grammar', { dueCount: 5 }, [
      makeEnvelope({ subjectId: 'grammar', intent: 'due-review', effortTarget: 4, debugReason: 'grammar' }),
      makeEnvelope({ subjectId: 'grammar', intent: 'breadth-maintenance', launcher: 'mini-test', effortTarget: 4, debugReason: 'grammar breadth' }),
    ]),
    makeSnapshot('punctuation', { dueCount: 5 }, [
      makeEnvelope({ subjectId: 'punctuation', intent: 'due-review', effortTarget: 4, debugReason: 'punctuation' }),
      makeEnvelope({ subjectId: 'punctuation', intent: 'breadth-maintenance', launcher: 'gps-check', effortTarget: 4, debugReason: 'punctuation breadth' }),
    ]),
  ];

  const quest = scheduleShadowQuest({ eligibleSnapshots: snapshots, seed: 42, effortTarget: 24 });

  // The cap should ensure multiple subjects are represented.
  const subjectIds = new Set(quest.tasks.map((t) => t.subjectId));
  assert.ok(subjectIds.size >= 2, `should have tasks from at least 2 subjects, got ${subjectIds.size}`);

  // Spelling should not dominate.
  const spellingEffort = quest.debug.subjectMix.spelling || 0;
  if (quest.effortPlanned > 0 && spellingEffort > 0) {
    assert.ok(
      spellingEffort / quest.effortPlanned <= 0.46,
      `spelling should not exceed 45%, got ${spellingEffort}/${quest.effortPlanned}`
    );
  }
});

test('zero-eligible snapshot from scheduleShadowQuest also passes normaliseQuestShape', () => {
  const quest = scheduleShadowQuest({ eligibleSnapshots: [], seed: 42 });
  const normalised = normaliseQuestShape(quest);
  assert.equal(normalised.questId, quest.questId);
  assert.equal(normalised.effortPlanned, 0);
  assert.deepEqual(normalised.tasks, []);
});
