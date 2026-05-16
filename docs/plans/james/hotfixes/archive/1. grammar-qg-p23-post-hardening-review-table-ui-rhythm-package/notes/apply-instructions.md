# Apply Instructions

From a clean repository checkout matching `ks2-mastery-lean-05121226.zip`:

```bash
git apply --check patches/001-grammar-qg-p23-table-row-options-and-practice-rhythm.patch
git apply patches/001-grammar-qg-p23-table-row-options-and-practice-rhythm.patch
```

Then run:

```bash
node --check worker/src/subjects/grammar/read-models.js
node --check worker/src/subjects/grammar/selection.js
node --test tests/grammar-engine-generation.test.js
node --test tests/grammar-selection-core-freshness.test.js
node --test tests/grammar-selection-perf-tripwire.test.js
node --test tests/grammar-qg-p9-table-choice-contract.test.js tests/grammar-qg-p10-table-render.test.js
node --test tests/grammar-qg-p21-local-repetition.test.js tests/grammar-qg-p21-pool-expansion.test.js
node scripts/audit-grammar-qg-p21-local-repetition.mjs --steps=60 --json
node scripts/audit-grammar-content-quality.mjs --seeds=1,2,3 --json
npm run verify:grammar-qg-p21
```

For release, run the same gate under the repository `.nvmrc` Node version (`22`) so the full P22/P23 performance call-count probe runs instead of skipping in a lower-runtime lean environment.
