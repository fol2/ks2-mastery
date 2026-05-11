# Reasoning subject live patch package

This package contains the production Reasoning subject implementation patch for the uploaded KS2 Mastery lean ZIP snapshot.

Files:

- `contract/reasoning-live-contract.md` — implementation and acceptance contract.
- `patches/001-reasoning-subject-live.patch` — unified patch from the uploaded ZIP snapshot to the implemented tree.
- `validation-summary.md` — validation commands and results.
- `validation/*.log` — captured local validation logs.

Apply from a clean extraction of `ks2-mastery-lean-05111050.zip` or a matching repo snapshot:

```bash
patch -p1 < patches/001-reasoning-subject-live.patch
npm ci --ignore-scripts
npm test -- tests/reasoning-content-contract.test.js tests/reasoning-engine-rewards.test.js tests/reasoning-subject-registry.test.js tests/hero-reasoning-integration.test.js tests/hero-providers.test.js tests/hero-launch-adapters.test.js tests/hero-eligibility.test.js tests/worker-subject-runtime.test.js tests/worker-reading-runtime.test.js tests/reading-subject-registry.test.js tests/main-runtime.test.js tests/react-subject-contract.test.js tests/ui-visual-journey-ready-subjects.test.js tests/ui-subject-visual-adapter-contract.test.js tests/hero-pool-registry.test.js tests/subject-contract.test.js
npm run build
```

No deployment/live production smoke is included in this package.
