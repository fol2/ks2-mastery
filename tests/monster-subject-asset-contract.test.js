import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { HERO_POOL_INITIAL_MONSTER_IDS } from '../shared/hero/hero-pool.js';
import { MONSTER_ASSET_MANIFEST } from '../src/platform/game/monster-asset-manifest.js';
import {
  MONSTERS,
  MONSTERS_BY_SUBJECT,
  monsterAsset,
  monsterAssetSrcSet,
} from '../src/platform/game/monsters.js';
import { monsterVisualSourceMonsterId } from '../src/platform/game/monster-visual-config.js';
import { monsterSummaryFromState } from '../src/platform/game/mastery/spelling.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const SUBJECTS_WITH_OWNED_ASSETS = ['reading', 'arithmetic', 'reasoning'];
const BRANCHES = ['b1', 'b2'];
const STAGES = [0, 1, 2, 3, 4];
const SIZES = [320, 640, 1280];

const manifestAssetsByKey = new Map(MONSTER_ASSET_MANIFEST.assets.map((asset) => [asset.key, asset]));
const subjectMonsterIds = SUBJECTS_WITH_OWNED_ASSETS.flatMap((subject) => MONSTERS_BY_SUBJECT[subject]);
const allMonsterIds = Object.keys(MONSTERS);
const PRE_SUBJECT_ART_METADATA_ONLY_MANIFEST_HASH = '933ba1c0858d0f5b5b223a97';

