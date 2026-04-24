---
date: 2026-04-24
topic: grammar-mastery-region
---

# Grammar Mastery Region

## Problem Frame

KS2 Mastery needs a real Grammar subject that preserves the learning value of the legacy Grammar engine while fitting the current production platform, subject runtime, and creature-collection reward layer.

The legacy engine is a strong reference for how Grammar mastery should work without the game layer: deterministic question generation, post-attempt feedback, misconception tracking, mixed retrieval, spaced return, worked and faded support, and KS2-style test practice. The new product work should not turn that into a cosmetic quiz. The game layer should sit on top of the learning model as a reward and identity system, not change scoring, scheduling, or evidence of mastery.

The Clause Conservatory is the Grammar region. Existing world, monster, and background assets already make the region visually shippable once the subject engine and reward mapping are ready.

---

## Actors

- A1. KS2 learner: practises Grammar concepts, receives feedback, and sees creature progress.
- A2. Parent or supervising adult: needs clear evidence of what improved and what still needs review.
- A3. Grammar subject engine: owns deterministic question generation, marking, scheduling, and mastery evidence.
- A4. Game and reward layer: derives monster unlocks and evolution from committed learning evidence.
- A5. Platform runtime: owns persistence, Worker command boundaries, domain events, and production safety.

---

## Key Flows

- F1. Grammar practice without game dependency
  - **Trigger:** A learner starts Grammar practice from the Grammar subject route.
  - **Actors:** A1, A3, A5
  - **Steps:** The learner selects a mode, receives a deterministic item, makes a genuine first attempt, receives post-attempt feedback, and the engine updates skill, template, question-type, item, misconception, retry, and session state.
  - **Outcome:** The learner has a new evidence point; mastery state changes only through deterministic marking.
  - **Covered by:** R1, R2, R3, R4, R5, R6, R7, R8, R18, R19

- F2. Monster progress as a derived reward
  - **Trigger:** A committed Grammar answer changes a concept from not-secured to secured, or advances aggregate Grammar mastery.
  - **Actors:** A1, A4, A5
  - **Steps:** The reward layer reads the committed mastery event, maps the secured concept to the relevant monster family, updates caught/evolution state, and returns any celebration as part of the user-visible command response.
  - **Outcome:** The learner sees monster progress, but the reward layer has not influenced whether the answer was correct or whether the concept is secure.
  - **Covered by:** R9, R10, R11, R12, R13, R14

- F3. Adult-facing evidence
  - **Trigger:** A parent or adult reviews Grammar progress.
  - **Actors:** A2, A3, A5
  - **Steps:** The system shows secured concepts, due concepts, weak concepts, misconception trends, question-type strength, recent activity, and an explanation of the learning method.
  - **Outcome:** The adult can see the educational progress separately from the creature rewards.
  - **Covered by:** R15, R16, R17

---

## Requirements

**Learning model**
- R1. Grammar must be treated as a concept mastery engine, not a full English writing engine. It should target KS2 Grammar and GPS-style practice, while making clear that paragraph writing transfer is a later capability.
- R2. The first Grammar implementation should preserve or deliberately route the legacy coverage baseline: 18 concepts, 51 deterministic templates, 31 selected-response templates, 20 constructed-response templates, and the eight question-type families: classify, identify, choose, fill, fix, rewrite, build, and explain.
- R3. Mastery evidence must be tracked at multiple levels: concept skill, template, question type, generated item, misconception, retry queue, event history, and session summary.
- R4. Concept progress and the 0-100% Grammar mastery scale should be derived from secured learning evidence, not raw accuracy or session volume. Each node should keep the legacy measurement model unless planning finds a tested reason to change it: start around 25% strength, update from answer quality, and become secured only when it is strong, spaced, and stable.
- R5. A secured concept should require all of these evidence signals: at least one attempt, strength at or above 82%, review interval at or above 7 days, correct streak at or above 3, not currently weak, and not currently due for review.
- R6. Practice must preserve the learning science value before adding game rewards: mixed retrieval, interleaving, spaced return, immediate mistake recycling, contrastive examples, minimal post-attempt hints, worked examples, faded support, and no answer leakage before the first attempt.
- R7. Supported answers must not count the same as independent first-attempt correctness. Worked and faded support may help learning, but should produce lower mastery gain than an unsupported correct response.
- R8. AI may support enrichment only. It may explain, summarise, or suggest revision cards, but score-bearing questions and marking must remain deterministic and replayable.

