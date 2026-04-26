You’re not imagining it. Phase 3 **did land real files and scene-splitting**, but I agree with your judgement: the visible learner experience still may not feel changed enough, especially from the main landing/setup path.

I tried the clone route you suggested, but this workspace could not resolve `github.com`, so the clone failed. I re-scanned the current GitHub/raw repo instead.

My honest read is this:

Phase 3 says Punctuation was changed from a single monolith into a Spelling-shaped flow: Setup → Session → Feedback → Summary → Punctuation Map. The report claims the learner experience now mirrors Spelling and includes setup cards, session, feedback, summary, monster progress, and a skill map. ([GitHub][1]) The repo does now contain separate Punctuation scene files — `PunctuationSetupScene`, `PunctuationSessionScene`, `PunctuationSummaryScene`, `PunctuationMapScene`, and `PunctuationSkillDetailModal` — and Spelling has the equivalent mature set with setup, session, summary, word bank, modal, icons, common components, and hero/backdrop helpers. ([GitHub][2]) The Punctuation practice surface also routes phases to those new scenes. ([GitHub][3])

But the “why can’t I see it?” problem has a concrete answer: **Phase 3 changed the internal subject scene structure, but not enough of the actual child entry journey.** The home page is still strongly Spelling-first: it says “Today’s words are waiting” and the main CTA opens `spelling`, not the most relevant subject or Punctuation. ([GitHub][4]) The generic subject cards are just openable cards with name/blurb/progress, so Punctuation can still feel like “just another card” rather than a subject with its own child-friendly landing experience. ([GitHub][5])

More importantly, I found what looks like a serious UX flow bug/regression in the current Punctuation setup scene: the three primary cards dispatch `punctuation-set-mode`, not `punctuation-start`. The Map card opens the map, and the length toggle only saves length. In the rendered setup section I can see the hero, today cards, mode cards, round length, and monster strip, but not a clear “Start round” action. ([GitHub][6]) Meanwhile `punctuation-start` is the command that maps to the Worker `start-session` command. ([GitHub][7]) That means the child may be clicking “Smart Review” and only changing a preference, not starting practice. That would absolutely make the page feel unchanged/confusing.

The tests likely missed that because the React smoke test asserts that setup labels render, then starts sessions by dispatching `punctuation-start` directly through the harness helper rather than clicking through the child UI journey. ([GitHub][8]) This is exactly the kind of problem SSR/unit tests can miss: the components exist, but the real child path is broken or invisible.

So for Phase 4, I would not start by expanding content. I would make Phase 4 a **visible learner-journey correction phase**.

# Recommended Phase 4 direction

Phase 4 should be called something like:

**Punctuation Phase 4 — Visible Child Journey, Learning Flow, and Reward Wiring**

The aim is simple: when a child opens Punctuation, the change must be obvious in the first 5 seconds. They should know what to press, what they are practising, how they are doing, what monster is growing, and where to check their punctuation skills.

This phase should have four priorities, in this order:

1. Fix the child entry/setup/start flow.
2. Bring Punctuation’s landing/setup/map up to Spelling-level clarity.
3. Verify the learning loop is genuinely effective, not just functional.
4. Prove reward wiring is visible and consistent across setup, summary, map, codex, and home.

I would deliberately **not** broaden the 14-skill scope in Phase 4. The docs already say the current release preserves the 14-skill map and that new expansions should deepen one cluster/validator family at a time only when tests, negative cases, transfer facets, and reward denominators exist. ([GitHub][9]) Phase 4 should make the current subject usable and lovable before adding more.

# Phase 4 scope

## P4-U0: Emergency UX path fix

This is the first thing to do.

The setup page needs one unmistakable primary action:

**Start Smart Review**

or:

**Start 4-question round**

The three current cards can still exist, but they need to either start immediately or clearly select a mode and reveal/update one large start button. For a child, “tap card, nothing obvious happens” is a failed flow.

Recommended behaviour:

Clicking **Smart Review** starts a 4-question round immediately.

Clicking **Wobbly Spots** starts a weak-spots round immediately.

Clicking **GPS Check** starts a GPS round immediately.

The round-length toggle can stay below those cards, but it should be secondary.

Acceptance criteria:

Home → Punctuation → Start Smart Review → first question appears.

Home → Punctuation → Wobbly Spots → first question appears or, if no weak spots exist, shows a child-friendly empty state and offers Smart Review.

Home → Punctuation → GPS Check → first GPS question appears and clearly says answers come at the end.

No child has to understand “selected mode” before starting.

Add a proper browser/e2e smoke for this. Do not rely on SSR-only assertions. The current tests prove labels and direct dispatch, not the real click path. ([GitHub][8])

## P4-U1: Fix the main landing page, not only the subject page

