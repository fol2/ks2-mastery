'use strict';

// ── Monster Economy — pure spending computation ─────────────────────
// Zero side-effects. No Worker, no D1, no React.
// Imports ONLY from sibling shared modules.

import {
  isValidHeroMonsterId,
  isValidHeroMonsterBranch,
  getInviteCost,
  getGrowCost,
  getMaxStage,
} from './hero-pool.js';

import { deriveLedgerEntryId } from './economy.js';

// ── Helpers ─────────────────────────────────────────────────────────

/** Re-export for spend-side — same DJB2 hash as economy.js earning entries. */
export const deriveSpendLedgerEntryId = deriveLedgerEntryId;

function buildIdempotencyKey(prefix, learnerId, monsterId, discriminator) {
  return `${prefix}:v1:${learnerId}:${monsterId}:${discriminator}`;
}

// ── computeMonsterInviteIntent ──────────────────────────────────────

export function computeMonsterInviteIntent({
  economyState,
  heroPoolState,
  monsterId,
  branch,
  learnerId,
  rosterVersion,
  nowTs,
}) {
  // Validate monsterId
  if (!isValidHeroMonsterId(monsterId)) {
    return { ok: false, code: 'hero_monster_unknown', reason: `Unknown monsterId: ${monsterId}` };
  }

  // Validate branch — must be provided and non-empty
  if (branch === null || branch === undefined || branch === '') {
    return { ok: false, code: 'hero_monster_branch_required', reason: 'Branch is required for invite' };
  }
  if (!isValidHeroMonsterBranch(branch)) {
    return { ok: false, code: 'hero_monster_branch_invalid', reason: `Invalid branch: ${branch}` };
  }

  // Already owned check
  const existingMonster = heroPoolState && heroPoolState.monsters
    ? heroPoolState.monsters[monsterId]
    : undefined;
  if (existingMonster && existingMonster.owned) {
    return { ok: true, status: 'already-owned', cost: 0, coinsUsed: 0 };
  }

  // Cost and affordability
  const cost = getInviteCost();
  if (economyState.balance < cost) {
    return { ok: false, code: 'hero_insufficient_coins', reason: `Need ${cost} coins, have ${economyState.balance}` };
  }

  // Deterministic IDs
  const idempotencyKey = buildIdempotencyKey('hero-monster-invite', learnerId, monsterId, branch);
  const entryId = deriveLedgerEntryId(idempotencyKey);
  const balanceAfter = economyState.balance - cost;

  // Build ledger entry
  const ledgerEntry = {
    entryId,
    idempotencyKey,
    type: 'monster-invite',
    amount: -cost,
    balanceAfter,
    learnerId,
    monsterId,
    branch,
    stageAfter: 0,
    source: { kind: 'hero-camp-monster-invite', rosterVersion },
    createdAt: nowTs,
    createdBy: 'system',
  };

  // Build new monster state
  const newMonsterState = {
    monsterId,
    owned: true,
    stage: 0,
    branch,
    investedCoins: cost,
    invitedAt: nowTs,
    lastGrownAt: null,
    lastLedgerEntryId: entryId,
  };

  // Build action record
  const actionRecord = {
    actionId: entryId,
    requestId: null,
    type: 'monster-invite',
    monsterId,
    stageBefore: null,
    stageAfter: 0,
    branch,
    cost,
    ledgerEntryId: entryId,
    createdAt: nowTs,
  };

  const newLifetimeSpent = economyState.lifetimeSpent + cost;

  return {
    ok: true,
    status: 'invited',
    intent: {
      newBalance: balanceAfter,
      newLifetimeSpent,
      ledgerEntry,
      newMonsterState,
      actionRecord,
    },
  };
}

// ── computeMonsterGrowIntent ────────────────────────────────────────

export function computeMonsterGrowIntent({
  economyState,
  heroPoolState,
  monsterId,
  targetStage,
  learnerId,
  rosterVersion,
  nowTs,
}) {
  // Validate monsterId
  if (!isValidHeroMonsterId(monsterId)) {
    return { ok: false, code: 'hero_monster_unknown', reason: `Unknown monsterId: ${monsterId}` };
  }

  // Check monster is owned
  const existingMonster = heroPoolState && heroPoolState.monsters
    ? heroPoolState.monsters[monsterId]
    : undefined;
  if (!existingMonster || !existingMonster.owned) {
    return { ok: false, code: 'hero_monster_not_owned', reason: `Monster '${monsterId}' is not owned` };
  }

  // Validate targetStage is a number 1-4
  const maxStage = getMaxStage();
  if (typeof targetStage !== 'number' || !Number.isInteger(targetStage) || targetStage < 1 || targetStage > maxStage) {
    if (typeof targetStage === 'number' && targetStage > maxStage) {
      return { ok: false, code: 'hero_monster_max_stage', reason: `Target stage ${targetStage} exceeds max ${maxStage}` };
    }
    return { ok: false, code: 'hero_monster_stage_invalid', reason: `Target stage must be 1-${maxStage}` };
  }

  const currentStage = existingMonster.stage;

  // Already at or past target
  if (currentStage >= targetStage) {
    return { ok: true, status: 'already-stage', cost: 0, coinsUsed: 0 };
  }

  // Must be next sequential stage
  if (targetStage !== currentStage + 1) {
    return { ok: false, code: 'hero_monster_stage_not_next', reason: `Must grow to stage ${currentStage + 1}, not ${targetStage}` };
  }

  // Cost and affordability
  const cost = getGrowCost(targetStage);
  if (economyState.balance < cost) {
    return { ok: false, code: 'hero_insufficient_coins', reason: `Need ${cost} coins, have ${economyState.balance}` };
  }

  // Deterministic IDs
  const idempotencyKey = buildIdempotencyKey('hero-monster-grow', learnerId, monsterId, String(targetStage));
  const entryId = deriveLedgerEntryId(idempotencyKey);
  const balanceAfter = economyState.balance - cost;

  // Build ledger entry
  const ledgerEntry = {
    entryId,
    idempotencyKey,
    type: 'monster-grow',
    amount: -cost,
    balanceAfter,
    learnerId,
    monsterId,
    stageBefore: currentStage,
    stageAfter: targetStage,
    source: { kind: 'hero-camp-monster-grow', rosterVersion },
    createdAt: nowTs,
    createdBy: 'system',
  };

  // Build updated monster state
  const newMonsterState = {
    ...existingMonster,
    stage: targetStage,
    investedCoins: (existingMonster.investedCoins || 0) + cost,
    lastGrownAt: nowTs,
    lastLedgerEntryId: entryId,
  };

  // Build action record
  const actionRecord = {
    actionId: entryId,
    requestId: null,
    type: 'monster-grow',
    monsterId,
    stageBefore: currentStage,
    stageAfter: targetStage,
    branch: existingMonster.branch || null,
    cost,
    ledgerEntryId: entryId,
    createdAt: nowTs,
  };

  const newLifetimeSpent = economyState.lifetimeSpent + cost;

  return {
    ok: true,
    status: 'grown',
    intent: {
      newBalance: balanceAfter,
      newLifetimeSpent,
      ledgerEntry,
      newMonsterState,
      actionRecord,
    },
  };
}
