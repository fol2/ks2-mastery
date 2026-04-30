// Hero Mode pA4 — External cohort simulation fixture factories.
//
// Provides 8 diverse learner account fixtures and 7-day event sequences
// for validating §6 Goal 2: multi-day external cohort behaviour.
//
// Diversity coverage:
//   1. Spelling-focused learner
//   2. Grammar-ready learner
//   3. Punctuation-ready learner
//   4. First-time (empty) Hero state learner
//   5. Can-afford-Camp learner (balance ≥ invite cost 150)
//   6. Cannot-afford-Camp learner (balance < invite cost 150)
//   7. Multi-device/browser session learner
//   8. Mixed-subject learner (multiple ready subjects)

import { HERO_POOL_ROSTER_VERSION, HERO_MONSTER_INVITE_COST } from '../../shared/hero/hero-pool.js';
import { HERO_ECONOMY_VERSION, HERO_DAILY_COMPLETION_COINS } from '../../shared/hero/economy.js';
import { HERO_DEFAULT_TIMEZONE, HERO_P2_SCHEDULER_VERSION, HERO_P2_COPY_VERSION } from '../../shared/hero/constants.js';

// ── Date-key generation ─────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

/**
 * Build an array of date-keys starting from a given date.
 * @param {string} startDate — ISO date string e.g. '2026-04-24'
 * @param {number} days — number of sequential days
 * @returns {string[]} Array of date-keys in 'YYYY-MM-DD' format
 */
export function buildDateKeySequence(startDate, days) {
  const result = [];
  const base = new Date(startDate + 'T00:00:00Z');
  for (let i = 0; i < days; i++) {
    const d = new Date(base.getTime() + i * MS_PER_DAY);
    result.push(d.toISOString().slice(0, 10));
  }
  return result;
}

// ── Learner profile builder ─────────────────────────────────────────

const LEARNER_TYPES = [
  'spelling-focus',
  'grammar-ready',
  'punctuation-ready',
  'first-time',
  'can-afford',
  'cannot-afford',
  'multi-device',
  'mixed',
];

/**
 * Build a single learner profile of a given type.
 * @param {'spelling-focus'|'grammar-ready'|'punctuation-ready'|'first-time'|'can-afford'|'cannot-afford'|'multi-device'|'mixed'} type
 * @returns {object} Learner profile fixture
 */
