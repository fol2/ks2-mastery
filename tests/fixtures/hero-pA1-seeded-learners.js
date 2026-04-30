// Hero Mode pA1 — Seeded learner fixture factories.
//
// Provides minimal state objects for flag ladder validation:
//   - Subject read-models (ready vs locked)
//   - Hero progress states at various lifecycle stages
//   - Economy states (low balance, sufficient, etc.)
//   - CAS / idempotency fixtures for stale-write testing

import { HERO_POOL_ROSTER_VERSION } from '../../shared/hero/hero-pool.js';
import { HERO_ECONOMY_VERSION } from '../../shared/hero/economy.js';
import { deriveDateKey } from '../../shared/hero/seed.js';

// ── Subject read-model fixtures ─────────────────────────────────────

const SPELLING_DATA = {
  stats: {
    core: { total: 200, secure: 60, due: 12, fresh: 70, trouble: 6, attempts: 350, correct: 295, accuracy: 0.84 },
    all: { total: 200, secure: 60, due: 12, fresh: 70, trouble: 6, attempts: 350, correct: 295, accuracy: 0.84 },
  },
};

const GRAMMAR_DATA = {
  stats: {
    concepts: { total: 30, new: 6, learning: 8, weak: 2, due: 6, secured: 8 },
  },
  analytics: {
    concepts: [
      { id: 'noun_proper', status: 'due', strength: 0.7 },
      { id: 'noun_common', status: 'weak', strength: 0.38 },
    ],
  },
};

const PUNCTUATION_DATA = {
  availability: { status: 'ready' },
  stats: { total: 80, secure: 22, due: 10, fresh: 28, weak: 3, attempts: 180, correct: 148, accuracy: 82 },
};

/**
 * All three ready subjects with due/weak signals so scheduler has work.
 */
export function readySubjectsOnly() {
  return {
    spelling: { data: SPELLING_DATA, ui: {} },
    grammar: { data: GRAMMAR_DATA, ui: {} },
    punctuation: { data: PUNCTUATION_DATA, ui: {} },
  };
}

/**
 * Locked placeholders (arithmetic, reasoning, reading) — empty read-models.
 * These subjects are in HERO_LOCKED_SUBJECT_IDS and should not produce tasks.
 */
export function lockedPlaceholders() {
  return {
    arithmetic: null,
    reasoning: null,
    reading: null,
  };
}

// ── Hero progress state fixtures ─────────────────────────────────────

const NOW = Date.now();
// Derived from NOW so the fixture tracks today's London date — keeps the
// flag-ladder D2 reconciliation in sync with the read-model's
// progressDateMatch check (which compares against deriveDateKey(now)).
const DATE_KEY = deriveDateKey(NOW);

/**
 * Learner who has completed today's quest (all tasks completed, daily complete).
 */
