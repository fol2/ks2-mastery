---
title: "Grammar QG P5 plan"
type: phase-plan
status: proposed
subject: grammar
phase: qg-p5
previous_release: grammar-qg-p4-2026-04-28
proposed_content_release_id: grammar-qg-p5-2026-04-28
owner: james
language: en-GB
---

# Grammar QG P5 — Release Automation, Deep-Seed Hardening and Machine-Verifiable Governance

## 1. Current position

Grammar QG P4 is the current completed Grammar question-generator release. It shipped the first mixed-transfer layer and preserved the P1–P3 foundations:

- 18 Grammar concepts.
- 78 templates.
- 58 selected-response templates.
- 20 constructed-response templates.
- 52 generated templates.
- 26 fixed templates.
- 47 answer-spec templates.
- 20 / 20 constructed-response templates governed by explicit answer specs.
- 4 manual-review-only templates.
- 17 explanation templates.
- 18 / 18 concepts with explanation coverage.
- 8 mixed-transfer templates.
- 18 / 18 concepts with mixed-transfer coverage.
- 0 thin-pool concepts.
- 0 single-question-type concepts.
- 0 default-window repeated generated variants.

P4 was a quality release, not a volume release. P5 should continue that pattern. Do not add new template families unless the release gate work below proves a content gap that cannot be solved by expanding existing reviewed case banks.

## 2. P5 objective

P5 should make Grammar QG releases difficult to mis-state, easy to verify, and safer to deploy.

The core P5 objective is:

> Convert Grammar QG from a manually interpreted content release into a machine-verifiable release process, while eliminating the known deep-seed low-depth generated families and tightening content-quality linting.

P5 is not a reward, UI, mastery, or runtime-AI phase. It must not change Star, Mega, monster, mastery, or learner reward semantics.

## 3. Scope boundaries

### In scope

- Grammar QG audit automation.
- Deep-seed generated-family expansion.
- Machine-verifiable denominator governance.
- Production-smoke release evidence.
- Content-quality linting for deterministic templates.
- Misconception registry validation.
- P5 fixture updates and completion-report validation.

### Out of scope

- Runtime AI question generation.
- AI marking for free-text Grammar answers.
- New learner-facing reward mechanics.
- Changes to Star, Mega, monster, or Concordium semantics.
- Broad UX redesign.
- New Grammar subject modes unless required for release validation.
- Expanding the template denominator for its own sake.

## 4. Known gaps entering P5

### 4.1 Post-deploy production smoke is still an operational step

The repository has Grammar production-smoke coverage and a `smoke:production:grammar` script, but the P4 final report records repository smoke only. Post-deploy production smoke was not run as part of the P4 completion report.

P5 must turn this into explicit release evidence. If the project does not want post-deploy smoke to run automatically inside `npm run deploy`, then P5 must still require a machine-readable post-deploy smoke artefact before the final completion report can claim production validation.

### 4.2 Deep-seed low-depth families remain

P4 eliminated repeated variants in the default seed window `[1, 2, 3]`, but P4 deep analysis still identified generated families with fewer than 8 unique prompts across seeds 1..30.

P5 should expand or explicitly govern these families:

| Family | P4 deep unique prompts / 30 seeds | P5 target |
|---|---:|---:|
| `qg_active_passive_choice` | 3 | >= 8 |
| `qg_formality_classify_table` | 3 | >= 8 |
| `qg_pronoun_referent_identify` | 3 | >= 8 |
| `proc_hyphen_ambiguity_choice` | 4 | >= 8 |
| `proc3_hyphen_fix_meaning` | 4 | >= 8 |
| `proc3_parenthesis_commas_fix` | 4 | >= 8 |
| `proc2_formality_choice` | 5 | >= 8 |
| `proc_colon_list_fix` | 6 | >= 8 |
| `proc_dash_boundary_fix` | 6 | >= 8 |
| `proc2_modal_choice` | 6 | >= 8 |
| `proc3_word_class_contrast_choice` | 6 | >= 8 |
| `proc_semicolon_choice` | 7 | >= 8 |

The preferred P5 outcome is `lowDepthGeneratedTemplates: []` under the 30-seed deep audit. If a family is intentionally kept below 8, it must be added to a named allowlist with a written educational reason and a retirement/expansion date. Do not silently leave it as an advisory warning.

### 4.3 Content polish issues need a deterministic lint gate

P4 improved content quality, but P5 should add a lightweight content-quality audit to prevent small errors from reaching release reports.

The audit should check at least:

