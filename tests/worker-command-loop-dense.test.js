// U4 — Dense-history full command loop tests.
//
// Extends capacity smoke coverage from start-session only to full command
// loops (start → advance → submit → end) for all three subjects, plus
// stale-409 retry, parent hub pagination, and end-session idempotency.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorkerRepositoryServer } from './helpers/worker-server.js';

const BASE_URL = 'https://repo.test';

// ---------------------------------------------------------------------------
// Seeding helpers (mirrors grammar-transfer-admin-security.test.js)
// ---------------------------------------------------------------------------

function seedAdultAccount(server, {
  id,
  email,
  platformRole = 'parent',
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

// ---------------------------------------------------------------------------
// HTTP helpers — issue subject commands through the Worker fetch boundary.
// ---------------------------------------------------------------------------

async function postSubjectCommand(server, {
  accountId,
  subjectId,
  command,
  learnerId,
  requestId,
  expectedLearnerRevision,
  payload = {},
}) {
  const response = await server.fetchAs(
    accountId,
    `${BASE_URL}/api/subjects/${subjectId}/command`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        command,
        learnerId,
        requestId,
        expectedLearnerRevision,
        payload,
      }),
    },
  );
  const body = await response.json();
  return { response, body };
}

// Convenience: extracts the new revision from a successful command response.
function revisionFrom(result) {
  return result.body?.mutation?.appliedRevision ?? null;
}

// Extract a valid submit-answer payload from a Grammar/Punctuation session
// read model. Grammar expects `{ response: { answer: <valid option> } }` for
// single_choice questions; Punctuation uses a similar shape. Returns an object
// suitable as the `payload` for a `submit-answer` command.
function grammarAnswerPayloadFromReadModel(readModel) {
  const item = readModel?.session?.currentItem;
  const spec = item?.inputSpec;
  if (spec?.type === 'single_choice' && Array.isArray(spec.options) && spec.options.length > 0) {
    return { response: { answer: spec.options[0].value } };
  }
  if (spec?.type === 'checkbox_list' && Array.isArray(spec.options) && spec.options.length > 0) {
    return { response: { selected: [spec.options[0].value] } };
  }
  // Fallback: the engine will normalise the response.
  return { response: { answer: 'a' } };
}

function punctuationAnswerPayloadFromReadModel(readModel) {
  // Punctuation uses inputKind ('choice' | 'text') and a flat payload shape
  // ({ choiceIndex } or { typed }), unlike Grammar's inputSpec/response shape.
  const item = readModel?.session?.currentItem;
  if (item?.inputKind === 'choice') {
    return { choiceIndex: 0 };
  }
  return { typed: 'a' };
}

