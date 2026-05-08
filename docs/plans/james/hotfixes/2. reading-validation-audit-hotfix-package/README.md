# Reading validation audit hotfix package

Rebuilt package for `ks2-mastery-lean-05080102.zip` after generated artifacts disappeared with the expired session.

## Contents

- `patches/001-reading-negation-marking-and-session-ui.patch` — repo-root patch.
- `contract/reading-negation-ui-hotfix-contract.md` — acceptance contract and evidence boundary.
- `validation-summary.md` — concise validation results.
- `validation/audits/*.json` — baseline, patched, and fresh-apply Reading negation/content audits.
- `validation/logs/*.log` — Node test logs, patch dry-run/apply logs, and environment limitation logs.
- `validation/tools/reading-negation-audit.mjs` — local adversarial audit used for the JSON outputs.

## Apply

From repo root:

```bash
git apply --check patches/001-reading-negation-marking-and-session-ui.patch
git apply patches/001-reading-negation-marking-and-session-ui.patch
```

## Target validation

```bash
node --test \
  tests/reading-content-contract.test.js \
  tests/worker-reading-runtime.test.js \
  tests/reading-subject-registry.test.js

node validation/tools/reading-negation-audit.mjs
```

The full React-backed Reading session-interface test still needs a real repo dependency install because this lean ZIP has no `node_modules` and this environment cannot resolve `esbuild`.
