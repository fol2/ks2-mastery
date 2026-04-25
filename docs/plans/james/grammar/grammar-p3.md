Yes — Phase 3 should be a **UX/UI reset**, not a light polish pass.

Phase 2 has done the hard Worker/engine work: the report says all 8 Phase 2 units landed, 201 Grammar tests passed, and the Worker-side issues around selection, support scoring, strict mini-test behaviour, answer specs, confidence labels, and transfer-lane backend were resolved. It also clearly leaves several UI-heavy follow-ups out of scope, especially `GrammarTransferScene.jsx`, parent-hub confidence rendering, and content expansion. ([GitHub][1])

So Phase 3 should now make Grammar feel like a child-facing product.

The simple direction is this:

**Copy Spelling’s UX pattern, not its subject logic.**
Spelling works because the child sees a clean journey: choose today’s mode, start, answer one prompt, see clear progress, then browse a useful Word Bank. The complicated scheduling and mastery logic stays behind the scenes. Spelling’s setup has simple mode cards, round length, pool, “Where you stand”, Codex, and Word Bank entry points; the session screen is basically “Word X of Y”, replay controls, one answer input, and one main action; the Word Bank gives filters, search, grouped words, and status chips. ([GitHub][2])

Grammar currently exposes too much implementation language and too much adult/reporting structure. The setup mentions Worker-marked modes, the full 18-concept placeholder map, and all concepts on the main start screen; the session exposes chips like Worker authority, question type, AI enrichment, faded support, similar problem, and repair actions all in the same surface; analytics shows “Evidence snapshot”, “Stage 1”, “Bellstorm bridge”, “Reserved reward routes”, misconception repair, question-type evidence, and recent attempts. That is too much even for an adult, and definitely too much for a KS2 child. ([GitHub][3])

## Phase 3 goal

Create a clean Grammar learner flow:

**Start → Practise → Fix → Review → Browse Grammar Bank**

The child should always understand three things:

“What am I doing now?”
“How am I doing?”
“What should I do next?”

Everything else — Worker authority, evidence summaries, read-model shape, parent summaries, confidence taxonomy, AI labels, template counts, route names, and detailed reports — should be hidden from the child flow or moved into adult/diagnostic views.

The KS2 learning loop should stay the same: independent first attempt, minimal nudge, worked/faded support only when needed, retry, and spaced return. The UX must make that feel simple, not explain the whole system every time. 

## Phase 3 plan: Grammar UX/UI reset

I would create:

`docs/plans/james/grammar/grammar-phase3-ux-ui-plan.md`

Status:

`planned`

Scope:

“Child-facing Grammar UX/UI, Grammar Bank, transfer scene, 3+1 monster UI alignment, and regression cleanup after Phase 2 Worker completion.”

## U0 — Align Phase 3 with the 3+1 monster decision

This should happen first because it affects dashboard layout, reward cards, Grammar Bank grouping, Codex visibility, and summary screens.

Current repo still exposes all seven Grammar monsters in `GRAMMAR_MONSTER_ROUTES`: Bracehart, Glossbloom, Loomrill, Chronalyx, Couronnail, Mirrane, and Concordium. The game registry also still lists all seven active for Grammar, and direct mastery mapping still assigns concepts to six direct Grammar monsters. ([GitHub][4])

Phase 3 should change active Grammar to:

**Bracehart** — sentence architecture
**Chronalyx** — verb/time/flow
**Couronnail** — words, phrases, standard English, register
**Concordium** — grand whole-Grammar monster

Reserve:

**Glossbloom**
**Loomrill**
**Mirrane**

Important spelling: the repo uses **Chronalyx** and **Couronnail**. I would keep those canonical names unless you intentionally want an asset/id rename.

UX acceptance criteria:

Only four active Grammar monsters appear in learner UI.

Reserved monsters do not appear in the child dashboard, Grammar Bank, session summary, or active Codex route.

Existing saved progress for old direct monsters is not lost. It should be normalised into the new three direct clusters from Concordium/aggregate concept evidence.

Concordium still uses all 18 Grammar concepts.

Tests to add:

`MONSTERS_BY_SUBJECT.grammar` equals `['bracehart', 'chronalyx', 'couronnail', 'concordium']`.

Reserved monsters remain in `MONSTERS` but are not learner-facing.

Concept mastery for `word_classes` now feeds Couronnail, `modal_verbs` feeds Chronalyx, and `active_passive` feeds Bracehart.

## U1 — Replace the Grammar landing page with a child dashboard

