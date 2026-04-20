# Pass 10 integration manifest

Source folder: `/Users/jamesto/Coding/ks2-mastery-legacy/pass10/ks2-platform-v2-pass10-spelling-parity`

Source report: `/Users/jamesto/Coding/ks2-mastery-legacy/pass10/ks2-platform-v2-pass10-spelling-parity-report.md`

## Adopted

- `docs/spelling-parity.md`
- `pass-10.md`
- `src/subjects/spelling/auto-advance.js`
- `src/subjects/spelling/session-ui.js`
- `src/subjects/spelling/shortcuts.js`
- `tests/helpers/manual-scheduler.js`
- `tests/spelling-parity.test.js`

## Merged

- `README.md` - adopted the spelling parity audit reference.
- `docs/spelling-service.md` - adopted the Pass 10 parity notes.
- `src/main.js` - merged shortcut and auto-advance runtime wiring while preserving the production auth and remote repository boot path.
- `src/subjects/spelling/module.js` - adopted Pass 10 spelling UI parity behaviour.
- `tests/helpers/app-harness.js` - adopted Pass 10 shortcut and auto-advance test seams.

## Preserved current production files

These pass10 files were older than the deployed production repo and would regress auth, D1 sync, deployment, or recent sync fixes if copied wholesale:

- `package.json`
- `package-lock.json`
- `.gitignore`
- `migration-plan.md`
- `wrangler.jsonc`
- `scripts/assert-build-public.mjs`
- `scripts/build-public.mjs`
- `scripts/d1-backup.mjs`
- `scripts/d1-reset.mjs`
- `src/platform/core/repositories/api.js`
- `src/platform/core/repositories/auth-session.js`
- `src/platform/core/repositories/contract.js`
- `src/platform/core/repositories/local.js`
- `src/platform/core/store.js`
- `src/platform/ui/render.js`
- `styles/app.css`
- `worker/migrations/0004_production_auth.sql`
- `worker/src/app.js`
- `worker/src/auth.js`
- `worker/src/d1.js`
- `worker/src/http.js`
- `tests/helpers/sqlite-d1.js`
- `tests/mutation-policy.test.js`
- `tests/persistence.test.js`
- `tests/smoke.test.js`
- `tests/worker-auth.test.js`

## Intentionally skipped

- `src/subjects/spelling/engine/legacy-engine.js` - pass10 only differed by generated whitespace; the report says the preserved spelling engine itself was not reinterpreted.
- Whole-folder replacement - rejected because pass10 was based on a local-only snapshot and lacked the current production auth, D1, sync, build, and deployment changes.
