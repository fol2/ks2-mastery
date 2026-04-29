---
title: "feat: Hero Mode P6 — Production Hardening, Metrics, Rollout, and Learning Health"
type: feat
status: active
date: 2026-04-29
origin: docs/plans/james/hero-mode/hero-mode-p6.md
deepened: null
---

# Hero Mode P6 — Production Hardening, Metrics, Rollout, and Learning Health

## Overview

Hero Mode P6 hardens the P0–P5 stack for production rollout: fix known preflight blockers (asset paths, idempotency hash gap, dashboard wiring), add structured metrics/observability across four health domains (learning, engagement, economy, technical), define rollout rings and rollback playbooks, and produce a go/no-go readiness report. No new features, no new earning mechanics, no new monsters.

---

## Problem Frame

The full Hero Mode loop is built (shadow → launch → quest → claim → coins → camp) but has never run under production-like observation. Three concrete preflight issues exist (asset path mismatch, idempotency hash gap, dashboard wiring unverified), and there is no metrics layer to detect learning harm, reward chasing, state corruption, or economy drift. P6 answers: "Can Hero Mode run in production safely, observably, and reversibly?"

(see origin: `docs/plans/james/hero-mode/hero-mode-p6.md`)

---

## Requirements Trace

- R1. All P6 preflight blockers resolved before rollout
- R2. Hero Camp asset paths match real filesystem layout and degrade gracefully
- R3. Mutation receipt hash includes command-specific identity (monsterId, branch, targetStage)
- R4. Dashboard model wiring verified via integration test
- R5. Branch-choice rule is "no branch choice" — single default b1, no Path A/B copy
- R6. Metrics contract covers learning health, engagement, economy/camp, and technical safety
- R7. Analytics read model provides operator-facing readiness data
- R8. Learning-health guardrails prove Hero Mode is not damaging subject mastery
- R9. Economy/Camp reconciliation metrics detect reward-chasing and state drift
- R10. State migration/corruption hardening covers v1→v3, malformed blocks, negative balance
- R11. Rollout rings and rollback playbooks defined and tested at each flag layer
- R12. Go/no-go readiness report produced with metric baselines and rollback steps
- R13. No Hero command writes subject Stars, mastery, or subject monster state
- R14. No pressure/gambling/shop vocabulary in child surfaces
- R15. Camp event mirror IDs made deterministic via ledger entry ID

---

## Scope Boundaries

- No new Hero monsters
- No new earning mechanics (per-question coins, bonus coins, streak rewards)
- No branch switching, branch choice UI, or Path A/Path B language
- No refunds/undo as child-facing flow
- No leaderboards, trading, gifting, random rewards, loot boxes, shop/deal mechanics
- No paid currency or parent-set allowances
- No six-subject expansion or item-level Hero scheduling
- No subject mastery changes or subject monster roster changes
- No new Hero-specific D1 tables (unless long-term ledger archival explicitly approved)
- No child-visible metric labels or internal analytics debug in child read model

### Deferred to Follow-Up Work

- P7 scope decision (six-subject expansion, advanced scheduler, refund tools, new monsters): decided after P6 metrics review
- Branch choice cosmetic expansion: future phase only if P6 proves the loop is healthy
- Parent Hub surface for Hero explanation: P6 prepares copy but defers surface if Parent Hub infra not ready

---

## Context & Research

### Relevant Code and Patterns

- `src/platform/hero/hero-monster-assets.js` — asset adapter with incorrect path pattern (`${key}/${size}.webp` vs actual `${monsterId}/${branch}/${monsterId}-${branch}-${stage}.${size}.webp`)
- `worker/src/repository.js:8158-8169` — `runHeroCommandMutation` builds idempotency hash from `command.payload` which is `undefined` for Camp commands
- `worker/src/app.js:1820-1826` — Camp heroCommand object lacks `payload` field
- `worker/src/hero/read-model.js` — v6 read model with `buildChildSafeCampBlock`
- `src/surfaces/home/HeroCampPanel.jsx` — expects `readModel`, `heroClient`, `learnerId`, `onRefresh`
- `shared/hero/progress-state.js` — state schema v1/v2/v3 with multi-branch normaliser
- `shared/hero/economy.js` — ledger logic, `deriveDailyAwardKey`, balance derivation
- `shared/hero/hero-pool.js` — 6 monsters, cost tables, branch support
- `shared/hero/monster-economy.js` — pure spending computation
- `worker/src/hero/camp.js` — pure Camp command resolver
- 55 existing Hero test files (~23,807 lines)

