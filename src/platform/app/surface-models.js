import {
  monsterSummaryFromSpellingAnalytics,
  monsterSummaryFromState,
} from '../game/monster-system.js';

const MONSTER_CODEX_SYSTEM_ID = 'monster-codex';

function analyticsHasWordRows(analytics) {
  return (Array.isArray(analytics?.wordGroups) ? analytics.wordGroups : [])
    .some((group) => Array.isArray(group?.words) && group.words.length > 0);
}

function directSecureTotal(summary = []) {
  return summary
    .filter((entry) => entry?.monster?.id !== 'phaeton')
    .reduce((sum, entry) => sum + (Number(entry?.progress?.mastered) || 0), 0);
}

function readRewardState(context, learnerId) {
  try {
    return context?.repositories?.gameState?.read?.(learnerId, MONSTER_CODEX_SYSTEM_ID) || {};
  } catch {
    return {};
  }
}

export function buildLearnerMonsterSummary(learnerId, context = {}) {
  if (!learnerId) return [];

  const rewardSummary = monsterSummaryFromState(readRewardState(context, learnerId));
  const spelling = context?.services?.spelling;
  if (!spelling?.getAnalyticsSnapshot) return rewardSummary;

  let analytics = null;
  try {
    analytics = spelling.getAnalyticsSnapshot(learnerId);
  } catch {
    return rewardSummary;
  }

  if (!analyticsHasWordRows(analytics)) return rewardSummary;

  const analyticsSummary = monsterSummaryFromSpellingAnalytics(analytics, {
    learnerId,
    gameStateRepository: context?.repositories?.gameState,
    persistBranches: false,
  });

  return directSecureTotal(analyticsSummary) > directSecureTotal(rewardSummary)
    ? analyticsSummary
    : rewardSummary;
}

export function persistenceLabel(snapshot) {
  if (snapshot?.mode === 'remote-sync') return 'Remote sync';
  if (snapshot?.mode === 'degraded') {
    return snapshot?.remoteAvailable ? 'Sync degraded' : 'Local storage degraded';
  }
  return 'Local-only';
}

export function selectedLearnerModel(appState) {
  const learnerId = appState.learners.selectedId;
  const learner = learnerId ? appState.learners.byId[learnerId] : null;
  return learner
    ? { id: learner.id, name: learner.name, yearGroup: learner.yearGroup }
    : null;
}
