import {
  deriveGrammarConfidence,
  GRAMMAR_RECENT_ATTEMPT_HORIZON,
  grammarConceptStatus,
} from '../../../shared/grammar/confidence.js';
import {
  GRAMMAR_CLIENT_CONCEPTS,
} from './metadata.js';

const QUESTION_TYPE_LABELS = Object.freeze({
  identify: 'Identify the feature',
  choose: 'Choose the correct sentence',
  fix: 'Fix the sentence',
  rewrite: 'Rewrite the sentence',
  build: 'Build or transform',
  explain: 'Explain why',
  classify: 'Classify',
  fill: 'Complete the sentence',
});

const CONCEPT_STATUS_ORDER = Object.freeze({
  weak: 0,
  due: 1,
  learning: 2,
  secured: 3,
  new: 4,
});

const VALID_CONCEPT_STATUSES = new Set(Object.keys(CONCEPT_STATUS_ORDER));

function asTs(value, fallback = 0) {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normaliseMasteryNode(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  return {
    attempts: Math.max(0, Math.floor(Number(raw.attempts) || 0)),
    correct: Math.max(0, Math.floor(Number(raw.correct) || 0)),
    wrong: Math.max(0, Math.floor(Number(raw.wrong) || 0)),
    strength: Number.isFinite(Number(raw.strength)) ? Math.max(0.02, Math.min(0.99, Number(raw.strength))) : 0.25,
    intervalDays: Math.max(0, Number(raw.intervalDays) || 0),
    dueAt: asTs(raw.dueAt, 0),
    lastSeenAt: typeof raw.lastSeenAt === 'string' ? raw.lastSeenAt : null,
    lastWrongAt: typeof raw.lastWrongAt === 'string' ? raw.lastWrongAt : null,
    correctStreak: Math.max(0, Math.floor(Number(raw.correctStreak) || 0)),
  };
}

function accuracyPercent(correct, wrong) {
  const total = Math.max(0, Number(correct) || 0) + Math.max(0, Number(wrong) || 0);
  if (!total) return null;
  return Math.round((Math.max(0, Number(correct) || 0) / total) * 100);
}

function humanLabel(id) {
  return String(id || '')
    .replace(/_confusion$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function questionTypeLabel(id) {
  return QUESTION_TYPE_LABELS[id] || humanLabel(id);
}

function safeTextList(value, limit = 4) {
  return (Array.isArray(value) ? value : [])
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .slice(0, limit);
}

function sortTop(entries, scoreFn, limit = 3) {
  return [...entries]
    .sort((a, b) => {
      const scoreDelta = scoreFn(b) - scoreFn(a);
      if (scoreDelta) return scoreDelta;
      return String(a.label || a.id || '').localeCompare(String(b.label || b.id || ''));
    })
    .slice(0, limit);
}

// Phase 4 U7: recent-window helpers mirror the Worker read-model
// (`worker/src/subjects/grammar/read-models.js` recentMissCountForConcept +
// distinctTemplatesFor). Aligned to GRAMMAR_RECENT_ATTEMPT_HORIZON so
// `distinctTemplates` and `recentMisses` are directly comparable "recent"
// signals — same contract as Worker.
function recentAttemptsWindow(recentAttempts) {
  return Array.isArray(recentAttempts)
    ? recentAttempts.slice(-GRAMMAR_RECENT_ATTEMPT_HORIZON)
    : [];
}

function recentMissCountForConceptId(recentAttempts, conceptId) {
  if (!conceptId) return 0;
  let count = 0;
  for (const attempt of recentAttemptsWindow(recentAttempts)) {
    const conceptIds = Array.isArray(attempt?.conceptIds) ? attempt.conceptIds : [];
    const result = isPlainObject(attempt?.result) ? attempt.result : {};
    if (conceptIds.includes(conceptId) && result.correct === false) count += 1;
  }
  return count;
}

function distinctTemplatesForConceptId(recentAttempts, conceptId) {
  if (!conceptId) return 0;
  const seen = new Set();
  for (const attempt of recentAttemptsWindow(recentAttempts)) {
    const conceptIds = Array.isArray(attempt?.conceptIds) ? attempt.conceptIds : [];
    if (conceptIds.includes(conceptId) && typeof attempt?.templateId === 'string' && attempt.templateId) {
      seen.add(attempt.templateId);
    }
  }
  return seen.size;
}

function confidenceForConcept({
  conceptId, status, attempts, strength, correctStreak, intervalDays, recentAttempts,
}) {
  const recentMisses = recentMissCountForConceptId(recentAttempts, conceptId);
  const distinctTemplates = distinctTemplatesForConceptId(recentAttempts, conceptId);
  const label = deriveGrammarConfidence({
    status, attempts, strength, correctStreak, intervalDays, recentMisses,
  });
  return {
    label,
    sampleSize: attempts,
    intervalDays,
    distinctTemplates,
    recentMisses,
  };
}

function normaliseConceptRow(rawValue, concept, nowTs, recentAttempts = []) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const node = normaliseMasteryNode(raw);
  const status = VALID_CONCEPT_STATUSES.has(raw.status)
    ? raw.status
    : grammarConceptStatus(node, nowTs);
  // Phase 4 U7: client read-model now emits per-concept `confidence` via the
  // shared `deriveGrammarConfidence`. Parent Hub + Admin Hub read this field
  // (they receive the client read-model, NOT the Worker payload). Without
  // this extension adult hubs have no access to the confidence projection.
  const confidence = confidenceForConcept({
    conceptId: concept.id,
    status,
    attempts: node.attempts,
    strength: node.strength,
    correctStreak: node.correctStreak,
    intervalDays: node.intervalDays,
    recentAttempts,
  });
  return {
    ...concept,
    subjectId: 'grammar',
    status,
    attempts: node.attempts,
    correct: node.correct,
    wrong: node.wrong,
    accuracyPercent: accuracyPercent(node.correct, node.wrong),
    strength: node.strength,
    dueAt: node.dueAt,
    lastSeenAt: node.lastSeenAt,
    lastWrongAt: node.lastWrongAt,
    correctStreak: node.correctStreak,
    intervalDays: node.intervalDays,
    confidence,
  };
}

function analyticsFromStateOrUi(state, ui) {
  if (isPlainObject(ui?.analytics)) return ui.analytics;
  if (isPlainObject(state?.analytics)) return state.analytics;
  return {};
}

function conceptRowsFromState(state, nowTs, ui = null) {
  const recentAttempts = Array.isArray(state?.recentAttempts) ? state.recentAttempts : [];
  const mastery = isPlainObject(state?.mastery?.concepts) ? state.mastery.concepts : null;
  if (mastery) {
    return GRAMMAR_CLIENT_CONCEPTS.map((concept) => normaliseConceptRow(mastery[concept.id], concept, nowTs, recentAttempts));
  }
  const analytics = analyticsFromStateOrUi(state, ui);
  if (Array.isArray(analytics.concepts) && analytics.concepts.length) {
    const rowsById = new Map(analytics.concepts
      .filter((entry) => typeof entry?.id === 'string')
      .map((entry) => [entry.id, entry]));
    return GRAMMAR_CLIENT_CONCEPTS.map((concept) => normaliseConceptRow(rowsById.get(concept.id), concept, nowTs, recentAttempts));
  }
  return GRAMMAR_CLIENT_CONCEPTS.map((concept) => normaliseConceptRow(null, concept, nowTs, recentAttempts));
}

function progressSnapshotFromConcepts(concepts) {
  const attempted = concepts.filter((concept) => concept.attempts > 0);
  const correct = concepts.reduce((sum, concept) => sum + concept.correct, 0);
  const wrong = concepts.reduce((sum, concept) => sum + concept.wrong, 0);
  return {
    subjectId: 'grammar',
    totalConcepts: concepts.length,
    trackedConcepts: attempted.length,
    securedConcepts: concepts.filter((concept) => concept.status === 'secured').length,
    dueConcepts: concepts.filter((concept) => concept.status === 'due').length,
    weakConcepts: concepts.filter((concept) => concept.status === 'weak').length,
    untouchedConcepts: concepts.filter((concept) => concept.status === 'new').length,
    accuracyPercent: accuracyPercent(correct, wrong),
  };
}

function grammarCoverageDiagnostics() {
  return {
    releaseId: 'grammar-qg-p1-2026-04-28',
    templateCount: 57,
    generatedTemplateCount: 31,
    thinPoolWarnings: [],
  };
}

function orderedConceptEvidence(concepts) {
  return [...concepts].sort((a, b) => {
    const statusDelta = (CONCEPT_STATUS_ORDER[a.status] ?? 99) - (CONCEPT_STATUS_ORDER[b.status] ?? 99);
    if (statusDelta) return statusDelta;
    const wrongDelta = (Number(b.wrong) || 0) - (Number(a.wrong) || 0);
    if (wrongDelta) return wrongDelta;
    const dueDelta = asTs(a.dueAt, Number.MAX_SAFE_INTEGER) - asTs(b.dueAt, Number.MAX_SAFE_INTEGER);
    if (dueDelta) return dueDelta;
    return String(a.name || a.id || '').localeCompare(String(b.name || b.id || ''));
  });
}

function domainSummaries(concepts) {
  const groups = new Map();
  for (const concept of concepts) {
    const id = concept.domain || 'Grammar';
    const current = groups.get(id) || {
      id,
      label: id,
      secureCount: 0,
      dueCount: 0,
      weakCount: 0,
      attemptCount: 0,
      correct: 0,
      wrong: 0,
      rows: [],
    };
    current.rows.push(concept);
    current.secureCount += concept.status === 'secured' ? 1 : 0;
    current.dueCount += concept.status === 'due' ? 1 : 0;
    current.weakCount += concept.status === 'weak' ? 1 : 0;
    current.attemptCount += concept.attempts;
    current.correct += concept.correct;
    current.wrong += concept.wrong;
    groups.set(id, current);
  }
  return [...groups.values()].map((entry) => ({
    ...entry,
    accuracyPercent: accuracyPercent(entry.correct, entry.wrong),
  }));
}

function normaliseMisconceptionPattern(id, rawEntry, source = 'grammar-state') {
  const entry = isPlainObject(rawEntry) ? rawEntry : {};
  return {
    subjectId: 'grammar',
    id,
    label: entry.label || `${humanLabel(id)} pattern`,
    count: Math.max(0, Math.floor(Number(entry.count) || 0)),
    lastSeenAt: asTs(entry.lastSeenAt, 0),
    source: typeof entry.source === 'string' ? entry.source : source,
  };
}

function misconceptionPatternsFromState(state, eventLog = [], ui = null) {
  const patterns = new Map();
  const analytics = analyticsFromStateOrUi(state, ui);
  if (Array.isArray(analytics.misconceptionPatterns)) {
    for (const rawEntry of analytics.misconceptionPatterns) {
      if (!isPlainObject(rawEntry)) continue;
      const id = typeof rawEntry.id === 'string' && rawEntry.id ? rawEntry.id : String(rawEntry.label || '').toLowerCase().replace(/\W+/g, '_');
      if (!id) continue;
      patterns.set(id, normaliseMisconceptionPattern(id, rawEntry, 'grammar-read-model'));
    }
  }

  const misconceptions = isPlainObject(state?.misconceptions) ? state.misconceptions : {};
  for (const [id, rawEntry] of Object.entries(misconceptions)) {
    const next = normaliseMisconceptionPattern(id, rawEntry, 'grammar-state');
    const current = patterns.get(id);
    patterns.set(id, current && current.count >= next.count ? current : next);
  }

  for (const event of Array.isArray(eventLog) ? eventLog : []) {
    if (event?.subjectId !== 'grammar' || event?.type !== 'grammar.misconception-seen' || !event.misconception) continue;
    const id = String(event.misconception);
    const current = patterns.get(id) || {
      subjectId: 'grammar',
      id,
      label: `${humanLabel(id)} pattern`,
      count: 0,
      lastSeenAt: 0,
      source: 'grammar-event',
    };
    if (current.source === 'grammar-event') current.count += 1;
    current.lastSeenAt = Math.max(current.lastSeenAt, asTs(event.createdAt, 0));
    patterns.set(id, current);
  }

  return [...patterns.values()]
    .filter((entry) => entry.count > 0)
    .sort((a, b) => (b.count - a.count) || (b.lastSeenAt - a.lastSeenAt))
    .slice(0, 5);
}

function normaliseQuestionTypeEntry(id, rawNode, nowTs) {
  const node = normaliseMasteryNode(rawNode);
  const status = VALID_CONCEPT_STATUSES.has(rawNode?.status)
    ? rawNode.status
    : grammarConceptStatus(node, nowTs);
  return {
    subjectId: 'grammar',
    id,
    label: rawNode?.label || questionTypeLabel(id),
    status,
    attempts: node.attempts,
    correct: node.correct,
    wrong: node.wrong,
    accuracyPercent: accuracyPercent(node.correct, node.wrong),
    strength: node.strength,
    dueAt: node.dueAt,
  };
}

function questionTypeSummaryFromState(state, nowTs, ui = null) {
  const mastery = isPlainObject(state?.mastery?.questionTypes) ? state.mastery.questionTypes : null;
  if (mastery) {
    return Object.entries(mastery)
      .map(([id, rawNode]) => normaliseQuestionTypeEntry(id, rawNode, nowTs))
      .filter((entry) => entry.attempts > 0)
      .sort((a, b) => {
        const troubleDelta = (Number(b.wrong) - Number(a.wrong)) || (Number(a.accuracyPercent ?? 101) - Number(b.accuracyPercent ?? 101));
        if (troubleDelta) return troubleDelta;
        return String(a.label).localeCompare(String(b.label));
      })
      .slice(0, 6);
  }
  const analytics = analyticsFromStateOrUi(state, ui);
  if (Array.isArray(analytics.questionTypeSummary) && analytics.questionTypeSummary.length) {
    return analytics.questionTypeSummary
      .filter((entry) => isPlainObject(entry) && typeof entry.id === 'string')
      .map((entry) => normaliseQuestionTypeEntry(entry.id, entry, nowTs))
      .filter((entry) => entry.attempts > 0)
      .slice(0, 6);
  }
  return [];
}

function normaliseRecentActivityEntry(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const result = isPlainObject(raw.result) ? raw.result : raw;
  const questionType = typeof raw.questionType === 'string' ? raw.questionType : '';
  return {
    subjectId: 'grammar',
    templateId: typeof raw.templateId === 'string' ? raw.templateId : '',
    itemId: typeof raw.itemId === 'string' ? raw.itemId : '',
    questionType,
    label: raw.label || raw.questionTypeLabel || questionTypeLabel(questionType),
    conceptIds: Array.isArray(raw.conceptIds) ? raw.conceptIds.filter(Boolean).map(String) : [],
    correct: Boolean(result.correct),
    score: Number(result.score) || 0,
    maxScore: Number(result.maxScore) || 1,
    supportLevel: Math.max(0, Math.floor(Number(raw.supportLevel) || 0)),
    attempts: Math.max(1, Math.floor(Number(raw.attempts) || 1)),
    misconception: typeof result.misconception === 'string' ? result.misconception : '',
    createdAt: asTs(raw.createdAt, 0),
  };
}

function recentActivityFromState(state, ui = null) {
  if (Array.isArray(state?.recentAttempts)) {
    return state.recentAttempts
      .slice(-8)
      .reverse()
      .map(normaliseRecentActivityEntry)
      .filter((entry) => entry.itemId || entry.templateId || entry.createdAt);
  }
  const analytics = analyticsFromStateOrUi(state, ui);
  if (Array.isArray(analytics.recentActivity) && analytics.recentActivity.length) {
    return analytics.recentActivity
      .map(normaliseRecentActivityEntry)
      .filter((entry) => entry.itemId || entry.templateId || entry.createdAt)
      .slice(0, 8);
  }
  return [];
}

function parentSummaryDraftFromRecord(record) {
  const candidates = [
    record?.ui?.aiEnrichment,
    record?.data?.aiEnrichment,
  ];
  for (const candidate of candidates) {
    if (!isPlainObject(candidate) || !isPlainObject(candidate.parentSummary)) continue;
    const summary = candidate.parentSummary;
    const body = typeof summary.body === 'string' ? summary.body.trim() : '';
    const title = typeof summary.title === 'string' ? summary.title.trim() : '';
    const nextSteps = safeTextList(summary.nextSteps, 4);
    if (!body && !title && !nextSteps.length) continue;
    return {
      subjectId: 'grammar',
      kind: 'parent-summary',
      status: candidate.status === 'ready' ? 'ready' : 'failed',
      generatedAt: asTs(candidate.generatedAt, 0),
      title: title || 'Parent summary draft',
      body,
      nextSteps,
    };
  }
  return null;
}

function recentGrammarSessions(practiceSessions = []) {
  return (Array.isArray(practiceSessions) ? practiceSessions : [])
    .filter((record) => record?.subjectId === 'grammar')
    .sort((a, b) => asTs(b.updatedAt, 0) - asTs(a.updatedAt, 0))
    .slice(0, 6)
    .map((record) => {
      const answered = Number(record?.summary?.answered) || 0;
      const correct = Number(record?.summary?.correct) || 0;
      return {
        id: record.id,
        subjectId: 'grammar',
        status: record.status,
        sessionKind: record.sessionKind || record.summary?.mode || 'practice',
        label: record?.summary?.mode ? `Grammar ${record.summary.mode}` : 'Grammar practice',
        updatedAt: asTs(record.updatedAt, asTs(record.createdAt, 0)),
        mistakeCount: Math.max(0, answered - correct),
        headline: answered ? `${correct}/${answered}` : '',
      };
    });
}

function currentGrammarFocus({ concepts, sessions, snapshot }) {
  const activeSession = sessions.find((record) => record.status === 'active') || null;
  const weakConcepts = concepts.filter((concept) => concept.status === 'weak');
  const dueConcepts = concepts.filter((concept) => concept.status === 'due');
  if (activeSession) {
    return {
      subjectId: 'grammar',
      recommendedMode: 'smart',
      label: 'Continue Grammar practice',
      detail: 'A live Grammar round is saved for this learner.',
      dueCount: dueConcepts.length,
      troubleCount: weakConcepts.length,
      activeSessionId: activeSession.id,
    };
  }
  if (weakConcepts.length) {
    return {
      subjectId: 'grammar',
      recommendedMode: 'trouble',
      label: 'Repair Grammar misconceptions',
      detail: `${weakConcepts[0].name} is the highest current Grammar load.`,
      dueCount: dueConcepts.length,
      troubleCount: weakConcepts.length,
      activeSessionId: null,
    };
  }
  if (dueConcepts.length) {
    return {
      subjectId: 'grammar',
      recommendedMode: 'smart',
      label: 'Clear due Grammar concepts',
      detail: `${dueConcepts.length} concept${dueConcepts.length === 1 ? '' : 's'} need spaced review.`,
      dueCount: dueConcepts.length,
      troubleCount: weakConcepts.length,
      activeSessionId: null,
    };
  }
  return {
    subjectId: 'grammar',
    recommendedMode: 'smart',
    label: snapshot.trackedConcepts ? 'Keep Grammar evidence fresh' : 'Start Grammar evidence',
    detail: snapshot.trackedConcepts
      ? `${snapshot.trackedConcepts} concept${snapshot.trackedConcepts === 1 ? '' : 's'} have answer evidence.`
      : 'No Grammar answer evidence is stored yet.',
    dueCount: dueConcepts.length,
    troubleCount: weakConcepts.length,
    activeSessionId: null,
  };
}

export function buildGrammarLearnerReadModel({
  subjectStateRecord = null,
  practiceSessions = [],
  eventLog = [],
  now = Date.now,
} = {}) {
  const nowTs = typeof now === 'function' ? asTs(now(), Date.now()) : asTs(now, Date.now());
  const record = isPlainObject(subjectStateRecord) ? subjectStateRecord : {};
  const data = isPlainObject(record.data) ? record.data : {};
  const ui = isPlainObject(record.ui) ? record.ui : {};
  const state = isPlainObject(data.mastery) ? data : ui;
  const concepts = conceptRowsFromState(state, nowTs, ui);
  const conceptStatus = orderedConceptEvidence(concepts);
  const dueConcepts = conceptStatus.filter((concept) => concept.status === 'due').slice(0, 8);
  const weakConcepts = conceptStatus.filter((concept) => concept.status === 'weak').slice(0, 8);
  const snapshot = progressSnapshotFromConcepts(concepts);
  const domains = domainSummaries(concepts);
  const sessions = recentGrammarSessions(practiceSessions);
  const strengths = sortTop(
    domains.filter((entry) => entry.secureCount > 0),
    (entry) => entry.secureCount * 10 + (entry.accuracyPercent || 0),
    3,
  ).map((entry) => ({
    subjectId: 'grammar',
    id: entry.id,
    label: entry.label,
    detail: `${entry.secureCount} secure concept${entry.secureCount === 1 ? '' : 's'}`,
    secureCount: entry.secureCount,
    dueCount: entry.dueCount,
    troubleCount: entry.weakCount,
  }));
  const weaknesses = sortTop(
    domains.filter((entry) => entry.dueCount > 0 || entry.weakCount > 0),
    (entry) => entry.weakCount * 12 + entry.dueCount * 7 - (entry.accuracyPercent || 0) / 10,
    3,
  ).map((entry) => ({
    subjectId: 'grammar',
    id: entry.id,
    label: entry.label,
    detail: `${entry.dueCount} due · ${entry.weakCount} weak`,
    secureCount: entry.secureCount,
    dueCount: entry.dueCount,
    troubleCount: entry.weakCount,
  }));
  const misconceptionPatterns = misconceptionPatternsFromState(state, eventLog, ui);
  const questionTypeSummary = questionTypeSummaryFromState(state, nowTs, ui);
  const recentActivity = recentActivityFromState(state, ui);
  const parentSummaryDraft = parentSummaryDraftFromRecord(record);
  const lastActivityAt = Math.max(
    asTs(record.updatedAt, 0),
    ...concepts.map((concept) => asTs(concept.lastSeenAt, 0)),
    ...sessions.map((session) => asTs(session.updatedAt, 0)),
    ...recentActivity.map((entry) => asTs(entry.createdAt, 0)),
    asTs(parentSummaryDraft?.generatedAt, 0),
    ...((Array.isArray(eventLog) ? eventLog : []).filter((event) => event?.subjectId === 'grammar').map((event) => asTs(event.createdAt, 0))),
    0,
  );

  return {
    subjectId: 'grammar',
    currentFocus: currentGrammarFocus({ concepts, sessions, snapshot }),
    progressSnapshot: snapshot,
    overview: {
      ...snapshot,
      lastActivityAt,
    },
    conceptStatus,
    dueConcepts,
    weakConcepts,
    strengths,
    weaknesses,
    misconceptionPatterns,
    questionTypeSummary,
    coverageDiagnostics: grammarCoverageDiagnostics(),
    recentActivity,
    recentSessions: sessions,
    parentSummaryDraft,
    hasEvidence: snapshot.trackedConcepts > 0
      || sessions.length > 0
      || misconceptionPatterns.length > 0
      || questionTypeSummary.length > 0
      || recentActivity.length > 0
      || Boolean(parentSummaryDraft),
  };
}
