# KS2 Mastery Full Replacement Plan

## Summary

- Use a deletion commit on `fol2/ks2-mastery/main`: keep GitHub history, but replace the current tree so no old application files remain in `HEAD`.
- Target Production SaaS, not a quick local-first cutover: email/password and social OAuth, D1-backed repository sync, production Cloudflare Worker config, and post-deploy health checks before calling replacement complete.
- Use the existing remote D1 database id, but intentionally wipe old schema/data after a fresh backup. No old data migration.
- Keep R2 out of the initial v2 binding unless server-side TTS/audio buffering is reintroduced. Binding unused services creates operational confusion.
- Relevant workflows/skills:
  - Compound Engineering: `ce:plan` now, then `ce:work`, `ce:review`, `verification-before-completion`.
  - gstack: `/setup-deploy`, `/ship`, `/qa`, `/canary`, then `/land-and-deploy` if deployment config is known.

## Key Changes

- Repository replacement:
  - Work from `/Users/jamesto/Coding/ks2-mastery-old`, because it is already linked to `https://github.com/fol2/ks2-mastery.git`.
  - Create a safety branch/tag from current `origin/main` before any deletion commit.
  - Delete tracked old files, copy in the redesigned repo from `/Users/jamesto/Coding/ks2-mastery`, excluding `.DS_Store`, zip archives, local caches, backups, and generated deploy artefacts.
  - Commit the replacement as one explicit deletion/addition commit on `main`.

- Cloudflare deploy shape:
  - Add root `wrangler.jsonc` for Worker name `ks2-mastery`, `main = ./worker/src/index.js`, `assets.directory = ./dist/public`, `run_worker_first = ["/api/*"]`, D1 binding `DB`, and Durable Object binding `LEARNER_LOCK`.
  - Add a build step that stages only browser-safe files into `dist/public`: `index.html`, `styles/`, `src/`, and `assets/`. Do not serve repo root, tests, docs, worker source, migrations, or legacy source directly.
  - Add scripts equivalent to `test`, `build`, `check`, `deploy`, `db:migrate:*`, `ops:tail`, and guarded D1 backup/reset commands.
  - Keep Cloudflare auto-build on `main`; update dashboard build settings only if the current Workers Build command cannot run the new `npm run deploy` or Wrangler path.
  - Use `npm run check:oauth`, `npm run db:migrate:remote:oauth`, and `npm run deploy:oauth` when the shell contains an old `CLOUDFLARE_API_TOKEN`; these commands unset that token for Wrangler so the logged-in OAuth session is used.

- Production auth:
  - Replace `production-placeholder` with real session auth.
  - Add email/password auth plus social OAuth providers: Google, Facebook, X, and Apple, enabled only when their secrets are configured.
  - Use an `HttpOnly`, `Secure`, `SameSite=Lax` session cookie, for example `ks2_session`, with hashed session storage in D1.
  - Add v2 auth tables without reusing old schema directly: account credentials, account identities, sessions, and request limits tied to `adult_accounts`.
  - Add routes: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/:provider/start`, provider callbacks, `GET /api/session`, and existing repository routes.
  - Keep Turnstile/rate-limit hooks from the old design pattern, but wire them to v2 account/session tables.

- Frontend SaaS boot:
  - Add a production boot path that uses `createApiPlatformRepositories` against same-origin `/api/*` with cookie credentials.
  - Keep local-first mode only for direct file/local development fallback.
  - Add sign-in/register/logout UI before the learner dashboard when no session exists.
  - On successful auth, hydrate from `/api/bootstrap`; on failure, show explicit degraded/offline state instead of silently falling back to another user scope.
  - Preserve current import/export local data tools, but do not auto-migrate old production data.

- D1 reset:
  - Before destructive reset, create a remote D1 backup from existing `ks2-mastery-db`.
  - Add a guarded reset script requiring an explicit confirmation env var/value before dropping old tables and migration tracking.
  - Apply v2 migrations cleanly after reset.
  - Verify `/api/health` checks D1 reachability, asset binding, auth mode, and migration readiness.

## Public Interfaces

- Browser-visible API:
  - `GET /api/health`
  - `GET /api/session`
  - `GET /api/bootstrap`
  - Auth routes listed above.
  - Existing generic repository routes for learners, subject state, practice sessions, game state, and event log remain the persistence contract.
  - Spelling content routes: `GET /api/content/spelling` and `PUT /api/content/spelling`.

- Cloudflare bindings:
  - `DB`: existing D1 database id, reset to v2 schema.
  - `ASSETS`: staged `dist/public`.
  - `LEARNER_LOCK`: Durable Object class `LearnerLock`.
  - No R2 binding for v2 unless a concrete Worker feature needs it.

- Secrets/config:
  - `AUTH_MODE=production`
  - `APP_NAME=KS2 Mastery`
  - `APP_HOSTNAME=ks2.eugnel.uk`
  - OAuth secrets per provider as needed.
  - Turnstile secrets optional but supported.
  - Cloudflare API token only for deploy/migration automation, never committed. Prefer the `*:oauth` npm scripts on James's machine because Wrangler is already logged in through OAuth there.

## Pass 11 Integration Addendum

- Add `account_subject_content` through migration `0005_spelling_content_model.sql`, not the pass folder's `0004`, because this production repo already has `0004_production_auth.sql`.
- Keep the existing production auth, OpenAI TTS proxy, autocomplete fixes, session auto-advance recovery, and stale-write rebase behaviour.
- Integrate pass 11 as a content-model layer only:
  - versioned spelling draft and published release bundles
  - generated runtime snapshot consumed by `createSpellingService({ contentSnapshot })`
  - thin settings UI for content summary, export, import, publish, and reset
  - Worker/D1 content routes protected by the same account revision and request-receipt mutation policy
- Do not replace the current repo wholesale with the pass 11 folder, because that pass baseline predates production hardening and would regress auth, TTS, and sync.

## Test Plan

- Local baseline:
  - `npm test` must remain green. Current baseline is 59/59 passing.
  - Add auth unit/integration tests for register, login, logout, session cookie, missing/invalid session, social provider disabled, and rate-limit behaviour.
  - Add repository boot tests proving production browser startup uses API repositories and local file startup uses local repositories.

- Cloudflare checks:
  - `npm run build` verifies `dist/public` contains only browser-safe assets.
  - `npm run check` runs Worker dry-run deploy.
  - Local Wrangler test applies migrations to local D1, signs in, creates learner, completes a spelling action, reloads, and verifies remote persistence.

- Browser QA:
  - Register/login/logout flow.
  - Social start route returns provider redirect only when configured.
  - First learner creation and spelling practice persists after refresh.
  - Offline/degraded sync message appears when API write fails.
  - `https://ks2.eugnel.uk/api/health` returns healthy after deploy.

- Cutover verification:
  - Confirm GitHub `main` contains no old app files.
  - Confirm Cloudflare deployment points to the new commit.
  - Confirm `ks2.eugnel.uk` loads the redesigned UI.
  - Confirm Worker logs show no startup schema/auth errors.
  - Tail logs for the first deployment window and run gstack `/canary`.

## Assumptions

- Downtime is acceptable, so the plan prioritises clean replacement over zero-downtime migration.
- Old production data can be discarded after backup.
- Git history may remain because a deletion commit was chosen, but the latest `main` tree must not retain old app files.
- Existing `ks2.eugnel.uk` DNS/route stays in Cloudflare; only the Worker/build/repo content changes.
- R2 is not part of v2 launch unless a specific audio/TTS feature needs server-side object storage.
