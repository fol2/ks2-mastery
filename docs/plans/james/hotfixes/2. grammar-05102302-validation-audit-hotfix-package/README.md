# Grammar 05102302 validation audit + hotfix package

This package contains the audit summary, contract, validation artefacts, and patch for the uploaded `ks2-mastery-lean-05102302.zip` Grammar review.

## Main files

- `contract/grammar-05102302-validation-audit-hotfix-contract.md`
- `patches/001-grammar-05102302-session-bank-and-anti-repetition.patch`
- `validation-summary.md`
- `validation/` logs and JSON evidence

## Apply

From a clean repo checkout or clean ZIP extraction:

```bash
git apply patches/001-grammar-05102302-session-bank-and-anti-repetition.patch
```

Then run the validation commands listed in the contract.

## What it fixes

1. Backports the Grammar Bank nested `confidence.label` precedence fix from GitHub PR #896 into the uploaded ZIP snapshot.
2. Adds one clear post-marking next-step cue in the Grammar question-session feedback panel.
3. Removes cross-template learner-facing prompt collisions in the Grammar release seed window and adds a regression gate.

## Boundary

This is local ZIP/fresh-applied evidence. It is not live production certification.
