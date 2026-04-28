---
title: "feat: Grammar QG P3 explanation-depth expansion"
type: feat
status: proposed
date: 2026-04-28
subject: grammar
origin: docs/plans/james/grammar/questions-generator/grammar-qg-p2-final-completion-report-2026-04-28.md
previous_plan: docs/plans/james/grammar/questions-generator/grammar-qg-p2.md
previous_release_id: grammar-qg-p2-2026-04-28
target_release_id: grammar-qg-p3-YYYY-MM-DD
---

# feat: Grammar QG P3 explanation-depth expansion

## Summary

Grammar QG P3 should expand deterministic explanation coverage across the Grammar question bank now that QG P1 has stabilised the generated-template foundation and QG P2 has closed the constructed-response marking migration.

P3 is a content-depth release, not another marking-refactor release. It should add reviewed, deterministic explanation templates for Grammar concepts that still lack an `explain` question type, while preserving P2's answer-spec discipline, Worker-private answer keys, release-scoped evidence, generated-variant governance, and no-runtime-AI scoring boundary.

The preferred P3 shape is selected-response explanation questions with explicit `answerSpecKind: 'exact'`. This gives learners practice in choosing the correct grammar reason without pretending that the platform can freely mark open written explanations.

---

## Current verified baseline after QG P2

QG P2 moved Grammar to this release-managed state:

| Measure | Current QG P2 state |
| --- | ---: |
| Content release id | `grammar-qg-p2-2026-04-28` |
| Concepts | 18 |
| Templates | 57 |
| Selected-response templates | 37 |
| Constructed-response templates | 20 |
| Generated templates | 31 |
| Fixed templates | 26 |
| Answer-spec templates | 26 |
| Constructed-response answer-spec templates | 20 / 20 |
| Legacy constructed-response adapter templates | 0 |
| Manual-review-only templates | 4 |
| Thin-pool concepts | 0 |
| Single-question-type concepts | 0 |
| Invalid answer specs | 0 |
| Templates missing answer specs | 0 |

Important P2 boundaries to preserve:

- Score-bearing Grammar marking remains deterministic.
- Runtime AI must not generate questions, answer keys, or marks.
- `manualReviewOnly` attempts must remain non-scored and must not mutate mastery, retries, misconceptions, Star evidence, reward progress, Parent Hub mistake counts, or confidence analytics.
- Worker-private fields such as `answerSpec`, accepted answers, generated variant signatures, generator family ids, and hidden correctness flags must not leak into learner-facing read models.
- Production Grammar smoke remains a manual operational gate. P3 should not weaken that situation, and should preferably make the smoke easier to run and interpret.

---

## Problem frame

P2 made the marking contract honest, but it did not expand catalogue depth. The next product-value gap is reasoning coverage.

Current QG P2 coverage includes an `explain` question type for only a subset of Grammar concepts. The concepts that already have explanation coverage are:

- `adverbials`
- `standard_english`
- `boundary_punctuation`
- `modal_verbs`
- `hyphen_ambiguity`

The remaining 13 concepts need at least one deterministic explanation template so that secure Grammar evidence is not dominated by recognise, choose, fix, rewrite, or classify tasks alone.

P3 should not make explanation mean free-form writing by default. In this phase, explanation should mean: the learner sees a grammar example and chooses the best reason from carefully authored options. The options should test misconceptions, not just vocabulary.

---

## P3 product goal

By the end of P3, every Grammar concept should have at least one `explain` template.

The expected headline denominator, if all 13 proposed templates are added, is:

| Measure | Expected QG P3 state |
| --- | ---: |
| Concepts | 18 |
| Templates | 70 |
| Selected-response templates | 50 |
| Constructed-response templates | 20 |
| Generated templates | 44 |
| Fixed templates | 26 |
| Answer-spec templates | 39 |
| Constructed-response answer-spec templates | 20 / 20 |
| Manual-review-only templates | 4 |
| Concepts with `explain` coverage | 18 / 18 |
| Thin-pool concepts | 0 |
| Single-question-type concepts | 0 |

If implementation deliberately lands fewer than 13 new templates, the release report must say why and must update the expected denominator explicitly. The default target is all 13.

---

## Scope boundaries

P3 should do the following:

- Add deterministic explanation templates for the 13 concepts without `explain` coverage.
- Use selected-response explanation prompts wherever possible.
- Give every new P3 template `requiresAnswerSpec: true` and `answerSpecKind: 'exact'`.
- Emit hidden Worker-private `answerSpec` data for every new P3 template.
- Validate each new template through the existing answer-spec validator and question-generator audit.
- Add a separate QG P3 fixture rather than overwriting the P2 baseline.
- Extend the audit to report explanation coverage by concept.
- Preserve P2 manual-review and non-scored semantics unchanged.

P3 should not do the following:

- Do not add runtime AI generation, answer-key generation, or AI marking.
- Do not add open free-text explanation marking unless the item is explicitly `manualReviewOnly`; this is not the default P3 route.
- Do not broaden P2's deterministic markers to accept vague explanations.
- Do not change Star, Mega, monster, or reward semantics.
- Do not convert manual-review-only templates into score-bearing prompts unless that redesign is explicitly reviewed as a separate content slice.
- Do not introduce a new Grammar mode, dashboard, CMS, or admin authoring surface.
- Do not expose hidden marking data, accepted answers, variant signatures, or generator family ids to learner-facing read models.

---

## Target concepts and proposed templates

Each new template should be generated from a small reviewed case bank or deterministic case generator. Target at least six reviewed cases per template where practical, with a hard minimum of four only if the grammar domain genuinely has a narrow safe pool.

| Concept | Current QG P2 question types | Proposed P3 template id | Response shape | Answer spec | Purpose |
| --- | --- | --- | --- | --- | --- |
| `sentence_functions` | `choose`, `classify`, `identify` | `qg_p3_sentence_functions_explain` | single choice | `exact` | Explain why a sentence is a statement, question, command, or exclamation. |
| `word_classes` | `choose`, `identify` | `qg_p3_word_classes_explain` | single choice | `exact` | Explain why an underlined word has a specific grammatical job in context. |
| `noun_phrases` | `build`, `choose` | `qg_p3_noun_phrases_explain` | single choice | `exact` | Explain why a phrase is, or is not, an expanded noun phrase. |
| `clauses` | `identify`, `rewrite` | `qg_p3_clauses_explain` | single choice | `exact` | Explain why a clause is subordinate or why a conjunction joins the meaning correctly. |
| `relative_clauses` | `build`, `choose`, `identify` | `qg_p3_relative_clauses_explain` | single choice | `exact` | Explain how a relative clause gives information about a noun. |
| `tense_aspect` | `fill`, `rewrite` | `qg_p3_tense_aspect_explain` | single choice | `exact` | Explain why a verb phrase shows a tense or aspect, such as progressive or perfect. |
| `pronouns_cohesion` | `choose`, `identify` | `qg_p3_pronouns_cohesion_explain` | single choice | `exact` | Explain why a pronoun makes cohesion clear or unclear. |
| `formality` | `choose`, `classify` | `qg_p3_formality_explain` | single choice | `exact` | Explain why an option is more formal or informal in context. |
| `active_passive` | `choose`, `rewrite` | `qg_p3_active_passive_explain` | single choice | `exact` | Explain why a sentence is active or passive and what has been foregrounded. |
| `subject_object` | `classify`, `identify` | `qg_p3_subject_object_explain` | single choice | `exact` | Explain why a noun phrase is the subject or object of the verb. |
| `parenthesis_commas` | `choose`, `fix` | `qg_p3_parenthesis_commas_explain` | single choice | `exact` | Explain why commas, brackets, or dashes mark parenthesis. |
| `speech_punctuation` | `fix`, `identify` | `qg_p3_speech_punctuation_explain` | single choice | `exact` | Explain why punctuation belongs inside or outside direct speech marks. |
| `apostrophes_possession` | `choose`, `rewrite` | `qg_p3_apostrophe_possession_explain` | single choice | `exact` | Explain singular and plural possession using apostrophe placement. |

Naming may be adjusted during implementation, but the concept coverage and question-type intent should not drift without an explicit release note.

---

## Explanation template authoring contract

Each P3 explanation template must include:

- A visible prompt that asks for the best grammar reason, not merely the correct answer.
- One correct explanation that names the grammar feature and explains the relevant relationship.
- At least three plausible distractors.
- Distractors mapped to real misconceptions where possible.
- A concise `feedbackLong` that gives the correct grammar reason after marking.
- A stable `generatorFamilyId`.
- A stable, answer-safe generated variant signature.
- `satsFriendly: true` only when the item genuinely matches a KS2 GPS-style reasoning task.
- `requiresAnswerSpec: true` and `answerSpecKind: 'exact'`.
- A hidden `answerSpec` emitted by the generated question object.
- No hidden answer data in the serialised learner item.

The correct option should not be a vague sentence such as "it sounds better". The correct option should use grammar language at an appropriate KS2 level, for example:

- "It is passive because the thing affected comes before the doer."
- "The apostrophe comes after the plural `s` because more than one owner is meant."
- "The clause beginning with `who` adds information about the noun."

Distractors should be educationally useful. They should represent common mistakes, such as:

- confusing a question with a statement that reports wondering
- identifying a word class from meaning rather than its job in the sentence
- treating any long phrase as a noun phrase
- confusing a subordinate clause with a relative clause
- choosing tense from time words alone rather than verb form
- treating every pronoun replacement as clearer cohesion
- confusing active/passive emphasis with past tense
- confusing singular and plural possession

---

## Implementation units

### U1. Audit and P3 baseline contract

**Goal:** Make explanation coverage an executable audit field before adding templates.

**Files likely to change:**

- `scripts/audit-grammar-question-generator.mjs`
- `tests/grammar-question-generator-audit.test.js`
- `tests/grammar-functionality-completeness.test.js`
- `tests/helpers/grammar-legacy-oracle.js`
- `tests/fixtures/grammar-legacy-oracle/grammar-qg-p3-baseline.json`
- `tests/fixtures/grammar-functionality-completeness/grammar-qg-p3-baseline.json`

**Requirements:**

- Add audit fields for:
  - `explainTemplateCount`
  - `conceptsWithExplainCoverage`
  - `conceptsMissingExplainCoverage`
  - `p3ExplanationComplete`
  - `explainCoverageByConcept`
- Keep QG P2 fixtures immutable.
- Add QG P3 fixture readers instead of repointing P2 helper paths.
- Fail the P3 release gate if any concept still lacks `explain` coverage, unless the final release report explicitly documents a smaller slice.

**Acceptance:**

- Current P2 baseline remains readable and unchanged.
- P3 audit can show the before/after movement from partial explanation coverage to full concept explanation coverage.
- Audit output names missing concepts, not only counts them.

### U2. Shared P3 explanation template helper

**Goal:** Add a small, readable helper pattern for selected-response explanation templates without creating a broad DSL.

**Files likely to change:**

- `worker/src/subjects/grammar/content.js`
- `tests/grammar-answer-spec.test.js` if new exact-shape helper behaviour needs direct marker coverage
- `tests/grammar-production-smoke.test.js` if a new visible-data smoke probe is added

**Requirements:**

- Keep the helper local to Grammar content unless it is already shared safely.
- Generate a single-choice input spec with visible `value` and `label` only.
- Shuffle option order deterministically by seed.
- Use `markByAnswerSpec` for scoring, not a one-off local equality check.
- Validate that `question.answerSpec.kind === 'exact'` for every new template.
- Keep learner-visible serialisation free of `answerSpec`, `golden`, `nearMiss`, `correct`, or hidden flags.

**Acceptance:**

- The helper reduces repetition but does not hide template meaning from review.
- The correct answer is answer-key data inside Worker-private `answerSpec`, not copied into the production-visible item before marking.

### U3. Add the 13 P3 explanation templates

**Goal:** Add one deterministic explanation template for each concept that lacks `explain` coverage.

**Files likely to change:**

- `worker/src/subjects/grammar/content.js`
- `tests/grammar-question-generator-audit.test.js`
- `tests/grammar-functionality-completeness.test.js`
- New or existing P3 content tests, for example `tests/grammar-qg-p3-explanation.test.js`

**Requirements:**

- Add the 13 templates listed in the target table.
- Mark each new template as selected response.
- Use `questionType: 'explain'`.
- Use `generative: true` where the template selects from a deterministic reviewed case bank.
- Give each template a stable `generatorFamilyId`.
- Give each template `requiresAnswerSpec: true` and `answerSpecKind: 'exact'`.
- Emit hidden answer specs over multiple seeds.
- Include at least one misconception-aligned distractor per item.
- Keep prompt language short, concrete, and KS2-appropriate.

