import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { SUBJECT_EXPOSURE_GATES } from '../src/platform/core/subject-availability.js';
import {
  assertNoForbiddenPunctuationAdultEvidenceKeys,
  assertNoForbiddenPunctuationReadModelKeys,
  punctuationAnswerFor,
  punctuationExpectedContextFor,
} from '../scripts/punctuation-production-smoke.mjs';
import { createSession } from '../worker/src/auth.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

// wrangler.jsonc is JSONC, not JSON: it permits `//` line comments and
// `/* ... */` block comments that the native JSON.parse rejects. We strip
// comments here (string-aware so we do not eat `//` inside a quoted value)
// rather than pulling in a dependency — Wrangler itself uses jsonc-parser
// upstream, but this single test only needs to read the `vars` block.
function stripJsonComments(source) {
  let result = '';
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    const n = source[i + 1];
    if (inLineComment) {
      if (c === '\n') { inLineComment = false; result += c; }
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && n === '/') { inBlockComment = false; i += 1; }
      continue;
    }
    if (inString) {
      result += c;
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; result += c; continue; }
    if (c === '/' && n === '/') { inLineComment = true; i += 1; continue; }
    if (c === '/' && n === '*') { inBlockComment = true; i += 1; continue; }
    result += c;
  }
  return result;
}

async function readWranglerVars() {
  const source = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  return JSON.parse(stripJsonComments(source)).vars || {};
}

function productionServer({ punctuationEnabled = false } = {}) {
  return createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
      PUNCTUATION_SUBJECT_ENABLED: punctuationEnabled ? 'true' : 'false',
    },
  });
}

function setCookieValues(response) {
  const raw = response.headers.getSetCookie?.() || String(response.headers.get('set-cookie') || '')
    .split(/,\s*(?=ks2_)/)
    .filter(Boolean);
  return raw
    .map((cookie) => String(cookie || '').split(';')[0])
    .filter(Boolean);
}

function cookieFrom(response) {
  return setCookieValues(response).find((cookie) => cookie.startsWith('ks2_session=')) || '';
}

function countRows(server, sql, ...params) {
  return Number(server.DB.db.prepare(sql).get(...params).count) || 0;
}

function punctuationMutationCounts(server, { accountId, learnerId, requestId = '' }) {
  return {
    learnerRevision: Number(server.DB.db.prepare(`
      SELECT state_revision
      FROM learner_profiles
      WHERE id = ?
    `).get(learnerId)?.state_revision) || 0,
    subjectState: countRows(server, `
      SELECT COUNT(*) AS count
      FROM child_subject_state
      WHERE learner_id = ? AND subject_id = 'punctuation'
    `, learnerId),
    practiceSessions: countRows(server, `
      SELECT COUNT(*) AS count
      FROM practice_sessions
      WHERE learner_id = ? AND subject_id = 'punctuation'
    `, learnerId),
    eventLog: countRows(server, `
      SELECT COUNT(*) AS count
      FROM event_log
      WHERE learner_id = ? AND subject_id = 'punctuation'
    `, learnerId),
    gameState: countRows(server, `
      SELECT COUNT(*) AS count
      FROM child_game_state
      WHERE learner_id = ?
    `, learnerId),
    mutationReceipts: countRows(server, `
      SELECT COUNT(*) AS count
      FROM mutation_receipts
      WHERE account_id = ? AND scope_type = 'learner' AND scope_id = ?
    `, accountId, learnerId),
    requestReceipts: requestId ? countRows(server, `
      SELECT COUNT(*) AS count
      FROM mutation_receipts
      WHERE account_id = ? AND request_id = ?
    `, accountId, requestId) : 0,
  };
}

