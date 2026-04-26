import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

import { installMemoryStorage } from './helpers/memory-storage.js';
import { flushMicrotasks } from './helpers/microtasks.js';
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { createSubjectRuntimeBoundary } from '../src/platform/core/subject-runtime.js';
import { SUBJECTS } from '../src/platform/core/subject-registry.js';
import { createLocalAppController } from '../src/platform/app/create-local-app-controller.js';

// U12 (sys-hardening p1): route-change audio cleanup contract.
//
// Baseline doc entry: "TTS failures (slow prompt-token resolution, 500
// from prompt endpoint) degrade silently without retry transparency or
// a 'tap to replay' affordance. (tracked in U9, U12)". The runtime
// behaviour that the test-only audit confirmed is simpler:
// `createAppController.handleGlobalAction` invokes `tts.stop()` on every
// route transition that leaves a subject surface:
//
//   - navigate-home            (main dashboard return)
//   - open-subject             (cross-subject hop)
//   - open-codex               (codex surface)
//   - open-parent-hub          (parent hub)
//   - open-admin-hub           (admin hub)
//   - open-profile-settings    (profile surface)
//   - learner-select           (learner switch mid-session)
//   - learner-reset-progress   (danger zone)
//   - platform-reset-all       (danger zone)
//   - persistence-retry        (degraded-mode recovery)
//
// The contract we lock here is narrow: navigating AWAY from a subject
// surface to any non-subject surface stops in-flight TTS via the
// `tts.stop()` port call, in-process (zero perceived delay — the port
// is synchronous). If a refactor moves route handling to a different
// layer and drops the `tts.stop()` side effect, this test fires first.
//
// We use a custom tracking TTS port instead of `createNoopTtsPort()`
// because the noop port's `stop()` is a no-op with no observable side
// effect — there is nothing for a test to assert on. The tracking port
// is behaviourally identical to the production port's contract; we only
// add counters.

function createTrackingTtsPort() {
  // SH2-U4 (sys-hardening p2): the tracking port gains `abortPending`
  // alongside `stop()`. Every documented route-change site MUST fan out
  // to BOTH — `stop()` kills playing audio, `abortPending()` cancels
  // any in-flight fetch. The two are intentionally NOT merged into a
  // single helper so reviewers see both calls at every site.
  const stopCalls = [];
  const speakCalls = [];
  const abortPendingCalls = [];
  return {
    spoken: speakCalls,
    stopCalls,
    abortPendingCalls,
    speak(payload) {
      speakCalls.push({ payload, at: Date.now() });
    },
    stop() {
      stopCalls.push({ at: Date.now() });
    },
    abortPending() {
      abortPendingCalls.push({ at: Date.now() });
    },
    getStatus() { return 'idle'; },
    warmup() {},
    clear() {
      speakCalls.length = 0;
      stopCalls.length = 0;
      abortPendingCalls.length = 0;
    },
  };
}

function createTrackingHarness({ subjects = SUBJECTS, ports = {} } = {}) {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const runtimeBoundary = createSubjectRuntimeBoundary();
  const tts = createTrackingTtsPort();
  const controller = createLocalAppController({
    repositories,
    subjects,
    now: () => Date.now(),
    runtimeBoundary,
    tts,
    ports,
  });
  return { controller, tts, repositories };
}

// SH2-U4 follow-up: a deliberately broken subject for testing the
// `handleSubjectAction` catch branch that also calls `tts.stop() +
// tts.abortPending()`. Mirrors tests/app-controller.test.js::makeBrokenSubject.
function makeBrokenSubject() {
  return {
    id: 'broken-action',
    name: 'Broken Action',
    blurb: 'Deliberately broken for route-change cleanup tests.',
    accent: '#8B5CF6',
    accentSoft: '#F3E8FF',
    icon: 'quote',
    available: true,
    initState() { return { phase: 'dashboard', error: '' }; },
    getDashboardStats() { return { pct: 0, due: 0, streak: 0, nextUp: '' }; },
    PracticeComponent() {
      return React.createElement('button', { type: 'button' }, 'x');
    },
    handleAction(action) {
      if (action === 'broken-action-trigger') throw new Error('handleAction exploded');
      return false;
    },
  };
}

