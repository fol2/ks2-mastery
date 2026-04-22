---
date: 2026-04-22
topic: spelling-extra-expansion
---

# Spelling Extra Expansion

## Problem Frame

English Spelling currently treats the Years 3-4 and Years 5-6 statutory word lists as the core learning surface, with Inklet and Glimmerbug tracking those pools and Phaeton tracking core statutory progress across Years 3-6.

James wants an "Extra" spelling expansion: a separate, non-statutory pool of words with its own learner progress and monster reward, without blurring statutory completion, SATs-style practice, or the existing bonus monster meaning.

## Requirements

**Core and Extra Framing**
- R1. Rename the current aggregate "All" concept wherever it means Years 3-4 plus Years 5-6, so the learner sees it as the core statutory pool rather than every spelling word in the product.
- R2. Add "Extra" as an independent spelling pool for non-statutory expansion words.
- R3. Extra words must not count towards Years 3-4, Years 5-6, or core statutory completion.
- R4. Word Bank and progress surfaces must show Extra separately from the core statutory pools.

**Practice Behaviour**
- R5. Extra must support Smart Review.
- R6. Extra must support Trouble Drill when the learner has weak or due Extra words.
- R7. Extra must not use SATs Test wording or SATs Test mode, because Extra is enrichment rather than statutory SATs preparation.
- R8. Extra words should use the same learner-facing spelling cycle as core words, including secure status, due scheduling, retries, corrections, dictation, explanations, and word-bank drill where those behaviours already exist.

**Monster and Codex Rewards**
- R9. Extra secure words must progress a dedicated Extra monster, with Vellhorn as the default candidate because its complete branch and stage assets already exist in the repo.
- R10. Inklet must remain tied to Years 3-4 statutory words.
- R11. Glimmerbug must remain tied to Years 5-6 statutory words.
- R12. Phaeton must remain the core statutory bonus monster and must not be diluted by Extra progress.
- R13. The Extra monster should use the existing caught, evolve, level-up, and mega celebration language and visual pattern unless James later defines a different reward ceremony.

**Content and Operations**
- R14. Extra content must follow the same draft, validation, publish, and runtime-snapshot discipline as existing spelling content.
- R15. Each Extra word must have the same learner-facing support expected for core words: accepted answer data, sentence entries, explanation, grouping metadata, and provenance/source notes.
- R16. Unpublished Extra draft edits must not affect active learner sessions.

**Migration and Compatibility**
- R17. Existing learner progress for Years 3-4, Years 5-6, Inklet, Glimmerbug, and Phaeton must remain unchanged when Extra launches.
- R18. Imported or restored legacy spelling progress must continue to project only known core statutory words into the existing core monsters unless Extra data is explicitly present.

## Success Criteria

- Learners can intentionally choose between core statutory spelling practice and Extra practice.
- Core statutory progress remains trustworthy: Extra progress does not inflate or block Years 3-4, Years 5-6, or Phaeton.
- Extra has visible progress in the Word Bank or equivalent progress surface.
- Securing Extra words progresses the Extra monster only.
- SATs Test remains tied to core statutory spelling and does not include Extra words.
- Existing learners keep their current core spelling and monster progress after the feature ships.

## Scope Boundaries

- Do not redesign the whole spelling engine.
- Do not change the existing core monster thresholds unless a later requirement explicitly asks for it.
- Do not make Extra part of SATs Test.
- Do not add a general CMS beyond the existing spelling content draft/publish model.
- Do not add new cross-subject reward rules as part of this feature.

## Key Decisions

- Extra is an independent expansion pool: This preserves the meaning of statutory progress while giving enrichment words their own home.
- Extra gets its own monster: This makes the expansion feel worthwhile without overloading Inklet, Glimmerbug, or Phaeton.
- Vellhorn is the default Extra monster candidate: The repo already contains complete Vellhorn assets for both branches and all five stages.
- The aggregate statutory filter should be renamed away from "All": "All" would become misleading once Extra exists.
- Extra supports Smart Review and Trouble Drill only: SATs-style language should stay reserved for statutory practice.

## Dependencies / Assumptions

- The National Curriculum frames the Years 3-4 and Years 5-6 word lists as statutory and allows additional teacher-selected words alongside them.
- The first Extra word set will be supplied by James before implementation planning is finalised.
- Vellhorn remains acceptable as the Extra monster unless James chooses a different name or creature before planning.
- Complete Vellhorn assets are present locally, but planning must confirm they are intended to be tracked and shipped.

## Alternatives Considered

