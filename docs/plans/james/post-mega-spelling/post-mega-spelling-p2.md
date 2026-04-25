You’re in a good place. Phase 1 is not a toy implementation — it landed the right architectural idea: **Mega stays permanent, Guardian is a parallel maintenance layer**, and the report says the shipped invariant is that Guardian wrong answers set `guardian.wobbling` without demoting `progress.stage` or Codex monster state. That is exactly the right emotional and learning model. The targeted spelling suite being 195/195 green is also a solid signal, with the full suite only showing one pre-existing unrelated failure. ([GitHub][1])

But I would **not** go straight to Pattern Quests or Boss Dictation yet. I would do a short **P1.5 hardening sprint** first. There are a few flow holes that are more important than new features.

The strongest thing you did is this: Guardian is a role change, not another badge grind. That matches the broader KS2 mastery principle you’ve been using: mixed retrieval, due/weak prioritisation, informative feedback, and spaced return rather than “more questions forever.” 

## My blunt view

Phase 1 is architecturally correct, but it has several **edge-flow inconsistencies** that could confuse children or accidentally undermine the “Mega is permanent” promise.

The first hardening goal should be:

**Make every user-facing path obey the Guardian contract, not just the Guardian scheduler.**

Right now the report proves the Guardian path itself does not demote Mega, but some surrounding paths still look legacy-shaped: skip buttons, drill buttons, cloze hints, “all rested” copy, and Word Bank states. Those are exactly the places real users will hit first.

## Highest-priority issue: fresh graduates may be blocked by the dashboard

This is the first thing I would check and probably fix.

The report says Guardian records are created lazily: no retroactive migration; a record is created the first time a word is selected for a Guardian Mission. ([GitHub][1]) The service selection function can pull lazy candidates from Mega words that do not yet have Guardian records, which means a fresh graduate should be able to start a first Guardian patrol. ([GitHub][2])

But the dashboard currently appears to enable the Begin button only when `guardianDueCount > 0`. In `PostMegaSetupContent`, `guardianActive` is derived from due count, and `beginDisabled` becomes true when no Guardian word is due. ([GitHub][3]) For a freshly graduated learner with an empty `guardianMap`, `guardianDueCount` will be 0 because `getPostMasteryState` only counts existing Guardian records. ([GitHub][2])

That creates a likely UX bug:

**Freshly graduated learner sees “All guardians rested” and cannot click Begin, even though the service could start a Guardian Mission by lazy-selecting unguarded Mega words.**

Fix this before anything else.

Engineering fix:

Add these fields to `getPostMasteryState`:

`unguardedMegaCount`
`guardianAvailableCount`
`guardianMissionAvailable`
`guardianMissionState`

Where `guardianMissionState` is one of:

`locked`
`first-patrol`
`due`
`wobbling`
`optional-patrol`
`rested`

Then the UI should use `guardianMissionAvailable`, not `guardianDueCount > 0`.

The dashboard copy should become:

For first patrol: **“First Guardian patrol ready — start with 8 words from your Word Vault.”**

For due words: **“7 words need a Guardian check today.”**

For no due but optional top-up allowed: **“No urgent duties. Optional patrol available.”**

For truly rested: **“All guardians rested. Next check tomorrow / in N days.”**

Add tests:

Fresh graduate, all core stage 4, empty guardian map → dashboard Begin is enabled.
Fresh graduate starts Guardian → 5–8 words selected and Guardian records created.
All words guarded, none due, optional top-up policy on → dashboard says optional patrol, not all rested.
All words guarded, none due, optional top-up policy off → dashboard disables Begin and says rested.

## Second priority: Guardian summary drill can break the Mega promise

This is the biggest “contract leak” I see.

The Guardian summary still renders the normal “Words that need another go” area with word chips and “Drill all”. ([GitHub][4]) The module handler for `spelling-drill-all` starts a normal `trouble` session, and `spelling-drill-single` starts a normal `single` session. ([GitHub][5])

That matters because the legacy engine demotes `progress.stage` on wrong answers in normal learning/test flows. In `applyLearningOutcome`, if `hadWrong` is true, the stage is reduced by 1; test wrong answers also reduce stage. ([GitHub][6])

