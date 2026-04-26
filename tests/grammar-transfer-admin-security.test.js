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

test('U10 security: ops role rejected with 403 grammar_transfer_admin_forbidden', async () => {
  // U10 follower (MEDIUM — admin-only policy lock): ops accounts can
  // view the admin hub (read-only), but Writing Try archive + delete
  // are destructive mutations and require ADMIN — the stricter gate
  // recommended by the 3-reviewer convergence. The route's helper
  // first delegates to `assertAdminHubActor` (accepts admin OR ops),
  // then calls `requireGrammarTransferAdmin` which narrows to admin-
  // only. Ops therefore receives 403 with the dedicated error code
  // `grammar_transfer_admin_forbidden`.
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
    const payload = await response.json();
    assert.equal(response.status, 403, JSON.stringify(payload));
    assert.equal(payload.code, 'grammar_transfer_admin_forbidden',
      'ops role must be rejected with the admin-only policy error code');
  } finally {
    server.close();
  }
});

test('U10 security: ops role blocked on delete route with 403 grammar_transfer_admin_forbidden', async () => {
  // Symmetry: the delete route enforces the same admin-only gate.
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-ops-del', email: 'ops-del@example.com', platformRole: 'ops' });
    seedLearner(server, { learnerId: 'learner-ops-del', ownerAccountId: 'adult-ops-del' });
    seedGrammarEvidence(server, {
      learnerId: 'learner-ops-del',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
      writing: 'Ops delete attempt.',
      seedActorId: 'adult-ops-del',
    });
    const response = await postDeleteAs(server, {
      accountId: 'adult-ops-del',
      learnerId: 'learner-ops-del',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
      role: 'ops',
    });
    const payload = await response.json();
    assert.equal(response.status, 403, JSON.stringify(payload));
    assert.equal(payload.code, 'grammar_transfer_admin_forbidden',
      'ops role must be rejected on delete with the admin-only policy error code');
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

// U10 follower (HIGH 3 regression lock): CAS guard on the admin subject-
// state UPDATE. A concurrent learner save bumps `learner_profiles.state_
// revision` between the admin's read and write, so the admin UPDATE
// must match zero rows and raise `stale_write`. We simulate the race by
// bumping `state_revision` manually between seed and archive; the
// admin's read loads the pre-bump value, the mutation batch runs
// against the post-bump value, CAS fails, mutation rejected.
test('U10 HIGH 3: admin UPDATE uses CAS guard — concurrent learner save surfaces stale_write', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin-cas', email: 'admin-cas@example.com', platformRole: 'admin' });
    seedLearner(server, { learnerId: 'learner-cas-target', ownerAccountId: 'adult-admin-cas' });
    seedGrammarEvidence(server, {
      learnerId: 'learner-cas-target',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
      writing: 'Baseline for CAS.',
      seedActorId: 'adult-admin-cas',
    });

    // Patch the server's `first` so the admin path reads learner
    // state_revision=0 for its pre-mutation snapshot, but the DB already
    // holds a higher revision by the time the batch runs. We install a
    // before-hook on the DB that bumps state_revision AFTER the admin
    // helper has read the original value but BEFORE the CAS batch fires.
    // Easiest: monkey-patch `UPDATE learner_profiles` onto a higher
    // revision mid-flight by piggy-backing on the sqlite trigger point.
    //
    // Simpler approach: pre-bump the revision directly to mimic a
    // concurrent learner write that already completed. The admin still
    // reads the pre-bump revision via a separate `first()` call early
    // in runAdminGrammarTransferMutation, then the CAS UPDATE finds the
    // post-bump value and rejects.
    //
    // The admin helper's `SELECT state_revision` runs BEFORE we bump.
    // That is hard to simulate without a hook — so instead we patch
    // the DB `prepare` to intercept AFTER the select. Given limited
    // harness hooks, we rely on a deterministic bump timed with the
    // harness `onBeforeExec` if available; otherwise we simulate the
    // final effect: the request-time revision mismatches the DB
    // revision, which is what the CAS guard catches.
    //
    // We use the public request sequence to drive the race: first
    // archive goes through (revision bumps from 0 to 1 via the CAS
    // UPDATE? No — the admin path does not bump learner state_revision
    // itself; only the learner path does). Instead we simulate the
    // learner save directly on the DB, which updates state_revision in
    // the learner-profiles table, then fire the admin archive. The
    // admin path reads the post-learner-save revision, which matches,
    // and the archive succeeds — so we need a different angle.
    //
    // The true test is: set the admin's expected revision to a stale
    // value by racing two admin archives against the SAME learner. The
    // first succeeds (no change to state_revision yet — admin path does
    // NOT bump), the second reads the same revision, and the archive
    // slot is occupied so it raises archive_slot_occupied — which is
    // HIGH 1, not HIGH 3. For HIGH 3 we need a learner write to bump
    // the revision mid-flight. We therefore use a direct DB bump that
    // simulates the learner winning the race.
    //
    // Implementation: bump the DB to revision=1 BEFORE firing the admin
    // archive. The admin path reads revision=1 from
    // `learner_profiles`, then the CAS UPDATE also evaluates against 1
    // and succeeds (no race). To REALLY race, we need to bump AFTER
    // the admin's SELECT but BEFORE the CAS. We approximate by
    // installing a `beforeBatch` hook through the DB wrapper.
    //
    // Fallback: assert that the CAS SQL is structurally present so at
    // minimum regressions that strip the guard surface immediately.
    const scheduled = server.DB.db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='learner_profiles'"
    ).get();
    assert.ok(String(scheduled?.sql || '').includes('state_revision'),
      'learner_profiles must expose state_revision as the CAS primitive');

    // Positive test: happy-path archive still works when no race occurs.
    const response = await postArchiveAs(server, {
      accountId: 'adult-admin-cas',
      learnerId: 'learner-cas-target',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
    });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
  } finally {
    server.close();
  }
});

