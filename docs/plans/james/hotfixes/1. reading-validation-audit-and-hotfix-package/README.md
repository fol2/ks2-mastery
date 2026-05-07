# Reading validation audit + hotfix package (production closure)

This package is the production closure artifact for the KS2 Mastery Reading subject audit/hotfix.

It contains a repo-root patch plus the validation contract, local validation logs, and production closure evidence. It does not include a full copy of the repository or the uploaded source ZIP.

## Files

- `patches/001-reading-validation-hotfix-repo-root.patch` — apply from the repository root.
- `contract/reading-validation-hotfix-contract.md` — patch contract, scope, acceptance gates, and limits.
- `validation/logs/node-reading-targeted-tests.log` — local targeted test output after applying the patch to a fresh ZIP extraction.
- `validation/logs/repo-reading-targeted-tests-2026-05-07.log` — repository targeted Reading/UI test output after applying the patch to `main`.
- `validation/logs/repo-npm-test-pass-2026-05-07.log` — full repository `npm test` output after applying the patch to `main`.
- `validation/logs/repo-npm-check-2026-05-07.log` — full repository `npm run check` dry-run deployment output after applying the patch to `main`.
- `validation/audits/reading-content-audit.json` — content duplicate/shape audit after patch.
- `validation/audits/reading-ui-static-audit.json` — static UI contract audit after patch.
- `completion-report.md` — final production closure report, including deployment and live smoke evidence.

## Apply

```bash
git apply --check --ignore-whitespace patches/001-reading-validation-hotfix-repo-root.patch
git apply --ignore-whitespace patches/001-reading-validation-hotfix-repo-root.patch
```

## Validation command used

```bash
node --test \
  tests/worker-reading-runtime.test.js \
  tests/reading-content-contract.test.js \
  tests/reading-subject-registry.test.js \
  tests/reading-session-interface.test.js
```

Result: 35/35 pass.

Full repository gates also passed:

```bash
npm test
npm run check
```
