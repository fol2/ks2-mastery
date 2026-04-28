I treated this as a Grammar content/engine audit, not just a feature brainstorm. I was able to read the repo through GitHub raw/rendered files, but I did not run the project locally here, so the exact shipped denominators below come from repo tests/docs, while the “theoretical question count” is my reconstruction from the template/generator structure.

The main finding: **Grammar is not using live AI to generate questions.** It is a deterministic template-and-seed system. The Grammar `content.js` file is generated from a reviewed legacy KS2 Grammar engine, and runtime question creation goes through `createGrammarQuestion({ templateId, seed })`, which finds a template and calls its generator with a numeric seed. So the engine is “template-owned generation”, not AI generation. ([GitHub][1])

The repo’s own completeness baseline pins the current Grammar content at **18 concepts/skills, 51 templates, 31 selected-response templates, and 20 constructed-response templates**. The audit also notes **53 template-concept assignments**, because a couple of templates are shared across more than one concept. ([GitHub][2])

## What Grammar currently covers

The current Grammar skill list is:

| Grammar skill / concept    | Current template count | Question shapes currently covered | SR / CR balance | My approximate unique prompt-variant estimate |
| -------------------------- | ---------------------: | --------------------------------- | --------------: | --------------------------------------------: |
| Sentence functions         |                      3 | classify, identify, choose        |           3 / 0 |                                        ~1,282 |
| Word classes               |                      3 | identify, choose                  |           3 / 0 |                                           ~18 |
| Noun phrases               |                      3 | choose, build                     |           1 / 2 |                                          ~869 |
| Adverbials                 |                      5 | choose, fix, explain, build       |           2 / 3 |                                       ~12,295 |
| Clauses                    |                      3 | identify, rewrite                 |           1 / 2 |                                           ~18 |
| Relative clauses           |                      3 | choose, build, identify           |           3 / 0 |                                           ~37 |
| Tense and aspect           |                      3 | fill, rewrite                     |           2 / 1 |                                        ~8,421 |
| Standard English           |                      5 | choose, explain, fix              |           3 / 2 |                                          ~526 |
| Pronouns and cohesion      |                      2 | choose                            |           2 / 0 |                                        ~2,642 |
| Formality                  |                      2 | choose                            |           2 / 0 |                                            ~5 |
| Active and passive         |                      2 | rewrite                           |           0 / 2 |                                        ~5,379 |
| Subject and object         |                      2 | identify                          |           2 / 0 |                                       ~43,011 |
| Modal verbs                |                      2 | choose, fill                      |           2 / 0 |                                            ~7 |
| Parenthesis commas         |                      3 | choose, fix                       |           1 / 2 |                                            ~8 |
| Speech punctuation         |                      3 | identify, fix                     |           1 / 2 |                                          ~390 |
| Apostrophes for possession |                      3 | choose, rewrite                   |           2 / 1 |                                          ~269 |
| Boundary punctuation       |                      4 | choose, fix, explain              |           2 / 2 |                                           ~26 |
| Hyphen ambiguity           |                      2 | choose, fix                       |           1 / 1 |                                            ~6 |

The exact template-count, question-type, and thin-pool columns are from the repo’s Grammar content expansion audit; the variant estimates are my reconstruction from the finite fixture lists, lexicons, and procedural slot combinations. ([GitHub][3])

The most important interpretation is this: **the honest shipped denominator is 51 reviewed template families, not 75k “questions”.** There are roughly **75k possible surface variants** if we count seeded combinations and ignore option-order shuffles, but that number is educationally misleading. For example, `subject_object` has a very high theoretical variant count because it combines names, verbs, objects, and phrase slots, but pedagogically it is still mostly the same “identify the subject/object” exercise. A child seeing 200 such variants has not necessarily received 200 distinct learning opportunities.

So I would describe the current system like this:

**Grammar currently has 18 skills, 51 reviewed templates, 53 skill-template links, and roughly 75k deterministic surface variants. But the real learning coverage is uneven: some skills have good breadth, while several are thin or single-shape.**

## Template vs generator breakdown

Everything is a template in the broad sense. Within that, there are two kinds.

