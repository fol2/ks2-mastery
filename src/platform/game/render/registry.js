// In-memory registry: kind → descriptor. Replacement is silent in production
// and routed through the dev-warn channel in dev (see composition.js).

import { warnOnce, isDevMode } from './composition.js';

const registry = new Map();

export function registerEffect(effect) {
  if (!effect || typeof effect.kind !== 'string') {
    // Defensive: never throw at registration time. A bad descriptor would
    // already have failed at defineEffect(), but if a caller hand-rolls one
    // we just refuse it.
    if (isDevMode()) {
      warnOnce('register-invalid', 'registerEffect: ignoring effect without a kind');
    }
    return;
  }
  if (registry.has(effect.kind) && isDevMode()) {
    warnOnce(
      `register-replace:${effect.kind}`,
      `registerEffect: replacing existing registration for "${effect.kind}"`,
    );
  }
  registry.set(effect.kind, effect);
}

export function lookupEffect(kind) {
  if (typeof kind !== 'string') return null;
  return registry.get(kind) || null;
}

export function resetRegistry() {
  registry.clear();
}
