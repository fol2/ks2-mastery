import test from 'node:test';
import assert from 'node:assert/strict';

import { SUBJECT_EXPOSURE_GATES } from '../src/platform/core/subject-availability.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

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
    learnerId: bootstrapPayload.learners.selectedId,
    bootstrap: bootstrapPayload,
  };
}

async function postPunctuationCommand(server, { cookie, learnerId, revision, command, payload = {}, requestId }) {
  const response = await postJson(server, '/api/subjects/punctuation/command', {
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

function learnerAnswerFor(item = {}) {
  if (item.inputKind === 'choice') {
    return { choiceIndex: item.options?.[0]?.index ?? 0 };
  }
  return { typed: item.stem ? `${item.stem}.` : 'The bell rang clearly.' };
}

test('Punctuation release smoke keeps demo exposure blocked by default', async () => {
  const server = productionServer();
  try {
    const demo = await startDemo(server);

    assert.equal(
      demo.bootstrap.subjectExposureGates[SUBJECT_EXPOSURE_GATES.punctuation],
      false,
    );

    const blocked = await postPunctuationCommand(server, {
      cookie: demo.cookie,
      learnerId: demo.learnerId,
      revision: 0,
      command: 'start-session',
      requestId: 'punctuation-release-smoke-blocked',
      payload: { mode: 'smart', roundLength: '1' },
    });

    assert.equal(blocked.response.status, 404);
    assert.equal(blocked.body.code, 'subject_command_not_found');
    assert.equal(server.DB.db.prepare(`
      SELECT COUNT(*) AS count
      FROM child_subject_state
      WHERE learner_id = ? AND subject_id = 'punctuation'
    `).get(demo.learnerId).count, 0);
  } finally {
    server.close();
  }
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

    const submit = await postPunctuationCommand(server, {
      cookie: demo.cookie,
      learnerId: demo.learnerId,
      revision: start.body.mutation.appliedRevision,
      command: 'submit-answer',
      requestId: 'punctuation-release-smoke-submit',
      payload: learnerAnswerFor(start.body.subjectReadModel.session.currentItem),
    });
    assert.equal(submit.response.status, 200, JSON.stringify(submit.body));
    assert.equal(submit.body.subjectReadModel.phase, 'feedback');
    assert.match(submit.body.subjectReadModel.feedback.headline, /Correct|Not quite|Check/);

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
  } finally {
    server.close();
  }
});
