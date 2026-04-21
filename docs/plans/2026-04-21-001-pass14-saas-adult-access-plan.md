---
title: "feat: Integrate Pass 14 SaaS Adult Access Honesty"
type: feat
status: active
date: 2026-04-21
origin: /Users/jamesto/Coding/ks2-mastery-legacy/pass14/ks2-platform-v2-saas-first-pass-14-report.md
source: /Users/jamesto/Coding/ks2-mastery-legacy/pass14/ks2-platform-v2-saas-first-pass-14
---

# feat: Integrate Pass 14 SaaS Adult Access Honesty

## Overview

Integrate Pass 14 from `/Users/jamesto/Coding/ks2-mastery-legacy/pass14/ks2-platform-v2-saas-first-pass-14` into the live `fol2/ks2-mastery` repo and deploy it to `ks2.eugnel.uk`.

Pass 14 closes the signed-in adult-access honesty gap. Signed-in Parent Hub and Admin / Operations should use real Worker hub payloads instead of locally assembled synthetic models. Viewer memberships should be visible and selectable in adult surfaces, while the main subject shell remains writable-only. Viewer contexts must be labelled read-only and write affordances must be blocked explicitly.

The pass source is not safe to copy over wholesale. It is behind the current production repo in monster celebration, dashboard roaming, Codex catch thresholds, spelling analytics, sync retry behaviour, OpenAI TTS, import/export, and OAuth-safe deployment. The integration must port Pass 14's SaaS adult-access work while preserving all current production behaviour.

## Requirements Trace

- R1. Add signed-in hub loading through the existing `createHubApi()` seam.
- R2. Keep Parent Hub and Admin / Operations read models sourced from live Worker hub payloads when signed in.
- R3. Add adult-surface learner selection for readable owner/member/viewer memberships without polluting writable bootstrap state.
- R4. Make viewer contexts explicit as read-only and block write affordances with clear messages.
- R5. Keep `/api/bootstrap` writable-only; viewer learners must remain visible through hub routes only.
- R6. Prevent remote or signed-in empty bootstrap from auto-creating a default learner, while preserving local-only convenience seeding.
- R7. Preserve all post-Pass-13 production fixes: monster celebration overlay, dashboard monster roaming, caught thresholds, spelling analytics word progress, sync retry/rebase behaviour, OpenAI TTS, deploy OAuth wrapper, and legacy import/export.
- R8. Add Pass 14 tests and docs, adjusting only where current production behaviour intentionally supersedes the source snapshot.
- R9. Verify locally, push to GitHub, deploy with `npm run deploy:oauth`, and run production smoke checks against `ks2.eugnel.uk`.

## Scope Boundaries

- Do not replace the current repo with the Pass 14 folder wholesale.
- Do not delete `src/platform/game/monster-celebrations.js`.
- Do not remove monster celebration queue state, overlay rendering, high-resolution monster assets, or dashboard roaming CSS.
- Do not revert Codex catch thresholds:
  - Inklet and Glimmerbug are caught at 1 secure word.
  - Phaeton is caught at 3 combined secure words.
  - Later stages stay at 10/30/60/90 and 25/95/145/200 respectively.
- Do not revert spelling analytics, profile dropdown fixes, local-storage import/export, OpenAI TTS, or OAuth-safe Wrangler deployment scripts.
- Do not add invites, billing, organisations, provider-account linking, Arithmetic delivery, or writable viewer participation in the subject shell.
- Do not add a new backend domain model or D1 migration unless implementation proves one is genuinely required. The report indicates no migration is needed.

## Context And Local Research

### Source Report Summary

Pass 14 changes are concentrated around signed-in adult surfaces:

- `src/main.js`
  - create and use `hubApi` for signed-in Parent Hub and Admin / Operations
  - track remote loading/error state
  - track separate adult-surface learner selection
  - block read-only viewer write actions
- `src/platform/hubs/shell-access.js`
  - new helper for role/membership/writability interpretation
  - central read-only action block reasons