### Institutional Learnings

- **Grammar QG P6 telemetry pattern**: Enrich existing events, never fork the pipeline. Script-only analytics first, promote to production scoring later. (`docs/solutions/architecture-patterns/grammar-qg-p6-calibration-telemetry-architecture-2026-04-29.md`)
- **P5 calm spending surface**: Rollback = hide surface, preserve state dormant. Pure resolver pre-check avoids CAS contention. (`docs/solutions/architecture-patterns/hero-p5-calm-spending-surface-deterministic-debit-2026-04-29.md`)
- **P4 capped daily award**: Three-layer idempotency. State migration via multi-branch normaliser. Economy as mutation side-effect. (`docs/solutions/architecture-patterns/hero-p4-coins-economy-capped-daily-award-2026-04-29.md`)
- **Sys-Hardening P5**: D1 tail latency is platform characteristic (P95 4.2x P50). Failure taxonomy: `setup|auth|bootstrap|command|threshold|transport|evidence-write`. Cross-assertion tests for mode constants. (`docs/solutions/architecture-patterns/sys-hardening-p5-certification-closure-d1-latency-and-evidence-culture-2026-04-28.md`)
- **P3 convergent patterns**: Measure-first-then-lock. Client-vs-server boundary check. Characterisation-first. Guard against vacuous-truth assertions. (`docs/solutions/best-practices/p3-stability-capacity-multi-learner-patterns-2026-04-27.md`)
- **D1 atomicity**: `batch()` not `withTransaction` (production no-op). (`docs/solutions/` — memory: `project_d1_atomicity_batch_vs_withtransaction.md`)

---

## Key Technical Decisions

- **Observability is orthogonal to the child-facing flag chain**: Metrics/readiness live on admin routes gated by existing hub permissions, not by `HERO_MODE_CAMP_ENABLED`. Disabling Camp hides the surface but metrics collection continues for dormant-state monitoring.
- **Event enrichment over new event types**: Follow Grammar QG P6 pattern — add metric fields to existing `console.log` telemetry events rather than creating new event pipelines.
- **Script-only analytics first**: Health metrics ship as a contract + Node.js analysis scripts. Promotion to real-time alerting is a P7 concern once baselines are stable.
- **Branch-choice rule: Option A**: Single default `b1` branch. No Path A/Path B copy. `branch` field remains in state schema for future expansion but UI never exposes it.
- **Camp event mirror IDs made deterministic**: `hero-evt-<ledgerEntryId>` pattern (matching P4 coins award events). Enables reconciliation without special dedup logic.
- **Asset path fix uses existing monster helper pattern**: Align `hero-monster-assets.js` with the real layout discovered on disk: `./assets/monsters/<monsterId>/<branch>/<monsterId>-<branch>-<stage>.<size>.webp`.
- **Idempotency hash fix includes command-specific fields**: Camp command payload passed to `runHeroCommandMutation` must include `{ monsterId, branch, targetStage }` so the receipt hash differentiates distinct Camp actions sharing a `requestId`.

---

## Open Questions

### Resolved During Planning

- **Branch choice?**: Option A — no branch choice. Single default `b1`. Hide Path A/Path B language.
- **Metrics state in Hero progress blob?**: No. Metrics are operator-facing and live in admin route responses derived from existing state/events. No schema version bump needed.
- **New D1 table for metrics?**: No. Derive from existing `child_game_state`, `event_log`, ledger, and structured console telemetry.
- **Admin route scope**: Use existing hub permissions (parent/admin role). If admin route is too large for P6 scope, ship as script + fixture report first.

### Deferred to Implementation

