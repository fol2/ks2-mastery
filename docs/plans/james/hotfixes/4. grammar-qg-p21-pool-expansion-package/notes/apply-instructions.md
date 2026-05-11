# Apply Instructions

Prerequisite: apply the previous Grammar 05102302 validation/hotfix patch first.

From the repository root:

```bash
git apply --check patches/001-grammar-qg-p21-pool-expansion-and-local-repetition.patch
git apply patches/001-grammar-qg-p21-pool-expansion-and-local-repetition.patch
node --test tests/grammar-qg-p21-pool-expansion.test.js tests/grammar-qg-p21-local-repetition.test.js tests/grammar-question-generator-audit.test.js
node scripts/audit-grammar-qg-p21-local-repetition.mjs --steps=40 --json
```

Optional full local gate:

```bash
npm run verify:grammar-qg-p21
```

Before live release, regenerate production/release evidence required by your normal Grammar QG release process.
