I re-scanned the live repo through GitHub/raw files. I tried the clone approach, but this environment cannot resolve `github.com` from the container, so I could not use `git clone` directly. The browser scan was enough to check the current state.

My view: **P1.5 is stronger than expected**, because it did not only harden Guardian. It also shipped Boss Dictation UI, Boss service path, Alt+5, and a first reward subscriber. The completion report says all 12 units shipped, including Boss Dictation UI and Guardian/Boss reward toasts, with the Mega-never-revoked invariant asserted by a composite property test; the final verify reports the spelling suites green and only two unrelated full-suite failures. ([GitHub][1])

## Why you cannot see the new entrance

This is **partly intended**.

You do **not** enter Guardian/Boss from inside a normal spelling session. The new features are post-Mega mode-entry surfaces on the **Spelling setup/dashboard screen**. Once you are already in a Smart Review, Trouble Drill, or SATs session, the UI should only show the current session. Guardian/Boss are separate modes, not in-session tools.

The code path is:

Go to **Spelling dashboard/setup**. If `postMastery.allWordsMega` is true, the normal setup content is replaced by the post-Mega dashboard. The setup scene checks `Boolean(postMastery?.allWordsMega)` before rendering the post-Mega content. ([GitHub][2])

When it is visible, you should see copy like:

**“Graduated · Spelling Guardian”**
**“The Word Vault is yours.”**

Then there should be active entry buttons for:

**Guardian Mission** — normal click, or `Alt + 4`
**Boss Dictation** — normal click, or `Alt + 5`

The setup component explicitly renders the Guardian/Boss begin rows and dispatches `spelling-shortcut-start` with `mode: 'guardian'` or `mode: 'boss'`; Boss uses the default Boss length constant. ([GitHub][2])

Boss is definitely meant to be active now. The post-Mega mode card config has Guardian and Boss enabled, while Word Detective and Story Challenge are still disabled roadmap placeholders. ([GitHub][3])

## The most likely reason you cannot see it

The gate is stricter than “my child looks Mega in the UI”.

The current read model says `allWordsMega` is true only when the current published **core** word count is non-zero and the learner’s secure core count exactly equals that published core count. Extra-pool words are excluded, but **every currently published core word must be stage 4/Mega**. ([GitHub][4])

So if the repo/content changed and added even one new core word, the learner may no longer satisfy `allWordsMega`, even though yesterday they had mastered everything visible at the time. This exact problem is already named in the P1.5 deferred list as **Sticky-bit `allWordsMega`**: content rollback or content changes can silently flip `allWordsMega: true → false`, hiding the post-Mega dashboard. ([GitHub][1])

There is also a remote-sync wrinkle. The client read-model service falls back to a locked post-mastery state until a cached `postMastery` payload exists, because the browser shell does not directly own the learner’s Guardian map in remote-sync mode. ([GitHub][5]) Also, the README says production now uses Worker-backed auth/session flow, and `?local=1` no longer creates a browser-local product runtime; browser QA should use a signed-in Worker session or `/demo`. ([GitHub][6])

So the quick diagnosis is:

If you see normal **Smart Review / Trouble Drill / SATs Test** setup, either the current learner is not considered `allWordsMega`, or the post-mastery read model has not hydrated, or a current content change has blocked the graduation gate.

## How to test it now

Use this manual path:

Open the app in a signed-in Worker session or `/demo`, then select the target learner. Go to the **Spelling** subject and make sure you are on the spelling setup/dashboard, not inside an active session or summary.

Check the stats: if **Secure** is less than **Total** for the core pool, the post-Mega dashboard will not show. Open the Word Bank and look for any core words that are `new`, `learning`, `due`, or `trouble`. One such word is enough to hide Guardian/Boss.

If the dashboard says **“The Word Vault is yours”**, click **Begin Guardian Mission** or press `Alt + 4`. For Boss, click **Begin Boss Dictation** or press `Alt + 5`.

Inside Guardian, you should see a **Guardian** chip, no cloze hint, and the skip button should read **“I don’t know”**. Inside Boss, you should see a **Boss** chip, test-shaped one-shot flow, and submit copy like **“Lock it in”**. The current session UI code confirms Guardian disables cloze and uses a Guardian context note, while `session-ui.js` provides Guardian/Boss-specific chips and copy. ([GitHub][7])

If you still cannot see it while you are confident every published core word is Mega, I would treat that as a bug, not user error. The likely suspects are: server read-model not returning `postMastery`, stale cached subject UI, or content-version mismatch.

## My recommendation before “real Phase 2”

