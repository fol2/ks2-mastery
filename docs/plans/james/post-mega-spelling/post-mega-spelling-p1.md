I would **not** add “Mega++” or just make the badge bigger. That will work for a week, then feel fake. If every spelling word is already Mega, the better message is: **“You have graduated. Now you are a Spelling Guardian.”**

Treat Mega as the end of basic mastery, not the end of play. The next game should be about keeping mastery alive, using words in richer ways, and becoming the expert.

I’m treating “Mega” as your highest mastered/secure state. In the repo, spelling already has the right foundation: Smart Review, Trouble Drill, SATs Test, Word Bank filters such as due/weak/learning/secure/unseen, and status labels like New, Learning, Due, Secure and Trouble. ([GitHub][1]) The spelling flow already supports learning sessions, missed-word retries, secure progress, practice-only drills, and summary actions such as quick drill/start another round/open word bank. ([GitHub][2]) ([GitHub][3])

The important design move is this: **do not revoke Mega when they make a mistake later.** That feels unfair and kills motivation. Instead, keep Mega as a permanent achievement, then add a separate “Guardian” layer for long-term maintenance.

## The science-backed idea

Spelling should continue through **retrieval practice**, not just rereading or copying. Research summaries on spelling practice describe retrieval as writing the word from memory with feedback, and report that pupils learned more spelling words through retrieval practice than through “rainbow writing”, including at follow-up. ([The Learning Scientists][4])

But once everything is Mega, the practice must become **spaced and mixed**. Bjork and Bjork’s “desirable difficulties” work is directly relevant here: immediate performance can be misleading, and long-term retention improves when learners face useful challenge such as spacing, interleaving, variation and testing as a learning event. The warning is that difficulty must remain desirable, not overwhelming. ([Bjork Learning and Forgetting Lab][5]) This also matches the design principles already used in your KS2 mastery brief: mixed retrieval, due-item priority, weak-skill return, and feedback that supports learning rather than just showing right/wrong. 

For motivation, use **autonomy, competence and relatedness**. Self-determination theory says learners are more motivated when they feel ownership, feel capable, and feel socially connected; overly controlling rewards can backfire. ([ScienceDirect][6]) So the post-Mega loop should offer choice, visible expertise, short wins, and optional family/co-op challenges, not just pressure to maintain a streak.

For KS2 spelling specifically, the national curriculum spelling appendix stresses not only word lists, but also morphology, etymology, prefixes, suffixes and the relationship between spelling and meaning. ([GOV.UK][7]) That gives you the best next layer: not “spell the same list forever”, but “understand the patterns behind the words and use them well”.

## Brainstorm: post-Mega features that should actually work

First, add **Spelling Guardian mode**. Every Mega word goes into a “Word Vault”. Each day, a small number of words “wake up” for review. The child’s job is to renew them. A correct answer says “Guardian renewed”. A wrong answer says “This word is wobbling — it will return tomorrow.” Mega stays safe. The child is protecting the vault, not being punished.

Second, add **Boss Dictation**. Once or twice a week, they get a short SATs-style challenge: 8 to 12 mixed Mega words, possibly with one sentence dictation. No hints. One clean attempt. This gives older children a reason to prove themselves without turning every session into a test.

Third, add **Pattern Quests**. Instead of rewarding only individual words, group words by spelling logic: silent letters, -tion/-sion/-cian, -ough, prefixes, suffixes, double consonants, homophones, Greek/Latin roots, word families. A child who has mastered all individual words can now unlock “Pattern Mastery” badges. This is more educationally valuable than more ordinary spelling rounds because it builds transfer.

Fourth, add **Word Detective missions**. Show a misspelling and ask: “What went wrong?” Example: “definate” → “definite”. Choices could be “missing vowel”, “wrong suffix”, “silent letter”, “root-word clue”. This turns spelling from memory into explanation.

Fifth, add **Use It missions**. Ask them to write a funny, dramatic or serious sentence using 3 Mega words. The app can check that the exact words appear; optionally, a parent or AI can give feedback on whether the sentence makes sense. This connects spelling to writing, which is the real goal.

Sixth, add **Teach the Monster mode**. The child becomes the teacher. A monster spells a word wrongly and the child must correct it and explain the rule. This is powerful because it turns them from “student being tested” into “expert helping someone else”.

Seventh, add **Seasonal expeditions**. Every month has a theme: Space Spelling, Dragon Library, Ancient Egypt, Ocean Vault, Robot Factory. The actual learning engine remains the same, but the wrapper changes. This gives novelty without damaging the science.

Eighth, add **choice boards** after Mega. Instead of pushing one button, show: “Today’s Guardian Mission”, “Boss Challenge”, “Word Detective”, “Story Mission”, and “Pattern Quest”. Choice is important. It supports autonomy without letting them avoid learning completely.

