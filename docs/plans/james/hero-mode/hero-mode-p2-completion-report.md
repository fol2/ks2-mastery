---
title: "Hero Mode P2 — Completion Report"
type: completion-report
status: complete
date: 2026-04-28
origin: docs/plans/james/hero-mode/hero-mode-p2.md
plan: docs/plans/2026-04-27-004-feat-hero-mode-p2-child-facing-quest-shell-plan.md
pr: "#451"
---

# Hero Mode P2 — Completion Report

## 1. Executive summary

Hero Mode P2 shipped in PR #451 as a squash-merged commit (`6c778f8`) from an 11-commit branch (`feat/hero-mode-p2-child-quest-shell`) with 274 tests, zero regressions, and zero Hero-owned persistent state writes. The platform can now answer: **"Can a learner see today's Hero Quest, understand why it exists, start the next launchable task safely, and keep their sense of place when the subject session opens — without Coins, Hero Camp, completion claims, or Hero-owned state?"** — yes, for all three ready subjects, behind a three-flag gate hierarchy, with full security chain parity.

The implementation took 10 implementation units through a fully autonomous SDLC cycle: plan (with 3-reviewer deepening) → serial subagent dispatch (10 workers) → 3 independent parallel adversarial reviewers (correctness, security, testing) → review-fix pass (8 findings addressed) → PR creation → merge. Two HIGH correctness findings (heroUi store injection bug, eligibleSubjects shape mismatch), two P2 security findings (debug block leak to child browser, server fingerprint leak in 409 responses), and four additional testing/correctness findings were caught and fixed before the PR was opened.

P2 is the first child-facing Hero Mode phase. It proves the orchestrator shell works end-to-end: quest display → task launch → subject session → return to dashboard. P3 (completion claims and Coins) and P4 (Hero economy) can now build on a proven child-visible foundation.

---

## 2. What shipped

### 2.1 Shared pure layer additions (`shared/hero/` — 2 new files, 2 modified)

| Module | Lines | Purpose |
|--------|-------|---------|
| `quest-fingerprint.js` | 101 (new) | `buildHeroQuestFingerprintInput(input)` and `deriveHeroQuestFingerprint(input)`. DJB2 hash over canonical pipe-separated string of 9 input fields: `learnerId\|accountId\|dateKey\|timezone\|schedulerVersion\|eligibleSubjectIds\|lockedSubjectIds\|providerSnapshotFingerprints\|taskDigests`. Output: `hero-qf-{hex12}`. Pinned test value: `hero-qf-000030a4bd24`. |
| `hero-copy.js` | 109 (new) | Canonical child-facing copy module. Exports: `HERO_FORBIDDEN_VOCABULARY` (13 tokens), `HERO_INTENT_LABELS` (6 intents), `HERO_SUBJECT_LABELS` (3 subjects), `HERO_INTENT_REASONS`, `HERO_UI_REASON_LABELS`, `HERO_CTA_TEXT`, `resolveChildLabel(intent, subjectId)`, `resolveChildReason(intent)`. All exports `Object.freeze`-d. Single source of truth for economy vocabulary scanning. |
| `constants.js` | +4 | Added `HERO_P2_SCHEDULER_VERSION = 'hero-p2-child-ui-v1'` and `HERO_P2_COPY_VERSION = 'hero-p2-copy-v1'` |
| `launch-context.js` | +10/-1 | `buildHeroContext` now accepts optional `questFingerprint` param (passed through instead of hardcoded `null`). Sets `phase: 'p2-child-launch'` when schedulerVersion matches P2 version. |

**Purity contract preserved:** Zero Worker, React, D1, or repository imports in any `shared/hero/` module. Boundary test S-P2-1b enforces client files may import only `hero-copy.js` from `shared/hero/`, not scheduler, eligibility, or seed modules.

### 2.2 Worker read-model evolution (`worker/src/hero/read-model.js` — v2 → v3, +152/-1)

