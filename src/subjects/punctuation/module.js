import {
  createInitialPunctuationState,
  normalisePunctuationMapUi,
} from './service-contract.js';
import {
  PUNCTUATION_MAP_MONSTER_FILTER_IDS,
  PUNCTUATION_MAP_STATUS_FILTER_IDS,
} from './components/punctuation-view-model.js';
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
      service.savePrefs(learnerId, { mode: data.value });
      store.updateSubjectUi('punctuation', { phase: 'setup', error: '' });
      return true;
    }

    if (action === 'punctuation-start' || action === 'punctuation-start-again') {
      const prefs = service.getPrefs(learnerId);
      return applyTransition(context, service.startSession(learnerId, {
        ...prefs,
        ...(data?.mode ? { mode: data.mode } : {}),
        ...(data?.roundLength ? { roundLength: data.roundLength } : {}),
        ...(typeof data?.skillId === 'string' ? { skillId: data.skillId } : {}),
        ...(typeof data?.guidedSkillId === 'string' ? { guidedSkillId: data.guidedSkillId } : {}),
      }));
    }

    if (action === 'punctuation-submit-form') {
      return applyTransition(context, service.submitAnswer(learnerId, ui, data || {}));
    }

    if (action === 'punctuation-continue') {
      return applyTransition(context, service.continueSession(learnerId, ui));
    }

    if (action === 'punctuation-skip') {
      return applyTransition(context, service.skipItem(learnerId, ui));
    }

    if (action === 'punctuation-end-early') {
      return applyTransition(context, service.endSession(learnerId, ui));
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
      store.updateSubjectUi('punctuation', {
        phase: 'map',
        error: '',
        mapUi: normalisePunctuationMapUi(),
      });
      return true;
    }

    if (action === 'punctuation-close-map') {
      // Parallel to `punctuation-back` when already in the Map phase. Split
      // as its own action so the Map scene's close-button dispatch is
      // semantically distinct from the generic back-to-dashboard path.
      const nextMapUi = {
        ...normalisePunctuationMapUi(ui.mapUi),
        detailOpenSkillId: null,
      };
      store.updateSubjectUi('punctuation', {
        phase: 'setup',
        error: '',
        mapUi: nextMapUi,
      });
      return true;
    }

    if (action === 'punctuation-map-status-filter') {
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
      const skillId = typeof data?.skillId === 'string' && data.skillId ? data.skillId : '';
      if (!skillId) return false;
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
      const nextMapUi = {
        ...normalisePunctuationMapUi(ui.mapUi),
        detailOpenSkillId: null,
      };
      store.updateSubjectUi('punctuation', { mapUi: nextMapUi });
      return true;
    }

    if (action === 'punctuation-skill-detail-tab') {
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
