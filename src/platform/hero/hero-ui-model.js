/**
 * buildHeroHomeModel — derives a child-safe view model from raw heroUi state.
 *
 * Extracted from src/main.js so both the runtime and tests can consume it
 * without coupling to the full app shell.
 *
 * The `enabled` field uses a DUAL CHECK per origin §6:
 *   readModel.ui.enabled === true AND readModel.childVisible === true.
 * Both must be true — not just `ui.enabled`.
 */

/**
 * @param {object} heroUi — the raw `appState.heroUi` block
 * @returns {object} normalised hero home model
 */
export function buildHeroHomeModel(heroUi) {
  const status = heroUi?.status || 'idle';
  const readModel = heroUi?.readModel || null;
  const error = heroUi?.error || '';
  const lastLaunch = heroUi?.lastLaunch || null;

  // Dual check (origin §6): both ui.enabled AND childVisible must be true.
  const uiEnabled = readModel?.ui?.enabled === true;
  const childVisible = readModel?.childVisible === true;
  const enabled = uiEnabled && childVisible;

  const activeHeroSession = readModel?.activeHeroSession || null;

  const effortPlanned = readModel?.dailyQuest?.effortPlanned || 0;
  const eligibleSubjects = (readModel?.eligibleSubjects || []).map(e => typeof e === 'string' ? e : e?.subjectId || '').filter(Boolean);
  const lockedSubjects = (readModel?.lockedSubjects || []).map(e => typeof e === 'string' ? e : e?.subjectId || '').filter(Boolean);

  // P3 U10: progress and claim state derivation.
  const progress = readModel?.progress || null;
  const claiming = heroUi?.status === 'claiming';
  const lastClaim = heroUi?.lastClaim || null;
  const lastClaimMatchesReadModel = (
    lastClaim !== null
    && typeof lastClaim.questId === 'string'
    && lastClaim.questId === readModel?.dailyQuest?.questId
    && typeof lastClaim.questFingerprint === 'string'
    && lastClaim.questFingerprint === readModel?.questFingerprint
    && typeof lastClaim.dateKey === 'string'
    && lastClaim.dateKey === readModel?.dateKey
  );
  const lastClaimMarksTaskComplete = (
    lastClaimMatchesReadModel
    && typeof lastClaim?.taskId === 'string'
    && (lastClaim.status === 'claimed' || lastClaim.status === 'already-completed')
  );
  const readModelCompletedTaskIds = Array.isArray(progress?.completedTaskIds)
    ? progress.completedTaskIds
    : [];
  const completedTaskIds = lastClaimMarksTaskComplete && !readModelCompletedTaskIds.includes(lastClaim.taskId)
    ? [...readModelCompletedTaskIds, lastClaim.taskId]
    : readModelCompletedTaskIds;
  const completedTaskIdSet = new Set(completedTaskIds);

  // The next CTA must not loop back to a task that was already completed,
  // is waiting for a claim, or is still active. `launchStatus` describes
  // subject availability, while `completionStatus` describes daily progress.
  const tasks = readModel?.dailyQuest?.tasks;
  const startableNextTask = Array.isArray(tasks)
    ? tasks.find((t) => isStartableHeroTask(t, { completedTaskIds: completedTaskIdSet, activeHeroSession })) || null
    : null;

  const readModelHasClaimCompletion = progress?.status === 'completed';
  const readModelHasAwardSnapshot = readModel?.economy?.today?.awardStatus === 'awarded';
  const lastClaimCompletedDaily = (
    lastClaimMatchesReadModel
    && (lastClaim?.status === 'claimed' || lastClaim?.status === 'already-completed')
    && (
      lastClaim?.dailyStatus === 'completed'
      || (lastClaim?.status === 'already-completed' && lastClaim?.dailyCoinsAlreadyAwarded === true)
    )
  );
  const shouldProjectClaimCompletion = lastClaimCompletedDaily && !readModelHasClaimCompletion;
  const shouldProjectClaimEconomy = lastClaimCompletedDaily && !readModelHasClaimCompletion && !readModelHasAwardSnapshot;
  const pendingCompletedHeroSession = readModel?.pendingCompletedHeroSession || null;
  const canClaim = readModel?.claim?.enabled === true;
  const dailyStatus = shouldProjectClaimCompletion ? 'completed' : (progress?.status || 'none');
  const nextTask = dailyStatus === 'completed' ? null : startableNextTask;
  const readModelEffortCompleted = typeof progress?.effortCompleted === 'number' ? progress.effortCompleted : 0;
  const claimEffortCompleted = lastClaimMatchesReadModel && typeof lastClaim?.effortCompleted === 'number'
    ? lastClaim.effortCompleted
    : null;
  const effortCompleted = claimEffortCompleted !== null
    ? Math.max(readModelEffortCompleted, claimEffortCompleted)
    : readModelEffortCompleted;

  const canStart = enabled && nextTask !== null && activeHeroSession === null && dailyStatus !== 'completed' && !claiming;
  const canContinue = enabled && activeHeroSession !== null;

  // P4 U6: Economy fields from read model v5
  const economyBlock = readModel?.economy || null;
  const hasClaimEconomy = shouldProjectClaimEconomy && lastClaim?.coinsEnabled === true;
  const coinsEnabled = readModel?.coinsEnabled === true || hasClaimEconomy;
  const readModelCoinBalance = economyBlock?.balance;
  const claimCoinBalance = lastClaim?.coinBalance;
  const coinBalance = coinsEnabled
    ? (hasClaimEconomy && typeof claimCoinBalance === 'number'
      ? claimCoinBalance
      : (typeof readModelCoinBalance === 'number' ? readModelCoinBalance : 0))
    : 0;
  const readModelCoinsAwardedToday = economyBlock?.today?.coinsAwarded;
  const claimCoinsAwarded = lastClaim?.coinsAwarded;
  const coinsAwardedToday = coinsEnabled
    ? (hasClaimEconomy && typeof claimCoinsAwarded === 'number'
      ? claimCoinsAwarded
      : (typeof readModelCoinsAwardedToday === 'number' ? readModelCoinsAwardedToday : 0))
    : 0;
  const readModelAwardStatus = economyBlock?.today?.awardStatus;
  const claimAwardStatus = hasClaimEconomy && (coinsAwardedToday > 0 || lastClaim?.dailyCoinsAlreadyAwarded === true)
    ? 'awarded'
    : null;
  const dailyAwardStatus = claimAwardStatus || readModelAwardStatus || 'not-eligible';
  const showCoinsAwarded = coinsEnabled && dailyAwardStatus === 'awarded' && coinsAwardedToday > 0;
  const showCoinBalance = coinsEnabled;
  const campEnabled = readModel?.camp?.enabled === true;

  return {
    status,
    enabled,
    nextTask,
    activeHeroSession,
    canStart,
    canContinue,
    error,
    effortPlanned,
    eligibleSubjects,
    lockedSubjects,
    lastLaunch,
    // P3 U10: progress and claim fields
    progress,
    claiming,
    lastClaim,
    pendingCompletedHeroSession,
    canClaim,
    dailyStatus,
    effortCompleted,
    completedTaskIds,
    // P4 U6: economy
    coinsEnabled,
    coinBalance,
    coinsAwardedToday,
    dailyAwardStatus,
    showCoinsAwarded,
    showCoinBalance,
    campEnabled,
  };
}

function isStartableHeroTask(task, { completedTaskIds, activeHeroSession } = {}) {
  if (!task || task.launchStatus !== 'launchable') return false;
  const taskId = typeof task.taskId === 'string' && task.taskId ? task.taskId : null;
  if (taskId && completedTaskIds?.has?.(taskId)) return false;
  if (taskId && activeHeroSession?.taskId === taskId) return false;

  const completionStatus = task.completionStatus || 'not-started';
  if (
    completionStatus === 'completed'
    || completionStatus === 'completed-unclaimed'
    || completionStatus === 'in-progress'
    || completionStatus === 'blocked'
  ) {
    return false;
  }

  return true;
}
