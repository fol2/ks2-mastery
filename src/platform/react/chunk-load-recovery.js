import { isChunkLoadError } from './chunk-load-detect.js';

export const CHUNK_RELOAD_SESSION_KEY = 'ks2_chunk_reload_attempted';

function readSessionStorage() {
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
}

function readLocation() {
  try {
    return globalThis.location || null;
  } catch {
    return null;
  }
}

export function clearChunkReloadAttempt(storage = readSessionStorage()) {
  try {
    storage?.removeItem?.(CHUNK_RELOAD_SESSION_KEY);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

export function scheduleChunkReloadOnce(error, {
  storage = readSessionStorage(),
  location = readLocation(),
  setTimeoutFn = globalThis.setTimeout,
} = {}) {
  if (!isChunkLoadError(error)) return false;
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') return false;
  if (!location || typeof location.reload !== 'function') return false;
  try {
    if (storage.getItem(CHUNK_RELOAD_SESSION_KEY) === '1') return false;
    storage.setItem(CHUNK_RELOAD_SESSION_KEY, '1');
  } catch {
    return false;
  }

  const reload = () => location.reload();
  if (typeof setTimeoutFn === 'function') {
    setTimeoutFn(reload, 0);
  } else {
    reload();
  }
  return true;
}
