# Grammar QG P8 — Production Question Quality Certification

Date: 29 April 2026  
Subject: Grammar  
Phase: QG P8  
Depends on: Grammar QG P7 production calibration activation  
Status: Proposed implementation brief  
Language: UK English

## 1. Purpose

P1–P7 has built the Grammar QG system: deterministic templates, answer-spec marking, full concept coverage, explanation coverage, mixed-transfer templates, deep-seed governance, telemetry plumbing, event expansion, calibration scripts and admin review infrastructure.

P8 should now return to the first principle:

> The learner should receive high-quality, logically sound, age-appropriate, unambiguous Grammar questions that genuinely deepen KS2 mastery.

P8 is not primarily a feature phase, an analytics phase or a template-count phase. It is a production-quality certification phase for the actual questions the system can show.

The expected outcome is a certified Grammar question pool where every template family, every input shape and every concept has been reviewed against automated oracles and adult content judgement.

## 2. P8 headline goal

By the end of P8, the team should be able to say:

> We have not only built a generator. We have certified the questions it generates.

This means:

- no known no-op “fix this” items;
- no hidden ambiguous correct answers;
- no option set where two options are defensible as correct;
- no generated item where the raw prompt already passes the answer spec;
- no question that relies on niche world knowledge rather than grammar;
- no constructed-response item with unsafe over-acceptance or unfair under-acceptance;
- no UI surface that makes the right answer hard to enter because of device, punctuation, table layout or copy mechanics;
- no learner-facing answer leakage;
- no report claim without an artefact behind it.

## 3. Starting baseline

P8 starts from the P7/P6 content denominator:

| Measure | Start value |
|---|---:|
| Content release ID | `grammar-qg-p6-2026-04-29` |
| Concepts | 18 |
| Templates | 78 |
| Selected-response templates | 58 |
| Constructed-response templates | 20 |
| Generated templates | 52 |
| Fixed templates | 26 |
| Answer-spec templates | 47 |
| Constructed-response answer-spec templates | 20 / 20 |
| Manual-review-only templates | 4 |
| Explanation templates | 17 |
| Mixed-transfer templates | 8 |
| Deep low-depth generated families | 0 |
| Default-window repeated variants | 0 |
| Cross-template signature collisions | 0 |
| Content-quality hard failures | expected 0 |
| Content-quality advisories | expected 0 |

P8 may bump the content release ID if it changes visible content, answer specs, feedback, prompts, options, accepted answers or marking behaviour. If P8 only adds review tooling and certification reports, no content release bump is needed. The known no-op speech-punctuation item means a content bump is likely.

Recommended release ID if content changes:

```js
export const GRAMMAR_CONTENT_RELEASE_ID = 'grammar-qg-p8-YYYY-MM-DD';
```

## 4. Non-goals

P8 must not:

- use AI to generate production Grammar questions;
- use AI to mark production Grammar answers;
- add a large new template bank before quality certification is complete;
- change Stars, Mega, monsters, rewards, Hero Mode, Concordium or mastery semantics;
- promote mixed-transfer scoring weight from shadow mode into production;
- make cosmetic UI changes that do not improve question comprehension, answer entry or feedback clarity;
- treat telemetry scripts as proof that the content is pedagogically correct;
- hide unresolved content issues behind aggregate pass counts.

AI may be used offline to help reviewers brainstorm possible edge cases, but committed production questions must remain deterministic, reviewed and source-controlled.

## 5. Known validation findings to address first

### Finding 1 — no-op legacy speech-punctuation fix item

A local structural scan of all 78 templates across seeds 1–30 found one hard content issue:

- `templateId`: `speech_punctuation_fix`
- `seed pattern`: `2, 5, 8, 11, 14, 17, 20, 23, 26, 29`
- `raw/near-miss`: `"Sit down!" said the coach.`
- `golden`: `"Sit down!" said the coach.`

This is a “fix the punctuation” item where the learner-visible raw sentence already matches the accepted answer. The current answer spec therefore marks the unmodified prompt as correct.

P8 must fix the source fixture. A suitable raw prompt should be genuinely incomplete, for example:

`"Sit down" said the coach.`

with the accepted answer:

`"Sit down!" said the coach.`

or another reviewed direct-speech item that tests the intended rule.

### Finding 2 — current content-quality audit misses this no-op

The existing `fix-task-noop` rule compares the full stripped stem HTML with the accepted answer. Because the stem contains the instruction as well as the sentence, the raw prompt is unlikely to equal the accepted answer exactly. The audit should compare the actual raw/near-miss sentence or evaluate the prompt candidate against the answer spec.

P8 must add a stronger rule:

- for every fix template with an `answerSpec.golden` and `answerSpec.nearMiss`, every near-miss must mark incorrect;
- every golden answer must mark correct;
- no near-miss may normalise to the same value as any golden answer;
- if the visible prompt contains an extracted raw sentence, that raw sentence must not mark correct unless the template is explicitly “choose the already correct sentence”.

### Finding 3 — report/frontmatter validation is still not strict enough

P7 introduced report validation and placeholder rejection, but `pending-report-commit` is not rejected by the exact placeholder-token rule. P8 should reject placeholder-like values such as:

- `pending-report-commit`
- `pending-commit`
- `report-pending`
- `tbd-report`
- `unknown-report`

The CLI validator should also call both:

- `validateGrammarCompletionReport(...)`
- `validateReleaseFrontmatter(...)`

against the actual final report file used by the release.

### Finding 4 — post-deploy smoke remains not-run

P7 correctly states that post-deploy smoke was not run. P8 should either run it and attach evidence or keep the wording honest. Do not blur repository tests, configured-origin smoke and post-deploy Cloudflare Worker smoke.

## 6. Implementation units

### U0 — Fix known hard content issue and audit gap

**Scope**  
Fix the no-op `speech_punctuation_fix` item and make the audit able to catch the class of issue.

**Required changes**

- Update the legacy speech-punctuation fixture so the raw sentence is genuinely incorrect.
- Add a content-quality rule: `near-miss-marks-correct`.
- Add a content-quality rule: `near-miss-equals-golden`.
- Add a regression test using the previous failing item.
- Run the new quality audit across at least seeds 1–30.

**Acceptance criteria**

- The old raw sentence no longer marks correct.
- The new golden answer marks correct.
- The content-quality audit would fail if `nearMiss` equals `golden`.
- The audit result is 0 hard failures and 0 unwaived advisories.

### U1 — Master question inventory

**Scope**  
Generate a human-reviewable inventory of every question shape the pool can produce in the selected certification window.

**Recommended script:**

`scripts/generate-grammar-qg-quality-inventory.mjs`

**Recommended outputs:**

- `reports/grammar/grammar-qg-p8-question-inventory.json`
- `reports/grammar/grammar-qg-p8-question-inventory.md`
- `reports/grammar/grammar-qg-p8-question-inventory-redacted.md`

The full internal JSON may include answer specs and expected answers. The redacted Markdown must be safe for learner-facing or parent-facing review and must not expose hidden answer internals.

**Required fields**  
Each generated item should include:

```js
{
  contentReleaseId,
  templateId,
  seed,
  itemId,
  conceptIds,
  questionType,
  inputType,
  isGenerated,
  isMixedTransfer,
  answerSpecKind,
  marks,
  promptText,
  visibleOptionsOrRows,
  expectedAnswerSummary,
  misconceptionId,
  solutionLines,
  variantSignature,
  generatorFamilyId,
  reviewStatus
}
```

**Certification window**  
Use all of the following:

- all 78 templates;
- seeds 1–60 for generated families;
- all finite static fixtures where arrays can be enumerated;
- all known P1–P7 regression seeds;
- all seeds that previously caused low-depth or no-op issues.

**Acceptance criteria**

- Every template appears in the inventory.
- Every generated family has enough visible variants for review.
- Every item can be traced back to template ID and seed.
- The redacted version has no hidden answer data.
- The internal version is suitable for adult reviewer sign-off.

### U2 — Automated question-quality oracles

**Scope**  
Create automated tests that check the question itself, not only the denominator.

**Recommended test file:**

`tests/grammar-qg-p8-question-quality.test.js`

**Required oracles**

**Selected response**  
For `single_choice`, `checkbox_list` and `table_choice`:

- exactly one fully correct response path exists;
- correct options are present exactly once;
- no duplicate normalised option values;
- no duplicate row keys;
- no duplicate labels that make learner selection unclear;
- distractors are not accepted by the marker;
- `multiField` partial credit behaves as expected.

**Constructed response**  
For `normalisedText`, `acceptedSet` and `punctuationPattern`:

- every golden answer marks correct;
- every near-miss marks incorrect or partial according to the spec;
- no near-miss equals a golden answer;
- the visible raw prompt does not already pass;
- `answerText` does not contradict the golden answer;
- `feedbackLong` names the actual fix.

**Manual-review-only**  
For `manualReviewOnly`:

- response is saved but non-scored;
- `maxScore` is 0;
- no mastery, Star, retry, confidence or Parent Hub mistake mutation happens;
- learner copy clearly says it is for review and not auto-marked.

**Redaction**  
For all input types:

- learner current-item read model has no `answerSpec`, `golden`, `nearMiss`, `accepted`, `variantSignature`, `generatorFamilyId` or hidden answer path;
- post-answer feedback may explain the answer but must not expose reusable internals that let the next generated question be solved mechanically.

**Acceptance criteria**

- All oracles run in `verify:grammar-qg-p8`.
- Failures include template ID, seed, input type and visible prompt.
- Any intentional exception requires a reviewer-owned allowlist entry with expiry.

### U3 — Concept-by-concept expert review

**Scope**  
Run adult content review over all 18 concepts using concept-specific rubrics.

The goal is not to ask “does the code pass?” but “would a strong KS2 grammar teacher accept this item as fair, precise and useful?”

**Review rubric by concept**

| Concept | Key edge cases to review |
|---|---|
| `sentence_functions` | Exclamations must follow KS2 grammar expectations, not just excited punctuation. Commands with “please” must still be commands. Indirect questions must not be treated as direct questions. |
| `word_classes` | Words must be classified by job in sentence. Avoid ambiguous cases such as noun modifiers being treated as adjectives without explanation. Ensure tokenisation does not create unfair choices. |
| `noun_phrases` | Expanded noun phrases must centre on a noun. Avoid accepting whole clauses or adverbials. Make sure modifiers clearly belong to the noun. |
| `adverbials` | Fronted adverbial comma items should not confuse subordinate clauses, prepositional phrases and ordinary subject starters. |
| `clauses` | Subordinate/main clause distinctions must be structurally correct. Avoid comma-splice acceptance. |
| `relative_clauses` | Relative clauses must attach to nouns. “That”, “which”, “who”, “whose”, “where” and “when” need clear context. |
| `tense_aspect` | Present perfect, progressive and past perfect must match time meaning. Avoid time adverbs that make both simple past and present perfect plausible. |
| `standard_english` | Frame as formal written Standard English without stigmatising dialect or spoken English. |
| `pronouns_cohesion` | Pronoun referents must be genuinely clear or genuinely ambiguous. Do not rely only on nearest noun rules. |
| `formality` | Formality must not be reduced to “longer word = formal”. Context should justify the register. |
| `active_passive` | Passive voice must involve grammatical voice, not just “something happened”. Avoid adjectival passive ambiguity where possible. |
| `subject_object` | Distinguish grammatical subject/object from semantic doer/receiver, especially in passive transfer items. |
| `modal_verbs` | Modal strength must match context. Avoid contexts where “could”, “might”, “should” and “must” are all arguable. |
| `parenthesis_commas` | Parenthesis should be removable without breaking the main sentence. Paired punctuation must be checked as a pair. |
| `speech_punctuation` | Straight and curly quotes, punctuation inside speech marks, reporting-clause commas and full stops must be handled consistently. |
| `apostrophes_possession` | Singular/plural possession, irregular plurals and contractions must not be confused. |
| `boundary_punctuation` | Colon, semi-colon and dash prompts must require the chosen boundary mark, not merely permit it stylistically. |
| `hyphen_ambiguity` | Hyphens should remove real ambiguity. Avoid unnecessary hyphens after `-ly` adverbs. |

**Acceptance criteria**

