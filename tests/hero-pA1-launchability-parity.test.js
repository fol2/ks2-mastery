/**
 * Hero Mode pA1 — Provider/Launcher Parity Audit (U5).
 *
 * Proves that no child can receive a Hero Quest whose ONLY visible next step
 * cannot be launched.  Specifically audits the Grammar `mini-test` gap and
 * proves it is architecturally safe.
 *
 * Key safety proof:
 *   Grammar provider emits `mini-test` (breadth-maintenance) only when
 *   `secureCount >= 3`.  The conditions that trigger this ALSO trigger the
 *   fallback `smart-practice` envelope — so a quest ALWAYS contains at least
 *   one launchable task from Grammar.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  grammarProvider,
  spellingProvider,
  punctuationProvider,
} from '../worker/src/hero/providers/index.js';

import { mapHeroEnvelopeToSubjectPayload } from '../worker/src/hero/launch-adapters/index.js';
import { determineLaunchStatus } from '../shared/hero/launch-status.js';
import { scheduleShadowQuest } from '../shared/hero/scheduler.js';
import { buildHeroHomeModel } from '../src/platform/hero/hero-ui-model.js';
import { generateHeroSeed, deriveDateKey } from '../shared/hero/seed.js';
import {
  HERO_DEFAULT_EFFORT_TARGET,
  HERO_DEFAULT_TIMEZONE,
  HERO_P2_SCHEDULER_VERSION,
} from '../shared/hero/constants.js';

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Build a capability registry from a set of task envelopes using the
 * real adapter pipeline (mirrors buildCapabilityRegistry in read-model.js).
 */
function buildCapabilityRegistry(tasks) {
  const registry = {};
  for (const task of tasks) {
    const subjectId = task.subjectId;
    if (!subjectId) continue;
    if (!registry[subjectId]) {
      registry[subjectId] = { launchers: {} };
    }
    const result = mapHeroEnvelopeToSubjectPayload(task);
    if (result.launchable) {
      registry[subjectId].launchers[task.launcher] = true;
    }
  }
  return registry;
}

/**
 * Given envelopes, determine which are launchable using the full pipeline.
 */
function classifyEnvelopes(envelopes) {
  const registry = buildCapabilityRegistry(envelopes);
  return envelopes.map(env => {
    const result = determineLaunchStatus(env.subjectId, env.launcher, registry);
    return { ...env, launchable: result.launchable, status: result.status };
  });
}

/**
 * Build a minimal scheduler result from eligible snapshots.
 */
function scheduleFromSnapshots(snapshots) {
  const seed = generateHeroSeed({
    learnerId: 'test-learner-parity',
    dateKey: deriveDateKey(Date.now(), HERO_DEFAULT_TIMEZONE),
    timezone: HERO_DEFAULT_TIMEZONE,
    schedulerVersion: HERO_P2_SCHEDULER_VERSION,
    contentReleaseFingerprint: null,
  });
  return scheduleShadowQuest({
    eligibleSnapshots: snapshots,
    effortTarget: HERO_DEFAULT_EFFORT_TARGET,
    seed,
    schedulerVersion: HERO_P2_SCHEDULER_VERSION,
    dateKey: deriveDateKey(Date.now(), HERO_DEFAULT_TIMEZONE),
  });
}

// ═══════════════════════════════════════════════════════════════════════
// A) Provider/Adapter Parity Matrix
// ═══════════════════════════════════════════════════════════════════════

