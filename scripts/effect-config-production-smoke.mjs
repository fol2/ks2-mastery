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

export const EXIT_OK = 0;
export const EXIT_VALIDATION = 1;
export const EXIT_USAGE = 2;
export const EXIT_TRANSPORT = 3;

const HELP_BANNER = `Usage: node scripts/effect-config-production-smoke.mjs [--origin <url>]

Asserts the production effect-config publish covers all bundled kinds
and is structurally valid. Reads the same /api/bootstrap payload the
browser consumes via monsterVisualConfig.config.effect.

Flags:
  --origin <url>, --url <url>   Origin to probe (default https://ks2.eugnel.uk).
  --timeout-ms <ms>             Per-request timeout (default 15000).
  --help, -h                    Show this banner.

Env vars:
  KS2_SMOKE_ORIGIN              Equivalent to --origin.
  KS2_SMOKE_TIMEOUT_MS          Equivalent to --timeout-ms.

Exit codes:
  0  ok
  1  validation failure (collectFailures non-empty)
  2  usage error (bad --origin)
  3  transport failure (fetch/bootstrap unreachable)

Output: a single JSON envelope on stdout with { ok, origin, exit_code, ... }.`;

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

function emit(envelope) {
  console.log(JSON.stringify(envelope, null, 2));
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(HELP_BANNER);
    return EXIT_OK;
  }

  let origin;
  try {
    origin = configuredOrigin();
  } catch (error) {
    emit({ ok: false, exit_code: EXIT_USAGE, failures: [error?.message || String(error)] });
    return EXIT_USAGE;
  }

  let effectConfig;
  try {
    effectConfig = await fetchPublishedEffectConfig(origin);
  } catch (error) {
    emit({ ok: false, origin, exit_code: EXIT_TRANSPORT, failures: [error?.message || String(error)] });
    return EXIT_TRANSPORT;
  }

  const failures = collectFailures(effectConfig);
  if (failures.length > 0) {
    emit({ ok: false, origin, exit_code: EXIT_VALIDATION, failures });
    return EXIT_VALIDATION;
  }

  const catalogKinds = Object.keys(effectConfig.catalog).sort();
  const assetCount = new Set([
    ...Object.keys(effectConfig.bindings || {}),
    ...Object.keys(effectConfig.celebrationTunables || {}),
  ]).size;

  emit({
    ok: true,
    origin,
    exit_code: EXIT_OK,
    catalog_kinds: catalogKinds,
    asset_count: assetCount,
  });
  return EXIT_OK;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      // Fallback: any uncaught path still emits a JSON envelope on stdout
      // before exiting, so callers parsing stdout do not have to special-case
      // the unknown-failure mode.
      emit({ ok: false, exit_code: EXIT_TRANSPORT, failures: [error?.message || String(error)] });
      process.exit(EXIT_TRANSPORT);
    });
}
