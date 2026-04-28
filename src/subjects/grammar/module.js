import {
  DEFAULT_GRAMMAR_PREFS,
  EMPTY_GRAMMAR_BANK_UI,
  GRAMMAR_SUBJECT_ID,
  VALID_GRAMMAR_BANK_CLUSTER_FILTERS,
  VALID_GRAMMAR_BANK_STATUS_FILTERS,
  normaliseGrammarReadModel,
} from './metadata.js';
import { normaliseGrammarSpeechRate } from './speech.js';
import { dropSessionEphemeralFields } from '../../platform/core/subject-contract.js';
import {
  shouldDelayMonsterCelebrations,
  subjectSessionEnded,
} from '../../platform/game/monster-celebrations.js';

// U6a: Child-facing copy for the four known `save-transfer-evidence` error
// codes emitted by the Worker (worker/src/subjects/grammar/engine.js:1723-1803,
// all surface through `err.extra.code`). Unknown codes fall back to a generic
// message; the UI must render `rm.error` with role="alert" whenever it is
// non-empty. UK English copy throughout.
export const GRAMMAR_TRANSFER_ERROR_COPY = Object.freeze({
  grammar_transfer_unavailable_during_mini_test: 'You cannot save writing during a mini test.',
  grammar_transfer_prompt_not_found: 'That writing prompt is not available.',
  grammar_transfer_writing_required: 'Write at least a few words before saving.',
  grammar_transfer_quota_exceeded: 'You have too many saved writings. Delete one to save more.',
});

export const GRAMMAR_TRANSFER_GENERIC_ERROR_COPY = 'That did not save. Try again.';

export function translateGrammarTransferError(error) {
  const code = error?.payload?.code
    || error?.extra?.code
    || error?.code
    || '';
  if (code && Object.prototype.hasOwnProperty.call(GRAMMAR_TRANSFER_ERROR_COPY, code)) {
    return GRAMMAR_TRANSFER_ERROR_COPY[code];
  }
  return GRAMMAR_TRANSFER_GENERIC_ERROR_COPY;
}

// U3 follower: child-copy translation for non-transfer Grammar session errors.
// The generic fallback is the Phase 3 plan copy (`That did not save. Try again.`,
// plan §U3 line 596). Known Worker codes that surface during an active session
// (submit, repair, advance, enrichment) are mapped to child-friendly strings;
// anything else — including stringified raw Worker messages routed through
// `setGrammarError` — collapses to the generic fallback so no raw engine copy
// ever reaches the learner. `GrammarSessionScene.jsx` renders only the return
// value of this helper inside the `role="alert"` banner.
export const GRAMMAR_SESSION_ERROR_COPY = Object.freeze({
  grammar_session_stale: 'That round has ended. Start a new round to keep practising.',
  grammar_answer_required: 'Choose or type an answer before submitting.',
  grammar_answer_invalid: 'That answer looks off. Check it and try again.',
  grammar_advance_not_ready: 'Wait for the feedback before moving on.',
  grammar_repair_not_ready: 'That help is not ready yet. Try again in a moment.',
  grammar_repair_unavailable_for_mode: 'That help is not available in this mode.',
  grammar_support_unavailable_for_mode: 'That support is not available in this mode.',
  grammar_ai_unavailable_for_mini_test: 'Explanations are hidden until the mini test is finished.',
});

export const GRAMMAR_SESSION_GENERIC_ERROR_COPY = 'That did not save. Try again.';

// Copy used verbatim by `module.js` for client-side pre-submit validation and
// other known session-surface strings that are already child-safe. If the
// helper sees one of these incoming verbatim (no error code attached, just a
// string in `grammar.error`), it preserves the string instead of collapsing
// to the generic fallback.
const GRAMMAR_SESSION_KNOWN_CHILD_MESSAGES = new Set([
  'Choose or type an answer before submitting.',
]);

export function translateGrammarSessionError(error) {
  if (error === null || error === undefined) return GRAMMAR_SESSION_GENERIC_ERROR_COPY;
  if (typeof error === 'string') {
    if (GRAMMAR_SESSION_KNOWN_CHILD_MESSAGES.has(error)) return error;
    return GRAMMAR_SESSION_GENERIC_ERROR_COPY;
  }
  const code = error?.payload?.code
    || error?.extra?.code
    || error?.code
    || '';
  if (code && Object.prototype.hasOwnProperty.call(GRAMMAR_SESSION_ERROR_COPY, code)) {
    return GRAMMAR_SESSION_ERROR_COPY[code];
  }
  return GRAMMAR_SESSION_GENERIC_ERROR_COPY;
}

function selectedLearnerId(context) {
  return (context?.store?.getState?.() || context?.appState || {})?.learners?.selectedId || '';
}

function selectedGrammarUi(context) {
  const appState = context?.store?.getState?.() || context?.appState || {};
  const learnerId = selectedLearnerId(context);
  return normaliseGrammarReadModel(appState?.subjectUi?.[GRAMMAR_SUBJECT_ID], learnerId);
}

