I reviewed the Punctuation subject as a static source audit from GitHub. I could not run the repo locally here, so the numbers below are from the source/manifest, not from a live database crawl.

The main answer: **Punctuation is not using AI to generate questions at runtime.** It uses a **human-authored fixed item bank** plus a **deterministic template generator**. The current runtime setting creates **1 generated item per published generator family**, so today the practical runtime pool is about **96 Punctuation items**: **71 fixed evidence items + 25 generated items**.

## 1. What Punctuation currently covers

The Punctuation subject is already a Worker-command-backed production slice with deterministic marking, spaced scheduling, release-scoped progress, and a rollout-gated React surface. So this is not just placeholder UI; it has a real subject engine behind it. ([GitHub][1])

The published Punctuation progression covers **14 skills**:

| Skill                     | What it covers                                                 |
| ------------------------- | -------------------------------------------------------------- |
| `sentence_endings`        | capital letters, full stops, question marks, exclamation marks |
| `list_commas`             | commas in lists                                                |
| `apostrophe_contractions` | contractions like `can't`, `it's`, `we're`                     |
| `apostrophe_possession`   | singular, plural, and irregular possession                     |
| `speech`                  | direct speech punctuation, inverted commas, reporting commas   |
| `fronted_adverbial`       | comma after opening adverbial phrase                           |
| `parenthesis`             | commas, brackets, or dashes for extra information              |
| `comma_clarity`           | commas that clarify meaning or mark opening clauses            |
| `colon_list`              | colon before a list                                            |
| `semicolon`               | semi-colon between related independent clauses                 |
| `dash_clause`             | dash between related clauses                                   |
| `semicolon_list`          | semi-colons inside complex lists                               |
| `bullet_points`           | colon/stem and consistent bullet punctuation                   |
| `hyphen`                  | hyphens to avoid ambiguity, e.g. `man-eating shark`            |

The manifest groups these into six learning clusters: endmarks, apostrophe, speech, comma/flow, structure, and boundary, with reward projection collapsed onto Pealark, Claspin, Curlune, plus Quoral as the grand aggregate monster. ([GitHub][2])

The fixed questions themselves are structured well: they include prompt, mode, skill ID, cluster ID, reward unit ID, model answer, explanation, misconception tags, readiness tags, and source. For example, the sentence-ending items include choice, insertion, proofreading, and transfer variants; the list-comma examples include explanations and misconception tags such as missing list separators and unnecessary final comma. ([GitHub][2])

## 2. Is it template-based or generated?

It is both, but not AI-generated.

There are three layers:

First, there is a **fixed item bank** in `shared/punctuation/content.js`. These are hand-authored evidence items.

Second, there are **published generator families**. The generator takes a family, a skill, a seed, and a variant index, then chooses from a deterministic template bank or from a context pack. It builds a generated item with a stable ID, model answer, validator/rubric, misconception tags, readiness tags, and `source: 'generated'`. ([GitHub][3])

Third, the service currently sets:

```js
const GENERATED_ITEMS_PER_FAMILY = 1;
```

and imports `createPunctuationRuntimeManifest`, so the runtime pool adds one generated item per family. ([GitHub][4])

So the current engine is a **deterministic template generator**, not a generative AI system. That is the right quality direction.

## 3. How many questions do we have?

Current runtime count:

```text
Fixed evidence items:      71
Generated families:        25
Generated per family:       1
Current runtime total:     96
```

The formula is:

```text
runtime question count = 71 + (25 × generatedPerFamily)
```

So:

| `generatedPerFamily` | Runtime items |
| -------------------: | ------------: |
|                    0 |            71 |
|           1, current |            96 |
|                    2 |           121 |
|                    5 |           196 |
|                   10 |           321 |

