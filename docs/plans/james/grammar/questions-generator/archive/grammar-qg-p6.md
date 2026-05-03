---
title: "Grammar QG P6 — Learner Calibration and Telemetry"
type: implementation-brief
status: proposed
subject: grammar
programme: grammar-question-generator
follows: docs/plans/james/grammar/questions-generator/grammar-qg-p5-final-completion-report-2026-04-28.md
recommendedContentReleaseId: grammar-qg-p6-2026-04-29
language: en-GB
---

# Grammar QG P6 — Learner Calibration and Telemetry

## 1. Purpose

Grammar QG P1–P5 moved the Grammar question generator from a reviewed legacy pool into a deterministic, audited, answer-spec governed, mixed-transfer capable, machine-verifiable release process.

P6 must move the programme from **release correctness** into **learner calibration**.

The aim is not to add a larger headline question denominator. The aim is to prove, using real learner evidence, which templates are helping, which templates are too easy, too hard, ambiguous, over-rewarding, under-explained, or ready for retirement or expansion.

P6 should leave Grammar QG with:

- learner-safe telemetry for template, concept, and mixed-transfer health;
- a first calibration dashboard or report for adults/internal QA;
- shadow mastery analysis for multi-concept and post-secure practice;
- cleaned-up P5 residual advisories;
- a stricter release gate that validates the actual completion report, not only mock reports;
- no change to reward, Star, Mega, monster, Concordium, or subject mastery semantics unless a separate reviewed plan explicitly approves it.

## 2. Current state after P5

The current P5 release is `grammar-qg-p5-2026-04-28`.

The expected P5 denominator is:

| Measure | P5 value |
|---|---:|
| Concepts | 18 |
| Templates | 78 |
| Selected-response templates | 58 |
| Constructed-response templates | 20 |
| Generated templates | 52 |
| Fixed templates | 26 |
| Answer-spec templates | 47 |
| Constructed-response answer-spec templates | 20 / 20 |
| Legacy constructed-response adapters | 0 |
| Manual-review-only templates | 4 |
| Explanation templates | 17 |
| Concepts with explanation coverage | 18 / 18 |
| Mixed-transfer templates | 8 |
| Concepts with mixed-transfer coverage | 18 / 18 |
| Default-window repeated generated variants | 0 |
| Cross-template signature collisions | 0 |
| Deep low-depth families | 0 |

P6 should preserve this denominator unless a content correction forces a release bump. P6 is allowed to change wording, feedback, tags, metadata, telemetry, reports, and validation logic. It should not add new template IDs by default.

## 3. P5 validation findings to carry into P6

P5 is materially complete, but P6 should begin by closing the following governance and content-quality gaps.

### 3.1 Strict-tag audit gap

P5 expanded 12 low-depth families and tagged them `qg-p5`. The P5 depth test verifies that the expanded families have the `qg-p5` tag and at least 8 unique variants over seeds 1..30.

However, the main `buildSignatureAudit()` strict-tag list still checks only `qg-p1`, `qg-p3`, and `qg-p4` tags. It does not currently treat `qg-p5` as strict.

P6 must fix this by replacing the hard-coded list with a rule such as:

```js
const strictVariantTemplate = (template.tags || []).some((tag) => /^qg-p\d+$/.test(tag));
```

or by explicitly adding `qg-p5` and testing that future `qg-pN` tags are not missed again.

### 3.2 Actual final-report validation gap

P5 added `validate-grammar-qg-completion-report.mjs` and tests for mock reports. That is useful, but `verify:grammar-qg` does not yet appear to validate the actual final completion report markdown file as part of the release gate.

P6 must make the real report file a release-gate input, for example:

```bash
node scripts/validate-grammar-qg-completion-report.mjs \
  docs/plans/james/grammar/questions-generator/grammar-qg-p6-final-completion-report-YYYY-MM-DD.md
```