| Change | Detail |
|--------|--------|
| Version bump | `hero.version` 2 → 3 |
| Scheduler version | `hero-p1-launch-v1` → `hero-p2-child-ui-v1` |
| Quest fingerprint | Non-null `questFingerprint` field at root. Propagated into each task's `heroContext`. DJB2-based, deterministic. |
| `ui` block | `{ enabled, surface: 'dashboard-card', reason, copyVersion }`. `ui.enabled` is `true` only when ALL THREE flags are on AND at least one task is launchable. 6 reason codes: `enabled`, `child-ui-disabled`, `launch-disabled`, `shadow-disabled`, `no-eligible-subjects`, `no-launchable-tasks`. |
| `childVisible` | Dynamic: `true` when `HERO_MODE_CHILD_UI_ENABLED` is on (was hardcoded `false` in P1). `coinsEnabled` and `writesEnabled` remain `false`. |
| Per-task enrichment | Every selected task now carries `childLabel` and `childReason` from `hero-copy.js`, in addition to P1's `taskId`, `launchStatus`, `launchStatusReason`, `heroContext`. |
| `activeHeroSession` | Detects active Hero sessions by inspecting subject `ui_json` (session state) for `heroContext.source === 'hero-mode'`. Returns `{ subjectId, questId, questFingerprint, taskId, intent, launcher, status: 'in-progress' }` or `null`. |
| `accountId` parameter | New — threaded from `session.accountId` via routes.js for fingerprint computation. |
| P0/P1 backward compat | Providers accept both `{ data, ui }` (P2 expanded shape) and raw data objects (P0/P1 unit test compat). All P0/P1 fields preserved. |
| Debug block security | Stripped from child-visible GET response (`routes.js`). Internal/shadow mode still receives full debug data. |

### 2.3 Active session detection and launch conflict hardening (`worker/src/hero/launch.js` — +117/-1)

| Change | Detail |
|--------|--------|
| Fingerprint validation | When `HERO_MODE_CHILD_UI_ENABLED` is on, requires non-empty `questFingerprint` matching server recomputation. Mismatch → 409 `hero_quest_fingerprint_mismatch`. When child UI off, validation skipped (P1 backward compat). |
| Same-task re-launch | Returns safe `{ status: 'already-started', activeSession }` response — no error, no subject command. |
| Different-task conflict | 409 `hero_active_session_conflict` with active session's `subjectId` and `taskId`. |
| Non-Hero active session | 409 `subject_active_session_conflict` with active `subjectId`. Prevents silently abandoning a child's session. |
| Dynamic `childVisible` | `heroLaunch.childVisible` reflects `HERO_MODE_CHILD_UI_ENABLED` flag state. |
| Security hardening | `serverFingerprint` and `serverQuestId` removed from 409 error extras — client receives only the error code and what it sent, never the correct server-side value. |

### 2.4 Repository expansion (`worker/src/repository.js` — +17/-1)

`readHeroSubjectReadModels` expanded from `SELECT subject_id, data_json` to `SELECT subject_id, data_json, ui_json`. Return shape: `{ [subjectId]: { data, ui } }`. This is the minimum change needed for active session detection — one extra column in an existing query, not a new query.

**Design discovery (feasibility review):** The original plan assumed `heroContext` could be read from `data_json`. The feasibility reviewer proved this is structurally impossible — `heroContext` is injected onto `session` in `ui_json`, while `data_json` contains subject stats/analytics. This is the first time any Hero code reads `ui_json`, and the three-layer boundary design made the correct fix obvious: expand the query, thread the `ui` field through to the read-model builder, and inspect it there.

### 2.5 Route and capacity changes (`worker/src/app.js` — +154/-27)

| Change | Detail |
|--------|--------|
| `accountId` threading | Passes `session.accountId` to `resolveHeroStartTaskCommand` for fingerprint computation. |
| `already-started` handling | When launch resolver returns `subjectCommand: null` (same-task re-launch), returns `{ ok: true, heroLaunch }` without running a subject command. |
| Capacity tracking | `/api/hero/read-model` added to `CAPACITY_RELEVANT_PATH_PATTERNS`. The dashboard now calls this endpoint on normal child entry. |
| Structured logging | 4 server-side events: `hero_task_launch_succeeded`, `hero_task_launch_failed`, `hero_quest_stale_rejected`, `hero_active_session_conflict`. Best-effort `console.log(JSON.stringify(...))`. |

### 2.6 Client Hero API wrapper (`src/platform/hero/hero-client.js` — 209 lines, new)

`createHeroModeClient({ fetch, getLearnerRevision, onLaunchApplied, onStaleWrite })`:
- `readModel({ learnerId })` → `GET /api/hero/read-model?learnerId=...`
- `startTask({ learnerId, questId, questFingerprint, taskId, requestId })` → `POST /api/hero/command` with Hero-specific body shape
- `HeroModeClientError` extends `Error` with `.code`, `.status`, `.retryable`, `.payload`
- 8 known error codes mapped: `hero_quest_stale`, `hero_quest_fingerprint_mismatch`, `hero_active_session_conflict`, `hero_task_not_launchable`, `hero_task_not_found`, `subject_active_session_conflict`, `projection_unavailable`, `network_error`
- Calls `onLaunchApplied` on success, `onStaleWrite` on stale/fingerprint errors
- No auto-retry on stale quest. Respects `retryable: false` from `projection_unavailable`.
- Body NEVER includes `subjectId` or `payload` — clean separation from subject command client.

