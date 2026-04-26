import { uid } from '../core/utils.js';

const DEFAULT_RETRY_JITTER_MAX_MS = 125;
const DEFAULT_RETRY_MAX_DELAY_MS = 2_000;

function joinUrl(baseUrl, path) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  const suffix = String(path || '').startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

async function parseJson(response) {
  return response.json().catch(() => ({}));
}

function isStaleWriteConflict(error) {
  return error instanceof SubjectCommandClientError
    && error.status === 409
    && error.code === 'stale_write';
}

function isRetryableTransportFailure(error) {
  return error instanceof SubjectCommandClientError
    && error.retryable
    && !isStaleWriteConflict(error);
}

function sleep(ms) {
  const delay = Math.max(0, Number(ms) || 0);
  if (!delay) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function boundedRandom(random) {
  try {
    const raw = typeof random === 'function' ? Number(random()) : 0;
    if (!Number.isFinite(raw)) return 0;
    return Math.min(1, Math.max(0, raw));
  } catch {
    return 0;
  }
}

function retryDelayForAttempt(attempt, { baseDelayMs, jitterMaxMs, maxDelayMs, random }) {
  const exponent = Math.max(0, Number(attempt) || 0);
  const baseDelay = Math.max(0, Number(baseDelayMs) || 0) * (2 ** exponent);
  if (!baseDelay) return 0;
  const jitter = Math.floor(Math.max(0, Number(jitterMaxMs) || 0) * boundedRandom(random));
  const uncapped = baseDelay + jitter;
  const maxDelay = Math.max(0, Number(maxDelayMs) || 0);
  return maxDelay ? Math.min(maxDelay, uncapped) : uncapped;
}

function snapshotCommandPayload(payload) {
  if (payload === undefined) return {};
  const serialised = JSON.stringify(payload);
  return serialised === undefined ? undefined : JSON.parse(serialised);
}

function createCommandBody({
  cleanSubjectId,
  cleanLearnerId,
  cleanCommand,
  payloadSnapshot,
  requestId,
  expectedLearnerRevision,
}) {
  return JSON.stringify({
    subjectId: cleanSubjectId,
    learnerId: cleanLearnerId,
    command: cleanCommand,
    requestId,
    correlationId: requestId,
    expectedLearnerRevision,
    payload: payloadSnapshot,
  });
}

export class SubjectCommandClientError extends Error {
  constructor({ status = 0, payload = null, message = '' } = {}) {
    super(message || payload?.message || `Subject command failed (${status}).`);
    this.name = 'SubjectCommandClientError';
    this.status = Number(status) || 0;
    this.payload = payload;
    this.code = payload?.code || null;
    this.retryable = status >= 500 || status === 0 || (status === 409 && this.code === 'stale_write');
  }
}

export function createSubjectCommandClient({
  baseUrl = '',
  fetch: fetchFn = (input, init) => globalThis.fetch(input, init),
  getLearnerRevision = () => 0,
  onCommandApplied = () => {},
  onStaleWrite = null,
  retryAttempts = 2,
  retryDelayMs = 250,
  retryJitterMs = null,
  retryMaxDelayMs = DEFAULT_RETRY_MAX_DELAY_MS,
  random = Math.random,
  sleep: sleepFn = sleep,
} = {}) {
  if (typeof fetchFn !== 'function') {
    throw new TypeError('Subject command client requires a fetch implementation.');
  }

  const learnerCommandQueues = new Map();

  function enqueueLearnerCommand(learnerId, task) {
    const queueKey = learnerId || 'default';
    const previous = learnerCommandQueues.get(queueKey) || Promise.resolve();
    let queued;
    queued = previous.catch(() => {}).then(task).finally(() => {
      if (learnerCommandQueues.get(queueKey) === queued) {
        learnerCommandQueues.delete(queueKey);
      }
    });
    learnerCommandQueues.set(queueKey, queued);
    return queued;
  }

  async function sendOnce({ cleanSubjectId, requestId, body }) {
    // U3 audit: the command client sends the mutation's `requestId` on
    // the `x-ks2-request-id` header for legacy mutation-receipt
    // correlation. If that id does not match the Worker's ingress
    // validator (`ks2_req_` + UUID v4), the Worker rejects the header
    // value and server-generates a fresh one for capacity telemetry.
    // Mutation receipt idempotency is unaffected — that uses the body
    // `requestId`, not the header. See `worker/src/logger.js` for the
    // ingress-validator shape. U6 will add `isCommandBackendExhausted()`
    // alongside this function — the audit here is U3-only.
    let response;
    try {
      response = await fetchFn(joinUrl(baseUrl, `/api/subjects/${encodeURIComponent(cleanSubjectId)}/command`), {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-ks2-request-id': requestId,
          'x-ks2-correlation-id': requestId,
        },
        body,
      });
    } catch (error) {
      throw new SubjectCommandClientError({
        status: 0,
        payload: { code: 'subject_command_network_error' },
        message: error?.message || 'Subject command could not reach the server.',
      });
    }

    const responsePayload = await parseJson(response);
    if (!response.ok || responsePayload?.ok === false) {
      throw new SubjectCommandClientError({
        status: response.status,
        payload: responsePayload,
      });
    }

    return responsePayload;
  }

  async function sendWithRetry({ cleanSubjectId, cleanLearnerId, cleanCommand, payload, requestId }) {
    const maxRetryAttempts = Math.max(0, Number(retryAttempts) || 0);
    const baseRetryDelayMs = Math.max(0, Number(retryDelayMs) || 0);
    const retryJitterMaxMs = retryJitterMs == null
      ? Math.min(DEFAULT_RETRY_JITTER_MAX_MS, Math.floor(baseRetryDelayMs / 2))
      : Math.max(0, Number(retryJitterMs) || 0);
    const commandSleep = typeof sleepFn === 'function' ? sleepFn : sleep;
    let transportAttempts = 0;
    let staleWriteRetried = false;
    let expectedLearnerRevision = Number(getLearnerRevision(cleanLearnerId)) || 0;
    let payloadSnapshot;
    try {
      payloadSnapshot = snapshotCommandPayload(payload);
    } catch (error) {
      throw new SubjectCommandClientError({
        status: 400,
        payload: { code: 'subject_command_client_invalid_payload' },
        message: error?.message || 'Subject command payload must be JSON serialisable.',
      });
    }
    let body = createCommandBody({
      cleanSubjectId,
      cleanLearnerId,
      cleanCommand,
      payloadSnapshot,
      requestId,
      expectedLearnerRevision,
    });
    let responsePayload;

    while (!responsePayload) {
      try {
        responsePayload = await sendOnce({
          cleanSubjectId,
          requestId,
          body,
        });
      } catch (error) {
        if (isStaleWriteConflict(error) && !staleWriteRetried && typeof onStaleWrite === 'function') {
          staleWriteRetried = true;
          await onStaleWrite({
            error,
            learnerId: cleanLearnerId,
            subjectId: cleanSubjectId,
            command: cleanCommand,
            payload: snapshotCommandPayload(payloadSnapshot),
            requestId,
          });
          expectedLearnerRevision = Number(getLearnerRevision(cleanLearnerId)) || 0;
          transportAttempts = 0;
          body = createCommandBody({
            cleanSubjectId,
            cleanLearnerId,
            cleanCommand,
            payloadSnapshot,
            requestId,
            expectedLearnerRevision,
          });
          continue;
        }

        if (isRetryableTransportFailure(error) && transportAttempts < maxRetryAttempts) {
          const delayMs = retryDelayForAttempt(transportAttempts, {
            baseDelayMs: baseRetryDelayMs,
            jitterMaxMs: retryJitterMaxMs,
            maxDelayMs: retryMaxDelayMs,
            random,
          });
          transportAttempts += 1;
          await commandSleep(delayMs);
          continue;
        }

        throw error;
      }
    }

    onCommandApplied({
      learnerId: cleanLearnerId,
      subjectId: cleanSubjectId,
      response: responsePayload,
    });
    return responsePayload;
  }

  async function send({ subjectId, learnerId, command, payload = {}, requestId = uid('subject-command') } = {}) {
    const cleanSubjectId = String(subjectId || '').trim();
    const cleanLearnerId = String(learnerId || '').trim();
    const cleanCommand = String(command || '').trim();
    if (!cleanSubjectId || !cleanLearnerId || !cleanCommand) {
      throw new SubjectCommandClientError({
        status: 400,
        payload: { code: 'subject_command_client_invalid' },
        message: 'Subject command requires subject, learner, and command identifiers.',
      });
    }

    return enqueueLearnerCommand(cleanLearnerId, () => sendWithRetry({
      cleanSubjectId,
      cleanLearnerId,
      cleanCommand,
      payload,
      requestId,
    }));
  }

  return { send };
}
