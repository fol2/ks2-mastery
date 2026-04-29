import { emptyEconomyState, normaliseHeroEconomyState } from './economy.js';
import {
  HERO_POOL_ROSTER_VERSION as _HERO_POOL_ROSTER_VERSION,
  isValidHeroMonsterId,
  isValidHeroMonsterBranch,
} from './hero-pool.js';

export const HERO_PROGRESS_VERSION = 3;
export const MAX_RECENT_CLAIMS_AGE_DAYS = 7;


// ── Hero Pool state ─────────────────────────────────────────────

export const HERO_POOL_STATE_VERSION = 1;
export const HERO_POOL_ROSTER_VERSION = _HERO_POOL_ROSTER_VERSION;

export function emptyHeroPoolState() {
  return {
    version: HERO_POOL_STATE_VERSION,
    rosterVersion: HERO_POOL_ROSTER_VERSION,
    selectedMonsterId: null,
    monsters: {},
    recentActions: [],
    lastUpdatedAt: null,
  };
}

function normaliseStage(stage) {
  if (typeof stage !== 'number') return 0;
  if (!Number.isFinite(stage)) return 0;
  return Math.max(0, Math.min(4, Math.floor(stage)));
}

function normaliseBranch(branch, owned) {
  if (isValidHeroMonsterBranch(branch)) return branch;
  // Only normalise to null — owned monsters with invalid branch also lose it
  return null;
}

export function normaliseHeroPoolState(raw) {
  if (!raw || typeof raw !== 'object') return emptyHeroPoolState();

  const monsters = {};

  if (raw.monsters && typeof raw.monsters === 'object') {
    for (const [id, m] of Object.entries(raw.monsters)) {
      if (!isValidHeroMonsterId(id)) continue; // drop unknown IDs
      if (!m || typeof m !== 'object') continue;
      const owned = m.owned === true;
      monsters[id] = {
        monsterId: id,
        owned,
        stage: normaliseStage(m.stage),
        branch: normaliseBranch(m.branch, owned),
        investedCoins: typeof m.investedCoins === 'number' && Number.isFinite(m.investedCoins) ? Math.max(0, m.investedCoins) : 0,
        invitedAt: m.invitedAt || null,
        lastGrownAt: m.lastGrownAt || null,
        lastLedgerEntryId: typeof m.lastLedgerEntryId === 'string' ? m.lastLedgerEntryId : null,
      };
    }
  }

  // Filter recentActions: keep only well-formed entries (objects with action+monsterId)
  let recentActions = [];
  if (Array.isArray(raw.recentActions)) {
    recentActions = raw.recentActions.filter(
      entry => entry && typeof entry === 'object' && typeof entry.action === 'string'
    );
  }

  return {
    version: HERO_POOL_STATE_VERSION,
    rosterVersion: typeof raw.rosterVersion === 'string' ? raw.rosterVersion : HERO_POOL_ROSTER_VERSION,
    selectedMonsterId: typeof raw.selectedMonsterId === 'string' && isValidHeroMonsterId(raw.selectedMonsterId) ? raw.selectedMonsterId : null,
    monsters,
    recentActions,
    lastUpdatedAt: raw.lastUpdatedAt || null,
  };
}

// ── Progress state ──────────────────────────────────────────────

export function emptyProgressState() {
  return {
    version: HERO_PROGRESS_VERSION,
    daily: null,
    recentClaims: [],
    economy: emptyEconomyState(),
    heroPool: emptyHeroPoolState(),
  };
}

export function normaliseHeroProgressState(raw) {
  if (!raw || typeof raw !== 'object') return emptyProgressState();

  if (raw.version === 1) {
    // v1 → v3 upgrade: preserve daily + recentClaims, add empty economy + empty heroPool
    return {
      version: HERO_PROGRESS_VERSION,
      daily: normaliseDailyState(raw.daily),
      recentClaims: Array.isArray(raw.recentClaims) ? raw.recentClaims : [],
      economy: emptyEconomyState(),
      heroPool: emptyHeroPoolState(),
    };
  }

  if (raw.version === 2) {
    // v2 → v3 upgrade: preserve economy, add empty heroPool
    return {
      version: HERO_PROGRESS_VERSION,
      daily: normaliseDailyState(raw.daily),
      recentClaims: Array.isArray(raw.recentClaims) ? raw.recentClaims : [],
      economy: normaliseHeroEconomyState(raw.economy),
      heroPool: emptyHeroPoolState(),
    };
  }

  if (raw.version === HERO_PROGRESS_VERSION) {
    // v3 → v3: normalise all sub-blocks
    return {
      version: HERO_PROGRESS_VERSION,
      daily: normaliseDailyState(raw.daily),
      recentClaims: Array.isArray(raw.recentClaims) ? raw.recentClaims : [],
      economy: normaliseHeroEconomyState(raw.economy),
      heroPool: normaliseHeroPoolState(raw.heroPool),
    };
  }

  // Unknown or missing version — return safe empty v3 state
  return emptyProgressState();
}

