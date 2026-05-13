# Apply Instructions

From the repository root matching `ks2-mastery-lean-05131153.zip`:

```bash
git apply --check patches/001-grammar-qg-p25-feedback-learning-cue-and-concept-stretch.patch
git apply patches/001-grammar-qg-p25-feedback-learning-cue-and-concept-stretch.patch
node --check src/subjects/grammar/session-ui.js
node --check tests/grammar-qg-p25-feedback-learning-cue.test.js
node --check tests/grammar-qg-p24-distractor-quality.test.js
node --test tests/grammar-qg-p24-distractor-quality.test.js tests/grammar-ui-model.test.js tests/grammar-qg-p25-feedback-learning-cue.test.js
npm run verify:grammar-qg-p21
node scripts/audit-grammar-content-quality.mjs --seeds=1,2,3 --json
node scripts/audit-grammar-qg-p21-local-repetition.mjs --steps=60 --json
node scripts/audit-grammar-open-response-fairness.mjs --seeds=1,2,3 --json
# Historical script filename; generated evidence is P25-labelled.
node scripts/audit-grammar-qg-p19-smart-practice.mjs --seeds=1..3 --json-out=reports/grammar/grammar-qg-p25-smart-practice-smoke.json --md-out=reports/grammar/grammar-qg-p25-smart-practice-smoke.md
```

The render-harness test dynamically skips in lean ZIP environments where React/jsdom dependencies are not installed. In a full development checkout, it should run.
