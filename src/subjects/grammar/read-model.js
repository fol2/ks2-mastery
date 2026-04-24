import { GRAMMAR_CLIENT_CONCEPTS } from './metadata.js';

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

function grammarConceptStatus(node, nowTs) {
  const value = normaliseMasteryNode(node);
  if (!value.attempts) return 'new';
  if (value.strength < 0.42 || value.wrong > value.correct + 1) return 'weak';
  if ((value.dueAt || 0) <= nowTs) return 'due';
  if (value.strength >= 0.82 && value.intervalDays >= 7 && value.correctStreak >= 3) return 'secured';
  return 'learning';
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

function sortTop(entries, scoreFn, limit = 3) {
  return [...entries]
    .sort((a, b) => {
      const scoreDelta = scoreFn(b) - scoreFn(a);
      if (scoreDelta) return scoreDelta;
      return String(a.label || a.id || '').localeCompare(String(b.label || b.id || ''));
    })
    .slice(0, limit);
}

function conceptRowsFromState(state, nowTs) {
  const mastery = isPlainObject(state?.mastery?.concepts) ? state.mastery.concepts : {};
  return GRAMMAR_CLIENT_CONCEPTS.map((concept) => {
    const node = normaliseMasteryNode(mastery[concept.id]);
    const status = grammarConceptStatus(node, nowTs);
    return {
      ...concept,
      status,
      attempts: node.attempts,
      correct: node.correct,
      wrong: node.wrong,
      strength: node.strength,
      dueAt: node.dueAt,
      lastSeenAt: node.lastSeenAt,
      lastWrongAt: node.lastWrongAt,
      correctStreak: node.correctStreak,
    };
  });
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

function misconceptionPatternsFromState(state, eventLog = []) {
  const patterns = new Map();
  const misconceptions = isPlainObject(state?.misconceptions) ? state.misconceptions : {};
  for (const [id, rawEntry] of Object.entries(misconceptions)) {
    const entry = isPlainObject(rawEntry) ? rawEntry : {};
    patterns.set(id, {
      subjectId: 'grammar',
      id,
      label: `${humanLabel(id)} pattern`,
      count: Math.max(0, Math.floor(Number(entry.count) || 0)),
      lastSeenAt: asTs(entry.lastSeenAt, 0),
      source: 'grammar-state',
    });
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

function questionTypeSummaryFromState(state, nowTs) {
  const mastery = isPlainObject(state?.mastery?.questionTypes) ? state.mastery.questionTypes : {};
  return Object.entries(mastery)
    .map(([id, rawNode]) => {
      const node = normaliseMasteryNode(rawNode);
      return {
        subjectId: 'grammar',
        id,
        label: questionTypeLabel(id),
        status: grammarConceptStatus(node, nowTs),
        attempts: node.attempts,
        correct: node.correct,
        wrong: node.wrong,
        accuracyPercent: accuracyPercent(node.correct, node.wrong),
        strength: node.strength,
        dueAt: node.dueAt,
      };
    })
    .filter((entry) => entry.attempts > 0)
    .sort((a, b) => {
      const troubleDelta = (Number(b.wrong) - Number(a.wrong)) || (Number(a.accuracyPercent ?? 101) - Number(b.accuracyPercent ?? 101));
      if (troubleDelta) return troubleDelta;
      return String(a.label).localeCompare(String(b.label));
    })
    .slice(0, 6);
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
  const state = isPlainObject(record.data) && isPlainObject(record.data.mastery)
    ? record.data
    : (isPlainObject(record.ui) ? record.ui : {});
  const concepts = conceptRowsFromState(state, nowTs);
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
  const misconceptionPatterns = misconceptionPatternsFromState(state, eventLog);
  const questionTypeSummary = questionTypeSummaryFromState(state, nowTs);
  const lastActivityAt = Math.max(
    asTs(record.updatedAt, 0),
    ...concepts.map((concept) => asTs(concept.lastSeenAt, 0)),
    ...sessions.map((session) => asTs(session.updatedAt, 0)),
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
    strengths,
    weaknesses,
    misconceptionPatterns,
    questionTypeSummary,
    recentSessions: sessions,
    hasEvidence: snapshot.trackedConcepts > 0 || sessions.length > 0 || misconceptionPatterns.length > 0,
  };
}
