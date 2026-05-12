# Punctuation 05121226 validation audit + hotfix package

Primary reviewed snapshot: `/mnt/data/ks2-mastery-lean-05121226.zip`.

This package contains a repo-root patch, implementation contract, validation summary, and logs for the next Punctuation Subject hardening pass.

The patch is intentionally Punctuation-scoped. It changes generated/manual hyphen content quality, the P20 expansion audit/validator, Node/lean-ZIP robustness for P20 tests, and the Punctuation content release ID. It does not change Hero Mode, rewards logic, monster logic, non-Punctuation subjects, or production deployment scripts.

Apply from repository root:

```bash
git apply --check --ignore-whitespace patches/001-punctuation-05121226-hyphen-quality-and-p20-gate-hardening.patch
git apply --ignore-whitespace patches/001-punctuation-05121226-hyphen-quality-and-p20-gate-hardening.patch
npm run verify:punctuation-qg:p20-expansion
```

After deployment, regenerate live production evidence for `punctuation-qg-p21-15072-2026-05-12` and run:

```bash
npm run verify:punctuation-qg:p20-live
npm run verify:punctuation-qg:p20
```

Local expansion validation passes in this package. Live production certification is not claimed because the lean ZIP contains a 0-byte placeholder production smoke file.