The current setup screen should stop being a configuration/control panel. It should become a simple dashboard like Spelling’s “Choose today’s journey” screen. Spelling’s setup already does this well: mode choice, round length, pool, options, start button, and “Where you stand” are visible without exposing internal architecture. ([GitHub][2])

New Grammar dashboard layout:

Top hero:

“Grammar Garden” or “Clause Conservatory”
“One short round. Fix tricky sentences. Grow your Grammar creatures.”

Today cards:

“Due today”
“Trouble spots”
“Secure concepts”
“Current streak / round progress”

Main actions:

“Start Smart Practice”
“Fix Trouble Spots”
“Try a Mini Test”
“Open Grammar Bank”

Secondary actions:

“Sentence Surgery”
“Sentence Builder”
“Worked Example”
“Writing Try”

But do not show all eight modes as equal large choices. Eight options is too much. The default child path should be obvious.

Recommended mode grouping:

Primary:

Smart Practice
Trouble Fix
Mini Test
Grammar Bank

Secondary / tucked under “More practice”:

Learn a Concept
Sentence Surgery
Sentence Builder
Worked Example
Faded Help

Remove from child-facing copy:

“Worker-marked”
“Stage 1”
“Full placeholder map”
“Worker authority”
“Evidence snapshot”
“Reserved reward routes”
“Bellstorm bridge”
“18-concept denominator”

Those are developer/adult concepts, not child UX.

Files likely touched:

`src/subjects/grammar/components/GrammarSetupScene.jsx`
`src/subjects/grammar/components/GrammarPracticeSurface.jsx`
`src/subjects/grammar/metadata.js`
subject CSS file / shared app CSS

Acceptance criteria:

A child can start a sensible Grammar round within one click from the dashboard.

Dashboard copy is no more complicated than Spelling setup copy.

No implementation words appear in learner dashboard.

Round length and speech rate are still available, but not visually dominant.

## U2 — Build a Grammar Bank equivalent to Spelling Word Bank

This is the most important child-facing feature.

Spelling’s Word Bank is useful because it lets the learner browse every word, filter by status, search, and tap a word for detail. Grammar needs the same thing for concepts. The Phase 2 confidence labels already exist in the read model — emerging, needs-repair, building, consolidating, secure — but the child should see simpler labels. ([GitHub][5])

Create:

`src/subjects/grammar/components/GrammarConceptBankScene.jsx`

Child-facing name:

**Grammar Bank**
or
**Grammar Garden**

Filters:

All
Due
Trouble
Learning
Almost secure
Secure
New

Optional monster filters:

Bracehart
Chronalyx
Couronnail
Concordium

Concept card content:

Concept name
Tiny explanation
Status chip
Monster/cluster badge
Attempts/evidence in child language
One example sentence
Buttons: “Practise this”, “See example”, “Try a quick fix”

Example card:

“Relative clauses”
“Adds extra information about a noun.”
Example: “The dog, which was muddy, ran inside.”
Status: “Trouble spot”
Action: “Practise 5”

Do not show raw strength percentages to children. Use labels.

Map confidence labels to child labels:

`emerging` → “New”
`building` → “Learning”
`needs-repair` → “Trouble spot”
`consolidating` → “Nearly secure”
`secure` → “Secure”

Adult views can keep sample size and evidence details.

Files likely touched:

`GrammarPracticeSurface.jsx`
`GrammarConceptBankScene.jsx` new
`GrammarConceptDetailModal.jsx` new
`metadata.js` normaliser if needed
`module.js` actions for open/close/filter/search/focus concept

Acceptance criteria:

Child can browse all 18 Grammar concepts.

Child can filter by status.

Child can search concept names and examples.

Child can start a focused practice round from a concept card.

Grammar Bank is reachable from dashboard and summary.

No adult analytics/reporting appears inside Grammar Bank.

## U3 — Redesign the practice session screen around one task

The session screen should be stripped down hard.

Current Grammar session puts many things close together: chips, read aloud, guidance, AI actions, input, feedback, repair buttons, mini-test status, worked solution, and command errors. Some of that is valid, but it should not all be visible at once. ([GitHub][6])

New session structure:

Top:

“Question 3 of 8”
Progress path
Optional timer only in mini-test
Small status: “Smart Practice” or “Mini Test”

Main card:

Prompt
Answer input
Read aloud
Submit

Before first answer:

No AI buttons.
No worked solution.
No “similar problem”.
No “faded support” unless the mode is explicitly Worked/Faded/Learn.
No answer leak.
No Worker/domain/question-type chips unless they help the child.

After answer:

If correct:

“Correct!”
One short explanation if needed
“Next question”

