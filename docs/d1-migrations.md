# D1 migrations

`migrations/` is the only source of truth for the KS2 Mastery schema.

The Worker no longer creates tables at runtime. If the database is missing the
expected schema, requests fail fast with a clear readiness error instead of
silently mutating production data.

## Local workflow

1. Apply the schema:
   `npm run db:migrate:local`
2. Repair historical rows if you are upgrading an older local database:
   `npm run db:backfill:local`
3. Seed a demo account when you want a ready-made sign-in:
   `npm run db:seed:local`

`npm run dev` wraps the supported local full-stack loop by building the client,
applying local migrations, running the idempotent backfill, and then starting
`wrangler dev --local`. If you need a fresh local persistence directory, pass
it through to the wrapper, for example `npm run dev -- --persist-to ./.tmp-d1`.

The local seed creates:

- email: `demo.parent@example.test`
- password: `demo-password-1234`

## Remote workflow

Apply schema changes remotely before deploying code that depends on them:

1. `npm run db:migrations:list:remote`
2. `npm run db:migrate:remote`
3. `npm run db:backfill:remote`

Until a dedicated staging or preview D1 database exists, treat local D1 as the
rehearsal environment and the configured remote D1 binding as the shared target.
Once staging is added, run the same sequence against staging first and only then
against production.

## Deployment

`npm run deploy` fires the `predeploy` hook (`scripts/ci-migrate-on-main.mjs`)
before `wrangler deploy`. That covers local operators and any CI workflow that
calls the npm script directly.

Cloudflare Workers Builds often invokes `wrangler deploy` directly. To keep
that path safe too, `wrangler.jsonc` defines `build.command =
node ./scripts/workers-build.mjs`. The wrapper is intentionally a no-op unless
`WORKERS_CI_BRANCH` is present; in Workers Builds it runs `npm run build` and
then invokes `scripts/ci-migrate-on-main.mjs`. Remote D1 migrations are
disabled there by default because the Cloudflare GitHub App token often lacks
the D1 write scope needed for `wrangler d1 migrations apply`. Set
`WORKERS_CI_APPLY_D1_MIGRATIONS=true` only after the build environment has a
token that can actually administer the bound D1 database.

Behaviour by context:

- **Local developer**: the hook always runs and invokes
  `wrangler d1 migrations apply … --remote`. Requires `wrangler login` or
  `CLOUDFLARE_API_TOKEN` to be set.
- **Cloudflare Workers Builds**: the hook reads `WORKERS_CI_BRANCH`. It
  skips remote D1 migrations by default. If
  `WORKERS_CI_APPLY_D1_MIGRATIONS=true` is set, it migrates the shared remote
  DB on `main`. On every other branch it migrates the preview DB when
  `preview_database_id` is configured; otherwise it skips instead of touching
  the shared remote DB.
- **GitHub Actions**: the hook reads `GITHUB_REF_NAME` with the same rule.
  Works out of the box in any workflow that runs `npm run deploy` with
  `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets.

If non-main previews still share the main remote DB, keep schema migrations
backwards-compatible. A preview deploy may prepare the shared database before
the branch merges, and `main` must keep working while that branch is still open.

### Cloudflare Workers Builds — one-time dashboard setup

To wire the automation end-to-end:

1. Cloudflare dashboard → `Workers & Pages` → `ks2-mastery` → `Settings` →
   `Builds`.
2. Optional but recommended: set `preview_database_id` on the `DB` binding in
   `wrangler.jsonc` so non-main previews can migrate and run against a dedicated
   preview D1 database instead of the shared remote one.
3. Only if you want Workers Builds itself to run remote D1 migrations, add
   `CLOUDFLARE_API_TOKEN` with D1 write scope for `ks2-mastery-db`, then set
   `WORKERS_CI_APPLY_D1_MIGRATIONS=true`. If either piece is missing, leave the
   opt-in unset and run remote migrations from a trusted local shell or a CI
   job with explicit Cloudflare credentials instead.

## Creating a new migration

Create a file with Wrangler, then commit the generated SQL:

`npm run db:migration:create -- <migration_name>`

Keep data repairs out of schema migrations unless the schema change depends on
them immediately. Use `scripts/d1-backfill.sql` for idempotent backfills that
may need to run more than once.