- Exact health threshold constants: measure-first from staging data before locking values
- Whether Playwright smoke tests are feasible in CI or manual-only: depends on current CI resource budget
- Event-log retention policy for Hero events: document current behaviour, decide archival in P7

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
┌─────────────────────────────────────────────────────────────────┐
│  P6 Architecture Layer Diagram                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐    ┌──────────────────┐    ┌───────────────┐  │
│  │  Preflight   │    │  Metrics Layer   │    │   Rollout &   │  │
│  │   Fixes      │    │  (shared/hero/)  │    │   Rollback    │  │
│  │              │    │                  │    │   Playbooks   │  │
│  │ • Asset path │    │ metrics-contract │    │               │  │
│  │ • Idem. hash │    │   ↓              │    │ • Flag gates  │  │
│  │ • Dashboard  │    │ analytics.js     │    │ • Ring defs   │  │
│  │ • Branch     │    │   ↓              │    │ • State pres. │  │
│  │   policy     │    │ readiness.js     │    │ • Go/No-Go    │  │
│  └──────┬───────┘    └────────┬─────────┘    └───────┬───────┘  │
│         │                     │                       │          │
│         ▼                     ▼                       ▼          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           Existing Hero Stack (P0-P5, unchanged)          │   │
│  │  routes.js → read-model.js → camp.js → economy.js        │   │
│  │  runHeroCommandMutation → D1 batch → event_log mirror    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

Data flow for metrics:
1. Existing `console.log` telemetry events → enriched with metric dimensions
2. `shared/hero/metrics-contract.js` → defines event shapes + metric names + dimensions
3. `worker/src/hero/analytics.js` → derives health indicators from state + events
4. `worker/src/hero/readiness.js` → aggregates go/no-go checks from indicators
5. `GET /api/admin/hero/readiness` → serves readiness report to admin surfaces

---

## Implementation Units

- U1. **Preflight: Asset Path Fix**

**Goal:** Fix `hero-monster-assets.js` to produce correct paths matching real filesystem layout.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**
- Modify: `src/platform/hero/hero-monster-assets.js`
- Create: `tests/hero-p6-asset-paths.test.js`

**Approach:**
- Replace path pattern from `./assets/monsters/${key}/${size}.webp` to `./assets/monsters/${monsterId}/${branch}/${monsterId}-${branch}-${stage}.${size}.webp`
- Update `srcSet` to use dot-separated size suffix (`.320.webp`, `.640.webp`, `.1280.webp`)
- Fallback path should point to stage-0 of the same monster/branch
- `hasHeroMonsterAsset` remains optimistic (UI handles missing via onerror)

**Patterns to follow:**
- Existing platform monster asset helpers (if any)
- Real asset layout confirmed at `assets/monsters/glossbloom/b1/glossbloom-b1-0.640.webp`

**Test scenarios:**
- Happy path: `getHeroMonsterAssetSrc('glossbloom', 0, 'b1')` produces `./assets/monsters/glossbloom/b1/glossbloom-b1-0.640.webp`
- Happy path: srcSet includes all three sizes with correct dot-separated format
- Happy path: each of the 6 Hero Pool monsters (glossbloom, loomrill, mirrane, colisk, hyphang, carillon) produces valid paths for stages 0–4
- Edge case: missing `branch` defaults to `'b1'`
- Edge case: `stage` as string `"2"` coerces correctly
- Edge case: `stage` as NaN/undefined defaults to 0
- Edge case: fallback path always points to stage 0 of same monster/branch

**Verification:**
- All 6 monsters × 5 stages × branch b1 produce paths matching the actual `assets/monsters/` layout
- No test references the old incorrect path format

---

- U2. **Preflight: Idempotency Hash Fix**

**Goal:** Include command-specific fields (monsterId, branch, targetStage) in the Camp command payload passed to `runHeroCommandMutation` so the receipt hash differentiates distinct Camp actions.

**Requirements:** R1, R3

**Dependencies:** None

**Files:**
- Modify: `worker/src/app.js` (Camp command section ~line 1820)
- Create: `tests/hero-p6-idempotency-payload.test.js`

**Approach:**
- Add a `payload` field to the Camp `heroCommand` object containing the command-specific identity: `{ monsterId: body.monsterId, branch: body.branch || 'b1', targetStage: body.targetStage }`
- This makes the hash produced by `mutationPayloadHash(kind, payload)` sensitive to the specific monster action
- Also verify claim-task already includes `questId`, `questFingerprint`, `taskId` in its command payload (audit only — fix if missing)

