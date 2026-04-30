# Hero Mode pA4 — Support Triage Pack

**Phase:** A4 External Early Access
**Date:** 2026-04-30
**Status:** ACTIVE

---

## Section 1: Support Triage Guide

When a parent or child reports an issue with Hero Mode, the support operator collects the following information before any investigation begins.

### Required collection fields

1. **Account safe alias or account ID** — identifies the adult account
2. **Learner safe alias or learner ID** — identifies the specific child profile
3. **dateKey** — the date the issue occurred, in YYYY-MM-DD format
4. **Approximate time** — when the issue was observed (HH:MM, timezone)
5. **Device/browser** — device type and browser name/version
6. **What surface was visible** — which Hero screen or component was showing
7. **Request ID** — if available from the network request or error display
8. **Issue category** — one of: learning flow | claim | coins | Camp | visibility | copy

### Triage process

1. Collect all 8 fields above.
2. Determine the issue category.
3. Check the Known Issues table (Section 4) for an existing match.
4. If the issue matches a known issue with a workaround, provide the workaround.
5. If the issue is new, open an investigation using the operator-lookup script: `node scripts/hero-pA4-operator-lookup.mjs --account-id=<id>`
6. Record the issue in the support queue with all collected fields.

---

## Section 2: Safe Collection / Forbidden Collection

### Safe to collect

The following data items are safe to collect and store during support triage:

- Account ID
- Learner ID
- dateKey (YYYY-MM-DD)
- Approximate time
- Device/browser
- Surface visible
- Request ID
- Issue category

### DO NOT collect

The following items are strictly forbidden from collection, storage, or transmission:

