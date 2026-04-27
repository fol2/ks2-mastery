// U4 review follower: pure guard function extracted from AdminHubSurface's
// handleTabChange. Decides whether a tab switch should be blocked before the
// UI-layer confirm() dialog runs. Keeping this separate lets us unit-test
// the decision logic without a DOM or SSR harness.

/**
 * @param {object} dirtyRegistry — an object with `anyDirty()` (returns boolean)
 * @param {string} nextSection   — the section key the user wants to navigate to
 * @param {string} currentSection — the currently active section key
 * @returns {{ blocked: boolean, reason?: string }}
 */
export function shouldBlockSectionChange(dirtyRegistry, nextSection, currentSection) {
  if (nextSection === currentSection) return { blocked: true, reason: 'same-section' };
  if (dirtyRegistry.anyDirty()) return { blocked: true, reason: 'dirty-rows' };
  return { blocked: false };
}
