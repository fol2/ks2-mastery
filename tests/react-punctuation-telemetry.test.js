import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PUNCTUATION_TELEMETRY_EVENT_KINDS,
  PUNCTUATION_TELEMETRY_PAYLOAD_ALLOWLIST,
  emitPunctuationEvent,
} from '../src/subjects/punctuation/telemetry.js';
import { punctuationSubjectCommandActions } from '../src/subjects/punctuation/command-actions.js';
import { createAppHarness } from './helpers/app-harness.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import { renderPunctuationSetupSceneStandalone } from './helpers/punctuation-scene-render.js';
import { SUBJECT_EXPOSURE_GATES } from '../src/platform/core/subject-availability.js';

// Phase 4 U4 — client-side telemetry emitter for the Punctuation subject.
//
// U4 ships the client half only: `emitPunctuationEvent(kind, payload, ctx)`
// + per-event-kind payload allowlist + a `punctuation-record-event` entry in
// `punctuationSubjectCommandActions` with `{ mutates: false }` so the dispatch
// bypasses the read-only guard AND does NOT thread `pendingCommand` (which
// would block other learner affordances). The Worker-side `record-event`
// command handler, D1 `punctuation_events` table, query surface, and docs
// rewrite all land in U9.
//
// Authz invariant (R10): the `{ mutates: false }` flag is CLIENT-SIDE ONLY.
// When U9 lands the Worker handler, `repository.runSubjectCommand` still
// invokes `requireLearnerWriteAccess` at `worker/src/repository.js:4919`. The
// flag controls pending-UI wrapping, not authz.

function createDispatchSpy() {
  const calls = [];
  const spy = {
    dispatch(action, data) {
      calls.push({ action, data });
    },
  };
  return { spy, calls };
}

function createPunctuationHarness() {
  return createAppHarness({
    storage: installMemoryStorage(),
    subjectExposureGates: { [SUBJECT_EXPOSURE_GATES.punctuation]: true },
  });
}

test('emitPunctuationEvent exposes a frozen 12-kind whitelist covering the plan R10 set', () => {
  assert.equal(Object.isFrozen(PUNCTUATION_TELEMETRY_EVENT_KINDS), true);
  assert.equal(PUNCTUATION_TELEMETRY_EVENT_KINDS.length, 12);
  const expected = [
    'card-opened',
    'start-smart-review',
    'first-item-rendered',
    'answer-submitted',
    'feedback-rendered',
    'summary-reached',
    'map-opened',
    'skill-detail-opened',
    'guided-practice-started',
    'unit-secured',
    'monster-progress-changed',
    'command-failed',
  ];
  for (const name of expected) {
    assert.ok(
      PUNCTUATION_TELEMETRY_EVENT_KINDS.includes(name),
      `expected event kind '${name}' in the whitelist`,
    );
  }
});

test('emitPunctuationEvent ignores event kinds not on the whitelist', () => {
  const { spy, calls } = createDispatchSpy();
  const result = emitPunctuationEvent('unknown-kind', { foo: 'bar' }, {
    actions: spy,
    learnerId: 'learner-1',
  });
  assert.equal(result, false);
  assert.equal(calls.length, 0, 'dispatch must NOT fire for an unknown kind');
});

test('emitPunctuationEvent dispatches punctuation-record-event with the mutates:false flag on a valid kind', () => {
  const { spy, calls } = createDispatchSpy();
  const result = emitPunctuationEvent('card-opened', { cardId: 'smart' }, {
    actions: spy,
    learnerId: 'learner-1',
  });
  assert.equal(result, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].action, 'punctuation-record-event');
  assert.equal(calls[0].data.kind, 'card-opened');
  assert.deepEqual(calls[0].data.payload, { cardId: 'smart' });
  assert.equal(calls[0].data.mutates, false);
});

