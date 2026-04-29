import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getHeroMonsterAssetSrc } from '../src/platform/hero/hero-monster-assets.js';

const HERO_POOL_MONSTERS = ['glossbloom', 'loomrill', 'mirrane', 'colisk', 'hyphang', 'carillon'];

describe('getHeroMonsterAssetSrc', () => {
  describe('all 6 Hero Pool monsters produce valid paths', () => {
    for (const id of HERO_POOL_MONSTERS) {
      it(`${id} — default branch b1, stage 0`, () => {
        const result = getHeroMonsterAssetSrc(id, 0);
        assert.equal(result.key, `${id}-b1-0`);
        assert.equal(result.src, `./assets/monsters/${id}/b1/${id}-b1-0.640.webp`);
      });
    }
  });

  describe('glossbloom b1 stages 0-4', () => {
    for (let s = 0; s <= 4; s++) {
      it(`stage ${s}`, () => {
        const r = getHeroMonsterAssetSrc('glossbloom', s, 'b1');
        assert.equal(r.key, `glossbloom-b1-${s}`);
        assert.equal(r.src, `./assets/monsters/glossbloom/b1/glossbloom-b1-${s}.640.webp`);
      });
    }
  });

  it('missing branch defaults to b1', () => {
    const r = getHeroMonsterAssetSrc('colisk', 2);
    assert.equal(r.src, './assets/monsters/colisk/b1/colisk-b1-2.640.webp');
  });

  it('stage as string "2" coerces correctly', () => {
    const r = getHeroMonsterAssetSrc('mirrane', '2', 'b1');
    assert.equal(r.key, 'mirrane-b1-2');
    assert.equal(r.src, './assets/monsters/mirrane/b1/mirrane-b1-2.640.webp');
  });

  it('stage NaN defaults to 0', () => {
    const r = getHeroMonsterAssetSrc('hyphang', NaN, 'b1');
    assert.equal(r.key, 'hyphang-b1-0');
    assert.equal(r.src, './assets/monsters/hyphang/b1/hyphang-b1-0.640.webp');
  });

  it('stage undefined defaults to 0', () => {
    const r = getHeroMonsterAssetSrc('carillon', undefined, 'b1');
    assert.equal(r.key, 'carillon-b1-0');
    assert.equal(r.src, './assets/monsters/carillon/b1/carillon-b1-0.640.webp');
  });

  it('fallback always points to stage 0', () => {
    const r = getHeroMonsterAssetSrc('glossbloom', 3, 'b1');
    assert.equal(r.fallback, './assets/monsters/glossbloom/b1/glossbloom-b1-0.640.webp');
  });

  it('srcSet includes all three sizes with dot-separated format', () => {
    const r = getHeroMonsterAssetSrc('loomrill', 1, 'b1');
    const parts = r.srcSet.split(', ');
    assert.equal(parts.length, 3);
    assert.equal(parts[0], './assets/monsters/loomrill/b1/loomrill-b1-1.320.webp 320w');
    assert.equal(parts[1], './assets/monsters/loomrill/b1/loomrill-b1-1.640.webp 640w');
    assert.equal(parts[2], './assets/monsters/loomrill/b1/loomrill-b1-1.1280.webp 1280w');
  });
});
