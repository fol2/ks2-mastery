# Source Ledger

## ZIP

- Path: `/mnt/data/ks2-mastery-lean-05161145.zip`
- SHA-256: `2eadb98eca14a740a7a67cf54b00f14ef5acca1a8cb9509bb774a7d0c8db00c2`
- Integrity: `unzip -t` passed
- Extraction root: rootless archive
- `.git`: absent
- `.nvmrc`: `22`
- Runtime used: Node `v22.16.0`
- Manifest profile: review bundle, `mode=omit`, `copied=1544`, `omitted=3594`, `placeholders=0`

## ZIP source evidence inspected

- `src/platform/hero/hero-ui-model.js`: original model chose first `launchStatus === 'launchable'` task without progress filtering.
- `src/surfaces/home/HeroQuestCard.jsx`: Start CTA launches `hero.nextTask.taskId`.
- `worker/src/hero/launch.js`: original start command built Hero read model without Hero progress state.
- `worker/src/hero/read-model.js`: read model can expose task `completionStatus` from progress.
- `shared/hero/completion-status.js`: task statuses include `not-started`, `completed`, `blocked`, `in-progress`, and `completed-unclaimed`.
- `shared/hero/economy.js`: daily completion coin award is capped/idempotent.
- `wrangler.jsonc`: Hero flags default to `false` in the ZIP snapshot.

## GitHub

- Connector metadata only: `fol2/ks2-mastery`, default branch `main`, public.
- No exact GitHub file was used as authoritative patch evidence.

## Local-run evidence

- `validation/hero-targeted-tests-patched.log`: patched targeted Hero suite passed, 131/131.
- `validation/hero-fresh-apply-smoke.log`: fresh extraction + patch apply + two-file smoke passed, 56/56.
- `validation/hero-verify-pA7-patched.log`: pA7 verifier passed, 2/2.
- `validation/patch-dry-run-and-apply.log`: patch dry-run/apply passed.

## Production

No production evidence. `https://ks2.eugnel.uk` must be checked by the local agent after deployment or after confirming the change is already live.
