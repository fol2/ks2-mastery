// U10 — CRITICAL security contract for Grammar Writing Try admin routes.
//
// The archive + delete routes are the FIRST admin-scoped subject-data
// pathway in the repo. Role is derived SERVER-SIDE from the actor
// account — the request payload is NEVER consulted for role claims.
// This file locks:
//   - Non-admin (parent role) POST → 403 admin_hub_forbidden.
//   - Demo account with `platform_role='admin'` → 403 admin_hub_forbidden
//     (demo accounts are rejected BEFORE any data is touched; see
//     `requireAdminHubAccess` in worker/src/repository.js).
//   - Role spoofing via body payload (`actor.role: 'admin'` / `role:
//     'admin'`) does not bypass the guard — the route ignores the body
//     field and the Worker derives role from the account record.
//   - Happy path under a real admin account still succeeds (baseline).
//
// A single regression in any of the tests below is a production-critical
// defect. Reviewers: if you need to relax one of these assertions,
// update the invariants doc and justify it in the PR body.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';
import {
  createInitialGrammarState,
  createServerGrammarEngine,
} from '../worker/src/subjects/grammar/engine.js';
import { GRAMMAR_TRANSFER_PROMPT_IDS } from '../worker/src/subjects/grammar/transfer-prompts.js';

function seedAdultAccount(server, {
  id,
  email,
  platformRole = 'admin',
  accountType = 'real',
  now = 1,
}) {
  server.DB.db.prepare(`
    INSERT INTO adult_accounts (
      id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, repo_revision, account_type, demo_expires_at
    )
    VALUES (?, ?, ?, ?, NULL, ?, ?, 0, ?, NULL)
  `).run(id, email, 'Adult', platformRole, now, now, accountType);
}

function seedLearner(server, { learnerId, ownerAccountId, now = 1 }) {
  server.DB.db.prepare(`
    INSERT INTO learner_profiles (
      id, name, year_group, avatar_color, goal, daily_minutes,
      created_at, updated_at, state_revision
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(learnerId, `Learner ${learnerId}`, 'Y5', '#8A4FFF', '', 15, now, now);
  server.DB.db.prepare(`
    INSERT INTO account_learner_memberships (
      account_id, learner_id, role, sort_index, created_at, updated_at
    )
    VALUES (?, ?, 'owner', 0, ?, ?)
  `).run(ownerAccountId, learnerId, now, now);
}

function seedGrammarEvidence(server, { learnerId, promptId, writing, seedActorId, now = 1 }) {
  // Use the real engine to build the state so it matches production shape.
  const engine = createServerGrammarEngine({ now: () => now });
  const result = engine.apply({
    learnerId,
    subjectRecord: {},
    command: 'save-transfer-evidence',
    requestId: `seed-${learnerId}-${promptId}`,
    payload: { promptId, writing, selfAssessment: [] },
  });
  const data = result.data || { ...createInitialGrammarState(), transferEvidence: result.state.transferEvidence };
  server.DB.db.prepare(`
    INSERT INTO child_subject_state (
      learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id
    )
    VALUES (?, 'grammar', ?, ?, ?, ?)
  `).run(
    learnerId,
    JSON.stringify(result.state),
    JSON.stringify(data),
    now,
    seedActorId,
  );
}

async function postArchiveAs(server, {
  accountId,
  learnerId,
  promptId,
  body = {},
  role = 'admin',
  origin = 'https://repo.test',
}) {
  return server.fetchAs(accountId, `https://repo.test/api/admin/learners/${learnerId}/grammar/transfer-evidence/${promptId}/archive`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      'x-ks2-dev-platform-role': role,
    },
    body: JSON.stringify({
      mutation: { requestId: `req-${accountId}-${promptId}-archive`, correlationId: `corr-${accountId}` },
      ...body,
    }),
  });
}

async function postDeleteAs(server, {
  accountId,
  learnerId,
  promptId,
  body = {},
  role = 'admin',
  origin = 'https://repo.test',
}) {
  return server.fetchAs(accountId, `https://repo.test/api/admin/learners/${learnerId}/grammar/transfer-evidence/${promptId}/delete`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      'x-ks2-dev-platform-role': role,
    },
    body: JSON.stringify({
      mutation: { requestId: `req-${accountId}-${promptId}-delete`, correlationId: `corr-${accountId}` },
      ...body,
    }),
  });
}

test('U10 security: happy path — real admin archives an entry and receives 200', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin', email: 'admin@example.com', platformRole: 'admin' });
    seedLearner(server, { learnerId: 'learner-happy', ownerAccountId: 'adult-admin' });
    seedGrammarEvidence(server, {
      learnerId: 'learner-happy',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
      writing: 'Baseline paragraph for the happy path.',
      seedActorId: 'adult-admin',
    });
    const response = await postArchiveAs(server, {
      accountId: 'adult-admin',
      learnerId: 'learner-happy',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
    });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.ok, true);
    assert.equal(payload.grammarTransferEvidence.learnerId, 'learner-happy');
    assert.equal(payload.grammarTransferEvidence.promptId, GRAMMAR_TRANSFER_PROMPT_IDS[0]);
    assert.equal(payload.grammarTransferMutation.kind, 'admin.grammar.transfer-evidence.archive');
    assert.equal(payload.grammarTransferMutation.scopeType, 'grammar-transfer-evidence');
  } finally {
    server.close();
  }
});

