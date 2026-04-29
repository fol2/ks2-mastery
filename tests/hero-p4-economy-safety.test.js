// Hero Mode P4 U8 — Economy abuse and idempotency safety tests.
//
// Pure-logic layer tests covering:
// 1. Deterministic ledger entry ID derivation
// 2. Double-award prevention (applyDailyCompletionCoinAward idempotency)
// 3. Sequential award attempts on same state
// 4. FORBIDDEN_CLAIM_FIELDS completeness
// 5. Forbidden field rejection via validateClaimRequest
// 6. Forged questFingerprint produces different idempotency key
// 7. No negative amounts in daily-completion-award
// 8. Empty ledger + completed daily → canAward: true (not vacuously false)

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAwardDailyCompletionCoins,
  applyDailyCompletionCoinAward,
  HERO_DAILY_COMPLETION_COINS,
  deriveDailyAwardKey,
  deriveLedgerEntryId,
  emptyEconomyState,
} from '../shared/hero/economy.js';
import { emptyProgressState, applyClaimToProgress } from '../shared/hero/progress-state.js';
import { validateClaimRequest, FORBIDDEN_CLAIM_FIELDS } from '../shared/hero/claim-contract.js';

// ── Fixture builders ────────────────────────────────────────────────────

function buildCompletedDailyState(overrides = {}) {
  return {
    dateKey: '2026-04-29',
    questId: 'quest-safety-1',
    questFingerprint: 'hero-qf-abc123def456',
    status: 'completed',
    completedTaskIds: ['task-a', 'task-b', 'task-c'],
    completedAt: Date.now(),
    effortCompleted: 3,
    effortPlanned: 3,
    economy: null,
    ...overrides,
  };
}

function buildHeroStateWithCompletedDaily(overrides = {}) {
  return {
    daily: buildCompletedDailyState(overrides.daily),
    economy: overrides.economy ?? emptyEconomyState(),
  };
}

function buildValidClaimBody(overrides = {}) {
  return {
    command: 'claim-task',
    learnerId: 'learner-safety-1',
    questId: 'quest-safety-1',
    questFingerprint: 'hero-qf-abc123def456',
    taskId: 'task-a',
    requestId: 'req-safety-1',
    expectedLearnerRevision: 5,
    ...overrides,
  };
}

// ── 1. Same final claim-task produces same ledger entry ID (deterministic) ──

test('U8 Safety: same inputs produce identical ledger entry ID (deterministic)', () => {
  const params = {
    learnerId: 'learner-det-1',
    dateKey: '2026-04-29',
    questId: 'quest-det-1',
    questFingerprint: 'hero-qf-000111222333',
    economyVersion: 1,
  };

  const key1 = deriveDailyAwardKey(params);
  const key2 = deriveDailyAwardKey(params);
  assert.equal(key1, key2, 'Same params must produce same award key');

  const id1 = deriveLedgerEntryId(key1);
  const id2 = deriveLedgerEntryId(key2);
  assert.equal(id1, id2, 'Same award key must produce same ledger entry ID');
  assert.ok(id1.startsWith('hero-ledger-'), 'Ledger entry ID must start with hero-ledger-');
});

// ── 2. applyDailyCompletionCoinAward on already-awarded state → { awarded: false } ──

test('U8 Safety: applyDailyCompletionCoinAward on already-awarded state returns awarded=false', () => {
  const heroState = buildHeroStateWithCompletedDaily();
  const nowTs = Date.now();

  // First award succeeds
  const first = applyDailyCompletionCoinAward(heroState, {
    learnerId: 'learner-dup-1',
    nowTs,
    dailyCompletionCoins: HERO_DAILY_COMPLETION_COINS,
  });
  assert.equal(first.awarded, true);
  assert.equal(first.amount, HERO_DAILY_COMPLETION_COINS);

  // Second award on updated state returns awarded=false
  const second = applyDailyCompletionCoinAward(first.state, {
    learnerId: 'learner-dup-1',
    nowTs: nowTs + 1000,
    dailyCompletionCoins: HERO_DAILY_COMPLETION_COINS,
  });
  assert.equal(second.awarded, false);
  assert.equal(second.alreadyAwarded, true);
  assert.equal(second.amount, 0);
});

// ── 3. Two sequential award attempts on same state → first awards, second returns alreadyAwarded ──

