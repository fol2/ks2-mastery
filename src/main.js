import {
  createCredentialFetch,
  createRepositoriesForBrowserRuntime,
  shouldOpenLocalCodexReview,
} from './platform/app/bootstrap.js';
import { createAppController } from './platform/app/create-app-controller.js';
import { SUBJECTS, getSubject } from './platform/core/subject-registry.js';
import { renderApp } from './platform/ui/render.js';
import { probeRelLuminance } from './platform/ui/luminance.js';
import { safeParseInt, uid } from './platform/core/utils.js';
import { shouldDispatchClickAction } from './platform/core/dom-actions.js';
import { normalisePlatformRole } from './platform/access/roles.js';
import { buildAdminHubReadModel } from './platform/hubs/admin-read-model.js';
import { createHubApi } from './platform/hubs/api.js';
import { buildParentHubReadModel } from './platform/hubs/parent-read-model.js';
import {
  buildAdminHubAccessContext,
  buildParentHubAccessContext,
  readOnlyLearnerActionBlockReason,
} from './platform/hubs/shell-access.js';
import { createSubjectRuntimeBoundary } from './platform/core/subject-runtime.js';
import { createPracticeStreakSubscriber } from './platform/events/index.js';
import { createPlatformTts } from './subjects/spelling/tts.js';
import { createSpellingService } from './subjects/spelling/service.js';
import { createSpellingPersistence } from './subjects/spelling/repository.js';
import {
  createApiSpellingContentRepository,
  createLocalSpellingContentRepository,
} from './subjects/spelling/content/repository.js';
import { createSpellingContentService } from './subjects/spelling/content/service.js';
import { createSpellingRewardSubscriber } from './subjects/spelling/event-hooks.js';
import { resolveSpellingShortcut } from './subjects/spelling/shortcuts.js';
import {
  monsterSummary,
  monsterSummaryFromSpellingAnalytics,
} from './platform/game/monster-system.js';
import {
  exportLearnerSnapshot,
  exportPlatformSnapshot,
  importPlatformSnapshot,
  LEGACY_SPELLING_EXPORT_KIND,
  PLATFORM_EXPORT_KIND_LEARNER,
} from './platform/core/data-transfer.js';

const root = document.getElementById('app');
const credentialFetch = createCredentialFetch();

/* --------------------------------------------------------------
   Word-detail modal accessibility: focus trap + restore-on-close.
   The word-detail modal renders via innerHTML replacement on every
   store tick, so trigger elements go stale between renders. We key
   the restore target by slug and re-query after close. `lastModalTrigger`
   also keeps a direct element reference as a first-choice fallback
   for restore in cases where the list wasn't re-rendered.
   -------------------------------------------------------------- */
const WORD_DETAIL_MODAL_SELECTOR = '.wb-modal-scrim';
const WORD_DETAIL_FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let lastModalTrigger = { slug: '', element: null };
let previousModalVisible = false;

function modalIsOpen() {
  return Boolean(root?.querySelector(WORD_DETAIL_MODAL_SELECTOR));
}

function getModalFocusables() {
  const modal = root?.querySelector('.wb-modal');
  if (!modal) return [];
  return Array.from(modal.querySelectorAll(WORD_DETAIL_FOCUSABLE_SELECTOR))
    .filter((el) => el.offsetParent !== null || el === document.activeElement);
}

