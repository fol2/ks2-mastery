# Punctuation P20 validation hotfix completion report

## Summary

Punctuation P20 validation hotfix package 3 has been applied to the repo, verified locally, deployed to production, and smoke-tested against `https://ks2.eugnel.uk`.

Implementation commit:

- `de41b6d3c4700bf0c53f39264073cc22ec141f75` - `Fix Punctuation P20 scheduler validation hotfix`

Production deployment:

- Command: `npm run deploy`
- Worker version ID: `b0ebaf57-4554-4b62-93ed-4545b21e49f4`
- Production bundle audit: PASS for `https://ks2.eugnel.uk/`

## Prompt-to-artifact checklist

- Package applied as repo changes: PASS.
- Related contract fix included: PASS. The P20 generated-family cluster metadata correction for `parenthesis` and `semicolon` is documented in the contract and patch.
- Punctuation scheduler default candidate coverage fixed: PASS.
- Explicit bounded `candidateWindow` probes preserved: PASS.
- Blank text-answer submit guard added at button and submit-handler level: PASS.
- P20 item count, release ID, surfaces, model answers, generator templates, and reviewer registers unchanged by the hotfix: PASS.
- Code reviewer green with no blockers or advisories: PASS.
- Fresh production deploy through approved package script: PASS.
- Fresh P20 production smoke evidence for this hotfix commit: PASS.
- Local `main` synced to `origin/main` after implementation push: PASS for implementation commit `de41b6d3c4700bf0c53f39264073cc22ec141f75`.
- Independent contract auditor final verdict: GREEN, no blockers or advisories, after this completion report and smoke artefact were present.

## Files changed

- `shared/punctuation/scheduler.js`
- `shared/punctuation/p20-systematic-expansion-bank.js`
- `src/subjects/punctuation/components/PunctuationSessionScene.jsx`
- `tests/punctuation-qg-p20-real-scheduler-heavy-play.test.js`
- `tests/punctuation-session-input-hardening.test.js`
- `docs/plans/james/hotfixes/3. punctuation-p20-validation-hotfix-package/README.md`
- `docs/plans/james/hotfixes/3. punctuation-p20-validation-hotfix-package/contract/punctuation-p20-real-scheduler-and-session-ui-hardening-contract.md`
- `docs/plans/james/hotfixes/3. punctuation-p20-validation-hotfix-package/patches/001-punctuation-p20-real-scheduler-and-session-ui-hardening.patch`
- `docs/plans/james/hotfixes/3. punctuation-p20-validation-hotfix-package/validation-summary.md`
- `docs/plans/james/hotfixes/3. punctuation-p20-validation-hotfix-package/validation/patched-focused-tests.log`
- `reports/punctuation/punctuation-qg-p20-production-smoke.json`

## Verification evidence

- `node --test tests/punctuation-qg-p20-real-scheduler-heavy-play.test.js tests/punctuation-session-input-hardening.test.js tests/punctuation-session-ui.test.js`: PASS, 24/24.
- `node --test tests/punctuation-scheduler.test.js tests/punctuation-qg-p20-expansion.test.js tests/punctuation-qg-p20-production-evidence.test.js`: PASS, 45/45.
- `npm run verify:punctuation-qg:p20`: PASS before deployment.
- `npm test`: PASS after implementation, 109,175 tests, 109,163 passed, 0 failed, 12 skipped.
- Pre-push `npm test`: PASS, 109,175 tests, 109,163 passed, 0 failed, 12 skipped.
- `npm run check`: PASS, Wrangler dry-run deploy completed.
- `npm run deploy`: PASS, Worker version ID `b0ebaf57-4554-4b62-93ed-4545b21e49f4`.
- `npm run smoke:production:punctuation -- --env production --authenticated --admin-hub --worker-commit-sha de41b6d3c4700bf0c53f39264073cc22ec141f75 --worker-version-id b0ebaf57-4554-4b62-93ed-4545b21e49f4 --out reports/punctuation/punctuation-qg-p20-production-smoke.json`: PASS.
- `npm run verify:punctuation-qg:p20-live`: PASS.

## Production smoke artefact

Path:

- `reports/punctuation/punctuation-qg-p20-production-smoke.json`

Key evidence:

- `ok`: `true`
- `origin`: `https://ks2.eugnel.uk`
- `attestation.environment`: `production`
- `attestation.workerCommitSha`: `de41b6d3c4700bf0c53f39264073cc22ec141f75`
- `attestation.workerVersionId`: `b0ebaf57-4554-4b62-93ed-4545b21e49f4`
- `attestation.timestamp`: `2026-05-07T19:30:39.873Z`
- `attestation.authenticatedCoverage`: `true`
- `attestation.adminHubCoverage`: `true`
- `punctuation.smartSix.summaryTotal`: `6`
- `punctuation.smartSix.uniqueItems`: `6`
- `punctuation.smartSix.immediateRepeats`: `0`
- `punctuation.localReleaseManifestExpectation.runtimeItems`: `15072`
- `punctuation.localReleaseManifestExpectation.generatedItems`: `14560`
- `punctuation.localReleaseManifestExpectation.fixedItems`: `512`

Smoke SHA-256:

- `c1e4489f656c3194907cfab2c4fb9b4db5f5c026f59af53bc1820ee750f82140`

## Notes

One immediate post-deploy Punctuation smoke attempt failed on `gen_bullet_points_fix_1h6jwb3_54`. The same item and answer passed local deterministic marking, and a delayed rerun passed the full production smoke and live evidence validator for the deployed Worker version. This is recorded as a deployment propagation/transient observation, not as an accepted regression.

Fresh `admin-ops-production-smoke` was not rerun in this shell because `KS2_SMOKE_ACCOUNT_EMAIL` and `KS2_SMOKE_ACCOUNT_PASSWORD` were not present. The P20 production smoke artefact itself carries the Admin Hub coverage attestation required by the P20 live evidence validator.
