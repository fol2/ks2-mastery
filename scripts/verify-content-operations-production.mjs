#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  createDemoSession,
  DEFAULT_PRODUCTION_ORIGIN,
  DEFAULT_SMOKE_TIMEOUT_MS,
  loadBootstrap,
} from './lib/production-smoke.mjs';

export const EXIT_OK = 0;
export const EXIT_VALIDATION = 1;
export const EXIT_USAGE = 2;
export const EXIT_TRANSPORT = 3;

const DEFAULT_SURFACES = Object.freeze([
  'spellingSetup',
  'wordBank',
  'heroCodex',
  'monsterRendering',
]);

const SURFACE_ALIASES = new Map([
  ['spellingsetup', 'spellingSetup'],
  ['setup', 'spellingSetup'],
  ['wordbank', 'wordBank'],
  ['hero', 'heroCodex'],
  ['codex', 'heroCodex'],
  ['herocodex', 'heroCodex'],
  ['monster', 'monsterRendering'],
  ['monsters', 'monsterRendering'],
  ['monsterrendering', 'monsterRendering'],
]);

const HELP_BANNER = [
  'Usage: node ./scripts/verify-content-operations-production.mjs [options]',
  '',
  'Verifies Content Operations release metadata and learner-facing runtime',
  'surfaces, optionally capturing the proof into Release History.',
  '',
  'Authentication:',
  '  Provide --cookie/KS2_CONTENT_OPS_ADMIN_COOKIE, or set',
  '  KS2_SMOKE_ACCOUNT_EMAIL + KS2_SMOKE_ACCOUNT_PASSWORD for login.',
  '',
  'Options:',
  '  --origin <url>, --url <url>       Origin to verify (default https://ks2.eugnel.uk).',
  '  --release-id <id>                 Release to verify (default latest release).',
  '  --capture-proof                   POST proof to the release history endpoint.',
  '  --out <path>, --output <path>      Persist evidence JSON; required with --capture-proof.',
  '  --audio-proof <path>               Include spelling audio proof evidence in the Word Bank surface.',
  '  --surfaces <csv>                  Surfaces to verify/capture (default all four).',
  '  --cookie <cookie>                 Admin ks2_session cookie.',
  '  --timeout-ms <ms>                 Per-request timeout (default 15000).',
  '  --allow-insecure-origin           Permit http:// for local manual verification only.',
  '  --json                            Emit machine-readable JSON only.',
  '  --help, -h                        Show this banner.',
  '',
  'Exit codes:',
  '  0  verification passed',
  '  1  validation failure',
  '  2  usage error',
  '  3  transport failure',
].join('\n');

class VerificationError extends Error {
  constructor(message, kind = 'validation', details = {}) {
    super(message);
    this.kind = kind;
    this.details = details;
  }
}

function usageError(message, details) {
  return new VerificationError(message, 'usage', details);
}

function validationError(message, details) {
  return new VerificationError(message, 'validation', details);
}

function transportError(message, details) {
  return new VerificationError(message, 'transport', details);
}

function classifyExitCode(error) {
  if (error?.kind === 'usage') return EXIT_USAGE;
  if (error?.kind === 'validation' || error?.name === 'AssertionError') return EXIT_VALIDATION;
  return EXIT_TRANSPORT;
}

function readOptionValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (value == null || value.startsWith('--')) {
    throw new Error(`${optionName} requires a value.`);
  }
  return value;
}