test('route-change audio cleanup: navigate-home from a subject calls tts.stop()', () => {
  const { controller, tts } = createTrackingHarness();
  controller.dispatch('open-subject', { subjectId: 'spelling' });
  // Simulate in-flight audio mid-session by speaking a word.
  tts.speak({ word: 'early', kind: 'prompt' });
  tts.clear();
  const before = tts.stopCalls.length;
  const t0 = Date.now();
  controller.dispatch('navigate-home');
  const elapsed = Date.now() - t0;
  assert.ok(
    tts.stopCalls.length > before,
    'navigate-home must invoke tts.stop() so any in-flight TTS playback ends at the same instant the route changes. Without this, a learner who presses the dashboard button mid-word hears the word finish playing on the dashboard.',
  );
  // Synchronous port: the contract is "stop within 100ms of the
  // dispatch". Node's dispatch is in-process so the observable latency
  // is near zero; the 100ms ceiling is a generous budget that still
  // catches any accidental setTimeout-based stop.
  assert.ok(
    elapsed < 100,
    `navigate-home stop-audio effect must complete synchronously within 100ms of dispatch (got ${elapsed}ms). A slower path indicates the route-change handler was made async — if intentional, the regression lock still needs to keep the contract observable under 100ms.`,
  );
});

test('route-change audio cleanup: open-subject hop between subjects calls tts.stop() each time', () => {
  const { controller, tts } = createTrackingHarness();
  controller.dispatch('open-subject', { subjectId: 'spelling' });
  tts.clear();
  controller.dispatch('open-subject', { subjectId: 'grammar' });
  assert.equal(
    tts.stopCalls.length,
    1,
    'open-subject must invoke tts.stop() on the cross-subject hop. Without this, a spelling prompt mid-playback continues speaking after the learner has navigated to grammar.',
  );
  controller.dispatch('open-subject', { subjectId: 'spelling' });
  assert.equal(
    tts.stopCalls.length,
    2,
    'open-subject must invoke tts.stop() on EVERY hop, including returning to the original subject.',
  );
});

test('route-change audio cleanup: adult surfaces all stop audio on entry', () => {
  // Every non-subject "exit the practice surface" dispatch must stop
  // audio. These are the four adult surfaces (codex, parent hub, admin
  // hub, profile settings) that a learner or parent can reach from a
  // subject surface without going through the dashboard first.
  const adultActions = ['open-codex', 'open-parent-hub', 'open-admin-hub', 'open-profile-settings'];
  for (const action of adultActions) {
    const { controller, tts } = createTrackingHarness();
    controller.dispatch('open-subject', { subjectId: 'spelling' });
    tts.clear();
    controller.dispatch(action);
    assert.equal(
      tts.stopCalls.length,
      1,
      `${action} must invoke tts.stop() on route entry — a learner / parent opening ${action} mid-prompt must not hear the word finish playing on the new surface.`,
    );
  }
});

test('route-change audio cleanup: learner-select mid-session stops audio for the leaving learner', () => {
  const { controller, tts } = createTrackingHarness();
  controller.dispatch('open-subject', { subjectId: 'spelling' });
  controller.dispatch('learner-create', { name: 'Learner B', yearGroup: 'Y4' });
  // Opening spelling for learner B runs another tts.stop().
  const learnerA = controller.store.getState().learners.allIds[0];
  tts.clear();
  controller.dispatch('learner-select', { value: learnerA });
  assert.equal(
    tts.stopCalls.length,
    1,
    'learner-select must invoke tts.stop() — a parent switching learners mid-prompt should not have the first learner\'s word continue playing over the second learner\'s session.',
  );
});

test('route-change audio cleanup: the port.stop contract is honoured even when no audio is in flight', () => {
  // A defensive guard: the handler MUST always call stop() regardless
  // of whether audio is currently playing. This keeps the contract
  // simple (the route-change layer does not need to consult the audio
  // port's state) and defensive (even a stale-but-pending handle is
  // cancelled).
  const { controller, tts } = createTrackingHarness();
  controller.dispatch('open-subject', { subjectId: 'spelling' });
  tts.clear();
  assert.equal(tts.spoken.length, 0, 'pre-condition: no audio spoken this step');
  controller.dispatch('navigate-home');
  assert.equal(
    tts.stopCalls.length,
    1,
    'navigate-home must call tts.stop() unconditionally, even when no audio is currently in flight. The handler must not gate the cleanup on an observability check against the port.',
  );
});

// SH2-U4 (sys-hardening p2): every documented route-change site must
// call BOTH `tts.stop()` (kills playing audio) AND `tts.abortPending()`
// (cancels in-flight fetch). A 15s TTS fetch that never resolves must
// be aborted the moment the learner leaves the subject surface so the
// Worker abort signal fires and the pending latency telemetry emits.
// The two calls are explicit per site (no helper) so this test asserts
// counts, not ordering.

