// mutation-repository.js — CAS mutation envelope, idempotency receipts, and
// the `withAccountMutation` / `withLearnerMutation` orchestrators. Extracted
// from repository.js (P3 U6 split) with ZERO behaviour change.

import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from './errors.js';
import {
  first,
  run,
  scalar,
} from './d1.js';
import {
  isPlainObject,
  logMutation,
  MUTATION_POLICY_VERSION,
  mutationPayloadHash,
  safeJsonParse,
} from './repository-helpers.js';
import {
  requireLearnerWriteAccess,
} from './membership-repository.js';

// ─── Mutation input normalisation ────────────────────────────────────────────

export function normaliseMutationInput(rawValue, scopeType) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const requestId = typeof raw.requestId === 'string' && raw.requestId ? raw.requestId : null;
  const correlationId = typeof raw.correlationId === 'string' && raw.correlationId
    ? raw.correlationId
    : requestId;
  const expectedRevisionKey = scopeType === 'account'
    ? 'expectedAccountRevision'
    : 'expectedLearnerRevision';
  const expectedRevision = Number.isFinite(Number(raw[expectedRevisionKey]))
    ? Number(raw[expectedRevisionKey])
    : null;

  if (!requestId) {
    throw new BadRequestError('Mutation requestId is required for write routes.', {
      code: 'mutation_request_id_required',
      scopeType,
    });
  }

  if (expectedRevision == null) {
    throw new BadRequestError(`Mutation ${expectedRevisionKey} is required for write routes.`, {
      code: 'mutation_revision_required',
      scopeType,
    });
  }

  return {
    requestId,
    correlationId,
    expectedRevision,
    expectedRevisionKey,
  };
}

// ─── Mutation meta builder ───────────────────────────────────────────────────

export function buildMutationMeta({
  kind,
  scopeType,
  scopeId,
  requestId,
  correlationId,
  expectedRevision,
  appliedRevision,
  replayed = false,
} = {}) {
  return {
    policyVersion: MUTATION_POLICY_VERSION,
    kind,
    scopeType,
    scopeId,
    requestId,
    correlationId,
    expectedRevision,
    appliedRevision,
    replayed,
  };
}

// ─── Mutation error factories ────────────────────────────────────────────────

export function staleWriteError({ kind, scopeType, scopeId, requestId, correlationId, expectedRevision, currentRevision }) {
  return new ConflictError('Mutation rejected because this state changed in another tab or device. Retry sync to reload the latest state, then repeat the action.', {
    code: 'stale_write',
    retryable: false,
    kind,
    scopeType,
    scopeId,
    requestId,
    correlationId,
    expectedRevision,
    currentRevision,
  });
}

export function idempotencyReuseError({ kind, scopeType, scopeId, requestId, correlationId }) {
  return new ConflictError('The same mutation request id was reused for a different payload.', {
    code: 'idempotency_reuse',
    retryable: false,
    kind,
    scopeType,
    scopeId,
    requestId,
    correlationId,
  });
}

// ─── Mutation receipt persistence ────────────────────────────────────────────

export async function loadMutationReceipt(db, accountId, requestId) {
  return first(db, `
    SELECT account_id, request_id, scope_type, scope_id, mutation_kind, request_hash, response_json, status_code, correlation_id, applied_at
    FROM mutation_receipts
    WHERE account_id = ? AND request_id = ?
  `, [accountId, requestId]);
}

