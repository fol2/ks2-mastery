import {
  createInitialPunctuationState,
  isPublishedPunctuationSkillId,
  normalisePunctuationMapUi,
  normalisePunctuationPrefs,
  sanitisePunctuationUiOnRehydrate,
  PUNCTUATION_MAP_MONSTER_FILTER_IDS,
  PUNCTUATION_MAP_STATUS_FILTER_IDS,
  PUNCTUATION_MODES,
  PUNCTUATION_OPEN_MAP_ALLOWED_PHASES,
} from './service-contract.js';
import { PUNCTUATION_SETUP_ROUND_LENGTH_OPTIONS } from './components/punctuation-view-model.js';
import { SUBJECT_EXPOSURE_GATES } from '../../platform/core/subject-availability.js';

function applyTransition(context, transition) {
  if (!transition) return true;
  if (typeof context.applySubjectTransition === 'function') {
    return context.applySubjectTransition('punctuation', transition);
  }
  context.store.updateSubjectUi('punctuation', transition.state);
  return true;
}

function currentUi(context, learnerId) {
  return context.service?.initState?.(context.appState.subjectUi?.punctuation, learnerId)
    || context.appState.subjectUi?.punctuation
    || createInitialPunctuationState();
}

// adv-232-001: wrapper for synchronous session mutations (submit / continue
// / skip / end). Writes `pendingCommand: <actionName>` BEFORE calling into
// the service, runs the transition, then explicitly clears `pendingCommand`
// AFTER (success and error both).
//
// Why: `composeIsDisabled` (punctuation-view-model) reads
// `ui?.pendingCommand` to disable the textarea / radio group / submit /
// skip / end buttons while a command is in flight. Without this wrapper
// the textarea NEVER actually disables during submit — even though the
// service call is synchronous, the `store.subscribe` listener fires at
// each `updateSubjectUi`, so any React render or SSR snapshot mid-tick
// observes `pendingCommand` set. The intermediate-disabled signal is also
// the wiring-level assertion in `tests/react-punctuation-scene.test.js`
// that closes the silent-no-op gap (learning #7): a seed of
// `pendingCommand` in test fixtures does NOT prove production writes it.
//
// Mirrors Grammar's `sendGrammarCommand` pattern in
// `src/subjects/grammar/module.js:147-188` — Grammar's Worker round-trip
// is async so the pending state is observable across ticks; Punctuation's
// service is synchronous so the state is observable only across
// `updateSubjectUi` snapshots inside the same tick. Both satisfy the
// `composeIsDisabled` contract.
function runPunctuationSessionCommand(context, actionName, runTransition) {
  const { store } = context;
  store.updateSubjectUi('punctuation', { pendingCommand: actionName });
  try {
    return runTransition();
  } finally {
    store.updateSubjectUi('punctuation', { pendingCommand: '' });
  }
}

