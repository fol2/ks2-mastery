import {
  fetchWithClientTimeout,
  isClientFetchTimeout,
} from '../core/fetch-timeout.js';

const DEFAULT_READ_MODEL_TIMEOUT_MS = 15_000;

function joinUrl(baseUrl, path) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  const suffix = String(path || '').startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

export function createReadModelClient({
  baseUrl = '',
  fetch: fetchFn = (input, init) => globalThis.fetch(input, init),
  timeoutMs = DEFAULT_READ_MODEL_TIMEOUT_MS,
} = {}) {
  if (typeof fetchFn !== 'function') {
    throw new TypeError('Read-model client requires a fetch implementation.');
  }

  async function readJson(path) {
    let response;
    try {
      response = await fetchWithClientTimeout(fetchFn, joinUrl(baseUrl, path), {
        method: 'GET',
        headers: { accept: 'application/json' },
      }, {
        timeoutMs,
        timeoutMessage: 'Read model request took too long to respond.',
      });
    } catch (error) {
      const timedOut = isClientFetchTimeout(error);
      const wrapped = new Error(error?.message || (timedOut
        ? 'Read model request took too long to respond.'
        : 'Read model request could not reach the server.'));
      wrapped.status = 0;
      wrapped.code = timedOut ? 'read_model_timeout' : 'read_model_network_error';
      wrapped.payload = { code: wrapped.code };
      wrapped.cause = error;
      throw wrapped;
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      const error = new Error(payload?.message || `Read model request failed (${response.status}).`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  return { readJson };
}
