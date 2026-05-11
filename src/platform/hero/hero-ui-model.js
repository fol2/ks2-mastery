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

  // First task from dailyQuest.tasks where launchStatus === 'launchable'
  const tasks = readModel?.dailyQuest?.tasks;
  const nextTask = Array.isArray(tasks)
    ? tasks.find((t) => t?.launchStatus === 'launchable') || null
    : null;

  const activeHeroSession = readModel?.activeHeroSession || null;

  const canStart = enabled && nextTask !== null && activeHeroSession === null;
  const canContinue = enabled && activeHeroSession !== null;

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
  const effortCompleted = progress?.effortCompleted || 0;
  const completedTaskIds = progress?.completedTaskIds || [];

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