function splitCsv(raw) {
  return String(raw || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normaliseSurface(raw) {
  const comparable = String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return SURFACE_ALIASES.get(comparable) || '';
}

function normaliseSurfaces(raw) {
  const values = splitCsv(raw);
  if (!values.length) return DEFAULT_SURFACES.slice();
  const surfaces = [];
  for (const value of values) {
    const key = normaliseSurface(value);
    if (!key) throw new Error(`Unknown production proof surface: ${value}`);
    if (!surfaces.includes(key)) surfaces.push(key);
  }
  return surfaces;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    origin: '',
    releaseId: '',
    captureProof: false,
    outPath: '',
    audioProofPath: '',
    surfaces: DEFAULT_SURFACES.slice(),
    cookie: '',
    timeoutMs: DEFAULT_SMOKE_TIMEOUT_MS,
    allowInsecureOrigin: false,
    json: false,
    help: false,
  };
  const assigned = new Set();
  const assignOnce = (flag) => {
    if (assigned.has(flag)) {
      throw new Error(`${flag} specified more than once; refusing to let later value silently override the earlier one.`);
    }
    assigned.add(flag);
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--origin' || arg === '--url' || arg === '--base-url') {
      assignOnce('--origin');
      options.origin = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg.startsWith('--origin=')) {
      assignOnce('--origin');
      options.origin = arg.slice('--origin='.length);
    } else if (arg.startsWith('--url=')) {
      assignOnce('--origin');
      options.origin = arg.slice('--url='.length);
    } else if (arg === '--release-id') {
      assignOnce(arg);
      options.releaseId = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg.startsWith('--release-id=')) {
      assignOnce('--release-id');
      options.releaseId = arg.slice('--release-id='.length);
    } else if (arg === '--capture-proof') {
      options.captureProof = true;
    } else if (arg === '--out' || arg === '--output') {
      assignOnce('--out');
      options.outPath = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg.startsWith('--out=')) {
      assignOnce('--out');
      options.outPath = arg.slice('--out='.length);
    } else if (arg.startsWith('--output=')) {
      assignOnce('--out');
      options.outPath = arg.slice('--output='.length);
    } else if (arg === '--audio-proof' || arg === '--audio-evidence') {
      assignOnce('--audio-proof');
      options.audioProofPath = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg.startsWith('--audio-proof=')) {
      assignOnce('--audio-proof');
      options.audioProofPath = arg.slice('--audio-proof='.length);
    } else if (arg.startsWith('--audio-evidence=')) {
      assignOnce('--audio-proof');
      options.audioProofPath = arg.slice('--audio-evidence='.length);
    } else if (arg === '--surfaces' || arg === '--surface') {
      assignOnce('--surfaces');
      options.surfaces = normaliseSurfaces(readOptionValue(argv, index, arg));
      index += 1;
    } else if (arg.startsWith('--surfaces=')) {
      assignOnce('--surfaces');
      options.surfaces = normaliseSurfaces(arg.slice('--surfaces='.length));
    } else if (arg === '--cookie') {
      assignOnce(arg);
      options.cookie = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg.startsWith('--cookie=')) {
      assignOnce('--cookie');
      options.cookie = arg.slice('--cookie='.length);
    } else if (arg === '--timeout-ms') {
      assignOnce(arg);
      const timeoutMs = Number(readOptionValue(argv, index, arg));
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new Error('--timeout-ms requires a positive number of milliseconds.');
      }
      options.timeoutMs = timeoutMs;
      index += 1;
    } else if (arg.startsWith('--timeout-ms=')) {
      assignOnce('--timeout-ms');
      const timeoutMs = Number(arg.slice('--timeout-ms='.length));
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new Error('--timeout-ms requires a positive number of milliseconds.');
      }
      options.timeoutMs = timeoutMs;
    } else if (arg === '--allow-insecure-origin') {
      options.allowInsecureOrigin = true;
    } else if (arg === '--json') {
      options.json = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function configuredOrigin(options = {}, env = process.env) {
  const raw = options.origin || env.KS2_SMOKE_ORIGIN || env.KS2_SMOKE_BASE_URL || DEFAULT_PRODUCTION_ORIGIN;
  const value = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw usageError(`Origin is not a valid URL: ${raw}`, { error: error?.message || String(error) });
  }
  if (parsed.protocol !== 'https:' && !options.allowInsecureOrigin) {
    throw usageError(`Content Operations production verification requires https:// unless --allow-insecure-origin is set (got ${parsed.protocol}//${parsed.host}).`);
  }
  return parsed.origin;
}

