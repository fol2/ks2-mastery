I inspected the repo docs and the visible Grammar implementation. The main finding is this: **Grammar is not missing as a subject anymore; it has a real Worker-backed implementation. The problem is that the repo now overstates “completeness” while several product-quality, adaptive-learning, content-depth, and QA details still need closing.** I did not run the repo test suite locally here, so treat the items below as a code/doc inspection and execution plan, not proof of failing tests.

The repo README says Grammar is currently a **Stage 1 Worker-command-backed practice surface** with React setup/session/feedback/summary/analytics states, and also says both Grammar and Punctuation are not yet the full finished subject layer. It also confirms production expects Worker auth and that `?local=1` is not the real local runtime anymore. ([GitHub][1])

## What is already implemented well

Grammar has the right skeleton now. The subject folder contains the expected client module, read model, speech support, metadata, event hooks, and React scenes for setup, session, summary, analytics, and the practice surface. ([GitHub][2]) ([GitHub][3])

The Worker side also exists, with `commands.js`, `content.js`, `engine.js`, `read-models.js`, and `ai-enrichment.js`, so scoring/scheduling is not just a browser HTML clone. ([GitHub][4])

The repo has the intended denominator: 18 concepts, 51 templates, 31 selected-response templates, 20 constructed-response templates, and eight mode IDs: `learn`, `smart`, `satsset`, `trouble`, `surgery`, `builder`, `worked`, and `faded`. ([GitHub][5])

The architectural direction is also right: Worker-owned state, deterministic content, redacted read models, AI as enrichment only, no client-side localStorage authority, and no direct shipping of the old single-file HTML. ([GitHub][6]) ([GitHub][7])

The attached KS2 maths prototype is useful as a pattern because it uses the right mastery loop: independent first attempt, minimal nudge, worked/faded support only when needed, retry, and spaced return. Grammar needs the same loop, but with grammar-specific marking/content constraints rather than a direct port. 

## Missing or flawed areas I would fix before calling Grammar “perfected”

### 1. The docs overclaim completion before the product has enough behavioural proof

The functionality-completeness doc says strict mini-test, goals, settings, repair, AI triggers, read aloud, adult/data replacement, and smoke coverage are all completed. But the same area also says production Grammar smoke remains a manual post-deploy gate, and the earlier region plan still leaves ongoing `npm test`, `npm run check`, and Grammar production/UI smoke as follow-up work. ([GitHub][8]) ([GitHub][6])

The existing completeness test appears to validate denominators, statuses, evidence-file references, mode metadata, and capability flags. That is useful, but it is not enough to prove the actual user flows are polished. ([GitHub][9]) ([GitHub][9])

**Execution fix:** add behaviour-level tests before more UI polish. The suite should prove: no mini-test feedback before finish, timer expiry marks correctly, navigation preserves answers, repair only affects supported mastery, read-aloud does not leak answers, AI output is never score-bearing, and adult views are properly redacted.

### 2. Adaptive selection looks thinner than the plan

The plan calls for a proper mastery engine tracking concept, template, question type, generated item, misconceptions, retry, event, and session state. It also expects adaptive selection to consider due items, weak concepts, recent wrongs, under-secured question types, and repeat avoidance. ([GitHub][6]) ([GitHub][6])

From the visible Worker engine, `weightedTemplatePick` appears to weight mainly average strength, status, focus concept, and generative templates. I did not see clear evidence of a strong recent-repeat penalty, recent-miss recycling, or question-type weakness weighting in the selector snippet. ([GitHub][10])

Mini-set generation also appears to call template selection repeatedly. That risks repeated concepts/templates unless there is balancing elsewhere. The legacy review specifically warned that some concept pools only have two or three templates, meaning adaptive practice can repeat quickly. ([GitHub][10]) ([GitHub][11])

**Execution fix:** split selection into a tested pure function:

`buildGrammarPracticeQueue({ mode, focusConceptId, dueQueue, mastery, recentEvents, questionTypeStats, seed })`