export function completedDailyQuest() {
  return {
    version: 3,
    daily: {
      dateKey: DATE_KEY,
      timezone: 'Europe/London',
      questId: 'quest-completed-test',
      questFingerprint: 'fp-completed',
      schedulerVersion: 'hero-p2-child-ui-v1',
      copyVersion: 'hero-p2-copy-v1',
      status: 'completed',
      effortTarget: 18,
      effortPlanned: 18,
      effortCompleted: 18,
      taskOrder: ['t1', 't2', 't3'],
      completedTaskIds: ['t1', 't2', 't3'],
      tasks: {
        t1: { taskId: 't1', questId: 'quest-completed-test', dateKey: DATE_KEY, subjectId: 'spelling', intent: 'due-review', launcher: 'smart-practice', effortTarget: 6, status: 'completed', completedAt: NOW - 3000, claimRequestId: 'claim-t1' },
        t2: { taskId: 't2', questId: 'quest-completed-test', dateKey: DATE_KEY, subjectId: 'grammar', intent: 'weak-repair', launcher: 'trouble-practice', effortTarget: 6, status: 'completed', completedAt: NOW - 2000, claimRequestId: 'claim-t2' },
        t3: { taskId: 't3', questId: 'quest-completed-test', dateKey: DATE_KEY, subjectId: 'punctuation', intent: 'due-review', launcher: 'smart-practice', effortTarget: 6, status: 'completed', completedAt: NOW - 1000, claimRequestId: 'claim-t3' },
      },
      generatedAt: NOW - 60000,
      firstStartedAt: NOW - 50000,
      completedAt: NOW - 1000,
      lastUpdatedAt: NOW - 1000,
      economy: {
        dailyAwardStatus: 'awarded',
        dailyAwardCoinsAvailable: 100,
        dailyAwardCoinsAwarded: 100,
        dailyAwardLedgerEntryId: 'award-today',
        dailyAwardedAt: NOW - 500,
        dailyAwardReason: 'daily-completion',
      },
    },
    recentClaims: [
      { claimId: 'claim-t1', taskId: 't1', createdAt: NOW - 3000 },
      { claimId: 'claim-t2', taskId: 't2', createdAt: NOW - 2000 },
      { claimId: 'claim-t3', taskId: 't3', createdAt: NOW - 1000 },
    ],
    economy: {
      version: HERO_ECONOMY_VERSION,
      balance: 300,
      lifetimeEarned: 300,
      lifetimeSpent: 0,
      ledger: [
        { entryId: 'award-today', type: 'daily-completion-award', amount: 100, dateKey: DATE_KEY, createdAt: NOW - 500 },
        { entryId: 'award-yesterday', type: 'daily-completion-award', amount: 100, dateKey: '2026-04-28', createdAt: NOW - 86400000 },
        { entryId: 'award-daybefore', type: 'daily-completion-award', amount: 100, dateKey: '2026-04-27', createdAt: NOW - 172800000 },
      ],
      lastUpdatedAt: NOW - 500,
    },
    heroPool: {
      version: 1,
      rosterVersion: HERO_POOL_ROSTER_VERSION,
      selectedMonsterId: 'glossbloom',
      monsters: {
        glossbloom: { monsterId: 'glossbloom', owned: true, stage: 1, branch: 'b1', investedCoins: 450, invitedAt: NOW - 200000, lastGrownAt: NOW - 100000, lastLedgerEntryId: 'spend-1' },
      },
      recentActions: [
        { type: 'invite', monsterId: 'glossbloom', stageAfter: 0, cost: 150, createdAt: NOW - 200000 },
        { type: 'grow', monsterId: 'glossbloom', stageAfter: 1, cost: 300, createdAt: NOW - 100000 },
      ],
      lastUpdatedAt: NOW - 100000,
    },
  };
}

/**
 * Hero economy with low balance (50) — below invite cost of 150.
 */
export function lowBalance() {
  return {
    version: 3,
    daily: null,
    recentClaims: [],
    economy: {
      version: HERO_ECONOMY_VERSION,
      balance: 50,
      lifetimeEarned: 200,
      lifetimeSpent: 150,
      ledger: [
        { entryId: 'e1', type: 'daily-completion-award', amount: 100, dateKey: '2026-04-27', createdAt: NOW - 200000 },
        { entryId: 'e2', type: 'daily-completion-award', amount: 100, dateKey: '2026-04-28', createdAt: NOW - 100000 },
        { entryId: 'spend-1', type: 'monster-invite', amount: -150, dateKey: '2026-04-28', createdAt: NOW - 90000 },
      ],
      lastUpdatedAt: NOW - 90000,
    },
    heroPool: {
      version: 1,
      rosterVersion: HERO_POOL_ROSTER_VERSION,
      selectedMonsterId: 'loomrill',
      monsters: {
        loomrill: { monsterId: 'loomrill', owned: true, stage: 0, branch: null, investedCoins: 150, invitedAt: NOW - 90000, lastGrownAt: null, lastLedgerEntryId: 'spend-1' },
      },
      recentActions: [
        { type: 'invite', monsterId: 'loomrill', stageAfter: 0, cost: 150, createdAt: NOW - 90000 },
      ],
      lastUpdatedAt: NOW - 90000,
    },
  };
}

/**
 * Hero economy with sufficient balance (500) — above invite cost.
 */
export function sufficientBalance() {
  return {
    version: 3,
    daily: null,
    recentClaims: [],
    economy: {
      version: HERO_ECONOMY_VERSION,
      balance: 500,
      lifetimeEarned: 500,
      lifetimeSpent: 0,
      ledger: [
        { entryId: 'e1', type: 'daily-completion-award', amount: 100, dateKey: '2026-04-25', createdAt: NOW - 400000 },
        { entryId: 'e2', type: 'daily-completion-award', amount: 100, dateKey: '2026-04-26', createdAt: NOW - 300000 },
        { entryId: 'e3', type: 'daily-completion-award', amount: 100, dateKey: '2026-04-27', createdAt: NOW - 200000 },
        { entryId: 'e4', type: 'daily-completion-award', amount: 100, dateKey: '2026-04-28', createdAt: NOW - 100000 },
        { entryId: 'e5', type: 'daily-completion-award', amount: 100, dateKey: '2026-04-29', createdAt: NOW - 1000 },
      ],
      lastUpdatedAt: NOW - 1000,
    },
    heroPool: {
      version: 1,
      rosterVersion: HERO_POOL_ROSTER_VERSION,
      selectedMonsterId: null,
      monsters: {},
      recentActions: [],
      lastUpdatedAt: null,
    },
  };
}

