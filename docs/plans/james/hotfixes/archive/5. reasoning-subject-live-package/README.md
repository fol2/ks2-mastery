# Reasoning subject live patch package

This package contains the production Reasoning subject implementation patch for the uploaded KS2 Mastery lean ZIP snapshot.

Files:

- `contract/reasoning-live-contract.md` — implementation and acceptance contract.
- `patches/001-reasoning-subject-live.patch` — unified patch from the uploaded ZIP snapshot to the implemented tree.
- `validation-summary.md` — validation commands and results.
- `validation/*.log` — captured local validation logs.
- `validation/production/reasoning-production-smoke-2026-05-11.json` — live deployed smoke evidence from `https://ks2.eugnel.uk`.
- `validation/production/reasoning-production-ui-smoke-2026-05-11.json` — live browser UI smoke evidence from `https://ks2.eugnel.uk`.
- `validation/production/screenshots/` — desktop and mobile Reasoning production screenshots.
- `validation/local/*.log` — raw local verification command logs captured during repository integration.
- `reasoning-subject-live-completion-report-2026-05-11.md` — repository integration, deployment, review, and closure report.

Apply from a clean extraction of `ks2-mastery-lean-05111050.zip` or a matching repo snapshot:

```bash
patch -p1 < patches/001-reasoning-subject-live.patch
npm ci --ignore-scripts
npm test -- tests/reasoning-content-contract.test.js tests/reasoning-engine-rewards.test.js tests/reasoning-subject-registry.test.js tests/hero-reasoning-integration.test.js tests/hero-providers.test.js tests/hero-launch-adapters.test.js tests/hero-eligibility.test.js tests/worker-subject-runtime.test.js tests/worker-reading-runtime.test.js tests/reading-subject-registry.test.js tests/main-runtime.test.js tests/react-subject-contract.test.js tests/ui-visual-journey-ready-subjects.test.js tests/ui-subject-visual-adapter-contract.test.js tests/hero-pool-registry.test.js tests/subject-contract.test.js
npm run build
```

The original lean package did not include deployment or live production smoke evidence. The repository integration now adds a dedicated Reasoning production smoke and completion report beside this package.
