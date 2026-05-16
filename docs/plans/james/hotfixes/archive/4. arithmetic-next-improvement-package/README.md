# Arithmetic next improvement package

This package contains an Arithmetic-only patch and evidence bundle for `ks2-mastery-lean-05121221.zip`.

Apply from the repository root:

```bash
patch -p1 < patches/001-arithmetic-next-improvement.patch
```

Primary documents:

```text
contract/arithmetic-next-improvement-contract.md
review/arithmetic-next-post-hardening-review.md
validation/validation-summary.md
```

Validation logs and custom audit outputs are under `validation/`.

Patch scope:

```text
shared/arithmetic/content.js
worker/src/subjects/arithmetic/engine.js
src/subjects/arithmetic/components/ArithmeticPracticeSurface.jsx
tests/worker-arithmetic-runtime.test.js
```
