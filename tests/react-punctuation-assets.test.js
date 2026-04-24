import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MONSTERS } from '../src/platform/game/monsters.js';
import { punctuationMonsterSummaryFromState } from '../src/platform/game/monster-system.js';
import { buildCodexEntries } from '../src/surfaces/home/data.js';
import {
  createPunctuationMasteryKey,
  PUNCTUATION_RELEASE_ID,
} from '../shared/punctuation/content.js';
import {
  bellstormSceneForPhase,
  punctuationMonsterAsset,
} from '../src/subjects/punctuation/components/punctuation-view-model.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function assetPathFromUrl(url) {
  const clean = String(url || '').replace(/^\.\//, '').replace(/^\//, '').split('?')[0];
  return path.join(rootDir, clean);
}

test('Bellstorm scene view model points at provided region assets', () => {
  for (const phase of ['setup', 'active-item', 'feedback', 'summary']) {
    const scene = bellstormSceneForPhase(phase);
    assert.match(scene.src, /^\/assets\/regions\/bellstorm-coast\/bellstorm-coast-[a-z0-9-]+\.1280\.webp$/);
    assert.match(scene.srcSet, /640\.webp 640w/);
    assert.match(scene.srcSet, /1280\.webp 1280w/);
    assert.equal(existsSync(assetPathFromUrl(scene.src)), true, `${scene.src} should exist`);
  }
});

test('punctuation monster view model points at provided branch and stage assets', () => {
  for (const monsterId of ['pealark', 'claspin', 'quoral', 'curlune', 'colisk', 'hyphang', 'carillon']) {
    const asset = punctuationMonsterAsset(monsterId, 2, 'b1');
    assert.equal(asset.id, monsterId);
    assert.equal(asset.stage, 2);
    assert.match(asset.src, new RegExp(`assets/monsters/${monsterId}/b1/${monsterId}-b1-2\\.640\\.webp`));
    assert.match(asset.srcSet, new RegExp(`${monsterId}-b1-2\\.1280\\.webp\\?v=[^ ]+ 1280w`));
    assert.equal(existsSync(assetPathFromUrl(asset.src)), true, `${asset.src} should exist`);
  }
});

test('Codex entries describe Punctuation as secure units rather than spelling words', () => {
  const masteryKey = createPunctuationMasteryKey({
    releaseId: PUNCTUATION_RELEASE_ID,
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
  });
  const summary = punctuationMonsterSummaryFromState({
    pealark: {
      mastered: [masteryKey],
      publishedTotal: 1,
      caught: true,
      branch: 'b1',
    },
    carillon: {
      mastered: [masteryKey],
      publishedTotal: 10,
      caught: true,
      branch: 'b2',
    },
  }, { aggregateTotal: 10 });
  const entries = buildCodexEntries(summary);
  const pealark = entries.find((entry) => entry.id === 'pealark');
  const carillon = entries.find((entry) => entry.id === 'carillon');

  assert.equal(pealark.subjectId, 'punctuation');
  assert.equal(pealark.secureLabel, '1 secure unit');
  assert.equal(pealark.wordBand, 'Endmarks');
  assert.equal(pealark.nextGoal, 'Fully evolved');
  assert.match(pealark.img, /assets\/monsters\/pealark\/b1\/pealark-b1-4\.640\.webp/);

  assert.equal(carillon.subjectId, 'punctuation');
  assert.equal(carillon.secureLabel, '1 secure unit');
  assert.equal(carillon.wordBand, 'Published punctuation release');
  assert.equal(carillon.progressPct, 10);
});

test('Codex entry defaults remain spelling-compatible', () => {
  const [entry] = buildCodexEntries([
    { monster: MONSTERS.inklet, progress: { caught: true, mastered: 1, stage: 0, level: 0, branch: 'b1' } },
  ]);

  assert.equal(entry.subjectId, 'spelling');
  assert.equal(entry.secureLabel, '1 secure word');
  assert.equal(entry.wordBand, 'Years 3-4 spellings');
});
