# Arithmetic 05131013 World-Class Hardening Package

Apply from the repository root:

```bash
patch -p1 < patches/001-arithmetic-05131013-world-class.patch
```

Then run:

```bash
node --check shared/arithmetic/content.js
node --check worker/src/subjects/arithmetic/engine.js
node --check worker/src/subjects/arithmetic/commands.js
node --check src/subjects/arithmetic/command-actions.js
node --check tests/worker-arithmetic-runtime.test.js
node --test tests/worker-arithmetic-runtime.test.js
node --test tests/react-arithmetic-surface.test.js
node docs/plans/james/hotfixes/11.\ arithmetic-05131013-world-class-package/validation/current-2026-05-13/scripts/arithmetic-paper-realism-audit.mjs
node scripts/arithmetic-production-smoke.mjs --out docs/plans/james/hotfixes/11.\ arithmetic-05131013-world-class-package/validation/current-2026-05-13/arithmetic-05131013-production-smoke-2026-05-13.json --smoke-type arithmetic-05131013-world-class-production
node docs/plans/james/hotfixes/11.\ arithmetic-05131013-world-class-package/validation/current-2026-05-13/scripts/arithmetic-production-browser-smoke.mjs --out docs/plans/james/hotfixes/11.\ arithmetic-05131013-world-class-package/validation/current-2026-05-13/arithmetic-05131013-production-browser-smoke-2026-05-13.json --screenshot docs/plans/james/hotfixes/11.\ arithmetic-05131013-world-class-package/validation/current-2026-05-13/arithmetic-05131013-production-browser-smoke-2026-05-13.png --smoke-type arithmetic-05131013-world-class-production-browser
```

Package contents:

- `patches/001-arithmetic-05131013-world-class.patch`
- `contract/arithmetic-05131013-world-class-contract.md`
- `review/arithmetic-05131013-post-hardening-review.md`
- `validation/validation-summary.md`
- `validation/audit-arithmetic-05131013.mjs`
- `validation/audits/baseline-arithmetic-audit-05131013.json`
- `validation/audits/patched-arithmetic-audit-05131013.json`
- `validation/logs/*`
- `validation/current-2026-05-13/*`
- `hashes/*.txt`
- `arithmetic-05131013-world-class-completion-report-2026-05-13.md`

Scope is Arithmetic-only. The only non-product source change is the React Arithmetic surface test harness timeout, included because the full dependency verification repeatedly hit the previous 10-second subprocess limit on this Windows worktree.
