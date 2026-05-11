# Validation summary

## Source

Source ZIP: `ks2-mastery-lean-05111556.zip`

Source ZIP SHA-256:

`596ac6308b01dc16150d584123f9c00303bd102e73b3b977aea034ef852d108b`

Patch file:

`patches/001-arithmetic-post-review-hardening.patch`

Production repository base for refreshed package validation:

`origin/main` at `7bbf968601d84b6f72d6ad5f1c4eaa6bb95ce20e`.

## Patch validation

Fresh production worktree patch dry-run:

```text
exit_code=0
```

Evidence: `validation/logs/production-ready-patch-dry-run-2026-05-11.log`.

Fresh production worktree patch apply:

```text
exit_code=0
```

Evidence: `validation/logs/production-ready-patch-apply-2026-05-11.log`.

## Static checks

Passed:

```bash
git diff --check
```

Evidence: `validation/logs/production-ready-git-diff-check-2026-05-11.log`.

Passed:

```bash
node --check shared/arithmetic/content.js
node --check worker/src/subjects/arithmetic/engine.js
node --check src/subjects/arithmetic/command-actions.js
```

Evidence:

- `validation/logs/production-ready-node-check-shared-arithmetic-content-2026-05-11.log`
- `validation/logs/production-ready-node-check-worker-arithmetic-engine-2026-05-11.log`
- `validation/logs/production-ready-node-check-arithmetic-command-actions-2026-05-11.log`

## Tests

Passed:

```bash
node --test tests/worker-arithmetic-runtime.test.js
```

Result: 14/14 passed.

Evidence: `validation/logs/production-ready-worker-arithmetic-runtime-test-2026-05-11.log`.

Passed:

```bash
node --test tests/worker-arithmetic-runtime.test.js tests/worker-admin-content-overview.test.js tests/monster-celebrations.test.js tests/ui-subject-theme-contract.test.js tests/ui-subject-visual-adapter-contract.test.js
```

Result: 56/56 passed.

Evidence: `validation/logs/production-ready-arithmetic-cross-test-2026-05-11.log`.

## Custom probes

Baseline probe showed the reviewed ZIP had these issues:

- `2½` parsed as `21/2`, not `2 1/2`.
- 152 of the first 200 difficulty-2 order-of-operations seeds produced non-integer answers.
- Seed 96433 in place-value partition produced no missing box and an undefined expected value.
- Blank practice answer counted as 1 answered attempt and emitted an answer event.
- Blank short test wrote 12 recent attempts, 12 retries, and wrong skill evidence.

Post-patch probe result:

- `2½` parses to 2.5 and marks correctly.
- 0 non-integer difficulty-2 order-of-operations answers in the 1,000-seed probe.
- Place-value seed 96433 generates a valid missing-box item with expected value 700.
- Blank practice submit produces an error but 0 answered, 0 attempts, and 0 events.
- Blank practice submit with only working/draft content also produces an error but 0 answered, 0 attempts, and 0 events.
- Blank short test with only working/draft content has 0 answered, 0 attempts, 0 retries, and 0 wrong skill increments.

Evidence: `validation/production-ready-arithmetic-post-probe-2026-05-11.json`.

## Content audit

Custom content audit result:

- Template count: 30.
- Generated cases checked: 18,000.
- Correct-answer self-marks: 18,000.
- Unique stem/visual combinations: 13,943.
- Findings: 0.

Evidence: `validation/production-ready-arithmetic-content-audit-2026-05-11.json`.

## Full repository gates

Passed after installing worktree dependencies:

```bash
npm test
```

Result: 111,442 passed, 0 failed, 12 skipped.

Passed:

```bash
npm run check
```

Result: Wrangler dry-run build, public-build assertion, and client-bundle audit passed.

Evidence: `validation/logs/production-ready-npm-run-check-2026-05-11.log`.

## Deployment and live smoke

Passed:

```bash
npm run deploy
```

Result: Cloudflare deployed `ks2-mastery` and production bundle audit passed for `https://ks2.eugnel.uk/`.

Cloudflare Version ID: `6f9a3d8a-e6af-44bd-a4a8-4fd5e32a2076`.

Evidence: `validation/logs/production-ready-npm-run-deploy-2026-05-11.log`.

Passed:

```bash
cmd.exe /c "npm run smoke:production:arithmetic -- --out ""docs/plans/james/hotfixes/9. arithmetic-post-review-hardening-package/validation/production-ready-arithmetic-live-smoke-2026-05-11.json"""
```

Result: Arithmetic live smoke passed against `https://ks2.eugnel.uk` with production environment, release `arithmetic-ks2-worker-v1-2026-05-11`, 30 templates, 90 reward units, delayed True Test feedback, and stale-write protection unchanged.

Evidence:

- `validation/logs/production-ready-arithmetic-live-smoke-2026-05-11.log`
- `validation/production-ready-arithmetic-live-smoke-2026-05-11.json`
