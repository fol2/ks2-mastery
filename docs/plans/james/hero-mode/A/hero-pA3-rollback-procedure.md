# Hero Mode pA3 — Rollback Procedure

**Phase:** A3 Ring A3-3
**Date:** 2026-04-30
**Status:** TEMPLATE — not yet rehearsed

## Purpose

This document describes how to narrow or fully disable Hero Mode access by modifying the `HERO_INTERNAL_ACCOUNTS` secret. It covers both planned narrowing (removing one account from the cohort) and emergency rollback (clearing all accounts immediately).

---

## Prerequisite Knowledge

- `HERO_INTERNAL_ACCOUNTS` is a Cloudflare Workers secret containing a JSON array of adult account IDs.
- Hero Mode surfaces are visible only to learner profiles under accounts in this array.
- Global Hero flags remain OFF. The only enablement path is per-account allowlisting.
- Hero state (balance, ledger, Camp ownership, completed tasks) lives in KV and D1. Removing an account from the allowlist does NOT delete this data — it makes it dormant.

---

## Planned Narrowing (remove one account)

Use this when: a specific account triggers a stop condition or needs to be removed from the cohort without affecting others.

### Steps

1. **Retrieve current allowlist:**
   ```bash
   echo $HERO_INTERNAL_ACCOUNTS
   # Or check the deployment configuration for the current JSON value
   ```

2. **Remove the target account ID from the JSON array:**
   ```json
   // Before:
   ["adult-EXAMPLE-ACCOUNT-1", "adult-EXAMPLE-ACCOUNT-2", "adult-EXAMPLE-ACCOUNT-3"]

   // After (removing adult-EXAMPLE-ACCOUNT-2):
   ["adult-EXAMPLE-ACCOUNT-1", "adult-EXAMPLE-ACCOUNT-3"]
   ```

3. **Deploy the updated secret:**
   ```bash
   echo '["adult-EXAMPLE-ACCOUNT-1", "adult-EXAMPLE-ACCOUNT-3"]' | wrangler secret put HERO_INTERNAL_ACCOUNTS
   ```

4. **Verify removal took effect:**
   - Load the platform as a learner under the removed account.
   - Confirm: no Hero Quest card, no Camp link, no Hero Coins display, no Hero-related network requests.

5. **Verify state preservation (dormancy):**
   - Query D1 for the learner's Hero event_log entries — they must still exist.
   - Query KV for the learner's heroState — it must still contain balance, ledger, and ownership.
   - The state is dormant, not deleted.

6. **Record the narrowing:**
   - Add a note to the cohort evidence file with date, removed account, reason, and operator.
   - If a stop condition triggered, record it in the stop conditions table.

---

## Emergency Rollback (clear all accounts)

Use this when: a critical stop condition affects the whole cohort, or an unexpected exposure is discovered.

### Steps

1. **Clear the allowlist immediately:**
   ```bash
   echo '[]' | wrangler secret put HERO_INTERNAL_ACCOUNTS
   ```

2. **Verify Hero surfaces are hidden for ALL previously-allowlisted accounts:**
   - Load the platform as a learner under each previously-allowlisted account.
   - Confirm: zero Hero surfaces visible for every account.

3. **Verify command routes fail closed:**
   - Attempt a Hero command (e.g. claim, Camp action) via direct API call.
   - Confirm: request is rejected with an appropriate non-internal error, not a 500.

4. **Verify state preservation:**
   - Query D1 and KV for ALL previously-allowlisted learners.
   - Confirm: all Hero state (balance, ledger, ownership, completed tasks) is intact and dormant.

5. **Record the rollback:**
   - Add emergency rollback entry to evidence file with date, time, reason, all affected accounts, and operator.
   - Mark the observation period as interrupted in the evidence file.
   - Update the stop conditions table.

6. **Notify the evidence owner:**
   - The evidence owner must decide whether to resume (re-add accounts) or hold.

---

## Re-enablement After Rollback

When re-enabling accounts after a rollback:

1. **Confirm the triggering condition is resolved** — do not re-enable until the stop condition is understood and remediated.

2. **Re-add account IDs to the allowlist:**
   ```bash
   echo '["adult-EXAMPLE-ACCOUNT-1", "adult-EXAMPLE-ACCOUNT-2"]' | wrangler secret put HERO_INTERNAL_ACCOUNTS
   ```

3. **Verify state continuity:**
   - Load as the learner and confirm Hero surfaces return.
   - Confirm balance, ledger, Camp ownership, and completed tasks are exactly as before rollback.
   - No "fresh start" — the learner resumes where they left off.

4. **Record re-enablement** in the evidence file with date, accounts, and confirmation of state continuity.

---

## Decision Matrix

| Situation | Action | Urgency |
|-----------|--------|---------|
| One learner hits a stop condition | Planned narrowing — remove that account | Within 1 hour |
| Privacy violation detected | Emergency rollback — clear all | Immediate |
| Non-internal exposure discovered | Emergency rollback — clear all | Immediate |
| Duplicate award confirmed | Planned narrowing — remove affected account, investigate | Within 1 hour |
| Negative balance from normal flow | Emergency rollback — clear all, investigate | Immediate |
| Ops probe shows unexpected data | Planned narrowing — pause the affected learner | Within 4 hours |
| Team decides to pause for analysis | Planned narrowing or full clear depending on scope | Planned |

---

*Template created 2026-04-30. Procedure to be rehearsed during Ring A3-3.*
