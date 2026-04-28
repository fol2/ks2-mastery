import {
  canMutateLearnerData,
  canViewAdminHub,
  canViewParentHub,
  learnerMembershipRoleLabel,
  normaliseLearnerMembershipRole,
  normalisePlatformRole,
  platformRoleLabel,
} from '../access/roles.js';
import { buildSpellingLearnerReadModel } from '../../subjects/spelling/read-model.js';
import { buildGrammarLearnerReadModel } from '../../subjects/grammar/read-model.js';
import { buildPunctuationLearnerReadModel } from '../../subjects/punctuation/read-model.js';

function asTs(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isActionableFocus(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  return Boolean(entry.activeSessionId)
    || (Number(entry.dueCount) || 0) > 0
    || (Number(entry.troubleCount) || 0) > 0;
}

function orderDueWork(entries = []) {
  return entries
    .filter(Boolean)
    .sort((a, b) => Number(isActionableFocus(b)) - Number(isActionableFocus(a)));
}

// Phase 4 U7: `conceptStatus`, `dueConcepts`, and `weakConcepts` each
// contain concept rows whose client read-model projection now includes a
// `confidence: { label, sampleSize, intervalDays, distinctTemplates,
// recentMisses }` sub-object (see `src/subjects/grammar/read-model.js`
// `normaliseConceptRow`). The pass-through is structural — each array is
// forwarded verbatim — so Parent Hub + Admin Hub inherit the confidence
// projection without any additional shaping work here. The `AdultConfidenceChip`
// component consumes `confidence` directly. Child surfaces never read the
// `confidence` field (they use `grammarChildConfidenceLabel` from the
// view-model).
function grammarEvidenceFromReadModel(grammar = {}) {
  return {
    subjectId: 'grammar',
    hasEvidence: Boolean(grammar.hasEvidence),
    progressSnapshot: grammar.progressSnapshot || null,
    overview: grammar.overview || null,
    currentFocus: grammar.currentFocus || null,
    conceptStatus: Array.isArray(grammar.conceptStatus) ? grammar.conceptStatus : [],
    dueConcepts: Array.isArray(grammar.dueConcepts) ? grammar.dueConcepts : [],
    weakConcepts: Array.isArray(grammar.weakConcepts) ? grammar.weakConcepts : [],
    questionTypeSummary: Array.isArray(grammar.questionTypeSummary) ? grammar.questionTypeSummary : [],
    coverageDiagnostics: grammar.coverageDiagnostics || null,
    misconceptionPatterns: Array.isArray(grammar.misconceptionPatterns) ? grammar.misconceptionPatterns : [],
    recentActivity: Array.isArray(grammar.recentActivity) ? grammar.recentActivity : [],
    recentSessions: Array.isArray(grammar.recentSessions) ? grammar.recentSessions : [],
    parentSummaryDraft: grammar.parentSummaryDraft || null,
  };
}

function punctuationEvidenceFromReadModel(punctuation = {}) {
  return {
    subjectId: 'punctuation',
    hasEvidence: Boolean(punctuation.hasEvidence),
    progressSnapshot: punctuation.progressSnapshot || null,
    overview: punctuation.overview || null,
    currentFocus: punctuation.currentFocus || null,
    skillRows: Array.isArray(punctuation.skillRows) ? punctuation.skillRows : [],
    bySessionMode: Array.isArray(punctuation.bySessionMode) ? punctuation.bySessionMode : [],
    byItemMode: Array.isArray(punctuation.byItemMode) ? punctuation.byItemMode : [],
    weakestFacets: Array.isArray(punctuation.weakestFacets) ? punctuation.weakestFacets : [],
    recentMistakes: Array.isArray(punctuation.recentMistakes) ? punctuation.recentMistakes : [],
    misconceptionPatterns: Array.isArray(punctuation.misconceptionPatterns) ? punctuation.misconceptionPatterns : [],
    recentSessions: Array.isArray(punctuation.recentSessions) ? punctuation.recentSessions : [],
    dailyGoal: punctuation.dailyGoal || null,
    streak: punctuation.streak || null,
    releaseDiagnostics: punctuation.releaseDiagnostics || null,
  };
}

function normaliseAccessibleLearnerEntry(rawValue) {
  const raw = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : {};
  const learner = raw.learner && typeof raw.learner === 'object' && !Array.isArray(raw.learner) ? raw.learner : {};
  const membershipRole = normaliseLearnerMembershipRole(raw.membershipRole || raw.role);
  const writable = canMutateLearnerData({ membershipRole });
  return {
    learnerId: raw.learnerId || learner.id || '',
    learnerName: learner.name || raw.learnerName || 'Learner',
    yearGroup: learner.yearGroup || raw.yearGroup || 'Y5',
    membershipRole,
    membershipRoleLabel: learnerMembershipRoleLabel(membershipRole),
    stateRevision: Number(raw.stateRevision) || 0,
    writable,
    accessModeLabel: writable ? 'Writable learner' : 'Read-only learner',
  };
}

export function buildParentHubReadModel({
  learner,
  platformRole = 'parent',
  membershipRole = 'owner',
  accessibleLearners = [],
  selectedLearnerId = null,
  subjectStates = {},
  practiceSessions = [],
  eventLog = [],
  gameState = {},
  runtimeSnapshots = {},
  now = Date.now,
} = {}) {
  const resolvedPlatformRole = normalisePlatformRole(platformRole);
  const resolvedMembershipRole = normaliseLearnerMembershipRole(membershipRole);
  const canMutate = canMutateLearnerData({ membershipRole: resolvedMembershipRole });
  const spelling = buildSpellingLearnerReadModel({
    subjectStateRecord: isPlainObject(subjectStates.spelling) ? subjectStates.spelling : null,
    practiceSessions,
    eventLog,
    runtimeSnapshot: runtimeSnapshots.spelling || null,
    now,
  });
  const grammar = buildGrammarLearnerReadModel({
    subjectStateRecord: isPlainObject(subjectStates.grammar) ? subjectStates.grammar : null,
    practiceSessions,
    eventLog,
    now,
  });
  const punctuation = buildPunctuationLearnerReadModel({
    subjectStateRecord: isPlainObject(subjectStates.punctuation) ? subjectStates.punctuation : null,
    practiceSessions,
    now,
  });
  const grammarEvidence = grammarEvidenceFromReadModel(grammar);
  const punctuationEvidence = punctuationEvidenceFromReadModel(punctuation);
  const activeSubjectCount = [
    spelling.progressSnapshot.trackedWords > 0,
    grammar.hasEvidence,
    punctuation.hasEvidence,
  ].filter(Boolean).length;

  const lastActivityAt = Math.max(
    asTs(learner?.createdAt, 0),
    asTs(spelling?.overview?.lastActivityAt, 0),
    asTs(grammar?.overview?.lastActivityAt, 0),
    asTs(punctuation?.overview?.lastActivityAt, 0),
    ...Object.values(isPlainObject(gameState) ? gameState : {}).map((entry) => asTs(entry?.updatedAt, 0)),
    0,
  );

  const resolvedLearnerId = learner?.id || selectedLearnerId || '';
  const learnerOptions = (Array.isArray(accessibleLearners) ? accessibleLearners : [])
    .map(normaliseAccessibleLearnerEntry)
    .filter((entry) => entry.learnerId);
  const hasSelectedLearnerOption = learnerOptions.some((entry) => entry.learnerId === resolvedLearnerId);
  if (resolvedLearnerId && !hasSelectedLearnerOption) {
    learnerOptions.unshift(normaliseAccessibleLearnerEntry({
      learnerId: resolvedLearnerId,
      membershipRole: resolvedMembershipRole,
      learner,
    }));
  }

  return {
    generatedAt: typeof now === 'function' ? asTs(now(), Date.now()) : asTs(now, Date.now()),
    permissions: {
      platformRole: resolvedPlatformRole,
      platformRoleLabel: platformRoleLabel(resolvedPlatformRole),
      membershipRole: resolvedMembershipRole,
      membershipRoleLabel: learnerMembershipRoleLabel(resolvedMembershipRole),
      canViewParentHub: canViewParentHub({ platformRole: resolvedPlatformRole, membershipRole: resolvedMembershipRole }),
      canViewAdminHub: canViewAdminHub({ platformRole: resolvedPlatformRole }),
      canMutateLearnerData: canMutate,
      accessModeLabel: canMutate ? 'Writable learner' : 'Read-only learner',
    },
    learner: {
      id: learner?.id || '',
      name: learner?.name || 'Learner',
      yearGroup: learner?.yearGroup || 'Y5',
      goal: learner?.goal || 'sats',
      dailyMinutes: Number(learner?.dailyMinutes) || 15,
      lastActivityAt,
      activeSubjectCount,
    },
    learnerOverview: {
      secureWords: spelling.progressSnapshot.secureWords,
      dueWords: spelling.progressSnapshot.dueWords,
      troubleWords: spelling.progressSnapshot.troubleWords,
      accuracyPercent: spelling.progressSnapshot.accuracyPercent,
      secureGrammarConcepts: grammar.progressSnapshot.securedConcepts,
      dueGrammarConcepts: grammar.progressSnapshot.dueConcepts,
      weakGrammarConcepts: grammar.progressSnapshot.weakConcepts,
      grammarAccuracyPercent: grammar.progressSnapshot.accuracyPercent,
      securePunctuationUnits: punctuation.progressSnapshot.securedRewardUnits,
      duePunctuationItems: punctuation.progressSnapshot.dueItems,
      weakPunctuationItems: punctuation.progressSnapshot.weakItems,
      punctuationAccuracyPercent: punctuation.progressSnapshot.accuracyPercent,
      recentSessions: spelling.recentSessions.length,
    },
    selectedLearnerId: resolvedLearnerId,
    accessibleLearners: learnerOptions,
    dueWork: orderDueWork([
      spelling.currentFocus,
      ...(grammar.hasEvidence ? [grammar.currentFocus] : []),
      ...(punctuation.hasEvidence ? [punctuation.currentFocus] : []),
    ]),
    recentSessions: [...spelling.recentSessions, ...grammar.recentSessions, ...punctuation.recentSessions]
      .sort((a, b) => asTs(b.updatedAt, 0) - asTs(a.updatedAt, 0))
      .slice(0, 6),
    strengths: [...spelling.strengths, ...grammar.strengths, ...punctuation.strengths].slice(0, 6),
    weaknesses: [...spelling.weaknesses, ...grammar.weaknesses, ...punctuation.weaknesses].slice(0, 6),
    misconceptionPatterns: [...spelling.misconceptionPatterns, ...grammar.misconceptionPatterns, ...punctuation.misconceptionPatterns]
      .sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0) || asTs(b.lastSeenAt, 0) - asTs(a.lastSeenAt, 0))
      .slice(0, 8),
    progressSnapshots: [
      spelling.progressSnapshot,
      ...(grammar.hasEvidence ? [grammar.progressSnapshot] : []),
      ...(punctuation.hasEvidence ? [punctuation.progressSnapshot] : []),
    ],
    grammarEvidence,
    punctuationEvidence,
    exportEntryPoints: [
      {
        kind: 'learner',
        label: 'Export current learner snapshot',
        action: 'platform-export-learner',
      },
      {
        kind: 'platform',
        label: 'Export full app snapshot',
        action: 'platform-export-app',
      },
    ],
  };
}