function normaliseCookie(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (value.includes('=')) return value.split(';').map((part) => part.trim()).filter(Boolean).join('; ');
  return `ks2_session=${value}`;
}

function timeoutSignal(timeoutMs) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  return controller.signal;
}

function sameOriginHeaders(origin, cookie = '', extra = {}) {
  return {
    accept: 'application/json',
    origin,
    referer: `${origin}/`,
    'sec-fetch-site': 'same-origin',
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty',
    ...(cookie ? { cookie } : {}),
    ...extra,
  };
}

function getSetCookies(response) {
  const values = response.headers.getSetCookie?.();
  if (Array.isArray(values) && values.length) return values;
  return String(response.headers.get('set-cookie') || '')
    .split(/,\s*(?=ks2_)/)
    .filter(Boolean);
}

function sessionCookieFrom(response) {
  return getSetCookies(response)
    .map((cookie) => String(cookie || '').split(';')[0])
    .find((cookie) => cookie.startsWith('ks2_session=')) || '';
}

async function readJsonSafe(response) {
  const text = await response.text().catch(() => '');
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { rawBody: text };
  }
}

async function apiRequest({
  origin,
  path,
  method = 'GET',
  cookie = '',
  body = null,
  timeoutMs = DEFAULT_SMOKE_TIMEOUT_MS,
  label = path,
}) {
  let response;
  const started = Date.now();
  try {
    response = await globalThis.fetch(new URL(path, origin), {
      method,
      headers: sameOriginHeaders(origin, cookie, body ? { 'content-type': 'application/json' } : {}),
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: timeoutSignal(timeoutMs),
    });
  } catch (error) {
    throw transportError(`${label} failed or timed out after ${timeoutMs}ms: ${error?.message || error}`, { path });
  }
  const payload = await readJsonSafe(response);
  return {
    response,
    payload,
    status: response.status,
    ok: response.ok && payload?.ok !== false,
    wallMs: Date.now() - started,
  };
}

function assertOk(label, result) {
  if (result.response.ok && result.payload?.ok !== false) return;
  const message = `${label} failed with HTTP ${result.response.status}: ${JSON.stringify(result.payload)}`;
  if (result.response.status >= 500) throw transportError(message, { label, status: result.response.status });
  throw validationError(message, { label, status: result.response.status });
}

function credentialsFromEnv(env = process.env) {
  const email = String(env.KS2_SMOKE_ACCOUNT_EMAIL || '').trim();
  const password = String(env.KS2_SMOKE_ACCOUNT_PASSWORD || '');
  if (!email || !password) return null;
  return { email, password };
}

async function resolveAdminAuth({ origin, options = {}, env = process.env }) {
  const directCookie = normaliseCookie(
    options.cookie
      || env.KS2_CONTENT_OPS_ADMIN_COOKIE
      || env.KS2_SMOKE_ADMIN_COOKIE
      || '',
  );
  if (directCookie) {
    return { cookie: directCookie, mode: 'cookie', accountId: null };
  }

  const credentials = credentialsFromEnv(env);
  if (!credentials) {
    throw usageError(
      'Admin authentication is required. Set KS2_CONTENT_OPS_ADMIN_COOKIE or KS2_SMOKE_ACCOUNT_EMAIL and KS2_SMOKE_ACCOUNT_PASSWORD.',
    );
  }
  const login = await apiRequest({
    origin,
    path: '/api/auth/login',
    method: 'POST',
    body: { email: credentials.email, password: credentials.password },
    timeoutMs: options.timeoutMs,
    label: 'Admin login',
  });
  assertOk('Admin login', login);
  const cookie = sessionCookieFrom(login.response);
  if (!cookie) {
    throw validationError('Admin login did not return a ks2_session cookie.');
  }
  return {
    cookie,
    mode: 'login',
    accountId: login.payload?.session?.accountId || login.payload?.account?.id || null,
  };
}