- `src/platform/ui/render.js`
  - render platform role, membership role, access labels, remote loading/error states
  - render adult learner selector and disabled write affordances
  - render honest no-writable-learner shell states
- `src/platform/hubs/parent-read-model.js`
  - carry accessible learners, selected learner id, writable labels
- `src/platform/hubs/admin-read-model.js`
  - carry viewer diagnostics and writable labels
  - only expose Parent Hub entry point when the selected readable membership allows it
- `worker/src/repository.js`
  - Parent Hub resolves readable memberships, including viewers
  - Parent Hub returns accessible readable learners
- `src/platform/core/store.js`
  - remote/signed-in empty bootstrap no longer seeds a fake local learner
- tests cover hub API client, shell access helpers, remote payload rendering, viewer hub routes, and zero-writable bootstrap behaviour

### Current Repo Differences That Must Be Preserved

The Pass 14 source folder is older than the current `main` in several areas:

- It would remove `src/platform/game/monster-celebrations.js` and strip celebration handling from `src/main.js`, `src/platform/core/store.js`, `tests/helpers/app-harness.js`, `src/platform/ui/render.js`, `styles/app.css`, and tests.
- It would revert dashboard monsters from the roaming playground back to static images.
- It would revert uncaught Codex placeholders and caught thresholds in `src/subjects/spelling/module.js`, `src/platform/game/monster-system.js`, `src/platform/game/monsters.js`, `docs/architecture.md`, `docs/events.md`, and `docs/spelling-service.md`.
- It lacks current local docs and pass notes.
- It does not include all recent production regression fixes.

These differences are treated as source-snapshot drift, not desired Pass 14 changes.

### Local Patterns To Follow

- `src/platform/hubs/api.js` is already present and should be used rather than duplicating fetch logic.
- `src/platform/access/roles.js` already contains `canMutateLearnerData`, platform role helpers, and membership label helpers.
- `src/platform/hubs/parent-read-model.js` and `src/platform/hubs/admin-read-model.js` are the right boundary for read-model shape changes.
- `worker/src/repository.js` already has `listMembershipRows(db, accountId, { writableOnly })`, `requireLearnerReadAccess`, and hub route methods.
- `src/platform/core/store.js` is the correct place to stop non-local empty-bootstrap auto-seeding.
- Existing deploy hygiene is in `scripts/wrangler-oauth.mjs` and `package.json` scripts. Deploy must use `npm run deploy:oauth`.

### External Research

No external research is needed. This pass uses existing local Worker/session/read-model patterns and does not introduce a new dependency or external API.

## Key Technical Decisions

- **Selective merge only:** Port Pass 14 access honesty work file by file. Never rsync or copy the whole folder.
- **Signed-in hub payloads are source of truth:** On Worker sessions, Parent Hub and Admin / Operations render from `/api/hubs/parent` and `/api/hubs/admin`; local-reference mode continues using local read models for inspection.
- **Separate adult-surface selection from writable shell selection:** A selected viewer learner can be active in a hub without becoming `appState.learners.selectedId`.
- **Read-only means visibly blocked:** Viewer contexts should show read-only chips/notices and disable subject/profile/import/export/reset actions that mutate writable learner state.
- **Main shell remains writable-only:** If signed-in bootstrap returns zero writable learners, the shell should show honest empty states, not create a local learner.
- **Keep monster features authoritative from current production:** Any Pass 14 changes that remove or weaken current monster behaviour are rejected as snapshot drift.
- **Docs are additive and reconciled:** Apply only the adult-access wording from Pass 14 docs. Keep current monster threshold wording and newer production notes.

## Implementation Units

- [x] **Unit 1: Add Hub Shell Access Helpers And API Tests**

**Goal:** Add the new central helper for adult-surface access interpretation and cover the existing hub API client.

**Requirements:** R1, R4, R8

**Files:**
- Create: `src/platform/hubs/shell-access.js`
- Create: `tests/hub-shell-access.test.js`
- Create: `tests/hub-api.test.js`

