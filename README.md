# KS2 Mastery Platform v2

This repository is a ground-up rebuild of the KS2 proof of concept.

The goal is not to polish the old prototype. The goal is to give the product a stable base that can carry all six KS2 exam subjects without turning English Spelling into a permanent special case.

## What is inside

- `index.html` and `styles/app.css`
  - A React-owned browser shell that preserves the current visual direction.
- `src/platform/*`
  - Shared platform concerns: route state, learner profiles, subject registry, repository boundary, reward layer, controller orchestration, and React shell support.
  - The subject registry now validates the module contract at startup so boundary mistakes fail early instead of surfacing as mid-render crashes.
  - The shared store now persists learners and subject UI through explicit repository contracts instead of writing directly to browser storage.
- `src/subjects/spelling/*`
  - The rebuilt English Spelling slice.
  - The legacy spelling engine is preserved and wrapped behind a clean service.
  - The spelling service now owns an explicit serialisable state contract, deterministic transitions, resume-safe restoration, and domain-event emission.
  - Spelling content now has a versioned draft/published content model. Learner runtime reads are pinned to published release snapshots, not live draft rows, with current seeded additions supplemented for older account-scoped seed releases.
- `src/subjects/grammar/*`
  - The Stage 1 Grammar practice surface.
  - Grammar runs through the Worker subject command and read-model boundary, with React rendering setup, session, feedback, summary, and analytics states.
- `src/subjects/placeholders/*`
  - Clean extension slots for Arithmetic, Reasoning, Punctuation and Reading.
- `worker/*`
  - A Cloudflare-friendly backend with D1-backed repository routes, ephemeral demo sessions, account-scoped spelling content, learner ownership checks, production sessions, Worker-owned subject commands, selected-provider Worker-side TTS proxying, and thin role-aware Parent/Admin hub routes.
- `docs/*`
  - Audit, architecture, refactor plan, migration map, repository notes, ownership/access notes, state-integrity notes, spelling-service and spelling-content notes, a direct spelling parity audit, operating-surface notes, and the subject-expansion readiness gate.
- `tests/*`
  - Node tests covering the spelling service, reward events, shared store, repository parity, state recovery, import/export round-trips including legacy spelling progress imports, subject runtime containment, hub read models, Worker access, TTS, auth, golden-path smoke flows, and reusable subject-expansion conformance.

## Status

English Spelling works in the new structure. Grammar now has a Stage 1 Worker-command-backed practice surface, while the wider product/gameplay layer remains deliberately staged.

The browser app is now a single React shell. `index.html` loads the built React app bundle, React owns dashboard, Codex, subject, profile, Parent Hub, Admin / Operations, toast and modal surfaces, and the existing controller/store/repository boundary still owns state transitions and side effects. Legacy string renderers remain only as local characterisation helpers while production routes compose React components.

Production on `ks2.eugnel.uk` uses Worker-backed auth, ephemeral demo sessions, API repositories, subject commands, server read models, and prompt-token TTS. `?local=1` no longer creates a browser-local product runtime; browser QA should use a signed-in Worker session or `/demo`. The API adapter reports explicit persistence modes (`local-only`, `remote-sync`, `degraded`) so failed remote writes are visible instead of being treated as silent success, but production practice authority stays behind Worker APIs. The Worker is D1-backed with learner ownership enforcement, atomic account / learner revision checks, idempotent request replay, account-scoped spelling content routes, Worker-command-backed Spelling and Grammar practice, role-aware Parent/Admin hub read routes, Word Bank read models, and protected dictation audio across OpenAI or Gemini, with local browser speech reserved for explicit browser-provider use.

Signed-in Parent Hub and Admin / Operations use live Worker hub payloads. Those adult surfaces keep platform role, learner membership role, and writable/read-only access separate. `/api/bootstrap` remains writable-only for the main subject shell, while readable viewer learners are available inside hub surfaces with explicit read-only labels and blocked write affordances.