function releaseIdFromPayload({ releaseList, overview, requestedReleaseId }) {
  if (requestedReleaseId) return requestedReleaseId;
  const releases = Array.isArray(releaseList?.releases) ? releaseList.releases : [];
  return releases[0]?.releaseId || overview?.overview?.latestRelease?.releaseId || '';
}

function flattenWordBankRows(wordBank = {}) {
  const groups = Array.isArray(wordBank.analytics?.wordGroups) ? wordBank.analytics.wordGroups : [];
  return groups.flatMap((group) => Array.isArray(group.words) ? group.words : []);
}

function runtimeAssetReferencesFrom(monsterVisualConfig = {}) {
  const candidates = [
    monsterVisualConfig?.runtimeAssetReferences,
    monsterVisualConfig?.config?.runtimeAssetReferences,
  ];
  return candidates.find((references) => references && typeof references === 'object' && !Array.isArray(references)) || null;
}

function monsterAssetReferenceCount(monsterVisualConfig = {}) {
  const references = runtimeAssetReferencesFrom(monsterVisualConfig);
  const byAssetKey = references?.byAssetKey;
  if (!byAssetKey || typeof byAssetKey !== 'object' || Array.isArray(byAssetKey)) return 0;
  return Object.keys(byAssetKey).length;
}

async function loadAudioProofEvidence(audioProofPath = '') {
  if (!audioProofPath) return null;
  const absolute = resolve(audioProofPath);
  let payload;
  try {
    payload = JSON.parse(await readFile(absolute, 'utf8'));
  } catch (error) {
    throw usageError(`Unable to read spelling audio proof evidence: ${audioProofPath}`, {
      error: error?.message || String(error),
    });
  }
  if (payload?.proofType !== 'spelling-audio-production') {
    throw validationError('Spelling audio proof evidence is not a spelling-audio-production report.', {
      audioProofPath: absolute,
      proofType: payload?.proofType || null,
    });
  }
  if (payload.ok !== true) {
    throw validationError('Spelling audio proof evidence did not pass.', {
      audioProofPath: absolute,
    });
  }
  const wordBankProof = payload.productionProof?.surfaces?.wordBank || {};
  return {
    path: absolute,
    generatedAt: payload.generatedAt || null,
    origin: payload.origin || null,
    probes: wordBankProof.probes || null,
    crossAccount: wordBankProof.crossAccount || null,
  };
}

