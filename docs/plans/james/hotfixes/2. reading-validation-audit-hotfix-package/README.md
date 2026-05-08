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

## Repo validation

```bash
node --test \
  tests/reading-content-contract.test.js \
  tests/worker-reading-runtime.test.js \
  tests/reading-subject-registry.test.js \
  tests/reading-session-interface.test.js

node validation/tools/reading-negation-audit.mjs
npm test
npm run check
```

Final repo evidence is in `validation/logs/` and `validation/audits/repo-reading-negation-audit-2026-05-08.json`.

## Production validation

Production was deployed from commit `c7716f57c2ed871978bc4d203737f3ca428fdc46` using the repository `npm run deploy` script. The successful deploy retry produced Cloudflare Worker Version ID `0ae565fd-11e7-467e-9abf-a8f85227bc8b`, and the production bundle audit passed for `https://ks2.eugnel.uk/`.

The Reading production smoke evidence is in `validation/production/reading-production-smoke-2026-05-08.json`.