### 2.7 Client Hero UI state and actions (`src/main.js` — +262 lines)

| Component | Detail |
|-----------|--------|
| `heroUi` state | `{ status, learnerId, requestToken, readModel, error, pendingTaskKey, lastLaunch }`. Module-scoped, injected into store via `store.patch()`. Non-persistent — never writes to repositories, gameState, or D1. |
| `loadHeroReadModel` | Increments requestToken, calls GET, stale-token guard discards out-of-order responses. |
| `startHeroTask` | Double-click guard via `pendingTaskKey`. Persistence-degraded guard. Sets `status: 'launching'`. Stale/conflict → refetch with gentle error code. |
| `applyHeroLaunchResponse` | Calls `repositories.runtime.applySubjectCommandResult`, sets `lastLaunch` for HeroTaskBanner. |
| `buildHeroHomeModel` | Extracted to `src/platform/hero/hero-ui-model.js` for testability. Dual check: `ui.enabled === true && childVisible === true`. Derives `canStart`, `canContinue`, `nextTask`, `activeHeroSession`. Normalises `eligibleSubjects`/`lockedSubjects` from objects to string arrays. |
| Action handlers | `hero-read-model-refresh`, `hero-start-task`, `hero-open-active-session`. |
| Surface actions | `startHeroQuestTask(taskId)`, `continueHeroTask(subjectId)`, `refreshHeroQuest()`. |
| Load triggers | `navigate-home` handler, `learner-select` handler (reset + reload), initial bootstrap after hydration. |
| `lastLaunch` lifecycle | Set on successful launch, cleared on `navigate-home` and learner switch. |
| Observability | `[hero] card_rendered`, `[hero] card_hidden`, `[hero] launch_clicked` — `console.info` with once-per-visit latch. |

### 2.8 Dashboard HeroQuestCard (`src/surfaces/home/HeroQuestCard.jsx` — 153 lines, new)

8 UI states from origin §15:

| State | Rendering | CTA |
|-------|-----------|-----|
| Disabled/unavailable | `null` — HomeSurface shows existing "Today's best round" fallback | — |
| Loading | `null` — dashboard usable | — |
| Ready + launchable | Card with title, subtitle, effort planned, next task (childLabel, childReason), eligible subjects, locked subjects as "coming later" | "Start Hero Quest" → `startHeroQuestTask(taskId)` |
| Active Hero session | Card with in-progress subject name | "Continue Hero task" → `continueHeroTask(subjectId)` — NO POST |
| No launchable tasks | Gentle message: "No Hero task is ready yet" | — |
| Launch pending | CTA disabled, `aria-busy="true"`, "Starting…" | — |
| Stale quest / error | Gentle message with `aria-live="polite"` | "Try the next task now" → `refreshHeroQuest()` |
| Active session conflict | Same as stale quest UX | — |

**HomeSurface integration:** When Hero is enabled, HeroQuestCard replaces the "Today's best round" block. Mutual exclusion — never both rendered simultaneously. Subject grid always renders.

### 2.9 Subject-surface HeroTaskBanner (`src/surfaces/subject/HeroTaskBanner.jsx` — 37 lines, new)

Quiet banner between SubjectBreadcrumb and practice node. Shows "Hero Quest task: {subjectName} — {intent label}" and "This round is part of today's Hero Quest."

**Critical data source decision:** All three subjects' `safeSession()` normalisers (Spelling, Grammar, Punctuation) use fixed whitelists that strip `heroContext` before the client receives the subject read model. The banner reads from `heroUi.lastLaunch` instead — set during `applyHeroLaunchResponse`, cleared on navigate-home and learner switch. App.jsx passes `heroLastLaunch` to SubjectRoute only when the launch's `subjectId` matches the routed subject.

### 2.10 Configuration changes

| File | Change |
|------|--------|
| `wrangler.jsonc` | `"HERO_MODE_CHILD_UI_ENABLED": "false"` added to production vars |
| `worker/wrangler.example.jsonc` | Same default `"false"` |
| `CAPACITY_RELEVANT_PATH_PATTERNS` | Added `/^\/api\/hero\/read-model$/` |

---

## 3. Test coverage

### 3.1 Test inventory

