// Effect template registry: closed set of seven visual templates. Each
// template owns a `buildEffectSpec()` factory that converts a catalog entry
// into the shape `defineEffect()` accepts. Templates are pure factories —
// they are not registered themselves; the runtime calls them on the
// published catalog and feeds the result through the regular registration
// path (U3).
//
// Two templates (`particles-burst`, `shine-streak`) render via the
// JSX-bearing <CelebrationShell> component and so cannot be parsed by
// plain `node --test`. We keep them out of the static graph here and the
// production bootstrap (App.jsx) feeds their default exports in via
// `__registerCelebrationTemplates` so test files importing this index
// module stay Node-loadable.

import motion from './motion.js';
import sparkle from './sparkle.js';
import glow from './glow.js';
import aura from './aura.js';
import pulseHalo from './pulse-halo.js';
import { warnOnce } from '../composition.js';

const TEMPLATES = {
  motion,
  sparkle,
  glow,
  aura,
  'pulse-halo': pulseHalo,
  // Filled in by `__registerCelebrationTemplates` — kept null on Node-only
  // paths so the JSX-bearing modules are never parsed by the test runner.
  'particles-burst': null,
  'shine-streak': null,
};

export const EFFECT_TEMPLATE_IDS = Object.freeze([
  'motion',
  'glow',
  'sparkle',
  'aura',
  'particles-burst',
  'shine-streak',
  'pulse-halo',
]);

// Test/bootstrap seam: lets the production entry point and SSR fixtures
// register pre-loaded celebration template modules synchronously. Naming
// keeps the `__` prefix as a flag that callers must own the import edge
// (the bundler then resolves the JSX cleanly).
export function __registerCelebrationTemplates({ particlesBurst, shineStreak } = {}) {
  if (particlesBurst) TEMPLATES['particles-burst'] = particlesBurst;
  if (shineStreak) TEMPLATES['shine-streak'] = shineStreak;
}

export function lookupTemplate(id) {
  if (typeof id !== 'string' || id.length === 0) return null;
  return TEMPLATES[id] || null;
}

// Convenience: resolve a catalog entry to a ready-for-defineEffect spec.
// Returns `null` (with a dev-warn) for malformed entries so the runtime
// registration path can drop and continue rather than blanking the screen.
export function applyTemplate(catalogEntry) {
  if (!catalogEntry || typeof catalogEntry !== 'object') {
    warnOnce('apply-template:missing-entry', 'applyTemplate: missing or invalid catalog entry');
    return null;
  }
  const template = lookupTemplate(catalogEntry.template);
  if (!template) {
    warnOnce(
      `apply-template:unknown-template:${catalogEntry.template}`,
      `applyTemplate: unknown template "${catalogEntry.template}" for kind "${catalogEntry.kind}"`,
    );
    return null;
  }
  return template.buildEffectSpec(catalogEntry);
}
