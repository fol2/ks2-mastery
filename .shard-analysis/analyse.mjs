import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const allTimings = {};
const actualMembership = {};
const perShard = {};
for (let s = 1; s <= 6; s++) {
  const data = JSON.parse(readFileSync(`./shard-${s}-timings.json`, 'utf8'));
  perShard[s] = { wallMs: data.wallMs, fileCount: Object.keys(data.files).length };
  for (const [file, ms] of Object.entries(data.files)) {
    allTimings[file] = ms; // keep absolute paths as-is (matches CI's hash input)
    actualMembership[file] = s;
  }
  const total = Object.values(data.files).reduce((a, b) => a + b, 0);
  console.log(`Shard ${s}: wallMs=${data.wallMs}, sum(file_ms)=${total.toFixed(0)}, files=${Object.keys(data.files).length}`);
}

const files = Object.keys(allTimings).sort();
console.log(`\nTotal files with timing: ${files.length}`);
const totalFileMs = Object.values(allTimings).reduce((a, b) => a + b, 0);
console.log(`Total sum(file_ms): ${totalFileMs.toFixed(0)} = ${(totalFileMs/1000).toFixed(1)}s`);

const sorted = Object.entries(allTimings).sort((a, b) => b[1] - a[1]);
console.log('\nTop 30 heaviest files:');
for (let i = 0; i < 30; i++) {
  const pct = (sorted[i][1] / totalFileMs * 100).toFixed(1);
  console.log(`  ${sorted[i][1].toFixed(0).padStart(7)}ms (${pct.padStart(4)}%)  ${sorted[i][0]}`);
}

function hashed(file, seed) {
  return createHash('md5').update(seed + file).digest('hex');
}

function simulateShuffle(files, seed, total) {
  const h = files.map(f => ({ file: f, hash: hashed(f, seed) }));
  h.sort((a, b) => a.hash.localeCompare(b.hash));
  const shards = Array.from({ length: total }, () => []);
  h.forEach((x, i) => shards[i % total].push(x.file));
  return shards;
}

function shardDurations(shards, timings) {
  return shards.map(files => files.reduce((acc, f) => acc + (timings[f] || 0), 0));
}

const currentShards = simulateShuffle(files, 'v242', 6);
const currentDur = shardDurations(currentShards, allTimings);
console.log('\n=== Current seed v242 ===');
currentDur.forEach((d, i) => console.log(`  Shard ${i+1}: ${d.toFixed(0)}ms (${currentShards[i].length} files)`));
console.log(`  Max: ${Math.max(...currentDur).toFixed(0)}ms, Min: ${Math.min(...currentDur).toFixed(0)}ms, Ratio: ${(Math.max(...currentDur)/Math.min(...currentDur)).toFixed(2)}`);

console.log('\n=== Seed search (try 10000 seeds) ===');
let bestSeed = { seed: 'v242', max: Math.max(...currentDur), durs: currentDur };
for (let n = 0; n < 10000; n++) {
  const seed = `v${n}`;
  const shards = simulateShuffle(files, seed, 6);
  const durs = shardDurations(shards, allTimings);
  const max = Math.max(...durs);
  if (max < bestSeed.max) bestSeed = { seed, max, durs };
}
console.log(`Best 'v<n>' seed: ${bestSeed.seed}, max=${bestSeed.max.toFixed(0)}ms`);
bestSeed.durs.forEach((d, i) => console.log(`  Shard ${i+1}: ${d.toFixed(0)}ms`));

// Try more exotic seed patterns
console.log('\n=== Extended seed search (alpha prefixes) ===');
const prefixes = ['ks2', 'ci', 'shard', 'balance', 'r7', 'x', 'seed', 'hash'];
for (const p of prefixes) {
  for (let n = 0; n < 2000; n++) {
    const seed = `${p}${n}`;
    const shards = simulateShuffle(files, seed, 6);
    const durs = shardDurations(shards, allTimings);
    const max = Math.max(...durs);
    if (max < bestSeed.max) bestSeed = { seed, max, durs };
  }
}
console.log(`Best overall seed found: ${bestSeed.seed}, max=${bestSeed.max.toFixed(0)}ms`);
bestSeed.durs.forEach((d, i) => console.log(`  Shard ${i+1}: ${d.toFixed(0)}ms`));

// LPT (longest-processing-time-first) greedy bin packing
function lptPack(files, timings, total) {
  const sorted = [...files].sort((a, b) => (timings[b] || 0) - (timings[a] || 0));
  const shards = Array.from({ length: total }, (_, i) => ({ idx: i, files: [], dur: 0 }));
  for (const f of sorted) {
    shards.sort((a, b) => a.dur - b.dur);
    shards[0].files.push(f);
    shards[0].dur += timings[f] || 0;
  }
  return shards.sort((a, b) => a.idx - b.idx);
}

const lpt = lptPack(files, allTimings, 6);
console.log('\n=== LPT (longest-processing-time-first) bin packing ===');
lpt.forEach((s, i) => console.log(`  Shard ${i+1}: ${s.dur.toFixed(0)}ms (${s.files.length} files)`));
const lptMax = Math.max(...lpt.map(s => s.dur));
const lptMin = Math.min(...lpt.map(s => s.dur));
console.log(`  Max: ${lptMax.toFixed(0)}ms, Min: ${lptMin.toFixed(0)}ms, Ratio: ${(lptMax/lptMin).toFixed(2)}`);

// Wall-time vs sum analysis: the CI wall ≠ sum because tests run concurrently per file inside a shard
console.log('\n=== Wall vs sum analysis ===');
for (let s = 1; s <= 6; s++) {
  const data = JSON.parse(readFileSync(`./shard-${s}-timings.json`, 'utf8'));
  const sumMs = Object.values(data.files).reduce((a, b) => a + b, 0);
  const overhead = data.wallMs - sumMs;
  console.log(`  Shard ${s}: wall=${data.wallMs}ms, sum=${sumMs.toFixed(0)}ms, overhead=${overhead.toFixed(0)}ms (${(overhead/data.wallMs*100).toFixed(1)}% fixed)`);
}
