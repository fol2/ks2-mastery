# Hero Mode pA3 — External Micro-Cohort Operational Procedure

**Phase:** A3 Optional Ring A3-5
**Date:** 2026-04-30
**Status:** TEMPLATE — not yet active

## Purpose

This procedure governs the optional external micro-cohort rehearsal. It is only activated if the team deliberately chooses to include first tiny external exposure within pA3 (the safer default is to defer to A4).

---

## Entry Criteria

The external micro-cohort must NOT begin until all of the following are satisfied:

1. **Ring A3-0 passes:** Evidence model repaired, documentation drift corrected, provenance-aware templates in place.
2. **Ring A3-1 passes:** Real internal cohort has elapsed 5+ production calendar days, 2+ date-key rollovers, 3+ learner profiles, zero stop conditions.
3. **Ring A3-2 passes:** Goal 6 telemetry extraction is working — start/completion/abandonment/economy/privacy signals can be extracted and verified.
4. **Ring A3-3 passes:** Browser QA checklist complete (12/12 items pass), rollback rehearsed, support checklist exercised.
5. **Ring A3-4 passes:** A4 recommendation issued as "PROCEED TO A4 LIMITED EXTERNAL COHORT" (not "HOLD" or "ROLL BACK").

If any ring fails or the A4 recommendation is not "PROCEED", the external micro-cohort does not start.

---

## Account Selection

| Constraint | Value |
|-----------|-------|
| Maximum accounts | 10 |
| Enablement mechanism | Per-account allowlist via `HERO_INTERNAL_ACCOUNTS` |
| Global Hero flags | OFF (no change) |
| Account type | Adult accounts with at least one active learner profile |
| Selection criteria | Diverse learner states: new, active-learning, Camp-sufficient, multi-subject |

### Selection guidance

- Choose accounts that represent different usage patterns (daily user, weekly user, new user).
- Include at least one account where the learner has not previously seen Hero surfaces.
- Include at least one account where the learner has existing subject progress in 2+ ready subjects.
- Do not select accounts belonging to children who cannot be supported if a stop condition fires.

---

## Onboarding Procedure

### Step 1 — Confirm entry criteria

Verify all 5 entry criteria above are marked PASS in the A3 evidence files.

### Step 2 — Select accounts

Record the selected account IDs in `hero-pA3-external-cohort-evidence.md` cohort configuration section.

### Step 3 — Add accounts to allowlist

```bash
# Retrieve current internal accounts
# Then merge external accounts into the array
echo '["adult-INTERNAL1", "adult-INTERNAL2", "adult-EXTERNAL1", "adult-EXTERNAL2", ...]' | wrangler secret put HERO_INTERNAL_ACCOUNTS
```

### Step 4 — Verify enablement

For each newly-added account:
- Load the platform as a learner under that account.
- Confirm Hero Quest card is visible.
- Confirm balance displays correctly (0 for new Hero users).
- Confirm Camp is accessible but secondary.

### Step 5 — Record onboarding

Add an onboarding note to the external cohort evidence file with date, accounts added, and operator.

---

## Daily Monitoring

Every calendar day during the external cohort observation window:

### Morning check (within first 2 hours of operator availability)

1. **Run smoke script:**
   ```bash
   node scripts/hero-pA2-cohort-smoke.mjs --learner-ids <all-cohort-ids>
   ```

2. **Check for stop conditions:**
   - Review smoke script output for any FAIL or WARNING signals.
   - Check D1 event_log for unexpected events.
   - Check heroState KV for negative balances or unexpected mutations.

3. **Extract telemetry:**
   - Run Goal 6 telemetry extraction for the previous day's activity.
   - Record any new observations in the evidence file.

### Evening review (end of operator availability)

4. **Operator review:**
   - Review the day's observations.
   - Update the evidence file with a new row per active learner.
   - Note any warnings, unusual patterns, or learner confusion signals.
   - Confirm no stop conditions have fired.

5. **Decision: continue or stop?**
   - If zero stop conditions: continue to next day.
   - If stop condition fires: execute rollback per `hero-pA3-rollback-procedure.md`.

---

## Stop Conditions with Immediate Rollback

If ANY of the following are observed for an external cohort member, immediately remove that account (or all accounts) from the allowlist:

| Condition | Action |
|-----------|--------|
| Negative balance from normal flows | Remove ALL accounts immediately |
| Privacy violation (raw child content) | Remove ALL accounts immediately |
| Non-internal account sees Hero unexpectedly | Remove ALL accounts immediately |
| Duplicate daily coin award | Remove affected account; investigate |
| Duplicate Camp debit | Remove affected account; investigate |
| Claim without Worker verification | Remove ALL accounts immediately |
| Dead CTA | Remove affected account; investigate |
| Hero mutates subject state | Remove ALL accounts immediately |
| Rollback cannot preserve state | Remove ALL accounts immediately |
| Learner confusion or distress signal | Remove affected account; investigate |

Refer to `hero-pA3-support-checklist.md` for detailed investigation steps for each condition.

---

## Duration

| Parameter | Value |
|-----------|-------|
| Minimum duration | 14 real calendar days |
| Minimum date-key rollovers | 7 |
| Maximum duration | 28 calendar days (extend only if evidence is inconclusive) |
| Daily operator review | Required every calendar day |
| Weekend coverage | At minimum, run the smoke script; full review on next working day |

---

## Exit Procedure

At the end of the observation window (14+ days):

### Step 1 — Compile evidence

- Ensure all observation rows have `Source = real-production`.
- Ensure the stop conditions table is complete.
- Run the final metrics summary.

### Step 2 — Issue recommendation

Write the final recommendation in `hero-pA3-recommendation.md`:

- **PROCEED TO A4 (broader external):** Zero stop conditions, positive learning signals, no privacy issues, economy integrity confirmed.
- **HOLD AND HARDEN:** Warnings observed that need remediation before broader exposure.
- **ROLL BACK / KEEP DORMANT:** Stop conditions fired that indicate fundamental issues.

### Step 3 — Decide next posture

- If proceeding: define A4 scope (accounts, duration, monitoring).
- If holding: list specific remediation items.
- If rolling back: execute full rollback per `hero-pA3-rollback-procedure.md`.

---

## Constraints Summary

- 10 external accounts maximum
- 14 calendar days minimum
- Global Hero flags remain OFF
- Per-account allowlist only
- Daily operator review required
- Immediate rollback for any critical stop condition
- No marketing claim, no default-on language
- No new gameplay, earning rules, or six-subject widening during observation

---

*Template created 2026-04-30. Procedure activates only after Rings A3-0 through A3-4 pass.*