**Approach:**
- Port the Pass 14 helper directly, using current `src/platform/access/roles.js`.
- Port hub API tests because `createHubApi()` already exists in current production.
- Keep messages in UK English.

**Test scenarios:**
- Parent Hub viewer payload resolves to read-only access context.
- Admin Hub selected diagnostics viewer resolves to read-only access context.
- Writable member contexts do not block write actions.
- Hub API client sends learner query, request id, audit limit, and auth headers.

**Verification:**
- `node --test tests/hub-api.test.js tests/hub-shell-access.test.js`

- [x] **Unit 2: Extend Parent/Admin Read Models**

**Goal:** Make hub read models carry accessible learners, selected learner ids, and writable/read-only labels.

**Requirements:** R2, R3, R4, R8

**Files:**
- Modify: `src/platform/hubs/parent-read-model.js`
- Modify: `src/platform/hubs/admin-read-model.js`
- Modify: `tests/hub-read-models.test.js` if current assertions need explicit new coverage

**Approach:**
- Add `canMutateLearnerData` to Parent Hub permissions.
- Normalise `accessibleLearners` to include membership role labels and writable labels.
- Add `selectedLearnerId` to Parent Hub output.
- Add `writable` and `accessModeLabel` to Admin diagnostics.
- Use selected diagnostics membership role when deciding whether Admin can expose the Parent Hub entry point.
- Preserve existing content release, audit lookup, and account-role management fields.

**Test scenarios:**
- Parent Hub includes selected learner and accessible viewer entries.
- Parent Hub viewer permissions show `canMutateLearnerData: false`.
- Admin diagnostics includes viewer `writable: false` and read-only labels.
- Admin Parent Hub entry point is conditional on the selected readable membership and platform role.

**Verification:**
- `node --test tests/hub-read-models.test.js tests/hub-shell-access.test.js`

- [x] **Unit 3: Update Worker Hub Repository Behaviour**

**Goal:** Let Worker Parent Hub resolve readable memberships and return readable learner choices without changing writable bootstrap.

**Requirements:** R2, R3, R5, R8

**Files:**
- Modify: `worker/src/repository.js`
- Modify: `tests/worker-hubs.test.js`
- Modify: `tests/worker-access.test.js`

**Approach:**
- Update `readParentHub(accountId, learnerId = null)` to list readable memberships with `writableOnly: false`.
- Resolve default learner from account-selected learner only if it is readable; otherwise fall back to first readable membership.
- Pass readable memberships and selected learner id into `buildParentHubReadModel`.
- Do not change `bootstrapBundle`; it remains writable-only.
- Add viewer tests from Pass 14, preserving all current worker auth, TTS, and mutation tests.

**Test scenarios:**
- Viewer account gets empty writable bootstrap but can read Parent Hub for the readable learner.
- Parent Hub returns accessible viewer learner with read-only label.
- Ops/admin hub returns viewer diagnostics without inventing write access.
- Writable owner/member bootstrap and hub reads keep working.

**Verification:**
- `node --test tests/worker-hubs.test.js tests/worker-access.test.js`

- [x] **Unit 4: Stop Remote Empty-Bootstrap Auto-Seeding**

**Goal:** Prevent signed-in viewer-only accounts from receiving a fabricated writable learner.

**Requirements:** R5, R6, R8

**Files:**
- Modify: `src/platform/core/store.js`
- Modify: `tests/repositories.test.js`
- Modify: `tests/worker-backend.test.js`

**Approach:**
- In `ensureLearnersSnapshot`, seed a default learner only when repository persistence mode is `local-only`.
- Preserve monster celebration state and methods in the store.
- Update harness setup tests that assume a learner exists by explicitly seeding one where appropriate.

**Test scenarios:**
- Local-only empty repo still creates a convenience learner.
- Remote/signed-in empty bootstrap keeps `learners.allIds = []`.
- Existing repository and worker-backend spelling harness tests still seed their learner explicitly.
- Monster celebration queue state still exists after store reloads and learner switches.