| Test file | Tests | Category |
|-----------|-------|----------|
| `hero-quest-fingerprint.test.js` | 15 | Determinism (pinned hex `hero-qf-000030a4bd24`), format, sensitivity to each of 9 input fields, empty tasks, missing content release marker |
| `hero-child-read-model.test.js` | 19 | v3 shape, `ui.enabled` for all flag combos, all 6 `ui.reason` codes, childVisible gating, per-task childLabel/childReason, questFingerprint propagation, debug-field exclusion, P0/P1 field preservation |
| `hero-copy-contract.test.js` | 16 | Zero economy vocabulary scan across all exports, all 6 intents covered, all 3 subjects covered, frozen exports, canonical forbidden vocabulary list |
| `hero-active-session.test.js` | 17 | Active session detection for Spelling/Grammar/Punctuation, non-hero-mode source filtering, same-task re-launch (safe), different-task conflict (409), fingerprint mismatch (409), null fingerprint child-visible (400), null fingerprint flag-off (proceeds), childVisible true/false, p2-child-launch phase, non-Hero active session conflict, provider backward compat |
| `hero-client.test.js` | 28 | Correct GET/POST paths and headers, Hero command shape (not subject), expectedLearnerRevision, correlationId, no subjectId/payload, all 8 typed error codes, projection_unavailable retryable:false, network failure, no auto-retry on stale, onLaunchApplied/onStaleWrite callbacks |
| `hero-ui-flow.test.js` | 30 | `buildHeroHomeModel` pure function: enabled dual check, canStart/canContinue derivation, nextTask selection, eligibleSubjects normalisation, malformed shape resilience, all return fields |
| `hero-dashboard-card.test.js` | 26 | All 8 UI states, CTA text, disabled/aria-busy, aria-live for errors, economy vocabulary scan across all rendered states, HomeSurface integration (subject grid always renders, mutual exclusion with "Today's best round") |
| `hero-subject-banner.test.js` | 18 | Banner renders on match, subject name + intent label, context line, no render on null/mismatch, economy vocabulary scan, all 6 intents, all 3 subjects, unknown intent fallback |
| `hero-launch-flow-e2e.test.js` | 7 | Full E2E happy path (v3, ui.enabled, childVisible, phase, zero hero.* events, mutation_receipts increase), stale fingerprint 409, stale quest 409, same-task already-started, different-task conflict, all-flags-off 404, Punctuation no-crash |
| `hero-p2-boundary.test.js` | 12 | 6 structural scans (S-P2-1 through S-P2-5, S-P2-1b allowlist), 6 accessibility checks (CTA names, aria-busy, aria-live, no animations, HeroTaskBanner) |
| `hero-capacity-deployment.test.js` | 5 | Capacity path matching, wrangler flag defaults, flag interaction matrix |
| **Subtotal new P2** | **193** | |
| **P0/P1 tests (updated)** | **81** | Updated for v3 shape (version, phase, childVisible, fingerprint). Vacuous-truth fixes in launch-boundary and launch-flow. S5 allowlist migration. |
| **Total** | **274** | 193 new + 81 existing, 0 failures |

### 3.2 Safety boundary verification

**Structural (18 tests — P0 S1-S6 + P1 S-L1 through S-L5 + P2 S-P2-1 through S-P2-5):**
- `shared/hero/` — zero Worker, D1, React, repository, or subject runtime imports (auto-covers new `quest-fingerprint.js` and `hero-copy.js`)
- `worker/src/hero/` — zero `subjects/runtime.js` imports
- `src/platform/hero/` — zero `worker/src/` imports
- Client Hero UI files — import only `shared/hero/hero-copy.js` (allowlist enforced; scheduler, eligibility, seed forbidden)
- Economy vocabulary scan — canonical `HERO_FORBIDDEN_VOCABULARY` (13 tokens) across all P2 client and shared files
- No D1 write primitives in `src/platform/hero/`
- No `hero.*` event emission in any P2 file
- No Hero D1 migration tables

**Behavioural (6 tests — P0 B7-B8 + P1 B-L1, B-L2 + vacuous-truth hardened):**
- GET read-model v3: 7 protected tables zero row-count change
- POST start-task: `mutation_receipts` increases (subject command path used), zero `hero.*` events
- Vacuous-truth fix: `assert.ok(launchable, ...)` replaces silent `return` in P1 boundary tests

### 3.3 Regression verification

| Test suite | Tests | Pass | Fail |
|-----------|-------|------|------|
| All P2 hero tests | 193 | 193 | 0 |
| All P0/P1 hero tests (updated) | 81 | 81 | 0 |
| **Total** | **274** | **274** | **0** |

---

## 4. Code review findings and resolutions

Three independent adversarial reviewers (correctness, security, testing) ran in parallel after all 10 units were implemented. Total findings: 2 HIGH, 2 P1, 2 P2, 2 MEDIUM — all fixed before PR.

### 4.1 Fixed before PR

