# Reasoning world-class unlimited variety v2 package

This package contains a Reasoning-only post-hardening review and improvement patch for `ks2-mastery-lean-05131531.zip`.

Apply from repository root:

```bash
git apply "docs/plans/james/hotfixes/16. reasoning-world-class-unlimited-variety-v2-package/patches/005-reasoning-world-class-unlimited-variety-v2.patch"
```

Package contents:

- `contract/` — implementation contract and acceptance checks.
- `patches/` — unified patch.
- `review/` — Reasoning-only post-hardening review.
- `validation/` — baseline, patched, and fresh patchcheck logs/probes/audits.

This patch expands Reasoning from 124 to 138 template families, expands themed surface variety from 12 to 23 themes, adds 14 deeper deterministic template families, gates extra credit until the learner is ready, and makes themed sessions avoid repeated context themes where possible.
