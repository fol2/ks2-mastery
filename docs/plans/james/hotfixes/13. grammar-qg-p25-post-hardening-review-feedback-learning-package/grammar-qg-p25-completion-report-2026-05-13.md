# Grammar QG P25 Completion Report - 2026-05-13

Status: complete.

## Scope

Grammar-only post-hardening feedback work from `ks2-mastery-lean-05131153.zip`.

Implemented:

- Incorrect auto-marked Grammar feedback now shows the distinct misconception hint as `Remember: <minimalHint>`.
- Correct Grammar feedback now prefers concept-specific non-scored stretch cues across all 18 Grammar concepts.
- Manual-review-only feedback, scoring, rewards, Stars, mastery, Hero Mode, monsters, D1, scheduler logic, and other subjects were not changed.

Implementation commit deployed and smoked:

`f2bcc8452763bb38b8ab3c470ebe1a44a55d32f5`

## Production deployment

Command:

`npm run deploy`

Result:

- Wrangler deploy passed.
- Production URL: `https://ks2.eugnel.uk`
- Current Version ID from deploy log: `cc7939a5-fc69-4241-b3aa-123637c52cea`
- Production bundle audit passed: 1 HTML-referenced bundle, 6 transitively scanned chunks, 19 direct paths, matrix demo check ok, security headers 5/5, cache split 15/15.

Evidence:

- `validation/current-production-deploy.log`

## Local verification

Syntax checks:

- `node --check src/subjects/grammar/session-ui.js`: passed
- `node --check tests/grammar-qg-p25-feedback-learning-cue.test.js`: passed
- `node --check tests/grammar-qg-p24-distractor-quality.test.js`: passed
- `node --check validation/production-p25-ui-smoke.mjs`: passed

Targeted Grammar tests:

- `node --test tests/grammar-qg-p24-distractor-quality.test.js tests/grammar-ui-model.test.js tests/grammar-qg-p25-feedback-learning-cue.test.js`
- Result: `146/146` pass, `0` fail, `0` skipped.

Grammar release gates:

- `npm run verify:grammar-qg-p21`: passed, `10/10`.
- Content quality seeds `1..3`: `1638` checks, `0` hard failures, `0` advisories.
- P21 local repetition at `60` steps: pass, `0` violations, `0` warnings.
- Grammar QG P21 smart-practice seeds `1..3`: pass, `33` sessions, `0` failures, `0` advisories.
- Open-response fairness seeds `1..3`: `0` findings.

Full repository gates:

- `npm test`: passed with `111516` pass, `0` fail, `12` skipped.
- `npm run check`: passed via the OAuth-safe Wrangler wrapper and dry-run production bundle audit.
- Pre-push hook reran `npm test`: passed with `111516` pass, `0` fail, `12` skipped.

Evidence:

- `validation/current-targeted-ui-p25.log`
- `validation/current-targeted-p24-p25.log`
- `validation/current-verify-grammar-qg-p21.log`
- `validation/current-content-quality-1-3.json`
- `validation/current-p21-local-repetition-60.json`
- `validation/current-p25-smart-practice-smoke.stdout`
- `validation/current-open-response-fairness-1-3.json`
- `validation/current-npm-test-summary.log`
- `validation/current-npm-check-summary.log`

## Production smoke

Production API smoke:

- Command: `node scripts/grammar-production-smoke.mjs --json --evidence-origin=production --expected-release=grammar-qg-p21-2026-05-11 --out=reports/grammar/grammar-production-smoke-grammar-qg-p25-2026-05-13.json`
- Result: `ok: true`
- Release ID: `grammar-qg-p21-2026-05-11`
- Covered normal round, mini-test, repair, cue assertions, P20a/P20b/P20c hotfix fixtures, P24 distractor fixtures, and forbidden-key scanning.

Production UI smoke:

- Command: `node docs/plans/james/hotfixes/13. grammar-qg-p25-post-hardening-review-feedback-learning-package/validation/production-p25-ui-smoke.mjs`
- Result: `ok: true`
- Fixture: `qg_p21_relative_clauses_explanation_choice_variety`, seed `1`
- Incorrect feedback selector: `[data-grammar-feedback-learning-cue]`
- Incorrect feedback observed text: `Remember: A relative clause adds extra information about a noun. Find the noun it is attached to.`
- Correct feedback selector: `[data-grammar-feedback-stretch]`
- Correct feedback observed text: `Extra challenge: write one new sentence with who, which, or that.`
- Browser console errors: `0`
- Request failures: `0`
- HTTP failures: `0`

Evidence:

- `reports/grammar/grammar-production-smoke-grammar-qg-p25-2026-05-13.json`
- `validation/current-production-grammar-smoke.log`
- `validation/current-production-p25-ui-smoke.json`
- `validation/current-production-p25-ui-smoke.stdout`
- `validation/current-production-p25-incorrect-feedback.png`
- `validation/current-production-p25-correct-stretch.png`

## Independent review

Code Reviewer: green.

- Final verdict: no blockers and no advisories.
- Earlier blockers around package drift and stale P19 evidence labels were fixed before production deployment.

Contract Auditor: green.

- Final verdict: no blockers and no advisories.
- Confirmed R1-R5 contract coverage, no unintended scoring or mastery changes, and coherent evidence labels.

## Sync status

- `f2bcc8452763bb38b8ab3c470ebe1a44a55d32f5` was pushed to `origin/main`.
- This completion report and the production evidence files are part of the final evidence commit for the package.
- The post-push closeout must confirm the main checkout `HEAD` equals `origin/main`.
