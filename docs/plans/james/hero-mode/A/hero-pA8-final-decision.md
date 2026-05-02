# Hero Mode pA8 - Final Decision

**Phase:** A8 release boundary closure and A-series termination
**Date:** 2026-05-02
**Status:** FINAL - HOLD WITH KNOWN BOUNDARY, James-only named internal rollout
**Contract:** `docs/plans/james/hero-mode/A/hero-mode-pA8.md`
**Machine-readable evidence summary:** `reports/hero/hero-pA8-release-boundary.json`

---

## Selected Outcome

```txt
HOLD WITH KNOWN BOUNDARY - JAMES-ONLY NAMED INTERNAL ROLLOUT
```

Hero Mode is not normalised by this branch. It is not widened to a cohort or percentage rollout. A8 closes the pA7 unknown-boundary blocker and, after product-owner approval from James, leaves production exposure at one known named internal account: James's adult account.

---

## What Is Complete

1. `HERO_INTERNAL_ACCOUNTS` is no longer an unknown write-only exposure basis; it is now a known reviewed JSON array containing James's account only.
2. `HERO_EXTERNAL_ACCOUNTS` exists as a known empty JSON array.
3. `HERO_EXCLUDED_ACCOUNTS` exists as a known empty JSON array.
4. `HERO_EMERGENCY_DISABLED` exists, was rehearsed as `true`, and was restored to `false`.
5. `HERO_ROLLOUT_PERCENT` exists as `0`.
6. Checked-in global Hero flags remain false.
7. Production Hero state rows are observable: 1 `child_game_state` row for `system_id='hero-mode'`.
8. Production Hero event rows are observable: 3 `event_log` rows for `hero.task.completed`, `hero.daily.completed`, and `hero.coins.awarded`.
9. Emergency-off hid Hero surfaces and rejected Hero commands with controlled non-500 responses.
10. Post-rehearsal dormant state returned controlled flag-disabled responses.
11. James's known account is intentionally widened as the current named internal rollout boundary.
12. The James known-account smoke passed: enabled read model, start-task, Worker-owned punctuation completion, claim, daily coin award, duplicate-claim no-double-award, and Camp insufficient-coins block.
13. Non-cohort demo access remains hidden.
14. Explicit exclusion and emergency-off both hide Hero and reject commands with controlled non-500 responses.
15. No A9 is created.

This is a complete Stage 1 known-account smoke record and a known-boundary hold. It is not a global default-on decision.

A8 did make production secret writes to force the pA7 unknown boundary into a known state. The intended exposure boundary is James-only named internal rollout, not cohort or global exposure.

---

## Why Normalisation Is Not Allowed

| Requirement | Status |
|-------------|--------|
| Production boundary known | PASS - one known internal account |
| Emergency brake works | PASS |
| Opt-out/exclusion works | PASS |
| Known-account smoke passed | PASS for James account |
| Rollback rehearsal passed | PASS; re-enable preserved completed state, balance, and ledger |
| Small exposure produced no stop condition | NOT RUN |
| Support load known and manageable | Explicit zero beyond James; not a multi-account exposure support load |
| Product owner signs that Hero Mode helps rather than distracts | Supplied for rollout, not enough for normalisation under Stage 3 |

Normalisation would require Stage 2 small exposure evidence and the Stage 3 checks in the pA8 contract. The current approval supports named rollout within the contract, not global default-on.

---

## A-Series Termination

A8 ends the A-series as a phase line. It certifies the James-only named internal rollout boundary, but it does not certify Hero Mode for percentage rollout or global normalisation.

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
| Specific reason for hold | Stage 1 passed for James; Stage 2 small exposure and Stage 3 normalisation evidence have not run |