So the Guardian path keeps Mega permanent, but a child can finish a Guardian Mission, click “Drill all”, miss the same word in the legacy drill, and potentially demote the word. That is not technically a Guardian scheduler bug, but it is a **product-level Mega permanence bug**.

Fix this immediately.

For Guardian summaries, replace legacy drill actions with one of these:

Best option: **Practice-only recovery drill**

When `summary.mode === 'guardian'`, “Practice wobbling words” should call `service.startSession` with `practiceOnly: true`. The wording should say:

“Optional practice. Mega and Guardian schedule will not change. Official recovery check returns tomorrow.”

Alternative option: **No immediate drill**

Hide “Drill all” for Guardian and say:

“These words will return tomorrow. That delay is part of the memory training.”

I prefer the practice-only option because children often want to fix the word now. But the app must clearly say it is rehearsal, not official recovery.

Add regression tests:

Guardian wrong answer → summary “practice wobbling words” → wrong again → `progress.stage`, `dueDay`, `lastDay`, and Codex projection unchanged.
Guardian wrong answer → practice-only correct → `guardian.wobbling` still true and `nextDueDay` still tomorrow.
Normal Smart Review summary drill still mutates progress as before.

## Third priority: skip is wrong for Guardian Mission

The session UI shows “Skip for now” for every non-test question session. Guardian sessions are `learning` sessions with `mode: 'guardian'`, so they inherit the skip button. ([GitHub][7])

The service `skipWord` path also does not special-case Guardian. It calls the legacy `engine.skipCurrent(session)` and then `engine.advanceCard`, not `advanceGuardianCard`. ([GitHub][2]) That breaks the Guardian mental model: Guardian is meant to be one clean attempt per word. The report explicitly records the design decision that Guardian Mission is single-attempt and has no retry/correction phase. ([GitHub][1])

Decide one rule:

Either hide skip in Guardian completely.

Or rename it to **“I don’t know”** and treat it as a wobble: update the Guardian record with `advanceGuardianOnWrong`, emit `spelling.guardian.wobbled`, and move on.

I would choose **“I don’t know” = wobble**. It is honest, child-friendly, and keeps the state machine clean.

Add tests:

Guardian session does not expose legacy skip copy.
Guardian “I don’t know” creates a wobble event.
Guardian “I don’t know” does not mutate `progress.stage`.
Guardian order remains FIFO after the action.

## Fourth priority: Guardian may be giving too much help

Right now `showCloze` is true for all non-test sessions if the preference is on. Guardian is not test mode, so it can show the cloze sentence. ([GitHub][7])

For ordinary learning, cloze is fine. For Guardian, it weakens the claim that this is clean long-term retrieval. It can reveal context and word length, which is a meaningful hint.

I would change this:

```js
const showCloze =
  prefs.showCloze &&
  session.type !== 'test' &&
  session.mode !== 'guardian';
```

Then give Guardian its own session copy:

“Spell the word from memory. One clean attempt.”

Also add a Guardian chip in `spellingSessionInfoChips`, because right now the session chips only show year label and practice-only status. ([GitHub][8])

This is polish, but it affects learning quality.

## Fifth priority: decide what “rested” actually means

At the moment there is a semantic mismatch.

The service selector says Guardian rounds are 5–8 words and can top up from non-due Guardian records if the due bucket is below the minimum round length. ([GitHub][2]) The dashboard, however, uses `guardianDueCount` to decide whether Guardian is active, and says “All guardians rested” when due count is zero. ([GitHub][3])

Those two ideas conflict.

You need a product decision:

Option A: **Due-only Guardian**

If no words are due, no mission starts. Remove non-due top-up from the selector. This is the pure spaced-repetition version.

Option B: **Daily patrol Guardian**

Even if few words are due, fill to 5 with oldest non-due or unguarded Mega words. This is more playable and probably better for your kids. But then the UI must stop saying “All rested” when an optional patrol can start.

I recommend Option B, because your actual goal is to keep children playing. But call it honestly:

“2 urgent checks + 3 patrol words.”

Do not label optional patrol words as “due”.

Implementation:

Make `selectGuardianWords` return metadata, not just slugs:

```ts
{
  slug,
  reason: 'wobbling-due' | 'due' | 'first-patrol' | 'optional-top-up'
}
```

Then the summary and debug tools can explain why each word appeared.

## Sixth priority: content hot-swap and orphan Guardian records