function grammarModeKey(value) {
  const mode = String(value || '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (mode === 'sentence-builder') return 'builder';
  if (mode === 'sentence-surgery') return 'surgery';
  if (mode === 'worked-example' || mode === 'worked-examples') return 'worked';
  if (mode === 'faded-support' || mode === 'faded-guidance') return 'faded';
  return mode;
}

function grammarModeUsesFocus(value) {
  const mode = grammarModeKey(value);
  return mode !== 'trouble' && mode !== 'surgery' && mode !== 'builder';
}

function updateGrammarUiForLearner(context, learnerId, updater) {
  if (!learnerId) return false;
  if (typeof context?.store?.updateSubjectUiForLearner === 'function') {
    return context.store.updateSubjectUiForLearner(learnerId, GRAMMAR_SUBJECT_ID, updater);
  }
  if (selectedLearnerId(context) !== learnerId) return false;
  context.store.updateSubjectUi(GRAMMAR_SUBJECT_ID, updater);
  return true;
}

function setGrammarError(context, message, { learnerId = selectedLearnerId(context) } = {}) {
  updateGrammarUiForLearner(context, learnerId, (current) => ({
    ...normaliseGrammarReadModel(current, learnerId),
    pendingCommand: '',
    error: message || 'Grammar practice is temporarily unavailable.',
  }));
}

function applyRemoteReadModel(context, response, { learnerId } = {}) {
  if (!learnerId) return;
  const responseLearnerId = String(response?.subjectReadModel?.learnerId || learnerId);
  if (responseLearnerId && responseLearnerId !== learnerId) return;
  const isSelectedLearner = selectedLearnerId(context) === learnerId;
  const previousGrammarUi = isSelectedLearner ? selectedGrammarUi(context) : null;
  if (isSelectedLearner && response?.projections?.rewards?.toastEvents?.length) {
    context.store.pushToasts(response.projections.rewards.toastEvents);
  }
  if (response?.subjectReadModel) {
    updateGrammarUiForLearner(context, learnerId, {
      ...normaliseGrammarReadModel(response.subjectReadModel, learnerId),
      pendingCommand: '',
      error: '',
    });
  } else if (isSelectedLearner) {
    context.store.reloadFromRepositories?.({ preserveRoute: true });
  }
  if (!isSelectedLearner) return;
  const nextGrammarUi = selectedGrammarUi(context);
  const monsterEvents = Array.isArray(response?.projections?.rewards?.events)
    ? response.projections.rewards.events
    : [];
  if (monsterEvents.length) {
    if (
      shouldDelayMonsterCelebrations(GRAMMAR_SUBJECT_ID, previousGrammarUi, nextGrammarUi)
      && typeof context.store.deferMonsterCelebrations === 'function'
    ) {
      context.store.deferMonsterCelebrations(monsterEvents);
    } else {
      context.store.pushMonsterCelebrations(monsterEvents);
    }
  }
  if (
    subjectSessionEnded(GRAMMAR_SUBJECT_ID, previousGrammarUi, nextGrammarUi)
    && typeof context.store.releaseMonsterCelebrations === 'function'
  ) {
    context.store.releaseMonsterCelebrations();
    // P3 U10: hero auto-claim — grammar session just ended.
    if (typeof context.notifyHeroSubjectSessionEnded === 'function') {
      context.notifyHeroSubjectSessionEnded(GRAMMAR_SUBJECT_ID);
    }
  }
}

function sendGrammarCommand(context, command, payload = {}, { translateError, onResolved } = {}) {
  const learnerId = selectedLearnerId(context);
  if (!learnerId) return true;
  const ui = selectedGrammarUi(context);
  if (ui.pendingCommand) return true;
  if (context.runtimeReadOnly) {
    setGrammarError(context, 'Practice is read-only while sync is degraded. Retry sync before continuing.');
    return true;
  }
  const client = context.subjectCommands;
  if (!client?.send) {
    setGrammarError(context, 'Grammar practice needs the Worker command boundary.');
    return true;
  }

  context.store.updateSubjectUi(GRAMMAR_SUBJECT_ID, (current) => ({
    ...normaliseGrammarReadModel(current, learnerId),
    pendingCommand: command,
    error: '',
  }));

  client.send({
    subjectId: GRAMMAR_SUBJECT_ID,
    learnerId,
    command,
    payload,
  }).then((response) => {
    applyRemoteReadModel(context, response, { learnerId });
    if (typeof onResolved === 'function') {
      try { onResolved(response); } catch (callbackError) {
        globalThis.console?.warn?.('Grammar command onResolved failed.', callbackError);
      }
    }
  }).catch((error) => {
    globalThis.console?.warn?.('Grammar command failed.', error);
    const fallback = error?.payload?.message || error?.message || 'The Grammar command could not be completed.';
    const message = typeof translateError === 'function' ? translateError(error) || fallback : fallback;
    setGrammarError(context, message, { learnerId });
  });

  return true;
}

function applyLocalTransition(context, transition) {
  if (!transition) return true;
  return context.applySubjectTransition(GRAMMAR_SUBJECT_ID, transition);
}

function grammarStartPayload(ui, data = {}) {
  const prefs = ui.prefs || DEFAULT_GRAMMAR_PREFS;
  const payload = data.payload && typeof data.payload === 'object' && !Array.isArray(data.payload) ? data.payload : {};
  const mode = payload.mode || data.mode || prefs.mode || DEFAULT_GRAMMAR_PREFS.mode;
  const request = {
    mode,
    roundLength: data.roundLength || prefs.roundLength || DEFAULT_GRAMMAR_PREFS.roundLength,
    goalType: data.goalType || prefs.goalType || DEFAULT_GRAMMAR_PREFS.goalType,
    allowTeachingItems: prefs.allowTeachingItems === true,
    showDomainBeforeAnswer: prefs.showDomainBeforeAnswer !== false,
  };
  if (Object.prototype.hasOwnProperty.call(data, 'focusConceptId')) {
    request.focusConceptId = data.focusConceptId;
  } else if (
    grammarModeUsesFocus(mode)
    && !Object.prototype.hasOwnProperty.call(payload, 'focusConceptId')
    && !Object.prototype.hasOwnProperty.call(payload, 'skillId')
    && !Object.prototype.hasOwnProperty.call(payload, 'templateId')
  ) {
    request.focusConceptId = prefs.focusConceptId || '';
  }
  return {
    ...request,
    ...payload,
  };
}

function responseFromFormData(formData) {
  if (!formData?.entries) return {};
  const response = {};
  for (const [key, value] of formData.entries()) {
    if (!key || key === '_action') continue;
    if (key === 'selected') {
      response.selected = formData.getAll('selected').map((entry) => String(entry));
      continue;
    }
    response[key] = String(value ?? '');
  }
  return response;
}

function hasGrammarResponseValue(value) {
  if (Array.isArray(value)) return value.some((entry) => String(entry || '').trim());
  return String(value ?? '').trim().length > 0;
}

function responseHasAnswer(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return false;
  return Object.entries(response).some(([, value]) => hasGrammarResponseValue(value));
}

// Phase 3 U5: picks the first concept id that the learner should revisit
// after a round. Mini-test summaries carry a marked `miniTestReview` — the
// first incorrect or blank question's `skillIds[0]` (or `replay.conceptIds`
// fallback) wins. Regular practice has no per-question review, so we fall
// back to the analytics concept list and pick the first `weak` / `due`
// concept. Returns `''` when nothing is actionable so the caller can no-op.
export function grammarMissedConceptFromUi(ui) {
  const summary = ui?.summary && typeof ui.summary === 'object' ? ui.summary : {};
  const questions = Array.isArray(summary.miniTestReview?.questions)
    ? summary.miniTestReview.questions
    : [];
  for (const question of questions) {
    const correct = question?.marked?.result?.correct === true;
    if (correct) continue;
    const item = question?.item || {};
    const skillIds = Array.isArray(item.skillIds) ? item.skillIds : [];
    const replayIds = Array.isArray(item.replay?.conceptIds) ? item.replay.conceptIds : [];
    const candidate = skillIds.find((id) => typeof id === 'string' && id)
      || replayIds.find((id) => typeof id === 'string' && id)
      || '';
    if (candidate) return String(candidate).slice(0, 64);
  }
  const concepts = Array.isArray(ui?.analytics?.concepts) ? ui.analytics.concepts : [];
  const weakFirst = concepts.find((concept) => concept?.status === 'weak')
    || concepts.find((concept) => concept?.status === 'due');
  return weakFirst?.id ? String(weakFirst.id).slice(0, 64) : '';
}

function resetToDashboard(context) {
  const learnerId = selectedLearnerId(context);
  context.store.updateSubjectUi(GRAMMAR_SUBJECT_ID, (current) => ({
    ...normaliseGrammarReadModel(current, learnerId),
    phase: 'dashboard',
    session: null,
    feedback: null,
    summary: null,
    awaitingAdvance: false,
    pendingCommand: '',
    error: '',
  }));
  return true;
}

function resetToDashboardWithPrefs(context, prefs) {
  const learnerId = selectedLearnerId(context);
  context.store.updateSubjectUi(GRAMMAR_SUBJECT_ID, (current) => {
    const ui = normaliseGrammarReadModel(current, learnerId);
    return {
      ...ui,
      prefs: { ...ui.prefs, ...(prefs || {}) },
      phase: 'dashboard',
      session: null,
      feedback: null,
      summary: null,
      awaitingAdvance: false,
      pendingCommand: '',
      error: '',
    };
  });
  return true;
}

export const grammarModule = {
  id: GRAMMAR_SUBJECT_ID,
  name: 'Grammar',
  blurb: 'Word classes, clauses, tenses and sentence shape.',
  accent: '#2E8479',
  accentSoft: '#CFE8E3',
  accentTint: '#E3F1EE',
  icon: 'speech',
  available: true,
  reactPractice: true,
  initState() {
    return normaliseGrammarReadModel();
  },
  // SH2-U2 (R2): drop post-session-ephemeral fields on rehydrate so a
  // reload on a Grammar summary screen never resurrects the "Start
  // another round" CTA from a round the learner thought was finished.
  // Baseline set (`summary`, `transientUi`, `pendingCommand`) lives on
  // `SESSION_EPHEMERAL_FIELDS` in `platform/core/subject-contract.js`.
  // Active-session state (`session`, `feedback`, `awaitingAdvance`)
  // is intentionally preserved so mid-round reload resumes the
  // learner's active round. Preferences, stats, analytics concepts,
  // capabilities, transferLane (saved evidence), and the `bank` +
  // `ui.transfer` UI slices all survive. Runs only on rehydrate paths
  // (bootstrap / reloadFromRepositories / learner-switch); live
  // dispatches pass `rehydrate: false` and skip this hook.
  //
  // Blocker adv-sh2u2-001 (phase coercion): dropping `summary` alone
  // leaves `phase === 'summary'` intact, which re-renders
  // `GrammarSummaryScene` with an empty `summary = ui.summary || {}`
  // payload after the route re-opens Grammar. The "Start another round"
  // CTA is still active, giving the learner a silent replay hook. Coerce
  // `phase === 'summary'` back to `'dashboard'` on rehydrate so the
  // scene never mounts with a zombie phase.
  sanitiseUiOnRehydrate(entry) {
    const next = dropSessionEphemeralFields(entry);
    if (next && typeof next === 'object' && !Array.isArray(next) && next.phase === 'summary') {
      next.phase = 'dashboard';
    }
    return next;
  },
  getDashboardStats(appState) {
    const learnerId = appState.learners?.selectedId || '';
    const ui = normaliseGrammarReadModel(appState.subjectUi?.[GRAMMAR_SUBJECT_ID], learnerId);
    const counts = ui.stats?.concepts || {};
    const total = Math.max(1, Number(counts.total) || 0);
    const secured = Number(counts.secured) || 0;
    const due = (Number(counts.due) || 0) + (Number(counts.weak) || 0);
    const nextUp = ui.phase === 'session' || ui.phase === 'feedback'
      ? 'Continue Grammar round'
      : due
        ? 'Review due Grammar concepts'
        : 'Start Grammar retrieval';
    return {
      pct: Math.round((secured / total) * 100),
      due,
      streak: secured,
      nextUp,
    };
  },
  handleAction(action, context) {
    if (!String(action || '').startsWith('grammar-')) return false;

    const learnerId = selectedLearnerId(context);
    const ui = selectedGrammarUi(context);
    const service = context.service;

    if (action === 'grammar-back') {
      if ((ui.phase === 'session' || ui.phase === 'feedback') && ui.session) {
        if (context.data?.skipConfirm !== true && globalThis.confirm?.('End this Grammar session now?') === false) return true;
        if (service?.endSession) return applyLocalTransition(context, service.endSession(learnerId, ui));
        return sendGrammarCommand(context, 'end-session');
      }
      return resetToDashboard(context);
    }

    // Phase 3 U1: register the two dashboard routing placeholders. U2 ships
    // the real Grammar Bank scene and U6b ships the Writing Try scene; until
    // then these dispatchers flip the phase to a stub rendered by
    // `GrammarPracticeSurface`. Both are no-op safe when the learner is
    // already in a transient phase (pendingCommand in flight, or session
    // active — we never stomp an in-flight session).
    if (action === 'grammar-open-concept-bank') {
      if (ui.pendingCommand) return true;
      if (ui.phase === 'session' || ui.phase === 'feedback') return true;
      context.store.updateSubjectUi(GRAMMAR_SUBJECT_ID, (current) => {
        const normalised = normaliseGrammarReadModel(current, learnerId);
        return {
          ...normalised,
          phase: 'bank',
          // Clear any stale detail modal id from the previous bank visit so
          // reopening never auto-pops the modal.
          bank: { ...normalised.bank, detailConceptId: '' },
          error: '',
        };
      });
      return true;
    }

    // Phase 3 U2: Grammar Bank dispatchers. All four mutate the `bank` UI
    // slice only — never the session, feedback, summary, or mastery state —
    // so they are safe to fire without a pendingCommand guard. The
    // normaliser re-validates the filter / cluster ids on every round-trip.

    if (action === 'grammar-close-concept-bank') {
      return resetToDashboard(context);
    }

    if (action === 'grammar-concept-bank-filter') {
      const raw = String(context.data?.value || 'all');
      const next = VALID_GRAMMAR_BANK_STATUS_FILTERS.has(raw) ? raw : 'all';
      context.store.updateSubjectUi(GRAMMAR_SUBJECT_ID, (current) => {
        const normalised = normaliseGrammarReadModel(current, learnerId);
        return {
          ...normalised,
          bank: { ...normalised.bank, statusFilter: next },
        };
      });
      return true;
    }

    if (action === 'grammar-concept-bank-cluster-filter') {
      const raw = String(context.data?.value || 'all');
      const next = VALID_GRAMMAR_BANK_CLUSTER_FILTERS.has(raw) ? raw : 'all';
      context.store.updateSubjectUi(GRAMMAR_SUBJECT_ID, (current) => {
        const normalised = normaliseGrammarReadModel(current, learnerId);
        return {
          ...normalised,
          bank: { ...normalised.bank, clusterFilter: next },
        };
      });
      return true;
    }

    if (action === 'grammar-concept-bank-search') {
      const raw = String(context.data?.value ?? '').slice(0, 80);
      context.store.updateSubjectUi(GRAMMAR_SUBJECT_ID, (current) => {
        const normalised = normaliseGrammarReadModel(current, learnerId);
        return {
          ...normalised,
          bank: { ...normalised.bank, query: raw },
        };
      });
      return true;
    }

    if (action === 'grammar-concept-detail-open') {
      const raw = String(context.data?.conceptId || context.data?.value || '').slice(0, 64);
      if (!raw) return true;
      context.store.updateSubjectUi(GRAMMAR_SUBJECT_ID, (current) => {
        const normalised = normaliseGrammarReadModel(current, learnerId);
        return {
          ...normalised,
          bank: { ...normalised.bank, detailConceptId: raw },
        };
      });
      return true;
    }

    if (action === 'grammar-concept-detail-close') {
      context.store.updateSubjectUi(GRAMMAR_SUBJECT_ID, (current) => {
        const normalised = normaliseGrammarReadModel(current, learnerId);
        return {
          ...normalised,
          bank: { ...normalised.bank, detailConceptId: '' },
        };
      });
      return true;
    }

    if (action === 'grammar-focus-concept') {
      // Dispatched from bank concept cards + detail modal. Routes into a
      // focused practice round by mirroring the existing `grammar-set-focus`
      // + `grammar-start` combination. The `pendingCommand` guard prevents
      // double-tap races.
      if (ui.pendingCommand) return true;
      const conceptId = String(context.data?.conceptId || context.data?.value || '').slice(0, 64);
      if (!conceptId) return true;

      // U5 Phase 4: Grammar Bank focus dispatch is allowlisted to Smart +
      // Learn only (`GRAMMAR_FOCUS_ALLOWED_MODES`). James's 2026-04-26
      // decision: "No focused UI action silently becomes mixed practice."
      //
      // When the learner's current mode is Surgery, Builder, or Trouble
      // (the three modes where `grammarModeUsesFocus` returns false —
      // Worker's `NO_SESSION_FOCUS_MODES` drops focus for surgery/builder
      // and `NO_STORED_FOCUS_MODES` drops it for trouble too) we silently
      // override to `smart` so Practise 5 preserves the learner's intent:
      // focused concept practice always lands in Smart Practice. The
      // override is silent (no toast) because the dashboard already
      // surfaces the "Mixed practice" label on the Surgery/Builder mode
      // cards so the expectation of focus-carry is never set. The Worker's
      // `NO_SESSION_FOCUS_MODES` + `NO_STORED_FOCUS_MODES` remain as the
      // belt-and-braces safety net.
      //
      // Worked Examples and Faded Guidance are focus-using modes on Worker
      // (`grammarModeUsesFocus` returns true) but not in the stricter
      // client allowlist (`GRAMMAR_FOCUS_ALLOWED_MODES = {smart, learn}`).
      // We preserve them here so a focused round still runs in the
      // learner's preferred scaffold surface — they are not the "mixed
      // practice" targets this unit guards against.
      //
      // Accepting a `mode` override in `context.data` lets callers (e.g.
      // tests, future scene dispatches) request a specific target; the
      // check runs against that requested mode so no caller can sneak
      // Surgery/Builder in without being overridden to Smart.
      const existingMode = ui.prefs?.mode || DEFAULT_GRAMMAR_PREFS.mode;
      const requestedMode = typeof context.data?.mode === 'string' && context.data.mode
        ? context.data.mode
        : existingMode;
      const targetMode = grammarModeUsesFocus(requestedMode) ? requestedMode : 'smart';
      const prefsPatch = { mode: targetMode, focusConceptId: conceptId };
      const payload = {
        mode: targetMode,
        focusConceptId: conceptId,
        roundLength: ui.prefs?.roundLength || DEFAULT_GRAMMAR_PREFS.roundLength,
        goalType: ui.prefs?.goalType || DEFAULT_GRAMMAR_PREFS.goalType,
        allowTeachingItems: ui.prefs?.allowTeachingItems === true,
        showDomainBeforeAnswer: ui.prefs?.showDomainBeforeAnswer !== false,
      };
      if (service?.savePrefs) {
        const nextPrefs = service.savePrefs(learnerId, prefsPatch);
        context.store.updateSubjectUi(GRAMMAR_SUBJECT_ID, (current) => {
          const normalised = normaliseGrammarReadModel(current, learnerId);
          return {
            ...normalised,
            prefs: { ...normalised.prefs, ...(nextPrefs || prefsPatch) },
            bank: { ...EMPTY_GRAMMAR_BANK_UI },
            phase: 'dashboard',
            pendingCommand: '',
            error: '',
          };
        });
        if (service?.startSession) return applyLocalTransition(context, service.startSession(learnerId, payload));
        return sendGrammarCommand(context, 'start-session', payload);
      }

      // Remote-save path: close the bank first, then fire save-prefs and chain
      // start-session inside its resolve callback. The earlier version fell
      // through to a second sendGrammarCommand call that was silently no-op'd
      // by the `pendingCommand` guard at the top of `sendGrammarCommand`.
      context.store.updateSubjectUi(GRAMMAR_SUBJECT_ID, (current) => {
        const normalised = normaliseGrammarReadModel(current, learnerId);
        return {
          ...normalised,
          bank: { ...EMPTY_GRAMMAR_BANK_UI },
          phase: 'dashboard',
          error: '',
        };
      });
      return sendGrammarCommand(context, 'save-prefs', { prefs: prefsPatch }, {
        onResolved: () => {
          if (service?.startSession) {
            applyLocalTransition(context, service.startSession(learnerId, payload));
            return;
          }
          sendGrammarCommand(context, 'start-session', payload);
        },
      });
    }

    // Phase 3 U5: `grammar-open-analytics` flips the phase to `'analytics'`
    // so the adult Analytics Scene renders in place of the summary. U7
    // scopes the adult/child content split more thoroughly; here we just
    // gate the surface behind the new phase. `grammar-close-analytics`
    // returns to the summary without clearing it so the five summary cards
    // are still visible when the adult closes the adult view.
    if (action === 'grammar-open-analytics') {
      if (ui.pendingCommand) return true;
      if (ui.phase === 'session' || ui.phase === 'feedback') return true;
      context.store.updateSubjectUi(GRAMMAR_SUBJECT_ID, (current) => ({
        ...normaliseGrammarReadModel(current, learnerId),
        phase: 'analytics',
        error: '',
      }));
      return true;
    }

    if (action === 'grammar-close-analytics') {
      if (ui.pendingCommand) return true;
      context.store.updateSubjectUi(GRAMMAR_SUBJECT_ID, (current) => {
        const normalised = normaliseGrammarReadModel(current, learnerId);
        const targetPhase = normalised.summary ? 'summary' : 'dashboard';
        return {
          ...normalised,
          phase: targetPhase,
          error: '',
        };
      });
      return true;
    }

    // Phase 3 U5: `grammar-practise-missed` is the "Practise missed" /
    // "Fix missed concepts" primary action on the summary. It iterates the
    // mini-test review (if present) to find the first incorrect question,
    // falls back to the analytics snapshot for `weak` / `due` concepts in
    // regular practice, then chains `grammar-focus-concept` so the learner
    // drops into a focused round on that concept id. No-op when no missed
    // concept can be found (e.g. perfect round — the button was disabled
    // in the mini-test branch, and still no-op for regular practice).
    if (action === 'grammar-practise-missed') {
      if (ui.pendingCommand) return true;
      const conceptId = grammarMissedConceptFromUi(ui);
      if (!conceptId) return true;
      // Reuse the existing `grammar-focus-concept` code path so the prefs +
      // phase transitions stay in one place. We pass the conceptId as
      // `context.data.conceptId` which is exactly what the focus branch
      // expects. The return value bubbles up untouched.
      return grammarModule.handleAction('grammar-focus-concept', {
        ...context,
        data: { conceptId },
      });
    }

    if (action === 'grammar-open-transfer') {
      if (ui.pendingCommand) return true;
      if (ui.phase === 'session' || ui.phase === 'feedback') return true;
      context.store.updateSubjectUi(GRAMMAR_SUBJECT_ID, (current) => {
        const normalised = normaliseGrammarReadModel(current, learnerId);
        // Clear any stale Writing Try transient state so reopening the
        // scene never auto-picks the last prompt or restores a half-typed
        // draft from a previous visit (matches the Grammar Bank detail
        // modal reset in `grammar-open-concept-bank`).
        return {
          ...normalised,
          phase: 'transfer',
          ui: { ...normalised.ui, transfer: { selectedPromptId: '', draft: '', ticks: {} } },
          error: '',
        };
      });
      return true;
    }

    // Phase 3 U6b: Writing Try transient-state dispatchers. All four mutate
    // only the `ui.transfer` slice — no session, feedback, summary, or
    // mastery side-effects — so they are safe to fire without a
    // pendingCommand guard. The normaliser re-validates every value on
    // round-trip, so a malformed client-side patch cannot persist.

    if (action === 'grammar-close-transfer') {
      return resetToDashboard(context);
    }

    if (action === 'grammar-select-transfer-prompt') {
      const raw = String(context.data?.promptId || context.data?.value || '').slice(0, 64);
      context.store.updateSubjectUi(GRAMMAR_SUBJECT_ID, (current) => {
        const normalised = normaliseGrammarReadModel(current, learnerId);
        // Switching prompts clears the draft + ticks so a learner never
        // submits a previous prompt's writing under the wrong promptId.
        return {
          ...normalised,
          ui: { ...normalised.ui, transfer: { selectedPromptId: raw, draft: '', ticks: {} } },
          error: '',
        };
      });
      return true;
    }

    if (action === 'grammar-update-transfer-draft') {
      // U6b: do NOT truncate at the Worker writing cap (2000) here — the
      // UI needs to detect over-cap drafts to render the child-copy
      // warning and disable Save. The normaliser applies a much larger
      // hard cap to prevent unbounded growth while still preserving the
      // over-cap signal for the scene.
      const raw = String(context.data?.writing ?? context.data?.value ?? '');
      context.store.updateSubjectUi(GRAMMAR_SUBJECT_ID, (current) => {
        const normalised = normaliseGrammarReadModel(current, learnerId);
        return {
          ...normalised,
          ui: {
            ...normalised.ui,
            transfer: { ...normalised.ui.transfer, draft: raw },
          },
        };
      });
      return true;
    }

    // U10: "Hide from my list" toggle on an orphaned Writing Try entry.
    // Evidence on the server is UNTOUCHED — the pref only controls the
    // child-facing "Retired prompts" list so a learner can declutter their
    // own view. When `hidden: true`, add the promptId to
    // `prefs.transferHiddenPromptIds`; when `false`, remove it. The toggle
    // routes through the standard `save-prefs` pipeline so the pref
    // persists via the same Worker path as every other learner pref. When
    // the service-shim has a local `savePrefs`, use it so the test-mode
    // deterministic path matches production.
    if (action === 'grammar-toggle-transfer-hidden') {
      const promptId = typeof context.data?.promptId === 'string' ? context.data.promptId : '';
      if (!promptId) return true;
      const currentList = Array.isArray(ui.prefs?.transferHiddenPromptIds)
        ? ui.prefs.transferHiddenPromptIds
        : [];
      const alreadyHidden = currentList.includes(promptId);
      const hiddenNext = Object.prototype.hasOwnProperty.call(context.data || {}, 'hidden')
        ? Boolean(context.data.hidden)
        : !alreadyHidden;
      // Build the next list — de-duplicated, and capped at the same 40-id
      // ceiling the Worker enforces (see
      // `GRAMMAR_TRANSFER_HIDDEN_PROMPTS_CAP` in the engine). The
      // round-trip is idempotent: toggling hidden → hidden is a no-op.
      let nextList;
      if (hiddenNext) {
        if (alreadyHidden) return true;
        nextList = [...currentList, promptId].slice(0, 40);
      } else {
        if (!alreadyHidden) return true;
        nextList = currentList.filter((entry) => entry !== promptId);
      }
      const patch = { transferHiddenPromptIds: nextList };
      if (service?.savePrefs) {
        // Local service shim (test-mode): apply the pref in-place so the
        // Writing Try scene stays on-screen. `resetToDashboardWithPrefs`
        // would navigate back to the dashboard — wrong UX for a hide
        // toggle that happens inline on the Transfer surface.
        const prefs = service.savePrefs(learnerId, patch);
        context.store.updateSubjectUi(GRAMMAR_SUBJECT_ID, (current) => {
          const normalised = normaliseGrammarReadModel(current, learnerId);
          return {
            ...normalised,
            prefs: { ...normalised.prefs, ...(prefs || patch) },
            error: '',
          };
        });
        return true;
      }
      return sendGrammarCommand(context, 'save-prefs', { prefs: patch });
    }

    if (action === 'grammar-toggle-transfer-check') {
      const key = String(context.data?.key || '').slice(0, 64);
      if (!key) return true;
      const checked = Boolean(context.data?.checked);
      context.store.updateSubjectUi(GRAMMAR_SUBJECT_ID, (current) => {
        const normalised = normaliseGrammarReadModel(current, learnerId);
        return {
          ...normalised,
          ui: {
            ...normalised.ui,
            transfer: {
              ...normalised.ui.transfer,
              ticks: { ...normalised.ui.transfer.ticks, [key]: checked },
            },
          },
        };
      });
      return true;
    }

    if (action === 'grammar-set-mode') {
      const mode = context.data?.value || DEFAULT_GRAMMAR_PREFS.mode;
      const patch = grammarModeUsesFocus(mode) ? { mode } : { mode, focusConceptId: '' };
      if (service?.savePrefs) {
        const prefs = service.savePrefs(learnerId, patch);
        return resetToDashboardWithPrefs(context, prefs);
      }
      return sendGrammarCommand(context, 'save-prefs', { prefs: patch });
    }

    if (action === 'grammar-set-round-length') {
      const roundLength = Number(context.data?.value) || DEFAULT_GRAMMAR_PREFS.roundLength;
      if (service?.savePrefs) {
        const prefs = service.savePrefs(learnerId, { roundLength });
        return resetToDashboardWithPrefs(context, prefs);
      }
      return sendGrammarCommand(context, 'save-prefs', { prefs: { roundLength } });
    }

    if (action === 'grammar-set-goal') {
      const goalType = context.data?.value || DEFAULT_GRAMMAR_PREFS.goalType;
      if (service?.savePrefs) {
        const prefs = service.savePrefs(learnerId, { goalType });
        return resetToDashboardWithPrefs(context, prefs);
      }
      return sendGrammarCommand(context, 'save-prefs', { prefs: { goalType } });
    }

    if (action === 'grammar-set-practice-setting') {
      const key = context.data?.key;
      if (!['allowTeachingItems', 'showDomainBeforeAnswer'].includes(key)) return true;
      const patch = { [key]: Boolean(context.data?.value) };
      if (service?.savePrefs) {
        const prefs = service.savePrefs(learnerId, patch);
        return resetToDashboardWithPrefs(context, prefs);
      }
      return sendGrammarCommand(context, 'save-prefs', { prefs: patch });
    }

    if (action === 'grammar-set-speech-rate') {
      const speechRate = normaliseGrammarSpeechRate(context.data?.value, ui.prefs?.speechRate);
      if (service?.savePrefs) {
        const prefs = service.savePrefs(learnerId, { speechRate });
        return resetToDashboardWithPrefs(context, prefs);
      }
      return sendGrammarCommand(context, 'save-prefs', { prefs: { speechRate } });
    }

    if (action === 'grammar-set-focus') {
      const focusConceptId = context.data?.value || '';
      if (!grammarModeUsesFocus(ui.prefs?.mode)) {
        if (service?.savePrefs) {
          const prefs = service.savePrefs(learnerId, { focusConceptId: '' });
          return resetToDashboardWithPrefs(context, prefs);
        }
        return sendGrammarCommand(context, 'save-prefs', { prefs: { focusConceptId: '' } });
      }
      if (service?.savePrefs) {
        const prefs = service.savePrefs(learnerId, { focusConceptId });
        return resetToDashboardWithPrefs(context, prefs);
      }
      return sendGrammarCommand(context, 'save-prefs', { prefs: { focusConceptId } });
    }

    if (action === 'grammar-start' || action === 'grammar-start-again') {
      const payload = grammarStartPayload(ui, context.data || {});
      if (service?.startSession) return applyLocalTransition(context, service.startSession(learnerId, payload));
      return sendGrammarCommand(context, 'start-session', payload);
    }

    if (action === 'grammar-submit-form') {
      const response = responseFromFormData(context.data?.formData);
      if (ui.session?.type === 'mini-set') {
        const payload = { response, advance: Boolean(context.data?.advance) };
        if (service?.saveMiniTestResponse) return applyLocalTransition(context, service.saveMiniTestResponse(learnerId, response, payload.advance));
        return sendGrammarCommand(context, 'save-mini-test-response', payload);
      }
      if (!responseHasAnswer(response)) {
        setGrammarError(context, 'Choose or type an answer before submitting.', { learnerId });
        return true;
      }
      if (service?.submitAnswer) return applyLocalTransition(context, service.submitAnswer(learnerId, ui, response));
      return sendGrammarCommand(context, 'submit-answer', { response });
    }

    if (action === 'grammar-save-mini-test-response') {
      const response = responseFromFormData(context.data?.formData);
      const payload = { response, advance: Boolean(context.data?.advance) };
      if (context.data?.index !== undefined) payload.index = Number(context.data.index);
      if (service?.saveMiniTestResponse) return applyLocalTransition(context, service.saveMiniTestResponse(learnerId, response, payload));
      return sendGrammarCommand(context, 'save-mini-test-response', payload);
    }

    if (action === 'grammar-move-mini-test') {
      const payload = {};
      if (Object.prototype.hasOwnProperty.call(context.data || {}, 'index')) payload.index = Number(context.data.index);
      if (Object.prototype.hasOwnProperty.call(context.data || {}, 'delta')) payload.delta = Number(context.data.delta);
      if (service?.moveMiniTest) return applyLocalTransition(context, service.moveMiniTest(learnerId, payload));
      return sendGrammarCommand(context, 'move-mini-test', payload);
    }

    if (action === 'grammar-finish-mini-test') {
      const hasFormData = Boolean(context.data?.formData?.entries);
      const payload = hasFormData
        ? { response: responseFromFormData(context.data.formData) }
        : { saveCurrent: false };
      if (service?.finishMiniTest) return applyLocalTransition(context, service.finishMiniTest(learnerId, payload));
      return sendGrammarCommand(context, 'finish-mini-test', payload);
    }

    if (action === 'grammar-retry-current-question') {
      if (service?.retryCurrentQuestion) return applyLocalTransition(context, service.retryCurrentQuestion(learnerId));
      return sendGrammarCommand(context, 'retry-current-question');
    }

    if (action === 'grammar-use-faded-support') {
      if (service?.useFadedSupport) return applyLocalTransition(context, service.useFadedSupport(learnerId));
      return sendGrammarCommand(context, 'use-faded-support');
    }

    if (action === 'grammar-show-worked-solution') {
      if (service?.showWorkedSolution) return applyLocalTransition(context, service.showWorkedSolution(learnerId));
      return sendGrammarCommand(context, 'show-worked-solution');
    }

    if (action === 'grammar-start-similar-problem') {
      if (service?.startSimilarProblem) return applyLocalTransition(context, service.startSimilarProblem(learnerId));
      return sendGrammarCommand(context, 'start-similar-problem');
    }

    if (action === 'grammar-continue') {
      if (service?.continueSession) return applyLocalTransition(context, service.continueSession(learnerId, ui));
      return sendGrammarCommand(context, 'continue-session');
    }

    if (action === 'grammar-request-ai-enrichment') {
      const payload = context.data?.payload && typeof context.data.payload === 'object' && !Array.isArray(context.data.payload)
        ? context.data.payload
        : { kind: context.data?.kind || 'explanation' };
      if (service?.requestAiEnrichment) return applyLocalTransition(context, service.requestAiEnrichment(learnerId, payload));
      return sendGrammarCommand(context, 'request-ai-enrichment', payload);
    }

    if (action === 'grammar-save-transfer-evidence') {
      // U6a: dispatch the Worker's `save-transfer-evidence` command with the
      // exact contract: { promptId, writing, selfAssessment: [{key, checked}] }.
      // The Worker's payload key is `selfAssessment`; sending `checklist`
      // silently drops the learner's ticks. See
      // worker/src/subjects/grammar/engine.js:1754-1760. The existing
      // `pendingCommand` short-circuit in `sendGrammarCommand` prevents
      // double-dispatch on rapid taps.
      const source = context.data?.payload && typeof context.data.payload === 'object' && !Array.isArray(context.data.payload)
        ? context.data.payload
        : (context.data && typeof context.data === 'object' ? context.data : {});
      const payload = {
        promptId: typeof source.promptId === 'string' ? source.promptId : '',
        writing: typeof source.writing === 'string' ? source.writing : '',
        selfAssessment: Array.isArray(source.selfAssessment)
          ? source.selfAssessment
            .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
            .map((entry) => ({
              key: typeof entry.key === 'string' ? entry.key : '',
              checked: Boolean(entry.checked),
            }))
            .filter((entry) => entry.key)
          : [],
      };
      // U6b: capture the selectedPromptId before dispatch so the resolve
      // callback can restore it AFTER `applyRemoteReadModel` clobbers the
      // client `ui.transfer` slot with the Worker's response (the Worker
      // response never carries the client-side UI slot, so the default
      // empty shape overwrites selectedPromptId otherwise).
      const selectedPromptIdBefore = payload.promptId;
      return sendGrammarCommand(context, 'save-transfer-evidence', payload, {
        translateError: translateGrammarTransferError,
        // U6b: after a successful save, clear the draft + ticks so the
        // textarea returns to an empty state while leaving
        // `selectedPromptId` so the learner still sees the saved-history
        // for the same prompt. The Worker response has already merged the
        // fresh `transferLane.evidence` through `applyRemoteReadModel`.
        onResolved: () => {
          updateGrammarUiForLearner(context, learnerId, (current) => {
            const normalised = normaliseGrammarReadModel(current, learnerId);
            return {
              ...normalised,
              ui: {
                ...normalised.ui,
                transfer: {
                  selectedPromptId: selectedPromptIdBefore || normalised.ui.transfer.selectedPromptId,
                  draft: '',
                  ticks: {},
                },
              },
            };
          });
        },
      });
    }

    if (action === 'grammar-end-early') {
      if (context.data?.skipConfirm !== true && globalThis.confirm?.('End this Grammar session now?') === false) return true;
      if (service?.endSession) return applyLocalTransition(context, service.endSession(learnerId, ui));
      return sendGrammarCommand(context, 'end-session');
    }

    return false;
  },
};
