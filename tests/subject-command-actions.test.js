import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SUBJECT_COMMAND_MIN_GAP_MS,
  createSubjectCommandActionHandler,
} from '../src/platform/runtime/subject-command-actions.js';
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
    pacedCommandMinGapMs: 0,
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
    pacedCommandMinGapMs: 0,
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
    pacedCommandMinGapMs: 0,
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
    pacedCommandMinGapMs: 0,
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
    pacedCommandMinGapMs: 0,
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
  assert.deepEqual(await sendPunctuationActionPayload({ choiceIndex: 0 }), {
    choiceIndex: 0,
    expectedSessionId: 'session-a',
  });
  assert.deepEqual(await sendPunctuationActionPayload({ choiceIndex: '0' }), {
    choiceIndex: 0,
    expectedSessionId: 'session-a',
  });

  for (const choiceIndex of [null, '', [0]]) {
    assert.deepEqual(await sendPunctuationActionPayload({ choiceIndex }), {
      typed: '',
      expectedSessionId: 'session-a',
    });
  }
});

test('punctuation browser command action binds submits to the visible item context', async () => {
  const sent = [];
  const handler = createSubjectCommandActionHandler({
    pacedCommandMinGapMs: 0,
    subjectId: 'punctuation',
    getState() {
      return {
        learners: { selectedId: 'learner-a' },
        subjectUi: {
          punctuation: {
            session: {
              id: 'session-gps',
              releaseId: 'punctuation-release-1',
              answeredCount: 1,
              currentItem: { id: 'item-visible' },
            },
          },
        },
      };
    },
    subjectCommands: {
      send(request) {
        sent.push(request);
        return Promise.resolve({ ok: true });
      },
    },
    actions: punctuationSubjectCommandActions,
  });

  assert.equal(handler.handle('punctuation-submit-form', { typed: 'Answer.' }), true);
  await flushPromises();
  assert.deepEqual(sent[0].payload, {
    typed: 'Answer.',
    expectedSessionId: 'session-gps',
    expectedItemId: 'item-visible',
    expectedAnsweredCount: 1,
    expectedReleaseId: 'punctuation-release-1',
  });
});

test('punctuation start command action preserves explicit focus mode and round length', () => {
  const payload = punctuationSubjectCommandActions['punctuation-start'].payload({
    data: { mode: 'structure', roundLength: '1' },
    state: baseState(),
  });

  assert.deepEqual(payload, { mode: 'structure', roundLength: '1' });
});

test('punctuation start command action passes guided skill only when present', () => {
  const payload = punctuationSubjectCommandActions['punctuation-start'].payload({
    data: { mode: 'guided', roundLength: '2', skillId: 'speech' },
    state: baseState(),
  });

  assert.deepEqual(payload, { mode: 'guided', roundLength: '2', skillId: 'speech' });
});

test('punctuation round-length command action persists setup lengths through save-prefs', async () => {
  for (const roundLength of ['4', '6', '8', '12']) {
    const sent = [];
    const handler = createSubjectCommandActionHandler({
    pacedCommandMinGapMs: 0,
      subjectId: 'punctuation',
      getState() {
        return {
          ...baseState(),
          subjectUi: {
            punctuation: {
              phase: 'setup',
              prefs: { mode: 'smart', roundLength: '6' },
            },
          },
        };
      },
      subjectCommands: {
        send(request) {
          sent.push(request);
          return Promise.resolve({ ok: true });
        },
      },
      actions: punctuationSubjectCommandActions,
    });

    assert.equal(handler.handle('punctuation-set-round-length', { value: roundLength }), true);
    await flushPromises();
    assert.deepEqual(sent, [{
      subjectId: 'punctuation',
      learnerId: 'learner-a',
      command: 'save-prefs',
      payload: { prefs: { roundLength } },
    }]);
  }
});