The report already flags content-bundle hot-swap orphaning as deferred: removing a core word while `guardianMap` references it can silently drop that word from selected rounds. ([GitHub][1])

I would not defer this until Pattern Quests. It is small enough to fix now.

`selectGuardianWords` should filter existing `guardianMap` entries through `wordBySlug` and probably through current core/secure eligibility before they enter the due buckets. Lazy candidates already check `wordBySlug`, but existing Guardian entries are built directly from `Object.entries(guardianMap)`. ([GitHub][2])

Add a sanitizer:

```ts
function isGuardianEligibleSlug(slug, progressMap, wordBySlug) {
  const word = wordBySlug[slug];
  if (!word) return false;
  if ((word.spellingPool === 'extra' ? 'extra' : 'core') !== 'core') return false;
  return Number(progressMap?.[slug]?.stage) >= GUARDIAN_SECURE_STAGE;
}
```

Use it in:

`selectGuardianWords`
`getPostMasteryState`
Word Bank Guardian counts
summary next-due calculation

Add tests:

Unknown slug in guardian map does not count as due.
Unknown slug does not fill a round.
If content removes a word, Guardian still starts with valid words.
If a word becomes non-core, it does not block or pollute Guardian.

## Seventh priority: reset should clear Guardian state

Check this carefully.

The service `resetLearner` calls `engine.resetProgress(learnerId)` and `persistence.resetLearner?.(learnerId)`, then saves prefs. ([GitHub][2]) If the persistence adapter clears both progress and guardian state, fine. But if the service is using fallback local storage with no repository reset implementation, `ks2-spell-guardian-*` may survive after progress is reset.

That would create confusing future state: a learner can be non-Mega with old Guardian records still sitting around.

Add explicit clearing:

```js
removeJson(resolvedStorage, guardianMapKey(learnerId));
```

Or make `saveGuardianMap(learnerId, {})` part of reset.

Add tests:

Reset learner clears progress and guardian map.
After reset, `getPostMasteryState().allWordsMega === false`, `guardianDueCount === 0`, `wobblingCount === 0`, and `guardianMap` is empty.

## Eighth priority: localStorage concurrency and partial writes

The report already lists two reliability risks: concurrent-tab last-writer-wins for `guardianMap`, and partial localStorage writes if quota errors happen between progress and Guardian writes. ([GitHub][1])

I would not do a giant storage refactor yet. But I would add two cheap protections.

First, save Guardian map by merging just the changed record:

```ts
function saveGuardianRecord(learnerId, slug, record) {
  const latest = loadGuardianMap(learnerId);
  latest[slug] = record;
  saveGuardianMap(learnerId, latest);
}
```

That does not solve all races, but it reduces accidental overwrites compared with writing a stale whole-map snapshot.

Second, surface save failure. `saveJson` currently swallows storage errors. ([GitHub][2]) That is acceptable for a reference demo, but not for a child’s progress. Return a boolean from persistence write functions and show a quiet warning:

“Progress could not be saved on this device. Export or free storage.”

Add tests using throwing storage:

Guardian answer with storage failure does not crash.
UI receives warning.
Mega is still not demoted.
Retrying later can save.

## Ninth priority: event idempotency around reloads

Guardian emits per-word events on answer submission and mission-completed events on finalisation. The report says Guardian Mission emits both normal `SESSION_COMPLETED` and `GUARDIAN_MISSION_COMPLETED`. ([GitHub][1])

The risky area is browser refresh or network retry between:

answer submitted → event emitted → state synced → continue clicked
or
last continue → summary generated → completion events emitted

You want to ensure no duplicate `guardian.mission-completed` event if the user double-clicks Continue, refreshes on final card, or resumes a completed session.

Add event IDs:

`guardian:${session.id}:${slug}:answer`
`guardian:${session.id}:completed`

Then event sinks can dedupe.

Add tests:

Double submit while `awaitingAdvance` true does not emit duplicate per-word event.
Double continue on final card does not emit duplicate mission-completed event.
Resume from saved summary does not re-emit mission-completed.
Abandoned Guardian session emits no mission-completed event.

## Tenth priority: Word Bank clarity

The new Guardian filters are useful: `guardianDue`, `wobbling`, `renewedRecently`, and `neverRenewed`. ([GitHub][9])

