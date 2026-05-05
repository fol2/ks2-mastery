import { createHash } from 'node:crypto';

const SEED = 'ks2-ci-r5-1';

export function seededShuffle(files, seed = SEED) {
  const hashed = files.map(f => ({
    file: f,
    hash: createHash('md5').update(seed + f).digest('hex')
  }));
  hashed.sort((a, b) => a.hash.localeCompare(b.hash));
  return hashed.map(h => h.file);
}

export function getShardFiles(files, shardIndex, shardTotal, seed = SEED) {
  const shuffled = seededShuffle(files, seed);
  return shuffled.filter((_, i) => i % shardTotal === shardIndex - 1);
}
