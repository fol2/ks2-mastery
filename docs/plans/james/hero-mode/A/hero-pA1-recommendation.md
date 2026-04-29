# Hero Mode pA1 — A2 Decision Baseline and Recommendation

**Date:** [TBD]
**Status:** PENDING
**Recommendation:** [PROCEED TO A2 / HOLD AND HARDEN / ROLLBACK]

## Evidence Summary

| Ring | Status | Key Finding |
|------|--------|-------------|
| Ring 0 (docs) | COMPLETE | Documentation drift reconciled |
| Ring 1 (local/dev) | COMPLETE | 6-flag ladder, parity, state preservation proven |
| Ring 2 (staging) | [status] | [summary] |
| Ring 3 (multi-day) | [status] | [summary] |
| Ring 4 (internal prod) | [status] | [summary] |

## Exit Criteria Assessment (origin §6)

### §6.1 Contract Cleanliness
- [x] Docs no longer misstate state model — PR #615
- [ ] Test-count reconciled
- [ ] Stale table/column names removed
- [ ] Analytics/readiness accurately described

### §6.2 Local/Dev Proof
- [x] Every flag step exercised — PR #617, #618
- [x] Shadow read model works — PR #617
- [x] Child UI shows valid Hero Quest — PR #617
- [x] Launch, claim, economy, Camp work — PR #617
- [x] Rollback preserves state — PR #617

### §6.3 Staging Proof
- [ ] Full flow repeated in staging
- [ ] Multi-day covers 2+ date keys
- [ ] Daily award idempotency verified
- [ ] Camp debit idempotency verified
- [ ] Telemetry reaches sink
- [ ] No raw child content in metrics

### §6.4 Product and Learning Safety
- [x] Hero tasks launch through subject command paths — PR #616
- [x] Hero Mode does not mutate subject Stars/mastery — PR #616
- [x] Capped daily completion is only earning path
- [ ] Mega/secure subjects treated as maintenance
- [ ] Locked subjects presented calmly

### §6.5 Operational Readiness
- [x] QA checklist (journey specs) — PR #619
- [ ] Rollback checklist exercised in staging
- [ ] Metrics/readiness evidence note
- [ ] Risk register for A2
- [ ] Recommendation stated

## Acceptance Gates (origin §7)

### Gate A — Product Copy and Surface Behaviour
[Assessment with evidence]

### Gate B — Scheduler and Launchability
- [x] PASS — PR #616 proves no dead CTAs, Grammar mini-test safe

### Gate C — Claim and Progress Integrity
[Assessment with evidence]

### Gate D — Economy and Camp Integrity
[Assessment with evidence]

### Gate E — Metrics and Privacy
[Assessment with evidence]

## Stop Conditions Encountered (origin §9)

| Condition | Triggered? | Evidence |
|-----------|-----------|----------|
| Duplicate daily coin award | — | |
| Duplicate Camp debit | — | |
| Negative balance | — | |
| Claim without verified completion | — | |
| Hero mutates subject Stars | — | |
| Dead CTA | No | PR #616 |
| Telemetry sink not receiving | — | |
| Raw child content in metrics | — | |
| Rollback cannot preserve state | No | PR #617 |
| Locked subjects broken UI | — | |
| Docs reference non-existent table | No | PR #615 |

## Risk Register for A2

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| [fill from observations] | | | |

## Recommendation

**Decision:** [PROCEED TO A2 / HOLD AND HARDEN / ROLLBACK]

**Rationale:** [evidence-based reasoning]

**If PROCEED:** A2 should focus on [recommended scope]

**If HOLD:** Remediation items before retrying:
- [list]