test('A) Parity matrix: Grammar provider launchers vs adapter support', () => {
  // Grammar provider can emit: smart-practice, trouble-practice, mini-test
  const grammarLaunchers = ['smart-practice', 'trouble-practice', 'mini-test'];
  const supported = [];
  const unsupported = [];

  for (const launcher of grammarLaunchers) {
    const envelope = { subjectId: 'grammar', launcher };
    const result = mapHeroEnvelopeToSubjectPayload(envelope);
    if (result.launchable) {
      supported.push(launcher);
    } else {
      unsupported.push(launcher);
    }
  }

  // All Grammar launchers are now supported (pA2 U3 closed the mini-test gap)
  assert.ok(supported.includes('smart-practice'), 'smart-practice must be launchable');
  assert.ok(supported.includes('trouble-practice'), 'trouble-practice must be launchable');
  assert.ok(supported.includes('mini-test'), 'mini-test must be launchable (pA2 U3 fix)');
  assert.equal(unsupported.length, 0, 'no Grammar launcher should be unsupported');
});

test('A) Parity matrix: Spelling provider launchers vs adapter support', () => {
  // Spelling provider can emit: smart-practice, trouble-practice, guardian-check
  const spellingLaunchers = ['smart-practice', 'trouble-practice', 'guardian-check'];

  for (const launcher of spellingLaunchers) {
    const envelope = { subjectId: 'spelling', launcher };
    const result = mapHeroEnvelopeToSubjectPayload(envelope);
    assert.equal(result.launchable, true, `Spelling ${launcher} must be launchable`);
  }
});

