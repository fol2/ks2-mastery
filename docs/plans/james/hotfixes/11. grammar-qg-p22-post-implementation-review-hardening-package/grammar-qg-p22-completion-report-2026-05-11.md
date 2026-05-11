# Grammar QG P22 post-implementation hardening completion report

Date: 2026-05-11

## Scope

This package applies the Grammar-only post-implementation hardening requested by the P22 review pack:

- The Grammar selection path pre-checks recent variant families before materialising candidate questions.
- The R6/P21 selection performance probe now covers both the default queue build and the priority urgent recent-family miss lane.
- P21 explanation distractors now use concept-specific alternatives instead of generic filler wording.
- The Grammar parity snapshot is updated for the deliberate P22 selection/content surface change.

No Reading, Spelling, Punctuation, Hero, D1, R2, learner-state, or deployment-authentication paths were intentionally changed.

## Repository state

- Runtime commit deployed first: `13d8851fe9a803dcf128724b996221d191b7cd5b`
- Remote branch: `origin/main`
- Production URL: `https://ks2.eugnel.uk`
- Cloudflare Worker version: `093f5d94-ae65-4ce6-9769-c6cbe84535d9`
- Content release served by live Grammar smoke: `grammar-qg-p21-2026-05-11`

## Verification evidence

All evidence is stored beside this package under `validation/final-2026-05-11/`.

| Gate | Evidence | Result |
| --- | --- | --- |
| Syntax check | `node-check-selection.log`, `node-check-content.log` | Pass |
| Targeted P22 tests | `p22-targeted-tests.log` | 8 pass, 0 fail, 2 skipped |
| Queue materialisation probe | `patched-count-create-question-calls.json` | Default calls 231, priority recent miss calls 234, threshold 1200 |
| P21 release verification | `verify-grammar-qg-p21.log` | 10 pass, 0 fail |
| P21 local repetition | `p21-local-repetition-60-final.json` | 0 violations, 0 warnings |
| Grammar content quality | `grammar-content-quality-1-3-final.json` | 1638 templates checked, 0 hard fails, 0 advisories |
| P19 smart-practice regression | `p19-smart-practice-1-3.json`, `p19-smart-practice-1-3.md` | Pass, 0 failures, 0 advisories |
| Full local test suite | `npm-test.log` | 111453 pass, 0 fail, 12 skipped |
| Production build/check | `npm-run-check.log` | Pass |
| Production deploy | `npm-run-deploy-initial.log` | Pass, Worker version `093f5d94-ae65-4ce6-9769-c6cbe84535d9` |
| Live Grammar smoke | `grammar-production-smoke-p22-initial.json` | Pass, release assertion pass, commit `13d8851fe9a803dcf128724b996221d191b7cd5b` |

The first production smoke stdout file shows the same live flow passed without JSON forwarding; `grammar-production-smoke-p22-initial-json.stdout` and `grammar-production-smoke-p22-initial.json` are the recorded JSON evidence from the corrected direct script invocation.

## Independent review status

The first Code Reviewer and Contract Auditor passes were red. Their blockers were fixed before deployment:

- The branch was rebased onto current `origin/main`, removing unrelated Reading diffs.
- The priority urgent selection lane now passes `recentVariantFamilies` into `pickTemplate`.
- The performance probe and tripwire now cover `priorityRecentMissCalls`.
- Final validation, deploy, and live smoke evidence has been recorded in this package folder.

Final Code Reviewer and Contract Auditor re-review are pending and this report will be updated with their final outcome before closure.