Right now the main home page is still Spelling-led: “Today’s words are waiting” and “Begin today’s round” opens Spelling. ([GitHub][4]) That is fine when Spelling is the only mature subject, but it is now actively hiding Punctuation work.

Change the home page to be subject-aware.

Option A, simplest:

Hero copy becomes subject-neutral:

**Today’s practice is waiting.**

Primary CTA opens the subject with the strongest “due now” signal.

Option B, better:

Hero shows a “next best subject” card:

**Today’s best round: Punctuation**
“Pealark has 2 skills due.”

CTA:

**Start Punctuation**

Option C, if you want kids to choose:

Show three large subject journey cards:

Spelling
Punctuation
Grammar

Each card should show only:

Due today
Wobbly
Monster progress
Start button

For Phase 4, I recommend Option B. It keeps the page clean but stops Spelling being hardcoded as the default forever.

Acceptance criteria:

When Punctuation has due/wobbly work, the home hero can recommend Punctuation.

The primary CTA must not always open Spelling.

Punctuation subject card shows Bellstorm Coast, Pealark/Curlune/Claspin/Quoral progress, and a simple “Start” action.

## P4-U2: Rebuild Punctuation setup as a true child dashboard

The current setup scene has the right ingredients, but it still reads like a thin technical dashboard. The copy is “Punctuation practice” and “Pick a short round — we’ll queue what matters next.” ([GitHub][10]) That is not wrong, but it is not as strong as Spelling’s “word bank / today’s words” mental model.

The setup page should become:

**Bellstorm Coast**
**What shall we fix today?**

Main button:

**Start Smart Review**

Then two secondary buttons:

**Practise wobbly spots**
**GPS check**

Then a visible status row:

Secure
Due today
Wobbly

Then the monster strip:

Pealark
Claspin
Curlune
Quoral

Then:

**Open Punctuation Map**

No adult copy. No internal mode logic. No explanation-heavy blocks.

The child should not see “queue”, “cluster”, “release”, “diagnostic”, “projection”, or anything like that. The view-model already has a forbidden-term fixture for child copy; keep using that, but improve the actual words. ([GitHub][10])

Acceptance criteria:

A Year 4 child can identify the main action without adult help.

There is one dominant primary action.

There are no more than three action choices above the fold.

The Punctuation Map entry is visible without scrolling on common laptop/tablet sizes.

A first-time learner sees a helpful empty state: “Start your first round to unlock your map.”

## P4-U3: Make Punctuation Map the real “Word Bank equivalent”

Spelling works because Word Bank gives children a place to check status. Punctuation needs that same “I know where I stand” surface.

The current Map exists and shows 14 skills grouped by the active monsters, with filters and skill detail modal. ([GitHub][11]) That is good. But it needs to become more central and more visually meaningful.

Rename or present it as:

**My Punctuation Map**

or:

**Punctuation Toolkit**

I still slightly prefer **Punctuation Map** because it fits Bellstorm Coast.

Each skill card should show:

Skill name
Status: New / Learning / Due today / Wobbly / Secure
One very short example
Practise button

Current one-liners still include some adult-ish phrasing like “fronted adverbial”, “main clause”, and “complete clause.” ([GitHub][10]) The Phase 3 report already flags a related issue: the Worker guided teach box can still serve adult-register rules like “main clauses”, “fronted adverbial”, and “complete opening clause” after the child has just seen simpler modal copy. ([GitHub][1]) Fix this in Phase 4.

Also, be careful with Map status. The current Map falls back to every skill as `new` when analytics rows are absent. ([GitHub][11]) That is okay for a brand-new learner, but bad if analytics wiring is missing or delayed. Phase 4 should distinguish:

“No evidence yet”
from
“Analytics failed or unavailable”

Acceptance criteria:

The Map uses real analytics rows when available.

If analytics are unavailable, it says “We’ll unlock this after your next round,” not silently showing everything as New.

Reserved monsters Colisk, Hyphang, and Carillon never appear.

A child can open Map → tap Speech punctuation → see a rule → start a focused round.

The focused round really starts the chosen skill, not just the cluster.

## P4-U4: Session flow: reduce friction and protect learning quality

The session scene is now separated and supports one-question-at-a-time practice, item-specific input shape, GPS no-feedback mode, and collapsed guided help. ([GitHub][12]) Phase 4 should now check the learning flow itself.

The core learning loop should be:

Independent first attempt
Short, specific nudge
Optional model answer only after attempt
Near retry when useful
Spaced return later
Reward only after repeated clean evidence