It should score candidates with explicit weights for due status, weak concepts, recent misses, question-type weakness, template freshness, concept freshness, and focus matching. For strict mini-tests, use a separate pack builder with concept/question-type quotas and repeat caps.

### 3. Smart Review support scoring may be too broad

The engine has quality logic where supported correct answers count less than independent first-attempt correct answers, which is the right principle. ([GitHub][10])

But the visible `supportLevelForSession` logic suggests that Smart Review with `allowTeachingItems` enabled may assign support level 1 at the session level. If that is true, ordinary Smart Review answers may be downweighted just because the setting is enabled, even when the learner did not actually use faded/worked help. ([GitHub][10])

**Execution fix:** make support evidence item-level, not session-level. Store:

`firstAttemptIndependent: true/false`
`supportUsed: none | nudge | faded | worked | ai-explanation-after-marking`
`supportLevelAtScoring: 0 | 1 | 2`

Then mastery gain should be reduced only when support was actually shown before the scored attempt.

### 4. Legacy content gaps are still real

The legacy review is clear that the old HTML had a strong grammar base, but it was not perfect. It had 18 concepts and 51 templates, but remaining gaps included: vocabulary coverage only indirectly through formal vocabulary, paragraph-level writing transfer not really covered, only two explain-style templates, and some concept pools being too small for long-term adaptive practice. ([GitHub][11])

That means “ported the denominator” is not the same as “finished Grammar”.

**Execution fix:** expand the content library after stabilising the engine. Prioritise:

More explanation templates: “explain why”, “correct the misconception”, “choose and justify”.

More vocabulary/formality templates: Standard English, precise vocabulary, cohesion choices, register shifts.

More constructed-response templates with deterministic accepted answers.

More mixed templates that distinguish similar concepts: subordinate clause vs relative clause, adverbial vs preposition phrase, subject/object vs active/passive, apostrophe possession vs contraction, hyphen ambiguity vs dash/parenthesis.

### 5. Transfer writing is still placeholder-level

The React practice surface includes transfer placeholders for paragraph application and richer writing tasks. The copy says the first paragraph-transfer lane will be non-scored, teacher-reviewed, and separate from score/retry/reward/Concordium progress. ([GitHub][12])

That boundary is sensible, but it means the current Grammar product still lacks the polished “use grammar in writing” endpoint.

**Execution fix:** ship a non-scored transfer lane, but do not pretend it is mastered scoring. It should provide short paragraph prompts, grammar targets, checklist feedback, teacher/parent review copy, and saved evidence. It should not affect mastery, retry, monster progress, or SATs-style accuracy.

### 6. Strict mini-test exists, but it needs harsher QA

The Worker defines mini-set lengths, timing logic, minimum time, and timer-per-mark constants. ([GitHub][10])

The engine also has mini-test start/finish behaviour and delayed-feedback concepts. ([GitHub][10])

But strict test mode is one of the easiest places to accidentally leak answers, lose saved responses, mis-handle expiry, or mark unfinished multi-field answers unfairly.

**Execution fix:** add Playwright coverage for:

Start 8-question set.

Answer Q1, navigate away, return, confirm answer preserved.

Submit some unanswered items, confirm unanswered items are marked but no crash.

Confirm no feedback appears before finish.

Let timer expire, confirm automatic finish.

Review mode shows answer, worked solution, score, and misconception tags only after finish.

Repeat on mobile viewport.

### 7. Mode focus behaviour needs verification

The client module maps Grammar mode aliases and controls whether a focus concept is used. The visible logic suggests `trouble`, `surgery`, and `builder` may ignore focus concept. ([GitHub][13])

That might be intentional, but it is likely to feel wrong to a teacher or parent. If I choose “relative clauses” and “Sentence Surgery”, I would expect the surgery tasks to bias toward that concept unless the mode is explicitly global.

**Execution fix:** decide the intended behaviour per mode and encode it in tests:

`learn`: focus allowed
`smart`: focus optional
`trouble`: focus optional but weakness-biased inside focus if selected
`surgery`: focus allowed
`builder`: focus allowed
`worked`: focus allowed
`faded`: focus allowed
`satsset`: mixed by default, optional focus only if labelled “focused mini-set”

