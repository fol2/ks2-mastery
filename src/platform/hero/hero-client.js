/**
 * Client-side Hero Mode API wrapper.
 *
 * Calls GET /api/hero/read-model and POST /api/hero/command with the
 * correct Hero-specific shape.  Explicitly NOT a reuse of
 * createSubjectCommandClient — Hero commands reject `subjectId` and
 * `payload`; subject commands always send those.
 */

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
  constructor({ code = '', status = 0, retryable = false, payload = null, message = '' } = {}) {
    super(message || payload?.message || `Hero Mode request failed (${status}).`);
    this.name = 'HeroModeClientError';
    this.code = code || payload?.code || '';
    this.status = Number(status) || 0;
    this.payload = payload;

    // Honour explicit `retryable: false` from server payload (e.g.
    // projection_unavailable).  Otherwise fall back to heuristic:
    // 5xx and status-0 (network) are retryable by default.
    const explicitRetryable = payload && typeof payload === 'object'
      ? payload.retryable
      : undefined;
    if (retryable === true) {
      this.retryable = true;
    } else if (explicitRetryable === false) {
      this.retryable = false;
    } else if (retryable === false && explicitRetryable !== true) {
      this.retryable = false;
    } else {
      this.retryable = status >= 500 || status === 0;
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
// JSON parsing helper (mirrors subject-command-client.js)
// ---------------------------------------------------------------------------

async function parseJson(response) {
  return response.json().catch(() => ({}));
}

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
} = {}) {
  if (typeof fetchFn !== 'function') {
    throw new TypeError('Hero Mode client requires a fetch implementation.');
  }

  // -----------------------------------------------------------------------
  // readModel
  // -----------------------------------------------------------------------

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

    let response;
    try {
      response = await fetchFn(
        `/api/hero/read-model?learnerId=${encodeURIComponent(cleanLearnerId)}`,
        {
          method: 'GET',
          headers: { accept: 'application/json' },
        },
      );
    } catch (error) {
      throw new HeroModeClientError({
        code: 'network_error',
        status: 0,
        retryable: true,
        message: error?.message || 'Hero read-model request could not reach the server.',
      });
    }

    const payload = await parseJson(response);
    if (!response.ok || payload?.ok === false) {
      throw new HeroModeClientError({
        code: payload?.code || payload?.error || '',
        status: response.status,
        payload,
      });
    }

    return payload;
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

    let response;
    try {
      response = await fetchFn('/api/hero/command', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body,
      });
    } catch (error) {
      throw new HeroModeClientError({
        code: 'network_error',
        status: 0,
        retryable: true,
        message: error?.message || 'Hero command request could not reach the server.',
      });
    }

    const responsePayload = await parseJson(response);

    if (!response.ok || responsePayload?.ok === false) {
      const errorCode = responsePayload?.code || responsePayload?.error || '';
      const heroError = new HeroModeClientError({
        code: errorCode,
        status: response.status,
        payload: responsePayload,
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

    let response;
    try {
      response = await fetchFn('/api/hero/command', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new HeroModeClientError({
        code: 'network_error',
        status: 0,
        retryable: true,
        message: error?.message || 'Hero claim-task request could not reach the server.',
      });
    }

    const responsePayload = await parseJson(response);

    // Auto-retry once on stale_write (revision conflict)
    if (!response.ok && responsePayload?.code === 'stale_write') {
      if (typeof onStaleWrite === 'function') {
        onStaleWrite({
          error: new HeroModeClientError({
            code: 'stale_write',
            status: response.status,
            payload: responsePayload,
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

      let retryResponse;
      try {
        retryResponse = await fetchFn('/api/hero/command', {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify(retryBody),
        });
      } catch (error) {
        throw new HeroModeClientError({
          code: 'network_error',
          status: 0,
          retryable: true,
          message: error?.message || 'Hero claim-task retry could not reach the server.',
        });
      }

      const retryPayload = await parseJson(retryResponse);

      if (!retryResponse.ok) {
        throw new HeroModeClientError({
          code: retryPayload?.code || retryPayload?.error || 'hero_claim_failed',
          status: retryResponse.status,
          retryable: false,
          payload: retryPayload,
        });
      }

      return retryPayload;
    }

    // Non-stale errors
    if (!response.ok || responsePayload?.ok === false) {
      const errorCode = responsePayload?.code || responsePayload?.error || 'hero_claim_failed';
      const heroError = new HeroModeClientError({
        code: errorCode,
        status: response.status,
        payload: responsePayload,
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

    let response;
    try {
      response = await fetchFn('/api/hero/command', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new HeroModeClientError({
        code: 'network_error',
        status: 0,
        retryable: true,
        message: error?.message || 'Hero unlock-monster request could not reach the server.',
      });
    }

    const responsePayload = await parseJson(response);

    if (!response.ok || responsePayload?.ok === false) {
      const errorCode = responsePayload?.code || responsePayload?.error || 'hero_unlock_failed';
      const heroError = new HeroModeClientError({
        code: errorCode,
        status: response.status,
        payload: responsePayload,
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

    let response;
    try {
      response = await fetchFn('/api/hero/command', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new HeroModeClientError({
        code: 'network_error',
        status: 0,
        retryable: true,
        message: error?.message || 'Hero evolve-monster request could not reach the server.',
      });
    }

    const responsePayload = await parseJson(response);

    if (!response.ok || responsePayload?.ok === false) {
      const errorCode = responsePayload?.code || responsePayload?.error || 'hero_evolve_failed';
      const heroError = new HeroModeClientError({
        code: errorCode,
        status: response.status,
        payload: responsePayload,
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
