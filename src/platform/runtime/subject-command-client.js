import { uid } from '../core/utils.js';

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

  async function sendOnce({ cleanSubjectId, cleanLearnerId, cleanCommand, payload, requestId }) {
    const expectedLearnerRevision = Number(getLearnerRevision(cleanLearnerId)) || 0;
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
        body: JSON.stringify({
          subjectId: cleanSubjectId,
          learnerId: cleanLearnerId,
          command: cleanCommand,
          requestId,
          correlationId: requestId,
          expectedLearnerRevision,
          payload,
        }),
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
    let transportAttempts = 0;
    let staleWriteRetried = false;
    let responsePayload;

    while (!responsePayload) {
      try {
        responsePayload = await sendOnce({
          cleanSubjectId,
          cleanLearnerId,
          cleanCommand,
          payload,
          requestId,
        });
      } catch (error) {
        if (isStaleWriteConflict(error) && !staleWriteRetried && typeof onStaleWrite === 'function') {
          staleWriteRetried = true;
          await onStaleWrite({
            error,
            learnerId: cleanLearnerId,
            subjectId: cleanSubjectId,
            command: cleanCommand,
            payload,
            requestId,
          });
          continue;
        }

        if (isRetryableTransportFailure(error) && transportAttempts < maxRetryAttempts) {
          const delayMs = baseRetryDelayMs * (2 ** transportAttempts);
          transportAttempts += 1;
          await sleep(delayMs);
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
