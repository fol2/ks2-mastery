// Validate: do the simulated shard memberships match the actual ones?
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const actualMembership = {};
for (let s = 1; s <= 6; s++) {
  const data = JSON.parse(readFileSync(`./shard-${s}-timings.json`, 'utf8'));
  for (const file of Object.keys(data.files)) {
    const norm = file.replace(/^.*?ks2-mastery\/ks2-mastery\//, '');
    actualMembership[norm] = s;
  }
}

const files = Object.keys(actualMembership).sort();

function simulate(files, seed, total) {
  const h = files.map(f => ({ file: f, hash: createHash('md5').update(seed + f).digest('hex') }));
  h.sort((a, b) => a.hash.localeCompare(b.hash));
  const assignment = {};
  h.forEach((x, i) => { assignment[x.file] = (i % total) + 1; });
  return assignment;
}

const simulated = simulate(files, 'v242', 6);
let mismatches = 0, matches = 0;
const mismatchSample = [];
for (const f of files) {
  if (simulated[f] === actualMembership[f]) matches++;
  else {
    mismatches++;
    if (mismatchSample.length < 10) mismatchSample.push([f, simulated[f], actualMembership[f]]);
  }
}
console.log(`Matches: ${matches}, Mismatches: ${mismatches}`);
if (mismatchSample.length) {
  console.log('Sample mismatches (file, simulated, actual):');
  mismatchSample.forEach(m => console.log(`  ${m[0]}: sim=${m[1]} actual=${m[2]}`));
}

// Look at where heavy files actually went
const actualPerShard = Array.from({ length: 7 }, () => 0);
const allTimings = {};
for (let s = 1; s <= 6; s++) {
  const data = JSON.parse(readFileSync(`./shard-${s}-timings.json`, 'utf8'));
  for (const [file, ms] of Object.entries(data.files)) {
    const norm = file.replace(/^.*?ks2-mastery\/ks2-mastery\//, '');
    allTimings[norm] = ms;
    actualPerShard[s] += ms;
  }
}

console.log('\nActual sum(file_ms) per shard:');
for (let s = 1; s <= 6; s++) {
  console.log(`  Shard ${s}: ${actualPerShard[s].toFixed(0)}ms`);
}

console.log('\nHeaviest files — where did they go?');
const sorted = Object.entries(allTimings).sort((a, b) => b[1] - a[1]).slice(0, 15);
for (const [f, ms] of sorted) {
  console.log(`  Shard ${actualMembership[f]}: ${ms.toFixed(0).padStart(7)}ms  ${f}`);
}