- All `misconception` ids used by generated cases or answer specs exist in `GRAMMAR_MISCONCEPTIONS`.
- Curly quotation marks are balanced and not obviously reversed in learner-facing feedback.
- No `-ly` adverb is hyphenated before an adjective or participle.
- Hyphen items genuinely test ambiguity or KS2-relevant hyphen conventions, not merely optional style.
- Punctuation examples do not require a contested style answer unless the feedback explains the convention.
- Every choice item has exactly one correct answer path.
- Every distractor is plausible, grammatically related, and not accidentally correct.
- Every P4/P5 transfer item names both grammar ideas in feedback or solution lines.

Known items to review during P5:

- The P4 mixed possession/hyphen family uses a transfer-specific misconception id in at least one case. Confirm it is registered or replace it with an existing misconception id such as `apostrophe_possession_confusion` or `hyphen_ambiguity_confusion`.
- Review colour-compound hyphen examples such as `bright-orange`. They may be defensible in some style contexts, but they are weaker as “hyphen to avoid ambiguity” examples than cases such as `well-known`, `long-awaited`, `man-eating`, `small-animal`, `state-of-the-art`, or `hard-earned`.
- Review learner-facing feedback strings where a closing curly apostrophe appears to open a quoted word, for example `’Must’`. Prefer balanced UK-style quotation marks or plain apostrophes consistently.

## 5. Expected P5 denominator

P5 should normally keep the template denominator unchanged.

| Measure | P4 final | P5 target |
|---|---:|---:|
| Concepts | 18 | 18 |
| Templates | 78 | 78 |
| Selected-response templates | 58 | 58 |
| Constructed-response templates | 20 | 20 |
| Generated templates | 52 | 52 |
| Fixed templates | 26 | 26 |
| Answer-spec templates | 47 | 47 |
| Constructed-response answer-spec templates | 20 / 20 | 20 / 20 |
| Legacy constructed-response adapters | 0 | 0 |
| Manual-review-only templates | 4 | 4 |
| Explanation templates | 17 | 17 |
| Concepts with explanation coverage | 18 / 18 | 18 / 18 |
| Mixed-transfer templates | 8 | 8 |
| Concepts with mixed-transfer coverage | 18 / 18 | 18 / 18 |
| Default-window repeated variants | 0 | 0 |
| Deep low-depth generated families | 12 | 0, unless explicitly allowlisted |

If implementation increases the denominator, the completion report must state why P5 changed from hardening to expansion and must include machine-generated audit evidence for the new denominator.

## 6. Implementation units

### U1. Add a first-class Grammar QG verification command

Add package scripts that make the Grammar QG release gate easy to run and hard to forget.

Suggested scripts:

```json
{
  "audit:grammar-qg": "node scripts/audit-grammar-question-generator.mjs --json",
  "audit:grammar-qg:deep": "node scripts/audit-grammar-question-generator.mjs --deep --json",
  "verify:grammar-qg": "npm run audit:grammar-qg && npm run audit:grammar-qg:deep && node --test tests/grammar-question-generator-audit.test.js tests/grammar-functionality-completeness.test.js tests/grammar-production-smoke.test.js tests/grammar-qg-p4-depth.test.js tests/grammar-qg-p4-mixed-transfer.test.js tests/grammar-selection.test.js tests/grammar-engine.test.js"
}
```

Keep the exact test list aligned with the repo structure. The important point is that one command verifies denominator, answer specs, deep-seed coverage, redaction, mixed-transfer coverage, selection reachability, and engine behaviour.

Acceptance:

- `npm run verify:grammar-qg` exists.
- The command includes both default and deep Grammar QG audits.
- The command fails if default-window repeats reappear.
- The command fails if deep low-depth families are not resolved or explicitly allowlisted.
- The command fails if P5 denominator fixtures drift from executable audit output.

### U2. Expand the 12 low-depth generated families

Expand the reviewed case banks for the 12 families listed in section 4.2.

Rules:

- Add genuine grammar scenarios, not cosmetic name substitutions.
- Use `pickBySeed(seed, cases)` or an equivalent deterministic case-selection helper for primary case selection.
- Continue to use deterministic option shuffling where appropriate.
- Keep the answer-spec kind unchanged unless there is a clear marking reason to migrate.
- Do not turn selected-response items into free-text items in P5.
- Prefer case-bank expansion over adding new template ids.

Acceptance:

- Every targeted family has at least 8 unique visible variant signatures over seeds 1..30, or appears in a deliberate allowlist with rationale.
- Default-window repeated generated variants remain zero.
- Cross-template signature collisions remain zero.
- Existing P1–P4 fixtures remain historically frozen.
- P5 receives a new baseline fixture rather than mutating P1–P4 baselines.

