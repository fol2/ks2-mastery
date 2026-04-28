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
  const pendingCompletedHeroSession = readModel?.pendingCompletedHeroSession || null;
  const canClaim = readModel?.claim?.enabled === true;
  const dailyStatus = progress?.status || 'none';
  const effortCompleted = progress?.effortCompleted || 0;
  const completedTaskIds = progress?.completedTaskIds || [];

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
  };
}
