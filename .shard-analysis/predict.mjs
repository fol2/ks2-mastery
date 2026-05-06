// Predict wall times for each strategy: current v242, best seed, LPT packing
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const allTimings = {};
const actualMembership = {};
for (let s = 1; s <= 6; s++) {
  const data = JSON.parse(readFileSync(`./shard-${s}-timings.json`, 'utf8'));
  for (const [file, ms] of Object.entries(data.files)) {
    allTimings[file] = ms;
    actualMembership[file] = s;
  }
}

const files = Object.keys(allTimings).sort();

// Calibrated from actual data: wall ≈ 0.305 * sum + 11600
const A = 0.305;
const B = 11600;
function predictWall(sumMs) { return A * sumMs + B; }

function seededShuffle(files, seed, total) {
  const h = files.map(f => ({ file: f, hash: createHash('md5').update(seed + f).digest('hex') }));
  h.sort((a, b) => a.hash.localeCompare(b.hash));
  const shards = Array.from({ length: total }, () => []);
  h.forEach((x, i) => shards[i % total].push(x.file));
  return shards;
}

function shardSums(shards, timings) {
  return shards.map(files => files.reduce((acc, f) => acc + (timings[f] || 0), 0));
}

function lptPack(files, timings, total) {
  const sorted = [...files].sort((a, b) => (timings[b] || 0) - (timings[a] || 0));
  const shards = Array.from({ length: total }, (_, i) => ({ idx: i, files: [], dur: 0 }));
  for (const f of sorted) {
    shards.sort((a, b) => a.dur - b.dur);
    shards[0].files.push(f);
    shards[0].dur += timings[f] || 0;
  }
  return shards.sort((a, b) => a.idx - b.idx).map(s => s.files);
}

function report(name, sums) {
  const walls = sums.map(predictWall);
  const maxWall = Math.max(...walls);
  const totalWall = walls.reduce((a, b) => a + b, 0);
  console.log(`\n=== ${name} ===`);
  sums.forEach((s, i) => console.log(`  Shard ${i+1}: sum=${s.toFixed(0).padStart(7)}ms  predicted_wall=${walls[i].toFixed(0).padStart(6)}ms`));
  console.log(`  MAX WALL: ${maxWall.toFixed(0)}ms (${(maxWall/1000).toFixed(1)}s)`);
  console.log(`  Total CPU: ${totalWall.toFixed(0)}ms (${(totalWall/1000).toFixed(1)}s)`);
  return maxWall;
}

// Baseline: actual R6 run
console.log('=== R6 actual wall times (from CI artifacts) ===');
console.log('  Shard 1: 124088ms (141s reported)');
console.log('  Shard 2:  57836ms (83s reported)');
console.log('  Shard 3: 137426ms (160s reported)');
console.log('  Shard 4:  74989ms (89s reported)');
console.log('  Shard 5:  32204ms (54s reported)');
console.log('  Shard 6:  46320ms (76s reported)');
console.log('  (Wall times in CI include queue + setup + install + test + upload. Our fit captures the "test phase only"; the 15-20s gap is job housekeeping.)');

// Strategy 1: current seed v242
const v242 = seededShuffle(files, 'v242', 6);
const v242Sums = shardSums(v242, allTimings);
report('Strategy 1 — Current v242 (in-workspace simulation)', v242Sums);

// Strategy 2: seed search
console.log('\n=== Strategy 2 — Seed search (100k seeds) ===');
let best = { seed: 'v242', max: Math.max(...v242Sums), sums: v242Sums };
const prefixes = ['v', 'ks2-', 'shard-', 'seed-', 's', 'ci-'];
let tried = 0;
for (const p of prefixes) {
  for (let n = 0; n < 20000; n++) {
    const seed = `${p}${n}`;
    const sh = seededShuffle(files, seed, 6);
    const sums = shardSums(sh, allTimings);
    const max = Math.max(...sums);
    if (max < best.max) best = { seed, max, sums };
    tried++;
  }
}
console.log(`Tried ${tried} seeds; best: "${best.seed}"`);
report(`Strategy 2 — Best seed "${best.seed}"`, best.sums);

// Strategy 3: LPT bin packing
const lpt = lptPack(files, allTimings, 6);
const lptSums = shardSums(lpt, allTimings);
report('Strategy 3 — LPT (longest-first-fit-decreasing)', lptSums);

// Strategy 4: what if we also split the heaviest file in half?
const sortedFiles = Object.entries(allTimings).sort((a, b) => b[1] - a[1]);
const withSplit = { ...allTimings };
delete withSplit[sortedFiles[0][0]];
withSplit[sortedFiles[0][0] + '.part1'] = sortedFiles[0][1] / 2;
withSplit[sortedFiles[0][0] + '.part2'] = sortedFiles[0][1] / 2;
const filesSplit = Object.keys(withSplit);
const lptSplit = lptPack(filesSplit, withSplit, 6);
const lptSplitSums = shardSums(lptSplit, withSplit);
report(`Strategy 4 — LPT + split ${sortedFiles[0][0].replace(/.*\//,'')} (120s file)`, lptSplitSums);

// Strategy 5: LPT + split top 2 heavy files
const withSplit2 = { ...allTimings };
for (let i = 0; i < 2; i++) {
  delete withSplit2[sortedFiles[i][0]];
  withSplit2[sortedFiles[i][0] + '.part1'] = sortedFiles[i][1] / 2;
  withSplit2[sortedFiles[i][0] + '.part2'] = sortedFiles[i][1] / 2;
}
const filesSplit2 = Object.keys(withSplit2);
const lptSplit2 = lptPack(filesSplit2, withSplit2, 6);
const lptSplit2Sums = shardSums(lptSplit2, withSplit2);
report('Strategy 5 — LPT + split top 2 heavy files', lptSplit2Sums);
