// U7 (Admin Console P3): Account search and detail support cockpit.
//
// Content-free leaf: this module MUST NOT import subject content
// datasets, subject engines, or any module that transitively pulls in
// spelling / grammar / punctuation content bundles. The audit gate in
// `scripts/audit-client-bundle.mjs` enforces this invariant.
//
// Pure normalisers for the search results and account detail payloads
// returned by the worker endpoints. No side effects, no storage, no
// fetch. The AdminAccountsSection.jsx surface consumes these helpers
// to render search results and the detail panel.

/**
 * Normalise a single search result row from the worker payload.
 *
 * @param {object} row — raw result from /api/admin/accounts/search
 * @returns {object}   — rendering-ready row
 */
export function normaliseSearchResult(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: typeof row.id === 'string' ? row.id : '',
    email: typeof row.email === 'string' ? row.email : null,
    displayName: typeof row.displayName === 'string' ? row.displayName : null,
    platformRole: typeof row.platformRole === 'string' ? row.platformRole : 'parent',
    opsStatus: typeof row.opsStatus === 'string' ? row.opsStatus : 'active',
    planLabel: typeof row.planLabel === 'string' ? row.planLabel : null,
    learnerCount: Number(row.learnerCount) || 0,
    createdAt: Number(row.createdAt) || 0,
    updatedAt: Number(row.updatedAt) || 0,
  };
}

/**
 * Normalise the full search response payload.
 *
 * @param {object} payload — raw JSON from /api/admin/accounts/search
 * @returns {object}       — { results, truncated, error }
 */
export function normaliseSearchPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { results: [], truncated: false, error: null };
  }
  return {
    results: Array.isArray(payload.results)
      ? payload.results.map(normaliseSearchResult).filter(Boolean)
      : [],
    truncated: Boolean(payload.truncated),
    error: typeof payload.error === 'string' ? payload.error : null,
  };
}

/**
 * Normalise the account detail response payload.
 *
 * @param {object} payload — raw JSON from /api/admin/accounts/:id/detail
 * @returns {object}       — rendering-ready detail object
 */
export function normaliseAccountDetail(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const account = payload.account && typeof payload.account === 'object'
    ? payload.account
    : {};
  return {
    account: {
      id: typeof account.id === 'string' ? account.id : '',
      email: typeof account.email === 'string' ? account.email : null,
      displayName: typeof account.displayName === 'string' ? account.displayName : null,
      platformRole: typeof account.platformRole === 'string' ? account.platformRole : 'parent',
      accountType: typeof account.accountType === 'string' ? account.accountType : 'real',
      repoRevision: Number(account.repoRevision) || 0,
      createdAt: Number(account.createdAt) || 0,
      updatedAt: Number(account.updatedAt) || 0,
    },
    learners: Array.isArray(payload.learners) ? payload.learners : [],
    recentErrors: Array.isArray(payload.recentErrors) ? payload.recentErrors : [],
    recentDenials: Array.isArray(payload.recentDenials) ? payload.recentDenials : [],
    recentMutations: Array.isArray(payload.recentMutations) ? payload.recentMutations : [],
    opsMetadata: payload.opsMetadata && typeof payload.opsMetadata === 'object'
      ? payload.opsMetadata
      : null,
  };
}

/**
 * Build a debug bundle deep-link URL for a given account.
 *
 * @param {string} accountId
 * @returns {string}
 */
export function debugBundleLinkForAccount(accountId) {
  if (typeof accountId !== 'string' || !accountId) return '#';
  return `/admin#debug-bundle?accountId=${encodeURIComponent(accountId)}`;
}