function buildSurfaceProofs({
  origin,
  release,
  releaseDetail,
  contentExport,
  bootstrap,
  wordBank,
  heroReadModel,
  audioProof,
  evidencePath,
  requestedSurfaces,
}) {
  const checkedAt = new Date().toISOString();
  const surfaces = {};
  const wordRows = flattenWordBankRows(wordBank.payload?.wordBank || {});
  const monsterVisualConfig = bootstrap.payload?.monsterVisualConfig || {};
  const runtimeAssetReferences = runtimeAssetReferencesFrom(monsterVisualConfig);
  const base = {
    origin,
    releaseId: release.releaseId,
    snapshotHash: release.snapshotHash || '',
    evidencePath: evidencePath || null,
    checkedAt,
  };

  if (requestedSurfaces.includes('spellingSetup')) {
    surfaces.spellingSetup = {
      ...base,
      ok: true,
      checks: {
        contentExportSource: contentExport.payload?.compatibility?.source || '',
        contentExportReleaseId: contentExport.payload?.compatibility?.releaseId || '',
        contentExportSnapshotHash: contentExport.payload?.compatibility?.snapshotHash || '',
        bootstrapHasSpelling: Boolean(bootstrap.payload?.subjects?.spelling),
        spellingGate: bootstrap.payload?.subjectExposureGates?.spelling !== false,
      },
    };
  }
  if (requestedSurfaces.includes('wordBank')) {
    surfaces.wordBank = {
      ...base,
      ok: true,
      checks: {
        learnerId: bootstrap.learnerId,
        returnedRows: Number(wordBank.payload?.wordBank?.analytics?.wordBank?.returnedRows ?? wordRows.length) || 0,
        sampledSlugs: wordRows.slice(0, 5).map((row) => row.slug).filter(Boolean),
        audioProof: audioProof ? {
          evidencePath: audioProof.path,
          generatedAt: audioProof.generatedAt,
          origin: audioProof.origin,
          probes: audioProof.probes,
          crossAccount: audioProof.crossAccount,
        } : null,
      },
    };
  }
  if (requestedSurfaces.includes('heroCodex')) {
    surfaces.heroCodex = {
      ...base,
      ok: true,
      checks: {
        learnerId: bootstrap.learnerId,
        mode: heroReadModel.payload?.hero?.mode || '',
        version: heroReadModel.payload?.hero?.version ?? null,
        childVisible: Boolean(heroReadModel.payload?.hero?.childVisible),
      },
    };
  }
  if (requestedSurfaces.includes('monsterRendering')) {
    surfaces.monsterRendering = {
      ...base,
      ok: true,
      checks: {
        publishedVersion: monsterVisualConfig.publishedVersion ?? null,
        compact: Boolean(monsterVisualConfig.compact),
        hasRuntimeConfig: Boolean(monsterVisualConfig.config || runtimeAssetReferences),
        runtimeAssetReferenceCount: monsterAssetReferenceCount(monsterVisualConfig),
        releaseAssetReferenceCount: Number(releaseDetail.payload?.release?.history?.assetChanges?.referenceCount) || 0,
      },
    };
  }
  return surfaces;
}

function assertRuntimeCompatibility({ release, contentExport }) {
  const compatibility = contentExport.payload?.compatibility || {};
  assert.equal(compatibility.source, 'content_operation_release', 'Spelling content export is not sourced from the Content Operations release.');
  assert.equal(compatibility.releaseId, release.releaseId, 'Spelling content export release id does not match the verified release.');
  assert.equal(compatibility.snapshotHash, release.snapshotHash, 'Spelling content export snapshot hash does not match the verified release.');
  assert.equal(compatibility.legacyWriteDisabled, true, 'Spelling legacy write path is not disabled after cutover.');
}

function assertRuntimeSurfaces({ requestedSurfaces, bootstrap, wordBank, heroReadModel, releaseDetail }) {
  if (requestedSurfaces.includes('spellingSetup')) {
    assert.ok(bootstrap.payload?.subjects?.spelling, 'Bootstrap did not include the spelling subject.');
    assert.notEqual(bootstrap.payload?.subjectExposureGates?.spelling, false, 'Bootstrap reports spelling exposure as disabled.');
  }
  if (requestedSurfaces.includes('wordBank')) {
    const rows = flattenWordBankRows(wordBank.payload?.wordBank || {});
    assert.ok(rows.length > 0, 'Word Bank returned no sampled rows.');
  }
  if (requestedSurfaces.includes('heroCodex')) {
    assert.equal(heroReadModel.payload?.ok, true, 'Hero / Codex read-model did not return ok=true.');
    assert.ok(heroReadModel.payload?.hero, 'Hero / Codex read-model did not include a hero envelope.');
  }
  if (requestedSurfaces.includes('monsterRendering')) {
    const monsterVisualConfig = bootstrap.payload?.monsterVisualConfig || null;
    assert.ok(monsterVisualConfig && typeof monsterVisualConfig === 'object', 'Bootstrap did not include monster visual config.');
    const requiredRefs = Number(releaseDetail.payload?.release?.history?.assetChanges?.referenceCount) || 0;
    if (requiredRefs > 0) {
      assert.ok(
        monsterAssetReferenceCount(monsterVisualConfig) >= requiredRefs,
        'Bootstrap monster visual config did not include the published runtime asset references.',
      );
    }
  }
}