If wrong:

“Not quite.”
One small nudge
Buttons: “Try again”, “Show a step”, “Show full answer”

After retry / support:

Worked solution can appear.
Similar problem can appear.
AI explanation can appear only as “Explain another way” after marking.

This is important: the current UI appears to render support and AI action areas during the live session, not only after feedback. Even if the Worker fails closed, the child UI should not show buttons that imply pre-answer help is available in independent practice. That is a UX flaw and possible leakage/regression risk. ([GitHub][6])

Files likely touched:

`GrammarSessionScene.jsx`
possibly `grammar-session-ui.js` new, mirroring `spelling/session-ui.js`
`tests/react-grammar-surface.test.js`

Acceptance criteria:

Smart Practice first attempt has one primary action: Submit.

Strict mini-test has no feedback/help buttons until finish.

AI buttons never appear before a scored answer is marked.

“Similar problem” appears only after feedback or from a deliberate practice-bank action.

Read aloud reads the prompt and choices, not answer/feedback.

The layout works on mobile without scrolling past multiple panels before answering.

## U4 — Make mini-test feel like a test, not a broken practice round

Phase 2 added SSR tests for mini-test answer preservation, unanswered handling, command blocking, and timer expiry. That is good. But the UI still needs to feel simple. ([GitHub][1])

Mini-test screen should show:

“Mini Test”
Question X of N
Timer
Question nav circles
Prompt
Answer input
Save and next
Finish test

It should not show:

Support
AI
Worked solution
Feedback
Concept explanations
Monster progress
Adult report language

After finish:

Show score.
Show list of questions.
Each question expands to: your answer, correct answer, quick explanation, “practise this later”.

Acceptance criteria:

Before finish, no result/answer/feedback text exists in rendered output.

Timer is obvious.

Saved answers are visibly marked in the nav.

Unanswered questions are marked “blank” after finish, not treated as strange errors.

Mobile view keeps nav usable.

## U5 — Redesign the round summary

The summary should not be a report. It should be a child-friendly end screen.

Current summary is functional but plain: completed round, stats, mini-set review, and actions. ([GitHub][7])

New summary:

Title:

“Nice work — round complete”

Cards:

Answered
Correct
Trouble spots found
New secure concepts
Monster progress

Then:

“Practise missed questions”
“Start another round”
“Open Grammar Bank”

For mini-test:

Score card
“Review answers”
“Fix missed concepts”

For normal practice:

“Best win”
“One thing to fix next”
“Due later”

Do not show long analytics on this page. Put adult detail elsewhere.

Acceptance criteria:

Summary fits above the fold on tablet/desktop.

The child sees what improved and what to do next.

Monster progress uses only the four active Grammar creatures.

No detailed misconception tables or evidence summaries on child summary.

## U6 — Ship the non-scored writing transfer scene

Phase 2 shipped the Worker-side transfer lane and explicitly deferred the React scene. The report says the Worker contract has prompt storage, caps, redaction, non-scored events, and tests, but `GrammarTransferScene.jsx` remains a UI follow-up. ([GitHub][1])

The current Grammar UI still has transfer placeholders/roadmap text, which should not be part of the child product surface. ([GitHub][8])

Create:

`src/subjects/grammar/components/GrammarTransferScene.jsx`

Child-facing name:

**Writing Try**

Flow:

Choose a prompt.
Write 2–4 sentences or a short paragraph.
Checklist shows target grammar choices.
Save writing.
Show “Saved for review”.
No score.
No monster progress.
No mastery change.

Example:

“Write three sentences about a storm. Use one relative clause, one fronted adverbial, and one pair of commas for extra information.”

Checklist:

I used a relative clause.
I used a fronted adverbial.
I checked punctuation.
I can read it aloud.

Adult-only copy remains adult-only. The Phase 2 transfer lane specifically says `reviewCopy` must not appear in the learner-facing read model. ([GitHub][1])

Potential issue to verify:

The Phase 2 report says the Worker read model exposes `transferLane`, but I do not see `transferLane` in the current client `normaliseGrammarReadModel` output. That may mean the future React scene cannot access the Worker transfer lane through the current client normaliser. I would add this to U6 investigation before building the scene. ([GitHub][1])

Acceptance criteria:

Transfer scene reads prompts from Worker read model.

Saving transfer evidence calls the Worker command.

Transfer evidence never changes mastery, retry queue, misconceptions, reward state, session state, or Concordium progress.

Child sees saved writing history, capped and simple.

Adult review copy is not rendered in learner UI.

## U7 — Separate child UI from adult/teacher analytics