### 8. Analytics need confidence, not just strength

The legacy review recommends analytics confidence/sample-size handling. ([GitHub][11])

A child who gets one relative-clause question right should not look as secure as a child who has answered the concept correctly across multiple templates and days.

**Execution fix:** display concept strength with evidence quality:

“Emerging: 1/1 correct, low evidence”
“Building: 4/6 correct across 3 templates”
“Secure: 9/10 correct, spaced over 7+ days”
“Needs repair: 3 recent misses, misconception: clause boundary”

Do not show a clean 82% mastery score without sample-size context.

### 9. Accepted-answer handling needs a serious pass

The old review recommends an accepted-answer registry and content versioning. ([GitHub][11])

This matters more in Grammar than Maths. Deterministic marking is only fair if acceptable variants are explicitly captured: punctuation spacing, capitalisation where relevant, optional commas, alternative standard phrasing, and equivalent grammatical labels.

**Execution fix:** add per-template answer specs:

`exact` for closed answers.
`normalisedText` for labels.
`acceptedSet` for multiple valid terms.
`punctuationPattern` for punctuation tasks.
`multiField` for rewrite/fix tasks.
`manualReviewOnly` for transfer writing.

Every constructed-response template should have golden examples and near-miss examples.

## Recommended execution plan

### Phase 0: Stop the overclaim

Create a single tracking doc: `docs/plans/grammar-perfection-backlog.md`.

Mark Grammar status as:

“Worker-backed Stage 1 complete; perfection pass in progress.”

Do not call it feature-complete until behaviour tests, content-depth improvements, and production smoke evidence are in the repo.

### Phase 1: Add failing tests first

Add tests before changing implementation.

Minimum test files:

`tests/grammar-adaptive-selection.test.js`
`tests/grammar-support-scoring.test.js`
`tests/grammar-mini-test-flow.test.js`
`tests/grammar-accepted-answers.test.js`
`tests/grammar-transfer-lane.test.js`
`tests/grammar-read-model-redaction.test.js`
`tests/grammar-production-smoke.contract.test.js`

The goal is to catch real regressions, not just prove that docs mention completed features.

### Phase 2: Repair adaptive selection

Files likely involved:

`worker/src/subjects/grammar/engine.js`
`worker/src/subjects/grammar/read-models.js`
`worker/src/subjects/grammar/content.js`

Implement:

Due queue priority.

Recent-miss recycling.

Question-type weakness weighting.

Template repeat penalty.

Concept repeat penalty.

Focus-concept weighting.

Mini-set balancing.

Deterministic seed support for reproducible tests.

Success criteria:

A 12-question mini-set should not repeat the same template unless the content pool forces it.

Smart Review should surface due/weak items before brand-new nice-to-have items.

Trouble mode should strongly target recent misconceptions.

### Phase 3: Fix support-aware scoring

Change support tracking from session-level to item-attempt-level.

Success criteria:

Independent first-attempt correct in Smart Review gets full credit even if “allow teaching items” is enabled.

Faded support gets partial mastery credit.

Worked support gets lower mastery credit.

Post-marking AI explanation does not reduce score because it happened after scoring.

Pre-answer AI help should not exist for score-bearing items.

### Phase 4: Strengthen content

Start with the known thin areas:

More explanation/error-analysis templates.

More vocabulary/formality templates.

More paragraph-to-sentence transfer prompts.

More templates for concepts with only two or three templates.

More distractors tied to named misconceptions.

Add a content coverage table:

Concept
Template count
Question-type count
Selected vs constructed count
Misconception tags covered
Accepted-answer tests
Golden examples
Known limitations

Success criteria:

Every concept has at least one identify/classify task, one fix/rewrite/build task where appropriate, and one misconception-aware feedback route.

### Phase 5: Polish learner UX

Fix mode/focus clarity.

Make Strict Mini-Set visibly different from learning modes.

Show “no hints before marking” in strict mode.