async function writeEvidence(outPath, evidence) {
  if (!outPath) return '';
  const absolute = resolve(outPath);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return absolute;
}

function buildEvidence({
  origin,
  authMode,
  release,
  overview,
  releaseList,
  releaseDetail,
  contentExport,
  bootstrap,
  wordBank,
  heroReadModel,
  surfaces,
  captureResult = null,
  outputPath = '',
}) {
  const generatedAt = new Date().toISOString();
  return {
    ok: true,
    proofType: 'content-operations-production',
    source: 'verify-content-operations-production',
    generatedAt,
    origin,
    authMode,
    release: {
      releaseId: release.releaseId,
      status: release.status,
      snapshotHash: release.snapshotHash || '',
      publishedAt: release.publishedAt ?? null,
      packageId: release.packageId || null,
      productionProofStatus: release.history?.productionProof?.status || null,
    },
    checks: {
      overview: {
        ok: overview.ok,
        latestReleaseId: overview.payload?.overview?.latestRelease?.releaseId || null,
      },
      releaseList: {
        ok: releaseList.ok,
        releaseCount: Array.isArray(releaseList.payload?.releases) ? releaseList.payload.releases.length : 0,
      },
      releaseDetail: {
        ok: releaseDetail.ok,
        hasSnapshot: Boolean(releaseDetail.payload?.release?.snapshot),
      },
      contentExport: {
        ok: contentExport.ok,
        releaseId: contentExport.payload?.compatibility?.releaseId || null,
        snapshotHash: contentExport.payload?.compatibility?.snapshotHash || null,
      },
      bootstrap: {
        ok: Boolean(bootstrap.payload),
        learnerId: bootstrap.learnerId,
      },
      wordBank: {
        ok: wordBank.ok,
        returnedRows: Number(wordBank.payload?.wordBank?.analytics?.wordBank?.returnedRows ?? flattenWordBankRows(wordBank.payload?.wordBank || {}).length) || 0,
      },
      heroReadModel: {
        ok: heroReadModel.ok,
        mode: heroReadModel.payload?.hero?.mode || null,
      },
    },
    productionProof: {
      source: 'verify-content-operations-production',
      notes: 'Release metadata and learner-facing runtime surfaces verified after deployment.',
      surfaces,
    },
    captureResult: captureResult ? {
      ok: captureResult.ok,
      status: captureResult.status,
      releaseId: captureResult.payload?.release?.releaseId || null,
      productionProofStatus: captureResult.payload?.release?.history?.productionProof?.status || null,
      linkedSurfaces: Array.isArray(captureResult.payload?.release?.history?.productionProof?.linkedSurfaces)
        ? captureResult.payload.release.history.productionProof.linkedSurfaces.map((entry) => entry.key)
        : [],
    } : null,
    outputPath: outputPath || null,
  };
}

function proofSurfaceKeysFrom(entries = []) {
  return Array.isArray(entries)
    ? entries.map((entry) => String(entry?.key || '').trim()).filter(Boolean)
    : [];
}

function assertCapturedProofClosed({ captureResult, requestedSurfaces }) {
  const productionProof = captureResult.payload?.release?.history?.productionProof || {};
  const status = productionProof.status || 'unknown';
  if (status !== 'recorded') {
    throw validationError(`Release History proof capture remained ${status}; expected recorded.`, {
      status,
      missingSurfaces: productionProof.missingSurfaces || [],
    });
  }
  const missingSurfaces = proofSurfaceKeysFrom(productionProof.missingSurfaces);
  const missingSurfaceCount = Number(productionProof.missingSurfaceCount) || missingSurfaces.length;
  if (missingSurfaceCount > 0) {
    throw validationError(`Release History proof capture still has missing surfaces: ${missingSurfaces.join(', ') || missingSurfaceCount}.`, {
      missingSurfaces: productionProof.missingSurfaces || [],
      missingSurfaceCount,
    });
  }

  const linked = new Set(proofSurfaceKeysFrom(productionProof.linkedSurfaces));
  const required = new Set([
    ...proofSurfaceKeysFrom(productionProof.requiredSurfaces),
    ...(Array.isArray(requestedSurfaces) ? requestedSurfaces : []),
  ]);
  const unlinked = [...required].filter((surface) => !linked.has(surface));
  if (unlinked.length) {
    throw validationError(`Release History proof capture did not link surfaces: ${unlinked.join(', ')}`);
  }
}

