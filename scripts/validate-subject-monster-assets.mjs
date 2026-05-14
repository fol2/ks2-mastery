import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { HERO_POOL_INITIAL_MONSTER_IDS } from '../shared/hero/hero-pool.js';
import { MONSTER_ASSET_VERSION, MONSTERS, MONSTERS_BY_SUBJECT } from '../src/platform/game/monsters.js';
import { MONSTER_ASSET_MANIFEST } from '../src/platform/game/monster-asset-manifest.js';
import { monsterVisualSourceMonsterId } from '../src/platform/game/monster-visual-config.js';
import { buildCodexEntries, buildCodexSubjectGroups } from '../src/surfaces/home/data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const packageDir = path.join(rootDir, 'docs', 'plans', 'james', 'hotfixes', '18. monster-subject-asset-alignment-package');
const validationDir = path.join(packageDir, 'validation');
const previewDir = path.join(packageDir, 'evidence', 'runtime-preview');

const subjects = ['reading', 'arithmetic', 'reasoning'];
const branches = ['b1', 'b2'];
const stages = [0, 1, 2, 3, 4];
const sizes = [320, 640, 1280];
const subjectMonsterIds = subjects.flatMap((subjectId) => MONSTERS_BY_SUBJECT[subjectId]);
const allMonsterIds = Object.keys(MONSTERS);
const checkedAt = new Date().toISOString();
const stamp = checkedAt.slice(0, 10);

function rel(filePath) {
  return path.relative(rootDir, filePath);
}

function assetPath(monsterId, branch, stage, size) {
  return path.join(rootDir, 'assets', 'monsters', monsterId, branch, `${monsterId}-${branch}-${stage}.${size}.webp`);
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function buildHashIndex(monsterIds) {
  const index = new Map();
  for (const monsterId of monsterIds) {
    for (const branch of branches) {
      for (const stage of stages) {
        for (const size of sizes) {
          const filePath = assetPath(monsterId, branch, stage, size);
          const hash = sha256(filePath);
          const rows = index.get(hash) || [];
          rows.push({ monsterId, branch, stage, size, path: rel(filePath) });
          index.set(hash, rows);
        }
      }
    }
  }
  return index;
}

function auditAgainstHashIndex(subjectIds, index, { allowSameMonster = false } = {}) {
  const duplicates = [];
  for (const monsterId of subjectIds) {
    for (const branch of branches) {
      for (const stage of stages) {
        for (const size of sizes) {
          const filePath = assetPath(monsterId, branch, stage, size);
          const matches = index.get(sha256(filePath)) || [];
          const duplicateOf = matches.filter((match) => allowSameMonster || match.monsterId !== monsterId);
          if (duplicateOf.length) {
            duplicates.push({
              monsterId,
              branch,
              stage,
              size,
              path: rel(filePath),
              duplicateOf,
            });
          }
        }
      }
    }
  }
  return duplicates;
}

function auditWithinMonsterDistinctness() {
  const duplicates = [];
  for (const monsterId of subjectMonsterIds) {
    for (const size of sizes) {
      const index = new Map();
      for (const branch of branches) {
        for (const stage of stages) {
          const filePath = assetPath(monsterId, branch, stage, size);
          const hash = sha256(filePath);
          const rows = index.get(hash) || [];
          rows.push({ monsterId, branch, stage, size, path: rel(filePath) });
          index.set(hash, rows);
        }
      }

      for (const rows of index.values()) {
        if (rows.length > 1) {
          duplicates.push({ monsterId, size, duplicates: rows });
        }
      }
    }
  }
  return duplicates;
}

async function alphaBounds(filePath) {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  let alphaPixelCount = 0;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * 4 + 3];
      if (alpha <= 10) continue;
      alphaPixelCount += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (alphaPixelCount === 0) {
    return { alphaPixelCount, minX: null, minY: null, maxX: null, maxY: null };
  }
  return { alphaPixelCount, minX, minY, maxX, maxY };
}

