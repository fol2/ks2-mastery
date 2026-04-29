# Punctuation QG P6 — Production Quality Certification and Question Pool Review

**Owner:** KS2 Mastery / Punctuation  
**Phase type:** Production hardening, content quality certification, and learner UX alignment  
**Recommended status at start:** P5 complete; P6 required before declaring the Punctuation question pool production-certified  
**Language standard:** UK English  

---

## 1. Why P6 exists

P1–P5 built the deterministic question-generation engine. They moved Punctuation from a small fixed bank into a governed, DSL-backed, telemetry-attested question system with production depth kept at 4 and capacity verified up to 8.

P6 should not be treated as another generator-building phase. It should be the production quality phase that goes back to first principles:

> We are doing this to give children a higher-quality, deeper, wider, and proven Punctuation question pool.

The question pool must therefore be checked as actual learner-facing content, not only as code, counts, signatures, telemetry events, or generated-item uniqueness.

P6 should answer these questions:

1. Are all questions logically sound?
2. Are model answers and accepted answers actually accepted by the production marking engine?
3. Are validators neither over-strict nor too loose?
4. Are the prompts clear enough for a KS2 learner?
5. Are explanations accurate and helpful?
6. Are misconception tags precise enough to support repair?
7. Are duplicate or near-duplicate surfaces acceptable in context?
8. Does the UI help the child understand the task, especially for speech, bullets, paragraphs, and transfer writing?
9. Is depth 6 safe to activate from a content-quality perspective, not only from a signature/marking perspective?

---

## 2. Current validated baseline

At the end of P5, the expected baseline is:

```text

Release id:                       punctuation-r4-full-14-skill-structure
Fixed items:                      92
Published generator families:     25
DSL-backed families:              25 / 25
Production generated depth:       4 variants per family
Production generated items:       100
Production runtime items:         192
Depth-6 runtime items:            242, verified but not activated
Depth-8 capacity runtime items:   292, audit/capacity only
Published reward units:           14
Runtime AI generation:            none
Telemetry events declared:        11
Telemetry events emitted:         10
Telemetry events reserved:        1

```

P5 is directionally strong. The engine is deterministic, DSL-backed, self-checking at template-family level, and has much better scheduler/evidence protection than at P1.

P6 should preserve that work but add a stricter content certification layer.

## 3. Important validation findings to address first

### 3.1 Fixed accepted-answer marking gap

A local source-level audit found that at least one fixed item model answer currently fails the production marking function.

Affected item:

```text

Item id:   ap_transfer_possession
Mode:      transfer
Skill:     apostrophe_possession
Prompt:    Write one sentence that includes both children's and teachers'.
Model:     The children's paintings were hanging beside the teachers' notices.
Validator: requiresTokens ["children's", "teachers'"]
Observed:  The model answer is marked incorrect, with teachers' reported as missing.

```

Likely cause:

canonicalPunctuationText() treats apostrophes as quote characters and removes whitespace after an apostrophe. That is sensible for quotation clean-up, but unsafe for plural possessive tokens such as teachers' notices, because it can collapse the text into teachers'notices, causing token-boundary matching to fail.

Required P6 action:

- Add a regression test proving `ap_transfer_possession` model and accepted answer are marked correct.
- Add plural possessive token tests for teachers', girls', boys', and similar forms before a following noun.
- Fix token normalisation so possessive apostrophes are not treated as quote delimiters in token-preservation matching.
- Add a full fixed-bank self-check: every non-choice fixed item model and every accepted answer must pass `markPunctuationAnswer()`.

This is the highest-priority P6 bug because it is not just an audit nicety. It can cause a child to type the exact model answer and still be marked wrong.

### 3.2 P5 telemetry proof is improved but still partly probabilistic

P5 added command-path tests and a telemetry manifest, which is a real improvement. However, some command-path telemetry tests still use loop-based selection and degrade to weak assertions if the event does not fire. P5 acknowledges this as a residual risk.

Required P6 action:

