// Hero Camp — pure command resolver (P5).
// Returns mutation intent or typed error. No DB access.

import { computeMonsterInviteIntent, computeMonsterGrowIntent } from '../../../shared/hero/monster-economy.js';
import { isValidHeroMonsterId, isValidHeroMonsterBranch } from '../../../shared/hero/hero-pool.js';
import { HERO_POOL_ROSTER_VERSION } from '../../../shared/hero/progress-state.js';

// ── Forbidden fields ────────────────────────────────────────────────

export const FORBIDDEN_CAMP_FIELDS = Object.freeze([
  'cost', 'amount', 'balance', 'ledgerEntryId', 'stage', 'owned',
  'payload', 'subjectId', 'shop', 'reward', 'coins', 'economy',
  'ledger', 'lifetimeSpent', 'lifetimeEarned', 'stageAfter', 'stageBefore',
]);

// ── Supported commands ──────────────────────────────────────────────

const CAMP_COMMANDS = new Set(['unlock-monster', 'evolve-monster']);

// ── Main resolver ───────────────────────────────────────────────────

export function resolveHeroCampCommand({ command, body, heroState, learnerId, nowTs }) {
  // 1. Validate command
  if (!CAMP_COMMANDS.has(command)) {
    return { ok: false, code: 'hero_command_unknown', httpStatus: 400 };
  }

  // 2. Check for forbidden client fields
  const rejectedFields = FORBIDDEN_CAMP_FIELDS.filter(f => body[f] !== undefined);
  if (rejectedFields.length > 0) {
    return { ok: false, code: 'hero_client_field_rejected', httpStatus: 400, rejectedFields };
  }

  // 3. Dispatch to command handler
  if (command === 'unlock-monster') {
    return resolveUnlockMonster(body, heroState, learnerId, nowTs);
  }
  return resolveEvolveMonster(body, heroState, learnerId, nowTs);
}

// ── unlock-monster ──────────────────────────────────────────────────

function resolveUnlockMonster(body, heroState, learnerId, nowTs) {
  const { monsterId, branch } = body;

  if (!monsterId || !isValidHeroMonsterId(monsterId)) {
    return { ok: false, code: 'hero_monster_unknown', httpStatus: 400 };
  }

  if (!branch || !isValidHeroMonsterBranch(branch)) {
    return { ok: false, code: 'hero_monster_branch_invalid', httpStatus: 400 };
  }

  const result = computeMonsterInviteIntent({
    economyState: heroState.economy,
    heroPoolState: heroState.heroPool,
    monsterId,
    branch,
    learnerId,
    rosterVersion: HERO_POOL_ROSTER_VERSION,
    nowTs,
  });

  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      httpStatus: result.code === 'hero_insufficient_coins' ? 409 : 400,
    };
  }

  if (result.status === 'already-owned') {
    return {
      ok: true,
      status: 'already-owned',
      httpStatus: 200,
      response: buildAlreadyOwnedResponse(learnerId, monsterId, heroState.heroPool),
    };
  }

  // status === 'invited'
  return {
    ok: true,
    status: 'invited',
    httpStatus: 200,
    intent: result.intent,
    response: buildInviteResponse(result, learnerId, monsterId, branch),
  };
}

// ── evolve-monster ──────────────────────────────────────────────────

function resolveEvolveMonster(body, heroState, learnerId, nowTs) {
  const { monsterId, targetStage } = body;

  if (!monsterId || !isValidHeroMonsterId(monsterId)) {
    return { ok: false, code: 'hero_monster_unknown', httpStatus: 400 };
  }

  const result = computeMonsterGrowIntent({
    economyState: heroState.economy,
    heroPoolState: heroState.heroPool,
    monsterId,
    targetStage,
    learnerId,
    rosterVersion: HERO_POOL_ROSTER_VERSION,
    nowTs,
  });

  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      httpStatus: result.code === 'hero_insufficient_coins' ? 409 : 400,
    };
  }

  if (result.status === 'already-stage') {
    return {
      ok: true,
      status: 'already-stage',
      httpStatus: 200,
      response: buildAlreadyStageResponse(learnerId, monsterId, heroState.heroPool),
    };
  }

  // status === 'grown'
  return {
    ok: true,
    status: 'grown',
    httpStatus: 200,
    intent: result.intent,
    response: buildGrowResponse(result, learnerId, monsterId),
  };
}

// ── Response builders ───────────────────────────────────────────────

function buildInviteResponse(result, learnerId, monsterId, branch) {
  return {
    ok: true,
    heroCampAction: {
      version: 1,
      status: 'invited',
      learnerId,
      monsterId,
      branch,
      stageAfter: 0,
      cost: result.intent.ledgerEntry.amount * -1,
      coinsUsed: result.intent.ledgerEntry.amount * -1,
      coinBalance: result.intent.newBalance,
      ledgerEntryId: result.intent.ledgerEntry.entryId,
    },
  };
}

function buildAlreadyOwnedResponse(learnerId, monsterId, heroPoolState) {
  const monster = heroPoolState.monsters[monsterId];
  return {
    ok: true,
    heroCampAction: {
      version: 1,
      status: 'already-owned',
      learnerId,
      monsterId,
      branch: monster?.branch || null,
      stageAfter: monster?.stage ?? 0,
      cost: 0,
      coinsUsed: 0,
      coinBalance: null,
      ledgerEntryId: null,
    },
  };
}

function buildGrowResponse(result, learnerId, monsterId) {
  return {
    ok: true,
    heroCampAction: {
      version: 1,
      status: 'grown',
      learnerId,
      monsterId,
      branch: result.intent.newMonsterState.branch || null,
      stageBefore: result.intent.ledgerEntry.stageBefore,
      stageAfter: result.intent.ledgerEntry.stageAfter,
      cost: result.intent.ledgerEntry.amount * -1,
      coinsUsed: result.intent.ledgerEntry.amount * -1,
      coinBalance: result.intent.newBalance,
      ledgerEntryId: result.intent.ledgerEntry.entryId,
    },
  };
}

function buildAlreadyStageResponse(learnerId, monsterId, heroPoolState) {
  const monster = heroPoolState.monsters[monsterId];
  return {
    ok: true,
    heroCampAction: {
      version: 1,
      status: 'already-stage',
      learnerId,
      monsterId,
      branch: monster?.branch || null,
      stageAfter: monster?.stage ?? 0,
      cost: 0,
      coinsUsed: 0,
      coinBalance: null,
      ledgerEntryId: null,
    },
  };
}
