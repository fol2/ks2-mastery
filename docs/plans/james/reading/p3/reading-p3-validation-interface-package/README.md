# Reading P3 validation/interface pack

This pack contains the Reading P3 validation and delegated question-session UX patch.

Files:

- `reading-p3-validation-interface-production-lf.patch` — recommended Git/GitHub-friendly patch.
- `reading-p3-validation-interface-contract.md` — implementation contract.
- `reading-p3-validation-audit-report.md` — validation/audit report.

Apply from the repository root:

```bash
git apply --check reading-p3-validation-interface-production-lf.patch
git apply reading-p3-validation-interface-production-lf.patch
```

Focused validation command:

```bash
node --test \
  tests/reading-content-contract.test.js \
  tests/worker-reading-runtime.test.js \
  tests/reading-subject-registry.test.js \
  tests/reading-session-interface.test.js
```

Original lean ZIP workout result: focused set passed with 24 tests and 0 failures. Broader non-React subject/reward smoke set passed with 170 tests and 0 failures.

Repository certification after implementation drift fixes:

- Focused Reading P3 gate: 32 tests passed, 0 failed.
- Broader Reading/cross-subject regression gate: 174 tests passed, 0 failed.
- Full `npm test`: 109156 tests, 109144 passed, 12 skipped, 0 failed.
- `npm run build`: passed.
- `npm run check`: passed through the OAuth-safe Wrangler dry-run path.