## My recommended product design

The best post-Mega system is:

**Mega = permanent mastery badge.**
**Guardian = long-term memory maintenance.**
**Quest = deeper spelling understanding.**
**Boss = occasional proof under pressure.**
**Story = transfer into writing.**

Daily play should be short. I would aim for **5–8 words per day** in Guardian mode, plus one optional quest. Do not make children redo 200 words. That would feel like the app is lying when it said they had mastered them.

The daily screen could say:

“You have mastered every word. Now your job is to keep the Word Vault strong. 7 words need a Guardian check today.”

After a session:

“6 words renewed. 1 word is wobbling and will return tomorrow. Your Mega badge is safe.”

That wording matters. It protects competence while still making mistakes useful.

## Engineering plan

Your repo is already set up in a helpful way. The README says the project has a platform layer, subject registry, reward layer, controller orchestration and repository boundary, while spelling is rebuilt as a subject slice under `src/subjects/spelling/*`. It also says the spelling service owns serialisable state, deterministic transitions, resume-safe restoration and domain-event emission. ([GitHub][8]) That means the clean implementation is to add a post-mastery layer inside spelling, then let the reward/platform layer react to new events.

### Phase 1: add a post-Mega read model

Add a selector/read-model function in the spelling service, something like:

`getSpellingPostMasteryState(state)`

It should return:

`allWordsMega`
`megaWordCount`
`guardianDueCount`
`wobblingCount`
`recommendedMode`
`recommendedWords`
`patternQuestSuggestions`
`bossChallengeAvailable`

This should not mutate anything. It only tells the UI what post-Mega state the learner is in.

Logic:

If not all core words are Mega/Secure, show normal Smart Review.

If all core words are Mega/Secure, show the post-Mega dashboard.

The current code already computes useful Word Bank aggregates such as total, secure, due now, trouble, learning and unseen. ([GitHub][1]) Build on that, rather than creating a separate spelling app.

### Phase 2: add Guardian review state

Do not overload the existing mastery stage. Add a separate object per word:

```ts
guardian: {
  lastReviewedAt: string | null
  nextDueAt: string | null
  reviewLevel: number
  correctStreak: number
  lapses: number
  renewals: number
  wobbling: boolean
}
```

Keep this separate from the core word state. A word can be Mega and wobbling at the same time. That is emotionally much better than dropping it back to a lower state.

Suggested schedule:

After first Guardian success: due in 3 days.
After second success: due in 7 days.
After third success: due in 14 days.
Then 30 days, 60 days, 90 days.
After a miss: mark wobbling and make it due tomorrow.
After a second miss: put it into a short refresh loop, but still do not remove Mega.

This gives you spaced retrieval without making the child grind.

### Phase 3: add a new spelling mode: Guardian Mission

Add a mode beside Smart Review, Trouble Drill and SATs Test:

`guardian`

The mode should select only Mega/Secure words that are due for long-term renewal, with wobbling words prioritised.

Selection rule:

First: wobbling due words.
Second: oldest due Guardian words.
Third: a small random sample of long-not-seen Mega words.
Limit: 5–8 words for a normal mission, 10–12 for a boss mission.

The current spelling UI already has mode cards and round lengths, so this should be a new mode card rather than a full new surface. ([GitHub][1])

### Phase 4: add new domain events

The spelling service already emits events such as retry cleared, word secured, mastery milestone and session completed. ([GitHub][9]) Add post-Mega events:

`spelling.guardian.renewed`
`spelling.guardian.wobbled`
`spelling.guardian.recovered`
`spelling.guardian.missionCompleted`
`spelling.pattern.mastered`
`spelling.boss.completed`
`spelling.story.completed`

This keeps your architecture clean because the reward layer can react to learning events instead of controlling the learning flow. That matches the repo’s stated architecture: subject engines are separated from the shell, and the game layer reacts to mastery rather than controlling the learning flow. ([GitHub][8])

### Phase 5: update the UI

In the spelling setup scene, detect `allWordsMega === true`.

Replace the normal “you still have words to learn” messaging with:

“You have mastered every spelling word. New role unlocked: Spelling Guardian.”

Show four cards:

Guardian Mission
Boss Dictation
Word Detective
Story Challenge

The first implementation only needs Guardian Mission and Boss Dictation. Pattern and Story can come later.

In the summary scene, add post-Mega summary cards:

“Words renewed”
“Wobbling words”
“Next Guardian check”
“Boss score”
“Pattern progress”

The existing summary surface already has actions for quick drill, drill all, start another round and word bank, so this is a natural extension rather than a full redesign. ([GitHub][3])

### Phase 6: add Word Bank filters

Add these filters:

Guardian due
Wobbling
Renewed recently
Never renewed
Pattern quest available

The current Word Bank already supports filters such as all, due, weak, learning, secure and unseen. ([GitHub][1]) So this is mostly a view-model and filtering update.

### Phase 7: add Pattern Quest metadata

Add spelling pattern tags to word content:

```ts
patternIds: [
  "silent-letter",
  "suffix-tion",
  "suffix-sion",
  "prefix-dis",
  "double-consonant",
  "homophone",
  "ough",
  "latin-root",
  "greek-root"
]
```

Then add validation so every word can optionally have pattern IDs, and every pattern ID must exist in a pattern registry.

The repo already has content scripts such as content generation and validation scripts, plus normal test/check scripts. ([GitHub][10]) Use those as the enforcement point so content quality does not drift.

### Phase 8: add rewards carefully

Rewards should celebrate effort, renewal and expertise, not manipulate.

Good rewards:

“7 words renewed today”
“Recovered 3 wobbling words”
“Silent Letter Detective completed”
“30-day Guardian streak”
“Boss Dictation clean sweep”
“Used 5 Mega words in writing”

Avoid:

Sibling leaderboards.
Taking away Mega.
Huge streak penalties.
Endless XP for easy repeats.
Mega++, Mega+++, Mega++++ as the main mechanic.

Those are shallow. They may increase clicks briefly, but they do not improve long-term motivation.

### Phase 9: tests and acceptance criteria

Add service tests:

Guardian state is created for Mega words.
Guardian due words are selected correctly.
Correct answer advances review interval.
Wrong answer marks wobbling but does not remove Mega.
Wobbling word returns soon.
Mission completion emits the correct event.
Boss mode does not show hints.
Practice-only drills do not change Guardian state unless explicitly intended.

Add view-model tests:

Post-Mega dashboard appears only when all target words are Mega/Secure.
Guardian due count is correct.
Word Bank filters show the right words.
Summary scene displays renewed/wobbling counts.

Add regression tests:

Existing Smart Review still works.
Trouble Drill still works.
SATs Test still works.
Existing secure/milestone events still fire.

Run the existing repo commands: `npm test`, `npm run check`, and content validation scripts before deploying. ([GitHub][10])

## MVP I would build first

Build only this first:

Post-Mega dashboard.
Guardian Mission mode.
Guardian state per word.
Wobbling/renewed summary.
Word Bank filter for Guardian due/wobbling.
A few new reward events.

That is enough to make children want to return without creating a huge new content project.

Then build:

Pattern Quests.
Boss Dictation.
Story Missions.
Seasonal cosmetics.

The strongest product sentence is:

**“You finished the spelling list. Now the game changes: protect your Word Vault, defeat wobbling words, unlock spelling patterns, and prove your skills in boss dictations.”**

[1]: https://github.com/fol2/ks2-mastery/blob/main/src/subjects/spelling/components/spelling-view-model.js "ks2-mastery/src/subjects/spelling/components/spelling-view-model.js at main · fol2/ks2-mastery · GitHub"
[2]: https://github.com/fol2/ks2-mastery/blob/main/src/subjects/spelling/session-ui.js "ks2-mastery/src/subjects/spelling/session-ui.js at main · fol2/ks2-mastery · GitHub"
[3]: https://github.com/fol2/ks2-mastery/blob/main/src/subjects/spelling/components/SpellingSummaryScene.jsx "ks2-mastery/src/subjects/spelling/components/SpellingSummaryScene.jsx at main · fol2/ks2-mastery · GitHub"
[4]: https://www.learningscientists.org/blog/2018/8/16-1 "Classroom Research on Retrieval Practice and Spelling — The Learning Scientists"
[5]: https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2016/04/EBjork_RBjork_2011.pdf "CH05.qxp:FABBS_DESIGN_NE"
[6]: https://www.sciencedirect.com/science/article/abs/pii/S0361476X20300254 "Intrinsic and extrinsic motivation from a self-determination theory perspective: Definitions, theory, practices, and future directions - ScienceDirect"
[7]: https://assets.publishing.service.gov.uk/media/5a7ccc06ed915d63cc65ce61/English_Appendix_1_-_Spelling.pdf "The national curriculum in England - English Appendix 1: Spelling"
[8]: https://github.com/fol2/ks2-mastery/blob/main/README.md "ks2-mastery/README.md at main · fol2/ks2-mastery · GitHub"
[9]: https://github.com/fol2/ks2-mastery/blob/main/src/subjects/spelling/events.js "ks2-mastery/src/subjects/spelling/events.js at main · fol2/ks2-mastery · GitHub"
[10]: https://github.com/fol2/ks2-mastery/blob/main/package.json "ks2-mastery/package.json at main · fol2/ks2-mastery · GitHub"
