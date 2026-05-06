// Predicting wall time from file timings
// node:test runs files in parallel with concurrency = os.availableParallelism()
// GitHub Actions ubuntu-latest = 4 vCPUs
// Within each file, tests also run concurrently.
//
// Wall(shard) ≈ (sum(file_ms) / concurrency) + startup_overhead
// But that's a lower bound — critical path (heaviest serial chain) raises it.

import { readFileSync } from 'node:fs';

const shards = {};
for (let s = 1; s <= 6; s++) {
  const data = JSON.parse(readFileSync(`./shard-${s}-timings.json`, 'utf8'));
  shards[s] = {
    wallMs: data.wallMs,
    fileTimings: Object.entries(data.files).map(([f, ms]) => ({ f, ms })).sort((a, b) => b.ms - a.ms),
  };
}

// Fit: wall = a * sum + b * max + c
for (const s of [1, 2, 3, 4, 5, 6]) {
  const d = shards[s];
  const sum = d.fileTimings.reduce((a, b) => a + b.ms, 0);
  const max = d.fileTimings[0]?.ms || 0;
  const p95File = d.fileTimings[Math.floor(d.fileTimings.length * 0.05)]?.ms || 0;
  const top5Sum = d.fileTimings.slice(0, 5).reduce((a, b) => a + b.ms, 0);
  console.log(`Shard ${s}: wall=${d.wallMs}ms sum=${sum.toFixed(0)} max=${max.toFixed(0)} top5=${top5Sum.toFixed(0)} wall/sum=${(d.wallMs/sum).toFixed(3)} wall-max=${(d.wallMs-max).toFixed(0)}`);
}

// Predict wall: assume 4 vCPUs with good parallelism, startup overhead ~15s (setup-node + install)
// wall ≈ max(max_file, sum / 4) + startup
const startup = 15000; // setup + install
const concurrency = 4;
console.log('\nPredicted wall (assume 4 CPU, 15s startup):');
for (let s = 1; s <= 6; s++) {
  const d = shards[s];
  const sum = d.fileTimings.reduce((a, b) => a + b.ms, 0);
  const max = d.fileTimings[0]?.ms || 0;
  const predicted = Math.max(max, sum / concurrency) + startup;
  console.log(`  Shard ${s}: actual=${d.wallMs}ms predicted=${predicted.toFixed(0)}ms diff=${(d.wallMs - predicted).toFixed(0)}ms`);
}

// Try a different model: wall = A * sum + B (fit via 2-var regression)
const obs = [1, 2, 3, 4, 5, 6].map(s => {
  const d = shards[s];
  const sum = d.fileTimings.reduce((a, b) => a + b.ms, 0);
  return { sum, wall: d.wallMs };
});
const n = obs.length;
const sumX = obs.reduce((a, o) => a + o.sum, 0);
const sumY = obs.reduce((a, o) => a + o.wall, 0);
const sumXY = obs.reduce((a, o) => a + o.sum * o.wall, 0);
const sumXX = obs.reduce((a, o) => a + o.sum * o.sum, 0);
const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
const intercept = (sumY - slope * sumX) / n;
console.log(`\nLinear fit: wall = ${slope.toFixed(4)} * sum + ${intercept.toFixed(0)}`);
for (const o of obs) {
  const predicted = slope * o.sum + intercept;
  console.log(`  sum=${o.sum.toFixed(0)} actual_wall=${o.wall} predicted_wall=${predicted.toFixed(0)} diff=${(o.wall - predicted).toFixed(0)}`);
}
