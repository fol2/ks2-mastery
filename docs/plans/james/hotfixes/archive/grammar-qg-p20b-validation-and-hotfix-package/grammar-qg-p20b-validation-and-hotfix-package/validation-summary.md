# Grammar QG P20b Validation and Hotfix Summary

## Source reviewed

- Source ZIP: `/mnt/data/ks2-mastery-lean-05060131.zip`
- Source ZIP SHA-256: `b62eec2f9a9c2b4ce41b0cff16200f940a3699af00ad281be83cc00837c05fc6`
- Local work folder: `/mnt/data/ks2-mastery-lean-05060131-work`
- Runtime: Node `v22.16.0`; `.nvmrc` expects `22`
- Evidence boundary: ZIP-local validation only; production is not certified.

## Baseline validation before patch

The uploaded ZIP passed the bundled Grammar QG P20 verifier:

```bash
npm run verify:grammar-qg-p20
# exit 0, 48/48 tests passed
```

Baseline local audits also passed:

```bash
node scripts/audit-grammar-question-generator.mjs --json
node scripts/audit-grammar-question-generator.mjs --deep --json
node scripts/audit-grammar-content-quality.mjs --seeds=1..30 --json
node scripts/audit-grammar-open-response-fairness.mjs --seeds=1..30 --out=...
node scripts/audit-grammar-qg-p20-quality-hardening.mjs --seeds=1..30 --smart-seeds=1..6 --out=...
```

Baseline P20 quality summary:

- `templateCount`: 510
- `seedsChecked`: 30
- `p20ClosedAutoMarkTemplateCount`: 23
- `p20ClosedAutoMarkCaseCount`: 690
- `answerAcceptanceFailureCount`: 0
- `fairnessFindingCount`: 0
- `templateQualityFindingCount`: 0
- `unsafeAutoMarkedOpenPromptCount`: 0
- `smartPracticeFailureCount`: 0
- `smartPracticeAdvisoryCount`: 0

## Bugs/glitches found outside the bundled gates

### 1. Punctuation mark symbols rejected for punctuation-label answers

Prompt examples:

- `Write the punctuation mark used in this sentence: The sky darkened; the gulls flew inland.`
- Expected label: `semicolon`
- Learner answer: `;`
- Baseline result: rejected

The same issue existed for `:` / `colon` and `—` / `dash`.

### 2. Legacy internal-punctuation rewrites rejected only-missing-final-full-stop answers

Recovered P20 items already tolerated this for internal punctuation, but legacy Grammar templates did not.

Affected templates patched:

- `fix_fronted_adverbial`
- `parenthesis_fix_sentence`
- `proc_fronted_adverbial_fix`
- `proc_colon_list_fix`
- `proc_dash_boundary_fix`
- `proc3_parenthesis_commas_fix`
- `proc3_hyphen_fix_meaning`

Strictness remains unchanged for direct-speech and ending-punctuation tasks.

### 3. Possessive scenario copy lacked a clear scenario boundary

Before:

```text
Write the possessive phrase for one dog owns a bowl.
```

After:

```text
Write the possessive phrase for: one dog owns a bowl.
```

## Patch contents

Patch file:

```text
patches/001-grammar-qg-p20b-answer-acceptance-and-copy.patch
```

Modified paths:

- `worker/src/subjects/grammar/answer-spec.js`
- `worker/src/subjects/grammar/content.js`
- `scripts/audit-grammar-qg-p20-quality-hardening.mjs`
- `tests/grammar-qg-p20-answer-acceptance.test.js`

## Post-patch validation

Patch dry-run and apply were validated on a fresh extraction of the uploaded ZIP:

```bash
patch --dry-run -p1 < patches/001-grammar-qg-p20b-answer-acceptance-and-copy.patch
patch -p1 < patches/001-grammar-qg-p20b-answer-acceptance-and-copy.patch
```

Fresh patched targeted tests passed:

```bash
node --test tests/grammar-answer-spec.test.js tests/grammar-answer-spec-audit.test.js tests/grammar-qg-p20-answer-acceptance.test.js tests/grammar-qg-p20-quality-hardening.test.js
# exit 0, 46/46 tests passed
```

Working patched full P20 verifier passed:

```bash
npm run verify:grammar-qg-p20
# exit 0, 51/51 tests passed
```

Patched audits passed:

- QG audit: release `grammar-qg-p20-2026-05-05`
- deep QG audit: release `grammar-qg-p20-2026-05-05`
- content quality: 15,300 generated template/seed checks, 0 hard failures, 0 advisories
- open-response fairness: 0 findings
- P20 quality hardening: passed, 0 answer acceptance failures, 0 fairness findings, 0 template-quality findings, 0 unsafe auto-marked open prompts
- smart-practice smoke window: 66 sessions, 11 profiles × 6 seeds, pass true, 0 failures, 0 advisories

## Limitation

The full 30-seed smart-practice command exceeded the local execution window in this environment. The 6-seed smart-practice smoke passed locally, and the contract keeps the full 30-seed smart-practice run as a staging/release gate where runtime allows it.

## Repo-applied follow-up

The patch was applied to the live repository checkout on 2026-05-06. During repo integration, an independent code review found that the first patch version accepted an em dash or en dash for a golden `hyphen` label. The repository implementation was tightened so punctuation-mark aliases use the learner's raw mark family for alias matching, while normal answer text still receives the existing smart-punctuation normalisation.

Additional repo-level evidence:

```bash
node --test tests/grammar-answer-spec.test.js tests/grammar-answer-spec-audit.test.js tests/grammar-qg-p20-answer-acceptance.test.js tests/grammar-qg-p20-quality-hardening.test.js
# exit 0, 46/46 tests passed

npm run verify:grammar-qg-p20
# exit 0, 51/51 tests passed

node scripts/audit-grammar-qg-p19-smart-practice.mjs --seeds=1..30 --json-out=reports/grammar/grammar-qg-p20b-smart-practice-1-30.json --md-out=reports/grammar/grammar-qg-p20b-smart-practice-1-30.md
# exit 0, 330 sessions, 0 failures, 0 advisories

npm test
# exit 0, 109131 passed, 0 failed, 12 skipped

npm run check
# exit 0
```
