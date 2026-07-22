const GAMEPLAY_WORKING_SET_MODE = Symbol('ks2.gameplayWorkingSetMode');

/**
 * Attach request-local storage provenance without adding anything to learner
 * JSON or command responses. `legacy` is used only during the code-first
 * compatibility window before migration 0023 exists.
 */
export function markGameplayWorkingSet(value, mode) {
  if (!value || typeof value !== 'object') return value;
  Object.defineProperty(value, GAMEPLAY_WORKING_SET_MODE, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: mode === 'legacy' ? 'legacy' : 'bounded',
  });
  return value;
}

export function isLegacyGameplayWorkingSet(value) {
  return value?.[GAMEPLAY_WORKING_SET_MODE] === 'legacy';
}