That matches the learning direction already in the production docs: one correct answer does not secure a unit, and scheduler security requires repeated clean evidence, accuracy, streak, and spaced return. ([GitHub][9]) It also aligns with broader evidence: EEF guidance highlights metacognition/self-regulation as high-impact when pupils are supported to think explicitly about learning, and EEF maths guidance emphasises specific, clear feedback and addressing misconceptions rather than just right/wrong marking. ([CloudFront][13])

Phase 4 should test these learning contracts:

Smart Review does not show hints before the first attempt.

Guided mode gives support but does not make mastery too easy.

Wrong answers create a useful near retry.

One clean answer does not secure a monster unit.

GPS mode gives no feedback until the summary.

Summary routes the child to the next useful action.

Weak spots are selected from real weak evidence, not just random uncovered content.

Do not over-explain after every answer. Children need a clear nudge, not a report.

Recommended feedback shape:

Correct:

**Nice!**
“Your punctuation is in the right place.”

Almost:

**Almost.**
“The question mark needs to stay inside the speech marks.”

Then:

Continue
Try another like this
Show model answer

## P4-U5: Reward system wiring proof

Phase 3 already fixed one major reward issue: Summary originally read a dead path that production never populated, so real learners could see zero monster progress regardless of actual mastery. It now resolves reward state through the canonical monster-codex repository path. ([GitHub][14])

Phase 4 should prove this visually across every surface.

The same reward state must appear in:

Home subject card
Punctuation setup monster strip
Summary monster strip
Punctuation Map monster grouping
Codex / Monster Meadow
Parent/Admin summary, when present

The current roster is now correct in docs: Pealark for Endmarks/Speech/Boundary, Claspin for Apostrophes, Curlune for Comma/Flow/Structure, and Quoral as the grand 14-unit monster; Colisk, Hyphang, and Carillon are reserved. ([GitHub][9]) But there is still a docs bug: the mastery key example is still shown as `punctuation:::` in two places, which is not a useful stable example. ([GitHub][9]) Fix that as part of Phase 4 because reward debugging depends on clear keys.

Acceptance criteria:

Seed one secured `speech-core` unit and see Pealark progress on setup, summary, home, and codex.

Seed one secured apostrophe unit and see Claspin progress.

Seed one structure unit and see Curlune progress.

Secure all 14 and see Quoral grand progress.

Colisk, Hyphang, and Carillon never appear in learner-facing active Punctuation surfaces.

Reward deltas should be child-friendly. Do not show “projection” or raw stage numbers as the main message. Show:

**Pealark got stronger!**
**1 more Punctuation skill secured.**

The current Summary strip still says “Stage X of 4.” ([GitHub][14]) Keep that as secondary, but the child-facing celebration should be more natural.

## P4-U6: Fix known Phase 3 leftovers

The Phase 3 completion report itself lists the right follow-ups. I would pull them into Phase 4 as explicit tasks, not leave them as prose.

First, fix the Worker-side guided teach box adult-register content. Phase 3 made modal copy child-friendly, but guided sessions can still show adult-register shared content. ([GitHub][1])

Second, fix the “Back to dashboard” escape hatch. The Summary scene disables all next-action buttons with `composeIsDisabled`, including Back, so if a Worker command stalls the child may lose the escape route. ([GitHub][14]) Navigation should not be disabled in the same way as mutation commands.

Third, audit the shared content manifest for answer leaks. Phase 3 defanged client modal strings, but the report says shared content still contains original leaky strings and the Worker guided teach box may send them during guided sessions. ([GitHub][1])

Fourth, add a fixture-realism reviewer/check. Phase 3 had green tests where fixtures invented state shapes that production did not write. The report calls this out directly. ([GitHub][1])

Fifth, review the setup migration dispatch during render. The report says it works today but could be risky under React concurrent/StrictMode behaviour. ([GitHub][1]) For Phase 4, I would move that to a safer post-render effect or a central store migration path unless SSR absolutely requires the current design.

## P4-U7: Add proper browser journey tests

This is non-negotiable. Phase 3 did a lot of SSR tests, but your real observation proves SSR is not enough.

Add Playwright or equivalent browser tests for:

Home recommends or opens Punctuation when appropriate.

Punctuation setup has a visible Start Smart Review action.

Clicking Start Smart Review renders question 1.

Answering reaches feedback.

Continuing reaches summary.

Summary shows monster progress.

Summary opens Punctuation Map.

Map opens skill detail.

Skill detail starts guided practice for the exact selected skill.

Back buttons work even if a command is pending/stalled.

Run these against the production-style Worker command path, not only local module dispatch.

Acceptance criterion: a human can watch the test video and say, “Yes, this looks like the intended child flow.”

## P4-U8: Make telemetry real or remove the promise

The production docs admit the operational telemetry codes are aspirational and not wired to a dashboard or alerting pipeline yet. ([GitHub][9]) Phase 4 should either wire a minimum query surface or stop treating the thresholds as operational guarantees.

