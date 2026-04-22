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

## Success Criteria

- Learners can intentionally choose between core statutory spelling practice and Extra practice.
- Core statutory progress remains trustworthy: Extra progress does not inflate or block Years 3-4, Years 5-6, or Phaeton.
- Extra has visible progress in the Word Bank or equivalent progress surface.
- Securing Extra words progresses the Extra monster only.
- SATs Test remains tied to core statutory spelling and does not include Extra words.

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

## Alternatives Considered

- Extra as a tag inside existing Years 3-4 or Years 5-6 pools: Rejected because it would make statutory progress and rewards harder to reason about.
- Extra counted inside the current "All" pool: Rejected because it would blur core statutory completion.
- Extra with SATs Test support: Rejected because it implies Extra is statutory SATs preparation.
- Extra with no monster: Rejected because the expansion should carry a clear reward loop.

## Outstanding Questions

### Resolve Before Planning
- [Affects R14, R15][User decision] What is the initial Extra word set, including accepted spellings, sentence prompts, explanations, and any grouping/source notes?

### Deferred to Planning
- [Affects R1, R4][Technical] Identify every current "All" spelling label and decide whether each instance should become "Core", "Statutory", or another short product label.
- [Affects R9, R13][Technical] Confirm the Vellhorn asset paths, Codex ordering, home meadow behaviour, and celebration rendering work across desktop and mobile.
- [Affects R14, R16][Technical] Determine the smallest content-model extension that preserves draft/publish safety without turning spelling content into a general CMS.

## Next Steps

→ Resume `ce:brainstorm` to capture the initial Extra word content before structured implementation planning.