**Acceptance:**

- All 13 target concepts gain `explain` coverage.
- Every new template produces valid answer specs for seeds such as `[1, 2, 3, 7, 19]`.
- Every generated option set has exactly one correct answer.
- No prompt has duplicated options after normalisation.
- No option accidentally exposes a hidden marker field.

### U4. Explanation quality and misconception tests

**Goal:** Prevent explanation templates from becoming weak vocabulary quizzes.

**Files likely to change:**

- `tests/grammar-qg-p3-explanation.test.js`
- `tests/grammar-question-generator-audit.test.js`
- `tests/helpers/forbidden-keys.mjs` only if a new leak pattern is discovered

**Requirements:**

- For each template, test at least one correct response and one wrong response.
- Ensure wrong responses map to a known Grammar misconception where the item has a natural misconception.
- Check that correct explanations contain a grammar reason, not only a repeated label.
- Check that distractors are not identical after punctuation/case/whitespace normalisation.
- Check that every new explanation template has solution or feedback copy that teaches after marking without leaking before marking.

**Acceptance:**

- P3 templates are reviewable as teaching content, not only as option lists.
- A child cannot pass by choosing the longest or most technical-looking option across the whole bank.

### U5. Scheduler and read-model preservation

**Goal:** Add explanation depth without distorting smart practice or leaking answer data.

**Files likely to change:**

- `worker/src/subjects/grammar/selection.js`
- `tests/grammar-selection.test.js`
- `worker/src/subjects/grammar/read-models.js` only if content statistics need to expose explanation coverage safely
- `tests/grammar-ui-model.test.js` if content statistics affect UI summaries

**Requirements:**

- Preserve generated variant freshness and answer-safe signatures.
- Ensure the larger `explain` pool can be selected by smart practice without dominating every session.
- Ensure question-type weakness can still cause explain practice when appropriate.
- Keep focus-mode and mini-pack selection stable.
- Do not schedule manual-review-only templates into SATS mini-tests.
- Do not add answer-spec or generator metadata to learner-facing read models.

**Acceptance:**

- Smart practice can surface explain questions naturally.
- Existing selection tests still pass.
- New tests prove an explain item can appear when explain is weak or due, without creating an explain-only queue.

### U6. Production smoke and redaction safety

**Goal:** Keep the P2 production-visible-data discipline intact after adding more selected-response explanation templates.

**Files likely to change:**

- `scripts/grammar-production-smoke.mjs`
- `tests/grammar-production-smoke.test.js`

**Requirements:**

- Keep the six existing answer-spec family probes: `exact`, `multiField`, `normalisedText`, `punctuationPattern`, `acceptedSet`, and `manualReviewOnly`.
- Add an optional P3 explanation probe using one new `qg_p3_*_explain` template if it improves release confidence.
- Smoke must answer from visible options or visible prompt structure only.
- Smoke must not read hidden `answerSpec` data to derive an answer.
- Forbidden-key scans must continue across start, feedback, summary, mini-test, support, AI-enrichment, adult, or admin-visible read models as applicable.

**Acceptance:**

- Production smoke still proves that explanation options are answerable from production-visible data only.
- No P3 content leaks hidden answer metadata.

### U7. Release docs and operational handoff

**Goal:** Produce a clear P3 completion report that records the new denominator, quality gates, and known residual risks.

**Files likely to change:**

- `docs/plans/james/grammar/questions-generator/grammar-qg-p3-completion-report.md`
- `docs/plans/james/grammar/questions-generator/grammar-qg-p3-final-completion-report-YYYY-MM-DD.md`
- Any release checklist or deployment note that references Grammar production smoke

**Requirements:**

- Record the final template denominator.
- Record concepts with explain coverage as `18 / 18` if the full P3 target lands.
- Record answer-spec counts and answer-spec kind distribution.
- Record generated/fixed counts.
- Record any skipped or deferred template with a reason.
- Record production-smoke status and whether it was run post-deploy.
- Record whether legacy repeated generated variants remain advisory.
- Record any bundle budget impact.

**Acceptance:**

