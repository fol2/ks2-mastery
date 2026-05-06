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

Local ZIP workout result: focused set passed with 24 tests and 0 failures. Broader non-React subject/reward smoke set passed with 170 tests and 0 failures.

`npm run build` was not certified in the lean ZIP because `node_modules` is absent and `esbuild` could not be resolved. Run final CI in the dependency-installed repo.
