export const CLIENT_FETCH_TIMEOUT_CODE = 'client_fetch_timeout';
export const DEFAULT_CLIENT_FETCH_TIMEOUT_MS = 15_000;

export class ClientFetchTimeoutError extends Error {
  constructor({ timeoutMs = DEFAULT_CLIENT_FETCH_TIMEOUT_MS, message = 'Request took too long to respond.' } = {}) {
    super(message);
    this.name = 'AbortError';
    this.code = CLIENT_FETCH_TIMEOUT_CODE;
    this.timeoutMs = timeoutMs;
    this.timedOut = true;
  }
}

export function isClientFetchTimeout(error) {
  return error?.code === CLIENT_FETCH_TIMEOUT_CODE || error?.timedOut === true;
}

export function normaliseClientFetchTimeoutMs(value, fallback = DEFAULT_CLIENT_FETCH_TIMEOUT_MS) {
  const source = value == null ? fallback : value;
  const timeoutMs = Number(source);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return 0;
  return Math.floor(timeoutMs);
}

export async function fetchWithClientTimeout(fetchFn, input, init = {}, options = {}) {
  const timeoutMs = normaliseClientFetchTimeoutMs(options.timeoutMs, DEFAULT_CLIENT_FETCH_TIMEOUT_MS);
  const requestInit = init && typeof init === 'object' ? init : {};
  const callerSignal = requestInit.signal;
  if (callerSignal?.aborted) throw abortErrorFromReason(callerSignal.reason);
  if (!timeoutMs && !callerSignal) return fetchFn(input, requestInit);

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const finalInit = controller ? { ...requestInit, signal: controller.signal } : requestInit;
  const racers = [];
  let timeoutHandle = null;
  let abortListener = null;
  let timeoutError = null;
  let timeoutFired = false;

  let fetchPromise;
  try {
    fetchPromise = Promise.resolve(fetchFn(input, finalInit)).catch((error) => {
      if (timeoutFired && isAbortError(error)) {
        throw timeoutError || new ClientFetchTimeoutError({
          timeoutMs,
          message: options.timeoutMessage || 'Request took too long to respond.',
        });
      }
      throw error;
    });
  } catch (error) {
    fetchPromise = Promise.reject(error);
  }
  fetchPromise.catch(() => {});
  racers.push(fetchPromise);

  if (timeoutMs) {
    racers.push(new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        timeoutFired = true;
        timeoutError = new ClientFetchTimeoutError({
          timeoutMs,
          message: options.timeoutMessage || 'Request took too long to respond.',
        });
        abortController(controller, timeoutError);
        reject(timeoutError);
      }, timeoutMs);
    }));
  }

  if (callerSignal) {
    racers.push(new Promise((_, reject) => {
      abortListener = () => {
        abortController(controller, callerSignal.reason);
        reject(abortErrorFromReason(callerSignal.reason));
      };
      callerSignal.addEventListener('abort', abortListener, { once: true });
    }));
  }

  try {
    return await Promise.race(racers);
  } finally {
    if (timeoutHandle != null) clearTimeout(timeoutHandle);
    if (callerSignal && abortListener) callerSignal.removeEventListener('abort', abortListener);
  }
}

function abortController(controller, reason) {
  if (!controller) return;
  try {
    controller.abort(reason);
  } catch {
    try {
      controller.abort();
    } catch {
      // Older runtimes can be inconsistent here; the timeout race still
      // rejects even when the underlying request cannot be signalled.
    }
  }
}

function isAbortError(error) {
  return error?.name === 'AbortError';
}

function abortErrorFromReason(reason) {
  if (reason instanceof Error) return reason;
  const error = new Error('Request was cancelled.');
  error.name = 'AbortError';
  if (reason !== undefined) error.reason = reason;
  return error;
}