I would insert a tiny **P2.0 Access & Observability sprint** before Pattern Quests.

Reason: you cannot polish or test a post-Mega feature reliably if the entrance is invisible and there is no adult/debug explanation for why. The feature may be correct in tests but still feel missing to you and to children.

P2.0 should ship three things:

First, add a **“Why can’t I see Guardian?” diagnostic**. If `allWordsMega` is false but the learner is close, show a small adult/debug expandable panel: published core count, secure core count, number blocking graduation, first 10 blocking slugs, content release ID if available, and whether `postMastery` came from service, Worker read model, or locked fallback. This is not for kids; it is for you, QA, and parent/admin support.

Second, add a **dev/demo seed path** for post-Mega states. You need one-click fixtures for: fresh graduate, first patrol, due patrol, wobbling recovery, rested, optional patrol, Boss all-correct, Boss with 3 misses. This should be admin/dev/demo-only, never normal learner UI. Without this, every post-Mega test requires manually grinding or mutating data.

Third, add the **sticky graduation bit**. Once a learner has genuinely graduated, store something like:

```js
postMega: {
  unlockedAt,
  unlockedContentReleaseId,
  unlockedPublishedCoreCount,
  unlockedBy: 'all-core-stage-4'
}
```

After that, content changes should not hide Guardian/Boss. New core words should appear as **“new arrivals to add to the Vault”**, not as a revocation of graduation. This protects the emotional contract you worked hard to build: **Mega is permanent.**

That sticky bit is more important than Pattern Quests. If children graduate and the app later hides the graduation dashboard because content changed, trust takes a hit.

## Phase 2 direction

I would name the next proper plan:

**Post-Mega Spelling P2 — Graduation Visibility, Durable Vault, Pattern Mastery Foundation**

The direction should be:

1. Make the entrance unmistakable and testable.
2. Make graduation durable across content changes and remote-sync hydration.
3. Finish the reliability debt that can damage state.
4. Build Pattern Quest metadata before adding flashy new gameplay.
5. Expand rewards carefully, without turning spelling into shallow XP farming.

This keeps you scientifically aligned. Retrieval practice is still the strongest core loop: classroom experiments with young spellers found retrieval practice led to better spelling than rainbow writing, including delayed assessment results. ([The Learning Scientists][8]) Spacing and interleaving are also the right foundation for Guardian/Boss, because Bjork and Bjork describe spacing as supporting long-term retention and interleaving as stronger for delayed performance and transfer than blocked practice. ([Bjork Lab][9]) Your own KS2 mastery brief also points in the same direction: mixed retrieval, due/weak prioritisation, feedback, and spaced return rather than “more questions forever.” 

Pattern Quests are the right next learning feature, but only after the access/reliability layer is fixed. The English national curriculum explicitly links fluent writing to accurate spelling through phonics, morphology, and orthography, and Years 3–6 emphasise root words, prefixes, suffixes, morphology and etymology. ([GOV.UK][10]) So Pattern Quests are not just “more game”; they are educationally better than endlessly repeating the same word list.

## Proposed P2 scope

### Unit 1 — Post-Mega diagnostic panel

Add a read-model field:

```ts
postMasteryDebug: {
  source: 'local-service' | 'worker-read-model' | 'locked-fallback',
  publishedCoreCount,
  secureCoreCount,
  blockingCoreCount,
  blockingCoreSlugsPreview,
  extraWordsIgnoredCount,
  guardianMapCount,
  contentReleaseId,
  allWordsMega,
  stickyUnlocked
}
```

Show it only in adult/dev/Admin context, or behind a small “Why is Guardian locked?” link.

Acceptance criteria: when Guardian/Boss is not visible, an adult can see exactly why in under 10 seconds.

### Unit 2 — Sticky graduation

Persist `postMega.unlockedAt` once the learner first achieves all-core Mega. `getPostMasteryState` should distinguish:

`allWordsMegaNow`
`postMegaUnlockedEver`
`postMegaDashboardAvailable`
`newCoreWordsSinceGraduation`

The dashboard should use `postMegaDashboardAvailable`, not raw `allWordsMegaNow`.

If new core words arrive later, show:

**“3 new core words have arrived since graduation. Add them to the Vault when ready.”**

Do not hide Guardian/Boss.

Acceptance criteria: content additions, rollback, or seed-release changes do not make a graduated learner lose the post-Mega dashboard.

### Unit 3 — QA seed harness

Add one safe route to create deterministic test states.

I would implement either:

`npm run dev:seed-post-mega -- --learner <id> --shape fresh-graduate`

