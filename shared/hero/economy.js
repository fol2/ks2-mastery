// ── Hero Economy — shared pure contract ──────────────────────────
// Zero side-effects. No imports from worker/, src/, react, or node: built-ins.

// ── Constants ────────────────────────────────────────────────────

export const HERO_ECONOMY_VERSION = 1;
export const HERO_DAILY_COMPLETION_COINS = 100;
export const HERO_DAILY_BONUS_COINS_CAP = 0; // P4: no bonus economy yet
export const HERO_LEDGER_RECENT_LIMIT = 180;

export const HERO_ECONOMY_ENTRY_TYPES = Object.freeze([
  'daily-completion-award',
  'admin-adjustment', // reserved, not enabled in P4 child flow
]);

// ── Deterministic hashing ────────────────────────────────────────

function djb2Hash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

// ── Key derivation ───────────────────────────────────────────────

export function deriveDailyAwardKey({ learnerId, dateKey, questId, questFingerprint, economyVersion }) {
  const v = economyVersion ?? HERO_ECONOMY_VERSION;
  return `hero-daily-coins:v${v}:${learnerId}:${dateKey}:${questId}:${questFingerprint}`;
}

export function deriveLedgerEntryId(awardKey) {
  return `hero-ledger-${djb2Hash(awardKey)}`;
}

// ── State helpers ────────────────────────────────────────────────

export function emptyEconomyState() {
  return {
    version: HERO_ECONOMY_VERSION,
    balance: 0,
    lifetimeEarned: 0,
    lifetimeSpent: 0,
    ledger: [],
    lastUpdatedAt: null,
  };
}

// ── Award logic ─────────────────────────────────────────────────

export function canAwardDailyCompletionCoins(heroState, economyEnabled) {
  if (economyEnabled !== true) {
    return { canAward: false, reason: 'economy_disabled' };
  }
  if (heroState.daily === null || heroState.daily === undefined) {
    return { canAward: false, reason: 'daily_null' };
  }
  if (heroState.daily.status !== 'completed') {
    return { canAward: false, reason: 'daily_not_completed' };
  }
  if (heroState.daily.economy && heroState.daily.economy.dailyAwardLedgerEntryId) {
    return { canAward: false, reason: 'already_awarded' };
  }
  // Check ledger for duplicate idempotency key
  const { dateKey, questId, questFingerprint } = heroState.daily;
  if (heroState.economy && Array.isArray(heroState.economy.ledger) && heroState.economy.ledger.length > 0) {
    const awardKey = deriveDailyAwardKey({ learnerId: heroState.economy.ledger[0].learnerId || '', dateKey, questId, questFingerprint, economyVersion: HERO_ECONOMY_VERSION });
    const existing = heroState.economy.ledger.find(e => e.idempotencyKey === awardKey);
    if (existing) {
      return { canAward: false, reason: 'ledger_duplicate' };
    }
  }
  return { canAward: true, reason: 'eligible' };
}

export function applyDailyCompletionCoinAward(heroState, { learnerId, nowTs, dailyCompletionCoins }) {
  const { dateKey, questId, questFingerprint } = heroState.daily;
  const awardKey = deriveDailyAwardKey({ learnerId, dateKey, questId, questFingerprint, economyVersion: HERO_ECONOMY_VERSION });
  const entryId = deriveLedgerEntryId(awardKey);

  // Idempotency check — if ledger already contains this key, return early
  const existingEntry = heroState.economy.ledger.find(e => e.idempotencyKey === awardKey);
  if (existingEntry) {
    return { state: heroState, awarded: false, alreadyAwarded: true, amount: 0, ledgerEntryId: existingEntry.entryId };
  }

  const balanceAfter = heroState.economy.balance + dailyCompletionCoins;

  const ledgerEntry = {
    entryId,
    idempotencyKey: awardKey,
    type: 'daily-completion-award',
    amount: dailyCompletionCoins,
    balanceAfter,
    learnerId,
    dateKey,
    questId,
    questFingerprint,
    source: {
      kind: 'hero-daily-completion',
      dailyCompletedAt: heroState.daily.completedAt,
      completedTaskIds: heroState.daily.completedTaskIds || [],
      effortCompleted: heroState.daily.effortCompleted || 0,
      effortPlanned: heroState.daily.effortPlanned || 0,
    },
    createdAt: nowTs,
    createdBy: 'system',
  };

  const updatedLedger = [...heroState.economy.ledger, ledgerEntry].slice(-HERO_LEDGER_RECENT_LIMIT);

  const updatedState = {
    ...heroState,
    economy: {
      ...heroState.economy,
      balance: balanceAfter,
      lifetimeEarned: heroState.economy.lifetimeEarned + dailyCompletionCoins,
      ledger: updatedLedger,
      lastUpdatedAt: nowTs,
    },
    daily: {
      ...heroState.daily,
      economy: {
        dailyAwardStatus: 'awarded',
        dailyAwardCoinsAvailable: dailyCompletionCoins,
        dailyAwardCoinsAwarded: dailyCompletionCoins,
        dailyAwardLedgerEntryId: entryId,
        dailyAwardedAt: nowTs,
        dailyAwardReason: 'daily-completion',
      },
    },
  };

  return { state: updatedState, awarded: true, alreadyAwarded: false, amount: dailyCompletionCoins, ledgerEntryId: entryId, balanceAfter };
}