- Every concept has a reviewer sign-off entry.
- Every rejected item has a severity and action.
- No “reviewed by passing tests” shortcut is allowed.
- The review register is committed.

**Recommended review register:**

`reports/grammar/grammar-qg-p8-content-review-register.json`

### U4 — UX/UI support audit

**Scope**  
Review whether the learner interface supports the question types without creating avoidable friction or accidental unfairness.

This is not cosmetic. It is about answerability, accessibility and clarity.

**Input types to audit**

| Input type | UX checks |
|---|---|
| `single_choice` | Option wrapping, tap targets, keyboard navigation, screen-reader labels, no hidden overflow on mobile. |
| `checkbox_list` | Clear “select all that apply” copy, selected state visibility, no accidental single-choice styling. |
| `table_choice` | Mobile layout, row/column header association, keyboard navigation, ARIA role/labels, no horizontal scrolling that hides choices. |
| `text / constructed response` | Smart punctuation tolerance, quote entry support, mobile punctuation keyboard friction, copy-the-sentence affordance, clear answer box width. |
| `manual review` | Clear non-scored copy, no “wrong” styling, saved-for-review state. |

**Required UX improvements if missing**

- Highlight the exact changed punctuation after submission for fix tasks.
- Provide a copyable raw sentence or pre-filled editable sentence only if it does not leak the answer.
- Show direct-speech quote guidance where quote entry is expected.
- Make table-choice items usable on narrow screens without horizontal confusion.
- Ensure feedback distinguishes “grammar idea right but punctuation incomplete” from fully wrong.
- Provide screen-reader friendly row/column labelling for table classifications.

**Acceptance criteria**

- Representative examples of all input types are tested on desktop and mobile widths.
- Keyboard-only interaction works for all selected-response types.
- Screen-reader labels make table-choice items understandable.
- Constructed-response punctuation entry is not unnecessarily difficult on mobile.
- UX changes do not expose hidden answer data before submission.

### U5 — Feedback quality review

**Scope**  
Review feedback and solution lines for teaching value.

A correct answer alone is not enough. The feedback should help the learner repair the misconception.

**Feedback rules**  
Each scored item should satisfy:

- feedback names the grammar feature;
- feedback explains why the answer is correct;
- feedback is short enough for KS2 learners;
- feedback does not shame dialect or spoken forms;
- feedback does not reveal a general trick that makes future generated items trivial;
- feedback for mixed-transfer items names the transfer relationship;
- feedback for punctuation items identifies the exact punctuation change.

**Acceptance criteria**

- Every template has at least one reviewed feedback sample.
- Mixed-transfer feedback remains complete after P8 changes.
- Speech punctuation and apostrophe feedback use consistent quote/apostrophe typography.
- Feedback issues are tracked in the review register.

### U6 — Production smoke and live-readiness gate

**Scope**  
Run the real production-readiness gate for the active release.

**Required evidence**

- repository test evidence;
- configured-origin smoke evidence, if used;
- post-deploy production smoke evidence, if deployment occurred;
- question-quality audit evidence;
- review-register summary;
- UX support audit summary.

**Acceptance criteria**

- Post-deploy smoke is either run and evidenced or explicitly marked not-run.
- Smoke evidence path matches the actual script output path.
- Smoke includes at least one item from each major input family:
  - single choice;
  - checkbox list;
  - table choice;
  - punctuation constructed response;
  - normalised text constructed response;
  - manual-review-only.
- Smoke does not read hidden answer specs to submit answers.

### U7 — P8 final report and certification decision

**Required report**  
Create:

`docs/plans/james/grammar/questions-generator/grammar-qg-p8-final-completion-report-YYYY-MM-DD.md`

The report must include:

- final content release ID;
- whether the denominator changed;
- known issue list before P8;
- fixed issue list;
- unresolved issue list with severity;
- automated quality audit summary;
- adult content review summary;
- UX support audit summary;
- smoke evidence status;
- exact commands run;
- whether post-deploy smoke was run;
- whether production telemetry was used;
- certification decision.

**Certification decisions**  
Use one of:

| Decision | Meaning |
|---|---|
| `certified` | All known hard and high-risk content issues fixed; no unresolved high-risk UX issue. |
| `certified_with_watchlist` | No blocker remains, but medium-risk issues are tracked for next release. |
| `not_certified` | Hard content, marking, redaction or UX issues remain. |