test('punctuation round-length command action rejects non-setup and off-enum values', async () => {
  const sent = [];
  const handler = createSubjectCommandActionHandler({
    pacedCommandMinGapMs: 0,
    subjectId: 'punctuation',
    getState() {
      return {
        ...baseState(),
        subjectUi: {
          punctuation: {
            phase: 'active-item',
            prefs: { mode: 'smart', roundLength: '6' },
          },
        },
      };
    },
    subjectCommands: {
      send(request) {
        sent.push(request);
        return Promise.resolve({ ok: true });
      },
    },
    actions: punctuationSubjectCommandActions,
  });

  assert.equal(handler.handle('punctuation-set-round-length', { value: '8' }), true);
  assert.equal(handler.handle('punctuation-set-round-length', { value: '1' }), true);
  assert.equal(handler.handle('punctuation-set-round-length', { value: 'all' }), true);
  await flushPromises();
  assert.deepEqual(sent, []);
});

test('punctuation guidance display command actions persist setup booleans through save-prefs', async () => {
  const cases = [
    { pref: 'showFadedGuidance', current: true, expected: false },
    { pref: 'showFadedGuidance', current: false, expected: true },
    { pref: 'showNonScoredBanner', current: true, expected: false },
    { pref: 'showNonScoredBanner', current: false, expected: true },
  ];

  for (const { pref, current, expected } of cases) {
    const sent = [];
    const handler = createSubjectCommandActionHandler({
    pacedCommandMinGapMs: 0,
      subjectId: 'punctuation',
      getState() {
        return {
          ...baseState(),
          subjectUi: {
            punctuation: {
              phase: 'setup',
              prefs: {
                mode: 'smart',
                roundLength: '6',
                [pref]: current,
              },
            },
          },
        };
      },
      subjectCommands: {
        send(request) {
          sent.push(request);
          return Promise.resolve({ ok: true });
        },
      },
      actions: punctuationSubjectCommandActions,
    });

    assert.equal(handler.handle('punctuation-toggle-pref', { pref }), true);
    await flushPromises();
    assert.deepEqual(sent, [{
      subjectId: 'punctuation',
      learnerId: 'learner-a',
      command: 'save-prefs',
      payload: { prefs: { [pref]: expected } },
    }]);
  }
});

test('punctuation guidance display command action rejects non-setup and unknown prefs', async () => {
  const nonSetupSent = [];
  const nonSetupHandler = createSubjectCommandActionHandler({
    pacedCommandMinGapMs: 0,
    subjectId: 'punctuation',
    getState() {
      return {
        ...baseState(),
        subjectUi: {
          punctuation: {
            phase: 'active-item',
            prefs: {
              mode: 'smart',
              roundLength: '6',
              showFadedGuidance: true,
            },
          },
        },
      };
    },
    subjectCommands: {
      send(request) {
        nonSetupSent.push(request);
        return Promise.resolve({ ok: true });
      },
    },
    actions: punctuationSubjectCommandActions,
  });

  assert.equal(nonSetupHandler.handle('punctuation-toggle-pref', { pref: 'showFadedGuidance' }), true);
  await flushPromises();
  assert.deepEqual(nonSetupSent, []);

  const invalidPrefSent = [];
  const invalidPrefHandler = createSubjectCommandActionHandler({
    pacedCommandMinGapMs: 0,
    subjectId: 'punctuation',
    getState() {
      return {
        ...baseState(),
        subjectUi: {
          punctuation: {
            phase: 'setup',
            prefs: {
              mode: 'smart',
              roundLength: '6',
              showFadedGuidance: true,
            },
          },
        },
      };
    },
    subjectCommands: {
      send(request) {
        invalidPrefSent.push(request);
        return Promise.resolve({ ok: true });
      },
    },
    actions: punctuationSubjectCommandActions,
  });

  assert.equal(invalidPrefHandler.handle('punctuation-toggle-pref', { pref: 'autoSpeak' }), true);
  await flushPromises();
  assert.deepEqual(invalidPrefSent, []);
});

