import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PUNCTUATION_TELEMETRY_EVENT_KINDS,
  PUNCTUATION_TELEMETRY_PAYLOAD_ALLOWLIST,
  emitPunctuationEvent,
} from '../src/subjects/punctuation/telemetry.js';
import {
  createPunctuationOnCommandError,
  punctuationSubjectCommandActions,
} from '../src/subjects/punctuation/command-actions.js';
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
  // P7-U2: the card-opened emission now lives in a useEffect (concurrent-
  // mode safety) which does not fire during SSR rendering. We simulate the
  // effect by calling emitPunctuationEvent directly — the same call the
  // effect body makes — and verify it dispatches correctly. The SSR render
  // is retained to prove the component still mounts without errors.
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

  // SSR render — confirms the component mounts without errors.
  renderPunctuationSetupSceneStandalone({
    ui,
    actions,
    prefs,
    stats,
    learner,
    rewardState: null,
  });

  // Simulate the useEffect body (card-opened telemetry emission).
  // This exercises the emitter contract only. The component-to-effect wiring
  // is not testable under SSR; the Playwright golden-path test (P7-U10)
  // will cover the integration.
  emitPunctuationEvent('card-opened', { cardId: 'smart' }, {
    actions,
    learnerId: learner && typeof learner === 'object' ? learner.id : null,
  });

  const emitted = calls.filter((entry) => entry.action === 'punctuation-record-event');
  // Testing FIX follow-on (U4 review): tighten from `.some()` → exact-count
  // equality so a future regression that fires `card-opened` twice per mount
  // (e.g. a dropped useRef latch, or a StrictMode dual-invoke leaking through)
  // fails loudly instead of silently doubling the telemetry volume.
  const cardOpenedEmits = emitted.filter((entry) => entry.data && entry.data.kind === 'card-opened');
  assert.strictEqual(
    cardOpenedEmits.length,
    1,
    `Setup mount must emit exactly ONE card-opened telemetry event; saw ${cardOpenedEmits.length} in ${JSON.stringify(calls)}`,
  );
  const cardOpenedCall = cardOpenedEmits[0];
  assert.equal(cardOpenedCall.data.mutates, false);
  assert.ok(
    cardOpenedCall.data.payload,
    'card-opened payload must be an object',
  );
});

// ---------------------------------------------------------------------------
// Phase 4 U4 review follow-on — testing FIX coverage (HIGH × 2, MEDIUM × 2).
//
// The U4 PR shipped the emitter + command-actions mapping + one Setup-mount
// call site. Reviewers converged on four coverage gaps the original tests
// missed:
//
//   1. HIGH: the `try / catch` swallow at `telemetry.js:122-134` had no test.
//      A dispatch that throws (e.g. a controller mid-teardown) is supposed to
//      return `false` without surfacing the error — pin that contract.
//
//   2. HIGH: the 256-char string-field cap at `telemetry.js:92` had no test.
//      A rogue caller pushing a 300-char `skillId` at the Worker would bloat
//      the U9 `punctuation_events` row without a guard. Pin the cap.
//
//   3. BLOCKER regression guard (MEDIUM → promoted): the convergent adv +
//      correctness finding on PR #280. Without a direct test on
//      `createPunctuationOnCommandError`, a future refactor could reintroduce
//      the red-banner cascade. Pin the short-circuit on a
//      `punctuation-record-event` context.
//
//   4. MEDIUM: the `PAYLOAD_ALLOWLIST` freeze contract at `telemetry.js:51`
//      had no runtime assertion. A future hand-edit that drops `Object.freeze`
//      on a per-kind entry would let a caller mutate the shared allowlist at
//      runtime. Pin the freeze at root + per-kind.
// ---------------------------------------------------------------------------

test('emitPunctuationEvent returns false and does not throw when actions.dispatch throws', () => {
  // Telemetry invariant (plan R10): fire-and-forget. If `actions.dispatch`
  // throws mid-dispatch (e.g. the controller tore down between the emit site
  // and the reducer, or a downstream reducer threw), the emitter must swallow
  // the error and return `false` — never stall the caller.
  let result;
  assert.doesNotThrow(() => {
    result = emitPunctuationEvent('card-opened', { cardId: 'smart' }, {
      actions: {
        dispatch: () => {
          throw new Error('boom');
        },
      },
      learnerId: 'learner-1',
    });
  });
  assert.strictEqual(result, false, 'dispatch-throws branch must return false');
});

