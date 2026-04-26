import test from 'node:test';
import assert from 'node:assert/strict';

import { installMemoryStorage } from './helpers/memory-storage.js';
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { createSubjectRuntimeBoundary } from '../src/platform/core/subject-runtime.js';
import { SUBJECTS } from '../src/platform/core/subject-registry.js';
import { createLocalAppController } from '../src/platform/app/create-local-app-controller.js';

// U12 (sys-hardening p1): destructive action confirmation contract.
//
// Audit finding: the three user-facing destructive commands
//   - `learner-delete`            (removes the learner + every subject history)
//   - `learner-reset-progress`    (clears progress + codex rewards)
//   - `platform-reset-all`        (wipes every learner on this browser)
// all route through `ports.confirm(...)` in
// `src/platform/app/create-app-controller.js::handleGlobalAction`
// BEFORE any destructive side effect runs. If the user rejects the
// prompt, the handler short-circuits with `return true` and no state
// mutation or TTS-stop occurs.
//
// This test pins that contract: a refused confirm MUST NOT mutate the
// learner list, the repository progress, or the subject UI. A later
// refactor that drops the `if (!ports.confirm(...))` guard — e.g. moves
// the confirmation into a modal that dispatches on its own — will be
// caught here.
//
// The test does NOT assert on the specific confirm copy (that belongs
// to a separate copy contract test if we ever split one out) — only
// that the confirmation port is consulted and that its refusal is
// honoured.

function createTrackingConfirmPort({ answer }) {
  const calls = [];
  return {
    calls,
    confirm(message) {
      calls.push(message);
      return answer;
    },
  };
}

function createHarnessWithConfirm({ confirmAnswer }) {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const runtimeBoundary = createSubjectRuntimeBoundary();
  const confirmPort = createTrackingConfirmPort({ answer: confirmAnswer });
  const ports = {
    confirm: (message) => confirmPort.confirm(message),
    prompt: () => null,
    reload: () => {},
    onPersistenceRetryFailure: () => {},
  };
  const tts = {
    spoken: [],
    stopCalls: 0,
    speak() {},
    stop() { this.stopCalls += 1; },
    warmup() {},
  };
  const controller = createLocalAppController({
    repositories,
    subjects: SUBJECTS,
    now: () => Date.now(),
    runtimeBoundary,
    tts,
    ports,
  });
  return { controller, confirmPort, tts, repositories };
}

test('destructive actions: learner-delete consults ports.confirm before deleting', () => {
  const { controller, confirmPort } = createHarnessWithConfirm({ confirmAnswer: true });
  const learnerId = controller.store.getState().learners.selectedId;
  assert.ok(learnerId, 'pre-condition: a learner is selected');
  // Create a second learner so the delete path has somewhere to fall
  // back to — the store guards against deleting the last learner to
  // preserve the always-one-selected invariant, which is a legitimate
  // safety rule independent of the confirmation contract this test locks.
  controller.dispatch('learner-create', { name: 'Second', yearGroup: 'Y5' });
  const learnerIdsBefore = [...controller.store.getState().learners.allIds];
  assert.ok(learnerIdsBefore.length >= 2, 'pre-condition: at least two learners exist so the delete path is not blocked by the last-learner guard');
  // The second learner is now selected by learner-create; re-select the
  // original so we delete the one we identified above.
  controller.dispatch('learner-select', { value: learnerId });
  confirmPort.calls.length = 0;
  controller.dispatch('learner-delete');
  assert.equal(
    confirmPort.calls.length,
    1,
    'learner-delete must call ports.confirm exactly once before deleting. Without the confirmation call, a stray tap on the Danger zone button instantly wipes the learner with no recovery path.',
  );
  assert.match(
    confirmPort.calls[0],
    /delete/i,
    'learner-delete confirmation copy must name the action ("delete") so the parent reads a meaningful prompt rather than a generic "Are you sure?" dialog.',
  );
  const learnerIdsAfter = controller.store.getState().learners.allIds;
  assert.ok(
    !learnerIdsAfter.includes(learnerId),
    'learner-delete with confirm-yes must remove the targeted learner from the roster. If a legitimate schema change has changed the delete semantics, update this assertion deliberately.',
  );
});

test('destructive actions: refused confirm on learner-delete leaves state untouched', () => {
  const { controller, confirmPort } = createHarnessWithConfirm({ confirmAnswer: false });
  const learnerIdsBefore = [...controller.store.getState().learners.allIds];
  const uiBefore = JSON.stringify(controller.store.getState().subjectUi);
  controller.dispatch('learner-delete');
  assert.equal(
    confirmPort.calls.length,
    1,
    'learner-delete still consults confirm on the reject path — the guard is mandatory, not conditional.',
  );
  const learnerIdsAfter = controller.store.getState().learners.allIds;
  assert.deepEqual(
    learnerIdsAfter,
    learnerIdsBefore,
    'learner-delete with confirm-no MUST NOT mutate the learner roster. A refactor that reverses the guard (delete first, then confirm) fails here.',
  );
  const uiAfter = JSON.stringify(controller.store.getState().subjectUi);
  assert.equal(
    uiAfter,
    uiBefore,
    'learner-delete with confirm-no MUST NOT touch subject UI state. A refused delete should read as a full no-op from the learner\'s perspective.',
  );
});

test('destructive actions: learner-reset-progress confirms before wiping progress', () => {
  const { controller, confirmPort } = createHarnessWithConfirm({ confirmAnswer: false });
  controller.dispatch('open-subject', { subjectId: 'spelling' });
  const stateBefore = JSON.stringify(controller.store.getState().subjectUi);
  controller.dispatch('learner-reset-progress');
  assert.equal(
    confirmPort.calls.length,
    1,
    'learner-reset-progress must call ports.confirm exactly once.',
  );
  assert.match(
    confirmPort.calls[0],
    /reset/i,
    'learner-reset-progress confirmation copy must name the action ("reset") so the parent reads a meaningful prompt.',
  );
  const stateAfter = JSON.stringify(controller.store.getState().subjectUi);
  assert.equal(
    stateAfter,
    stateBefore,
    'learner-reset-progress with confirm-no must not wipe any subject UI state — the guard refusal is a full no-op.',
  );
});

test('destructive actions: platform-reset-all confirms before wiping the whole browser', () => {
  const { controller, confirmPort, repositories } = createHarnessWithConfirm({ confirmAnswer: false });
  const learnersBefore = [...controller.store.getState().learners.allIds];
  controller.dispatch('platform-reset-all');
  assert.equal(
    confirmPort.calls.length,
    1,
    'platform-reset-all must call ports.confirm exactly once. This is the most destructive action in the app (wipes every learner) and absolutely requires a confirmation.',
  );
  assert.match(
    confirmPort.calls[0],
    /(reset|every|all)/i,
    'platform-reset-all confirmation copy should reference the scope (all learners / every learner) so the parent understands this is not a per-learner reset.',
  );
  const learnersAfter = controller.store.getState().learners.allIds;
  assert.deepEqual(
    learnersAfter,
    learnersBefore,
    'platform-reset-all with confirm-no MUST NOT clear progress. A scopeless wipe is the single action that would lose the most data on accidental tap.',
  );
});