| # | Reviewer | Severity | Finding | Resolution |
|---|----------|----------|---------|------------|
| 1 | Correctness | HIGH | `appState.heroUi` always `undefined` — `patchHeroUi` used empty store updater `store?.patch(() => ({}))`, never injecting `heroUi` into store state. HeroTaskBanner never rendered. | Changed to `store?.patch((s) => ({ ...s, heroUi }))`. App.jsx can now read `appState.heroUi.lastLaunch`. |
| 2 | Correctness | HIGH | `eligibleSubjects` rendered as `[object Object]` — read model returns `Array<{subjectId, reason}>` but card mapped as strings `.map((id) => HERO_SUBJECT_LABELS[id] || id)`. | `buildHeroHomeModel` now normalises: `.map(e => typeof e === 'string' ? e : e?.subjectId || '').filter(Boolean)`. |
| 3 | Testing | P1 | Fingerprint "pinned hex" test never compared against hardcoded value — only checked format and self-consistency. | Added `assert.equal(fp, 'hero-qf-000030a4bd24')` with the actual pinned value. |
| 4 | Security | P2 | Debug block (`quest.debug`) with scheduler internals exposed to child browser in GET response. Contains `rejectedCandidates`, `subjectMix`, and safety flags. | `routes.js` now strips debug from child-visible response: `const { debug, ...safeResult } = result`. Internal/shadow mode retains full debug. |
| 5 | Security | P2 | Server fingerprint leaked in 409 `hero_quest_fingerprint_mismatch` response. Client could learn correct fingerprint and resubmit, defeating freshness protection. | Removed `serverFingerprint` and `serverQuestId` from error extras. Client receives only error code and what it sent. |
| 6 | Testing | P1 | E2E different-task conflict test silently skipped (`return`) when fewer than 2 launchable tasks in fixture. | Replaced with `assert.fail('Fixture must produce at least 2 launchable tasks')`. |
| 7 | Correctness | MEDIUM | `lastLaunch` not reset on navigate-home — stale HeroTaskBanner would persist when re-entering a subject via direct navigation. | Added `patchHeroUi({ lastLaunch: null })` in navigate-home handler. |
| 8 | Correctness | MEDIUM | `canContinue` branch dereferences `hero.activeHeroSession` without defensive null check. | Added `if (!session) return null;` after `const session = hero.activeHeroSession;`. |

### 4.2 Accepted residual risks

| Risk | Rationale |
|------|-----------|
| DJB2 32-bit fingerprint (~4B output space) | For staleness-check (not security), this is adequate. Server fingerprint no longer leaked in errors (SEC-002 fix), so brute-force requires ~65K attempts rate-limited by network. |
| TOCTOU between active-session check and session creation | CAS on `expectedLearnerRevision` bounds damage — only one concurrent request wins. Idempotency receipt prevents same-requestId double-processing. Client `pendingTaskKey` prevents casual double-clicks. |
| Post-session `activeHeroSession` detection after subject clears session | If session is cleared from `ui_json`, `activeHeroSession` returns null and card shows "Start" for next task. If not cleared, shows "Continue" for completed session. Acceptable P2 confusion — P3 completion claims make this authoritative. |
| Multi-tab concurrent requests | Both would pass active-session check but CAS catches the conflict. At worst, one abandoned `practice_sessions` row — same as P1 documented behaviour. |

---

## 5. Design decisions worth documenting

### 5.1 Why `ui_json` expansion, not a new query

The feasibility reviewer discovered that `readHeroSubjectReadModels` reads only `data_json`, but `heroContext` lives in `ui_json` (session state). Three options were evaluated:

1. **Expand existing query** (`SELECT subject_id, data_json, ui_json`) — one extra column, backward-compatible return shape.
2. **New D1 query** against `practice_sessions` — separate round trip, more complex join.
3. **Accept no active session detection** — deferred to P3.

Option 1 was chosen: minimal change, no new query, providers consume `entry.data` unchanged. The backward-compatibility shim (`'data' in entry ? entry.data : entry`) ensures P0/P1 unit tests continue to pass with raw data objects.

### 5.2 Why `heroUi.lastLaunch` for the banner, not `session.heroContext`

The feasibility reviewer proved that all three subjects' `safeSession()` normalisers strip `heroContext`:
- Spelling: 12-field whitelist (`read-models.js:17-33`)
- Grammar: named-field whitelist (`read-models.js:360-383`)
- Punctuation: named-field whitelist (`read-models.js:121-148`)

P1 injected `heroContext` onto the server-side session state, but the read-model normalisers strip it before the client receives the subject read model. Rather than modifying three subject normalisers (touching 3 files outside Hero scope), P2 uses `heroUi.lastLaunch` — data already available from the Hero command response. The banner checks `lastLaunch.subjectId === currentSubjectId` for relevance and clears on navigate-home.

### 5.3 Why dual check for child-visible rendering