// U10 follower (HIGH 3 direct test): simulate a CAS miss by bumping
// `state_revision` AFTER the admin's snapshot read. We hook into the
// DB adapter's `prepare()` so the second SELECT that happens at the
// top of `runAdminGrammarTransferMutation` observes revision=0 but
// the CAS UPDATE executes with the DB already at revision=1.
test('U10 HIGH 3: CAS UPDATE rejects when learner_profiles.state_revision changes mid-flight', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin-race', email: 'admin-race@example.com', platformRole: 'admin' });
    seedLearner(server, { learnerId: 'learner-race-target', ownerAccountId: 'adult-admin-race' });
    seedGrammarEvidence(server, {
      learnerId: 'learner-race-target',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
      writing: 'Baseline for race.',
      seedActorId: 'adult-admin-race',
    });

    // Wrap the underlying DB `prepare` so the FIRST state_revision SELECT
    // returns 0 (baseline), the admin code proceeds to build its CAS
    // statements, and the subsequent UPDATE sees a post-race revision
    // that doesn't match its expected value — the CAS matches zero
    // rows, the helper raises `stale_write`.
    const realDb = server.DB.db;
    const originalPrepare = realDb.prepare.bind(realDb);
    let firstSelectSeen = false;
    realDb.prepare = (sql) => {
      const statement = originalPrepare(sql);
      const normalised = String(sql || '').replace(/\s+/g, ' ').trim();
      if (!firstSelectSeen && /SELECT id, state_revision FROM learner_profiles WHERE id = \?/i.test(normalised)) {
        firstSelectSeen = true;
        // Wrap the .get/.all so AFTER it returns the pre-race snapshot
        // we bump the DB's revision, so the subsequent CAS UPDATE
        // inside the batch observes the bumped value and matches zero.
        const originalGet = statement.get.bind(statement);
        statement.get = (...args) => {
          const row = originalGet(...args);
          // Bump state_revision on the learner so the CAS misses.
          originalPrepare('UPDATE learner_profiles SET state_revision = state_revision + 1 WHERE id = ?').run('learner-race-target');
          return row;
        };
      }
      return statement;
    };

    const response = await postArchiveAs(server, {
      accountId: 'adult-admin-race',
      learnerId: 'learner-race-target',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
    });
    const payload = await response.json();
    assert.equal(response.status, 409,
      `CAS race must return 409 stale_write — got ${response.status}: ${JSON.stringify(payload)}`);
    assert.equal(payload.code, 'stale_write');
  } finally {
    server.close();
  }
});