test('emitPunctuationEvent strips fields not on the per-kind allowlist', () => {
  const { spy, calls } = createDispatchSpy();
  emitPunctuationEvent('card-opened', {
    cardId: 'smart',
    // These are NOT on the card-opened allowlist and must be stripped.
    answerText: 'child answer text',
    sessionId: 's1',
  }, { actions: spy, learnerId: 'learner-1' });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].data.payload, { cardId: 'smart' });
  assert.equal('answerText' in calls[0].data.payload, false);
  assert.equal('sessionId' in calls[0].data.payload, false);
});

test('emitPunctuationEvent strips answerText and prompt text from answer-submitted payloads (security)', () => {
  // Plan R10 Key Technical Decision: the answer-submitted event MUST NOT
  // carry raw answer text or prompt text. If a future caller accidentally
  // includes one, the allowlist must reject / strip it before dispatch.
  const { spy, calls } = createDispatchSpy();
  emitPunctuationEvent('answer-submitted', {
    sessionId: 's1',
    itemId: 'i1',
    correct: true,
    answerText: 'raw child answer',
    promptText: 'raw prompt text',
    typed: 'raw typed',
  }, { actions: spy, learnerId: 'learner-1' });
  assert.equal(calls.length, 1);
  const payload = calls[0].data.payload;
  assert.equal('answerText' in payload, false, 'answerText must be stripped');
  assert.equal('promptText' in payload, false, 'promptText must be stripped');
  assert.equal('typed' in payload, false, 'typed must be stripped');
  assert.deepEqual(payload, { sessionId: 's1', itemId: 'i1', correct: true });
  // Allowlist exposes the shape explicitly so the Worker half (U9) can
  // mirror it server-side.
  assert.deepEqual(
    PUNCTUATION_TELEMETRY_PAYLOAD_ALLOWLIST['answer-submitted'].slice().sort(),
    ['correct', 'itemId', 'sessionId'],
  );
});

test('emitPunctuationEvent tolerates a missing actions.dispatch gracefully (fire-and-forget)', () => {
  // Plan R10: telemetry failures must never stall the learner. If the
  // caller somehow invokes the emitter without an actions object, the
  // emitter returns false rather than throwing.
  assert.doesNotThrow(() => emitPunctuationEvent('map-opened', {}, { actions: null }));
  assert.doesNotThrow(() => emitPunctuationEvent('map-opened', {}, { actions: {} }));
});

test('punctuationSubjectCommandActions registers punctuation-record-event with mutates:false', () => {
  // Precedent: `punctuation-context-pack` at command-actions.js:120-128 uses
  // `mutates: false` to bypass the subject-command-actions read-only gate
  // WITHOUT bypassing the Worker-side authz chain (which runs in
  // `repository.runSubjectCommand` → `requireLearnerWriteAccess`).
  // `punctuation-record-event` must follow the same shape; it is the
  // client-side hook that U9's Worker handler will fulfil.
  const entry = punctuationSubjectCommandActions['punctuation-record-event'];
  assert.ok(entry, 'command-actions must register punctuation-record-event');
  assert.equal(entry.mutates, false);
  assert.equal(entry.command, 'record-event');
  assert.equal(typeof entry.payload, 'function');
});

test('punctuation-record-event payload builder forwards kind and allowlisted payload verbatim', () => {
  const entry = punctuationSubjectCommandActions['punctuation-record-event'];
  const built = entry.payload({ data: { kind: 'card-opened', payload: { cardId: 'smart' } } });
  assert.equal(built.event, 'card-opened');
  assert.deepEqual(built.payload, { cardId: 'smart' });
});