/**
 * State with a known CAS revision for stale-write testing.
 * The `_cas` field simulates the row_version that D1 would use.
 */
export function staleRequest() {
  return {
    version: 3,
    _cas: 'rev-00042',
    daily: {
      dateKey: DATE_KEY,
      timezone: 'Europe/London',
      questId: 'quest-stale-test',
      questFingerprint: 'fp-stale',
      schedulerVersion: 'hero-p2-child-ui-v1',
      status: 'active',
      effortTarget: 12,
      effortPlanned: 12,
      effortCompleted: 0,
      taskOrder: ['t1', 't2'],
      completedTaskIds: [],
      tasks: {
        t1: { taskId: 't1', questId: 'quest-stale-test', dateKey: DATE_KEY, subjectId: 'spelling', intent: 'due-review', launcher: 'smart-practice', effortTarget: 6, status: 'planned' },
        t2: { taskId: 't2', questId: 'quest-stale-test', dateKey: DATE_KEY, subjectId: 'grammar', intent: 'weak-repair', launcher: 'trouble-practice', effortTarget: 6, status: 'planned' },
      },
      generatedAt: NOW - 30000,
      firstStartedAt: null,
      completedAt: null,
      lastUpdatedAt: NOW - 30000,
    },
    recentClaims: [],
    economy: {
      version: HERO_ECONOMY_VERSION,
      balance: 100,
      lifetimeEarned: 100,
      lifetimeSpent: 0,
      ledger: [{ entryId: 'e1', type: 'daily-completion-award', amount: 100, dateKey: '2026-04-28', createdAt: NOW - 86400000 }],
      lastUpdatedAt: NOW - 86400000,
    },
    heroPool: {
      version: 1,
      rosterVersion: HERO_POOL_ROSTER_VERSION,
      selectedMonsterId: null,
      monsters: {},
      recentActions: [],
      lastUpdatedAt: null,
    },
  };
}

/**
 * State with a requestId that has already been processed (for dedup testing).
 */
export function duplicateRequest() {
  return {
    version: 3,
    daily: {
      dateKey: DATE_KEY,
      timezone: 'Europe/London',
      questId: 'quest-dedup-test',
      questFingerprint: 'fp-dedup',
      schedulerVersion: 'hero-p2-child-ui-v1',
      status: 'active',
      effortTarget: 12,
      effortPlanned: 12,
      effortCompleted: 6,
      taskOrder: ['t1', 't2'],
      completedTaskIds: ['t1'],
      tasks: {
        t1: { taskId: 't1', questId: 'quest-dedup-test', dateKey: DATE_KEY, subjectId: 'spelling', intent: 'due-review', launcher: 'smart-practice', effortTarget: 6, status: 'completed', completedAt: NOW - 5000, claimRequestId: 'req-already-processed' },
        t2: { taskId: 't2', questId: 'quest-dedup-test', dateKey: DATE_KEY, subjectId: 'grammar', intent: 'weak-repair', launcher: 'trouble-practice', effortTarget: 6, status: 'started', launchRequestId: 'req-launch-t2' },
      },
      generatedAt: NOW - 30000,
      firstStartedAt: NOW - 20000,
      completedAt: null,
      lastUpdatedAt: NOW - 5000,
    },
    recentClaims: [
      { claimId: 'req-already-processed', taskId: 't1', createdAt: NOW - 5000 },
    ],
    economy: {
      version: HERO_ECONOMY_VERSION,
      balance: 100,
      lifetimeEarned: 100,
      lifetimeSpent: 0,
      ledger: [{ entryId: 'e1', type: 'daily-completion-award', amount: 100, dateKey: '2026-04-28', createdAt: NOW - 86400000 }],
      lastUpdatedAt: NOW - 86400000,
    },
    heroPool: {
      version: 1,
      rosterVersion: HERO_POOL_ROSTER_VERSION,
      selectedMonsterId: null,
      monsters: {},
      recentActions: [],
      lastUpdatedAt: null,
    },
  };
}
