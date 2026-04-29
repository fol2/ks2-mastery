'use strict';

// ── Hero Camp — pure command resolver (P5) ─────────────────────────
// Returns mutation intent or typed error. No database access, no React.
// Imports ONLY from shared/hero/ siblings.

import { computeMonsterInviteIntent, computeMonsterGrowIntent } from '../../../shared/hero/monster-economy.js';
import { isValidHeroMonsterId, isValidHeroMonsterBranch } from '../../../shared/hero/hero-pool.js';

// ── Forbidden fields — client must NEVER send these ────────────────

export const FORBIDDEN_CAMP_FIELDS = Object.freeze([
  'cost', 'amount', 'balance', 'ledgerEntryId', 'stage', 'owned',
  'payload', 'subjectId', 'shop', 'reward', 'coins', 'economy',
  'entryId', 'ledger',
]);

// ── Supported commands ─────────────────────────────────────────────

const CAMP_COMMANDS = new Set(['unlock-monster', 'evolve-monster']);

// ── Main resolver ──────────────────────────────────────────────────

/**
 * Pure camp command resolver — receives pre-loaded state, returns intent.
 * Does NOT perform DB reads or writes.
 */
export function resolveHeroCampCommand({ command, body, heroState, learnerId, rosterVersion, nowTs }) {
  // 1. Validate command
  if (!CAMP_COMMANDS.has(command)) {
    return { ok: false, code: 'hero_camp_disabled', httpStatus: 400, reason: `Unknown camp command: ${command}` };
  }

  // 2. Check for forbidden client fields
  const rejectedFields = FORBIDDEN_CAMP_FIELDS.filter(f => body[f] !== undefined);
  if (rejectedFields.length > 0) {
    return {
      ok: false,
      code: 'hero_client_field_rejected',
      httpStatus: 400,
      reason: `Client must not send: ${rejectedFields.join(', ')}`,
    };
  }

  // 3. Dispatch to command handler
  if (command === 'unlock-monster') {
    return resolveUnlockMonster(body, heroState, learnerId, rosterVersion, nowTs);
  }
  return resolveEvolveMonster(body, heroState, learnerId, rosterVersion, nowTs);
}

// ── unlock-monster ─────────────────────────────────────────────────

function resolveUnlockMonster(body, heroState, learnerId, rosterVersion, nowTs) {
  const { monsterId, branch } = body;

  const result = computeMonsterInviteIntent({
    economyState: heroState.economy,
    heroPoolState: heroState.heroPool,
    monsterId,
    branch,
    learnerId,
    rosterVersion,
    nowTs,
  });

  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      httpStatus: result.code === 'hero_insufficient_coins' ? 409 : 400,
      reason: result.reason,
    };
  }

  if (result.status === 'already-owned') {
    return {
      ok: true,
      heroCampAction: {
        version: 1,
        status: 'already-owned',
        learnerId,
        monsterId,
        branch: heroState.heroPool.monsters[monsterId]?.branch || null,
        cost: 0,
        coinsUsed: 0,
        coinBalance: null,
        ledgerEntryId: null,
      },
    };
  }

  // status === 'invited'
  const intent = result.intent;
  return {
    ok: true,
    intent,
    heroCampAction: {
      version: 1,
      status: 'invited',
      learnerId,
      monsterId,
      branch,
      cost: intent.ledgerEntry.amount * -1,
      coinsUsed: intent.ledgerEntry.amount * -1,
      coinBalance: intent.newBalance,
      ledgerEntryId: intent.ledgerEntry.entryId,
    },
  };
}

// ── evolve-monster ─────────────────────────────────────────────────

function resolveEvolveMonster(body, heroState, learnerId, rosterVersion, nowTs) {
  const { monsterId, targetStage } = body;

  const result = computeMonsterGrowIntent({
    economyState: heroState.economy,
    heroPoolState: heroState.heroPool,
    monsterId,
    targetStage,
    learnerId,
    rosterVersion,
    nowTs,
  });

  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      httpStatus: result.code === 'hero_insufficient_coins' ? 409 : 400,
      reason: result.reason,
    };
  }

  if (result.status === 'already-stage') {
    return {
      ok: true,
      heroCampAction: {
        version: 1,
        status: 'already-stage',
        learnerId,
        monsterId,
        stageBefore: heroState.heroPool.monsters[monsterId]?.stage ?? 0,
        stageAfter: heroState.heroPool.monsters[monsterId]?.stage ?? 0,
        cost: 0,
        coinsUsed: 0,
        coinBalance: null,
        ledgerEntryId: null,
      },
    };
  }

  // status === 'grown'
  const intent = result.intent;
  return {
    ok: true,
    intent,
    heroCampAction: {
      version: 1,
      status: 'grown',
      learnerId,
      monsterId,
      stageBefore: intent.ledgerEntry.stageBefore,
      stageAfter: intent.ledgerEntry.stageAfter,
      cost: intent.ledgerEntry.amount * -1,
      coinsUsed: intent.ledgerEntry.amount * -1,
      coinBalance: intent.newBalance,
      ledgerEntryId: intent.ledgerEntry.entryId,
    },
  };
}