test('punctuation context-pack action sends only safe request metadata', () => {
  const action = punctuationSubjectCommandActions['punctuation-context-pack'];
  const payload = action.payload({
    data: { seed: 'context-seed', prompt: 'do not forward' },
    state: baseState(),
  });

  assert.equal(action.command, 'request-context-pack');
  assert.equal(action.mutates, false);
  assert.deepEqual(payload, { seed: 'context-seed' });
});

test('punctuation context-pack action remains available while practice is read-only', async () => {
  const sent = [];
  const errors = [];
  const handler = createSubjectCommandActionHandler({
    pacedCommandMinGapMs: 0,
    subjectId: 'punctuation',
    getState: baseState,
    isReadOnly: () => true,
    setSubjectError(message) {
      errors.push(message);
    },
    subjectCommands: {
      send(request) {
        sent.push(request);
        return Promise.resolve({ ok: false, contextPack: { status: 'unavailable' } });
      },
    },
    actions: punctuationSubjectCommandActions,
  });

  assert.equal(handler.handle('punctuation-context-pack', { seed: 'read-only-seed' }), true);
  await flushPromises();

  assert.deepEqual(errors, []);
  assert.deepEqual(sent, [{
    subjectId: 'punctuation',
    learnerId: 'learner-a',
    command: 'request-context-pack',
    payload: { seed: 'read-only-seed' },
  }]);
});

test('subject command action handler holds paced gap before the next gameplay command', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });

  const sent = [];
  const settled = [];
  const pending = new Set();
  const handler = createSubjectCommandActionHandler({
    pacedCommandMinGapMs: SUBJECT_COMMAND_MIN_GAP_MS,
    subjectId: 'punctuation',
    getState: baseState,
    pendingKeys: pending,
    subjectCommands: {
      send(request) {
        sent.push(request.command);
        return Promise.resolve({ ok: true });
      },
    },
    onCommandSettled() {
      settled.push(Date.now());
    },
    actions: {
      'punctuation-submit-form': {
        command: 'submit-answer',
        payload: { typed: 'Answer.' },
      },
      'punctuation-continue': {
        command: 'continue-session',
      },
    },
  });

  assert.equal(handler.handle('punctuation-submit-form'), true);
  await flushPromises();
  assert.deepEqual(sent, ['submit-answer']);
  assert.equal(settled.length, 0);
  assert.equal(pending.size, 2);

  // During the Free-tier gap, a different paced command must not start.
  assert.equal(handler.handle('punctuation-continue'), true);
  await flushPromises();
  assert.deepEqual(sent, ['submit-answer']);

  t.mock.timers.tick(SUBJECT_COMMAND_MIN_GAP_MS - 1);
  await flushPromises();
  assert.equal(settled.length, 0);
  assert.equal(pending.size, 2);

  t.mock.timers.tick(1);
  await flushPromises();
  assert.equal(settled.length, 1);
  assert.equal(pending.size, 0);

  assert.equal(handler.handle('punctuation-continue'), true);
  await flushPromises();
  assert.deepEqual(sent, ['submit-answer', 'continue-session']);
});

test('subject command action handler does not pace non-gameplay commands', async () => {
  const settled = [];
  const setupHandler = createSubjectCommandActionHandler({
    pacedCommandMinGapMs: SUBJECT_COMMAND_MIN_GAP_MS,
    subjectId: 'punctuation',
    getState() {
      return {
        ...baseState(),
        subjectUi: {
          punctuation: {
            phase: 'setup',
            prefs: { mode: 'smart', roundLength: '6' },
          },
        },
      };
    },
    subjectCommands: {
      send() {
        return Promise.resolve({ ok: true });
      },
    },
    onCommandSettled() {
      settled.push('ok');
    },
    actions: punctuationSubjectCommandActions,
  });

  assert.equal(setupHandler.handle('punctuation-set-round-length', { value: '8' }), true);
  await flushPromises();
  assert.deepEqual(settled, ['ok']);
});