But be careful: increasing `generatedPerFamily` alone does not automatically mean genuinely new learning content. The generator can keep creating IDs, but if the template bank has only a small number of unique templates per family, the child may see repeated structures with different IDs. The current default template bank appears to have roughly **two default templates per family**, so the practical non-repeating default catalogue is closer to **71 fixed + about 50 generated = about 121 unique template-backed items**, unless you expand the template bank or use richer context packs. ([GitHub][3])

By skill, the current practical runtime coverage is approximately:

| Skill                   | Fixed items | Generator families | Current runtime items |
| ----------------------- | ----------: | -----------------: | --------------------: |
| sentence endings        |           4 |                  1 |                     5 |
| list commas             |           6 |                  2 |                     8 |
| apostrophe contractions |           4 |                  1 |                     5 |
| apostrophe possession   |           5 |                  2 |                     7 |
| speech                  |           6 |                  2 |                     8 |
| fronted adverbials      |           5 |                  2 |                     7 |
| parenthesis             |           6 |                  3 |                     9 |
| comma clarity           |           4 |                  1 |                     5 |
| colon lists             |           6 |                  2 |                     8 |
| semicolons              |           6 |                  3 |                     9 |
| dash clauses            |           5 |                  2 |                     7 |
| semicolon lists         |           4 |                  1 |                     5 |
| bullet points           |           5 |                  2 |                     7 |
| hyphens                 |           5 |                  1 |                     6 |
| **Total**               |      **71** |             **25** |                **96** |

One caveat: some paragraph items are multi-skill, for example apostrophe contraction + possession, or fronted adverbial + speech. So for learning analytics, an item may touch more than one skill. For reward-unit counting, the table above counts by the primary reward unit/family.

## 4. Existing question quality: overall judgement

The current quality is **good as a first production slice**, but the pool is **too shallow for long-term mastery**.

The good parts:

The questions are not random. They have clear skill IDs, modes, explanations, misconception tags, readiness tags, validators, and model answers. That is exactly the direction you want.

The mode spread is sensible: choice, insert, fix/proofreading, transfer writing, sentence combining, and paragraph repair. The service labels these modes explicitly, and the session modes include smart review, guided learn, weak spots, GPS test, and focus modes. ([GitHub][4])

The marking engine is more than string matching. It normalises text, handles quotation variants, checks speech punctuation, checks list comma structure, checks boundary punctuation, checks parenthetical phrases, checks colon-before-list, checks semicolon-list separators, and checks bullet punctuation consistency. That is a strong base. ([GitHub][5])

The scheduler is also not just random selection. It filters by mode/cluster/skill, weights candidates, prioritises weak facets/items, due items, recent misses, new material, and secure material, and avoids simple recent repeats. ([GitHub][6])

The reward model has some good anti-grinding thinking already: it separates Try/Practice/Secure/Mastery stars, uses caps, requires deeper evidence for high tiers, and the grand Punctuation target requires broad secure evidence across all 14 units. ([GitHub][7])

The weak parts:

**The pool is small.** Ninety-six runtime items across 14 skills is only about 6–7 items per skill. For a child using the app regularly, that is not enough to avoid memorisation. This matters even more because the 100-star / Mega model needs evidence that the child can transfer learning, not just remember the same sentence.

**Some skills are especially thin.** Sentence endings, contractions, comma clarity, and semicolon lists have only 4 fixed evidence items each. That is acceptable for an early slice, but not enough for secure mastery.

**The generator is currently closer to a template picker than a true rule-based generator.** It is deterministic and safe, which is good, but the default bank needs more variation. Otherwise, increasing `generatedPerFamily` may create repeated item shapes rather than genuinely new questions.

**Dash handling needs tightening.** Some dash-clause generated models use a spaced hyphen as a dash, such as `The gate was stuck - we found another path.` The boundary validator for non-semicolon boundary marks also appears to expect a spaced hyphen, while parenthesis validation accepts `-`, `–`, and `—`. That means a child using a proper en dash or em dash for a dash-clause answer could be unfairly rejected. ([GitHub][3]) ([GitHub][5])

