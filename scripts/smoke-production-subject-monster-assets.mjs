import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { HERO_POOL_INITIAL_MONSTER_IDS } from '../shared/hero/hero-pool.js';
import { MONSTER_ASSET_VERSION, MONSTERS, MONSTERS_BY_SUBJECT } from '../src/platform/game/monsters.js';
import { monsterVisualSourceMonsterId } from '../src/platform/game/monster-visual-config.js';
import { buildCodexEntries, buildCodexSubjectGroups } from '../src/surfaces/home/data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const packageDir = path.join(rootDir, 'docs', 'plans', 'james', 'hotfixes', '18. monster-subject-asset-alignment-package');
const validationDir = path.join(packageDir, 'validation');

const productionOrigin = process.env.KS2_PRODUCTION_ORIGIN || 'https://ks2.eugnel.uk';
const checkedAt = new Date().toISOString();
const stamp = checkedAt.slice(0, 10);
const subjects = ['reading', 'arithmetic', 'reasoning'];
const branches = ['b1', 'b2'];
const stages = [0, 1, 2, 3, 4];
const sizes = [320, 640, 1280];
const subjectMonsterIds = subjects.flatMap((subjectId) => MONSTERS_BY_SUBJECT[subjectId]);
const subjectMonsterIdSet = new Set(subjectMonsterIds);

function rel(filePath) {
  return path.relative(rootDir, filePath);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function localAssetPath(monsterId, branch, stage, size) {
  return path.join(rootDir, 'assets', 'monsters', monsterId, branch, `${monsterId}-${branch}-${stage}.${size}.webp`);
}

function assetUrl(monsterId, branch, stage, size) {
  const url = new URL(`/assets/monsters/${monsterId}/${branch}/${monsterId}-${branch}-${stage}.${size}.webp`, productionOrigin);
  url.searchParams.set('v', MONSTER_ASSET_VERSION);
  return url;
}

function assetMatrix(monsterIds) {
  const assets = [];
  for (const monsterId of monsterIds) {
    for (const branch of branches) {
      for (const stage of stages) {
        for (const size of sizes) {
          assets.push({ monsterId, branch, stage, size });
        }
      }
    }
  }
  return assets;
}

async function fetchBytes(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'image/webp,*/*;q=0.8',
      'cache-control': 'no-cache',
    },
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    cacheStatus: response.headers.get('cf-cache-status') || '',
    etag: response.headers.get('etag') || '',
    bytes: buffer,
  };
}

async function auditSubjectAssets() {
  const failures = [];
  const remoteHashes = new Map();
  const samples = [];

  for (const asset of assetMatrix(subjectMonsterIds)) {
    const url = assetUrl(asset.monsterId, asset.branch, asset.stage, asset.size);
    const localPath = localAssetPath(asset.monsterId, asset.branch, asset.stage, asset.size);
    const localBytes = readFileSync(localPath);
    const localHash = sha256(localBytes);
    const remote = await fetchBytes(url);
    const remoteHash = sha256(remote.bytes);
    const issues = [];
    if (!remote.ok) issues.push(`http:${remote.status}`);
    if (!remote.contentType.toLowerCase().includes('image/webp')) issues.push(`content-type:${remote.contentType}`);
    if (remote.bytes.length !== localBytes.length) issues.push(`bytes:${remote.bytes.length}:${localBytes.length}`);
    if (remoteHash !== localHash) issues.push('hash-mismatch');

    const key = `${asset.monsterId}/${asset.branch}/stage-${asset.stage}/${asset.size}`;
    remoteHashes.set(remoteHash, {
      ...asset,
      key,
      path: rel(localPath),
      url: url.href,
      hash: remoteHash,
    });
    if (samples.length < 12) {
      samples.push({
        key,
        url: url.href,
        status: remote.status,
        contentType: remote.contentType,
        cacheStatus: remote.cacheStatus,
        bytes: remote.bytes.length,
        hash: remoteHash,
      });
    }
    if (issues.length) {
      failures.push({
        key,
        url: url.href,
        status: remote.status,
        contentType: remote.contentType,
        bytes: remote.bytes.length,
        expectedBytes: localBytes.length,
        remoteHash,
        localHash,
        issues,
      });
    }
  }

  return {
    checkedAssets: subjectMonsterIds.length * branches.length * stages.length * sizes.length,
    failureCount: failures.length,
    failures,
    samples,
    remoteHashes,
    ok: failures.length === 0,
  };
}

async function auditHeroCampDuplicates(subjectRemoteHashes) {
  const duplicates = [];
  let checkedAssets = 0;

  for (const asset of assetMatrix(HERO_POOL_INITIAL_MONSTER_IDS)) {
    checkedAssets += 1;
    const url = assetUrl(asset.monsterId, asset.branch, asset.stage, asset.size);
    const remote = await fetchBytes(url);
    const hash = sha256(remote.bytes);
    const duplicate = subjectRemoteHashes.get(hash);
    if (duplicate) {
      duplicates.push({
        subject: duplicate,
        heroCamp: {
          ...asset,
          key: `${asset.monsterId}/${asset.branch}/stage-${asset.stage}/${asset.size}`,
          url: url.href,
          status: remote.status,
          contentType: remote.contentType,
          hash,
        },
      });
    }
  }

  return {
    checkedHeroCampAssets: checkedAssets,
    duplicateCount: duplicates.length,
    duplicates,
    ok: duplicates.length === 0,
  };
}