async function auditRuntimeImages() {
  const failures = [];
  let checkedAssets = 0;
  let alphaCheckedAssets = 0;
  const samples = [];

  for (const subjectId of subjects) {
    for (const monsterId of MONSTERS_BY_SUBJECT[subjectId]) {
      for (const branch of branches) {
        for (const stage of stages) {
          for (const size of sizes) {
            checkedAssets += 1;
            const filePath = assetPath(monsterId, branch, stage, size);
            const metadata = await sharp(filePath).metadata();
            const issues = [];
            if (metadata.format !== 'webp') issues.push(`format:${metadata.format}`);
            if (metadata.width !== size || metadata.height !== size) issues.push(`dimensions:${metadata.width}x${metadata.height}`);
            if (!metadata.hasAlpha) issues.push('missing-alpha');

            let bounds = null;
            if (size === 320) {
              alphaCheckedAssets += 1;
              bounds = await alphaBounds(filePath);
              const blank = bounds.alphaPixelCount < 200;
              const edgeCropRisk = !blank && (
                bounds.minX <= 1
                || bounds.minY <= 1
                || bounds.maxX >= size - 2
                || bounds.maxY >= size - 2
              );
              if (blank) issues.push('blank-alpha');
              if (edgeCropRisk) issues.push('edge-crop-risk');
              samples.push({
                subjectId,
                monsterId,
                branch,
                stage,
                size,
                path: rel(filePath),
                alphaBounds: bounds,
              });
            }

            if (issues.length) {
              failures.push({
                subjectId,
                monsterId,
                branch,
                stage,
                size,
                path: rel(filePath),
                hash: sha256(filePath),
                issues,
                alphaBounds: bounds,
              });
            }
          }
        }
      }
    }
  }

  return {
    checkedAssets,
    alphaCheckedAssets,
    failureCount: failures.length,
    failures,
    samples,
    ok: failures.length === 0,
  };
}

function codexAudit() {
  const entries = buildCodexEntries([
    { monster: MONSTERS.inklet, progress: { caught: true, mastered: 4, stage: 0, level: 0, branch: 'b1' } },
  ]);
  const groups = buildCodexSubjectGroups(entries);
  const reservedIds = new Set([...HERO_POOL_INITIAL_MONSTER_IDS]);
  const reservedEntryIdsPresent = entries.map((entry) => entry.id).filter((id) => reservedIds.has(id));

  return {
    entryCount: entries.length,
    groupIds: groups.map((group) => group.subjectId),
    groupTotals: Object.fromEntries(groups.map((group) => [group.subjectId, group.totals])),
    sampledSubjectIds: Object.fromEntries(subjectMonsterIds.map((monsterId) => [
      monsterId,
      entries.find((entry) => entry.id === monsterId)?.subjectId || null,
    ])),
    reservedEntryIdsPresent,
    ok: entries.length === 28 && reservedEntryIdsPresent.length === 0,
  };
}

function visualSourceAudit() {
  const sources = subjectMonsterIds.map((monsterId) => ({
    monsterId,
    sourceMonsterId: monsterVisualSourceMonsterId(monsterId),
  }));
  const inheritedSources = sources.filter((entry) => entry.sourceMonsterId !== entry.monsterId);
  const heroCampIds = new Set(HERO_POOL_INITIAL_MONSTER_IDS);
  const heroCampSourceLeaks = sources.filter((entry) => heroCampIds.has(entry.sourceMonsterId));
  return {
    checked: sources.length,
    inheritedSourceCount: inheritedSources.length,
    inheritedSources,
    heroCampSourceLeakCount: heroCampSourceLeaks.length,
    heroCampSourceLeaks,
    ok: inheritedSources.length === 0 && heroCampSourceLeaks.length === 0,
  };
}