test('U8 Safety: two sequential awards — first succeeds, second blocked by ledger idempotency', () => {
  const heroState = buildHeroStateWithCompletedDaily();
  const nowTs = Date.now();

  const first = applyDailyCompletionCoinAward(heroState, {
    learnerId: 'learner-seq-1',
    nowTs,
    dailyCompletionCoins: HERO_DAILY_COMPLETION_COINS,
  });
  assert.equal(first.awarded, true);
  assert.equal(first.state.economy.balance, HERO_DAILY_COMPLETION_COINS);
  assert.equal(first.state.economy.ledger.length, 1);

  const second = applyDailyCompletionCoinAward(first.state, {
    learnerId: 'learner-seq-1',
    nowTs: nowTs + 500,
    dailyCompletionCoins: HERO_DAILY_COMPLETION_COINS,
  });
  assert.equal(second.awarded, false);
  assert.equal(second.alreadyAwarded, true);
  // Balance must NOT double
  assert.equal(first.state.economy.balance, HERO_DAILY_COMPLETION_COINS);
});

// ── 4. FORBIDDEN_CLAIM_FIELDS includes economy-related field names ──

test('U8 Safety: FORBIDDEN_CLAIM_FIELDS includes coins, balance, reward, economy, amount, monster, shop', () => {
  const required = ['coins', 'balance', 'reward', 'economy', 'amount', 'monster', 'shop'];
  for (const field of required) {
    assert.ok(
      FORBIDDEN_CLAIM_FIELDS.includes(field),
      `FORBIDDEN_CLAIM_FIELDS must include '${field}'`,
    );
  }
});

// ── 5. Client sending ANY forbidden field gets rejected by validateClaimRequest ──

test('U8 Safety: validateClaimRequest rejects each forbidden field individually', () => {
  for (const field of FORBIDDEN_CLAIM_FIELDS) {
    const body = buildValidClaimBody({ [field]: 'injected-value' });
    const result = validateClaimRequest(body);
    assert.equal(result.valid, false, `Body with '${field}' must be invalid`);
    const relevantError = result.errors.find(e => e.includes(field));
    assert.ok(relevantError, `Error message must mention '${field}'`);
  }
});

// ── 6. Forged questFingerprint produces different idempotency key ──

test('U8 Safety: forged questFingerprint produces different idempotency key — will not collide', () => {
  const legitimate = deriveDailyAwardKey({
    learnerId: 'learner-forge-1',
    dateKey: '2026-04-29',
    questId: 'quest-forge-1',
    questFingerprint: 'hero-qf-real123456',
    economyVersion: 1,
  });
  const forged = deriveDailyAwardKey({
    learnerId: 'learner-forge-1',
    dateKey: '2026-04-29',
    questId: 'quest-forge-1',
    questFingerprint: 'hero-qf-forged99999',
    economyVersion: 1,
  });

  assert.notEqual(legitimate, forged, 'Different fingerprints must produce different award keys');
  assert.notEqual(
    deriveLedgerEntryId(legitimate),
    deriveLedgerEntryId(forged),
    'Different award keys must produce different ledger entry IDs',
  );
});

// ── 7. Balance can ONLY increase through award (no negative amount) ──

test('U8 Safety: daily-completion-award always uses positive HERO_DAILY_COMPLETION_COINS', () => {
  assert.ok(HERO_DAILY_COMPLETION_COINS > 0, 'HERO_DAILY_COMPLETION_COINS must be positive');

  const heroState = buildHeroStateWithCompletedDaily();
  const result = applyDailyCompletionCoinAward(heroState, {
    learnerId: 'learner-pos-1',
    nowTs: Date.now(),
    dailyCompletionCoins: HERO_DAILY_COMPLETION_COINS,
  });

  assert.equal(result.awarded, true);
  assert.equal(result.amount, HERO_DAILY_COMPLETION_COINS);
  assert.ok(result.state.economy.balance > 0, 'Balance must be positive after award');
  assert.ok(result.state.economy.lifetimeEarned > 0, 'lifetimeEarned must be positive after award');

  // Verify the ledger entry itself has positive amount
  const entry = result.state.economy.ledger[0];
  assert.ok(entry.amount > 0, 'Ledger entry amount must be positive');
  assert.equal(entry.type, 'daily-completion-award');
});

// ── 8. Empty ledger + completed daily → canAward: true (not vacuously false) ──

