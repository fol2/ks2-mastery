import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  HERO_ECONOMY_VERSION,
  HERO_DAILY_COMPLETION_COINS,
  HERO_DAILY_BONUS_COINS_CAP,
  HERO_LEDGER_RECENT_LIMIT,
  HERO_ECONOMY_ENTRY_TYPES,
  deriveDailyAwardKey,
  deriveLedgerEntryId,
  emptyEconomyState,
  normaliseHeroEconomyState,
} from '../shared/hero/economy.js';

// ── deriveDailyAwardKey ──────────────────────────────────────────

test('deriveDailyAwardKey produces stable key for same inputs (deterministic)', () => {
  const params = {
    learnerId: 'learner-1',
    dateKey: '2026-04-29',
    questId: 'quest-abc',
    questFingerprint: 'fp-xyz',
    economyVersion: 1,
  };
  const key1 = deriveDailyAwardKey(params);
  const key2 = deriveDailyAwardKey(params);
  assert.equal(key1, key2);
  assert.equal(key1, 'hero-daily-coins:v1:learner-1:2026-04-29:quest-abc:fp-xyz');
});

test('deriveDailyAwardKey produces different keys for different inputs', () => {
  const base = {
    learnerId: 'learner-1',
    dateKey: '2026-04-29',
    questId: 'quest-abc',
    questFingerprint: 'fp-xyz',
    economyVersion: 1,
  };
  const altered = { ...base, learnerId: 'learner-2' };
  assert.notEqual(deriveDailyAwardKey(base), deriveDailyAwardKey(altered));

  const alteredDate = { ...base, dateKey: '2026-04-30' };
  assert.notEqual(deriveDailyAwardKey(base), deriveDailyAwardKey(alteredDate));

  const alteredQuest = { ...base, questId: 'quest-def' };
  assert.notEqual(deriveDailyAwardKey(base), deriveDailyAwardKey(alteredQuest));
});

// ── deriveLedgerEntryId ──────────────────────────────────────────

test('deriveLedgerEntryId produces hero-ledger- prefixed deterministic ID', () => {
  const key = 'hero-daily-coins:v1:learner-1:2026-04-29:quest-abc:fp-xyz';
  const id = deriveLedgerEntryId(key);
  assert.ok(id.startsWith('hero-ledger-'));
  assert.ok(id.length > 'hero-ledger-'.length);
});

test('same inputs across calls produce identical keys and IDs', () => {
  const params = {
    learnerId: 'learner-1',
    dateKey: '2026-04-29',
    questId: 'quest-abc',
    questFingerprint: 'fp-xyz',
    economyVersion: 1,
  };
  const key1 = deriveDailyAwardKey(params);
  const key2 = deriveDailyAwardKey(params);
  assert.equal(key1, key2);
  assert.equal(deriveLedgerEntryId(key1), deriveLedgerEntryId(key2));
});

// ── emptyEconomyState ────────────────────────────────────────────

test('emptyEconomyState() returns correct shape', () => {
  const state = emptyEconomyState();
  assert.equal(state.version, 1);
  assert.equal(state.balance, 0);
  assert.equal(state.lifetimeEarned, 0);
  assert.equal(state.lifetimeSpent, 0);
  assert.deepEqual(state.ledger, []);
  assert.equal(state.lastUpdatedAt, null);
});

// ── normaliseHeroEconomyState ────────────────────────────────────

test('normaliseHeroEconomyState(null) returns empty state', () => {
  const state = normaliseHeroEconomyState(null);
  assert.deepEqual(state, emptyEconomyState());
});

test('normaliseHeroEconomyState(undefined) returns empty state', () => {
  const state = normaliseHeroEconomyState(undefined);
  assert.deepEqual(state, emptyEconomyState());
});

test('normaliseHeroEconomyState({ version: 1, balance: "abc" }) normalises safely', () => {
  const state = normaliseHeroEconomyState({ version: 1, balance: 'abc' });
  assert.equal(state.version, 1);
  assert.equal(state.balance, 0); // coerced from invalid string
  assert.equal(state.lifetimeEarned, 0);
  assert.equal(state.lifetimeSpent, 0);
  assert.deepEqual(state.ledger, []);
});

test('normaliseHeroEconomyState with valid data returns normalised copy', () => {
  const input = {
    version: 1,
    balance: 300,
    lifetimeEarned: 500,
    lifetimeSpent: 200,
    ledger: [{ id: 'entry-1', amount: 100 }],
    lastUpdatedAt: '2026-04-29T10:00:00Z',
  };
  const state = normaliseHeroEconomyState(input);
  assert.equal(state.version, 1);
  assert.equal(state.balance, 300);
  assert.equal(state.lifetimeEarned, 500);
  assert.equal(state.lifetimeSpent, 200);
  assert.deepEqual(state.ledger, [{ id: 'entry-1', amount: 100 }]);
  assert.equal(state.lastUpdatedAt, '2026-04-29T10:00:00Z');
  // Verify it is a copy, not the same reference
  assert.notEqual(state, input);
});

test('ledger entries in state are preserved through normalisation', () => {
  const ledger = [
    { id: 'e1', type: 'daily-completion-award', amount: 100 },
    { id: 'e2', type: 'daily-completion-award', amount: 100 },
  ];
  const input = { version: 1, balance: 200, lifetimeEarned: 200, lifetimeSpent: 0, ledger, lastUpdatedAt: null };
  const state = normaliseHeroEconomyState(input);
  assert.equal(state.ledger.length, 2);
  assert.deepEqual(state.ledger, ledger);
});

// ── Structural assertions ────────────────────────────────────────

test('no Math.random() in module source', () => {
  const src = readFileSync(resolve(import.meta.dirname, '..', 'shared', 'hero', 'economy.js'), 'utf8');
  assert.equal(src.includes('Math.random'), false, 'Module must not use Math.random()');
});

test('no Date.now() in module source', () => {
  const src = readFileSync(resolve(import.meta.dirname, '..', 'shared', 'hero', 'economy.js'), 'utf8');
  assert.equal(src.includes('Date.now'), false, 'Module must not use Date.now()');
});

test('no Worker/React/D1/browser imports in module source', () => {
  const src = readFileSync(resolve(import.meta.dirname, '..', 'shared', 'hero', 'economy.js'), 'utf8');
  const forbidden = ['worker/', 'react', 'node:', '../worker'];
  for (const token of forbidden) {
    const importPattern = new RegExp(`import\\s.*from\\s+['"].*${token.replace('/', '\\/')}`, 'm');
    assert.equal(importPattern.test(src), false, `Module must not import from '${token}'`);
  }
});

test('HERO_ECONOMY_ENTRY_TYPES is frozen', () => {
  assert.ok(Object.isFrozen(HERO_ECONOMY_ENTRY_TYPES));
});

// ── Constants sanity ─────────────────────────────────────────────

test('constants have expected values', () => {
  assert.equal(HERO_ECONOMY_VERSION, 1);
  assert.equal(HERO_DAILY_COMPLETION_COINS, 100);
  assert.equal(HERO_DAILY_BONUS_COINS_CAP, 0);
  assert.equal(HERO_LEDGER_RECENT_LIMIT, 180);
});
