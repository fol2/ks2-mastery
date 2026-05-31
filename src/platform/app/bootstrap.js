import { createApiPlatformRepositories } from '../core/repositories/api.js';
import { normaliseRepositoryBundle } from '../core/repositories/helpers.js';
import { normalisePlatformRole } from '../access/roles.js';
import { normaliseSubjectExposureGates } from '../core/subject-availability.js';

const API_CACHE_STORAGE_PREFIX = 'ks2-platform-v2.api-cache-state:account:';
const AUTH_SESSION_CACHE_KEY = 'ks2-platform-v2.auth-session-cache';
const LOCAL_CODEX_REVIEW_LEARNER_ID = 'local-codex-egg-review';
const LOCAL_CODEX_STAGE_REVIEW_LEARNER_IDS = Object.freeze({
  1: 'local-codex-stage-1-review',
  2: 'local-codex-stage-2-review',
  3: 'local-codex-stage-3-review',
  4: 'local-codex-stage-4-review',
});
const LOCAL_CODEX_REVIEW_LEARNER_IDS = Object.freeze([
  LOCAL_CODEX_REVIEW_LEARNER_ID,
  ...Object.values(LOCAL_CODEX_STAGE_REVIEW_LEARNER_IDS),
]);

function locationSearchParams(location) {
  return new URLSearchParams(location?.search || '');
}

export function isLocalMode({ location = globalThis.location } = {}) {
  void location;
  return false;
}

