# Punctuation answer acceptance execution evidence

## Source and environment

- Execution date: 2026-05-16.
- Target checkout: `D:\Coding\ks2-mastery\.worktrees\punctuation-answer-acceptance-hotfix-20260516`.
- Branch: `codex/punctuation-answer-acceptance-hotfix-20260516`.
- Starting source ref: GitHub `origin/main` at `c8527251c0772c92af20f0b18bec3fc572ff3b75`.
- Patch root: repository root.
- Node: `v22.15.1`.
- npm: `11.6.2`.
- `.nvmrc`: `22`.
- Runtime drift note: the package ZIP recorded Node `v22.16.0` and npm `10.9.2`; the full checkout validation ran on Node `v22.15.1` and npm `11.6.2`.
- Worktree setup note: `node scripts/worktree-setup.mjs` could not provide shared dependencies in this worktree because the package files differed from the primary checkout, so `npm install` was run locally in the worktree.

## Patch status

- `git apply --check docs\plans\james\hotfixes\26. punctuation-answer-acceptance-handoff-package\patches\001-punctuation-answer-acceptance-hardening.patch`: pass.
- `git apply docs\plans\james\hotfixes\26. punctuation-answer-acceptance-handoff-package\patches\001-punctuation-answer-acceptance-hardening.patch`: applied cleanly.
- Patch files changed: `shared/punctuation/marking.js`, `tests/punctuation-marking.test.js`.
- Additional local adaptation: bullet-list paragraph items using `requiresBulletStemAndItems` now let the bullet-list validator own consistent item-stop policy, while still rejecting duplicated terminal runs and lower-case stems. This preserves existing golden answers that intentionally accept a consistent no-stop bullet style.
- Additional test-harness hardening: `tests/build-public.test.js` now captures child-process stdout/stderr, retries a failed build step once, and reports diagnostics instead of hiding the failing command behind `stdio: ignore`.

## Before and after answer-acceptance probes

Baseline probe on the target checkout before the patch:

- Evidence: `validation/full-checkout-baseline-adversarial-probe-2026-05-16.json`.
- Runtime items: `15072`.
- Generated items: `14560`.
- Fixed items: `512`.
- `duplicateTerminal`: `506` incorrect accepted malformed answers.
- `noTerminal`: `102` incorrect accepted malformed answers.
- `lowercaseStart`: `305` incorrect accepted malformed answers.
- `appendExtra`: `18` accepted transfer/free-writing variants.

Final probe on the patched target checkout:

- Evidence: `validation/full-checkout-final-adversarial-probe-2026-05-16.json`.
- Runtime items: `15072`.
- Generated items: `14560`.
- Fixed items: `512`.
- `duplicateTerminal`: `0`.
- `noTerminal`: `0`.
- `lowercaseStart`: `0`.
- `appendExtra`: `18`.

The remaining `appendExtra` result is still treated as product-policy tolerance for open transfer/free-writing surfaces, not as part of this false-positive terminal-punctuation hotfix.

## Regression found and fixed during validation

The first full `npm test` run after the supplied patch exposed a real regression in `tests/punctuation-golden-marking.test.js`: three `bullet-points-paragraph` accept cases were rejected with `paragraph.sentence_boundary_missing`.

The cause was that the new paragraph final-terminal rule also applied to bullet-list paragraph items whose validator already supports consistent no-stop bullet style. The fix keeps prose paragraph final-terminal enforcement, but skips that prose-only check when the item has `requiresBulletStemAndItems`; duplicated terminal runs and lower-case stems remain rejected.

Evidence:

- Failing full run: `validation/full-checkout-postpatch-npm-test-2026-05-16.log`.
- Red focused regression: `validation/red-bullet-paragraph-regression-2026-05-16.log`.
- Green focused regression and golden marking suite: `validation/green-bullet-paragraph-regression-2026-05-16.log`.

## Local validation

- `node --version`: pass, `v22.15.1`.
- `npm --version`: pass, `11.6.2`.
- `git apply --check`: pass.
- Baseline `npm test`: pass, `111595` tests, `111583` pass, `0` fail, `12` skipped. Evidence: `validation/full-checkout-baseline-npm-test-2026-05-16.log`.
- Targeted Punctuation marking suite: pass, `52/52`. Evidence: `validation/full-checkout-targeted-tests-final-2026-05-16.log`.
- Reward/Stars/monster subset: pass, `130/130`. Evidence: `validation/full-checkout-reward-star-monster-subset-final-2026-05-16.log`.
- Hero UI adjacent subset in the full checkout: pass, `35/35`. Evidence: `validation/full-checkout-hero-ui-adjacent-final-2026-05-16.log`.
- `npm run verify:punctuation-qg:p20-expansion`: pass, `31/31`. Evidence: `validation/full-checkout-p20-expansion-final-2026-05-16.log`.
- Review pack command: pass. Evidence: `validation/full-checkout-review-pack-final-2026-05-16.log` and `validation/full-checkout-review-pack-final-summary-2026-05-16.json`.
- `npm run check`: pass. Evidence: `validation/full-checkout-npm-check-final-2026-05-16.log`.
- Final `npm test`: pass, `111598` tests, `111586` pass, `0` fail, `12` skipped. Evidence: `validation/full-checkout-npm-test-final-after-build-harness-2026-05-16.log`.

## Review-pack coverage

- Review pack item count: `15072`.
- Item-level approved decisions: `92`.
- Item-level missing decisions: `14980`.
- Fixed-bank status: `inherited-approved`.
- Generated-family review register status: `PASS`.
- Generated-family decision count: `126`.

The defensible evidence claim is generated-family approval plus inherited fixed-bank approval. This evidence does not prove individual adult approval for every runtime item.

## Diff boundary

Final intended source/test files:

- `shared/punctuation/marking.js`
- `tests/punctuation-marking.test.js`
- `tests/build-public.test.js`

Non-scope generated files from `npm test`, `npm run check`, and Punctuation verification were inspected. Timestamp/build-output churn in reports, generated CSP/build-version files, admin smoke output, grammar audit output, and the monster asset manifest was restored before final review.

## Production status

Current status before deployment: `READY TO DEPLOY — NOT LIVE VERIFIED`.

Production evidence must be added below before this package can be called `DONE — LIVE VERIFIED`.
