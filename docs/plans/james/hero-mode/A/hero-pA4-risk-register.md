# Hero Mode pA4 — Stop and Warning Condition Register

**Phase:** A4 (Productionisation Path and Limited External Release)
**Date:** 2026-04-30
**Status:** ACTIVE

---

## Section 1: Stop Conditions

Stop widening immediately if any of these occur. All stop conditions derive from the pA4 origin contract section 11.

| # | Condition | Detection Method | Response Action | Owner | Status |
|---|-----------|-----------------|-----------------|-------|--------|
| S1 | Raw child content in telemetry/logs | `detectRawChildContent()` + privacy validator + output stripping | Immediate: narrow cohort, investigate with request IDs | TBD | MONITORING |
| S2 | Non-cohort accounts see Hero surfaces | `detectNonCohortExposure()` + read model checks + ops probe | Immediate: verify flags, check external accounts list | TBD | MONITORING |
| S3 | Hero command succeeds for non-enabled account | `detectUnauthorisedCommand()` + route gate + resolver audit | Immediate: check resolver, emergency flag-off | TBD | MONITORING |
| S4 | Duplicate daily coin award | `detectDuplicateDailyAward()` + ledger scan + dateKey dedup | Immediate: pause claims, investigate idempotency | TBD | MONITORING |
| S5 | Duplicate Camp debit | `detectDuplicateCampDebit()` + CAS check + entry ID dedup | Immediate: pause Camp actions, check dedup | TBD | MONITORING |
| S6 | Negative balance | `detectNegativeBalance()` + balance invariant + ledger reconciliation | Immediate: pause economy, reconcile ledger | TBD | MONITORING |
| S7 | Claim without Worker-verified completion | `detectClaimWithoutCompletion()` + evidence check + event_log cross-check | Immediate: pause claims, verify evidence chain | TBD | MONITORING |
| S8 | Hero mutates subject Stars/mastery | `detectSubjectMutation()` + boundary guard + subject isolation proof | Immediate: emergency flag-off, investigate | TBD | MONITORING |
| S9 | Dead/unlaunchable primary CTA | `detectDeadCTA()` + readiness check + launch adapter validation | Urgent: fix or hide CTA, notify cohort | TBD | MONITORING |
| S10 | Rollback cannot hide while preserving state | `detectRollbackFailure()` + flag-off test + dormancy proof | Immediate: emergency investigation | TBD | MONITORING |
| S11 | Repeated unexplained 500s on Hero routes | `detectRepeatedErrors()` + error rate monitoring + route health | Urgent: investigate, narrow if persistent | TBD | MONITORING |
| S12 | Support cannot explain/triage issue | `detectUntriageableIssue()` + required fields + triage guide coverage | Hold: improve triage guide before widening | TBD | MONITORING |
| S13 | Parent feedback indicates pressure/misleading | `detectPressureCopy()` + copy validator + vocabulary allowlist | Hold: review copy, fix before widening | TBD | MONITORING |

---

## Section 2: Warning Conditions

Warning conditions do not automatically stop pA4 but require an owner decision before widening. These derive from the pA4 origin contract section 12.

| # | Condition | Detection Method | Response Action | Owner | Status |
|---|-----------|-----------------|-----------------|-------|--------|
| W1 | Low Hero Quest start rate | `detectLowStartRate()` + cohort telemetry + quest-shown vs quest-started ratio | Decision: investigate comprehension, check CTA clarity before widening | TBD | MONITORING |
| W2 | Low completion rate | `detectLowCompletionRate()` + daily completion count vs start count | Decision: investigate task difficulty or abandonment points | TBD | MONITORING |
| W3 | Repeated abandonment after first task | `detectRepeatedAbandonment()` + task-start vs session-end timing | Decision: investigate flow confusion or task suitability | TBD | MONITORING |
| W4 | Children open Camp but do not start learning | `detectCampBeforeLearning()` + Camp open events without prior quest start | Decision: review UI ordering, consider hiding Camp until quest started | TBD | MONITORING |
| W5 | Parents misunderstand Hero Coins | `detectParentConfusion()` + support ticket categorisation + explainer feedback | Decision: review parent explainer copy, consider clarification update | TBD | MONITORING |
| W6 | Telemetry has blind spots for a non-critical signal | `detectTelemetryGaps()` + signal coverage audit + missing event types | Decision: log limitation, decide if measurement matters for widening | TBD | MONITORING |
| W7 | One ready subject dominates the schedule more than expected | `detectSubjectDominance()` + subject mix distribution + scheduling analysis | Decision: investigate scheduler behaviour, check if learner-driven | TBD | MONITORING |
| W8 | Support questions cluster around copy or navigation | `detectCopyConfusion()` + support ticket topic clustering | Decision: fix copy if cheap, otherwise log for next iteration | TBD | MONITORING |
| W9 | Performance is slower than ideal but not failing | `detectSlowPerformance()` + P50/P95 latency monitoring + route timing | Decision: accept if within platform norms, investigate if degrading | TBD | MONITORING |

---

## Section 3: Response Protocol

### Stop condition response

1. **Immediately halt widening** — do not add new accounts to cohort.
2. **Narrow or clear cohort** — remove affected accounts or clear all, depending on severity.
3. **Keep global flags off** — never flip global default-on during investigation.
4. **Preserve Hero state dormant** — Hero state is NEVER deleted during response.
5. **Investigate with safe identifiers** — use request IDs, learner IDs, date keys, and safe telemetry. Never collect raw child content during investigation.
6. **Record in register** — update Status column and add investigation notes.
7. **Require resolution before re-widening** — stop conditions must be understood and remediated before any new exposure.

### Warning condition response

1. **Requires owner decision** — the assigned owner must explicitly decide before widening.
2. **Do NOT auto-halt** — warnings are not blockers unless escalated.
3. **Document the decision** — record whether widening proceeds and why.
4. **Fix if cheap and high-impact** — do not derail the phase for cosmetic or speculative improvements.
5. **Preserve Hero state** — dormant, never deleted, regardless of warning outcome.

### State preservation invariant

Regardless of whether a stop or warning condition fires, the following always holds:

- Hero state is **dormant**, never deleted.
- Ledger entries, Camp ownership, progress state, and quest history are preserved.
- Re-enablement after resolution produces identical readiness.

---

*Register created 2026-04-30. Updated as pA4 rings progress.*
