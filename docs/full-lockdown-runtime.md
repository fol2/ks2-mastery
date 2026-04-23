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
npm run build
npm run assert:build-public
npm run audit:client
```

`npm run check` includes the build-public assertion and client bundle audit before the Worker dry-run deploy.

After deploying the current build, run:

```bash
npm run audit:production
```

The production audit downloads the live HTML and referenced same-origin script bundles, then checks for forbidden tokens and representative source-path exposure. Treat any audit failure as a release blocker before making the strongest public claim about the deployed site.

## Allowlisted client strings

Some endpoint strings are expected in the React bundle because the browser must call the Worker:

- `/api/subjects/` for subject commands
- `/api/subjects/spelling/word-bank` for authorised Word Bank read models
- `/api/content/spelling` for explicit operator import/export surfaces
- `/api/learners` for platform learner-profile flows

These strings are allowed only with review rationale. They do not allow importing server content modules, local repositories, Spelling engine modules, hub read-model builders, or local runtime switches into the production client bundle.