or an Admin/Ops-only command:

`spelling-dev-seed-post-mega`

Shapes:

`fresh-graduate`
`guardian-first-patrol`
`guardian-wobbling`
`guardian-rested`
`guardian-optional-patrol`
`boss-ready`
`boss-mixed-summary`
`content-added-after-graduation`

Acceptance criteria: you can test Guardian and Boss in the browser without manually playing hundreds of words.

### Unit 4 — Remote-sync post-mastery hydration

Fix the practical issue where remote-sync can fall back to locked state before `postMastery` is available. The client read model currently uses a locked fallback if no cached `postMastery` exists. ([GitHub][5]) That is defensible technically, but confusing in QA.

The Worker/bootstrap read model should always include the current `postMastery` block for spelling learners. The UI should show either the real post-Mega dashboard or a clear temporary state like:

**“Checking Word Vault…”**

not silently render a legacy setup if the learner is probably graduated.

Also fix the deferred Alt+4 remote-sync `savePrefs` ordering issue. The report says U10 fixed the race for Alt+5 but Alt+4 still has the same pre-existing ordering issue. ([GitHub][1])

Acceptance criteria: signed-in production/demo learners see the same Guardian/Boss availability as local service learners.

### Unit 5 — Storage-CAS hardening

The P1.5 report explicitly recommends the `post-mega-spelling-storage-cas` plan as a carry-forward: `navigator.locks.request`, `BroadcastChannel` cache invalidation, write-version stale detection, soft second-tab lock-out, and online-first Worker command routing. ([GitHub][1])

I agree this should be in Phase 2, but after the visibility/sticky fixes. It is not exciting, but it protects trust.

Acceptance criteria: two tabs cannot silently overwrite Guardian/Boss state; stale writes are rejected or retried; users see a clear second-tab warning.

### Unit 6 — Shared post-mastery mode predicate

Extract:

```ts
isPostMasteryMode(mode)
isMegaSafeMode(mode)
isSingleAttemptMegaSafeMode(mode)
```

Use it in `module.js`, `remote-actions.js`, session UI, summary UI, read models, and tests.

This directly addresses a deferred P1.5 risk: both `module.js` and `remote-actions.js` currently carry duplicated `mode === 'guardian' || mode === 'boss'` gates, which will become dangerous when Pattern Quest or Word Detective lands. ([GitHub][1])

Acceptance criteria: adding a future post-Mega mode requires changing one predicate and its tests, not hunting across dispatchers.

### Unit 7 — Boss audit and per-slug assertions

P1.5 already shipped Boss, and the Boss tests assert that stage/due/last values do not demote. The test file also confirms Boss is test-shaped, single-attempt, draws Mega core-pool words only, and preserves FIFO order. ([GitHub][11])

But the P1.5 report still calls out a deferred need for per-slug progress counter assertions across a full 10-card round. ([GitHub][1]) Add those now.

Acceptance criteria: after a Boss round with mixed right/wrong answers, every selected slug has exactly the expected attempts/correct/wrong deltas, with stage/due/last untouched.

### Unit 8 — Nightly variable-seed Mega invariant

The P1.5 report says the fixed-seed property test is a characterisation trace, not a true property proof, and recommends a nightly variable-seed workflow. ([GitHub][1]) Add it.

Acceptance criteria: nightly workflow runs the Mega invariant with a random seed; any failure prints the seed; promoted failing seeds become canonical regression cases.

### Unit 9 — Durable persistence warning

P1.5 added a session warning for storage failure, but the report says closing the tab before the next submit loses it. ([GitHub][1]) Persist the warning until acknowledged.

Acceptance criteria: if save fails, the next app load still tells the adult what happened and what to do.

## Pattern Quests: what Phase 2 should build, and what it should not build

After Units 1–9, build the **metadata foundation** first, not the flashy activity.

Add a pattern registry:

```ts
{
  id: 'suffix-tion',
  title: '-tion endings',
  rule: 'Often used for nouns from verbs...',
  examples: ['nation', 'position', 'competition'],
  traps: ['shun-sound alternatives: -sion, -cian'],
  curriculumBand: 'y5-6',
  promptTypes: ['spell', 'classify', 'explain', 'detect-error']
}
```

Then add `patternIds` to word content:

```ts
{
  slug: 'competition',
  word: 'competition',
  patternIds: ['suffix-tion', 'root-compete']
}
```

Validation should require every core word to have at least one `patternId`, or an explicit `exception-word` / `statutory-exception` tag. That prevents “pattern coverage” from becoming fake.