The validator must fail if the report claims any number that does not match live audit output, or if it claims post-deploy production smoke without a matching evidence artefact.

### 3.3 Implementation commit metadata gap

The P5 final report lists `implementation_merge_commit: e1a2bf4`. That commit appears to be a post-merge fixture repair commit, not the merge commit for the full implementation sequence.

P6 reports should distinguish:

- `implementation_prs`: the merged PR list;
- `final_content_release_commit`: the commit containing the release id and final fixture state;
- `post_merge_fix_commits`: any corrective commits after merge;
- `final_report_commit`: the commit that adds or updates the final report.

Do not compress all of these into one ambiguous `implementation_merge_commit` field.

### 3.4 Production smoke evidence gap

P5 added structured production-smoke evidence capture, but the P5 final report correctly says post-deploy production smoke was not run.

P6 must keep this distinction strict:

- repository tests prove repository behaviour;
- local smoke proves the local configured environment only;
- post-deploy smoke proves the deployed Cloudflare Worker only when the evidence file exists and names the deployed origin.

The completion-report validator must continue to reject unsupported post-deploy claims.

### 3.5 Content-quality advisories remain

P5 content-quality audit has zero hard failures but 27 advisories:

- 24 transfer-feedback incomplete advisories across P4 mixed-transfer templates;
- 3 reversed-curly-quote advisories in `proc2_modal_choice`.

P6 should clear these advisories rather than carry them forever. Mixed-transfer feedback should explicitly name both or all grammar concepts involved, in child-friendly wording.

### 3.6 Reviewer sample-pack usability gap

The P5 reviewer sample pack exists and is useful, but several stripped stems concatenate the instruction and the sentence without a visible space or line break. For example, review text can appear as `Rewrite the sentence with a colon in the correct place.For the picnic...`.

P6 should improve the review-pack renderer so that human reviewers see readable learner-facing prompts. This is not necessarily a production UI bug, but it weakens manual review.

## 4. Non-negotiable constraints

P6 must not use AI to generate production questions.

P6 must not mark free writing with AI.

P6 must not change Star, Mega, monster, Concordium, or reward semantics.

P6 must not silently change Grammar mastery thresholds.

P6 must not count manual-review-only items towards mastery or rewards.

P6 must not leak answer keys, `answerSpec`, `golden`, `nearMiss`, `accepted`, `variantSignature`, `generatorFamilyId`, raw learner responses, or internal telemetry into learner-facing read models.

P6 must not introduce a seventh subject, Hero Mode dependency, or cross-subject reward dependency.

P6 must keep deterministic generation as the production contract.

## 5. Implementation units

### U0. P5 governance repair pre-flight

Before learner calibration work starts, fix the P5 governance gaps.

Deliverables:

- Treat `qg-p5` templates as strict in the main signature audit.
- Prefer a future-proof strict-tag predicate over a hard-coded phase list.
- Add a test that fails if a `qg-pN` tag is ignored by strict repeat detection.
- Add CLI validation of the actual P6 final report into the release gate.
- Update report frontmatter conventions so implementation PRs, final release commit, post-merge fixes, and final-report commit are separate fields.
- Add a real synthetic-failure test for content-quality hard-fail rules, especially unknown misconception IDs and duplicate options.

Acceptance criteria:

- `npm run verify:grammar-qg` or `npm run verify:grammar-qg-p6` fails if a `qg-p5` repeated variant appears in the default strict window.
- The real final report file is validated by script, not only a mock report in tests.
- A synthetic malformed template or audit override proves hard-fail lint behaviour.

### U1. Learner-safe telemetry schema

Add telemetry that allows template and concept calibration without exposing private learner data or answer keys.

Capture, at minimum, these internal fields for score-bearing attempts:

| Field | Purpose |
|---|---|
| `contentReleaseId` | Separate P5/P6 and later release behaviour |
| `templateId` | Template-level health analysis |
| `generatorFamilyId` | Family-level health and repetition analysis |
| `variantSignature` | Repetition and visible-variant health |
| `questionType` | Identify weak response surfaces |
| `skillIds` | Concept-level calibration |
| `tags` | Track `mixed-transfer`, `qg-pN`, `surgery`, etc. |
| `answerSpecKind` | Compare marking families |
| `mode` / `sessionKind` | Smart practice, trouble, surgery, mini-test, etc. |
| `supportLevel` | Separate independent evidence from supported evidence |
| `attemptNumber` | First attempt vs retries |
| `correct` | Outcome |
| `score` / `maxScore` | Partial-credit analysis |
| `elapsedMsBucket` | Too-fast / stuck / normal timing, bucketed only |
| `wasRetry` | Retry-loop effectiveness |
| `conceptStatusBefore` | Secure/due/weak/lapsed context |
| `conceptStatusAfter` | Immediate effect on concept state |
| `manualReviewOnly` / `nonScored` | Exclude from mastery calibration |

Do not persist raw long-form constructed responses in analytics aggregates. Where response retention is required for session history, keep existing bounded-response safeguards and do not include raw responses in aggregate telemetry exports.

Acceptance criteria:

- Internal events or aggregates include enough data to compute template health.
- Learner-facing read models remain clean under the existing forbidden-key oracle.
- Manual-review-only attempts are included only as engagement/activity telemetry, not score or mastery evidence.

### U2. Template and concept health aggregation

Build an internal Grammar QG health report or read model. This can start as a script-generated JSON/Markdown report before becoming UI.

Required aggregate windows:

- 7 days;
- 28 days;
- 90 days;
- all-time for the current content release.

Required health metrics per template/family:

| Metric | Use |
|---|---|
| Attempt count | Avoid acting on tiny samples |
| Independent first-attempt success rate | Main quality signal |
| Supported success rate | Detect support dependency |
| Wrong-after-support rate | Detect confusing templates |
| Median elapsed bucket | Detect too-easy, too-hard, or too-fast behaviour |
| Retry success rate | Detect recoverable vs persistent misconceptions |
| Partial-credit distribution | Especially for `multiField` templates |
| Skip/empty-answer rate | Detect unclear inputs or UX issues |
| Recent repeat frequency | Detect scheduler repetition problems |
| Confidence delta | Detect whether template improves concept confidence |

Required health metrics per concept:

- local-practice success rate;
- mixed-transfer success rate;
- explanation success rate;
- surgery/fix success rate;
- retained-after-secure success rate;
- lapse-after-secure rate;
- weak-to-secure recovery rate;
- average templates contributing to secure evidence.

Acceptance criteria:

- Report can identify the worst 10 templates by independent first-attempt success rate, provided minimum sample size is met.
- Report can identify templates with high support dependency.
- Report can separate mixed-transfer from concept-local practice.
- Report can show whether secure concepts stay retained over time.

### U3. Mixed-transfer calibration in shadow mode

P4 introduced 8 mixed-transfer templates covering all 18 concepts. P6 must measure whether these templates behave like appropriate higher-order evidence or whether they inflate multiple concept nodes too quickly.

P6 must not immediately change mastery scoring. Start with shadow analysis only.

Compute, for each mixed-transfer template:

- success rate compared with its concept-local templates;
- support-level distribution;
- partial-credit distribution for `multiField` mixed-transfer templates;
- concept propagation effects: how many concept nodes improve from one attempt;
- whether correct mixed-transfer answers predict later local retention;
- whether local secure status predicts mixed-transfer success;
- whether mixed-transfer misses reveal specific concept pair weaknesses.

Add a shadow evidence model with labels such as:

```ts
mixedTransferEvidence: {
  localPrerequisitesMet: boolean,
  transferCorrect: boolean,
  suggestedEvidenceWeight: 'none' | 'light' | 'normal' | 'strong',
  reason: 'not-secure-locally' | 'independent-transfer' | 'supported-transfer' | 'partial-transfer'
}
```

