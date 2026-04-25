import {
  applyRepositoryAuthSession,
  createNoopRepositoryAuthSession,
} from '../core/repositories/auth-session.js';

function joinUrl(baseUrl, path) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  const suffix = String(path || '').startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

function buildRequestUrl(baseUrl, path, params = {}) {
  const target = joinUrl(baseUrl, path);
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') {
      searchParams.set(key, String(value));
    }
  }

  if (String(baseUrl || '').trim()) {
    const url = new URL(target);
    for (const [key, value] of searchParams.entries()) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  const query = searchParams.toString();
  return query ? `${target}?${query}` : target;
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => null);
  }
  return response.text().catch(() => '');
}

async function fetchHubJson(fetchFn, url, init, authSession) {
  const requestInit = await applyRepositoryAuthSession(authSession, init);
  const response = await fetchFn(url, requestInit);
  const payload = await parseResponse(response);
  if (!response.ok) {
    const message = payload?.message || `Hub request failed (${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    error.code = payload?.code || null;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export function createHubApi({
  baseUrl,
  fetch = globalThis.fetch?.bind(globalThis),
  authSession = createNoopRepositoryAuthSession(),
} = {}) {
  if (typeof fetch !== 'function') {
    throw new TypeError('Hub API requires a fetch implementation.');
  }

  async function readParentRecentSessions({ learnerId = null, limit = 6, cursor = null } = {}) {
    const url = buildRequestUrl(baseUrl, '/api/hubs/parent/recent-sessions', {
      learnerId,
      limit,
      cursor,
    });
    return fetchHubJson(fetch, url, { method: 'GET' }, authSession);
  }

  async function readParentActivity({ learnerId = null, limit = 20, cursor = null } = {}) {
    const url = buildRequestUrl(baseUrl, '/api/hubs/parent/activity', {
      learnerId,
      limit,
      cursor,
    });
    return fetchHubJson(fetch, url, { method: 'GET' }, authSession);
  }

  return {
    async readParentHub(learnerId = null) {
      const url = buildRequestUrl(baseUrl, '/api/hubs/parent', { learnerId });
      const payload = await fetchHubJson(fetch, url, { method: 'GET' }, authSession);
      const resolvedLearnerId = payload?.learnerId || learnerId || payload?.parentHub?.selectedLearnerId || '';
      try {
        const history = await readParentRecentSessions({
          learnerId: resolvedLearnerId,
          limit: 6,
        });
        if (Array.isArray(history?.recentSessions) && payload?.parentHub) {
          return {
            ...payload,
            parentHub: {
              ...payload.parentHub,
              recentSessions: history.recentSessions,
            },
            parentHistory: {
              recentSessions: {
                status: 'loaded',
                page: history.page || null,
              },
            },
          };
        }
      } catch (error) {
        return {
          ...payload,
          parentHistory: {
            recentSessions: {
              status: 'error',
              error: error?.message || 'Recent sessions could not be loaded.',
            },
          },
        };
      }
      return payload;
    },
    readParentRecentSessions,
    readParentActivity,
    async readAdminHub({ learnerId = null, requestId = null, auditLimit = 20 } = {}) {
      const url = buildRequestUrl(baseUrl, '/api/hubs/admin', {
        learnerId,
        requestId,
        auditLimit,
      });
      return fetchHubJson(fetch, url, { method: 'GET' }, authSession);
    },
    async saveMonsterVisualConfigDraft({ draft, mutation } = {}) {
      const url = buildRequestUrl(baseUrl, '/api/admin/monster-visual-config/draft');
      return fetchHubJson(fetch, url, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ draft, mutation }),
      }, authSession);
    },
    async publishMonsterVisualConfig({ mutation } = {}) {
      const url = buildRequestUrl(baseUrl, '/api/admin/monster-visual-config/publish');
      return fetchHubJson(fetch, url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mutation }),
      }, authSession);
    },
    async restoreMonsterVisualConfigVersion({ version, mutation } = {}) {
      const url = buildRequestUrl(baseUrl, '/api/admin/monster-visual-config/restore');
      return fetchHubJson(fetch, url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version, mutation }),
      }, authSession);
    },
  };
}