- Replace probabilistic telemetry command-path tests with deterministic fixtures or direct scheduler setup.
- Every event marked emitted should have at least one non-vacuous test where the event must appear.
- Keep `STAR_EVIDENCE_DEDUPED_BY_TEMPLATE` as reserved unless a real callsite is added.

### 3.3 Depth-6 should remain unactivated until content certification is complete

P5 shows that depth 6 is technically safe: no signature collisions, no mode-scoped duplicate clusters, and generated model answers pass marking. That is not yet the same as content-quality certification.

Required P6 action:

- Do not raise production depth at the start of P6.
- Revisit the depth-6 decision only after the full learner-facing catalogue has been reviewed and signed off.
- If depth 6 is activated, bump the release id and production smoke expected count in the same commit.

## 4. Non-goals

P6 must not become a cosmetic redesign or a broad product rewrite.

Do not:

- introduce runtime AI generation;
- raise production depth before quality certification;
- rebuild the Punctuation UI from scratch;
- change Star semantics unless a content-quality defect forces a small evidence fix;
- hide quality gaps behind “capacity verified” language;
- add more templates simply to increase counts.

P6 may use AI as a reviewer assistant, but the source of truth must remain deterministic, teacher-authored, and test-backed content.

## 5. P6 workstreams

### U1 — Fix fixed-bank answer-contract self-checks

Add a fixed-bank marking audit that covers all fixed non-choice items, not just generated model answers.

Required checks:

- Every fixed non-choice item has a model answer.
- Every fixed non-choice item model answer is marked correct.
- Every fixed accepted answer is marked correct.
- Every validator-backed fixed item has at least one negative case.
- Every transfer item checks the intended target without rejecting reasonable punctuation variants.
- Every paragraph item has a model answer that passes through the paragraph marking path.

Acceptance criteria:

```text

fixedNonChoiceModelFailures = 0
fixedAcceptedAnswerFailures = 0
generatedModelFailuresDepth4 = 0
generatedModelFailuresDepth6 = 0
generatedModelFailuresDepth8 = 0

```

Add a new test file, for example:

- `tests/punctuation-fixed-answer-contract.test.js`

This test should fail on the current ap_transfer_possession issue until the marking bug is fixed.

### U2 — Build a complete learner-facing question catalogue

Create a canonical catalogue that reviewers can inspect without reading source code.

The catalogue must include all:

- 92 fixed items;
- 100 production generated items at depth 4;
- 150 generated items at depth 6;
- 200 generated items at depth 8, marked as capacity-only.

For each item include:

- `id`
- `source` (fixed | generated)
- `family id`, if generated
- `template id`, if generated
- `variant signature`, if generated
- `primary skill ids`
- `reward unit id`
- `cluster id`
- `mode`
- `readiness tags`
- `misconception tags`
- `prompt`
- `stem`
- `options`, if choose mode
- `correct option`, if choose mode
- `model answer`
- `accepted answers`
- `validator or rubric summary`
- `explanation`
- `learner-facing notes`
- `review status`
- `reviewer decision`
- `reviewer comments`

Output formats:

- `docs/plans/james/punctuation/questions-generator/punctuation-qg-p6-question-catalogue.md`
- `artifacts/punctuation-question-catalogue-depth4.json`
- `artifacts/punctuation-question-catalogue-depth6.json`
- `artifacts/punctuation-question-catalogue-depth8.json`

The markdown catalogue should be readable by a teacher or product reviewer. The JSON artefacts should be stable enough for CI comparison.

### U3 — Add a content-quality rubric and reviewer decisions

Every learner-facing question should be scored against a simple quality rubric.

Rubric fields:

- `logical`: pass | fix | reject
- `ks2Appropriate`: pass | fix | reject
- `promptClear`: pass | fix | reject
- `modelGrammatical`: pass | fix | reject
- `validatorFair`: pass | fix | reject
- `explanationAccurate`: pass | fix | reject
- `misconceptionTagsPrecise`: pass | fix | reject
- `uiSafe`: pass | fix | reject
- `duplicateAcceptable`: pass | fix | reject