- The report should make it obvious whether P3 is complete, partial, or blocked.
- The report should not describe surface-variant count as the main learning denominator. The honest denominator remains reviewed template families and concept/question-type coverage.

---

## Suggested content patterns by concept

### Sentence functions

Use examples that separate grammar function from final punctuation alone.

Good cases:

- A command with or without an exclamation mark.
- A statement that reports a question but is not itself a question.
- An exclamation beginning with `What` or `How` where appropriate.

Avoid cases where punctuation alone makes the answer trivial.

### Word classes

Use short sentences where the same-looking word type could be confused by meaning.

Good cases:

- `after` as a preposition versus an adverbial expression.
- `light` as noun, adjective, or verb in different sentences.
- `that` as determiner, pronoun, or conjunction only if the case is unambiguous for KS2.

Avoid obscure terminology or adult register.

### Noun phrases

Test the noun-centred structure.

Good cases:

- Expanded noun phrase versus full clause.
- Preposition phrase inside a noun phrase.
- Adjective stack that still centres on one noun.

Avoid prompts where every long string looks plausible.

### Clauses

Test dependence and meaning.

Good cases:

- `because`, `although`, `when`, `if` subordinate clauses.
- Main clause versus subordinate clause contrast.
- Explanation of why a sentence fragment is incomplete.

Avoid joining examples that permit many legitimate rewrites unless they are not being marked as free text.

### Relative clauses

Test attachment to a noun.

Good cases:

- `who`, `which`, `that`, `where`, `whose`.
- Relative clause versus time clause.
- Essential versus additional information only if KS2 wording stays simple.

Avoid advanced terminology beyond the current product's grammar language.

### Tense and aspect

Test verb form, not time-word guessing.

Good cases:

- Present perfect versus simple past.
- Past progressive versus simple past.
- Past perfect as earlier past action.

Avoid cases where a time adverb alone identifies the answer.

### Pronouns and cohesion

Test clarity of reference.

Good cases:

- Pronoun clearly refers back to one noun.
- Ambiguous pronoun with two possible referents.
- Repeating a noun is clearer than using a pronoun.

Avoid unfair examples where real readers could reasonably disagree.

### Formality

Test purpose and audience.

Good cases:

- Formal request versus chatty wording.
- Contractions or slang in inappropriate context.
- Passive or nominalised formal style only where not too advanced.

Avoid treating dialect as wrong. The focus is suitability for formal written Standard English, not social judgement.

### Active and passive

Test sentence emphasis and doer/receiver roles.

Good cases:

- Active sentence foregrounds the doer.
- Passive sentence foregrounds the thing affected.
- Passive hides the doer.

Avoid explaining passive as simply "past tense".

### Subject and object

Test relationship to the verb.

Good cases:

- Simple active sentence.
- Sentence with fronted adverbial before the subject.
- Sentence with an expanded noun phrase as subject or object.

Avoid sentences where subject complement or intransitive verbs make the object concept ambiguous.

### Parenthesis and commas

Test removable extra information.

Good cases:

- Paired commas around parenthesis.
- Brackets and dashes as alternatives for parenthesis.
- Contrast parenthesis commas with list commas or fronted-adverbial commas.

Avoid examples where comma placement is a style choice rather than a grammar signal.

### Speech punctuation

Test where spoken words begin and end.

Good cases:

- Question mark inside speech marks.
- Comma before or after reporting clause.
- Reporting clause after direct speech.

Avoid quote-style debates; use the same house style as existing Grammar content.

### Apostrophes for possession

Test owner number and apostrophe position.

Good cases:

- Singular owner: `the girl's bag`.
- Regular plural owner: `the girls' bags`.
- Irregular plural owner only if already supported by content vocabulary.

Avoid mixing omission/contraction apostrophes into the same prompt unless the question is explicitly about contrast.

---

## Tests and verification commands

Recommended targeted checks during implementation:

```bash
node --check worker/src/subjects/grammar/content.js
node --check worker/src/subjects/grammar/answer-spec.js
node --check scripts/audit-grammar-question-generator.mjs
node --test tests/grammar-question-generator-audit.test.js
node --test tests/grammar-functionality-completeness.test.js
node --test tests/grammar-answer-spec.test.js
node --test tests/grammar-production-smoke.test.js
node --test tests/grammar-selection.test.js
node --test tests/grammar-engine.test.js
```

