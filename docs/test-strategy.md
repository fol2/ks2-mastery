# Test Strategy

## Purpose

This repository uses a layered verification flow:

- Vitest covers Worker-side logic and HTTP behaviour inside the Cloudflare
  Workers runtime.
- Playwright covers browser flows against the same local build-and-serve path
  used in development.
- `npm run check` and `npm run verify` exercise the current delivery contract
  before deployment.

## Commands

```bash
npm test
npm run test:e2e
npm run check
npm run verify
```

## Vitest

Vitest is configured in `vitest.config.mjs` with
`@cloudflare/vitest-pool-workers`.

Important behaviour:

- Tests run against the real Worker entry point at `worker/index.js`.
- The Worker runtime uses the Wrangler config from `wrangler.jsonc`.
- `test/setup.mjs` is loaded before the suite.
- `npm test` rebuilds `dist/public` and runs `assert-build-public` before
  Vitest starts, so a clean checkout still exercises the expected asset
  contract.

Current layout:

- `test/unit/`
  Store, security, OAuth, observability, migration-plan, TTS normalisation,
  smoke, and spelling-domain coverage.
- `test/integration/`
  Route-level coverage for auth, auth security, children, rate limiting,
  observability, spelling, and TTS proxying.

Use Vitest when:

- changing Worker routes or payloads
- changing D1 schema expectations or persistence logic
- changing auth, Turnstile, or rate limiting behaviour
- changing observability, request IDs, or health-check behaviour
- changing spelling or TTS service logic

## Playwright

Playwright is configured in `playwright.config.js`.

The E2E runner:

- chooses a free local port through `scripts/run-e2e.mjs`
- starts the full local stack through `scripts/run-local-dev.mjs`
- builds the frontend
- applies local migrations
- runs the local backfill
- serves the app with `wrangler dev --local`

Current browser coverage includes:

- signup and onboarding flows
- sign-in validation failures
- spelling session flow
- child-profile management

Use Playwright when:

- changing browser auth or onboarding flows
- changing the frontend boot contract
- changing local dev serving or build orchestration
- changing user-visible spelling flows

## Build and deploy sanity checks

`npm run check` is the deploy-oriented contract check:

1. rebuild the frontend
2. assert the generated static output shape
3. run a Cloudflare dry-run deploy

`npm run verify` is the current high-confidence handoff sequence:

1. `npm test`
2. `npm run check`
3. `npm run test:e2e`

## Coverage expectations

- Pure logic change: add or update a unit test.
- Worker API or persistence change: add or update an integration test.
- Browser or delivery-path change: run the affected Playwright coverage.
- Release-facing change: run `npm run verify`.

## Known scope limits

- Spelling is still the deepest fully implemented subject, so the heaviest
  automated coverage remains concentrated there.
- The other subjects still lean on shared shell behaviour and placeholder
  content, so their domain-specific coverage is lighter.
