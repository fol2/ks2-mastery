# Reading validation audit + hotfix package (rebuilt v2)

This package is a rebuilt, small artifact for the KS2 Mastery Reading subject audit/hotfix.

It contains a repo-root patch plus the validation contract and local validation logs. It does not include a full copy of the repository or the uploaded source ZIP.

## Files

- `patches/001-reading-validation-hotfix-repo-root.patch` — apply from the repository root.
- `contract/reading-validation-hotfix-contract.md` — patch contract, scope, acceptance gates, and limits.
- `validation/logs/node-reading-targeted-tests.log` — local targeted test output after applying the patch to a fresh ZIP extraction.
- `validation/audits/reading-content-audit.json` — content duplicate/shape audit after patch.
- `validation/audits/reading-ui-static-audit.json` — static UI contract audit after patch.

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
  tests/reading-subject-registry.test.js
```

Result: 30/30 pass.
