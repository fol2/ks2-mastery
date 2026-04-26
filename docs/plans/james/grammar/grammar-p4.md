I tried the clone route first, but this environment could not resolve `github.com`, so I re-scanned the current repo through GitHub/web views instead. The repo has moved on a lot since the last review.

My recommendation: **Phase 4 should be a Grammar learning-integrity and production-hardening phase.** Do not make it a big visual pass, and do not start broad content expansion yet. Phase 3 made the child UX usable; Phase 4 should prove the whole system is safe, effective, non-leaky, reward-correct, and production-ready.

Phase 3’s own report says the UX reset is complete: 12 implementation units shipped, the child flow became Dashboard → Practise → Fix → Review → Grammar Bank, Writing Try is present, the 4 active + 3 reserve monster model landed, and around 450 Grammar-scoped tests pass. But it also records one known Grammar production-smoke failure and several deferred hardening items, so Phase 4 has a clear job. ([GitHub][1])

## Phase 4 direction

Name it something like:

`docs/plans/james/grammar/grammar-phase4-learning-hardening-plan.md`

Status:

`planned`

Phase title:

**Grammar Phase 4 — Learning Integrity, Production Hardening, and Reward Wiring**

The purpose should be:

Make Grammar trustworthy as a learning product, not merely implemented as a feature.

That means Phase 4 should prove:

The learner always gets a genuine first attempt where appropriate.

Hints, worked examples, faded support, AI, and feedback appear only at the right time.

Mini-test remains strict.

Grammar Bank focus routes actually lead to the intended learning.

Writing Try stays non-scored.

Confidence labels do not overclaim mastery.

Reward progress follows secured learning evidence only.

Read models do not leak server-only marking/content fields.

Production smoke, browser smoke, and reward wiring are green.

This lines up with the learning loop we have been using across the project: mixed retrieval from due/weak skills, independent first attempt, brief corrective nudge, worked/faded support only when needed, retry, and spaced return. That loop is also consistent with the research-backed design brief you gave for the KS2 reasoning webapp, even though this subject is Grammar rather than Maths. 

## The first thing to fix: production smoke failure

Phase 3 is not fully shippable until this is resolved.

The Phase 3 report says the remaining failing test is `tests/grammar-production-smoke.test.js`, and the failure is that `grammar.startModel.stats.templates` contains a server-only field leaking to the client. The report explicitly says this needs a follow-up fix in either `normaliseGrammarReadModel` or the Worker projection. ([GitHub][1])

I checked the current read-model code. The Worker-side `statsFromConcepts` still returns:

`stats.templates.total`
`stats.templates.selectedResponse`
`stats.templates.constructedResponse`

and the Worker read model includes `stats: statsFromConcepts(concepts)`. ([GitHub][2])

The forbidden-key helper also explicitly treats `templates` as a forbidden read-model key. That means this should not be “fixed” by weakening the forbidden-key rule. The safer fix is to remove or rename that field from the learner/client read model. ([GitHub][3])

Recommended fix:

Keep this safe public shape:

```js
content: {
  conceptCount: 18,
  templateCount: 51,
  questionTypes: { selectedResponse: 31, constructedResponse: 20 }
}
```

or:

```js
stats: {
  concepts: { ... },
  questionTypes: { ... }
}
```

But do not expose a key named `templates` anywhere in the client read model.

Also update `src/subjects/grammar/metadata.js`, because the client normaliser currently merges `raw.stats` into a returned `stats` object. If the Worker still sends `stats.templates`, the client may preserve it. ([GitHub][4])

Acceptance criteria:

`tests/grammar-production-smoke.test.js` passes.

`npm run audit:production` passes if that gate is used.

No learner-facing or client read model contains `template`, `templates`, `solutionLines`, `correctResponse`, `accepted`, `evaluate`, or generator-like content.

Do not relax forbidden keys to make the test pass.

## Phase 4 unit plan

### U0 — Write the Phase 4 plan and lock the invariants

Create:

`docs/plans/james/grammar/grammar-phase4-learning-hardening-plan.md`

Put these non-negotiable invariants at the top:

Smart Practice starts with independent attempt unless the selected mode is explicitly Worked/Faded/Learn.

