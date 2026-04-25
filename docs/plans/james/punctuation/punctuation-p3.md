Yes — Phase 3 should be a **proper UX/UI rebuild plan**, not another hardening patch.

Phase 2 has done the engineering safety work. The completion report says the hardening chain merged 10 PRs, added 71 tests plus updates, fixed redaction/guided-routing/disabled-state/monster-roster/smoke issues, and ended with no failing tests on the Phase 2 chain. It also explicitly says the next likely Phase 3 attention areas are the learner-facing AI/context-pack decision, the skipped roster test, stale “First Release Scope” doc framing, telemetry thresholds without a dashboard, and some reserved-rank dead weight. ([GitHub][1])

The big UX issue is structural: **Spelling is built as a real learner experience; Punctuation is still mostly a single technical practice surface.** Spelling has separate scene files for setup, session, summary, word bank, word-detail modal, icons and view-model helpers. ([GitHub][2]) Punctuation currently has only `PunctuationPracticeSurface.jsx` and `punctuation-view-model.js` in its components folder. ([GitHub][3]) That explains why Punctuation feels confusing even if the backend is now solid.

## Phase 3 goal

Phase 3 should make Punctuation feel like Spelling:

A child opens Punctuation and immediately understands:

“What should I do now?”
“How am I doing?”
“What punctuation skills are wobbly?”
“What monster progress did I make?”
“What can I practise again?”

The clever scheduling, weak-spot routing, GPS rules, reward projection and redaction should stay behind the scenes. The child should not see a mini admin console.

## Main UX diagnosis

The current Punctuation setup screen exposes too many modes at once. It has Start practice, Guided skill, Guided learn, Weak spots, GPS test, Endmarks, Apostrophe, Speech, Comma, Boundary and Structure focus all on the same setup surface. ([GitHub][4]) That is powerful for QA, but it is too much for children.

Spelling’s setup is much cleaner. It presents a small number of mode cards and a clear journey message: Smart Review mixes due, weak and fresh words; the child can use trouble drill or SATs rehearsal if needed. ([GitHub][5]) Punctuation should copy that pattern, not copy every internal mode into the first screen.

Also, Punctuation has no child-facing equivalent of the Spelling Word Bank. Spelling’s word bank gives the learner a status view with filters, counts, search, word groups and tap-to-open details. The screen tells the learner how many words are secure, due and weak, and lets them tap a word for an explainer or drill. ([GitHub][6]) Punctuation’s service phases are currently only `setup`, `active-item`, `feedback`, `summary`, `unavailable`, and `error`; there is no `skill-bank`, `rule-map`, or similar learner status phase. ([GitHub][7])

So Phase 3 should add a **Punctuation Map** or **Punctuation Toolkit** as the Word Bank equivalent.

My recommended name: **Punctuation Map**. It sounds child-friendly and fits the monster/region journey better than “analytics”, “skill bank”, or “evidence”.

## Proposed Phase 3 product flow

### 1. Setup: “Choose today’s punctuation journey”

Replace the current button-heavy setup with three big child-friendly cards:

**Smart Review**
“Best next questions for you.”

**Wobbly Spots**
“Practise the punctuation that needs another go.”

**GPS Check**
“Test mode. Answers at the end.”

Under those, add one quieter secondary action:

**Open Punctuation Map**
“See your punctuation skills and monsters.”

The six focus modes should not be primary buttons on the setup screen. They should move into the Punctuation Map and detail modal. For example, if the child taps “Apostrophes”, they can choose “Practise this”.

Keep round length simple: 4, 8, 12. Default to 4. Children do not need seven length choices.

The setup status should show only:

Secure skills
Due today
Wobbly spots
Monster progress: Pealark, Curlune, Claspin, Quoral

No long report, no adult diagnostic copy, no mode matrix.

### 2. Punctuation Map: the Word Bank equivalent

This is the most important new surface.

It should show the 14 punctuation skills grouped visually by the active 3+1 monster model:

**Pealark**
Capital letters and sentence endings
Speech punctuation
Semi-colons between clauses
Dashes between clauses
Hyphens to avoid ambiguity

**Claspin**
Apostrophes for contraction
Apostrophes for possession

**Curlune**
Commas in lists
Fronted adverbials
Commas for clarity
Parenthesis
Colons before lists
Semi-colons in lists
Bullet-point punctuation

