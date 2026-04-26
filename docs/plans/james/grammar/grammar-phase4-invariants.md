---
title: "Grammar Phase 4 — Invariants (scope-lock)"
type: invariants
status: locked
date: 2026-04-26
plan: docs/plans/2026-04-26-001-feat-grammar-phase4-learning-hardening-plan.md
unit: U0
---

# Grammar Phase 4 — Invariants (scope-lock)

This document is the single source of non-negotiables for Grammar Phase 4. Every Phase 4 PR reviewer cites these invariants by number when flagging a breach; every Phase 4 implementation unit (U1–U13) is obligated to preserve them. The list is locked at U0 before any code unit ships so that reviewers and workers reference the same contract when arguing about scope.

The twelve invariants below are drawn from the origin requirements (`docs/brainstorms/2026-04-24-grammar-mastery-region-requirements.md`, R1–R20) and from the Phase 4 plan's scope-lock statement (`docs/plans/2026-04-26-001-feat-grammar-phase4-learning-hardening-plan.md` §U0). They follow the phrasing pattern established by the Post-Mega Spelling Guardian MVP's "Mega is never revoked" invariant so that the style is familiar across subjects.

---

### 1. Smart Practice first attempt is independent

The Smart Practice learner mode must show no AI-assist, worked-example, similar-item, or faded-support affordance before the learner submits their first attempt on a given item. The first answer on every item is an unsupported independent-retrieval attempt; support affordances only become visible post-submit on a wrong answer, and only after the nudge → retry path below has run.

**Why:** R6 (learning science floor — mixed retrieval, immediate mistake recycling, worked examples only after first attempt) and R7 (supported answers must not count the same as independent correctness). Exposing support before submit would leak the answer and corrupt the mastery signal.

**Enforced by:** U4 `tests/grammar-learning-flow-matrix.test.js` (mode × phase × state sweep asserts `grammarSessionHelpVisibility` returns all-false pre-answer across every state), U2 `tests/grammar-phase3-child-copy.test.js` (scoper-hardened characterisation sweep).

---

### 2. Strict Mini Test has no pre-finish feedback

The SATs-style Mini Test mode must not render per-item feedback, correctness indicators, or support affordances while the test is in progress. Answers are saved silently; the review panel surfaces only once the learner finishes the full set.

**Why:** R6 (KS2 test-practice pedagogy requires strict no-leakage during the test) and R1 (Grammar is a mastery engine, not a freeform quiz — test mode must mirror the real assessment conditions the learner will face).

**Enforced by:** U4 `tests/grammar-learning-flow-matrix.test.js` (the `mini-test-before-finish` × every-state cells assert help visibility and feedback markers stay all-false), U2 scopers (`scopeSession`) fail loud if the mini-test DOM shape drifts.

---

### 3. Wrong-answer flow is nudge → retry → optional support

When a learner answers incorrectly, the UI shows a short nudge, offers a retry, and only after the retry (or on learner request) exposes optional support (worked example, faded scaffold, AI-enrichment). Each level of support raises `supportLevelAtScoring` on the evidence record so downstream mastery gain is reduced.

**Why:** R6 (immediate mistake recycling with minimal post-attempt hints) and R7 (supported answers must produce lower mastery gain than unsupported correct responses). Jumping straight to support would flatten the evidence signal and teach learners that asking for help is equivalent to solo recall.

**Enforced by:** U4 `tests/grammar-learning-flow-matrix.test.js` (post-answer-wrong → retry → feedback-with-support sequencing across all modes), `worker/src/subjects/grammar/attempt-support.js:76-117` (the existing deterministic owner of `supportLevelAtScoring`, mapping `supportUsed` → scoring level `0 | 1 | 2` before any evidence row is persisted).

---

### 4. AI is post-marking enrichment only

AI-generated explanations, revision cards, and summaries may appear only after a deterministic mark has been recorded. AI must never author a score-bearing question, mark a free-text scored answer, or surface any content before the learner's first scored attempt on the item.

**Why:** R8 (AI may support enrichment only; score-bearing questions and marking remain deterministic and replayable). This also protects the import/export and replay invariants — a learner's Grammar history must be reproducible from committed events alone.