**Patterns to follow:**
- `worker/src/app.js:1554-1560` — claim-task already passes `correlationId` but check if it passes quest-specific identity
- `worker/src/admin-marketing.js:586-590` — marketing mutation correctly includes action-specific fields in hash

**Test scenarios:**
- Happy path: same requestId + same monsterId/branch replays stored response (idempotent)
- Error path: same requestId + different monsterId rejects as `idempotency_reuse` (409)
- Error path: same requestId + different branch rejects as `idempotency_reuse` (409)
- Error path: same requestId + different targetStage rejects as `idempotency_reuse` (409)
- Happy path: stored receipt hash changes when monsterId changes
- Happy path: stored receipt hash changes when branch changes
- Happy path: stored receipt hash changes when targetStage changes
- Integration: claim-task receipt hash includes questId and taskId (audit — fix if not)

**Verification:**
- Two different Camp actions cannot share a requestId without a 409
- Existing P5 Camp tests still pass (regression)

---

- U3. **Preflight: Dashboard Wiring Integration Test**

**Goal:** Prove the runtime dashboard correctly passes all required props to HeroCampPanel and the full user flow works.

**Requirements:** R1, R4

**Dependencies:** U1 (asset paths must be correct for rendering assertions)

**Files:**
- Create: `tests/hero-p6-dashboard-wiring.test.js`
- Potentially modify: `src/surfaces/home/HomeSurface.jsx` (only if wiring bug found)

**Approach:**
- Integration test boots the full dashboard model with all Hero flags enabled
- Verify the dashboard renders Hero Quest card AND Hero Camp panel
- Verify clicking an affordable invite button opens confirmation
- Verify confirming calls `heroClient.unlockMonster`
- Verify read model refresh runs after success
- Verify safe disabled state when heroClient is missing

**Patterns to follow:**
- Existing Hero client tests (`tests/hero-client.test.js`, `tests/hero-p5-client-camp.test.js`)
- Dashboard card tests (`tests/hero-dashboard-card.test.js`)

**Test scenarios:**
- Happy path: all Hero flags enabled + v6 read model → renders Quest + Camp
- Happy path: affordable invite → confirmation → unlockMonster called → read model refreshes
- Edge case: heroClient missing → Camp panel shows disabled state, no crash
- Edge case: heroClient present but Camp flag off → Camp panel hidden
- Edge case: read model v5 (no camp block) → Camp panel hidden gracefully

**Verification:**
- Full hero-quest-to-camp-spend flow exercised in a single test
- No runtime crash paths discovered

---

- U4. **Preflight: Branch-Choice Policy and Camp Event Determinism**

**Goal:** Enforce "no branch choice" rule (Option A) in UI copy and make Camp event mirror IDs deterministic.

**Requirements:** R5, R15

**Dependencies:** None

**Files:**
- Modify: `src/platform/hero/hero-camp-model.js` (remove/suppress any Path A/B language)
- Modify: `worker/src/app.js` (Camp event mirror ID generation ~line 1880+)
- Create: `tests/hero-p6-branch-policy.test.js`

**Approach:**
- Audit Camp model and confirmation copy builders for any Path A/Path B or branch-choice language — remove or hide
- Default branch in Camp model to `'b1'` without exposing it as a user choice
- Replace non-deterministic Camp event IDs (`hero-evt-<Date.now().toString(36)>-<random>`) with deterministic `hero-evt-<ledgerEntryId>` pattern matching P4 coins events
- Document that branch field remains in state schema for future expansion

**Patterns to follow:**
- P4 coins event: `hero-evt-${ledgerEntry.entryId}` pattern
- Existing branch default in `hero-monster-assets.js` (`branch || 'b1'`)

**Test scenarios:**
- Happy path: Camp model never includes branch selector or Path A/Path B copy
- Happy path: invite confirmation shows monster name but no branch choice
- Happy path: Camp event mirror ID equals `hero-evt-<ledgerEntryId>` for invite
- Happy path: Camp event mirror ID equals `hero-evt-<ledgerEntryId>` for grow
- Edge case: duplicate event INSERT with same deterministic ID is safely ignored (`ON CONFLICT DO NOTHING`)
- Integration: event-log reconciliation can match events to ledger by extracting ledgerEntryId from event ID