**Quoral**
Grand punctuation mastery across all 14

Each skill card should show:

Skill name
Status pill: New, Learning, Due, Wobbly, Secure
A tiny progress strip or dots
One child-readable example
A “Practise” button

Example card:

“Speech punctuation”
Status: Wobbly
Example: “Where are you going?” asked Zara.
Button: Practise this

Filters should be simple:

All
Due
Wobbly
Learning
Secure
New

Do not put adult metrics here. No “attempt count”, “release ID”, “mastery key”, “facet weight”, or raw misconception code. Those belong in Parent/Admin surfaces.

### 3. Skill detail modal: quick rule, example, practise

When the child taps a skill in the Punctuation Map, open a modal like Spelling’s word detail modal. Spelling already uses a modal with an explain/drill split for individual words. ([GitHub][8]) Punctuation should use the same idea.

The Punctuation detail modal should have two tabs:

**Learn**
One rule
One good example
One common mix-up

**Practise**
Start a focused mini-round for this skill

For example:

Rule: Put the spoken words inside inverted commas.
Good: “Can we start now?” asked Ella.
Mix-up: “Can we start now”? asked Ella.

Do not expose accepted answers, validators, correct indexes, hidden queues, reward-unit IDs, or release IDs. Phase 2 already hardened redaction; Phase 3 must not weaken it.

### 4. Session screen: one question, one job

The active practice screen should be stripped down.

At the top:

Question 2 of 4
Skill: Speech punctuation
Mode: Smart Review / Wobbly Spot / GPS Check

Then the question card.

Then the answer area.

Then two or three buttons only:

Check
Skip
End round

For GPS mode, the button should say:

Save answer

and the screen should clearly say:

“Test mode: answers at the end.”

The current guided teach box is too heavy for a child because it can show a rule, worked example, common mistake and self-check prompt inline before the item. The existing code already renders all those fields when present. ([GitHub][4]) In Phase 3, collapse this into one short “Rule reminder” with a “Show example” toggle. The default should be short.

### 5. Text input behaviour must depend on item type

This is one flaw I would add to the plan.

Current `TextItem` starts the typed value from `item.stem`. That works for “fix this sentence” and paragraph repair because the child edits the broken text. But it is confusing for sentence combining and transfer writing, where the stem is source material, not the answer. The React tests even assert that combine and paragraph both render as text areas with the original stem visible. ([GitHub][9])

Phase 3 should split text entry behaviour:

For **insert**, **fix**, and **paragraph repair**: prefill the editable sentence/passage.

For **combine**: show the two source sentences above, but leave the answer box blank.

For **transfer**: show the instruction and leave the answer box blank.

That one change will make the practice feel much less strange.

### 6. Feedback: child-friendly, not report-style

Feedback should use three layers, but only the first two are visible by default:

First line: “Nice!” / “Almost!” / “Try this bit again.”

Second line: one specific nudge.

Optional reveal: “Show model answer.”

Example:

“Almost! The spoken words need to stay inside the inverted commas.”

Then a button:

“Try another”
or
“Continue”

For correct answers, do not over-explain. A child does not need a paragraph every time.

For wrong answers, give one reason and one next action.

For GPS mode, no feedback until summary. Phase 2 already proves GPS delayed feedback in the smoke path, so the UI should make that obvious. ([GitHub][10])

### 7. Summary: celebrate, then route

The summary should be short and useful:

“You fixed 3 of 4.”
“1 skill is due again soon.”
“Pealark made progress.”
“Speech punctuation needs another go.”

Buttons:

Practise wobbly spots
Open Punctuation Map
Start another round
Back to dashboard

If there are mistakes, show them as small chips/cards, not a long report. Spelling already does this well by showing “Words that need another go” and offering “Drill all”. ([GitHub][11]) Punctuation should copy the pattern: “Punctuation to try again”.

## File-level implementation plan

### Unit P3-U1: Split the Punctuation UI into real scenes

Create:

`src/subjects/punctuation/components/PunctuationSetupScene.jsx`
`src/subjects/punctuation/components/PunctuationSessionScene.jsx`
`src/subjects/punctuation/components/PunctuationFeedbackScene.jsx`
`src/subjects/punctuation/components/PunctuationSummaryScene.jsx`
`src/subjects/punctuation/components/PunctuationMapScene.jsx`
`src/subjects/punctuation/components/PunctuationSkillDetailModal.jsx`
`src/subjects/punctuation/components/PunctuationCommon.jsx`
`src/subjects/punctuation/components/punctuation-icons.jsx`

