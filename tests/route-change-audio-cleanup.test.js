import test from 'node:test';
import assert from 'node:assert/strict';

import { installMemoryStorage } from './helpers/memory-storage.js';
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
  const stopCalls = [];
  const speakCalls = [];
  return {
    spoken: speakCalls,
    stopCalls,
    speak(payload) {
      speakCalls.push({ payload, at: Date.now() });
    },
    stop() {
      stopCalls.push({ at: Date.now() });
    },
    warmup() {},
    clear() {
      speakCalls.length = 0;
      stopCalls.length = 0;
    },
  };
}

function createTrackingHarness() {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const runtimeBoundary = createSubjectRuntimeBoundary();
  const tts = createTrackingTtsPort();
  const controller = createLocalAppController({
    repositories,
    subjects: SUBJECTS,
    now: () => Date.now(),
    runtimeBoundary,
    tts,
  });
  return { controller, tts, repositories };
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
