# Arithmetic 2026-05-13 Excellence Hardening Package

This package is an Arithmetic-only post-hardening review and improvement patch for the uploaded `ks2-mastery-lean-05130813.zip` snapshot.

Apply from the repository root:

```bash
patch -p1 < patches/001-arithmetic-0513-excellence.patch
```

Package contents:

- `patches/001-arithmetic-0513-excellence.patch` — the source patch.
- `contract/arithmetic-0513-excellence-contract.md` — scope, non-goals, and acceptance contract.
- `review/arithmetic-0513-post-hardening-review.md` — review findings and rationale.
- `validation/validation-summary.md` — validation results and limitations.
- `validation/audits/*.json` — before/after custom Arithmetic audit results.
- `validation/logs/*.log` — patch, syntax, targeted test, and runtime-limit logs.
- `validation/arithmetic-0513-production-smoke-2026-05-13.json` — live production Arithmetic smoke evidence.
- `arithmetic-0513-excellence-completion-report.md` — final rollout and evidence summary.
- `validation/scripts/arithmetic-0513-custom-audit.mjs` — the custom audit script used to inspect generator/marking behaviour.

Scope is deliberately limited to Arithmetic. It does not touch other subjects, rewards, Hero, global monsters, or platform routing.
