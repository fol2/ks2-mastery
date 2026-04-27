import { parseAdminSectionFromHash } from './admin-hash.js';

/**
 * Bounded sessionStorage helper for preserving the admin URL across
 * a sign-in redirect. The stash expires after 5 minutes and only
 * accepts `/admin` as the pathname (no open-redirect vector).
 *
 * Key: `ks2_admin_return`
 * Shape: JSON `{ pathname: string, hash: string, ts: number }`
 */

const STASH_KEY = 'ks2_admin_return';
const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Write the current admin location into sessionStorage.
 * Only stashes if pathname is exactly `/admin` (case-insensitive,
 * trailing-slash tolerant).
 *
 * @param {{ pathname?: string, hash?: string }} loc
 * @param {Storage} [storage] - defaults to `sessionStorage`
 */
export function stashAdminReturn(loc, storage) {
  const ss = storage || _safeSessionStorage();
  if (!ss) return;

  const rawPath = (loc?.pathname || '').replace(/\/+$/, '').toLowerCase();
  if (rawPath !== '/admin') return;

  const hash = typeof loc?.hash === 'string' ? loc.hash : '';

  try {
    ss.setItem(STASH_KEY, JSON.stringify({
      pathname: '/admin',
      hash,
      ts: Date.now(),
    }));
  } catch { /* quota / SecurityError — silently ignore */ }
}

/**
 * Read and consume the stashed admin return target.
 * Returns a validated redirect URL string or `null`.
 *
 * - Expired stashes (>5 min) are discarded.
 * - Hashes with an invalid section are stripped (redirect to `/admin`).
 * - Non-`/admin` pathnames are rejected entirely.
 *
 * The stash is always cleared on read (consume-once).
 *
 * @param {Storage} [storage] - defaults to `sessionStorage`
 * @returns {string | null} e.g. `/admin#section=debug` or `/admin` or null
 */
export function popAdminReturn(storage) {
  const ss = storage || _safeSessionStorage();
  if (!ss) return null;

  let raw;
  try {
    raw = ss.getItem(STASH_KEY);
    ss.removeItem(STASH_KEY);
  } catch { return null; }

  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch { return null; }

  if (!parsed || typeof parsed !== 'object') return null;

  // Expiry check
  const age = Date.now() - (typeof parsed.ts === 'number' ? parsed.ts : 0);
  if (age > MAX_AGE_MS || age < 0) return null;

  // Pathname must be exactly `/admin`
  const storedPath = (typeof parsed.pathname === 'string' ? parsed.pathname : '')
    .replace(/\/+$/, '').toLowerCase();
  if (storedPath !== '/admin') return null;

  // Validate hash — if present, must parse to a known section; otherwise strip it
  const hash = typeof parsed.hash === 'string' ? parsed.hash : '';
  if (hash) {
    const section = parseAdminSectionFromHash(hash);
    // section is null when no `section=` key present, or a valid section name,
    // or 'overview' for unrecognised values. All are safe to redirect to.
    if (section === null) {
      // Hash present but no parseable section — redirect to bare /admin
      return '/admin';
    }
    return `/admin#section=${section}`;
  }

  return '/admin';
}

/**
 * Clear the stash without reading it.
 * Used when demo sessions start (they must not restore admin return).
 *
 * @param {Storage} [storage]
 */
export function clearAdminReturn(storage) {
  const ss = storage || _safeSessionStorage();
  if (!ss) return;
  try { ss.removeItem(STASH_KEY); } catch { /* ignore */ }
}

/** @returns {Storage | null} */
function _safeSessionStorage() {
  try {
    return typeof globalThis !== 'undefined' && globalThis.sessionStorage
      ? globalThis.sessionStorage
      : null;
  } catch { return null; }
}

// Exported for tests
export { STASH_KEY, MAX_AGE_MS };
