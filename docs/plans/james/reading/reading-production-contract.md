# Reading subject production contract

Status: implemented as a Worker-owned production subject patch.
Source authority: uploaded lean ZIP snapshot plus `ks2_reading_mastery_structural_refactor.html` PoC content.

## Boundary

Reading is now a first-class subject module, not a browser-only PoC. The browser renders setup, passages, answer controls, feedback and analytics, but the question engine, marking, scheduling, progress mutation, session persistence, event emission and reward projection live behind `POST /api/subjects/reading/command`.

This preserves the existing production rule for subject expansion: public subjects must not hide their production engine in the browser. Reading shares the same subject-command path as Spelling, Grammar and Punctuation while keeping its engine isolated in `worker/src/subjects/reading/`.

## Content contract

The promoted content bank contains:

- 13 original passages across fiction, non-fiction and poetry.
- 107 questions across KS2 content domains 2a-2h plus a small punctuation-for-meaning support strand.
- 8 original 50-mark, 60-minute SATs-style papers.
- deterministic checks for selected-response, short answer, answer-plus-evidence, open rubric, multi-select, matching and ordering questions.

The content release id is `reading-poc-promoted-2026-05-05`.

## Learning loop

The core loop is passage-first:

1. choose a Reading mode;
2. read the full passage;
3. answer without model-answer or evidence leakage;
4. send the answer to the Worker command boundary;
5. receive marked feedback, model answer and evidence only after effort;
6. update Reading progress, review queues, analytics and rewards from domain events.

SATs-style paper mode delays feedback. Smart review uses weak/due/under-practised signals and dampens recently repeated passages so repeated questions are not obvious to the learner.

## Monster integration

Reading emits `reading.skill-secured` events only when a KS2 Reading domain becomes secure. These events project into the shared monster codex through Reading-owned monster ids:

- `readbloom` for vocabulary and author-word choice;
- `readrill` for retrieval and summarising;
- `inferane` for inference and prediction;
- `structurillon` for structure and comparison.

The monsters reuse existing reserve art through an `assetId`, but their state ids are Reading-owned so they do not collide with Grammar or Punctuation historical reward state.

## Hero Mode integration

Reading is now in `HERO_READY_SUBJECT_IDS`. Its Hero provider emits task envelopes for:

- starter growth;
- weak repair;
- due review;
- retention after secure;
- breadth maintenance / mini paper.

Hero launches Reading through the existing subject task-envelope adapter. Hero remains an orchestrator; Reading remains the scheduler/marking authority for its own questions.

## Acceptance checks added

- `tests/reading-content-contract.test.js`
- `tests/worker-reading-runtime.test.js`
- `tests/reading-subject-registry.test.js`

The tests validate content integrity, evidence quote anchoring, paper references, answer-leakage protection in the read model, deterministic marking, Worker runtime wiring, and Hero provider/adapter readiness.
