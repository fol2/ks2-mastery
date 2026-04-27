import { VALID_ADMIN_SECTIONS } from './store.js';

/**
 * Parse the admin section from a URL hash fragment.
 *
 * Expects a `section=<value>` key-value pair inside the hash.
 * Returns the validated section name, 'overview' for unknown values,
 * or null when no section key is present.
 *
 * @param {string | null | undefined} hash - e.g. '#section=debug'
 * @returns {string | null}
 */
export function parseAdminSectionFromHash(hash) {
  if (!hash || typeof hash !== 'string') return null;
  const raw = hash.replace(/^#/, '');
  if (!raw) return null;
  // Parse `section=debug` format
  const match = raw.match(/(?:^|&)section=([^&]*)/);
  if (!match) return null;
  const value = decodeURIComponent(match[1]).toLowerCase();
  if (!value) return null;
  return VALID_ADMIN_SECTIONS.has(value) ? value : 'overview';
}