The first kind is **fixed-bank templates**. These choose from hand-authored examples, shuffle choices, and mark against known answers. Examples include sentence type classification, word class identification, fronted adverbial choice, subordinate clause choice, relative clause completion, standard English pairs, modal verb choice, and apostrophe possession choice.

The second kind is **procedural/generative templates**. These build a sentence from reviewed lexicon pools: names, owners, objects, reporting verbs, clause pairs, formal frames, modal frames, hyphen prompts, and similar reusable slots. The repo has explicit lexicon pools for these generator families. ([GitHub][1])

My reconstruction is:

| Category                                     | Approx count |
| -------------------------------------------- | -----------: |
| Fixed-bank / hand-authored fixture templates |           26 |
| Procedural / seeded generator templates      |           25 |
| Total Grammar templates                      |           51 |

The procedural templates include things like generated fronted adverbial fixes, semicolon/colon/dash boundary items, speech punctuation, apostrophes, standard English choice/fix, tense/aspect, formality, pronoun cohesion, subject/object, passive-to-active, relative clauses, and noun phrase builds. The content file shows these procedural families explicitly with `generative: true` metadata and seed-driven generators. ([GitHub][1])

The scheduler is already doing more than random selection. It builds Grammar practice queues using weights for due concepts, weak concepts, new concepts, recent misses, question-type weakness, template freshness, concept freshness, focus mode, and whether a template is generative. That is good: the engine already has the beginning of a proper learning scheduler. ([GitHub][4])

## Current question quality

Overall, the current quality is **decent for a Stage 1 reviewed template system**, but it is not yet strong enough to be treated as a deep mastery engine across all Grammar skills.

The good parts are clear. The system is deterministic, reviewable, and content-release controlled. It has both selected-response and constructed-response items. It uses skill metadata, misconceptions, hints, and confidence/read-model data. The Worker command layer keeps Stars and reward projection outside the low-level question engine, which is the right direction for preventing “XP per question” inflation. ([GitHub][5])

The weaker part is that **template count is not evenly distributed by learning need**. Six concepts are explicitly flagged as thin pools: `pronouns_cohesion`, `formality`, `active_passive`, `subject_object`, `modal_verbs`, and `hyphen_ambiguity`. Two of those are especially brittle: `active_passive` only has rewrite-style coverage, and `subject_object` only has identify-style coverage. ([GitHub][3])

The biggest conceptual gap is explanation. The audit says there are only **two explain templates** across the entire Grammar pool, and **16 of 18 concepts have no explain template**. That matters because a child can often pick the right answer without being able to explain the grammar rule. If we want real mastery evidence, especially for later KS2/GPS-style reasoning, explain/fix/build coverage needs to increase. ([GitHub][3])

There are also some item-level quality issues. One static speech punctuation fixture appears to have the raw sentence already matching the accepted answer, so it becomes more of a copy/recognition item than a genuine fix item. ([GitHub][1]) Some parenthesis replacement items are very narrow, often steering toward dashes rather than testing the full relationship between commas, brackets, and dashes. Hyphen ambiguity has good classic examples, but the pool is tiny, so children could overfit quickly. The underlying issue is not that these questions are “bad”; it is that some concepts are represented by too few cognitive shapes.

The other quality issue is marking. Current constructed-response marking is still heavily accepted-answer based. The code has an adapter that maps simple accepted arrays into `markByAnswerSpec`, and the audit says new templates should declare typed `answerSpec` rather than relying on the old style. That is the right next move. Without richer answer specs, we will either reject valid answers too harshly or accept too much by accident. ([GitHub][1])

## Theoretical number of questions

There are three different answers, depending on what we mean by “question”.

The **strict reviewed content answer** is:

| Measure                        | Count |
| ------------------------------ | ----: |
| Grammar concepts / skills      |    18 |
| Template families              |    51 |
| Selected-response templates    |    31 |
| Constructed-response templates |    20 |
| Template-concept assignments   |    53 |

That is the number I would use in product, audit, and parent-facing language.

The **seeded surface-variant answer** is approximately:

| Measure                                             | Approx count |
| --------------------------------------------------- | -----------: |
| Static/fixed-bank variants                          |         ~326 |
| Procedural/generative variants                      |      ~74,879 |
| Total estimated unique pedagogical surface variants |      ~75,205 |

This is useful for engineering capacity, but I would not use it as the headline claim. It makes the system sound larger than its true learning coverage.

The **learning-quality answer** is more conservative:

**We have 51 reviewed question families, but only some skills currently have enough variety to support strong mastery claims.** The thin-pool skills need more templates before we should claim deep coverage.

## How to improve the engine without using AI generation

I agree with your direction: **do not use AI to generate production questions.** That keeps quality tighter, makes the system auditable, and avoids unpredictable grammar edge cases. But we should absolutely improve the deterministic engine.

The next step should be a **template quality engine**, not an AI generator.

I would add these pieces.

First, introduce a proper typed `answerSpec` for every template. Current accepted-answer marking is okay for early content, but not enough for scale. We need answer types like:

| Answer spec type       | Use case                                      |
| ---------------------- | --------------------------------------------- |
| `exactChoice`          | Multiple choice / selected response           |
| `acceptedSet`          | Small finite answer sets                      |
| `normalisedText`       | Short constructed responses                   |
| `punctuationTransform` | Add commas, apostrophes, speech marks, dashes |
| `sentenceRewrite`      | Active/passive, tense, standard English       |
| `tokenSelection`       | Identify subject, object, verb, clause        |
| `multiField`           | Table/classification items                    |
| `explainChoice`        | Choose the best explanation and misconception |

That lets us mark deterministically without AI, while being less brittle than raw exact strings.

Second, add a **template validator harness**. For every template, generate 500 or 1,000 seeds and automatically check:

| Validator                    | Why it matters                                                    |
| ---------------------------- | ----------------------------------------------------------------- |
| Duplicate prompt fingerprint | Prevents repeated “different seed, same question”                 |
| Unique correct answer        | Catches ambiguous multiple choice                                 |
| Distractor validity          | Ensures distractors are plausible but not also correct            |
| No identical fix answer      | Catches “fix this” items that are already fixed                   |
| Accepted answer round-trip   | Ensures the official answer passes the marker                     |
| Misconception mapping exists | Keeps feedback meaningful                                         |
| Reading-level / style checks | Avoids awkward or too-adult examples                              |
| Skill purity check           | Prevents a “modal verb” item actually testing tense or vocabulary |
| Surface-family balance       | Prevents one grammar frame dominating a skill                     |

This would make deterministic generation much safer.

Third, add a **variant fingerprint**. Right now the scheduler can prefer template freshness, but it should also know when two generated questions are structurally the same. For example:

```ts
variantFingerprint = {
  templateId: "proc2_subject_object_identify",
  frame: "frontedPhrase + subject + verb + object",
  target: "subject",
  verbFamily: "carried/painted/found",
  distractorPattern: "object-vs-subject"
}
```

Then the scheduler can avoid giving the child the same structure again too soon, even if the surface words differ.

Fourth, expand the template schema. Every template should declare:

```ts
{
  templateId,
  skillIds,
  questionType,
  responseShape,
  cognitiveRung,
  surfaceFamily,
  generatorKind,
  answerSpec,
  misconceptionIds,
  minLexiconSize,
  variantFingerprint,
  satsFriendly,
  reviewStatus,
  contentReleaseId
}
```

The most important missing field is `cognitiveRung`. We should know whether a template is asking the child to recognise, choose, fix, rewrite, build, or explain. Mastery should require coverage across rungs, not just repeated success on one kind of item.

Fifth, build a small **Grammar content dashboard** for adults/internal QA:

| Metric                     | Why                                       |
| -------------------------- | ----------------------------------------- |
| Templates per skill        | Shows thin concepts                       |
| Question types per skill   | Shows single-shape weaknesses             |
| SR/CR balance              | Prevents over-reliance on multiple choice |
| Explain coverage           | Tracks reasoning depth                    |
| Generated variant count    | Shows available surface variety           |
| Duplicate rate by seed     | Finds weak generators                     |
| Error rate by template     | Finds confusing/broken items              |
| Misconception distribution | Shows whether feedback is meaningful      |
| Secure evidence coverage   | Shows whether mastery is justified        |