**Verification:**
- No "Path A", "Path B", "branch choice" text appears in any child-facing copy
- All Camp events reconcilable to ledger entries by ID

---

- U5. **Metrics Contract and Event Taxonomy**

**Goal:** Define the canonical metrics contract — event shapes, metric names, dimensions, privacy rules — as a shared module.

**Requirements:** R6, R14

**Dependencies:** None

**Files:**
- Create: `shared/hero/metrics-contract.js`
- Create: `tests/hero-p6-metrics-contract.test.js`

**Approach:**
- Export named metric constants for all four categories (learning health, engagement, economy/camp, technical safety) per origin §7
- Define event shape validators (what fields each metric event must carry)
- Define dimension set (learnerId hash/cohort, subjectId, dateKey, hero task intent, launcher, eligible subject count, postMega flag, ready subject set)
- Define privacy rules: no raw answer text, no raw prompt text, no child free-text, no metric labels in child read model
- This is a pure shared module with zero runtime side-effects

**Execution note:** Define contract first, then implementation code in U6/U7 consumes it.

**Patterns to follow:**
- Grammar QG P6 telemetry architecture: event enrichment, privacy-preserving buckets
- Existing `shared/hero/constants.js` for naming conventions

**Test scenarios:**
- Happy path: each metric name matches `hero_<category>_<metric>` format
- Happy path: learning health metrics list covers all 12 from origin §7.1
- Happy path: engagement metrics list covers all 10 from origin §7.2
- Happy path: economy/camp metrics list covers all from origin §7.3
- Happy path: technical safety metrics list covers all from origin §7.4
- Edge case: privacy validator rejects event containing `rawAnswer` or `rawPrompt` field
- Edge case: privacy validator rejects event containing `childFreeText` field
- Integration: metric shape validator accepts enriched console.log events from existing telemetry

**Verification:**
- Contract exports cover all metric names from origin document sections 7.1–7.4
- Privacy rules are machine-verifiable (not just documented)

---

- U6. **Worker Analytics and Readiness Read Model**

**Goal:** Add server-side analytics derivation and readiness aggregation that consumes the metrics contract.

**Requirements:** R7, R8, R9

**Dependencies:** U5 (metrics contract)

**Files:**
- Create: `worker/src/hero/analytics.js`
- Create: `worker/src/hero/readiness.js`
- Modify: `worker/src/hero/routes.js` (add admin route handlers)
- Modify: `worker/src/app.js` (register admin routes)
- Create: `tests/hero-p6-analytics.test.js`
- Create: `tests/hero-p6-readiness.test.js`

**Approach:**
- `analytics.js`: derives health indicators from Hero state + ledger + event patterns (e.g., duplicate-award-prevented count, stale-write rate, balance distribution bucket)
- `readiness.js`: aggregates indicators into go/no-go checks per origin §5.1 checklist
- Admin routes: `GET /api/admin/hero/readiness` and `GET /api/admin/hero/metrics` gated by existing hub permissions (parent/admin role)
- Child read model must NOT expose analytics debug data
- If admin route scope is too large for P6 CI environment, provide a script-based fallback

**Patterns to follow:**
- Existing admin routes in `worker/src/app.js` (permission check pattern)
- Grammar QG P6: script-only analytics prove before promoting
- Sys-Hardening P5: failure taxonomy classification

**Test scenarios:**
- Happy path: readiness endpoint returns structured checklist with pass/fail per gate
- Happy path: metrics endpoint returns economy health indicators
- Happy path: analytics correctly derives duplicate-award-prevented count from ledger
- Edge case: empty Hero state → readiness returns "not_started" status, not error
- Edge case: partial state (economy present, camp absent) → metrics return only economy indicators
- Error path: non-admin request → 403
- Error path: child read model response does NOT contain analytics fields
- Integration: readiness check includes asset verification, flag verification, test status

**Verification:**
- Admin can see structured readiness data
- Child cannot see any analytics debug information

---

- U7. **Learning-Health Guardrail Metrics**

**Goal:** Enrich existing Hero telemetry events with learning-health dimensions to prove Hero Mode is not damaging learning.

**Requirements:** R8, R13

**Dependencies:** U5 (metrics contract), U6 (analytics module)

