// U6 (P4): Admin Marketing API client — fetch wrappers for the 5 marketing
// routes wired in admin-marketing.js.
//
// Lazy-loaded on tab activation. Uses same-origin headers + auth session
// cookie, matching fetchActiveMessages() pattern in api.js.
//
// All mutations forward expectedRowVersion for CAS conflict detection.
// Lifecycle transitions are distinguished from field updates by the
// presence of `action` in the request body (server-side routing decision).

import {
  applyRepositoryAuthSession,
  createNoopRepositoryAuthSession,
} from '../core/repositories/auth-session.js';

// ---------------------------------------------------------------------------
// Helpers (mirrored from api.js)
// ---------------------------------------------------------------------------

function joinUrl(baseUrl, path) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  const suffix = String(path || '').startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => null);
  }
  return response.text().catch(() => '');
}

async function fetchJson(fetchFn, url, init, authSession) {
  const requestInit = await applyRepositoryAuthSession(authSession, init);
  const response = await fetchFn(url, requestInit);
  const payload = await parseResponse(response);
  if (!response.ok) {
    const message = payload?.message || `Marketing API request failed (${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    error.code = payload?.code || null;
    error.payload = payload;
    throw error;
  }
  return payload;
}

// ---------------------------------------------------------------------------
// U9: Lifecycle analytics model
// ---------------------------------------------------------------------------

/**
 * Compute active message count and lifecycle display data from a messages array.
 *
 * Active = status 'published' AND audience includes 'all_signed_in'.
 * Lifecycle timestamps are surfaced per-message where available.
 * Analytics counters are honestly labelled as not yet tracked.
 *
 * @param {Array} messages — normalised marketing message objects
 * @returns {{ activeCount: number, lifecycleDisplayData: Array, analyticsCounters: Object }}
 */
export function buildMarketingLifecycleModel(messages) {
  const list = Array.isArray(messages) ? messages : [];

  const activeCount = list.filter(
    (m) => m.status === 'published' && m.audience === 'all_signed_in',
  ).length;

  const lifecycleDisplayData = list.map((m) => ({
    id: m.id,
    title: m.title,
    status: m.status,
    publishedAt: m.published_at || null,
    pausedAt: m.paused_at || null,
    archivedAt: m.archived_at || null,
    createdAt: m.created_at || null,
  }));

  // Honest labelling: these counters are not yet instrumented.
  const analyticsCounters = {
    impressions: { tracked: false, label: 'Not tracked yet' },
    dismissals: { tracked: false, label: 'Not tracked yet' },
    activeWindowHits: { tracked: false, label: 'Not tracked yet' },
    fetchFailures: { tracked: false, label: 'Not tracked yet' },
  };

  return { activeCount, lifecycleDisplayData, analyticsCounters };
}

/**
 * Format an epoch-ms timestamp for display in lifecycle views.
 * Returns a human-readable date-time string or null if no timestamp.
 */
export function formatLifecycleTimestamp(epochMs) {
  if (epochMs == null || !Number.isFinite(Number(epochMs))) return null;
  const d = new Date(Number(epochMs));
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

export function createAdminMarketingApi({
  baseUrl = '',
  fetch: fetchImpl = globalThis.fetch?.bind(globalThis),
  authSession = createNoopRepositoryAuthSession(),
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('Admin Marketing API requires a fetch implementation.');
  }

  function buildUrl(path) {
    return joinUrl(baseUrl, path);
  }

  return {
    /** List all marketing messages (admin sees all; ops sees published + scheduled). */
    async fetchMarketingMessages() {
      const url = buildUrl('/api/admin/marketing/messages');
      return fetchJson(fetchImpl, url, { method: 'GET' }, authSession);
    },

    /** Create a new marketing message (admin only, returns status=draft). */
    async createMarketingMessage(data) {
      const url = buildUrl('/api/admin/marketing/messages');
      return fetchJson(fetchImpl, url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      }, authSession);
    },

    /** Fetch a single marketing message by ID. */
    async fetchMarketingMessage(id) {
      const url = buildUrl(`/api/admin/marketing/messages/${encodeURIComponent(id)}`);
      return fetchJson(fetchImpl, url, { method: 'GET' }, authSession);
    },

    /**
     * Update fields on a draft marketing message (no `action` in body).
     * CAS: `data.expectedRowVersion` is required.
     */
    async updateMarketingMessage(id, data) {
      const url = buildUrl(`/api/admin/marketing/messages/${encodeURIComponent(id)}`);
      return fetchJson(fetchImpl, url, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      }, authSession);
    },

    /**
     * Lifecycle transition (has `action` in body).
     * CAS: `data.expectedRowVersion` is required.
     * Mutation envelope: `data.mutation` must contain `{ requestId }`.
     */
    async transitionMarketingMessage(id, data) {
      const url = buildUrl(`/api/admin/marketing/messages/${encodeURIComponent(id)}`);
      return fetchJson(fetchImpl, url, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      }, authSession);
    },
  };
}
