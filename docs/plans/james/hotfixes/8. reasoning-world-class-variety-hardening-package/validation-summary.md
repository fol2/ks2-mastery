# Validation summary

## Source snapshot

- Source ZIP: `/mnt/data/ks2-mastery-lean-05130813.zip`
- Source ZIP SHA-256: `1c57a140600b2bb36e954c5814d626fac2ef451cf9d8ca733a87fc54b4e46c75`
- Final patch: `patches/004-reasoning-world-class-variety-hardening.patch`
- Final patch SHA-256: `fff58597ec7aa73a8a46d32d858fb34d2c83fa9a032be557cb6298b17f03c8e8`

## Baseline review

Baseline targeted Reasoning checks on the uploaded ZIP snapshot passed 27/27.

The baseline scheduler adversarial probe showed exact repetition under a degenerate RNG:

- Smart Review: 12 questions, 1 unique template, 1 unique item id.
- Skill Practice: 12 questions, 1 unique template, 1 unique item id.
- Trouble Drill: 12 questions, 1 unique template, 1 unique item id.

See `validation/baseline-scheduler-probe.json`.

## Final patch validation

Patch validation from a clean worktree at `origin/main` (`54bbfbfb69ca4d68b1f8bc35f9077b1f1eb68fc2`) passed:

- `git apply --check`: passed. See `validation/current-patch-apply-check-main-54bbfbfb.log`.
- `git apply`: passed and changed only the seven Reasoning contract files. See `validation/current-patch-apply-main-54bbfbfb.log`.

Targeted Reasoning tests after the final reviewer fixes passed 29/29:

```text
# tests 29
# pass 29
# fail 0
```

See `validation/current-targeted-reasoning-tests-main-54bbfbfb.log`.

Content audit after the final reviewer fixes:

- 124 templates.
- 1,000 seeds per template.
- 124,000 generated cases checked.
- 0 unstable item ids.
- 0 malformed generated-text failures.
- 0 safe read-model leaks of `evaluate`.
- 0 non-finite marker outputs.
- 0 accepted negative "more needed" answers for `theme_mixed_units_total_gap`.
- 0 impossible "used altogether" totals above the original amount for `theme_fraction_two_step_share`.
- 0 afternoon-completer counts above the stated group total for `theme_percent_change_compare`.
- 0 overlapping ratio item labels for `theme_ratio_recipe_total`.
- 0 overlapping purchase item labels for `theme_money_multi_buy_budget`.
- All 14 themed templates exercised all 12 context themes across the sampled seed window.

See `validation/current-content-audit-124k-main-54bbfbfb.json`.

The audit can be reproduced with `validation/scripts/reasoning-content-audit.mjs`.

Scheduler adversarial probe after the final reviewer fixes:

- Smart Review: 12 questions, 12 unique templates, 12 unique item ids.
- Skill Practice focused on `pv_rounding`: 12 questions, 7 unique eligible templates, 12 unique item ids.
- Trouble Drill: 12 questions, 12 unique templates, 12 unique item ids.
- SATs Mini-Set with `setSize=12`: 12 questions, 12 unique templates, 12 unique item ids.

See `validation/current-scheduler-adversarial-probe-main-54bbfbfb.json`.

The probe can be reproduced with `validation/scripts/reasoning-scheduler-adversarial-probe.mjs`.

## Full repository gates

The worktree dependency state was confirmed with the repo-standard worktree setup script.

- `node scripts/worktree-setup.mjs`: passed and confirmed `node_modules` was present for this linked worktree. See `validation/current-worktree-setup-main-54bbfbfb.log`.
- `npm test`: passed 111,524 tests, 111,512 passed, 0 failed, 12 skipped. See `validation/current-npm-test-main-54bbfbfb.log`.
- `npm run build`: passed. See `validation/current-npm-build-main-54bbfbfb.log`.
- `npm run check`: passed Cloudflare Wrangler dry-run through `scripts/wrangler-oauth.mjs`, including build, public build assertion, and client bundle audit. See `validation/current-npm-check-main-54bbfbfb.log`.
- `git diff --check` for the seven Reasoning patch files: passed. See `validation/current-git-diff-check-main-54bbfbfb.log`.

## Reviewer follow-up

The independent code reviewer blocked on:

- `theme_mixed_units_total_gap` accepting a negative "more needed" answer for seed 5.
- A temporary reverse diff against Arithmetic caused by the worktree being behind the latest `origin/main`.
- Stale validation-summary wording from the original lean-ZIP environment.
- A stale Reasoning production smoke default report path that still targeted the 2026-05-11 report name.

Follow-up fixes:

- Added a regression test proving seed 5 no longer accepts `-25`, and that seeds 1..1000 have a non-negative correct answer. Red/green logs: `validation/review-blocker-mixed-unit-red.log` and `validation/review-blocker-mixed-unit-green.log`.
- Added regression coverage proving the themed fraction, percentage, ratio, and money templates do not generate the impossible, duplicate, or suffix-overlap ambiguous cases raised by the final code review across seeds 1..1000.
- Moved the Reasoning production smoke default output to `reports/reasoning/reasoning-production-smoke-current.json`, with separator-neutral test coverage proving it is not tied to the stale 2026-05-11 dated report.
- Rebased the worktree onto latest `origin/main` (`54bbfbfb69ca4d68b1f8bc35f9077b1f1eb68fc2`); final diff is limited to the seven Reasoning contract files plus this task evidence folder.
- Rebuilt the final patch and refreshed this validation summary.

## Production certification status

This summary records local and Cloudflare dry-run validation. Production certification still requires a deployed commit on `main` and a successful live Reasoning smoke against `https://ks2.eugnel.uk`; those artefacts are recorded separately in the completion report after deployment.