- Raw answer text (child's actual answers to questions)
- Raw prompt text (question content shown to the child)
- Child free text (any text the child has typed)
- Screenshots containing sensitive child content (unless a verified safe-handling route exists and has been approved)

If any of the above are inadvertently received, delete immediately and record the incident. Do not forward, store, or reference the content in any ticket or log.

---

## Section 3: Rollback Instruction

This procedure disables Hero Mode for external cohort accounts. It follows the rollback pattern established in pA3 (see `hero-pA3-rollback-procedure.md`).

### Step-by-step procedure

1. **Set all 6 HERO_MODE_*_ENABLED flags to "false":**
   ```bash
   wrangler secret put HERO_MODE_SHADOW_ENABLED <<< "false"
   wrangler secret put HERO_MODE_LAUNCH_ENABLED <<< "false"
   wrangler secret put HERO_MODE_CHILD_UI_ENABLED <<< "false"
   wrangler secret put HERO_MODE_PROGRESS_ENABLED <<< "false"
   wrangler secret put HERO_MODE_ECONOMY_ENABLED <<< "false"
   wrangler secret put HERO_MODE_CAMP_ENABLED <<< "false"
   ```

2. **Remove the account from the HERO_EXTERNAL_ACCOUNTS list:**
   ```bash
   # Retrieve current list, remove the target account, redeploy
   echo '["remaining-account-1", "remaining-account-2"]' | wrangler secret put HERO_EXTERNAL_ACCOUNTS
   ```
   For full cohort rollback, deploy an empty array:
   ```bash
   echo '[]' | wrangler secret put HERO_EXTERNAL_ACCOUNTS
   ```

3. **Verify via operator-lookup script that Hero surfaces are hidden:**
   ```bash
   node scripts/hero-pA4-operator-lookup.mjs --account-id=<target-account>
   ```
   Confirm: no Hero Quest card, no Camp link, no Hero Coins display, no Hero-related network requests visible for any learner under the account.

4. **Hero state remains preserved (dormant, not deleted):**
   - Balance, ledger, Camp ownership, and completed tasks persist in KV and D1.
   - Removing access does NOT destroy data. The state becomes dormant.
   - Verify via D1 query that event_log and heroState entries remain intact.

5. **Re-enable by adding account back and setting flags:**
   - Add the account ID back to `HERO_EXTERNAL_ACCOUNTS`.
   - Set the relevant `HERO_MODE_*_ENABLED` flags back to `"true"`.
   - Verify state continuity: the learner resumes where they left off.
   - Record re-enablement in the evidence file.

---

## Section 4: Known Issues

| # | Issue | Severity | Workaround | Status |
|---|-------|----------|-----------|--------|
| (to be populated during cohort) | | | | |

---

## Section 5: Escalation Rules

The following conditions require immediate escalation. Do not attempt to resolve these through normal support channels.

### 5.1 Privacy violation

**Trigger:** Raw child content (answer text, prompt text, free text) appearing in logs, metrics, event_log, probe output, exports, or any operational data.

**Detection method:** Privacy validator alert, manual audit of event_log payloads, or parent report of exposed content.

**Response action:** Emergency rollback (clear all accounts from HERO_EXTERNAL_ACCOUNTS). Delete any stored forbidden content immediately. Investigate the leaking field path. Patch the privacy validator before re-enablement.

**Escalation target:** [TO BE ASSIGNED — privacy lead]

---

### 5.2 Duplicate rewards

**Trigger:** Coins awarded twice for the same learner on the same dateKey, or Camp debit applied twice with the same idempotency key.

**Detection method:** Operator-lookup script balance check exceeds +100 for a single day, or D1 event_log query reveals duplicate `hero-coins-awarded` entries for one dateKey.

**Response action:** Planned narrowing of the affected account. Investigate idempotency key generation and CAS logic. Do not re-enable until deduplication is confirmed.

**Escalation target:** [TO BE ASSIGNED — economy integrity lead]

---

### 5.3 Dead CTA

**Trigger:** Child cannot find the next action — Hero Quest card shows a task that cannot be launched, produces an error, blank screen, or redirect to an unrelated page.

**Detection method:** Parent report, QA observation, or operator-lookup script showing a task with no valid launch adapter.

**Response action:** Planned narrowing of the affected account. Investigate the specific launch failure (check readiness derivation, launch adapter mapping, and subject engine state). Resume only when the dead CTA is resolved.

**Escalation target:** [TO BE ASSIGNED — UX/launch lead]

---

### 5.4 State corruption

**Trigger:** Balance negative, ledger entries inconsistent with balance, or heroState structurally invalid.

**Detection method:** Operator-lookup script balance validation, or ledger replay disagrees with stored balance value.

**Response action:** Emergency rollback (clear all accounts). A negative balance or inconsistent ledger indicates a fundamental economy integrity failure. Do not re-enable until the balance derivation is proven correct through ledger replay.

**Escalation target:** [TO BE ASSIGNED — state integrity lead]

---

### 5.5 Non-cohort exposure

**Trigger:** Hero surfaces visible to an account that is NOT in the `HERO_EXTERNAL_ACCOUNTS` list.

**Detection method:** User report from a non-cohort parent, internal QA check revealing Hero surfaces for an unlisted account, or override derivation logic granting access incorrectly.

**Response action:** Emergency rollback (clear all accounts from HERO_EXTERNAL_ACCOUNTS and set all flags to false). Investigate the override mechanism, check for cached stale state, and verify global flags remain off. Do not re-enable until the exposure control is confirmed isolated to the allowlist.

**Escalation target:** [TO BE ASSIGNED — access control lead]

---

## Section 6: Daily Review Checklist

Perform the following checks daily for the duration of the external cohort observation period.

- [ ] **Operator lookup per account** — Run `node scripts/hero-pA4-operator-lookup.mjs --account-id=<id>` for each cohort account. Confirm Hero surfaces present, balance within expected range, no anomalies.
- [ ] **Review telemetry for stop conditions** — Check D1 event_log row counts against expected activity. Flag any missing events or unexpected patterns.
- [ ] **Check support queue for new issues** — Review any new tickets tagged with Hero Mode. Triage using Section 1 process.
- [ ] **Verify non-cohort accounts remain hidden** — Spot-check at least one non-cohort account to confirm Hero surfaces are not visible.
- [ ] **Record daily observation in evidence template** — Add a row to the evidence file with date, operator, observations, and any issues noted. Every observation must have full provenance metadata.

---

*Support pack created 2026-04-30. References operator-lookup script (U11) and rollback procedure pattern (pA3).*