### U3. Add content-quality linting

Extend `scripts/audit-grammar-question-generator.mjs` or add a companion script, for example:

```text
scripts/audit-grammar-content-quality.mjs
```

The content-quality audit should produce JSON and a readable summary. It should check:

- Unknown misconception ids.
- Empty or missing feedback on score-bearing templates.
- Unbalanced quote marks in learner-facing strings.
- Obvious reversed curly quotes at the start of quoted words.
- `-ly` compound hyphenation mistakes.
- Duplicate options after normalisation.
- Correct answer missing from options.
- More than one option accepted as correct.
- Punctuation “fix” tasks where the raw prompt is already equal to the accepted answer.
- P4/P5 transfer templates whose feedback does not mention the transfer relationship.

Acceptance:

- The content-quality audit is included in `verify:grammar-qg`.
- Unknown misconception ids fail the release gate.
- Duplicate or multi-correct selected-response options fail the release gate.
- Reversed quote warnings either fail or are recorded as explicit reviewed exceptions.
- The P5 completion report includes the content-quality audit summary.

### U4. Make completion reports machine-verifiable

Add a report validator so completion reports cannot overclaim against code.

Suggested script:

```text
scripts/validate-grammar-qg-completion-report.mjs
```

It should read the proposed completion report and compare claimed values with current audit output.

Minimum fields to validate:

- `contentReleaseId`.
- concept count.
- template count.
- selected-response count.
- constructed-response count.
- generated/fixed count.
- answer-spec count.
- constructed-response answer-spec count.
- manual-review-only count.
- explanation template count.
- explanation concept coverage.
- mixed-transfer template count.
- mixed-transfer concept coverage.
- default repeated variants.
- strict repeated variants.
- cross-template signature collisions.
- deep low-depth family count.
- production-smoke status wording.

The validator should also guard against contradictory claims. For example, it should fail if the report claims “no low-depth families” while the deep audit reports low-depth families, or if it claims production smoke passed without a linked smoke evidence artefact.

Acceptance:

- A draft P5 completion report cannot pass validation unless denominator claims match audit JSON.
- The validator recognises “repository smoke passed” and “post-deploy smoke passed” as different claims.
- Any post-deploy production-smoke claim must cite a machine-readable evidence file.

### U5. Add production-smoke evidence capture

Keep `smoke:production:grammar` as the live environment probe, but make its result part of release evidence.

Add one of the following:

Option A — the smoke script writes a JSON artefact:

```text
reports/grammar/grammar-production-smoke-<release-id>.json
```

Option B — a release-gate command stores the smoke output:

```bash
npm run smoke:production:grammar -- --json > reports/grammar/grammar-production-smoke-grammar-qg-p5-2026-04-28.json
```

The artefact should include:

- `ok: true`.
- origin.
- content release id observed in the Grammar read model.
- tested template ids.
- answer-spec families covered.
- normal round result.
- mini-test result.
- repair/support result.
- forbidden-key scan result.
- timestamp.
- commit SHA.

Acceptance:

- P5 final report can distinguish repository smoke from post-deploy smoke.
- If post-deploy smoke is not run, the report must say so directly.
- If post-deploy smoke is claimed as passed, the evidence file must exist and pass validation.

### U6. Add denominator drift detection

Create a canonical current-release fixture for P5, for example:

```text
tests/fixtures/grammar-legacy-oracle/grammar-qg-p5-baseline.json
tests/fixtures/grammar-functionality-completeness/grammar-qg-p5-baseline.json
```

Do not edit P1–P4 fixtures except to add tests that prove they remain historical.

Acceptance:

- P5 baseline is generated from the executable audit, not hand-written.
- Tests compare live audit output to the P5 baseline.
- Tests still assert P1, P2, P3, and P4 baselines remain frozen historical releases.
- The P5 fixture includes deep-audit summary fields, not only default-window fields.

### U7. Add a reviewer sample pack

Generate a reviewer-friendly sample pack for the deep-seed families.

Suggested output:

```text
reports/grammar/grammar-qg-p5-review-pack.md
```

For each generated family, include:

- family id.
- template id.
- skill ids.
- answer-spec kind.
- seeds sampled.
- visible prompt fingerprints.
- sample prompts without hidden answer keys.
- reviewer notes field.

The pack should not leak hidden answers before the answer section. It may include a separate reviewer-only answer appendix if clearly labelled and excluded from learner-facing paths.

Acceptance:

- Reviewers can inspect all expanded low-depth families without running the app.
- The pack is deterministic for the same commit and seed window.
- The pack is not used as runtime content.

### U8. Prepare the P5 final completion report template

