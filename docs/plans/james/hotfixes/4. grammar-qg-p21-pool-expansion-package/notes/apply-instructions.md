# Apply Instructions

Prerequisite: apply the previous Grammar 05102302 validation/hotfix patch first.

From the repository root:

```bash
git apply --check patches/001-grammar-qg-p21-pool-expansion-and-local-repetition.patch
git apply patches/001-grammar-qg-p21-pool-expansion-and-local-repetition.patch
node --test tests/grammar-qg-p21-pool-expansion.test.js tests/grammar-qg-p21-local-repetition.test.js tests/grammar-question-generator-audit.test.js
node scripts/audit-grammar-qg-p21-local-repetition.mjs --steps=40 --json
```

Required local production gates:

```bash
npm run verify:grammar-qg-p21
npm test
npm run check
```

Before live release, regenerate production/release evidence required by the
normal Grammar QG release process, then deploy through the repository package
script path and run live Grammar production smoke on `https://ks2.eugnel.uk`.
