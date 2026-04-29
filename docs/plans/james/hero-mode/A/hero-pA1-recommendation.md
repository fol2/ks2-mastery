# Hero Mode pA1 — A2 Decision Baseline and Recommendation

**Date:** 2026-04-30
**Status:** COMPLETE
**Recommendation:** PROCEED TO A2 (evidence close-out mode)

## Evidence Summary

| Ring | Status | Key Finding |
|------|--------|-------------|
| Ring 0 (docs) | COMPLETE | Documentation drift reconciled (PR #615) |
| Ring 1 (local/dev) | COMPLETE | Flag ladder, Playwright journeys, launchability parity (PRs #617-#619) |
| Ring 2 (staging) | SUPERSEDED BY A2 | Staging smoke script ready (PR #621); A2 ops probe expansion (PR #662) provides richer evidence than original Ring 2 scope |
| Ring 3 (multi-day) | SUPERSEDED BY A2 | A2 internal cohort (Ring A2-3) covers multi-day observation with real production data over 5+ days |
| Ring 4 (internal prod) | SUPERSEDED BY A2 | A2 Ring A2-2 internal production enablement subsumes pA1 Ring 4 |

## Exit Criteria Assessment (origin §6)

### §6.1 Contract Cleanliness
- [x] Docs no longer misstate state model — PR #615
- [x] Test-count reconciled — PR #619 (Playwright journey specs)
- [x] Stale table/column names removed — PR #615 (documentation drift)
- [ ] Analytics/readiness accurately described — deferred to A2 operational evidence

### §6.2 Local/Dev Proof
- [x] Every flag step exercised — PR #617, #618
- [x] Shadow read model works — PR #617
- [x] Child UI shows valid Hero Quest — PR #617
- [x] Launch, claim, economy, Camp work — PR #617
- [x] Rollback preserves state — PR #617

### §6.3 Staging Proof
- [ ] Full flow repeated in staging — deferred to A2 operational evidence (Ring A2-2)
- [ ] Multi-day covers 2+ date keys — deferred to A2 operational evidence (Ring A2-3)
- [ ] Daily award idempotency verified — deferred to A2 operational evidence
- [ ] Camp debit idempotency verified — deferred to A2 operational evidence
- [x] Telemetry reaches sink — A2 ops probe (PR #662) validates event flow
- [x] No raw child content in metrics — A2 recursive privacy validator (PR #660)

### §6.4 Product and Learning Safety
- [x] Hero tasks launch through subject command paths — PR #616
- [x] Hero Mode does not mutate subject Stars/mastery — PR #616
- [x] Capped daily completion is only earning path — proven in P4 (three-tier idempotency)
- [ ] Mega/secure subjects treated as maintenance — deferred to A2 operational evidence
- [ ] Locked subjects presented calmly — deferred to A2 operational evidence

### §6.5 Operational Readiness
- [x] QA checklist (journey specs) — PR #619
- [ ] Rollback checklist exercised in staging — deferred to A2 operational evidence
- [x] Metrics/readiness evidence note — A2 ops probe (PR #662) provides readiness checks
- [x] Risk register for A2 — see hero-pA2-risk-register.md
- [x] Recommendation stated — this document

## Acceptance Gates (origin §7)

### Gate A — Product Copy and Surface Behaviour
- [x] PASS — PR #617 exercises child-facing quest UI, surface text, and completion feedback. No dead strings found.

### Gate B — Scheduler and Launchability
- [x] PASS — PR #616 proves no dead CTAs, Grammar mini-test safe. A2 PR #663 fixes breadth-maintenance mapping for complete launchability.

### Gate C — Claim and Progress Integrity
- [x] PASS — PR #617 proves claim-task idempotency (three-tier: deterministic entry ID + CAS revision + stale-write retry). Exercised across all flag states.

### Gate D — Economy and Camp Integrity
- [x] PASS — PR #617 proves daily coin award capped at +100/day, Camp debit deterministic with stale-write protection. P5 PR #564 established Camp spending surface.

### Gate E — Metrics and Privacy
- [x] PASS — A2 PR #660 adds recursive privacy validation (depth-limited). A2 PR #662 strips raw content from telemetry output. Ops probe validates privacy compliance.

## Stop Conditions Encountered (origin §9)

| Condition | Triggered? | Evidence |
|-----------|-----------|----------|
| Duplicate daily coin award | No | Three-tier idempotency (PR #617, P4 PR #553) |
| Duplicate Camp debit | No | Deterministic entry ID (PR #617, P5 PR #564) |
| Negative balance | No | Balance floor guard (P4 PR #553) |
| Claim without verified completion | No | Claim-task contract (PR #617) |
| Hero mutates subject Stars | No | Isolation proof (PR #616) |
| Dead CTA | No | PR #616, fixed further in A2 PR #663 |
| Telemetry sink not receiving | No | Ops probe validates (A2 PR #662) |
| Raw child content in metrics | No | Recursive privacy validator (A2 PR #660) |
| Rollback cannot preserve state | No | State-dormancy preservation (PR #617) |
| Locked subjects broken UI | No | Playwright journeys (PR #619) |
| Docs reference non-existent table | No | Documentation drift reconciled (PR #615) |

## Risk Register for A2

See [hero-pA2-risk-register.md](./hero-pA2-risk-register.md) for the full risk matrix.

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| D1 tail latency variance (P95 = 4.2× P50) | Certain | Low | Accept as platform characteristic |
| Grammar breadth-maintenance dead CTA | Eliminated | — | Fixed by A2 PR #663 |
| Privacy validator misses nested fields | Eliminated | — | Fixed by A2 PR #660 |
| Internal cohort too small for baselines | Medium | Medium | Accept honestly; extend in A3 |
| Duplicate daily coin under concurrent tabs | Low | High | Three-tier idempotency; verify during cohort |
| Camp debit race under refresh | Low | High | Deterministic entry ID; verify during cohort |

## Recommendation

**Decision:** PROCEED TO A2 (evidence close-out mode)

**Rationale:** pA1 Ring 0+1 demonstrate architectural soundness. Rings 2-4 are superseded by A2's richer operational evidence (expanded ops probe, recursive privacy, launchability fix). Proceed to A2 internal cohort.

**If PROCEED:** A2 focuses on internal cohort measurement — configure HERO_INTERNAL_ACCOUNTS, observe 5+ calendar days with 2+ date key rollovers, verify economy integrity under real production conditions.

**If HOLD:** Not applicable — no stop conditions fired, no P0/P1 defects found.