**Files:**
- Modify: `worker/src/hero/read-model.js` (enrich read-model telemetry with learning dimensions)
- Modify: `worker/src/app.js` (enrich claim/launch telemetry events)
- Create: `tests/hero-p6-learning-health.test.js`

**Approach:**
- Enrich existing `console.log` telemetry (hero_task_claim_succeeded, hero_daily_coins_awarded, etc.) with learning-health dimensions: subject mix share, independent-first-attempt flag, support-before-answer flag, postMega status, eligible subject count
- Do NOT add new event types — follow Grammar QG P6 enrichment pattern
- Derive metrics from existing practice_sessions and subject snapshots already available in the read-model assembly path
- Add structural assertion: no Hero command writes subject Stars, mastery, or subject monster state

**Patterns to follow:**
- Grammar QG P6: enrich existing events, privacy-preserving buckets
- Existing scheduler output already carries `reason` tags — preserve them

**Test scenarios:**
- Happy path: claim telemetry includes `subjectMixShare` dimension
- Happy path: claim telemetry includes `independentFirstAttempt` flag
- Happy path: daily completion telemetry includes eligible subject count
- Happy path: scheduler output preserves reason tags through claim flow
- Edge case: postMega subject receives maintenance-level scheduling, not high-frequency
- Edge case: due/weak priority unchanged by Hero Coins balance
- Integration: subject Stars not mutated after full Hero Quest completion cycle
- Integration: subject mastery not mutated after Camp spending
- Error path: no raw child answers appear in any Hero telemetry event

**Verification:**
- Learning-health dimensions present in enriched telemetry events
- Zero subject state mutation from any Hero command path

---

- U8. **Economy/Camp Reconciliation Metrics**

**Goal:** Add economy and Camp health metrics that detect reward-chasing, state drift, and reconciliation gaps.

**Requirements:** R9, R15

**Dependencies:** U4 (deterministic event IDs), U5 (metrics contract), U6 (analytics module)

**Files:**
- Modify: `worker/src/app.js` (enrich economy/camp telemetry events)
- Modify: `worker/src/hero/analytics.js` (add economy/camp indicators)
- Create: `tests/hero-p6-economy-metrics.test.js`

**Approach:**
- Enrich existing Camp telemetry with: balance-after-action, monster-distribution, hoarding-score signal, rapid-spend flag
- Add reconciliation check: event-log count vs ledger count for same learner (detect mirror gaps)
- Derive economy health indicators: daily coins awarded per learner per day (should be exactly 0 or 100), duplicate-award-prevented count, stale-write rate, idempotency-reuse attempts
- Balance bucket classification (0, 1-99, 100-299, 300-599, 600-999, 1000+)

**Patterns to follow:**
- Existing telemetry in `worker/src/app.js` Camp section
- P4 economy telemetry tests (`tests/hero-p4-economy-telemetry.test.js`)

**Test scenarios:**
- Happy path: Camp success telemetry includes `balanceAfterSpend` and `monsterDistribution`
- Happy path: economy analytics derives correct daily-coins-awarded (exactly 100 or 0)
- Happy path: reconciliation detects zero gap when event mirror matches ledger
- Edge case: reconciliation detects gap when event mirror write failed (event count < ledger count)
- Edge case: hoarding-score > threshold when balance > 3000 and no spend in 7+ days
- Edge case: rapid-spend flag when 3+ spends in same dateKey
- Edge case: balance bucket classification handles 0, boundary values, large balances
- Error path: duplicate-award-prevented counter increments on idempotent replay

**Verification:**
- Economy health indicators derivable from existing state without new D1 tables
- Reconciliation gap detection works with deterministic event IDs from U4

---

- U9. **State Migration and Corruption Hardening**

**Goal:** Harden the Hero state normaliser against all corrupt/malformed states and prove v1→v3, v2→v3 migration safety under adversarial inputs.

**Requirements:** R10

**Dependencies:** None

**Files:**
- Modify: `shared/hero/progress-state.js` (tighten normalisation edge cases if needed)
- Modify: `shared/hero/economy.js` (tighten ledger normalisation)
- Create: `tests/hero-p6-state-hardening.test.js`

