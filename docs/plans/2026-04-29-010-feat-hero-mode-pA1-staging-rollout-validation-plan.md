---
title: "feat: Hero Mode pA1 — Staging Rollout Contract and Measurement Baseline"
type: feat
status: active
date: 2026-04-29
origin: docs/plans/james/hero-mode/A/hero-mode-pA1.md
---

# feat: Hero Mode pA1 — Staging Rollout Contract and Measurement Baseline

## Overview

pA1 turns the P6 "ready for staging" verdict into "observed, measured, reversible, and contract-clean" across Rings 0–4. No new gameplay. No new earning mechanics. The only value this phase produces is operational evidence that Hero Mode is trustworthy enough to widen.

---

## Problem Frame

Hero Mode P0–P6 implements a coherent feature stack (shadow scheduler, launch bridge, child UI, progress claims, capped economy, Hero Camp). P6 hardened the system and declared it staging-ready. However, "staging-ready on paper" is not the same as "observed safe in staging." pA1 must close that gap with concrete evidence across documentation accuracy, flag ladder sequencing, full child-visible paths, telemetry verification, scheduler/launcher parity, state model integrity, and a go/no-go recommendation for A2.

(see origin: `docs/plans/james/hero-mode/A/hero-mode-pA1.md`)

---

## Requirements Trace

- R1. Documentation drift resolved — no misleading state model, asset format, or operational references
- R2. Feature 6-flag ladder validated in enable/disable/rollback order (dedicated proof in Ring 1; integration-exercised in Rings 2–4)
- R3. Full child-visible path manually verified (12-step minimum path from origin §3 Goal 3)
- R4. Telemetry sink proven with privacy validation — no raw child content
- R5. Scheduler/provider/launcher parity audited — no child-visible dead CTAs
- R6. State model mutation safety verified (CAS, idempotency, stale-write, two-tab)
- R7. A2 decision baseline produced with evidence-based recommendation

---

## Scope Boundaries

- No new Hero gameplay, monsters, earning rules, or economy mechanics
- No production default-on or public cohort rollout
- No six-subject expansion
- No new subject mastery rules or Star changes
- No parent reports, leaderboards, streak mechanics, or trading

### Deferred to Follow-Up Work

- Public cohort rollout (Ring 5+): A2 or later, contingent on pA1 recommendation
- Operational dashboard: only built if pA1 proves structured logs insufficient (deferred to A2 if so)
- Grammar `mini-test` adapter support: deferred unless parity audit proves child can be trapped (see U5)
- Account-hash bucketing for percentage-based rollout (Rings 5+): A2 scope if pA1 passes

---

## Context & Research

### Relevant Code and Patterns

- `shared/hero/` — pure layer, zero imports from worker/react/node, testable standalone
- `worker/src/hero/` — Worker integration: read-model, routes, launch, claim, camp, providers/, launch-adapters/
- `src/platform/hero/` — client hero layer: hero-client, hero-ui-model, hero-camp-model
- `src/surfaces/home/` — HeroQuestCard, HeroCampPanel, HomeSurface
- State model: `child_game_state` table, `system_id = 'hero-mode'`, JSON state V3-compatible
- Test suite: 65+ test files (`tests/hero-*.test.js`), 382 P6 tests + P0–P5 regression

### Institutional Learnings

- **D1 atomicity**: `batch()` only; `withTransaction` is production no-op (see `docs/solutions/architecture-patterns/hero-p4-coins-economy-capped-daily-award-2026-04-29.md`)
- **Three-layer idempotency**: receipt replay → business-logic short-circuit → deterministic entry ID
- **Feature flag hierarchy is fail-closed**: each flag requires all predecessors; misconfigured returns 409
- **Rollback preserves state dormant**: disable hides UI, stops writes, never deletes
- **Server-side quest recomputation on every command**: client never trusted for authoritative state
- **State migration via normaliser must be multi-branch**: accept v1/v2/v3 with upgrade paths

### Known Documentation Drift (from origin §3 Goal 1)

- Rollout playbook references "check `hero_progress` table" — authoritative state is `child_game_state`
- Possible stale PNG references — current adapter expects `.webp` paths (corrected in P6 U1)
- Analytics/readiness described as "helpers/foundations" — accurate, not overclaimed as dashboard
- Test count: P6 completion report says 283 P6 tests; readiness report says 282 — reconcile

