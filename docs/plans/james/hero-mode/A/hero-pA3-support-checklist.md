# Hero Mode pA3 — Support Checklist

**Phase:** A3 Ring A3-3
**Date:** 2026-04-30
**Status:** TEMPLATE — not yet exercised

## Purpose

This checklist maps every stop condition from pA3 section 8 to the specific operational response an operator must take. Each entry tells you exactly what to check, where to check it, and what to do.

---

## Stop Condition Response Map

### 1. Duplicate daily coin award

**Detection:** Learner balance increases by more than +100 on a single dateKey, or event_log contains two `hero-coins-awarded` events for the same `dateKey + learnerId` combination.

**Investigation steps:**
1. Query D1: `SELECT * FROM event_log WHERE learnerId = ? AND eventType = 'hero-coins-awarded' AND dateKey = ?`
2. Check if two rows exist with the same dateKey.
3. Check heroState in KV — does `economy.balance` exceed expected value?

**Response:** Planned narrowing of the affected account. Investigate idempotency key generation. Do not re-enable until root cause is confirmed.

---

### 2. Duplicate Camp debit

**Detection:** Ledger contains two debit entries with the same idempotency key, or balance is lower than expected after a single Camp action.

**Investigation steps:**
1. Query heroState in KV: inspect `economy.ledger` for duplicate entry IDs.
2. Query D1: `SELECT * FROM event_log WHERE learnerId = ? AND eventType LIKE 'hero-camp-%'` — check for duplicate debit events.
3. Verify the deterministic entry ID generation logic matches the observed duplicates.

**Response:** Planned narrowing. Investigate CAS (compare-and-swap) race condition or entry ID collision. Do not re-enable until dedup is confirmed working.

---

### 3. Negative balance

**Detection:** `economy.balance` in heroState KV is less than 0 for any learner in the cohort.

**Investigation steps:**
1. Read heroState from KV for the affected learner.
2. Check `economy.balance` value.
3. Reconstruct expected balance by replaying `economy.ledger` entries (sum of credits minus sum of debits).
4. If ledger replay and stored balance disagree, there is a reconciliation bug.

**Response:** Emergency rollback (clear all accounts). A negative balance from normal flows indicates a fundamental economy integrity failure. Do not re-enable until the balance derivation is proven correct.

---

### 4. Claim without Worker verification

**Detection:** event_log contains a `hero-claim-success` event without a corresponding subject completion event for the same learner and session.

**Investigation steps:**
1. Query D1: `SELECT * FROM event_log WHERE learnerId = ? AND eventType = 'hero-claim-success' ORDER BY timestamp DESC LIMIT 5`
2. For each claim, find the matching subject completion: `SELECT * FROM event_log WHERE learnerId = ? AND eventType LIKE '%completion%' AND timestamp < [claim_timestamp] ORDER BY timestamp DESC LIMIT 1`
3. If no matching completion exists, the claim bypassed Worker verification.

**Response:** Emergency rollback. A claim without verification means the completion-evidence contract is broken. Investigate the claim command handler and subject completion reporting.

---

### 5. Hero mutates subject state

**Detection:** Subject Stars, mastery levels, or subject-owned monsters change as a direct result of a Hero command (not a subject session).

**Investigation steps:**
1. This is architecturally impossible in the current design — Hero commands have no write access to subject state stores.
2. If suspected, diff the subject state (Stars, mastery, monsters) before and after a Hero command.
3. Check for new code paths that were not present in P6/pA2 that could bridge Hero commands to subject mutation.
4. Review recent PRs for any Hero-to-subject write path.

**Response:** Emergency rollback. If confirmed, this represents a fundamental architecture violation. The code path must be identified and removed before any re-enablement.

---

### 6. Dead CTA (child-visible quest has no valid launch path)

**Detection:** Hero Quest card shows a task that cannot be launched — clicking it produces an error, blank screen, or redirect to an unrelated page.

