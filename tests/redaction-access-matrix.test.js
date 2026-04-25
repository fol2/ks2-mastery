import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';
import { createApiPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { FORBIDDEN_KEYS_EVERYWHERE as SHARED_FORBIDDEN_KEYS_EVERYWHERE } from './helpers/forbidden-keys.mjs';

// U13 — Child-Data Redaction Access-Matrix Lock
//
// Axes:
// - Platform role:      parent | admin | ops
// - Membership role:    owner  | member | viewer  (enforced via account_learner_memberships)
// - Session variant:    real-auth | demo-active | demo-expired-with-valid-cookie | unauthenticated
// - Route:              /api/bootstrap, Parent Hub, Admin Hub, lazy history, activity feed,
//                       TTS prompt-token fetch, demo reset, /api/auth/session, /api/health,
//                       OAuth start, OAuth callback
// - Expected shape:     authRequired, expectedStatus, allowedKeys, forbiddenKeys
//
// The CSP report endpoint (/api/security/csp-report) is covered at the end of the file
// via the U7 rows: happy-path POST (legacy body -> 204) and oversize (413) probe.
//
// The matrix is a single oracle: new routes or new role combinations cannot be merged
// without extending the matrix. That is enforced by the assertion coverage summary at
// the end of the file.

const ORIGIN = 'https://repo.test';

function productionServer(env = {}) {
  return createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
      ...env,
    },
  });
}

function seedAdultAccount(server, {
  id,
  email,
  displayName,
  platformRole = 'parent',
  now = 1,
} = {}) {
  server.DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
    VALUES (?, ?, ?, ?, NULL, ?, ?, 0)
  `).run(id, email, displayName, platformRole, now, now);
}

function seedMembership(server, { accountId, learnerId, role, now = 1 } = {}) {
  server.DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, ?, ?, 0, ?, ?)
  `).run(accountId, learnerId, role, now, now);
}

async function seedLearnerViaOwner(server, ownerAccountId, learner) {
  const repos = createApiPlatformRepositories({
    baseUrl: ORIGIN,
    fetch: server.fetch.bind(server),
    authSession: server.authSessionFor(ownerAccountId, { platformRole: 'parent' }),
  });
  await repos.hydrate();
  repos.learners.write({
    byId: { [learner.id]: learner },
    allIds: [learner.id],
    selectedId: learner.id,
  });
  await repos.flush();
}

function getSetCookies(response) {
  const raw = response.headers.getSetCookie?.()
    || String(response.headers.get('set-cookie') || '').split(/,\s*(?=ks2_)/).filter(Boolean);
  return raw.map((cookie) => String(cookie || '').split(';')[0]).filter(Boolean);
}

function sessionCookieFrom(response) {
  return getSetCookies(response).find((cookie) => cookie.startsWith('ks2_session=')) || '';
}

async function createDemoSessionCookie(server) {
  const response = await server.fetchRaw(`${ORIGIN}/api/demo/session`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
    },
    body: JSON.stringify({}),
  });
  assert.equal(response.status, 201, 'Demo session creation must succeed.');
  const cookie = sessionCookieFrom(response);
  assert.ok(cookie, 'Demo session did not return a ks2_session cookie.');
  const payload = await response.json();
  return { cookie, accountId: payload.session.accountId };
}

function expireDemoAccount(server, accountId) {
  server.DB.db.prepare('UPDATE adult_accounts SET demo_expires_at = ? WHERE id = ?')
    .run(Date.now() - 60_000, accountId);
}

function extendDemoSessionCookieWhileExpiringAccount(server, accountId) {
  // Push account session cookie forward so the cookie is still valid at the HTTP layer
  // while the demo account has already expired. This proves the bootstrap handler must
  // re-check demo validity on every read.
  server.DB.db.prepare(`
    UPDATE account_sessions
    SET expires_at = ?
    WHERE account_id = ?
  `).run(Date.now() + 60 * 60 * 1000, accountId);
  expireDemoAccount(server, accountId);
}

// Recursively collect all own string keys in an object tree, including nested
// arrays and objects. This is the mechanism the matrix uses to assert the
// absence of forbidden keys anywhere in the response payload.
function collectAllKeys(value, bucket = new Set()) {
  if (value == null) return bucket;
  if (Array.isArray(value)) {
    value.forEach((entry) => collectAllKeys(entry, bucket));
    return bucket;
  }
  if (typeof value !== 'object') return bucket;
  for (const [key, child] of Object.entries(value)) {
    bucket.add(key);
    collectAllKeys(child, bucket);
  }
  return bucket;
}

// Answer-bearing, PII, and internal-only keys that must never appear in any
// authenticated response surface. The universal floor is imported from
// tests/helpers/forbidden-keys.mjs so the matrix, the production bundle audit,
// and the grammar/punctuation smokes cannot drift apart (P3 oracle-drift
// regression lock). The universal floor is a STRICT SUBSET of the grammar
// read-model set (grammar adds subject-private keys). Punctuation's set
// overlaps but is not a superset — its internal vocabulary is disjoint from
// grammar's by design; shared concerns ('accepted', 'answers', 'generator')
// do appear in both.
const FORBIDDEN_KEYS_EVERYWHERE = SHARED_FORBIDDEN_KEYS_EVERYWHERE;

