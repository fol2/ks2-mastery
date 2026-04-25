#!/usr/bin/env node

import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

import { BUNDLED_EFFECT_CATALOG } from '../src/platform/game/render/effect-config-defaults.js';
import { validateEffectConfig } from '../src/platform/game/render/effect-config-schema.js';
import {
  assertOkResponse,
  configuredOrigin,
  createDemoSession,
  getJson,
} from './lib/production-smoke.mjs';

const REQUIRED_CATALOG_KINDS = Object.freeze(Object.keys(BUNDLED_EFFECT_CATALOG));

async function fetchPublishedEffectConfig(origin) {
  // The published effect config reaches the browser as a sub-document under
  // `monsterVisualConfig.config.effect` on `/api/bootstrap`. Demo session is
  // the standard production-smoke harness; we read the same payload
  // `MonsterEffectConfigContext` consumes — no separate route.
  const demo = await createDemoSession(origin);
  const result = await getJson(origin, '/api/bootstrap', { cookie: demo.cookie });
  assertOkResponse('Bootstrap', result);
  const monsterVisualConfig = result.payload?.monsterVisualConfig;
  assert.ok(monsterVisualConfig, 'Bootstrap did not include monsterVisualConfig.');
  const effect = monsterVisualConfig.config?.effect;
  assert.ok(effect && typeof effect === 'object', 'Bootstrap monsterVisualConfig did not expose an effect sub-document.');
  return effect;
}

export function collectFailures(effectConfig) {
  const failures = [];

  const validation = validateEffectConfig(effectConfig);
  if (!validation.ok) {
    for (const error of validation.errors) {
      failures.push(`validateEffectConfig: ${error.code} ${error.message}`);
    }
  }

  const catalog = effectConfig?.catalog;
  const catalogKinds = catalog && typeof catalog === 'object' ? Object.keys(catalog) : [];
  if (catalogKinds.length === 0) {
    failures.push('catalog: empty (bundled defaults failed to seed).');
  }
  for (const required of REQUIRED_CATALOG_KINDS) {
    if (!catalogKinds.includes(required)) {
      failures.push(`catalog: missing required bundled kind "${required}".`);
    }
  }

  const bindings = effectConfig?.bindings;
  const celebrationTunables = effectConfig?.celebrationTunables;
  if (bindings && typeof bindings === 'object' && celebrationTunables && typeof celebrationTunables === 'object') {
    const coveredAssets = new Set([
      ...Object.keys(bindings),
      ...Object.keys(celebrationTunables),
    ]);
    for (const assetKey of coveredAssets) {
      const bindingRow = bindings[assetKey];
      const tunableRow = celebrationTunables[assetKey];
      const persistent = Array.isArray(bindingRow?.persistent) ? bindingRow.persistent : [];
      const continuous = Array.isArray(bindingRow?.continuous) ? bindingRow.continuous : [];
      const bindingEmpty = persistent.length === 0 && continuous.length === 0;
      const tunableEmpty = !tunableRow || Object.keys(tunableRow).length === 0;
      if (bindingEmpty && tunableEmpty) {
        failures.push(`asset ${assetKey}: bindings and celebrationTunables both empty.`);
      }
    }
  }

  return failures;
}

async function main() {
  const origin = configuredOrigin();
  const effectConfig = await fetchPublishedEffectConfig(origin);
  const failures = collectFailures(effectConfig);
  if (failures.length > 0) {
    console.log(JSON.stringify({ ok: false, origin, failures }, null, 2));
    process.exit(1);
    return;
  }

  const catalogKinds = Object.keys(effectConfig.catalog).sort();
  const assetCount = new Set([
    ...Object.keys(effectConfig.bindings || {}),
    ...Object.keys(effectConfig.celebrationTunables || {}),
  ]).size;

  console.log(JSON.stringify({
    ok: true,
    origin,
    catalog_kinds: catalogKinds,
    asset_count: assetCount,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[effect-config-production-smoke] ${error?.stack || error?.message || error}`);
    process.exit(1);
  });
}