Origin §6 mandates: "Only render the child-facing Hero card when `hero.ui.enabled === true` and `hero.childVisible === true`." The correctness reviewer flagged that the initial implementation checked only `ui.enabled`. The fix ensures `buildHeroHomeModel` derives `enabled = readModel.ui.enabled === true && readModel.childVisible === true`. This defence-in-depth means a read-model response where `ui.enabled` is true but `childVisible` is false (e.g., a Worker misconfiguration where shadow + launch are on but child-ui is off) will not render the card.

### 5.4 Why server fingerprint must not leak

The security reviewer identified that returning `serverFingerprint` in the 409 error body allows a single-roundtrip bypass: submit wrong fingerprint → receive correct fingerprint → resubmit immediately. The fix returns only the error code and what the client sent. The client must re-fetch the read model via GET to obtain a fresh fingerprint — the intended freshness proof path.

### 5.5 Why debug block stripped for child-visible mode

The security reviewer identified that `quest.debug` contains scheduler internals: `rejectedCandidates` (with free-text reasons), `subjectMix`, `candidateCount`, and safety flags. While not a direct exploit, exposing scheduling heuristics to a child's browser violates the origin §19 privacy contract. The fix strips debug from the child-visible GET response while preserving it for internal/shadow mode (useful for admin debugging).

### 5.6 Why `applySubjectCommandResult` is sufficient for Punctuation in P2

Punctuation has a specialised `applyPunctuationCommandResponse` in `src/main.js` that handles `projections.rewards.toastEvents`, celebrations, and `store.reloadFromRepositories`. For P2, the generic `applySubjectCommandResult` is sufficient because Hero `start-session` commands produce no reward projections (toast/celebration events come from answer submission and session completion, not from starting a session). P3 must revisit when completion claims produce reward projections.

---

## 6. Codebase impact

### 6.1 File inventory

| Category | Files | Lines |
|----------|-------|-------|
| Shared pure layer (`shared/hero/`) | 2 new, 2 modified | +224 |
| Worker Hero layer (`worker/src/hero/`) | 0 new, 2 modified | +269 |
| Worker infrastructure (`worker/src/app.js`, `repository.js`) | 2 modified | +171 |
| Client API layer (`src/platform/hero/`) | 2 new | +264 |
| Client UI surfaces (`src/surfaces/`, `src/app/`) | 2 new, 3 modified | +308 |
| Client runtime (`src/main.js`) | 1 modified | +262 |
| Configuration | 2 modified | +6 |
| Tests (new) | 11 new | +3,787 |
| Tests (modified) | 4 modified | +74 |
| **Total new** | **17** | **4,583** |
| **Total modified** | **15** | **+782** |
| **Net** | **35 files** | **+5,365/-145** |

### 6.2 Dependency graph (P2 additions in bold)

```
shared/hero/constants.js (leaf)
  ← shared/hero/seed.js
  ← shared/hero/task-envelope.js
  ← shared/hero/eligibility.js
  ← shared/hero/scheduler.js
  ← shared/hero/contracts.js
  ← shared/hero/launch-context.js (MODIFIED: questFingerprint, p2 phase)
  ← shared/hero/launch-status.js
  ← NEW: shared/hero/quest-fingerprint.js (DJB2 hash)
  ← NEW: shared/hero/hero-copy.js (labels, reasons, CTA, vocabulary)

worker/src/hero/read-model.js (MODIFIED: v3, fingerprint, ui, activeSession)
  ← shared/hero/* (all pure modules)
  ← NEW: shared/hero/quest-fingerprint.js
  ← NEW: shared/hero/hero-copy.js
  ← worker/src/hero/launch-adapters/index.js
  ← worker/src/hero/providers/index.js

worker/src/hero/launch.js (MODIFIED: fingerprint validation, session conflict)
  ← worker/src/hero/read-model.js
  ← worker/src/hero/launch-adapters/index.js
  ← shared/hero/launch-context.js
  ← shared/hero/constants.js

worker/src/hero/routes.js (MODIFIED: accountId, debug stripping)
  ← worker/src/hero/read-model.js

worker/src/app.js (MODIFIED: capacity, logging, already-started)
  ← worker/src/hero/routes.js
  ← worker/src/hero/launch.js
  ← worker/src/subjects/runtime.js (dispatch stays here)

worker/src/repository.js (MODIFIED: ui_json expansion)

NEW: src/platform/hero/hero-client.js (client API wrapper)
NEW: src/platform/hero/hero-ui-model.js (buildHeroHomeModel)
src/main.js (MODIFIED: heroUi state, actions, load triggers)
  ← src/platform/hero/hero-client.js
  ← src/platform/hero/hero-ui-model.js

NEW: src/surfaces/home/HeroQuestCard.jsx
  ← shared/hero/hero-copy.js (ALLOWED by S-P2-1b allowlist)
src/surfaces/home/HomeSurface.jsx (MODIFIED: Hero card integration)

NEW: src/surfaces/subject/HeroTaskBanner.jsx
  ← shared/hero/hero-copy.js (ALLOWED by S-P2-1b allowlist)
src/surfaces/subject/SubjectRoute.jsx (MODIFIED: banner rendering)
src/app/App.jsx (MODIFIED: heroLastLaunch threading)
```