async function postJson(server, path, body = {}, headers = {}) {
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

async function startDemo(server) {
  const demo = await postJson(server, '/api/demo/session');
  const cookie = cookieFrom(demo);
  const demoPayload = await demo.json();
  assert.equal(demo.status, 201, JSON.stringify(demoPayload));
  assert.ok(cookie);

  const bootstrap = await server.fetchRaw('https://repo.test/api/bootstrap', {
    headers: { cookie },
  });
  const bootstrapPayload = await bootstrap.json();
  assert.equal(bootstrap.status, 200, JSON.stringify(bootstrapPayload));

  return {
    cookie,
    accountId: bootstrapPayload.session.accountId,
    learnerId: bootstrapPayload.learners.selectedId,
    bootstrap: bootstrapPayload,
  };
}

async function postSubjectCommand(server, subjectId, { cookie, learnerId, revision, command, payload = {}, requestId }) {
  const response = await postJson(server, `/api/subjects/${subjectId}/command`, {
    command,
    learnerId,
    requestId,
    expectedLearnerRevision: revision,
    payload,
  }, {
    cookie,
    origin: 'https://repo.test',
  });
  return {
    response,
    body: await response.json(),
  };
}

async function postPunctuationCommand(server, args) {
  return postSubjectCommand(server, 'punctuation', args);
}

async function postSpellingCommand(server, args) {
  return postSubjectCommand(server, 'spelling', args);
}

async function adminCookieForLearner(server, learnerId) {
  const now = Date.now();
  const accountId = 'punctuation-release-admin';
  server.DB.db.prepare(`
    INSERT INTO adult_accounts (
      id, email, display_name, platform_role, selected_learner_id,
      created_at, updated_at, repo_revision, account_type
    )
    VALUES (?, ?, ?, 'admin', ?, ?, ?, 0, 'real')
  `).run(accountId, 'punctuation-release-admin@example.test', 'Punctuation Release Admin', learnerId, now, now);
  server.DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, ?, 'owner', 0, ?, ?)
  `).run(accountId, learnerId, now, now);
  const session = await createSession(server.env, accountId, 'email', now, { sessionKind: 'real' });
  return `ks2_session=${session.token}`;
}

test('Punctuation release smoke keeps demo exposure blocked by default', async () => {
  const server = productionServer();
  try {
    const demo = await startDemo(server);
    const blockedRequestId = 'punctuation-release-smoke-blocked';

    assert.equal(
      demo.bootstrap.subjectExposureGates[SUBJECT_EXPOSURE_GATES.punctuation],
      false,
    );

    const blocked = await postPunctuationCommand(server, {
      cookie: demo.cookie,
      learnerId: demo.learnerId,
      revision: 0,
      command: 'start-session',
      requestId: blockedRequestId,
      payload: { mode: 'smart', roundLength: '1' },
    });

    assert.equal(blocked.response.status, 404);
    assert.equal(blocked.body.code, 'subject_command_not_found');
    assert.deepEqual(punctuationMutationCounts(server, { ...demo, requestId: blockedRequestId }), {
      learnerRevision: 0,
      subjectState: 0,
      practiceSessions: 0,
      eventLog: 0,
      gameState: 0,
      mutationReceipts: 0,
      requestReceipts: 0,
    });
  } finally {
    server.close();
  }
});

test('Punctuation production rollout config intentionally enables the exposure gate', async () => {
  const vars = await readWranglerVars();
  assert.equal(vars.PUNCTUATION_SUBJECT_ENABLED, 'true');
});

test('Punctuation release smoke completes a gated demo action through Worker commands', async () => {
  const server = productionServer({ punctuationEnabled: true });
  try {
    const demo = await startDemo(server);

    assert.equal(
      demo.bootstrap.subjectExposureGates[SUBJECT_EXPOSURE_GATES.punctuation],
      true,
    );

    const start = await postPunctuationCommand(server, {
      cookie: demo.cookie,
      learnerId: demo.learnerId,
      revision: 0,
      command: 'start-session',
      requestId: 'punctuation-release-smoke-start',
      payload: { mode: 'smart', roundLength: '1' },
    });
    assert.equal(start.response.status, 200, JSON.stringify(start.body));
    assert.equal(start.body.subjectReadModel.phase, 'active-item');
    assert.equal(start.body.subjectReadModel.session.serverAuthority, 'worker');
    assertNoForbiddenPunctuationReadModelKeys(start.body.subjectReadModel, 'releaseSmoke.smart.start');

    const submitPayload = {
      ...punctuationAnswerFor(start.body.subjectReadModel.session.currentItem),
      ...punctuationExpectedContextFor(start.body.subjectReadModel.session),
    };
    const submit = await postPunctuationCommand(server, {
      cookie: demo.cookie,
      learnerId: demo.learnerId,
      revision: start.body.mutation.appliedRevision,
      command: 'submit-answer',
      requestId: 'punctuation-release-smoke-submit',
      payload: submitPayload,
    });
    assert.equal(submit.response.status, 200, JSON.stringify(submit.body));
    assert.equal(submit.body.subjectReadModel.phase, 'feedback');
    assert.equal(submit.body.subjectReadModel.feedback.kind, 'success');
    assertNoForbiddenPunctuationReadModelKeys(submit.body.subjectReadModel, 'releaseSmoke.smart.feedback');
    assert.equal(submit.body.domainEvents.some((event) => (
      event.type === 'punctuation.item-attempted' && event.correct === true
    )), true);

    const done = await postPunctuationCommand(server, {
      cookie: demo.cookie,
      learnerId: demo.learnerId,
      revision: submit.body.mutation.appliedRevision,
      command: 'continue-session',
      requestId: 'punctuation-release-smoke-continue',
    });
    assert.equal(done.response.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.subjectReadModel.phase, 'summary');
    assert.equal(done.body.subjectReadModel.summary.total, 1);
    assert.equal(done.body.subjectReadModel.summary.correct, 1);
    assert.equal(done.body.subjectReadModel.summary.accuracy, 100);
    assertNoForbiddenPunctuationReadModelKeys(done.body.subjectReadModel, 'releaseSmoke.smart.summary');

    assert.equal(server.DB.db.prepare(`
      SELECT COUNT(*) AS count
      FROM practice_sessions
      WHERE learner_id = ? AND subject_id = 'punctuation' AND status = 'completed'
    `).get(demo.learnerId).count, 1);
    assert.ok(server.DB.db.prepare(`
      SELECT COUNT(*) AS count
      FROM event_log
      WHERE learner_id = ? AND subject_id = 'punctuation'
    `).get(demo.learnerId).count >= 1);

    const beforeReplayCounts = punctuationMutationCounts(server, {
      ...demo,
      requestId: 'punctuation-release-smoke-submit',
    });
    const replay = await postPunctuationCommand(server, {
      cookie: demo.cookie,
      learnerId: demo.learnerId,
      revision: start.body.mutation.appliedRevision,
      command: 'submit-answer',
      requestId: 'punctuation-release-smoke-submit',
      payload: submitPayload,
    });
    assert.equal(replay.response.status, 200, JSON.stringify(replay.body));
    assert.equal(replay.body.mutation.replayed, true);
    assert.deepEqual(punctuationMutationCounts(server, {
      ...demo,
      requestId: 'punctuation-release-smoke-submit',
    }), beforeReplayCounts);

    const staleRequestId = 'punctuation-release-smoke-stale-start';
    const beforeStaleCounts = punctuationMutationCounts(server, {
      ...demo,
      requestId: staleRequestId,
    });
    const stale = await postPunctuationCommand(server, {
      cookie: demo.cookie,
      learnerId: demo.learnerId,
      revision: submit.body.mutation.appliedRevision,
      command: 'start-session',
      requestId: staleRequestId,
      payload: { mode: 'smart', roundLength: '1' },
    });
    assert.equal(stale.response.status, 409, JSON.stringify(stale.body));
    assert.equal(stale.body.code, 'stale_write');
    assert.deepEqual(punctuationMutationCounts(server, {
      ...demo,
      requestId: staleRequestId,
    }), beforeStaleCounts);

    const gpsStart = await postPunctuationCommand(server, {
      cookie: demo.cookie,
      learnerId: demo.learnerId,
      revision: done.body.mutation.appliedRevision,
      command: 'start-session',
      requestId: 'punctuation-release-smoke-gps-start',
      payload: { mode: 'gps', roundLength: '1' },
    });
    assert.equal(gpsStart.response.status, 200, JSON.stringify(gpsStart.body));
    assert.equal(gpsStart.body.subjectReadModel.phase, 'active-item');
    assert.equal(gpsStart.body.subjectReadModel.session.mode, 'gps');
    assert.equal(gpsStart.body.subjectReadModel.session.gps.delayedFeedback, true);
    assert.equal(gpsStart.body.subjectReadModel.feedback, null);
    assertNoForbiddenPunctuationReadModelKeys(gpsStart.body.subjectReadModel, 'releaseSmoke.gps.start');

    const gpsSubmit = await postPunctuationCommand(server, {
      cookie: demo.cookie,
      learnerId: demo.learnerId,
      revision: gpsStart.body.mutation.appliedRevision,
      command: 'submit-answer',
      requestId: 'punctuation-release-smoke-gps-submit',
      payload: {
        ...punctuationAnswerFor(gpsStart.body.subjectReadModel.session.currentItem),
        ...punctuationExpectedContextFor(gpsStart.body.subjectReadModel.session),
      },
    });
    assert.equal(gpsSubmit.response.status, 200, JSON.stringify(gpsSubmit.body));
    assert.equal(gpsSubmit.body.subjectReadModel.phase, 'summary');
    assert.equal(gpsSubmit.body.subjectReadModel.summary.total, 1);
    assert.equal(gpsSubmit.body.subjectReadModel.summary.gps.delayedFeedback, true);
    assert.equal(gpsSubmit.body.subjectReadModel.summary.gps.reviewItems.length, 1);
    assertNoForbiddenPunctuationReadModelKeys(gpsSubmit.body.subjectReadModel, 'releaseSmoke.gps.summary');

    const parentHub = await server.fetchRaw(`https://repo.test/api/hubs/parent?learnerId=${demo.learnerId}`, {
      headers: { cookie: demo.cookie },
    });
    const parentBody = await parentHub.json();
    assert.equal(parentHub.status, 200, JSON.stringify(parentBody));
    assert.equal(parentBody.parentHub.punctuationEvidence.hasEvidence, true);
    assert.ok(parentBody.parentHub.punctuationEvidence.overview.attempts >= 2);
    assert.equal(
      parentBody.parentHub.progressSnapshots.some((snapshot) => snapshot.subjectId === 'punctuation'),
      true,
    );
    assertNoForbiddenPunctuationAdultEvidenceKeys(parentBody.parentHub.punctuationEvidence, 'releaseSmoke.parentHub.punctuationEvidence');
    assertNoForbiddenPunctuationAdultEvidenceKeys(parentBody.parentHub.progressSnapshots, 'releaseSmoke.parentHub.progressSnapshots');

    const adminCookie = await adminCookieForLearner(server, demo.learnerId);
    const adminHub = await server.fetchRaw(`https://repo.test/api/hubs/admin?learnerId=${demo.learnerId}&auditLimit=5`, {
      headers: { cookie: adminCookie },
    });
    const adminBody = await adminHub.json();
    assert.equal(adminHub.status, 200, JSON.stringify(adminBody));
    const selectedDiagnostics = adminBody.adminHub.learnerSupport.selectedDiagnostics;
    assert.equal(selectedDiagnostics.learnerId, demo.learnerId);
    assert.equal(selectedDiagnostics.punctuationEvidence.hasEvidence, true);
    assertNoForbiddenPunctuationAdultEvidenceKeys(selectedDiagnostics.punctuationEvidence, 'releaseSmoke.adminHub.selectedDiagnostics.punctuationEvidence');
    assertNoForbiddenPunctuationAdultEvidenceKeys(adminBody.adminHub.learnerSupport.punctuationReleaseDiagnostics, 'releaseSmoke.adminHub.punctuationReleaseDiagnostics');

    // Phase 2 U10: extend the smoke matrix with behavioural starts for
    // Guided, Weak Spots, and Endmarks / Apostrophe focus modes. Each
    // entry asserts a mode-specific positive signal plus absence-of-leak
    // invariants. We avoid submitting answers on these starts (the GPS
    // test above already exercises the submit path) so the matrix stays
    // under the smoke budget while proving the commands route through
    // the Worker.
    const guidedStart = await postPunctuationCommand(server, {
      cookie: demo.cookie,
      learnerId: demo.learnerId,
      revision: gpsSubmit.body.mutation.appliedRevision,
      command: 'start-session',
      requestId: 'punctuation-release-smoke-guided-start',
      payload: { mode: 'guided', skillId: 'speech', roundLength: '1' },
    });
    assert.equal(guidedStart.response.status, 200, JSON.stringify(guidedStart.body));
    assert.equal(guidedStart.body.subjectReadModel.session.mode, 'guided');
    assert.equal(guidedStart.body.subjectReadModel.session.guided.skillId, 'speech');
    assert.ok(
      guidedStart.body.subjectReadModel.session.guided.supportLevel > 0,
      'guided session must enter with support active',
    );
    assertNoForbiddenPunctuationReadModelKeys(guidedStart.body.subjectReadModel, 'releaseSmoke.guided.start');

    const guidedEnd = await postPunctuationCommand(server, {
      cookie: demo.cookie,
      learnerId: demo.learnerId,
      revision: guidedStart.body.mutation.appliedRevision,
      command: 'end-session',
      requestId: 'punctuation-release-smoke-guided-end',
      payload: {},
    });
    assert.equal(guidedEnd.response.status, 200, JSON.stringify(guidedEnd.body));

    const weakStart = await postPunctuationCommand(server, {
      cookie: demo.cookie,
      learnerId: demo.learnerId,
      revision: guidedEnd.body.mutation.appliedRevision,
      command: 'start-session',
      requestId: 'punctuation-release-smoke-weak-start',
      payload: { mode: 'weak', roundLength: '1' },
    });
    assert.equal(weakStart.response.status, 200, JSON.stringify(weakStart.body));
    assert.equal(weakStart.body.subjectReadModel.session.mode, 'weak');
    assertNoForbiddenPunctuationReadModelKeys(weakStart.body.subjectReadModel, 'releaseSmoke.weak.start');

    const weakEnd = await postPunctuationCommand(server, {
      cookie: demo.cookie,
      learnerId: demo.learnerId,
      revision: weakStart.body.mutation.appliedRevision,
      command: 'end-session',
      requestId: 'punctuation-release-smoke-weak-end',
      payload: {},
    });

    const endmarksStart = await postPunctuationCommand(server, {
      cookie: demo.cookie,
      learnerId: demo.learnerId,
      revision: weakEnd.body.mutation.appliedRevision,
      command: 'start-session',
      requestId: 'punctuation-release-smoke-endmarks-start',
      payload: { mode: 'endmarks', roundLength: '1' },
    });
    assert.equal(endmarksStart.response.status, 200, JSON.stringify(endmarksStart.body));
    assert.equal(endmarksStart.body.subjectReadModel.session.mode, 'endmarks');
    assertNoForbiddenPunctuationReadModelKeys(endmarksStart.body.subjectReadModel, 'releaseSmoke.endmarks.start');

    const endmarksEnd = await postPunctuationCommand(server, {
      cookie: demo.cookie,
      learnerId: demo.learnerId,
      revision: endmarksStart.body.mutation.appliedRevision,
      command: 'end-session',
      requestId: 'punctuation-release-smoke-endmarks-end',
      payload: {},
    });

    const apostropheStart = await postPunctuationCommand(server, {
      cookie: demo.cookie,
      learnerId: demo.learnerId,
      revision: endmarksEnd.body.mutation.appliedRevision,
      command: 'start-session',
      requestId: 'punctuation-release-smoke-apostrophe-start',
      payload: { mode: 'apostrophe', roundLength: '1' },
    });
    assert.equal(apostropheStart.response.status, 200, JSON.stringify(apostropheStart.body));
    assert.equal(apostropheStart.body.subjectReadModel.session.mode, 'apostrophe');
    assertNoForbiddenPunctuationReadModelKeys(apostropheStart.body.subjectReadModel, 'releaseSmoke.apostrophe.start');

    const apostropheEnd = await postPunctuationCommand(server, {
      cookie: demo.cookie,
      learnerId: demo.learnerId,
      revision: apostropheStart.body.mutation.appliedRevision,
      command: 'end-session',
      requestId: 'punctuation-release-smoke-apostrophe-end',
      payload: {},
    });

    const spelling = await postSpellingCommand(server, {
      cookie: demo.cookie,
      learnerId: demo.learnerId,
      revision: apostropheEnd.body.mutation.appliedRevision,
      command: 'start-session',
      requestId: 'punctuation-release-smoke-spelling-start',
      payload: { mode: 'single', slug: 'early', length: 1 },
    });
    assert.equal(spelling.response.status, 200, JSON.stringify(spelling.body));
    assert.equal(spelling.body.subjectReadModel.phase, 'session');
    assert.equal(spelling.body.subjectReadModel.session.serverAuthority, 'worker');
    assert.equal(spelling.body.subjectReadModel.session.progress.total, 1);
    assert.equal(spelling.body.subjectReadModel.session.currentCard.word, undefined);
    assert.equal(spelling.body.subjectReadModel.session.currentCard.prompt.sentence, undefined);
    assert.ok(spelling.body.subjectReadModel.session.currentCard.prompt.cloze);
    assert.ok(spelling.body.subjectReadModel.audio.promptToken);
  } finally {
    server.close();
  }
});