function monsterAssetPath(monsterId, branch, stage, size) {
  return path.join(rootDir, 'assets', 'monsters', monsterId, branch, `${monsterId}-${branch}-${stage}.${size}.webp`);
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

test('Reading, Arithmetic, and Reasoning monsters own their visual asset ids', () => {
  for (const monsterId of subjectMonsterIds) {
    assert.ok(MONSTERS[monsterId], `expected metadata for ${monsterId}`);
    assert.equal(
      Object.hasOwn(MONSTERS[monsterId], 'assetId'),
      false,
      `${monsterId} must not alias another monster asset family`,
    );
  }
});

test('subject-owned monster folders cover both branches, every stage, and every shipped size', async () => {
  for (const monsterId of subjectMonsterIds) {
    for (const branch of BRANCHES) {
      for (const stage of STAGES) {
        const key = `${monsterId}-${branch}-${stage}`;
        const asset = manifestAssetsByKey.get(key);

        assert.ok(asset, `expected manifest asset ${key}`);
        assert.equal(asset.monsterId, monsterId);
        assert.equal(asset.branch, branch);
        assert.equal(asset.stage, stage);
        assert.deepEqual(asset.sizes, SIZES);

        for (const size of SIZES) {
          const expectedSrc = `./assets/monsters/${monsterId}/${branch}/${monsterId}-${branch}-${stage}.${size}.webp`;
          assert.equal(asset.srcBySize[String(size)], expectedSrc);
          await access(path.join(rootDir, expectedSrc.replace(/^\.\//, '')));
        }
      }
    }
  }
});

test('monsterAsset resolves subject monsters to subject-owned paths', () => {
  assert.match(
    monsterAsset('readbloom', 2, 640, 'b2'),
    /^\.\/assets\/monsters\/readbloom\/b2\/readbloom-b2-2\.640\.webp\?v=20260514-subject-assets$/,
  );
  assert.match(
    monsterAsset('arithon', 4, 1280, 'b1'),
    /^\.\/assets\/monsters\/arithon\/b1\/arithon-b1-4\.1280\.webp\?v=20260514-subject-assets$/,
  );
  assert.match(
    monsterAsset('strategon', 1, 320, 'b2'),
    /^\.\/assets\/monsters\/strategon\/b2\/strategon-b2-1\.320\.webp\?v=20260514-subject-assets$/,
  );

  const srcSet = monsterAssetSrcSet('lorequill', 4, 'b2');
  assert.match(srcSet, /lorequill-b2-4\.320\.webp\?v=20260514-subject-assets 320w/);
  assert.match(srcSet, /lorequill-b2-4\.1280\.webp\?v=20260514-subject-assets 1280w/);
});

test('subject art rollout invalidates cached visual config compatibility hash', () => {
  assert.notEqual(
    MONSTER_ASSET_MANIFEST.manifestHash,
    PRE_SUBJECT_ART_METADATA_ONLY_MANIFEST_HASH,
    'manifestHash must reflect WebP byte changes, not only folder and filename metadata',
  );
});

test('subject-owned Reading, Arithmetic, and Reasoning art is distinct from Hero Camp reserve art', () => {
  const heroCampHashes = new Map();
  for (const monsterId of HERO_POOL_INITIAL_MONSTER_IDS) {
    for (const branch of BRANCHES) {
      for (const stage of STAGES) {
        for (const size of SIZES) {
          const filePath = monsterAssetPath(monsterId, branch, stage, size);
          const hash = sha256(filePath);
          const matches = heroCampHashes.get(hash) || [];
          matches.push(`${monsterId}/${branch}/stage-${stage}/${size}`);
          heroCampHashes.set(hash, matches);
        }
      }
    }
  }

  const duplicates = [];
  for (const monsterId of subjectMonsterIds) {
    for (const branch of BRANCHES) {
      for (const stage of STAGES) {
        for (const size of SIZES) {
          const filePath = monsterAssetPath(monsterId, branch, stage, size);
          const matches = heroCampHashes.get(sha256(filePath));
          if (matches) {
            duplicates.push(`${monsterId}/${branch}/stage-${stage}/${size} duplicates ${matches.join(', ')}`);
          }
        }
      }
    }
  }

  assert.deepEqual(duplicates, []);
});

test('subject-owned Reading, Arithmetic, and Reasoning art is distinct from every other monster family', () => {
  const hashesByValue = new Map();
  for (const monsterId of allMonsterIds) {
    for (const branch of BRANCHES) {
      for (const stage of STAGES) {
        for (const size of SIZES) {
          const hash = sha256(monsterAssetPath(monsterId, branch, stage, size));
          const matches = hashesByValue.get(hash) || [];
          matches.push({ monsterId, branch, stage, size });
          hashesByValue.set(hash, matches);
        }
      }
    }
  }

  const duplicates = [];
  for (const monsterId of subjectMonsterIds) {
    for (const branch of BRANCHES) {
      for (const stage of STAGES) {
        for (const size of SIZES) {
          const hash = sha256(monsterAssetPath(monsterId, branch, stage, size));
          const matches = hashesByValue.get(hash) || [];
          const duplicateFamilies = matches
            .filter((match) => match.monsterId !== monsterId)
            .map((match) => `${match.monsterId}/${match.branch}/stage-${match.stage}/${match.size}`);
          if (duplicateFamilies.length) {
            duplicates.push(`${monsterId}/${branch}/stage-${stage}/${size} duplicates ${duplicateFamilies.join(', ')}`);
          }
        }
      }
    }
  }

  assert.deepEqual(duplicates, []);
});

test('subject-owned Reading, Arithmetic, and Reasoning art is distinct across each monster branch and stage', () => {
  const duplicates = [];
  for (const monsterId of subjectMonsterIds) {
    for (const size of SIZES) {
      const hashesByValue = new Map();
      for (const branch of BRANCHES) {
        for (const stage of STAGES) {
          const hash = sha256(monsterAssetPath(monsterId, branch, stage, size));
          const matches = hashesByValue.get(hash) || [];
          matches.push(`${branch}/stage-${stage}/${size}`);
          hashesByValue.set(hash, matches);
        }
      }

      for (const matches of hashesByValue.values()) {
        if (matches.length > 1) {
          duplicates.push(`${monsterId}/${size} duplicates ${matches.join(', ')}`);
        }
      }
    }
  }

  assert.deepEqual(duplicates, []);
});

test('subject-owned Reading, Arithmetic, and Reasoning monsters do not inherit Hero Camp reserve visual sources', () => {
  const heroCampIds = new Set(HERO_POOL_INITIAL_MONSTER_IDS);
  const leakedSources = subjectMonsterIds
    .map((monsterId) => ({ monsterId, sourceMonsterId: monsterVisualSourceMonsterId(monsterId) }))
    .filter((entry) => heroCampIds.has(entry.sourceMonsterId));

  assert.deepEqual(leakedSources, []);
});

test('subject-owned Reading, Arithmetic, and Reasoning monsters do not inherit any other monster visual source', () => {
  const inheritedSources = subjectMonsterIds
    .map((monsterId) => ({ monsterId, sourceMonsterId: monsterVisualSourceMonsterId(monsterId) }))
    .filter((entry) => entry.sourceMonsterId !== entry.monsterId);

  assert.deepEqual(inheritedSources, []);
});

test('Reasoning monster progress reaches the shared Home and Codex summary', () => {
  const summary = monsterSummaryFromState({
    numdrake: {
      caught: true,
      branch: 'b2',
      releaseId: 'reasoning-p1-2026-05-12',
      mastered: ['reasoning-p1-2026-05-12:reasoning-evidence:pv_rounding:item-1'],
      starHighWater: 10,
    },
  });

  const numdrake = summary.find((entry) => entry.subjectId === 'reasoning' && entry.monster.id === 'numdrake');
  assert.ok(numdrake, 'caught Reasoning monster should be present in the shared monster summary');
  assert.equal(numdrake.progress.caught, true);
  assert.equal(numdrake.progress.branch, 'b2');
  assert.equal(numdrake.progress.displayStars, 10);
});
