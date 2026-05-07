# Completion report: Punctuation P20 real scheduler and session UI hotfix

Date: 2026-05-07

## Scope

Completed the Punctuation P20 hotfix contract in this folder for the real Smart-session scheduler and existing session input hardening.

Runtime commit deployed and smoked:

- `7d00d60c3fbda6ed38d8c9e9f49c7937f0f8f08c`
- Cloudflare Worker version: `cc529d99-0a3a-40f3-a790-989e04f893a6`
- Production origin: `https://ks2.eugnel.uk`

## Prompt-to-artifact checklist

| Requirement | Evidence |
| --- | --- |
| Complete all docs in `docs/plans/james/hotfixes/4. punctuation-p20-hotfix-recreated-20260507-v3` | This completion report is in the requested folder. Existing package README, contract, patch and validation logs remain in place. |
| Increase recent item avoidance to a 100-attempt window | `shared/punctuation/scheduler.js` uses `RECENT_ITEM_AVOIDANCE_WINDOW = 100`; regression coverage in `tests/punctuation-qg-p20-real-scheduler-heavy-play.test.js`. |
| Add explicit recent signature avoidance over a 100-attempt/session-signature window | `shared/punctuation/scheduler.js` uses `RECENT_SIGNATURE_AVOIDANCE_WINDOW = 100`; regression coverage verifies item and signature avoidance. |
| Increase same-item repeat protection to one exposure in the last 100 attempts | `SAME_ITEM_REPEAT_WINDOW = 100` and `MAX_SAME_ITEM_REPEAT_IN_WINDOW = 1`; regression coverage verifies same-item blocking. |
| Increase default candidate window from 32 to 128 | `selectPunctuationItem()` defaults `candidateWindow = 128`; regression coverage asserts 128 inspected candidates by default. |
| Prefer fresh item and fresh signature candidates before fallback | Scheduler now filters through fresh item candidates, then fresh signature candidates, before falling back to available candidates. |
| Preserve misconception retry's ability to bypass the per-session signature block | Misconception retry computes retry signatures without `selectedSignatures`; regression coverage asserts retry selection despite a matching session signature. |
| Derive mixed-review reasons from progress history when a new session has no `recentItemIds` yet | `isMixedReview()` now falls back to `deriveRecentModes(progress)` without requiring session item history; regression coverage asserts `mixed-review` from progress attempts. |
| Keep transfer/combine text boxes blank and block whitespace-only primary submit | Existing `PunctuationSessionScene.jsx` implementation is covered by `tests/punctuation-session-input-hardening.test.js`. |
| Keep prefilled insert/fix/paragraph tasks submittable | Existing input hardening gate uses trimmed typed content and preserves stem-prefilled text tasks. |
| Keep Skip available as the deliberate escape route | Existing skip control remains outside the text form and is covered by `tests/punctuation-session-input-hardening.test.js`. |
| Deterministic 50-session real-service Smart probe reaches expanded pool | `node tests/punctuation-qg-p20-real-scheduler-heavy-play.test.js` PASS; includes 300 exposures, at least 220 unique item IDs/signatures, no immediate repeats across the full probe, no within-session duplicate items/signatures, and every session has at least four modes. |
| Independent code review | Final independent code reviewer verdict: GREEN. |
| Production deployment | `npm run deploy` PASS; Worker version `cc529d99-0a3a-40f3-a790-989e04f893a6`; production bundle audit PASS. |
| Production P20 smoke evidence | `reports/punctuation/punctuation-qg-p20-production-smoke.json` regenerated from `https://ks2.eugnel.uk` with `environment=production`, `authenticatedCoverage=true`, `adminHubCoverage=true`, runtime item count `15072`, and Worker SHA `7d00d60c3fbda6ed38d8c9e9f49c7937f0f8f08c`. |
| Git sync | Runtime commit `7d00d60c3fbda6ed38d8c9e9f49c7937f0f8f08c` was pushed to `origin/main`. |

## Verification

Commands run and results:

```text
node tests/punctuation-qg-p20-real-scheduler-heavy-play.test.js
PASS: 9/9

node --test tests/punctuation-session-input-hardening.test.js tests/punctuation-scheduler.test.js
PASS: 39/39

npm test
PASS: 109166 pass, 0 fail, 12 skipped

git push origin main
pre-push npm test PASS: 109168 pass, 0 fail, 12 skipped

npm run check
PASS: Wrangler deploy dry-run and client bundle audit passed

npm run verify:punctuation-qg:p20
PASS: expansion audit, expansion report validation, live evidence validation, and P20 production evidence tests

npm run deploy
PASS: deployed Worker version cc529d99-0a3a-40f3-a790-989e04f893a6; production bundle audit passed for https://ks2.eugnel.uk/

cmd.exe /c "npm run smoke:production:punctuation -- --env production --authenticated --admin-hub --origin https://ks2.eugnel.uk --commit-sha 7d00d60c3fbda6ed38d8c9e9f49c7937f0f8f08c --worker-version-id cc529d99-0a3a-40f3-a790-989e04f893a6 --out reports/punctuation/punctuation-qg-p20-production-smoke.json"
PASS: production smoke ok=true, runtime items 15072

node scripts/validate-punctuation-qg-p20-live-evidence.mjs reports/punctuation/punctuation-qg-p20-production-smoke.json
PASS

node --test tests/punctuation-qg-p20-production-evidence.test.js
PASS: 2/2
```

## Notes

- The original package patch remains a source-package artefact for the uploaded ZIP boundary. The live repository implementation is validated by current source inspection, executable tests, deployment, and production smoke evidence rather than by reapplying the original patch over an already-integrated tree.
- The first production smoke rerun omitted `--admin-hub`; validation correctly failed. The smoke was rerun with `--admin-hub`, and validation then passed.
