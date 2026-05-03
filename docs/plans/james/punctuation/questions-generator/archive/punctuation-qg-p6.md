# Punctuation QG P6 — Production Question Quality, Manual QA, and UX Support

Date: 29 April 2026  
Owner: KS2 Mastery / Punctuation  
Phase type: final production-quality acceptance phase  
Recommended release posture: keep production generated depth at 4 until this phase is complete

## 1. Why P6 exists

P1–P5 built the deterministic Punctuation question-generation engine. P6 is not another volume-increase phase. It is the final production-quality phase that asks whether every learner-visible question is good enough to trust.

The first principle is simple: the point of the generator is not merely to have more questions. The point is to have a higher-quality, deeper, wider, and proven question pool. The engine must give children fair questions, mark fair answers correctly, reject real misconceptions, explain the rule clearly, and avoid repeated surface patterns that create false confidence.

P6 should therefore focus on content proof, marking fairness, explanation quality, reviewer workflow, and small UX support for clarity. Do not spend this phase on cosmetic UI work.

## 2. Current validated baseline

The current P5/Punctuation QG baseline is:

- Release id: `punctuation-r4-full-14-skill-structure`
- Fixed items: 92
- Generator families: 25/25 DSL-backed
- Production generated depth: 4 per family
- Production generated items: 100
- Production runtime pool: 192 items
- Capacity-audit depth: 8 per family
- Capacity-audit runtime pool: 292 items
- Depth-6 candidate pool: 242 items
- Published reward units: 14
- Runtime AI generation: none

P5 substantially closed the engineering gaps from P4. The following claims are supported by the codebase and targeted local validation from the uploaded bundle:

- 25/25 generator families are DSL-backed.
- Golden marking now covers all 25 DSL families.
- Local targeted run of `tests/punctuation-golden-marking.test.js` passed with 200 templates, 360 accept cases, and 592 reject cases.
- Strict production audit at generated depth 4 passed.
- Strict depth-6 audit passed.
- Strict depth-8 capacity audit passed.
- Production runtime count remains 192.
- Depth 6 mechanically produces 242 runtime items with no duplicate generated signatures.
- Depth 8 mechanically produces 292 runtime items with no duplicate generated signatures.
- Mixed review and sibling-retry tests exist and pass in targeted local runs.
- Support evidence exclusion from Secure/Mastery exists and passes in targeted local runs.
- Smoke attestation tests exist and pass in targeted local runs.

This is a strong engineering baseline. It is not yet the same as final content-quality acceptance.

## 3. P5 validation findings that P6 must address

### 3.1 Critical fixed-bank self-marking bug

A local fixed-bank self-marking audit found one fixed item whose own model answer is rejected by the production marking engine:

- Item id: `ap_transfer_possession`
- Prompt: `Write one sentence that includes both children's and teachers'.`
- Model answer: `The children's paintings were hanging beside the teachers' notices.`
- Current validator: `requiresTokens`, requiring `children's` and `teachers'`
- Current result: rejected
- Observed feedback: `Include these exact forms: teachers'.`

Likely cause: punctuation canonicalisation removes the space after a terminal possessive apostrophe, turning `teachers' notices` into `teachers'notices`, which then breaks required-token boundary matching.

This is a real production-quality issue because the learner could type the model answer and be marked wrong. P6 must fix this before any generated-depth increase.

### 3.2 Fixed-bank model and accepted-answer coverage is incomplete

P1–P5 heavily validate generated model answers and DSL golden cases. They do not yet sufficiently hard-gate every fixed item model answer, fixed accepted alternative, and fixed-choice correct answer through production marking.

P6 must make fixed-bank self-marking part of the normal audit and CI flow.

### 3.3 Speech transfer is too narrow in at least one learner-valid case

A fixed speech transfer item asks the child to write one sentence of direct speech using exact spoken words:

- Item id: `sp_transfer_question`
- Spoken words: `Can we start now?`
- Model answer: `Mia asked, "Can we start now?"`

The marking accepts the reporting-before form but rejects a valid reporting-after form such as:

`"Can we start now?" asked Mia.`

This is unfair unless the prompt explicitly requires a reporting-before structure. P6 must either make the validator accept both common direct-speech orders or tighten the prompt so only the intended structure is asked for.

### 3.4 Generated explanations are still generic

At production depth 4, depth 6, and depth 8, generated items currently fall back to the generic explanation:

`This generated item practises the same published punctuation skill.`

This is not good enough for production learning quality. A correct/incorrect answer should reinforce the actual punctuation rule, for example why a comma follows a fronted adverbial, why the question mark stays inside speech marks, or why `teachers'` shows plural possession.

P6 must require rule-specific explanations for every generated template.

### 3.5 Telemetry proof is improved but still partly smoke-level

