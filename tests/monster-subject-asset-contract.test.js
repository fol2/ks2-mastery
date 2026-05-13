import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MONSTER_ASSET_MANIFEST } from '../src/platform/game/monster-asset-manifest.js';
import {
  MONSTERS,
  MONSTERS_BY_SUBJECT,
  monsterAsset,
  monsterAssetSrcSet,
} from '../src/platform/game/monsters.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const SUBJECTS_WITH_OWNED_ASSETS = ['reading', 'arithmetic', 'reasoning'];
const BRANCHES = ['b1', 'b2'];
const STAGES = [0, 1, 2, 3, 4];
const SIZES = [320, 640, 1280];

const manifestAssetsByKey = new Map(MONSTER_ASSET_MANIFEST.assets.map((asset) => [asset.key, asset]));
const subjectMonsterIds = SUBJECTS_WITH_OWNED_ASSETS.flatMap((subject) => MONSTERS_BY_SUBJECT[subject]);

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
    /^\.\/assets\/monsters\/readbloom\/b2\/readbloom-b2-2\.640\.webp\?v=20260513-subject-assets$/,
  );
  assert.match(
    monsterAsset('arithon', 4, 1280, 'b1'),
    /^\.\/assets\/monsters\/arithon\/b1\/arithon-b1-4\.1280\.webp\?v=20260513-subject-assets$/,
  );
  assert.match(
    monsterAsset('strategon', 1, 320, 'b2'),
    /^\.\/assets\/monsters\/strategon\/b2\/strategon-b2-1\.320\.webp\?v=20260513-subject-assets$/,
  );

  const srcSet = monsterAssetSrcSet('lorequill', 4, 'b2');
  assert.match(srcSet, /lorequill-b2-4\.320\.webp\?v=20260513-subject-assets 320w/);
  assert.match(srcSet, /lorequill-b2-4\.1280\.webp\?v=20260513-subject-assets 1280w/);
});