async function contactSheet(branch) {
  await mkdir(previewDir, { recursive: true });
  const cell = 176;
  const padding = 8;
  const width = stages.length * cell;
  const height = subjectMonsterIds.length * cell;
  const composites = [];

  for (let row = 0; row < subjectMonsterIds.length; row += 1) {
    const monsterId = subjectMonsterIds[row];
    for (let col = 0; col < stages.length; col += 1) {
      const stage = stages[col];
      const input = assetPath(monsterId, branch, stage, 320);
      const image = await sharp(input).resize(cell - padding * 2, cell - padding * 2, { fit: 'contain' }).png().toBuffer();
      composites.push({
        input: image,
        left: col * cell + padding,
        top: row * cell + padding,
      });
    }
  }

  const outFile = path.join(previewDir, `subject-monsters-${branch}-all-stages-contact-sheet-${stamp}.png`);
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: '#F6F5F1',
    },
  }).composite(composites).png().toFile(outFile);
  return { branch, path: rel(outFile), rowOrder: subjectMonsterIds, columnStages: stages };
}

await mkdir(validationDir, { recursive: true });
await mkdir(previewDir, { recursive: true });

const heroCampHashIndex = buildHashIndex(HERO_POOL_INITIAL_MONSTER_IDS);
const allMonsterHashIndex = buildHashIndex(allMonsterIds);
const heroCampDuplicates = auditAgainstHashIndex(subjectMonsterIds, heroCampHashIndex, { allowSameMonster: true });
const allMonsterDuplicates = auditAgainstHashIndex(subjectMonsterIds, allMonsterHashIndex);
const withinMonsterDuplicates = auditWithinMonsterDistinctness();
const runtimeImageAudit = await auditRuntimeImages();
const contactSheets = [];
for (const branch of branches) {
  contactSheets.push(await contactSheet(branch));
}

const report = {
  checkedAt,
  rootDir,
  matrix: {
    assetVersion: MONSTER_ASSET_VERSION,
    manifestHash: MONSTER_ASSET_MANIFEST.manifestHash,
    manifestAssetCount: MONSTER_ASSET_MANIFEST.assets.length,
    subjects,
    subjectMonsterCount: subjectMonsterIds.length,
    subjectMonsterIds,
    heroCampMonsterIds: HERO_POOL_INITIAL_MONSTER_IDS,
    branches,
    stages,
    sizes,
  },
  codex: codexAudit(),
  visualSources: visualSourceAudit(),
  heroCampHashAudit: {
    checkedSubjectAssets: subjectMonsterIds.length * branches.length * stages.length * sizes.length,
    checkedHeroCampAssets: HERO_POOL_INITIAL_MONSTER_IDS.length * branches.length * stages.length * sizes.length,
    duplicateCount: heroCampDuplicates.length,
    duplicates: heroCampDuplicates,
    ok: heroCampDuplicates.length === 0,
  },
  allMonsterHashAudit: {
    checkedSubjectAssets: subjectMonsterIds.length * branches.length * stages.length * sizes.length,
    checkedAgainstAssets: allMonsterIds.length * branches.length * stages.length * sizes.length,
    duplicateCount: allMonsterDuplicates.length,
    duplicates: allMonsterDuplicates,
    ok: allMonsterDuplicates.length === 0,
  },
  withinMonsterHashAudit: {
    checkedSubjectAssets: subjectMonsterIds.length * branches.length * stages.length * sizes.length,
    duplicateCount: withinMonsterDuplicates.length,
    duplicates: withinMonsterDuplicates,
    ok: withinMonsterDuplicates.length === 0,
  },
  runtimeImageAudit,
  contactSheets,
};

report.ok = report.codex.ok
  && report.visualSources.ok
  && report.heroCampHashAudit.ok
  && report.allMonsterHashAudit.ok
  && report.withinMonsterHashAudit.ok
  && report.runtimeImageAudit.ok;

const reportFile = path.join(validationDir, `monster-subject-codex-and-art-validation-${stamp}.json`);
await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  ok: report.ok,
  report: rel(reportFile),
  contactSheets: report.contactSheets.map((sheet) => sheet.path),
  manifestHash: report.matrix.manifestHash,
  codexEntries: report.codex.entryCount,
  heroCampDuplicates: report.heroCampHashAudit.duplicateCount,
  allMonsterDuplicates: report.allMonsterHashAudit.duplicateCount,
  withinMonsterDuplicates: report.withinMonsterHashAudit.duplicateCount,
  runtimeFailures: report.runtimeImageAudit.failureCount,
}, null, 2));