P5 correctly declares 10 telemetry events as emitted and one event as reserved. However, some command-path telemetry tests can fall back to asserting that an event name exists when scheduling randomness does not produce the target event. This is useful smoke coverage, but it is not proof-level event emission coverage.

P6 must either make these tests deterministic or label them honestly as smoke tests rather than proof tests.

### 3.6 Duplicate governance is mode-scoped, but perceived variety still needs human review

P5 reports zero mode-scoped duplicate stem/model clusters at production, depth 6, and depth 8. That is a good engineering signal.

However, cross-mode generated model overlap still exists. For example, the same final sentence can appear in both a `fix` context and a `combine` context. This may be pedagogically acceptable, but it still needs human review because children experience mixed sessions and GPS-style review as one pool, not as isolated mode buckets.

P6 should not treat every cross-mode overlap as a bug. It should require an explicit reviewer decision: approve, rewrite, or retire.

### 3.7 Production depth should not be raised yet

P5 demonstrates that depth 6 is mechanically viable. P6 must decide whether depth 6 is content-quality viable.

Until the fixed-bank bug, generated explanations, speech fairness, and reviewer-pack work are complete, keep production generated depth at 4.

## 4. P6 objectives

P6 has six objectives:

1. Prove that every learner-visible fixed item is logically sound and self-marking.
2. Prove that every production generated item, and every depth-6 candidate item if activation is being considered, has fair marking, useful explanations, and acceptable surface variety.
3. Replace generic generated explanations with rule-specific teaching feedback.
4. Add reviewer tooling so a human can inspect the exact questions children will see.
5. Add small UX support that makes feedback clearer without turning this into cosmetic redesign.
6. Make a deliberate depth decision: keep depth 4, raise selected families, or raise all families to depth 6 with release evidence.

## 5. Work units

### P6-U1 — Fixed-bank self-marking gate

Add a fixed-content audit that runs every fixed learner-visible item through the production marking function.

Required checks:

- Every fixed item `model` answer must mark correct.
- Every fixed item `accepted` answer must mark correct.
- Every choice item must have a valid correct option.
- Every choice item explanation must match the correct option.
- Every fixed transfer item must have at least one fair accepted answer.
- Every fixed open item must have at least one misconception/negative test, either inline or in a companion fixture.

Acceptance criteria:

- `ap_transfer_possession` no longer fails on the model answer.
- A new audit option exists, for example `npm run audit:punctuation-content -- --strict --include-fixed-answers`.
- CI fails if any fixed model/accepted answer is rejected.
- The audit report names the exact item id, prompt, model, validator, failure note, and misconception tags.

### P6-U2 — Apostrophe and quote normalisation hardening

Fix punctuation normalisation so possessive apostrophes are not treated as opening quotation marks.

Required regression cases:

- `The children's paintings were hanging beside the teachers' notices.`
- `The boys' jackets were beside the girls' bags.`
- `The doctors' notes were on the desk.`
- `The children's books were on the teachers' shelves.`
- Curly apostrophe equivalents should also work.

Acceptance criteria:

- Required-token validation accepts terminal plural possessives followed by whitespace and a noun.
- Speech quote normalisation still works for straight and curly quotation marks.
- No regression in speech, contractions, or possessive singular marking.

Implementation note:

Do not globally remove whitespace after a straight apostrophe. Only collapse spaces around actual quotation marks or contexts that are clearly opening/closing speech marks.

### P6-U3 — Speech transfer fairness

Review all fixed and generated speech transfer/insert/fix/paragraph items for legitimate alternate structures.

At minimum, decide whether these should be accepted:

- `Mia asked, "Can we start now?"`
- `"Can we start now?" asked Mia.`
- `Mia asked, 'Can we start now?'`
- `'Can we start now?' asked Mia.`

Acceptance criteria:

- If the prompt asks generally for direct speech, both reporting-before and reporting-after structures are accepted when otherwise correct.
- If the prompt requires a specific reporting-clause position, the prompt says so explicitly.
- Golden accept/reject tests include reporting-before and reporting-after cases.
- Feedback explains the real issue, not a misleading capitalisation or extra-sentence diagnosis.

### P6-U4 — Rule-specific generated explanations

Every DSL template must provide a specific explanation or use an explanation builder.

Examples of acceptable explanation quality:

- Fronted adverbial: `The comma comes after the starter phrase because it appears before the main clause.`
- Speech question: `The question mark belongs to the spoken words, so it stays inside the closing inverted comma.`
- Plural possession: `The apostrophe comes after the plural noun because the notices belong to more than one teacher.`
- Hyphen: `The hyphen joins the words so the reader knows the phrase acts as one description.`

Acceptance criteria:

