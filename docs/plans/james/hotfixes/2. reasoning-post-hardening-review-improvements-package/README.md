# Reasoning post-hardening review + improvement package

Primary snapshot reviewed: `/mnt/data/ks2-mastery-lean-05121226.zip`.

This package is Reasoning-only. It reviews the post-hardening implementation, fixes several Reasoning-specific correctness/UX/reward issues, and adds targeted regression tests. It does not alter Spelling, Grammar, Punctuation, Reading, Arithmetic, global Hero economy policy, or other subject engines.

Apply from the repository root with:

```bash
patch --binary -p1 < patches/003-reasoning-post-hardening-review-improvements.patch
```

The `--binary` flag matters because the lean ZIP snapshot stores the touched source files with CRLF line endings. A normal text-mode `patch -p1` reports “different line endings”; the validation folder includes both the successful binary patch logs and the text-mode line-ending note logs.

After applying, run at minimum:

```bash
node --test tests/reasoning-content-contract.test.js tests/reasoning-engine-rewards.test.js tests/reasoning-production-smoke.test.js tests/reasoning-subject-registry.test.js
```

The patched targeted suite passed locally: 24/24 tests. Full `npm test` and `npm run build` were not completed in the lean ZIP extraction because `node_modules` are absent; logs are included.