test('route-change audio cleanup: navigate-home calls BOTH tts.stop() AND tts.abortPending()', () => {
  const { controller, tts } = createTrackingHarness();
  controller.dispatch('open-subject', { subjectId: 'spelling' });
  tts.clear();
  controller.dispatch('navigate-home');
  assert.equal(
    tts.stopCalls.length, 1,
    'navigate-home must call tts.stop() — kills playing audio.',
  );
  assert.equal(
    tts.abortPendingCalls.length, 1,
    'navigate-home must call tts.abortPending() — cancels in-flight fetch so a slow TTS does not resolve on the dashboard.',
  );
});

test('route-change audio cleanup: every adult surface entry calls BOTH stop + abortPending', () => {
  const adultActions = ['open-codex', 'open-parent-hub', 'open-admin-hub', 'open-profile-settings'];
  for (const action of adultActions) {
    const { controller, tts } = createTrackingHarness();
    controller.dispatch('open-subject', { subjectId: 'spelling' });
    tts.clear();
    controller.dispatch(action);
    assert.equal(
      tts.stopCalls.length, 1,
      `${action}: stop() must fire exactly once.`,
    );
    assert.equal(
      tts.abortPendingCalls.length, 1,
      `${action}: abortPending() must fire alongside stop() so an in-flight TTS fetch does not resolve on the ${action} surface.`,
    );
  }
});

test('route-change audio cleanup: open-subject hop calls BOTH stop + abortPending on each hop', () => {
  const { controller, tts } = createTrackingHarness();
  controller.dispatch('open-subject', { subjectId: 'spelling' });
  tts.clear();
  controller.dispatch('open-subject', { subjectId: 'grammar' });
  assert.equal(tts.stopCalls.length, 1, 'cross-subject hop: stop() must fire.');
  assert.equal(tts.abortPendingCalls.length, 1, 'cross-subject hop: abortPending() must fire.');
  controller.dispatch('open-subject', { subjectId: 'spelling' });
  assert.equal(tts.stopCalls.length, 2, 'returning hop: stop() must fire again.');
  assert.equal(tts.abortPendingCalls.length, 2, 'returning hop: abortPending() must fire again.');
});

test('route-change audio cleanup: learner-select fires BOTH stop + abortPending', () => {
  const { controller, tts } = createTrackingHarness();
  controller.dispatch('open-subject', { subjectId: 'spelling' });
  controller.dispatch('learner-create', { name: 'Learner B', yearGroup: 'Y4' });
  const learnerA = controller.store.getState().learners.allIds[0];
  tts.clear();
  controller.dispatch('learner-select', { value: learnerA });
  assert.equal(tts.stopCalls.length, 1, 'learner-select: stop() must fire.');
  assert.equal(
    tts.abortPendingCalls.length, 1,
    'learner-select: abortPending() must fire — a mid-prompt fetch for the leaving learner must not complete against the incoming learner.',
  );
});

// SH2-U4 follow-up (reviewer NIT-8): the 7 tests above cover 7 of the 12
// controller sites that pair `tts.stop()` with `tts.abortPending()`. The
// remaining 5 sites are danger-zone flows (reset-progress, reset-all) and
// internal transitions (applySubjectTransition, persistence-retry,
// handleSubjectAction catch). These extra tests lock the contract at
// every site so a future refactor that drops abortPending at any one
// site fails immediately rather than leaking an in-flight fetch on a
// danger-zone surface.
//
// A note on the production shadow path: `src/main.js::handleGlobalAction`
// is a near-duplicate of the controller's `handleGlobalAction` and is
// where real browser dispatches land first (see FIX-1). Those 16 sites
// also pair `stop()` with `abortPending?.()`; the pairing is grep-checked
// in the spelling-tts and boot tests. Driving main.js from a node test
// requires a browser DOM fixture (the module sets up the full shell), so
// we document the pairing here and lock the controller contract via the
// harness below.

test('route-change audio cleanup: applySubjectTransition stop-audio path calls BOTH stop + abortPending', () => {
  // When a spelling submit produces a transition that leaves the
  // `session` phase (or enters `awaitingAdvance`), `applySubjectTransition`
  // must fan out `tts.stop()` AND `tts.abortPending()`. Without both
  // calls, an in-flight cache miss that was racing the submit would
  // resolve on the feedback surface and play over the feedback banner.
  const { controller, tts } = createTrackingHarness();
  const learnerId = controller.store.getState().learners.selectedId;
  controller.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '1' });
  controller.dispatch('open-subject', { subjectId: 'spelling' });
  controller.dispatch('spelling-start');
  tts.clear();

  const answer = controller.store.getState().subjectUi.spelling.session.currentCard.word.word;
  const formData = new FormData();
  formData.set('typed', answer);
  controller.dispatch('spelling-submit-form', { formData });

  assert.equal(
    tts.stopCalls.length, 1,
    'spelling-submit-form transitioning to awaitingAdvance must invoke tts.stop() via applySubjectTransition.',
  );
  assert.equal(
    tts.abortPendingCalls.length, 1,
    'spelling-submit-form transitioning to awaitingAdvance must invoke tts.abortPending() via applySubjectTransition — a cache-miss fetch that outlives the submit must not resolve on the feedback surface.',
  );
});