export const punctuationModule = {
  id: 'punctuation',
  name: 'Punctuation',
  blurb: 'Practise the KS2 punctuation progression: Smart Review, Guided focus, Weak Spots, GPS tests, sentence combining, paragraph repair, and transfer.',
  accent: '#B8873F',
  accentSoft: '#F0E1C4',
  accentTint: '#F7EEDC',
  icon: 'quote',
  available: true,
  exposureGate: SUBJECT_EXPOSURE_GATES.punctuation,
  reactPractice: true,
  initState() {
    return createInitialPunctuationState();
  },
  // U5 (adv-219-001): Map phase + mapUi are session-ephemeral. The store's
  // rehydrate path invokes this hook once per boot on the persisted entry;
  // `phase === 'map'` is coerced back to `'setup'` and `mapUi` is stripped
  // so a reload never lands on the Map phase with stale filter state.
  sanitiseUiOnRehydrate(entry) {
    return sanitisePunctuationUiOnRehydrate(entry);
  },
  getDashboardStats(appState, { service }) {
    const learnerId = appState.learners.selectedId;
    const stats = service?.getStats?.(learnerId) || {};
    return {
      pct: stats.publishedRewardUnits ? Math.round(((stats.securedRewardUnits || 0) / stats.publishedRewardUnits) * 100) : 0,
      due: stats.due || 0,
      streak: stats.securedRewardUnits || 0,
      nextUp: stats.weak ? 'Repair weak punctuation' : stats.due ? 'Due review' : 'Smart Review',
    };
  },
  handleAction(action, context) {
    const { appState, data, service, store } = context;
    const learnerId = appState.learners.selectedId;
    if (!learnerId || !service) return false;
    const ui = currentUi(context, learnerId);

    if (action === 'punctuation-set-mode') {
      // adv-234-004 (MEDIUM): phase guard. `punctuation-set-mode` is a Setup-
      // scoped affordance (the three primary mode cards + the one-shot
      // stale-prefs migration dispatch that fires from the Setup-phase render).
      // Admin / Parent-Hub surfaces that want to write prefs on a learner's
      // behalf should go through the Worker `save-prefs` command directly, not
      // through this module action — respecting the same Map-phase discipline
      // (adv-219-007). Refuse from non-Setup phases so a stray dispatch treats
      // as a miss rather than a silent success (learning #7). Safe for the
      // Setup render-time migration dispatch: the scene itself renders under
      // `ui.phase === 'setup'`.
      if (ui.phase !== 'setup') return false;
      // U2: reject invalid mode values so a rogue payload cannot smuggle a
      // non-enum mode into stored prefs. `PUNCTUATION_MODES` stays at 10
      // entries (R17); Phase 3's stale-prefs migration explicitly dispatches
      // `'smart'` / `'weak'` / `'gps'` from the Setup scene and relies on
      // this guard to refuse garbage.
      if (!PUNCTUATION_MODES.includes(data?.value)) return false;
      const nextPrefs = service.savePrefs(learnerId, { mode: data.value });
      // U2: mirror the saved prefs into `ui.prefs` so downstream scenes and
      // tests can read the canonical value from `state.subjectUi.punctuation.prefs`.
      // The service writes to the data repository; without this update the
      // next render (and the Phase 3 test that asserts
      // `state.subjectUi.punctuation.prefs.mode === 'smart'`) would see stale
      // ui state. Mirrors Grammar's `resetToDashboardWithPrefs`.
      //
      // Stale-prefs migration latch: ANY successful `punctuation-set-mode`
      // dispatch flips `prefsMigrated` to `true`. This latch prevents the
      // Setup scene's one-shot stale-prefs migration from re-firing on
      // subsequent renders, even if stored prefs somehow revert.
      //
      // `prefsMigrated` persists across reloads via `subjectStates.writeUi`
      // — once a learner has migrated from a legacy cluster mode to `'smart'`,
      // we never re-migrate them, even if a data-restore path later writes
      // a cluster value back into their prefs. This matches the plan's
      // intent that migration is a one-shot, per-learner event (plan R1,
      // line 408). A fresh learner (different selectedId) starts without
      // the latch; switching back to a migrated learner re-hydrates it.
      //
      // Parent-Hub backup restore that rolls stored prefs back to a legacy
      // cluster mode while leaving `prefsMigrated: true` in place is an
      // accepted edge case — see the PR body's "Accepted risk" section
      // (adv-234-003). A manual dispatch of `punctuation-set-mode`
      // `{ value: 'smart' }` re-runs the save cleanly.
      store.updateSubjectUi('punctuation', {
        phase: 'setup',
        error: '',
        prefs: normalisePunctuationPrefs(nextPrefs || {}),
        prefsMigrated: true,
      });
      return true;
    }

    if (action === 'punctuation-set-round-length') {
      // adv-234-001 (MEDIUM): phase guard. Round-length is a Setup-scoped
      // affordance (the compact 4 / 8 / 12 toggle on the Setup scene). A
      // dispatch from session / feedback / summary / map would otherwise save
      // prefs mid-session without any reflection in the active session's
      // `length`. Refuse so the caller treats the dispatch as a miss rather
      // than a silent success (learning #7).
      if (ui.phase !== 'setup') return false;
      // adv-234-001 (MEDIUM): validate against the narrow UI enum
      // `PUNCTUATION_SETUP_ROUND_LENGTH_OPTIONS = ['4', '8', '12']` rather
      // than the storage-level `normalisePunctuationRoundLength` which also
      // accepts 1 / 2 / 3 / 6 / 'all' (the superset kept for `/start-session`
      // payloads that still honour legacy per-skill drills). The Setup toggle
      // exposes exactly three stops; a rogue payload carrying 'all' or '1'
      // bypasses the primary-dashboard contract and must be rejected here.
      const value = typeof data?.value === 'string' ? data.value : '';
      if (!PUNCTUATION_SETUP_ROUND_LENGTH_OPTIONS.includes(value)) return false;
      const nextPrefs = service.savePrefs(learnerId, { roundLength: value });
      store.updateSubjectUi('punctuation', {
        prefs: normalisePunctuationPrefs(nextPrefs || {}),
      });
      return true;
    }

    if (action === 'punctuation-start' || action === 'punctuation-start-again') {
      const prefs = service.getPrefs(learnerId);
      return runPunctuationSessionCommand(context, action, () => (
        applyTransition(context, service.startSession(learnerId, {
          ...prefs,
          ...(data?.mode ? { mode: data.mode } : {}),
          ...(data?.roundLength ? { roundLength: data.roundLength } : {}),
          ...(typeof data?.skillId === 'string' ? { skillId: data.skillId } : {}),
          ...(typeof data?.guidedSkillId === 'string' ? { guidedSkillId: data.guidedSkillId } : {}),
        }))
      ));
    }

    if (action === 'punctuation-submit-form') {
      // adv-232-001: thread `pendingCommand` so `composeIsDisabled`
      // actually disables the textarea / radio during submit.
      return runPunctuationSessionCommand(context, 'punctuation-submit-form', () => (
        applyTransition(context, service.submitAnswer(learnerId, ui, data || {}))
      ));
    }

    if (action === 'punctuation-continue') {
      return runPunctuationSessionCommand(context, 'punctuation-continue', () => (
        applyTransition(context, service.continueSession(learnerId, ui))
      ));
    }

    if (action === 'punctuation-skip') {
      return runPunctuationSessionCommand(context, 'punctuation-skip', () => (
        applyTransition(context, service.skipItem(learnerId, ui))
      ));
    }

    if (action === 'punctuation-end-early') {
      return runPunctuationSessionCommand(context, 'punctuation-end-early', () => (
        applyTransition(context, service.endSession(learnerId, ui))
      ));
    }

    if (action === 'punctuation-back') {
      // Returning from the Map phase should clear the ephemeral detail modal
      // state; other phases do not carry a mapUi field so the reset is a
      // no-op for them. Subsequent Map re-opens start from defaults anyway,
      // but explicitly clearing detailOpenSkillId keeps the state clean in
      // tests that interleave phases.
      const nextMapUi = ui.phase === 'map' && ui.mapUi
        ? { ...normalisePunctuationMapUi(ui.mapUi), detailOpenSkillId: null }
        : undefined;
      store.updateSubjectUi('punctuation', {
        phase: 'setup',
        error: '',
        ...(nextMapUi ? { mapUi: nextMapUi } : {}),
      });
      return true;
    }

    // --- U5: Punctuation Map phase handlers ---------------------------------
    //
    // All four handlers below are pure UI-state mutations — no Worker
    // command is issued. They toggle the local `phase` / `mapUi` carried on
    // `subjectUi.punctuation`. Invalid payloads return `false` so the
    // caller (adapter layer) treats the dispatch as a miss rather than a
    // silent success (pairs with learning #7 — "HTML absence tests pass
    // whether a command genuinely fails closed or silently does nothing").

    if (action === 'punctuation-open-map') {
      // adv-219-002 guard: `punctuation-open-map` is only a legitimate
      // affordance from Setup (the dashboard Map link) and Summary (the
      // next-action button on the Summary scene per plan line 519). A
      // dispatch from `active-item` / `feedback` / `unavailable` / `error`
      // / `map` itself would otherwise leave a zombie `session` +
      // `feedback` under `phase: 'map'` thanks to the shallow-merge store
      // path. Refuse the transition so the caller treats the dispatch as a
      // miss rather than a silent success.
      if (!PUNCTUATION_OPEN_MAP_ALLOWED_PHASES.includes(ui.phase)) {
        return false;
      }
      // U4 follower (adv-238-003): seed `mapUi.returnTo` with the source
      // phase so `punctuation-close-map` routes the learner back to the
      // same scene they opened Map from. Without this, closing the Map
      // always collapses to Setup and the learner loses the Summary
      // completion screen after a Map detour. Only 'setup' and 'summary'
      // are valid source phases (per PUNCTUATION_OPEN_MAP_ALLOWED_PHASES),
      // and `normalisePunctuationMapUi` rejects anything else.
      const mapUi = normalisePunctuationMapUi({ returnTo: ui.phase });
      store.updateSubjectUi('punctuation', {
        phase: 'map',
        error: '',
        // Clear feedback defensively — summary-phase transitions in
        // `active-item → feedback → summary` already null it, but a
        // belt-and-braces reset here means no open-map path ever lands on
        // a feedback payload from an earlier session.
        feedback: null,
        mapUi,
      });
      return true;
    }

    if (action === 'punctuation-close-map') {
      // Parallel to `punctuation-back` when already in the Map phase. Split
      // as its own action so the Map scene's close-button dispatch is
      // semantically distinct from the generic back-to-dashboard path.
      //
      // adv-219-008 guard: round-2's adv-219-007 pass tightened the five
      // Map-scoped filter / detail handlers but missed this sixth. Without
      // the guard, a stray dispatch from `active-item` / `feedback` /
      // `summary` / `setup` / `error` unconditionally writes
      // `{ phase: 'setup', error: '', mapUi: <default> }` which destroys a
      // live session AND seeds a default mapUi payload into state +
      // localStorage (tempting the rehydrate path into restoring filter
      // state across reloads that sanitisePunctuationUiOnRehydrate would
      // otherwise clear). Refuse from non-map phases so the caller treats
      // the dispatch as a miss rather than a silent success (learning #7).
      if (ui.phase !== 'map') return false;
      const currentMapUi = normalisePunctuationMapUi(ui.mapUi);
      const nextMapUi = { ...currentMapUi, detailOpenSkillId: null };
      // U4 follower (adv-238-003): route back to the phase recorded when
      // the Map was opened. `returnTo` only accepts 'setup' or 'summary'
      // (validated in normalisePunctuationMapUi), so a learner who opened
      // the Map from the Summary scene lands back on Summary with their
      // completion screen intact. A 'summary' return-to path requires a
      // non-null summary payload under ui.summary; otherwise fall back to
      // Setup so the learner never strands on an empty Summary (no
      // session to summarise post-reload).
      const canReturnToSummary = currentMapUi.returnTo === 'summary'
        && ui.summary && typeof ui.summary === 'object' && !Array.isArray(ui.summary);
      const nextPhase = canReturnToSummary ? 'summary' : 'setup';
      store.updateSubjectUi('punctuation', {
        phase: nextPhase,
        error: '',
        mapUi: nextMapUi,
      });
      return true;
    }

    if (action === 'punctuation-map-status-filter') {
      // adv-219-007: all five Map-scoped handlers below must gate on
      // `ui.phase === 'map'`. A dispatch from Setup / active-item / feedback
      // / summary / unavailable / error would otherwise seed `mapUi` into
      // state + localStorage, which then tempts the rehydrate path into
      // restoring filter state across reloads that the adv-219-001 /
      // adv-219-006 sanitiser would otherwise clear. Return false so the
      // caller treats the dispatch as a miss rather than a silent success.
      if (ui.phase !== 'map') return false;
      const value = typeof data?.value === 'string' ? data.value : '';
      if (!PUNCTUATION_MAP_STATUS_FILTER_IDS.includes(value)) return false;
      const nextMapUi = {
        ...normalisePunctuationMapUi(ui.mapUi),
        statusFilter: value,
      };
      store.updateSubjectUi('punctuation', { mapUi: nextMapUi });
      return true;
    }

    if (action === 'punctuation-map-monster-filter') {
      // adv-219-007: phase guard — see punctuation-map-status-filter above.
      if (ui.phase !== 'map') return false;
      const value = typeof data?.value === 'string' ? data.value : '';
      if (!PUNCTUATION_MAP_MONSTER_FILTER_IDS.includes(value)) return false;
      const nextMapUi = {
        ...normalisePunctuationMapUi(ui.mapUi),
        monsterFilter: value,
      };
      store.updateSubjectUi('punctuation', { mapUi: nextMapUi });
      return true;
    }

    // --- U5 deviation: Skill Detail modal state handlers -------------------
    //
    // U6 will create the PunctuationSkillDetailModal component that consumes
    // `mapUi.detailOpenSkillId` + `mapUi.detailTab`. The three handlers
    // below land in U5 so the Map scene's "Open details" / "Practise this"
    // buttons dispatch a real state delta today rather than dead-ending
    // until U6 arrives. Pure UI-state mutations, no Worker side-effect.
    // Recorded in the PR body as an intentional deviation from the plan's
    // strict unit boundary.

    if (action === 'punctuation-skill-detail-open') {
      // adv-219-007: phase guard — detail state is Map-scoped.
      if (ui.phase !== 'map') return false;
      // adv-219-004: skillId must be a published Punctuation skill id so the
      // U6 Skill Detail modal never opens against a rogue payload.
      // `isPublishedPunctuationSkillId` gates both the string shape and the
      // membership check against the frozen `PUNCTUATION_CLIENT_SKILL_IDS`
      // list in service-contract. Unknown ids return `false` — the store is
      // not touched and the caller treats the dispatch as a miss.
      if (!isPublishedPunctuationSkillId(data?.skillId)) return false;
      const skillId = data.skillId;
      const rawTab = typeof data?.tab === 'string' ? data.tab : 'learn';
      const detailTab = rawTab === 'practise' ? 'practise' : 'learn';
      const nextMapUi = {
        ...normalisePunctuationMapUi(ui.mapUi),
        detailOpenSkillId: skillId,
        detailTab,
      };
      store.updateSubjectUi('punctuation', { mapUi: nextMapUi });
      return true;
    }

    if (action === 'punctuation-skill-detail-close') {
      // adv-219-007: phase guard — detail state is Map-scoped.
      if (ui.phase !== 'map') return false;
      const nextMapUi = {
        ...normalisePunctuationMapUi(ui.mapUi),
        detailOpenSkillId: null,
      };
      store.updateSubjectUi('punctuation', { mapUi: nextMapUi });
      return true;
    }

    if (action === 'punctuation-skill-detail-tab') {
      // adv-219-007: phase guard — detail state is Map-scoped.
      if (ui.phase !== 'map') return false;
      const rawTab = typeof data?.value === 'string' ? data.value : '';
      if (rawTab !== 'learn' && rawTab !== 'practise') return false;
      const nextMapUi = {
        ...normalisePunctuationMapUi(ui.mapUi),
        detailTab: rawTab,
      };
      store.updateSubjectUi('punctuation', { mapUi: nextMapUi });
      return true;
    }

    return false;
  },
};
