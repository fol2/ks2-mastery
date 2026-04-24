# Full Lockdown Runtime Boundary

## Public claim

Production serves a React app shell, but the production learning runtime is server-authoritative.

It is accurate to say:

> Production no longer ships the legacy frontend renderer path, browser-local runtime mode, or production Spelling engine/content datasets. Signed-in and demo practice run through Worker-owned sessions, subject commands, server read models, and prompt-token audio routes.

It is not accurate to say that the browser ships no logic. The browser still contains UI state, routing, display formatting, local component state, filters, and API client glue required for React to render the product.

## Runtime authority

Production authority now sits behind Worker APIs:

- auth and ephemeral demo sessions
- learner access checks and demo expiry checks
- subject command validation and idempotency
- Spelling session creation, word selection, scoring, correction state, progress mutation, and session completion
- reward projection and event persistence
- Parent Hub, Admin / Operations, dashboard, and Word Bank read models
- dictation audio through server prompt tokens

React sends user intent and renders the returned read model. It does not recompute production scoring, queue selection, progress mutation, or reward projection.

## Demo model

`/demo` and the Try demo button create a 24-hour Worker-owned demo session. Each visitor receives an isolated demo account and learner cloned from the server template.

Demo sessions:

- use the same subject command runtime as signed-in accounts
- are blocked after expiry
- can be reset through the Worker demo reset route
- can be converted into a real account while non-expired
- are demo-scoped and do not receive Admin / Operations access

There is no product `?local=1` path. Browser QA should use Worker-backed auth or `/demo`; Node tests may still use local in-memory repositories as test harnesses.

## Degraded policy

The production browser may show cached authorised data when a previously working API session becomes unavailable, but degraded mode is read-only for runtime authority.

While degraded, the shell must not start practice sessions, submit answers, mutate progress, reset demo data, convert accounts, write rewards, import content, or use hidden local engines as a fallback.

## TTS policy

Spelling audio is resolved from server-owned prompt tokens, not raw client transcripts. The intended scalable model is hybrid:

- use pre-generated/static audio where available
- fall back to the protected Worker TTS route for new or missing prompts
- keep provider keys, prompt validation, session ownership, and fallback rate limits on the Worker side

## Bundle audit

The local release gate is:

```bash
npm test
npm run check
```

`npm run check` runs the public build, public-directory assertion, client bundle audit, and Worker dry-run deploy.

The lower-level bundle checks are:

```bash
npm run build
npm run assert:build-public
npm run audit:client
```

`npm run deploy` now runs the production audit after upload. To recheck an already deployed build, run:

```bash
npm run audit:production
```

The production audit downloads the live HTML and referenced same-origin script bundles, then checks for forbidden tokens and representative source-path exposure. Treat any audit failure as a release blocker before making the strongest public claim about the deployed site.

## Controlled rollout gate

Before a public rollout, run the release gate as a repeatable sequence:

```bash
npm test
npm run check
npm run db:migrations:list:remote
npm run db:migrate:remote
npm run deploy
```

Only run the remote migration step when there is a migration to apply. `npm run deploy` performs the post-upload production audit; if rechecking an existing deployment, run `npm run audit:production -- --skip-local --retries 5 --retry-delay-ms 2000`.

The live smoke should prove the actual lockdown failure modes:

- `/demo` returns a Worker-owned session cookie and redirects to `/?demo=1`.
- `/src/main.js`, Spelling content-data paths, Punctuation shared-engine paths, Worker source paths, and representative test paths return 404.
- `/src/bundles/app.bundle.js` is the only allowed source-bundle path.
- `/api/bootstrap` does not serialise Spelling sentinels from `subjectStates`, `practiceSessions`, `eventLog`, or `gameState`.
- Old demo cookies fail after conversion or expiry.
- Demo profile writes are disabled while exports remain available.
- Subject commands require auth and same-origin headers.
- TTS succeeds only through server-resolved prompt tokens.

## Operations

Wrangler observability is enabled, but production should still alert on the signals that would indicate the lockdown boundary is under stress:

- same-origin failures and auth/session failures
- demo rate-limit blocks and active demo-session spikes
- TTS fallback spikes, provider errors, and provider timeouts
- D1 write conflicts, idempotency-reuse errors, and repeated stale-write retries
- production bundle audit failures

Admin / Operations exposes aggregate demo counters for created sessions, active sessions, conversions, cleanup count, rate-limit blocks, and TTS fallback usage. Treat those counters as operational signals, not only dashboard decoration.

## Rollback

Rollback must keep Worker code, D1 state, and public asset exposure aligned:

- Roll back the Worker to the previous known-good deployment from Cloudflare if auth, demo sessions, command routes, or TTS fail after deploy.
- If migration `0007_full_lockdown_runtime.sql` has already applied, do not attempt a blind destructive rollback. Confirm the old Worker can tolerate the added tables/columns, or ship a forward fix.
- After rollback or redeploy, re-run the production audit and manually check raw source denial for `/src/main.js`, `/worker/src/app.js`, and Spelling content-data paths.
- If provider cost or reliability spikes, disable or remove the affected Worker-side TTS provider configuration and keep browser-provider playback as the explicit local option.

## Child Data And Privacy

Before widening access beyond a controlled rollout, complete a child-data/privacy pass covering:

- learner data retention and account deletion
- parent/export access to learner data
- what answer, progress, and TTS metadata is persisted
- whether any child answer or learning data leaves D1 through external providers
- public copy that tells adults when external TTS providers are used

## Allowlisted client strings

Some endpoint strings are expected in the React bundle because the browser must call the Worker:

- `/api/subjects/` for subject commands
- `/api/subjects/spelling/word-bank` for authorised Word Bank read models
- `/api/content/spelling` for explicit operator import/export surfaces
- `/api/learners` for platform learner-profile flows

These strings are allowed only with review rationale. They do not allow importing server content modules, local repositories, Spelling engine modules, hub read-model builders, or local runtime switches into the production client bundle.