Then reduce `PunctuationPracticeSurface.jsx` to a router, like Spelling’s surface. Spelling’s practice surface delegates by phase to setup, session, summary and word-bank scenes. ([GitHub][12]) Punctuation should do the same.

Acceptance: no learner-facing JSX monster file. Each phase has one scene component.

### Unit P3-U2: Add `skill-map` or `punctuation-map` phase

Update the Punctuation state contract to include:

`punctuation-map`

or:

`skill-map`

I prefer `punctuation-map`, because it is more child-facing.

Add local UI actions:

`punctuation-open-map`
`punctuation-close-map`
`punctuation-map-status-filter`
`punctuation-map-monster-filter`
`punctuation-skill-detail-open`
`punctuation-skill-detail-close`
`punctuation-skill-detail-tab`
`punctuation-start-skill-focus`

This can be mostly local UI state. Starting practice still goes through Worker commands.

Acceptance: a learner can open the Punctuation Map, filter skills, open a detail modal, close it, and start a focused session.

### Unit P3-U3: Build the Punctuation Map read model

Use existing safe content and analytics:

14 skills from `PUNCTUATION_SKILLS`
Cluster-to-monster mapping from `PUNCTUATION_CLUSTERS`
Status from learner analytics/reward-unit state
Due/wobbly/secure state from existing stats

Each skill row/card should have:

`skillId`
`name`
`monsterId`
`clusterId`
`status`
`statusLabel`
`ruleShort`
`workedGood`
`contrastBad`
`contrastGood`
`attemptSummary` safe display only
`focusMode` or `skillId` for start command

Do not send raw `accepted`, `correctIndex`, `validator`, generators, or answer banks into this scene. The content file contains fields like rules, worked examples, contrast examples, item models and validators, so the map must be allowlisted carefully. ([GitHub][13])

Acceptance: recursive forbidden-key test passes for map and skill modal payloads.

### Unit P3-U4: Redesign setup screen

The setup scene should have:

Hero: Bellstorm Coast
Title: “Choose today’s punctuation journey.”
Three mode cards: Smart Review, Wobbly Spots, GPS Check
One secondary card/link: Punctuation Map
Simple status: Secure, Due, Wobbly
Monster strip: Pealark, Claspin, Curlune, Quoral

Remove the direct six focus buttons from the primary setup screen. They still exist as internal modes, but children access them through skill cards.

Acceptance: setup screen can be understood in under 10 seconds by an adult and by a child. No more than three primary choices.

### Unit P3-U5: Redesign session scene

Use a single large question card. Make the prompt readable and the input obvious.

Mode-specific rules:

Choice item: large tappable choices.

Fix/insert: editable sentence starts with the broken sentence.

Paragraph repair: editable text area starts with the broken passage.

Combine: source sentences shown above; answer text area blank.

Transfer: answer text area blank.

GPS: no feedback, “Save answer”, progress visible.

Guided: one short rule reminder, example hidden behind “Show example”.

Acceptance: each item type has a React test proving the correct input shape.

### Unit P3-U6: Redesign feedback and summary

Feedback should be simple. Summary should route the child back into useful action.

Feedback acceptance:

Correct answer shows short positive feedback and Continue.

Incorrect answer shows one specific nudge and optional model reveal.

Facet chips are not shown as technical diagnostics; convert them to child labels or hide them.

Summary acceptance:

Shows score, monster progress, wobbly skills, and next action.

GPS summary shows review cards, but not a long report.

Summary buttons include “Practise wobbly spots” and “Open Punctuation Map”.

### Unit P3-U7: Styling and responsive polish

Add a dedicated Punctuation UI styling block rather than relying on generic card/button classes. Spelling has a large dedicated setup/session/word-bank visual layer in `styles/app.css`; Punctuation should receive the same treatment. ([GitHub][14])

Use:

Bellstorm Coast background
Gold/teal accents
Large hit areas
Readable font sizes
Clear focus states
Mobile-first stacking
No hover-only affordances
Reduced-motion support