Show saved state when navigating mini-test questions.

Improve read-aloud text so it reads the question, choices, and table labels, but not answer/feedback.

Add confidence labels to analytics.

Make repair actions understandable: “Try again”, “Use a faded step”, “Show full worked solution”, “Similar problem”.

### Phase 6: Adult/teacher evidence polish

The adult view should answer three questions clearly:

What is secure?

What is weak?

What should we do next?

Add parent-facing summaries that mention concept, misconception, evidence count, and next action. Keep AI summaries optional and non-authoritative.

### Phase 7: Transfer lane

Ship non-scored writing transfer as a separate lane.

Example:

“Write three sentences about a storm. Use one relative clause, one fronted adverbial, and one pair of commas for parenthesis.”

The app can show a checklist and save evidence, but it should not auto-score mastery.

### Phase 8: Production gate

Before finalising, require this evidence in the PR/deploy note:

`npm test` pass
`npm run check` pass
Grammar unit tests pass
Grammar Playwright flow pass
Desktop and mobile smoke pass
Production Grammar smoke pass
No browser-local scoring authority
No browser-held AI keys
No AI score-bearing marking
Read models redacted
Bundle guardrail pass

## Practical priority order

Do not spend the next pass on monsters or cosmetic UI first. The seven Grammar creatures and Clause Conservatory identity are useful, but the plan explicitly says the game layer must derive from secured learning evidence only and must not influence marking, scheduling, retry, or mastery. ([GitHub][6])

The highest-value order is:

1. Behaviour tests and mini-test QA.
2. Adaptive selector and repeat control.
3. Item-level support scoring.
4. Accepted-answer registry.
5. Content expansion for thin concepts.
6. Analytics confidence/sample-size.
7. Non-scored transfer writing.
8. Visual/game polish.

My blunt assessment: **the repo has crossed the “HTML functionality exists” line, but not the “Grammar subject is perfected” line.** The missing work is now mostly in fidelity, depth, fairness, and proof: making the adaptive engine behave like the plan, making strict mode genuinely strict, making support scoring fair, expanding thin grammar content, and replacing checklist-style completeness with behaviour-level evidence.

[1]: https://github.com/fol2/ks2-mastery "GitHub - fol2/ks2-mastery: KS2 Unified — browser-side React prototype of a KS2 (UK Year 5/6) study app · GitHub"
[2]: https://github.com/fol2/ks2-mastery/tree/main/src/subjects/grammar "ks2-mastery/src/subjects/grammar at main · fol2/ks2-mastery · GitHub"
[3]: https://github.com/fol2/ks2-mastery/tree/main/src/subjects/grammar/components "ks2-mastery/src/subjects/grammar/components at main · fol2/ks2-mastery · GitHub"
[4]: https://github.com/fol2/ks2-mastery/tree/main/worker/src/subjects/grammar "ks2-mastery/worker/src/subjects/grammar at main · fol2/ks2-mastery · GitHub"
[5]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/grammar/metadata.js "raw.githubusercontent.com"
[6]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/2026-04-24-001-feat-grammar-mastery-region-plan.md "raw.githubusercontent.com"
[7]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/2026-04-25-001-feat-grammar-functionality-completeness-plan.md "raw.githubusercontent.com"
[8]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/grammar-functionality-completeness.md "raw.githubusercontent.com"
[9]: https://github.com/fol2/ks2-mastery/blob/main/tests/grammar-functionality-completeness.test.js "ks2-mastery/tests/grammar-functionality-completeness.test.js at main · fol2/ks2-mastery · GitHub"
[10]: https://github.com/fol2/ks2-mastery/blob/main/worker/src/subjects/grammar/engine.js "ks2-mastery/worker/src/subjects/grammar/engine.js at main · fol2/ks2-mastery · GitHub"
[11]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/james/grammar/ks2_grammar_mastery_review_report_zhhk.md "raw.githubusercontent.com"
[12]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/grammar/components/GrammarPracticeSurface.jsx "raw.githubusercontent.com"
[13]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/grammar/module.js "raw.githubusercontent.com"