export function reviewLearnerIdFromMode(value) {
  const mode = String(value || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
  if (!mode) return '';
  if (LOCAL_CODEX_REVIEW_LEARNER_IDS.includes(mode)) return mode;
  if (['egg', 'eggs', 'all-egg', 'all-eggs', 'codex-eggs'].includes(mode)) {
    return LOCAL_CODEX_REVIEW_LEARNER_ID;
  }
  const stageMatch = mode.match(/^(?:all-)?stage-?([1-4])$/) || mode.match(/^([1-4])$/);
  return stageMatch ? LOCAL_CODEX_STAGE_REVIEW_LEARNER_IDS[stageMatch[1]] : '';
}

export function localCodexReviewLearnerIdFromUrl({ location = globalThis.location } = {}) {
  void location;
  return '';
}

export function shouldOpenLocalCodexReview(options = {}) {
  return Boolean(localCodexReviewLearnerIdFromUrl(options));
}

export function createCredentialFetch(fetchFn = (input, init) => globalThis.fetch(input, init)) {
  return function credentialFetch(input, init = {}) {
    return fetchFn(input, {
      ...init,
      credentials: 'same-origin',
    });
  };
}

export function canUseCachedRepositoryStartup(repositories) {
  return Boolean(
    repositories?.kind === 'api'
    && typeof repositories.hasCachedRemoteState === 'function'
    && repositories.hasCachedRemoteState(),
  );
}

export async function refreshCachedRepositoryStartup({
  repositories,
  store,
  log = globalThis.console,
} = {}) {
  if (!repositories || typeof repositories.hydrate !== 'function') return false;
  try {
    await repositories.hydrate({ cacheScope: 'startup-cache-refresh' });
    store?.reloadFromRepositories?.({ preserveRoute: true });
    return true;
  } catch (error) {
    log?.warn?.('Remote bootstrap refresh failed after cached startup.', error);
    return false;
  }
}

export function createLocalOnlySession() {
  return createAuthRequiredSession({ error: 'auth-required' });
}

export function createAuthRequiredSession({ error = '', code = '' } = {}) {
  return {
    signedIn: false,
    mode: 'auth-required',
    platformRole: 'parent',
    authRequired: true,
    error,
    code,
  };
}

function normaliseHeroModeSessionFlags(rawValue = {}) {
  const raw = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
    ? rawValue
    : {};
  return {
    shadowEnabled: raw.shadowEnabled === true,
  };
}

export function createRemoteSyncSession(sessionPayload = {}) {
  const accountId = sessionPayload?.session?.accountId || 'unknown';
  return {
    signedIn: true,
    mode: sessionPayload?.session?.demo ? 'demo-sync' : 'remote-sync',
    accountId,
    email: sessionPayload?.session?.email || '',
    provider: sessionPayload?.session?.provider || 'session',
    demo: Boolean(sessionPayload?.session?.demo),
    accountType: sessionPayload?.session?.accountType || 'real',
    demoExpiresAt: sessionPayload?.session?.demoExpiresAt || null,
    platformRole: normalisePlatformRole(
      sessionPayload?.account?.platformRole || sessionPayload?.session?.platformRole,
    ),
    repoRevision: Number(sessionPayload?.account?.repoRevision) || 0,
    subjectExposureGates: normaliseSubjectExposureGates(sessionPayload?.subjectExposureGates),
    heroMode: normaliseHeroModeSessionFlags(sessionPayload?.heroMode),
  };
}

function safeStorageGet(storage, key) {
  try {
    return storage?.getItem?.(key) || null;
  } catch {
    return null;
  }
}

function safeStorageSet(storage, key, value) {
  try {
    storage?.setItem?.(key, value);
  } catch {
    // Best-effort metadata only; the repository cache remains authoritative.
  }
}

function safeStorageKey(storage, index) {
  try {
    return storage?.key?.(index) || null;
  } catch {
    return null;
  }
}

function safeStorageLength(storage) {
  try {
    const length = Number(storage?.length);
    return Number.isFinite(length) && length > 0 ? Math.floor(length) : 0;
  } catch {
    return 0;
  }
}

function safeJsonObject(rawValue) {
  if (!rawValue || typeof rawValue !== 'string') return null;
  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function plainObjectOrEmpty(rawValue) {
  return rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : {};
}

function apiCacheStorageKey(accountId) {
  return `${API_CACHE_STORAGE_PREFIX}${accountId}`;
}

function accountIdFromApiCacheKey(key) {
  return typeof key === 'string' && key.startsWith(API_CACHE_STORAGE_PREFIX)
    ? key.slice(API_CACHE_STORAGE_PREFIX.length)
    : '';
}

function cachedPayloadBundle(payload) {
  return normaliseRepositoryBundle(payload?.bundle || payload);
}

function cachedPayloadFreshness(payload) {
  return cachedPayloadBundle(payload).meta.migratedAt;
}

function cachedPayloadHasFallback(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const bundle = cachedPayloadBundle(payload);
  const pendingOperations = Array.isArray(payload.pendingOperations) ? payload.pendingOperations : [];
  return Boolean(
    bundle.learners.allIds.length
    || Object.keys(bundle.subjectStates).length
    || bundle.practiceSessions.length
    || Object.keys(bundle.gameState).length
    || bundle.eventLog.length
    || pendingOperations.length,
  );
}

function cachedSessionPayload(rawSession, fallbackAccountId = '') {
  const raw = plainObjectOrEmpty(rawSession);
  const rawSessionValue = plainObjectOrEmpty(raw.session);
  const rawAccount = plainObjectOrEmpty(raw.account);
  const accountId = typeof rawSessionValue.accountId === 'string' && rawSessionValue.accountId
    ? rawSessionValue.accountId
    : fallbackAccountId;
  if (!accountId) return null;

  const demo = rawSessionValue.demo === true || rawSessionValue.accountType === 'demo' || accountId.startsWith('demo-');
  const platformRole = rawAccount.platformRole || rawSessionValue.platformRole || 'parent';
  return {
    session: {
      accountId,
      provider: rawSessionValue.provider || 'cached',
      demo,
      accountType: rawSessionValue.accountType || (demo ? 'demo' : 'real'),
      demoExpiresAt: rawSessionValue.demoExpiresAt || null,
      platformRole,
    },
    account: {
      platformRole,
      repoRevision: Number(rawAccount.repoRevision) || 0,
    },
    subjectExposureGates: plainObjectOrEmpty(raw.subjectExposureGates),
    heroMode: plainObjectOrEmpty(raw.heroMode),
  };
}

function writeCachedAuthSession(storage, sessionPayload) {
  const accountId = sessionPayload?.session?.accountId;
  if (!(typeof accountId === 'string' && accountId)) return;

  const platformRole = sessionPayload?.account?.platformRole || sessionPayload?.session?.platformRole || 'parent';
  const payload = {
    session: {
      accountId,
      provider: sessionPayload?.session?.provider || 'session',
      demo: sessionPayload?.session?.demo === true,
      accountType: sessionPayload?.session?.accountType || (sessionPayload?.session?.demo ? 'demo' : 'real'),
      demoExpiresAt: sessionPayload?.session?.demoExpiresAt || null,
      platformRole,
    },
    account: {
      platformRole,
      repoRevision: Number(sessionPayload?.account?.repoRevision) || 0,
    },
    subjectExposureGates: plainObjectOrEmpty(sessionPayload?.subjectExposureGates),
    heroMode: plainObjectOrEmpty(sessionPayload?.heroMode),
    cachedAt: Date.now(),
  };
  safeStorageSet(storage, AUTH_SESSION_CACHE_KEY, JSON.stringify(payload));
}

function cachedApiPayloadForAccount(storage, accountId) {
  if (!(typeof accountId === 'string' && accountId)) return null;
  return safeJsonObject(safeStorageGet(storage, apiCacheStorageKey(accountId)));
}

function cachedAuthSessionCandidate(storage) {
  const cachedSession = safeJsonObject(safeStorageGet(storage, AUTH_SESSION_CACHE_KEY));
  const sessionPayload = cachedSessionPayload(cachedSession);
  const accountId = sessionPayload?.session?.accountId || '';
  const cachedApiPayload = cachedApiPayloadForAccount(storage, accountId);
  if (!cachedPayloadHasFallback(cachedApiPayload)) return null;
  return {
    accountId,
    sessionPayload,
    priority: 1,
    freshness: Math.max(
      cachedPayloadFreshness(cachedApiPayload),
      Number(cachedSession?.cachedAt) || 0,
    ),
  };
}

function findCachedSessionFallback(storage) {
  const candidates = [];
  const cachedAuthCandidate = cachedAuthSessionCandidate(storage);
  if (cachedAuthCandidate) candidates.push(cachedAuthCandidate);

  const length = safeStorageLength(storage);
  for (let index = 0; index < length; index += 1) {
    const key = safeStorageKey(storage, index);
    const accountId = accountIdFromApiCacheKey(key);
    if (!accountId) continue;

    const payload = safeJsonObject(safeStorageGet(storage, key));
    if (!cachedPayloadHasFallback(payload)) continue;
    candidates.push({
      accountId,
      sessionPayload: cachedSessionPayload(null, accountId),
      priority: 0,
      freshness: cachedPayloadFreshness(payload),
    });
  }

  candidates.sort((left, right) => (right.priority - left.priority) || (right.freshness - left.freshness));
  return candidates[0]?.sessionPayload || null;
}

function isExplicitAuthFailure(sessionResponse, sessionPayload) {
  const status = Number(sessionResponse?.status);
  if (status === 401 || status === 403) return true;
  const code = typeof sessionPayload?.code === 'string' ? sessionPayload.code : '';
  return ['unauthenticated', 'forbidden', 'demo_session_expired'].includes(code);
}

function isTransientSessionFailure(sessionResponse, sessionPayload) {
  if (isExplicitAuthFailure(sessionResponse, sessionPayload)) return false;
  if (sessionResponse?.error) return true;

  const status = Number(sessionResponse?.status);
  if (Number.isFinite(status)) return status === 0 || status === 429 || (status >= 500 && status < 600);
  return Boolean(sessionResponse && sessionResponse.ok === false);
}

export async function createRepositoriesForBrowserRuntime({
  location = globalThis.location,
  storage = globalThis.localStorage,
  credentialFetch = createCredentialFetch(),
  onAuthRequired = () => {},
  waitForAuthRequired = true,
} = {}) {
  let sessionResponse = null;
  let sessionPayload = null;
  try {
    sessionResponse = await credentialFetch('/api/auth/session', {
      headers: { accept: 'application/json' },
    });
    sessionPayload = await sessionResponse.json().catch(() => null);
  } catch (error) {
    sessionResponse = { ok: false, error };
  }

  if (!sessionResponse.ok || !sessionPayload?.session?.accountId) {
    if (isTransientSessionFailure(sessionResponse, sessionPayload)) {
      const cachedSession = findCachedSessionFallback(storage);
      if (cachedSession?.session?.accountId) {
        const session = createRemoteSyncSession(cachedSession);
        const repositories = createApiPlatformRepositories({
          baseUrl: '',
          fetch: credentialFetch,
          storage,
          cacheScopeKey: `account:${session.accountId}`,
          publicReadModels: true,
        });
        return {
          repositories,
          session,
        };
      }
    }

    const error = locationSearchParams(location).get('auth_error') || '';
    // SH2-U3: read `code` from the 401 body once and thread it through
    // `onAuthRequired` so AuthSurface can branch on `demo_session_expired`
    // vs the generic `unauthenticated` path. Body has already been parsed
    // above into `sessionPayload` so this is a single JSON read — no
    // double-parse risk noted in the plan's risk register.
    let code = typeof sessionPayload?.code === 'string' ? sessionPayload.code : '';
    // SH2-U3 review blocker-3: when the session endpoint returns 500 (or
    // a transport error leaves `sessionResponse.ok` false without a parsed
    // body), synthesise an `internal_error` code so the AuthSurface can
    // render the human transient-error banner. We do NOT leak the raw
    // status integer into the UI — the banner copy avoids "500" entirely.
    if (!code) {
      const status = Number(sessionResponse?.status);
      if (Number.isFinite(status) && status >= 500 && status < 600) {
        code = 'internal_error';
      } else if (sessionResponse && sessionResponse.ok === false && !Number.isFinite(status)) {
        // Transport failure (e.g. `fetch` rejected): treat as transient.
        code = 'internal_error';
      }
    }
    await onAuthRequired({
      code,
      error,
      response: sessionResponse,
      payload: sessionPayload,
    });
    if (waitForAuthRequired) {
      await new Promise(() => {});
    }
    return {
      repositories: null,
      session: createAuthRequiredSession({ error, code }),
    };
  }

  writeCachedAuthSession(storage, sessionPayload);
  const session = createRemoteSyncSession(sessionPayload);
  const repositories = createApiPlatformRepositories({
    baseUrl: '',
    fetch: credentialFetch,
    storage,
    cacheScopeKey: `account:${session.accountId}`,
    publicReadModels: true,
  });

  return {
    repositories,
    session,
  };
}
