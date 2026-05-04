# Implementation Plan: CI Shard Balance Optimisation

**Contract:** `docs/contracts/ci-shard-balance.md`
**Date:** 2026-05-05

---

## Unit 1: Seeded shuffle + timing artifact + tripwire (R1, R2, R3, R4)

All requirements are tightly coupled and small enough for a single PR (~50 lines total).

### Files to modify

- `scripts/run-node-tests.mjs` — replace modulo distribution with seeded shuffle; emit timing artifact

### Files to create

- `scripts/shard-shuffle.mjs` — exported `shuffleFiles(files, seed, shardIndex, shardTotal)` function
- `.github/workflows/ci.yml` — add tripwire step in ci-gate job

### Implementation

**1. Seeded shuffle (`scripts/shard-shuffle.mjs`):**

```js
import { createHash } from 'node:crypto';

export function seededShuffle(files, seed) {
  const hashed = files.map(f => ({
    file: f,
    hash: createHash('md5').update(seed + f).digest('hex')
  }));
  hashed.sort((a, b) => a.hash.localeCompare(b.hash));
  return hashed.map(h => h.file);
}

export function getShardFiles(files, seed, index, total) {
  const shuffled = seededShuffle(files, seed);
  return shuffled.filter((_, i) => i % total === index - 1);
}
```

Seed: constant `'ks2-shard-seed-2026'` (pinned in source, deterministic).

**2. Integration in `run-node-tests.mjs`:**

In the `run()` path (the non-spawn path), when `shard` option is present:
- Instead of passing `shard: { index, total }` to `run()` (which uses Node's internal modulo), call `getShardFiles(files, SEED, index, total)` to pre-filter the file list, then pass the filtered list to `run({ files: filteredFiles })` without the shard option.
- This replaces Node's modulo with our shuffle-based distribution.

**3. Timing artifact (`run-node-tests.mjs`):**

After tests complete in the `run()` path, collect per-file durations from `test:pass`/`test:fail` events. Write `shard-${index}-timings.json` to the workspace. CI uploads it as an artifact.

In `ci.yml`, add to the test job:
```yaml
      - name: Upload shard timing
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: shard-${{ matrix.shard }}-timings
          path: shard-*-timings.json
          retention-days: 14
          if-no-files-found: ignore
```

**4. Tripwire in ci-gate (`.github/workflows/ci.yml`):**

Add a step that downloads all shard timing artifacts and checks max/min ratio:
```yaml
      - name: Check shard balance
        if: always() && needs.test.result == 'success'
        uses: actions/download-artifact@v4
        with:
          pattern: shard-*-timings
          merge-multiple: true
      - name: Evaluate balance
        if: always() && needs.test.result == 'success'
        run: |
          node -e "
            const fs = require('fs');
            const files = fs.readdirSync('.').filter(f => f.startsWith('shard-') && f.endsWith('-timings.json'));
            if (files.length < 2) process.exit(0);
            const durations = files.map(f => JSON.parse(fs.readFileSync(f)).wallMs);
            const max = Math.max(...durations);
            const min = Math.min(...durations);
            const ratio = max / min;
            console.log('Shard balance: max=' + max + 'ms min=' + min + 'ms ratio=' + ratio.toFixed(2));
            if (ratio > 2.5) console.log('::warning::Shard imbalance detected (ratio ' + ratio.toFixed(2) + ' > 2.5). Consider splitting heavy test files.');
          "
```

### Tests

- `tests/shard-shuffle.test.js`:
  - Verify `seededShuffle` is deterministic (same input = same output)
  - Verify `getShardFiles` partitions all files with no overlaps and no drops
  - Verify different seeds produce different orderings
  - Verify new files are distributed (add a file to the list, confirm it lands in exactly one shard)
  - Verify shard assignment is different from modulo (proving shuffle actually changes distribution)

### Acceptance criteria

- `npm test` still passes (no regression)
- CI shards use shuffle-based distribution
- Timing artifact uploaded per shard
- Tripwire fires only when ratio > 2.5
- New test files auto-distributed without manual intervention
- Same 6 jobs, same billing

---

## Unit 2: Measure and split >90s files if needed (R5)

**DEFERRED until after Unit 1 ships.**

After Unit 1 is deployed, observe the timing artifacts from 2-3 CI runs. If any single file exceeds 90s, split it (following the same pattern as Round 2). If all files are under 90s after the shuffle redistribution, this unit is a no-op.

**Autonomous equivalent:** The timing artifact from Unit 1 provides the measurement. A test in `shard-shuffle.test.js` can assert that no file in the most recent artifact exceeds 90s (once data is available).

---

## Ordering

```
Unit 1 (shuffle + artifact + tripwire) — single PR
  ↓
Unit 2 (split >90s files) — only if timing data shows the need
```