**Approach:**
- Test exhaustive corruption scenarios per origin §9.1 and §9.2
- Verify multi-branch normaliser handles: v1→v3, v2→v3, malformed economy block (NaN balance, negative balance, missing fields), malformed heroPool (unknown monsterId, invalid stage, invalid branch), invalid ledger entries
- Verify ledger invariants: earning positive, spending negative, balanceAfter never negative, lifetimeEarned unchanged by spending, lifetimeSpent unchanged by earning
- Verify retention cap does not remove current daily award marker
- Fix any gaps found in existing normaliser (unlikely — P5 hardened most cases)

**Execution note:** Characterisation-first — capture current normaliser behaviour as baseline tests before any code changes.

**Patterns to follow:**
- `tests/hero-p5-state-migration.test.js` (existing migration tests)
- P4 pattern: multi-branch normaliser with explicit upgrade paths per version

**Test scenarios:**
- Happy path: v1 state migrates to v3 preserving daily + recentClaims
- Happy path: v2 state migrates to v3 preserving economy, adding empty heroPool
- Edge case: malformed economy block (NaN balance) normalises to 0
- Edge case: negative balance repaired to 0
- Edge case: unknown monsterId in heroPool dropped
- Edge case: invalid stage (>4, <0, NaN) clamped to valid range
- Edge case: invalid branch handled (fallback to 'b1' per Option A)
- Edge case: malformed ledger entries dropped/quarantined
- Edge case: ledger retention cap preserves current daily award marker
- Integration: read model does not crash from any corrupt state input
- Integration: event-log mirror can be missing without corrupting state
- Integration: event-log mirror can be duplicated without double-counting (dedup by ledger entry ID)

**Verification:**
- No corrupt input produces a crash or uncaught exception from the normaliser
- All migration paths produce valid v3 state

---

- U10. **Technical Hardening: Multi-Tab, Date/Time, Performance**

**Goal:** Harden multi-tab conflicts, date/time edge cases, and performance boundaries.

**Requirements:** R1, R10

**Dependencies:** U2 (idempotency fix)

**Files:**
- Create: `tests/hero-p6-multi-tab.test.js`
- Create: `tests/hero-p6-datetime.test.js`
- Create: `tests/hero-p6-performance.test.js`

**Approach:**
- Multi-tab: test two concurrent invite/grow on same monster, different monsters with same stale revision, requestId replay same/different body, network-drop-then-retry
- Date/time: daily completion across midnight, Camp spending across midnight, claim grace window across Europe/London DST, dateKey stability across reloads
- Performance: read-model v6 payload bounded, command latency stays within capacity budget, no large asset preloading, Camp does not block Quest render

**Patterns to follow:**
- `tests/hero-p5-camp-commands.test.js` (existing stale-write and duplicate tests)
- P3 measure-first methodology for capacity budgets
- Sys-Hardening P5 D1 tail latency awareness (P95 != app bug)

**Test scenarios:**
- Happy path: two tabs invite same monster — second gets `already_owned` (200)
- Happy path: two tabs grow same monster — second gets `already_stage` (200)
- Edge case: two tabs spend on different monsters with stale revision — second gets `stale_write` (409)
- Edge case: same requestId + same body replays correctly
- Edge case: same requestId + different body → `idempotency_reuse` (409)
- Edge case: network drop after successful mutation then retry → replayed response
- Edge case: daily completion across midnight → awards in correct dateKey
- Edge case: Camp spending across midnight → debit in correct dateKey
- Edge case: claim grace window across Europe/London DST start/end
- Edge case: dateKey stable across page reloads
- Edge case: read-model v6 payload size bounded (document current size)
- Edge case: Camp command does not exceed acceptable query count

**Verification:**
- No multi-tab scenario produces double-spend or state corruption
- Date/time edge cases produce correct dateKey assignment
- Performance metrics documented as baselines for future monitoring

---

- U11. **Rollout/Rollback Playbooks and Readiness Report**

**Goal:** Define rollout rings, test rollback at each flag layer, and produce the go/no-go readiness report template.

**Requirements:** R11, R12, R14

**Dependencies:** U1–U10 (all preflight and metrics work)

**Files:**
- Create: `docs/plans/james/hero-mode/hero-mode-p6-rollout-playbook.md`
- Create: `docs/plans/james/hero-mode/hero-mode-p6-readiness-report.md`
- Create: `tests/hero-p6-rollback.test.js`

