// Hero Mode P0 — Provider registry.
//
// Maps subjectId to provider function. Only spelling, grammar, and
// punctuation have providers. Returns null for arithmetic, reasoning,
// and reading (no provider registered).

import { grammarProvider } from './grammar.js';
import { punctuationProvider } from './punctuation.js';
import { spellingProvider } from './spelling.js';

const PROVIDER_MAP = Object.freeze({
  grammar: grammarProvider,
  punctuation: punctuationProvider,
  spelling: spellingProvider,
});

/**
 * Look up a provider function for the given subjectId.
 * Returns the provider function or null if no provider is registered.
 */
function getProvider(subjectId) {
  return PROVIDER_MAP[subjectId] || null;
}

/**
 * Run a provider for the given subjectId and readModel.
 * Returns the provider result, or null if no provider is registered.
 */
export function runProvider(subjectId, readModel) {
  const provider = getProvider(subjectId);
  if (!provider) return null;
  return provider(readModel);
}

/**
 * List all registered subject IDs that have providers.
 */
export function registeredSubjectIds() {
  return Object.keys(PROVIDER_MAP);
}

export { grammarProvider } from './grammar.js';
export { punctuationProvider } from './punctuation.js';
export { spellingProvider } from './spelling.js';
