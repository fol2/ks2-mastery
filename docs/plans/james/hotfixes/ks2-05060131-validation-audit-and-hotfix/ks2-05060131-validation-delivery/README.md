# KS2 05060131 validation audit + hotfix package

This package contains the validation report, the fix contract, one deployable patch, and logs from the local verification work.

Apply the patch from repository root:

```bash
git apply patches/001-hero-datekey-reading-integrity-hotfix.patch
```

Minimum post-apply verification:

```bash
node --check shared/hero/seed.js
node --check worker/src/subjects/reading/engine.js
node --check tests/hero-contracts.test.js
node --check tests/worker-reading-runtime.test.js
node --test tests/hero-contracts.test.js tests/hero-p6-datetime.test.js tests/worker-reading-runtime.test.js tests/reading-content-contract.test.js tests/reading-subject-registry.test.js
npm run verify:punctuation-qg:p20
npm test
npm run check
npm run verify:grammar-qg-p20
```

Key files:

- `contracts/ks2-05060131-validation-hotfix-contract.md`
- `reports/ks2-05060131-validation-audit.md`
- `patches/001-hero-datekey-reading-integrity-hotfix.patch`
- `validation/punctuation-qg-p20-verify-after-hotfix.log`
- `validation/hotfix-targeted-tests.log`
- `validation/npm-test-after-hotfix.log`
- `validation/repo-check-after-hotfix.log`
- `validation/grammar-qg-p20-verify-after-hotfix.log`