I inspected the repo docs and the visible Grammar implementation. The main finding is this: **Grammar is not missing as a subject anymore; it has a real Worker-backed implementation. The problem is that the repo now overstates “completeness” while several product-quality, adaptive-learning, content-depth, and QA details still need closing.** I did not run the repo test suite locally here, so treat the items below as a code/doc inspection and execution plan, not proof of failing tests.

The repo README says Grammar is currently a **Stage 1 Worker-command-backed practice surface** with React setup/session/feedback/summary/analytics states, and also says both Grammar and Punctuation are not yet the full finished subject layer. It also confirms production expects Worker auth and that `?local=1` is not the real local runtime anymore. ([GitHub][1])

## What is already implemented well

Grammar has the right skeleton now. The subject folder contains the expected client module, read model, speech support, metadata, event hooks, and React scenes for setup, session, summary, analytics, and the practice surface. ([GitHub][2]) ([GitHub][3])

The Worker side also exists, with `commands.js`, `content.js`, `engine.js`, `read-models.js`, and `ai-enrichment.js`, so scoring/scheduling is not just a browser HTML clone. ([GitHub][4])

The repo has the intended denominator: 18 concepts, 51 templates, 31 selected-response templates, 20 constructed-response templates, and eight mode IDs: `learn`, `smart`, `satsset`, `trouble`, `surgery`, `builder`, `worked`, and `faded`. ([GitHub][5])

The architectural direction is also right: Worker-owned state, deterministic content, redacted read models, AI as enrichment only, no client-side localStorage authority, and no direct shipping of the old single-file HTML. ([GitHub][6]) ([GitHub][7])

The attached KS2 maths prototype is useful as a pattern because it uses the right mastery loop: independent first attempt, minimal nudge, worked/faded support only when needed, retry, and spaced return. Grammar needs the same loop, but with grammar-specific marking/content constraints rather than a direct port. 

## Missing or flawed areas I would fix before calling Grammar “perfected”

### 1. The docs overclaim completion before the product has enough behavioural proof

The functionality-completeness doc says strict mini-test, goals, settings, repair, AI triggers, read aloud, adult/data replacement, and smoke coverage are all completed. But the same area also says production Grammar smoke remains a manual post-deploy gate, and the earlier region plan still leaves ongoing `npm test`, `npm run check`, and Grammar production/UI smoke as follow-up work. ([GitHub][8]) ([GitHub][6])

The existing completeness test appears to validate denominators, statuses, evidence-file references, mode metadata, and capability flags. That is useful, but it is not enough to prove the actual user flows are polished. ([GitHub][9]) ([GitHub][9])

**Execution fix:** add behaviour-level tests before more UI polish. The suite should prove: no mini-test feedback before finish, timer expiry marks correctly, navigation preserves answers, repair only affects supported mastery, read-aloud does not leak answers, AI output is never score-bearing, and adult views are properly redacted.

### 2. Adaptive selection looks thinner than the plan

The plan calls for a proper mastery engine tracking concept, template, question type, generated item, misconceptions, retry, event, and session state. It also expects adaptive selection to consider due items, weak concepts, recent wrongs, under-secured question types, and repeat avoidance. ([GitHub][6]) ([GitHub][6])

From the visible Worker engine, `weightedTemplatePick` appears to weight mainly average strength, status, focus concept, and generative templates. I did not see clear evidence of a strong recent-repeat penalty, recent-miss recycling, or question-type weakness weighting in the selector snippet. ([GitHub][10])

Mini-set generation also appears to call template selection repeatedly. That risks repeated concepts/templates unless there is balancing elsewhere. The legacy review specifically warned that some concept pools only have two or three templates, meaning adaptive practice can repeat quickly. ([GitHub][10]) ([GitHub][11])

**Execution fix:** split selection into a tested pure function:

`buildGrammarPracticeQueue({ mode, focusConceptId, dueQueue, mastery, recentEvents, questionTypeStats, seed })`