function normaliseDailyState(daily) {
  if (!daily || typeof daily !== 'object') return null;
  if (!daily.dateKey || !daily.questId) return null;
  return {
    dateKey: daily.dateKey,
    timezone: daily.timezone || 'Europe/London',
    questId: daily.questId,
    questFingerprint: daily.questFingerprint || null,
    schedulerVersion: daily.schedulerVersion || null,
    copyVersion: daily.copyVersion || null,
    status: ['active', 'completed', 'expired'].includes(daily.status) ? daily.status : 'active',
    effortTarget: Number(daily.effortTarget) || 0,
    effortPlanned: Number(daily.effortPlanned) || 0,
    effortCompleted: Number(daily.effortCompleted) || 0,
    taskOrder: Array.isArray(daily.taskOrder) ? daily.taskOrder : [],
    completedTaskIds: Array.isArray(daily.completedTaskIds) ? daily.completedTaskIds : [],
    tasks: normaliseTasksMap(daily.tasks),
    generatedAt: daily.generatedAt || null,
    firstStartedAt: daily.firstStartedAt || null,
    completedAt: daily.completedAt || null,
    lastUpdatedAt: daily.lastUpdatedAt || Date.now(),
    // P4: Economy sub-block preserved from applyDailyCompletionCoinAward
    economy: daily.economy && typeof daily.economy === 'object' ? daily.economy : null,
  };
}

function normaliseTasksMap(tasks) {
  if (!tasks || typeof tasks !== 'object') return {};
  const result = {};
  for (const [id, task] of Object.entries(tasks)) {
    if (!task || typeof task !== 'object') continue;
    result[id] = {
      taskId: task.taskId || id,
      questId: task.questId || null,
      questFingerprint: task.questFingerprint || null,
      dateKey: task.dateKey || null,
      subjectId: task.subjectId || null,
      intent: task.intent || null,
      launcher: task.launcher || null,
      effortTarget: Number(task.effortTarget) || 0,
      status: ['planned', 'started', 'completed', 'blocked'].includes(task.status) ? task.status : 'planned',
      launchRequestId: task.launchRequestId || null,
      claimRequestId: task.claimRequestId || null,
      startedAt: task.startedAt || null,
      completedAt: task.completedAt || null,
      subjectPracticeSessionId: task.subjectPracticeSessionId || null,
      evidence: task.evidence || null,
    };
  }
  return result;
}

export function initialiseDailyProgress(quest, dateKey, timezone, nowTs) {
  const tasks = {};
  const taskOrder = [];
  for (const task of quest.tasks || []) {
    const id = task.taskId;
    taskOrder.push(id);
    tasks[id] = {
      taskId: id,
      questId: quest.questId,
      questFingerprint: quest.questFingerprint || null,
      dateKey,
      subjectId: task.subjectId,
      intent: task.intent || null,
      launcher: task.launcher || null,
      effortTarget: Number(task.effortTarget) || 0,
      status: 'planned',
      launchRequestId: null,
      claimRequestId: null,
      startedAt: null,
      completedAt: null,
      subjectPracticeSessionId: null,
      evidence: null,
    };
  }
  return {
    dateKey,
    timezone,
    questId: quest.questId,
    questFingerprint: quest.questFingerprint || null,
    schedulerVersion: quest.schedulerVersion || null,
    copyVersion: quest.copyVersion || null,
    status: 'active',
    effortTarget: quest.effortTarget || 0,
    effortPlanned: (quest.tasks || []).reduce((sum, t) => sum + (Number(t.effortTarget) || 0), 0),
    effortCompleted: 0,
    taskOrder,
    completedTaskIds: [],
    tasks,
    generatedAt: nowTs,
    firstStartedAt: null,
    completedAt: null,
    lastUpdatedAt: nowTs,
  };
}

export function applyClaimToProgress(state, claimResult, nowTs) {
  if (!state?.daily) return state;
  const { taskId, practiceSessionId, evidence } = claimResult;
  const task = state.daily.tasks[taskId];
  if (!task) return state;
  if (task.status === 'completed') return state; // no double-count

  const updatedTask = {
    ...task,
    status: 'completed',
    claimRequestId: claimResult.requestId || null,
    completedAt: nowTs,
    subjectPracticeSessionId: practiceSessionId || null,
    evidence: evidence || null,
  };

  const updatedTasks = { ...state.daily.tasks, [taskId]: updatedTask };
  const updatedCompletedIds = [...state.daily.completedTaskIds, taskId];
  const updatedEffort = state.daily.effortCompleted + (task.effortTarget || 0);

  const allComplete = state.daily.taskOrder.every(id =>
    updatedTasks[id]?.status === 'completed'
  );

  return {
    ...state,
    daily: {
      ...state.daily,
      tasks: updatedTasks,
      completedTaskIds: updatedCompletedIds,
      effortCompleted: updatedEffort,
      status: allComplete ? 'completed' : 'active',
      completedAt: allComplete ? nowTs : state.daily.completedAt,
      lastUpdatedAt: nowTs,
    },
  };
}

export function pruneRecentClaims(state, nowTs) {
  if (!state?.recentClaims?.length) return state;
  const maxAge = MAX_RECENT_CLAIMS_AGE_DAYS * 24 * 60 * 60 * 1000;
  const cutoff = nowTs - maxAge;
  const pruned = state.recentClaims.filter(c => (c.createdAt || 0) > cutoff);
  if (pruned.length === state.recentClaims.length) return state;
  return { ...state, recentClaims: pruned };
}

export function markTaskStarted(state, taskId, launchRequestId, nowTs) {
  if (!state?.daily) return state;
  const task = state.daily.tasks[taskId];
  if (!task) return state;
  if (task.status === 'completed') return state; // don't regress

  return {
    ...state,
    daily: {
      ...state.daily,
      tasks: {
        ...state.daily.tasks,
        [taskId]: {
          ...task,
          status: 'started',
          launchRequestId: launchRequestId || null,
          startedAt: nowTs,
        },
      },
      firstStartedAt: state.daily.firstStartedAt || nowTs,
      lastUpdatedAt: nowTs,
    },
  };
}