Pattern Quest MVP should be small:

A 5-card quest:

1. Spell one word from memory.
2. Spell another mixed word from the same pattern.
3. Choose the rule or pattern.
4. Correct a plausible misspelling.
5. Explain the clue in one short prompt, preferably deterministic at first.

Do not start with open-ended Story Missions. They are valuable, but deterministic marking is hard. Story Missions can come later with parent review or optional AI. Pattern Quests are the better first P2 learning feature because they support transfer, morphology, and etymology, which the curriculum directly values. ([GOV.UK][10])

## Reward system direction

Right now the reward subscriber is intentionally light. The event hook emits Guardian/Boss **toast-only** rewards, keeps `GUARDIAN_WOBBLED` silent, and does not write Guardian/Boss events into monster evolution. ([GitHub][12]) The tests confirm this: Guardian renewed/recovered/mission-completed and Boss completed produce toasts, while wobbled is silent and Guardian/Boss toast branches do not write to game state. ([GitHub][13])

That was the right P1.5 choice.

For Phase 2, add persistent achievements, not more noisy toasts.

Good reward targets:

**Guardian 7-day Maintainer** — completed Guardian checks across 7 different days.
**Recovery Expert** — recovered 10 wobbling words.
**Boss Clean Sweep** — 10/10 Boss Dictation.
**Boss Personal Best** — improved previous Boss score.
**Pattern Mastery** — passed a pattern quest after spaced return.
**Vault Complete Again** — new post-graduation core arrivals added to Vault.

Avoid rewards for every correct word. That will create noise and cheapen the moment. Reward **meaningful learning events**, not clicks.

Engineering shape:

```ts
reward.achievement.unlocked
reward.achievement.progressed
reward.toast
reward.monster
```

Keep achievement IDs deterministic:

```ts
achievement:spelling:guardian:7-day:<learnerId>
achievement:spelling:boss:clean-sweep:<learnerId>:<sessionId>
achievement:spelling:pattern:<patternId>:<learnerId>
```

Add idempotency tests. Replaying the same domain event must not create duplicate badges. This matters because remote sync and event replay are already part of the architecture.

I would **not** evolve spelling monsters from Guardian renewals. The child already earned Mega. Guardian should decorate the Vault identity, not move the old mastery goalposts.

## Cut line

If the sprint gets tight, cut in this order:

Cut Story Challenge first.
Cut Word Detective as a separate mode second; it can live inside Pattern Quest later.
Cut persistent achievement art third; keep achievement data and simple UI.
Do not cut sticky graduation.
Do not cut post-Mega diagnostics.
Do not cut remote-sync hydration.
Do not cut Mega-never-revoked tests.

The most important Phase 2 outcome is simple:

**A graduated learner always sees the Word Vault entrance, can start Guardian/Boss reliably, never loses Mega because content changed, and begins learning spelling patterns rather than merely replaying mastered words.**

[1]: https://github.com/fol2/ks2-mastery/blob/main/docs/plans/james/post-mega-spelling/2026-04-26-p15-completion-report.md "ks2-mastery/docs/plans/james/post-mega-spelling/2026-04-26-p15-completion-report.md at main · fol2/ks2-mastery · GitHub"
[2]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/spelling/components/SpellingSetupScene.jsx "raw.githubusercontent.com"
[3]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/spelling/components/spelling-view-model.js "raw.githubusercontent.com"
[4]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/spelling/read-model.js "raw.githubusercontent.com"
[5]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/spelling/client-read-models.js "raw.githubusercontent.com"
[6]: https://github.com/fol2/ks2-mastery "GitHub - fol2/ks2-mastery: KS2 Unified — browser-side React prototype of a KS2 (UK Year 5/6) study app · GitHub"
[7]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/spelling/components/SpellingSessionScene.jsx "raw.githubusercontent.com"
[8]: https://www.learningscientists.org/blog/2018/8/16-1 "Classroom Research on Retrieval Practice and Spelling — The Learning Scientists"
[9]: https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2016/04/EBjork_RBjork_2011.pdf "CH05.qxp:FABBS_DESIGN_NE"
[10]: https://www.gov.uk/government/publications/national-curriculum-in-england-english-programmes-of-study/national-curriculum-in-england-english-programmes-of-study "National curriculum in England: English programmes of study - GOV.UK"
[11]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/tests/spelling-boss.test.js "raw.githubusercontent.com"
[12]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/spelling/event-hooks.js "raw.githubusercontent.com"
[13]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/tests/spelling-reward-subscriber.test.js "raw.githubusercontent.com"