function restoreModalTrigger() {
  const { slug, element } = lastModalTrigger;
  lastModalTrigger = { slug: '', element: null };
  if (!slug) return;
  queueMicrotask(() => {
    if (element && element.isConnected && typeof element.focus === 'function') {
      element.focus();
      return;
    }
    if (!root) return;
    const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(slug) : slug.replace(/"/g, '\\"');
    const row = root.querySelector(`.wb-word-pill[data-slug="${escaped}"]`)
      || root.querySelector(`.wb-row[data-slug="${escaped}"]`)
      || root.querySelector(`[data-action="spelling-word-detail-open"][data-slug="${escaped}"]`);
    if (row && typeof row.focus === 'function') row.focus();
  });
}

function focusInitialModalElement() {
  /* In drill mode the existing `[data-autofocus="true"]` handler grabs
     the input — we defer to that. Otherwise we seed focus on the first
     focusable control inside the modal so keyboard users aren't left
     stranded on <body>. */
  if (root?.querySelector('.wb-modal [data-autofocus="true"]:not([disabled])')) return;
  const focusables = getModalFocusables();
  if (focusables.length) focusables[0].focus();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderAuthScreen({ mode = 'login', error = '' } = {}) {
  const isRegister = mode === 'register';
  root.innerHTML = `
    <main class="auth-shell">
      <section class="auth-panel card">
        <div class="eyebrow">KS2 Mastery</div>
        <h1 class="title">${isRegister ? 'Create your parent account' : 'Sign in to continue'}</h1>
        <p class="subtitle">Your learner profiles and spelling progress sync through the KS2 Mastery cloud backend.</p>
        ${error ? `<div class="feedback bad" style="margin-top:16px;">${escapeHtml(error)}</div>` : ''}
        <form class="auth-form" data-auth-action="${isRegister ? 'register' : 'login'}">
          <label class="field">
            <span>Email</span>
            <input class="input" type="email" name="email" autocomplete="email" required />
          </label>
          <label class="field">
            <span>Password</span>
            <input class="input" type="password" name="password" autocomplete="${isRegister ? 'new-password' : 'current-password'}" minlength="8" required />
          </label>
          <button class="btn primary lg" style="background:#3E6FA8;" type="submit">${isRegister ? 'Create account' : 'Sign in'}</button>
        </form>
        <div class="auth-switch">
          <button class="btn ghost" data-auth-mode="${isRegister ? 'login' : 'register'}">${isRegister ? 'Use an existing account' : 'Create a new account'}</button>
        </div>
        <div class="auth-divider"><span>Social sign-in</span></div>
        <div class="auth-social">
          ${['google', 'facebook', 'x', 'apple'].map((provider) => `
            <button class="btn secondary" data-auth-provider="${provider}">${provider === 'x' ? 'X' : provider[0].toUpperCase() + provider.slice(1)}</button>
          `).join('')}
        </div>
      </section>
    </main>
  `;
}

async function submitAuthForm(form) {
  const action = form.dataset.authAction === 'register' ? 'register' : 'login';
  const formData = new FormData(form);
  const response = await credentialFetch(`/api/auth/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: formData.get('email'),
      password: formData.get('password'),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    renderAuthScreen({ mode: action, error: payload.message || 'Sign-in failed.' });
    return;
  }
  globalThis.location.href = '/';
}

async function startSocialAuth(provider) {
  const response = await credentialFetch(`/api/auth/${provider}/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.redirectUrl) {
    renderAuthScreen({ error: payload.message || 'That sign-in provider is not configured yet.' });
    return;
  }
  globalThis.location.href = payload.redirectUrl;
}

let authScreenBound = false;

function bindAuthScreen() {
  if (authScreenBound) return;
  authScreenBound = true;
  root.addEventListener('click', (event) => {
    const modeButton = event.target.closest('[data-auth-mode]');
    if (modeButton) {
      event.preventDefault();
      renderAuthScreen({ mode: modeButton.dataset.authMode });
      bindAuthScreen();
      return;
    }

    const providerButton = event.target.closest('[data-auth-provider]');
    if (providerButton) {
      event.preventDefault();
      startSocialAuth(providerButton.dataset.authProvider).catch((error) => {
        renderAuthScreen({ error: error?.message || 'Could not start social sign-in.' });
      });
    }
  });

  root.addEventListener('submit', (event) => {
    const form = event.target.closest('form[data-auth-action]');
    if (!form) return;
    event.preventDefault();
    submitAuthForm(form).catch((error) => {
      renderAuthScreen({ mode: form.dataset.authAction, error: error?.message || 'Sign-in failed.' });
    });
  });
}

async function createRepositoriesForCurrentRuntime() {
  return createRepositoriesForBrowserRuntime({
    location: globalThis.location,
    storage: globalThis.localStorage,
    credentialFetch,
    onAuthRequired({ error }) {
      renderAuthScreen({ error });
      bindAuthScreen();
    },
  });
}

const boot = await createRepositoriesForCurrentRuntime();
const repositories = boot.repositories;
globalThis.KS2_AUTH_SESSION = boot.session;
await repositories.hydrate();

const tts = createPlatformTts({ fetchFn: credentialFetch });

/* Audio replay glow state — maintained outside the store because it is a
   transient DOM affordance, not persisted learner state. The render wipes
   innerHTML on every store update, so we re-apply the `playing` class
   both inside render() and inside the tts listener to cover both paths
   (learner clicks mid-render vs audio ending between renders). */
let currentPlayingKind = null;

const NORMAL_REPLAY_SELECTORS = [
  '[data-action="spelling-replay"]',
  '[data-action="spelling-word-bank-drill-replay"]',
  '.wb-modal-speaker',
];
const SLOW_REPLAY_SELECTORS = [
  '[data-action="spelling-replay-slow"]',
  '[data-action="spelling-word-bank-drill-replay-slow"]',
];

function syncAudioPlayingClass() {
  const normalNodes = root.querySelectorAll(NORMAL_REPLAY_SELECTORS.join(','));
  const slowNodes = root.querySelectorAll(SLOW_REPLAY_SELECTORS.join(','));
  const normalOn = currentPlayingKind === 'normal';
  const slowOn = currentPlayingKind === 'slow';
  for (const node of normalNodes) node.classList.toggle('playing', normalOn);
  for (const node of slowNodes) node.classList.toggle('playing', slowOn);
}

tts.subscribe((event) => {
  if (event?.type === 'start') {
    currentPlayingKind = event.kind === 'slow' ? 'slow' : 'normal';
  } else if (event?.type === 'end') {
    currentPlayingKind = null;
  }
  syncAudioPlayingClass();
});

const spellingContentRepository = boot.session.signedIn
  ? createApiSpellingContentRepository({ baseUrl: '', fetch: credentialFetch })
  : createLocalSpellingContentRepository({ storage: globalThis.localStorage });
const spellingContent = createSpellingContentService({ repository: spellingContentRepository });
await spellingContent.hydrate();
const services = {
  spelling: null,
};
let shellPlatformRole = normalisePlatformRole(boot.session.platformRole || 'parent');
let adminAccountDirectory = {
  status: 'idle',
  accounts: [],
  currentAccount: null,
  error: '',
  savingAccountId: '',
};
const hubApi = boot.session.signedIn
  ? createHubApi({ baseUrl: '', fetch: credentialFetch })
  : null;

function createHubLoadState() {
  return {
    status: 'idle',
    learnerId: '',
    payload: null,
    error: '',
    requestToken: 0,
  };
}

let adultSurfaceState = {
  selectedLearnerId: '',
  notice: '',
  parentHub: createHubLoadState(),
  adminHub: createHubLoadState(),
};

function patchAdultSurfaceState(updater, { rerender = true } = {}) {
  adultSurfaceState = typeof updater === 'function'
    ? updater(adultSurfaceState)
    : { ...adultSurfaceState, ...(updater || {}) };
  if (rerender) store.patch(() => ({}));
  return adultSurfaceState;
}

function patchAdultHubEntry(entryKey, patch, { rerender = true } = {}) {
  return patchAdultSurfaceState((current) => ({
    ...current,
    [entryKey]: {
      ...current[entryKey],
      ...(patch || {}),
    },
  }), { rerender });
}

function setAdultSurfaceNotice(message, { rerender = true } = {}) {
  patchAdultSurfaceState({ notice: message || '' }, { rerender });
}

function clearAdultSurfaceNotice({ rerender = false } = {}) {
  if (!adultSurfaceState.notice) return;
  patchAdultSurfaceState({ notice: '' }, { rerender });
}

function invalidateAdultHubState(entryKey = null, { rerender = false } = {}) {
  if (!entryKey) {
    patchAdultSurfaceState((current) => ({
      ...current,
      parentHub: createHubLoadState(),
      adminHub: createHubLoadState(),
    }), { rerender });
    return;
  }
  patchAdultHubEntry(entryKey, createHubLoadState(), { rerender });
}

function preferredAdultLearnerId(explicitLearnerId = null) {
  const explicit = typeof explicitLearnerId === 'string' && explicitLearnerId ? explicitLearnerId : '';
  if (explicit) return explicit;
  if (adultSurfaceState.selectedLearnerId) return adultSurfaceState.selectedLearnerId;
  const appState = store.getState();
  return appState.learners.selectedId || null;
}

function resolveAdultPayloadLearnerId(entryKey, payload) {
  if (entryKey === 'parentHub') {
    return payload?.learnerId || payload?.parentHub?.selectedLearnerId || payload?.parentHub?.learner?.id || '';
  }
  return payload?.adminHub?.learnerSupport?.selectedLearnerId || payload?.adminHub?.account?.selectedLearnerId || '';
}

function syncWritableLearnerSelection(learnerId) {
  if (!learnerId) return false;
  const appState = store.getState();
  if (!appState.learners.byId[learnerId]) return false;
  if (appState.learners.selectedId === learnerId) return false;
  tts.stop();
  runtimeBoundary.clearAll();
  store.selectLearner(learnerId);
  return true;
}

function resolveActiveAdultAccessContext(appState) {
  if (!boot.session.signedIn) return null;
  if (appState.route.screen === 'parent-hub') {
    return buildParentHubAccessContext(adultSurfaceState.parentHub.payload, appState.learners.selectedId);
  }
  if (appState.route.screen === 'admin-hub') {
    return buildAdminHubAccessContext(adultSurfaceState.adminHub.payload, appState.learners.selectedId);
  }
  return null;
}

function blockedReadOnlyAdultActionReason(action) {
  return readOnlyLearnerActionBlockReason(action, resolveActiveAdultAccessContext(store.getState()));
}

function blockReadOnlyAdultAction(action) {
  const reason = blockedReadOnlyAdultActionReason(action);
  if (!reason) return false;
  setAdultSurfaceNotice(reason);
  return true;
}

async function loadParentHub({ learnerId = null, force = false } = {}) {
  if (!hubApi) return null;
  const requestedLearnerId = preferredAdultLearnerId(learnerId);
  const cacheKey = requestedLearnerId || '';
  const current = adultSurfaceState.parentHub;
  if (!force && current.status === 'loading' && current.learnerId === cacheKey) return current.payload;
  if (!force && current.status === 'loaded' && current.payload && current.learnerId === cacheKey) return current.payload;
  if (!force && current.status === 'error' && current.learnerId === cacheKey) return null;

  const requestToken = (Number(current.requestToken) || 0) + 1;
  patchAdultSurfaceState((state) => ({
    ...state,
    notice: '',
    parentHub: {
      status: 'loading',
      learnerId: cacheKey,
      payload: null,
      error: '',
      requestToken,
    },
  }));

  try {
    const payload = await hubApi.readParentHub(requestedLearnerId);
    if (adultSurfaceState.parentHub.requestToken !== requestToken) return payload;
    const resolvedLearnerId = resolveAdultPayloadLearnerId('parentHub', payload) || cacheKey;
    adultSurfaceState = {
      ...adultSurfaceState,
      selectedLearnerId: resolvedLearnerId || adultSurfaceState.selectedLearnerId,
      notice: '',
      parentHub: {
        status: 'loaded',
        learnerId: resolvedLearnerId,
        payload,
        error: '',
        requestToken,
      },
    };
    const syncedWritableShell = syncWritableLearnerSelection(resolvedLearnerId);
    if (!syncedWritableShell) store.patch(() => ({}));
    return payload;
  } catch (error) {
    if (adultSurfaceState.parentHub.requestToken !== requestToken) return null;
    patchAdultSurfaceState((state) => ({
      ...state,
      parentHub: {
        status: 'error',
        learnerId: cacheKey,
        payload: null,
        error: error?.message || 'Could not load Parent Hub.',
        requestToken,
      },
    }));
    return null;
  }
}

async function loadAdminHub({ learnerId = null, force = false, auditLimit = 20 } = {}) {
  if (!hubApi) return null;
  const requestedLearnerId = preferredAdultLearnerId(learnerId);
  const cacheKey = requestedLearnerId || '';
  const current = adultSurfaceState.adminHub;
  if (!force && current.status === 'loading' && current.learnerId === cacheKey) return current.payload;
  if (!force && current.status === 'loaded' && current.payload && current.learnerId === cacheKey) return current.payload;
  if (!force && current.status === 'error' && current.learnerId === cacheKey) return null;

  const requestToken = (Number(current.requestToken) || 0) + 1;
  patchAdultSurfaceState((state) => ({
    ...state,
    notice: '',
    adminHub: {
      status: 'loading',
      learnerId: cacheKey,
      payload: null,
      error: '',
      requestToken,
    },
  }));

  try {
    const payload = await hubApi.readAdminHub({ learnerId: requestedLearnerId, auditLimit });
    if (adultSurfaceState.adminHub.requestToken !== requestToken) return payload;
    const resolvedLearnerId = resolveAdultPayloadLearnerId('adminHub', payload) || cacheKey;
    adultSurfaceState = {
      ...adultSurfaceState,
      selectedLearnerId: resolvedLearnerId || adultSurfaceState.selectedLearnerId,
      notice: '',
      adminHub: {
        status: 'loaded',
        learnerId: resolvedLearnerId,
        payload,
        error: '',
        requestToken,
      },
    };
    const syncedWritableShell = syncWritableLearnerSelection(resolvedLearnerId);
    if (!syncedWritableShell) store.patch(() => ({}));
    return payload;
  } catch (error) {
    if (adultSurfaceState.adminHub.requestToken !== requestToken) return null;
    patchAdultSurfaceState((state) => ({
      ...state,
      adminHub: {
        status: 'error',
        learnerId: cacheKey,
        payload: null,
        error: error?.message || 'Could not load Admin / Operations.',
        requestToken,
      },
    }));
    return null;
  }
}

function rebuildSpellingService() {
  services.spelling = createSpellingService({
    repository: createSpellingPersistence({ repositories }),
    tts,
    contentSnapshot: spellingContent.getRuntimeSnapshot(),
  });
  return services.spelling;
}

rebuildSpellingService();

function learnerReadBundle(learnerId) {
  return {
    subjectStates: repositories.subjectStates.readForLearner(learnerId),
    practiceSessions: repositories.practiceSessions.list(learnerId),
    gameState: repositories.gameState.readForLearner(learnerId),
    eventLog: repositories.eventLog.list(learnerId),
  };
}

function buildLocalHubModels(appState) {
  const runtimeSnapshot = spellingContent.getRuntimeSnapshot();
  const selectedLearnerId = appState.learners.selectedId;
  const selectedLearner = selectedLearnerId ? appState.learners.byId[selectedLearnerId] : null;
  const learnerBundles = Object.fromEntries(appState.learners.allIds.map((learnerId) => [
    learnerId,
    learnerReadBundle(learnerId),
  ]));

  const parentHub = selectedLearner
    ? buildParentHubReadModel({
      learner: selectedLearner,
      platformRole: shellPlatformRole,
      membershipRole: 'owner',
      subjectStates: learnerBundles[selectedLearnerId]?.subjectStates || {},
      practiceSessions: learnerBundles[selectedLearnerId]?.practiceSessions || [],
      eventLog: learnerBundles[selectedLearnerId]?.eventLog || [],
      gameState: learnerBundles[selectedLearnerId]?.gameState || {},
      runtimeSnapshots: { spelling: runtimeSnapshot },
      now: Date.now,
    })
    : null;

  const adminHub = buildAdminHubReadModel({
    account: {
      id: boot.session.accountId || 'local-browser',
      selectedLearnerId,
      repoRevision: Number(boot.session.repoRevision) || 0,
      platformRole: shellPlatformRole,
    },
    platformRole: shellPlatformRole,
    spellingContentBundle: spellingContent.readBundle(),
    memberships: appState.learners.allIds.map((learnerId, index) => ({
      learnerId,
      role: 'owner',
      sortIndex: index,
      stateRevision: 0,
      learner: appState.learners.byId[learnerId],
    })),
    learnerBundles,
    runtimeSnapshots: { spelling: runtimeSnapshot },
    auditEntries: [],
    auditAvailable: false,
    selectedLearnerId,
    now: Date.now,
  });

  return {
    shellAccess: {
      platformRole: shellPlatformRole,
      source: 'local-reference',
    },
    parentHub,
    parentHubState: { status: 'loaded', learnerId: selectedLearnerId || '', error: '', notice: '' },
    adminHub,
    adminHubState: { status: 'loaded', learnerId: selectedLearnerId || '', error: '', notice: '' },
    activeAdultLearnerContext: null,
    adultSurfaceNotice: '',
    adminAccountDirectory,
  };
}

function buildSignedInHubModels(appState) {
  const parentHubState = {
    status: adultSurfaceState.parentHub.status,
    learnerId: adultSurfaceState.parentHub.learnerId || '',
    error: adultSurfaceState.parentHub.error || '',
    notice: adultSurfaceState.notice || '',
  };
  const adminHubState = {
    status: adultSurfaceState.adminHub.status,
    learnerId: adultSurfaceState.adminHub.learnerId || '',
    error: adultSurfaceState.adminHub.error || '',
    notice: adultSurfaceState.notice || '',
  };

  return {
    shellAccess: {
      platformRole: shellPlatformRole,
      source: 'worker-session',
    },
    parentHub: adultSurfaceState.parentHub.payload?.parentHub || null,
    parentHubState,
    adminHub: adultSurfaceState.adminHub.payload?.adminHub || null,
    adminHubState,
    activeAdultLearnerContext: resolveActiveAdultAccessContext(appState),
    adultSurfaceNotice: adultSurfaceState.notice || '',
    adminAccountDirectory,
  };
}

function buildHubModels(appState) {
  return boot.session.signedIn ? buildSignedInHubModels(appState) : buildLocalHubModels(appState);
}

const runtimeBoundary = createSubjectRuntimeBoundary({
  onError(entry, error) {
    globalThis.console?.error?.(`Subject runtime containment hit ${entry.subjectId}:${entry.tab}:${entry.phase}.`, error);
  },
});

const controller = createAppController({
  repositories,
  subjects: SUBJECTS,
  session: boot.session,
  runtimeBoundary,
  tts,
  services,
  subscribers: [
    createPracticeStreakSubscriber(),
    createSpellingRewardSubscriber({ gameStateRepository: repositories.gameState }),
  ],
  onEventError(error) {
    globalThis.console?.error?.('Reward/event subscriber failed.', error);
  },
});
const store = controller.store;

function resetLearnerData(learnerId) {
  Object.values(services).forEach((service) => {
    service?.resetLearner?.(learnerId);
  });
  repositories.subjectStates.clearLearner(learnerId);
  repositories.practiceSessions.clearLearner(learnerId);
  repositories.gameState.clearLearner(learnerId);
  repositories.eventLog.clearLearner(learnerId);
}

function sanitiseFilenamePart(value, fallback = 'learner') {
  const clean = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean || fallback;
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function handleImportFileChange(input) {
  const file = input?.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const isNonReplacingImport = parsed?.kind === PLATFORM_EXPORT_KIND_LEARNER
      || parsed?.kind === LEGACY_SPELLING_EXPORT_KIND
      || Array.isArray(parsed?.profiles);
    if (!isNonReplacingImport) {
      const confirmed = globalThis.confirm('Importing full app data will replace the current browser dataset. Continue?');
      if (!confirmed) return;
    }
    const result = importPlatformSnapshot(repositories, parsed);
    runtimeBoundary.clearAll();
    store.reloadFromRepositories();
    tts.stop();
    if (result.kind === 'learner') {
      const message = result.renamed
        ? 'Learner imported as a copy because that learner id already existed.'
        : 'Learner imported successfully.';
      globalThis.alert(message);
    } else if (result.kind === 'legacy-spelling') {
      const count = Number(result.importedCount) || 0;
      globalThis.alert(`Imported ${count} legacy spelling learner profile${count === 1 ? '' : 's'} as new learner copies.`);
    } else {
      globalThis.alert('App data imported successfully.');
    }
  } catch (error) {
    globalThis.alert(`Import failed: ${error?.message || 'Unknown error.'}`);
  } finally {
    input.value = '';
  }
}

async function prepareForSpellingContentMutation() {
  await repositories.persistence.retry();
  await spellingContent.hydrate();
}

async function refreshAfterSpellingContentMutation() {
  tts.stop();
  await repositories.hydrate({
    cacheScope: 'spelling-content-mutation',
    rebasePending: true,
    rebasePayloads: true,
  });
  rebuildSpellingService();
  runtimeBoundary.clearAll();
  store.reloadFromRepositories({ preserveRoute: true });
}

async function handleSpellingContentMutation(operation, successMessage) {
  try {
    await prepareForSpellingContentMutation();
    await operation();
    await refreshAfterSpellingContentMutation();
    if (successMessage) globalThis.alert(successMessage);
  } catch (error) {
    const validationCount = Number(error?.validation?.errors?.length || error?.payload?.validation?.errors?.length) || 0;
    const suffix = validationCount ? ` (${validationCount} validation errors)` : '';
    globalThis.alert(`Spelling content update failed${suffix}: ${error?.message || 'Unknown error.'}`);
  }
}

async function handleSpellingContentImportFileChange(input) {
  const file = input?.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    await handleSpellingContentMutation(
      () => spellingContent.importPortable(parsed),
      'Spelling content imported successfully.',
    );
  } catch (error) {
    globalThis.alert(`Spelling content import failed: ${error?.message || 'Unknown error.'}`);
  } finally {
    input.value = '';
  }
}

function canLoadAdminAccounts() {
  return boot.session.signedIn && shellPlatformRole === 'admin';
}

function patchAdminAccountDirectory(nextState) {
  adminAccountDirectory = {
    ...adminAccountDirectory,
    ...nextState,
  };
  store.patch(() => ({}));
}

async function loadAdminAccounts({ force = false } = {}) {
  if (!canLoadAdminAccounts()) {
    patchAdminAccountDirectory({
      status: 'unavailable',
      accounts: [],
      currentAccount: null,
      error: 'Account role management requires an admin account.',
      savingAccountId: '',
    });
    return;
  }
  if (!force && ['loading', 'loaded', 'saving'].includes(adminAccountDirectory.status)) return;

  patchAdminAccountDirectory({
    status: 'loading',
    error: '',
    savingAccountId: '',
  });

  try {
    const response = await credentialFetch('/api/admin/accounts', {
      headers: { accept: 'application/json' },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) throw new Error(payload.message || 'Could not load account roles.');
    patchAdminAccountDirectory({
      status: 'loaded',
      accounts: Array.isArray(payload.accounts) ? payload.accounts : [],
      currentAccount: payload.currentAccount || null,
      error: '',
      savingAccountId: '',
    });
    invalidateAdultHubState(null, { rerender: false });
    const currentScreen = store.getState().route.screen;
    if (currentScreen === 'admin-hub') loadAdminHub({ force: true });
    if (currentScreen === 'parent-hub') loadParentHub({ force: true });
  } catch (error) {
    patchAdminAccountDirectory({
      status: 'error',
      error: error?.message || 'Could not load account roles.',
      savingAccountId: '',
    });
  }
}

async function updateAdminAccountRole(accountId, platformRole) {
  if (!canLoadAdminAccounts()) {
    patchAdminAccountDirectory({
      status: 'unavailable',
      error: 'Account role management requires an admin account.',
      savingAccountId: '',
    });
    return;
  }

  patchAdminAccountDirectory({
    status: 'saving',
    error: '',
    savingAccountId: accountId,
  });

  try {
    const response = await credentialFetch('/api/admin/accounts/role', {
      method: 'PUT',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        accountId,
        platformRole,
        requestId: uid('role-change'),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) throw new Error(payload.message || 'Could not update account role.');

    const currentRole = normalisePlatformRole(payload.currentAccount?.platformRole || shellPlatformRole);
    shellPlatformRole = currentRole;
    globalThis.KS2_AUTH_SESSION = {
      ...(globalThis.KS2_AUTH_SESSION || {}),
      platformRole: currentRole,
    };

    patchAdminAccountDirectory({
      status: 'loaded',
      accounts: Array.isArray(payload.accounts) ? payload.accounts : [],
      currentAccount: payload.currentAccount || null,
      error: '',
      savingAccountId: '',
    });
    invalidateAdultHubState(null, { rerender: false });
    const currentScreen = store.getState().route.screen;
    if (currentScreen === 'admin-hub') loadAdminHub({ force: true });
    if (currentScreen === 'parent-hub') loadParentHub({ force: true });
  } catch (error) {
    patchAdminAccountDirectory({
      status: 'error',
      error: error?.message || 'Could not update account role.',
      savingAccountId: '',
    });
  }
}

if (shouldOpenLocalCodexReview({ location: globalThis.location })) {
  store.openCodex();
}

function ensureSpellingAutoAdvanceFromCurrentState() {
  return controller.ensureSpellingAutoAdvanceFromCurrentState();
}

function applySubjectTransition(subjectId, transition) {
  return controller.applySubjectTransition(subjectId, transition);
}

function contextFor(subjectId = null) {
  const appState = store.getState();
  const resolvedSubject = subjectId ? getSubject(subjectId) : getSubject(appState.route.subjectId || 'spelling');
  return {
    appState,
    store,
    services,
    repositories,
    subject: resolvedSubject,
    service: services[resolvedSubject.id] || null,
    spellingContent,
    tts,
    applySubjectTransition,
    runtimeBoundary,
    ...buildHubModels(appState),
  };
}

function homePersistenceLabel(snapshot) {
  if (snapshot?.mode === 'remote-sync') return 'Remote sync';
  if (snapshot?.mode === 'degraded') return snapshot?.remoteAvailable ? 'Sync degraded' : 'Local storage degraded';
  return 'Local-only';
}

function homeSubjectContext(subject, context) {
  return { ...context, subject, service: context.services?.[subject.id] || null };
}

function buildHomeDashboardStats(appState, context) {
  const out = {};
  if (!appState.learners.selectedId) return out;
  for (const subject of SUBJECTS) {
    if (!subject.getDashboardStats) continue;
    try {
      out[subject.id] = subject.getDashboardStats(appState, homeSubjectContext(subject, context));
    } catch (error) {
      runtimeBoundary?.capture?.({
        learnerId: appState.learners.selectedId,
        subject,
        tab: 'dashboard',
        phase: 'dashboard-stats',
        methodName: 'getDashboardStats',
        error,
      });
      out[subject.id] = { pct: 0, due: '—', streak: '—', nextUp: 'Temporarily unavailable', unavailable: true };
    }
  }
  return out;
}

function buildHomeMonsterSummary(learnerId, context) {
  if (!learnerId) return [];
  const spelling = context.services?.spelling;
  if (spelling?.getAnalyticsSnapshot) {
    return monsterSummaryFromSpellingAnalytics(spelling.getAnalyticsSnapshot(learnerId), {
      learnerId,
      gameStateRepository: context.repositories?.gameState,
      persistBranches: false,
    });
  }
  return monsterSummary(learnerId, context.repositories?.gameState);
}

function buildHomeDueTotal(learnerId, context) {
  const spelling = context.services?.spelling;
  if (!learnerId || !spelling?.getStats || !spelling?.getPrefs) return 0;
  try {
    const prefs = spelling.getPrefs(learnerId);
    const stats = spelling.getStats(learnerId, prefs?.yearFilter || 'all');
    return Number(stats?.due) || 0;
  } catch {
    return 0;
  }
}

function buildSurfaceChromeModel(appState) {
  const learnerId = appState.learners.selectedId;
  const learner = learnerId ? appState.learners.byId[learnerId] : null;
  const learnerOptions = appState.learners.allIds
    .map((id) => appState.learners.byId[id])
    .filter(Boolean)
    .map((entry) => ({ id: entry.id, name: entry.name, yearGroup: entry.yearGroup }));
  const theme = document.documentElement.getAttribute('data-theme') || 'light';
  const persistenceSnapshot = appState.persistence || null;

  return {
    theme,
    learner: learner
      ? { id: learner.id, name: learner.name, yearGroup: learner.yearGroup }
      : null,
    learnerLabel: learner ? `${learner.name} · ${learner.yearGroup}` : 'No learner selected',
    learnerOptions,
    signedInAs: boot.session.signedIn ? (boot.session.email || '') : null,
    persistence: {
      mode: persistenceSnapshot?.mode || 'local-only',
      label: homePersistenceLabel(persistenceSnapshot),
      snapshot: persistenceSnapshot,
    },
  };
}

function buildHomeModel(appState, context) {
  const learnerId = appState.learners.selectedId;
  const canOpenParentHub = Boolean(context.parentHub?.permissions?.canViewParentHub) || !boot.session.signedIn;

  return {
    ...buildSurfaceChromeModel(appState),
    monsterSummary: buildHomeMonsterSummary(learnerId, context),
    subjects: SUBJECTS,
    dashboardStats: buildHomeDashboardStats(appState, context),
    dueTotal: buildHomeDueTotal(learnerId, context),
    roundNumber: 1,
    now: new Date(),
    permissions: { canOpenParentHub },
  };
}

function buildCodexModel(appState, context) {
  const learnerId = appState.learners.selectedId;

  return {
    ...buildSurfaceChromeModel(appState),
    monsterSummary: buildHomeMonsterSummary(learnerId, context),
    now: new Date(),
  };
}

function buildSurfaceActions() {
  return {
    toggleTheme: () => dispatchAction('toggle-theme'),
    selectLearner: (value) => dispatchAction('learner-select', { value }),
    navigateHome: () => dispatchAction('navigate-home'),
    openProfileSettings: () => dispatchAction('open-profile-settings'),
    openSubject: (subjectId) => dispatchAction('open-subject', { subjectId }),
    openCodex: () => dispatchAction('open-codex'),
    openParentHub: () => dispatchAction('open-parent-hub'),
    logout: () => dispatchAction('platform-logout'),
    retryPersistence: () => dispatchAction('persistence-retry'),
  };
}

function mountReactSurfaces(appState, context) {
  const homeSurface = globalThis.__ks2HomeSurface;
  const codexSurface = globalThis.__ks2CodexSurface;
  const subjectTopNavSurface = globalThis.__ks2SubjectTopNavSurface;
  const actions = buildSurfaceActions();

  if (appState.route.screen === 'dashboard') {
    const mount = root.querySelector('[data-home-mount="true"]');
    if (mount && homeSurface) {
      homeSurface.render(mount, {
        model: buildHomeModel(appState, context),
        actions,
      });
    }
  } else if (homeSurface) {
    homeSurface.unmount();
  }

  if (appState.route.screen === 'codex') {
    const mount = root.querySelector('[data-codex-mount="true"]');
    if (mount && codexSurface) {
      codexSurface.render(mount, {
        model: buildCodexModel(appState, context),
        actions,
      });
    }
  } else if (codexSurface) {
    codexSurface.unmount();
  }

  /* Subject route reuses the home TopNav verbatim — same UserPill dropdown,
     persistence dot, theme toggle. The subject route adds its own breadcrumb
     and tabs below, so we only mount the chrome strip here. */
  if (appState.route.screen === 'subject') {
    const mount = root.querySelector('[data-subject-topnav-mount="true"]');
    if (mount && subjectTopNavSurface) {
      const chrome = buildSurfaceChromeModel(appState);
      subjectTopNavSurface.render(mount, {
        theme: chrome.theme,
        onToggleTheme: actions.toggleTheme,
        learners: chrome.learnerOptions,
        selectedLearnerId: chrome.learner?.id || '',
        learnerLabel: chrome.learnerLabel,
        signedInAs: chrome.signedInAs,
        onSelectLearner: actions.selectLearner,
        onOpenProfileSettings: actions.openProfileSettings,
        onLogout: actions.logout,
        persistenceMode: chrome.persistence?.mode || 'local-only',
        persistenceLabel: chrome.persistence?.label || '',
      });
    }
  } else if (subjectTopNavSurface) {
    subjectTopNavSurface.unmount();
  }
}

/* Capture the identity + caret state of the currently-focused input
   inside `root` so we can restore it after `root.innerHTML = …` wipes
   the DOM. Our render path rebuilds the entire tree on every store
   update, which nukes focus and caret position on any text input that
   the user is currently typing into (search box, drill answer, etc.).
   We prefer `name` over `id` over `data-action` for the selector: most
   of our inputs are unnamed/idless but carry a stable `name` like
   "typed" or "spellingAnalyticsSearch". Selection queries are wrapped
   in try/catch because some input types (e.g. `type="number"`,
   `type="search"` in some browsers) throw on selectionStart access. */
function capturePreservedFocus() {
  const el = document.activeElement;
  if (!el || !root.contains(el)) return null;
  const tag = el.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA') return null;

  let selector = null;
  const nameAttr = el.getAttribute('name');
  if (nameAttr) {
    selector = `${tag.toLowerCase()}[name="${CSS.escape(nameAttr)}"]`;
  } else if (el.id) {
    selector = `#${CSS.escape(el.id)}`;
  } else {
    const actionAttr = el.getAttribute('data-action');
    if (actionAttr) {
      selector = `${tag.toLowerCase()}[data-action="${CSS.escape(actionAttr)}"]`;
    }
  }
  if (!selector) return null;

  let selectionStart = null;
  let selectionEnd = null;
  let selectionDirection = null;
  try {
    selectionStart = el.selectionStart;
    selectionEnd = el.selectionEnd;
    selectionDirection = el.selectionDirection;
  } catch {
    /* input types that don't support selection */
  }

  return { selector, selectionStart, selectionEnd, selectionDirection };
}

function render() {
  const appState = store.getState();
  const context = contextFor(appState.route.subjectId || 'spelling');
  const preserved = capturePreservedFocus();
  const modalWasVisible = previousModalVisible;
  root.innerHTML = renderApp(appState, context);
  const modalIsVisibleNow = modalIsOpen();
  previousModalVisible = modalIsVisibleNow;
  ensureSpellingAutoAdvanceFromCurrentState();
  mountReactSurfaces(appState, context);

  if (boot.session.signedIn) {
    if (appState.route.screen === 'parent-hub') {
      queueMicrotask(() => {
        loadParentHub();
      });
    }
    if (appState.route.screen === 'admin-hub') {
      queueMicrotask(() => {
        loadAdminHub();
        loadAdminAccounts();
      });
    }
  } else if (appState.route.screen === 'admin-hub') {
    queueMicrotask(() => loadAdminAccounts());
  }

  /* Restore focus + caret. Preserved focus wins over the autofocus
     query so caret restore isn't clobbered by a focus() on the same
     element (which can reset the caret to the end in some browsers).
     Only fall back to `data-autofocus="true"` when there was no
     active input to preserve — e.g. first render, keyboard-driven
     navigation, or after clicking a button. */
  queueMicrotask(() => {
    if (preserved) {
      const restored = root.querySelector(preserved.selector);
      if (restored && (restored.tagName === 'INPUT' || restored.tagName === 'TEXTAREA') && !restored.disabled) {
        restored.focus();
        if (preserved.selectionStart !== null && preserved.selectionEnd !== null) {
          try {
            restored.setSelectionRange(
              preserved.selectionStart,
              preserved.selectionEnd,
              preserved.selectionDirection || 'none',
            );
          } catch {
            /* input types that don't support setSelectionRange */
          }
        }
        return;
      }
    }
    const input = root.querySelector('[data-autofocus="true"]:not([disabled])');
    if (input) input.focus();
  });

  /* Modal focus choreography. On the render that first shows the modal,
     focus moves inside so keyboard users land on an actionable control.
     On the render that closes it, focus returns to the originating word
     row (re-queried by slug because innerHTML wipes the old DOM node). */
  if (modalIsVisibleNow && !modalWasVisible) {
    queueMicrotask(focusInitialModalElement);
  } else if (!modalIsVisibleNow && modalWasVisible) {
    restoreModalTrigger();
  }

  /* Hero-dark luminance flip — the spelling session + setup surfaces paint
     a `--hero-bg` image on their outer wrapper. When the backdrop is darker
     than mid-grey, the shell needs a `hero-dark` class so ink tokens flip
     to the light palette (WCAG contrast on dusk / night regions). The
     probe is fire-and-forget: we kick it after layout so the async decode
     runs off the critical path, and only apply the class when the element
     is still connected (another render may have replaced it). */
  queueMicrotask(() => applyHeroDarkProbes());

  syncAudioPlayingClass();
}

function applyHeroDarkProbes() {
  const heroes = root.querySelectorAll(
    '.spelling-in-session[style*="--hero-bg"], .setup-main[style*="--hero-bg"]',
  );
  heroes.forEach((element) => {
    const url = extractHeroBgUrl(element.getAttribute('style') || '');
    if (!url) return;
    probeRelLuminance(url).then((luminance) => {
      if (!element.isConnected) return;
      element.classList.toggle('hero-dark', luminance < 0.5);
    }).catch(() => {
      /* probeRelLuminance never rejects, but guard defensively so a
         future refactor can't turn a probe failure into an unhandled
         rejection. */
    });
  });
}

function extractHeroBgUrl(styleAttr) {
  const match = styleAttr.match(/--hero-bg:\s*url\((['"]?)([^'")]+)\1\)/);
  return match ? match[2] : '';
}

store.subscribe(render);
render();

/* Ambient toast auto-dismiss — toasts are designed to live in the
   learner's periphery, not interrupt typing. Ten seconds after a toast
   enters the queue we silently drop it. Timers are keyed on `toast.id`
   so they survive queue reorder (index-based dismissal would race
   when an earlier toast leaves first). Toasts without an id (e.g. the
   generic `{ toast: { title, body } }` shape used by tests) are left
   alone, so the test harness keeps its deterministic state snapshot.
   The CSS starts a fade at 9.5s so the pixels dim before the node
   unmounts — the two timings are intentionally paired. */
const TOAST_AUTO_DISMISS_MS = 10_000;
const scheduledToastDismissals = new Map();

function scheduleToastAutoDismissals() {
  const activeIds = new Set(
    store.getState().toasts
      .map((toast) => toast?.id)
      .filter(Boolean),
  );
  for (const [id, handle] of scheduledToastDismissals) {
    if (!activeIds.has(id)) {
      clearTimeout(handle);
      scheduledToastDismissals.delete(id);
    }
  }
  for (const id of activeIds) {
    if (scheduledToastDismissals.has(id)) continue;
    const handle = setTimeout(() => {
      scheduledToastDismissals.delete(id);
      store.dismissToastById(id);
    }, TOAST_AUTO_DISMISS_MS);
    scheduledToastDismissals.set(id, handle);
  }
}

store.subscribe(scheduleToastAutoDismissals);
scheduleToastAutoDismissals();

function handleGlobalAction(action, data) {
  const appState = store.getState();
  const learnerId = appState.learners.selectedId;
  const learner = appState.learners.byId[learnerId];

  if (action === 'navigate-home') {
    clearAdultSurfaceNotice();
    tts.stop();
    store.goHome();
    return true;
  }

  if (action === 'open-subject') {
    if (blockReadOnlyAdultAction(action)) return true;
    clearAdultSurfaceNotice();
    tts.stop();
    store.openSubject(data.subjectId || 'spelling', data.tab || 'practice');
    return true;
  }

  if (action === 'open-codex') {
    clearAdultSurfaceNotice();
    tts.stop();
    store.openCodex();
    return true;
  }

  if (action === 'open-parent-hub') {
    clearAdultSurfaceNotice();
    tts.stop();
    store.openParentHub();
    if (boot.session.signedIn) loadParentHub({ force: true });
    return true;
  }

  if (action === 'open-profile-settings') {
    clearAdultSurfaceNotice();
    tts.stop();
    store.openProfileSettings();
    return true;
  }

  if (action === 'open-admin-hub') {
    clearAdultSurfaceNotice();
    tts.stop();
    store.openAdminHub();
    if (boot.session.signedIn) loadAdminHub({ force: true });
    loadAdminAccounts();
    return true;
  }

  if (action === 'admin-accounts-refresh') {
    loadAdminAccounts({ force: true });
    return true;
  }

  if (action === 'admin-account-role-set') {
    updateAdminAccountRole(data.accountId, data.value);
    return true;
  }

  if (action === 'shell-set-role') {
    if (!boot.session.signedIn) {
      shellPlatformRole = normalisePlatformRole(data.value);
      store.patch(() => ({}));
    }
    return true;
  }

  if (action === 'subject-set-tab') {
    store.setTab(data.tab || 'practice');
    return true;
  }

  if (action === 'adult-surface-learner-select') {
    const nextLearnerId = String(data.value || '').trim();
    if (!nextLearnerId) return true;
    adultSurfaceState = {
      ...adultSurfaceState,
      selectedLearnerId: nextLearnerId,
      notice: '',
    };
    if (appState.learners.byId[nextLearnerId] && appState.learners.selectedId !== nextLearnerId) {
      tts.stop();
      runtimeBoundary.clearAll();
      store.selectLearner(nextLearnerId);
    }
    if (appState.route.screen === 'admin-hub') loadAdminHub({ learnerId: nextLearnerId, force: true });
    else loadParentHub({ learnerId: nextLearnerId, force: true });
    return true;
  }

  if (action === 'learner-select') {
    const nextLearnerId = String(data.value || '').trim();
    if (!nextLearnerId) return true;
    clearAdultSurfaceNotice();
    adultSurfaceState = {
      ...adultSurfaceState,
      selectedLearnerId: nextLearnerId,
    };
    tts.stop();
    runtimeBoundary.clearAll();
    store.selectLearner(nextLearnerId);
    if (boot.session.signedIn) {
      if (appState.route.screen === 'parent-hub') loadParentHub({ learnerId: nextLearnerId, force: true });
      if (appState.route.screen === 'admin-hub') loadAdminHub({ learnerId: nextLearnerId, force: true });
    }
    return true;
  }

  if (action === 'learner-create') {
    if (blockReadOnlyAdultAction(action)) return true;
    const current = appState.learners.byId[learnerId];
    const fallbackName = `Learner ${appState.learners.allIds.length + 1}`;
    let name = typeof data.name === 'string' ? data.name.trim() : '';
    if (!name) {
      const promptedName = globalThis.prompt?.('Name for the new learner', fallbackName);
      if (promptedName == null) return true;
      name = String(promptedName).trim();
      if (!name) return true;
    }
    store.createLearner({
      name,
      yearGroup: data.yearGroup || current?.yearGroup || 'Y5',
      goal: data.goal || current?.goal || 'sats',
      dailyMinutes: data.dailyMinutes || current?.dailyMinutes || 15,
      avatarColor: data.avatarColor || current?.avatarColor || '#3E6FA8',
    });
    return true;
  }

  if (action === 'learner-save-form') {
    if (blockReadOnlyAdultAction(action)) return true;
    const formData = data.formData;
    store.updateLearner(learnerId, {
      name: String(formData.get('name') || 'Learner').trim() || 'Learner',
      yearGroup: String(formData.get('yearGroup') || 'Y5'),
      goal: String(formData.get('goal') || 'sats'),
      dailyMinutes: safeParseInt(formData.get('dailyMinutes'), 15),
      avatarColor: String(formData.get('avatarColor') || '#3E6FA8'),
    });
    return true;
  }

  if (action === 'learner-delete') {
    if (blockReadOnlyAdultAction(action)) return true;
    if (!globalThis.confirm('Warning: delete the current learner and all their subject progress and codex state?')) return true;
    runtimeBoundary.clearLearner(learnerId);
    resetLearnerData(learnerId);
    store.deleteLearner(learnerId);
    return true;
  }

  if (action === 'learner-reset-progress') {
    if (blockReadOnlyAdultAction(action)) return true;
    if (!globalThis.confirm('Warning: reset subject progress and codex rewards for the current learner?')) return true;
    tts.stop();
    runtimeBoundary.clearLearner(learnerId);
    resetLearnerData(learnerId);
    store.resetSubjectUi();
    return true;
  }

  if (action === 'platform-reset-all') {
    if (blockReadOnlyAdultAction(action)) return true;
    if (!globalThis.confirm('Reset all app data for every learner on this browser?')) return true;
    tts.stop();
    runtimeBoundary.clearAll();
    store.clearAllProgress();
    globalThis.location.reload();
    return true;
  }

  if (action === 'platform-export-learner') {
    if (blockReadOnlyAdultAction(action)) return true;
    const payload = exportLearnerSnapshot(repositories, learnerId);
    downloadJson(`${sanitiseFilenamePart(learner?.name)}-ks2-platform-learner.json`, payload);
    return true;
  }

  if (action === 'platform-export-app') {
    if (blockReadOnlyAdultAction(action)) return true;
    const payload = exportPlatformSnapshot(repositories);
    downloadJson('ks2-platform-data.json', payload);
    return true;
  }

  if (action === 'platform-import') {
    if (blockReadOnlyAdultAction(action)) return true;
    const input = root.querySelector('#platform-import-file');
    input?.click();
    return true;
  }

  if (action === 'spelling-content-export') {
    downloadJson('ks2-spelling-content.json', spellingContent.exportPortable());
    return true;
  }

  if (action === 'spelling-content-import') {
    const input = root.querySelector('#spelling-content-import-file');
    input?.click();
    return true;
  }

  if (action === 'spelling-content-publish') {
    const validation = spellingContent.validate();
    if (!validation.ok) {
      globalThis.alert(`Cannot publish spelling content while ${validation.errors.length} validation error(s) remain.`);
      return true;
    }
    handleSpellingContentMutation(
      () => spellingContent.publishDraft({ notes: 'Published from the in-app operator hook.' }),
      'Spelling content published as a new release.',
    );
    return true;
  }

  if (action === 'spelling-content-reset') {
    if (!globalThis.confirm('Reset spelling content to the bundled published baseline?')) return true;
    handleSpellingContentMutation(
      () => spellingContent.resetToSeeded(),
      'Spelling content reset to the bundled baseline.',
    );
    return true;
  }

  if (action === 'toast-dismiss') {
    store.dismissToast(Number(data.index));
    return true;
  }

  if (action === 'monster-celebration-dismiss') {
    store.dismissMonsterCelebration();
    return true;
  }

  if (action === 'persistence-retry') {
    repositories.persistence.retry()
      .then(() => {
        tts.stop();
        runtimeBoundary.clearAll();
        store.clearMonsterCelebrations();
        store.reloadFromRepositories({ preserveRoute: true });
      })
      .catch((error) => {
        globalThis.console?.warn?.('Persistence retry failed.', error);
      });
    return true;
  }

  if (action === 'platform-logout') {
    credentialFetch('/api/auth/logout', { method: 'POST' })
      .finally(() => {
        globalThis.location.href = '/';
      });
    return true;
  }

  if (action === 'toggle-theme') {
    const docEl = document.documentElement;
    const current = docEl.getAttribute('data-theme');
    const systemPrefersDark = globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
    const resolved = current || (systemPrefersDark ? 'dark' : 'light');
    const next = resolved === 'dark' ? 'light' : 'dark';
    docEl.setAttribute('data-theme', next);
    try { globalThis.localStorage?.setItem('ks2.theme', next); } catch (error) { /* ignore */ }
    return true;
  }

  if (action === 'subject-runtime-retry') {
    runtimeBoundary.clear({
      learnerId,
      subjectId: appState.route.subjectId || 'spelling',
      tab: appState.route.tab || 'practice',
    });
    store.patch(() => ({}));
    return true;
  }

  return false;
}

function handleSubjectAction(action, data) {
  const appState = store.getState();
  const learnerId = appState.learners.selectedId;
  const tab = appState.route.tab || 'practice';
  const subject = getSubject(appState.route.subjectId || 'spelling');

  try {
    const handled = subject.handleAction?.(action, {
      ...contextFor(subject.id),
      data,
    });
    if (handled) {
      runtimeBoundary.clear({ learnerId, subjectId: subject.id, tab });
    }
    return Boolean(handled);
  } catch (error) {
    tts.stop();
    runtimeBoundary.capture({
      learnerId,
      subject,
      tab,
      phase: 'action',
      methodName: 'handleAction',
      action,
      error,
    });
    store.patch(() => ({}));
    return true;
  }
}

function dispatchAction(action, data = {}) {
  controller.autoAdvance.clear();
  if (!handleGlobalAction(action, data)) {
    handleSubjectAction(action, data);
  }
  ensureSpellingAutoAdvanceFromCurrentState();
}

function extractActionData(target) {
  /* `data-value` overrides `target.value` so non-input elements (buttons, list
     items, links) can carry a payload. Native inputs still expose `.value`,
     so leaving dataset first preserves legacy emitters that relied on the
     value attribute. */
  const datasetValue = target.dataset.value;
  return {
    action: target.dataset.action,
    subjectId: target.dataset.subjectId,
    accountId: target.dataset.accountId,
    tab: target.dataset.tab,
    pref: target.dataset.pref,
    slug: target.dataset.slug,
    mode: target.dataset.mode,
    index: target.dataset.index,
    value: datasetValue != null ? datasetValue : target.value,
    checked: target.checked,
  };
}

root.addEventListener('click', (event) => {
  /* Scrim-click closes the modal. The backdrop is a passive <div> (so
     screen readers don't enumerate a spurious button inside the dialog),
     which means the raw click doesn't carry a data-action. We synthesise
     the close here: a click on the scrim itself (not the inner .wb-modal
     content) routes to spelling-word-detail-close. */
  const scrimTarget = event.target.closest('.wb-modal-scrim');
  if (scrimTarget && !event.target.closest('.wb-modal')) {
    event.preventDefault();
    dispatchAction('spelling-word-detail-close', {});
    return;
  }

  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (!action) return;
  if (!shouldDispatchClickAction(target)) return;
  if (action === 'spelling-word-detail-open') {
    /* Capture the triggering element so focus can return here on close.
       Keep the slug as a stable fallback key — the row DOM gets wiped by
       the next innerHTML render, so a raw element reference alone is
       unreliable. */
    const slug = target.dataset.slug || '';
    lastModalTrigger = {
      slug,
      element: document.activeElement && document.activeElement !== document.body
        ? document.activeElement
        : target,
    };
  }
  event.preventDefault();
  dispatchAction(action, extractActionData(target));
});

root.addEventListener('change', (event) => {
  const fileInput = event.target.closest('#platform-import-file');
  if (fileInput) {
    handleImportFileChange(fileInput);
    return;
  }

  const spellingContentInput = event.target.closest('#spelling-content-import-file');
  if (spellingContentInput) {
    handleSpellingContentImportFileChange(spellingContentInput);
    return;
  }

  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (!action) return;
  if (!['SELECT', 'INPUT', 'TEXTAREA'].includes(target.tagName)) return;
  dispatchAction(action, extractActionData(target));
});

function dispatchTextInputAction(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return false;
  const action = target.dataset.action;
  if (!action) return false;
  if (!['INPUT', 'TEXTAREA'].includes(target.tagName)) return false;
  if (['checkbox', 'radio', 'file'].includes(String(target.type || '').toLowerCase())) return false;
  dispatchAction(action, extractActionData(target));
  return true;
}

root.addEventListener('input', (event) => {
  dispatchTextInputAction(event);
});

root.addEventListener('search', (event) => {
  dispatchTextInputAction(event);
}, true);

root.addEventListener('submit', (event) => {
  const form = event.target.closest('form[data-action]');
  if (!form) return;
  event.preventDefault();
  dispatchAction(form.dataset.action, {
    formData: new FormData(form),
  });
});

/* Generic keyboard support for WAI-ARIA radiogroups. Buttons carrying
   `role="radio"` inside a `role="radiogroup"` container respond to arrow
   keys by moving focus to the previous/next sibling radio and clicking it
   (which triggers the existing data-action dispatch path). Disabled radios
   are skipped and focus wraps at the ends so the group behaves like a
   native radio fieldset. Home/End jump to the first/last enabled option. */
const RADIOGROUP_KEYS_NEXT = new Set(['ArrowRight', 'ArrowDown']);
const RADIOGROUP_KEYS_PREV = new Set(['ArrowLeft', 'ArrowUp']);
root.addEventListener('keydown', (event) => {
  if (event.defaultPrevented) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const radio = event.target?.closest?.('[role="radio"]');
  if (!radio) return;
  const group = radio.closest('[role="radiogroup"]');
  if (!group) return;
  const key = event.key;
  const isNext = RADIOGROUP_KEYS_NEXT.has(key);
  const isPrev = RADIOGROUP_KEYS_PREV.has(key);
  const isHome = key === 'Home';
  const isEnd = key === 'End';
  if (!isNext && !isPrev && !isHome && !isEnd) return;
  const radios = Array.from(group.querySelectorAll('[role="radio"]'))
    .filter((el) => el.closest('[role="radiogroup"]') === group && !el.disabled);
  if (!radios.length) return;
  const currentIndex = radios.indexOf(radio);
  let targetIndex;
  if (isHome) {
    targetIndex = 0;
  } else if (isEnd) {
    targetIndex = radios.length - 1;
  } else if (isNext) {
    targetIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % radios.length;
  } else {
    targetIndex = currentIndex < 0 ? radios.length - 1 : (currentIndex - 1 + radios.length) % radios.length;
  }
  const target = radios[targetIndex];
  if (!target || target === radio) return;
  event.preventDefault();
  target.focus();
  target.click();
});

/* WCAG 2.4.3 focus trap for the word-detail modal. Without this, Tab
   escapes the dialog into the word-bank list behind the scrim, leaving
   keyboard users stranded. Runs as a root-level listener so it sees
   keystrokes before they bubble to the spelling shortcut layer (which
   owns Escape). Only intercepts Tab when the modal is open. */
root.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  if (!modalIsOpen()) return;
  const focusables = getModalFocusables();
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const modal = root.querySelector('.wb-modal');
  const active = document.activeElement;
  if (event.shiftKey) {
    if (active === first || !modal?.contains(active)) {
      last.focus();
      event.preventDefault();
    }
  } else if (active === last || !modal?.contains(active)) {
    first.focus();
    event.preventDefault();
  }
});

globalThis.addEventListener?.('keydown', (event) => {
  const shortcut = resolveSpellingShortcut(event, store.getState());
  if (!shortcut) return;
  if (shortcut.preventDefault) event.preventDefault();
  if (shortcut.focusSelector) {
    const input = root.querySelector(shortcut.focusSelector);
    if (input) {
      input.focus();
      input.select?.();
    }
    return;
  }
  if (!shortcut.action) return;
  dispatchAction(shortcut.action, shortcut.data || {});
});