// ---------------------------------------------------------------------------
// 1. Spelling full loop: start-session → submit-answer → end-session
// ---------------------------------------------------------------------------
test('command loop: Spelling full loop (start → submit → end)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-spell', email: 'spell@example.com' });
    seedLearner(server, { learnerId: 'learner-spell', ownerAccountId: 'adult-spell' });

    let revision = 0;
    let seq = 0;

    // Start session.
    const start = await postSubjectCommand(server, {
      accountId: 'adult-spell',
      subjectId: 'spelling',
      command: 'start-session',
      learnerId: 'learner-spell',
      requestId: `spell-loop-${++seq}`,
      expectedLearnerRevision: revision,
      payload: { mode: 'single', slug: 'possess', length: 1 },
    });
    assert.equal(start.response.status, 200, `start-session failed: ${JSON.stringify(start.body)}`);
    assert.ok(start.body.ok, 'start-session response must be ok');
    revision = revisionFrom(start);
    assert.ok(Number.isFinite(revision), 'start-session must return a finite revision');

    // Submit answer — spelling expects a string answer.
    const submit = await postSubjectCommand(server, {
      accountId: 'adult-spell',
      subjectId: 'spelling',
      command: 'submit-answer',
      learnerId: 'learner-spell',
      requestId: `spell-loop-${++seq}`,
      expectedLearnerRevision: revision,
      payload: { answer: 'possess' },
    });
    assert.equal(submit.response.status, 200, `submit-answer failed: ${JSON.stringify(submit.body)}`);
    revision = revisionFrom(submit);

    // If the session is still in progress and awaiting advance, continue.
    if (submit.body.subjectReadModel?.phase === 'session' && submit.body.subjectReadModel?.awaitingAdvance) {
      const cont = await postSubjectCommand(server, {
        accountId: 'adult-spell',
        subjectId: 'spelling',
        command: 'continue-session',
        learnerId: 'learner-spell',
        requestId: `spell-loop-${++seq}`,
        expectedLearnerRevision: revision,
      });
      assert.equal(cont.response.status, 200, `continue-session failed: ${JSON.stringify(cont.body)}`);
      revision = revisionFrom(cont);
    }

    // End session — only needed if we are still in a session phase.
    if (submit.body.subjectReadModel?.phase === 'session' || submit.body.subjectReadModel?.phase === 'summary') {
      // Session may have already moved to idle/summary after a single-word session.
      // If still in session, send end-session.
    }
    const end = await postSubjectCommand(server, {
      accountId: 'adult-spell',
      subjectId: 'spelling',
      command: 'end-session',
      learnerId: 'learner-spell',
      requestId: `spell-loop-${++seq}`,
      expectedLearnerRevision: revision,
    });
    assert.equal(end.response.status, 200, `end-session failed: ${JSON.stringify(end.body)}`);
    const endRevision = revisionFrom(end);
    assert.ok(endRevision >= revision, 'end-session revision must not decrease');

    // Verify progress: the final subject read model should not be in session phase.
    const finalPhase = end.body.subjectReadModel?.phase;
    assert.ok(
      finalPhase !== 'session',
      `after end-session, phase must not be 'session'; got '${finalPhase}'`,
    );
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// 2. Grammar full loop: start-session → submit-answer → end-session
// ---------------------------------------------------------------------------
test('command loop: Grammar full loop (start → submit → end)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-gram', email: 'gram@example.com' });
    seedLearner(server, { learnerId: 'learner-gram', ownerAccountId: 'adult-gram' });

    let revision = 0;
    let seq = 0;

    // Start session.
    const start = await postSubjectCommand(server, {
      accountId: 'adult-gram',
      subjectId: 'grammar',
      command: 'start-session',
      learnerId: 'learner-gram',
      requestId: `gram-loop-${++seq}`,
      expectedLearnerRevision: revision,
      payload: {},
    });
    assert.equal(start.response.status, 200, `start-session failed: ${JSON.stringify(start.body)}`);
    revision = revisionFrom(start);

    // Submit answers — grammar questions use single_choice input specs;
    // extract the first valid option from the read model so the engine
    // accepts the response.
    let latestReadModel = start.body.subjectReadModel;
    for (let i = 0; i < 30; i++) {
      if (latestReadModel?.phase !== 'session') break;

      const answerPayload = grammarAnswerPayloadFromReadModel(latestReadModel);
      const answer = await postSubjectCommand(server, {
        accountId: 'adult-gram',
        subjectId: 'grammar',
        command: 'submit-answer',
        learnerId: 'learner-gram',
        requestId: `gram-loop-${++seq}`,
        expectedLearnerRevision: revision,
        payload: answerPayload,
      });
      assert.equal(answer.response.status, 200, `submit-answer #${i} failed: ${JSON.stringify(answer.body)}`);
      revision = revisionFrom(answer);
      latestReadModel = answer.body.subjectReadModel;

      if (latestReadModel?.phase !== 'session') break;

      // If awaiting advance / continue, send continue-session.
      if (latestReadModel?.awaitingAdvance) {
        const cont = await postSubjectCommand(server, {
          accountId: 'adult-gram',
          subjectId: 'grammar',
          command: 'continue-session',
          learnerId: 'learner-gram',
          requestId: `gram-loop-${++seq}`,
          expectedLearnerRevision: revision,
        });
        assert.equal(cont.response.status, 200, `continue-session failed: ${JSON.stringify(cont.body)}`);
        revision = revisionFrom(cont);
        latestReadModel = cont.body.subjectReadModel;
        if (latestReadModel?.phase !== 'session') break;
      }
    }

    assert.ok(seq > 1, 'at least one answer must have been submitted');

    // End session.
    const end = await postSubjectCommand(server, {
      accountId: 'adult-gram',
      subjectId: 'grammar',
      command: 'end-session',
      learnerId: 'learner-gram',
      requestId: `gram-loop-${++seq}`,
      expectedLearnerRevision: revision,
    });
    assert.equal(end.response.status, 200, `end-session failed: ${JSON.stringify(end.body)}`);
    const endRevision = revisionFrom(end);
    assert.ok(endRevision >= revision, 'grammar end-session revision must not decrease');
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// 3. Punctuation full loop: start-session → submit-answer → end-session
// ---------------------------------------------------------------------------
test('command loop: Punctuation full loop (start → submit → end)', async () => {
  const server = createWorkerRepositoryServer({
    env: { PUNCTUATION_SUBJECT_ENABLED: 'true' },
  });
  try {
    seedAdultAccount(server, { id: 'adult-punct', email: 'punct@example.com' });
    seedLearner(server, { learnerId: 'learner-punct', ownerAccountId: 'adult-punct' });

    let revision = 0;
    let seq = 0;

    // Start session.
    const start = await postSubjectCommand(server, {
      accountId: 'adult-punct',
      subjectId: 'punctuation',
      command: 'start-session',
      learnerId: 'learner-punct',
      requestId: `punct-loop-${++seq}`,
      expectedLearnerRevision: revision,
      payload: {},
    });
    assert.equal(start.response.status, 200, `start-session failed: ${JSON.stringify(start.body)}`);
    revision = revisionFrom(start);

    // Submit answers — extract valid option values from the read model.
    let latestPunctReadModel = start.body.subjectReadModel;
    for (let i = 0; i < 30; i++) {
      // Punctuation phases: active-item → (submit) → feedback → (continue) → active-item | summary.
      // Only submit when an item is active; break on anything outside the session cycle.
      if (latestPunctReadModel?.phase !== 'active-item') break;

      const answerPayload = punctuationAnswerPayloadFromReadModel(latestPunctReadModel);
      const answer = await postSubjectCommand(server, {
        accountId: 'adult-punct',
        subjectId: 'punctuation',
        command: 'submit-answer',
        learnerId: 'learner-punct',
        requestId: `punct-loop-${++seq}`,
        expectedLearnerRevision: revision,
        payload: answerPayload,
      });
      assert.equal(answer.response.status, 200, `submit-answer #${i} failed: ${JSON.stringify(answer.body)}`);
      revision = revisionFrom(answer);
      latestPunctReadModel = answer.body.subjectReadModel;

      // After submit, Punctuation enters 'feedback'; send continue-session
      // to advance to the next item (or summary/idle).
      if (latestPunctReadModel?.phase === 'feedback' || latestPunctReadModel?.awaitingAdvance) {
        const cont = await postSubjectCommand(server, {
          accountId: 'adult-punct',
          subjectId: 'punctuation',
          command: 'continue-session',
          learnerId: 'learner-punct',
          requestId: `punct-loop-${++seq}`,
          expectedLearnerRevision: revision,
        });
        assert.equal(cont.response.status, 200, `continue-session failed: ${JSON.stringify(cont.body)}`);
        revision = revisionFrom(cont);
        latestPunctReadModel = cont.body.subjectReadModel;
      }
    }

    assert.ok(seq > 1, 'at least one answer must have been submitted');

    // End session.
    const end = await postSubjectCommand(server, {
      accountId: 'adult-punct',
      subjectId: 'punctuation',
      command: 'end-session',
      learnerId: 'learner-punct',
      requestId: `punct-loop-${++seq}`,
      expectedLearnerRevision: revision,
    });
    assert.equal(end.response.status, 200, `end-session failed: ${JSON.stringify(end.body)}`);
    const endRevision = revisionFrom(end);
    assert.ok(endRevision >= revision, 'punctuation end-session revision must not decrease');
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// 4. Grammar stale-409 retry: concurrent revision bump → 409 → retry
// ---------------------------------------------------------------------------
test('command loop: Grammar stale-409 retry (concurrent revision bump)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-g409', email: 'g409@example.com' });
    seedLearner(server, { learnerId: 'learner-g409', ownerAccountId: 'adult-g409' });

    let revision = 0;
    let seq = 0;

    // Start session to get initial revision.
    const start = await postSubjectCommand(server, {
      accountId: 'adult-g409',
      subjectId: 'grammar',
      command: 'start-session',
      learnerId: 'learner-g409',
      requestId: `g409-${++seq}`,
      expectedLearnerRevision: revision,
      payload: {},
    });
    assert.equal(start.response.status, 200, `start-session failed: ${JSON.stringify(start.body)}`);
    revision = revisionFrom(start);

    // Inject a concurrent revision bump: wrap db.prepare so the FIRST
    // `SELECT ... state_revision FROM learner_profiles` returns the
    // current value, then bumps the revision before the CAS UPDATE fires.
    // This is the proven pattern from grammar-transfer-admin-security.test.js.
    const realDb = server.DB.db;
    const originalPrepare = realDb.prepare.bind(realDb);
    let firstSelectSeen = false;
    realDb.prepare = (sql) => {
      const statement = originalPrepare(sql);
      const normalised = String(sql || '').replace(/\s+/g, ' ').trim();
      if (
        !firstSelectSeen
        && /SELECT.*state_revision.*FROM learner_profiles/i.test(normalised)
      ) {
        firstSelectSeen = true;
        const originalGet = statement.get.bind(statement);
        statement.get = (...args) => {
          const row = originalGet(...args);
          // Bump state_revision so the CAS misses.
          originalPrepare(
            'UPDATE learner_profiles SET state_revision = state_revision + 1 WHERE id = ?',
          ).run('learner-g409');
          return row;
        };
      }
      return statement;
    };

    // Extract a valid answer from the session read model.
    const grammarAnswerPayload = grammarAnswerPayloadFromReadModel(start.body.subjectReadModel);

    // Submit with the now-stale revision. The interceptor bumps the
    // revision between the SELECT and the CAS UPDATE, so the server-side
    // retry path fires. The first attempt fails CAS, the retry rebases
    // onto the fresh revision, and the command should succeed (200) via
    // the built-in CAS retry mechanism.
    const staleSubmit = await postSubjectCommand(server, {
      accountId: 'adult-g409',
      subjectId: 'grammar',
      command: 'submit-answer',
      learnerId: 'learner-g409',
      requestId: `g409-${++seq}`,
      expectedLearnerRevision: revision,
      payload: grammarAnswerPayload,
    });

    // Both outcomes are valid: 200 means server-side CAS retry succeeded (rebased),
    // 409 means stale-at-entry check fired (client must read fresh revision and retry).
    // The test cannot deterministically control which path fires because it depends on
    // the exact timing of the interception relative to the CAS batch.
    if (staleSubmit.response.status === 200) {
      // CAS retry succeeded — progress preserved.
      const newRevision = revisionFrom(staleSubmit);
      assert.ok(
        newRevision > revision,
        `after CAS retry, revision must advance; got ${newRevision} vs base ${revision}`,
      );
    } else {
      // Stale-at-entry 409 — the client would retry with fresh revision.
      assert.equal(staleSubmit.response.status, 409, `expected 200 or 409; got ${staleSubmit.response.status}`);
      assert.equal(staleSubmit.body.code, 'stale_write');

      // Restore original prepare for the retry.
      realDb.prepare = originalPrepare;

      // Read fresh revision from the DB.
      const freshRow = realDb.prepare(
        'SELECT state_revision FROM learner_profiles WHERE id = ?',
      ).get('learner-g409');
      const freshRevision = Number(freshRow.state_revision);

      // Retry with the fresh revision — this must succeed.
      const retry = await postSubjectCommand(server, {
        accountId: 'adult-g409',
        subjectId: 'grammar',
        command: 'submit-answer',
        learnerId: 'learner-g409',
        requestId: `g409-${++seq}`,
        expectedLearnerRevision: freshRevision,
        payload: grammarAnswerPayload,
      });
      assert.equal(retry.response.status, 200, `retry after 409 failed: ${JSON.stringify(retry.body)}`);
      assert.ok(
        revisionFrom(retry) > freshRevision,
        'retry must advance the revision',
      );
    }
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// 5. Punctuation stale-409 retry: same pattern as Grammar
// ---------------------------------------------------------------------------
test('command loop: Punctuation stale-409 retry (concurrent revision bump)', async () => {
  const server = createWorkerRepositoryServer({
    env: { PUNCTUATION_SUBJECT_ENABLED: 'true' },
  });
  try {
    seedAdultAccount(server, { id: 'adult-p409', email: 'p409@example.com' });
    seedLearner(server, { learnerId: 'learner-p409', ownerAccountId: 'adult-p409' });

    let revision = 0;
    let seq = 0;

    // Start session.
    const start = await postSubjectCommand(server, {
      accountId: 'adult-p409',
      subjectId: 'punctuation',
      command: 'start-session',
      learnerId: 'learner-p409',
      requestId: `p409-${++seq}`,
      expectedLearnerRevision: revision,
      payload: {},
    });
    assert.equal(start.response.status, 200, `start-session failed: ${JSON.stringify(start.body)}`);
    revision = revisionFrom(start);

    // Inject the same concurrent-revision-bump interception.
    const realDb = server.DB.db;
    const originalPrepare = realDb.prepare.bind(realDb);
    let firstSelectSeen = false;
    realDb.prepare = (sql) => {
      const statement = originalPrepare(sql);
      const normalised = String(sql || '').replace(/\s+/g, ' ').trim();
      if (
        !firstSelectSeen
        && /SELECT.*state_revision.*FROM learner_profiles/i.test(normalised)
      ) {
        firstSelectSeen = true;
        const originalGet = statement.get.bind(statement);
        statement.get = (...args) => {
          const row = originalGet(...args);
          originalPrepare(
            'UPDATE learner_profiles SET state_revision = state_revision + 1 WHERE id = ?',
          ).run('learner-p409');
          return row;
        };
      }
      return statement;
    };

    // Extract a valid answer from the session read model.
    const punctAnswerPayload = punctuationAnswerPayloadFromReadModel(start.body.subjectReadModel);

    const staleSubmit = await postSubjectCommand(server, {
      accountId: 'adult-p409',
      subjectId: 'punctuation',
      command: 'submit-answer',
      learnerId: 'learner-p409',
      requestId: `p409-${++seq}`,
      expectedLearnerRevision: revision,
      payload: punctAnswerPayload,
    });

    // Both outcomes are valid: 200 means server-side CAS retry succeeded (rebased),
    // 409 means stale-at-entry check fired (client must read fresh revision and retry).
    // The test cannot deterministically control which path fires because it depends on
    // the exact timing of the interception relative to the CAS batch.
    if (staleSubmit.response.status === 200) {
      const newRevision = revisionFrom(staleSubmit);
      assert.ok(
        newRevision > revision,
        `after CAS retry, revision must advance; got ${newRevision} vs base ${revision}`,
      );
    } else {
      assert.equal(staleSubmit.response.status, 409, `expected 200 or 409; got ${staleSubmit.response.status}`);
      assert.equal(staleSubmit.body.code, 'stale_write');

      realDb.prepare = originalPrepare;

      const freshRow = realDb.prepare(
        'SELECT state_revision FROM learner_profiles WHERE id = ?',
      ).get('learner-p409');
      const freshRevision = Number(freshRow.state_revision);

      const retry = await postSubjectCommand(server, {
        accountId: 'adult-p409',
        subjectId: 'punctuation',
        command: 'submit-answer',
        learnerId: 'learner-p409',
        requestId: `p409-${++seq}`,
        expectedLearnerRevision: freshRevision,
        payload: punctAnswerPayload,
      });
      assert.equal(retry.response.status, 200, `retry after 409 failed: ${JSON.stringify(retry.body)}`);
      assert.ok(
        revisionFrom(retry) > freshRevision,
        'retry must advance the revision',
      );
    }
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// 6. Parent Hub pagination: seed >10 completed sessions → bounded pages
//
// Default limit is 10 (normaliseHistoryLimit fallback), max 50.
// Seed 15 sessions, fetch default → expect ≤10 with hasMore + nextCursor.
// ---------------------------------------------------------------------------
test('command loop: Parent Hub recent-sessions pagination (>10 sessions bounded)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-page', email: 'page@example.com' });
    seedLearner(server, { learnerId: 'learner-page', ownerAccountId: 'adult-page' });

    // Seed 15 completed spelling sessions directly in the practice_sessions
    // table to bypass the slow command loop.
    const baseTime = Date.UTC(2026, 0, 1);
    for (let i = 0; i < 15; i++) {
      const sessionId = `page-session-${String(i).padStart(3, '0')}`;
      const createdAt = baseTime + (i * 60_000);
      server.DB.db.prepare(`
        INSERT INTO practice_sessions (
          id, learner_id, subject_id, session_kind, status,
          session_state_json, summary_json, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        sessionId,
        'learner-page',
        'spelling',
        'single',
        'completed',
        JSON.stringify({ phase: 'idle' }),
        JSON.stringify({ score: i, total: 10 }),
        createdAt,
        createdAt,
      );
    }

    // Fetch page 1 (default limit = 10).
    const page1Resp = await server.fetchAs(
      'adult-page',
      `${BASE_URL}/api/hubs/parent/recent-sessions?learnerId=learner-page`,
    );
    assert.equal(page1Resp.status, 200);
    const page1 = await page1Resp.json();
    assert.ok(page1.ok, 'page 1 must be ok');
    assert.ok(
      page1.sessions.length <= 10,
      `page 1 must return ≤10 sessions; got ${page1.sessions.length}`,
    );
    assert.ok(page1.page?.hasMore, 'page 1 must indicate hasMore with 15 sessions seeded');
    assert.ok(page1.page?.nextCursor, 'page 1 must provide a nextCursor');

    // Fetch page 2 using the cursor.
    const page2Resp = await server.fetchAs(
      'adult-page',
      `${BASE_URL}/api/hubs/parent/recent-sessions?learnerId=learner-page&cursor=${encodeURIComponent(page1.page.nextCursor)}`,
    );
    assert.equal(page2Resp.status, 200);
    const page2 = await page2Resp.json();
    assert.ok(page2.ok, 'page 2 must be ok');
    assert.ok(page2.sessions.length > 0, 'page 2 must return remaining sessions');
    assert.equal(
      page1.sessions.length + page2.sessions.length,
      15,
      `total sessions across pages must equal 15; got ${page1.sessions.length} + ${page2.sessions.length}`,
    );

    // No overlap between pages.
    const page1Ids = new Set(page1.sessions.map((s) => s.id));
    const page2Ids = new Set(page2.sessions.map((s) => s.id));
    for (const id of page2Ids) {
      assert.ok(!page1Ids.has(id), `session ${id} must not appear on both pages`);
    }
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// 7. End-session idempotency: receipt replay returns 200 with replayed flag
// ---------------------------------------------------------------------------
test('command loop: end-session idempotency (receipt replay)', async () => {
  const server = createWorkerRepositoryServer();
  try {
    seedAdultAccount(server, { id: 'adult-idem', email: 'idem@example.com' });
    seedLearner(server, { learnerId: 'learner-idem', ownerAccountId: 'adult-idem' });

    let revision = 0;
    let seq = 0;

    // Start a spelling session.
    const start = await postSubjectCommand(server, {
      accountId: 'adult-idem',
      subjectId: 'spelling',
      command: 'start-session',
      learnerId: 'learner-idem',
      requestId: `idem-${++seq}`,
      expectedLearnerRevision: revision,
      payload: { mode: 'single', slug: 'possess', length: 1 },
    });
    assert.equal(start.response.status, 200, `start-session failed: ${JSON.stringify(start.body)}`);
    revision = revisionFrom(start);

    // End session — first call.
    const endRequestId = `idem-end-${++seq}`;
    const end1 = await postSubjectCommand(server, {
      accountId: 'adult-idem',
      subjectId: 'spelling',
      command: 'end-session',
      learnerId: 'learner-idem',
      requestId: endRequestId,
      expectedLearnerRevision: revision,
    });
    assert.equal(end1.response.status, 200, `end-session first call failed: ${JSON.stringify(end1.body)}`);
    const endRevision = revisionFrom(end1);

    // Replay: send the SAME end-session with the SAME requestId.
    // The original expectedLearnerRevision is stale now (the first call
    // bumped it), but the receipt lookup fires BEFORE the CAS check, so
    // the replay must succeed regardless of the revision we pass.
    const end2 = await postSubjectCommand(server, {
      accountId: 'adult-idem',
      subjectId: 'spelling',
      command: 'end-session',
      learnerId: 'learner-idem',
      requestId: endRequestId,
      expectedLearnerRevision: revision,
    });
    assert.equal(end2.response.status, 200, `end-session replay failed: ${JSON.stringify(end2.body)}`);
    assert.equal(
      end2.body.mutation?.replayed,
      true,
      'replay must set mutation.replayed = true',
    );
    assert.equal(
      end2.body.mutation?.appliedRevision,
      endRevision,
      'replay must return the same appliedRevision as the original',
    );
  } finally {
    server.close();
  }
});