export async function runContentOperationsProductionVerification(options = {}, {
  env = process.env,
} = {}) {
  if (options.captureProof && !options.outPath) {
    throw usageError('--capture-proof requires --out so Release History can link to a durable evidence path.');
  }
  const origin = configuredOrigin(options, env);
  const outputPath = options.outPath ? resolve(options.outPath) : '';
  if (outputPath) {
    await mkdir(dirname(outputPath), { recursive: true });
  }
  const audioProof = await loadAudioProofEvidence(options.audioProofPath);
  const auth = await resolveAdminAuth({ origin, options, env });
  const requestedSurfaces = Array.isArray(options.surfaces) && options.surfaces.length
    ? options.surfaces
    : DEFAULT_SURFACES.slice();

  const overview = await apiRequest({
    origin,
    cookie: auth.cookie,
    timeoutMs: options.timeoutMs,
    path: '/api/admin/content-operations/subjects/spelling/overview?includeHistory=true&limit=30',
    label: 'Content Operations overview',
  });
  assertOk('Content Operations overview', overview);

  const releaseList = await apiRequest({
    origin,
    cookie: auth.cookie,
    timeoutMs: options.timeoutMs,
    path: '/api/admin/content-operations/subjects/spelling/releases?includeHistory=true&limit=20',
    label: 'Content Operations release list',
  });
  assertOk('Content Operations release list', releaseList);

  const releaseId = releaseIdFromPayload({
    releaseList: releaseList.payload,
    overview: overview.payload,
    requestedReleaseId: options.releaseId,
  });
  if (!releaseId) throw validationError('No Content Operations release was available to verify.');

  const releaseDetail = await apiRequest({
    origin,
    cookie: auth.cookie,
    timeoutMs: options.timeoutMs,
    path: `/api/admin/content-operations/subjects/spelling/releases/${encodeURIComponent(releaseId)}?includeHistory=true&includeSnapshot=true`,
    label: 'Content Operations release detail',
  });
  assertOk('Content Operations release detail', releaseDetail);
  const release = releaseDetail.payload?.release || null;
  if (!release) throw validationError('Release detail response did not include a release envelope.');
  assert.equal(release.status, 'published', 'Content Operations proof can only verify a published release.');
  assert.ok(release.snapshot, 'Release detail did not include the requested snapshot.');

  const contentExport = await apiRequest({
    origin,
    cookie: auth.cookie,
    timeoutMs: options.timeoutMs,
    path: '/api/content/spelling',
    label: 'Spelling content export',
  });
  assertOk('Spelling content export', contentExport);
  assertRuntimeCompatibility({ release, contentExport });

  const demo = await createDemoSession(origin);
  const bootstrap = await loadBootstrap(origin, demo.cookie, { expectedSession: demo.session });
  const wordBank = await apiRequest({
    origin,
    cookie: demo.cookie,
    timeoutMs: options.timeoutMs,
    path: `/api/subjects/spelling/word-bank?learnerId=${encodeURIComponent(bootstrap.learnerId)}&pageSize=5`,
    label: 'Spelling Word Bank',
  });
  assertOk('Spelling Word Bank', wordBank);
  const heroReadModel = await apiRequest({
    origin,
    cookie: demo.cookie,
    timeoutMs: options.timeoutMs,
    path: `/api/hero/read-model?learnerId=${encodeURIComponent(bootstrap.learnerId)}`,
    label: 'Hero / Codex read-model',
  });
  assertOk('Hero / Codex read-model', heroReadModel);
  assertRuntimeSurfaces({ requestedSurfaces, bootstrap, wordBank, heroReadModel, releaseDetail });

  const surfaces = buildSurfaceProofs({
    origin,
    release,
    releaseDetail,
    contentExport,
    bootstrap,
    wordBank,
    heroReadModel,
    audioProof,
    evidencePath: outputPath,
    requestedSurfaces,
  });
  const proof = {
    source: 'verify-content-operations-production',
    notes: 'Release metadata and learner-facing runtime surfaces verified after deployment.',
    surfaces,
  };

  let captureResult = null;
  let evidence = buildEvidence({
    origin,
    authMode: auth.mode,
    release,
    overview,
    releaseList,
    releaseDetail,
    contentExport,
    bootstrap,
    wordBank,
    heroReadModel,
    surfaces,
    captureResult,
    outputPath,
  });
  let writtenPath = '';
  if (options.captureProof) {
    writtenPath = await writeEvidence(options.outPath, evidence);
  }

  if (options.captureProof) {
    captureResult = await apiRequest({
      origin,
      cookie: auth.cookie,
      timeoutMs: options.timeoutMs,
      method: 'POST',
      path: `/api/admin/content-operations/subjects/spelling/releases/${encodeURIComponent(releaseId)}/proof?includeSnapshot=false`,
      body: { proof },
      label: 'Content Operations release proof capture',
    });
    assertOk('Content Operations release proof capture', captureResult);
    assertCapturedProofClosed({ captureResult, requestedSurfaces });
    evidence = buildEvidence({
      origin,
      authMode: auth.mode,
      release,
      overview,
      releaseList,
      releaseDetail,
      contentExport,
      bootstrap,
      wordBank,
      heroReadModel,
      surfaces,
      captureResult,
      outputPath,
    });
  }

  writtenPath = await writeEvidence(options.outPath, evidence);
  return {
    exitCode: EXIT_OK,
    outputPath: writtenPath,
    evidence,
  };
}

