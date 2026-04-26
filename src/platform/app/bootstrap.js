import { createApiPlatformRepositories } from '../core/repositories/api.js';
import { normalisePlatformRole } from '../access/roles.js';
import { normaliseSubjectExposureGates } from '../core/subject-availability.js';

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
  };
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
    const error = locationSearchParams(location).get('auth_error') || '';
    // SH2-U3: read `code` from the 401 body once and thread it through
    // `onAuthRequired` so AuthSurface can branch on `demo_session_expired`
    // vs the generic `unauthenticated` path. Body has already been parsed
    // above into `sessionPayload` so this is a single JSON read — no
    // double-parse risk noted in the plan's risk register.
    const code = typeof sessionPayload?.code === 'string' ? sessionPayload.code : '';
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

  const session = createRemoteSyncSession(sessionPayload);
  const repositories = createApiPlatformRepositories({
    baseUrl: '',
    fetch: credentialFetch,
    cacheScopeKey: `account:${session.accountId}`,
    publicReadModels: true,
  });

  return {
    repositories,
    session,
  };
}