- No generated item at depth 4, depth 6, or depth 8 uses the generic fallback explanation.
- Audit fails if any generated item explanation equals or closely matches `This generated item practises the same published punctuation skill.`
- Explanation text is child-readable and rule-specific.
- Explanation text does not expose internal ids, validator names, template ids, or misconception tags.

### P6-U5 — Per-question human QA pack

Create a reviewer artefact that lets a human inspect the actual question bank.

Required command:

`npm run review:punctuation-questions`

Recommended outputs:

- Markdown report for reading.
- CSV or JSON for filtering.
- Optional HTML preview for admin/reviewer use.

Each row/card should include:

- Item id
- Source: fixed/generated
- Skill id(s)
- Reward unit
- Mode
- Prompt
- Stem
- Model answer
- Accepted alternatives
- Reject/negative examples, where available
- Explanation
- Validator/rubric summary in reviewer language
- Misconception tags
- Readiness tags
- Template id and variant signature for reviewer/admin only
- Production marking result for the model answer
- Production marking result for accepted alternatives
- Reviewer status: `approved`, `rewrite`, `retire`, `needs-marking-fix`, `needs-prompt-tightening`
- Reviewer notes

Acceptance criteria:

- The pack covers all 92 fixed items.
- The pack covers all 100 production generated items.
- If depth 6 activation is being considered, the pack also covers all 150 depth-6 generated candidates.
- Reviewer decisions are committed as a durable artefact or machine-readable allowlist.
- CI can fail on any item marked `rewrite`, `retire`, or `needs-marking-fix` if that item remains in the production pool.

### P6-U6 — Edge-case matrix by skill

Add a documented edge-case test matrix for all 14 skills.

Minimum coverage:

- Sentence endings: statement, question, exclamation, capitalisation, sentence fragments.
- List commas: standard KS2 list style, optional Oxford comma policy, no comma after final `and` unless policy allows it.
- Apostrophe contractions: straight/curly apostrophes, common contractions, false possessives.
- Apostrophe possession: singular, regular plural, irregular plural, names ending in `s`, terminal plural possessive before a noun.
- Speech: reporting-before, reporting-after, question/exclamation inside speech marks, comma before speech, straight/curly inverted commas.
- Fronted adverbials: short and longer starter phrases, comma missing, comma in wrong place.
- Parenthesis: commas, brackets, dashes, balanced punctuation, removable extra information.
- Comma clarity: comma after opening subordinate clause, comma not inserted inside a simple noun phrase.
- Colon lists: complete clause before colon, list after colon, no colon after incomplete stem unless bullet-list style is intended.
- Semicolons: two independent related clauses, no semicolon joining fragment to clause.
- Dash clauses: spaced hyphen, en dash, em dash; dash between related clauses only.
- Semicolon lists: complex list items containing internal commas.
- Bullet points: consistent no-punctuation or consistent full-stop style, colon/stem alignment.
- Hyphens: ambiguity-avoiding compounds, not random hyphen insertion.

Acceptance criteria:

- Each skill has explicit accept and reject tests.
- Edge-case tests are run through production `markPunctuationAnswer`.
- Any house-style policy is visible in the test name and explanation.

### P6-U7 — Perceived-variety review

Mode-scoped duplicate governance is not enough for learner experience. Add a perceived-variety report.

The report should group items by:

- Normalised stem
- Normalised model
- Same semantic sentence across modes
- Same character/topic context repeated too often
- Same correction pattern repeated too often inside a skill
- Same explanation repeated too often

Acceptance criteria:

- Every global duplicate model/stem cluster is either rewritten or explicitly approved.
- Approved duplicates include a rationale, for example `same sentence intentionally appears once as fix and once as combine`.
- Mixed/GPS session exposure is considered, not only within-mode exposure.
- Depth 6 is not activated if perceived variety is poor.

### P6-U8 — Production depth decision gate

After P6 content QA, make a deliberate depth decision.

Allowed outcomes:

1. Keep production depth at 4.
2. Raise selected families to 6.
3. Raise all families to 6.

Do not raise to 8 in P6. Depth 8 should remain a capacity/audit candidate unless a later monitoring phase proves it safe.

Acceptance criteria if depth changes:

- Release id changes. Suggested shape: `punctuation-r5-qg-depth-6` or clearer equivalent.
- Production service and generator use one canonical depth source, not divergent constants.
- Production smoke expected runtime changes from 192 to the new expected count.
- Star evidence remains release-scoped.
- P6 report includes before/after runtime counts.
- Deployment evidence includes commit SHA or an explicit statement that commit attestation is unavailable.

### P6-U9 — UX support for answer trust

Add only UX changes that directly support learning quality and answer trust.

Required UX improvements:

- Show rule-specific generated explanations after marking.
- For house-style cases, show plain-English policy notes, for example Oxford comma accepted/optional/avoided depending on item policy.
- For speech items, make clear whether the reporting clause can come before or after the speech.
- For sibling retry, explain that the next question is a new sentence with the same trap, not a replay.
- Keep raw ids, template ids, validator names, and misconception tags hidden from children.
- Keep reviewer/admin metadata available only in admin/debug surfaces.

Acceptance criteria:

- Child UI never surfaces raw validator/template internals.
- Feedback is specific enough that a child knows what to fix.
- No new competing primary CTAs are added to the learner screen.
- The UI remains aligned to the one-primary-action principle.

### P6-U10 — Telemetry proof hardening

Separate proof-level telemetry tests from opportunistic smoke tests.

Acceptance criteria:

- If a report says an event is command-path proven, the test must deterministically force that event and assert its emission.
- If deterministic forcing is not practical, the event is labelled `smoke-covered` rather than `proven`.
- `STAR_EVIDENCE_DEDUPED_BY_TEMPLATE` remains reserved unless a real callsite exists.
- Health reports distinguish `declared`, `emitted`, `proof-tested`, `smoke-tested`, and `reserved`.

### P6-U11 — P6 verification command

Add a new command:

`npm run verify:punctuation-qg:p6`

It should run the P5 verification gates plus:

- Fixed-bank self-marking audit.
- Fixed accepted-answer audit.
- Generated explanation specificity audit.
- 14-skill edge-case matrix.
- Perceived-variety report in strict mode.
- Speech transfer fairness tests.
- Apostrophe normalisation regression tests.
- Telemetry proof/smoke classification tests.
- Reviewer decision gate, if reviewer decisions are committed.

Acceptance criteria:

- One command gives a reliable go/no-go answer for production question quality.
- The command prints measured counts, not only pass/fail.

### P6-U12 — Final production-quality report

Create:

`docs/plans/james/punctuation/questions-generator/punctuation-qg-p6-completion-report.md`

The report must include:

- Exact runtime counts.
- Exact fixed/generator/depth counts.
- Number of fixed model answers tested.
- Number of fixed accepted alternatives tested.
- Number of generated explanations audited.
- Number of edge-case matrix tests.
- Number of reviewer-approved, rewritten, retired, or blocked items.
- Duplicate/perceived-variety summary.
- Telemetry proof-vs-smoke summary.
- Depth decision and rationale.
- Remaining risks, if any.

## 6. Recommended immediate fixes

### 6.1 Fix `ap_transfer_possession`

Do not only add an accepted alternative. Fix the normalisation/token-boundary bug so the model itself passes.

Regression expectation:

```js
markPunctuationAnswer({
  item: apTransferPossessionItem,
  answer: { typed: "The children's paintings were hanging beside the teachers' notices." }
}).correct === true
```

### 6.2 Fix or clarify `sp_transfer_question`

Preferred approach:

- Accept both `Mia asked, "Can we start now?"` and `"Can we start now?" asked Mia.`

Alternative approach:

- Change the prompt to require a reporting-before structure.

Do not leave the current prompt broad while rejecting a valid reporting-after answer.

### 6.3 Block generic generated explanations

Add a failing test that searches every generated item at depth 4, 6, and 8 for the generic fallback explanation.

## 7. Do not do in P6

- Do not add runtime AI question generation.
- Do not raise production generated depth merely because the capacity audit passes.
- Do not treat model-answer marking as enough for open transfer questions.
- Do not accept generic generated explanations.
- Do not do cosmetic UI redesign unless it directly supports feedback clarity or reviewer QA.
- Do not expose template ids, variant signatures, validator names, or misconception tags to children.
- Do not mark telemetry as proven if the test can pass without the event being emitted.

## 8. Definition of Done

P6 is complete only when all of the following are true:

- Every fixed model answer marks correct through production marking.
- Every fixed accepted alternative marks correct through production marking.
- The `ap_transfer_possession` bug is fixed and regression-tested.
- Speech transfer fairness is fixed or prompts are tightened.
- Every generated item at depth 4, 6, and 8 has a rule-specific explanation.
- All 14 skills have an edge-case accept/reject matrix.
- All production items have been included in a human QA pack.
- All depth-6 candidate items have been included in a human QA pack if depth 6 activation is proposed.
- Perceived-variety duplicate clusters are rewritten or explicitly approved.
- Telemetry proof-level tests are deterministic, or honestly labelled as smoke-level.
- P6 verification command passes.
- The completion report states whether production remains at depth 4 or moves to depth 6, with evidence.

## 9. Recommended final decision posture

The safest P6 outcome is not necessarily a depth raise. A successful P6 may conclude:

- Keep production at depth 4 because quality review found issues that need rewrite.
- Raise only selected families to depth 6 because those families passed manual QA.
- Raise all families to depth 6 because every candidate passed marking, explanation, edge-case, and reviewer gates.

The target is not volume. The target is trustworthy learning evidence.
