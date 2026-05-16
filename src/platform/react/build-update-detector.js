export const BUILD_VERSION_ENDPOINT = '/api/version';

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function resolveClientBuildId() {
  try {
    // esbuild replaces this symbol during client builds. In tests and
    // local source execution it is usually undefined, so `typeof` is used.
    return text(typeof __BUILD_HASH__ === 'string' ? __BUILD_HASH__ : null);
  } catch {
    return null;
  }
}

export function normaliseVersionPayload(payload = {}) {
  const buildHash = text(payload?.buildHash);
  const release = text(payload?.release);
  return {
    buildHash,
    release,
    buildId: buildHash || release,
    source: text(payload?.source) || (buildHash ? 'env.BUILD_HASH' : release ? 'env.RELEASE' : 'unavailable'),
    generatedAt: text(payload?.generatedAt),
  };
}

export function versionHasChanged(loadedBuildId, remoteVersion) {
  const loaded = text(loadedBuildId);
  const remote = normaliseVersionPayload(remoteVersion);
  return Boolean(loaded && remote.buildId && loaded !== remote.buildId);
}

function hasPendingWrites(state = {}) {
  const snapshot = state.persistence || {};
  return Math.max(Number(snapshot.pendingWriteCount) || 0, Number(snapshot.inFlightWriteCount) || 0) > 0;
}

function hasPendingSubjectCommand(state = {}) {
  const subjectUi = state.subjectUi && typeof state.subjectUi === 'object' ? state.subjectUi : {};
  return Object.values(subjectUi).some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    return Boolean(entry.pendingCommand || entry.pendingSubmit || entry.isSubmitting || entry.submitting);
  });
}

function hasOpenDialog(documentRef) {
  try {
    return Boolean(documentRef?.querySelector?.('[role="dialog"], [aria-modal="true"], .wb-modal-scrim'));
  } catch {
    return false;
  }
}

function hasActiveTextEntry(documentRef) {
  const element = documentRef?.activeElement || null;
  if (!element || element === documentRef?.body) return false;
  const tagName = String(element.tagName || '').toUpperCase();
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
  if (element.isContentEditable) return true;
  return element.getAttribute?.('role') === 'textbox';
}

export function canSoftReloadForUpdate({ state = {}, document = globalThis.document } = {}) {
  if (hasPendingWrites(state) || hasPendingSubjectCommand(state)) return false;
  if (state.route?.screen === 'subject') return false;
  if (hasOpenDialog(document) || hasActiveTextEntry(document)) return false;
  return true;
}

function readySnapshot({ loadedBuildId, remoteVersion, reason, checkedAt }) {
  const remote = normaliseVersionPayload(remoteVersion);
  return {
    status: 'ready',
    currentBuildId: text(loadedBuildId),
    latestBuildId: remote.buildId,
    source: remote.source,
    checkedAt: Number(checkedAt) || Date.now(),
    reason: text(reason) || 'version-check',
  };
}

export function createBuildUpdateDetector({
  loadedBuildId = resolveClientBuildId(),
  endpoint = BUILD_VERSION_ENDPOINT,
  fetchFn = globalThis.fetch,
  getState = () => ({}),
  setSystemUpdate = () => {},
  location = globalThis.location,
  document = globalThis.document,
  windowTarget = globalThis,
  setTimeoutFn = globalThis.setTimeout,
  now = Date.now,
} = {}) {
  let checking = false;
  let stopped = false;
  let pendingUpdate = null;
  let focusListener = null;
  let visibilityListener = null;

  function softReloadIfSafe(state = getState()) {
    if (!pendingUpdate) return false;
    if (!canSoftReloadForUpdate({ state, document })) return false;
    if (typeof location?.reload !== 'function') return false;
    location.reload();
    return true;
  }

  function publishReady(remoteVersion, reason) {
    pendingUpdate = readySnapshot({
      loadedBuildId,
      remoteVersion,
      reason,
      checkedAt: typeof now === 'function' ? now() : Date.now(),
    });
    if (softReloadIfSafe()) return 'reloaded';
    setSystemUpdate(pendingUpdate);
    return 'ready';
  }

  async function check(reason = 'manual') {
    if (stopped || checking || !text(loadedBuildId) || typeof fetchFn !== 'function') return false;
    checking = true;
    try {
      const response = await fetchFn(endpoint, {
        method: 'GET',
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });
      if (!response?.ok) return false;
      const payload = await response.json().catch(() => null);
      const remoteVersion = normaliseVersionPayload(payload);
      if (!versionHasChanged(loadedBuildId, remoteVersion)) return false;
      return publishReady(remoteVersion, reason);
    } catch {
      return false;
    } finally {
      checking = false;
    }
  }

  function afterRender(state = getState()) {
    softReloadIfSafe(state);
  }

  function start() {
    if (!text(loadedBuildId)) return () => stop();
    focusListener = () => { check('focus'); };
    visibilityListener = () => {
      if (document?.visibilityState === 'visible') check('visibility');
    };
    windowTarget?.addEventListener?.('focus', focusListener);
    document?.addEventListener?.('visibilitychange', visibilityListener);
    if (typeof setTimeoutFn === 'function') {
      setTimeoutFn(() => { check('app-start'); }, 0);
    } else {
      check('app-start');
    }
    return () => stop();
  }

  function stop() {
    stopped = true;
    if (focusListener) windowTarget?.removeEventListener?.('focus', focusListener);
    if (visibilityListener) document?.removeEventListener?.('visibilitychange', visibilityListener);
    focusListener = null;
    visibilityListener = null;
  }

  return {
    check,
    afterRender,
    start,
    stop,
    get pendingUpdate() {
      return pendingUpdate;
    },
  };
}
