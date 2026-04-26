// U12 / I9 coverage: batch atomicity for the two auth.js sites that
// P1.5 Phase C U12 converted away from `withTransaction` (production
// no-op) into genuine `batch()` calls.
//
// 1. `registerWithEmail` (fresh email registration path): INSERT into
//    adult_accounts + INSERT into account_credentials must commit as a
//    single atomic unit.
// 2. `findOrCreateAccountFromIdentity` (fresh OAuth identity path):
//    INSERT into adult_accounts + INSERT into account_identities must
//    commit as a single atomic unit.
//
// Atomicity signal: force the SECOND statement in each batch to fail.
// With the U12 conversion in place, the FIRST statement must NOT have
// committed. Before the conversion, the first INSERT would land with no
// audit trail for the accompanying row.
//
// References: docs/hardening/withtransaction-audit.md, PR #270 Phase C
// reviewer finding I9.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';

function productionServer() {
  return createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
    },
  });
}

async function postJson(server, path, body, headers = {}) {
  return server.fetchRaw(`https://repo.test${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function accountsCount(db) {
  return Number(db.db.prepare('SELECT COUNT(*) AS c FROM adult_accounts').get().c);
}

function credentialsCount(db) {
  return Number(db.db.prepare('SELECT COUNT(*) AS c FROM account_credentials').get().c);
}

function identitiesCount(db) {
  return Number(db.db.prepare('SELECT COUNT(*) AS c FROM account_identities').get().c);
}

// Patch the D1 batch so the Nth statement's .run() throws. Used to prove
// the full batch rolls back on partial failure — on the sqlite-D1 helper,
// batch() is implemented via a SAVEPOINT wrapper so every statement
// aborts together when one throws.
function makeBatchWithFailingStatement(d1, failingIndex) {
  const originalBatch = d1.batch.bind(d1);
  return async (statements) => {
    const patched = statements.map((stmt, idx) => {
      if (idx !== failingIndex) return stmt;
      return {
        async run() {
          throw new Error(`synthetic statement-${idx} failure for atomicity test`);
        },
        async first() { return null; },
        async all() { return { results: [], meta: {} }; },
      };
    });
    return originalBatch(patched);
  };
}

test('I9 registerWithEmail batch atomicity — credentials INSERT failure rolls back the account INSERT', async () => {
  const server = productionServer();
  try {
    // Preconditions: no accounts, no credentials.
    assert.equal(accountsCount(server.DB), 0);
    assert.equal(credentialsCount(server.DB), 0);

    // Monkey-patch batch so the second statement (credentials INSERT) throws.
    server.DB.batch = makeBatchWithFailingStatement(server.DB, 1);

    const response = await postJson(server, '/api/auth/register', {
      email: 'atomic@example.test',
      password: 'password-atomic-1234',
    });
    // Expect non-2xx; the specific code depends on error translation but the
    // failure must surface somewhere.
    assert.notEqual(response.status, 201);

    // Critical: NEITHER row landed. The batch was atomic — either both or
    // neither, and "neither" is the expected outcome when one fails.
    assert.equal(accountsCount(server.DB), 0, 'adult_accounts row must not land when credentials INSERT fails');
    assert.equal(credentialsCount(server.DB), 0, 'account_credentials row is absent as expected');
  } finally {
    server.close();
  }
});

test('I9 registerWithEmail happy path — both rows land when batch succeeds', async () => {
  // Regression sanity: with no monkey-patching, the normal flow lands both
  // rows. Keeps the atomicity test honest.
  const server = productionServer();
  try {
    const response = await postJson(server, '/api/auth/register', {
      email: 'atomic-happy@example.test',
      password: 'password-atomic-1234',
    });
    assert.equal(response.status, 201);
    assert.equal(accountsCount(server.DB), 1);
    assert.equal(credentialsCount(server.DB), 1);
  } finally {
    server.close();
  }
});

test('I9 findOrCreateAccountFromIdentity batch atomicity — identity INSERT failure rolls back the account INSERT', async () => {
  const server = productionServer();
  try {
    assert.equal(accountsCount(server.DB), 0);
    assert.equal(identitiesCount(server.DB), 0);

    // I-RE-4 (re-review Important): drive the production call site
    // directly via the `__findOrCreateAccountFromIdentityForTests` export
    // (added in auth.js). The prior version of this test had a fallback
    // path that exercised a synthetic shim with the same SQL shape — a
    // test-vs-production gap that silently accepted a missing export and
    // proved atomicity only for a hand-rolled probe. With the export in
    // place the shim fallback is removed; the test now covers the exact
    // production function.
    const authModule = await import('../worker/src/auth.js');
    const run = authModule.__findOrCreateAccountFromIdentityForTests;
    assert.equal(typeof run, 'function', '__findOrCreateAccountFromIdentityForTests must be exported from auth.js');

    // Monkey-patch batch so identity INSERT (statement index 1) throws.
    // The production function composes `[adult_accounts INSERT,
    // account_identities INSERT]` — failing index 1 exercises the exact
    // atomicity invariant we care about.
    server.DB.batch = makeBatchWithFailingStatement(server.DB, 1);

    let errored = false;
    try {
      await run({ DB: server.DB }, { provider: 'google', providerSubject: 'sub-1', email: 'id@example.test' });
    } catch {
      errored = true;
    }
    assert.equal(errored, true, 'batch-statement failure must surface');
    // Atomicity: neither row landed.
    assert.equal(accountsCount(server.DB), 0, 'adult_accounts row must not land when identity INSERT fails');
    assert.equal(identitiesCount(server.DB), 0, 'account_identities row is absent as expected');
  } finally {
    server.close();
  }
});

test('I-RE-4 findOrCreateAccountFromIdentity happy path — both rows land together when batch succeeds', async () => {
  // Regression sanity: with no monkey-patching, the production call site
  // lands both rows together. Keeps the atomicity test honest by proving
  // the shim is wiring up real batch() semantics, not a no-op mock.
  const server = productionServer();
  try {
    const authModule = await import('../worker/src/auth.js');
    const run = authModule.__findOrCreateAccountFromIdentityForTests;
    const accountId = await run({ DB: server.DB }, {
      provider: 'google',
      providerSubject: 'sub-happy',
      email: 'happy@example.test',
    });
    assert.ok(typeof accountId === 'string' && accountId.length > 0);
    assert.equal(accountsCount(server.DB), 1);
    assert.equal(identitiesCount(server.DB), 1);
  } finally {
    server.close();
  }
});