test('punctuation-record-event drops fields not on the per-kind allowlist at the command-actions boundary', () => {
  // Defence-in-depth: even if a caller bypasses the emitter and dispatches
  // `punctuation-record-event` directly with a raw payload, the
  // command-actions payload builder still strips non-allowlisted fields.
  // This mirrors the emitter behaviour so the Worker (U9) never receives
  // a smuggled field.
  const entry = punctuationSubjectCommandActions['punctuation-record-event'];
  const built = entry.payload({
    data: {
      kind: 'answer-submitted',
      payload: {
        sessionId: 's1',
        itemId: 'i1',
        correct: true,
        answerText: 'smuggled',
      },
    },
  });
  assert.equal('answerText' in built.payload, false);
  assert.deepEqual(built.payload, { sessionId: 's1', itemId: 'i1', correct: true });
});

test('punctuation-record-event rejects an unknown kind at the command-actions boundary', () => {
  const entry = punctuationSubjectCommandActions['punctuation-record-event'];
  const built = entry.payload({ data: { kind: 'unknown-kind', payload: { foo: 'bar' } } });
  // Unknown kind → payload builder returns a benign shape that the Worker
  // will refuse at U9's allowlist gate. No exception, no thrown error —
  // telemetry must never stall the UI.
  assert.equal(built.event, '');
  assert.deepEqual(built.payload, {});
});

test('PunctuationSetupScene mount emits a card-opened event with the subject id', () => {
  // Smoke integration: U4 wires ONE call site (Setup mount) so the emitter
  // has production reach beyond the unit tests above. The remaining 11
  // event kinds land in follow-on units per the plan's emission-site
  // table (plan line 832-842).
  //
  // Uses `renderPunctuationSetupSceneStandalone` (the standalone SSR
  // renderer at `tests/helpers/punctuation-scene-render.js`) because
  // `renderToStaticMarkup` drives the same render-time emit path as
  // production React; the app-harness's `render()` path builds its
  // `actions` object from the internal `controller.dispatch` reference
  // and so cannot surface a dispatch spy without deeper wiring.
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  const appState = harness.store.getState();
  const learnerId = appState.learners.selectedId;
  const learner = learnerId ? appState.learners.byId[learnerId] : null;
  const ui = appState.subjectUi.punctuation;
  const prefs = harness.services.punctuation.getPrefs(learnerId);
  const stats = harness.services.punctuation.getStats(learnerId);

  const calls = [];
  const actions = {
    dispatch(action, data) {
      calls.push({ action, data });
    },
    updateSubjectUi() {},
  };

  renderPunctuationSetupSceneStandalone({
    ui,
    actions,
    prefs,
    stats,
    learner,
    rewardState: null,
  });

  const emitted = calls.filter((entry) => entry.action === 'punctuation-record-event');
  assert.ok(
    emitted.some((entry) => entry.data && entry.data.kind === 'card-opened'),
    `Setup mount must emit a card-opened telemetry event; saw ${JSON.stringify(calls)}`,
  );
  const cardOpenedCall = emitted.find((entry) => entry.data && entry.data.kind === 'card-opened');
  assert.equal(cardOpenedCall.data.mutates, false);
  assert.ok(
    cardOpenedCall.data.payload,
    'card-opened payload must be an object',
  );
});

test('punctuation-record-event does NOT thread pendingCommand (non-stalling UI)', () => {
  // Plan R10 risk row: telemetry emits must never stall the UI via
  // `pendingCommand`. The `{ mutates: false }` flag on the mapping keeps
  // the dispatch off the `runPunctuationSessionCommand` path. If a caller
  // emits telemetry during an active session, `ui.pendingCommand` stays
  // unchanged.
  const harness = createPunctuationHarness();
  harness.dispatch('open-subject', { subjectId: 'punctuation' });
  harness.render();
  const before = harness.store.getState().subjectUi.punctuation.pendingCommand || '';
  emitPunctuationEvent('map-opened', {}, {
    actions: { dispatch: (action, data) => harness.dispatch(action, data) },
    learnerId: harness.store.getState().learners.selectedId,
  });
  const after = harness.store.getState().subjectUi.punctuation.pendingCommand || '';
  assert.equal(
    after,
    before,
    'telemetry emit must not set pendingCommand (non-stalling UI invariant)',
  );
});
