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

function simulate(files, seed, total) {
  const h = files.map(f => ({ file: f, hash: createHash('md5').update(seed + f).digest('hex') }));
  h.sort((a, b) => a.hash.localeCompare(b.hash));
  const assignment = {};
  h.forEach((x, i) => { assignment[x.file] = (i % total) + 1; });
  return assignment;
}

const sim = simulate(files, 'v242', 6);
let matches = 0, mismatches = 0;
for (const f of files) {
  if (sim[f] === actualMembership[f]) matches++;
  else mismatches++;
}
console.log(`With absolute paths: Matches: ${matches}/${files.length}, Mismatches: ${mismatches}`);

// Show heaviest files and their shards
const sorted = Object.entries(allTimings).sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log('\nTop 10 files — simulated vs actual shard:');
for (const [f, ms] of sorted) {
  const marker = sim[f] === actualMembership[f] ? 'OK' : 'MISMATCH';
  console.log(`  sim=${sim[f]} actual=${actualMembership[f]} [${marker}]  ${ms.toFixed(0)}ms  ${f.replace(/.*\/tests\//, 'tests/')}`);
}