Keep the analytics. Just stop making it part of the child journey.

Current `GrammarAnalyticsScene` is valuable as a diagnostic surface, but it is not a child screen. It uses adult/report terms: evidence snapshot, Stage 1, punctuation bridge, reserved reward routes, misconception repair, question-type evidence, and recent attempts. ([GitHub][9])

New split:

Child:

Dashboard
Practice
Summary
Grammar Bank
Writing Try
Monster/Codex progress

Adult:

Detailed analytics
Evidence summary
Misconception patterns
Question-type evidence
Parent summary draft
Punctuation-for-grammar bridge
Raw recent attempts

Implementation:

Rename the current analytics entry in UI to “Adult report” or “Grown-up view”.

Do not show it by default after a child session.

Use Phase 2 confidence labels in adult report with sample size and distinct templates.

For child status, use simplified labels only.

Acceptance criteria:

No adult report appears automatically in child flow.

Adult report is reachable from a secondary button.

Child screens do not contain “evidence”, “read model”, “Worker”, “Stage 1”, “denominator”, “route”, or “projection”.

Parent summary draft remains non-scored and clearly adult-facing.

## U8 — Add a Grammar UI view-model layer

Spelling has a strong view-model split. Grammar needs the same.

Create:

`src/subjects/grammar/components/grammar-view-model.js`
or
`src/subjects/grammar/grammar-ui-model.js`

Responsibilities:

Convert raw concept/confidence/status data into child labels.

Build dashboard cards.

Build Grammar Bank groups.

Map concepts to the active 3+1 monster model.

Choose action labels.

Hide internal concepts.

Create child-safe session labels.

Create adult-safe report labels.

This stops JSX files from becoming decision soup.

Suggested functions:

`buildGrammarDashboardModel(grammar, learner, rewardState)`
`buildGrammarBankModel(grammar, filters)`
`grammarChildStatusLabel(concept)`
`grammarChildStatusTone(concept)`
`grammarMonsterClusterForConcept(conceptId)`
`grammarSessionSubmitLabel(session, phase)`
`grammarSessionHelpVisibility(session, grammarPhase)`
`grammarSummaryCards(summary, rewardState)`

Acceptance criteria:

Most display decisions move out of React components.

React components become mostly layout.

Tests can assert labels and visibility rules without rendering full JSX.

## U9 — Visual styling and accessibility pass

Do not invent a new visual system. Use Spelling’s successful structure:

Hero card
Mode cards
Progress path
Status chips
Large answer card
Clean bank/search/filter page
Touch-friendly controls
Consistent action hierarchy

Grammar should have its own theme, but it should feel like the same app.

Rules:

One primary button per state.

Secondary buttons grouped and visually quieter.

No long paragraphs on child screens.

Use example sentences instead of explanations where possible.

Minimum tap target around 44px.

Input focus should land in the answer box when a question starts.

Error text should be human: “That did not save. Try again.” Not “command failed”.

Accessibility tests/checks:

Every form field has a visible label.

Read-aloud button has clear accessible name.

Mini-test nav has `aria-current`.

Feedback uses `role="status"` after submit.

Errors use `role="alert"`.

Keyboard path works: answer → submit → retry/next.

## U10 — Regression and absence tests

Phase 3 needs tests that check not just “does it render”, but “does it avoid confusing the child”.

Add/extend:

`tests/react-grammar-surface.test.js`
`tests/grammar-ui-model.test.js`
`tests/grammar-monster-roster.test.js`
`tests/grammar-transfer-scene.test.js`

Critical tests:

Dashboard renders four main actions only.

Dashboard includes Grammar Bank entry.

Dashboard does not contain “Worker”, “Stage 1”, “placeholder”, “denominator”, “reserved reward routes”.

Smart Practice first attempt does not show AI, worked solution, similar problem, or answer.

After wrong answer, retry and support controls appear.

Mini-test hides all feedback and support before finish.

Grammar Bank filters concepts by status.

Grammar Bank concept action starts focused practice.

Writing Try save emits non-scored command and does not update mastery.

Only four active Grammar monsters are visible.

Reserved monsters are not visible in child UI.

Adult report still renders detailed analytics.

## Bugs / flaws / regressions to include in Phase 3

I would explicitly add these to the plan.

First, the **monster roster is still wrong** for the new product decision. The repo still exposes seven active Grammar monsters in both metadata and game registry. That must be fixed before final UX, otherwise children will see creatures you now want reserved. ([GitHub][4])