This is also consistent with the earlier Hero Mode direction: do not create more quiz grind; create better spaced, independent learning evidence. 

## Where to expand templates first

I would not expand everything evenly. Start with the weak points.

Priority 1: **Active/passive and subject/object.** These are the most brittle because each has only two templates and only one question shape. Add at least five templates each:

For active/passive:

| New template                      | Shape             |
| --------------------------------- | ----------------- |
| Identify active vs passive        | selected response |
| Convert passive to active         | rewrite           |
| Convert active to passive         | rewrite           |
| Explain why a sentence is passive | explain           |
| Fix an awkward passive sentence   | fix               |

For subject/object:

| New template                            | Shape             |
| --------------------------------------- | ----------------- |
| Identify subject                        | selected response |
| Identify object                         | selected response |
| Highlight subject and object            | token selection   |
| Rewrite with a different subject        | rewrite           |
| Explain why a noun phrase is the object | explain           |

Priority 2: **Pronouns/cohesion, formality, modal verbs, and hyphen ambiguity.** These are thin and easy to overfit. Each should get at least three to five more templates, especially constructed-response and explain templates.

Priority 3: **Add explain templates across the board.** Every major skill should eventually have at least one explanation item. Not every session needs explanation, but secure/mastery evidence should include it.

Priority 4: **Add mixed-transfer templates.** Once children are strong on isolated skills, they need items that combine skills: for example, a sentence rewrite that tests tense, pronoun cohesion, and standard English together. These should be used late in the mastery path, not early.

## How the engine should decide mastery

Do not let the theoretical 75k variant count trick the reward system.

A child should not become “secure” because they answered many generated versions of the same shape. Secure evidence should require something like:

| Evidence needed           | Example                                         |
| ------------------------- | ----------------------------------------------- |
| Multiple templates        | Not just one generator repeated                 |
| Multiple question types   | Choose + fix + build/explain where possible     |
| Independent first attempt | Not after support leakage                       |
| Spaced return             | Correct again after time has passed             |
| Mixed context             | Skill still works when mixed with other grammar |
| Error repair              | Recent misconception has been fixed             |

This matters because Grammar already has a smart-practice scheduler and reward projection path. The right improvement is to make the scheduler and evidence rules respect template variety, not merely raw question count. ([GitHub][4])

## My recommended next build plan

I would do this in five phases.

**Phase 1: Grammar content audit hardening.**
Add a generated report that prints the exact count by skill, question type, response shape, cognitive rung, and explain coverage. This should fail CI if a content release accidentally reduces coverage.

**Phase 2: Typed answer specs.**
Move every template to explicit `answerSpec`. Keep exact accepted strings only where they are truly appropriate.

**Phase 3: Generator QA harness.**
Generate many seeds per template and test for ambiguity, duplicates, bad distractors, identical fix answers, and accepted-answer failures.

**Phase 4: Thin-pool expansion.**
Implement the repo audit’s proposed backlog first: especially active/passive, subject/object, pronouns/cohesion, formality, modal verbs, and hyphen ambiguity. The audit already proposes 30 new template ideas and says these should land behind a content-release bump. ([GitHub][3])

**Phase 5: Scheduler upgrade.**
Teach smart practice to balance concept weakness, question-type weakness, cognitive rung, spaced retrieval, and variant fingerprints. That gives you a better engine without using AI to make questions.

My overall judgement: **the current Grammar system is a solid deterministic foundation, but the advertised learning depth should be based on 51 reviewed templates, not the large seeded variant count.** The next quality jump should come from typed answer specs, automated template validation, thin-pool expansion, and scheduler rules that require varied evidence before mastery.

[1]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/worker/src/subjects/grammar/content.js "raw.githubusercontent.com"
[2]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/tests/grammar-functionality-completeness.test.js "raw.githubusercontent.com"
[3]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/james/grammar/grammar-content-expansion-audit.md "raw.githubusercontent.com"
[4]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/worker/src/subjects/grammar/selection.js "raw.githubusercontent.com"
[5]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/worker/src/subjects/grammar/commands.js "raw.githubusercontent.com"