export function buildLearnerProfile(type) {
  const profiles = {
    'spelling-focus': {
      type: 'spelling-focus',
      subjectSnapshots: {
        spelling: {
          data: { stats: { core: { total: 200, secure: 80, due: 15, fresh: 50, trouble: 8, attempts: 500, correct: 420, accuracy: 0.84 }, all: { total: 200, secure: 80, due: 15, fresh: 50, trouble: 8, attempts: 500, correct: 420, accuracy: 0.84 } } },
          ui: {},
        },
        grammar: null,
        punctuation: null,
      },
      readySubjects: ['spelling'],
      heroState: _emptyHeroState(),
      deviceSessions: [{ deviceId: 'dev-sf-1', browser: 'Chrome', lastSeen: null }],
    },
    'grammar-ready': {
      type: 'grammar-ready',
      subjectSnapshots: {
        spelling: {
          data: { stats: { core: { total: 200, secure: 60, due: 10, fresh: 70, trouble: 4, attempts: 300, correct: 250, accuracy: 0.83 }, all: { total: 200, secure: 60, due: 10, fresh: 70, trouble: 4, attempts: 300, correct: 250, accuracy: 0.83 } } },
          ui: {},
        },
        grammar: {
          data: { stats: { concepts: { total: 30, new: 5, learning: 10, weak: 3, due: 6, secured: 6 } }, analytics: { concepts: [{ id: 'noun_proper', status: 'due', strength: 0.65 }, { id: 'verb_tense', status: 'weak', strength: 0.35 }] } },
          ui: {},
        },
        punctuation: null,
      },
      readySubjects: ['spelling', 'grammar'],
      heroState: _emptyHeroState(),
      deviceSessions: [{ deviceId: 'dev-gr-1', browser: 'Chrome', lastSeen: null }],
    },
    'punctuation-ready': {
      type: 'punctuation-ready',
      subjectSnapshots: {
        spelling: {
          data: { stats: { core: { total: 200, secure: 55, due: 12, fresh: 65, trouble: 5, attempts: 280, correct: 230, accuracy: 0.82 }, all: { total: 200, secure: 55, due: 12, fresh: 65, trouble: 5, attempts: 280, correct: 230, accuracy: 0.82 } } },
          ui: {},
        },
        grammar: null,
        punctuation: {
          data: { availability: { status: 'ready' }, stats: { total: 80, secure: 20, due: 12, fresh: 30, weak: 4, attempts: 160, correct: 128, accuracy: 80 } },
          ui: {},
        },
      },
      readySubjects: ['spelling', 'punctuation'],
      heroState: _emptyHeroState(),
      deviceSessions: [{ deviceId: 'dev-pr-1', browser: 'Safari', lastSeen: null }],
    },
    'first-time': {
      type: 'first-time',
      subjectSnapshots: {
        spelling: {
          data: { stats: { core: { total: 200, secure: 40, due: 8, fresh: 100, trouble: 2, attempts: 100, correct: 80, accuracy: 0.8 }, all: { total: 200, secure: 40, due: 8, fresh: 100, trouble: 2, attempts: 100, correct: 80, accuracy: 0.8 } } },
          ui: {},
        },
        grammar: null,
        punctuation: null,
      },
      readySubjects: ['spelling'],
      heroState: null, // No prior Hero state
      deviceSessions: [{ deviceId: 'dev-ft-1', browser: 'Chrome', lastSeen: null }],
    },
    'can-afford': {
      type: 'can-afford',
      subjectSnapshots: {
        spelling: {
          data: { stats: { core: { total: 200, secure: 70, due: 12, fresh: 55, trouble: 5, attempts: 400, correct: 340, accuracy: 0.85 }, all: { total: 200, secure: 70, due: 12, fresh: 55, trouble: 5, attempts: 400, correct: 340, accuracy: 0.85 } } },
          ui: {},
        },
        grammar: {
          data: { stats: { concepts: { total: 30, new: 4, learning: 8, weak: 2, due: 7, secured: 9 } }, analytics: { concepts: [{ id: 'noun_proper', status: 'due', strength: 0.7 }] } },
          ui: {},
        },
        punctuation: null,
      },
      readySubjects: ['spelling', 'grammar'],
      heroState: _buildEconomyState(500, 500, 0), // 500 balance — well above 150 invite cost
      deviceSessions: [{ deviceId: 'dev-ca-1', browser: 'Chrome', lastSeen: null }],
    },
    'cannot-afford': {
      type: 'cannot-afford',
      subjectSnapshots: {
        spelling: {
          data: { stats: { core: { total: 200, secure: 50, due: 10, fresh: 80, trouble: 6, attempts: 220, correct: 175, accuracy: 0.8 }, all: { total: 200, secure: 50, due: 10, fresh: 80, trouble: 6, attempts: 220, correct: 175, accuracy: 0.8 } } },
          ui: {},
        },
        grammar: null,
        punctuation: null,
      },
      readySubjects: ['spelling'],
      heroState: _buildEconomyState(50, 200, 150), // 50 balance — below 150 invite cost
      deviceSessions: [{ deviceId: 'dev-na-1', browser: 'Firefox', lastSeen: null }],
    },
    'multi-device': {
      type: 'multi-device',
      subjectSnapshots: {
        spelling: {
          data: { stats: { core: { total: 200, secure: 65, due: 14, fresh: 60, trouble: 5, attempts: 380, correct: 320, accuracy: 0.84 }, all: { total: 200, secure: 65, due: 14, fresh: 60, trouble: 5, attempts: 380, correct: 320, accuracy: 0.84 } } },
          ui: {},
        },
        grammar: {
          data: { stats: { concepts: { total: 30, new: 6, learning: 7, weak: 2, due: 8, secured: 7 } }, analytics: { concepts: [{ id: 'adjective_comparative', status: 'due', strength: 0.6 }] } },
          ui: {},
        },
        punctuation: null,
      },
      readySubjects: ['spelling', 'grammar'],
      heroState: _buildEconomyState(200, 200, 0),
      deviceSessions: [
        { deviceId: 'dev-md-1', browser: 'Chrome', lastSeen: null },
        { deviceId: 'dev-md-2', browser: 'Safari-iPad', lastSeen: null },
        { deviceId: 'dev-md-3', browser: 'Chrome-Mobile', lastSeen: null },
      ],
    },
    'mixed': {
      type: 'mixed',
      subjectSnapshots: {
        spelling: {
          data: { stats: { core: { total: 200, secure: 75, due: 10, fresh: 55, trouble: 4, attempts: 450, correct: 385, accuracy: 0.86 }, all: { total: 200, secure: 75, due: 10, fresh: 55, trouble: 4, attempts: 450, correct: 385, accuracy: 0.86 } } },
          ui: {},
        },
        grammar: {
          data: { stats: { concepts: { total: 30, new: 3, learning: 9, weak: 2, due: 7, secured: 9 } }, analytics: { concepts: [{ id: 'noun_common', status: 'due', strength: 0.72 }, { id: 'verb_modal', status: 'weak', strength: 0.4 }] } },
          ui: {},
        },
        punctuation: {
          data: { availability: { status: 'ready' }, stats: { total: 80, secure: 25, due: 8, fresh: 25, weak: 3, attempts: 200, correct: 165, accuracy: 82 } },
          ui: {},
        },
      },
      readySubjects: ['spelling', 'grammar', 'punctuation'],
      heroState: _buildEconomyState(300, 400, 100),
      deviceSessions: [{ deviceId: 'dev-mx-1', browser: 'Chrome', lastSeen: null }],
    },
  };

  if (!profiles[type]) {
    throw new Error(`Unknown learner profile type: ${type}. Valid: ${LEARNER_TYPES.join(', ')}`);
  }
  return profiles[type];
}

