# Reading Post-Implementation Review Package

This package is Reading-only. It contains a post-implementation review, a hardening patch, the contract for applying it, and local validation evidence from the uploaded lean ZIP `ks2-mastery-lean-05111651.zip`.

## Main patch

`patches/001-reading-post-implementation-hardening.patch`

Patch scope:

- fixes Phase 5 fiction unresolved `undefined` placeholders;
- improves Phase 5 fiction q1 retrieval stem wording;
- fixes Reading keyword matching for hyphenated compounds such as `star-patterned mat`;
- repairs a small set of model-answer/rubric markability drifts;
- hardens the official Reading content audit to catch unresolved template copy and model-answer markability drift;
- adds regression tests.

## Apply

From repo root:

```bash
git apply --check patches/001-reading-post-implementation-hardening.patch
git apply patches/001-reading-post-implementation-hardening.patch
```

Then run the acceptance commands in `contract/reading-post-implementation-hardening-contract.md`.