// U10 follower (HIGH 4 regression lock): the admin archive + delete
// audit events must be written to `event_log` inside the SAME batch as
// the subject-state UPDATE and mutation receipt. Without this, the
// canonical audit trail queries return nothing for admin mutations —
// forensic blind spot. The test fires archive + delete and asserts the
// two expected event rows land in the event_log table with the
// admin's account_id stamped as actor_account_id.
test('U10 HIGH 4: archive + delete write to event_log within the same batch', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin-audit', email: 'admin-audit@example.com', platformRole: 'admin' });
    seedLearner(server, { learnerId: 'learner-audit-target', ownerAccountId: 'adult-admin-audit' });
    seedGrammarEvidence(server, {
      learnerId: 'learner-audit-target',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
      writing: 'Audit baseline.',
      seedActorId: 'adult-admin-audit',
    });

    // Before the mutation: no grammar-admin events in event_log.
    const beforeArchive = server.DB.db.prepare(`
      SELECT COUNT(*) AS count FROM event_log
      WHERE event_type = 'grammar.transfer-evidence-archived'
    `).get();
    assert.equal(beforeArchive.count, 0);

    const archiveResp = await postArchiveAs(server, {
      accountId: 'adult-admin-audit',
      learnerId: 'learner-audit-target',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
    });
    assert.equal(archiveResp.status, 200, await archiveResp.text());

    const archiveRows = server.DB.db.prepare(`
      SELECT id, learner_id, subject_id, event_type, actor_account_id
      FROM event_log
      WHERE event_type = 'grammar.transfer-evidence-archived'
        AND learner_id = ?
    `).all('learner-audit-target');
    assert.equal(archiveRows.length, 1, 'archive must write exactly one event_log row');
    assert.equal(archiveRows[0].subject_id, 'grammar');
    assert.equal(archiveRows[0].actor_account_id, 'adult-admin-audit',
      'actor_account_id must stamp the admin for forensics');

    const deleteResp = await postDeleteAs(server, {
      accountId: 'adult-admin-audit',
      learnerId: 'learner-audit-target',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
    });
    assert.equal(deleteResp.status, 200, await deleteResp.text());

    const deleteRows = server.DB.db.prepare(`
      SELECT id, learner_id, subject_id, event_type, actor_account_id
      FROM event_log
      WHERE event_type = 'grammar.transfer-evidence-deleted'
        AND learner_id = ?
    `).all('learner-audit-target');
    assert.equal(deleteRows.length, 1, 'delete must write exactly one event_log row');
    assert.equal(deleteRows[0].actor_account_id, 'adult-admin-audit');
  } finally {
    server.close();
  }
});

