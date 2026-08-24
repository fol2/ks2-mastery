import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getShardFiles, seededShuffle, SHARD_SEED } from '../scripts/shard-shuffle.mjs';

const SAMPLE_FILES = [
  'tests/alpha.test.js',
  'tests/beta.test.js',
  'tests/gamma.test.js',
  'tests/delta.test.js',
  'tests/epsilon.test.js',
  'tests/zeta.test.js',
  'tests/eta.test.js',
  'tests/theta.test.js',
  'tests/iota.test.js',
  'tests/kappa.test.js',
  'tests/lambda.test.js',
  'tests/mu.test.js',
];

describe('seededShuffle', () => {
  it('pins the reviewed CI shard seed', () => {
    assert.equal(SHARD_SEED, 'ks2-pr941-69795');
  });

  it('is deterministic (same input = same output)', () => {
    const first = seededShuffle(SAMPLE_FILES);
    const second = seededShuffle(SAMPLE_FILES);
    assert.deepEqual(first, second);
  });

  it('with different seed produces different order', () => {
    const defaultSeed = seededShuffle(SAMPLE_FILES);
    const altSeed = seededShuffle(SAMPLE_FILES, 'different-seed-2026');
    // At least one element must be in a different position
    const hasDifference = defaultSeed.some((f, i) => f !== altSeed[i]);
    assert.ok(hasDifference, 'Expected different seeds to produce different orderings');
  });
});

describe('getShardFiles', () => {
  it('partitions all files — union of all shards equals original set with no overlaps', () => {
    const total = 3;
    const allShards = [];
    for (let i = 1; i <= total; i++) {
      allShards.push(...getShardFiles(SAMPLE_FILES, i, total));
    }
    // Same set of files (order may differ)
    assert.equal(allShards.length, SAMPLE_FILES.length);
    const sorted = [...allShards].sort();
    const expected = [...SAMPLE_FILES].sort();
    assert.deepEqual(sorted, expected);
  });

  it('no overlaps between shards', () => {
    const total = 4;
    const seen = new Set();
    for (let i = 1; i <= total; i++) {
      const shard = getShardFiles(SAMPLE_FILES, i, total);
      for (const f of shard) {
        assert.ok(!seen.has(f), `File ${f} appears in multiple shards`);
        seen.add(f);
      }
    }
  });

  it('distributes new files deterministically — a new file lands in exactly one shard', () => {
    const filesWithNew = [...SAMPLE_FILES, 'tests/new-feature.test.js'];
    const total = 3;
    let shardContainingNew = null;
    for (let i = 1; i <= total; i++) {
      const shard = getShardFiles(filesWithNew, i, total);
      if (shard.includes('tests/new-feature.test.js')) {
        assert.equal(shardContainingNew, null, 'New file found in multiple shards');
        shardContainingNew = i;
      }
    }
    assert.ok(shardContainingNew !== null, 'New file not found in any shard');

    // Verify it's deterministic — run again
    const secondRun = getShardFiles(filesWithNew, shardContainingNew, total);
    assert.ok(secondRun.includes('tests/new-feature.test.js'));
  });

  it('distribution differs from naive modulo', () => {
    const total = 3;
    // Naive modulo: shard i gets files at indices where idx % total === i-1 (alphabetical)
    const sorted = [...SAMPLE_FILES].sort();
    const naiveShard1 = sorted.filter((_, idx) => idx % total === 0);
    const seededShard1 = getShardFiles(SAMPLE_FILES, 1, total);

    // The seeded shuffle should produce a different assignment than naive modulo
    const isDifferent = naiveShard1.length !== seededShard1.length ||
      naiveShard1.some((f, i) => f !== seededShard1[i]);
    assert.ok(isDifferent, 'Seeded shuffle should differ from naive alphabetical modulo');
  });
});