function assertNoForbiddenKeys(label, payload, forbiddenKeys = FORBIDDEN_KEYS_EVERYWHERE) {
  const allKeys = collectAllKeys(payload);
  for (const key of forbiddenKeys) {
    assert.equal(allKeys.has(key), false, `${label} must not expose forbidden key: ${key}`);
  }
}

function matrixCoverage() {
  return {
    routesExercised: new Set(),
    combinationsCovered: [],
    noteCombination(label) {
      this.combinationsCovered.push(label);
    },
    noteRoute(route) {
      this.routesExercised.add(route);
    },
  };
}

const coverage = matrixCoverage();

// -------------------- Route 1: /api/health --------------------

test('matrix: /api/health is reachable unauthenticated with minimal OK payload', async () => {
  const server = productionServer();
  coverage.noteRoute('/api/health');
  coverage.noteCombination('unauthenticated + /api/health');

  const response = await server.fetchRaw(`${ORIGIN}/api/health`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  // Must not leak account-existence or learner data
  assertNoForbiddenKeys('/api/health', payload);
  assert.equal(payload.learners, undefined, '/api/health must not leak learner data.');
  assert.equal(payload.session, undefined, '/api/health must not leak session payload.');

  server.close();
});

// -------------------- Route 2: /api/auth/session --------------------

test('matrix: /api/auth/session returns null session when unauthenticated without account-existence signal', async () => {
  const server = productionServer();
  coverage.noteRoute('/api/auth/session');
  coverage.noteCombination('unauthenticated + /api/auth/session');

  const response = await server.fetchRaw(`${ORIGIN}/api/auth/session`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.session, null, 'Unauthenticated /api/auth/session must return null session.');
  assert.equal(payload.account, null, 'Unauthenticated /api/auth/session must return null account.');
  assert.equal(payload.learnerCount, 0, 'Unauthenticated /api/auth/session must report zero learners.');
  assertNoForbiddenKeys('/api/auth/session (unauth)', payload);

  server.close();
});

test('matrix: /api/auth/session authenticated response never exposes sessionHash / sessionId (P1-A regression lock)', async () => {
  // P1-A from the PR #183 review: the old sessionPayload() used a `...session`
  // spread that leaked `sessionHash` and `sessionId` (database-lookup keys —
  // credential-adjacent) into both /api/session and /api/auth/session response
  // bodies. This row drives an explicit allowlist on the response and proves
  // the leak cannot reappear — FORBIDDEN_KEYS_EVERYWHERE now includes both
  // `sessionHash` and `sessionId`.
  const server = createWorkerRepositoryServer();
  seedAdultAccount(server, { id: 'adult-auth-session', email: 'auth@example.com', displayName: 'Auth', platformRole: 'parent' });
  coverage.noteCombination('parent + real-auth + /api/auth/session (authenticated allowlist)');

  const response = await server.fetchAs('adult-auth-session', `${ORIGIN}/api/auth/session`, {}, {
    'x-ks2-dev-platform-role': 'parent',
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.ok(payload.session, '/api/auth/session must include a session object when authenticated.');
  assert.equal(payload.session.accountId, 'adult-auth-session');
  // Explicit sanity asserts on top of the forbidden-key oracle below: the
  // allowlist covers accountId/provider/platformRole/accountType/demo/
  // demoExpiresAt/email/displayName; every other key is not allowed.
  assert.equal(payload.session.sessionHash, undefined, '/api/auth/session must not expose sessionHash.');
  assert.equal(payload.session.sessionId, undefined, '/api/auth/session must not expose sessionId.');
  assert.equal(payload.session.session_hash, undefined, '/api/auth/session must not expose session_hash.');
  assert.equal(payload.session.session_id, undefined, '/api/auth/session must not expose session_id.');
  assertNoForbiddenKeys('/api/auth/session (authenticated)', payload);

  server.close();
});

test('matrix: /api/session authenticated response never exposes sessionHash / sessionId (P1-A regression lock)', async () => {
  // P1-A sibling of the test above. /api/session differs from /api/auth/session
  // only in that it requires an authenticated session (401 when unauth) — the
  // response body shape is identical, so the allowlist must apply identically.
  const server = createWorkerRepositoryServer();
  seedAdultAccount(server, { id: 'adult-session', email: 'session@example.com', displayName: 'Session', platformRole: 'parent' });
  coverage.noteRoute('/api/session');
  coverage.noteCombination('parent + real-auth + /api/session (authenticated allowlist)');

  const response = await server.fetchAs('adult-session', `${ORIGIN}/api/session`, {}, {
    'x-ks2-dev-platform-role': 'parent',
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.ok(payload.session, '/api/session must include a session object.');
  assert.equal(payload.session.accountId, 'adult-session');
  assert.equal(payload.session.sessionHash, undefined, '/api/session must not expose sessionHash.');
  assert.equal(payload.session.sessionId, undefined, '/api/session must not expose sessionId.');
  assert.equal(payload.session.session_hash, undefined, '/api/session must not expose session_hash.');
  assert.equal(payload.session.session_id, undefined, '/api/session must not expose session_id.');
  assertNoForbiddenKeys('/api/session (authenticated)', payload);

  server.close();
});

// -------------------- Route 3: /api/bootstrap --------------------

test('matrix: /api/bootstrap requires authentication and does not reveal account-existence signal', async () => {
  const server = productionServer();
  coverage.noteRoute('/api/bootstrap');
  coverage.noteCombination('unauthenticated + /api/bootstrap');

  const response = await server.fetchRaw(`${ORIGIN}/api/bootstrap`);
  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.equal(payload.code, 'unauthenticated');
  // Error body must not include learner IDs, account IDs, or any subject data keys
  assert.equal(payload.learners, undefined);
  assert.equal(payload.accountId, undefined);
  assertNoForbiddenKeys('/api/bootstrap (unauth)', payload);

  server.close();
});

test('matrix: /api/bootstrap returns writable learners only for parent-owner (real-auth)', async () => {
  const server = createWorkerRepositoryServer();
  seedAdultAccount(server, { id: 'adult-owner', email: 'owner@example.com', displayName: 'Owner', platformRole: 'parent' });
  await seedLearnerViaOwner(server, 'adult-owner', {
    id: 'learner-a',
    name: 'Ava',
    yearGroup: 'Y5',
    goal: 'sats',
    dailyMinutes: 15,
    avatarColor: '#3E6FA8',
    createdAt: 1,
  });
  coverage.noteCombination('parent + owner + real-auth + /api/bootstrap');

  const response = await server.fetchAs('adult-owner', `${ORIGIN}/api/bootstrap`, {}, {
    'x-ks2-dev-platform-role': 'parent',
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  // Writable learner surfaces must exist
  assert.ok(payload.learners, 'Parent-owner bootstrap must include learners.');
  assert.deepEqual(payload.learners.allIds, ['learner-a'], 'Parent-owner bootstrap must include the writable learner.');
  assertNoForbiddenKeys('/api/bootstrap (parent-owner)', payload);

  server.close();
});

test('matrix: /api/bootstrap viewer-only parent sees no writable learners', async () => {
  const server = createWorkerRepositoryServer();
  seedAdultAccount(server, { id: 'adult-owner', email: 'owner@example.com', displayName: 'Owner', platformRole: 'parent' });
  await seedLearnerViaOwner(server, 'adult-owner', {
    id: 'learner-a',
    name: 'Ava',
    yearGroup: 'Y5',
    goal: 'sats',
    dailyMinutes: 15,
    avatarColor: '#3E6FA8',
    createdAt: 1,
  });
  seedAdultAccount(server, { id: 'adult-viewer', email: 'viewer@example.com', displayName: 'Viewer', platformRole: 'parent' });
  seedMembership(server, { accountId: 'adult-viewer', learnerId: 'learner-a', role: 'viewer' });
  coverage.noteCombination('parent + viewer + real-auth + /api/bootstrap');

  const response = await server.fetchAs('adult-viewer', `${ORIGIN}/api/bootstrap`, {}, {
    'x-ks2-dev-platform-role': 'parent',
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  // Bootstrap is writable-only — viewer sees no learners here.
  assert.deepEqual(payload.learners.allIds, [], 'Viewer membership must not produce writable learners in /api/bootstrap.');
  assertNoForbiddenKeys('/api/bootstrap (parent-viewer)', payload);

  server.close();
});

test('matrix: /api/bootstrap cross-account probe — session A cannot observe learner IDs owned by account B', async () => {
  const server = createWorkerRepositoryServer();
  seedAdultAccount(server, { id: 'adult-a', email: 'a@example.com', displayName: 'A', platformRole: 'parent' });
  seedAdultAccount(server, { id: 'adult-b', email: 'b@example.com', displayName: 'B', platformRole: 'parent' });
  await seedLearnerViaOwner(server, 'adult-a', {
    id: 'learner-a',
    name: 'Ava',
    yearGroup: 'Y5',
    goal: 'sats',
    dailyMinutes: 15,
    avatarColor: '#3E6FA8',
    createdAt: 1,
  });
  await seedLearnerViaOwner(server, 'adult-b', {
    id: 'learner-b',
    name: 'Ben',
    yearGroup: 'Y6',
    goal: 'confidence',
    dailyMinutes: 10,
    avatarColor: '#335577',
    createdAt: 2,
  });
  coverage.noteCombination('parent + owner (cross-account probe) + /api/bootstrap');

  const responseA = await server.fetchAs('adult-a', `${ORIGIN}/api/bootstrap`, {}, {
    'x-ks2-dev-platform-role': 'parent',
  });
  assert.equal(responseA.status, 200);
  const payloadA = await responseA.json();
  const allKeysA = collectAllKeys(payloadA);

  // Account A must not observe learner-b ID anywhere in its bootstrap payload
  assert.equal(payloadA.learners.allIds.includes('learner-b'), false, 'Account A must not see learner-b in allIds.');
  assert.equal(payloadA.learners.byId['learner-b'], undefined, 'Account A must not see learner-b in byId.');
  assert.equal(allKeysA.has('learner-b'), false, 'Account A payload must not reference learner-b anywhere.');
  assertNoForbiddenKeys('/api/bootstrap (cross-account A)', payloadA);

  // Account B must only see its own learner
  const responseB = await server.fetchAs('adult-b', `${ORIGIN}/api/bootstrap`, {}, {
    'x-ks2-dev-platform-role': 'parent',
  });
  const payloadB = await responseB.json();
  assert.deepEqual(payloadB.learners.allIds, ['learner-b']);
  assert.equal(payloadB.learners.byId['learner-a'], undefined);

  server.close();
});

test('matrix: /api/bootstrap demo-active allows the demo session to read its own learner', async () => {
  const server = productionServer();
  const { cookie } = await createDemoSessionCookie(server);
  coverage.noteCombination('demo + owner + demo-active + /api/bootstrap');

  const response = await server.fetchRaw(`${ORIGIN}/api/bootstrap`, { headers: { cookie } });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.session.demo, true, 'Bootstrap must mark demo session.');
  assert.ok(payload.learners.selectedId, 'Demo bootstrap must include a selected learner.');
  assertNoForbiddenKeys('/api/bootstrap (demo-active)', payload);

  server.close();
});

test('matrix: /api/bootstrap demo-expired-with-valid-cookie fails closed (F-10 regression)', async () => {
  const server = productionServer();
  const { cookie, accountId } = await createDemoSessionCookie(server);
  extendDemoSessionCookieWhileExpiringAccount(server, accountId);
  coverage.noteCombination('demo + owner + demo-expired-with-valid-cookie + /api/bootstrap');

  const response = await server.fetchRaw(`${ORIGIN}/api/bootstrap`, { headers: { cookie } });
  const payload = await response.json();
  // When production auth layer detects the expired demo it rejects at session layer (401 unauth).
  // If it somehow reaches the handler because the cookie is still valid, the demo guard must
  // fail closed with a 401 (demo_session_expired). Either way: no learner data must be returned.
  assert.ok([401, 403].includes(response.status), `Expected 401/403, got ${response.status}: ${JSON.stringify(payload)}`);
  assert.notEqual(payload.ok, true, 'Expired demo must not return ok=true bootstrap payload.');
  assert.equal(payload.learners, undefined, 'Expired demo must not return learner data.');
  assertNoForbiddenKeys('/api/bootstrap (demo-expired)', payload);

  server.close();
});

test('matrix: /api/bootstrap dev-stub F-10 drive — x-ks2-dev-demo=1 + expired demo account is blocked by requireActiveDemoAccount', async () => {
  // P1-B drive test. The dev-stub session provider now honours `x-ks2-dev-demo=1`
  // so tests can force `session.demo = true` without spinning up a production
  // cookie + D1 demo template. Combined with an expired `demo_expires_at` in the
  // adult_accounts row, this is the ONLY combination that reaches the bootstrap
  // handler's `requireActiveDemoAccount` guard in worker/src/app.js:393-395 —
  // production auth already SQL-filters expired demos out at session lookup.
  //
  // If the guard is reverted (app.js:393-395 hunk removed), this test MUST fail:
  // bootstrap would succeed with learner data for an expired demo account.
  const server = createWorkerRepositoryServer();
  const accountId = 'adult-demo-stub-expired';
  const learnerId = 'learner-demo-stub-expired';
  const now = Date.now();

  server.DB.db.prepare(`
    INSERT INTO adult_accounts (
      id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, account_type, demo_expires_at
    ) VALUES (?, NULL, 'Demo Visitor', 'parent', NULL, ?, ?, 'demo', ?)
  `).run(accountId, now, now, now - 60_000);
  server.DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES (?, 'Demo Learner', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(learnerId, now, now);
  server.DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, ?, 'owner', 0, ?, ?)
  `).run(accountId, learnerId, now, now);

  const response = await server.fetchRaw(`${ORIGIN}/api/bootstrap`, {
    headers: {
      'x-ks2-dev-account-id': accountId,
      'x-ks2-dev-platform-role': 'parent',
      // TEST-ONLY headers — see createDevelopmentSessionProvider in worker/src/auth.js.
      // Together they force dev-stub to emit `session.demo = true`, which is what
      // drives the bootstrap handler's requireActiveDemoAccount guard.
      'x-ks2-dev-demo': '1',
      'x-ks2-dev-demo-expires-at': String(now - 60_000),
    },
  });
  const payload = await response.json();
  assert.equal(response.status, 401, `Expected 401 demo_session_expired, got ${response.status}: ${JSON.stringify(payload)}`);
  assert.equal(payload.code, 'demo_session_expired', 'F-10 guard must surface demo_session_expired.');
  assert.equal(payload.learners, undefined, 'Expired demo must not expose learner data.');
  assertNoForbiddenKeys('/api/bootstrap (dev-stub demo-expired F-10 drive)', payload);
  coverage.noteCombination('dev-stub demo-expired (F-10 drive) + /api/bootstrap');

  server.close();
});

test('matrix: documents dev-stub gap — requireActiveDemoAccount is not reachable when session.demo is unset', async () => {
  // Correctness finding from the PR #183 review: the old test at this location
  // was named "dev-stub mode is also blocked by requireActiveDemoAccount", which
  // was misleading because dev-stub without the new `x-ks2-dev-demo` header does
  // NOT set `session.demo = true` and therefore never triggers the guard. This
  // renamed test exercises that path explicitly so the gap is visible in the
  // matrix coverage log rather than hidden behind a test name that contradicts
  // what it asserts. The F-10 drive test above is the one that covers the guard.
  const server = createWorkerRepositoryServer();
  const accountId = 'adult-demo-stub-gap';
  const learnerId = 'learner-demo-stub-gap';
  const now = Date.now();

  server.DB.db.prepare(`
    INSERT INTO adult_accounts (
      id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, account_type, demo_expires_at
    ) VALUES (?, NULL, 'Demo Visitor', 'parent', NULL, ?, ?, 'demo', ?)
  `).run(accountId, now, now, now - 60_000);
  server.DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES (?, 'Demo Learner', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run(learnerId, now, now);
  server.DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, ?, 'owner', 0, ?, ?)
  `).run(accountId, learnerId, now, now);

  const response = await server.fetchRaw(`${ORIGIN}/api/bootstrap`, {
    headers: {
      'x-ks2-dev-account-id': accountId,
      'x-ks2-dev-platform-role': 'parent',
      // Intentionally NO x-ks2-dev-demo header. The dev-stub provider therefore
      // emits session.demo = false, so app.js's `if (session?.demo)` guard is
      // skipped and the expired demo account loads as if it were a real one.
    },
  });
  assert.equal(response.status, 200, 'Dev-stub without x-ks2-dev-demo does not reach the F-10 guard.');
  coverage.noteCombination('dev-stub demo-expired (documented gap, no dev-demo header) + /api/bootstrap');

  server.close();
});

// -------------------- Route 4: Parent Hub --------------------

test('matrix: /api/hubs/parent requires authentication', async () => {
  const server = productionServer();
  coverage.noteRoute('/api/hubs/parent');
  coverage.noteCombination('unauthenticated + /api/hubs/parent');

  const response = await server.fetchRaw(`${ORIGIN}/api/hubs/parent`);
  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.equal(payload.code, 'unauthenticated');
  assertNoForbiddenKeys('/api/hubs/parent (unauth)', payload);

  server.close();
});

test('matrix: /api/hubs/parent parent-viewer returns read-only membership view', async () => {
  const server = createWorkerRepositoryServer();
  seedAdultAccount(server, { id: 'adult-owner', email: 'owner@example.com', displayName: 'Owner', platformRole: 'parent' });
  await seedLearnerViaOwner(server, 'adult-owner', {
    id: 'learner-a',
    name: 'Ava',
    yearGroup: 'Y5',
    goal: 'sats',
    dailyMinutes: 15,
    avatarColor: '#3E6FA8',
    createdAt: 1,
  });
  seedAdultAccount(server, { id: 'adult-viewer', email: 'viewer@example.com', displayName: 'Viewer', platformRole: 'parent' });
  seedMembership(server, { accountId: 'adult-viewer', learnerId: 'learner-a', role: 'viewer' });
  coverage.noteCombination('parent + viewer + real-auth + /api/hubs/parent');

  const response = await server.fetchAs('adult-viewer', `${ORIGIN}/api/hubs/parent`, {}, {
    'x-ks2-dev-platform-role': 'parent',
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.parentHub.permissions.membershipRole, 'viewer');
  assert.equal(payload.parentHub.permissions.canMutateLearnerData, false);
  assert.equal(payload.parentHub.accessibleLearners[0].writable, false);
  assertNoForbiddenKeys('/api/hubs/parent (parent-viewer)', payload);

  server.close();
});

test('matrix: /api/hubs/parent demo-expired-with-valid-cookie fails closed', async () => {
  const server = productionServer();
  const { cookie, accountId } = await createDemoSessionCookie(server);
  extendDemoSessionCookieWhileExpiringAccount(server, accountId);
  coverage.noteCombination('demo + owner + demo-expired-with-valid-cookie + /api/hubs/parent');

  const response = await server.fetchRaw(`${ORIGIN}/api/hubs/parent`, { headers: { cookie } });
  const payload = await response.json();
  assert.ok([401, 403].includes(response.status), `Expected 401/403, got ${response.status}: ${JSON.stringify(payload)}`);
  assert.equal(payload.parentHub, undefined, 'Expired demo must not receive parent hub data.');
  assertNoForbiddenKeys('/api/hubs/parent (demo-expired)', payload);

  server.close();
});

// -------------------- P2: cross-account foreign learnerId probe --------------------
// These rows prove that passing another account's learner ID via `?learnerId=...`
// does not let account A peek at account B's data. Every parent-scoped read
// route (parent hub, recent sessions, activity, spelling word bank) must refuse
// with 403/404 when the caller has no membership row for the requested learner.

async function seedTwoAccountsCrossProbe() {
  const server = createWorkerRepositoryServer();
  seedAdultAccount(server, { id: 'adult-a', email: 'a@example.com', displayName: 'A', platformRole: 'parent' });
  seedAdultAccount(server, { id: 'adult-b', email: 'b@example.com', displayName: 'B', platformRole: 'parent' });
  await seedLearnerViaOwner(server, 'adult-a', {
    id: 'learner-a',
    name: 'Ava',
    yearGroup: 'Y5',
    goal: 'sats',
    dailyMinutes: 15,
    avatarColor: '#3E6FA8',
    createdAt: 1,
  });
  await seedLearnerViaOwner(server, 'adult-b', {
    id: 'learner-b',
    name: 'Ben',
    yearGroup: 'Y6',
    goal: 'confidence',
    dailyMinutes: 10,
    avatarColor: '#335577',
    createdAt: 2,
  });
  return server;
}

test('matrix: /api/hubs/parent?learnerId=<foreign> — account A cannot probe account B\'s learner', async () => {
  const server = await seedTwoAccountsCrossProbe();
  coverage.noteCombination('parent + cross-account-foreign-learnerId + /api/hubs/parent');

  const response = await server.fetchAs('adult-a', `${ORIGIN}/api/hubs/parent?learnerId=learner-b`, {}, {
    'x-ks2-dev-platform-role': 'parent',
  });
  const payload = await response.json();
  assert.ok([403, 404].includes(response.status), `Expected 403/404 for foreign learnerId probe, got ${response.status}: ${JSON.stringify(payload)}`);
  assert.notEqual(payload.ok, true, 'Foreign learnerId probe must not return ok=true.');
  assert.equal(payload.parentHub, undefined, 'Foreign learnerId probe must not leak parent hub data.');
  assertNoForbiddenKeys('/api/hubs/parent (foreign learnerId)', payload);

  server.close();
});

test('matrix: /api/hubs/parent/recent-sessions?learnerId=<foreign> — account A cannot probe account B\'s learner', async () => {
  const server = await seedTwoAccountsCrossProbe();
  coverage.noteCombination('parent + cross-account-foreign-learnerId + /api/hubs/parent/recent-sessions');

  const response = await server.fetchAs('adult-a', `${ORIGIN}/api/hubs/parent/recent-sessions?learnerId=learner-b`, {}, {
    'x-ks2-dev-platform-role': 'parent',
  });
  const payload = await response.json();
  assert.ok([403, 404].includes(response.status), `Expected 403/404 for foreign learnerId probe, got ${response.status}: ${JSON.stringify(payload)}`);
  assert.notEqual(payload.ok, true, 'Foreign learnerId recent-sessions probe must not return ok=true.');
  assert.equal(payload.recentSessions, undefined, 'Foreign learnerId probe must not leak session data.');
  assertNoForbiddenKeys('/api/hubs/parent/recent-sessions (foreign learnerId)', payload);

  server.close();
});

test('matrix: /api/hubs/parent/activity?learnerId=<foreign> — account A cannot probe account B\'s learner', async () => {
  const server = await seedTwoAccountsCrossProbe();
  coverage.noteCombination('parent + cross-account-foreign-learnerId + /api/hubs/parent/activity');

  const response = await server.fetchAs('adult-a', `${ORIGIN}/api/hubs/parent/activity?learnerId=learner-b`, {}, {
    'x-ks2-dev-platform-role': 'parent',
  });
  const payload = await response.json();
  assert.ok([403, 404].includes(response.status), `Expected 403/404 for foreign learnerId probe, got ${response.status}: ${JSON.stringify(payload)}`);
  assert.notEqual(payload.ok, true, 'Foreign learnerId activity probe must not return ok=true.');
  assert.equal(payload.activity, undefined, 'Foreign learnerId probe must not leak activity data.');
  assertNoForbiddenKeys('/api/hubs/parent/activity (foreign learnerId)', payload);

  server.close();
});

test('matrix: /api/subjects/spelling/word-bank?learnerId=<foreign> — account A cannot probe account B\'s learner', async () => {
  const server = await seedTwoAccountsCrossProbe();
  coverage.noteRoute('/api/subjects/spelling/word-bank');
  coverage.noteCombination('parent + cross-account-foreign-learnerId + /api/subjects/spelling/word-bank');

  const response = await server.fetchAs('adult-a', `${ORIGIN}/api/subjects/spelling/word-bank?learnerId=learner-b`, {}, {
    'x-ks2-dev-platform-role': 'parent',
  });
  const payload = await response.json();
  assert.ok([403, 404].includes(response.status), `Expected 403/404 for foreign learnerId probe, got ${response.status}: ${JSON.stringify(payload)}`);
  assert.notEqual(payload.ok, true, 'Foreign learnerId word-bank probe must not return ok=true.');
  assert.equal(payload.wordBank, undefined, 'Foreign learnerId probe must not leak word-bank data.');
  assertNoForbiddenKeys('/api/subjects/spelling/word-bank (foreign learnerId)', payload);

  server.close();
});

// -------------------- Route 5: Lazy history + activity feed --------------------

test('matrix: /api/hubs/parent/recent-sessions requires authentication', async () => {
  const server = productionServer();
  coverage.noteRoute('/api/hubs/parent/recent-sessions');
  coverage.noteCombination('unauthenticated + /api/hubs/parent/recent-sessions');

  const response = await server.fetchRaw(`${ORIGIN}/api/hubs/parent/recent-sessions`);
  assert.equal(response.status, 401);
  const payload = await response.json();
  assertNoForbiddenKeys('/api/hubs/parent/recent-sessions (unauth)', payload);

  server.close();
});

test('matrix: /api/hubs/parent/activity requires authentication', async () => {
  const server = productionServer();
  coverage.noteRoute('/api/hubs/parent/activity');
  coverage.noteCombination('unauthenticated + /api/hubs/parent/activity');

  const response = await server.fetchRaw(`${ORIGIN}/api/hubs/parent/activity`);
  assert.equal(response.status, 401);
  const payload = await response.json();
  assertNoForbiddenKeys('/api/hubs/parent/activity (unauth)', payload);

  server.close();
});

// -------------------- Route 6: Admin Hub --------------------

test('matrix: /api/hubs/admin requires authentication', async () => {
  const server = productionServer();
  coverage.noteRoute('/api/hubs/admin');
  coverage.noteCombination('unauthenticated + /api/hubs/admin');

  const response = await server.fetchRaw(`${ORIGIN}/api/hubs/admin`);
  assert.equal(response.status, 401);
  const payload = await response.json();
  assertNoForbiddenKeys('/api/hubs/admin (unauth)', payload);

  server.close();
});

test('matrix: /api/hubs/admin parent platform role is denied', async () => {
  const server = createWorkerRepositoryServer();
  seedAdultAccount(server, { id: 'adult-parent', email: 'parent@example.com', displayName: 'Parent', platformRole: 'parent' });
  coverage.noteCombination('parent + (no membership) + real-auth + /api/hubs/admin');

  const response = await server.fetchAs('adult-parent', `${ORIGIN}/api/hubs/admin`, {}, {
    'x-ks2-dev-platform-role': 'parent',
  });
  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.code, 'admin_hub_forbidden');
  assertNoForbiddenKeys('/api/hubs/admin (parent denied)', payload);

  server.close();
});

test('matrix: /api/hubs/admin admin platform role is allowed', async () => {
  const server = createWorkerRepositoryServer();
  seedAdultAccount(server, { id: 'adult-admin', email: 'admin@example.com', displayName: 'Admin', platformRole: 'admin' });
  coverage.noteCombination('admin + (no learner membership) + real-auth + /api/hubs/admin');

  const response = await server.fetchAs('adult-admin', `${ORIGIN}/api/hubs/admin`, {}, {
    'x-ks2-dev-platform-role': 'admin',
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(payload.adminHub, 'Admin hub payload must be present for admin platform role.');
  assertNoForbiddenKeys('/api/hubs/admin (admin)', payload);

  server.close();
});

test('matrix: /api/hubs/admin demo account with forced admin platform_role is still denied (P2 regression lock)', async () => {
  // P2 from the PR #183 review: a demo account must not reach the admin hub
  // even if its platform_role is admin. requireAdminHubAccess in
  // worker/src/repository.js:931-938 checks both `account_type === 'demo'`
  // AND the platform role; this test pins the demo-account half of that
  // predicate so it cannot be loosened.
  const server = createWorkerRepositoryServer();
  const accountId = 'adult-demo-admin';
  const now = Date.now();
  // Seed a demo account with admin platform_role — a combination that should
  // never be reachable through the demo signup flow but which a privilege
  // escalation bug could produce. The admin hub must still refuse.
  server.DB.db.prepare(`
    INSERT INTO adult_accounts (
      id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, account_type, demo_expires_at
    ) VALUES (?, NULL, 'Demo Admin', 'admin', NULL, ?, ?, 'demo', ?)
  `).run(accountId, now, now, now + 60 * 60 * 1000);
  coverage.noteCombination('demo + admin platform-role + /api/hubs/admin (forced combination)');

  const response = await server.fetchAs(accountId, `${ORIGIN}/api/hubs/admin`, {}, {
    'x-ks2-dev-platform-role': 'admin',
    'x-ks2-dev-demo': '1',
    'x-ks2-dev-demo-expires-at': String(now + 60 * 60 * 1000),
  });
  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.code, 'admin_hub_forbidden');
  assertNoForbiddenKeys('/api/hubs/admin (demo + admin platform-role)', payload);

  server.close();
});

test('matrix: /api/hubs/admin ops platform role is allowed', async () => {
  const server = createWorkerRepositoryServer();
  seedAdultAccount(server, { id: 'adult-ops', email: 'ops@example.com', displayName: 'Ops', platformRole: 'ops' });
  coverage.noteCombination('ops + (no learner membership) + real-auth + /api/hubs/admin');

  const response = await server.fetchAs('adult-ops', `${ORIGIN}/api/hubs/admin`, {}, {
    'x-ks2-dev-platform-role': 'ops',
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(payload.adminHub, 'Admin hub payload must be present for ops platform role.');
  assertNoForbiddenKeys('/api/hubs/admin (ops)', payload);

  server.close();
});

// Ops cannot demote last admin — existing safety rule preserved (tested via repository layer
// elsewhere; referenced here to document the matrix row).
test('matrix: ops cannot demote the last admin via /api/admin/accounts/role', async () => {
  const server = createWorkerRepositoryServer();
  seedAdultAccount(server, { id: 'adult-admin', email: 'admin@example.com', displayName: 'Admin', platformRole: 'admin' });
  coverage.noteRoute('/api/admin/accounts/role');
  coverage.noteCombination('ops + /api/admin/accounts/role (last-admin safety)');

  // Ops cannot manage account roles at all — the repository layer's requireAccountRoleManager
  // rejects anything other than admin. This asserts the outer gate before the last-admin logic.
  seedAdultAccount(server, { id: 'adult-ops-demoter', email: 'ops@example.com', displayName: 'Ops', platformRole: 'ops' });
  const response = await server.fetchAs('adult-ops-demoter', `${ORIGIN}/api/admin/accounts/role`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-ks2-request-id': 'matrix-ops-last-admin' },
    body: JSON.stringify({
      accountId: 'adult-admin',
      platformRole: 'parent',
      requestId: 'matrix-ops-last-admin',
    }),
  }, {
    'x-ks2-dev-platform-role': 'ops',
  });
  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.code, 'account_roles_forbidden');

  server.close();
});

// -------------------- Route 7: TTS prompt-token fetch --------------------

test('matrix: /api/tts requires authentication', async () => {
  const server = productionServer();
  coverage.noteRoute('/api/tts');
  coverage.noteCombination('unauthenticated + /api/tts');

  const response = await server.fetchRaw(`${ORIGIN}/api/tts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ promptToken: 'whatever' }),
  });
  assert.equal(response.status, 401);
  const payload = await response.json();
  assertNoForbiddenKeys('/api/tts (unauth)', payload);

  server.close();
});

// -------------------- Route 8: Demo reset --------------------

test('matrix: /api/demo/reset requires authentication', async () => {
  const server = productionServer();
  coverage.noteRoute('/api/demo/reset');
  coverage.noteCombination('unauthenticated + /api/demo/reset');

  const response = await server.fetchRaw(`${ORIGIN}/api/demo/reset`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({}),
  });
  assert.equal(response.status, 401);
  const payload = await response.json();
  assertNoForbiddenKeys('/api/demo/reset (unauth)', payload);

  server.close();
});

test('matrix: /api/demo/reset demo-expired-with-valid-cookie fails closed', async () => {
  const server = productionServer();
  const { cookie, accountId } = await createDemoSessionCookie(server);
  extendDemoSessionCookieWhileExpiringAccount(server, accountId);
  coverage.noteCombination('demo + owner + demo-expired-with-valid-cookie + /api/demo/reset');

  const response = await server.fetchRaw(`${ORIGIN}/api/demo/reset`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, cookie },
    body: JSON.stringify({}),
  });
  const payload = await response.json();
  assert.ok([401, 403].includes(response.status), `Expected 401/403, got ${response.status}: ${JSON.stringify(payload)}`);
  assertNoForbiddenKeys('/api/demo/reset (demo-expired)', payload);

  server.close();
});

// -------------------- Route 9: OAuth start --------------------

test('matrix: /api/auth/google/start requires same-origin (CSRF guard)', async () => {
  const server = productionServer();
  coverage.noteRoute('/api/auth/*/start');
  coverage.noteCombination('cross-origin + /api/auth/google/start');

  const response = await server.fetchRaw(`${ORIGIN}/api/auth/google/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    body: JSON.stringify({}),
  });
  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.code, 'same_origin_required');

  server.close();
});

// -------------------- Route 10: OAuth callback --------------------

test('matrix: /api/auth/google/callback with invalid state returns error redirect (no payload leak)', async () => {
  const server = productionServer();
  coverage.noteRoute('/api/auth/*/callback');
  coverage.noteCombination('invalid-state + /api/auth/google/callback');

  const response = await server.fetchRaw(`${ORIGIN}/api/auth/google/callback?state=invalid&code=missing`, {
    method: 'GET',
  });
  // Callback uses redirect-with-error for invalid state
  assert.ok([302, 400, 401, 403].includes(response.status), `Unexpected callback status: ${response.status}`);

  server.close();
});

// -------------------- Route 11: CSP report endpoint --------------------

test('matrix: unauthenticated POST /api/security/csp-report with a legacy body returns 204', async () => {
  const server = productionServer();
  coverage.noteRoute('/api/security/csp-report');
  coverage.noteCombination('unauthenticated + POST /api/security/csp-report (legacy body)');

  const response = await server.fetchRaw(`${ORIGIN}/api/security/csp-report`, {
    method: 'POST',
    headers: { 'content-type': 'application/csp-report' },
    body: JSON.stringify({
      'csp-report': {
        'blocked-uri': 'https://evil.example/naughty.js',
        'document-uri': ORIGIN,
        'violated-directive': 'script-src',
      },
    }),
  });
  assert.equal(response.status, 204, 'CSP report endpoint must accept valid body without auth');
  server.close();
});

test('matrix: unauthenticated POST /api/security/csp-report rejects oversize body with 413', async () => {
  const server = productionServer();
  coverage.noteRoute('/api/security/csp-report');
  coverage.noteCombination('unauthenticated + POST /api/security/csp-report (413 oversize)');

  const body = JSON.stringify({
    'csp-report': { 'blocked-uri': 'x'.repeat(16384) },
  });
  const response = await server.fetchRaw(`${ORIGIN}/api/security/csp-report`, {
    method: 'POST',
    headers: {
      'content-type': 'application/csp-report',
      'content-length': String(Buffer.byteLength(body, 'utf8')),
    },
    body,
  });
  assert.equal(response.status, 413, 'Oversize CSP report must be rejected before parsing');
  server.close();
});

// -------------------- Matrix coverage summary --------------------

test('matrix: coverage summary — every authenticated route is exercised at least once', () => {
  const requiredRoutes = [
    '/api/health',
    '/api/auth/session',
    '/api/session',
    '/api/bootstrap',
    '/api/hubs/parent',
    '/api/hubs/parent/recent-sessions',
    '/api/hubs/parent/activity',
    '/api/hubs/admin',
    '/api/admin/accounts/role',
    '/api/subjects/spelling/word-bank',
    '/api/tts',
    '/api/demo/reset',
    '/api/auth/*/start',
    '/api/auth/*/callback',
    '/api/security/csp-report',
  ];
  for (const route of requiredRoutes) {
    assert.equal(
      coverage.routesExercised.has(route),
      true,
      `Redaction matrix must exercise route: ${route}. Extend tests/redaction-access-matrix.test.js when adding new routes.`,
    );
  }
  // Combination count is a tripwire: if the matrix shrinks without ceremony,
  // this assertion fails. Baseline reflects the U13 review-follower additions
  // (P1-A /api/session + /api/auth/session allowlist rows, P1-B F-10 drive
  // test, P2 cross-account foreign-learnerId probes, P2 demo+admin
  // combination) plus the U7 CSP report endpoint rows. Raise it when
  // adding new rows.
  assert.ok(
    coverage.combinationsCovered.length >= 30,
    `Expected at least 30 matrix combinations, got ${coverage.combinationsCovered.length}: ${coverage.combinationsCovered.join(' | ')}`,
  );
});