**Oxford comma policy needs to be explicit.** The fixed list-comma choice item marks `We packed torches, maps, and water.` as a misconception and says “in this KS2 example, no comma is needed before and.” That is okay for teaching a KS2 house style, but in free-text marking the app should not silently punish an otherwise valid Oxford comma unless the prompt explicitly says not to use one. ([GitHub][2])

**Multi-skill paragraph items need evidence caps.** They are valuable, but one paragraph repair should not over-credit two skills too quickly. A paragraph can provide supporting evidence for multiple skills, but deep secure evidence should still require spaced, varied, independent attempts.

This also matches the wider product direction: the goal should not be “more quiz questions”; it should be better spaced retrieval, better evidence, and better repair of weak spots. 

## 5. How to make the engine/template system better

I would not use AI generation at runtime. You are right on that. The better path is a **teacher-authored template engine with deterministic slots, validators, and golden tests**.

The current engine should evolve from:

```text
family -> pick one of a few templates -> build item
```

to:

```text
family -> choose a controlled template shape
       -> choose validated slots
       -> build prompt/stem/model
       -> attach validator/rubric
       -> run acceptance/rejection tests
       -> expose item only if it passes QA
```

A stronger template object should look more like this:

```js
{
  id: 'fronted_adverbial_combine_v3',
  skillId: 'fronted_adverbial',
  familyId: 'gen_fronted_adverbial_combine',
  mode: 'combine',
  difficultyBand: 'Y4-core',
  cognitiveDemand: 'constrained_transfer',
  readiness: ['constrained_transfer', 'misconception', 'negative_test'],
  misconceptionTags: ['comma.fronted_adverbial_missing'],

  slots: {
    phrase: ['After lunch', 'Before sunrise', 'Without warning'],
    mainClause: [
      'the class packed away the books',
      'the crew checked the ropes',
      'the goalkeeper dived left'
    ]
  },

  build({ phrase, mainClause }) {
    return {
      prompt: 'Combine the adverbial and main clause into one sentence.',
      stem: `${phrase}\n${capitalise(mainClause)}.`,
      model: `${phrase}, ${mainClause}.`,
      validator: {
        type: 'combineFrontedAdverbial',
        phrase,
        mainClause
      }
    };
  },

  tests: {
    accept: [
      'After lunch, the class packed away the books.'
    ],
    reject: [
      'After lunch the class packed away the books.',
      'After lunch. The class packed away the books.'
    ]
  }
}
```

The key is: **the model answer should be built by rules, not written separately each time.** That reduces human error.

## 6. Concrete improvements I would make first

First, add a **content audit script** that prints this every build:

```text
skillId
fixedItemCount
generatedFamilyCount
runtimeItemCount
modeCoverage
readinessCoverage
validatorCoverage
openTransferCount
paragraphCount
duplicateStemCount
duplicateModelCount
```

This should fail CI if a published skill has too few items, no transfer item, no negative-test/misconception item, or repeated generated stems.

Second, add **template signatures**. Every generated item should have a `variantSignature`, for example:

```text
skillId + mode + templateId + normalisedStem + normalisedModel
```

The scheduler should avoid repeating signatures, not only item IDs. Otherwise two generated IDs can still feel like the same question.

Third, expand each generator family to at least **8–12 unique templates or slot combinations** before increasing `GENERATED_ITEMS_PER_FAMILY`. Do not simply turn the setting from 1 to 5 until the template bank can support it.

Fourth, improve the **context-pack system**. It already sanitises context-pack atoms and can generate templates for selected families such as sentence endings, speech, list commas, fronted adverbials, parenthesis combining, and hyphens. But it currently affects only a subset of generator families. Expand it to all 25 families, and make it generate multiple variants per family rather than often returning one template. ([GitHub][8])

Fifth, harden marking acceptance:

```text
Accept straight and curly apostrophes.
Accept straight and curly quotation marks.
Accept dash variants: " - ", " – ", " — ".
For list commas, decide whether Oxford comma is accepted, style-warning only, or wrong only when the prompt says so.
For bullet points, continue accepting consistent no-punctuation or consistent full-stop styles.
For transfer questions, test legitimate alternate sentences, not just the model answer.
```

Sixth, change retry behaviour. After a mistake, do not just show the same item again. Use a **sibling template** with the same misconception tag but a different surface sentence. Example: if the child misses `comma.fronted_adverbial_missing`, the near retry should be another fronted-adverbial item with a different phrase and clause.

## 7. Expansion target

Current runtime pool: **96 items**.

Near-term safe target: **150–200 runtime items**.

Strong product target: **280–420 runtime items**, roughly **20–30 per skill**, with enough variation for spaced retrieval and secure mastery.

A good target shape:

```text
Fixed anchor items:
8–10 per reward unit
≈ 112–140 fixed items

Generator families:
25 families × 8–12 high-quality variants
≈ 200–300 generated variants

Total practical pool:
≈ 320–440 items
```

That is enough to support smart practice, weak-spot repair, spaced review, GPS-style mixed tests, and post-secure retention without children memorising the bank.

## 8. My recommended priority order

Do this in order:

**P0 — Count and quality guardrails.** Add the audit script, template signatures, duplicate detection, and golden marking tests. Fix dash acceptance and clarify Oxford comma policy.

**P1 — Expand the thinnest skills.** Add templates first for sentence endings, contractions, comma clarity, semicolon lists, hyphens, and dash clauses. These are currently the easiest places for repetition to show.

**P2 — Upgrade generator DSL.** Move from hand-written template arrays to slot-based teacher-authored templates with model builders and validators.

**P3 — Improve scheduler evidence.** Require varied evidence before deep secure: fixed item + generated item + transfer/combine/paragraph + spaced return. Do not let repeated generated variants count as independent deep evidence.

**P4 — Expand context packs.** Use context packs to safely create fresh surface contexts, but keep the grammar/punctuation rule and validator deterministic.

My blunt judgement: the current Punctuation content is directionally good and much safer than AI-generated questions, but the item pool is too small for the mastery ambition. The next win is not AI; it is a better deterministic template engine, more template variety, stronger QA tests, and scheduler rules that reward varied evidence rather than repeated correctness.

[1]: https://github.com/fol2/ks2-mastery "GitHub - fol2/ks2-mastery: KS2 Unified — browser-side React prototype of a KS2 (UK Year 5/6) study app · GitHub"
[2]: https://github.com/fol2/ks2-mastery/blob/main/shared/punctuation/content.js "ks2-mastery/shared/punctuation/content.js at main · fol2/ks2-mastery · GitHub"
[3]: https://github.com/fol2/ks2-mastery/raw/refs/heads/main/shared/punctuation/generators.js "raw.githubusercontent.com"
[4]: https://github.com/fol2/ks2-mastery/blob/main/shared/punctuation/service.js "ks2-mastery/shared/punctuation/service.js at main · fol2/ks2-mastery · GitHub"
[5]: https://github.com/fol2/ks2-mastery/blob/main/shared/punctuation/marking.js "ks2-mastery/shared/punctuation/marking.js at main · fol2/ks2-mastery · GitHub"
[6]: https://github.com/fol2/ks2-mastery/blob/main/shared/punctuation/scheduler.js "ks2-mastery/shared/punctuation/scheduler.js at main · fol2/ks2-mastery · GitHub"
[7]: https://github.com/fol2/ks2-mastery/raw/refs/heads/main/src/subjects/punctuation/star-projection.js "raw.githubusercontent.com"
[8]: https://github.com/fol2/ks2-mastery/blob/main/shared/punctuation/context-packs.js "ks2-mastery/shared/punctuation/context-packs.js at main · fol2/ks2-mastery · GitHub"
