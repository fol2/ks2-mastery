# Grammar QG P20b Validation and Hotfix Package

This package validates the uploaded ZIP `ks2-mastery-lean-05060131.zip` and provides a Grammar-only hotfix patch.

Contents:

- `contract/grammar-qg-p20b-validation-hotfix-contract.md`
- `patches/001-grammar-qg-p20b-answer-acceptance-and-copy.patch`
- `validation-summary.md`
- `validation/` evidence logs and JSON outputs

Apply from the repository root:

```bash
patch -p1 < patches/001-grammar-qg-p20b-answer-acceptance-and-copy.patch
npm run verify:grammar-qg-p20
```

The patch is scoped to Grammar QG. It does not touch the separate Punctuation subject.