---

## Key Technical Decisions

- **Telemetry verification via structured logs + small ops route**: avoid overbuilding a dashboard. A lightweight `/api/admin/hero/telemetry-probe` route that returns last-N emitted events from KV suffices for Ring 2–4 proof
- **Launchability fix: filter at read-model level**: non-launchable tasks are already filtered by the client UI (`hero-ui-model.js` line 30 finds first `launchable` task). The existing behaviour is safe but pA1 must prove no quest exists where ALL tasks are non-launchable for a given learner
- **No new mutations**: pA1 adds test fixtures, verification routes, documentation fixes, and ops tooling. It does not add new commands or state shapes
- **Per-account override for Ring 4**: minimal JSON secret (`HERO_INTERNAL_ACCOUNTS`) lists team account IDs that get all 6 flags forced-on. Additive-only — never overrides non-listed accounts. Avoids needing account-hash bucketing (which is Ring 5+ scope)
- **Manual QA via Playwright journeys**: extend existing `tests/journeys/` runner with Hero-specific flows for Ring 2–3 evidence

---

## Open Questions

### Resolved During Planning

- **Where to store telemetry probe evidence?** KV namespace already used for analytics events (P6 U6–U8). Probe reads last-N from same sink — no new storage needed
- **How to exercise multi-day in staging?** Use date-key override in seeded fixtures (existing pattern in `tests/hero-p6-datetime.test.js`) combined with real calendar-day runs in Ring 3
- **Ring 4 account isolation?** Per-account flag override pattern — existing `wrangler.jsonc` supports per-binding env vars; team accounts get explicit flag overrides via a staging secret

### Deferred to Implementation

- Exact fixture shape for "all Grammar tasks non-launchable" edge case — depends on read-model output with only breadth-maintenance envelopes
- Whether telemetry-probe ops route needs auth (likely: admin-only via existing RBAC in `worker/src/admin/`)

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
Ring 0: docs + drift cleanup → PR(s) that fix references
Ring 1: local/dev seeded → tests proving ladder/state/economy in controlled env
Ring 2: staging seeded → Playwright journeys + telemetry probe
Ring 3: staging multi-day → real calendar runs + date-key evidence
Ring 4: internal prod → team-only accounts + enhanced monitoring

Each ring gate:
  pass criteria met → advance
  stop condition hit → halt, record, recommend "hold"
```

Dependency graph:
```
U1 (docs drift, Ring 0) ─┬─ U3 (local flag ladder, Ring 1) ─┐
                          │                                   ├─ U5 (parity audit, Ring 1)
U2 (telemetry probe,     │                                   │
    Ring 0) ──────────────┘                                   │
                                                              ├─ U6 (staging seeded, Ring 2)
U4 (QA journeys,         ────────────────────────────────────┤
    Ring 1→2, dep: U1)                                        ├─ U7 (staging multi-day, Ring 3)
                                                              │
                                                              └─ U8 (internal prod, Ring 4)
                                                                     │
                                                                     └─ U9 (A2 recommendation)