// ── State helpers ────────────────────────────────────────────────

// ── Child-safe read model projection ───────────────────────────

export function selectChildSafeEconomyReadModel(heroState, dateKey, questId) {
  const economy = heroState?.economy;
  if (!economy) return null;
  const daily = heroState?.daily;
  const todayMatch = daily?.dateKey === dateKey;

  let awardStatus = 'not-eligible';
  if (todayMatch) {
    if (daily.economy?.dailyAwardStatus === 'awarded') awardStatus = 'awarded';
    else if (daily.status === 'completed') awardStatus = 'available';
    else awardStatus = 'in-progress';
  }

  const safeNum = (v) => (typeof v === 'number' && Number.isFinite(v)) ? v : 0;

  return {
    enabled: true,
    version: HERO_ECONOMY_VERSION,
    balance: safeNum(economy.balance),
    lifetimeEarned: safeNum(economy.lifetimeEarned),
    lifetimeSpent: safeNum(economy.lifetimeSpent),
    today: {
      dateKey,
      questId,
      awardStatus,
      coinsAvailable: HERO_DAILY_COMPLETION_COINS,
      coinsAwarded: todayMatch ? safeNum(daily.economy?.dailyAwardCoinsAwarded) : 0,
      ledgerEntryId: todayMatch ? (daily.economy?.dailyAwardLedgerEntryId || null) : null,
      awardedAt: todayMatch ? (daily.economy?.dailyAwardedAt || null) : null,
    },
    recentLedger: buildChildSafeLedgerEntries(economy.ledger),
  };
}

function buildChildSafeLedgerEntries(ledger) {
  if (!Array.isArray(ledger)) return [];
  return ledger.slice(-10).map(entry => ({
    entryId: entry.entryId,
    type: entry.type,
    amount: entry.amount,
    dateKey: entry.dateKey,
    createdAt: entry.createdAt,
  }));
}

// ── State helpers ────────────────────────────────────────────────

export function normaliseHeroEconomyState(raw) {
  if (!raw || typeof raw !== 'object') return emptyEconomyState();
  if (raw.version !== HERO_ECONOMY_VERSION) return emptyEconomyState();

  const balance = typeof raw.balance === 'number' && Number.isFinite(raw.balance) ? raw.balance : 0;
  const lifetimeEarned = typeof raw.lifetimeEarned === 'number' && Number.isFinite(raw.lifetimeEarned) ? raw.lifetimeEarned : 0;
  const lifetimeSpent = typeof raw.lifetimeSpent === 'number' && Number.isFinite(raw.lifetimeSpent) ? raw.lifetimeSpent : 0;
  const ledger = Array.isArray(raw.ledger) ? raw.ledger : [];
  const lastUpdatedAt = raw.lastUpdatedAt || null;

  return {
    version: HERO_ECONOMY_VERSION,
    balance,
    lifetimeEarned,
    lifetimeSpent,
    ledger,
    lastUpdatedAt,
  };
}
