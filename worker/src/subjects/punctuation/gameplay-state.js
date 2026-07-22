import {
  DEFAULT_PUNCTUATION_CONTENT_INDEXES,
  choosePunctuationGuidedSkill,
} from '../../../../shared/punctuation/service.js';
import { selectPunctuationItem } from '../../../../shared/punctuation/scheduler.js';
import {
  normalisePunctuationMode,
  normalisePunctuationPrefs,
  normalisePunctuationRoundLength,
} from '../../../../src/subjects/punctuation/service-contract.js';

const MAX_GPS_QUEUE_LENGTH = 12;
const SCHEDULER_CANDIDATE_WINDOW = 128;

export {
  changedPunctuationGameplayItems,
  composePunctuationGameplaySubjectRecord,
  punctuationStarItemIds,
  punctuationHasStarEvidence,
  punctuationStateWithoutItemMastery,
} from './gameplay-persistence.js';

import {
  punctuationHasStarEvidence,
  punctuationStateWithoutItemMastery,
} from './gameplay-persistence.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function progressFromData(data) {
  return isPlainObject(data?.progress) ? data.progress : {};
}

function addItemId(ids, value) {
  if (typeof value === 'string' && value) ids.add(value);
}

function addSessionItemIds(ids, session) {
  if (!isPlainObject(session)) return;
  addItemId(ids, session.currentItemId);
  for (const itemId of Array.isArray(session.recentItemIds) ? session.recentItemIds : []) addItemId(ids, itemId);
  for (const itemId of Array.isArray(session.gps?.queueItemIds) ? session.gps.queueItemIds : []) addItemId(ids, itemId);
  for (const response of Array.isArray(session.gps?.responses) ? session.gps.responses : []) addItemId(ids, response?.itemId);
}

function modeStartOffset(progress, mode) {
  const rotating = new Set(['smart', 'endmarks', 'apostrophe', 'speech', 'comma_flow', 'boundary', 'structure']);
  if (!rotating.has(mode)) return 0;
  const completed = Math.max(0, Number(progress?.sessionsCompleted) || 0);
  if (completed > 0) return Math.floor(completed) % 6;
  const attempts = Array.isArray(progress?.attempts) ? progress.attempts : [];
  return attempts.filter((attempt) => typeof attempt?.mode === 'string' || typeof attempt?.itemMode === 'string').length % 6;
}

function roundLength(prefs, payload) {
  const value = normalisePunctuationRoundLength(
    payload?.testLength ?? payload?.roundLength ?? payload?.length ?? prefs.roundLength,
  );
  if (value === 'all') return 8;
  const numeric = Math.max(1, Number.parseInt(value, 10) || 4);
  return prefs.mode === 'gps' ? Math.min(MAX_GPS_QUEUE_LENGTH, numeric) : numeric;
}

function compactSelectionProgress(progress) {
  return {
    ...progress,
    // Lifetime item rows never choose the learning lane. Facets and the recent
    // attempt window are the compact scheduler authority; selected item rows
    // are hydrated afterwards for weighting and mutation.
    items: {},
  };
}

function addSelectionCandidates(ids, { progress, session, prefs, now, candidateWindow }) {
  const selection = selectPunctuationItem({
    indexes: DEFAULT_PUNCTUATION_CONTENT_INDEXES,
    progress: compactSelectionProgress(progress),
    session,
    prefs,
    now,
    random: () => 0,
    candidateWindow,
  });
  for (const itemId of selection.inspectedItemIds || []) addItemId(ids, itemId);
  addItemId(ids, selection.item?.id);
}

function gpsCandidateWindow(indexes) {
  const signatureFanout = Math.max(1, Number(indexes?.maxVariantSignatureFanout) || 1);
  return SCHEDULER_CANDIDATE_WINDOW + (MAX_GPS_QUEUE_LENGTH - 1) * signatureFanout;
}

function plannedStartSession(data, payload, now) {
  const progress = progressFromData(data);
  const prefs = normalisePunctuationPrefs({
    ...(isPlainObject(data?.prefs) ? data.prefs : {}),
    ...(isPlainObject(payload) ? payload : {}),
  });
  const requestedGuidedSkillId = typeof payload?.skillId === 'string'
    ? payload.skillId
    : (typeof payload?.guidedSkillId === 'string' ? payload.guidedSkillId : null);
  const guidedSkillId = prefs.mode === 'guided'
    ? choosePunctuationGuidedSkill({ ...data, progress }, DEFAULT_PUNCTUATION_CONTENT_INDEXES, requestedGuidedSkillId, now)
    : null;
  return {
    mode: normalisePunctuationMode(prefs.mode),
    length: roundLength(prefs, payload),
    modeStartOffset: modeStartOffset(progress, prefs.mode),
    answeredCount: 0,
    currentItemId: '',
    recentItemIds: [],
    retriedMisconceptions: [],
    selectedSignatures: [],
    guidedSkillId,
    gps: prefs.mode === 'gps' ? { queueItemIds: [], responses: [] } : null,
    prefs,
  };
}

export function punctuationGameplayCandidateItemIds(subjectRecord = {}, command = '', payload = {}, now = Date.now()) {
  const record = isPlainObject(subjectRecord) ? subjectRecord : {};
  const data = punctuationStateWithoutItemMastery(isPlainObject(record.data) ? record.data : {}, now);
  const progress = progressFromData(data);
  const ids = new Set();

  if (!punctuationHasStarEvidence(data)) {
    for (const attempt of Array.isArray(progress.attempts) ? progress.attempts.slice(-1000) : []) {
      addItemId(ids, attempt?.itemId);
    }
  }
  const currentSession = isPlainObject(record.ui?.session) ? record.ui.session : null;
  addSessionItemIds(ids, currentSession);

  if (command === 'start-session') {
    const session = plannedStartSession(data, payload, now);
    if (session.mode === 'gps') {
      // A GPS queue can exclude eleven earlier item IDs and all catalogue
      // variants sharing their signatures. The precomputed fan-out keeps this
      // hydration window bounded while remaining correct if content changes.
      for (let answeredCount = 0; answeredCount < session.length; answeredCount += 1) {
        addSelectionCandidates(ids, {
          progress,
          session: { ...session, answeredCount },
          prefs: session.prefs,
          now,
          candidateWindow: gpsCandidateWindow(DEFAULT_PUNCTUATION_CONTENT_INDEXES),
        });
      }
    } else {
      addSelectionCandidates(ids, {
        progress,
        session,
        prefs: session.prefs,
        now,
        candidateWindow: SCHEDULER_CANDIDATE_WINDOW,
      });
    }
  } else if (currentSession && currentSession.mode !== 'gps') {
    const shouldSelect = command === 'continue-session'
      || (command === 'skip-item' && Number(currentSession.answeredCount) + 1 < Number(currentSession.length));
    if (shouldSelect) {
      const plannedSession = command === 'skip-item'
        ? { ...currentSession, answeredCount: Math.max(0, Number(currentSession.answeredCount) || 0) + 1 }
        : currentSession;
      addSelectionCandidates(ids, {
        progress,
        session: plannedSession,
        prefs: normalisePunctuationPrefs({ ...(data.prefs || {}), mode: plannedSession.mode }),
        now,
        candidateWindow: SCHEDULER_CANDIDATE_WINDOW,
      });
    }
  }

  return [...ids];
}
