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
  const eligibleSubjects = readModel?.eligibleSubjects || [];

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
    lastLaunch,
  };
}
