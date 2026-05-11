# Validation summary

## Source

- Uploaded ZIP: `/mnt/data/ks2-mastery-lean-05111556.zip`
- ZIP SHA-256: `596ac6308b01dc16150d584123f9c00303bd102e73b3b977aea034ef852d108b`
- ZIP integrity: passed.
- Local runtime: Node `v22.16.0`.

## Baseline checks before patch

Targeted direct tests:

```text
node --test tests/reasoning-content-contract.test.js tests/reasoning-engine-rewards.test.js tests/reasoning-subject-registry.test.js tests/reasoning-production-smoke.test.js tests/hero-reasoning-integration.test.js
```

Result: `13/13` pass.

Reasoning content audit:

- Templates: `110`
- Seed/template cases checked: `2,200`
- Failures: `7`

Failure classes:

- malformed generated text: `fraction_error_analysis` seeds `8`, `9`;
- unstable item IDs: `reason_better_estimate` seeds `5`, `10`, `11`, `13`, `20`.

`npm test` preflight limitation:

```text
Missing node_modules (react, esbuild) — run "npm install" from this worktree root before "npm test".
```

## Patched checks

Patch dry-run on fresh extraction: passed.

Patch apply on fresh extraction: passed.

Patched targeted tests:

```text
node --test tests/reasoning-content-contract.test.js tests/reasoning-engine-rewards.test.js tests/reasoning-subject-registry.test.js tests/reasoning-production-smoke.test.js tests/hero-reasoning-integration.test.js
```

Result: `18/18` pass.

Patchcheck targeted tests after applying patch to a fresh ZIP extraction: `18/18` pass.

Patched content audit:

- Templates: `110`
- Seed/template cases checked: `2,200`
- Failures: `0`

Syntax checks:

- Reasoning shared content/metadata: passed.
- Reasoning Worker engine/commands/read-models: passed.
- Reasoning client metadata/client-read-model/actions/module/event hooks: passed.
- Reasoning mastery and Hero provider/adapter JS: passed.
- Updated Reasoning tests: passed.

## Production note

No live production deployment smoke was performed in this environment. This package is a Reasoning-only post-implementation hotfix package for the supplied ZIP snapshot.