No circular dependencies. The three-layer boundary is preserved: `shared/hero/` is a strict DAG of pure modules, `worker/src/hero/` reads existing data and never imports `subjects/runtime.js`, and `src/` client code imports only `hero-copy.js` from the shared layer.

---

## 7. Origin doc compliance

### 7.1 Acceptance criteria (origin §26)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| **Product:** Child dashboard shows `Today's Hero Quest` behind flags | Pass | HeroQuestCard renders when all 3 flags on; 26 card tests |
| **Product:** One primary Hero CTA available when launchable task exists | Pass | "Start Hero Quest" CTA; "Continue Hero task" for active session |
| **Product:** Existing dashboard fallback when Hero disabled/unavailable | Pass | `hero.enabled === false` → card returns null → HomeSurface renders existing "Today's best round" |
| **Product:** Child can start Hero task and land in correct subject session | Pass | E2E flow test: GET → POST → route to subject → HeroTaskBanner visible |
| **Product:** Subject session shows lightweight Hero context | Pass | HeroTaskBanner between breadcrumb and practice node |
| **Product:** No Coins, Hero Camp, monsters, streaks, shop, deal, claim, reward copy | Pass | HERO_FORBIDDEN_VOCABULARY (13 tokens) scanned across all P2 files; 0 matches |
| **Product:** P2 does not claim task completion | Pass | No `claim-task` command, no completion UI, no completion progress |
| **Architecture:** Hero remains platform orchestrator | Pass | Zero Hero-owned persistent state; launch delegates to subjects |
| **Architecture:** Launch through `POST /api/hero/command` → normal subject command path | Pass | `repository.runSubjectCommand(subjectRuntime.dispatch)` in app.js |
| **Architecture:** Client never sends `subjectId` or `payload` | Pass | hero-client.js never includes these; existing P1 rejection test preserved |
| **Architecture:** `questFingerprint` non-null in child-visible flow | Pass | DJB2-based, pinned test value `hero-qf-000030a4bd24` |
| **Architecture:** Active Hero session detection reduces double-submit | Pass | Same-task → safe already-started; different-task → 409 conflict |
| **Architecture:** No Hero-owned persistent state | Pass | Structural + behavioural boundary tests; zero `hero.*` events |
| **Architecture:** No D1 Hero tables | Pass | S-P2-5: no Hero migration files |
| **Safety:** GET read-model remains read-only | Pass | B7: 7 protected tables zero row-change |
| **Safety:** POST writes only through subject command path | Pass | B-L1: mutation_receipts increase; B-L2: zero hero.* events |
| **Safety:** Punctuation gate respected | Pass | `requireSubjectCommandAvailable` in app.js security chain |
| **Safety:** Demo policy respected | Pass | `protectDemoSubjectCommand` in app.js security chain |
| **Safety:** Stale quest → refetch, not wrong launch | Pass | 409 hero_quest_stale / hero_quest_fingerprint_mismatch → client refetch |
| **Safety:** Active session conflict → clear error, not silent abandon | Pass | 409 hero_active_session_conflict → card shows "Continue" |
| **Safety:** Child model excludes raw debug data | Pass | Debug block stripped in child-visible GET response |
| **Testing:** All test categories pass | Pass | 274/274, 0 failures |
| **Testing:** No economy vocabulary in Hero UI files | Pass | S-P2-2: 13-token scan, 0 matches |

---

## 8. Execution process

### 8.1 Timeline

| Phase | Activity | Subagents |
|-------|----------|-----------|
| Planning | Read origin (28 sections), 2 parallel research agents, write plan, 3-reviewer deepening (correctness, feasibility, testing), 8 findings integrated | 5 |
| U1 | Quest fingerprint + read-model v3. 50 tests. | 1 worker |
| U2 | Active session detection + launch conflict. 17 tests. | 1 worker |
| U3 | Client Hero API wrapper. 28 tests. | 1 worker |
| U4 | Client UI state + actions. 30 tests. | 1 worker |
| U5 | Dashboard HeroQuestCard. 26 tests. | 1 worker |
| U6 | Subject HeroTaskBanner. 18 tests. | 1 worker |
| U7 | E2E launch flow + integration tests. 7 tests. | 1 worker |
| U8 | Boundary + accessibility + no-economy hardening. 12 tests. | 1 worker |
| U9 | Capacity instrumentation + deployment gates. 5 tests. | 1 worker (combined) |
| U10 | Observability instrumentation. No behavioural tests. | 1 worker (combined) |
| Review | 3 parallel adversarial reviewers: correctness (5 findings), security (4 findings), testing (11 findings) | 3 parallel |
| Fix pass | 8 findings fixed, 274 tests verified | 1 worker |
| PR + merge | Push, create PR #451, squash merge | — |

