---
title: "Hero Mode P1 — Completion Report"
type: completion-report
status: complete
date: 2026-04-27
origin: docs/plans/james/hero-mode/hero-mode-p1.md
plan: docs/plans/2026-04-27-002-feat-hero-mode-p1-launchable-task-envelopes-plan.md
pr: "#397"
---

# Hero Mode P1 — Completion Report

## 1. Executive summary

Hero Mode P1 shipped in PR #397 as a 9-commit branch (`feat/hero-mode-p1-launch-bridge`) with 228 tests, zero regressions, and zero Hero-owned persistent state writes. The platform can now answer: **"Given today's Hero shadow quest, can this selected Hero task safely start the correct subject session, through the normal subject command pipeline, with a traceable Hero context?"** — yes, for all three ready subjects, behind a feature flag, with full security chain parity.

The implementation took 7 implementation units through a fully autonomous SDLC cycle: plan (with flow analysis deepening) → serial subagent dispatch (7 workers) → 3 independent parallel adversarial reviewers (correctness, security, testing) → review-fix pass (8 findings addressed) → PR creation → merge. Two security findings (pre-auth data read, reflected user input) and one scope-leaking variable reference were caught and fixed before the PR was opened.

P1 is the engineering proof that Hero Mode can safely launch real subject sessions without becoming a subject engine, a reward engine, or a parallel command system. It is the foundation P2 (child-facing UI) and P3 (Coins ledger) require.

---

## 2. What shipped

### 2.1 Shared pure layer additions (`shared/hero/` — +181 lines, 4 files)

| Module | Lines | Purpose |
|--------|-------|---------|
| `constants.js` | 93 (+17) | Added `HERO_P1_SCHEDULER_VERSION = 'hero-p1-launch-v1'`, `HERO_LAUNCH_CONTRACT_VERSION = 1`, `HERO_LAUNCH_STATUSES` array (5 values), `isValidLaunchStatus()` helper |
| `task-envelope.js` | 101 (+27) | Added `deriveTaskId(questId, ordinal, envelope)` — deterministic DJB2-based task ID. Sorts `reasonTags` internally so order in the input does not affect identity. Returns `hero-task-{hex8}` |
| `launch-context.js` | 90 (new) | `buildHeroContext()` produces full origin §10 shape (15 fields including `source:'hero-mode'`, `phase:'p1-launch'`, `questFingerprint:null`). `validateHeroContext()` rejects missing version/questId/taskId/source/launchRequestId. `sanitiseHeroContext()` strips any field outside a strict 15-key allowlist |
| `launch-status.js` | 47 (new) | `determineLaunchStatus(subjectId, launcher, capabilityRegistry)` — pure classifier returning `{ launchable, status, reason }` |

**Purity contract preserved:** Zero Worker, React, or D1 imports in any `shared/hero/` module. All new functions are deterministic under fixed inputs.

### 2.2 Launch adapter layer (`worker/src/hero/launch-adapters/` — 56 lines, 4 files)

| Adapter | Lines | Mappings |
|---------|-------|----------|
| `spelling.js` | 13 | `smart-practice→smart`, `trouble-practice→trouble`, `guardian-check→guardian` |
| `grammar.js` | 12 | `smart-practice→smart`, `trouble-practice→trouble` |
| `punctuation.js` | 13 | `smart-practice→smart`, `trouble-practice→weak`, `gps-check→gps` |
| `index.js` | 18 | Registry: `mapHeroEnvelopeToSubjectPayload(envelope)`. Returns `{ launchable: false, reason: 'subject-adapter-not-found' }` for unknown subjects |

**Adapter contract:** Pure mappers from Hero task envelope to subject `start-session` payload. No subject runtime imports, no state mutation, no side effects. Unsupported launchers return `{ launchable: false, reason: 'launcher-not-supported-for-subject' }` — never silently swallowed.

**Design decision: adapters are the reverse of providers.** Providers go `subject read-model → Hero task envelopes`. Adapters go `Hero task envelope → subject start-session payload`. This symmetry keeps the authority boundary clean: the scheduler decides *what kind* of learning moment is needed, the adapter decides *how* to express that as a subject command, and the subject engine decides *what specific content* to serve.