The repo now has a reusable subject-expansion harness and an explicit expansion-readiness gate. The gate is a narrow **GO** for the first Arithmetic thin slice only; it is not a claim that the full multi-subject SaaS is finished.

The remaining four subjects are intentionally placeholders. They already have:

- subject identities
- dashboard cards
- subject tabs
- analytics slots
- settings slots
- learner hooks
- reward-layer hooks
- Cloudflare deployment and API boundaries

What they do not have yet is their own deterministic learning engine. That is deliberate. Grammar has crossed that boundary for its Stage 1 practice surface, but it is not yet a finished full-subject product layer.

## Quick start

### Open in a browser

Build and serve the Worker-backed app for product QA, or use `/demo` after deployment/local Worker serving. Opening `index.html` directly is useful only for shell-loading checks because the production app expects Worker auth and read-model APIs.

### Run tests

```bash
npm test
```

### Build and deploy

```bash
npm run check
npm run db:migrate:remote
npm run deploy
```

The Cloudflare scripts run Wrangler through `scripts/wrangler-oauth.mjs`, which deliberately removes `CLOUDFLARE_API_TOKEN` for local child processes. This keeps deploys and remote D1 commands on the logged-in OAuth session even when the parent shell still has an old API token exported. Cloudflare Workers Builds sets `WORKERS_CI=1`, so the wrapper preserves the build-provided token in hosted CI. The legacy `*:oauth` aliases remain for muscle memory, but the default scripts are already OAuth-safe.

The production-client lockdown gate is included in `npm run check`. For explicit evidence, run:

```bash
npm run audit:client
npm run audit:production
```

`npm run deploy` runs the live production audit after upload. Run `npm run audit:production` manually only when rechecking an already deployed build; it checks the live HTML, referenced bundles, and representative source paths before making the strongest public claim.

## Core rebuild decisions

1. Subject engines are separate from the shell.
2. The game layer reacts to mastery instead of controlling learning flow.
3. Learner profiles belong to the platform, not to a single subject.
4. The spelling engine is preserved where it still adds value.
5. The real persistence boundary is a repository contract, not raw browser storage.
6. Persisted data is versioned and normalised at the repository boundary before the shell or subjects consume it.
7. Cloudflare deployment is treated as an adapter boundary, not as the application architecture itself.

## Current operating surfaces

The shell now has two explicit adult-facing routes:

- **Parent Hub**
  - learner overview
  - due work / current focus
  - recent sessions
  - broad strengths / weaknesses
  - misconception patterns
  - export entry points
- **Operations**
  - content release status
  - import / validation summary
  - audit lookup status
  - admin-only account role management
  - learner diagnostics entry points

These are intentionally thin.
They reuse durable platform data and keep reporting logic out of the spelling engine.
The local reference build includes visible role switching for inspection; the Worker path provides permission-checked hub endpoints, D1-backed account role changes, readable viewer diagnostics, and explicit read-only learner labels.

## Subject expansion gate

Pass 13 turns "add a second subject" into a controlled engineering change.

- `tests/helpers/subject-expansion-harness.js` provides reusable conformance and golden-path smoke suites.
- `tests/helpers/expansion-fixture-subject.js` is a non-production fixture proving the shell can carry a second deterministic thin slice.
- `tests/subject-expansion.test.js` runs the same acceptance path against English Spelling, Grammar, and the fixture.
- `docs/subject-expansion.md` defines the add-a-subject checklist.
- `docs/expansion-readiness.md` records the narrow GO decision for the future Arithmetic thin slice.

The fixture is not a shipped product subject, and Arithmetic is still intentionally not implemented in this pass.

## Important note

This reference rebuild is deliberately light on framework machinery. React owns the browser shell, while the Worker API, D1-backed repositories, server-authoritative subject commands, deterministic services, and subject expansion harness remain the stable application boundaries.