function renderHumanReadableResult(result) {
  const evidence = result.evidence || {};
  const surfaces = Object.keys(evidence.productionProof?.surfaces || {});
  return [
    `verify-content-operations-production @ ${evidence.origin || '(unknown origin)'}`,
    `  ok=${Boolean(evidence.ok)}`,
    `  release=${evidence.release?.releaseId || '(none)'} snapshot=${evidence.release?.snapshotHash || '(none)'}`,
    `  surfaces=${surfaces.join(', ') || '(none)'}`,
    `  capture=${evidence.captureResult ? evidence.captureResult.productionProofStatus : 'not requested'}`,
    result.outputPath ? `  evidence=${result.outputPath}` : '  evidence=(not written)',
  ].join('\n');
}

export async function runCli(argv = process.argv.slice(2), dependencies = {}) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(JSON.stringify({ ok: false, exit_code: EXIT_USAGE, error: error?.message || String(error) }, null, 2));
    return EXIT_USAGE;
  }
  if (options.help) {
    console.log(HELP_BANNER);
    return EXIT_OK;
  }

  let result;
  try {
    result = await runContentOperationsProductionVerification(options, dependencies);
  } catch (error) {
    const exitCode = classifyExitCode(error);
    console.error(JSON.stringify({
      ok: false,
      exit_code: exitCode,
      error: error?.message || String(error),
      details: error?.details || undefined,
    }, null, 2));
    return exitCode;
  }

  if (options.json) {
    console.log(JSON.stringify(result.evidence, null, 2));
  } else {
    console.log(renderHumanReadableResult(result));
  }
  return result.exitCode;
}

export async function main() {
  const code = await runCli();
  process.exitCode = code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[verify-content-operations-production] ' + (error?.stack || error?.message || error));
    process.exit(EXIT_TRANSPORT);
  });
}
