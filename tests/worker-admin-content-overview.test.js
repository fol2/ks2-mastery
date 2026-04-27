// U9 (Admin Console P3): Worker-side content overview test suite.
//
// Validates the readSubjectContentOverview repository method and the
// GET /api/admin/ops/content-overview route.
//
// Test scenarios:
//   1. Happy path: overview returns status for all 6 subjects
//   2. Happy path: spelling live with release version and error count
//   3. Happy path: grammar and punctuation live with error counts
//   4. Happy path: arithmetic/reasoning/reading are placeholder
//   5. Edge case: subject with zero errors shows 0 not N/A
//   6. Edge case: no content release shows null releaseVersion
//   7. Error path: non-admin account receives 403
//   8. Happy path: route returns ok:true with subjects array

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';

function seedAdultAccount(server, {
  id,
  email,
  displayName,
  platformRole = 'parent',
  now = 1,
  accountType = 'real',
} = {}) {
  server.DB.db.prepare(`
    INSERT INTO adult_accounts (
      id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, repo_revision, account_type, demo_expires_at
    )
    VALUES (?, ?, ?, ?, NULL, ?, ?, 0, ?, NULL)
  `).run(id, email, displayName, platformRole, now, now, accountType);
}

function insertOpsErrorEvent(server, {
  id,
  fingerprint,
  errorKind,
  messageFirstLine,
  firstFrame = null,
  routeName = null,
  userAgent = null,
  accountId = null,
  firstSeen,
  lastSeen,
  occurrenceCount = 1,
  status = 'open',
}) {
  server.DB.db.prepare(`
    INSERT INTO ops_error_events (
      id, fingerprint, error_kind, message_first_line, first_frame,
      route_name, user_agent, account_id, first_seen, last_seen,
      occurrence_count, status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    fingerprint,
    errorKind,
    messageFirstLine,
    firstFrame,
    routeName,
    userAgent,
    accountId,
    firstSeen,
    lastSeen,
    occurrenceCount,
    status,
  );
}

const NOW = Date.now();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function fetchOverview(server, accountId, { platformRole = 'admin' } = {}) {
  return server.fetchAs(
    accountId,
    'https://repo.test/api/admin/ops/content-overview',
    {},
    { origin: 'https://repo.test', 'x-ks2-dev-platform-role': platformRole },
  );
}

// =================================================================
// 1. Happy path: overview returns status for all 6 subjects
// =================================================================

test('content overview returns all 6 subjects', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, {
      id: 'admin-content-1',
      email: 'admin@test.com',
      displayName: 'Admin',
      platformRole: 'admin',
    });

    const res = await fetchOverview(server, 'admin-content-1');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(Array.isArray(body.subjects), true);
    assert.equal(body.subjects.length, 6);

    const keys = body.subjects.map((s) => s.subjectKey);
    assert.ok(keys.includes('spelling'), 'spelling present');
    assert.ok(keys.includes('grammar'), 'grammar present');
    assert.ok(keys.includes('punctuation'), 'punctuation present');
    assert.ok(keys.includes('arithmetic'), 'arithmetic present');
    assert.ok(keys.includes('reasoning'), 'reasoning present');
    assert.ok(keys.includes('reading'), 'reading present');
  } finally {
    server.close();
  }
});

// =================================================================
// 2. Happy path: live subjects show correct status
// =================================================================

test('spelling, grammar, punctuation are live', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, {
      id: 'admin-content-2',
      email: 'admin2@test.com',
      displayName: 'Admin 2',
      platformRole: 'admin',
    });

    const res = await fetchOverview(server, 'admin-content-2');
    const body = await res.json();
    const spelling = body.subjects.find((s) => s.subjectKey === 'spelling');
    const grammar = body.subjects.find((s) => s.subjectKey === 'grammar');
    const punctuation = body.subjects.find((s) => s.subjectKey === 'punctuation');

    assert.equal(spelling.status, 'live');
    assert.equal(grammar.status, 'live');
    assert.equal(punctuation.status, 'live');
  } finally {
    server.close();
  }
});

// =================================================================
// 3. Happy path: placeholder subjects
// =================================================================

test('arithmetic, reasoning, reading are placeholder', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, {
      id: 'admin-content-3',
      email: 'admin3@test.com',
      displayName: 'Admin 3',
      platformRole: 'admin',
    });

    const res = await fetchOverview(server, 'admin-content-3');
    const body = await res.json();
    const arithmetic = body.subjects.find((s) => s.subjectKey === 'arithmetic');
    const reasoning = body.subjects.find((s) => s.subjectKey === 'reasoning');
    const reading = body.subjects.find((s) => s.subjectKey === 'reading');

    assert.equal(arithmetic.status, 'placeholder');
    assert.equal(reasoning.status, 'placeholder');
    assert.equal(reading.status, 'placeholder');

    // Placeholder subjects have zero runtime data
    assert.equal(arithmetic.errorCount7d, 0);
    assert.equal(arithmetic.releaseVersion, null);
    assert.equal(arithmetic.supportLoadSignal, 'none');
  } finally {
    server.close();
  }
});

// =================================================================
// 4. Edge case: subject with zero errors shows 0
// =================================================================

test('live subject with zero errors shows 0 not N/A', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, {
      id: 'admin-content-4',
      email: 'admin4@test.com',
      displayName: 'Admin 4',
      platformRole: 'admin',
    });

    const res = await fetchOverview(server, 'admin-content-4');
    const body = await res.json();
    const grammar = body.subjects.find((s) => s.subjectKey === 'grammar');

    assert.equal(typeof grammar.errorCount7d, 'number');
    assert.equal(grammar.errorCount7d, 0);
    assert.equal(grammar.supportLoadSignal, 'none');
  } finally {
    server.close();
  }
});

// =================================================================
// 5. Happy path: error counts from ops_error_events
// =================================================================

test('live subjects surface 7d error counts from ops_error_events', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, {
      id: 'admin-content-5',
      email: 'admin5@test.com',
      displayName: 'Admin 5',
      platformRole: 'admin',
    });

    // Insert spelling-related error event within 7d
    insertOpsErrorEvent(server, {
      id: 'err-spelling-1',
      fingerprint: 'fp-spelling-1',
      errorKind: 'TypeError',
      messageFirstLine: 'Cannot read property of spelling module',
      routeName: '/subject/spelling',
      firstSeen: NOW - ONE_DAY_MS,
      lastSeen: NOW - ONE_DAY_MS,
      status: 'open',
    });

    // Insert grammar-related error events (3 for medium signal)
    for (let i = 0; i < 3; i++) {
      insertOpsErrorEvent(server, {
        id: `err-grammar-${i}`,
        fingerprint: `fp-grammar-${i}`,
        errorKind: 'ReferenceError',
        messageFirstLine: `Grammar concept confidence error variant ${i}`,
        routeName: '/subject/grammar',
        firstSeen: NOW - ONE_DAY_MS,
        lastSeen: NOW - ONE_DAY_MS,
        status: 'open',
      });
    }

    // Insert a resolved error (should NOT be counted)
    insertOpsErrorEvent(server, {
      id: 'err-spelling-resolved',
      fingerprint: 'fp-spelling-resolved',
      errorKind: 'TypeError',
      messageFirstLine: 'Old spelling error already resolved',
      routeName: '/subject/spelling',
      firstSeen: NOW - 2 * ONE_DAY_MS,
      lastSeen: NOW - 2 * ONE_DAY_MS,
      status: 'resolved',
    });

    const res = await fetchOverview(server, 'admin-content-5');
    const body = await res.json();
    const spelling = body.subjects.find((s) => s.subjectKey === 'spelling');
    const grammar = body.subjects.find((s) => s.subjectKey === 'grammar');

    assert.equal(spelling.errorCount7d, 1, 'spelling has 1 open error');
    assert.equal(spelling.supportLoadSignal, 'low', 'spelling support signal is low');
    assert.equal(grammar.errorCount7d, 3, 'grammar has 3 open errors');
    assert.equal(grammar.supportLoadSignal, 'medium', 'grammar support signal is medium');
  } finally {
    server.close();
  }
});

// =================================================================
// 6. Edge case: no content release shows null releaseVersion
// =================================================================

test('subject with no content release shows null releaseVersion', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, {
      id: 'admin-content-6',
      email: 'admin6@test.com',
      displayName: 'Admin 6',
      platformRole: 'admin',
    });

    const res = await fetchOverview(server, 'admin-content-6');
    const body = await res.json();
    const grammar = body.subjects.find((s) => s.subjectKey === 'grammar');

    // Grammar has no release model yet
    assert.equal(grammar.releaseVersion, null);
  } finally {
    server.close();
  }
});

// =================================================================
// 7. Error path: non-admin account receives 403
// =================================================================

test('non-admin account receives 403 for content overview', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, {
      id: 'parent-no-admin',
      email: 'parent@test.com',
      displayName: 'Parent',
      platformRole: 'parent',
    });

    const res = await fetchOverview(server, 'parent-no-admin', { platformRole: 'parent' });
    assert.equal(res.status, 403);
  } finally {
    server.close();
  }
});

// =================================================================
// 8. Happy path: generatedAt timestamp is present
// =================================================================

test('overview includes generatedAt timestamp', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, {
      id: 'admin-content-8',
      email: 'admin8@test.com',
      displayName: 'Admin 8',
      platformRole: 'admin',
    });

    const res = await fetchOverview(server, 'admin-content-8');
    const body = await res.json();
    assert.equal(typeof body.generatedAt, 'number');
    assert.ok(body.generatedAt > 0, 'generatedAt is a positive number');
  } finally {
    server.close();
  }
});
