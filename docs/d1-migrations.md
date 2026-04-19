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

Until a dedicated staging D1 database exists, treat local D1 as the rehearsal
environment and production D1 as the only remote target. Once staging is added,
run the same sequence against staging first and only then against production.

## Deployment

`npm run deploy` fires the `predeploy` hook (`scripts/ci-migrate-on-main.mjs`)
before `wrangler deploy`. The hook applies outstanding remote migrations so the
deployed Worker never boots against a schema it assumes but the database has
not yet received.

Behaviour by context:

- **Local developer**: the hook always runs and invokes
  `wrangler d1 migrations apply … --remote`. Requires `wrangler login` or
  `CLOUDFLARE_API_TOKEN` to be set.
- **Cloudflare Workers Builds**: the hook reads `WORKERS_CI_BRANCH`. It
  migrates on `main` and skips on every other branch so a feature-branch
  preview never rewrites production schema.
- **GitHub Actions**: the hook reads `GITHUB_REF_NAME` with the same rule
  (migrate on `main`, skip elsewhere). Works out of the box in any workflow
  that runs `npm run deploy` with `CLOUDFLARE_API_TOKEN` +
  `CLOUDFLARE_ACCOUNT_ID` secrets.

### Cloudflare Workers Builds — one-time dashboard setup

To wire the automation end-to-end:

1. Cloudflare dashboard → `Workers & Pages` → `ks2-mastery` → `Settings` →
   `Builds`.
2. Set **Deploy command** to `npm run deploy` (default is `npx wrangler deploy`,
   which bypasses the hook).
3. Ensure the build environment exposes `CLOUDFLARE_API_TOKEN` with D1 write
   scope for the `ks2-mastery-db` binding.

If the deploy command stays at the default, migrations do **not** auto-apply
and every schema-changing merge to `main` must be preceded by a manual
`npm run db:migrate:remote` — otherwise `/api/*` returns 500 until it is run.

## Creating a new migration

Create a file with Wrangler, then commit the generated SQL:

`npm run db:migration:create -- <migration_name>`

Keep data repairs out of schema migrations unless the schema change depends on
them immediately. Use `scripts/d1-backfill.sql` for idempotent backfills that
may need to run more than once.
