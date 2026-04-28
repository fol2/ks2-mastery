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