**Grammar region and reward layer**
- R9. The Grammar region should use The Clause Conservatory identity from `docs/plans/james/grammar/grammar-conversation.md` and `assets/regions/the-clause-conservatory/`.
- R10. The v1 Grammar creature set should contain seven monsters: Bracehart, Glossbloom, Loomrill, Chronalyx, Couronnail, Mirrane, and the aggregate legendary Concordium.
- R11. The six direct monster families should map to the six Grammar domains already chosen in the design conversation: Sentence / Clause, Word / Phrase, Flow / Linkage, Verb / Mood, Register / Standard, and Voice / Role.
- R12. Direct monster evolution should be derived from secured concepts or secured sub-skills in its mapped domain, with stage thresholds proportional to that domain's denominator. Concordium should derive from aggregate Grammar-region mastery and should only reach Mega when the full chosen Grammar mastery denominator is secured.
- R13. Monster state must be derived from committed learning events or read models. The game layer must not mutate Grammar answer correctness, mastery strength, scheduling, retry queues, or concept status.
- R14. Existing monster assets under `assets/monsters/bracehart/`, `assets/monsters/glossbloom/`, `assets/monsters/loomrill/`, `assets/monsters/chronalyx/`, `assets/monsters/couronnail/`, `assets/monsters/mirrane/`, and `assets/monsters/concordium/` should be reused before requesting new image generation.

**Reporting and product framing**
- R15. Grammar reporting must separate the education layer from the game layer: first explain what has improved educationally, then show how the creature rewards reflect that progress.
- R16. Parent-facing summaries should expose concept status, misconception trends, due review, recent activity, and question-type weakness without requiring the adult to understand the monster system.
- R17. Learner-facing copy may celebrate creatures, but must not imply that monster progress is a substitute for secured Grammar evidence.

**Production boundary**
- R18. Production Grammar must follow the current subject-expansion and full-lockdown direction: React renders the subject UI and returned read models, while scored session creation, marking, scheduling, progress mutation, and reward projection belong behind Worker subject commands before release.
- R19. Browser-local Grammar may exist only as a development or reference mode. It must not become the production source of truth for scoring, scheduling, or mastery state.
- R20. Grammar integration must not regress English Spelling parity, shared subject routing, generic persistence, import/export restoration, learner switching, event publication, or production bundle audit guarantees.

---

## Acceptance Examples

- AE1. **Covers R4, R5, R12.** Given a learner has answered several Sentence / Clause questions correctly but the concept is still due today, when the reward layer calculates Bracehart progress, the concept does not count as secured until the due review is passed.
- AE2. **Covers R7, R13.** Given a learner uses a worked example and then answers correctly, when the engine updates mastery, the concept may improve but receives lower gain than an independent first-attempt correct answer, and the monster layer simply reflects the committed result.
- AE3. **Covers R8.** Given AI returns a revision card, when the learner loads a follow-up drill, the score-bearing question must come from an approved deterministic template rather than AI-authored free text.
- AE4. **Covers R15, R16, R17.** Given a parent opens a progress view, when the report is rendered, it first explains secured and weak Grammar concepts, then separately shows which monsters evolved because of that evidence.

---

## Success Criteria

- Learners improve Grammar through retrieval, discrimination, spaced review, and feedback before any game reward is considered.
- The Clause Conservatory feels like a complete subject region with existing backgrounds and monster assets, not a pasted-on skin.
- Concordium and the six direct monsters create motivation without corrupting mastery measurement.
- A planner can implement Grammar without inventing the education method, reward mapping, or production safety boundary.
- The implementation can be verified with deterministic template tests, mini-set generation tests, subject conformance tests, and reward derivation tests.

