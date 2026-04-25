import {
  createCredentialFetch,
  createRepositoriesForBrowserRuntime,
} from './platform/app/bootstrap.js';
import { createAppController } from './platform/app/create-app-controller.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.jsx';
import { AuthSurface } from './surfaces/auth/AuthSurface.jsx';
import { SUBJECTS, getSubject } from './platform/core/subject-registry.js';
import {
  exposedSubjects,
  isSubjectExposed,
  normaliseSubjectExposureGates,
} from './platform/core/subject-availability.js';
import { probeRelLuminance } from './platform/ui/luminance.js';
import { safeParseInt, uid } from './platform/core/utils.js';
import { normalisePlatformRole } from './platform/access/roles.js';
import { createHubApi } from './platform/hubs/api.js';
import {
  buildAdminHubAccessContext,
  buildParentHubAccessContext,
  readOnlyLearnerActionBlockReason,
} from './platform/hubs/shell-access.js';
import { createSubjectRuntimeBoundary } from './platform/core/subject-runtime.js';
import { createPracticeStreakSubscriber } from './platform/events/index.js';
import { createSubjectCommandActionHandler } from './platform/runtime/subject-command-actions.js';
import { createSubjectCommandClient } from './platform/runtime/subject-command-client.js';
import { createReadModelClient } from './platform/runtime/read-model-client.js';
import { createPunctuationReadModelService } from './subjects/punctuation/client-read-models.js';
import { punctuationSubjectCommandActions } from './subjects/punctuation/command-actions.js';
import { createRemoteSpellingActionHandler } from './subjects/spelling/remote-actions.js';
import { createPlatformTts } from './subjects/spelling/tts.js';
import {
  DEFAULT_BUFFERED_GEMINI_VOICE,
  DEFAULT_TTS_PROVIDER,
  normaliseBufferedGeminiVoice,
  normaliseTtsProvider,
} from './subjects/spelling/tts-providers.js';
import { createSpellingReadModelService } from './subjects/spelling/client-read-models.js';
import { getOverallSpellingStats } from './subjects/spelling/module.js';
import { resolveSpellingShortcut } from './subjects/spelling/shortcuts.js';
import { resolveGrammarShortcut } from './subjects/grammar/shortcuts.js';
import {
  monsterSummary,
  monsterSummaryFromSpellingAnalytics,
} from './platform/game/monster-system.js';
import {
  acknowledgeMonsterCelebrationEvents,
  clearAllMonsterCelebrationAcknowledgements,
  clearMonsterCelebrationAcknowledgements,
} from './platform/game/monster-celebration-acks.js';
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
   React now owns the modal DOM, but route and filter transitions can
   still remount word-bank rows. Keep the triggering element when React
   gives us one, and fall back to the stable slug after close.
   -------------------------------------------------------------- */
const WORD_DETAIL_MODAL_SELECTOR = '.wb-modal-scrim';
const WORD_DETAIL_FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let lastModalTrigger = { slug: '', element: null };
let previousModalVisible = false;

function getModalScrim() {
  return document.querySelector(WORD_DETAIL_MODAL_SELECTOR)
    || root?.querySelector(WORD_DETAIL_MODAL_SELECTOR);
}

function getModalElement() {
  return getModalScrim()?.querySelector('.wb-modal')
    || root?.querySelector('.wb-modal');
}

function modalIsOpen() {
  return Boolean(getModalScrim());
}