Strict Mini Test has no feedback, AI, answer, support, or worked solution before finish.

Wrong answer flow is nudge → retry → optional faded/worked support.

AI is post-marking enrichment only, never score-bearing.

Writing Try is non-scored and never changes mastery, rewards, retry queues, misconceptions, or Concordium.

Grammar rewards react to secured evidence; they do not control scheduling or marking.

Concordium remains the aggregate 18-concept Grammar monster.

Bracehart, Chronalyx, and Couronnail are the only active direct Grammar monsters.

Glossbloom, Loomrill, and Mirrane remain reserve only.

No content release ID bump unless content/answer specs/templates actually change.

This is important because Phase 4 will touch many surfaces. The plan should stop accidental product drift.

### U1 — Fix the read-model leak and production smoke gate

This is the P0 task.

Files likely involved:

`worker/src/subjects/grammar/read-models.js`
`src/subjects/grammar/metadata.js`
`tests/grammar-production-smoke.test.js`
`scripts/grammar-production-smoke.mjs`
`tests/helpers/forbidden-keys.mjs`

Current problem:

`stats.templates` is useful internally, but the key name `templates` is forbidden in client read models. The production-smoke script imports shared forbidden keys and checks the full read model and current session item. ([GitHub][5])

Preferred implementation:

Rename public stats to something that cannot be confused with template objects:

```js
contentStats: {
  templateCount: 51,
  selectedResponseCount: 31,
  constructedResponseCount: 20
}
```

or keep counts under existing `content`.

Then strip `stats.templates` from the client normaliser as a belt-and-braces protection.

Acceptance criteria:

Grammar production smoke passes.

The Phase 3 report’s known failing test is closed.

Forbidden-key helper remains strict.

No child/adult UI depends on `stats.templates`.

### U2 — Harden the Phase 3 child-copy gates

Phase 3 added a valuable child-copy forbidden-term sweep, but the report also says the scoper regexes are brittle and may silently fall back to scanning full HTML. ([GitHub][1])

I checked the helper. Several scope functions still fall back to full `html` if their regex does not match. That means a broken scoper can either hide a bug or create noisy false positives depending on what changed in the DOM. ([GitHub][6])

Files likely involved:

`tests/helpers/grammar-phase3-renders.js`
`tests/react-grammar-child-copy.test.js` or equivalent Phase 3 gate tests

Fix:

Make scopers throw when a required phase root cannot be found.

Give each major learner surface a stable test id or stable section marker:

`grammar-dashboard-root`
`grammar-session-root`
`grammar-summary-root`
`grammar-bank-root`
`grammar-transfer-root`
`grammar-mini-test-root`

Acceptance criteria:

No scoper silently falls back to full HTML.

If a child surface is renamed or structurally broken, the test fails loudly.

Forbidden child-copy tests still pass.

This is not glamour work, but it protects the UX reset from slowly rotting.

### U3 — Audit reward wiring end to end

The code now reflects the 3 + 1 active monster decision. `MONSTERS_BY_SUBJECT.grammar` lists only Bracehart, Chronalyx, Couronnail, and Concordium, while `grammarReserve` contains Glossbloom, Loomrill, and Mirrane. The direct concept mapping also now assigns active concepts to the three direct monsters, with Concordium using all 18 Grammar concepts. ([GitHub][7])

Phase 4 should now prove the wiring, not just inspect it.

Test cases:

Securing `relative_clauses` progresses Bracehart and Concordium.

Securing `modal_verbs` progresses Chronalyx and Concordium.

Securing `formality` progresses Couronnail and Concordium.

Securing punctuation-for-grammar concepts progresses Concordium only.

Writing Try saves evidence but produces no reward event.

Mini-test marking can update concept mastery, but only through normal scored evidence.

Retrying an already-secured concept does not double-emit catch/evolve events.

Legacy saved state containing Glossbloom/Loomrill/Mirrane is normalised without showing those monsters in child UI.

Concordium never loses progress during migration.

Files likely involved:

`src/platform/game/mastery/grammar.js`
`src/platform/game/monsters.js`
Grammar reward tests
Grammar summary/dashboard/Codex tests