test('emitPunctuationEvent caps allowlisted string fields at 256 chars', () => {
  // Plan R10 security invariant: string payload fields are capped at 256
  // chars before dispatch so a rogue caller cannot push unbounded payloads
  // at the Worker. The Worker half (U9) re-caps server-side, but the client
  // emitter is the first line of defence.
  const calls = [];
  const longId = 'a'.repeat(300);
  emitPunctuationEvent('skill-detail-opened', { skillId: longId }, {
    actions: { dispatch: (action, data) => calls.push({ action, data }) },
    learnerId: 'learner-1',
  });
  assert.strictEqual(calls.length, 1, 'dispatch must fire on a valid kind');
  assert.strictEqual(
    calls[0].data.payload.skillId.length,
    256,
    'skillId must be truncated to exactly 256 chars',
  );
  assert.strictEqual(
    calls[0].data.payload.skillId,
    'a'.repeat(256),
    'truncation must preserve the leading 256 chars verbatim',
  );
});

test('PUNCTUATION_TELEMETRY_PAYLOAD_ALLOWLIST is frozen at the root and per-kind', () => {
  // Defence-in-depth freeze contract (plan R10): the shared allowlist table
  // and every per-kind entry must be `Object.isFrozen` so a future caller
  // cannot mutate the table at runtime. Without this pin, a hand-edit that
  // dropped `Object.freeze` on a per-kind entry would silently open the
  // door to per-caller allowlist drift.
  assert.strictEqual(
    Object.isFrozen(PUNCTUATION_TELEMETRY_PAYLOAD_ALLOWLIST),
    true,
    'root allowlist table must be frozen',
  );
  for (const kind of PUNCTUATION_TELEMETRY_EVENT_KINDS) {
    assert.strictEqual(
      Object.isFrozen(PUNCTUATION_TELEMETRY_PAYLOAD_ALLOWLIST[kind]),
      true,
      `allowlist for kind '${kind}' must be frozen`,
    );
  }
});

test('createPunctuationOnCommandError does NOT call setSubjectError for a record-event rejection', () => {
  // BLOCKER regression guard (convergent adv + correctness finding on PR
  // #280). Cascade identified: Setup mount → `card-opened` telemetry emit →
  // `punctuation-record-event` dispatch → Worker
  // `PUNCTUATION_COMMANDS` allowlist at
  // `worker/src/subjects/punctuation/commands.js:13` does NOT yet include
  // `record-event` (U9 scope) → rejection with `subject_command_not_found`.
  // Without the short-circuit, `setSubjectError` would paint a red
  // `Subject message: Punctuation command is not available.` banner on every
  // Setup mount (and re-paint on every session-back).
  //
  // Contract: for a rejection landing in `onCommandError` with
  // `action === 'punctuation-record-event'` (or `command === 'record-event'`)
  // the handler MUST short-circuit BEFORE calling `setSubjectError`.
  const setSubjectErrorCalls = [];
  const updateSubjectUiCalls = [];
  const onError = createPunctuationOnCommandError({
    store: {
      updateSubjectUi(subjectId, patch) {
        updateSubjectUiCalls.push({ subjectId, patch });
      },
    },
    setSubjectError(message) {
      setSubjectErrorCalls.push(message);
    },
    warn: () => {},
  });
  const error = {
    payload: {
      code: 'subject_command_not_found',
      message: 'Punctuation command is not available.',
    },
  };
  onError(error, {
    action: 'punctuation-record-event',
    data: { kind: 'card-opened', payload: { cardId: 'smart' } },
    learnerId: 'learner-1',
    subjectId: 'punctuation',
    command: 'record-event',
    payload: { event: 'card-opened', payload: { cardId: 'smart' } },
  });
  assert.strictEqual(
    setSubjectErrorCalls.length,
    0,
    'setSubjectError must NOT fire for a record-event rejection — telemetry is fire-and-forget',
  );
  // Non-record-event rejections (e.g. a save-prefs failure) must still
  // surface — pin the default path stays intact.
  onError(error, {
    action: 'punctuation-set-mode',
    data: {},
    learnerId: 'learner-1',
    subjectId: 'punctuation',
    command: 'save-prefs',
    payload: {},
  });
  assert.strictEqual(
    setSubjectErrorCalls.length,
    1,
    'non-record-event rejections must still surface via setSubjectError',
  );
  // The save-prefs branch also clears the prefsMigrated latch — preserved.
  assert.ok(
    updateSubjectUiCalls.some(
      (entry) => entry.subjectId === 'punctuation' && entry.patch && entry.patch.prefsMigrated === false,
    ),
    'save-prefs branch must still clear prefsMigrated (preserved behaviour)',
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
