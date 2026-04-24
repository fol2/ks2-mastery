import test from 'node:test';
import assert from 'node:assert/strict';

import { createSubjectCommandClient } from '../src/platform/runtime/subject-command-client.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test('subject command client serialises learner commands before reading revisions', async () => {
  let revision = 0;
  const firstGate = deferred();
  const commandBodies = [];
  const fetch = async (input, init = {}) => {
    const body = JSON.parse(init.body);
    commandBodies.push(body);
    if (body.requestId === 'cmd-1') {
      await firstGate.promise;
    }
    return new Response(JSON.stringify({
      ok: true,
      mutation: {
        appliedRevision: body.expectedLearnerRevision + 1,
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const commands = createSubjectCommandClient({
    fetch,
    getLearnerRevision: () => revision,
    onCommandApplied({ response }) {
      revision = Number(response.mutation?.appliedRevision) || revision;
    },
  });

  const first = commands.send({
    subjectId: 'spelling',
    learnerId: 'learner-a',
    command: 'submit-answer',
    payload: { typed: 'answer' },
    requestId: 'cmd-1',
  });
  const second = commands.send({
    subjectId: 'spelling',
    learnerId: 'learner-a',
    command: 'continue-session',
    requestId: 'cmd-2',
  });

  await Promise.resolve();
  await Promise.resolve();
  assert.equal(commandBodies.length, 1);
  assert.equal(commandBodies[0].expectedLearnerRevision, 0);

  firstGate.resolve();
  await Promise.all([first, second]);

  assert.deepEqual(commandBodies.map((body) => body.requestId), ['cmd-1', 'cmd-2']);
  assert.deepEqual(commandBodies.map((body) => body.expectedLearnerRevision), [0, 1]);
  assert.equal(revision, 2);
});

test('subject command client retries transient server failures with the same request id', async () => {
  let revision = 7;
  const commandBodies = [];
  const fetch = async (input, init = {}) => {
    const body = JSON.parse(init.body);
    commandBodies.push(body);
    if (commandBodies.length === 1) {
      return new Response(JSON.stringify({
        ok: false,
        code: 'backend_unavailable',
        message: 'D1 was temporarily unavailable.',
      }), { status: 503, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      ok: true,
      mutation: {
        appliedRevision: body.expectedLearnerRevision + 1,
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const commands = createSubjectCommandClient({
    fetch,
    getLearnerRevision: () => revision,
    retryDelayMs: 0,
    onCommandApplied({ response }) {
      revision = Number(response.mutation?.appliedRevision) || revision;
    },
  });

  await commands.send({
    subjectId: 'spelling',
    learnerId: 'learner-a',
    command: 'start-session',
    payload: { mode: 'smart', length: 20 },
    requestId: 'cmd-transient-503',
  });

  assert.equal(commandBodies.length, 2);
  assert.deepEqual(commandBodies.map((body) => body.requestId), ['cmd-transient-503', 'cmd-transient-503']);
  assert.deepEqual(commandBodies.map((body) => body.expectedLearnerRevision), [7, 7]);
  assert.equal(revision, 8);
});