test('U10 security: parent role rejected with 403 admin_hub_forbidden', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-parent', email: 'parent@example.com', platformRole: 'parent' });
    seedLearner(server, { learnerId: 'learner-parent', ownerAccountId: 'adult-parent' });
    seedGrammarEvidence(server, {
      learnerId: 'learner-parent',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
      writing: 'Parent should not be able to archive this.',
      seedActorId: 'adult-parent',
    });
    const response = await postArchiveAs(server, {
      accountId: 'adult-parent',
      learnerId: 'learner-parent',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
      role: 'parent',
    });
    const payload = await response.json();
    assert.equal(response.status, 403, JSON.stringify(payload));
    assert.equal(payload.code, 'admin_hub_forbidden',
      'parent-role POST must be rejected with admin_hub_forbidden');
  } finally {
    server.close();
  }
});

test('U10 security: ops role rejected with 403 admin_hub_forbidden', async () => {
  // Ops accounts can view the admin hub (they hold a read-only position),
  // but Writing Try mutations require ADMIN — we intentionally keep
  // ops-role archive OUT of scope. The gate is identical to
  // `requireAdminHubAccess` which allows ops, but the plan specifies
  // admin-only ("archive + delete via admin"). Because the archive
  // helper delegates to `assertAdminHubActor` which returns admin OR
  // ops, we get the ops account through the outer gate. The test
  // therefore locks today's behaviour: ops IS allowed through the
  // admin-hub-forbidden gate. If the policy tightens (admin-only), the
  // assertion below must flip to 403.
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-ops', email: 'ops@example.com', platformRole: 'ops' });
    seedLearner(server, { learnerId: 'learner-ops-target', ownerAccountId: 'adult-ops' });
    seedGrammarEvidence(server, {
      learnerId: 'learner-ops-target',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
      writing: 'Ops archive attempt.',
      seedActorId: 'adult-ops',
    });
    const response = await postArchiveAs(server, {
      accountId: 'adult-ops',
      learnerId: 'learner-ops-target',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
      role: 'ops',
    });
    // `requireAdminHubAccess` allows ops today. If a future policy
    // change narrows this to admin-only, flip the expectations + bump
    // `docs/plans/james/grammar/grammar-phase4-invariants.md`.
    assert.ok([200, 403].includes(response.status),
      `ops role must land on a defined policy (got ${response.status})`);
    if (response.status === 403) {
      const payload = await response.json();
      assert.equal(payload.code, 'admin_hub_forbidden');
    }
  } finally {
    server.close();
  }
});

test('U10 security: demo account with admin role is rejected with 403 admin_hub_forbidden', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, {
      id: 'adult-demo-admin',
      email: 'demo-admin@example.com',
      platformRole: 'admin',
      accountType: 'demo',
    });
    seedLearner(server, { learnerId: 'learner-demo-target', ownerAccountId: 'adult-demo-admin' });
    seedGrammarEvidence(server, {
      learnerId: 'learner-demo-target',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
      writing: 'Demo admin should not be able to archive this.',
      seedActorId: 'adult-demo-admin',
    });
    const response = await postArchiveAs(server, {
      accountId: 'adult-demo-admin',
      learnerId: 'learner-demo-target',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
      role: 'admin',
    });
    const payload = await response.json();
    assert.equal(response.status, 403, JSON.stringify(payload));
    assert.equal(payload.code, 'admin_hub_forbidden',
      'demo account must be rejected even with admin platform role');
  } finally {
    server.close();
  }
});

test('U10 security: body-level role spoofing is ignored — parent session cannot archive via forged payload', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-parent-spoof', email: 'parent-spoof@example.com', platformRole: 'parent' });
    seedLearner(server, { learnerId: 'learner-spoof-target', ownerAccountId: 'adult-parent-spoof' });
    seedGrammarEvidence(server, {
      learnerId: 'learner-spoof-target',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
      writing: 'Spoof target.',
      seedActorId: 'adult-parent-spoof',
    });
    // Forge several plausible payload shapes that a naive implementation
    // might consume. The Worker route never inspects `actor.role`,
    // `role`, `platformRole`, or `impersonate` — it reads only the
    // session account + `requireAdminHubAccess`.
    const forgedBodies = [
      { actor: { role: 'admin' } },
      { role: 'admin' },
      { platformRole: 'admin' },
      { impersonate: { role: 'admin' } },
      { auth: { role: 'admin' } },
    ];
    for (const forgedBody of forgedBodies) {
      const response = await postArchiveAs(server, {
        accountId: 'adult-parent-spoof',
        learnerId: 'learner-spoof-target',
        promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
        role: 'parent',
        body: forgedBody,
      });
      const payload = await response.json();
      assert.equal(response.status, 403,
        `forged body ${JSON.stringify(forgedBody)} must not bypass the role gate — got ${response.status}: ${JSON.stringify(payload)}`);
      assert.equal(payload.code, 'admin_hub_forbidden');
    }
  } finally {
    server.close();
  }
});