test('route-change audio cleanup: learner-reset-progress fires BOTH stop + abortPending', () => {
  // Danger zone: reset-progress is a parent-initiated destructive action
  // that clears all subject progress for the learner. The TTS cleanup
  // guards against a mid-prompt fetch that resolves on a surface that
  // has been reset to its initial state.
  const { controller, tts } = createTrackingHarness({ ports: { confirm: () => true } });
  controller.dispatch('open-subject', { subjectId: 'spelling' });
  tts.clear();
  controller.dispatch('learner-reset-progress');
  assert.equal(
    tts.stopCalls.length, 1,
    'learner-reset-progress: stop() must fire so a playing prompt ends at the moment progress is wiped.',
  );
  assert.equal(
    tts.abortPendingCalls.length, 1,
    'learner-reset-progress: abortPending() must fire so a pending fetch does not resolve on the reset dashboard and replay a wiped word.',
  );
});

test('route-change audio cleanup: platform-reset-all fires BOTH stop + abortPending', () => {
  // Danger zone: platform-reset-all wipes data for EVERY learner on this
  // browser and reloads the app. Even with the reload, the TTS cleanup
  // still happens in-process first so the abort signal fires before the
  // reload races it.
  let reloadCalls = 0;
  const { controller, tts } = createTrackingHarness({
    ports: { confirm: () => true, reload: () => { reloadCalls += 1; } },
  });
  controller.dispatch('open-subject', { subjectId: 'spelling' });
  tts.clear();
  controller.dispatch('platform-reset-all');
  assert.equal(
    tts.stopCalls.length, 1,
    'platform-reset-all: stop() must fire before reload() so the audio element is released.',
  );
  assert.equal(
    tts.abortPendingCalls.length, 1,
    'platform-reset-all: abortPending() must fire before reload() so the Gemini fetch sees the abort signal.',
  );
  assert.equal(reloadCalls, 1, 'platform-reset-all must still call reload() after the cleanup.');
});

test('route-change audio cleanup: persistence-retry success fires BOTH stop + abortPending', async () => {
  // Persistence retry is a degraded-mode recovery path. On success it
  // clears runtime boundaries, clears monster celebrations, and reloads
  // app state from repositories. The TTS cleanup fires in the success
  // branch (NOT the catch branch) because a reload-from-repositories
  // rebuilds the subject surfaces and any in-flight fetch would resolve
  // against stale state.
  const { controller, tts } = createTrackingHarness();
  controller.dispatch('open-subject', { subjectId: 'spelling' });
  tts.clear();
  controller.dispatch('persistence-retry');
  // The retry resolves on a microtask chain; flush generously so the
  // .then fires regardless of the U5 storage-CAS lock-feature-detect depth.
  await flushMicrotasks();
  assert.equal(
    tts.stopCalls.length, 1,
    'persistence-retry success: stop() must fire after the retry resolves so the audio element is released before reloadFromRepositories runs.',
  );
  assert.equal(
    tts.abortPendingCalls.length, 1,
    'persistence-retry success: abortPending() must fire after the retry resolves so a pending fetch does not resolve against the freshly reloaded state.',
  );
});

test('route-change audio cleanup: handleSubjectAction catch branch fires BOTH stop + abortPending', () => {
  // When a subject's handleAction throws, the controller's
  // `handleSubjectAction` catch branch stops audio + cancels pending
  // fetches. Without this, a prompt that was already fetched while a
  // later action crashed the subject would resolve on top of the
  // runtime-error banner.
  const brokenSubject = makeBrokenSubject();
  const { controller, tts } = createTrackingHarness({
    subjects: [...SUBJECTS, brokenSubject],
  });
  controller.dispatch('open-subject', { subjectId: brokenSubject.id });
  tts.clear();
  controller.dispatch('broken-action-trigger');
  assert.equal(
    tts.stopCalls.length, 1,
    'handleSubjectAction catch: stop() must fire — a prompt playing when the subject throws must not keep playing over the runtime-error banner.',
  );
  assert.equal(
    tts.abortPendingCalls.length, 1,
    'handleSubjectAction catch: abortPending() must fire — a pending fetch that outlives the crashed action must not resolve on the runtime-error surface.',
  );
});