Track these events:

Punctuation card opened
Start Smart Review clicked
First item rendered
Answer submitted
Feedback rendered
Summary reached
Map opened
Skill detail opened
Guided practice started from Map
Unit secured
Monster progress changed
Command failed
Child escaped with Back during pending/degraded state

This is not just ops. It tells you whether children are actually reaching learning moments or getting stuck on setup.

# The Phase 4 plan I would approve

Here is the clean execution order.

**P4-0: Real start path and landing visibility**

Fix setup so the primary cards start sessions or expose one obvious Start button. Fix Home so it is not hardcoded to Spelling. Add a real browser journey test.

**P4-1: Setup redesign pass**

Make the setup page visibly Bellstorm/Punctuation, not a generic card grid. One main action, two secondary actions, monster strip, Map link, simple status row.

**P4-2: Punctuation Map upgrade**

Make it the true Word Bank equivalent. Verify real analytics wiring, child-friendly copy, no all-New false fallback, exact guided skill start, and visible status.

**P4-3: Session and feedback learning contract**

Audit independent first attempt, guided support, GPS delayed feedback, retry scheduling, spacing, and summary routing. Add behavioural tests for these.

**P4-4: Reward wiring proof**

Same monster progress on Home, Setup, Summary, Map, Codex. Fix mastery-key docs. Show child-friendly reward deltas.

**P4-5: Content safety and child-register pass**

Fix Worker guided teach box copy. Remove adult grammar terminology where not essential. Re-run answer-leak disjoint tests against shared Worker content, not only client mirror.

**P4-6: Navigation/degraded-state hardening**

Back buttons and safe navigation stay usable under pending/degraded/read-only states. Mutation buttons stay disabled. No child gets trapped.

**P4-7: Telemetry and fixture-realism**

Add producer/consumer checks for every new `ui.` read. Wire minimal telemetry query surface or explicitly keep it non-operational. Add Playwright path/video evidence.

# Bugs/regressions/flaws I would add to the Phase 4 plan immediately

The setup cards appear to save mode rather than start the session. This is likely the biggest visible UX bug.

The main home hero is still Spelling-first and opens Spelling from the primary CTA.

The current Punctuation setup has ingredients but not a strong child-facing “press this now” flow.

SSR tests start sessions by internal dispatch and do not prove the real child click path.

The Punctuation Map can silently fall back to all skills as New if analytics rows are missing.

Back/navigation controls are treated like mutation controls and may be disabled during pending command states.

Worker guided teach content can still be adult-register and possibly leaky compared with the defanged client modal.

Reward docs still show a malformed mastery-key example.

Telemetry thresholds are documented but not wired.

# My recommendation

Make Phase 4 **not a content phase** and **not a refactor phase**. Make it a **visible product-quality phase**.

The success measure should be brutally simple:

A child opens the app, sees Punctuation, presses one obvious button, completes a short round, sees what improved, sees which monster moved, and can open a Punctuation Map that feels as useful as Spelling’s Word Bank.

Until that path is obvious, the subject may be technically correct but still failing the learner.

[1]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/james/punctuation/punctuation-p3-completion-report.md "raw.githubusercontent.com"
[2]: https://github.com/fol2/ks2-mastery/tree/main/src/subjects/punctuation/components "ks2-mastery/src/subjects/punctuation/components at main · fol2/ks2-mastery · GitHub"
[3]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/punctuation/components/PunctuationPracticeSurface.jsx "raw.githubusercontent.com"
[4]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/surfaces/home/HomeSurface.jsx "raw.githubusercontent.com"
[5]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/surfaces/home/SubjectCard.jsx "raw.githubusercontent.com"
[6]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/punctuation/components/PunctuationSetupScene.jsx "raw.githubusercontent.com"
[7]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/punctuation/command-actions.js "raw.githubusercontent.com"
[8]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/tests/react-punctuation-scene.test.js "raw.githubusercontent.com"
[9]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/punctuation-production.md "raw.githubusercontent.com"
[10]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/punctuation/components/punctuation-view-model.js "raw.githubusercontent.com"
[11]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/punctuation/components/PunctuationMapScene.jsx "raw.githubusercontent.com"
[12]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/punctuation/components/PunctuationSessionScene.jsx "raw.githubusercontent.com"
[13]: https://d2tic4wvo1iusb.cloudfront.net/production/eef-guidance-reports/metacognition/metacognition-and-self-regulated-learning_guidance-report.v.2.4.0.pdf?utm_source=chatgpt.com "Metacognition and Self-Regulated Learning - Guidance report"
[14]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/punctuation/components/PunctuationSummaryScene.jsx "raw.githubusercontent.com"
