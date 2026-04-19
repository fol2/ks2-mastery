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

## Creating a new migration

Create a file with Wrangler, then commit the generated SQL:

`npm run db:migration:create -- <migration_name>`

Keep data repairs out of schema migrations unless the schema change depends on
them immediately. Use `scripts/d1-backfill.sql` for idempotent backfills that
may need to run more than once.