---

## Scope Boundaries

- Do not directly ship the legacy single-file HTML as the production subject.
- Do not let AI author score-bearing Grammar items or mark free-text scored answers in production.
- Do not make Grammar rewards depend on session volume alone; progress should reflect secured learning evidence.
- Do not build paragraph-level writing transfer in the first Grammar slice unless James explicitly expands scope.
- Do not build a Grammar content CMS in the first slice.
- Do not alter English Spelling parity or the existing spelling monster rules as part of this work.
- Do not collapse Bellstorm Coast into The Clause Conservatory. Full Grammar may include punctuation-for-grammar concepts for KS2 GPS mastery, but the Punctuation region should keep a distinct future identity and progression path.

---

## Key Decisions

- Use the legacy Grammar engine as a reference implementation, not as production code: it contains the right pedagogy and coverage, but must fit the current subject runtime.
- Keep game rewards additional: the reward layer derives from learning evidence and never controls marking or scheduling.
- Use seven Grammar creatures for the Clause Conservatory: six direct domain monsters plus Concordium as the aggregate legendary.
- Reuse existing assets first: the required Clause Conservatory backgrounds and Grammar monster stage assets are already present in `assets/`.
- Full Grammar target includes the legacy 18-concept denominator, including punctuation-for-grammar concepts, while Stage 1 may ship as a smaller production-safe slice with placeholders and progression hooks for the full target.

| Monster | Grammar domain | Legacy concept ids |
|---|---|---|
| Bracehart | Sentence / Clause | `sentence_functions`, `clauses`, `relative_clauses` |
| Glossbloom | Word / Phrase | `word_classes`, `noun_phrases` |
| Loomrill | Flow / Linkage | `adverbials`, `pronouns_cohesion` |
| Chronalyx | Verb / Mood | `tense_aspect`, `modal_verbs` |
| Couronnail | Register / Standard | `standard_english`, `formality` |
| Mirrane | Voice / Role | `active_passive`, `subject_object` |
| Concordium | Aggregate legendary | All selected Grammar-region denominator concepts |

The punctuation-for-grammar concepts included in the full Grammar denominator are `parenthesis_commas`, `speech_punctuation`, `apostrophes_possession`, `boundary_punctuation`, and `hyphen_ambiguity`. Bellstorm Coast can still become a richer Punctuation subject later without changing the Grammar engine's GPS-style coverage.

---

## Dependencies / Assumptions

- `docs/subject-expansion.md` is the current contract for adding the first real non-Spelling subject.
- `docs/plans/2026-04-23-001-feat-full-lockdown-runtime-plan.md` is the current direction for Worker-owned production subject commands and projections.
- `src/subjects/placeholders/index.js` confirms Grammar and Punctuation are separate placeholder subjects today.
- `src/platform/game/monsters.js` and `src/platform/game/monster-system.js` provide the existing spelling monster pattern that Grammar should extend rather than replace.
- The supplied legacy Grammar HTML and review report are accepted as the reference for coverage, measuring logic, and educational method.

---

## Outstanding Questions

### Resolve Before Planning

- None. James wants the full Grammar target, delivered in multiple PRs/stages. Stage 1 can be the production-safe v1, but the plan should include full placeholders and a path to the complete 18-concept Grammar region.

### Deferred to Planning

- [Affects R18, R20][Technical] Decide the exact Worker command and read-model shape for Grammar after checking the latest full-lockdown implementation state.
- [Affects R14][Technical] Decide whether Grammar needs new monster metadata fields or can extend the existing monster system with subject-specific monster lists and thresholds.
- [Affects R2, R5][Technical] Convert the legacy template smoke tests and mini-set regression tests into repo tests using deterministic fixtures.

---

## Next Steps

-> `/ce-plan` for a staged full Grammar implementation plan.
