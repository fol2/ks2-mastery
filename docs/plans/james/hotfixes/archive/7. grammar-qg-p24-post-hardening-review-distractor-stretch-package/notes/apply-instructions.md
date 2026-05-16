# Apply Instructions

From the repository root matching `ks2-mastery-lean-05130813.zip`:

```bash
git apply --check patches/001-grammar-qg-p24-distractor-quality-and-stretch-feedback.patch patches/002-release-gate-atomic-monster-manifest-write.patch
git apply patches/001-grammar-qg-p24-distractor-quality-and-stretch-feedback.patch patches/002-release-gate-atomic-monster-manifest-write.patch
node --check worker/src/subjects/grammar/content.js
node --check src/subjects/grammar/session-ui.js
node --check scripts/grammar-production-smoke.mjs
node --check tests/grammar-production-smoke.test.js
node --check tests/helpers/grammar-visible-choice-collector.js
node --check tests/helpers/grammar-render-harness.js
node --check tests/grammar-qg-p24-distractor-quality.test.js
node --test tests/grammar-production-smoke.test.js tests/grammar-qg-p24-distractor-quality.test.js
node --test tests/grammar-qg-p24-distractor-quality.test.js tests/grammar-ui-model.test.js
node --test tests/grammar-question-generator-audit.test.js tests/grammar-qg-p21-pool-expansion.test.js tests/grammar-qg-p21-local-repetition.test.js tests/grammar-qg-p24-distractor-quality.test.js
node scripts/audit-grammar-content-quality.mjs --seeds=1,2,3 --json
node scripts/audit-grammar-qg-p21-local-repetition.mjs --steps=60 --json
node scripts/generate-grammar-qg-render-inventory.mjs --out-prefix=grammar-qg-p21
node scripts/generate-grammar-qg-quality-register.mjs --out reports/grammar/grammar-qg-p21-quality-register.json
node scripts/audit-grammar-distractor-quality.mjs --out reports/grammar/grammar-qg-p21-distractor-audit.json
node scripts/generate-grammar-qg-certification-manifest.mjs --release=grammar-qg-p21-2026-05-11 --phase=grammar-qg-p21
npm test
npm run check
```

For release, push through the normal GitHub main deployment path, then run the production Grammar smoke against `https://ks2.eugnel.uk` before deployment certification.
