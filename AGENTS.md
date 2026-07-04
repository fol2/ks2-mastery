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
- `docs/solutions/` contains documented solutions to past problems (bugs, workflow patterns, conventions), organised by category with YAML frontmatter (`module`, `tags`, `problem_type`). Relevant when implementing or debugging in documented areas.

## Cloudflare Deployment

- Use the package scripts, not raw `wrangler`, for normal operations:
  - `npm run check`
  - `npm run db:migrate:remote`
  - `npm run deploy`
- These scripts route Wrangler through `scripts/wrangler-oauth.mjs`, which removes `CLOUDFLARE_API_TOKEN` from the child process so Wrangler uses the logged-in OAuth session.
- Do not reintroduce raw `npx wrangler deploy`, raw remote D1 Wrangler commands, or scripts that depend on `CLOUDFLARE_API_TOKEN` unless the authentication strategy is intentionally changed and documented.
- The `*:oauth` aliases are compatibility aliases only; the default scripts are already OAuth-safe.
- The repo root `.npmrc` intentionally stays free of Playwright skip keys because npm warns on unknown project config. The Wrangler wrapper (`scripts/wrangler-oauth.mjs`) injects `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` for normal deploy/check paths, so production builds skip the ~300 MB Chromium download without npm warning noise. Developers who need the browser locally opt in with `npx playwright install chromium`. See `docs/operations/capacity.md#playwright-test-suite`.

## Verification

- Before deployment, run `npm test` and `npm run check`.
- When working from a fresh git worktree, run `node scripts/worktree-setup.mjs` once before `npm test` or `npm run check`. This symlinks `node_modules` from the primary checkout when `package.json` and `package-lock.json` are identical, avoiding a full reinstall (saves ~184 MB per worktree). It falls back to `npm install` automatically if the package files diverge.
- After deployment, verify the production UI on `https://ks2.eugnel.uk` with a logged-in browser session when the change affects user-facing flows.

## Cursor Cloud specific instructions

Node 22 (`.nvmrc`); dependencies are refreshed on startup via `npm install`. Standard commands live in `package.json` scripts and the README — reference those rather than duplicating them. Notes below are the non-obvious caveats.

- **Local browser QA — do NOT use `wrangler dev`.** The `build.command` in `wrangler.jsonc` regenerates watched source files (`src/platform/game/monster-asset-manifest.js`, `src/bundles/*`, `worker/src/generated-csp-hash.js`), so `wrangler dev`'s watcher rebuilds forever and the server never becomes ready. To serve the app locally, run the real Worker in-process against an in-memory migrated SQLite DB with the Playwright QA server: `node ./tests/helpers/browser-app-server.js --serve-only --port 4173 --with-worker-api`, then open `http://127.0.0.1:4173/demo` for a signed-in demo learner. (`scripts/capacity-local-worker.mjs` also drives `wrangler dev --local`, but only for automated load runs, not interactive serving.)
- **`/api/*` and `/demo` enforce same-origin.** Browser requests work; `curl` needs an `Origin: http://127.0.0.1:4173` header or it returns `403 same_origin_required`.
- **`npm run check` needs build outputs.** It is a `wrangler deploy --dry-run` that reads `dist/public` and `dist/worker/index.js`, so run `npm run build` and `npm run build:worker` first.
- `npm test` runs the full ~112k-case Node suite (several minutes) and needs no services. A `pre-push` hook (`simple-git-hooks`) runs `npm test`; bypass with `SKIP_PREPUSH=1 git push` when tests were already run separately.
- TTS (dictation audio) needs `OPENAI_API_KEY` / `GEMINI_API_KEY` and degrades gracefully without them (audio shows "unavailable"); all practice flows work without keys.
