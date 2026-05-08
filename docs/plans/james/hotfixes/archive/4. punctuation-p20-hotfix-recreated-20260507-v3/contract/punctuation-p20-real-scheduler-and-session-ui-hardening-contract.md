# Contract: Punctuation P20 real scheduler and session UI hardening

## Problem

The P20 expanded Punctuation content pool is present, but the real `createPunctuationService()` Smart-session route can still feel repetitive because the scheduler's reachable candidate slice and recent-exposure memory are too narrow for the enlarged generated pool.

A smaller learner-facing issue also exists in text tasks: transfer/combine answer boxes start blank but the primary submit button can still be active, allowing accidental blank submission. Skip should remain the deliberate escape route; blank submit should not be the default mistake path.

## Patch contract

The scheduler patch must:

- increase recent item avoidance from a short session-scale window to a 100-attempt window;
- add explicit recent signature avoidance over a 100-attempt/session-signature window;
- increase same-item repeat protection to one exposure in the last 100 attempts;
- increase the default candidate window from 32 to 128;
- prefer fresh item and fresh signature candidates before falling back;
- preserve misconception-retry's ability to bypass the per-session signature block;
- derive mixed-review reasons from progress history when a new session has no `recentItemIds` yet.

The UI patch must:

- keep transfer/combine text boxes blank at first render;
- disable primary submit while the typed answer is whitespace-only;
- keep prefilled insert/fix/paragraph tasks submittable when the editable stem already contains meaningful text;
- keep Skip available as the intentional escape route.

## Acceptance commands

```bash
git apply --check patches/001-punctuation-p20-real-scheduler-and-session-ui-hardening.patch
git apply patches/001-punctuation-p20-real-scheduler-and-session-ui-hardening.patch
node tests/punctuation-qg-p20-real-scheduler-heavy-play.test.js
node --test tests/punctuation-session-input-hardening.test.js tests/punctuation-scheduler.test.js
node scripts/audit-punctuation-qg-p20-expansion.mjs --out reports/punctuation/punctuation-qg-p20-expansion-audit.json
node scripts/validate-punctuation-qg-p20-live-evidence.mjs reports/punctuation/punctuation-qg-p20-production-smoke.json
node --test tests/punctuation-qg-p20-production-evidence.test.js
```

## Expected evidence

For the deterministic 50-session real-service Smart probe, the patched service must surface at least 220 unique item IDs and at least 220 unique signatures across 300 exposures, with zero immediate repeats and no within-session duplicate items/signatures.

The recreated validation run produced:

- baseline real-service unique items/signatures: 157 / 157;
- patched real-service unique items/signatures: 262 / 262;
- immediate repeats: 0;
- sessions with within-session duplicate items: 0;
- sessions with within-session duplicate signatures: 0;
- sessions with fewer than four modes: 0.

## Evidence boundary

The validation uses the uploaded lean ZIP as the source snapshot. The live-evidence command validates the stored P20 production-smoke evidence inside the ZIP; it is not an independent live production query.

## Rollback

Revert this patch or restore the four touched files from the source ZIP. No data migration is required.
