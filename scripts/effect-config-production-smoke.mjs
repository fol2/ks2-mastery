#!/usr/bin/env node

import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

import { BUNDLED_EFFECT_CATALOG } from '../src/platform/game/render/effect-config-defaults.js';
import { validateEffectConfig } from '../src/platform/game/render/effect-config-schema.js';
import {
  argValue,
  createDemoSession,
  loadBootstrap,
} from './lib/production-smoke.mjs';

const DEFAULT_ENV = 'prod';
const ENV_DEFAULT_ORIGINS = Object.freeze({
  prod: 'https://ks2.eugnel.uk',
  preview: 'https://ks2.eugnel.uk',
  local: 'http://127.0.0.1:8787',
});
const REQUIRED_CATALOG_KINDS = Object.freeze(Object.keys(BUNDLED_EFFECT_CATALOG));
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 500;

function equalsValue(...names) {
  for (const name of names) {
    const prefix = `${name}=`;
    const hit = process.argv.find((arg) => arg.startsWith(prefix));
    if (hit) return hit.slice(prefix.length);
  }
  return '';
}

function flagValue(...names) {
  return argValue(...names) || equalsValue(...names);
}

function envFlag() {
  const value = String(flagValue('--env') || process.env.KS2_SMOKE_ENV || DEFAULT_ENV).trim().toLowerCase();
  return ENV_DEFAULT_ORIGINS[value] ? value : DEFAULT_ENV;
}

function verboseFlag() {
  return process.argv.includes('--verbose') || process.env.KS2_SMOKE_VERBOSE === '1';
}

function originOverride() {
  return flagValue('--url', '--origin');
}

function trace(verbose, ...args) {
  if (verbose) console.error('[effect-config-smoke]', ...args);
}

async function delay(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function fetchPublishedEffectConfig({ origin, verbose }) {
  // The published effect config reaches the browser as a sub-document under
  // `monsterVisualConfig.config.effect` on `/api/bootstrap`. We stand up a
  // demo session first because bootstrap requires an authenticated session
  // (the demo cookie is the standard production-smoke harness) and read the
  // same payload `MonsterEffectConfigContext` consumes — no separate route.
  const lastErrors = [];
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const demo = await createDemoSession(origin);
      const bootstrap = await loadBootstrap(origin, demo.cookie, { expectedSession: demo.session });
      const monsterVisualConfig = bootstrap.payload?.monsterVisualConfig;
      assert.ok(monsterVisualConfig, 'Bootstrap did not include monsterVisualConfig.');
      const effect = monsterVisualConfig.config?.effect;
      assert.ok(effect && typeof effect === 'object', 'Bootstrap monsterVisualConfig did not expose an effect sub-document.');
      return effect;
    } catch (error) {
      const message = error?.message || String(error);
      const status = Number(message.match(/with (\d{3})/)?.[1] || 0);
      const transient = !status || status >= 500;
      lastErrors.push(`attempt ${attempt}: ${message}`);
      trace(verbose, `attempt ${attempt} failed (transient=${transient}): ${message}`);
      if (!transient || attempt === MAX_RETRIES) break;
      await delay(BACKOFF_BASE_MS * 2 ** (attempt - 1));
    }
  }
  throw new Error(`Effect config fetch failed after ${MAX_RETRIES} attempts: ${lastErrors.join(' | ')}`);
}

function collectFailures(effectConfig) {
  const failures = [];

  const catalog = effectConfig?.catalog;
  const bindings = effectConfig?.bindings;
  const celebrationTunables = effectConfig?.celebrationTunables;

  if (!catalog || typeof catalog !== 'object') {
    failures.push('catalog: missing or not an object.');
  } else {
    const kinds = Object.keys(catalog);
    if (kinds.length === 0) {
      failures.push('catalog: empty (bundled defaults failed to seed).');
    }
    for (const required of REQUIRED_CATALOG_KINDS) {
      if (!kinds.includes(required)) {
        failures.push(`catalog: missing required bundled kind "${required}".`);
      }
    }
  }

  if (!bindings || typeof bindings !== 'object') {
    failures.push('bindings: missing or not an object.');
  }
  if (!celebrationTunables || typeof celebrationTunables !== 'object') {
    failures.push('celebrationTunables: missing or not an object.');
  }

  if (bindings && celebrationTunables) {
    const coveredAssets = new Set([
      ...Object.keys(bindings || {}),
      ...Object.keys(celebrationTunables || {}),
    ]);
    for (const assetKey of coveredAssets) {
      const bindingRow = bindings[assetKey];
      const tunableRow = celebrationTunables[assetKey];
      const bindingEmpty = !bindingRow
        || (Array.isArray(bindingRow.persistent) && bindingRow.persistent.length === 0
          && Array.isArray(bindingRow.continuous) && bindingRow.continuous.length === 0);
      const tunableEmpty = !tunableRow || Object.keys(tunableRow).length === 0;
      if (bindingEmpty && tunableEmpty) {
        failures.push(`asset ${assetKey}: bindings and celebrationTunables both empty.`);
      }
    }
  }

  const validation = validateEffectConfig(effectConfig);
  if (!validation.ok) {
    for (const error of validation.errors) {
      failures.push(`validateEffectConfig: ${error.code} ${error.message}`);
    }
  }

  return failures;
}

async function main() {
  const env = envFlag();
  const verbose = verboseFlag();
  const override = originOverride();
  const baseOrigin = override || process.env.KS2_SMOKE_ORIGIN || ENV_DEFAULT_ORIGINS[env];
  const normalised = /^https?:\/\//i.test(baseOrigin) ? baseOrigin : `https://${baseOrigin}`;
  const origin = new URL(normalised).origin;
  trace(verbose, `env=${env} origin=${origin}`);

  let effectConfig;
  try {
    effectConfig = await fetchPublishedEffectConfig({ origin, verbose });
  } catch (error) {
    console.log(JSON.stringify({ ok: false, origin, env, failures: [error?.message || String(error)] }, null, 2));
    process.exit(1);
    return;
  }

  const failures = collectFailures(effectConfig);
  if (failures.length > 0) {
    console.log(JSON.stringify({ ok: false, origin, env, failures }, null, 2));
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
    env,
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
