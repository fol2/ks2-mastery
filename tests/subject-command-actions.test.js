import test from 'node:test';
import assert from 'node:assert/strict';

import { createSubjectCommandActionHandler } from '../src/platform/runtime/subject-command-actions.js';
import { punctuationSubjectCommandActions } from '../src/subjects/punctuation/command-actions.js';

function flushPromises() {
  return Promise.resolve().then(() => Promise.resolve());
}

function baseState() {
  return {
    learners: { selectedId: 'learner-a' },
    subjectUi: {
      punctuation: {
        session: { id: 'session-a' },
      },
    },
  };
}

test('subject command action handler sends mapped subject commands', async () => {
  const sent = [];
  const results = [];
  const handler = createSubjectCommandActionHandler({
    subjectId: 'punctuation',
    getState: baseState,
    subjectCommands: {
      send(request) {
        sent.push(request);
        return Promise.resolve({ ok: true, subjectId: 'punctuation' });
      },
    },
    onCommandResult(response) {
      results.push(response);
    },
    actions: {
      'punctuation-start': {
        command: 'start-session',
        payload({ data }) {
          return { mode: data.mode || 'smart', roundLength: data.roundLength || '4' };
        },
      },
    },
  });

  assert.equal(handler.handle('punctuation-start', { mode: 'speech', roundLength: '1' }), true);
  await flushPromises();

  assert.deepEqual(sent, [{
    subjectId: 'punctuation',
    learnerId: 'learner-a',
    command: 'start-session',
    payload: { mode: 'speech', roundLength: '1' },
  }]);
  assert.deepEqual(results, [{ ok: true, subjectId: 'punctuation' }]);
});

test('subject command action handler blocks mutations while read-only', () => {
  const sent = [];
  const errors = [];
  const handler = createSubjectCommandActionHandler({
    subjectId: 'punctuation',
    getState: baseState,
    isReadOnly: () => true,
    setSubjectError(message) {
      errors.push(message);
    },
    subjectCommands: {
      send(request) {
        sent.push(request);
        return Promise.resolve({});
      },
    },
    actions: {
      'punctuation-submit-form': {
        command: 'submit-answer',
        payload: { typed: 'Answer.' },
      },
      'punctuation-peek': {
        mutates: false,
        command: 'read-only-peek',
      },
    },
  });

  assert.equal(handler.handle('punctuation-submit-form'), true);
  assert.equal(sent.length, 0);
  assert.match(errors[0], /read-only/i);

  assert.equal(handler.handle('punctuation-peek'), true);
  assert.equal(sent.length, 1);
});

test('subject command action handler dedupes in-flight session commands', async () => {
  const sent = [];
  let resolveCommand = null;
  const pending = new Set();
  const handler = createSubjectCommandActionHandler({
    subjectId: 'punctuation',
    getState: baseState,
    pendingKeys: pending,
    subjectCommands: {
      send(request) {
        sent.push(request);
        return new Promise((resolve) => {
          resolveCommand = resolve;
        });
      },
    },
    actions: {
      'punctuation-submit-form': {
        command: 'submit-answer',
        payload: { choiceIndex: 1 },
      },
    },
  });

  assert.equal(handler.handle('punctuation-submit-form'), true);
  assert.equal(handler.handle('punctuation-submit-form'), true);
  assert.equal(sent.length, 1);
  assert.equal(pending.size, 1);

  resolveCommand({ ok: true });
  await flushPromises();
  assert.equal(pending.size, 0);

  assert.equal(handler.handle('punctuation-submit-form'), true);
  assert.equal(sent.length, 2);
});

test('subject command action handler reports command failures', async () => {
  const errors = [];
  const handler = createSubjectCommandActionHandler({
    subjectId: 'punctuation',
    getState: baseState,
    setSubjectError(message) {
      errors.push(message);
    },
    subjectCommands: {
      send() {
        return Promise.reject(new Error('Worker is unavailable'));
      },
    },
    actions: {
      'punctuation-continue': { command: 'continue-session' },
    },
  });

  assert.equal(handler.handle('punctuation-continue'), true);
  await flushPromises();

  assert.deepEqual(errors, ['Worker is unavailable']);
});

async function sendPunctuationActionPayload(data) {
  const sent = [];
  const handler = createSubjectCommandActionHandler({
    subjectId: 'punctuation',
    getState: baseState,
    subjectCommands: {
      send(request) {
        sent.push(request);
        return Promise.resolve({ ok: true });
      },
    },
    actions: punctuationSubjectCommandActions,
  });

  assert.equal(handler.handle('punctuation-submit-form', data), true);
  await flushPromises();
  assert.equal(sent.length, 1);
  return sent[0].payload;
}

test('punctuation browser command action keeps choiceIndex parsing strict', async () => {
  assert.deepEqual(await sendPunctuationActionPayload({ choiceIndex: 0 }), { choiceIndex: 0 });
  assert.deepEqual(await sendPunctuationActionPayload({ choiceIndex: '0' }), { choiceIndex: 0 });

  for (const choiceIndex of [null, '', [0]]) {
    assert.deepEqual(await sendPunctuationActionPayload({ choiceIndex }), { typed: '' });
  }
});

test('punctuation start command action preserves explicit focus mode and round length', () => {
  const payload = punctuationSubjectCommandActions['punctuation-start'].payload({
    data: { mode: 'structure', roundLength: '1' },
    state: baseState(),
  });

  assert.deepEqual(payload, { mode: 'structure', roundLength: '1' });
});
