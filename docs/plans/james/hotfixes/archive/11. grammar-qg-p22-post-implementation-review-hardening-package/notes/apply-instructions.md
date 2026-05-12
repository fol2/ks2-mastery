# Apply Instructions

Apply this package to the implemented Grammar QG P21 snapshot represented by `ks2-mastery-lean-05111651.zip`.

```bash
git apply --check patches/001-grammar-qg-p22-selection-performance-and-explanation-quality.patch
git apply patches/001-grammar-qg-p22-selection-performance-and-explanation-quality.patch
```

Then run:

```bash
node --check worker/src/subjects/grammar/selection.js
node --check worker/src/subjects/grammar/content.js
node --test tests/grammar-selection-perf-tripwire.test.js tests/grammar-qg-p21-pool-expansion.test.js tests/grammar-qg-p21-local-repetition.test.js
npm run verify:grammar-qg-p21
node scripts/audit-grammar-qg-p21-local-repetition.mjs --steps=60 --json
node scripts/audit-grammar-content-quality.mjs --seeds=1,2,3 --json
```

The package already includes local validation logs under `validation/`.