**Enforced by:** U4 `tests/grammar-learning-flow-matrix.test.js` (AI affordance pre-submit is asserted absent), U10 `tests/grammar-writing-try-nonscored.test.js` (AI-enrichment path produces no `reward.monster` events), U11 answer-spec migration audit (scored answer specs contain only deterministic template output, never AI-authored strings).

---

### 5. Writing Try is non-scored

The Writing Try transfer path is an explicit non-scored sandbox. No `reward.monster` events may emit from any Writing Try code path, and no mastery-securing, misconception, or concept-secured domain events may be published from transfer saves.

**Why:** R13 (game layer must not mutate mastery, scheduling, retry, or concept status from a transfer path) and R15 (reporting must separate learning evidence from game reward — Writing Try belongs to the transfer/sandbox surface, not the mastery engine).

**Enforced by:** U3 `tests/grammar-concordium-invariant.test.js` (transfer-save event-emission matrix asserts zero `reward.monster` events), U10 `tests/grammar-writing-try-nonscored.test.js` (explicit snapshot of transfer save → event list is empty of reward/mastery/misconception entries).

---

### 6. Grammar rewards react to committed secured evidence only

The reward/monster layer must read only from committed mastery events or derived read models. It must never mutate Grammar answer correctness, mastery strength, scheduling, retry queues, concept status, or any other learning-engine field.

**Why:** R13 (game layer is a pure reader of committed evidence) and R4 (the 0–100% Grammar mastery scale is derived from secured evidence, not from any game-layer signal). This also preserves F2 — the monster-progress-as-derived-reward flow.

**Enforced by:** U3 `tests/grammar-concordium-invariant.test.js` (property test proves mutation through `recordGrammarConceptMastery` is read-only with respect to the mastery engine), U3 `tests/grammar-rewards.test.js` (extended adversarial scenarios), U7 parent/admin hub tests (confidence chips are read-derived and do not write back).

---

### 7. Concordium aggregates 18 concepts (denominator freeze)

`GRAMMAR_AGGREGATE_CONCEPTS.length === 18` is a pinned invariant for Phase 4. The aggregate denominator is frozen. Any future expansion to 19 or more concepts requires a paired migration and an explicit stage-monotonicity shim so that existing Mega holders are not silently demoted.

**Why:** R12 (Concordium reaches Mega only when the full chosen Grammar mastery denominator is secured) combined with the `grammarStageFor` implementation (`src/platform/game/mastery/grammar.js:76-84`) which computes stage as `mastered / total`. A silent denominator bump would revoke every existing Mega holder's stage from 4 to 3 — precisely the class of regression this invariant exists to prevent.

**Enforced by:** U3 `tests/grammar-concordium-invariant.test.js` (hard-pinned `GRAMMAR_AGGREGATE_CONCEPTS.length === 18` assertion), U12 content-expansion audit (any 19th-concept PR must ship a stage-monotonicity shim before this assertion is relaxed).

---

### 8. Bracehart / Chronalyx / Couronnail are the only direct active monsters

The Phase 4 monster roster exposes three direct active monsters — Bracehart (Sentence/Clause), Chronalyx (Verb/Mood), Couronnail (Register/Standard) — plus the aggregate Concordium. Glossbloom (Word/Phrase), Loomrill (Flow/Linkage), and Mirrane (Voice/Role) are reserve: their domains are included in the Concordium denominator, but no direct `caught` events fire for them in Phase 4.

**Why:** R10 and R11 (v1 creature set and six-domain mapping), combined with the Phase 4 roster flip decision that deferred three domains to reserve. This invariant is what makes the P3 writer-self-heal logic at `src/platform/game/mastery/grammar.js:255-266,296-349` load-bearing: it must emit aggregate progress without emitting a direct-caught toast for a reserve monster.

**Enforced by:** U3 `tests/grammar-monster-roster.test.js` (cross-release retired-id census asserts the 4+3 split), U3 `tests/grammar-concordium-invariant.test.js` (named shape 2 — pre-flip Glossbloom-secured state must self-heal without a direct-caught event).

---

### 9. No `contentReleaseId` bump without a marking-behaviour change

Phase 4 ships zero `contentReleaseId` bumps. The release id is reserved for genuine content or marking-behaviour changes — test hardening, UI copy, reward wiring, scope-lock docs, and parity tests are all `contentReleaseId`-neutral.

