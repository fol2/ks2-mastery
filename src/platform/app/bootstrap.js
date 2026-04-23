import {
  ensureLocalCodexReviewProfile,
  LOCAL_CODEX_REVIEW_LEARNER_ID,
  LOCAL_CODEX_REVIEW_LEARNER_IDS,
  LOCAL_CODEX_STAGE_REVIEW_LEARNER_IDS,
} from '../core/local-review-profile.js';
import {
  createApiPlatformRepositories,
  createLocalPlatformRepositories,
} from '../core/repositories/index.js';
import { normalisePlatformRole } from '../access/roles.js';

function locationSearchParams(location) {
  return new URLSearchParams(location?.search || '');
}

export function isLocalMode({ location = globalThis.location } = {}) {
  const params = locationSearchParams(location);
  return location?.protocol === 'file:' || params.get('local') === '1';
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
  if (!isLocalMode({ location })) return '';
  const params = locationSearchParams(location);
  const learnerId = String(params.get('learner') || '').trim();
  if (LOCAL_CODEX_REVIEW_LEARNER_IDS.includes(learnerId)) return learnerId;
  return reviewLearnerIdFromMode(params.get('codexReview'));
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
  return { signedIn: false, mode: 'local-only', platformRole: 'parent' };
}

export function createAuthRequiredSession({ error = '' } = {}) {
  return {
    signedIn: false,
    mode: 'auth-required',
    platformRole: 'parent',
    authRequired: true,
    error,
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
  };
}

export async function createRepositoriesForBrowserRuntime({
  location = globalThis.location,
  storage = globalThis.localStorage,
  credentialFetch = createCredentialFetch(),
  onAuthRequired = () => {},
  waitForAuthRequired = true,
} = {}) {
  if (isLocalMode({ location })) {
    const localRepositories = createLocalPlatformRepositories({ storage });
    ensureLocalCodexReviewProfile(localRepositories, {
      selectLearnerId: localCodexReviewLearnerIdFromUrl({ location }),
    });
    return {
      repositories: localRepositories,
      session: createLocalOnlySession(),
    };
  }

  const sessionResponse = await credentialFetch('/api/auth/session', {
    headers: { accept: 'application/json' },
  });
  const sessionPayload = await sessionResponse.json().catch(() => null);

  if (!sessionResponse.ok || !sessionPayload?.session?.accountId) {
    const error = locationSearchParams(location).get('auth_error') || '';
    await onAuthRequired({
      error,
      response: sessionResponse,
      payload: sessionPayload,
    });
    if (waitForAuthRequired) {
      await new Promise(() => {});
    }
    return {
      repositories: null,
      session: createAuthRequiredSession({ error }),
    };
  }

  const session = createRemoteSyncSession(sessionPayload);
  const repositories = createApiPlatformRepositories({
    baseUrl: '',
    fetch: credentialFetch,
    cacheScopeKey: `account:${session.accountId}`,
  });

  return {
    repositories,
    session,
  };
}