**Approach:**
- Rollout rings per origin §10: local seeded → staging seeded → staging multi-day → internal prod → limited cohort → wider rollout
- Rollback tests verify each flag layer independently: Camp off, Economy off, Progress off, Child UI off, Launch off, Shadow off
- Each rollback preserves state dormant (balance, ledger, monster ownership retained)
- Readiness report template includes: flags tested, test results, smoke-test evidence, metric baselines, known issues, accepted risks, rollback steps, P7 recommendation
- Forbidden vocabulary scan: no pressure/gambling/shop/streak language in child surfaces

**Patterns to follow:**
- P5 rollback pattern: flag-off hides surface, preserves state dormant
- Six-flag hierarchy enforcement tests in existing boundary test files
- `HERO_FORBIDDEN_VOCABULARY` structural scan (existing)

**Test scenarios:**
- Happy path: Camp flag off → Camp UI hidden, invite/grow commands reject, Coins earning continues
- Happy path: Economy flag off → Coins hidden, no new awards, Camp hidden (dependency), progress continues
- Happy path: Progress flag off → no claim-task, no progress writes, subject practice still works
- Happy path: Child UI flag off → Hero card hidden, subject cards usable
- Happy path: Launch flag off → Hero tasks cannot start, subject routes usable
- Happy path: Shadow flag off → read model unavailable, dashboard falls back
- Edge case: each rollback preserves stored balance/ledger/monster ownership
- Edge case: re-enable after rollback picks up existing state correctly
- Integration: forbidden vocabulary scan passes on all child-facing Hero copy

**Verification:**
- Rollback tested at all 6 flag layers with state preservation proof
- Readiness report template populated with P6 metrics and evidence
- No forbidden vocabulary in child surfaces

---

## System-Wide Impact

- **Interaction graph:** Asset path fix affects `HeroCampMonsterCard` rendering → `HeroCampPanel` → `HomeSurface`. Idempotency fix affects `worker/src/app.js` Camp handler → `runHeroCommandMutation` → mutation_receipts table.
- **Error propagation:** Asset failures must not crash Camp card (graceful fallback). Admin route errors must not propagate to child paths.
- **State lifecycle risks:** Idempotency hash change means existing stored receipts (from staging testing) may not replay correctly for old-format requests. This is acceptable — stale receipts expire naturally.
- **API surface parity:** Admin routes are new additive surface. Child API is unchanged.
- **Integration coverage:** Dashboard wiring test (U3) crosses client model → hero client → worker → D1 boundary.
- **Unchanged invariants:** Subject Stars, subject mastery, subject monster state are never written by any Hero command. Subject scheduler priorities unchanged by Hero economy/Camp state.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Asset path fix may reveal additional monsters with missing assets | Fallback path ensures graceful degradation; test all 6 monsters × 5 stages |
| Idempotency hash change is a one-way migration — old receipts become stale | Acceptable: staging receipts have no production value; document the change |
| Learning-health metrics may show no signal in staging (few learners, short timeframe) | Script-based analysis designed for small samples; baselines documented as provisional |
| D1 tail latency may obscure app-level performance issues | Separate platform-latency observations from app-health signals per Sys-Hardening P5 pattern |
| Admin route adds new attack surface | Gated by existing hub permissions; rate-limited with current infra; no child-accessible paths |

---

## Sources & References

- **Origin document:** [docs/plans/james/hero-mode/hero-mode-p6.md](docs/plans/james/hero-mode/hero-mode-p6.md)
- Related code: `worker/src/repository.js:8141` (runHeroCommandMutation), `src/platform/hero/hero-monster-assets.js`, `worker/src/hero/read-model.js`
- Related PRs: #564 (P5), #553 (P4), #533 (P3), #451 (P2), #397 (P1), #357 (P0)
- Institutional learnings: `docs/solutions/architecture-patterns/hero-p5-calm-spending-surface-deterministic-debit-2026-04-29.md`, `docs/solutions/architecture-patterns/grammar-qg-p6-calibration-telemetry-architecture-2026-04-29.md`, `docs/solutions/architecture-patterns/sys-hardening-p5-certification-closure-d1-latency-and-evidence-culture-2026-04-28.md`
