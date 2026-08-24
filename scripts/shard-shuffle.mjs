import { createHash } from 'node:crypto';

export const SHARD_SEED = 'ks2-pr941-69795';

export function seededShuffle(files, seed = SHARD_SEED) {
  const hashed = files.map(f => ({
    file: f,
    hash: createHash('md5').update(seed + f).digest('hex')
  }));
  hashed.sort((a, b) => a.hash.localeCompare(b.hash));
  return hashed.map(h => h.file);
}

export function getShardFiles(files, shardIndex, shardTotal, seed = SHARD_SEED) {
  const shuffled = seededShuffle(files, seed);
  return shuffled.filter((_, i) => i % shardTotal === shardIndex - 1);
}