// ── Internal state builders ─────────────────────────────────────────

function _emptyHeroState() {
  return {
    version: 3,
    daily: null,
    recentClaims: [],
    economy: {
      version: HERO_ECONOMY_VERSION,
      balance: 0,
      lifetimeEarned: 0,
      lifetimeSpent: 0,
      ledger: [],
      lastUpdatedAt: null,
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

function _buildEconomyState(balance, lifetimeEarned, lifetimeSpent) {
  return {
    version: 3,
    daily: null,
    recentClaims: [],
    economy: {
      version: HERO_ECONOMY_VERSION,
      balance,
      lifetimeEarned,
      lifetimeSpent,
      ledger: [],
      lastUpdatedAt: null,
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

// ── Cohort accounts builder ─────────────────────────────────────────

/**
 * Build 8 diverse account fixtures covering all required learner types.
 * @returns {Array<object>} Array of 8 account fixtures
 */
export function buildCohortAccounts() {
  return LEARNER_TYPES.map((type, idx) => {
    const accountId = `acc-cohort-${type}-${idx + 1}`;
    const learnerId = `learner-cohort-${type}-${idx + 1}`;
    const profile = buildLearnerProfile(type);

    return {
      accountId,
      learnerId,
      type,
      subjectSnapshots: profile.subjectSnapshots,
      readySubjects: profile.readySubjects,
      heroState: profile.heroState,
      deviceSessions: profile.deviceSessions,
    };
  });
}

// ── 7-day sequence builder ──────────────────────────────────────────

const DAY_SCENARIOS = Object.freeze([
  'first-task-complete',       // Day 1: Quest shown → start → first task → claim → coins
  'full-daily-completion',     // Day 2: Quest shown → start → all tasks → daily complete → +100
  'abandonment',               // Day 3: Quest shown → start → abandonment (no award)
  'camp-action',               // Day 4: Quest shown → complete → Camp invite/grow
  'insufficient-camp-attempt', // Day 5: Quest shown → complete → insufficient coins Camp attempt
  'multi-device-dedup',        // Day 6: Multi-device same quest → no duplicate award
  'full-metrics-extraction',   // Day 7: Full completion → metrics extraction ready
]);

/**
 * Build a 7-day event sequence for a given account.
 * @param {string} accountId
 * @param {object} [options]
 * @param {string} [options.startDate='2026-04-24'] — first day of the sequence
 * @param {string[]} [options.readySubjects] — subjects available for task scheduling
 * @param {number} [options.startingBalance=0] — economy balance at start of sequence
 * @returns {object} 7-day sequence with daily events, state transitions, and accumulated metrics
 */
export function buildSevenDaySequence(accountId, options = {}) {
  const {
    startDate = '2026-04-24',
    readySubjects = ['spelling'],
    startingBalance = 0,
  } = options;

  const dateKeys = buildDateKeySequence(startDate, 7);
  const baseTs = new Date(startDate + 'T08:00:00Z').getTime();
  const learnerId = accountId.replace('acc-', 'learner-');

  let runningBalance = startingBalance;
  let lifetimeEarned = startingBalance;
  let lifetimeSpent = 0;
  const days = [];

  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const dateKey = dateKeys[dayIdx];
    const dayTs = baseTs + dayIdx * MS_PER_DAY;
    const scenario = DAY_SCENARIOS[dayIdx];
    const questId = `quest-${accountId}-d${dayIdx + 1}`;
    const fingerprint = `fp-${accountId}-d${dayIdx + 1}`;

    // Choose subject for tasks based on ready subjects
    const primarySubject = readySubjects[dayIdx % readySubjects.length];
    const secondarySubject = readySubjects.length > 1
      ? readySubjects[(dayIdx + 1) % readySubjects.length]
      : primarySubject;

    const day = _buildDayEvents({
      scenario,
      dayIdx,
      dateKey,
      dayTs,
      questId,
      fingerprint,
      accountId,
      learnerId,
      primarySubject,
      secondarySubject,
      runningBalance,
      lifetimeEarned,
      lifetimeSpent,
    });

    // Update running totals
    runningBalance = day.balanceAfter;
    lifetimeEarned = day.lifetimeEarnedAfter;
    lifetimeSpent = day.lifetimeSpentAfter;

    days.push(day);
  }

  return {
    accountId,
    learnerId,
    startDate,
    dateKeys,
    days,
    finalBalance: runningBalance,
    finalLifetimeEarned: lifetimeEarned,
    finalLifetimeSpent: lifetimeSpent,
    completionCount: days.filter(d => d.dailyCompleted).length,
  };
}

// ── Day event builders ──────────────────────────────────────────────

function _buildDayEvents({
  scenario,
  dayIdx,
  dateKey,
  dayTs,
  questId,
  fingerprint,
  accountId,
  learnerId,
  primarySubject,
  secondarySubject,
  runningBalance,
  lifetimeEarned,
  lifetimeSpent,
}) {
  const tasks = _buildTasks({ dateKey, questId, primarySubject, secondarySubject, dayTs });

  switch (scenario) {
    case 'first-task-complete':
      return _dayFirstTaskComplete({ dayIdx, dateKey, dayTs, questId, fingerprint, learnerId, tasks, runningBalance, lifetimeEarned, lifetimeSpent });

    case 'full-daily-completion':
      return _dayFullCompletion({ dayIdx, dateKey, dayTs, questId, fingerprint, learnerId, tasks, runningBalance, lifetimeEarned, lifetimeSpent });

    case 'abandonment':
      return _dayAbandonment({ dayIdx, dateKey, dayTs, questId, fingerprint, learnerId, tasks, runningBalance, lifetimeEarned, lifetimeSpent });

    case 'camp-action':
      return _dayCampAction({ dayIdx, dateKey, dayTs, questId, fingerprint, learnerId, tasks, runningBalance, lifetimeEarned, lifetimeSpent });

    case 'insufficient-camp-attempt':
      return _dayInsufficientCamp({ dayIdx, dateKey, dayTs, questId, fingerprint, learnerId, tasks, runningBalance, lifetimeEarned, lifetimeSpent });

    case 'multi-device-dedup':
      return _dayMultiDeviceDedup({ dayIdx, dateKey, dayTs, questId, fingerprint, learnerId, tasks, runningBalance, lifetimeEarned, lifetimeSpent });

    case 'full-metrics-extraction':
      return _dayFullMetrics({ dayIdx, dateKey, dayTs, questId, fingerprint, learnerId, tasks, runningBalance, lifetimeEarned, lifetimeSpent });

    default:
      throw new Error(`Unknown day scenario: ${scenario}`);
  }
}

function _buildTasks({ dateKey, questId, primarySubject, secondarySubject, dayTs }) {
  return {
    t1: { taskId: `${questId}-t1`, questId, dateKey, subjectId: primarySubject, intent: 'due-review', launcher: 'smart-practice', effortTarget: 6, status: 'planned', generatedAt: dayTs },
    t2: { taskId: `${questId}-t2`, questId, dateKey, subjectId: secondarySubject, intent: 'weak-repair', launcher: 'trouble-practice', effortTarget: 6, status: 'planned', generatedAt: dayTs },
    t3: { taskId: `${questId}-t3`, questId, dateKey, subjectId: primarySubject, intent: 'due-review', launcher: 'smart-practice', effortTarget: 6, status: 'planned', generatedAt: dayTs },
  };
}

// Day 1: First task complete — partial progress, claim filed
function _dayFirstTaskComplete({ dayIdx, dateKey, dayTs, questId, fingerprint, learnerId, tasks, runningBalance, lifetimeEarned, lifetimeSpent }) {
  const t1 = { ...tasks.t1, status: 'completed', completedAt: dayTs + 600_000, claimRequestId: `claim-${questId}-t1` };
  return {
    dayIndex: dayIdx,
    dateKey,
    scenario: 'first-task-complete',
    questId,
    fingerprint,
    questShown: true,
    questStarted: true,
    dailyCompleted: false,
    tasksCompleted: 1,
    tasksTotal: 3,
    events: [
      { type: 'quest-shown', ts: dayTs, questId },
      { type: 'quest-started', ts: dayTs + 5000, questId },
      { type: 'task-completed', ts: dayTs + 600_000, taskId: t1.taskId, subjectId: t1.subjectId },
      { type: 'claim-filed', ts: dayTs + 601_000, taskId: t1.taskId, claimId: t1.claimRequestId },
    ],
    dailyState: {
      dateKey,
      timezone: HERO_DEFAULT_TIMEZONE,
      questId,
      questFingerprint: fingerprint,
      schedulerVersion: HERO_P2_SCHEDULER_VERSION,
      copyVersion: HERO_P2_COPY_VERSION,
      status: 'active',
      effortTarget: 18,
      effortPlanned: 18,
      effortCompleted: 6,
      taskOrder: ['t1', 't2', 't3'],
      completedTaskIds: [t1.taskId],
      tasks: { t1, t2: tasks.t2, t3: tasks.t3 },
      generatedAt: dayTs,
      firstStartedAt: dayTs + 5000,
      completedAt: null,
      lastUpdatedAt: dayTs + 601_000,
    },
    coinsAwarded: 0,
    balanceAfter: runningBalance,
    lifetimeEarnedAfter: lifetimeEarned,
    lifetimeSpentAfter: lifetimeSpent,
    abandonedAtStep: null,
    campEvent: null,
    deviceId: 'dev-primary',
  };
}

// Day 2: Full daily completion — all tasks done, +100 coins
function _dayFullCompletion({ dayIdx, dateKey, dayTs, questId, fingerprint, learnerId, tasks, runningBalance, lifetimeEarned, lifetimeSpent }) {
  const completedTasks = {
    t1: { ...tasks.t1, status: 'completed', completedAt: dayTs + 300_000, claimRequestId: `claim-${questId}-t1` },
    t2: { ...tasks.t2, status: 'completed', completedAt: dayTs + 600_000, claimRequestId: `claim-${questId}-t2` },
    t3: { ...tasks.t3, status: 'completed', completedAt: dayTs + 900_000, claimRequestId: `claim-${questId}-t3` },
  };
  const award = HERO_DAILY_COMPLETION_COINS;
  return {
    dayIndex: dayIdx,
    dateKey,
    scenario: 'full-daily-completion',
    questId,
    fingerprint,
    questShown: true,
    questStarted: true,
    dailyCompleted: true,
    tasksCompleted: 3,
    tasksTotal: 3,
    events: [
      { type: 'quest-shown', ts: dayTs, questId },
      { type: 'quest-started', ts: dayTs + 3000, questId },
      { type: 'task-completed', ts: dayTs + 300_000, taskId: completedTasks.t1.taskId, subjectId: completedTasks.t1.subjectId },
      { type: 'task-completed', ts: dayTs + 600_000, taskId: completedTasks.t2.taskId, subjectId: completedTasks.t2.subjectId },
      { type: 'task-completed', ts: dayTs + 900_000, taskId: completedTasks.t3.taskId, subjectId: completedTasks.t3.subjectId },
      { type: 'daily-completed', ts: dayTs + 900_100, questId },
      { type: 'coins-awarded', ts: dayTs + 900_200, amount: award, reason: 'daily-completion' },
    ],
    dailyState: {
      dateKey,
      timezone: HERO_DEFAULT_TIMEZONE,
      questId,
      questFingerprint: fingerprint,
      schedulerVersion: HERO_P2_SCHEDULER_VERSION,
      copyVersion: HERO_P2_COPY_VERSION,
      status: 'completed',
      effortTarget: 18,
      effortPlanned: 18,
      effortCompleted: 18,
      taskOrder: ['t1', 't2', 't3'],
      completedTaskIds: [completedTasks.t1.taskId, completedTasks.t2.taskId, completedTasks.t3.taskId],
      tasks: completedTasks,
      generatedAt: dayTs,
      firstStartedAt: dayTs + 3000,
      completedAt: dayTs + 900_000,
      lastUpdatedAt: dayTs + 900_200,
      economy: {
        dailyAwardStatus: 'awarded',
        dailyAwardCoinsAvailable: award,
        dailyAwardCoinsAwarded: award,
        dailyAwardLedgerEntryId: `award-${questId}`,
        dailyAwardedAt: dayTs + 900_200,
        dailyAwardReason: 'daily-completion',
      },
    },
    coinsAwarded: award,
    balanceAfter: runningBalance + award,
    lifetimeEarnedAfter: lifetimeEarned + award,
    lifetimeSpentAfter: lifetimeSpent,
    abandonedAtStep: null,
    campEvent: null,
    deviceId: 'dev-primary',
  };
}

// Day 3: Abandonment — started but dropped after first task
function _dayAbandonment({ dayIdx, dateKey, dayTs, questId, fingerprint, learnerId, tasks, runningBalance, lifetimeEarned, lifetimeSpent }) {
  const t1 = { ...tasks.t1, status: 'completed', completedAt: dayTs + 400_000, claimRequestId: `claim-${questId}-t1` };
  return {
    dayIndex: dayIdx,
    dateKey,
    scenario: 'abandonment',
    questId,
    fingerprint,
    questShown: true,
    questStarted: true,
    dailyCompleted: false,
    tasksCompleted: 1,
    tasksTotal: 3,
    events: [
      { type: 'quest-shown', ts: dayTs, questId },
      { type: 'quest-started', ts: dayTs + 4000, questId },
      { type: 'task-completed', ts: dayTs + 400_000, taskId: t1.taskId, subjectId: t1.subjectId },
      // No further activity — session abandoned
    ],
    dailyState: {
      dateKey,
      timezone: HERO_DEFAULT_TIMEZONE,
      questId,
      questFingerprint: fingerprint,
      schedulerVersion: HERO_P2_SCHEDULER_VERSION,
      copyVersion: HERO_P2_COPY_VERSION,
      status: 'active',
      effortTarget: 18,
      effortPlanned: 18,
      effortCompleted: 6,
      taskOrder: ['t1', 't2', 't3'],
      completedTaskIds: [t1.taskId],
      tasks: { t1, t2: tasks.t2, t3: tasks.t3 },
      generatedAt: dayTs,
      firstStartedAt: dayTs + 4000,
      completedAt: null,
      lastUpdatedAt: dayTs + 400_000,
    },
    coinsAwarded: 0,
    balanceAfter: runningBalance,
    lifetimeEarnedAfter: lifetimeEarned,
    lifetimeSpentAfter: lifetimeSpent,
    abandonedAtStep: 'after-first-task',
    campEvent: null,
    deviceId: 'dev-primary',
  };
}

// Day 4: Camp action — quest complete then Camp invite/grow
function _dayCampAction({ dayIdx, dateKey, dayTs, questId, fingerprint, learnerId, tasks, runningBalance, lifetimeEarned, lifetimeSpent }) {
  const completedTasks = {
    t1: { ...tasks.t1, status: 'completed', completedAt: dayTs + 300_000, claimRequestId: `claim-${questId}-t1` },
    t2: { ...tasks.t2, status: 'completed', completedAt: dayTs + 600_000, claimRequestId: `claim-${questId}-t2` },
    t3: { ...tasks.t3, status: 'completed', completedAt: dayTs + 900_000, claimRequestId: `claim-${questId}-t3` },
  };
  const award = HERO_DAILY_COMPLETION_COINS;
  const inviteCost = HERO_MONSTER_INVITE_COST;
  const balanceAfterAward = runningBalance + award;
  const canAfford = balanceAfterAward >= inviteCost;
  const balanceAfterCamp = canAfford ? balanceAfterAward - inviteCost : balanceAfterAward;
  const spentAfter = canAfford ? lifetimeSpent + inviteCost : lifetimeSpent;

  return {
    dayIndex: dayIdx,
    dateKey,
    scenario: 'camp-action',
    questId,
    fingerprint,
    questShown: true,
    questStarted: true,
    dailyCompleted: true,
    tasksCompleted: 3,
    tasksTotal: 3,
    events: [
      { type: 'quest-shown', ts: dayTs, questId },
      { type: 'quest-started', ts: dayTs + 3000, questId },
      { type: 'task-completed', ts: dayTs + 300_000, taskId: completedTasks.t1.taskId, subjectId: completedTasks.t1.subjectId },
      { type: 'task-completed', ts: dayTs + 600_000, taskId: completedTasks.t2.taskId, subjectId: completedTasks.t2.subjectId },
      { type: 'task-completed', ts: dayTs + 900_000, taskId: completedTasks.t3.taskId, subjectId: completedTasks.t3.subjectId },
      { type: 'daily-completed', ts: dayTs + 900_100, questId },
      { type: 'coins-awarded', ts: dayTs + 900_200, amount: award, reason: 'daily-completion' },
      ...(canAfford
        ? [{ type: 'camp-invite', ts: dayTs + 1_200_000, monsterId: 'glossbloom', cost: inviteCost }]
        : []),
    ],
    dailyState: {
      dateKey,
      timezone: HERO_DEFAULT_TIMEZONE,
      questId,
      questFingerprint: fingerprint,
      schedulerVersion: HERO_P2_SCHEDULER_VERSION,
      copyVersion: HERO_P2_COPY_VERSION,
      status: 'completed',
      effortTarget: 18,
      effortPlanned: 18,
      effortCompleted: 18,
      taskOrder: ['t1', 't2', 't3'],
      completedTaskIds: [completedTasks.t1.taskId, completedTasks.t2.taskId, completedTasks.t3.taskId],
      tasks: completedTasks,
      generatedAt: dayTs,
      firstStartedAt: dayTs + 3000,
      completedAt: dayTs + 900_000,
      lastUpdatedAt: dayTs + 1_200_000,
      economy: {
        dailyAwardStatus: 'awarded',
        dailyAwardCoinsAvailable: award,
        dailyAwardCoinsAwarded: award,
        dailyAwardLedgerEntryId: `award-${questId}`,
        dailyAwardedAt: dayTs + 900_200,
        dailyAwardReason: 'daily-completion',
      },
    },
    coinsAwarded: award,
    balanceAfter: balanceAfterCamp,
    lifetimeEarnedAfter: lifetimeEarned + award,
    lifetimeSpentAfter: spentAfter,
    abandonedAtStep: null,
    campEvent: canAfford ? { type: 'invite', monsterId: 'glossbloom', cost: inviteCost } : null,
    deviceId: 'dev-primary',
  };
}

// Day 5: Insufficient Camp attempt — quest complete but cannot afford Camp
function _dayInsufficientCamp({ dayIdx, dateKey, dayTs, questId, fingerprint, learnerId, tasks, runningBalance, lifetimeEarned, lifetimeSpent }) {
  const completedTasks = {
    t1: { ...tasks.t1, status: 'completed', completedAt: dayTs + 350_000, claimRequestId: `claim-${questId}-t1` },
    t2: { ...tasks.t2, status: 'completed', completedAt: dayTs + 700_000, claimRequestId: `claim-${questId}-t2` },
    t3: { ...tasks.t3, status: 'completed', completedAt: dayTs + 1_050_000, claimRequestId: `claim-${questId}-t3` },
  };
  const award = HERO_DAILY_COMPLETION_COINS;
  return {
    dayIndex: dayIdx,
    dateKey,
    scenario: 'insufficient-camp-attempt',
    questId,
    fingerprint,
    questShown: true,
    questStarted: true,
    dailyCompleted: true,
    tasksCompleted: 3,
    tasksTotal: 3,
    events: [
      { type: 'quest-shown', ts: dayTs, questId },
      { type: 'quest-started', ts: dayTs + 3000, questId },
      { type: 'task-completed', ts: dayTs + 350_000, taskId: completedTasks.t1.taskId, subjectId: completedTasks.t1.subjectId },
      { type: 'task-completed', ts: dayTs + 700_000, taskId: completedTasks.t2.taskId, subjectId: completedTasks.t2.subjectId },
      { type: 'task-completed', ts: dayTs + 1_050_000, taskId: completedTasks.t3.taskId, subjectId: completedTasks.t3.subjectId },
      { type: 'daily-completed', ts: dayTs + 1_050_100, questId },
      { type: 'coins-awarded', ts: dayTs + 1_050_200, amount: award, reason: 'daily-completion' },
      { type: 'camp-insufficient', ts: dayTs + 1_300_000, monsterId: 'loomrill', required: HERO_MONSTER_INVITE_COST, available: runningBalance + award },
    ],
    dailyState: {
      dateKey,
      timezone: HERO_DEFAULT_TIMEZONE,
      questId,
      questFingerprint: fingerprint,
      schedulerVersion: HERO_P2_SCHEDULER_VERSION,
      copyVersion: HERO_P2_COPY_VERSION,
      status: 'completed',
      effortTarget: 18,
      effortPlanned: 18,
      effortCompleted: 18,
      taskOrder: ['t1', 't2', 't3'],
      completedTaskIds: [completedTasks.t1.taskId, completedTasks.t2.taskId, completedTasks.t3.taskId],
      tasks: completedTasks,
      generatedAt: dayTs,
      firstStartedAt: dayTs + 3000,
      completedAt: dayTs + 1_050_000,
      lastUpdatedAt: dayTs + 1_300_000,
      economy: {
        dailyAwardStatus: 'awarded',
        dailyAwardCoinsAvailable: award,
        dailyAwardCoinsAwarded: award,
        dailyAwardLedgerEntryId: `award-${questId}`,
        dailyAwardedAt: dayTs + 1_050_200,
        dailyAwardReason: 'daily-completion',
      },
    },
    coinsAwarded: award,
    balanceAfter: runningBalance + award, // No spend — attempt failed
    lifetimeEarnedAfter: lifetimeEarned + award,
    lifetimeSpentAfter: lifetimeSpent,
    abandonedAtStep: null,
    campEvent: { type: 'insufficient', monsterId: 'loomrill', required: HERO_MONSTER_INVITE_COST, available: runningBalance + award },
    deviceId: 'dev-primary',
  };
}

// Day 6: Multi-device dedup — same quest on second device, no duplicate award
function _dayMultiDeviceDedup({ dayIdx, dateKey, dayTs, questId, fingerprint, learnerId, tasks, runningBalance, lifetimeEarned, lifetimeSpent }) {
  const completedTasks = {
    t1: { ...tasks.t1, status: 'completed', completedAt: dayTs + 400_000, claimRequestId: `claim-${questId}-t1` },
    t2: { ...tasks.t2, status: 'completed', completedAt: dayTs + 800_000, claimRequestId: `claim-${questId}-t2` },
    t3: { ...tasks.t3, status: 'completed', completedAt: dayTs + 1_100_000, claimRequestId: `claim-${questId}-t3` },
  };
  const award = HERO_DAILY_COMPLETION_COINS;
  return {
    dayIndex: dayIdx,
    dateKey,
    scenario: 'multi-device-dedup',
    questId,
    fingerprint,
    questShown: true,
    questStarted: true,
    dailyCompleted: true,
    tasksCompleted: 3,
    tasksTotal: 3,
    events: [
      { type: 'quest-shown', ts: dayTs, questId, deviceId: 'dev-primary' },
      { type: 'quest-started', ts: dayTs + 5000, questId, deviceId: 'dev-primary' },
      { type: 'task-completed', ts: dayTs + 400_000, taskId: completedTasks.t1.taskId, subjectId: completedTasks.t1.subjectId, deviceId: 'dev-primary' },
      { type: 'task-completed', ts: dayTs + 800_000, taskId: completedTasks.t2.taskId, subjectId: completedTasks.t2.subjectId, deviceId: 'dev-secondary' },
      { type: 'task-completed', ts: dayTs + 1_100_000, taskId: completedTasks.t3.taskId, subjectId: completedTasks.t3.subjectId, deviceId: 'dev-secondary' },
      { type: 'daily-completed', ts: dayTs + 1_100_100, questId, deviceId: 'dev-secondary' },
      { type: 'coins-awarded', ts: dayTs + 1_100_200, amount: award, reason: 'daily-completion', deviceId: 'dev-secondary' },
      // Second device attempts to claim again — idempotent: no duplicate
      { type: 'coins-award-dedup', ts: dayTs + 1_200_000, questId, deviceId: 'dev-primary', reason: 'already-awarded' },
    ],
    dailyState: {
      dateKey,
      timezone: HERO_DEFAULT_TIMEZONE,
      questId,
      questFingerprint: fingerprint,
      schedulerVersion: HERO_P2_SCHEDULER_VERSION,
      copyVersion: HERO_P2_COPY_VERSION,
      status: 'completed',
      effortTarget: 18,
      effortPlanned: 18,
      effortCompleted: 18,
      taskOrder: ['t1', 't2', 't3'],
      completedTaskIds: [completedTasks.t1.taskId, completedTasks.t2.taskId, completedTasks.t3.taskId],
      tasks: completedTasks,
      generatedAt: dayTs,
      firstStartedAt: dayTs + 5000,
      completedAt: dayTs + 1_100_000,
      lastUpdatedAt: dayTs + 1_200_000,
      economy: {
        dailyAwardStatus: 'awarded',
        dailyAwardCoinsAvailable: award,
        dailyAwardCoinsAwarded: award,
        dailyAwardLedgerEntryId: `award-${questId}`,
        dailyAwardedAt: dayTs + 1_100_200,
        dailyAwardReason: 'daily-completion',
      },
    },
    coinsAwarded: award, // Only once despite multi-device
    balanceAfter: runningBalance + award,
    lifetimeEarnedAfter: lifetimeEarned + award,
    lifetimeSpentAfter: lifetimeSpent,
    abandonedAtStep: null,
    campEvent: null,
    deviceId: 'dev-primary+dev-secondary',
    multiDeviceAttempt: true,
    duplicateAwardPrevented: true,
  };
}

// Day 7: Full completion with metrics extraction
function _dayFullMetrics({ dayIdx, dateKey, dayTs, questId, fingerprint, learnerId, tasks, runningBalance, lifetimeEarned, lifetimeSpent }) {
  const completedTasks = {
    t1: { ...tasks.t1, status: 'completed', completedAt: dayTs + 250_000, claimRequestId: `claim-${questId}-t1` },
    t2: { ...tasks.t2, status: 'completed', completedAt: dayTs + 500_000, claimRequestId: `claim-${questId}-t2` },
    t3: { ...tasks.t3, status: 'completed', completedAt: dayTs + 750_000, claimRequestId: `claim-${questId}-t3` },
  };
  const award = HERO_DAILY_COMPLETION_COINS;
  return {
    dayIndex: dayIdx,
    dateKey,
    scenario: 'full-metrics-extraction',
    questId,
    fingerprint,
    questShown: true,
    questStarted: true,
    dailyCompleted: true,
    tasksCompleted: 3,
    tasksTotal: 3,
    events: [
      { type: 'quest-shown', ts: dayTs, questId },
      { type: 'quest-started', ts: dayTs + 2000, questId },
      { type: 'task-completed', ts: dayTs + 250_000, taskId: completedTasks.t1.taskId, subjectId: completedTasks.t1.subjectId },
      { type: 'task-completed', ts: dayTs + 500_000, taskId: completedTasks.t2.taskId, subjectId: completedTasks.t2.subjectId },
      { type: 'task-completed', ts: dayTs + 750_000, taskId: completedTasks.t3.taskId, subjectId: completedTasks.t3.subjectId },
      { type: 'daily-completed', ts: dayTs + 750_100, questId },
      { type: 'coins-awarded', ts: dayTs + 750_200, amount: award, reason: 'daily-completion' },
      { type: 'metrics-extraction-ready', ts: dayTs + 800_000, questId },
    ],
    dailyState: {
      dateKey,
      timezone: HERO_DEFAULT_TIMEZONE,
      questId,
      questFingerprint: fingerprint,
      schedulerVersion: HERO_P2_SCHEDULER_VERSION,
      copyVersion: HERO_P2_COPY_VERSION,
      status: 'completed',
      effortTarget: 18,
      effortPlanned: 18,
      effortCompleted: 18,
      taskOrder: ['t1', 't2', 't3'],
      completedTaskIds: [completedTasks.t1.taskId, completedTasks.t2.taskId, completedTasks.t3.taskId],
      tasks: completedTasks,
      generatedAt: dayTs,
      firstStartedAt: dayTs + 2000,
      completedAt: dayTs + 750_000,
      lastUpdatedAt: dayTs + 800_000,
      economy: {
        dailyAwardStatus: 'awarded',
        dailyAwardCoinsAvailable: award,
        dailyAwardCoinsAwarded: award,
        dailyAwardLedgerEntryId: `award-${questId}`,
        dailyAwardedAt: dayTs + 750_200,
        dailyAwardReason: 'daily-completion',
      },
    },
    coinsAwarded: award,
    balanceAfter: runningBalance + award,
    lifetimeEarnedAfter: lifetimeEarned + award,
    lifetimeSpentAfter: lifetimeSpent,
    abandonedAtStep: null,
    campEvent: null,
    deviceId: 'dev-primary',
    metricsExtractionReady: true,
  };
}