- Extra as a tag inside existing Years 3-4 or Years 5-6 pools: Rejected because it would make statutory progress and rewards harder to reason about.
- Extra counted inside the current "All" pool: Rejected because it would blur core statutory completion.
- Extra with SATs Test support: Rejected because it implies Extra is statutory SATs preparation.
- Extra with no monster: Rejected because the expansion should carry a clear reward loop.

## Initial Extra Content

Source note for all entries: James supplied the canonical Extra spelling list on 2026-04-22. Explanations, sentences, grouping notes, and accepted-answer suggestions are AI-drafted in UK English for KS2 learners.

| Word | Accepted Answers | Group | Learner Explanation | Sentence Prompt |
| --- | --- | --- | --- | --- |
| Divide | divide | Word-building verbs | To divide is to split something into parts or groups. | We divide the class into teams before the investigation. |
| Collide | collide | Word-building verbs | To collide is to crash into something or hit it while moving. | The two balls collide in the middle of the table. |
| Explode | explode | Word-building verbs | To explode is to burst apart suddenly with force. | The volcano model did not explode until the final step. |
| Corrode | corrode | Word-building verbs | To corrode is to be slowly damaged by a chemical reaction, often rust. | Salt water can corrode metal over time. |
| Conclude | conclude | Word-building verbs | To conclude is to finish, or to decide after thinking about evidence. | We conclude that shade slows the melting ice. |
| Extend | extend | Word-building verbs | To extend is to make something longer or reach further. | The bridge can extend across the stream. |
| Comprehend | comprehend | Word-building verbs | To comprehend is to understand something fully. | She could comprehend the instructions after reading them twice. |
| Evade | evade | Word-building verbs | To evade is to avoid or escape from someone or something. | The beetle tried to evade the torchlight under a leaf. |
| Intrude | intrude | Word-building verbs | To intrude is to enter or join in where you are not wanted. | Please do not intrude while the group is recording. |
| Interlude | interlude | Word-building verbs | An interlude is a short pause or break between parts of something. | A quiet interlude gave the performers time to reset. |
| Classification | classification | Science: classification | Classification is sorting living things or objects into groups by shared features. | Classification helps scientists compare animals with similar features. |
| Backbone | backbone | Science: body structure | A backbone is the row of bones that supports the back. | A fish has a backbone inside its body. |
| Skeleton | skeleton | Science: body structure | A skeleton is the frame of bones that supports a body. | The skeleton protects important organs. |
| Cold-blooded | cold-blooded; cold blooded | Science: animal groups | Cold-blooded animals depend on their surroundings to control body temperature. | A cold-blooded reptile warms itself on a rock. |
| Amphibians | amphibians | Science: animal groups | Amphibians are animals such as frogs that can live in water and on land. | Many amphibians begin life in water as tadpoles. |
| Metamorphosis | metamorphosis | Science: life cycles | Metamorphosis is a major change in body form as an animal grows. | A butterfly goes through metamorphosis before it can fly. |
| Reptiles | reptiles | Science: animal groups | Reptiles are cold-blooded animals with dry scales, such as lizards and snakes. | Reptiles often lay eggs on land. |
| Mammals | mammals | Science: animal groups | Mammals are warm-blooded animals that usually have hair or fur and feed their young milk. | Dolphins and bats are both mammals. |
| Arachnid | arachnid | Science: animal groups | An arachnid is an animal with eight legs, such as a spider or scorpion. | A spider is an arachnid, not an insect. |
| Mollusc | mollusc | Science: animal groups | A mollusc is a soft-bodied animal, often with a shell. | A snail is a mollusc with a coiled shell. |
| Botanist | botanist | Science: plants | A botanist is a scientist who studies plants. | The botanist examined the leaves carefully. |
| Flowering | flowering | Science: plants | Flowering means producing flowers. | The flowering plant attracted several bees. |

## Outstanding Questions

### Resolve Before Planning
- None.

### Deferred to Planning
- [Affects R1, R4][Technical] Identify every current "All" spelling label and decide whether each instance should become "Core", "Statutory", or another short product label.
- [Affects R9, R13][Technical] Confirm the Vellhorn asset paths, tracked asset status, Codex ordering, home meadow behaviour, and celebration rendering work across desktop and mobile.
- [Affects R14, R16][Technical] Determine the smallest content-model extension that preserves draft/publish safety without turning spelling content into a general CMS.
- [Affects R17, R18][Technical] Confirm the migration and import/export behaviour for existing learners, local review profiles, and restored legacy progress.
- [Affects R15][Needs review] Validate the AI-drafted Extra explanations and sentence prompts before publishing them as learner-facing content.

## Next Steps

→ `/prompts:ce-plan` for structured implementation planning.
