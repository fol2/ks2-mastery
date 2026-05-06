# Reading subject production contract

Status: Reading v2 debug, content enrichment and monster-threshold hardening patch.
Primary source authority: uploaded lean ZIP snapshot `ks2-mastery-lean-05060131.zip`.
Supplementary learning-design source: `ks2_reading_mastery_structural_refactor.html` PoC.

## 1. Production boundary

Reading is a first-class Worker-owned subject, not a browser-only PoC. The browser may render the subject shell, passages, answer controls, navigation, feedback panels, analytics and Hero launch affordances, but the Reading question engine remains isolated in `worker/src/subjects/reading/`.

The following Reading behaviours stay behind `POST /api/subjects/reading/command`:

- session creation and scheduling;
- response saving;
- marking;
- delayed-feedback paper marking;
- retry queue mutation;
- learner progress mutation;
- event emission;
- reward projection.

Reading shares the same platform subject-command contract as Spelling, Grammar and Punctuation. It must not mutate other subjects and other subjects must not call into the Reading engine.

## 2. Debug hardening contract

This patch fixes the main production safety issues found after Reading was implemented.

### 2.1 Delayed feedback cannot leak answers

`submit-answer` is immediate-feedback only. If the active Reading session is strict paper mode or any delayed-feedback session, `submit-answer` saves the response as a draft but does not mark, does not emit progress events, and does not expose model answers, evidence snippets or explanations.

`mark-section` is not allowed in strict paper mode. Strict paper sessions must be marked through whole-session marking so feedback appears only after the intended paper end.

### 2.2 Stale clients cannot overwrite the active slot silently

`save-response` now honours `expectedSessionId` and `expectedQuestionId` when supplied. This prevents stale browser tabs, delayed UI events or old form submissions from saving an answer into the wrong current Reading question.

### 2.3 Worker scheduling is deterministic under injected time

The Reading engine now uses the command clock for due/review calculations inside question weakness, passage selection, analytics and stats. That keeps Worker tests and idempotent replay behaviour stable.

### 2.4 Read models only show saved status for real answers

A response object such as `{}` no longer counts as answered or saved in the public read model. Empty draft records must not create misleading progress in question navigation, section navigation or paper answer counts.

## 3. Content enrichment contract

The Reading bank is expanded from the first promoted PoC bank to a larger production v2 bank.

Current built-in bank:

- 21 original passages;
- 182 questions;
- 12 original 50-mark, 60-minute SATs-style papers;
- 8 fiction passages, 8 non-fiction passages and 5 poetry passages;
- 7 long passages for stamina and paper-style practice;
- coverage across KS2 content domains 2a-2h plus the punctuation-for-meaning support strand.

The content release id remains `reading-poc-promoted-2026-05-05`, while `READING_CONTENT_VERSION` is bumped to `2`. Keeping the release id stable protects already-earned release-scoped Reading mastery keys; the version bump tells the product and tests that the bank has expanded.

## 4. Content quality rules

Every Reading passage must remain passage-first and original. The bank must not become a list of isolated quiz items.

A passage is acceptable only when it supports several kinds of thinking:

- precise retrieval;
- vocabulary in context;
- inference with evidence;
- summary across more than one detail;
- prediction rooted in textual clues;
- structure and whole-text movement;
- author word/phrase choice and effect;
- comparison within the text;
- selected-response and constructed-response practice.

Question quality rules:

- evidence snippets for evidence questions must appear verbatim in the source passage;
- hints must not reveal the answer or quote the decisive evidence before effort;
- model answers and explanations must be hidden until marking allows them;
- distractors should represent realistic KS2 misreadings, not silly choices;
- papers must sum to exactly 50 marks;
- paper rotation must use the enlarged bank so children do not feel the same questions are reappearing.

## 5. Scheduling and anti-repeat contract

Reading scheduling remains Reading-owned. Hero Mode and the app shell may request a task envelope, but Reading chooses the passage and questions.

The scheduler must continue to weight:

- weak skills;
- due review;
- recent misses;
- under-practised genres;
- under-practised question types;
- appropriate difficulty;
- recent passage and question penalties.

The larger bank is intended to make repetition unobvious. The product should prefer unseen or under-used passages when possible, and should dampen recently attempted passages/questions even when the same weak skill is due.

## 6. Monster threshold contract

Reading now follows the same product pattern as the more mature subjects: direct subject monsters represent smaller mastered clusters, while a grand/aggregate monster represents whole-subject breadth.

Reading direct monsters:

- `readbloom`: vocabulary in context (`2a`) and author word/phrase choice (`2g`);
- `readrill`: retrieval (`2b`) and summarising (`2c`);
- `inferane`: inference with evidence (`2d`) and prediction (`2e`);
- `structurillon`: structure (`2f`) and comparison (`2h`).

Each direct Reading monster has `masteredMax: 2` because each one owns two core KS2 Reading domains. Direct monsters use a 100-star display calculated from mastered domains in that cluster. This fixes the previous unreachable-stage bug where a two-skill Reading monster used a four-skill maximum.

Reading grand monster:

- `lorequill`: aggregate Reading mastery across all eight core KS2 Reading domains (`2a`-`2h`).

`lorequill` has `masteredMax: 8`. It is the only Reading monster that should reach Mega from full-domain coverage. This preserves a meaningful long-term Reading goal without blocking smaller cluster monsters from evolving.

Threshold display rules:

- Direct Reading monsters: `0/2`, `1/2`, `2/2` are projected to the same 100-star display surface used elsewhere.
- `lorequill`: `0/8` through `8/8` are projected to the same 100-star display surface, with staged growth before final Mega.
- Reading monster state is Reading-owned and must not collide with Grammar, Punctuation or Hero Pool state.

## 7. Hero Mode contract

Reading can be a Hero-ready subject, but Hero remains an orchestrator. Hero must not mark Reading answers, grant Reading mastery, or directly alter Reading monster state.

Hero may request Reading task envelopes such as:

- starter growth;
- weak repair;
- due review;
- retention after secure;
- breadth maintenance;
- mini paper / stamina work.

Reading decides the specific passage/questions. Reading domain events decide Reading monster rewards.

## 8. Acceptance checks

The patch adds or updates acceptance tests for:

- bank size, genre balance and domain coverage;
- unique passage/question IDs;
- evidence snippets existing in source passages;
- all Reading papers referencing valid passages/questions;
- every Reading paper summing to exactly 50 marks;
- browser metadata matching the safe content summary;
- Worker Reading runtime wiring;
- immediate feedback after valid marked attempts;
- no answer/model/evidence leakage through delayed-feedback submit;
- no section-level marking leak in strict paper mode;
- Reading reward projection into direct cluster monsters plus the full-domain `lorequill` aggregate monster.

Required focused command:

```bash
node --test \
  tests/reading-content-contract.test.js \
  tests/worker-reading-runtime.test.js \
  tests/reading-subject-registry.test.js
```

Expected result for this patch on the current Reading suite: 18 tests pass, 0 fail.

A final full CI run should still be performed after dependencies are installed, because the lean ZIP does not include `node_modules`.
