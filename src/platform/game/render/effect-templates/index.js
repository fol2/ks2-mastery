// Effect template registry: closed set of seven visual templates. Each
// template owns a `buildEffectSpec()` factory that converts a catalog entry
// into the shape `defineEffect()` accepts. Templates are pure factories —
// they are not registered themselves; the runtime calls them on the
// published catalog and feeds the result through the regular registration
// path (U3).
//
// Two templates (`particles-burst`, `shine-streak`) render via the
// JSX-bearing <CelebrationShell> component and so cannot be parsed by
// plain `node --test`. We keep them out of the static graph here and load
// them through `prepareEffectTemplates()` (an async dynamic-import gate)
// so that test files importing this index module stay Node-loadable.
// Production code paths run through the bundler, which resolves the
// dynamic imports at boot.

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
  // Filled in by prepareEffectTemplates() — kept null on Node-only paths.
  'particles-burst': null,
  'shine-streak': null,
};

let celebrationLoaded = false;

export const EFFECT_TEMPLATE_IDS = Object.freeze([
  'motion',
  'glow',
  'sparkle',
  'aura',
  'particles-burst',
  'shine-streak',
  'pulse-halo',
]);

// Bundler-aware loaders register celebration templates after the JSX-bearing
// <CelebrationShell> module has been resolved. On plain Node (tests for
// non-celebration paths) `prepareEffectTemplates` is never called, so the
// JSX modules are never parsed.
export async function prepareEffectTemplates() {
  if (celebrationLoaded) return;
  const [pb, ss] = await Promise.all([
    import('./particles-burst.js'),
    import('./shine-streak.js'),
  ]);
  TEMPLATES['particles-burst'] = pb.default;
  TEMPLATES['shine-streak'] = ss.default;
  celebrationLoaded = true;
}

// Test seam: lets SSR fixtures register pre-loaded celebration template
// modules synchronously. Mirrors the production import path closed-loop —
// after registration the rest of the registry behaves identically.
export function __registerCelebrationTemplates({ particlesBurst, shineStreak } = {}) {
  if (particlesBurst) TEMPLATES['particles-burst'] = particlesBurst;
  if (shineStreak) TEMPLATES['shine-streak'] = shineStreak;
  if (particlesBurst && shineStreak) celebrationLoaded = true;
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