test('A) Parity matrix: Punctuation provider launchers vs adapter support', () => {
  // Punctuation provider can emit: smart-practice, trouble-practice, gps-check
  const punctuationLaunchers = ['smart-practice', 'trouble-practice', 'gps-check'];

  for (const launcher of punctuationLaunchers) {
    const envelope = { subjectId: 'punctuation', launcher };
    const result = mapHeroEnvelopeToSubjectPayload(envelope);
    assert.equal(result.launchable, true, `Punctuation ${launcher} must be launchable`);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// B) Grammar mini-test safety proof
// ═══════════════════════════════════════════════════════════════════════

test('B) Grammar mini-test safety: breadth-maintenance is now launchable (pA2 U3)', () => {
  // State: secureCount >= 3, weakCount = 0, dueCount = 0, retentionDueCount = 0
  // This is the ONLY state that produces ONLY the mini-test envelope.
  // Since pA2 U3, mini-test maps to satsset mode — always launchable.

  const readModel = {
    stats: { concepts: { total: 10, weak: 0, due: 0, secured: 5, learning: 5, new: 0 } },
    analytics: { concepts: [] }, // No consolidating concepts → retDueCount = 0
  };

  const result = grammarProvider(readModel);
  assert.equal(result.available, true);

  // Find the mini-test envelope
  const miniTest = result.envelopes.find(e => e.launcher === 'mini-test');
  assert.ok(miniTest, 'breadth-maintenance mini-test is emitted');

  // In this theoretical state, the ONLY envelope is mini-test
  assert.equal(result.envelopes.length, 1,
    'only mini-test emitted when weak=0, due=0, retDue=0, secure>=3');
  assert.equal(result.envelopes[0].launcher, 'mini-test');

  // Classify: mini-test IS launchable now (pA2 U3 added satsset mapping)
  const classified = classifyEnvelopes(result.envelopes);
  assert.equal(classified[0].launchable, true);
});

test('B) Grammar mini-test safety: quest with ONLY mini-test produces canStart=true (pA2 U3)', () => {
  // Since pA2 U3, mini-test IS launchable → canStart=true, no dead CTA.
  const heroUi = {
    status: 'loaded',
    readModel: {
      ui: { enabled: true },
      childVisible: true,
      dailyQuest: {
        tasks: [
          {
            subjectId: 'grammar',
            launcher: 'mini-test',
            intent: 'breadth-maintenance',
            launchStatus: 'launchable',
          },
        ],
      },
      activeHeroSession: null,
      eligibleSubjects: [{ subjectId: 'grammar' }],
      lockedSubjects: [],
    },
  };

  const model = buildHeroHomeModel(heroUi);
  assert.equal(model.enabled, true);
  assert.ok(model.nextTask !== null, 'mini-test is now a launchable task');
  assert.equal(model.nextTask.launcher, 'mini-test');
  assert.equal(model.canStart, true, 'canStart must be true when mini-test is launchable');
});

// ═══════════════════════════════════════════════════════════════════════
// C) Grammar zero-signals proof
// ═══════════════════════════════════════════════════════════════════════

test('C) Grammar zero-signals: total=0 returns unavailable', () => {
  const readModel = {
    stats: { concepts: { total: 0, weak: 0, due: 0, secured: 0, learning: 0, new: 0 } },
    analytics: { concepts: [] },
  };
  const result = grammarProvider(readModel);
  assert.equal(result.available, false);
  assert.equal(result.unavailableReason, 'missing-hero-readable-signals');
  assert.deepStrictEqual(result.envelopes, []);
});

test('C) Grammar zero-signals: null readModel returns unavailable', () => {
  const result = grammarProvider(null);
  assert.equal(result.available, false);
  assert.equal(result.unavailableReason, 'missing-hero-readable-signals');
  assert.deepStrictEqual(result.envelopes, []);
});

test('C) Grammar zero-signals: undefined stats returns unavailable', () => {
  const result = grammarProvider({});
  assert.equal(result.available, false);
  assert.deepStrictEqual(result.envelopes, []);
});

// ═══════════════════════════════════════════════════════════════════════
// D) Full scheduler launchability proof
// ═══════════════════════════════════════════════════════════════════════

test('D) Multi-subject quest: Grammar breadth-maintenance + other subjects ensure launchable tasks exist', () => {
  // Grammar has ONLY breadth-maintenance signals
  const grammarReadModel = {
    stats: { concepts: { total: 10, weak: 0, due: 0, secured: 5, learning: 5, new: 0 } },
    analytics: { concepts: [] },
  };
  const grammarSnapshot = grammarProvider(grammarReadModel);

  // Spelling has due words (will produce launchable smart-practice)
  const spellingReadModel = {
    stats: { core: { total: 50, secure: 30, due: 5, fresh: 10, trouble: 2, attempts: 200 } },
  };
  const spellingSnapshot = spellingProvider(spellingReadModel);

  // Schedule quest from both
  const quest = scheduleFromSnapshots([grammarSnapshot, spellingSnapshot]);
  assert.ok(quest.tasks.length > 0, 'quest must have tasks');

  // Build capability registry and check launchability
  const registry = buildCapabilityRegistry(quest.tasks);
  const hasLaunchable = quest.tasks.some(task => {
    const result = determineLaunchStatus(task.subjectId, task.launcher, registry);
    return result.launchable;
  });

  assert.equal(hasLaunchable, true,
    'multi-subject quest must have at least one launchable task');
});

test('D) Full scheduler: quest.tasks always contains at least one launchable when multiple subjects eligible', () => {
  // All three subjects eligible with normal signals
  const grammarRM = {
    stats: { concepts: { total: 20, weak: 2, due: 3, secured: 8, learning: 7, new: 0 } },
    analytics: { concepts: [] },
  };
  const spellingRM = {
    stats: { core: { total: 50, secure: 30, due: 5, fresh: 10, trouble: 2, attempts: 200 } },
  };
  const punctuationRM = {
    availability: { status: 'ready' },
    stats: { total: 30, secure: 15, due: 4, fresh: 5, weak: 3, attempts: 100 },
    analytics: { skillRows: [] },
  };

  const grammarSnap = grammarProvider(grammarRM);
  const spellingSnap = spellingProvider(spellingRM);
  const punctuationSnap = punctuationProvider(punctuationRM);

  const quest = scheduleFromSnapshots([grammarSnap, spellingSnap, punctuationSnap]);
  assert.ok(quest.tasks.length > 0);

  const registry = buildCapabilityRegistry(quest.tasks);
  const hasLaunchable = quest.tasks.some(task => {
    const result = determineLaunchStatus(task.subjectId, task.launcher, registry);
    return result.launchable;
  });

  assert.equal(hasLaunchable, true,
    'three-subject quest must have launchable tasks');
});

// ═══════════════════════════════════════════════════════════════════════
// E) Single-subject edge case
// ═══════════════════════════════════════════════════════════════════════

test('E) Single-subject Grammar: when due or weak exist, quest is launchable', () => {
  // Grammar is the only eligible subject, and it has at least one due concept
  const grammarRM = {
    stats: { concepts: { total: 10, weak: 0, due: 2, secured: 5, learning: 3, new: 0 } },
    analytics: { concepts: [] },
  };
  const snapshot = grammarProvider(grammarRM);
  assert.equal(snapshot.available, true);

  // Should emit both due-review (smart-practice) AND breadth-maintenance (mini-test)
  const launchers = snapshot.envelopes.map(e => e.launcher);
  assert.ok(launchers.includes('smart-practice'), 'due-review smart-practice emitted');
  assert.ok(launchers.includes('mini-test'), 'breadth-maintenance mini-test emitted');

  const quest = scheduleFromSnapshots([snapshot]);
  assert.ok(quest.tasks.length > 0);

  const registry = buildCapabilityRegistry(quest.tasks);
  const hasLaunchable = quest.tasks.some(task => {
    const result = determineLaunchStatus(task.subjectId, task.launcher, registry);
    return result.launchable;
  });
  assert.equal(hasLaunchable, true,
    'single-subject Grammar with due concepts has launchable tasks');
});

test('E) Single-subject Grammar: only breadth-maintenance — quest is fully launchable (pA2 U3)', () => {
  // Grammar is the ONLY eligible subject AND its only specific intent is
  // breadth-maintenance (secure>=3, weak=0, due=0, retDue=0).
  // Since pA2 U3, mini-test maps to satsset — quest IS launchable.
  const grammarRM = {
    stats: { concepts: { total: 10, weak: 0, due: 0, secured: 5, learning: 5, new: 0 } },
    analytics: { concepts: [] },
  };
  const snapshot = grammarProvider(grammarRM);

  const quest = scheduleFromSnapshots([snapshot]);

  // All tasks should be mini-test (the only envelope available)
  const allMiniTest = quest.tasks.every(t => t.launcher === 'mini-test');
  assert.equal(allMiniTest, true, 'all tasks are mini-test in this edge case');

  // Build registry — mini-test IS launchable now
  const registry = buildCapabilityRegistry(quest.tasks);
  const hasLaunchable = quest.tasks.some(task => {
    const result = determineLaunchStatus(task.subjectId, task.launcher, registry);
    return result.launchable;
  });
  assert.equal(hasLaunchable, true,
    'mini-test tasks are launchable (pA2 U3 satsset mapping)');

  // UI gets canStart = true
  const heroUi = {
    status: 'loaded',
    readModel: {
      ui: { enabled: true },
      childVisible: true,
      dailyQuest: {
        tasks: quest.tasks.map(t => ({
          ...t,
          launchStatus: 'launchable',
        })),
      },
      activeHeroSession: null,
      eligibleSubjects: [{ subjectId: 'grammar' }],
      lockedSubjects: [],
    },
  };

  const model = buildHeroHomeModel(heroUi);
  assert.ok(model.nextTask !== null, 'mini-test is launchable');
  assert.equal(model.canStart, true,
    'UI shows CTA for launchable mini-test quest');
});

test('E) Grammar fallback fires when total>0 but no specific intents match', () => {
  // Grammar with learning concepts but no weak, due, retention-due, or secured>=3
  const grammarRM = {
    stats: { concepts: { total: 5, weak: 0, due: 0, secured: 1, learning: 4, new: 0 } },
    analytics: { concepts: [] },
  };
  const snapshot = grammarProvider(grammarRM);
  assert.equal(snapshot.available, true);

  // Fallback fires: generic smart-practice
  assert.equal(snapshot.envelopes.length, 1);
  assert.equal(snapshot.envelopes[0].launcher, 'smart-practice');
  assert.ok(snapshot.envelopes[0].reasonTags.includes('generic-fallback'));

  // This is launchable
  const classified = classifyEnvelopes(snapshot.envelopes);
  assert.equal(classified[0].launchable, true);
});

// ═══════════════════════════════════════════════════════════════════════
// F) Spelling and Punctuation full parity
// ═══════════════════════════════════════════════════════════════════════

test('F) Spelling full parity: all provider-emitted launchers are adapter-supported', () => {
  // Pre-mega: smart-practice, trouble-practice
  const preMegaRM = {
    stats: { core: { total: 50, secure: 30, due: 5, fresh: 10, trouble: 3, attempts: 200 } },
  };
  const preMegaResult = spellingProvider(preMegaRM);
  const preMegaLaunchers = new Set(preMegaResult.envelopes.map(e => e.launcher));
  assert.ok(preMegaLaunchers.has('smart-practice'));
  assert.ok(preMegaLaunchers.has('trouble-practice'));

  for (const launcher of preMegaLaunchers) {
    const result = mapHeroEnvelopeToSubjectPayload({ subjectId: 'spelling', launcher });
    assert.equal(result.launchable, true, `Spelling ${launcher} is launchable`);
  }

  // Post-mega: guardian-check, smart-practice, trouble-practice
  const postMegaRM = {
    stats: { core: { total: 50, secure: 50, due: 2, fresh: 0, trouble: 1, attempts: 500 } },
    postMega: {
      allWordsMega: true,
      postMegaDashboardAvailable: true,
      guardianDueCount: 3,
      wobblingDueCount: 1,
      guardianMissionAvailable: true,
    },
  };
  const postMegaResult = spellingProvider(postMegaRM);
  const postMegaLaunchers = new Set(postMegaResult.envelopes.map(e => e.launcher));
  assert.ok(postMegaLaunchers.has('guardian-check'));
  assert.ok(postMegaLaunchers.has('smart-practice'));
  assert.ok(postMegaLaunchers.has('trouble-practice'));

  for (const launcher of postMegaLaunchers) {
    const result = mapHeroEnvelopeToSubjectPayload({ subjectId: 'spelling', launcher });
    assert.equal(result.launchable, true, `Spelling post-mega ${launcher} is launchable`);
  }
});

test('F) Spelling fallback: generic smart-practice is launchable', () => {
  // No due, no trouble, no post-mega → fallback
  const rm = {
    stats: { core: { total: 20, secure: 20, due: 0, fresh: 0, trouble: 0, attempts: 100 } },
  };
  const result = spellingProvider(rm);
  assert.equal(result.envelopes.length, 1);
  assert.equal(result.envelopes[0].launcher, 'smart-practice');
  assert.ok(result.envelopes[0].reasonTags.includes('generic-fallback'));

  const mapped = mapHeroEnvelopeToSubjectPayload({ subjectId: 'spelling', launcher: 'smart-practice' });
  assert.equal(mapped.launchable, true);
});

test('F) Punctuation full parity: all provider-emitted launchers are adapter-supported', () => {
  // State with due, weak, and secured >= 3
  const rm = {
    availability: { status: 'ready' },
    stats: { total: 30, secure: 10, due: 5, fresh: 5, weak: 3, attempts: 100 },
    analytics: { skillRows: [{ secure: 5, due: 2 }] },
  };
  const result = punctuationProvider(rm);
  const launchers = new Set(result.envelopes.map(e => e.launcher));

  // Should have smart-practice, trouble-practice, gps-check
  assert.ok(launchers.has('smart-practice'));
  assert.ok(launchers.has('trouble-practice'));
  assert.ok(launchers.has('gps-check'));

  for (const launcher of launchers) {
    const mapped = mapHeroEnvelopeToSubjectPayload({ subjectId: 'punctuation', launcher });
    assert.equal(mapped.launchable, true, `Punctuation ${launcher} is launchable`);
  }
});

test('F) Punctuation fallback: generic smart-practice is launchable', () => {
  // Fresh only, no due/weak/secured>=3
  const rm = {
    availability: { status: 'ready' },
    stats: { total: 5, secure: 1, due: 0, fresh: 4, weak: 0, attempts: 10 },
    analytics: { skillRows: [] },
  };
  const result = punctuationProvider(rm);
  assert.equal(result.envelopes.length, 1);
  assert.equal(result.envelopes[0].launcher, 'smart-practice');
  assert.ok(result.envelopes[0].reasonTags.includes('generic-fallback'));

  const mapped = mapHeroEnvelopeToSubjectPayload({ subjectId: 'punctuation', launcher: 'smart-practice' });
  assert.equal(mapped.launchable, true);
});

// ═══════════════════════════════════════════════════════════════════════
// G) Client UI nextTask selection
// ═══════════════════════════════════════════════════════════════════════

test('G) buildHeroHomeModel picks the first launchable task', () => {
  const heroUi = {
    status: 'loaded',
    readModel: {
      ui: { enabled: true },
      childVisible: true,
      dailyQuest: {
        tasks: [
          { subjectId: 'grammar', launcher: 'mini-test', intent: 'breadth-maintenance', launchStatus: 'launchable' },
          { subjectId: 'grammar', launcher: 'smart-practice', intent: 'due-review', launchStatus: 'launchable' },
          { subjectId: 'spelling', launcher: 'smart-practice', intent: 'due-review', launchStatus: 'launchable' },
        ],
      },
      activeHeroSession: null,
      eligibleSubjects: [{ subjectId: 'grammar' }, { subjectId: 'spelling' }],
      lockedSubjects: [],
    },
  };

  const model = buildHeroHomeModel(heroUi);
  assert.equal(model.enabled, true);
  assert.ok(model.nextTask !== null);
  assert.equal(model.nextTask.launcher, 'mini-test');
  assert.equal(model.nextTask.subjectId, 'grammar');
  assert.equal(model.canStart, true);
});

test('G) buildHeroHomeModel: all tasks not-launchable → nextTask=null, canStart=false', () => {
  const heroUi = {
    status: 'loaded',
    readModel: {
      ui: { enabled: true },
      childVisible: true,
      dailyQuest: {
        tasks: [
          { subjectId: 'grammar', launcher: 'unknown-future-mode', intent: 'experimental', launchStatus: 'not-launchable' },
          { subjectId: 'grammar', launcher: 'unknown-future-mode', intent: 'experimental', launchStatus: 'not-launchable' },
        ],
      },
      activeHeroSession: null,
      eligibleSubjects: [{ subjectId: 'grammar' }],
      lockedSubjects: [],
    },
  };

  const model = buildHeroHomeModel(heroUi);
  assert.equal(model.enabled, true);
  assert.equal(model.nextTask, null);
  assert.equal(model.canStart, false, 'canStart must be false when all tasks are non-launchable');
});

test('G) buildHeroHomeModel: empty tasks → nextTask=null, canStart=false', () => {
  const heroUi = {
    status: 'loaded',
    readModel: {
      ui: { enabled: true },
      childVisible: true,
      dailyQuest: { tasks: [] },
      activeHeroSession: null,
      eligibleSubjects: [],
      lockedSubjects: [],
    },
  };

  const model = buildHeroHomeModel(heroUi);
  assert.equal(model.nextTask, null);
  assert.equal(model.canStart, false);
});

test('G) buildHeroHomeModel: activeHeroSession blocks canStart even with launchable tasks', () => {
  const heroUi = {
    status: 'loaded',
    readModel: {
      ui: { enabled: true },
      childVisible: true,
      dailyQuest: {
        tasks: [
          { subjectId: 'spelling', launcher: 'smart-practice', intent: 'due-review', launchStatus: 'launchable' },
        ],
      },
      activeHeroSession: { subjectId: 'grammar', status: 'in-progress' },
      eligibleSubjects: [{ subjectId: 'spelling' }],
      lockedSubjects: [],
    },
  };

  const model = buildHeroHomeModel(heroUi);
  assert.ok(model.nextTask !== null, 'nextTask found');
  assert.equal(model.canStart, false, 'canStart false when session active');
  assert.equal(model.canContinue, true, 'canContinue true when session active');
});

// ═══════════════════════════════════════════════════════════════════════
// Summary proof: architectural safety statement
// ═══════════════════════════════════════════════════════════════════════

test('PROOF: Grammar mini-test gap is CLOSED — all learner states produce launchable quests (pA2 U3)', () => {
  // This test encapsulates the complete parity proof after pA2 U3:
  //
  // 1. Grammar adapter supports: smart-practice, trouble-practice, mini-test (satsset)
  // 2. ALL Grammar provider launcher values are now launchable
  // 3. No learner state produces a dead CTA
  // 4. The fallback at line 140 of grammar.js fires when NO specific intents
  //    match (weak=0, due=0, retDue=0, secure<3), which produces a launchable
  //    smart-practice. This covers the early-learner case.

  // State A: secure<3, no other signals → fallback fires → launchable
  const stateA = grammarProvider({
    stats: { concepts: { total: 3, weak: 0, due: 0, secured: 2, learning: 1, new: 0 } },
    analytics: { concepts: [] },
  });
  assert.equal(stateA.envelopes.length, 1);
  assert.equal(stateA.envelopes[0].launcher, 'smart-practice');
  const classifiedA = classifyEnvelopes(stateA.envelopes);
  assert.equal(classifiedA[0].launchable, true, 'State A: fallback is launchable');

  // State B: secure>=3, no other signals → mini-test only → NOW launchable (pA2 U3)
  const stateB = grammarProvider({
    stats: { concepts: { total: 10, weak: 0, due: 0, secured: 5, learning: 5, new: 0 } },
    analytics: { concepts: [] },
  });
  assert.equal(stateB.envelopes.length, 1);
  assert.equal(stateB.envelopes[0].launcher, 'mini-test');
  const classifiedB = classifyEnvelopes(stateB.envelopes);
  assert.equal(classifiedB[0].launchable, true, 'State B: mini-test IS launchable (satsset)');

  // UI proof for State B: canStart = true
  const uiModel = buildHeroHomeModel({
    status: 'loaded',
    readModel: {
      ui: { enabled: true },
      childVisible: true,
      dailyQuest: {
        tasks: [{ subjectId: 'grammar', launcher: 'mini-test', launchStatus: 'launchable' }],
      },
      activeHeroSession: null,
    },
  });
  assert.equal(uiModel.canStart, true, 'State B UI: CTA available for mini-test');

  // State C: secure>=3 WITH due concepts → both mini-test and smart-practice → all launchable
  const stateC = grammarProvider({
    stats: { concepts: { total: 10, weak: 0, due: 3, secured: 5, learning: 2, new: 0 } },
    analytics: { concepts: [] },
  });
  const hasMiniTest = stateC.envelopes.some(e => e.launcher === 'mini-test');
  const hasSmartPractice = stateC.envelopes.some(e => e.launcher === 'smart-practice');
  assert.equal(hasMiniTest, true, 'State C: mini-test emitted');
  assert.equal(hasSmartPractice, true, 'State C: smart-practice emitted');
  const classifiedC = classifyEnvelopes(stateC.envelopes);
  const allLaunchable = classifiedC.every(e => e.launchable);
  assert.equal(allLaunchable, true, 'State C: ALL tasks are launchable');
});