```

---

## Implementation Units

- U1. **Documentation Drift Reconciliation**

**Goal:** Fix all misleading references so the next planner can follow docs without private context.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Modify: `docs/plans/james/hero-mode/hero-mode-p6-rollout-playbook.md`
- Modify: `docs/plans/james/hero-mode/hero-mode-p6-readiness-report.md`
- Modify: `docs/plans/james/hero-mode/hero-mode-p6-completion-report.md`
- Modify: `docs/plans/james/hero-mode/hero-mode-A-architecture-product.md` (if drift found)
- Modify: `docs/plans/james/hero-mode/hero-mode-B-engineering-system-code.md` (if drift found)

**Approach:**
- Grep all Hero docs for: `hero_progress` (table reference), `.png` (should be `.webp`), "dashboard" (overclaim), forward-looking suggestions (trading, extra mechanics)
- Fix: replace `hero_progress` references with `child_game_state WHERE system_id = 'hero-mode'`
- Fix: reconcile P6 test count (282 vs 283 — determine the correct number from actual test run)
- Remove or mark as historical any stale column/table names
- Ensure analytics/readiness helpers are described as derivation utilities, not dashboard

**Patterns to follow:**
- Existing correction pattern in P6 U1 (asset path fix committed as reconciliation)

**Test scenarios:**
- Happy path: grep after fix returns zero matches for `hero_progress` as table reference, zero `.png` in asset paths, zero overclaimed "dashboard" references
- Edge case: references to `hero_progress` in test file names (these are fine — test naming convention, not operational docs)

**Verification:**
- `grep -r "hero_progress" docs/plans/james/hero-mode/` returns only historical/contextual usage, not operational instructions
- Test count stated in readiness report matches `node --test tests/hero-p6-*.test.js 2>&1 | grep "tests"` actual output

---

- U2. **Telemetry Probe Ops Route**

**Goal:** Provide a lightweight admin route that returns last-N Hero telemetry events from the KV sink, enabling Ring 2–4 operators to verify events are reaching the sink without building a full dashboard.

**Requirements:** R4

**Dependencies:** None

**Files:**
- Create: `worker/src/hero/telemetry-probe.js`
- Modify: `worker/src/hero/routes.js` (register probe route)
- Create: `tests/hero-pA1-telemetry-probe.test.js`

**Approach:**
- Pure read-only route at `/api/admin/hero/telemetry-probe`
- Protected by existing admin RBAC (same auth as other admin routes)
- Reads last 20 events from KV telemetry namespace, returns structured JSON
- Response includes: event family, timestamp, metric name, dimensions (no raw child content)
- Privacy re-validation: probe must strip any accidentally-stored forbidden fields before returning

**Patterns to follow:**
- Existing admin route pattern in `worker/src/admin/`
- KV read pattern from P6 analytics module
- Privacy forbidden-field list from `shared/hero/metrics-contract.js`

**Test scenarios:**
- Happy path: route returns last-N events with correct structure, all metric families represented
- Happy path: privacy fields (`rawAnswer`, `rawPrompt`, `childFreeText`, `childInput`, `answerText`) never appear in response even if injected into KV
- Error path: unauthenticated request returns 401
- Error path: empty KV namespace returns `{ events: [], count: 0 }` (not 500)
- Edge case: events older than 24h still returned (probe is not time-filtered, just count-limited)

**Verification:**
- Route responds 200 with JSON containing `events` array
- Privacy validation test passes with deliberately-injected forbidden fields

---

- U3. **Local/Dev Flag Ladder Validation**

**Goal:** Prove the full 6-flag enable/disable/rollback sequence in local/dev with seeded fixtures covering all critical learner states.

**Requirements:** R2, R6

**Dependencies:** U1

**Files:**
- Create: `tests/hero-pA1-flag-ladder.test.js`
- Create: `tests/fixtures/hero-pA1-seeded-learners.js`

**Approach:**
- Create seeded learner fixtures covering: ready subjects only, locked placeholders, completed daily quest, low balance, sufficient balance, stale request, duplicate request
- Test flag enable sequence bottom-up (Shadow → Camp) verifying each intermediate state is valid
- Test flag disable sequence top-down (Camp → Shadow) verifying state preservation
- Test misconfigured combinations (child flag without parent) return 409
- Verify rollback after partial completion preserves balance, ledger, monster ownership
- Verify rollback after Camp spend preserves spend history

**Patterns to follow:**
- `tests/hero-p6-rollback.test.js` — existing rollback assertion patterns
- `tests/hero-p6-state-hardening.test.js` — adversarial state input patterns
- Seeded fixture pattern from `tests/hero-p4-economy-e2e.test.js`

**Test scenarios:**
- Happy path: full enable sequence bottom-up succeeds, each flag produces correct read-model version (v3→v4→v5)
- Happy path: full disable sequence top-down preserves all state in `child_game_state`
- Happy path: re-enable after rollback resurfaces previously-written state unchanged
- Error path: enabling ECONOMY without PROGRESS returns 409 `hero_economy_misconfigured`
- Error path: enabling CAMP without ECONOMY returns 409 `hero_camp_misconfigured`
- Edge case: no eligible subjects (all locked) — shadow still builds, UI shows reason `no-eligible-subjects`
- Edge case: rollback mid-session — active Hero session becomes orphaned but harmless (next load detects stale)
- Integration: rollback after coin award preserves balance; re-enable shows same balance

**Verification:**
- All flag-ladder tests pass under `node --test`
- Each intermediate flag state produces the expected read-model shape
- Zero state deletion confirmed by row-count assertion before/after rollback

---

- U4. **Playwright QA Journeys**

**Goal:** Create browser-level QA journeys that prove the full child-visible path (origin §3 Goal 3, 12 steps) with concrete repeatable evidence. Journeys run in Ring 1 (local dev) and re-run in Ring 2 (staging).

**Requirements:** R3

**Dependencies:** U1

**Files:**
- Create: `tests/journeys/hero-pA1-full-path.mjs`
- Create: `tests/journeys/hero-pA1-rollback-safety.mjs`

**Approach:**
- Journey 1 (full path): exercises all 12 steps from origin §3 Goal 3 in sequence
- Journey 2 (rollback safety): enables all flags, performs economy actions, then disables top-down, verifies surfaces hidden but state preserved
- Uses existing journey runner (`tests/journeys/_runner.mjs`) conventions
- Seeded test learner with known state (ready subjects active, balance 200, one monster owned)
- Screenshots at key state transitions for evidence artefacts

**Patterns to follow:**
- `tests/journeys/_runner.mjs` — existing journey runner infrastructure
- `tests/browser-react-migration-smoke.test.js` — browser interaction patterns

**Test scenarios:**
- Happy path: Hero flags off → normal non-Hero surface rendered (no Hero card)
- Happy path: Shadow-only → read model builds, no child surface visible
- Happy path: Child UI → Hero Quest card visible with one primary CTA
- Happy path: Start task → correct subject session opens via subject command path
- Happy path: Return from subject → Hero context preserved
- Happy path: Claim-task → only after Worker-verified completion evidence
- Happy path: Daily completion → +100 coins awarded once (economy enabled)
- Happy path: Retry/refresh/two-tab → no double-award
- Happy path: Camp invite/grow → monster stage advances, balance decreases
- Happy path: Insufficient coins → calm copy, no mutation
- Happy path: Rollback → surfaces hidden, state preserved
- Edge case: locked subjects shown as "coming later" copy, no broken UI

**Verification:**
- Both journeys pass end-to-end in local dev (Ring 1) and staging (Ring 2)
- Screenshots captured at each key transition point
- No console errors during journey execution

---

- U5. **Provider/Launcher Parity Audit**

**Goal:** Prove that no child can receive a Hero Quest whose only visible next step cannot be launched.

**Requirements:** R5

**Dependencies:** U3

**Files:**
- Create: `tests/hero-pA1-launchability-parity.test.js`
- Modify: `worker/src/hero/providers/grammar.js` (only if fix needed — see approach)

**Approach:**
- Audit all three providers (spelling, grammar, punctuation) against their launch adapters
- **Known gap:** Grammar provider emits `mini-test` (breadth-maintenance intent) but Grammar adapter only supports `smart-practice` and `trouble-practice`
- Client UI (`hero-ui-model.js:30`) already skips non-launchable tasks — finds first `launchable` one
- **Critical question:** Can a learner's Grammar state produce ONLY `mini-test` envelopes? Answer: only when `secureCount >= 3` AND `weakCount === 0` AND `dueCount === 0` AND `retentionDueCount === 0`. In that case Grammar still emits the generic fallback (`smart-practice`). So the current code is safe.
- However, pA1 must prove this with an explicit test fixture demonstrating that Grammar's fallback envelope is always launchable
- Also audit Spelling (`guardian-check` supported by adapter) and Punctuation (`gps-check` supported by adapter) — both have full parity

**Patterns to follow:**
- `tests/hero-launch-adapters.test.js` — existing adapter coverage
- `tests/hero-providers.test.js` — existing provider signal tests

**Test scenarios:**
- Happy path: Grammar with weak+due concepts → `trouble-practice` and `smart-practice` envelopes, both launchable
- Happy path: Spelling with all launcher types → all map correctly via adapter
- Happy path: Punctuation with all launcher types → all map correctly via adapter
- Edge case: Grammar with ONLY `secureCount >= 3`, zero weak/due/retention → emits `mini-test` (not-launchable) + generic fallback `smart-practice` (launchable). Quest has at least one launchable task.
- Edge case: Grammar with zero signals → `available: false`, no envelopes emitted, scheduler skips subject
- Integration: full scheduler output for multi-subject learner always produces `hasLaunchableTasks === true` when at least one eligible subject has signals
- Error path: learner with only locked subjects → scheduler produces empty quest with `no-eligible-subjects` reason, no child CTA shown

**Verification:**
- No learner fixture can produce a quest where `hasLaunchableTasks === false` when eligible subjects have non-zero signals
- All provider/adapter pairs have explicit coverage in parity test

---

- U6. **Staging Seeded Ring 2 Validation**

**Goal:** Deploy to staging, exercise full flow with seeded learner, verify telemetry reaches sink, and confirm browser QA in deployed environment.

**Requirements:** R2, R3, R4, R6

**Dependencies:** U2, U3, U4, U5

**Files:**
- Create: `scripts/hero-pA1-staging-smoke.mjs`
- Create: `docs/plans/james/hero-mode/A/hero-pA1-ring2-evidence.md`

**Approach:**
- Deploy current branch to staging with all 6 flags enabled
- Create seeded test learner via existing admin tooling
- Run Playwright journey (U4) against staging URL
- Verify telemetry probe returns events from staging KV
- Verify no 500s in Worker logs (30-minute observation)
- Record evidence in structured markdown artefact

**Patterns to follow:**
- `scripts/probe-production-bootstrap.mjs` — existing production smoke pattern
- `npm run smoke:production:*` — existing per-subject smoke scripts

**Test scenarios:**
- Happy path: full child-visible path completes without 500s
- Happy path: telemetry probe returns events for all metric families defined in P6
- Happy path: privacy validator confirms no forbidden fields in KV events
- Happy path: D1 writes succeed (verified via read-model response containing persisted state)
- Edge case: concurrent requests from same learner → CAS rejection handled gracefully (409, not 500)

**Verification:**
- Playwright journey passes against staging URL
- Telemetry probe returns ≥1 event per family (learning, engagement, economy, technical)
- Zero 500s in 30-minute observation window
- Evidence artefact written with timestamps and metric summaries

---

- U7. **Staging Multi-Day Ring 3 Validation**

**Goal:** Prove date-key behaviour and daily completion across real calendar days (minimum 2 date keys).

**Requirements:** R2, R3, R6

**Dependencies:** U6

**Files:**
- Modify: `docs/plans/james/hero-mode/A/hero-pA1-ring2-evidence.md` → rename/extend to ring evidence
- Create: `docs/plans/james/hero-mode/A/hero-pA1-ring3-evidence.md`

**Approach:**
- Keep staging deployed with flags enabled across 2–3 real calendar days
- Day 1: complete Hero Quest, verify daily award, verify telemetry
- Day 2: verify quest refreshes (new dateKey), previous day stable, new award possible
- Verify daily award idempotency: refresh/retry on same day does not duplicate
- Verify Camp debit idempotency: repeated invite request replays safely
- Verify coin balance monotonically increases (no negative drift)
- Verify CAS revision increments correctly across days

**Patterns to follow:**
- `tests/hero-p6-datetime.test.js` — date-key transition test patterns
- Multi-day observation from rollout playbook Ring 3 specification

**Test scenarios:**
- Happy path: Day 2 quest has different questId from Day 1
- Happy path: Day 1 completed state persists and is visible on Day 2
- Happy path: Daily award on Day 2 succeeds independently of Day 1
- Happy path: Refresh on Day 1 (after completion) does not re-award
- Edge case: timezone boundary — Europe/London midnight rollover produces correct new dateKey
- Edge case: session started at 23:50, claimed at 00:10 next day — 2-hour grace window accepts
- Integration: Camp monster owned on Day 1 still owned on Day 2 (state persistence)

**Verification:**
- Evidence artefact shows two distinct dateKeys with independent daily completions
- Zero duplicate awards across all days
- Balance monotonically non-decreasing across observations

---

- U8. **Internal Production Ring 4 Validation**

**Goal:** Verify real production environment wiring with team-only accounts. Enhanced monitoring. Rollback rehearsed before enablement.

**Requirements:** R2, R4, R6

**Dependencies:** U7

**Files:**
- Create: `shared/hero/account-override.js`
- Modify: `worker/src/hero/read-model.js` (per-account flag resolution)
- Modify: `wrangler.jsonc` (HERO_INTERNAL_ACCOUNTS secret binding)
- Create: `tests/hero-pA1-account-override.test.js`
- Create: `docs/plans/james/hero-mode/A/hero-pA1-ring4-evidence.md`

**Approach:**
- Current Worker resolves Hero flags from flat env vars — no per-account override exists yet
- Implement minimal per-account override: a JSON list of account IDs in a secret (`HERO_INTERNAL_ACCOUNTS`); when present, those accounts get all 6 flags forced-on regardless of global env vars
- Override is additive-only (force-on for listed accounts) — never force-off or override for non-listed accounts
- Production env vars remain `"false"` for all 6 flags — only listed team accounts see Hero Mode
- Rehearse rollback in production before enabling (disable Camp→Shadow, verify no state loss)
- Team uses Hero Mode in production for 3–5 days
- Monitor: D1 read/write latencies, KV quota, telemetry pipeline end-to-end
- Verify multi-device and multi-tab conflict resolution in real production
- Record any P0/P1 defects found

**Patterns to follow:**
- Rollout playbook Ring 4 specification
- Per-account override pattern (existing in wrangler env-var bindings)

**Test scenarios:**
- Happy path: account in HERO_INTERNAL_ACCOUNTS list gets all 6 flags resolved as enabled
- Happy path: account NOT in list gets flags from env vars (all false in production)
- Happy path: team member completes full Hero Quest in production with real learner data
- Happy path: telemetry appears in production KV sink with correct event structure
- Happy path: rollback rehearsal (remove account from override list) preserves existing state
- Happy path: re-add account → preserved balance and monster ownership resurface
- Edge case: HERO_INTERNAL_ACCOUNTS secret is empty/missing → no override, all accounts use env vars
- Edge case: D1 tail latency under burst — p95 < 200ms budget (per existing capacity evidence)
- Edge case: multi-device same account — second device sees updated state after first completes
- Error path: deliberately-stale request gets 409 CAS rejection (not 500)
- Integration: override is read-only (flag resolution only) — does not change mutation paths or CAS logic

**Verification:**
- Per-account override unit tests pass
- 3–5 days of team usage with zero P0/P1 defects
- D1 latency within budget
- Telemetry probe shows production events end-to-end
- Non-team accounts verified to see no Hero surfaces during Ring 4
- Evidence artefact documents all observations

---

- U9. **A2 Decision Baseline and Recommendation**

**Goal:** Produce the final pA1 artefact: an evidence-based recommendation (proceed / hold / rollback) with risk register for A2.

**Requirements:** R7

**Dependencies:** U8

**Files:**
- Create: `docs/plans/james/hero-mode/A/hero-pA1-recommendation.md`

**Approach:**
- Collate evidence from U1–U8 into structured assessment
- Evaluate against origin §6 exit criteria:
  - §6.1 Contract cleanliness (docs no longer misstate state model/assets/readiness)
  - §6.2 Local/dev proof (every flag step exercised, rollback preserves state)
  - §6.3 Staging proof (multi-day, idempotency, telemetry sink, privacy)
  - §6.4 Product and learning safety (Hero does not mutate subjects, capped economy)
  - §6.5 Operational readiness (QA checklist, rollback checklist, metrics note, risk register)
- Evaluate against origin §7 acceptance gates:
  - Gate A: product copy and surface behaviour (one primary CTA, no pressure)
  - Gate B: scheduler and launchability (no dead CTAs, parity covered)
  - Gate C: claim and progress integrity (Worker-verified, dedup, stale-safe)
  - Gate D: economy and Camp integrity (once-only award, server-derived costs)
  - Gate E: metrics and privacy (events reach sink, no raw child content)
- List any stop conditions triggered (origin §9: duplicate award, negative balance, subject mutation, dead CTA, raw child content in telemetry, etc.)
- Produce risk register for A2 (known risks, observed issues, deferred items)
- State recommendation: proceed to A2, hold and harden, or rollback/do not widen

**Patterns to follow:**
- P6 go/no-go readiness report structure
- Origin §11 suggested deliverables list

**Test expectation: none — documentation artefact only**

**Verification:**
- Recommendation document covers all 5 exit criteria sections from origin §6
- All 5 acceptance gates (A–E) from origin §7 are evaluated with evidence
- Risk register has at least one entry per ring where issues were found
- Recommendation is one of the three permitted values (proceed / hold / rollback)

---

## System-Wide Impact

- **Interaction graph:** Telemetry probe reads from KV but writes nothing. Flag ladder tests exercise the full read-model → client pipeline but through existing code paths. No new mutations introduced.
- **Error propagation:** All existing 409/400/404 error paths exercised in U3/U5. No new error codes introduced.
- **State lifecycle risks:** Ring 4 is the only unit writing to production D1. Team-only scope limits blast radius. Rollback rehearsed before enablement.
- **API surface parity:** `/api/admin/hero/telemetry-probe` is the only new route. Admin-only, read-only. Does not affect child-facing API.
- **Integration coverage:** U6/U7 Playwright journeys prove full-stack integration (client → Worker → D1 → KV → telemetry). Unit tests alone cannot prove this.
- **Unchanged invariants:** Hero Mode remains default-off in production for all non-team accounts. Subject engines continue to own learning, mastery, and Stars. Capped daily economy (+100/day) unchanged. Hero Camp remains spending surface only.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Staging KV namespace may not be configured identically to production | U6 verifies telemetry probe returns events; Ring 4 re-verifies in production |
| Grammar breadth-maintenance `mini-test` gap could trap a learner | U5 proves fallback always provides launchable task; explicit fixture for edge case |
| Multi-day staging requires real calendar days (cannot be compressed) | Start Ring 3 early; U7 is calendar-bound but small effort per day |
| Ring 4 team accounts may not cover all learner states | Use seeded fixtures that cover locked subjects, low balance, completed quests |
| D1 tail latency under burst (platform characteristic) | Accept as known; verify p95 within existing 200ms budget from P4 capacity evidence |

---

## Documentation / Operational Notes

- pA1 deliverables include 4 evidence artefacts (ring2, ring3, ring4, recommendation) stored in `docs/plans/james/hero-mode/A/`
- QA checklist evidence captured via Playwright screenshots and structured markdown
- Telemetry verification note embedded in ring evidence documents
- Rollback checklist already exists in `hero-mode-p6-rollout-playbook.md` — pA1 exercises it, does not rewrite it

---

## Sources & References

- **Origin document:** [hero-mode-pA1.md](docs/plans/james/hero-mode/A/hero-mode-pA1.md)
- **Architecture contract:** [hero-mode-A-architecture-product.md](docs/plans/james/hero-mode/hero-mode-A-architecture-product.md)
- **Engineering contract:** [hero-mode-B-engineering-system-code.md](docs/plans/james/hero-mode/hero-mode-B-engineering-system-code.md)
- **P6 completion:** [hero-mode-p6-completion-report.md](docs/plans/james/hero-mode/hero-mode-p6-completion-report.md)
- **P6 readiness:** [hero-mode-p6-readiness-report.md](docs/plans/james/hero-mode/hero-mode-p6-readiness-report.md)
- **Rollout playbook:** [hero-mode-p6-rollout-playbook.md](docs/plans/james/hero-mode/hero-mode-p6-rollout-playbook.md)
- **D1 atomicity learning:** [docs/solutions/architecture-patterns/hero-p4-coins-economy-capped-daily-award-2026-04-29.md](docs/solutions/architecture-patterns/hero-p4-coins-economy-capped-daily-award-2026-04-29.md)
- **Flag hierarchy learning:** [docs/solutions/architecture-patterns/hero-p6-production-hardening-metrics-rollout-2026-04-29.md](docs/solutions/architecture-patterns/hero-p6-production-hardening-metrics-rollout-2026-04-29.md)
- Related PRs: #585 (P6), #564 (P5), #553 (P4), #533 (P3), #451 (P2), #397 (P1), #357 (P0)