It should score candidates with explicit weights for due status, weak concepts, recent misses, question-type weakness, template freshness, concept freshness, and focus matching. For strict mini-tests, use a separate pack builder with concept/question-type quotas and repeat caps.

### 3. Smart Review support scoring may be too broad

The engine has quality logic where supported correct answers count less than independent first-attempt correct answers, which is the right principle. ([GitHub][10])

But the visible `supportLevelForSession` logic suggests that Smart Review with `allowTeachingItems` enabled may assign support level 1 at the session level. If that is true, ordinary Smart Review answers may be downweighted just because the setting is enabled, even when the learner did not actually use faded/worked help. ([GitHub][10])

**Execution fix:** make support evidence item-level, not session-level. Store:

`firstAttemptIndependent: true/false`
`supportUsed: none | nudge | faded | worked | ai-explanation-after-marking`
`supportLevelAtScoring: 0 | 1 | 2`

Then mastery gain should be reduced only when support was actually shown before the scored attempt.

### 4. Legacy content gaps are still real

The legacy review is clear that the old HTML had a strong grammar base, but it was not perfect. It had 18 concepts and 51 templates, but remaining gaps included: vocabulary coverage only indirectly through formal vocabulary, paragraph-level writing transfer not really covered, only two explain-style templates, and some concept pools being too small for long-term adaptive practice. ([GitHub][11])

That means “ported the denominator” is not the same as “finished Grammar”.

**Execution fix:** expand the content library after stabilising the engine. Prioritise:

More explanation templates: “explain why”, “correct the misconception”, “choose and justify”.

More vocabulary/formality templates: Standard English, precise vocabulary, cohesion choices, register shifts.

More constructed-response templates with deterministic accepted answers.

More mixed templates that distinguish similar concepts: subordinate clause vs relative clause, adverbial vs preposition phrase, subject/object vs active/passive, apostrophe possession vs contraction, hyphen ambiguity vs dash/parenthesis.

### 5. Transfer writing is still placeholder-level

The React practice surface includes transfer placeholders for paragraph application and richer writing tasks. The copy says the first paragraph-transfer lane will be non-scored, teacher-reviewed, and separate from score/retry/reward/Concordium progress. ([GitHub][12])

That boundary is sensible, but it means the current Grammar product still lacks the polished “use grammar in writing” endpoint.

**Execution fix:** ship a non-scored transfer lane, but do not pretend it is mastered scoring. It should provide short paragraph prompts, grammar targets, checklist feedback, teacher/parent review copy, and saved evidence. It should not affect mastery, retry, monster progress, or SATs-style accuracy.

### 6. Strict mini-test exists, but it needs harsher QA

The Worker defines mini-set lengths, timing logic, minimum time, and timer-per-mark constants. ([GitHub][10])

The engine also has mini-test start/finish behaviour and delayed-feedback concepts. ([GitHub][10])

But strict test mode is one of the easiest places to accidentally leak answers, lose saved responses, mis-handle expiry, or mark unfinished multi-field answers unfairly.

**Execution fix:** add Playwright coverage for:

Start 8-question set.

Answer Q1, navigate away, return, confirm answer preserved.

Submit some unanswered items, confirm unanswered items are marked but no crash.

Confirm no feedback appears before finish.

Let timer expire, confirm automatic finish.

Review mode shows answer, worked solution, score, and misconception tags only after finish.

Repeat on mobile viewport.

### 7. Mode focus behaviour needs verification

The client module maps Grammar mode aliases and controls whether a focus concept is used. The visible logic suggests `trouble`, `surgery`, and `builder` may ignore focus concept. ([GitHub][13])

That might be intentional, but it is likely to feel wrong to a teacher or parent. If I choose “relative clauses” and “Sentence Surgery”, I would expect the surgery tasks to bias toward that concept unless the mode is explicitly global.

**Execution fix:** decide the intended behaviour per mode and encode it in tests:

`learn`: focus allowed
`smart`: focus optional
`trouble`: focus optional but weakness-biased inside focus if selected
`surgery`: focus allowed
`builder`: focus allowed
`worked`: focus allowed
`faded`: focus allowed
`satsset`: mixed by default, optional focus only if labelled “focused mini-set”