**Why:** R20 (Grammar must not regress English Spelling parity, shared subject routing, generic persistence, or production bundle audit guarantees). Every `contentReleaseId` bump invalidates learner caches and forces a replay of every committed answer — a cost only justified when the marking rules themselves change.

**Enforced by:** U12 content-expansion audit (grep-based assertion that no Phase 4 PR touches `contentReleaseId` in `worker/src/subjects/grammar/` or `src/subjects/grammar/`), U13 Phase 4 completeness gate.

---

### 10. English Spelling parity preserved

Phase 4 touches only Grammar-scoped files plus the audited cross-subject enumerators that Phase 3 U0 already routed through shared helpers. English Spelling behaviour, event shapes, reward mapping, parity tests, and persisted state are untouched.

**Why:** R20 (Grammar integration must not regress English Spelling parity) and the AGENTS.md §14 cross-subject-parity rule. Every prior Grammar phase has had a near-regression into Spelling via a shared helper; this invariant names the rule explicitly so reviewers can cite it by number.

**Enforced by:** U1 `tests/grammar-production-smoke.test.js` (forbidden-key universal floor unchanged), U3 `tests/grammar-concordium-invariant.test.js` (Spelling cross-subject regression scenario asserts `src/platform/game/mastery/spelling.js:148,177` still routes through `normaliseGrammarRewardState`), U13 completeness gate (parity-suite snapshot diff).

---

### 11. Concordium is never revoked post-secure

Once Concordium reaches a given `stage` or `caught = true`, those values are sticky ratchets. No subsequent mutator — retry, re-scoring, writer self-heal, import/export round-trip, cross-release state carry, or adversarial payload — may decrement `Concordium.stage` or flip `Concordium.caught` from `true` back to `false`. The composite property test in U3 enforces the ratchet under 200 random sequences plus six named shapes.

**Why:** R12 (Concordium derives from aggregate Grammar-region mastery and only reaches Mega on full denominator secured) combined with the Post-Mega Spelling Guardian precedent — "Mega is never revoked" is the user-trust contract. A revoked Mega destroys the emotional payoff of mastery and signals to learners that the app's own progress claims are unreliable.

**Enforced by:** U3 `tests/grammar-concordium-invariant.test.js` (the composite invariant test — 200 random sequences under seed 42 plus six named shapes, each asserting `Concordium.stage >= max_prior_Concordium.stage` and `Concordium.caught >= max_prior_Concordium.caught` after every mutator step).

---

### 12. Forbidden-keys universal floor is unchanged

> **Plan-to-doc mapping note:** Invariants 1–11 map 1-for-1 to the Phase 4 plan's scope-lock list. Invariant 12 is the one addition — it captures U0's general hardening intent ("no Phase 4 PR silently widens the forbidden-key floor to paper over a leak") rather than a discretely plan-listed invariant, and is pinned here so reviewers can cite it by number alongside the other eleven.

The forbidden-keys universal floor (`tests/helpers/forbidden-keys.mjs`) is never widened or weakened by Phase 4. The client and Worker both respect this floor; neither side may add a new forbidden key to paper over a shape drift, and neither may remove an existing entry to let a leaked field pass.

**Why:** R20 (production bundle audit guarantees) and the recurring Phase 3 defect pattern — test harness or production code was modified to tolerate a leaked key instead of fixing the emitter. The floor is the contract; leaks are fixed at the emitter, not at the assertion.

**Enforced by:** U1 `tests/grammar-production-smoke.test.js` (forbidden-key scan on `session.currentItem` for `correctResponses`, `answers`, `templates`), U13 completeness gate (hash-pin of `tests/helpers/forbidden-keys.mjs` so any Phase 4 PR that edits the helper must be flagged for reviewer attention).

---

## How reviewers cite this document

A Phase 4 review comment that flags a breach should cite the invariant number (e.g., "breach of invariant 7 — denominator freeze") so that the discussion thread maps back to the same contract the worker read when writing the unit. Workers executing U1–U13 are expected to re-read the relevant invariant before opening the PR and to name in their PR body which invariants the unit preserves.

If a future requirements change necessitates relaxing an invariant, the relaxation must ship in a dedicated PR that (a) updates this document, (b) updates the enforcing test, and (c) ships the compensating migration — never as a silent side effect of an implementation unit.