Second, the **direct Grammar monster mapping is still six-direct-monster based**. `GRAMMAR_MONSTER_CONCEPTS` still maps concepts to Bracehart, Glossbloom, Loomrill, Chronalyx, Couronnail, and Mirrane. That must be rebucketed into three direct monsters plus Concordium. ([GitHub][10])

Third, **transfer UI is still not real**. Phase 2 intentionally shipped Worker-side transfer only and deferred the React scene. Current placeholder/roadmap copy should be removed from the child surface and replaced with a real “Writing Try” screen. ([GitHub][1])

Fourth, **child UI exposes developer/adult terms**. “Worker marked”, “Worker authority”, “Stage 1”, “Evidence snapshot”, “Reserved reward routes”, and “Full placeholder map” should not be in child-facing screens. ([GitHub][3])

Fifth, **pre-answer helper/action visibility needs tightening**. The session component currently has support and AI action areas in the live session surface. Even if the Worker blocks unsafe commands, the UI should not invite children to ask for AI explanations or similar problems before making a proper independent attempt. ([GitHub][6])

Sixth, **client transfer read-model plumbing should be checked**. Phase 2 says `transferLane` exists in the Worker read model, but the current client metadata normaliser visible in `metadata.js` does not obviously expose it. Treat this as a verification task in U6 rather than assuming it works. ([GitHub][1])

Seventh, **Windows bundle audit guard remains a hygiene bug**. Phase 2 found that `scripts/audit-client-bundle.mjs` can silently exit 0 on Windows due to path handling. Not directly Grammar UX, but worth putting in the Phase 3 hygiene tail because it can hide bundle regressions. ([GitHub][1])

## Proposed child-facing flow

The new Grammar flow should feel like this.

Dashboard:

“Hi Ava. Ready for Grammar?”

Cards:

“3 due today”
“2 trouble spots”
“5 secure”
“Concordium progress 7/18”

Buttons:

Start Smart Practice
Fix Trouble Spots
Mini Test
Grammar Bank

Practice:

“Question 2 of 5”

Prompt:

“Choose the sentence that uses a relative clause.”

Answer choices.

Buttons:

Read aloud
Submit

After wrong answer:

“Not quite. Look for the extra information about the noun.”

Buttons:

Try again
Show a step
Show answer

After correct:

“Correct. The relative clause tells us more about the noun.”

Button:

Next question

Summary:

“Round complete”

“You answered 5. You got 4 correct. One concept is due again soon.”

Buttons:

Fix missed question
Start another round
Open Grammar Bank

Grammar Bank:

Search: “clause”

Filters:

All / Due / Trouble / Learning / Secure

Concept card:

“Relative clauses — Learning”

Tap:

Simple explanation, example, status, practise button.

Writing Try:

“Use today’s grammar in your own sentences.”

Save only. No score.

## Final Phase 3 definition of done

I would not call Phase 3 done until these are true:

A child can use Grammar without seeing any implementation/reporting language.

The default path is obvious: Smart Practice.

Grammar Bank is useful in the same way Spelling Word Bank is useful.

Session screen shows one task and one primary action at a time.

Strict mini-test feels clearly different from learning practice.

Wrong answers lead to simple retry/support, not a wall of explanation.

Adult analytics exist but are separated.

Only Bracehart, Chronalyx, Couronnail, and Concordium are active.

Glossbloom, Loomrill, and Mirrane are retained only as reserve.

Transfer writing has a real non-scored UI.

No score-bearing behaviour changes are introduced unless separately planned with content release/versioning.

My blunt recommendation: **do this before content expansion.** More templates will not help if children cannot tell what is happening. Phase 2 made the engine credible; Phase 3 should make the product usable.

[1]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/james/grammar/grammar-phase2-implementation-report.md "raw.githubusercontent.com"
[2]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/spelling/components/SpellingSetupScene.jsx "raw.githubusercontent.com"
[3]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/grammar/components/GrammarSetupScene.jsx "raw.githubusercontent.com"
[4]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/grammar/metadata.js "raw.githubusercontent.com"
[5]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/spelling/components/SpellingWordBankScene.jsx "raw.githubusercontent.com"
[6]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/grammar/components/GrammarSessionScene.jsx "raw.githubusercontent.com"
[7]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/grammar/components/GrammarSummaryScene.jsx "raw.githubusercontent.com"
[8]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/grammar/components/GrammarPracticeSurface.jsx "raw.githubusercontent.com"
[9]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/grammar/components/GrammarAnalyticsScene.jsx "raw.githubusercontent.com"
[10]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/platform/game/mastery/grammar.js "raw.githubusercontent.com"