### 8. Analytics need confidence, not just strength

The legacy review recommends analytics confidence/sample-size handling. ([GitHub][11])

A child who gets one relative-clause question right should not look as secure as a child who has answered the concept correctly across multiple templates and days.

**Execution fix:** display concept strength with evidence quality:

“Emerging: 1/1 correct, low evidence”
“Building: 4/6 correct across 3 templates”
“Secure: 9/10 correct, spaced over 7+ days”
“Needs repair: 3 recent misses, misconception: clause boundary”

Do not show a clean 82% mastery score without sample-size context.

### 9. Accepted-answer handling needs a serious pass

The old review recommends an accepted-answer registry and content versioning. ([GitHub][11])

This matters more in Grammar than Maths. Deterministic marking is only fair if acceptable variants are explicitly captured: punctuation spacing, capitalisation where relevant, optional commas, alternative standard phrasing, and equivalent grammatical labels.

**Execution fix:** add per-template answer specs:

`exact` for closed answers.
`normalisedText` for labels.
`acceptedSet` for multiple valid terms.
`punctuationPattern` for punctuation tasks.
`multiField` for rewrite/fix tasks.
`manualReviewOnly` for transfer writing.

Every constructed-response template should have golden examples and near-miss examples.

## Recommended execution plan

### Phase 0: Stop the overclaim

Create a single tracking doc: `docs/plans/grammar-perfection-backlog.md`.

Mark Grammar status as:

“Worker-backed Stage 1 complete; perfection pass in progress.”

Do not call it feature-complete until behaviour tests, content-depth improvements, and production smoke evidence are in the repo.

### Phase 1: Add failing tests first

Add tests before changing implementation.

Minimum test files:

`tests/grammar-adaptive-selection.test.js`
`tests/grammar-support-scoring.test.js`
`tests/grammar-mini-test-flow.test.js`
`tests/grammar-accepted-answers.test.js`
`tests/grammar-transfer-lane.test.js`
`tests/grammar-read-model-redaction.test.js`
`tests/grammar-production-smoke.contract.test.js`

The goal is to catch real regressions, not just prove that docs mention completed features.

### Phase 2: Repair adaptive selection

Files likely involved:

`worker/src/subjects/grammar/engine.js`
`worker/src/subjects/grammar/read-models.js`
`worker/src/subjects/grammar/content.js`

Implement:

Due queue priority.

Recent-miss recycling.

Question-type weakness weighting.

Template repeat penalty.

Concept repeat penalty.

Focus-concept weighting.

Mini-set balancing.

Deterministic seed support for reproducible tests.

Success criteria:

A 12-question mini-set should not repeat the same template unless the content pool forces it.

Smart Review should surface due/weak items before brand-new nice-to-have items.

Trouble mode should strongly target recent misconceptions.

### Phase 3: Fix support-aware scoring

Change support tracking from session-level to item-attempt-level.

Success criteria:

Independent first-attempt correct in Smart Review gets full credit even if “allow teaching items” is enabled.

Faded support gets partial mastery credit.

Worked support gets lower mastery credit.

Post-marking AI explanation does not reduce score because it happened after scoring.

Pre-answer AI help should not exist for score-bearing items.

### Phase 4: Strengthen content

Start with the known thin areas:

More explanation/error-analysis templates.

More vocabulary/formality templates.

More paragraph-to-sentence transfer prompts.

More templates for concepts with only two or three templates.

More distractors tied to named misconceptions.

Add a content coverage table:

Concept
Template count
Question-type count
Selected vs constructed count
Misconception tags covered
Accepted-answer tests
Golden examples
Known limitations

Success criteria:

Every concept has at least one identify/classify task, one fix/rewrite/build task where appropriate, and one misconception-aware feedback route.

### Phase 5: Polish learner UX

Fix mode/focus clarity.

Make Strict Mini-Set visibly different from learning modes.

Show “no hints before marking” in strict mode.

Show saved state when navigating mini-test questions.