**Verification:**
- `node --test tests/repositories.test.js tests/worker-backend.test.js tests/monster-system.test.js`

- [x] **Unit 5: Wire Signed-In Shell To Remote Hub Payloads**

**Goal:** Make `src/main.js` load, cache, and render live hub payloads for signed-in adult surfaces without regressing subject, spelling, sync, TTS, or monster flows.

**Requirements:** R1, R2, R3, R4, R5, R7

**Files:**
- Modify: `src/main.js`

**Approach:**
- Import `createHubApi()` and shell-access helpers.
- Add `adultSurfaceState` with parent/admin load states, selected adult learner id, and notice.
- Split local-reference hub model assembly from signed-in remote hub model assembly.
- Queue remote hub loads from render when on Parent Hub/Admin screens.
- Add `adult-surface-learner-select` action.
- On writable adult learner selection, sync the main writable learner selection only if that learner exists in bootstrap state.
- Block write actions in read-only viewer contexts using `readOnlyLearnerActionBlockReason`.
- Preserve current monster celebration handling in `applySubjectTransition`, `monster-celebration-dismiss`, and persistence retry cleanup.
- Preserve current spelling auto-advance, OpenAI TTS, import/export, and spelling content operator actions.

**Test scenarios:**
- Signed-in Parent Hub loads remote payload and renders viewer learner read-only.
- Signed-in Admin Hub loads remote payload and renders viewer diagnostics read-only.
- Adult-surface learner selection reloads the matching hub payload.
- Writable member selection can still sync the main shell learner.
- Monster celebration overlay still delays until spelling session end and can be dismissed.
- Persistence retry still preserves route and clears stale transient runtime state.

**Verification:**
- `node --test tests/render.test.js tests/spelling-parity.test.js tests/persistence.test.js`

- [x] **Unit 6: Render Adult Access Honesty**

**Goal:** Update UI rendering for zero-writable signed-in shells, remote hub loading/error states, adult learner selection, read-only labels, and disabled write controls.

**Requirements:** R2, R3, R4, R6, R7, R8

**Files:**
- Modify: `src/platform/ui/render.js`
- Modify: `styles/app.css` only if the current CSS lacks selectors needed for the new UI
- Modify: `tests/render.test.js`

**Approach:**
- Add selected writable learner helpers and no-writable-shell cards.
- Update header learner selector to distinguish writable shell learner from adult-surface learner.
- Add adult access chips when a hub learner context is active.
- Add hub loading/error states.
- Add adult-surface learner dropdowns in Parent Hub and Admin / Operations.
- Add read-only notices and disable blocked buttons.
- Keep current `renderHeroMonsterVisuals`, dashboard monster playground, and monster celebration overlay.
- Keep current CSS for hero monster roaming and celebration overlay. Add only small UI support styles if needed.

**Test scenarios:**
- Dashboard with no writable learner does not crash and offers Parent Hub/Operations routes.
- Parent Hub viewer shows adult learner selector, Viewer label, Read-only label, and disabled export buttons.
- Admin viewer diagnostics show Readable learners, Viewer label, Read-only label, and disabled subject/export actions.
- Writable member Parent Hub does not show read-only blocking.
- Existing monster render tests stay green: uncaught hidden on main dashboard, Codex placeholder appears in Spelling, dashboard roaming begins at stage 1, celebration overlay uses 640 artwork.

**Verification:**
- `node --test tests/render.test.js tests/smoke.test.js`

- [x] **Unit 7: Documentation And Pass Note**

**Goal:** Record Pass 14 behaviour without regressing current documentation for monsters or deployment.

**Requirements:** R7, R8

**Files:**
- Modify: `README.md`
- Modify: `docs/operating-surfaces.md`
- Modify: `docs/ownership-access.md`
- Modify: `docs/repositories.md`
- Create: `pass-14.md`