Acceptance: setup, session, summary, map and modal all work on mobile width.

### Unit P3-U8: Keep AI out of the child flow for now

Phase 2 deliberately left AI context-pack UX for Phase 3, with the question of whether to productise it or strip it from the learner read model. ([GitHub][1]) My recommendation: **do not expose AI context pack to children in this phase.**

Instead, add a deterministic “Why this?” label:

“Chosen because speech punctuation is wobbly.”
“Chosen because this is due today.”
“Chosen because you are close to securing Claspin.”

That gives the child confidence without adding chat/explanation clutter.

AI context pack can stay teacher/admin-only.

### Unit P3-U9: Fix known leftovers while doing UX

Add these to the Phase 3 plan as cleanup items:

Delete or port the one skipped U5 roster test.

Rename docs from “First Release Scope” to “Current Release Scope”.

Remove or comment the dead `CODEX_POWER_RANK` reserved tombstones so future devs do not misunderstand reserved monsters.

Either wire telemetry thresholds into a real dashboard/query or remove threshold wording from operational docs.

Make sure no reserved monsters appear in the child Punctuation Map.

Phase 2’s completion report calls out these exact leftovers as likely Phase 3 attention points. ([GitHub][1])

## Tests to add

Add React tests for:

Setup shows exactly three primary journey cards.

Setup has Punctuation Map entry.

Map shows 14 skills grouped under Pealark, Claspin, Curlune, and Quoral.

Map filters by Due, Wobbly, Learning, Secure, New.

Skill detail modal shows rule/example/common mix-up.

Skill detail modal does not leak accepted answers, validators, correct indexes, generators or hidden queues.

Focused skill practice starts with the selected `skillId`.

Combine mode uses blank answer input.

Transfer mode uses blank answer input.

Fix/insert/paragraph modes prefill editable text.

GPS mode hides feedback until summary.

Summary has “Practise wobbly spots” and “Open Punctuation Map”.

Reserved monsters Colisk, Hyphang and Carillon do not appear in the learner-facing Punctuation Map.

Also add one Playwright-style smoke path if the project already has a pattern for it:

Open Punctuation → start Smart Review → answer one → summary → open Punctuation Map → open skill detail → start focused practice.

## The desired final child flow

A good Punctuation session should feel like this:

Child opens Punctuation.

They see:

“Choose today’s punctuation journey.”

They press:

“Smart Review.”

They get:

Question 1 of 4.
“Fix the punctuation.”

They answer.

They see:

“Nice!”
or
“Almost — the question mark belongs inside the speech marks.”

They continue.

At the end:

“You fixed 3 of 4.”
“Speech punctuation needs another go.”
“Pealark made progress.”

They can press:

“Practise wobbly spots”
or
“Open Punctuation Map.”

That is the target. Clean on the surface, comprehensive underneath — same philosophy as Spelling.

[1]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/james/punctuation/punctuation-p2-completion-report.md "raw.githubusercontent.com"
[2]: https://github.com/fol2/ks2-mastery/tree/main/src/subjects/spelling/components "ks2-mastery/src/subjects/spelling/components at main · fol2/ks2-mastery · GitHub"
[3]: https://github.com/fol2/ks2-mastery/tree/main/src/subjects/punctuation/components "ks2-mastery/src/subjects/punctuation/components at main · fol2/ks2-mastery · GitHub"
[4]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/punctuation/components/PunctuationPracticeSurface.jsx "raw.githubusercontent.com"
[5]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/spelling/components/SpellingSetupScene.jsx "raw.githubusercontent.com"
[6]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/spelling/components/SpellingWordBankScene.jsx "raw.githubusercontent.com"
[7]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/punctuation/service-contract.js "raw.githubusercontent.com"
[8]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/spelling/components/SpellingWordDetailModal.jsx "raw.githubusercontent.com"
[9]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/tests/react-punctuation-scene.test.js "raw.githubusercontent.com"
[10]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/tests/punctuation-release-smoke.test.js "raw.githubusercontent.com"
[11]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/spelling/components/SpellingSummaryScene.jsx "raw.githubusercontent.com"
[12]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/spelling/components/SpellingPracticeSurface.jsx "raw.githubusercontent.com"
[13]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/shared/punctuation/content.js "raw.githubusercontent.com"
[14]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/styles/app.css "raw.githubusercontent.com"