function getModalFocusables() {
  const modal = getModalElement();
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

function captureWordDetailTrigger(action, data = {}) {
  if (action !== 'spelling-word-detail-open') return;
  const triggerElement = data.triggerElement && typeof data.triggerElement.focus === 'function'
    ? data.triggerElement
    : document.activeElement && document.activeElement !== document.body
      ? document.activeElement
      : null;
  lastModalTrigger = {
    slug: data.slug || '',
    element: triggerElement,
  };
}

async function submitAuthCredentials({ mode = 'login', email, password, convertDemo = false } = {}) {
  const action = mode === 'register' ? 'register' : 'login';
  const response = await credentialFetch(`/api/auth/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      ...(convertDemo && action === 'register' ? { convertDemo: true } : {}),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || 'Sign-in failed.');
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
    throw new Error(payload.message || 'That sign-in provider is not configured yet.');
  }
  globalThis.location.href = payload.redirectUrl;
}

async function startDemoSession() {
  const response = await credentialFetch('/api/demo/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.session?.accountId) {
    throw new Error(payload.message || 'Could not start the demo.');
  }
  globalThis.location.href = '/';
}

function renderAuthRoot({ error = '' } = {}) {
  createRoot(root).render(
    <AuthSurface
      initialError={error}
      onSubmit={submitAuthCredentials}
      onSocialStart={startSocialAuth}
      onDemoStart={startDemoSession}
    />,
  );
}

async function createRepositoriesForCurrentRuntime() {
  return createRepositoriesForBrowserRuntime({
    location: globalThis.location,
    storage: globalThis.localStorage,
    credentialFetch,
    waitForAuthRequired: false,
  });
}

const boot = await createRepositoriesForCurrentRuntime();
if (!boot.repositories) {
  renderAuthRoot({ error: boot.session?.error || '' });
  await new Promise(() => {});
}
const repositories = boot.repositories;
globalThis.KS2_AUTH_SESSION = boot.session;
const subjectExposureGates = normaliseSubjectExposureGates(boot.session.subjectExposureGates);
await repositories.hydrate();

const services = {
  punctuation: null,
  spelling: null,
};
let store = null;

function selectedTtsProvider() {
  const learnerId = store?.getState?.()?.learners?.selectedId;
  if (!learnerId) return DEFAULT_TTS_PROVIDER;
  try {
    return normaliseTtsProvider(services.spelling?.getPrefs?.(learnerId)?.ttsProvider);
  } catch {
    return DEFAULT_TTS_PROVIDER;
  }
}

function selectedBufferedGeminiVoice() {
  const learnerId = store?.getState?.()?.learners?.selectedId;
  if (!learnerId) return DEFAULT_BUFFERED_GEMINI_VOICE;
  try {
    return normaliseBufferedGeminiVoice(services.spelling?.getPrefs?.(learnerId)?.bufferedGeminiVoice);
  } catch {
    return DEFAULT_BUFFERED_GEMINI_VOICE;
  }
}

const tts = createPlatformTts({
  fetchFn: credentialFetch,
  provider: selectedTtsProvider,
  bufferedVoice: selectedBufferedGeminiVoice,
});

/* Audio replay affordance state — maintained outside the store because it is a
   transient DOM affordance, not persisted learner state. The render wipes
   innerHTML on every store update, so we re-apply the classes both inside
   render() and inside the TTS listener to cover both paths. */
let currentPlayingKind = null;
let currentLoadingKind = null;
let audioLoadingStartedAt = 0;
let audioLoadingTimer = null;
let profileTtsTestState = {
  status: 'idle',
  provider: DEFAULT_TTS_PROVIDER,
  startedAt: 0,
  token: 0,
};
let profileTtsTestTimer = null;
let profileTtsTestResetTimer = null;

const NORMAL_REPLAY_SELECTORS = [
  '[data-action="spelling-replay"]',
  '[data-action="spelling-word-bank-drill-replay"]',
  '.wb-modal-speaker',
];
const SLOW_REPLAY_SELECTORS = [
  '[data-action="spelling-replay-slow"]',
  '[data-action="spelling-word-bank-drill-replay-slow"]',
];
const PROFILE_WRITE_ACTIONS = new Set([
  'learner-create',
  'learner-save-form',
  'learner-delete',
  'learner-reset-progress',
  'platform-import',
  'platform-import-file-selected',
  'platform-reset-all',
]);
const SERVER_SYNC_LOCAL_DATASET_ACTIONS = new Set([
  'platform-import',
  'platform-import-file-selected',
  'platform-reset-all',
]);

function syncAudioPlayingClass() {
  const normalNodes = root.querySelectorAll(NORMAL_REPLAY_SELECTORS.join(','));
  const slowNodes = root.querySelectorAll(SLOW_REPLAY_SELECTORS.join(','));
  const normalOn = currentPlayingKind === 'normal';
  const slowOn = currentPlayingKind === 'slow';
  const normalLoading = currentLoadingKind === 'normal';
  const slowLoading = currentLoadingKind === 'slow';
  const waitingLong = audioLoadingStartedAt > 0 && (Date.now() - audioLoadingStartedAt) >= 10000;
  for (const node of normalNodes) {
    node.classList.toggle('playing', normalOn);
    node.classList.toggle('loading', normalLoading);
    node.classList.toggle('waiting-long', normalLoading && waitingLong);
    node.toggleAttribute('aria-busy', normalLoading);
  }
  for (const node of slowNodes) {
    node.classList.toggle('playing', slowOn);
    node.classList.toggle('loading', slowLoading);
    node.classList.toggle('waiting-long', slowLoading && waitingLong);
    node.toggleAttribute('aria-busy', slowLoading);
  }
}

function clearAudioLoadingTimer() {
  if (!audioLoadingTimer) return;
  clearTimeout(audioLoadingTimer);
  audioLoadingTimer = null;
}

function armAudioLoadingTimer() {
  clearAudioLoadingTimer();
  audioLoadingTimer = setTimeout(() => {
    audioLoadingTimer = null;
    syncAudioPlayingClass();
  }, 10000);
}

function clearProfileTtsTestTimers() {
  if (profileTtsTestTimer) {
    clearInterval(profileTtsTestTimer);
    profileTtsTestTimer = null;
  }
  if (profileTtsTestResetTimer) {
    clearTimeout(profileTtsTestResetTimer);
    profileTtsTestResetTimer = null;
  }
}

function syncProfileTtsTestButton() {
  const buttons = root.querySelectorAll('[data-action="tts-test"]');
  const status = profileTtsTestState.status;
  const active = status === 'loading' || status === 'playing';
  const elapsedMs = profileTtsTestState.startedAt ? Date.now() - profileTtsTestState.startedAt : 0;
  const waitingLong = status === 'loading' && elapsedMs >= 10000;
  const label = status === 'loading'
    ? `${Math.max(0, Math.floor(elapsedMs / 1000))}s`
    : status === 'playing'
      ? 'Playing'
      : status === 'done'
        ? 'Done'
        : status === 'failed'
          ? 'Failed'
          : 'Test';

  for (const button of buttons) {
    button.classList.toggle('loading', status === 'loading');
    button.classList.toggle('waiting-long', waitingLong);
    button.classList.toggle('playing', status === 'playing');
    button.classList.toggle('done', status === 'done');
    button.classList.toggle('failed', status === 'failed');
    button.toggleAttribute('aria-busy', active);
    button.disabled = active;
    const labelNode = button.querySelector('.profile-tts-test-label');
    if (labelNode) labelNode.textContent = label;
  }
}

function resetProfileTtsTestButton(token) {
  if (token !== profileTtsTestState.token) return;
  clearProfileTtsTestTimers();
  profileTtsTestState = {
    ...profileTtsTestState,
    status: 'idle',
    startedAt: 0,
  };
  syncProfileTtsTestButton();
}

function setProfileTtsTestStatus(status, token = profileTtsTestState.token) {
  if (token !== profileTtsTestState.token) return;
  if (status !== 'loading' && profileTtsTestTimer) {
    clearInterval(profileTtsTestTimer);
    profileTtsTestTimer = null;
  }
  profileTtsTestState = {
    ...profileTtsTestState,
    status,
  };
  syncProfileTtsTestButton();
}

function beginProfileTtsTest(provider) {
  clearProfileTtsTestTimers();
  const token = profileTtsTestState.token + 1;
  profileTtsTestState = {
    status: 'loading',
    provider,
    startedAt: Date.now(),
    token,
  };
  profileTtsTestTimer = setInterval(syncProfileTtsTestButton, 250);
  syncProfileTtsTestButton();
  return token;
}

function finishProfileTtsTest(token, ok) {
  if (token !== profileTtsTestState.token) return;
  setProfileTtsTestStatus(ok ? 'done' : 'failed', token);
  profileTtsTestResetTimer = setTimeout(() => resetProfileTtsTestButton(token), 1600);
}

tts.subscribe((event) => {
  if (event?.kind === 'test') {
    if (event?.type === 'start') setProfileTtsTestStatus('playing');
  } else if (event?.type === 'loading') {
    currentLoadingKind = event.kind === 'slow' ? 'slow' : 'normal';
    currentPlayingKind = null;
    audioLoadingStartedAt = Date.now();
    armAudioLoadingTimer();
  } else if (event?.type === 'start') {
    clearAudioLoadingTimer();
    currentLoadingKind = null;
    audioLoadingStartedAt = 0;
    currentPlayingKind = event.kind === 'slow' ? 'slow' : 'normal';
  } else if (event?.type === 'end') {
    clearAudioLoadingTimer();
    currentLoadingKind = null;
    audioLoadingStartedAt = 0;
    currentPlayingKind = null;
  }
  syncAudioPlayingClass();
});

const readModels = createReadModelClient({ baseUrl: '', fetch: credentialFetch });
const spellingContent = createSpellingContentApi({ fetch: credentialFetch });

function staleWriteCurrentRevision(error) {
  const payload = error?.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const expectedCandidates = [
    payload.expectedRevision,
    payload.mutation?.expectedRevision,
  ];
  let expectedRevision = null;
  for (const candidate of expectedCandidates) {
    const revision = Number(candidate);
    if (Number.isFinite(revision) && revision >= 0) {
      expectedRevision = revision;
      break;
    }
  }

  const currentCandidates = [
    payload.currentRevision,
    payload.mutation?.currentRevision,
  ];
  for (const candidate of currentCandidates) {
    const revision = Number(candidate);
    if (!Number.isFinite(revision) || revision < 0) continue;
    if (expectedRevision !== null && revision <= expectedRevision) continue;
    return revision;
  }
  return null;
}

const subjectCommands = createSubjectCommandClient({
  baseUrl: '',
  fetch: credentialFetch,
  getLearnerRevision: (learnerId) => repositories.runtime?.readLearnerRevision?.(learnerId) || 0,
  onStaleWrite: async ({ error, learnerId }) => {
    const refreshed = repositories.runtime?.applyLearnerRevisionHint?.(
      learnerId,
      staleWriteCurrentRevision(error),
    ) === true;
    if (!refreshed) await repositories.hydrate({ cacheScope: 'subject-command-stale-write' });
  },
  onCommandApplied: ({ learnerId, subjectId, response }) => {
    repositories.runtime?.applySubjectCommandResult?.({ learnerId, subjectId, response });
  },
});
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
  const appState = store.getState();
  const adultReason = readOnlyLearnerActionBlockReason(action, resolveActiveAdultAccessContext(appState));
  if (adultReason) return adultReason;
  if (!PROFILE_WRITE_ACTIONS.has(String(action || ''))) return '';
  if (boot.session.demo) {
    return 'Demo profile writes are read-only. Create an account from the profile screen to keep this learner permanently.';
  }
  if (appState.persistence?.mode === 'degraded') {
    return 'Sync is degraded, so profile write actions are blocked until persistence recovers.';
  }
  if (boot.session.signedIn && SERVER_SYNC_LOCAL_DATASET_ACTIONS.has(String(action || ''))) {
    return 'JSON import and full browser reset are local recovery tools. Server-synced accounts are restored from D1.';
  }
  return '';
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
  services.spelling = createSpellingReadModelService({
    getState: () => store?.getState?.() || null,
  });
  return services.spelling;
}

function rebuildPunctuationService() {
  services.punctuation = createPunctuationReadModelService({
    getState: () => store?.getState?.() || null,
  });
  return services.punctuation;
}

rebuildPunctuationService();
rebuildSpellingService();

function buildSignedInHubModels(appState) {
  const parentHubState = {
    status: adultSurfaceState.parentHub.status,
    learnerId: adultSurfaceState.parentHub.learnerId || '',
    error: adultSurfaceState.parentHub.error || '',
    notice: adultSurfaceState.notice || '',
    recentSessionsStatus: adultSurfaceState.parentHub.payload?.parentHistory?.recentSessions?.status || '',
    recentSessionsError: adultSurfaceState.parentHub.payload?.parentHistory?.recentSessions?.error || '',
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
  return buildSignedInHubModels(appState);
}

const runtimeBoundary = createSubjectRuntimeBoundary({
  onError(entry, error) {
    globalThis.console?.error?.(`Subject runtime containment hit ${entry.subjectId}:${entry.tab}:${entry.phase}.`, error);
  },
});
let remoteSpellingActions = null;

const controller = createAppController({
  repositories,
  subjects: SUBJECTS,
  session: boot.session,
  subjectExposureGates,
  runtimeBoundary,
  autoAdvanceDispatchContinue: () => handleRemoteSpellingAction('spelling-continue'),
  extraContext: () => ({
    session: boot.session,
    handleRemoteSpellingAction,
  }),
  tts,
  services,
  cacheSubjectUiWrites: true,
  subscribers: [
    createPracticeStreakSubscriber(),
  ],
  onEventError(error) {
    globalThis.console?.error?.('Reward/event subscriber failed.', error);
  },
});
store = controller.store;
remoteSpellingActions = createRemoteSpellingActionHandler({
  store,
  services,
  subjectCommands,
  readModels,
  tts,
  isReadOnly: runtimeIsReadOnly,
  setRuntimeError: setSpellingRuntimeError,
});

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

async function parseApiJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    const error = new Error(payload?.message || `Request failed (${response.status}).`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function isServerSyncedRuntime() {
  return boot.session.mode === 'remote-sync' || boot.session.mode === 'demo-sync';
}

function learnerSnapshotWithout(learnerId) {
  const snapshot = store.getState().learners;
  if (!snapshot.byId[learnerId] || snapshot.allIds.length <= 1) return null;
  const byId = { ...snapshot.byId };
  delete byId[learnerId];
  const allIds = snapshot.allIds.filter((id) => id !== learnerId);
  return {
    byId,
    allIds,
    selectedId: snapshot.selectedId === learnerId ? allIds[0] : snapshot.selectedId,
  };
}

function deleteLearnerFromServerSyncedAccount(learnerId) {
  const nextLearners = learnerSnapshotWithout(learnerId);
  if (!nextLearners) return false;
  runtimeBoundary.clearLearner(learnerId);
  clearMonsterCelebrationAcknowledgements(learnerId);
  repositories.learners.write(nextLearners);
  store.reloadFromRepositories({ preserveRoute: true });
  return true;
}

async function resetServerSyncedLearnerProgress(learnerId) {
  const requestId = uid('learner-reset');
  const response = await credentialFetch('/api/learners/reset-progress', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      learnerId,
      mutation: {
        requestId,
        correlationId: requestId,
        expectedLearnerRevision: repositories.runtime.readLearnerRevision(learnerId),
      },
    }),
  });
  await parseApiJson(response);
  await repositories.hydrate({ cacheScope: 'learner-reset-progress' });
  runtimeBoundary.clearLearner(learnerId);
  clearMonsterCelebrationAcknowledgements(learnerId);
  store.clearMonsterCelebrations();
  store.reloadFromRepositories({ preserveRoute: true });
}

async function profileTtsPayload(provider, bufferedGeminiVoice = selectedBufferedGeminiVoice()) {
  const learnerId = store.getState().learners.selectedId;
  if (provider === 'browser' || !learnerId) {
    return {
      learnerId,
      word: 'early',
      sentence: 'The birds sang early in the day.',
      provider,
      bufferedGeminiVoice,
      kind: 'test',
    };
  }

  const params = new URLSearchParams({
    learnerId,
    detailSlug: 'early',
    pageSize: '1',
  });
  const response = await credentialFetch(`/api/subjects/spelling/word-bank?${params.toString()}`, {
    headers: { accept: 'application/json' },
  });
  const payload = await parseApiJson(response);
  const cue = payload?.wordBank?.detail?.audio?.dictation || null;
  if (!cue?.learnerId || !cue?.promptToken) {
    throw new Error('Could not prepare a server-authorised dictation test.');
  }
  return {
    ...cue,
    provider,
    bufferedGeminiVoice,
    kind: 'test',
  };
}

function createSpellingContentApi({ fetch: fetchFn }) {
  let cachedContent = null;
  let accountRevision = 0;

  async function hydrate() {
    const response = await fetchFn('/api/content/spelling', {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    const payload = await parseApiJson(response);
    cachedContent = payload.content || null;
    accountRevision = Math.max(0, Number(payload.mutation?.accountRevision) || accountRevision);
    return cachedContent;
  }

  async function write(rawContent) {
    const content = rawContent?.content && typeof rawContent.content === 'object'
      ? rawContent.content
      : rawContent;
    if (!content || typeof content !== 'object' || Array.isArray(content)) {
      throw new Error('Spelling content import did not include a content bundle.');
    }
    if (!cachedContent) await hydrate();
    const requestId = uid('content');
    const response = await fetchFn('/api/content/spelling', {
      method: 'PUT',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        content,
        mutation: {
          requestId,
          correlationId: requestId,
          expectedAccountRevision: accountRevision,
        },
      }),
    });
    const payload = await parseApiJson(response);
    cachedContent = payload.content || content;
    accountRevision = Math.max(
      accountRevision,
      Number(payload.mutation?.accountRevision) || Number(payload.mutation?.appliedRevision) || accountRevision,
    );
    return cachedContent;
  }

  return {
    hydrate,
    async exportPortable() {
      return hydrate();
    },
    importPortable(payload) {
      return write(payload);
    },
    validate() {
      return { ok: false, errors: [{ message: 'Publishing is now validated by the Worker content API.' }], warnings: [] };
    },
    publishDraft() {
      throw new Error('Publishing is server-owned in this build. Use the Worker content API.');
    },
    resetToSeeded() {
      throw new Error('Seed reset is server-owned in this build. Use the Worker content API.');
    },
  };
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

function patchAdminHubMonsterVisualConfig(monsterVisualConfig, notice = '') {
  patchAdultSurfaceState((state) => {
    const payload = state.adminHub.payload || {};
    const adminHub = payload.adminHub || {};
    const nextMonsterVisualConfig = {
      ...(monsterVisualConfig || {}),
      permissions: monsterVisualConfigPermissions(adminHub),
    };
    return {
      ...state,
      notice,
      adminHub: {
        ...state.adminHub,
        status: 'loaded',
        payload: {
          ...payload,
          adminHub: {
            ...adminHub,
            monsterVisualConfig: nextMonsterVisualConfig,
          },
        },
        error: '',
      },
    };
  });
}

function monsterVisualConfigPermissions(adminHub) {
  const existing = adminHub.monsterVisualConfig?.permissions || {};
  const hubPermissions = adminHub.permissions || {};
  const canManage = typeof hubPermissions.canManageMonsterVisualConfig === 'boolean'
    ? hubPermissions.canManageMonsterVisualConfig
    : normalisePlatformRole(hubPermissions.platformRole || shellPlatformRole) === 'admin';
  const canView = typeof existing.canViewMonsterVisualConfig === 'boolean'
    ? existing.canViewMonsterVisualConfig
    : Boolean(hubPermissions.canViewAdminHub || canManage);
  return {
    ...existing,
    canManageMonsterVisualConfig: canManage,
    canViewMonsterVisualConfig: canView,
  };
}

function clearMonsterVisualAutosave(key) {
  if (!key) return;
  try {
    globalThis.localStorage?.removeItem?.(key);
  } catch {
    /* Browser storage is best-effort for operator drafts. */
  }
}

async function saveMonsterVisualConfigDraft({ draft, expectedDraftRevision, autosaveKey = '' } = {}) {
  if (!hubApi) return;
  try {
    const requestId = uid('monster-visual-save');
    const payload = await hubApi.saveMonsterVisualConfigDraft({
      draft,
      mutation: {
        requestId,
        correlationId: requestId,
        expectedDraftRevision,
      },
    });
    clearMonsterVisualAutosave(autosaveKey);
    patchAdminHubMonsterVisualConfig(payload.monsterVisualConfig, 'Monster visual draft saved.');
  } catch (error) {
    globalThis.alert?.(`Monster visual draft save failed: ${error?.message || 'Unknown error.'}`);
  }
}

async function publishMonsterVisualConfig({ expectedDraftRevision } = {}) {
  if (!hubApi) return;
  try {
    const requestId = uid('monster-visual-publish');
    const payload = await hubApi.publishMonsterVisualConfig({
      mutation: {
        requestId,
        correlationId: requestId,
        expectedDraftRevision,
      },
    });
    patchAdminHubMonsterVisualConfig(payload.monsterVisualConfig, 'Monster visual config published.');
    await repositories.hydrate({ cacheScope: 'monster-visual-config-publish' });
    store.patch(() => ({}));
  } catch (error) {
    const validationCount = Number(error?.payload?.validation?.errors?.length) || 0;
    const suffix = validationCount ? ` (${validationCount} validation errors)` : '';
    globalThis.alert?.(`Monster visual publish failed${suffix}: ${error?.message || 'Unknown error.'}`);
  }
}

async function restoreMonsterVisualConfigVersion({ version, expectedDraftRevision } = {}) {
  if (!hubApi) return;
  try {
    const requestId = uid('monster-visual-restore');
    const payload = await hubApi.restoreMonsterVisualConfigVersion({
      version,
      mutation: {
        requestId,
        correlationId: requestId,
        expectedDraftRevision,
      },
    });
    patchAdminHubMonsterVisualConfig(payload.monsterVisualConfig, `Monster visual version ${version} restored into draft.`);
  } catch (error) {
    globalThis.alert?.(`Monster visual restore failed: ${error?.message || 'Unknown error.'}`);
  }
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
    readModels,
    subjectCommands,
    tts,
    applySubjectTransition,
    runtimeBoundary,
    subjects: exposedSubjects(SUBJECTS, subjectExposureGates),
    subjectExposureGates,
    session: boot.session,
    handleRemoteSpellingAction,
    runtimeReadOnly: appState.persistence?.mode === 'degraded',
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
  for (const subject of context.subjects || exposedSubjects(SUBJECTS, subjectExposureGates)) {
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
  if (!learnerId || !spelling?.getStats) return 0;
  try {
    const stats = getOverallSpellingStats(spelling, learnerId);
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
    ttsProvider: learnerId ? selectedTtsProvider() : DEFAULT_TTS_PROVIDER,
    bufferedGeminiVoice: learnerId ? selectedBufferedGeminiVoice() : DEFAULT_BUFFERED_GEMINI_VOICE,
    signedInAs: boot.session.signedIn ? (boot.session.email || '') : null,
    session: boot.session,
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
  const visibleSubjects = context.subjects || exposedSubjects(SUBJECTS, subjectExposureGates);

  return {
    ...buildSurfaceChromeModel(appState),
    monsterSummary: buildHomeMonsterSummary(learnerId, context),
    subjects: visibleSubjects,
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
    dispatch: dispatchAction,
    flushSpellingDeferredAudio: () => controller.flushDeferredAudio(),
    toggleTheme: () => dispatchAction('toggle-theme'),
    selectLearner: (value) => dispatchAction('learner-select', { value }),
    navigateHome: () => dispatchAction('navigate-home'),
    openProfileSettings: () => dispatchAction('open-profile-settings'),
    openSubject: (subjectId) => dispatchAction('open-subject', { subjectId }),
    openCodex: () => dispatchAction('open-codex'),
    openParentHub: () => dispatchAction('open-parent-hub'),
    openAdminHub: () => dispatchAction('open-admin-hub'),
    logout: () => dispatchAction('platform-logout'),
    retryPersistence: () => dispatchAction('persistence-retry'),
  };
}

/* Capture the identity + caret state of the currently-focused input
   inside `root` so we can restore it after React replaces legacy HTML
   adapters on a store update. Without this, the search box or drill answer
   can lose its caret while the learner is typing.
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

let pendingPreservedFocus = null;
controller.subscribe(() => {
  pendingPreservedFocus = capturePreservedFocus();
});

function afterReactRender(appState) {
  const preserved = pendingPreservedFocus;
  pendingPreservedFocus = null;
  const modalWasVisible = previousModalVisible;
  const modalIsVisibleNow = modalIsOpen();
  previousModalVisible = modalIsVisibleNow;
  ensureSpellingAutoAdvanceFromCurrentState();

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

  /* Hero-dark luminance flip — the spelling session surface paints
     a `--hero-bg` image on its outer wrapper. When the backdrop is darker
     than mid-grey, the shell needs a `hero-dark` class so ink tokens flip
     to the light palette (WCAG contrast on dusk / night regions). The
     probe is fire-and-forget: we kick it after layout so the async decode
     runs off the critical path, and only apply the class when the element
     is still connected (another render may have replaced it). The setup
     surface owns a more granular React-scoped contrast probe because its
     text sits over several different parts of the panning artwork. */
  queueMicrotask(() => applyHeroDarkProbes());

  syncAudioPlayingClass();
  syncProfileTtsTestButton();
}

function applyHeroDarkProbes() {
  const heroes = root.querySelectorAll('.spelling-in-session[style*="--hero-bg"]');
  heroes.forEach((element) => {
    const url = extractHeroBgUrl(element.getAttribute('style') || '');
    if (!url) return;
    if (element.dataset.heroLuminanceUrl === url) return;
    element.dataset.heroLuminanceUrl = url;
    probeRelLuminance(url).then((luminance) => {
      if (!element.isConnected) return;
      if (element.dataset.heroLuminanceUrl !== url) return;
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

const appRuntime = {
  contextFor,
  monsterVisualConfig: () => repositories.monsterVisualConfig?.read?.() || null,
  buildHomeModel,
  buildCodexModel,
  buildSurfaceChromeModel,
  buildSurfaceActions,
  afterRender: afterReactRender,
};

createRoot(root).render(
  <App
    controller={controller}
    runtime={appRuntime}
  />,
);

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
    const subject = getSubject(data.subjectId || 'spelling');
    if (!isSubjectExposed(subject, subjectExposureGates)) {
      store.goHome();
      return true;
    }
    tts.stop();
    store.openSubject(subject.id, data.tab || 'practice');
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

  if (action === 'monster-visual-config-save') {
    saveMonsterVisualConfigDraft(data);
    return true;
  }

  if (action === 'monster-visual-config-publish') {
    publishMonsterVisualConfig(data);
    return true;
  }

  if (action === 'monster-visual-config-restore') {
    restoreMonsterVisualConfigVersion(data);
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
      remoteSpellingActions?.reapplyPendingOptimisticPrefs?.();
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
    remoteSpellingActions?.reapplyPendingOptimisticPrefs?.();
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

  if (action === 'tts-test') {
    const provider = normaliseTtsProvider(data.provider, selectedTtsProvider());
    const bufferedGeminiVoice = normaliseBufferedGeminiVoice(data.bufferedGeminiVoice, selectedBufferedGeminiVoice());
    const token = beginProfileTtsTest(provider);
    profileTtsPayload(provider, bufferedGeminiVoice)
      .then((payload) => tts.speak(payload))
      .then((ok) => finishProfileTtsTest(token, Boolean(ok)))
      .catch(() => finishProfileTtsTest(token, false));
    return true;
  }

  if (action === 'learner-save-form') {
    if (blockReadOnlyAdultAction(action)) return true;
    const formData = data.formData;
    runSpellingCommand('save-prefs', {
      prefs: {
        ttsProvider: normaliseTtsProvider(formData.get('ttsProvider')),
        bufferedGeminiVoice: normaliseBufferedGeminiVoice(formData.get('bufferedGeminiVoice')),
      },
    });
    tts.stop();
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
    if (isServerSyncedRuntime()) {
      deleteLearnerFromServerSyncedAccount(learnerId);
    } else {
      runtimeBoundary.clearLearner(learnerId);
      clearMonsterCelebrationAcknowledgements(learnerId);
      resetLearnerData(learnerId);
      store.deleteLearner(learnerId);
    }
    return true;
  }

  if (action === 'learner-reset-progress') {
    if (blockReadOnlyAdultAction(action)) return true;
    if (!globalThis.confirm('Warning: reset subject progress and codex rewards for the current learner?')) return true;
    tts.stop();
    if (isServerSyncedRuntime()) {
      resetServerSyncedLearnerProgress(learnerId).catch((error) => {
        globalThis.alert?.(error?.message || 'Could not reset learner progress.');
      });
    } else {
      runtimeBoundary.clearLearner(learnerId);
      clearMonsterCelebrationAcknowledgements(learnerId);
      resetLearnerData(learnerId);
      store.resetSubjectUi();
    }
    return true;
  }

  if (action === 'platform-reset-all') {
    if (blockReadOnlyAdultAction(action)) return true;
    if (!globalThis.confirm('Reset all app data for every learner on this browser?')) return true;
    tts.stop();
    runtimeBoundary.clearAll();
    clearAllMonsterCelebrationAcknowledgements();
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

  if (action === 'platform-import-file-selected') {
    if (blockReadOnlyAdultAction('platform-import')) return true;
    handleImportFileChange(data.input);
    return true;
  }

  if (action === 'demo-convert-email') {
    const formData = data.formData;
    submitAuthCredentials({
      mode: 'register',
      email: formData?.get('email'),
      password: formData?.get('password'),
      convertDemo: true,
    }).catch((error) => {
      globalThis.alert?.(error?.message || 'Could not create an account from this demo.');
    });
    return true;
  }

  if (action === 'demo-social-convert') {
    startSocialAuth(data.provider).catch((error) => {
      globalThis.alert?.(error?.message || 'Could not start social sign-in for this demo.');
    });
    return true;
  }

  if (action === 'spelling-content-export') {
    spellingContent.exportPortable()
      .then((content) => downloadJson('ks2-spelling-content.json', content))
      .catch((error) => {
        globalThis.alert(`Spelling content export failed: ${error?.message || 'Unknown error.'}`);
      });
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
    acknowledgeMonsterCelebrationEvents(store.getState().monsterCelebrations?.queue?.[0], { learnerId });
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

function runtimeIsReadOnly() {
  return store.getState().persistence?.mode === 'degraded';
}

function setSpellingRuntimeError(message) {
  store.patch((current) => ({
    subjectUi: {
      ...current.subjectUi,
      spelling: {
        ...(current.subjectUi?.spelling || {}),
        error: message || 'Practice is temporarily unavailable.',
      },
    },
  }));
}

function setPunctuationRuntimeError(message) {
  store.updateSubjectUi('punctuation', { error: message || 'Punctuation practice is temporarily unavailable.' });
}

function applyPunctuationCommandResponse(response) {
  const responseLearnerId = String(response?.learnerId || store.getState().learners?.selectedId || '');
  store.reloadFromRepositories({ preserveRoute: true, preserveMonsterCelebrations: true });
  if (responseLearnerId && store.getState().learners?.selectedId !== responseLearnerId) return;
  if (response?.projections?.rewards?.toastEvents?.length) {
    store.pushToasts(response.projections.rewards.toastEvents);
  }
  if (response?.projections?.rewards?.events?.length) {
    store.pushMonsterCelebrations(response.projections.rewards.events);
  }
}

const pendingPunctuationCommandKeys = new Set();

const punctuationCommandActions = createSubjectCommandActionHandler({
  subjectId: 'punctuation',
  subjectCommands,
  getState: () => store.getState(),
  isReadOnly: runtimeIsReadOnly,
  setSubjectError: setPunctuationRuntimeError,
  pendingKeys: pendingPunctuationCommandKeys,
  onCommandResult: applyPunctuationCommandResponse,
  onCommandError(error) {
    globalThis.console?.warn?.('Punctuation command failed.', error);
    setPunctuationRuntimeError(error?.payload?.message || error?.message || 'The punctuation command could not be completed.');
  },
  actions: punctuationSubjectCommandActions,
});

function handleRemoteSpellingAction(action, data = {}) {
  return remoteSpellingActions?.handle(action, data) || false;
}

function runSpellingCommand(command, payload = {}) {
  return remoteSpellingActions?.runCommand(command, payload) || false;
}

function handleRemotePunctuationAction(action, data = {}) {
  if (!isSubjectExposed(getSubject('punctuation'), subjectExposureGates)) {
    store.goHome();
    return true;
  }
  if (action === 'punctuation-back') {
    store.updateSubjectUi('punctuation', { phase: 'setup', error: '' });
    return true;
  }
  return punctuationCommandActions.handle(action, data);
}

function handleSubjectAction(action, data) {
  const appState = store.getState();
  const learnerId = appState.learners.selectedId;
  const tab = appState.route.tab || 'practice';
  const subject = getSubject(appState.route.subjectId || 'spelling');

  try {
    if (!isSubjectExposed(subject, subjectExposureGates)) {
      store.goHome();
      return true;
    }
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
  captureWordDetailTrigger(action, data);
  if (!handleGlobalAction(action, data) && !handleRemoteSpellingAction(action, data) && !handleRemotePunctuationAction(action, data)) {
    handleSubjectAction(action, data);
  }
  ensureSpellingAutoAdvanceFromCurrentState();
}

/* Generic keyboard support for WAI-ARIA radiogroups. Buttons carrying
   `role="radio"` inside a `role="radiogroup"` container respond to arrow
   keys by moving focus to the previous/next sibling radio and clicking it
   (which triggers the button's React handler). Disabled radios
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
   keyboard users stranded. Runs at document level because the React modal
   is portaled to body. Only intercepts Tab when the modal is open. */
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  if (!modalIsOpen()) return;
  const focusables = getModalFocusables();
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const modal = getModalElement();
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
}, true);

globalThis.addEventListener?.('keydown', (event) => {
  const appState = store.getState();
  const shortcut = resolveSpellingShortcut(event, appState)
    || resolveGrammarShortcut(event, appState);
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
