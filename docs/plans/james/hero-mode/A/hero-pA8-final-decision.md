# Hero Mode pA8 - Final Decision

**Phase:** A8 release boundary closure and A-series termination
**Date:** 2026-05-02
**Status:** FINAL - KEEP DORMANT UNTIL OWNED, full pA8 release execution incomplete
**Contract:** `docs/plans/james/hero-mode/A/hero-mode-pA8.md`
**Machine-readable evidence summary:** `reports/hero/hero-pA8-release-boundary.json`

---

## Selected Outcome

```txt
KEEP DORMANT UNTIL OWNED
```

Hero Mode is not normalised by this branch. It is not widened to a cohort or percentage rollout. A8 closes the pA7 unknown-boundary blocker by narrowing production exposure to a known zero-account boundary.

---

## What Is Complete

1. `HERO_INTERNAL_ACCOUNTS` is no longer an unknown write-only exposure basis; it was rotated to a known empty JSON array.
2. `HERO_EXTERNAL_ACCOUNTS` exists as a known empty JSON array.
3. `HERO_EXCLUDED_ACCOUNTS` exists as a known empty JSON array.
4. `HERO_EMERGENCY_DISABLED` exists, was rehearsed as `true`, and was restored to `false`.
5. `HERO_ROLLOUT_PERCENT` exists as `0`.
6. Checked-in global Hero flags remain false.
7. Production Hero state rows remain 0.
8. Production Hero event rows remain 0.
9. Emergency-off hid Hero surfaces and rejected Hero commands with controlled non-500 responses.
10. Post-rehearsal dormant state returned controlled flag-disabled responses.
11. No real family account was widened, and no account remains widened after the temporary demo/test probes.
12. A controlled production demo/test account probe was attempted, but it did not qualify as Stage 1 smoke because the read model had `ui.enabled=false` and zero tasks.
13. A second controlled production demo/test account completed one Grammar session through the normal subject command path before temporary allowlisting, but it also did not qualify because Hero still returned `ui.enabled=false`, `ui.reason=no-eligible-subjects`, and zero tasks.
14. No A9 is created.

This is a complete dormant-boundary record. It is not a complete pA8 release execution, because the known-account production smoke did not pass.

A8 did make production secret writes to force the pA7 unknown boundary into a known dormant state. That is narrower than strict full pA8 release execution and is recorded here as operational closure, not as normalisation evidence.

---

## Why Normalisation Is Not Allowed

| Requirement | Status |
|-------------|--------|
| Production boundary known | PASS - known zero exposure |
| Emergency brake works | PASS for dormant boundary |
| Opt-out/exclusion works | Control exists; no excluded account supplied to exercise |
| Known-account smoke passed | NOT RUN; controlled demo/test probes did not qualify |
| Rollback rehearsal passed | PASS for dormant boundary only |
| Small exposure produced no stop condition | NOT RUN |
| Support load known and manageable | Zero supplied rows under no exposure; not a real exposure support load |
| Product owner signs that Hero Mode helps rather than distracts | Not supplied for normalisation |

Normalisation would require a new product release window, not another A-series phase.

---

## A-Series Termination

A8 ends the A-series as a phase line, but it does not certify Hero Mode for widening or normalisation.

Any future Hero Mode work must be one of:

- a normal product release task with a named account and support window;
- a bugfix for a concrete defect;
- a product rework brief.

It must not be A9.

---

## Review

| Field | Value |
|-------|-------|
| Owner | James |
| Review-by date | 2026-05-16 |
| Specific reason for dormant decision | No known enabled account and owned live release window were supplied for the Stage 1 smoke after the boundary was made known zero |
