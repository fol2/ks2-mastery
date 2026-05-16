# Execution evidence - 2026-05-16

Final status: `DONE — LIVE VERIFIED`.

## Source and scope

- Worktree branch: `codex/grammar-production-grade-handoff-20260516`
- Base: `c8527251c0772c92af20f0b18bec3fc572ff3b75`
- Deployed source commit: `8f32b9961728228e8dcfcd87870be12979a06fe8`
- Production build hash: `8f32b996`
- Worker Version ID: `161bb803-8dbe-4d27-8117-4c71a47fca27`
- Runtime logs: `validation/current-node-version.log`, `validation/current-npm-version.log`

Runtime changes are limited to Grammar content/tests/smoke coverage plus this handoff package. Reward, mastery, Stars, Hero Mode, monster, subject progression, and production configuration files were not changed by the fix.

## Diff summary

- `worker/src/subjects/grammar/content.js`: rewrites `qg_p18_p16_tense_aspect_fix_wrong_form` prompts to instruction-only wording, with no corrected answer after an arrow.
- `tests/grammar-qg-p20-answer-acceptance.test.js`: adds seeds `1..30` prompt-leak regression coverage and preserves `manualReviewOnly`/`nonScored` assertions.
- `tests/grammar-qg-p24-distractor-quality.test.js`: makes the render harness load dynamically so lean review environments skip only optional render-harness-dependent coverage, while full checkouts still run it.
- `scripts/audit-grammar-prompt-leak-scan.mjs`: adds the full Grammar prompt-surface leak scan for seeds `1..30`.
- `scripts/grammar-production-smoke.mjs` and `tests/grammar-production-smoke.test.js`: add live P20d prompt-leak smoke cases.
- `validation/grammar-production-hard-refresh-smoke.mjs`: adds the package-local browser hard-refresh smoke.

## Local command evidence

| Command | Evidence | Result |
| --- | --- | --- |
| `npm ci` | `validation/current-npm-ci.log` | exit `0` |
| `node --test tests/grammar-answer-spec.test.js tests/grammar-answer-spec-audit.test.js tests/grammar-qg-p20-answer-acceptance.test.js` | `validation/current-answer-spec-and-acceptance.log` | `47/47` pass |
| `node --test tests/grammar-question-generator-audit.test.js tests/grammar-qg-p20-quality-hardening.test.js tests/grammar-qg-p21-pool-expansion.test.js tests/grammar-qg-p21-local-repetition.test.js tests/grammar-qg-p24-distractor-quality.test.js tests/grammar-qg-p25-feedback-learning-cue.test.js` | `validation/current-qg-core.log` | `25/25` pass |
| `npm run audit:grammar-qg` | `validation/current-audit-grammar-qg.log` | pass; missing/invalid answer specs `[]` |
| `npm run audit:grammar-qg:deep` | `validation/current-audit-grammar-qg-deep.log` | pass; low-depth generated templates `[]` |
| `npm run audit:grammar-qg:p20-quality` | `validation/current-audit-p20-quality.log`, `validation/current-grammar-qg-p20-quality-hardening.json` | pass |
| `npm run audit:grammar-qg:open-response-fairness` | `validation/current-audit-open-response-fairness.log`, `validation/current-grammar-qg-p20-open-response-fairness.json` | pass; `0` findings |
| `npm run audit:grammar-qg:p21-local-repetition` | `validation/current-audit-p21-local-repetition.log`, `validation/current-grammar-qg-p21-local-repetition.json` | pass; exit `0` |
| `node scripts/audit-grammar-prompt-leak-scan.mjs --seeds=1..30 ...` | `validation/current-prompt-leak-scan.log`, `validation/grammar-prompt-leak-scan-2026-05-16.json` | `items=16380`, `arrows=30`, `blockers=0` |
| `node --test tests/grammar-rewards.test.js tests/grammar-monster-roster.test.js tests/grammar-concordium-invariant.test.js tests/grammar-phase5-invariants.test.js tests/grammar-star-trust-contract.test.js tests/grammar-star-events.test.js tests/grammar-ui-model.test.js` | `validation/current-adjacent-reward-monster-ui.log` | `288/288` pass |
| `node --test tests/grammar-production-smoke.test.js tests/grammar-qg-p20-answer-acceptance.test.js` | `validation/current-production-smoke-and-p20d-tests.log` | `32/32` pass |
| `npm test` | `validation/current-npm-test-final-summary.log` | exit `0` |
| `npm run check` | `validation/current-npm-run-check-final.log` | exit `0`; dry-run build/check passed |

Large raw `npm test` logs were not committed because the runner streams verbose spec output. The retained artefact records the final exit code, and targeted logs above retain detailed TAP counts for the Grammar and adjacent surfaces.

## Answer-spec and fairness proof

- `npm run audit:grammar-qg` reports `templateCount=546`.
- Answer spec kind counts: `exact=270`, `manualReviewOnly=157`, `multiField=56`, `normalisedText=12`, `punctuationPattern=20`.
- `templatesMissingAnswerSpecs=[]`.
- `invalidAnswerSpecs=[]`.
- Constructed-response answer-spec coverage is complete.
- P20c hyphen/dash production smoke still accepts hyphens for hyphen tasks and rejects en/em dash substitutions for those hyphen tasks.
- P20b dash-label cases still accept dash marks only when the target answer is a dash label.

## Production deployment and live smoke

Deployment:

- Command: `npm run deploy`
- Evidence: `validation/production-deploy-2026-05-16.log`
- Worker Version ID: `161bb803-8dbe-4d27-8117-4c71a47fca27`
- Production bundle audit: pass for `https://ks2.eugnel.uk/`

Grammar production smoke:

- Command: `node scripts/grammar-production-smoke.mjs --json --evidence-origin=post-deploy --out=...`
- Evidence: `validation/production-grammar-smoke-2026-05-16.json`
- Result: `ok=true`
- Release: `grammar-qg-p21-2026-05-11`
- Commit SHA: `8f32b9961728228e8dcfcd87870be12979a06fe8`
- Covered answer spec families: `exact`, `multiField`, `punctuationPattern`, `manualReviewOnly`
- P20d prompt-leak cases: `5/5` safe; all `manualReviewOnly=true` and `nonScored=true`

Browser hard-refresh smoke:

- Command: `node validation/grammar-production-hard-refresh-smoke.mjs --origin=https://ks2.eugnel.uk ...`
- Evidence: `validation/production-grammar-hard-refresh-2026-05-16.json`
- Screenshot: `validation/production-grammar-hard-refresh-2026-05-16.png`
- Result: `ok=true`
- Journey: open `/demo`, open Grammar, start a round, hard reload while the active item is visible, submit after reload, observe feedback
- Console errors: `[]`
- Page errors: `[]`
- Request failures: `[]`
- HTTP failures: `[]`

## Reviewer outputs

- Code Reviewer: `evidence/code-reviewer-final-2026-05-16.md`
- Contract Auditor: `evidence/contract-auditor-final-2026-05-16.md`