**Approach:**
- Apply only the adult-access wording from the Pass 14 docs.
- Do not copy the Pass 14 changes to `docs/architecture.md`, `docs/events.md`, or `docs/spelling-service.md` because those would revert current monster catch-threshold truth.
- Add `pass-14.md` summarising the integration and test/deploy result.

**Test scenarios:**
- Docs state signed-in hubs use live Worker payloads.
- Docs state viewer learners are hub-only and read-only.
- Docs state bootstrap remains writable-only.
- Docs retain current monster caught/stage wording.

**Verification:**
- Manual doc review plus `rg` checks for stale wording.

- [ ] **Unit 8: Full Verification, GitHub Push, Deploy, Production Smoke**

**Goal:** Prove the integration is complete and live on `ks2.eugnel.uk`.

**Requirements:** R9

**Files:**
- No feature files expected, but deployment may update generated/public build artefacts if the build process writes them.

**Approach:**
- Run targeted tests as units are completed.
- Run full suite and build/deploy checks.
- Commit with a clear Pass 14 message.
- Push to `origin/main`.
- Deploy with `npm run deploy:oauth`, not raw Wrangler and not an env-token path.
- Use gstack/browser checks after deploy for production health. If login is needed for a signed-in hub flow, use the user's available browser session rather than faking a result.

**Verification:**
- `git diff --check`
- `npm test`
- `npm run check`
- `git status --short --branch`
- `git push origin main`
- `npm run deploy:oauth`
- Production HTTP checks for `/`, `/styles/app.css`, `/src/main.js`, `/worker` routes where applicable
- Browser smoke for dashboard, Parent Hub, Admin / Operations, and Spelling no-regression

## Regression Guard Checklist

Before final deploy, explicitly confirm:

- [x] `src/platform/game/monster-celebrations.js` still exists.
- [x] `src/main.js` still imports and uses monster celebration helpers.
- [x] `src/platform/core/store.js` still has monster celebration queue methods.
- [x] `src/platform/ui/render.js` still renders `renderMonsterCelebrationOverlay(appState)`.
- [x] `styles/app.css` still contains `.monster-celebration-overlay` and hero roaming animations.
- [x] `src/platform/game/monster-system.js` still catches Inklet/Glimmerbug at 1 and Phaeton at 3.
- [x] `src/subjects/spelling/module.js` still shows `?` for uncaught Codex monsters.
- [x] `package.json` still uses `scripts/wrangler-oauth.mjs` for `deploy`, `check`, and D1 scripts.
- [x] OpenAI TTS Worker proxy tests still pass.
- [x] Spelling parity and auto-advance tests still pass.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Whole-folder copy regresses current production fixes | Use file-level selective merge only. Treat source snapshot drift as non-goals. |
| Viewer learner leaks into writable shell state | Keep adult-surface selected learner separate. Only call `store.selectLearner()` when the learner exists in writable bootstrap state. |
| Zero-writable signed-in account crashes dashboard or subject routes | Add no-writable shell render states and subject guards. |
| Hub load loops trigger repeated requests | Cache hub load state by learner id and request token. Only force reload on explicit navigation/selection/role changes. |
| Read-only buttons look disabled but still dispatch | Disable controls and also block the same actions in `handleGlobalAction`. |
| Admin role changes leave stale hub payloads | Invalidate and reload hub states after role directory changes. |
| Tests pass with mocked data but Worker contract is wrong | Add Worker route tests and render tests using `createWorkerRepositoryServer()`. |
| Deploy uses stale `CLOUDFLARE_API_TOKEN` | Use `npm run deploy:oauth`; do not run raw `wrangler deploy`. |

## Deferred After Pass 14

- Signed-in onboarding for zero-writable accounts.
- Create-learner flow for parent/member accounts when no writable learner exists.
- Clean viewer-only routing to Parent Hub/Admin without subject-shell leakage.
- Invite/sharing flows.
- Billing and organisations.
- Arithmetic or any other new live subject.
- Persisted backend preference for adult-surface selected learner across all adult surfaces.