Create:

```text
docs/plans/james/grammar/questions-generator/grammar-qg-p5-completion-report.md
docs/plans/james/grammar/questions-generator/grammar-qg-p5-final-completion-report-2026-04-28.md
```

The final report must include:

- machine-generated denominator table.
- deep-audit table before and after P5.
- content-quality audit result.
- production-smoke status, with explicit repository vs post-deploy distinction.
- fixture paths.
- test command outputs or test evidence references.
- residual risks.
- recommendation for QG P6.

Acceptance:

- The completion report passes the new report validator.
- It does not claim live production smoke unless the artefact exists.
- It does not claim zero low-depth families unless the deep audit confirms it or an allowlist is declared.

## 7. Tests to add or update

Add or update tests in these areas.

### Audit tests

- `tests/grammar-question-generator-audit.test.js`
  - asserts P5 denominator.
  - asserts deep-audit low-depth target or allowlist.
  - asserts mixed-transfer coverage remains 18 / 18.
  - asserts explanation coverage remains 18 / 18.
  - asserts default-window repeated variants remain zero.

### Content-quality tests

- `tests/grammar-qg-p5-content-quality.test.js`
  - unknown misconception ids fail.
  - duplicate normalised options fail.
  - no `-ly` hyphenation mistakes.
  - no raw-equals-accepted fix items.
  - no obviously reversed quote marks in learner-facing strings, unless allowlisted.

### Deep-seed tests

- `tests/grammar-qg-p5-depth.test.js`
  - each targeted low-depth family now has 8+ unique prompts over seeds 1..30, or appears in the allowlist.
  - expanded case banks still produce valid answer specs.
  - option shuffling does not inflate variant signatures.

### Report validation tests

- `tests/grammar-qg-p5-report-validation.test.js`
  - report validator catches mismatched template count.
  - report validator catches false “production smoke passed” claims without evidence.
  - report validator catches false “zero low-depth” claims.

### Smoke tests

- `tests/grammar-production-smoke.test.js`
  - preserve existing forbidden-key coverage.
  - add any new P5 answer-spec or case-bank families if necessary.
  - ensure visible payloads still come only from production-safe fields.

## 8. Release gate commands

The final implementation should record the exact commands used. Suggested minimum:

```bash
npm run verify:grammar-qg
node scripts/audit-grammar-question-generator.mjs --json
node scripts/audit-grammar-question-generator.mjs --deep --json
node scripts/audit-grammar-content-quality.mjs --json
node scripts/validate-grammar-qg-completion-report.mjs docs/plans/james/grammar/questions-generator/grammar-qg-p5-final-completion-report-2026-04-28.md
```

If production is available:

```bash
npm run smoke:production:grammar
```

If production is not available, the final report must say “post-deploy production smoke not run” rather than implying it passed.

## 9. Content-release handling

Bump the Grammar QG content release id only after the content and gate changes are complete.

Target:

```ts
export const GRAMMAR_CONTENT_RELEASE_ID = 'grammar-qg-p5-2026-04-28';
```

The release id bump is required because reviewed content banks and audit semantics will change. It also helps separate P4 learner evidence from P5 learner evidence.

## 10. Definition of done

P5 is complete when all of the following are true:

- Grammar content release id is bumped to `grammar-qg-p5-2026-04-28`.
- P5 fixture exists and matches executable audit output.
- P1–P4 fixtures remain frozen.
- `npm run verify:grammar-qg` exists and passes.
- Default-window repeated generated variants are zero.
- Cross-template signature collisions are zero.
- Deep low-depth families are zero, or all exceptions are explicit and justified.
- Content-quality audit has no unreviewed failures.
- Unknown misconception ids are impossible to ship.
- Completion-report claims are validated by script.
- Repository smoke passes.
- Post-deploy smoke is either evidenced or explicitly marked as not run.
- No reward, Star, Mega, monster, or mastery semantics are changed.
- No runtime AI question generation is introduced.

## 11. Recommended P6 focus after P5

P6 should move from release correctness into learner calibration.

Recommended P6 focus:

- Use real learner telemetry to decide which deterministic templates need retirement, expansion, or difficulty adjustment.
- Monitor mixed-transfer performance separately from concept-local practice.
- Calibrate mastery thresholds for multi-concept templates so one mixed-transfer answer does not inflate multiple concept nodes too aggressively.
- Track retention-after-secure and post-Mega maintenance outcomes.
- Use error and retry telemetry to prioritise the next content expansion, not raw template-count targets.

P5 should therefore leave clean telemetry hooks and reliable release evidence for P6, rather than trying to solve learner calibration prematurely.
