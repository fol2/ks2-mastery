// P5 U7: Marketing scheduling truth — manual publish semantics invariant tests.
//
// Three invariants:
//   1. No UI string in AdminMarketingSection.jsx implies automatic delivery for "scheduled".
//   2. Worker response includes schedulingSemantics field.
//   3. Worker rejects unknown transition actions (no auto_publish accepted).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedAdultAccount(server, {
  id,
  email = null,
  displayName = null,
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

function seedCore(server, now) {
  seedAdultAccount(server, {
    id: 'adult-admin',
    email: 'admin@example.com',
    displayName: 'Admin',
    platformRole: 'admin',
    now,
  });
}

function seedMessage(server, {
  id,
  messageType = 'announcement',
  status = 'draft',
  title = 'Test',
  bodyText = 'Body.',
  severityToken = 'info',
  audience = 'internal',
  startsAt = null,
  endsAt = null,
  createdBy = 'adult-admin',
  updatedBy = 'adult-admin',
  publishedBy = null,
  createdAt = 1000,
  updatedAt = 1000,
  publishedAt = null,
  rowVersion = 0,
} = {}) {
  server.DB.db.prepare(`
    INSERT INTO admin_marketing_messages (
      id, message_type, status, title, body_text, severity_token,
      audience, starts_at, ends_at,
      created_by, updated_by, published_by,
      created_at, updated_at, published_at, row_version
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, messageType, status, title, bodyText, severityToken,
    audience, startsAt, endsAt,
    createdBy, updatedBy, publishedBy,
    createdAt, updatedAt, publishedAt, rowVersion,
  );
}

async function listAdmin(server, as) {
  return server.fetchAs(as, 'https://repo.test/api/admin/marketing/messages', {
    method: 'GET',
    headers: {
      origin: 'https://repo.test',
      'x-ks2-dev-platform-role': 'admin',
    },
  });
}

async function getMessage(server, as, messageId) {
  return server.fetchAs(as, `https://repo.test/api/admin/marketing/messages/${messageId}`, {
    method: 'GET',
    headers: {
      origin: 'https://repo.test',
      'x-ks2-dev-platform-role': 'admin',
    },
  });
}

async function transitionMessage(server, as, messageId, body) {
  return server.fetchAs(as, `https://repo.test/api/admin/marketing/messages/${messageId}`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
      'x-ks2-dev-platform-role': 'admin',
    },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Invariant 1: UI grep — no string implies automatic delivery for scheduled
// ---------------------------------------------------------------------------

test('P5-U7 Invariant: AdminMarketingSection.jsx contains no auto-delivery language for scheduled status', () => {
  const filePath = resolve(import.meta.dirname, '..', 'src', 'surfaces', 'hubs', 'AdminMarketingSection.jsx');
  const source = readFileSync(filePath, 'utf8');

  // Patterns that would imply automatic delivery when status is scheduled.
  // These patterns deliberately exclude negation forms ("not auto-delivered",
  // "will NOT be auto-delivered") which are correct scheduling truth language.
  const forbiddenPatterns = [
    /(?<!not |NOT |no )auto[_-]?deliver(?!ed)/i,
    /(?<!not |NOT |no )auto[_-]?publish/i,
    /will be sent automatically/i,
    /delivered automatically/i,
    /goes live automatically/i,
  ];

  for (const pattern of forbiddenPatterns) {
    const match = source.match(pattern);
    assert.equal(
      match,
      null,
      `UI must NOT imply automatic delivery. Found forbidden pattern: "${match?.[0]}"`,
    );
  }

  // Positive check: the scheduling truth note MUST be present.
  assert.ok(
    source.includes('staged but not auto-delivered'),
    'UI must contain the scheduling truth note: "staged but not auto-delivered"',
  );
  assert.ok(
    source.includes('will NOT be auto-delivered'),
    'UI must contain the scheduling confirmation text: "will NOT be auto-delivered"',
  );
  assert.ok(
    source.includes('will NOT be shown to users until manually published'),
    'UI must contain the StatusBadge tooltip: "will NOT be shown to users until manually published"',
  );
});

// ---------------------------------------------------------------------------
// Invariant 2: Worker response includes schedulingSemantics field
// ---------------------------------------------------------------------------

test('P5-U7 Invariant: Worker list endpoint returns schedulingSemantics field', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedCore(server, 1000);
    seedMessage(server, { id: 'msg-semantics-1', status: 'draft', title: 'Semantics test' });

    const res = await listAdmin(server, 'adult-admin');
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.schedulingSemantics, 'manual_publish_required',
      'List endpoint must return schedulingSemantics: "manual_publish_required"');
  } finally {
    server.close();
  }
});

test('P5-U7 Invariant: Worker detail endpoint returns schedulingSemantics field', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedCore(server, 1000);
    seedMessage(server, { id: 'msg-semantics-2', status: 'scheduled', title: 'Scheduled msg' });

    const res = await getMessage(server, 'adult-admin', 'msg-semantics-2');
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.schedulingSemantics, 'manual_publish_required',
      'Detail endpoint must return schedulingSemantics: "manual_publish_required"');
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Invariant 3: Worker rejects unknown transition actions — no auto_publish
// ---------------------------------------------------------------------------

test('P5-U7 Negative invariant: Worker rejects auto_publish transition action', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedCore(server, 1000);
    seedMessage(server, { id: 'msg-no-auto', status: 'scheduled', title: 'No auto' });

    const res = await transitionMessage(server, 'adult-admin', 'msg-no-auto', {
      action: 'auto_publish',
      expectedRowVersion: 0,
      mutation: { requestId: 'req-auto-publish-attempt' },
    });
    assert.equal(res.status, 400, 'auto_publish must be rejected with 400');
    const data = await res.json();
    assert.equal(data.code, 'validation_failed',
      'Error code must be validation_failed for unknown action');
  } finally {
    server.close();
  }
});

test('P5-U7 Negative invariant: Worker rejects auto_deliver transition action', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedCore(server, 1000);
    seedMessage(server, { id: 'msg-no-deliver', status: 'scheduled', title: 'No deliver' });

    const res = await transitionMessage(server, 'adult-admin', 'msg-no-deliver', {
      action: 'auto_deliver',
      expectedRowVersion: 0,
      mutation: { requestId: 'req-auto-deliver-attempt' },
    });
    assert.equal(res.status, 400, 'auto_deliver must be rejected with 400');
    const data = await res.json();
    assert.equal(data.code, 'validation_failed',
      'Error code must be validation_failed for unknown action');
  } finally {
    server.close();
  }
});
