# Grammar P20d session-flow completion report

Date: 2026-05-07

## Status

Completed and deployed to production.

Production URL: `https://ks2.eugnel.uk`
Code commit: `518e6ba7c26d64c55ecab9259f5961abc7d67d84`
Cloudflare version: `b5f0df52-4aaa-41d7-9809-97a37a89544b`

## Scope delivered

- Applied the Grammar P20d session-flow hotfix package.
- Kept the implementation scoped to Grammar session flow, Grammar engine repair handling, and matching contract tests.
- Restored a single active feedback primary action so feedback shows `Next question` or `Finish round`, without a stale disabled `Saved` submit control.
- Added a dedicated Grammar form-submit helper so stale feedback submits are ignored without dispatching answer commands.
- Made similar-problem repair feedback-only and fail-closed when the same-skill pool is exhausted.
- Preserved no-mutation behaviour for invalid repair timing and blocked-template paths.
- Updated targeted Grammar engine, React surface, accessibility, and scheduler tests for the new contract.

## Evidence

Local targeted gate:

`node --test tests/grammar-engine-validation.test.js tests/react-accessibility-contract.test.js tests/react-grammar-surface.test.js tests/grammar-qg-p10-scheduler-safety.test.js`

Result: `193/193` tests passed.

Full local gate:

`npm test`

Result: `109169` tests, `109157` passed, `0` failed, `12` skipped.

Pre-push hook:

`git push origin main`

Result: pre-push `npm test` passed again with `109169` tests, `109157` passed, `0` failed, `12` skipped, then pushed `main -> main`.

Build/deploy gate:

`npm run check`

Result: Cloudflare dry-run build passed; client bundle audit passed with `805` public files, `6` chunks scanned, main bundle `193964 / 232000` bytes gzip.

Production deployment:

`npm run deploy`

Result: Cloudflare deploy passed; production bundle audit passed for `https://ks2.eugnel.uk/` with `1` HTML-referenced bundle, `6` transitive chunks, `19` direct paths, matrix demo check `ok`, security-header checks `5/5`, cache-split checks `15/15`.

Production smoke:

`node scripts/grammar-production-smoke.mjs --json --evidence-origin=cloudflare-production --out="docs/plans/james/hotfixes/2. grammar-p20d-session-flow-validation-and-hotfix-package/validation/grammar-p20d-production-smoke-2026-05-07.json"`

Result: `ok: true`, `environment: production`, `deployedUrl: https://ks2.eugnel.uk`, `releaseId: grammar-qg-p20-2026-05-05`, `commitSha: 518e6ba7c26d64c55ecab9259f5961abc7d67d84`.

Smoke evidence file:

`docs/plans/james/hotfixes/2. grammar-p20d-session-flow-validation-and-hotfix-package/validation/grammar-p20d-production-smoke-2026-05-07.json`

The smoke evidence confirms normal round, mini-test, repair flow, release-id assertion, forbidden-key scan, and P20a/P20b/P20c hotfix cases all passed.

## Independent review

- Code reviewer: GREEN after the new `src/subjects/grammar/form-submit.js` helper was tracked and staged.
- Contract auditor: GREEN for staged pre-deploy code/contract readiness, with production evidence then supplied after deployment.

## Git synchronisation

At the production code deploy point, local `HEAD` and `origin/main` both resolved to:

`518e6ba7c26d64c55ecab9259f5961abc7d67d84`

This completion report and the production smoke evidence are follow-up documentation artefacts for the same rollout.
