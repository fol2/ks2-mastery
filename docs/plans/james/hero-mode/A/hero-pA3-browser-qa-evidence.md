# Hero Mode pA3 — Browser QA Checklist and Evidence

**Phase:** A3 Ring A3-3
**Date:** 2026-04-30
**Status:** TEMPLATE — no checks completed yet

## Purpose

This checklist verifies that Hero Mode works as a real child/adult flow in production browsers, not only as pure function tests. Each item must be verified by an operator before the A4 recommendation gate can pass.

---

## QA Checklist

### 1. Non-internal account sees no Hero surface

| Field | Value |
|-------|-------|
| **Description** | A production account NOT in `HERO_INTERNAL_ACCOUNTS` must see zero Hero UI: no Hero Quest card, no Camp link, no Hero Coins display, no Hero-related navigation. |
| **Expected result** | All subject landing pages, dashboard, and navigation render without any Hero surfaces. No Hero-related network requests fire. |
| **Pass/Fail** | |
| **Evidence method** | Screenshot of dashboard + Network tab filtered for "hero" |
| **Date** | |
| **Operator** | |

### 2. Internal account sees Hero read model and child-safe surface

| Field | Value |
|-------|-------|
| **Description** | An account in `HERO_INTERNAL_ACCOUNTS` must see the Hero Quest card, Hero Coins balance, and Camp access when Hero readiness is satisfied. |
| **Expected result** | Hero Quest card renders with a valid daily mission. Balance displays. Camp is accessible but secondary to the learning action. |
| **Pass/Fail** | |
| **Evidence method** | Screenshot of Hero surfaces + console log showing read-model response |
| **Date** | |
| **Operator** | |

### 3. Hero Quest starts through the subject command path

| Field | Value |
|-------|-------|
| **Description** | Clicking the Hero Quest primary action must route into the correct subject engine (Spelling, Grammar, or Punctuation) via the standard subject launch path. |
| **Expected result** | Subject engine loads with the correct task envelope. URL shows subject path, not a Hero-specific route. |
| **Pass/Fail** | |
| **Evidence method** | Screenshot of subject session + Network request showing launch adapter call |
| **Date** | |
| **Operator** | |

### 4. Returning from subject session preserves Hero context

| Field | Value |
|-------|-------|
| **Description** | After completing a subject session launched from Hero Quest, returning to the Hero surface must show updated progress without losing Hero state. |
| **Expected result** | Hero progress reflects the completed task. Balance and ledger are consistent. No "start over" state. |
| **Pass/Fail** | |
| **Evidence method** | Screenshot before and after subject return + console state comparison |
| **Date** | |
| **Operator** | |

### 5. Claim requires Worker-verified completion evidence

| Field | Value |
|-------|-------|
| **Description** | A Hero completion claim must only succeed when the Worker has verified subject completion evidence. Manually crafted claim requests without real subject completion must be rejected. |
| **Expected result** | Claim succeeds after real subject completion. Claim without matching subject evidence returns rejection. |
| **Pass/Fail** | |
| **Evidence method** | Network tab showing claim request/response + console verification |
| **Date** | |
| **Operator** | |

### 6. Daily completion awards Hero Coins once only

| Field | Value |
|-------|-------|
| **Description** | Completing the daily Hero Quest must award exactly +100 Hero Coins. A second completion on the same dateKey must not award additional coins. |
| **Expected result** | First completion: balance increases by 100. Second attempt: balance unchanged, no duplicate ledger entry. |
| **Pass/Fail** | |
| **Evidence method** | Console log showing balance before/after each completion attempt |
| **Date** | |
| **Operator** | |

### 7. Refresh/retry/two-tab do not duplicate awards

| Field | Value |
|-------|-------|
| **Description** | Refreshing the page mid-claim, retrying the claim endpoint, or running two tabs simultaneously must not produce duplicate coin awards or duplicate ledger entries. |
| **Expected result** | Balance and ledger entry count remain correct regardless of refresh/retry/tab count. |
| **Pass/Fail** | |
| **Evidence method** | Network tab showing multiple requests + console showing final state is idempotent |
| **Date** | |
| **Operator** | |

### 8. Camp invite/grow works only when affordable, no duplicate spend

| Field | Value |
|-------|-------|
| **Description** | Camp invite/grow actions must succeed only when balance is sufficient. Repeating the same action must not debit coins twice (idempotent via entry ID). |
| **Expected result** | Affordable action: succeeds, balance decreases by correct amount. Insufficient: calm rejection. Duplicate: no second debit. |
| **Pass/Fail** | |
| **Evidence method** | Network requests + balance before/after + ledger entry inspection |
| **Date** | |
| **Operator** | |

### 9. Insufficient-coins copy is calm and accurate

| Field | Value |
|-------|-------|
| **Description** | When the learner cannot afford a Camp action, the displayed copy must be calm, factual, and free of pressure, scarcity, or gambling language. |
| **Expected result** | Copy reads like "You need X more Hero Coins" or similar. No urgency, no countdown, no "running out", no "limited time". |
| **Pass/Fail** | |
| **Evidence method** | Screenshot of insufficient-coins state |
| **Date** | |
| **Operator** | |

### 10. Locked placeholder subjects do not break the experience

| Field | Value |
|-------|-------|
| **Description** | Arithmetic, Reasoning, and Reading placeholders must render without errors. They must not appear as launchable Hero tasks. |
| **Expected result** | Placeholders display a calm "coming soon" or equivalent. No crash, no dead CTA, no broken layout. |
| **Pass/Fail** | |
| **Evidence method** | Screenshot of locked subject placeholder rendering |
| **Date** | |
| **Operator** | |

### 11. Rollback by narrowing/clearing HERO_INTERNAL_ACCOUNTS hides Hero surfaces

| Field | Value |
|-------|-------|
| **Description** | Removing an account from `HERO_INTERNAL_ACCOUNTS` must make Hero surfaces disappear for that account on the next page load. |
| **Expected result** | After removal: dashboard, navigation, and all pages render without Hero surfaces. No stale Hero state visible. |
| **Pass/Fail** | |
| **Evidence method** | Screenshot before removal, then after removal + page refresh |
| **Date** | |
| **Operator** | |

### 12. Rollback preserves balances, ledgers, completed tasks, Hero Pool ownership dormant

| Field | Value |
|-------|-------|
| **Description** | After rollback (account removed from allowlist), the underlying Hero state must remain intact in KV/D1 — dormant but not deleted. Re-adding the account must restore full state. |
| **Expected result** | D1/KV inspection shows balance, ledger entries, and Pool ownership still present. Re-enablement restores visible state without data loss. |
| **Pass/Fail** | |
| **Evidence method** | D1/KV query before rollback, after rollback, and after re-enablement |
| **Date** | |
| **Operator** | |

---

## Rollback Rehearsal

Items 11 and 12 constitute the rollback rehearsal. They must be run as a pair and require preserve-state proof.

### Preserve-state proof requirement

The operator must demonstrate:

1. **Before rollback:** Record the exact Hero state (balance, ledger entry count, Pool ownership) for the target account.
2. **After rollback:** Query D1/KV directly to confirm the state still exists (dormant, not deleted).
3. **After re-enablement:** Confirm the Hero surfaces return with the exact same state as recorded in step 1.

Evidence format: D1 query results or KV inspection output showing continuity across the rollback cycle.

---

*Template created 2026-04-30. Checks to be completed during Ring A3-3.*