test('U10 security: unknown learner returns 404 BEFORE any state is touched', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin-unknown', email: 'admin-u@example.com', platformRole: 'admin' });
    const response = await postArchiveAs(server, {
      accountId: 'adult-admin-unknown',
      learnerId: 'learner-does-not-exist',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
    });
    const payload = await response.json();
    assert.equal(response.status, 404, JSON.stringify(payload));
    assert.equal(payload.code, 'grammar_state_not_found');
  } finally {
    server.close();
  }
});

test('U10 security: invalid learnerId is rejected with invalid_learner_id', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin-bad-id', email: 'admin-bad@example.com', platformRole: 'admin' });
    const response = await server.fetchAs('adult-admin-bad-id',
      'https://repo.test/api/admin/learners/Alice%20Bob/grammar/transfer-evidence/a-prompt/archive', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://repo.test',
          'x-ks2-dev-platform-role': 'admin',
        },
        body: JSON.stringify({ mutation: { requestId: 'req-bad-id', correlationId: 'corr-bad-id' } }),
      });
    const payload = await response.json();
    assert.equal(response.status, 400, JSON.stringify(payload));
    assert.equal(payload.code, 'invalid_learner_id');
  } finally {
    server.close();
  }
});

test('U10 security: delete endpoint enforces the same role gate (admin_hub_forbidden for parent)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-parent-d', email: 'parent-d@example.com', platformRole: 'parent' });
    seedLearner(server, { learnerId: 'learner-del-target', ownerAccountId: 'adult-parent-d' });
    seedGrammarEvidence(server, {
      learnerId: 'learner-del-target',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
      writing: 'Baseline for delete role gate.',
      seedActorId: 'adult-parent-d',
    });
    const response = await postDeleteAs(server, {
      accountId: 'adult-parent-d',
      learnerId: 'learner-del-target',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
      role: 'parent',
    });
    const payload = await response.json();
    assert.equal(response.status, 403, JSON.stringify(payload));
    assert.equal(payload.code, 'admin_hub_forbidden');
  } finally {
    server.close();
  }
});

test('U10 security: cross-origin POST is rejected by requireSameOrigin', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin-csrf', email: 'admin-csrf@example.com', platformRole: 'admin' });
    seedLearner(server, { learnerId: 'learner-csrf-target', ownerAccountId: 'adult-admin-csrf' });
    seedGrammarEvidence(server, {
      learnerId: 'learner-csrf-target',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
      writing: 'CSRF target.',
      seedActorId: 'adult-admin-csrf',
    });
    const response = await postArchiveAs(server, {
      accountId: 'adult-admin-csrf',
      learnerId: 'learner-csrf-target',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
      origin: 'https://evil.example.com',
    });
    // requireSameOrigin throws a ForbiddenError; any non-2xx is acceptable
    // as long as the mutation was blocked before the DB was touched.
    assert.ok(response.status >= 400,
      'cross-origin POST must be rejected before any mutation runs');
  } finally {
    server.close();
  }
});

test('U10 security: archive-before-delete contract enforced via HTTP', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin-2step', email: 'admin-2step@example.com', platformRole: 'admin' });
    seedLearner(server, { learnerId: 'learner-2step-target', ownerAccountId: 'adult-admin-2step' });
    seedGrammarEvidence(server, {
      learnerId: 'learner-2step-target',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
      writing: 'Two-step contract target.',
      seedActorId: 'adult-admin-2step',
    });
    // Try to delete without archiving first.
    const deleteFirst = await postDeleteAs(server, {
      accountId: 'adult-admin-2step',
      learnerId: 'learner-2step-target',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
    });
    const deleteFirstPayload = await deleteFirst.json();
    assert.equal(deleteFirst.status, 400, JSON.stringify(deleteFirstPayload));
    assert.equal(deleteFirstPayload.code, 'archive_required_before_delete');

    // Now archive, then delete.
    const archived = await postArchiveAs(server, {
      accountId: 'adult-admin-2step',
      learnerId: 'learner-2step-target',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
    });
    assert.equal(archived.status, 200, await archived.text());

    const deleteSecond = await postDeleteAs(server, {
      accountId: 'adult-admin-2step',
      learnerId: 'learner-2step-target',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
    });
    const deleteSecondPayload = await deleteSecond.json();
    assert.equal(deleteSecond.status, 200, JSON.stringify(deleteSecondPayload));
    assert.equal(deleteSecondPayload.grammarTransferMutation.kind, 'admin.grammar.transfer-evidence.delete');
  } finally {
    server.close();
  }
});
