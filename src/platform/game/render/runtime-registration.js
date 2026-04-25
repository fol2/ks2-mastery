// Hybrid runtime registry bootstrap (U3).
//
// At app boot (or on config change), reset the registry, register the
// bundled defaults FIRST as fallback, then iterate the published catalog
// and re-register through templates → defineEffect() → registerEffect().
// Config wins on `kind` collision (admin intent is authoritative). When the
// caller passes no catalog, only the bundled defaults register — the
// fallback case origin R23 of the visual config brainstorm requires.

import { defineEffect } from './define-effect.js';
import { registerEffect, resetRegistry } from './registry.js';
import { resetWarnOnce, warnOnce } from './composition.js';
import { applyTemplate } from './effect-templates/index.js';
import { BUNDLED_EFFECT_CATALOG } from './effect-config-defaults.js';
import { validateEffectCatalogEntry } from './effect-config-schema.js';

function registerCatalogEntry(entry) {
  const spec = applyTemplate(entry);
  if (!spec) return false;
  try {
    registerEffect(defineEffect(spec));
    return true;
  } catch (err) {
    warnOnce(
      `runtime-registration:defineEffect-threw:${entry?.kind || 'unknown'}`,
      `runtimeRegistration: defineEffect threw for kind "${entry?.kind || 'unknown'}": ${err?.message || err}`,
    );
    return false;
  }
}

export function runtimeRegistration({ catalog } = {}) {
  resetRegistry();
  resetWarnOnce();

  // 1. Bundled defaults register first so a partial / missing remote config
  // never blanks the screen. This is the production-safe fallback path.
  for (const entry of Object.values(BUNDLED_EFFECT_CATALOG)) {
    registerCatalogEntry(entry);
  }

  // 2. Published catalog overlays the defaults. Config wins on `kind`
  // collision because admin-published intent is authoritative.
  if (catalog && typeof catalog === 'object') {
    for (const entry of Object.values(catalog)) {
      const validation = validateEffectCatalogEntry(entry);
      if (!validation.ok) {
        const issue = validation.errors[0];
        warnOnce(
          `runtime-registration:invalid-entry:${entry?.kind || 'unknown'}:${issue?.code || 'unknown'}`,
          `runtimeRegistration: skipping invalid catalog entry "${entry?.kind || 'unknown'}": ${issue?.message || 'malformed'}`,
        );
        continue;
      }
      registerCatalogEntry(entry);
    }
  }
}
