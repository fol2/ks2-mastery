# AGENTS.md

## Communication

- Address the user as James.
- Communicate with James in Hong Kong Cantonese.
- Keep key technical terms bilingual where helpful.
- Use UK English for code comments, documentation, commit messages, and product copy.

## Engineering Standards

- Keep changes SOLID, DRY, and YAGNI.
- Prefer existing platform and subject-module patterns over new abstractions.
- Do not regress English Spelling parity unless James explicitly accepts the trade-off.
- Treat remote sync, learner state, spelling content, D1, R2, and deployment paths as production-sensitive.

## Cloudflare Deployment

- Use the package scripts, not raw `wrangler`, for normal operations:
  - `npm run check`
  - `npm run db:migrate:remote`
  - `npm run deploy`
- These scripts route Wrangler through `scripts/wrangler-oauth.mjs`, which removes `CLOUDFLARE_API_TOKEN` from the child process so Wrangler uses the logged-in OAuth session.
- Do not reintroduce raw `npx wrangler deploy`, raw remote D1 Wrangler commands, or scripts that depend on `CLOUDFLARE_API_TOKEN` unless the authentication strategy is intentionally changed and documented.
- The `*:oauth` aliases are compatibility aliases only; the default scripts are already OAuth-safe.

## Verification

- Before deployment, run `npm test` and `npm run check`.
- After deployment, verify the production UI on `https://ks2.eugnel.uk` with a logged-in browser session when the change affects user-facing flows.