function auditWithinMonsterRemoteDistinctness(subjectRemoteHashes) {
  const byMonsterAndSize = new Map();
  for (const row of subjectRemoteHashes.values()) {
    const groupKey = `${row.monsterId}/${row.size}`;
    const rowsByHash = byMonsterAndSize.get(groupKey) || new Map();
    const rows = rowsByHash.get(row.hash) || [];
    rows.push(row);
    rowsByHash.set(row.hash, rows);
    byMonsterAndSize.set(groupKey, rowsByHash);
  }

  const duplicates = [];
  for (const rowsByHash of byMonsterAndSize.values()) {
    for (const rows of rowsByHash.values()) {
      if (rows.length > 1) duplicates.push(rows);
    }
  }

  return {
    duplicateCount: duplicates.length,
    duplicates,
    ok: duplicates.length === 0,
  };
}

async function auditBundle() {
  const response = await fetch(productionOrigin, {
    headers: {
      accept: 'text/html,*/*;q=0.8',
      'cache-control': 'no-cache',
    },
  });
  const html = await response.text();
  const scriptSrcs = [...html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/gi)]
    .map((match) => new URL(match[1], productionOrigin).href);
  const scripts = [];
  let assetVersionSeen = html.includes(MONSTER_ASSET_VERSION);
  let subjectIdHits = 0;

  for (const src of scriptSrcs) {
    const scriptResponse = await fetch(src, {
      headers: {
        accept: 'application/javascript,*/*;q=0.8',
        'cache-control': 'no-cache',
      },
    });
    const text = await scriptResponse.text();
    const seenSubjectIds = subjectMonsterIds.filter((monsterId) => text.includes(monsterId));
    if (text.includes(MONSTER_ASSET_VERSION)) assetVersionSeen = true;
    subjectIdHits += seenSubjectIds.length;
    scripts.push({
      src,
      status: scriptResponse.status,
      bytes: Buffer.byteLength(text),
      assetVersionSeen: text.includes(MONSTER_ASSET_VERSION),
      seenSubjectIds,
    });
  }

  const issues = [];
  if (!response.ok) issues.push(`html-http:${response.status}`);
  if (!assetVersionSeen) issues.push('asset-version-not-seen');
  if (subjectIdHits < subjectMonsterIds.length) issues.push(`subject-id-hits:${subjectIdHits}`);

  return {
    origin: productionOrigin,
    status: response.status,
    htmlBytes: Buffer.byteLength(html),
    scriptCount: scripts.length,
    assetVersion: MONSTER_ASSET_VERSION,
    assetVersionSeen,
    subjectIdHits,
    scripts,
    issues,
    ok: issues.length === 0,
  };
}

function codexAudit() {
  const entries = buildCodexEntries([]);
  const groups = buildCodexSubjectGroups(entries);
  const missingSubjectIds = subjectMonsterIds.filter((monsterId) => !entries.some((entry) => entry.id === monsterId));
  const visualSourceLeaks = subjectMonsterIds
    .map((monsterId) => ({ monsterId, sourceMonsterId: monsterVisualSourceMonsterId(monsterId) }))
    .filter(({ monsterId, sourceMonsterId }) => sourceMonsterId !== monsterId);
  const reservedIdsPresent = entries
    .map((entry) => entry.id)
    .filter((monsterId) => HERO_POOL_INITIAL_MONSTER_IDS.includes(monsterId));
  const nonSubjectEntries = entries
    .map((entry) => entry.id)
    .filter((monsterId) => subjectMonsterIdSet.has(monsterId));

  return {
    entryCount: entries.length,
    groupIds: groups.map((group) => group.subjectId),
    subjectEntryCount: nonSubjectEntries.length,
    missingSubjectIds,
    reservedIdsPresent,
    visualSourceLeaks,
    monsterCount: Object.keys(MONSTERS).length,
    ok: entries.length === 28
      && groups.length === 6
      && missingSubjectIds.length === 0
      && reservedIdsPresent.length === 0
      && visualSourceLeaks.length === 0,
  };
}

await mkdir(validationDir, { recursive: true });

const bundle = await auditBundle();
const subjectAssets = await auditSubjectAssets();
const heroCampHashAudit = await auditHeroCampDuplicates(subjectAssets.remoteHashes);
const withinMonsterHashAudit = auditWithinMonsterRemoteDistinctness(subjectAssets.remoteHashes);
const codex = codexAudit();

const report = {
  checkedAt,
  productionOrigin,
  matrix: {
    assetVersion: MONSTER_ASSET_VERSION,
    subjects,
    subjectMonsterCount: subjectMonsterIds.length,
    subjectMonsterIds,
    heroCampMonsterIds: HERO_POOL_INITIAL_MONSTER_IDS,
    branches,
    stages,
    sizes,
  },
  bundle,
  codex,
  subjectAssets: {
    checkedAssets: subjectAssets.checkedAssets,
    failureCount: subjectAssets.failureCount,
    failures: subjectAssets.failures,
    samples: subjectAssets.samples,
    ok: subjectAssets.ok,
  },
  heroCampHashAudit,
  withinMonsterHashAudit,
};

report.ok = bundle.ok
  && codex.ok
  && subjectAssets.ok
  && heroCampHashAudit.ok
  && withinMonsterHashAudit.ok;

const outFile = path.join(validationDir, `production-monster-subject-codex-and-art-smoke-${stamp}.json`);
await writeFile(outFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  ok: report.ok,
  report: rel(outFile),
  assetVersion: MONSTER_ASSET_VERSION,
  bundleAssetVersionSeen: bundle.assetVersionSeen,
  codexEntries: codex.entryCount,
  subjectAssetFailures: subjectAssets.failureCount,
  heroCampDuplicates: heroCampHashAudit.duplicateCount,
  withinMonsterDuplicates: withinMonsterHashAudit.duplicateCount,
}, null, 2));

if (!report.ok) {
  process.exitCode = 1;
}