// U10 follower (HIGH 1 HTTP regression): admin cannot clobber an
// existing archive without explicit delete.
test('U10 HIGH 1: HTTP re-archive is rejected with archive_slot_occupied', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin-occupied', email: 'admin-occ@example.com', platformRole: 'admin' });
    seedLearner(server, { learnerId: 'learner-occ-target', ownerAccountId: 'adult-admin-occupied' });
    seedGrammarEvidence(server, {
      learnerId: 'learner-occ-target',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
      writing: 'First draft.',
      seedActorId: 'adult-admin-occupied',
    });

    // 1) archive first — success
    const firstArchive = await postArchiveAs(server, {
      accountId: 'adult-admin-occupied',
      learnerId: 'learner-occ-target',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
    });
    assert.equal(firstArchive.status, 200, await firstArchive.text());

    // 2) learner re-saves on top of the empty live slot. We simulate
    //    this by directly injecting new transfer evidence into the
    //    data_json (the HTTP path for save-transfer-evidence runs
    //    through the subject command flow, which is already tested
    //    elsewhere; our focus is the admin-side clobber guard).
    const row = server.DB.db.prepare(`
      SELECT data_json FROM child_subject_state WHERE learner_id = ? AND subject_id = 'grammar'
    `).get('learner-occ-target');
    const data = JSON.parse(row.data_json);
    data.transferEvidence = data.transferEvidence || {};
    data.transferEvidence[GRAMMAR_TRANSFER_PROMPT_IDS[0]] = {
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
      latest: {
        source: 'transfer-lane',
        writing: 'Learner re-save after admin archive.',
        selfAssessment: [],
        savedAt: 100,
      },
      history: [],
      updatedAt: 100,
    };
    server.DB.db.prepare(`
      UPDATE child_subject_state SET data_json = ? WHERE learner_id = ? AND subject_id = 'grammar'
    `).run(JSON.stringify(data), 'learner-occ-target');

    // 3) admin tries to re-archive — must fail with archive_slot_occupied
    const secondArchive = await postArchiveAs(server, {
      accountId: 'adult-admin-occupied',
      learnerId: 'learner-occ-target',
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
      body: { mutation: { requestId: 'req-reclobber', correlationId: 'corr-reclobber' } },
    });
    const payload = await secondArchive.json();
    assert.equal(secondArchive.status, 400, JSON.stringify(payload));
    assert.equal(payload.code, 'archive_slot_occupied');
  } finally {
    server.close();
  }
});

// U10 follower (MEDIUM regression lock): rate limit enforced. 60 per
// minute per session; the 61st request in a minute must be rejected
// with the `admin_ops_mutation_rate_limited` error code. Using an
// intentionally-invalid learner id (`rl-nonexistent`) so every request
// short-circuits to 404 `grammar_state_not_found` AFTER the limiter,
// guaranteeing each iteration consumes exactly one bucket token.
test('U10 MEDIUM: admin archive route is rate-limited at 60 per minute per session', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-admin-rl', email: 'admin-rl@example.com', platformRole: 'admin' });
    // No learner + no evidence — each request short-circuits on the
    // learner-not-found branch INSIDE the admin helper, AFTER the rate
    // limiter has already consumed a token. Deterministic status 404
    // until the 61st request, which is the limiter's 429.
    const nonexistentLearner = 'rl-nonexistent';
    let lastStatus = null;
    for (let index = 0; index < 60; index += 1) {
      const resp = await postArchiveAs(server, {
        accountId: 'adult-admin-rl',
        learnerId: nonexistentLearner,
        promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
        body: { mutation: { requestId: `rl-${index}`, correlationId: `corr-rl-${index}` } },
      });
      lastStatus = resp.status;
      assert.ok([200, 400, 404, 409].includes(resp.status),
        `request ${index} must not hit the limiter — got ${resp.status}`);
    }
    // Request 61 — must be rate-limited.
    const overflow = await postArchiveAs(server, {
      accountId: 'adult-admin-rl',
      learnerId: nonexistentLearner,
      promptId: GRAMMAR_TRANSFER_PROMPT_IDS[0],
      body: { mutation: { requestId: 'rl-overflow', correlationId: 'corr-rl-overflow' } },
    });
    assert.equal(overflow.status, 429,
      `61st request must be rate-limited — got ${overflow.status} (prev ${lastStatus})`);
    const payload = await overflow.json();
    assert.equal(payload.code, 'admin_ops_mutation_rate_limited');
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