Acceptance criteria:

Only four active Grammar monsters appear anywhere learner-facing.

Reserved monsters do not catch, evolve, toast, appear in summary, or appear in child Grammar Bank.

Concordium aggregate progress still uses all 18 concepts.

Reward state migration is idempotent.

### U4 — Prove the learning flow, not just the screens

Phase 3 says the session UI now hides pre-answer help in mini-tests and before feedback, and the `grammarSessionHelpVisibility` selector backs that. The selector currently returns no help when there is no session, when a mini-test is unfinished, or when the phase is not feedback. That is the right direction. ([GitHub][8])

Phase 4 should add a proper learning-flow test matrix.

Test matrix:

Smart Practice, first attempt:

No answer.

No hint.

No AI.

No worked solution.

No similar problem.

One primary action: submit.

Smart Practice, wrong answer:

Shows brief nudge.

Allows retry.

Does not immediately show full solution unless requested.

Smart Practice, second wrong or requested support:

Allows faded/worked support.

Support use is recorded at item-attempt level.

Mastery gain is downweighted if support was used before scoring.

Worked mode:

Worked example is visible before target item.

Scoring is treated as supported.

Faded mode:

Partial scaffold is visible.

Scoring is treated as supported.

Mini Test before finish:

No feedback.

No support.

No AI.

No answer.

No monster progress celebration mid-test.

Mini Test after finish:

Score and review available.

Wrong concepts can be queued for repair.

Grammar Bank focused practice:

Concept card action leads to the intended focused practice.

The selected concept is reflected in the session model or queue.

Writing Try:

Save only.

No score.

No mastery.

No reward.

No retry queue.

No misconception update.

Acceptance criteria:

Tests assert absence as much as presence.

No learning mode accidentally turns into “hint first, think later”.

### U5 — Check focus routing from Grammar Bank and modes

One possible flaw needs investigation.

Phase 3 added Grammar Bank and “Practise 5” focused concept entry. That is good. But the Worker engine still has mode-level focus exclusions: `trouble`, `surgery`, and `builder` are in `NO_STORED_FOCUS_MODES`, and `surgery` plus `builder` are in `NO_SESSION_FOCUS_MODES`. ([GitHub][9])

That may be intentional. Sentence Surgery and Sentence Builder may be designed as global mixed modes. But from a child’s point of view, if they tap “Practise relative clauses”, they will expect the next round to be about relative clauses.

Phase 4 should decide this explicitly.

Recommended behaviour:

Grammar Bank “Practise 5” should always start a focused Smart Practice or Learn round, not an ambiguous global mode.

Trouble mode may combine concept focus with weakness weighting if launched from a concept.

Surgery/Builder can remain global only if the UI clearly labels them as mixed practice.

Acceptance criteria:

Every concept-card action has a deterministic destination.

No “focused” UI action silently becomes mixed practice.

Tests cover at least one concept from each active monster cluster.

### U6 — Seeded simulation tests for learning effectiveness

This is where Phase 4 goes beyond “does it render?”

Build a small deterministic simulation test suite around the Worker selection and scoring rules.

Files likely involved:

`worker/src/subjects/grammar/selection.js`
`worker/src/subjects/grammar/engine.js`
new test file, maybe `tests/grammar-learning-integrity.test.js`

The engine now delegates selection to `buildGrammarPracticeQueue`, and due retry handling is explicitly present in the Worker. ([GitHub][9])

Simulations should check:

A learner with due items receives due items early.

A learner with recent misses sees those concepts recycled.

Weak concepts are weighted above secure concepts.

The same template does not repeat too often unless the pool forces it.

Under-secured question types get boosted.

Mini-test packs are balanced and do not over-repeat one concept.

Supported correct answers produce less mastery gain than independent first-attempt correct answers.

Confidence does not become “secure” from one lucky answer.

Why this matters:

Grammar learning is not just exposure. It needs retrieval, discrimination, correction, and delayed re-use. The English curriculum also expects grammar and punctuation knowledge to be revisited and consolidated over time rather than treated as one-off labels. ([GOV.UK][10])

Acceptance criteria:

Simulation tests produce stable, explainable queue outcomes.