This must be analytics-only in P6.

Acceptance criteria:

- No production mastery mutation changes in P6.
- Shadow report shows how mixed-transfer evidence would differ from current scoring.
- P6 final report recommends whether P7 should keep, reduce, or strengthen mixed-transfer mastery weight.

### U4. Retention-after-secure and post-Mega monitoring

Grammar QG needs to know whether secure learning remains secure. P6 should add monitoring for concepts that were previously secure/Mega-adjacent and later become weak, due, or error-prone.

Track:

- secure concept due checks;
- retained-after-secure pass rate;
- lapsed-after-secure rate;
- number of days from secure to first lapse;
- post-Mega maintenance attempts;
- whether mixed review protects secure concepts better than local repetition.

Do not revoke Mega or downgrade Star displays in P6.

Acceptance criteria:

- Internal report can list secure concepts due for maintenance.
- Internal report can show retention-after-secure pass rate by concept and by question type.
- No learner-facing demotion copy is introduced.

### U5. Resolve P5 content advisories

Clear the 27 P5 content-quality advisories.

Tasks:

- Fix the 3 reversed-curly-quote advisories in `proc2_modal_choice`.
- Rewrite feedback for all 8 P4 mixed-transfer templates so every seed explains the relationship between both/all tested concepts.
- Keep wording child-friendly and concise.
- Regenerate the reviewer sample pack.
- Ensure content-quality advisories drop to 0, or document any remaining advisory with a named allowlist and rationale.

Mixed-transfer feedback should avoid generic text like “apply both grammar concepts”. It should name the actual ideas, for example:

> This uses direct speech punctuation and sentence function together: the spoken words are a command, but the whole reporting sentence is a question, so the question mark belongs outside the closing speech marks.

Acceptance criteria:

- `audit-grammar-content-quality.mjs` reports 0 hard failures.
- P6 target should be 0 advisories. If any advisory remains, it must be intentionally allowlisted in the final report.
- P4/P5 denominators remain unchanged unless a deliberate content-release bump is recorded.

### U6. Reviewer sample-pack hardening

The reviewer pack should become a reliable human QA artefact.

Tasks:

- Preserve paragraph breaks when stripping HTML.
- Add spaces or newlines between instruction, example, and input description.
- Add optional `--family` and `--template` filters for targeted review.
- Add `--max-samples` and `--seed-window` options.
- Add a generated summary table with family, template, concept, answerSpec kind, unique variants, and advisory count.
- Add a test or snapshot check that the prompt section does not contain answer keys.

Acceptance criteria:

- Reviewer sample prompts are readable in Markdown.
- Answer keys remain confined to the answer appendix.
- The generator is deterministic for the same commit and seed window.
- Generated review artefacts name the content release and commit SHA.

### U7. Template triage recommendations

P6 should output recommendations, not silently mutate content.

Introduce template health classifications:

| Classification | Meaning | Possible action |
|---|---|---|
| `healthy` | Normal success and timing | Keep |
| `too_easy` | Very high independent success and very fast timing | Use less often or reserve for warm-up |
| `too_hard` | Low independent success, high support use | Improve hint, split skill, or lower placement |
| `ambiguous` | High wrong rate across strong learners | Review item wording/distractors |
| `support_dependent` | High success only after support | Improve teaching bridge |
| `retry_effective` | Learners recover after feedback | Keep as repair candidate |
| `retry_ineffective` | Learners keep missing after feedback | Rewrite or retire |
| `transfer_gap` | Local success high, mixed-transfer low | Add bridge practice |
| `retention_gap` | Secure learners later lapse | Increase spaced maintenance |

Acceptance criteria:

- P6 report lists top recommendations by evidence strength.
- Recommendations include sample size and confidence level.
- No template is retired automatically in P6.

