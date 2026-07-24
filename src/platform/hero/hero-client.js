/**
 * Client-side Hero Mode API wrapper.
 *
 * Calls GET /api/hero/read-model and POST /api/hero/command with the
 * correct Hero-specific shape.  Explicitly NOT a reuse of
 * createSubjectCommandClient — Hero commands reject `subjectId` and
 * `payload`; subject commands always send those.
 */

import {
  createIngressRequestId,
  reportIngressRequestFailure,
} from '../core/request-id.js';

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class HeroModeClientError extends Error {
  /**
   * @param {object} opts
   * @param {string}  [opts.code]      — typed error code
   * @param {number}  [opts.status]    — HTTP status (0 for network errors)
   * @param {boolean} [opts.retryable] — whether the caller may retry
   * @param {object}  [opts.payload]   — full server response body
   * @param {string}  [opts.message]   — human-readable message
   */
  constructor({
    code = '',
    status = undefined,
    retryable = undefined,
    payload = null,
    message = '',
    requestId = '',
    correlationId = '',
  } = {}) {
    const numericStatus = Number(status) || 0;
    super(message || payload?.message || `Hero Mode request failed (${numericStatus}).`);
    this.name = 'HeroModeClientError';
    this.code = code || payload?.code || '';
    this.status = numericStatus;
    this.payload = payload;
    this.requestId = requestId || payload?.requestId || '';
    this.correlationId = correlationId || payload?.correlationId || this.requestId;

    // Honour explicit `retryable: false` from server payload (e.g.
    // projection_unavailable).  Otherwise fall back to heuristic:
    // 5xx and status-0 (network) are retryable by default.
    const explicitRetryable = payload && typeof payload === 'object'
      ? payload.retryable
      : undefined;
    if (retryable === true || explicitRetryable === true) {
      this.retryable = true;
    } else if (explicitRetryable === false || retryable === false) {
      this.retryable = false;
    } else {
      this.retryable = status !== undefined && (numericStatus >= 500 || numericStatus === 0);
    }
  }
}

// ---------------------------------------------------------------------------
// Known stale-write error codes that trigger onStaleWrite callback
// ---------------------------------------------------------------------------

const STALE_WRITE_CODES = new Set([
  'hero_quest_stale',
  'hero_quest_fingerprint_mismatch',
]);

// ---------------------------------------------------------------------------
// Error code extraction — handles both flat and nested response shapes
// ---------------------------------------------------------------------------

export function extractErrorCode(payload) {
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.code === 'string' && payload.code) return payload.code;
  if (payload.error && typeof payload.error === 'object' && typeof payload.error.code === 'string') return payload.error.code;
  if (typeof payload.error === 'string' && payload.error) return payload.error;
  return '';
}

// ---------------------------------------------------------------------------
// JSON parsing helper (mirrors subject-command-client.js)
// ---------------------------------------------------------------------------

async function parseJson(response) {
  return response.json().catch(() => ({}));
}

function defaultDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normaliseRetryCount(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function normaliseRetryDelayMs(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
}

const DEFAULT_READ_MODEL_RETRY_ATTEMPTS = 2;
const DEFAULT_READ_MODEL_RETRY_DELAY_MS = 150;
const DEFAULT_READ_MODEL_RETRY_MAX_DELAY_MS = 600;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * @param {object}   opts
 * @param {function} opts.fetch               — credentialFetch (same-origin, credentials included)
 * @param {function} opts.getLearnerRevision   — (learnerId) => number
 * @param {function} [opts.onLaunchApplied]   — called on successful startTask
 * @param {function} [opts.onStaleWrite]      — called on stale-quest / fingerprint-mismatch
 */
export function createHeroModeClient({
  fetch: fetchFn,
  getLearnerRevision,
  onLaunchApplied,
  onStaleWrite,
  readModelRetryAttempts = DEFAULT_READ_MODEL_RETRY_ATTEMPTS,
  readModelRetryDelayMs = DEFAULT_READ_MODEL_RETRY_DELAY_MS,
  readModelRetryMaxDelayMs = DEFAULT_READ_MODEL_RETRY_MAX_DELAY_MS,
  delay = defaultDelay,
} = {}) {
  if (typeof fetchFn !== 'function') {
    throw new TypeError('Hero Mode client requires a fetch implementation.');
  }

  const maxReadModelAttempts = 1 + normaliseRetryCount(
    readModelRetryAttempts,
    DEFAULT_READ_MODEL_RETRY_ATTEMPTS,
  );
  const retryDelayMs = normaliseRetryDelayMs(
    readModelRetryDelayMs,
    DEFAULT_READ_MODEL_RETRY_DELAY_MS,
  );
  const retryMaxDelayMs = normaliseRetryDelayMs(
    readModelRetryMaxDelayMs,
    DEFAULT_READ_MODEL_RETRY_MAX_DELAY_MS,
  );

  async function waitBeforeReadModelRetry(attemptIndex) {
    if (typeof delay !== 'function' || retryDelayMs <= 0) return;
    const boundedDelayMs = Math.min(retryMaxDelayMs, retryDelayMs * (2 ** attemptIndex));
    if (boundedDelayMs <= 0) return;
    await delay(boundedDelayMs);
  }

  async function sendRequest(url, init, networkMessage) {
    const requestId = createIngressRequestId();
    const headers = new Headers(init?.headers || {});
    headers.set('x-ks2-request-id', requestId);
    try {
      const response = await fetchFn(url, {
        ...init,
        headers: Object.fromEntries(headers.entries()),
      });
      if (!response.ok) {
        reportIngressRequestFailure({
          endpoint: url,
          method: init?.method,
          status: response.status,
          requestId,
        });
      }
      return { response, requestId };
    } catch (error) {
      reportIngressRequestFailure({
        endpoint: url,
        method: init?.method,
        status: 0,
        requestId,
        text: error?.message || String(error),
      });
      throw new HeroModeClientError({
        code: 'network_error',
        status: 0,
        retryable: true,
        message: error?.message || networkMessage,
        requestId,
        correlationId: requestId,
      });
    }
  }

  // -----------------------------------------------------------------------
  // readModel
  // -----------------------------------------------------------------------

  async function fetchReadModel(cleanLearnerId) {
    const { response, requestId } = await sendRequest(
      `/api/hero/read-model?learnerId=${encodeURIComponent(cleanLearnerId)}`,
      {
        method: 'GET',
        headers: { accept: 'application/json' },
      },
      'Hero read-model request could not reach the server.',
    );

    const payload = await parseJson(response);
    if (!response.ok || payload?.ok === false) {
      throw new HeroModeClientError({
        code: extractErrorCode(payload),
        status: response.status,
        payload,
        requestId,
        correlationId: requestId,
      });
    }

    return payload;
  }

  async function readModel({ learnerId } = {}) {
    const cleanLearnerId = String(learnerId || '').trim();
    if (!cleanLearnerId) {
      throw new HeroModeClientError({
        code: 'hero_client_invalid',
        status: 400,
        retryable: false,
        message: 'readModel requires a learnerId.',
      });
    }

    let lastError = null;
    for (let attemptIndex = 0; attemptIndex < maxReadModelAttempts; attemptIndex += 1) {
      try {
        return await fetchReadModel(cleanLearnerId);
      } catch (error) {
        lastError = error;
        const canRetry = error instanceof HeroModeClientError
          && error.retryable
          && attemptIndex < maxReadModelAttempts - 1;
        if (!canRetry) throw error;
        await waitBeforeReadModelRetry(attemptIndex);
      }
    }

    throw lastError;
  }

  // -----------------------------------------------------------------------
  // startTask
  // -----------------------------------------------------------------------

  async function startTask({ learnerId, questId, questFingerprint, taskId, requestId } = {}) {
    const cleanLearnerId = String(learnerId || '').trim();
    if (!cleanLearnerId || !questId || !taskId || !requestId) {
      throw new HeroModeClientError({
        code: 'hero_client_invalid',
        status: 400,
        retryable: false,
        message: 'startTask requires learnerId, questId, taskId, and requestId.',
      });
    }

    const expectedLearnerRevision = typeof getLearnerRevision === 'function'
      ? Number(getLearnerRevision(cleanLearnerId)) || 0
      : 0;

    // Body shape: Hero command — no subjectId, no payload.
    const body = JSON.stringify({
      command: 'start-task',
      learnerId: cleanLearnerId,
      questId,
      questFingerprint: questFingerprint ?? null,
      taskId,
      requestId,
      correlationId: requestId,
      expectedLearnerRevision,
    });

    const { response, requestId: ingressRequestId } = await sendRequest(
      '/api/hero/command',
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body,
      },
      'Hero command request could not reach the server.',
    );

    const responsePayload = await parseJson(response);

    if (!response.ok || responsePayload?.ok === false) {
      const errorCode = extractErrorCode(responsePayload);
      const heroError = new HeroModeClientError({
        code: errorCode,
        status: response.status,
        payload: responsePayload,
        requestId: ingressRequestId,
        correlationId: ingressRequestId,
      });

      // Stale-write callback (stale quest or fingerprint mismatch)
      if (STALE_WRITE_CODES.has(errorCode) && typeof onStaleWrite === 'function') {
        onStaleWrite({ error: heroError, learnerId: cleanLearnerId });
      }

      // No auto-retry — throw immediately for all errors
      throw heroError;
    }

    // Success path — notify caller
    if (typeof onLaunchApplied === 'function') {
      onLaunchApplied(responsePayload);
    }

    return responsePayload;
  }

  // -----------------------------------------------------------------------
  // claimTask
  // -----------------------------------------------------------------------

  async function claimTask({ learnerId, questId, questFingerprint, taskId, requestId, practiceSessionId } = {}) {
    const cleanLearnerId = String(learnerId || '').trim();
    if (!cleanLearnerId || !questId || !taskId || !requestId) {
      throw new HeroModeClientError({
        code: 'hero_client_invalid',
        status: 400,
        retryable: false,
        message: 'claimTask requires learnerId, questId, taskId, and requestId.',
      });
    }

    const correlationId = `hero-claim-${Date.now().toString(36)}`;
    const expectedLearnerRevision = typeof getLearnerRevision === 'function'
      ? Number(getLearnerRevision(cleanLearnerId)) || 0
      : 0;

    // Body shape: Hero claim command.
    // NEVER include subjectId, payload, coins, or reward — those are
    // subject-command fields and the Hero endpoint rejects them.
    const body = {
      command: 'claim-task',
      learnerId: cleanLearnerId,
      questId,
      questFingerprint: questFingerprint ?? null,
      taskId,
      requestId,
      correlationId,
      expectedLearnerRevision,
    };

    // Optional hint — only include when explicitly provided
    if (practiceSessionId) {
      body.practiceSessionId = practiceSessionId;
    }

    const { response, requestId: ingressRequestId } = await sendRequest(
      '/api/hero/command',
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      'Hero claim-task request could not reach the server.',
    );

    const responsePayload = await parseJson(response);

    // Auto-retry once on stale_write (revision conflict)
    if (!response.ok && extractErrorCode(responsePayload) === 'stale_write') {
      if (typeof onStaleWrite === 'function') {
        onStaleWrite({
          error: new HeroModeClientError({
            code: 'stale_write',
            status: response.status,
            payload: responsePayload,
            requestId: ingressRequestId,
            correlationId: ingressRequestId,
          }),
          learnerId: cleanLearnerId,
        });
      }

      const freshRevision = typeof getLearnerRevision === 'function'
        ? Number(getLearnerRevision(cleanLearnerId)) || 0
        : 0;

      const retryBody = {
        ...body,
        expectedLearnerRevision: freshRevision,
        requestId: `${requestId}-retry`,
      };

      const { response: retryResponse, requestId: retryIngressRequestId } = await sendRequest(
        '/api/hero/command',
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify(retryBody),
        },
        'Hero claim-task retry could not reach the server.',
      );

      const retryPayload = await parseJson(retryResponse);

      if (!retryResponse.ok) {
        throw new HeroModeClientError({
          code: extractErrorCode(retryPayload) || 'hero_claim_failed',
          status: retryResponse.status,
          retryable: false,
          payload: retryPayload,
          requestId: retryIngressRequestId,
          correlationId: retryIngressRequestId,
        });
      }

      return retryPayload;
    }

    // Non-stale errors
    if (!response.ok || responsePayload?.ok === false) {
      const errorCode = extractErrorCode(responsePayload) || 'hero_claim_failed';
      const heroError = new HeroModeClientError({
        code: errorCode,
        status: response.status,
        payload: responsePayload,
        requestId: ingressRequestId,
        correlationId: ingressRequestId,
      });

      // Stale-write callback (stale quest or fingerprint mismatch)
      if (STALE_WRITE_CODES.has(errorCode) && typeof onStaleWrite === 'function') {
        onStaleWrite({ error: heroError, learnerId: cleanLearnerId });
      }

      throw heroError;
    }

    // Success — includes 'already-completed' which is a 200 success case
    return responsePayload;
  }

  // -----------------------------------------------------------------------
  // unlockMonster
  // -----------------------------------------------------------------------

  async function unlockMonster({ learnerId, monsterId, branch, requestId } = {}) {
    const cleanLearnerId = String(learnerId || '').trim();
    if (!cleanLearnerId || !monsterId || !requestId) {
      throw new HeroModeClientError({
        code: 'hero_client_invalid',
        status: 400,
        retryable: false,
        message: 'unlockMonster requires learnerId, monsterId, and requestId.',
      });
    }

    const expectedLearnerRevision = typeof getLearnerRevision === 'function'
      ? Number(getLearnerRevision(cleanLearnerId)) || 0
      : 0;

    // Body shape: Hero unlock-monster command.
    // NEVER send cost, amount, balance, ledgerEntryId, stage, owned, payload.
    const body = {
      command: 'unlock-monster',
      learnerId: cleanLearnerId,
      monsterId,
      branch: branch ?? null,
      requestId,
      expectedLearnerRevision,
    };

    const { response, requestId: ingressRequestId } = await sendRequest(
      '/api/hero/command',
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      'Hero unlock-monster request could not reach the server.',
    );

    const responsePayload = await parseJson(response);

    if (!response.ok || responsePayload?.ok === false) {
      const errorCode = extractErrorCode(responsePayload) || 'hero_unlock_failed';
      const heroError = new HeroModeClientError({
        code: errorCode,
        status: response.status,
        payload: responsePayload,
        requestId: ingressRequestId,
        correlationId: ingressRequestId,
      });

      if (errorCode === 'stale_write' && typeof onStaleWrite === 'function') {
        onStaleWrite({ error: heroError, learnerId: cleanLearnerId });
      }

      throw heroError;
    }

    return responsePayload;
  }

  // -----------------------------------------------------------------------
  // evolveMonster
  // -----------------------------------------------------------------------

  async function evolveMonster({ learnerId, monsterId, targetStage, requestId } = {}) {
    const cleanLearnerId = String(learnerId || '').trim();
    if (!cleanLearnerId || !monsterId || targetStage == null || !requestId) {
      throw new HeroModeClientError({
        code: 'hero_client_invalid',
        status: 400,
        retryable: false,
        message: 'evolveMonster requires learnerId, monsterId, targetStage, and requestId.',
      });
    }

    const expectedLearnerRevision = typeof getLearnerRevision === 'function'
      ? Number(getLearnerRevision(cleanLearnerId)) || 0
      : 0;

    // Body shape: Hero evolve-monster command.
    // NEVER send cost, amount, balance, ledgerEntryId, stage, owned, payload.
    const body = {
      command: 'evolve-monster',
      learnerId: cleanLearnerId,
      monsterId,
      targetStage,
      requestId,
      expectedLearnerRevision,
    };

    const { response, requestId: ingressRequestId } = await sendRequest(
      '/api/hero/command',
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      'Hero evolve-monster request could not reach the server.',
    );

    const responsePayload = await parseJson(response);

    if (!response.ok || responsePayload?.ok === false) {
      const errorCode = extractErrorCode(responsePayload) || 'hero_evolve_failed';
      const heroError = new HeroModeClientError({
        code: errorCode,
        status: response.status,
        payload: responsePayload,
        requestId: ingressRequestId,
        correlationId: ingressRequestId,
      });

      if (errorCode === 'stale_write' && typeof onStaleWrite === 'function') {
        onStaleWrite({ error: heroError, learnerId: cleanLearnerId });
      }

      throw heroError;
    }

    return responsePayload;
  }

  return { readModel, startTask, claimTask, unlockMonster, evolveMonster };
}