The adaptive engine favours due/weak/recent-miss work without becoming repetitive.

No concept reaches secure status without enough evidence quality.

### U7 — Parent/Admin hub confidence labels

Phase 3 added adult confidence labels in Grammar analytics and says the Worker already emits labels such as `emerging`, `building`, `needs-repair`, `consolidating`, and `secure`. The Worker projection also includes sample size, distinct template count, recent misses, average quality, and confidence. ([GitHub][1])

But Parent/Admin hub confidence labels were explicitly deferred. ([GitHub][1])

Phase 4 should finish that wiring.

Rules:

Child UI sees simple labels:

New
Learning
Trouble spot
Nearly secure
Secure

Adult/Admin sees evidence-aware labels:

Emerging
Building
Needs repair
Consolidating
Secure

Adult/Admin should also see sample-size context:

Attempts
Correct count
Recent misses
Distinct templates
Last seen
Due status

Acceptance criteria:

No raw percentage-only mastery claims in adult hub.

No “secure” label without enough evidence.

Unknown confidence labels do not silently fall back to “emerging” as if that were true.

### U8 — Fix confidence fallback behaviour

The Phase 3 report flags an out-of-taxonomy label fallback risk. It says the adult confidence chip currently falls back to `emerging` for unknown labels. ([GitHub][1])

That is not ideal. Unknown data should be treated as unknown, not quietly turned into a real learning status.

Fix:

Create shared constants:

```js
GRAMMAR_CONFIDENCE_LABELS = [
  'emerging',
  'building',
  'needs-repair',
  'consolidating',
  'secure',
]
```

Then:

Worker emits only those labels.

Client validates labels.

Adult chip renders `Unknown` or throws in tests if the label is outside the taxonomy.

Acceptance criteria:

No silent fallback to `emerging`.

Tests cover unknown label input.

Adult hub and Grammar analytics share the same taxonomy.

### U9 — Real-browser Playwright coverage for the golden paths

Phase 3 added SSR and smoke coverage, but its own report says SSR cannot catch everything: focus motion, pointer capture, IME input, scroll behaviour, timers, and real browser interaction are still blind spots. ([GitHub][1])

Phase 4 should add browser-level golden paths.

Minimum Playwright flows:

Dashboard → Start Smart Practice → answer wrong → see nudge → retry → answer → summary.

Grammar Bank → filter Trouble/Learning/Secure → open concept → Practise 5.

Mini Test → answer Q1 → navigate → return → answer preserved → finish → review.

Writing Try → write → tick checklist → save → confirm no mastery/reward change.

Grown-up view → open analytics → confidence labels visible → child dashboard remains clean.

Reward path → secure one concept → correct active monster progresses → reserved monsters absent.

Acceptance criteria:

At least desktop and mobile/tablet viewport coverage.

Timer behaviour tested in a controlled way.

Focus lands in the answer input when a question starts.

No support/AI buttons appear before first scored attempt.

### U10 — Writing Try hardening and orphan decision

Phase 3 implemented Writing Try as non-scored, with prompt/writing/checklist, saved history, cap, and invariant tests to catch mastery/reward mutation. ([GitHub][1])

The report still defers the orphaned transfer-evidence delete decision. ([GitHub][1])

Phase 4 should decide:

Can children delete saved Writing Try entries?

Can adults delete them?

Are they archived instead of deleted?

What happens if a prompt version disappears?

My recommendation:

Do not let child deletion remove audit/evidence silently.

Use “hide from my list” for children if needed.

Allow adult/admin deletion or archive with clear copy.

Never use Writing Try evidence for reward/mastery unless a later human-reviewed writing-assessment phase is deliberately designed.

Acceptance criteria:

Writing Try remains non-scored.

Saved writing survives normal refresh.

Orphaned prompt/evidence states render cleanly.

No adult-only `reviewCopy` leaks into learner UI.

### U11 — Answer-spec migration plan, but not full content expansion yet

Phase 2 introduced an answer-spec system. The code comments say constructed-response templates should eventually declare explicit answer specs such as `exact`, `normalisedText`, `acceptedSet`, `punctuationPattern`, `multiField`, and `manualReviewOnly`. Existing inline accepted-answer arrays are still supported during migration. ([GitHub][11])

