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

Result: `20/20` pass.

Patchcheck targeted tests after applying patch to a fresh ZIP extraction: `20/20` pass.

Patched content audit:

- Templates: `110`
- Seed/template cases checked: `110,000`
- Failures: `0`

Syntax checks:

- Reasoning shared content/metadata: passed.
- Reasoning Worker engine/commands/read-models: passed.
- Reasoning client metadata/client-read-model/actions/module/event hooks: passed.
- Reasoning mastery and Hero provider/adapter JS: passed.
- Updated Reasoning tests: passed.

## Production note

The original package did not include live production deployment smoke. This worktree promotion adds production-readiness gates against the repository state rebased on `origin/main`:

- `node --test tests/reasoning-content-contract.test.js tests/reasoning-engine-rewards.test.js tests/reasoning-subject-registry.test.js tests/reasoning-production-smoke.test.js tests/hero-reasoning-integration.test.js`: `20/20` pass. Evidence: `validation/production-ready-targeted-tests-2026-05-11.log`.
- `npm test`: `111,449` pass, `0` fail, `12` skipped. Evidence: `validation/production-ready-npm-test-2026-05-11.log`.
- `npm run check`: Cloudflare dry-run deploy passed; client bundle audit passed; main bundle `204,397 / 232,000` bytes gzip; `--dry-run: exiting now.` Evidence: `validation/production-ready-npm-run-check-2026-05-11.log`.
- `git apply --unidiff-zero --reverse --check patches/002-reasoning-post-implementation-review.patch`: passed against the patched worktree, proving the package patch matches the current code diff. Evidence: `validation/production-ready-patch-reverse-check-2026-05-11.log`.

Live production deployment and smoke evidence:

- `npm run deploy`: passed against commit `1ad7703026487bbcbe5e90b24d7835a84e6009df`; Worker Version ID `73dbedaf-f3cd-4421-abd9-f3ba6fbad056`; production bundle audit passed for `https://ks2.eugnel.uk/`.
- `node ./scripts/reasoning-production-smoke.mjs --out validation/reasoning-production-smoke-2026-05-11.json`: `ok: true`; production content release `reasoning-poc-promoted-2026-05-11`; `110` templates; SATs session completed with reward projection.
- `node ./scripts/reasoning-production-ui-smoke.mjs --out validation/reasoning-production-ui-smoke-2026-05-11.json --screenshot-dir validation/screenshots`: `ok: true`; desktop and mobile setup rendered with no page errors, console errors, request failures, or HTTP failures; desktop session rendered active form.
