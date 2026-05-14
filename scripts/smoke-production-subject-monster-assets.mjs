import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { HERO_POOL_INITIAL_MONSTER_IDS } from '../shared/hero/hero-pool.js';
import { MONSTER_ASSET_VERSION, MONSTERS, MONSTERS_BY_SUBJECT } from '../src/platform/game/monsters.js';
import { monsterVisualSourceMonsterId } from '../src/platform/game/monster-visual-config.js';
import { buildCodexEntries, buildCodexSubjectGroups } from '../src/surfaces/home/data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const packageDir = path.join(rootDir, 'docs', 'plans', 'james', 'hotfixes', '18. monster-subject-asset-alignment-package');
const validationDir = path.join(packageDir, 'validation');
const productionCodexEvidenceDir = path.join(packageDir, 'evidence', 'production-codex-ui');

const productionOrigin = process.env.KS2_PRODUCTION_ORIGIN || 'https://ks2.eugnel.uk';
const checkedAt = new Date().toISOString();
const stamp = checkedAt.slice(0, 10);
const subjects = ['reading', 'arithmetic', 'reasoning'];
const branches = ['b1', 'b2'];
const stages = [0, 1, 2, 3, 4];
const sizes = [320, 640, 1280];
const subjectMonsterIds = subjects.flatMap((subjectId) => MONSTERS_BY_SUBJECT[subjectId]);
const subjectMonsterIdSet = new Set(subjectMonsterIds);
const allOtherMonsterIds = Object.keys(MONSTERS)
  .filter((monsterId) => !subjectMonsterIdSet.has(monsterId))
  .sort((left, right) => left.localeCompare(right));

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

function sameOriginScriptUrl(rawRef, baseUrl) {
  if (typeof rawRef !== 'string' || !rawRef.endsWith('.js') && !rawRef.includes('.js?')) return null;
  try {
    const url = new URL(rawRef, baseUrl);
    if (url.origin !== new URL(productionOrigin).origin) return null;
    return url.href;
  } catch {
    return null;
  }
}

function referencedScriptUrls(text, baseUrl) {
  const refs = new Set();
  const patterns = [
    /(?:from|import)\s*(?:\(\s*)?["']([^"']+\.js(?:\?[^"']*)?)["']/g,
    /["']((?:\.{1,2}\/|\/src\/bundles\/)[^"']+\.js(?:\?[^"']*)?)["']/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const url = sameOriginScriptUrl(match[1], baseUrl);
      if (url) refs.add(url);
    }
  }

  return refs;
}

async function auditSubjectAssets() {
  const failures = [];
  const remoteRows = [];
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
    const remoteRow = {
      ...asset,
      key,
      path: rel(localPath),
      url: url.href,
      hash: remoteHash,
    };
    remoteRows.push(remoteRow);
    const hashRows = remoteHashes.get(remoteHash) || [];
    hashRows.push(remoteRow);
    remoteHashes.set(remoteHash, hashRows);
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
    remoteRows,
    remoteHashes,
    ok: failures.length === 0,
  };
}

