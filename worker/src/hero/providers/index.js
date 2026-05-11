// Hero Mode P0 — Provider registry.
//
// Maps subjectId to provider function for ready subjects.

import { arithmeticProvider } from './arithmetic.js';
import { grammarProvider } from './grammar.js';
import { punctuationProvider } from './punctuation.js';
import { readingProvider } from './reading.js';
import { reasoningProvider } from './reasoning.js';
import { spellingProvider } from './spelling.js';

const PROVIDER_MAP = Object.freeze({
  arithmetic: arithmeticProvider,
  grammar: grammarProvider,
  punctuation: punctuationProvider,
  reading: readingProvider,
  reasoning: reasoningProvider,
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
export { readingProvider } from './reading.js';
export { reasoningProvider } from './reasoning.js';
export { spellingProvider } from './spelling.js';
export { arithmeticProvider } from './arithmetic.js';