But I would polish the meanings. “Renewed recently” and “Never renewed” are parent-friendly, but not child-friendly. For children, use:

Guardian due → **Due for check**
Wobbling → **Wobbling words**
Renewed recently → **Guarded this week**
Never renewed → **Not guarded yet**

Also check this subtle issue: `guardianDue` currently requires `status === 'secure'`. ([GitHub][9]) If a Mega word’s legacy due date has rolled over and the legacy status becomes `due`, it may not show in Guardian Due even though its Guardian record is due. That may be intentional, but test it directly. In post-Mega land, the child should not have to understand the difference between legacy due and Guardian due.

## Suggested P1.5 sprint order

I would do it in this order.

First, fix the **Guardian availability selector**. Add `unguardedMegaCount`, `guardianMissionAvailable`, and `guardianMissionState`. Update the dashboard Begin button and copy. This likely fixes the fresh-graduate problem and the “all rested” mismatch.

Second, close the **Mega demotion loophole** from Guardian summary drills. Guardian summary practice must be practice-only or hidden.

Third, fix **skip in Guardian**. Hide it or turn it into “I don’t know” that records a wobble.

Fourth, make Guardian retrieval stricter by disabling cloze and adding Guardian-specific session copy.

Fifth, sanitise Guardian records against current content and reset flows.

Sixth, add storage warnings and merge-save for Guardian record writes.

Seventh, add event idempotency tests.

Only after that would I move to Pattern Quests or Boss Dictation.

## Manual QA checklist

Use one learner with all core words Mega and another learner not yet Mega.

For the Mega learner:

Fresh graduate with empty Guardian map: dashboard must say first patrol available and Begin must work.
First Guardian round: 5–8 words, no duplicates, no Extra words.
Correct answer: Guardian record created, next due +3 days, progress unchanged.
Wrong answer: word becomes wobbling, next due tomorrow, progress unchanged.
Refresh after wrong answer: feedback/session state does not duplicate the event.
Continue after final word: Guardian summary appears once.
Click practice/recovery from Guardian summary: progress remains unchanged.
Dashboard after all words non-due: copy matches product policy, either “optional patrol” or “rested”.
Word Bank filters: wobbling, due, guarded this week, and not guarded yet match the actual records.
Reset learner: Guardian state disappears.

For the non-Mega learner:

Guardian card should not appear as active.
Alt+4 should not start Guardian.
Legacy Smart Review, Trouble Drill, SATs Test, skip, drill all, and Word Bank filters should behave as before.

## What I would call the next plan

Name it:

**Post-Mega Spelling P1.5 — Guardian Hardening and Flow Integrity**

Scope:

No Pattern Quests.
No Boss Dictation.
No new reward layer.
No new art.

Deliverables:

A better post-mastery selector.
Guardian-safe summary actions.
Guardian-safe skip behaviour.
Guardian-specific session UX.
Content/reset sanitisation.
Storage/error hardening.
Event idempotency tests.
Manual QA script.

Acceptance criteria:

A child can graduate, immediately start their first Guardian Mission, miss words without losing Mega, optionally practise wobbling words without demotion, and return later with the dashboard explaining exactly what is due and why.

That is the polish layer that makes the feature trustworthy. After that, Boss Dictation and Pattern Quests will sit on a much stronger foundation.

[1]: https://github.com/fol2/ks2-mastery/blob/main/docs/plans/james/post-mega-spelling/2026-04-25-completion-report.md "ks2-mastery/docs/plans/james/post-mega-spelling/2026-04-25-completion-report.md at main · fol2/ks2-mastery · GitHub"
[2]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/shared/spelling/service.js "raw.githubusercontent.com"
[3]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/spelling/components/SpellingSetupScene.jsx "raw.githubusercontent.com"
[4]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/spelling/components/SpellingSummaryScene.jsx "raw.githubusercontent.com"
[5]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/spelling/module.js "raw.githubusercontent.com"
[6]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/shared/spelling/legacy-engine.js "raw.githubusercontent.com"
[7]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/spelling/components/SpellingSessionScene.jsx "raw.githubusercontent.com"
[8]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/spelling/session-ui.js "raw.githubusercontent.com"
[9]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/spelling/components/spelling-view-model.js "raw.githubusercontent.com"