export async function storeMutationReceipt(db, {
  accountId,
  requestId,
  scopeType,
  scopeId,
  mutationKind,
  requestHash,
  response,
  statusCode = 200,
  correlationId = null,
  appliedAt,
}) {
  await run(db, `
    INSERT INTO mutation_receipts (
      account_id,
      request_id,
      scope_type,
      scope_id,
      mutation_kind,
      request_hash,
      response_json,
      status_code,
      correlation_id,
      applied_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    accountId,
    requestId,
    scopeType,
    scopeId,
    mutationKind,
    requestHash,
    JSON.stringify(response),
    statusCode,
    correlationId,
    appliedAt,
  ]);
}

// NOTE: `storeMutationReceiptStatement` remains in repository.js because it
// depends on the guard helpers (guardedValueSource, guardedParams) which are
// tightly coupled to the persistence plan builder.

// ─── Mutation orchestrators ──────────────────────────────────────────────────

export async function withAccountMutation(db, {
  accountId,
  kind,
  payload,
  mutation,
  nowTs,
  apply,
  receiptResponse = (response) => response,
  replayResponse = null,
}) {
  const nextMutation = normaliseMutationInput(mutation, 'account');
  const requestHash = mutationPayloadHash(kind, payload);

  // NOTE: non-atomic by design — (a) branching on intermediate read results
  // (existingReceipt short-circuit, repo_revision CAS compare) plus (b) an
  // `apply()` callback that runs its own write path. `withTransaction` was
  // removed in U12 (production D1 no-op). The CAS UPDATE itself
  // (`WHERE repo_revision = ?`) is the authoritative stale-write defence.
  return (async () => {
    const existingReceipt = await loadMutationReceipt(db, accountId, nextMutation.requestId);
    if (existingReceipt) {
      if (existingReceipt.request_hash !== requestHash) {
        throw idempotencyReuseError({
          kind,
          scopeType: 'account',
          scopeId: accountId,
          requestId: nextMutation.requestId,
          correlationId: nextMutation.correlationId,
        });
      }
      const storedReplay = safeJsonParse(existingReceipt.response_json, {});
      const replayed = typeof replayResponse === 'function'
        ? await replayResponse({ storedReplay, existingReceipt, mutation: nextMutation })
        : storedReplay;
      replayed.mutation = buildMutationMeta({
        ...replayed.mutation,
        kind,
        scopeType: 'account',
        scopeId: accountId,
        requestId: nextMutation.requestId,
        correlationId: nextMutation.correlationId,
        replayed: true,
      });
      logMutation('info', 'mutation.replayed', {
        kind,
        scopeType: 'account',
        scopeId: accountId,
        requestId: nextMutation.requestId,
        correlationId: nextMutation.correlationId,
      });
      return replayed;
    }

    const account = await first(db, 'SELECT id, repo_revision FROM adult_accounts WHERE id = ?', [accountId]);
    if (!account) throw new NotFoundError('Account scope was not found.', { accountId });

    const casMeta = await run(db, `
      UPDATE adult_accounts
      SET repo_revision = repo_revision + 1,
          updated_at = ?
      WHERE id = ?
        AND repo_revision = ?
    `, [nowTs, accountId, nextMutation.expectedRevision]);
    const casChanges = Number(casMeta?.meta?.changes) || 0;
    if (casChanges !== 1) {
      const currentRevision = Number(await scalar(db, 'SELECT repo_revision FROM adult_accounts WHERE id = ?', [accountId], 'repo_revision')) || 0;
      throw staleWriteError({
        kind,
        scopeType: 'account',
        scopeId: accountId,
        requestId: nextMutation.requestId,
        correlationId: nextMutation.correlationId,
        expectedRevision: nextMutation.expectedRevision,
        currentRevision,
      });
    }

    const appliedRevision = nextMutation.expectedRevision + 1;
    const applied = await apply();
    const response = {
      ...applied,
      mutation: buildMutationMeta({
        kind,
        scopeType: 'account',
        scopeId: accountId,
        requestId: nextMutation.requestId,
        correlationId: nextMutation.correlationId,
        expectedRevision: nextMutation.expectedRevision,
        appliedRevision,
      }),
    };
    await storeMutationReceipt(db, {
      accountId,
      requestId: nextMutation.requestId,
      scopeType: 'account',
      scopeId: accountId,
      mutationKind: kind,
      requestHash,
      response: receiptResponse(response),
      correlationId: nextMutation.correlationId,
      appliedAt: nowTs,
    });
    logMutation('info', 'mutation.applied', {
      kind,
      scopeType: 'account',
      scopeId: accountId,
      requestId: nextMutation.requestId,
      correlationId: nextMutation.correlationId,
      expectedRevision: nextMutation.expectedRevision,
      appliedRevision,
    });
    return response;
  })();
}

export async function withLearnerMutation(db, {
  accountId,
  learnerId,
  kind,
  payload,
  mutation,
  nowTs,
  apply,
}) {
  if (!(typeof learnerId === 'string' && learnerId)) {
    throw new BadRequestError('Learner id is required for this mutation.', { code: 'learner_id_required', kind });
  }

  const nextMutation = normaliseMutationInput(mutation, 'learner');
  const requestHash = mutationPayloadHash(kind, payload);

  // NOTE: non-atomic by design — (a) branching on intermediate read results
  // (write-access check, existingReceipt short-circuit, state_revision CAS
  // compare) plus (b) an `apply()` callback that runs its own write path.
  // `withTransaction` was removed in U12 (silent production no-op). The
  // CAS UPDATE (`WHERE state_revision = ?`) is the stale-write defence.
  return (async () => {
    await requireLearnerWriteAccess(db, accountId, learnerId);
    const existingReceipt = await loadMutationReceipt(db, accountId, nextMutation.requestId);
    if (existingReceipt) {
      if (existingReceipt.request_hash !== requestHash) {
        throw idempotencyReuseError({
          kind,
          scopeType: 'learner',
          scopeId: learnerId,
          requestId: nextMutation.requestId,
          correlationId: nextMutation.correlationId,
        });
      }
      const replayed = safeJsonParse(existingReceipt.response_json, {});
      replayed.mutation = buildMutationMeta({
        ...replayed.mutation,
        kind,
        scopeType: 'learner',
        scopeId: learnerId,
        requestId: nextMutation.requestId,
        correlationId: nextMutation.correlationId,
        replayed: true,
      });
      logMutation('info', 'mutation.replayed', {
        kind,
        scopeType: 'learner',
        scopeId: learnerId,
        requestId: nextMutation.requestId,
        correlationId: nextMutation.correlationId,
      });
      return replayed;
    }

    const learner = await first(db, 'SELECT id FROM learner_profiles WHERE id = ?', [learnerId]);
    if (!learner) throw new NotFoundError('Learner was not found.', { learnerId });

    const casMeta = await run(db, `
      UPDATE learner_profiles
      SET state_revision = state_revision + 1,
          updated_at = ?
      WHERE id = ?
        AND state_revision = ?
    `, [nowTs, learnerId, nextMutation.expectedRevision]);
    const casChanges = Number(casMeta?.meta?.changes) || 0;
    if (casChanges !== 1) {
      const currentRevision = Number(await scalar(db, 'SELECT state_revision FROM learner_profiles WHERE id = ?', [learnerId], 'state_revision')) || 0;
      throw staleWriteError({
        kind,
        scopeType: 'learner',
        scopeId: learnerId,
        requestId: nextMutation.requestId,
        correlationId: nextMutation.correlationId,
        expectedRevision: nextMutation.expectedRevision,
        currentRevision,
      });
    }

    const appliedRevision = nextMutation.expectedRevision + 1;
    const applied = await apply();
    const response = {
      ...applied,
      mutation: buildMutationMeta({
        kind,
        scopeType: 'learner',
        scopeId: learnerId,
        requestId: nextMutation.requestId,
        correlationId: nextMutation.correlationId,
        expectedRevision: nextMutation.expectedRevision,
        appliedRevision,
      }),
    };
    await storeMutationReceipt(db, {
      accountId,
      requestId: nextMutation.requestId,
      scopeType: 'learner',
      scopeId: learnerId,
      mutationKind: kind,
      requestHash,
      response,
      correlationId: nextMutation.correlationId,
      appliedAt: nowTs,
    });
    logMutation('info', 'mutation.applied', {
      kind,
      scopeType: 'learner',
      scopeId: learnerId,
      requestId: nextMutation.requestId,
      correlationId: nextMutation.correlationId,
      expectedRevision: nextMutation.expectedRevision,
      appliedRevision,
    });
    return response;
  })();
}