async function auditRemoteDuplicatesAgainstSubjects(monsterIds, subjectRemoteHashes) {
  const duplicates = [];
  const failures = [];
  let checkedAssets = 0;

  for (const asset of assetMatrix(monsterIds)) {
    checkedAssets += 1;
    const url = assetUrl(asset.monsterId, asset.branch, asset.stage, asset.size);
    const remote = await fetchBytes(url);
    const hash = sha256(remote.bytes);
    const issues = [];
    if (!remote.ok) issues.push(`http:${remote.status}`);
    if (!remote.contentType.toLowerCase().includes('image/webp')) issues.push(`content-type:${remote.contentType}`);
    if (issues.length) {
      failures.push({
        ...asset,
        key: `${asset.monsterId}/${asset.branch}/stage-${asset.stage}/${asset.size}`,
        url: url.href,
        status: remote.status,
        contentType: remote.contentType,
        issues,
      });
    }
    const duplicateSubjects = subjectRemoteHashes.get(hash) || [];
    for (const duplicate of duplicateSubjects) {
      duplicates.push({
        subject: duplicate,
        other: {
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
    checkedAssets,
    failureCount: failures.length,
    failures,
    duplicateCount: duplicates.length,
    duplicates,
    ok: duplicates.length === 0 && failures.length === 0,
  };
}

async function auditHeroCampDuplicates(subjectRemoteHashes) {
  const audit = await auditRemoteDuplicatesAgainstSubjects(HERO_POOL_INITIAL_MONSTER_IDS, subjectRemoteHashes);
  return {
    checkedHeroCampAssets: audit.checkedAssets,
    failureCount: audit.failureCount,
    failures: audit.failures,
    duplicateCount: audit.duplicateCount,
    duplicates: audit.duplicates.map((row) => ({
      subject: row.subject,
      heroCamp: row.other,
    })),
    ok: audit.ok,
  };
}

async function auditAllMonsterDuplicates(subjectRemoteHashes) {
  const audit = await auditRemoteDuplicatesAgainstSubjects(allOtherMonsterIds, subjectRemoteHashes);
  return {
    checkedOtherMonsterAssets: audit.checkedAssets,
    checkedOtherMonsterIds: allOtherMonsterIds,
    failureCount: audit.failureCount,
    failures: audit.failures,
    duplicateCount: audit.duplicateCount,
    duplicates: audit.duplicates,
    ok: audit.ok,
  };
}

function auditWithinMonsterRemoteDistinctness(subjectRemoteRows) {
  const byMonsterAndSize = new Map();
  for (const row of subjectRemoteRows) {
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
  const queue = [...scriptSrcs];
  const seenScripts = new Set();
  const seenSubjectIdsAcrossScripts = new Set();
  const scriptIssues = [];
  let assetVersionSeen = html.includes(MONSTER_ASSET_VERSION);

  while (queue.length) {
    const src = queue.shift();
    if (!src || seenScripts.has(src)) continue;
    seenScripts.add(src);

    const scriptResponse = await fetch(src, {
      headers: {
        accept: 'application/javascript,*/*;q=0.8',
        'cache-control': 'no-cache',
      },
    });
    const text = await scriptResponse.text();
    const contentType = scriptResponse.headers.get('content-type') || '';
    const perScriptIssues = [];
    if (!scriptResponse.ok) perScriptIssues.push(`script-http:${scriptResponse.status}`);
    if (!contentType.toLowerCase().includes('javascript')) perScriptIssues.push(`script-content-type:${contentType}`);
    const seenSubjectIds = subjectMonsterIds.filter((monsterId) => text.includes(monsterId));
    if (text.includes(MONSTER_ASSET_VERSION)) assetVersionSeen = true;
    for (const monsterId of seenSubjectIds) seenSubjectIdsAcrossScripts.add(monsterId);
    for (const referencedUrl of referencedScriptUrls(text, src)) {
      if (!seenScripts.has(referencedUrl)) queue.push(referencedUrl);
    }
    scripts.push({
      src,
      status: scriptResponse.status,
      contentType,
      bytes: Buffer.byteLength(text),
      assetVersionSeen: text.includes(MONSTER_ASSET_VERSION),
      seenSubjectIds,
      issues: perScriptIssues,
    });
    for (const issue of perScriptIssues) scriptIssues.push(`${src} ${issue}`);
  }

  const seenSubjectIds = [...seenSubjectIdsAcrossScripts];
  const missingSubjectIds = subjectMonsterIds.filter((monsterId) => !seenSubjectIdsAcrossScripts.has(monsterId));
  const issues = [];
  if (!response.ok) issues.push(`html-http:${response.status}`);
  for (const issue of scriptIssues) issues.push(issue);
  if (!assetVersionSeen) issues.push('asset-version-not-seen');
  if (missingSubjectIds.length) issues.push(`missing-subject-ids:${missingSubjectIds.join(',')}`);

  return {
    origin: productionOrigin,
    status: response.status,
    htmlBytes: Buffer.byteLength(html),
    htmlScriptCount: scriptSrcs.length,
    scriptCount: scripts.length,
    assetVersion: MONSTER_ASSET_VERSION,
    assetVersionSeen,
    subjectIdHits: seenSubjectIds.length,
    seenSubjectIds,
    missingSubjectIds,
    scripts,
    issues,
    ok: issues.length === 0,
  };
}

async function auditLiveCodexUi() {
  const screenshotPath = path.join(productionCodexEvidenceDir, `production-codex-ui-${stamp}.png`);
  const failures = {
    pageErrors: [],
    consoleErrors: [],
    requestFailures: [],
    httpFailures: [],
  };
  const browser = await chromium.launch({ headless: true });
  let state = null;

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', (error) => failures.pageErrors.push(error?.message || String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') failures.consoleErrors.push(message.text());
    });
    page.on('requestfailed', (request) => {
      failures.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`.trim());
    });
    page.on('response', (response) => {
      const status = response.status();
      if (status >= 400) failures.httpFailures.push(`${status} ${response.url()}`);
    });

    await page.goto(`${productionOrigin}/demo`, { waitUntil: 'networkidle', timeout: 45_000 });
    await page.waitForSelector('.subject-grid', { timeout: 20_000 });
    await page.click('[data-action="open-codex"]');
    await page.waitForSelector('.codex-page', { timeout: 20_000 });
    await page.waitForSelector('[data-codex-monster-id="readbloom"]', { timeout: 20_000 });
    await page.screenshot({ path: screenshotPath, fullPage: true });

    state = await page.evaluate(() => {
      const subjectGroups = Array.from(document.querySelectorAll('.codex-subject-section[data-codex-subject-id]'))
        .map((section) => ({
          subjectId: section.getAttribute('data-codex-subject-id'),
          heading: section.querySelector('.codex-subject-name')?.textContent?.trim() || '',
          count: section.querySelector('.codex-subject-count')?.textContent?.trim() || '',
        }));
      const cards = Array.from(document.querySelectorAll('.codex-card[data-codex-monster-id]'))
        .map((card) => ({
          monsterId: card.getAttribute('data-codex-monster-id'),
          subjectId: card.getAttribute('data-codex-subject-id'),
          displayState: card.getAttribute('data-codex-display-state'),
          title: card.querySelector('h3')?.textContent?.trim() || '',
          imageAlt: card.querySelector('img')?.getAttribute('alt') || card.querySelector('.codex-unknown')?.getAttribute('aria-label') || '',
        }));
      return {
        title: document.querySelector('.codex-title')?.textContent?.trim() || '',
        rosterTitle: document.querySelector('.codex-section-head .section-title')?.textContent?.trim() || '',
        subjectGroups,
        cards,
        bodyWidth: document.body.scrollWidth,
        viewportWidth: window.innerWidth,
      };
    });

    await context.close();
  } finally {
    await browser.close();
  }

  const cardIds = state?.cards?.map((card) => card.monsterId).filter(Boolean) || [];
  const groupIds = state?.subjectGroups?.map((group) => group.subjectId).filter(Boolean) || [];
  const uniqueCardIds = [...new Set(cardIds)];
  const duplicateCardIds = uniqueCardIds.filter((id) => cardIds.filter((cardId) => cardId === id).length > 1);
  const missingSubjectIds = subjectMonsterIds.filter((monsterId) => !cardIds.includes(monsterId));
  const reservedIdsPresent = cardIds.filter((monsterId) => HERO_POOL_INITIAL_MONSTER_IDS.includes(monsterId));
  const missingGroupIds = ['spelling', 'punctuation', 'grammar', ...subjects].filter((subjectId) => !groupIds.includes(subjectId));
  const browserFailures = [
    ...failures.pageErrors.map((entry) => `pageerror:${entry}`),
    ...failures.consoleErrors.map((entry) => `console:${entry}`),
    ...failures.requestFailures.map((entry) => `request:${entry}`),
    ...failures.httpFailures.map((entry) => `http:${entry}`),
  ];
  const issues = [];
  if (!state) issues.push('codex-state-missing');
  if (state && state.bodyWidth > state.viewportWidth + 1) issues.push(`horizontal-overflow:${state.bodyWidth}:${state.viewportWidth}`);
  if (browserFailures.length) issues.push(...browserFailures);
  if (cardIds.length !== 28) issues.push(`card-count:${cardIds.length}`);
  if (missingGroupIds.length) issues.push(`missing-groups:${missingGroupIds.join(',')}`);
  if (missingSubjectIds.length) issues.push(`missing-subject-cards:${missingSubjectIds.join(',')}`);
  if (reservedIdsPresent.length) issues.push(`reserved-cards:${reservedIdsPresent.join(',')}`);
  if (duplicateCardIds.length) issues.push(`duplicate-cards:${duplicateCardIds.join(',')}`);

  return {
    origin: productionOrigin,
    screenshot: rel(screenshotPath),
    groupIds,
    cardCount: cardIds.length,
    uniqueCardCount: uniqueCardIds.length,
    subjectCardCount: cardIds.filter((monsterId) => subjectMonsterIdSet.has(monsterId)).length,
    missingSubjectIds,
    reservedIdsPresent,
    duplicateCardIds,
    browserFailures,
    state,
    issues,
    ok: issues.length === 0,
  };
}

function sourceCodexAudit() {
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
await mkdir(productionCodexEvidenceDir, { recursive: true });

const bundle = await auditBundle();
const subjectAssets = await auditSubjectAssets();
const heroCampHashAudit = await auditHeroCampDuplicates(subjectAssets.remoteHashes);
const allMonsterHashAudit = await auditAllMonsterDuplicates(subjectAssets.remoteHashes);
const withinMonsterHashAudit = auditWithinMonsterRemoteDistinctness(subjectAssets.remoteRows);
const sourceCodex = sourceCodexAudit();
const liveCodexUi = await auditLiveCodexUi();

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
  sourceCodex,
  liveCodexUi,
  subjectAssets: {
    checkedAssets: subjectAssets.checkedAssets,
    failureCount: subjectAssets.failureCount,
    failures: subjectAssets.failures,
    samples: subjectAssets.samples,
    ok: subjectAssets.ok,
  },
  heroCampHashAudit,
  allMonsterHashAudit,
  withinMonsterHashAudit,
};

report.ok = bundle.ok
  && sourceCodex.ok
  && liveCodexUi.ok
  && subjectAssets.ok
  && heroCampHashAudit.ok
  && allMonsterHashAudit.ok
  && withinMonsterHashAudit.ok;

const outFile = path.join(validationDir, `production-monster-subject-codex-and-art-smoke-${stamp}.json`);
await writeFile(outFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  ok: report.ok,
  report: rel(outFile),
  assetVersion: MONSTER_ASSET_VERSION,
  bundleAssetVersionSeen: bundle.assetVersionSeen,
  sourceCodexEntries: sourceCodex.entryCount,
  liveCodexCards: liveCodexUi.cardCount,
  subjectAssetFailures: subjectAssets.failureCount,
  heroCampDuplicates: heroCampHashAudit.duplicateCount,
  allMonsterDuplicates: allMonsterHashAudit.duplicateCount,
  withinMonsterDuplicates: withinMonsterHashAudit.duplicateCount,
}, null, 2));

if (!report.ok) {
  process.exitCode = 1;
}
