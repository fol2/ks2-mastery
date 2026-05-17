# Validation summary

## Verdict

Status: `DONE — LIVE VERIFIED`.

The Grammar production-grade handoff package has been ported to the Git worktree, deployed to `https://ks2.eugnel.uk`, and live-verified after a browser hard refresh. The learner-facing prompt leak in `qg_p18_p16_tense_aspect_fix_wrong_form` is fixed, and the family remains `manualReviewOnly` and `nonScored`.

No reward, mastery, Stars, Hero Mode, monster, subject progression, or production configuration files were changed by the runtime fix.

## Patch status

Patch file retained for package traceability:

- `patches/001-grammar-tense-prompt-leak.patch`

Implementation source:

- Base: `c8527251c0772c92af20f0b18bec3fc572ff3b75`
- Deployed source commit: `8f32b9961728228e8dcfcd87870be12979a06fe8`
- Branch: `codex/grammar-production-grade-handoff-20260516`

The original package patch was ported to the full Git checkout because Windows did not provide a `patch` binary. The committed implementation matches the intended patch behaviour and adds wider production smoke coverage.

## Learner-facing blocker fixed

The baseline blocker was an answer-leaking prompt for `qg_p18_p16_tense_aspect_fix_wrong_form`, where a fix task exposed the corrected sentence after an arrow.

The committed prompt now uses instruction-only wording, for example:

```text
Fix this sentence so it uses the present perfect: I finish my homework.
```

Regression coverage checks seeds `1..30` for this family and proves:

- no `→` or `->` answer-leak prompt remains in the family;
- corrected answer fragments are not serialised into the learner prompt;
- the generated item stays `manualReviewOnly: true`;
- the generated item stays `nonScored: true`.

## Prompt leak scan

Command:

```bash
node scripts/audit-grammar-prompt-leak-scan.mjs --seeds=1..30 --out="docs/plans/james/hotfixes/25. grammar-production-grade-handoff-package/validation/grammar-prompt-leak-scan-2026-05-16.json"
```

Result:

- `items=16380`
- `arrows=30`
- `blockers=0`

The remaining arrow prompts are reviewed active/passive explanation transformations, not hidden answer leaks in fix/rewrite/fill tasks.

Evidence:

- `validation/current-prompt-leak-scan.log`
- `validation/grammar-prompt-leak-scan-2026-05-16.json`

## Local verification

Passed:

```bash
npm ci
node --test tests/grammar-answer-spec.test.js tests/grammar-answer-spec-audit.test.js tests/grammar-qg-p20-answer-acceptance.test.js
node --test tests/grammar-question-generator-audit.test.js tests/grammar-qg-p20-quality-hardening.test.js tests/grammar-qg-p21-pool-expansion.test.js tests/grammar-qg-p21-local-repetition.test.js tests/grammar-qg-p24-distractor-quality.test.js tests/grammar-qg-p25-feedback-learning-cue.test.js
npm run audit:grammar-qg
npm run audit:grammar-qg:deep
npm run audit:grammar-qg:p20-quality
npm run audit:grammar-qg:open-response-fairness
npm run audit:grammar-qg:p21-local-repetition
node --test tests/grammar-rewards.test.js tests/grammar-monster-roster.test.js tests/grammar-concordium-invariant.test.js tests/grammar-phase5-invariants.test.js tests/grammar-star-trust-contract.test.js tests/grammar-star-events.test.js tests/grammar-ui-model.test.js
node --test tests/grammar-production-smoke.test.js tests/grammar-qg-p20-answer-acceptance.test.js
npm test
npm run check
```

Observed counts and results:

- Answer-spec and P20 acceptance: `47/47` pass.
- Core Grammar QG tests: `25/25` pass.
- Adjacent reward/monster/UI tests: `288/288` pass.
- Production-smoke unit and P20d regression tests: `32/32` pass.
- `npm test`: exit code `0`.
- `npm run check`: exit code `0`, dry-run build/check passed.
- `npm run audit:grammar-qg:p21-local-repetition`: pass and exited `0`.

Evidence files are under `validation/` and summarised in `evidence/execution-evidence-2026-05-16.md`.

## Production verification

Deployment command:

```bash
npm run deploy
```

Production result:

- URL: `https://ks2.eugnel.uk`
- Worker Version ID: `161bb803-8dbe-4d27-8117-4c71a47fca27`
- Build hash: `8f32b996`
- Production bundle audit: pass.
- Grammar API smoke: pass, including P20d prompt-leak cases.
- Browser hard-refresh smoke: pass, with no console errors, page errors, request failures, or HTTP failures.

Evidence:

- `validation/production-deploy-2026-05-16.log`
- `validation/production-grammar-smoke-2026-05-16.json`
- `validation/production-grammar-smoke-2026-05-16.log`
- `validation/production-grammar-hard-refresh-2026-05-16.json`
- `validation/production-grammar-hard-refresh-2026-05-16.log`
- `validation/production-grammar-hard-refresh-2026-05-16.png`

## Reviewer loop

Both required final review outputs are present:

- Code Reviewer: `PASS — no blockers, no advisories, findings=[]`
- Contract Auditor: `PASS — no blockers, no advisories, findings=[]`

Evidence:

- `evidence/code-reviewer-final-2026-05-16.md`
- `evidence/contract-auditor-final-2026-05-16.md`

## Files changed by implementation

- `worker/src/subjects/grammar/content.js`
- `tests/grammar-qg-p20-answer-acceptance.test.js`
- `tests/grammar-qg-p24-distractor-quality.test.js`
- `tests/grammar-production-smoke.test.js`
- `scripts/audit-grammar-prompt-leak-scan.mjs`
- `scripts/grammar-production-smoke.mjs`
- `docs/plans/james/hotfixes/25. grammar-production-grade-handoff-package/**`
