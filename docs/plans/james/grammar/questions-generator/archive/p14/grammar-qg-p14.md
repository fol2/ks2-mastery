# Grammar QG P14 — Depth, Variety, Session Effectiveness and Star-Pacing Contract

**Status:** proposed next phase  
**Language:** UK English  
**Primary release boundary:** starts from `grammar-qg-p11-2026-04-30` as certified in P13  
**Purpose:** move beyond certification into genuine learning depth, question variety and production effectiveness.

## 1. Why P14 exists

P1–P13 made the Grammar QG safer, more observable and production-certified. That work was useful, but it mostly certified and hardened the existing question pool. It did **not** materially solve the original product question: “Do we have enough varied, deep, effective Grammar questions?”

P14 is not another certification-only phase. P14 must answer, with code and evidence:

1. What exactly can a child see when they click Start Grammar?
2. How often do they see repeated templates, repeated prompts, or repeated answer shapes?
3. Does a 3/5/8/10/15-question round actually create learning evidence, or only quick completion?
4. Are Stars and visible progress paced by durable learning, not by a few easy wins?
5. Where is the current pool shallow, and which templates/concepts need more variants or deeper question families?
6. Are all displayed options and answer surfaces sensible, fair and varied?

## 2. P13 validation summary feeding P14

P13 is credible as a production certification milestone:

- P13 keeps the frozen release `grammar-qg-p11-2026-04-30`.
- P13 added a Worker-safe generated runtime certification map.
- Post-deploy smoke evidence exists and reports `ok: true`.
- The local ZIP audit confirms 18 concepts, 78 templates, 2,340 certification-window items, and 0 hard failures in the content-quality and semantic prompt-cue audits.

However, P13 does not prove the pool is deep enough. My local analysis of the uploaded `ks2-mastery-lean-04302325.zip` found:

- 78 templates total.
- 2,340 item instances in the 30-seed certification window.
- 1,369 unique learner-visible surface variants across those 2,340 instances.
- 658 unique prompt texts.
- Average unique surfaces per template: 17.56.
- 23 templates have only 1–3 unique learner-visible surfaces across 30 seeds.
- All 23 low-diversity templates are fixed-bank templates, not true generators.
- Some smart-practice queues can repeat the same template within the same 5-question session. Example: `identify_words_in_sentence` appeared twice in one simulated session; `proc2_standard_english_choice` appeared twice in another.

This explains the user experience: the certified pool is safe, but parts of it still feel repetitive and too shallow.

## 3. Product decision

**P14 must expand and deepen Grammar QG before we call the product educationally mature.**

Certification alone is not enough. A child needs breadth, retrieval, transfer, challenge and spaced review. A parent needs confidence that “Stars” mean durable skill, not quick repetition. The next phase must therefore be a real question-pool and scheduler phase.

## 4. Non-negotiable principles

1. **No fake growth.** Counting `78 templates × 30 seeds = 2,340` is not enough. We must count learner-distinct surfaces and actual repeated experiences.
2. **No same-template repetition inside a normal round** unless the pool is genuinely exhausted or the mode explicitly asks for a retry.
3. **No new Stars or reward changes without evidence.** If Star pacing is changed, it must be because telemetry or simulation shows mastery inflation.
4. **No cosmetic UI work as a substitute for learning depth.** UI work is only accepted when it supports answerability, accessibility or pacing.
5. **Every new item family needs quality evidence.** It must have valid prompt, options, answer spec, feedback, distractor rationale and edge-case tests.
6. **Production first.** The output must be deployed, smoke-tested and observable, not only merged.

## 5. P14 target outcomes

By the end of P14:

- Normal smart-practice 5-question sessions must have zero within-session template duplicates when at least five eligible templates are available.
- Low-diversity templates must be expanded or retired: no production template should have fewer than 10 unique learner-visible surfaces across seeds 1–30 unless explicitly marked as a deliberate fixed diagnostic.
- The 30-seed unique surface count should rise from 1,369 to at least 2,000.
- The prompt-text count should rise from 658 to at least 1,100.
- Every concept should have at least 8 production-grade templates or equivalent generator families after expansion, unless a written product rationale explains why not.
- Every concept should include identify, choose/classify, constructed-response, explanation and mixed-transfer/deep-review coverage where pedagogically appropriate.
- The dashboard must separate “quick practice” from “deep practice” so a 5-question round is not mistaken for mastery completion.
- Star/progress pacing must be reviewed against the new pool depth and either confirmed or adjusted with evidence.

## 6. Implementation units

### U0 — Product truth reset and diversity baseline

Create a committed diversity baseline report:

`reports/grammar/grammar-qg-p14-diversity-baseline.json`  
`reports/grammar/grammar-qg-p14-diversity-baseline.md`

The report must include:

- total templates;
- total inventory instances;
- unique learner-visible surfaces;
- unique prompt texts;
- unique answer shapes;
- per-template unique surface count;
- per-concept template count;
- per-concept unique surface count;
- low-diversity templates;
- session-level duplicate rate;
- adjacent-session overlap rate;
- most frequently selected templates under cold-start and returning-learner simulation.

Acceptance:

- The report must reproduce the current baseline: 78 templates, 2,340 instances, approximately 1,369 unique surfaces, and the 23 low-diversity templates identified in this review.
- The report must not treat generated seed count as equivalent to learner variety.

### U1 — Fix same-template repetition inside a session

Patch `buildGrammarPracticeQueue()` so each normal session avoids selecting the same `templateId` twice when enough eligible templates exist.

Required behaviour:

- Track `plannedTemplateIds` while building the queue.
- Filter planned templates out of the candidate pool.
- Fall back only when the remaining pool is too small to complete the round.
- Keep retry/trouble mode behaviour explicit, not accidental.
- Add tests that fail on the current P13 duplicate examples:
  - seed/session path where `identify_words_in_sentence` appears twice;
  - seed/session path where `proc2_standard_english_choice` appears twice.

Suggested implementation sketch:

```js
const plannedTemplateIds = new Set();

function templateFreshPool(pool, plannedIds) {
  const fresh = pool.filter((template) => !plannedIds.has(template.id));
  return fresh.length > 0 ? fresh : pool;
}

function pushQueueEntry(template, candidateSeed) {
  queue.push(queueEntry(template));
  plannedTemplateIds.add(template.id);
  workingRecent.push(recentAttemptForQueueTemplate(template, candidateSeed));
  addPlannedGeneratedVariant(workingRecentVariants, template, candidateSeed);
}
```

Acceptance:

- 100 simulated smart sessions × 5 questions have 0 within-session template duplicates when `focusConceptId` is empty.
- Focus mode can broaden the pool instead of repeating the same focused template in a short session.

### U2 — Expand low-diversity fixed-bank templates

The current low-diversity list includes:

- `question_mark_select`
- `build_noun_phrase`
- `explain_reason_choice`
- `formality_pairs`
- `fronted_adverbial_choose`
- `parenthesis_fix_sentence`
- `parenthesis_replace_choice`
- `pronoun_cohesion_choice`
- `relative_clause_complete`
- `standard_english_pairs`
- `standard_fix_sentence`
- `active_passive_rewrite`
- `apostrophe_possession_choice`
- `combine_clauses_rewrite`
- `expanded_noun_phrase_choice`
- `fix_fronted_adverbial`
- `modal_verb_choice`
- `relative_clause_identify`
- `speech_punctuation_fix`
- `subject_object_choice`
- `subordinate_clause_choice`
- `tense_form_choice`
- `tense_rewrite`

Each should be expanded to at least 10 distinct learner-visible surfaces across seeds 1–30, unless explicitly converted to a fixed diagnostic with low scheduling frequency.

Expansion rules:

- Add new source examples, not only shuffled options.
- Add age-appropriate KS2 context variety.
- Include misconception-led distractors.
- Preserve existing answer-spec strictness.
- Add negative vectors for constructed-response fixes.

Acceptance:

- Low-diversity count falls from 23 to fewer than 5.
- No added item introduces a content-quality hard failure or semantic cue failure.

### U3 — Add deeper concept families, not only more surface variants

Add deeper question families for concepts that currently feel shallow or repetitive. Priority concepts:

- standard English;
- fronted adverbials;
- subject/object;
- subordinate clauses;
- tense/aspect;
- speech punctuation;
- expanded noun phrases;
- parenthesis and commas.

Each priority concept should receive:

- one diagnostic misconception-choice family;
- one constructed-response correction/rewrite family;
- one explanation/why family;
- one mixed-transfer or SATs-style application family.

Acceptance:

- Template count should rise from 78 to at least 110 in P14.
- Every new template has review evidence and schedule status.
- No concept remains dependent on two or three repeated fixed examples.

### U4 — Introduce “deep practice” as a first-class session shape

The current default round length is 5, and the UI offers 3/5/8/10/15. A 5-question round is fine for quick daily practice but not enough to claim deep mastery.

P14 must split the product meaning:

- **Quick practice:** 5 questions, low-friction maintenance.
- **Deep practice:** 10–15 questions, targeted concept repair or mastery building.
- **Mini-test:** 8/12 SATs-style mixed retrieval.

Acceptance:

- Dashboard copy must not imply that 5 questions means mastery completion.
- Deep practice must be recommended when a learner is weak, near a milestone, or repeating easy items.
- Summary must show whether the session was quick, deep or mini-test.

### U5 — Star-pacing review and mastery-inflation simulation

The current Star model is evidence-based, and Mega depends heavily on retention-after-secure. That is good. But perceived early progress can still feel too fast because one independent win can unlock early visible progress.

Run a simulation over the current and expanded pool:

- always-correct learner;
- mixed correct/wrong learner;
- easy-template-only learner;
- repeated-template learner;
- supported-after-wrong learner;
- deep-practice learner;
- long-gap retention learner.

Measure:

- sessions to Egg/Hatch/Growing/Nearly Mega/Mega;
- number of distinct templates used before each stage;
- number of distinct concepts touched;
- number of retained-after-secure events;
- whether 5-question sessions cause visible progress too quickly.

Acceptance:

- No learner can reach high-stage visual progress through repeated shallow items alone.
- If early Stars still feel too quick, adjust display copy first and thresholds second. Do not secretly punish correct answers.
- Any Star semantics change must include migration and monotonic high-water safety.

### U6 — Per-click learner surface audit

Create a script that simulates actual click paths:

- first-time smart practice;
- returning smart practice;
- focus concept practice;
- trouble spots;
- mini-test;
- deep practice;
- post-feedback similar problem;
- retry queue after miss.

For each click path, record:

- template ID;
- prompt text;
- visible options/fields/rows;
- target cue;
- read-aloud text;
- expected answer shape;
- whether repeated in same session;
- why selected.

Acceptance:

- The audit must be human-readable.
- It must be possible to answer: “When a child clicks Start, exactly what can appear?”
- The audit must fail if a normal session repeats a template without an explicit retry reason.

### U7 — Option and distractor sense check, not just structural check

For selected-response items, require a per-option rationale:

- correct option reason;
- why each distractor is wrong;
- misconception tag;
- whether another answer could be defensible;
- adult review if ambiguity exists.

Acceptance:

- No option may be present only because “we needed four options”.
- No correct answer may be trivially obvious by length, grammar, punctuation, or wording pattern.
- Ambiguous items must be either fixed, blocked, or marked as approved-with-review with a clear rationale.

### U8 — Production telemetry for repetition and depth

Add low-risk telemetry/read-model fields that help product decisions without changing scoring:

- session template duplicate count;
- session unique template count;
- session unique concept count;
- low-diversity template exposure count;
- session depth classification;
- average elapsed time by depth type;
- abandon rate by template/input type.

Acceptance:

- No answer internals are logged to client-facing read models.
- Dashboards can show whether children are seeing enough variety.
- P14 final report must include data from local simulation and, if deployed, production telemetry smoke.

### U9 — Post-expansion production certification

After expansion and scheduler fixes, rerun the P13 production certification chain:

- manifest;
- render inventory;
- quality register;
- distractor audit;
- marking matrix;
- status map;
- runtime generated status source;
- semantic cue audit;
- production smoke.

Acceptance:

- The release must receive a new content release ID because learner-visible content changes.
- Recommended release ID: `grammar-qg-p14-2026-05-01` or the actual implementation date.
- The final report must distinguish “production-certified” from “depth-effective”. Certification can prove safe release; effectiveness requires telemetry over time.

## 7. What P14 must not do

- Do not add Hero Mode reward changes.
- Do not add Stars inflation to hide content weakness.
- Do not treat shuffling options as new questions.
- Do not ship a larger pool without review.
- Do not hide repeated questions behind UI copy.
- Do not call it effective until click-path audit and repetition metrics are clean.

## 8. Acceptance checklist

P14 can close only when all are true:

- [ ] The current pool has a committed diversity baseline.
- [ ] Smart sessions do not repeat the same template within a normal 5-question round.
- [ ] Low-diversity templates have been expanded or explicitly limited.
- [ ] The active pool has at least 110 production templates or a documented equivalent generator-depth improvement.
- [ ] Unique learner-visible surfaces across 30 seeds are at least 2,000.
- [ ] The UI distinguishes quick practice from deep practice.
- [ ] Star-pacing simulation is attached and reviewed.
- [ ] Per-click learner surface audit exists.
- [ ] Every added or changed question family has quality evidence.
- [ ] Production release evidence is regenerated under the new content release ID.

## 9. Product answer for the parent/user

The honest answer after P13 is:

> We made Grammar QG safe and production-certified, but we did not yet make it deep enough. P14 is the phase where we stop certifying the old pool and actually improve the breadth, depth and pacing of the questions children see.

That is the work now.