The Phase 3 report says per-template answerSpec declarations are still deferred. ([GitHub][1])

This matters because Grammar marking is fragile. Tiny wording and punctuation differences can create unfair marking if the accepted-answer contract is loose.

Phase 4 should not rewrite all content unless you want a content-release phase. Instead, prepare the migration:

Inventory all 20 constructed-response templates.

Classify each template by answer-spec kind.

Add golden accepted answers and near-miss examples.

Identify templates that should remain manual-review-only or non-scored.

Decide whether answer-spec migration requires `contentReleaseId` bump.

Acceptance criteria:

A clear answer-spec migration table exists.

No broad content changes are mixed into hardening unless a real marking bug is found.

Phase 5 can then expand content safely.

### U12 — Content coverage audit for Phase 5

I would not make content expansion the main Phase 4 work. But Phase 4 should produce the audit.

The Phase 3 report says six concepts are still at the two-template floor:

`pronouns_cohesion`
`formality`
`active_passive`
`subject_object`
`modal_verbs`
`hyphen_ambiguity`

It also says the explain question type has only two templates. ([GitHub][1])

That is not enough for long-term mastery. Thin pools cause repetition and make adaptive selection less meaningful.

Phase 4 deliverable:

`docs/plans/james/grammar/grammar-content-expansion-audit.md`

Include:

Concept ID
Current template count
Question types covered
Misconceptions covered
Constructed vs selected response
Accepted-answer risk
Priority for expansion
Suggested new templates
Whether content release ID must bump

Acceptance criteria:

Phase 5 has a concrete content backlog.

No hidden content changes are slipped into Phase 4.

## Bugs / flaws I would explicitly put into Phase 4

First: **production-smoke failure from `stats.templates` leak.** This is the only true P0. Fix it before new features. ([GitHub][1])

Second: **scoper regex fallback.** Current test helpers can fall back to full HTML instead of failing when a phase root is not found. That weakens the child-copy gate. ([GitHub][6])

Third: **focus-routing ambiguity.** Grammar Bank focused practice exists, but some modes still intentionally drop focus. Confirm this is product-correct and test it. ([GitHub][9])

Fourth: **confidence-label fallback.** Unknown adult confidence labels should not silently become `emerging`. ([GitHub][1])

Fifth: **reward wiring needs full journey tests.** The mappings look correct now, but we need end-to-end proof that active monsters progress, reserve monsters stay hidden, legacy state normalises, and Writing Try cannot trigger rewards. ([GitHub][12])

Sixth: **real browser gaps.** SSR tests are good, but they do not prove focus, mobile scrolling, timers, IME typing, pointer behaviour, or real navigation. ([GitHub][1])

Seventh: **answer-spec migration remains incomplete.** Existing adapters are fine temporarily, but Grammar should not stay dependent on implicit accepted-answer behaviour forever. ([GitHub][11])

## Phase 4 learning-integrity checklist

Use this as the checklist for “scientific way and beyond”.

A child must think before help appears.

Smart Practice should interleave concepts, not drill one obvious pattern endlessly.

Due and weak items should come back at the right time.

Recent mistakes should get a near retry and later spaced return.

Feedback should be short, specific, and corrective.

Worked examples should teach structure, not become a shortcut for scoring.

Faded support should reduce mastery credit compared with independent success.

Mini-test should rehearse test conditions, not mastery growth with hints.

Grammar Bank should help children understand their status without adult reporting language.

Writing Try should support transfer to writing but remain non-scored until a human/teacher review phase exists.

Rewards should celebrate secured evidence only.

The EEF’s KS2 literacy guidance and the National Curriculum’s grammar/punctuation appendix both support the idea that grammar knowledge needs repeated, structured exposure and revisiting across contexts, not one-off feature spotting. ([EEF][13])

## Definition of done for Phase 4

I would not call Phase 4 complete until:

`tests/grammar-production-smoke.test.js` passes.

No forbidden read-model keys appear in Grammar client models.

Child-copy scopers throw on broken phase roots.

All child phases pass forbidden-language tests.