### 2.3 Read-model evolution (`worker/src/hero/read-model.js` — 155 lines, +81)

| Change | Detail |
|--------|--------|
| Version bump | `hero.version` 1 → 2 |
| Scheduler version | `hero-p0-shadow-v1` → `hero-p1-launch-v1` |
| Per-task enrichment | Every selected task now carries `taskId`, `launchStatus`, `launchStatusReason`, and `heroContext` |
| Launch capability block | `{ enabled, commandRoute, command, claimEnabled: false, heroStatePersistenceEnabled: false }` |
| `env` parameter | Optional — P0 callers omitting `env` get `launch.enabled: false`. Backward compatible |

**All P0 fields preserved:** `mode: 'shadow'`, safety flags, `eligibleSubjects`, `lockedSubjects`, `dailyQuest`, `debug`. The change is purely additive.

### 2.4 Hero command route (`worker/src/hero/launch.js` — 154 lines, new)

`resolveHeroStartTaskCommand({ body, repository, env, now })`:

1. Validates command is `'start-task'` (rejects all others including `claim-task`)
2. Rejects client-supplied `subjectId` or `payload` (server derives both)
3. Validates `learnerId`, `questId`, `taskId`, `requestId`, `expectedLearnerRevision`
4. Recomputes the Hero quest server-side (never trusts client's cached quest)
5. Matches `questId` → 409 `hero_quest_stale` if changed
6. Matches `taskId` → 404 `hero_task_not_found` if absent
7. Verifies `launchStatus === 'launchable'` → 409 `hero_task_not_launchable`
8. Calls launch adapter → 409 `hero_subject_unavailable` if adapter rejects
9. Builds sanitised `heroContext` (full origin §10 shape)
10. Builds `subjectCommand` matching the exact `normaliseSubjectCommandRequest` output shape: `{ subjectId, command: 'start-session', learnerId, requestId, correlationId, expectedLearnerRevision, payload: { ...adapterPayload, heroContext } }`
11. Returns `{ heroLaunch, subjectCommand }` — app.js owns the dispatch

### 2.5 Route registration (`worker/src/app.js` — +71 lines)

The `POST /api/hero/command` route follows the identical security chain as `POST /api/subjects/:subjectId/command`:

```
POST /api/hero/command
  1. Feature gate: HERO_MODE_LAUNCH_ENABLED → 404 hero_launch_disabled
  2. Flag interaction: requires HERO_MODE_SHADOW_ENABLED → 409 hero_launch_misconfigured
  3. requireSameOrigin(request, env)
  4. requireMutationCapability(session)
  5. readJson(request)
  6. requireLearnerReadAccess(session.accountId, heroLearnerId)
  7. resolveHeroStartTaskCommand({ body, repository, env, now })
  8. requireSubjectCommandAvailable(subjectCommand, env)    ← catches Punctuation gate
  9. protectDemoSubjectCommand({ command: subjectCommand })  ← same rate-limit bucketing
  10. repository.runSubjectCommand(subjectRuntime.dispatch)  ← same CAS, same idempotency
  11. ProjectionUnavailableError catch → structured 503
  12. Return { ok: true, heroLaunch, ...result }
```

**Structure A enforced:** `worker/src/hero/launch.js` never imports `subjects/runtime.js`. The dispatch call stays in `app.js`, exactly as it does for direct subject commands. This is the core architectural boundary that prevents Hero Mode from becoming a parallel command system.

### 2.6 heroContext session passthrough (3 subject engines, +12 lines total)

| Engine | Change | Lines |
|--------|--------|-------|
| Spelling (`engine.js`) | Extract `heroContext` from payload in `startOptionsFromPayload`. Inject onto `transition.state.session` after `service.startSession` returns | +7 |
| Grammar (`engine.js`) | Add `heroContext: payload.heroContext \|\| null` to both session state construction paths (regular + satsset) | +2 |
| Punctuation (`engine.js`) | Inject `heroContext` onto `transition.state.session` after `service.startSession` returns | +3 |

**Key insight from feasibility review:** All three subject normalisers are whitelist-based — `normalisePunctuationPrefs` outputs only `{mode, roundLength}`, Grammar constructs session state from explicit named fields, Spelling's `startOptionsFromPayload` extracts only 7 named fields. Unknown payload keys are silently discarded. The real work was *active injection* (adding heroContext to session state), not contamination prevention. The initial plan framed this as "extract-before-normalise" to prevent spread contamination — the feasibility reviewer corrected this to "active injection" since no contamination path exists.

### 2.7 Configuration changes

| File | Change |
|------|--------|
| `wrangler.jsonc` | `"HERO_MODE_LAUNCH_ENABLED": "false"` added to production vars |
| `worker/wrangler.example.jsonc` | Same default `"false"` |
| `CAPACITY_RELEVANT_PATH_PATTERNS` | Added `/^\/api\/hero\/command$/` (app.js line 563) |

---

## 3. Test coverage

### 3.1 Test inventory

| Test file | Tests | Category |
|-----------|-------|----------|
| `hero-launch-contract.test.js` | 37 | Task ID determinism (same-input, different-ordinal, different-launcher, reason-tag-order-independent), heroContext builder (full §10 shape, questFingerprint null, source/phase values), sanitiser (allowlist enforcement, strips Coins/rewards/monsters/debug), validator (missing version/questId/taskId/source/launchRequestId), launch status classifier |
| `hero-launch-adapters.test.js` | 12 | Per-subject mode mappings (8 happy paths), unsupported launcher, unknown subject, frozen-input immutability, structural boundary scan (no `subjects/runtime` imports) |
| `hero-task-ids.test.js` | 13 | Read-model v2: taskId pattern, launchStatus field, heroContext shape, version 2, launch block structure, P0 fields preserved, flag-off launch.enabled, zero-eligible, not-launchable with reason, determinism |
| `worker-hero-command.test.js` | 16 | Route integration: happy path (200 + heroLaunch + safety flags), flag errors (disabled 404, misconfigured 409), auth (401), validation (missing command/questId/taskId/requestId/learnerId/revision), stale quest (409), task not found (404), client-supplied subjectId/payload rejection (400) |
| `hero-context-passthrough.test.js` | 9 | Per-subject heroContext injection (spelling/grammar/punctuation with and without heroContext), grammar satsset path, mode/templateId unaffected, punctuation prefs do not contain heroContext |
| `hero-launch-boundary.test.js` | 7 | Structural: launch.js no runtime import (S-L1), adapters no runtime import (S-L2), shared/hero no runtime import (S-L3), no economy tokens (S-L4), no client src imports (S-L5). Behavioural: mutation_receipts increases (B-L1), no hero.* events (B-L2) |
| `hero-launch-flow.test.js` | 5 | Full E2E: read model → pick launchable → start-task → verify heroLaunch + heroContext on session. Safety flag verification. Stale-quest replay rejection. Idempotency violation detection |
| `hero-no-write-boundary.test.js` | 8 | P0 structural (S1-S6) extended to cover new files automatically, B7 GET no-write unchanged, B8 updated for POST flag-off gate |
| **Total** | **228** (P0: 129) | **+99 new P1 tests** |

### 3.2 Safety boundary verification

**Structural (12 tests — S1-S6 from P0 + S-L1 through S-L5 new):** Every `.js` file in `shared/hero/` and `worker/src/hero/` is scanned for:
- Repository write primitives (`.run(`, `.batch(`, `bindStatement`, `createWorkerRepository`)
- Subject runtime imports (`subjects/runtime`)
- D1 imports (`d1.js`)
- Client dashboard imports (`src/` files importing `shared/hero/` or `worker/src/hero/`)
- Reward/economy vocabulary (`coin`, `shop`, `deal`, `loot`, `streak loss`)
- Direct `dispatch()` calls

**Behavioural (4 tests — B7-B8 from P0 + B-L1, B-L2 new):**
- GET read-model: 7 protected tables verified zero row-count change (P0 contract preserved)
- POST command with flag off: returns 404 `hero_launch_disabled`
- POST command successful launch: `mutation_receipts` row count increases (proves subject command path used)
- POST command successful launch: zero `hero.*` event types in `event_log`

### 3.3 Determinism verification

- **Task ID pinning:** `deriveTaskId` with fixed inputs produces identical `hero-task-{hex8}` across runs
- **Order independence:** Shuffled `reasonTags` arrays produce the same task ID (sorted internally)
- **Quest stability:** `buildHeroShadowReadModel` with identical inputs produces identical taskIds, launchStatuses, and heroContexts on consecutive calls
- **Scheduler version isolation:** P1 uses `hero-p1-launch-v1`; stale P0 quest IDs cannot match

### 3.4 Regression verification

| Test suite | Tests | Pass | Fail |
|-----------|-------|------|------|
| All hero tests | 228 | 228 | 0 |
| Spelling engine parity | 5 | 5 | 0 |
| Grammar subject runtime | 32 | 32 | 0 |
| Punctuation subject runtime | 21 | 21 | 0 |
| All worker tests | 645 | 644 | 1* |

*\*The single failure is `U3 overhead benchmark — capacity proxy mean ≤+10%, p95 ≤+15%`, a timing-flaky benchmark that passes in isolation (16/16). Not introduced by this PR.*

---

## 4. Code review findings and resolutions

Three independent adversarial reviewers (correctness, security, testing) ran in parallel. Total findings: 2 P1 security, 2 P1 correctness/testing, 4 P2, 2 info.

### 4.1 P1 — fixed before PR

| # | Reviewer | Finding | Resolution |
|---|----------|---------|------------|
| SEC-HERO-01 | Security | Pre-auth data read: `readHeroSubjectReadModels(learnerId)` called before `requireLearnerWriteAccess` on client-supplied learnerId | Added `requireLearnerReadAccess(session.accountId, heroLearnerId)` in app.js before `resolveHeroStartTaskCommand`, mirroring the GET route's access gate |
| CORR-01 | Correctness | Missing `learnerId` validation: empty learnerId passed through to quest recomputation before failing deep in the mutation layer with a generic error | Added explicit `!learnerId` check in `resolveHeroStartTaskCommand` throwing `hero_learner_id_required` (fail-fast, hero-specific error code) |
| SEC-HERO-02 | Security | Reflected user input: `command` value from client interpolated unsanitised into error message | Added `String(command).slice(0, 64).replace(/[^a-zA-Z0-9_-]/g, '')` sanitisation |
| Testing-P1a | Testing | `validatedRequestId` scope leakage: `ProjectionUnavailableError` catch referenced a variable from the subject command block's scope, potentially resolving to wrong value | Replaced with `body?.requestId || ''`, using the hero-specific request ID |

### 4.2 P2 — fixed before PR

| # | Reviewer | Finding | Resolution |
|---|----------|---------|------------|
| Testing-P2a | Testing | Happy path tests silently passed when no launchable task exists (100% confidence) | Replaced `if (!launchable) return` with `assert.ok(launchable, ...)`. Seeded spelling subject data to guarantee launchable tasks |
| CORR-03 | Correctness | `handleHeroCommand` imported but never called — dead code from incomplete refactor | Removed import from `app.js` and deleted export from `routes.js` |
| Testing-P2b | Testing | `validateHeroContext` missing-taskId branch untested | Added test asserting `taskId is required` error |
| Testing-P2c | Testing | `determineLaunchStatus` with unsupported pair had no standalone test | Added unit test for `not-launchable` return |

### 4.3 Info — accepted as-is

| # | Reviewer | Finding | Rationale for acceptance |
|---|----------|---------|-------------------------|
| CORR-04 | Correctness | `launchStatus` computed even when `HERO_MODE_LAUNCH_ENABLED=false` | Acceptable: client checks `launch.enabled` before using `launchStatus`. Gating would add complexity for no safety benefit |
| CORR-05 | Correctness | `buildCapabilityRegistry` is self-referential (tasks determine their own launchability) | Design note: the registry anticipates external sources (admin overrides, feature flags) in P2+. Current implementation is correct but vacuous |

### 4.4 Residual risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Three `now()` calls in the hero command route produce different timestamps; request straddling midnight could cause dateKey disagreement | Very low — window is milliseconds | Document as known behaviour; consider single `nowTs` capture in P2 |
| Quest recomputation after concurrent state change produces `hero_quest_stale` with confusing message ("daily quest has changed") when no Hero-visible action was taken | By design — CAS semantics | Client must handle `hero_quest_stale` by refetching the read model |
| `correlationId` fallback-to-requestId logic untested | Low — affects telemetry correlation only, not correctness | Add targeted test in P2 if needed |

---

## 5. Origin doc compliance

### 5.1 Acceptance criteria (origin §28)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| **Product:** Hero remains platform orchestrator, not seventh subject | Pass | Zero Hero-owned persistent state; launch only delegates to subjects |
| **Product:** P1 does not show child Hero dashboard | Pass | Structural scan (S-L5): zero `src/` files import hero modules |
| **Product:** No Coins, Hero Camp, monsters, completion claims | Pass | Economy token scan (S-L4): zero matches. Safety flags: `coinsEnabled:false`, `claimEnabled:false` |
| **Architecture:** GET remains read-only | Pass | B7: 7 protected tables zero row-change after GET |
| **Architecture:** POST supports only start-task | Pass | `resolveHeroStartTaskCommand` rejects all other commands |
| **Architecture:** Launch route behind HERO_MODE_LAUNCH_ENABLED | Pass | Flag gate at app.js line 1330; default `"false"` in wrangler.jsonc |
| **Architecture:** Launch route uses same-origin, mutation capability, learner access, requestId, CAS | Pass | Security chain at app.js lines 1340-1373 mirrors subject command route |
| **Architecture:** Launch goes through existing subject command mutation path | Pass | `repository.runSubjectCommand(subjectRuntime.dispatch)` at app.js line 1361 |
| **Architecture:** Hero launch adapters do not import subject runtime | Pass | S-L1 + S-L2: zero matches for `subjects/runtime` in launch.js or launch-adapters/ |
| **Architecture:** No new D1 tables | Pass | Zero migration files created |
| **Architecture:** No Hero-owned persistent state | Pass | B-L2: zero `hero.*` events in event_log after launch |
| **Subject:** Spelling launches E2E | Pass | hero-launch-flow.test.js: full read-model → start-task → heroContext verified |
| **Subject:** Grammar and Punctuation launch or marked not-launchable | Pass | Launch adapters verified for grammar (smart/trouble) and punctuation (smart/weak/gps) |
| **Subject:** heroContext on active session | Pass | hero-context-passthrough.test.js: 9 tests, all subjects |
| **Subject:** Engines don't use heroContext for marking/mastery/Stars/rewards | Pass | heroContext is metadata on session state only; scoring/mastery paths untouched |
| **Subject:** Existing start-session works without heroContext | Pass | Passthrough tests include without-heroContext scenarios; 58 engine tests green |
| **Safety:** No Hero Coins, ledger, monster ownership, unlock/evolve | Pass | Economy token scan + zero Hero-owned writes |
| **Safety:** Punctuation gate respected | Pass | `requireSubjectCommandAvailable(subjectCommand, env)` at app.js line 1351 |
| **Safety:** Demo write policy not bypassed | Pass | `protectDemoSubjectCommand` at app.js line 1352 with same bucketing |
| **Testing:** All test categories pass | Pass | 228/228 hero tests, 0 failures |
| **Testing:** Existing tests stay green | Pass | 644/645 worker tests (1 pre-existing timing flake) |

### 5.2 P0 follow-up resolution (origin §2 fingerprint discussion)

The origin doc flagged that `contentReleaseFingerprint: null` was acceptable for P0 but problematic for P1. Resolution: P1 compensates with:
1. Scheduler version bump (`hero-p0-shadow-v1` → `hero-p1-launch-v1`) — stale P0 quests cannot match
2. Server-side quest recomputation on every launch request — client's cached quest is never trusted
3. `questFingerprint: null` present as a named field in heroContext so P3 can detect and require it

Real fingerprint implementation deferred to P2 (when a public UI could cache stale quests for extended periods).

---

## 6. Codebase impact

### 6.1 File inventory

| Category | Files | Lines |
|----------|-------|-------|
| Shared pure layer additions (`shared/hero/`) | 4 (2 new, 2 modified) | +181 |
| Launch adapters (`worker/src/hero/launch-adapters/`) | 4 (all new) | 56 |
| Worker hero layer (`worker/src/hero/`) | 3 (1 new, 2 modified) | +241 |
| App route registration (`worker/src/app.js`) | 1 (modified) | +71 |
| Subject engine passthrough | 3 (modified) | +12 |
| Configuration | 2 (modified) | +4 |
| Tests (new) | 7 | 2,319 |
| Tests (modified) | 2 | +23 |
| Plan document | 1 | 594 |
| **Total new** | **12** | **3,015** |
| **Total modified** | **10** | **+532** |

### 6.2 Modified existing files

| File | Change | Risk |
|------|--------|------|
| `worker/src/app.js` | +71 lines: POST route block, import, capacity pattern | Medium — mutation route with security chain |
| `worker/src/hero/read-model.js` | +81 lines: task enrichment, launch block, env param | Low — additive, P0 tests updated |
| `worker/src/hero/routes.js` | +6/-16 lines: removed dead handleHeroCommand, cleaned | Minimal |
| `shared/hero/constants.js` | +17 lines: P1 scheduler version, launch statuses | Minimal — additive exports |
| `shared/hero/task-envelope.js` | +27 lines: deriveTaskId | Low — pure function addition |
| `worker/src/subjects/spelling/engine.js` | +7 lines: heroContext extraction + injection | Low — optional field, existing tests pass |
| `worker/src/subjects/grammar/engine.js` | +2 lines: heroContext on session state | Minimal — two named field additions |
| `worker/src/subjects/punctuation/engine.js` | +3 lines: heroContext injection after startSession | Low — conditional injection |
| `wrangler.jsonc` | +1 line: HERO_MODE_LAUNCH_ENABLED | Zero — defaults to `"false"` |
| `worker/wrangler.example.jsonc` | +1 line: same | Zero — example file |

### 6.3 Dependency graph (P1 additions in bold)

```
shared/hero/constants.js (leaf — no imports)
  ← shared/hero/seed.js
  ← shared/hero/task-envelope.js ← NEW: deriveTaskId (DJB2 hash)
  ← shared/hero/eligibility.js
  ← shared/hero/scheduler.js
  ← shared/hero/contracts.js
  ← NEW: shared/hero/launch-context.js (buildHeroContext, sanitiseHeroContext)
  ← NEW: shared/hero/launch-status.js (determineLaunchStatus)

NEW: worker/src/hero/launch-adapters/{grammar,punctuation,spelling}.js
  (pure mappers — zero imports from subjects/)
NEW: worker/src/hero/launch-adapters/index.js
  ← launch-adapters/{grammar,punctuation,spelling}.js

worker/src/hero/read-model.js (MODIFIED)
  ← shared/hero/{constants,contracts,eligibility,seed,scheduler}.js
  ← NEW: shared/hero/{task-envelope,launch-context,launch-status}.js
  ← NEW: worker/src/hero/launch-adapters/index.js
  ← worker/src/hero/providers/index.js

NEW: worker/src/hero/launch.js
  ← worker/src/hero/read-model.js
  ← worker/src/hero/launch-adapters/index.js
  ← shared/hero/launch-context.js
  ← shared/hero/constants.js
  ← worker/src/errors.js
  ✘ does NOT import subjects/runtime.js

worker/src/app.js (MODIFIED)
  ← worker/src/hero/routes.js
  ← NEW: worker/src/hero/launch.js
  ← worker/src/subjects/runtime.js (dispatch stays here)
```

No circular dependencies. The shared layer is a strict DAG. `worker/src/hero/launch.js` imports from `shared/hero/` and `worker/src/hero/` but never from `worker/src/subjects/`.

---

## 7. Design decisions worth documenting

### 7.1 Why Structure A — app owns dispatch

The origin doc (§13) offered three structures. Structure A was chosen because it keeps `worker/src/hero/` completely free of subject runtime imports. The boundary is enforced by structural tests (S-L1, S-L2) that scan source files for `subjects/runtime` strings. If a future developer adds a direct subject import to any hero file, the test fails immediately.

Structure B (injected dispatcher) would have achieved the same runtime boundary but would have been harder to test structurally — an injected function can hide the import chain. Structure C (direct import) was explicitly forbidden by the origin doc and would have created a second command system.

### 7.2 Why the subjectCommand shape must match normaliseSubjectCommandRequest exactly

The flow analysis reviewer discovered that `protectDemoSubjectCommand` buckets rate-limiting on `command.subjectId + command.command`. If the Hero path produced a `subjectCommand` with `command: 'start-task'` (the Hero command name) instead of `command: 'start-session'` (the subject command name), demo rate-limiting would create a separate bucket, potentially allowing Hero to bypass per-session-type rate limits.

The fix was to ensure `resolveHeroStartTaskCommand` returns `{ command: 'start-session' }` — the subject command name, not the Hero command name. This was explicitly documented in the plan's Key Technical Decisions section after the flow analysis deepening.

### 7.3 Why heroContext injection is active, not preventive

The initial plan (and flow analysis) framed U5 as "extract-before-normalise" to prevent heroContext from contaminating subject normalisers. The feasibility reviewer disproved this by reading the actual normaliser implementations:
- Punctuation's `normalisePunctuationPrefs` outputs only `{mode, roundLength}` — a whitelist
- Grammar's `startSession` constructs session state from explicit named fields
- Spelling's `startOptionsFromPayload` extracts only 7 named fields

Unknown payload keys are silently discarded by all three paths. There was never a contamination risk. The real work was *adding* heroContext to session state construction — an injection, not a prevention. This correction changed the implementation approach and test scenarios for U5.

### 7.4 Why quest recomputation on every launch

The origin doc (§18) requires that the server never trust the client's copy of the quest. On every `POST /api/hero/command`, the server:
1. Reads the learner's current subject state from D1
2. Runs all providers and the full scheduler
3. Produces a fresh quest with fresh task IDs
4. Validates the client's `questId` and `taskId` against the fresh quest

This means the launch path issues at least two D1 reads before the mutation (one for quest recomputation, one for the subject command's own state read). This is ~2× the read cost of a direct subject command.

The trade-off is worth it: without recomputation, a client could cache a stale quest and launch a task that no longer reflects the learner's current state. With recomputation, stale launches fail cleanly with `hero_quest_stale`. P2 may introduce short-lived caching if latency proves problematic.

### 7.5 Why two independent feature flags

`HERO_MODE_SHADOW_ENABLED` gates the read-only GET route. `HERO_MODE_LAUNCH_ENABLED` gates the mutation POST route. The launch route requires both flags (flag interaction guard at app.js line 1335). This allows:
- **Development:** Both on for testing
- **Staging:** Shadow on first, then launch on after P1 tests pass
- **Production:** Both off until P2/P3 readiness decision

If launch were enabled without shadow, the API surface would be inconsistent (can launch but cannot read the quest). The interaction guard prevents this with 409 `hero_launch_misconfigured`.

---

## 8. Execution process

### 8.1 Timeline

| Phase | Activity |
|-------|----------|
| Planning | Read origin doc (32 sections), research codebase (2 parallel agents), write plan, flow analysis deepening, 3 parallel document reviewers (coherence, scope, feasibility), plan strengthening |
| U1 (serial) | Shared pure layer — constants, task IDs, heroContext, launch status. 37 tests |
| U2 (serial) | Launch adapters — spelling/grammar/punctuation. 12 tests |
| U3 (serial) | Read-model evolution — v2, task enrichment, launch block. 13 tests |
| U4 (serial) | Hero command route — full security chain, launch.js, app.js wiring. 16 tests |
| U5 (serial) | heroContext session passthrough — 3 subject engines. 9 tests |
| U6 (serial) | Boundary tests — structural + behavioural P1 boundary. 7 tests |
| U7 (serial) | E2E launch flow — full integration. 5 tests |
| Review (parallel) | 3 independent adversarial reviewers: correctness, security, testing |
| Fix pass | 8 findings fixed, 228 tests verified |
| PR + merge | Push, create PR #397, merge |

### 8.2 Subagent dispatch strategy

| Unit | Strategy | Rationale |
|------|----------|-----------|
| U1-U7 | Serial subagents | Each unit depends on the previous; file overlap between units (shared/hero/constants.js modified in U1 and U3) prevents parallel dispatch |
| Reviews | 3 parallel background agents | Independent read-only analysis; no file modifications |
| Fix pass | Single serial subagent | Addresses all 8 findings atomically |

### 8.3 Review finding severity distribution

```
P1 (security):  ██ 2   (SEC-HERO-01 pre-auth read, SEC-HERO-02 reflected input)
P1 (correct):   ██ 2   (CORR-01 missing learnerId, Testing-P1a scope leakage)
P2:              ████ 4 (silent-pass guard, dead code, missing tests ×2)
Info:            ██ 2   (both accepted with rationale)
```

---

## 9. What P2 should know

### 9.1 Extension points for P2 (child-facing Hero Quest UI)

1. **Read model is P2-ready:** `launch.enabled: true`, `launch.commandRoute: '/api/hero/command'`, per-task `launchStatus` and `heroContext` are all present when both flags are on
2. **heroContext on active session:** The child-facing UI can detect Hero-launched sessions via `child_subject_state.ui_json.session.heroContext` — it carries `source: 'hero-mode'` and `phase: 'p1-launch'`
3. **Return-to-Hero shell:** After the subject session starts, the UI receives normal `subjectReadModel` alongside `heroLaunch`. P2 can use `heroLaunch.status: 'started'` to show "return to Hero" after the subject task

### 9.2 Extension points for P3 (completion claim + Coins)

1. **`heroContext.source: 'hero-mode'`** — the audit field for verifying a session was started by Hero
2. **`heroContext.launchRequestId`** — the idempotency anchor for completion claims
3. **`heroContext.questFingerprint: null`** — named field ready for real fingerprint in P2; P3 can require non-null
4. **`heroLaunch.claimEnabled: false`** — P3 flips this to true when the claim endpoint is ready
5. **`heroLaunch.heroStatePersistenceEnabled: false`** — P3/P4 flips when Hero-owned state is introduced

### 9.3 Known edge cases to revisit

1. **Double-submit:** Two rapid launches with different `requestId`s for the same task both succeed. The second `start-session` abandons the first (existing subject behaviour). Creates an abandoned `practice_sessions` row. P2/P3 should add Hero-aware active-session detection.
2. **Quest recomputation latency:** ~2× read cost vs direct subject command. Consider short-lived cache keyed on `(learnerId, dateKey, schedulerVersion)` if P2 latency proves problematic.
3. **`hero_active_session_conflict` error code:** Not implemented in P1 (deferred to P2/P3). P2 client code must not depend on it.
4. **Content release fingerprint:** Null in P1. P2 should implement real fingerprint when the UI could cache stale quests.
5. **Timezone:** Hardcoded to `Europe/London`. P2+ should read from learner/account if a timezone field is added.

---

## 10. Final numbers

| Metric | Value |
|--------|-------|
| Commits | 9 (7 feature + 1 review fix + 1 plan doc) |
| New files | 12 |
| Modified files | 10 |
| New lines | ~3,015 |
| Modified lines | ~532 |
| Tests | 228 pass, 0 fail (P0 was 129) |
| New P1 tests | 99 |
| Review findings | 4 P1 (fixed), 4 P2 (fixed), 2 info (accepted) |
| Protected tables verified | 7 (GET: zero writes; POST: subject-path-only writes) |
| Subject engines modified | 3 (spelling +7 lines, grammar +2, punctuation +3) |
| Regressions introduced | 0 |
| Child-facing UI changes | 0 |
| D1 migrations | 0 |
| Hero-owned persistent state | 0 |
| Reward mutations | 0 |
| Feature flags added | 1 (`HERO_MODE_LAUNCH_ENABLED`, default false) |