**Investigation steps:**
1. Check the readiness derivation for the learner: which subjects are ready, which task was selected?
2. Check the launch adapter for the selected subject: does it have a valid mapping for the task type?
3. Check the subject engine: is it in a state that can accept the launch?
4. The Grammar `mini-test` → `satsset` fix (PR #663) resolved one known dead CTA. Check if a new unmapped task type has appeared.

**Response:** Planned narrowing of the affected account. Investigate the specific launch failure. This is a UX regression, not a safety failure, but it blocks the QA gate.

---

### 7. Non-internal exposure

**Detection:** An account NOT in `HERO_INTERNAL_ACCOUNTS` sees Hero surfaces (Quest card, Camp link, Coins display).

**Investigation steps:**
1. Confirm the account ID is genuinely not in the allowlist: check the current `HERO_INTERNAL_ACCOUNTS` secret value.
2. Check if global Hero flags have been accidentally enabled.
3. Check the override derivation logic: is the read model incorrectly granting Hero access?
4. Check for cached stale state — did the account previously have access and is now seeing a cached response?

**Response:** Emergency rollback (clear all accounts). Non-internal exposure is a critical exposure-control failure. Investigate the override mechanism immediately.

---

### 8. Telemetry sink miss

**Detection:** event_log row counts for the observation window are lower than expected given known user activity. The cohort smoke script reports missing events.

**Investigation steps:**
1. Run the cohort smoke script: `node scripts/hero-pA2-cohort-smoke.mjs --learner-ids <ids>`
2. Compare expected events (based on known activity) with actual D1 event_log rows.
3. Check Worker logs for errors during event write.
4. Check D1 batch() success/failure responses.

**Response:** Planned narrowing or pause. Missing telemetry does not harm the learner, but it prevents evidence collection. Investigate the event write path. Resume only when telemetry is confirmed flowing.

---

### 9. Raw child content

**Detection:** Raw child answer text, raw prompts, child free-text, or other forbidden fields appear in metrics, probe output, event_log, logs, or exports.

**Investigation steps:**
1. Run the privacy validator against recent telemetry: `node scripts/hero-pA2-cohort-smoke.mjs --privacy-check`
2. Query event_log for events with suspicious payload sizes or known forbidden field names.
3. Check probe output for any field containing answer text, prompt text, or child-generated content.
4. The recursive privacy validator (PR #660) should catch this at write-time — if it appears, the validator has a gap.

**Response:** Emergency rollback. Raw child content in operational data is a privacy violation. Clear all accounts, identify the leaking field, patch the privacy validator, and verify before re-enabling.

---

### 10. Rollback failure

**Detection:** After removing an account from `HERO_INTERNAL_ACCOUNTS`, Hero surfaces remain visible or state is deleted rather than preserved dormant.

**Investigation steps:**
1. Confirm the secret was successfully updated (re-read the secret or check deployment).
2. Check for Worker caching — is an old allowlist being served?
3. Check KV and D1 for the state — is it still present (dormant) or has it been deleted?
4. If state is deleted, identify the code path that performed the deletion.

**Response:** Re-run the rollback procedure. If Hero surfaces persist, escalate to a full Worker redeployment. If state was deleted, this is a critical failure — the preserve-state contract is broken.

---

### 11. Broken locked subjects

**Detection:** Arithmetic, Reasoning, or Reading placeholders crash the Hero UI, show as launchable tasks, produce errors, or break the page layout.

**Investigation steps:**
1. Check the Hero read model: does it correctly identify these subjects as locked/placeholder?
2. Check the Hero Quest scheduler: is it incorrectly including locked subjects in task selection?
3. Check the client rendering: does the placeholder component handle the locked state gracefully?

**Response:** Planned narrowing. This is a UX issue that does not harm learner data but blocks the product safety gate. Fix the placeholder handling before resuming.

---

### 12. Task selection unexplainable

**Detection:** An operator or support reviewer cannot explain why a specific task was selected for a learner. The selection appears arbitrary or contradicts the learner's state.

**Investigation steps:**
1. Check the Hero scheduler log for the learner's most recent scheduling decision.
2. Verify the inputs to the scheduler: subject readiness, task types available, rotation/seed logic.
3. Check if the learner's state has an unusual combination (e.g. all subjects at secure-maintenance simultaneously).
4. Confirm the `pickBySeed` or scheduling logic produces a deterministic result for the given inputs.

**Response:** Planned narrowing. An unexplainable selection erodes trust in the scheduling contract. Investigate and document the selection reason before resuming.

---

### 13. Simulated as real

**Detection:** An evidence row is recorded with `Source = real-production` but was actually generated from simulation, local dev, or manual construction.

**Investigation steps:**
1. Cross-reference the evidence row date with actual production deployment and usage logs.
2. Check if the probe or script was run against production or a local/staging environment.
3. Verify the operator who recorded the row.

**Response:** Correct the Source classification immediately. If this was intentional misclassification, escalate as an evidence integrity failure. The certification validator must not pass gates on misclassified rows.

---

### 14. Camp before learning

**Detection:** The UI ordering or flow directs children towards Camp spending before completing the daily learning mission.

**Investigation steps:**
1. Check the Hero surface rendering order: is the Hero Quest card primary and Camp secondary?
2. Check for UI changes that may have elevated Camp above the Quest action.
3. Check the client copy: does it mention Camp or spending before the learning mission is introduced?

**Response:** Planned narrowing. Fix the UI ordering. Hero Mode's product contract requires learning-first, Camp-second. Resume only when the flow is corrected.

---

### 15. Pressure copy

**Detection:** Client-facing copy implies missed-day loss, streak punishment, scarcity, gambling, limited-time offers, or shop pressure.

**Investigation steps:**
1. Check `shared/hero/hero-copy.js` vocabulary allowlist and all Hero-related copy strings.
2. Search for time-pressure language: "hurry", "limited", "running out", "don't miss", "streak".
3. Search for punishment language: "lost", "taken away", "expired", "penalty".
4. Check insufficient-coins copy for pressure patterns.

**Response:** Planned narrowing. Replace the offending copy with calm, factual language. Resume only when the copy audit is clean.

---

### 16. Untraceable evidence rows

**Detection:** Evidence rows cannot be traced to source, environment, and collection method. Check that every row in the evidence file has all provenance metadata (Source column populated, operator recorded, collection date present).

**Investigation steps:**
1. Scan the evidence file for rows where the Source column is empty, missing, or contains an unrecognised value.
2. Cross-reference each row with the operator log — confirm which human or script produced it.
3. Verify the collection date is present and corresponds to actual probe execution timestamps.
4. Check whether the row was manually inserted without running the cohort smoke script.

**Response:** Pause evidence collection. Investigate the source of untraceable rows. Do not count untraceable rows toward certification gates. Correct or remove affected rows before resuming evidence collection.

---

## Quick Reference Table

| # | Stop Condition | Severity | Response | Check Location |
|---|---------------|----------|----------|---------------|
| 1 | Duplicate daily coin award | High | Narrow | D1 event_log |
| 2 | Duplicate Camp debit | High | Narrow | KV heroState ledger |
| 3 | Negative balance | Critical | Emergency rollback | KV heroState economy.balance |
| 4 | Claim without Worker verification | Critical | Emergency rollback | D1 event_log |
| 5 | Hero mutates subject state | Critical | Emergency rollback | Subject state stores |
| 6 | Dead CTA | Medium | Narrow | Launch adapter + readiness |
| 7 | Non-internal exposure | Critical | Emergency rollback | HERO_INTERNAL_ACCOUNTS + override logic |
| 8 | Telemetry sink miss | Medium | Narrow/pause | D1 event_log row counts |
| 9 | Raw child content | Critical | Emergency rollback | Privacy validator + event_log |
| 10 | Rollback failure | Critical | Re-run procedure | KV + D1 + Worker state |
| 11 | Broken locked subjects | Medium | Narrow | Hero read model + client |
| 12 | Task selection unexplainable | Medium | Narrow | Hero scheduler log |
| 13 | Simulated as real | High | Correct classification | Evidence file |
| 14 | Camp before learning | Medium | Narrow | Client UI ordering |
| 15 | Pressure copy | Medium | Narrow | hero-copy.js + client strings |
| 16 | Untraceable evidence rows | High | Pause | Evidence file provenance metadata |

---

*Template created 2026-04-30. Checklist to be exercised during Ring A3-3.*