### U8. P6 final report and release gate

P6 final report must be machine-verifiable.

Required final report sections:

- shipped denominator;
- validation command output;
- content-quality audit output;
- actual final-report validator output;
- production smoke status with evidence distinction;
- telemetry schema shipped;
- template health report sample;
- mixed-transfer calibration findings;
- retention-after-secure findings;
- remaining risks;
- explicit statement of unchanged reward/mastery semantics.

Required final report frontmatter:

```yaml
contentReleaseId: grammar-qg-p6-YYYY-MM-DD
implementation_prs:
  - https://github.com/fol2/ks2-mastery/pull/...
final_content_release_commit: <sha>
post_merge_fix_commits:
  - <sha if any>
final_report_commit: <sha if known>
post_deploy_smoke: not-run | passed
post_deploy_smoke_evidence: reports/grammar/...
```

Acceptance criteria:

- The actual P6 final report file passes `validate-grammar-qg-completion-report.mjs`.
- If post-deploy smoke is claimed as passed, an evidence file exists and is checked.
- If post-deploy smoke is not run, the report says so plainly.

## 6. Suggested verification command

Either extend `verify:grammar-qg` or add `verify:grammar-qg-p6`.

A P6 gate should include at least:

```bash
npm run audit:grammar-qg
npm run audit:grammar-qg:deep
node scripts/audit-grammar-content-quality.mjs --seeds=1,2,3,4,5,6,7,8,9,10
node --test \
  tests/grammar-question-generator-audit.test.js \
  tests/grammar-qg-p5-depth.test.js \
  tests/grammar-qg-p5-content-quality.test.js \
  tests/grammar-qg-p5-report-validation.test.js \
  tests/grammar-qg-p6-telemetry.test.js \
  tests/grammar-qg-p6-mixed-transfer-calibration.test.js \
  tests/grammar-qg-p6-retention.test.js \
  tests/grammar-functionality-completeness.test.js \
  tests/grammar-production-smoke.test.js \
  tests/grammar-selection.test.js \
  tests/grammar-engine.test.js
node scripts/generate-grammar-review-pack.mjs
node scripts/validate-grammar-qg-completion-report.mjs \
  docs/plans/james/grammar/questions-generator/grammar-qg-p6-final-completion-report-YYYY-MM-DD.md
```

If the release includes content wording changes, bump the content release id and regenerate the P6 baseline fixtures.

## 7. Expected denominator after P6

Unless P6 deliberately adds new templates, the expected denominator remains:

| Measure | Expected P6 value |
|---|---:|
| Concepts | 18 |
| Templates | 78 |
| Selected-response templates | 58 |
| Constructed-response templates | 20 |
| Generated templates | 52 |
| Fixed templates | 26 |
| Answer-spec templates | 47 |
| CR answer-spec templates | 20 / 20 |
| Manual-review-only templates | 4 |
| Explanation templates | 17 |
| Mixed-transfer templates | 8 |
| Deep low-depth families | 0 |

If feedback wording changes but template ids do not change, the denominator should stay the same. The content release id should still be bumped if learner-facing content changes.

## 8. P6 success definition

P6 is successful when the team can answer these questions with evidence:

1. Which Grammar templates are healthy?
2. Which templates are too easy, too hard, ambiguous, or support-dependent?
3. Which mixed-transfer templates are genuinely measuring transfer rather than over-inflating multiple concepts?
4. Which secure concepts are retained after time has passed?
5. Which content families should be expanded, rewritten, or retired in P7?
6. Can the final report be validated directly against live audit output?
7. Did the release avoid reward, Star, Mega, monster, Concordium, and mastery semantic changes?

The strongest P6 outcome is not a larger question count. The strongest outcome is a trustworthy calibration loop: deterministic questions, honest marking, machine-verifiable release evidence, learner-safe telemetry, and clear recommendations for the next content or mastery phase.
