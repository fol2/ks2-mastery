import { parseChoiceIndex } from '../../../shared/punctuation/choice-index.js';
import { sanitisePunctuationTelemetryPayload } from './telemetry.js';

export function punctuationSubmitAnswerPayload(data = {}) {
  if (data?.formData?.get) return { typed: data.formData.get('typed') || '' };
  const choiceIndex = parseChoiceIndex(data?.choiceIndex);
  if (choiceIndex != null) return { choiceIndex };
  return { typed: data?.typed || data?.answer || '' };
}

function commandExpectationForState(state = {}) {
  const session = state.subjectUi?.punctuation?.session;
  if (!session || typeof session !== 'object') return {};
  const expectation = {};
  if (typeof session.id === 'string' && session.id) expectation.expectedSessionId = session.id;
  if (typeof session.currentItem?.id === 'string' && session.currentItem.id) {
    expectation.expectedItemId = session.currentItem.id;
  }
  if (Number.isFinite(Number(session.answeredCount))) {
    expectation.expectedAnsweredCount = Number(session.answeredCount);
  }
  if (typeof session.releaseId === 'string' && session.releaseId) {
    expectation.expectedReleaseId = session.releaseId;
  }
  return expectation;
}

function withCommandExpectation(payload = {}, state = {}) {
  return {
    ...payload,
    ...commandExpectationForState(state),
  };
}

// adv-234-006 MEDIUM: the Setup scene latches `ui.prefsMigrated: true`
// CLIENT-SIDE (via the adv-234 HIGH 1 fix) BEFORE the `punctuation-set-mode`
// dispatch fires. If the subsequent Worker `save-prefs` command rejects
// (network, 5xx, offline), stored prefs on the repo stay on the legacy
// cluster mode but the client latch has already been persisted as `true`.
// Every subsequent render then sees `legacyCluster=true` AND
// `prefsMigrated=true`, so the migration never re-fires — the learner is
// stuck with Smart Review aria-pressed while every session runs the
// stored cluster mode.
//
// This factory builds the `onCommandError` handler used by
// `createSubjectCommandActionHandler` in `src/main.js`. On a `save-prefs`
// failure it clears `prefsMigrated`, rearming the one-shot migration so the
// next Setup render can retry it. Non-`save-prefs` failures surface the
// subject error message unchanged.
export function createPunctuationOnCommandError({
  store,
  setSubjectError,
  warn = (message, error) => globalThis.console?.warn?.(message, error),
  fallbackMessage = 'The punctuation command could not be completed.',
} = {}) {
  if (!store || typeof store.updateSubjectUi !== 'function') {
    throw new TypeError('createPunctuationOnCommandError requires a store with updateSubjectUi.');
  }
  if (typeof setSubjectError !== 'function') {
    throw new TypeError('createPunctuationOnCommandError requires a setSubjectError callback.');
  }
  return function onPunctuationCommandError(error, context = {}) {
    warn('Punctuation command failed.', error);
    if (context?.command === 'save-prefs') {
      store.updateSubjectUi('punctuation', { prefsMigrated: false });
    }
    setSubjectError(error?.payload?.message || error?.message || fallbackMessage);
  };
}

export const punctuationSubjectCommandActions = Object.freeze({
  'punctuation-start': {
    command: 'start-session',
    payload({ data, state }) {
      const prefs = state.subjectUi?.punctuation?.prefs || {};
      const payload = {
        mode: data?.mode || prefs.mode || 'smart',
        roundLength: data?.roundLength || prefs.roundLength || '4',
      };
      const skillId = data?.skillId || data?.guidedSkillId;
      if (skillId) payload.skillId = skillId;
      return payload;
    },
  },
  'punctuation-start-again': {
    command: 'start-session',
    payload({ state }) {
      const prefs = state.subjectUi?.punctuation?.prefs || {};
      return {
        mode: prefs.mode || 'smart',
        roundLength: prefs.roundLength || '4',
      };
    },
  },
  'punctuation-submit-form': {
    command: 'submit-answer',
    payload({ data, state }) {
      return withCommandExpectation(punctuationSubmitAnswerPayload(data), state);
    },
  },
  'punctuation-continue': { command: 'continue-session' },
  'punctuation-skip': {
    command: 'skip-item',
    payload({ state }) {
      return withCommandExpectation({}, state);
    },
  },
  'punctuation-end-early': {
    command: 'end-session',
    payload({ state }) {
      return withCommandExpectation({}, state);
    },
  },
  // Retained for a future Parent/Admin surface (origin R34) — NOT dispatched
  // by any child scene post-Phase-3. The Worker command still exists at
  // `worker/src/subjects/punctuation/commands.js` (`request-context-pack`) and
  // the AI enrichment pipeline in `worker/src/subjects/punctuation/ai-enrichment.js`
  // continues to work. Child-scope read-models intentionally omit the resulting
  // `contextPack` summary — see `worker/src/subjects/punctuation/read-models.js`
  // and the belt-and-braces strip in `client-read-models.js`.
  'punctuation-context-pack': {
    mutates: false,
    command: 'request-context-pack',
    payload({ data }) {
      return {
        seed: data?.seed || '',
      };
    },
  },
  'punctuation-set-mode': {
    command: 'save-prefs',
    payload({ data }) {
      return { prefs: { mode: data?.value || data?.mode || 'smart' } };
    },
  },
  // Phase 4 U4 — client-side telemetry emission hook.
  //
  // `mutates: false` is the same signal that `punctuation-context-pack`
  // above uses (line ~120). It bypasses the read-only guard in
  // `createSubjectCommandActionHandler` (so a degraded-sync learner can
  // still emit observability signal) AND — by routing through the
  // command-actions mapping rather than `punctuationModule.handleAction`
  // — it keeps the dispatch off the `runPunctuationSessionCommand`
  // pending-wrapper path (so telemetry emission never stalls the
  // learner's active interaction).
  //
  // **Authz invariant (R10 / R11):** the `{ mutates: false }` flag is
  // CLIENT-SIDE ONLY. The dispatch still routes through
  // `subjectCommands.send(...)` → the `/api/subjects/punctuation/command`
  // endpoint → `repository.runSubjectCommand` → `requireLearnerWriteAccess`
  // at `worker/src/repository.js:4919`. When U9 lands the Worker
  // `record-event` handler, that authz chain fires unchanged.
  //
  // Today (pre-U9), the Worker's `PUNCTUATION_COMMANDS` list at
  // `worker/src/subjects/punctuation/commands.js:13` does NOT yet
  // include `record-event`, so a real Worker round-trip returns
  // `subject_command_not_found`. That failure is logged via
  // `createPunctuationOnCommandError` but never propagates to the
  // learner — telemetry is fire-and-forget by design.
  'punctuation-record-event': {
    mutates: false,
    command: 'record-event',
    payload({ data }) {
      // Defence-in-depth: re-run the per-kind allowlist here even if the
      // caller went through `emitPunctuationEvent`. A rogue dispatch that
      // bypasses the emitter (direct `actions.dispatch(...)` with a raw
      // payload) still gets stripped to the allowlisted shape before the
      // Worker round-trip fires.
      const { event, payload } = sanitisePunctuationTelemetryPayload(
        data?.kind,
        data?.payload,
      );
      return { event, payload };
    },
  },
});
