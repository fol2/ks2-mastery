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
- Additional production command-path fix: `worker/src/subjects/punctuation/engine.js` now preserves string `payload.typed` and `payload.answer` values as typed-answer objects, so multiline bullet answers are not collapsed before marking. Regression coverage is in `tests/worker-punctuation-runtime.test.js`.

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
- Latest-main `npm test` after fast-forward to deployed build `6a0551ab3c5f3064aef5c92ce674fba9aeb41a0d`: pass, `111603` tests, `111591` pass, `0` fail, `12` skipped. Evidence: `validation/full-checkout-npm-test-final-main-2026-05-16.log`.
- Latest-main `npm run check` after the same fast-forward: pass, including build, public assertion, client bundle audit, and Wrangler dry-run. Evidence: `validation/full-checkout-npm-check-final-main-2026-05-16.log`.

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

## Final Production Status

Final production status: `DONE — LIVE VERIFIED`.

Live build after `origin/main` fast-forward:

- Production origin: `https://ks2.eugnel.uk`.
- Final deployed source observed through `/api/version`: `6a0551ab3c5f3064aef5c92ce674fba9aeb41a0d` (`buildHash`: `6a0551ab`).
- Final Cloudflare Worker version ID: `34cdc3d4-9cbe-4862-931c-ecfddf7b3c17`.
- The final deployed source contains the Punctuation marking hardening commit `99fbe5ee09a4b9cac56b69593cb7d6066f4f57e8` and the command-path multiline payload fix commit `07c0151b222e8815f3a3396d85e5c2a93fb711fd`.
- The deploy that produced Worker version `34cdc3d4-9cbe-4862-931c-ecfddf7b3c17` is recorded in `docs/plans/james/hotfixes/24. arithmetic-hardening-handoff/validation/target-origin-main-npm-run-deploy-rerun-2026-05-16.log`; Punctuation was then reverified against that live build.

Final production smoke:

- Command: `node scripts/punctuation-production-smoke.mjs --env production --authenticated --admin-hub --origin https://ks2.eugnel.uk --commit-sha 6a0551ab3c5f3064aef5c92ce674fba9aeb41a0d --worker-version-id 34cdc3d4-9cbe-4862-931c-ecfddf7b3c17 --out reports/punctuation/punctuation-qg-p20-production-smoke.json --timeout-ms 30000`.
- Standard evidence path: `reports/punctuation/punctuation-qg-p20-production-smoke.json`.
- Package evidence copy: `production-punctuation-smoke-final-main-2026-05-16.json`.
- Console evidence: `production-punctuation-smoke-final-main-2026-05-16.out`.
- Result: pass, `ok: true`, origin `https://ks2.eugnel.uk`, environment `production`, release `punctuation-qg-p24-15072-2026-05-13`, runtime items `15072`, generated items `14560`, fixed items `512`, and published reward units `14`.

Final production live-evidence validator:

- Command: `npm run verify:punctuation-qg:p20-live`.
- Evidence: `production-p20-live-verify-final-main-2026-05-16.out`.
- Result: pass, including `Punctuation QG P20 live evidence validation: PASS` and `4/4` live evidence tests.

Final command-path answer-acceptance probe:

- Evidence: `production-punctuation-answer-acceptance-live-probe-final-main-2026-05-16.json`.
- Result: pass, `ok: true`.
- Coverage: live direct-speech correct answer accepted, live direct-speech duplicated-terminal answer rejected, live multiline bullet correct answer accepted, and live bullet lower-case stem rejected.

Final browser smoke:

- Command: `node scripts/punctuation-round-length-production-smoke.mjs --origin https://ks2.eugnel.uk --commit-sha 6a0551ab3c5f3064aef5c92ce674fba9aeb41a0d --worker-version-id 34cdc3d4-9cbe-4862-931c-ecfddf7b3c17 --out docs/plans/james/hotfixes/26. punctuation-answer-acceptance-handoff-package/evidence/production-punctuation-browser-smoke-final-main-2026-05-16.json --screenshot-dir docs/plans/james/hotfixes/26. punctuation-answer-acceptance-handoff-package/evidence/production-punctuation-browser-screenshots-final-main-2026-05-16`.
- Evidence: `production-punctuation-browser-smoke-final-main-2026-05-16.json`.
- Console evidence: `production-punctuation-browser-smoke-final-main-2026-05-16.out`.
- Screenshots: `production-punctuation-browser-screenshots-final-main-2026-05-16/desktop-1024-selected-8.png` and `production-punctuation-browser-screenshots-final-main-2026-05-16/mobile-390-selected-12.png`.
- Result: pass, with no console errors, request failures, or HTTP failures recorded by the browser smoke.

Final hard-refresh browser smoke:

- Evidence: `production-punctuation-hard-refresh-final-main-2026-05-16.json`.
- Screenshot: `production-punctuation-hard-refresh-final-main-2026-05-16.png`.
- Journey: fresh browser context, cache disabled, service workers blocked, `https://ks2.eugnel.uk/demo`, hard reload, Punctuation setup, select round length `8`, and assert `/api/version` build hash `6a0551ab`.
- Result: pass, with setup visible, selected round length `true`, CTA round length `8`, and no console errors, request failures, or HTTP failures.

Final reviewer loop:

- Code Reviewer evidence: `code-reviewer-final-2026-05-16.md`.
- Code Reviewer output: `PASS — no blockers, no advisories, findings=[]`.
- Contract Auditor evidence: `contract-auditor-final-2026-05-16.md`.
- Contract Auditor output: `PASS — no blockers, no advisories, findings=[]`.

The earlier production artefacts below are retained as chronology for the first Punctuation deployment. They are superseded by the final-main evidence above.

## Superseded Production Chronology

Superseded production status: `DONE — LIVE VERIFIED` for the initial Punctuation deployment before the final-main fast-forward.

Production deploy:

- Command: `npm run deploy`.
- Deployed origin: `https://ks2.eugnel.uk`.
- Deployed source commit: `99fbe5ee09a4b9cac56b69593cb7d6066f4f57e8`.
- Cloudflare Worker version ID: `61a087f5-5433-4f82-ba4f-38a7de329477`.
- Deploy evidence: `production-deploy-2026-05-16.out`.
- Production bundle audit: pass for `https://ks2.eugnel.uk/`, with matrix demo check `ok`, security-header checks `5/5`, and cache-split checks `15/15`.

Production smoke:

- Command: `node scripts/punctuation-production-smoke.mjs --env production --authenticated --admin-hub --origin https://ks2.eugnel.uk --commit-sha 99fbe5ee09a4b9cac56b69593cb7d6066f4f57e8 --worker-version-id 61a087f5-5433-4f82-ba4f-38a7de329477 --out reports/punctuation/punctuation-qg-p20-production-smoke.json --timeout-ms 30000`.
- Standard evidence path: `reports/punctuation/punctuation-qg-p20-production-smoke.json`.
- Package evidence copy: `production-punctuation-smoke-2026-05-16.json`.
- Console evidence: `production-punctuation-smoke-2026-05-16.out`.
- Result: pass, `ok: true`, origin `https://ks2.eugnel.uk`, environment `production`, release `punctuation-qg-p24-15072-2026-05-13`, runtime items `15072`, generated items `14560`, fixed items `512`, published reward units `14`, authenticated coverage `true`, admin hub coverage `true`, smart-six total `6`, and dash acceptance covered.

Production live-evidence validator:

- Command: `npm run verify:punctuation-qg:p20-live`.
- Evidence: `production-p20-live-verify-2026-05-16.out`.
- Result: pass, including `Punctuation QG P20 live evidence validation: PASS` and `4/4` live evidence tests.

Browser smoke:

- Command: `node scripts/punctuation-round-length-production-smoke.mjs --origin https://ks2.eugnel.uk --commit-sha 99fbe5ee09a4b9cac56b69593cb7d6066f4f57e8 --worker-version-id 61a087f5-5433-4f82-ba4f-38a7de329477 --out docs/plans/james/hotfixes/26. punctuation-answer-acceptance-handoff-package/evidence/production-punctuation-browser-smoke-2026-05-16.json --screenshot-dir docs/plans/james/hotfixes/26. punctuation-answer-acceptance-handoff-package/evidence/production-punctuation-browser-screenshots-2026-05-16`.
- Evidence: `production-punctuation-browser-smoke-2026-05-16.json`.
- Console evidence: `production-punctuation-browser-smoke-2026-05-16.out`.
- Screenshots: `production-punctuation-browser-screenshots-2026-05-16/desktop-1024-selected-8.png` and `production-punctuation-browser-screenshots-2026-05-16/mobile-390-selected-12.png`.
- Journey: fresh browser context, `https://ks2.eugnel.uk/demo`, Punctuation setup, select round length, start Punctuation session, confirm session length on desktop and mobile.
- Result: pass, with no console errors, request failures, or HTTP failures recorded by the browser smoke.

Hard-refresh browser smoke:

- Evidence: `production-punctuation-hard-refresh-2026-05-16.json`.
- Screenshot: `production-punctuation-hard-refresh-2026-05-16.png`.
- Journey: fresh browser context, cache disabled, service workers blocked, `https://ks2.eugnel.uk/demo`, hard reload, Punctuation setup, select round length `8`.
- Result: pass, with setup visible, selected round length `true`, CTA round length `8`, and no console errors, request failures, or HTTP failures.

Remote sync:

- `git push origin HEAD:main`: pass.
- `origin/main`: `99fbe5ee09a4b9cac56b69593cb7d6066f4f57e8`.
- Pre-push `npm test`: pass, `111598` tests, `111586` pass, `0` fail, `12` skipped.