Improve read-aloud text so it reads the question, choices, and table labels, but not answer/feedback.

Add confidence labels to analytics.

Make repair actions understandable: “Try again”, “Use a faded step”, “Show full worked solution”, “Similar problem”.

### Phase 6: Adult/teacher evidence polish

The adult view should answer three questions clearly:

What is secure?

What is weak?

What should we do next?

Add parent-facing summaries that mention concept, misconception, evidence count, and next action. Keep AI summaries optional and non-authoritative.

### Phase 7: Transfer lane

Ship non-scored writing transfer as a separate lane.

Example:

“Write three sentences about a storm. Use one relative clause, one fronted adverbial, and one pair of commas for parenthesis.”

The app can show a checklist and save evidence, but it should not auto-score mastery.

### Phase 8: Production gate

Before finalising, require this evidence in the PR/deploy note:

`npm test` pass
`npm run check` pass
Grammar unit tests pass
Grammar Playwright flow pass
Desktop and mobile smoke pass
Production Grammar smoke pass
No browser-local scoring authority
No browser-held AI keys
No AI score-bearing marking
Read models redacted
Bundle guardrail pass

## Practical priority order

Do not spend the next pass on monsters or cosmetic UI first. The seven Grammar creatures and Clause Conservatory identity are useful, but the plan explicitly says the game layer must derive from secured learning evidence only and must not influence marking, scheduling, retry, or mastery. ([GitHub][6])

The highest-value order is:

1. Behaviour tests and mini-test QA.
2. Adaptive selector and repeat control.
3. Item-level support scoring.
4. Accepted-answer registry.
5. Content expansion for thin concepts.
6. Analytics confidence/sample-size.
7. Non-scored transfer writing.
8. Visual/game polish.

My blunt assessment: **the repo has crossed the “HTML functionality exists” line, but not the “Grammar subject is perfected” line.** The missing work is now mostly in fidelity, depth, fairness, and proof: making the adaptive engine behave like the plan, making strict mode genuinely strict, making support scoring fair, expanding thin grammar content, and replacing checklist-style completeness with behaviour-level evidence.

[1]: https://github.com/fol2/ks2-mastery "GitHub - fol2/ks2-mastery: KS2 Unified — browser-side React prototype of a KS2 (UK Year 5/6) study app · GitHub"
[2]: https://github.com/fol2/ks2-mastery/tree/main/src/subjects/grammar "ks2-mastery/src/subjects/grammar at main · fol2/ks2-mastery · GitHub"
[3]: https://github.com/fol2/ks2-mastery/tree/main/src/subjects/grammar/components "ks2-mastery/src/subjects/grammar/components at main · fol2/ks2-mastery · GitHub"
[4]: https://github.com/fol2/ks2-mastery/tree/main/worker/src/subjects/grammar "ks2-mastery/worker/src/subjects/grammar at main · fol2/ks2-mastery · GitHub"
[5]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/grammar/metadata.js "raw.githubusercontent.com"
[6]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/2026-04-24-001-feat-grammar-mastery-region-plan.md "raw.githubusercontent.com"
[7]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/2026-04-25-001-feat-grammar-functionality-completeness-plan.md "raw.githubusercontent.com"
[8]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/grammar-functionality-completeness.md "raw.githubusercontent.com"
[9]: https://github.com/fol2/ks2-mastery/blob/main/tests/grammar-functionality-completeness.test.js "ks2-mastery/tests/grammar-functionality-completeness.test.js at main · fol2/ks2-mastery · GitHub"
[10]: https://github.com/fol2/ks2-mastery/blob/main/worker/src/subjects/grammar/engine.js "ks2-mastery/worker/src/subjects/grammar/engine.js at main · fol2/ks2-mastery · GitHub"
[11]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/james/grammar/ks2_grammar_mastery_review_report_zhhk.md "raw.githubusercontent.com"
[12]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/grammar/components/GrammarPracticeSurface.jsx "raw.githubusercontent.com"
[13]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/grammar/module.js "raw.githubusercontent.com"
