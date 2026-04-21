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

  return {
    async readParentHub(learnerId = null) {
      const url = buildRequestUrl(baseUrl, '/api/hubs/parent', { learnerId });
      return fetchHubJson(fetch, url, { method: 'GET' }, authSession);
    },
    async readAdminHub({ learnerId = null, requestId = null, auditLimit = 20 } = {}) {
      const url = buildRequestUrl(baseUrl, '/api/hubs/admin', {
        learnerId,
        requestId,
        auditLimit,
      });
      return fetchHubJson(fetch, url, { method: 'GET' }, authSession);
    },
  };
}