### 8.2 Review finding severity distribution

```
HIGH:     ██ 2  (heroUi store injection, eligibleSubjects shape)
P1:       ██ 2  (pinned hex, E2E vacuous skip)
P2:       ██ 2  (debug leak, fingerprint leak)
MEDIUM:   ██ 2  (stale lastLaunch, null guard)
Accepted: ██ 4  (DJB2 entropy, TOCTOU, post-session, multi-tab)
```

### 8.3 Planning phase discoveries

The 3-reviewer plan deepening caught two structural impossibilities before any code was written:

1. **`readHeroSubjectReadModels` reads `data_json` only** — `heroContext` lives in `ui_json`. Active session detection requires expanding the query. The feasibility reviewer proved this with exact file/line references.

2. **`safeSession()` normalisers strip `heroContext`** — the HeroTaskBanner cannot read from `appState.subjectUi[subject.id]?.session?.heroContext`. The feasibility reviewer inspected all three subjects' whitelist-based normalisers and confirmed `heroContext` is absent from all.

Both discoveries were integrated into the plan before implementation, preventing two blockers that would have been discovered mid-implementation.

---

## 9. What P3 should know

### 9.1 Extension points for P3 (completion claims + daily progress)

1. **`heroContext.source: 'hero-mode'` + `phase: 'p2-child-launch'`** — the audit field for verifying a session was started by Hero.
2. **`heroContext.launchRequestId`** — the idempotency anchor for completion claims.
3. **`heroContext.questFingerprint`** — non-null in P2; P3 can require it for claim validation.
4. **`heroLaunch.claimEnabled: false`** — P3 flips this to true when the claim endpoint is ready.
5. **`heroLaunch.heroStatePersistenceEnabled: false`** — P3/P4 flips when Hero-owned state is introduced.
6. **`activeHeroSession` detection** — already works; P3 extends with completion status.
7. **`hero-copy.js`** — P3 adds completion labels, progress copy. Keep economy-free until P4.
8. **`buildHeroHomeModel`** — P3 extends with completion state, daily progress.
9. **Punctuation adapter** — P3 must revisit `applyHeroLaunchResponse` for Punctuation when completion claims produce reward projections. The generic path works for `start-session` but `applyPunctuationCommandResponse` handles toasts/celebrations.

### 9.2 Known edge cases to revisit

1. **Post-session `activeHeroSession`**: If a subject clears `heroContext` from `ui_json` on session completion, the card shows "Start" for next task. If not, shows "Continue" for a completed session. P3's authoritative completion state resolves this.
2. **`lastLaunch` lifecycle**: Currently cleared on navigate-home. P3 may need to persist it across navigation for post-session reward display.
3. **Three `now()` calls**: Inherited from P1; request straddling midnight could cause dateKey disagreement. Consider single `nowTs` capture.
4. **Content release fingerprints**: Currently use missing marker. When subjects provide real release IDs, fingerprint sensitivity improves automatically.
5. **Timezone**: Hardcoded `Europe/London`. P3+ should read from learner/account when a timezone field is added.

---

## 10. Final numbers

| Metric | Value |
|--------|-------|
| Commits (on branch) | 11 (10 feature + 1 review fix) |
| New files | 17 |
| Modified files | 15 |
| New lines | ~4,583 |
| Modified lines | ~782 |
| Net diff | +5,365 / -145 |
| Tests | 274 pass, 0 fail (P0: 129, P1: 228, P2: 274) |
| New P2 tests | 193 |
| Review findings | 8 fixed (2 HIGH, 2 P1, 2 P2, 2 MEDIUM), 4 accepted |
| Plan deepening findings | 2 structural impossibilities caught pre-implementation |
| Protected tables verified | 7 (GET: zero writes; POST: subject-path-only writes) |
| Subject engines modified | 0 (P2 is client + Worker Hero layer only) |
| Regressions introduced | 0 |
| Child-facing UI changes | 4 files (HeroQuestCard, HeroTaskBanner, HomeSurface, SubjectRoute) |
| D1 migrations | 0 |
| Hero-owned persistent state | 0 |
| Reward mutations | 0 |
| Feature flags added | 1 (`HERO_MODE_CHILD_UI_ENABLED`, default false) |
| Economy vocabulary tokens | 0 (13-token scan across all Hero files) |