test('U8 Safety: canAwardDailyCompletionCoins with completed daily + empty ledger → canAward: true', () => {
  const heroState = buildHeroStateWithCompletedDaily();
  // Confirm the economy ledger is empty
  assert.equal(heroState.economy.ledger.length, 0);
  // Confirm daily is completed
  assert.equal(heroState.daily.status, 'completed');
  // Confirm no economy sub-block on daily
  assert.equal(heroState.daily.economy, null);

  const result = canAwardDailyCompletionCoins(heroState, true);
  assert.equal(result.canAward, true, 'Empty ledger with completed daily must be eligible');
  assert.equal(result.reason, 'eligible');
});

// ── 9. canAwardDailyCompletionCoins with economy disabled → canAward: false ──

test('U8 Safety: canAwardDailyCompletionCoins with economy disabled → canAward: false', () => {
  const heroState = buildHeroStateWithCompletedDaily();
  const result = canAwardDailyCompletionCoins(heroState, false);
  assert.equal(result.canAward, false);
  assert.equal(result.reason, 'economy_disabled');
});

// ── 10. canAwardDailyCompletionCoins with daily null → canAward: false ──

test('U8 Safety: canAwardDailyCompletionCoins with daily null → canAward: false', () => {
  const heroState = { daily: null, economy: emptyEconomyState() };
  const result = canAwardDailyCompletionCoins(heroState, true);
  assert.equal(result.canAward, false);
  assert.equal(result.reason, 'daily_null');
});

// ── 11. canAwardDailyCompletionCoins with daily active (not completed) → canAward: false ──

test('U8 Safety: canAwardDailyCompletionCoins with daily active → canAward: false', () => {
  const heroState = buildHeroStateWithCompletedDaily({ daily: { status: 'active' } });
  const result = canAwardDailyCompletionCoins(heroState, true);
  assert.equal(result.canAward, false);
  assert.equal(result.reason, 'daily_not_completed');
});

// ── 12. canAwardDailyCompletionCoins with already-awarded daily.economy → canAward: false ──

test('U8 Safety: canAwardDailyCompletionCoins with dailyAwardLedgerEntryId set → already_awarded', () => {
  const heroState = buildHeroStateWithCompletedDaily({
    daily: {
      economy: {
        dailyAwardStatus: 'awarded',
        dailyAwardLedgerEntryId: 'hero-ledger-existing',
      },
    },
  });
  const result = canAwardDailyCompletionCoins(heroState, true);
  assert.equal(result.canAward, false);
  assert.equal(result.reason, 'already_awarded');
});

// ── 13. validateClaimRequest rejects missing required fields ──

test('U8 Safety: validateClaimRequest rejects missing required fields', () => {
  const result = validateClaimRequest({});
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

// ── 14. validateClaimRequest rejects wrong command ──

test('U8 Safety: validateClaimRequest rejects wrong command', () => {
  const body = buildValidClaimBody({ command: 'forge-coins' });
  const result = validateClaimRequest(body);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('command')));
});

// ── 15. validateClaimRequest accepts valid body ──

test('U8 Safety: validateClaimRequest accepts valid claim body', () => {
  const body = buildValidClaimBody();
  const result = validateClaimRequest(body);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

// ── 16. applyClaimToProgress is no-op for already-completed task (no double-count) ──

test('U8 Safety: applyClaimToProgress does not double-count already-completed tasks', () => {
  const state = emptyProgressState();
  const dailyState = {
    ...state,
    daily: {
      dateKey: '2026-04-29',
      questId: 'quest-dc-1',
      questFingerprint: 'hero-qf-dc1',
      status: 'active',
      effortTarget: 3,
      effortPlanned: 3,
      effortCompleted: 0,
      taskOrder: ['task-x'],
      completedTaskIds: [],
      tasks: {
        'task-x': {
          taskId: 'task-x',
          questId: 'quest-dc-1',
          subjectId: 'spelling',
          effortTarget: 1,
          status: 'started',
          completedAt: null,
        },
      },
      completedAt: null,
      lastUpdatedAt: Date.now(),
    },
  };

  const nowTs = Date.now();
  const claimed = applyClaimToProgress(dailyState, { taskId: 'task-x', requestId: 'r1' }, nowTs);
  assert.equal(claimed.daily.tasks['task-x'].status, 'completed');
  assert.equal(claimed.daily.effortCompleted, 1);

  // Second apply with same taskId — no double-count
  const duplicated = applyClaimToProgress(claimed, { taskId: 'task-x', requestId: 'r2' }, nowTs + 1000);
  assert.equal(duplicated.daily.effortCompleted, 1, 'Effort must not double-count');
  assert.equal(duplicated.daily.completedTaskIds.length, 1, 'completedTaskIds must not duplicate');
});