Do not use `certified` if any known no-op fix item, ambiguous correct answer, hidden-answer leak or production-blocking UI issue remains.

## 7. Suggested commands

Add a P8 release gate:

```json
{
  "verify:grammar-qg-p8": "npm run verify:grammar-qg-p7 && node --test tests/grammar-qg-p8-question-quality.test.js tests/grammar-qg-p8-ux-support.test.js tests/grammar-qg-p8-review-register.test.js && node scripts/audit-grammar-content-quality.mjs --seeds=1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30 --json && node scripts/generate-grammar-qg-quality-inventory.mjs --seeds=1..60"
}
```

Run at minimum:

- `npm run audit:grammar-qg`
- `npm run audit:grammar-qg:deep`
- `node scripts/audit-grammar-content-quality.mjs --seeds=1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30 --json`
- `node --test tests/grammar-qg-p8-question-quality.test.js`
- `node --test tests/grammar-qg-p8-ux-support.test.js`
- `node --test tests/grammar-qg-p8-review-register.test.js`
- `npm run verify:grammar-qg-p7`
- `npm run verify:grammar-qg-p8`

If deployed:

- `npm run smoke:production:grammar -- --json --evidence-origin post-deploy`

## 8. Expected artefacts

| Artefact | Purpose |
|---|---|
| `reports/grammar/grammar-qg-p8-question-inventory.json` | Internal full inventory with answer metadata. |
| `reports/grammar/grammar-qg-p8-question-inventory.md` | Adult review pack. |
| `reports/grammar/grammar-qg-p8-question-inventory-redacted.md` | Learner-safe / parent-safe sample pack. |
| `reports/grammar/grammar-qg-p8-content-review-register.json` | Adult concept-by-concept certification. |
| `reports/grammar/grammar-qg-p8-quality-audit.json` | Automated oracle results. |
| `reports/grammar/grammar-qg-p8-ux-support-audit.md` | UX/input-type support review. |
| `reports/grammar/grammar-qg-p8-certification-summary.md` | Final certification summary. |

## 9. Severity model

Use a simple severity model for all P8 issues.

| Severity | Examples | Release rule |
|---|---|---|
| S0 blocker | Hidden answer leak; marker accepts wrong answer; no-op fix task; two correct MCQ answers. | Must fix before certification. |
| S1 high | Ambiguous grammar judgement; unfair UI on mobile; constructed response too brittle for expected answer. | Fix or explicitly remove from scored practice. |
| S2 medium | Feedback incomplete; weak distractor; low case depth but no marking risk. | Can ship only with watchlist and owner. |
| S3 low | Copy polish; minor layout improvement; reviewer note. | Can defer. |

## 10. P8 success definition

P8 is successful when:

- The known `speech_punctuation_fix` no-op item is fixed.
- The content-quality audit catches near-miss/golden equality and raw-prompt-passes cases.
- Every selected-response item in the certification window has exactly one correct path.
- Every constructed-response item in the certification window has golden/near-miss checks.
- All 18 concepts have adult review sign-off.
- All input types have UX support sign-off.
- Feedback has been reviewed for clarity and learning value.
- The pool is either certified or certified with an explicit watchlist.
- No runtime AI generation, AI marking, reward change or mastery scoring change is introduced.
- Future expansion is driven by certified gaps rather than raw template-count ambition.

## 11. Recommended direction after P8

If P8 certifies the pool, future work should split into two streams:

**Quality maintenance**

- run the P8 quality gate on every content release;
- keep the review register current;
- require adult sign-off for every new template or case bank;
- use production telemetry to prioritise fixes.

**Evidence-led expansion**  
Only add new templates when the P8/P7 evidence shows a real gap:

- a concept has weak retention;
- mixed-transfer evidence shows a bridge is missing;
- a template is too easy and needs a harder sibling;
- production learners repeatedly fail because feedback or representation is insufficient;
- SATS-style breadth is underrepresented.

Do not add more questions just to claim a larger pool. Add questions because they improve quality, depth, width or proven learning evidence.