Reviewer decision values:

- `approved`
- `approved_with_note`
- `needs_copy_fix`
- `needs_validator_fix`
- `needs_template_fix`
- `needs_ui_support`
- `reject`

Store decisions in a versioned fixture:

- `tests/fixtures/punctuation-question-quality-decisions.json`

CI should fail when:

- a production item is missing a reviewer decision;
- a production item has `reject` or unresolved `needs_*` status;
- a depth-6 item is activated without approval;
- a reviewer decision references an item that no longer exists;
- an item changes its learner-facing surface without requiring re-review.

### U4 — Deep edge-case marking suite

Add a marking edge-case suite that goes beyond the golden template accept/reject tests.

The suite should test realistic learner inputs and valid alternatives.

Coverage required by skill:

#### Sentence endings

- question mark for direct questions;
- full stop for commands/statements;
- exclamation mark for What a... / How... exclamations;
- capitalisation at sentence start;
- rejection of multiple sentences where a single sentence is requested.

#### List commas

- no Oxford comma accepted by default;
- Oxford comma accepted where policy allows it;
- Oxford comma rejected only when the prompt explicitly says not to use one;
- comma after verb rejected;
- item words preserved.

#### Apostrophe contractions

- straight and curly apostrophes accepted;
- missing apostrophes rejected;
- wrong word forms rejected;
- common forms: can't, won't, don't, they're, we'd, it's, isn't.

#### Apostrophe possession

- singular possession accepted;
- plural possession ending in `s'` accepted;
- irregular plural possession such as `children's` and `men's` accepted;
- plural possessive followed by a noun must not be broken by quote-normalisation;
- contraction/possession confusion rejected.

#### Speech

- straight double quotes accepted;
- curly double quotes accepted;
- reporting comma before speech accepted;
- terminal punctuation inside inverted commas accepted;
- question/exclamation inside speech accepted;
- missing quote, missing reporting comma, and punctuation outside quote rejected.

#### Fronted adverbials and comma clarity

- comma after fronted phrase accepted;
- no comma rejected;
- comma after subject rejected;
- phrase words preserved;
- adverbial phrase case-insensitive but sentence start capitalised.

#### Parenthesis

- paired commas accepted;
- brackets accepted where the prompt allows parenthesis broadly;
- paired dashes accepted where the prompt allows parenthesis broadly;
- unbalanced punctuation rejected;
- extra detail preserved.

#### Colon lists

- complete opening clause before colon accepted;
- colon after incomplete clause rejected;
- list words preserved;
- list commas policy consistent with list-comma rules.

#### Semicolons

- semi-colon between two related independent clauses accepted;
- comma splice rejected;
- semi-colon plus conjunction rejected where the task is to replace the boundary;
- lower-case second clause accepted where appropriate.

#### Dash clauses

- spaced hyphen, en dash, and em dash accepted consistently;
- missing dash rejected;
- comma splice rejected;
- no over-reliance on ASCII hyphen only.

#### Semicolon lists

- semi-colons between complex list items accepted;
- internal commas retained;
- optional and before final item handled consistently;
- misplaced semi-colons rejected.

#### Bullet points

- colon after stem accepted;
- consistent no-terminal-punctuation bullets accepted for fragments;
- consistent full-stop bullets accepted where each bullet is a full sentence;
- mixed bullet punctuation rejected;
- line breaks and bullet markers preserved in UI and marking.

#### Hyphens

- compound modifier before noun accepted;
- no hyphen rejected where ambiguity remains;
- wrong hyphen position rejected;
- avoid cases where the unhyphenated form is also standard without ambiguity.

Acceptance criteria:

- All model answers pass.
- All accepted alternatives pass.
- All targeted misconceptions fail.
- All edge-case tests are deterministic.
- No validator relies on one exact surface when the prompt permits reasonable alternatives.

### U5 — Manual content review of the actual question pool

Run a manual review of every production item, plus a sample of depth-6 and depth-8 capacity items.

The review should look for:

- unnatural sentences;
- confusing stems;
- prompts that do not say exactly what the child must do;
- model answers that are technically correct but not child-natural;
- examples with more than one reasonable answer where the validator accepts only one;
- style-policy traps, especially Oxford commas and bullet punctuation;
- speech punctuation variants;
- dashes versus hyphens;
- plural possessives ending in apostrophe;
- paragraph items that accidentally assess too many skills at once;
- multi-skill items over-crediting mastery evidence;
- examples that feel too repetitive across modes.

Minimum review expectation:

- Depth 4 production runtime: 100% reviewed
- Depth 6 candidate runtime: 100% reviewed before activation
- Depth 8 capacity runtime: at least 50% reviewed, with all families sampled
- Fixed bank: 100% reviewed
- No production item should be live without either `approved` or `approved_with_note` status.

### U6 — Duplicate and near-duplicate learner experience review

P5 introduced mode-scoped duplicate detection and found zero mode-scoped duplicate clusters. That is useful but not the whole story.

P6 should add a learner-experience duplicate review that detects:

- same underlying sentence across different modes;
- same model answer across different modes;
- same misconception in near-identical context;
- same family using the same nouns/verbs too often;
- generated items that feel like replays even with different ids/signatures.

Cross-mode overlap is not automatically wrong. It can be pedagogically useful when a child first fixes a sentence and later combines a related sentence. But each overlap should be intentional.

Add reviewer decisions:

- `intentional_bridge`
- `acceptable_cross_mode`
- `rewrite_for_variety`
- `block_depth_raise`

Acceptance criteria:

- all cross-mode duplicate stems/models are listed;
- all are reviewed;
- none block production depth 4;
- none block depth 6 activation;
- depth 8 remains capacity-only unless reviewed.

### U7 — UX/UI alignment for question quality

P6 should improve the learner experience only where it directly protects question quality. Avoid cosmetic redesign.

Required UI checks:

#### Mode-specific instruction clarity

- `choose`: options are visually clear and selectable.
- `insert` / `fix`: input is large enough and preserves punctuation.
- `combine`: source lines are visually separated.
- `paragraph`: multi-sentence input is comfortable.
- `bullet_points`: line breaks and bullet markers are preserved.
- `speech`: quotes are easy to type or paste.

#### Feedback quality

- Show the expected punctuation principle, not just “wrong”.
- Avoid revealing internal validator names, signatures, template ids, or raw misconception tags to the child.
- For style-sensitive cases, say whether the task has a house-style requirement.
- For valid alternatives, do not imply the child was wrong because their answer differs from the model.

#### Review screen clarity

- After a session, show which skill was practised and what to repair next.
- Do not expose generated metadata.
- Keep one clear next action.

#### Accessibility and mobile safety

- Bullet-list stems must not collapse line breaks.
- Speech marks must display correctly.
- Long paragraph prompts must not push the input off-screen.
- Error state must be screen-reader accessible.

Suggested tests:

- `tests/react-punctuation-question-quality-ui.test.js`
- `tests/playwright/punctuation-question-quality.playwright.test.mjs`

These tests should focus on task comprehension, not visual polish.

### U8 — Production depth decision gate

P6 should end with an explicit decision:

- keep depth 4
- raise selected families to depth 6
- raise all families to depth 6
- keep depth 8 as capacity only

Depth 6 can be activated only if:

- fixed-bank self-check is clean;
- generated depth-6 model marking is clean;
- question-quality decisions approve all depth-6 items;
- duplicate/near-duplicate review has no blockers;
- UX supports all learner-facing modes;
- production smoke expected runtime is updated;
- release id is bumped.

If activated, use a new release id, for example:

- `punctuation-r5-qg-capacity-6`

Do not keep the old release id if runtime shape changes from 192 to 242.

### U9 — Production-quality verification command

Add a P6 verification command:

```json

"verify:punctuation-qg:p6": "node scripts/verify-punctuation-qg-p6.mjs"

```

The command should run:

- P5 verification gates that are still relevant.
- Fixed-bank model/accepted-answer audit.
- Generated model audit at depths 4, 6, and 8.
- Full question catalogue build.
- Question-quality reviewer decision validation.
- Edge-case marking suite.
- Duplicate/near-duplicate learner-experience review.
- UI alignment smoke tests.
- Telemetry non-vacuous command-path checks.
- Production smoke attestation for the currently active runtime shape.

Output should include:

- runtime item count
- fixed model failures
- generated model failures by depth
- unreviewed items
- rejected items
- style-policy warnings
- duplicate learner-experience warnings
- UI blockers
- production depth recommendation

CI should fail on any blocker.

### U10 — Completion report and release certificate

P6 completion should produce two documents:

- `docs/plans/james/punctuation/questions-generator/punctuation-qg-p6-completion-report.md`
- `docs/plans/james/punctuation/questions-generator/punctuation-question-pool-release-certificate.md`

The completion report should say what was changed.

The release certificate should say whether the question pool is production-certified, and at which depth.

The release certificate must include:

- `release id`
- `commit sha`
- `production depth`
- `runtime count`
- `fixed item count`
- `generated item count`
- `reviewed item count`
- `approved item count`
- `blocked item count`
- `known residual risks`
- whether depth 6 is activated or deferred
- whether depth 8 remains capacity-only

## 6. Required test additions

Add or update these tests:

- `tests/punctuation-fixed-answer-contract.test.js`
- `tests/punctuation-question-quality-audit.test.js`
- `tests/punctuation-edge-case-marking.test.js`
- `tests/punctuation-depth6-quality-gate.test.js`
- `tests/punctuation-learner-duplicate-review.test.js`
- `tests/punctuation-telemetry-non-vacuous.test.js`
- `tests/react-punctuation-question-quality-ui.test.js`

At minimum, the first five should be implemented in P6. The UI test may be a lightweight React or Playwright smoke if full visual coverage is too heavy.

## 7. Suggested implementation order

- Add fixed-bank answer-contract audit and reproduce the `ap_transfer_possession` failure.
- Fix possessive apostrophe token matching.
- Add fixed-bank and generated-depth model validation to CI.
- Build the full question catalogue generator.
- Add reviewer decision fixture and fail-on-unreviewed gate.
- Add edge-case marking tests by skill.
- Run manual content review against production depth 4.
- Review depth 6 candidate items.
- Add learner-experience duplicate review.
- Add targeted UX/UI task-comprehension tests.
- Decide whether to keep depth 4 or activate depth 6.
- Produce the completion report and release certificate.

## 8. Definition of Done

P6 is complete only when all of the following are true:

- No fixed model answer fails production marking.
- No fixed accepted answer fails production marking.
- No generated model answer fails production marking at depth 4, 6, or 8.
- Every production item has a reviewer decision.
- Every production item is `approved` or `approved_with_note`.
- Every depth-6 candidate item is approved before activation.
- Every choice item has exactly one intended correct option unless explicitly reviewed as style-based best-answer.
- Every style-sensitive item has clear prompt/explanation wording.
- Every validator-backed item has edge-case accept/reject coverage.
- All known plural possessive apostrophe cases pass.
- All cross-mode duplicate surfaces are reviewed.
- No child-facing read model exposes template ids, validator internals, or raw signatures beyond allowed opaque metadata.
- UI preserves line breaks, speech marks, bullets, and paragraph input.
- P6 verification command passes.
- Release certificate is produced.

## 9. Final production judgement target

After P6, the desired outcome is not simply “more questions”. The desired outcome is:

The Punctuation question pool is proven safe, fair, logically sound, wide enough for practice, deep enough for spaced retrieval, and supported by UI that helps children understand exactly what they are being asked to do.

If P6 passes but depth remains 4, that is acceptable. A conservative, certified 192-item pool is better than a larger pool with hidden marking edge cases.

If P6 passes and depth 6 is activated, the production pool becomes:

- `92 fixed items + 25 families × 6 generated variants = 242 runtime items`

Depth 8 should remain capacity-only unless reviewed to the same standard.