If a new P3 explanation test file is added:

```bash
node --test tests/grammar-qg-p3-explanation.test.js
```

Before final release report:

```bash
node scripts/audit-grammar-question-generator.mjs --json
npm test
npm run check
npm run build && npm run audit:client
```

Post-deploy or release-sign-off smoke:

```bash
npm run smoke:production:grammar
```

The production smoke remains an operational gate unless a separate release-process slice wires it into CI or deploy automation.

---

## Acceptance criteria

P3 is complete only when all of the following are true:

1. Grammar has `explain` coverage for all 18 concepts.
2. The QG P3 audit reports no missing explanation concepts.
3. The new P3 templates are deterministic and teacher-authored.
4. No runtime AI path can generate, mark, or award evidence for P3 questions.
5. Every new P3 template uses `requiresAnswerSpec: true` and emits valid hidden `answerSpec` data.
6. The new templates do not introduce hidden answer data into learner-facing read models.
7. The P3 fixture is separate from the P2 fixture.
8. P2 manual-review-only semantics still pass unchanged.
9. P2 constructed-response answer-spec completeness still passes unchanged.
10. Generated variant signatures remain answer-safe.
11. New P3 generated templates have no repeated variants across the release-gate sample, except where deliberately documented and treated as advisory only for legacy families.
12. Smart practice can select explanation questions without collapsing into explanation-only practice.
13. SATS mini-tests do not include manual-review-only templates.
14. Production smoke still covers all answer-spec families and remains answer-key-redaction safe.
15. The completion report records final counts, known caveats, and post-deploy smoke status.

---

## Known residual risks to carry into P3

| Risk | Why it matters | P3 handling |
| --- | --- | --- |
| Production Grammar smoke is still manual | A strong smoke is useful only when someone runs it. | Keep the smoke current; record run status in the completion report; automate in a later release-gate phase. |
| Legacy generated families still have advisory repeated variants | Existing repeated surface variants can reduce freshness even if P3 content is clean. | Keep strict gating for new P3 templates; do not expand the legacy advisory issue silently. |
| Explanation distractors can become too obvious | Weak distractors make explanation templates look deeper than they are. | Add quality tests and manual review for each option set. |
| Selected-response explanations can still be guessed | Multiple-choice reasoning is not the same as open explanation. | Use misconceptions, varied examples, and later consider constrained written explanations as a separate phase. |
| Bundle budget remains tight | Grammar UI changes can affect first-paint size. | Avoid client-side imports of content, answer specs, or Worker-only helpers. |
| Stale comments from the marking migration may remain | Comments that still describe a migration window can confuse future implementers. | Opportunistically clean comments that contradict the P2-complete state, without changing behaviour. |

---

## Out of scope for P3, but likely next

After P3, the next sensible phase is QG P4: deterministic generator-depth and mixed-transfer expansion.

P4 should probably focus on:

- richer generated case banks for legacy repeated-variant families
- mixed Grammar transfer tasks
- late-stage secure-evidence tasks across multiple concepts
- selective redesign of manual-review-only prompts into constrained deterministic prompts where educationally worthwhile
- scheduler evidence rules that require breadth across recognise, fix, rewrite, build, classify, and explain tasks before high-confidence mastery

P5 should then harden release automation, especially production smoke automation and content-denominator dashboards.

P6 should use real learner telemetry to calibrate mastery thresholds, retention checks, template retirement, and misconception repair.

---

## Final instruction to the implementing agent

Treat P3 as a reasoning-coverage release. Do not chase a large theoretical question count. The aim is not to say Grammar has thousands more generated variants; the aim is to make every Grammar concept capable of testing whether the learner understands the reason behind the answer.

The safest implementation path is:

1. Add explanation-coverage audit fields first.
2. Add a small selected-response explanation helper.
3. Add the 13 reviewed explanation templates.
4. Validate answer specs, distractors, signatures, redaction, and scheduler behaviour.
5. Freeze the P3 fixture and write the completion report.

If any part of P3 creates pressure to use free-text auto-marking, stop and redesign the prompt into a constrained deterministic form or mark it `manualReviewOnly`. The product should remain honest about what it can judge.