Smart Practice, wrong-answer repair, Mini Test, Grammar Bank, Writing Try, and Grown-up View have flow tests.

At least one real-browser golden path exists for Grammar.

Only Bracehart, Chronalyx, Couronnail, and Concordium appear active.

Glossbloom, Loomrill, and Mirrane remain reserve-only.

Reward migration is idempotent.

Writing Try is proven non-scored.

Parent/Admin hub can display confidence labels with sample-size context.

Unknown confidence labels do not silently become real labels.

The content expansion audit exists.

No content release ID bump happens unless content actually changes.

`npm test` and `npm run check` pass. The README still identifies those as the standard validation commands for the repo. ([GitHub][14])

## My suggested priority order

Do it in this order:

1. Fix `stats.templates` production-smoke failure.
2. Harden child-copy scopers.
3. Add reward end-to-end tests.
4. Add learning-flow tests.
5. Add seeded adaptive-selection simulations.
6. Add Playwright/browser golden paths.
7. Wire Parent/Admin confidence labels.
8. Finalise Writing Try orphan/delete behaviour.
9. Produce answer-spec and content-expansion audits.
10. Only then start content expansion as Phase 5.

Bluntly: **do not expand the Grammar content yet.** The current risk is not “not enough questions”; it is “are the now-large number of moving parts all learning-correct, reward-correct, and production-safe?” Once Phase 4 is green, Phase 5 can safely add more templates, richer explanation tasks, and answer-spec migration without building on shaky wiring.

[1]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/james/grammar/grammar-phase3-implementation-report.md "raw.githubusercontent.com"
[2]: https://github.com/fol2/ks2-mastery/blob/main/worker/src/subjects/grammar/read-models.js "ks2-mastery/worker/src/subjects/grammar/read-models.js at main · fol2/ks2-mastery · GitHub"
[3]: https://github.com/fol2/ks2-mastery/blob/main/tests/helpers/forbidden-keys.mjs "ks2-mastery/tests/helpers/forbidden-keys.mjs at main · fol2/ks2-mastery · GitHub"
[4]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/grammar/metadata.js "raw.githubusercontent.com"
[5]: https://github.com/fol2/ks2-mastery/blob/main/scripts/grammar-production-smoke.mjs "ks2-mastery/scripts/grammar-production-smoke.mjs at main · fol2/ks2-mastery · GitHub"
[6]: https://github.com/fol2/ks2-mastery/blob/main/tests/helpers/grammar-phase3-renders.js "ks2-mastery/tests/helpers/grammar-phase3-renders.js at main · fol2/ks2-mastery · GitHub"
[7]: https://github.com/fol2/ks2-mastery/blob/main/src/platform/game/monsters.js "ks2-mastery/src/platform/game/monsters.js at main · fol2/ks2-mastery · GitHub"
[8]: https://github.com/fol2/ks2-mastery/blob/main/src/subjects/grammar/session-ui.js "ks2-mastery/src/subjects/grammar/session-ui.js at main · fol2/ks2-mastery · GitHub"
[9]: https://github.com/fol2/ks2-mastery/blob/main/worker/src/subjects/grammar/engine.js "ks2-mastery/worker/src/subjects/grammar/engine.js at main · fol2/ks2-mastery · GitHub"
[10]: https://www.gov.uk/government/publications/national-curriculum-in-england-english-programmes-of-study/national-curriculum-in-england-english-programmes-of-study?utm_source=chatgpt.com "National curriculum in England: English programmes of study"
[11]: https://github.com/fol2/ks2-mastery/blob/main/worker/src/subjects/grammar/answer-spec.js "ks2-mastery/worker/src/subjects/grammar/answer-spec.js at main · fol2/ks2-mastery · GitHub"
[12]: https://github.com/fol2/ks2-mastery/blob/main/src/platform/game/mastery/grammar.js "ks2-mastery/src/platform/game/mastery/grammar.js at main · fol2/ks2-mastery · GitHub"
[13]: https://educationendowmentfoundation.org.uk/education-evidence/guidance-reports/literacy-ks2?utm_source=chatgpt.com "Improving Literacy in Key Stage 2"
[14]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/README.md "raw.githubusercontent.com"
