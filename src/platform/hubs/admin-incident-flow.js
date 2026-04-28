// P5 U6: Incident flow stash — save account context before navigating to
// debug bundle, enabling a "Return to account" button in the bundle panel.
//
// Follows the same consume-once sessionStorage pattern established in
// `src/platform/core/admin-return-stash.js`. The stash expires after 5 minutes
// and is always cleared on read (single-use).
//
// Content-free leaf: no subject content imports.

const INCIDENT_STASH_KEY = 'ks2_admin_incident_stash';
const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Save incident context before navigating away from account detail.
 *
 * @param {{ returnSection?: string, returnAccountId?: string, returnScrollY?: number }} stash
 * @param {Storage} [storage] — defaults to sessionStorage
 */
export function saveIncidentStash(stash, storage) {
  const ss = storage || _safeSessionStorage();
  if (!ss) return;
  if (!stash || typeof stash !== 'object') return;

  const payload = {
    returnSection: typeof stash.returnSection === 'string' ? stash.returnSection : 'accounts',
    returnAccountId: typeof stash.returnAccountId === 'string' ? stash.returnAccountId : '',
    returnScrollY: typeof stash.returnScrollY === 'number' ? stash.returnScrollY : 0,
    ts: Date.now(),
  };

  try {
    ss.setItem(INCIDENT_STASH_KEY, JSON.stringify(payload));
  } catch { /* quota / SecurityError — silently ignore */ }
}

/**
 * Read and consume the incident stash. Returns the stash object or null if
 * absent, expired, or malformed. The stash is always cleared on read.
 *
 * @param {Storage} [storage] — defaults to sessionStorage
 * @returns {{ returnSection: string, returnAccountId: string, returnScrollY: number } | null}
 */
export function consumeIncidentStash(storage) {
  const ss = storage || _safeSessionStorage();
  if (!ss) return null;

  let raw;
  try {
    raw = ss.getItem(INCIDENT_STASH_KEY);
    ss.removeItem(INCIDENT_STASH_KEY);
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

  return {
    returnSection: typeof parsed.returnSection === 'string' ? parsed.returnSection : 'accounts',
    returnAccountId: typeof parsed.returnAccountId === 'string' ? parsed.returnAccountId : '',
    returnScrollY: typeof parsed.returnScrollY === 'number' ? parsed.returnScrollY : 0,
  };
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
export { INCIDENT_STASH_KEY, MAX_AGE_MS };
