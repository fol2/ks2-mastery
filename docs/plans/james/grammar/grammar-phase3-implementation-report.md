# Grammar Phase 3 — UX/UI Reset Implementation Report

**Date:** 2026-04-26
**Plan:** `docs/plans/2026-04-25-004-feat-grammar-phase3-ux-reset-plan.md`
**Review input:** `docs/plans/james/grammar/grammar-p3.md`
**Status:** Complete. All 12 implementation units shipped to `main`.
**End-to-end duration:** ~5h 20min (U0 merge 19:34 UTC 2026-04-25 → U10 merge 00:55 UTC 2026-04-26)
**Working model:** fully autonomous SDLC — scrum-master orchestration, per-unit worker → parallel reviewers → review follower → re-review → merge

---

## 1. Executive summary

Grammar Phase 2 (`grammar-phase2-implementation-report.md`) hardened the Worker engine: selection fairness, attempt-support contract v2, declarative answer-spec, five-label confidence taxonomy, non-scored transfer lane, completeness gate — 8 PRs, 201 tests green. But the client surface still read as an adult diagnostic panel. Dashboard exposed "Worker-marked modes" and the full 18-concept placeholder map. Sessions surfaced Worker-authority chips and pre-answer AI buttons. Analytics bled "Evidence snapshot", "Stage 1", "Bellstorm bridge" into the child path. The Worker's `transferLane` read model was plumbed on the server but silently dropped by the client normaliser. The monster roster showed all seven creatures as equal actives even though product intent had moved to 4 + 3.

Phase 3 rewrote that client surface as a child-facing product. The learner now moves through a single coherent flow — Dashboard → Practise → Fix → Review → Browse Grammar Bank — with a dedicated non-scored Writing Try scene. The monster roster was rationalised to 4 active + 3 reserve (mirroring Punctuation's shipped pattern), carrying forward every pre-flip learner's reward progress without loss. Adult analytics was preserved but gated: reachable only via a secondary "Grown-up view" button on the summary screen, plus a closed-by-default `<details>` escape hatch on the dashboard for parents.

### Headline outcomes

- **12 PRs merged** to `main` (#184, #186, #191, #192, #195, #197, #200, #205, #220, #222, #226, #229).
- **10,581 lines added, 604 lines deleted** across the phase. ~91% net-new code because Phase 3 is largely new scenes on top of U8's view-model substrate.
- **7 of 12 units required a follower cycle** (U1, U2, U3, U4, U5, U6b). U0, U8, U6a, U7, U9, U10 passed first-round review.
- **Zero BLOCKING findings at merge time** across 30+ reviewer passes (12 first-round × 2-3 reviewers + 7 re-reviews).
- **No Worker or content change**: `contentReleaseId` frozen at `grammar-legacy-reviewed-2026-04-24`; oracle replay at `tests/fixtures/grammar-legacy-oracle/legacy-baseline.json` byte-identical throughout.
- **English Spelling parity preserved** (AGENTS.md line 14); no Spelling JSX or CSS touched except two cross-subject enumerator callsites in `src/platform/game/mastery/spelling.js` at lines 148 and 177 that consume Grammar's new `normaliseGrammarRewardState` so pre-flip Glossbloom-caught learners still surface Concordium on the home meadow.
- **Test surface grew from 201 Grammar-specific tests (Phase 2 baseline) to ~2,200 total tests** (2,194 pass / 1 skipped / 1 pre-existing unrelated failure). Machine-enforced invariants now cover 20 forbidden child-copy terms × 9 child phases, analytics inverse-presence, roster registry positives, non-scored delta snapshots, and a baseline-gate file that refuses to merge any `planned` row.

---

## 2. Unit-by-unit summary

Each unit shipped as an independent PR. Dependencies ran strictly serial; every worker branched from the latest `main` (which already included prior units). The `review → follower → re-review → merge` SDLC discipline from Phase 2 §3 was preserved and scaled.

### U0 — Roster 4+3 + writer self-heal + codex landmines (PR [#184](https://github.com/fol2/ks2-mastery/pull/184))

**Files:** `src/platform/game/monsters.js`, `src/platform/game/mastery/shared.js`, `src/platform/game/mastery/grammar.js`, `src/platform/game/mastery/spelling.js` (cross-subject enumerator audits), `src/subjects/grammar/metadata.js`, `src/subjects/grammar/components/GrammarPracticeSurface.jsx`, `src/surfaces/home/data.js`, `worker/src/projections/events.js`, `tests/grammar-monster-roster.test.js` (33 scenarios), `tests/grammar-rewards.test.js` (extended).

**What landed.** The foundational platform change. `MONSTERS_BY_SUBJECT.grammar` narrowed to `['bracehart', 'chronalyx', 'couronnail', 'concordium']` + new `grammarReserve: ['glossbloom', 'loomrill', 'mirrane']`. `GRAMMAR_RESERVED_MONSTER_IDS` added to `shared.js` mirroring `PUNCTUATION_RESERVED_MONSTER_IDS`. `GRAMMAR_MONSTER_CONCEPTS` rebucketed to three direct clusters: Bracehart (`sentence_functions`, `clauses`, `relative_clauses`, `noun_phrases`, `active_passive`, `subject_object`) = 6; Chronalyx (`tense_aspect`, `modal_verbs`, `adverbials`, `pronouns_cohesion`) = 4; Couronnail (`word_classes`, `standard_english`, `formality`) = 3. The five punctuation-for-grammar concepts (`parenthesis_commas`, `speech_punctuation`, `apostrophes_possession`, `boundary_punctuation`, `hyphen_ambiguity`) stay in Concordium's 18-concept aggregate only. `GRAMMAR_MONSTER_ROUTES` trimmed to 4 entries.

**Read-time + writer migration (load-bearing).** Punctuation's one-way collapse-to-grand didn't translate directly to Grammar's many-to-one redistribution. Three layers shipped:

1. **`normaliseGrammarRewardState(raw, releaseId)`** reads retired-id `mastered[]` arrays and unions them into Concordium's view at read time without mutating stored state. Dedupes by concept id via `grammarConceptIdFromMasteryKey` per entry — critical because retired entries may carry a different `releaseId` than the post-flip Concordium entry, so raw-string equality would miss collisions.
2. **Writer self-heal in `recordGrammarConceptMastery`**. The existing early-out at `grammar.js:190` consulted only the *current* direct's `mastered[]`. A pre-flip Glossbloom learner who already mastered `noun_phrases` would cause the writer to fire a spurious `bracehart.caught` the next time they answered any Bracehart-cluster concept post-flip. The self-heal now consults retired-id `mastered[]` before the early-out; if any retired id holds the concept, it seeds the new direct silently (state delta persists, event emission suppressed for the seed path).
3. **`grammarTerminalConceptToken` extension** at `worker/src/projections/events.js` keys on `(learnerId, subjectId, conceptId, kind, releaseId)` for Grammar direct events — belt-and-braces on top of the writer self-heal. The writer path is primary; the token is replay protection.

**Codex landmines (three single-line bugs that would have silently regressed).** Adapted from the Punctuation P2 §2.U5 playbook: (1) `pickFeaturedCodexEntry` filter extended to exclude `'grammarReserve'`; (2) `withSynthesisedUncaughtMonsters` scoped to an explicit `CODEX_SUBJECT_GROUP_IDS` allow-list so reserved buckets never enter the Codex pipeline; (3) `CODEX_POWER_RANK` reordered so reserved Grammar ids (12–14) < active directs (15–17) < Concordium (18), mirroring Punctuation's treatment.

**Cross-subject audit.** `src/platform/game/mastery/spelling.js:148,177` feeds `monsterSummaryFromState` and `monsterSummaryFromSpellingAnalytics` with normalised state, not raw — otherwise a pre-flip glossbloom-only learner would appear fresh on the home meadow.

**Reviewer yield.** Migration-safety agent confirmed the asymmetric cluster remap via trace analysis. Correctness agent found zero bugs after tracing every malformed-input path through `normaliseGrammarRewardState`. Testing agent's follower added two load-bearing regression tests (T1: JSX boundary `resolveGrammarRewardState` wiring; T2: spelling.js callsite normaliser routing) because the original U0 tests only pinned the helper layer.

**Side observation — seed path must be silent on emission but persistent on state.** A naïve self-heal that just returned empty events would leave stored state under the retired id only, and `hasGrammarRewardProgress` iterating the trimmed `GRAMMAR_MONSTER_ROUTES` (4 entries) would report fresh-learner. The implementation at `grammar.js:326-336` writes `after[directMonsterId] = { mastered: [masteryKey], caught: true, conceptTotal, releaseId }` unconditionally while gating the event emission at line 349 on `!shouldSelfHealDirect`. Two decoupled concerns: persistence is always correct, emission is gated.

### U8 — View-model layer (front-loaded) (PR [#186](https://github.com/fol2/ks2-mastery/pull/186))

**Files:** `src/subjects/grammar/session-ui.js` (new, 6 exports), `src/subjects/grammar/components/grammar-view-model.js` (new, 13 exports + `GRAMMAR_CHILD_FORBIDDEN_TERMS` fixture), `tests/grammar-ui-model.test.js` (new, 70 pure-function assertions).

**What landed.** Grammar's single source of truth for display decisions. Mirrored Spelling's proven split: session-level label/visibility selectors in `session-ui.js`; frozen option lists + label mappers + model builders in `components/grammar-view-model.js`. Every subsequent JSX unit (U1, U2, U3, U4, U5, U6b) imports from this layer — no inline copy in any component. Tests become pure-function assertions without SSR render.

**The single-source-of-truth win is `grammarSessionHelpVisibility(session, grammarPhase)`.** It returns `{ showAiActions, showRepairActions, showWorkedSolution, showSimilarProblem, showFadedSupport }` with an explicit truth table: mini-test always all-false; non-feedback always all-false (pre-answer independent practice must not surface help); feedback with `supportLevel === 0` surfaces AI + repair + faded-support post-answer. U3's session redesign reads this helper **once** at the top of `GrammarSessionScene.jsx` and threads the flags into every gate. Five scattered visibility conditions collapsed to one helper with one table. U10's absence test automatically covers every child phase by iterating through them.

**`GRAMMAR_CHILD_FORBIDDEN_TERMS`** is a frozen 18-entry list plus a whole-word `/\bWorker\b/i` catch-all in tests. Every adult/developer term that must not appear in child screens — `Worker`, `Worker-held`, `Worker-marked`, `Worker authority`, `Stage 1`, `Full placeholder map`, `Evidence snapshot`, `Reserved reward routes`, `Bellstorm bridge`, `18-concept denominator`, `read model`, `denominator`, `reward route`, `projection`, `retrieval practice` — is enumerated once, enforced via a loop across every child phase in U10. New terms get added to one frozen array, not to N hand-written assertions. This is the architectural call that made U10 cheap: forbidden-term coverage scales linearly with list size, not quadratically with phase count × term count.

**Reviewer yield.** One advisory: `session.phase === 'retry'` branch in `grammarSessionSubmitLabel` is currently unreachable because Grammar's engine doesn't emit that phase — reserved for a future U3 refinement. Low priority, left in for future-proofing.

**Side observation — AGENTS.md line 14 forced a subject-scoped helper split.** No shared `HeroCard`/`ModeCard`/`StatusChip` primitives extracted to a shared location. Grammar mirrors Spelling's shape but owns its own copies. English Spelling parity stays byte-for-byte identical.

### U6a — `transferLane` client plumbing + `grammar-save-transfer-evidence` dispatcher (PR [#191](https://github.com/fol2/ks2-mastery/pull/191))

**Files:** `src/subjects/grammar/metadata.js` (`normaliseGrammarReadModel` extension), `src/subjects/grammar/module.js` (dispatcher + `GRAMMAR_TRANSFER_ERROR_COPY` + `translateGrammarTransferError` + `sendGrammarCommand` `onResolved` callback hook), `tests/grammar-transfer-lane.test.js` (drift detection), `tests/react-grammar-surface.test.js` (boundary assertions).

**What landed.** The client pipe to the Phase 2 Worker transfer lane. Phase 2's PR #158 exposed `transferLane` on the Worker read model (`worker/src/subjects/grammar/read-models.js:829,840-874`) but the client's `normaliseGrammarReadModel` explicitly constructed its return object and silently dropped it — verified by a grep returning zero hits for `transferLane` in `src/subjects/grammar/` pre-U6a. U6a closed that drift.

**Authoritative contract shape documented in the plan** and enforced by the drift test:
- `PromptSummary = { id, title, brief, grammarTargets, checklist }` — **field is `brief`, not `theme`** (the planning-phase review caught this as a BLOCKING finding before any code landed).
- `EvidenceEntry = { promptId, latest: { writing, selfAssessment, savedAt, source }, history: Array<{ writing, savedAt, source }>, updatedAt }` — latest carries `selfAssessment`; history items omit it intentionally (Worker archive redaction).
- Save payload is `{ promptId, writing, selfAssessment: Array<{ key, checked }> }` — **key is `selfAssessment`, NOT `checklist`** (another planning-phase BLOCKING save).
- Four error codes enumerated: `grammar_transfer_unavailable_during_mini_test`, `grammar_transfer_prompt_not_found`, `grammar_transfer_writing_required`, `grammar_transfer_quota_exceeded`. All translated to UK-English child copy by `translateGrammarTransferError` with a generic fallback.

**Drift detection test iterates every Worker-emitted key at every nesting level.** A future Worker field addition fails the test unless the client normaliser passes it through or explicitly allow-lists. Recursive `assertNoForbiddenReadModelKeys(rm.transferLane, ['reviewCopy', 'requestId'])` scan guards redaction. Both `reviewCopy` (adult-only prompt field) and `requestId` (internal trace) must never surface client-side.

**`'transfer'` phase allowlist deliberately NOT added in U6a.** That addition lives in U6b alongside the scene that needs it. U6a is plumbing only; this kept the PR diff focused and reviewable.

**Reviewer yield.** Correctness agent flagged one residual risk: `translateGrammarTransferError` always returns non-empty, so a `|| fallback` guard in `sendGrammarCommand` is unreachable — dead safety net. Left in as defensive code; documented as advisory.

**Side observation — `onResolved` callback became a reusable primitive.** Added to `sendGrammarCommand` for U6a, then reused by U2's `grammar-focus-concept` remote-save chain (follower fix) and U6b's post-save-clear-draft sequence. Three call sites now use the same microtask-safe chaining pattern.

### U1 — Child dashboard rewrite (PR [#192](https://github.com/fol2/ks2-mastery/pull/192))

**Files:** `src/subjects/grammar/components/GrammarSetupScene.jsx` (rewrite), `src/subjects/grammar/components/GrammarPracticeSurface.jsx` (phase router + analytics demotion), `src/subjects/grammar/components/grammar-view-model.js` (`buildGrammarDashboardModel.isEmpty`, featured flag, hero constant updates), `src/subjects/grammar/module.js` (`grammar-open-concept-bank`, `grammar-open-transfer` action placeholders), `src/subjects/grammar/metadata.js` (phase allowlist `'bank'` + `'transfer'`), `tests/react-grammar-surface.test.js` (full forbidden-terms sweep + disclosure + featured), `tests/subject-expansion.test.js` (hero matcher), `tests/browser-react-migration-smoke.test.js` (stale-selector updates).

**What landed.** The hero change. "Grammar retrieval practice" (adult metacognition jargon, asserted present by the existing test suite at `react-grammar-surface.test.js:31`) became "Grammar Garden — One short round. Fix tricky sentences. Grow your Grammar creatures." The 18-concept placeholder grid, the `Worker-marked modes` eyebrow, the `Worker marked` chip, and the `full map` stat were all removed.

**Information architecture.** Four primary mode cards (Smart Practice / Fix Trouble Spots / Mini Test / Grammar Bank), iterating `GRAMMAR_PRIMARY_MODE_CARDS` from U8. Smart Practice carries `featured: true` → `data-featured="true"` + class `is-recommended` + a "Recommended" eyebrow. Five secondary modes (Learn / Surgery / Builder / Worked / Faded) live behind a `<details>` "More practice" disclosure, closed by default. "Writing Try · non-scored" button wires `grammar-open-transfer` (scene lands in U6b). Today row: Due / Trouble / Secure / Streak + a Concordium progress card with the grand-monster image from `grammarMonsterAsset('concordium', 320)` and the label "Grow Concordium".

**Empty-state callout.** When all four Today counts are zero (brand-new learner), `buildGrammarDashboardModel` sets `isEmpty: true` and the scene renders "Start your first round to see your scores here." instead of four stark zero tiles.

**Reviewer yield — three design blockers from follower round.**
1. Featured Smart Practice card lacked structural weight → `data-featured` + `is-recommended` + "Recommended" eyebrow.
2. Empty-state missing → `isEmpty` flag + callout copy.
3. Concordium fraction read as raw status bar → creature image + "Grow Concordium" label.

Plus three testing gaps closed in the same follower: forbidden-terms loop iterated instead of six hard-coded asserts; stale `tests/browser-react-migration-smoke.test.js` selectors updated (`.grammar-setup` → `.grammar-dashboard`, `.grammar-mode` → `.grammar-primary-mode`, hero copy, button labels); mid-session guard test for `grammar-open-concept-bank` and `grammar-open-transfer` pinning `phase === 'session'` and `phase === 'feedback'` no-ops.

**Side observation — the browser-smoke test is env-gated (`KS2_BROWSER_SMOKE=1`), so it doesn't run in default CI.** A stale selector could have silently bit-rotted. The PR's claim that "1421 pass / 1 pre-existing failure" was technically accurate but missed the env-gated file. Follower's testing reviewer caught this: `/Grammar retrieval practice/` and `.grammar-setup` references were live in `browser-react-migration-smoke.test.js:110,163`. Fixed in the same follower commit. **Meta-lesson: env-gated tests don't run in your baseline, so they can't silently confirm your change is safe. Grep for every copy string you remove.**

### U2 — Grammar Bank scene + concept detail modal (PR [#195](https://github.com/fol2/ks2-mastery/pull/195))

**Files:** `src/subjects/grammar/components/GrammarConceptBankScene.jsx` (new, ~600 lines), `src/subjects/grammar/components/GrammarConceptDetailModal.jsx` (new), `src/subjects/grammar/components/grammar-view-model.js` (`GRAMMAR_CONCEPT_EXAMPLES`, `buildGrammarBankModel`, bank aggregate helpers, `GRAMMAR_BANK_HERO.emptyWithSearch`), `src/subjects/grammar/module.js` (7 new actions), `src/subjects/grammar/components/GrammarPracticeSurface.jsx` (phase=bank router), `src/subjects/grammar/metadata.js` (bank UI slice normalisation), `tests/react-grammar-surface.test.js` (+13 SSR), `tests/grammar-ui-model.test.js` (+8 view-model).

**What landed.** Grammar's Word Bank. 18 concept cards, search, 7 status filters (All / Due / Trouble / Learning / Nearly secure / Secure / New), 5 cluster filters (All / Bracehart / Chronalyx / Couronnail / Concordium), each card with child status chip + cluster badge + one-sentence example + `Practise 5` + `See example` buttons. Detail modal with `role="dialog"` + `aria-modal="true"` + `aria-labelledby` + Esc close + focus-return-on-close marker (`data-focus-return-id`).

**`GRAMMAR_CONCEPT_EXAMPLES`** ships one example sentence per concept (18 entries). Detail modal shows two. Follower swapped `hyphen_ambiguity` examples: original `[0]` was `"Please resign the letter and send it back."` (deliberately ambiguous, but on the card it reads as a straightforward instruction with no framing). Now `[0]` is the clear `"The man-eating shark circled the boat."`; `[1]` is the ambiguity example with the hyphen restored (`"Please re-sign the letter and send it back."`).

**`grammar-focus-concept`** routes the "Practise 5" tap into a focused session. The action calls `service.savePrefs` (local path) then dispatches `grammar-start`. Follower fixed the remote path: when no `service.savePrefs` helper is configured, the original handler dispatched `save-prefs` then immediately dispatched `start-session`, which hit `sendGrammarCommand`'s `pendingCommand` guard and silently no-oped. Fix chains `start-session` via the new `onResolved` callback so it fires after `save-prefs` resolves. Covered by a dedicated test that stubs `sendGrammarCommand` and asserts both calls fire in order across microtask ticks.

**Reviewer yield.** One BLOCKING (design) + one BLOCKING (correctness) + three advisories. Follower closed all:
- **Design BLK-1:** `GRAMMAR_BANK_HERO.empty` was a static string; search-zero-matches pointed the child to "try another status or cluster" when the fix was to clear the search box. Added `GRAMMAR_BANK_HERO.emptyWithSearch` with query-aware copy, mirroring Spelling Word Bank's pattern at `SpellingWordBankScene.jsx:340`.
- **Design BLK-2:** `hyphen_ambiguity` card example flipped (above).
- **Correctness BLK:** Remote-save chain (above).
- **Advisories:** `grammar-close-concept-bank` didn't clear `bank.detailConceptId` → stale modal re-popped on reopen; Total aggregate card stayed at 18 when cluster filter narrowed (kept as global total rather than cluster size — clearer to the child).

**Side observation — the spelling.js mirror pattern held.** `SpellingWordBankScene.jsx` was the source pattern; `SpellingWordDetailModal.jsx` was the modal pattern. Grammar's versions mirror the structure exactly without sharing a primitive. AGENTS.md line 14 parity preserved.

### U3 — Session redesign (one task, one primary action) (PR [#197](https://github.com/fol2/ks2-mastery/pull/197))

**Files:** `src/subjects/grammar/components/GrammarSessionScene.jsx` (gate refactor), `src/subjects/grammar/module.js` (`translateGrammarSessionError` + `GRAMMAR_SESSION_ERROR_COPY`), `tests/react-grammar-surface.test.js` (+U3 scenarios + role=alert assertion + forbidden-terms sweep on all phases).

**What landed.** Pre-answer session HTML now contains exactly one primary action (Submit) + Read aloud + prompt + input. No `Worker authority` chip, no "Worker-marked question" title, no `Explain this` / `Revision cards` / `Worked solution` / `Similar problem` / `Faded support` buttons. The whole visibility table moved into U8's `grammarSessionHelpVisibility` helper; the JSX reads it once at the top and threads flags into each panel.

**Post-answer correct** shows a single-line explanation + `Next question` — nothing else. **Post-answer wrong** shows Retry + Show a step + Show answer + `Explain another way` (relabelled AI enrichment; same Worker action, child-friendly copy).

**Error banner child-copy translation.** Pre-U3 the error panel rendered raw `grammar.error` string under a "Grammar command failed" adult heading. U3 follower added `translateGrammarSessionError(error)` + `GRAMMAR_SESSION_ERROR_COPY` mapping 8 known Worker error codes (`grammar_answer_required`, `grammar_session_stale`, `grammar_advance_not_ready`, `grammar_ai_unavailable_for_mini_test`, etc.) to child copy; unknown codes fall through to `"That did not save. Try again."`. Banner heading now reads "Something went wrong"; `role="alert"` preserved. Raw Worker strings never leak.

**Reviewer yield.** One BLOCKING (error banner child copy) + two testing gaps (post-answer-correct absence assertions + `role="alert"` presence assertion). Follower closed all three.

**Side observation — the visibility helper has dormant branches.** `grammarSessionSubmitLabel` covers `session.phase === 'retry'` → "Try again" and `awaitingAdvance` → "Saved", but Grammar's engine never emits either state today. Left in for future-proofing against a potential Spelling-style "Saved" acknowledgement state. Documented as advisory, not a bug.

### U4 — Mini-test strictness + post-finish review (PR [#200](https://github.com/fol2/ks2-mastery/pull/200))

**Files:** `src/subjects/grammar/components/GrammarSessionScene.jsx` (mini-test guard audit + `aria-pressed` on nav), `src/subjects/grammar/components/GrammarMiniTestReview.jsx` (new), `src/subjects/grammar/components/GrammarSummaryScene.jsx` (wires shared review component), `src/subjects/grammar/components/grammar-view-model.js` (add `Delayed feedback` + `Mini-set review` to forbidden terms), `tests/react-grammar-surface.test.js` (+U4 SSR), `tests/browser-react-migration-smoke.test.js` (stale label).

**What landed.** Before finish: timer + nav + Save-and-next + prompt + input. No feedback, no AI, no support, no worked solution, no similar problem, no explanation. Mini-test branch already produced all-false flags from U8's visibility helper; U4 audited each guard and added `aria-pressed` to the nav buttons (each button reflects its `question.answered` state; current question carries `aria-current="step"`).

**After finish.** Score card (`X of N correct` + percent). Per-question `<details>` rows with child-friendly `Your answer` + `Correct answer` + one-line `Why` + `Practise this later` button dispatching `grammar-focus-concept` with the missed question's concept id. Unanswered questions render as "Blank" (not "Wrong") — the Worker's Phase 2 stamp for unanswered is preserved all the way through the UI. Follower swapped the `<h3>` from "Mini-set review" → "Mini Test results" and dropped the "Delayed feedback" eyebrow → "Your results"; both retired strings went into `GRAMMAR_CHILD_FORBIDDEN_TERMS` so any future regression gets caught automatically.

**Reviewer yield.** Design-lens BLOCK-1 was "Delayed feedback" + "Mini-set review" (adult copy leaks into child UI, bypassing the forbidden-terms sweep because the strings weren't in the frozen list). Design-lens BLOCK-2 (mini-test summary CTA hierarchy) was explicitly deferred to U5 where the summary redesign would resolve it structurally.

**Side observation — adding a retired string to `GRAMMAR_CHILD_FORBIDDEN_TERMS` is now a one-line structural regression guard.** Future edits that accidentally reintroduce the copy fail the U10 sweep automatically. **Better to grow the frozen list than to delete strings and rely on manual vigilance.**

### U5 — Summary redesign (PR [#205](https://github.com/fol2/ks2-mastery/pull/205))

**Files:** `src/subjects/grammar/components/GrammarSummaryScene.jsx` (rewrite with mode detection), `src/subjects/grammar/module.js` (`grammar-open-analytics`, `grammar-close-analytics`, `grammar-practise-missed`, exported `grammarMissedConceptFromUi`), `src/subjects/grammar/components/GrammarPracticeSurface.jsx` (phase=analytics router), `src/subjects/grammar/metadata.js` (phase allowlist `'analytics'`), `tests/react-grammar-surface.test.js` (+U5 SSR including T1-T5 follower tests), `tests/subject-expansion.test.js` (summary matcher).

**What landed.** Two summary variants keyed on `summary.miniTestReview` presence + `summary.mode === 'satsset'`.

**Regular practice summary:** "Nice work — round complete" headline + 5 summary cards (Answered / Correct / Trouble / New secure / Monster progress) iterating only the 4 active monsters. Three primary actions: `Practise missed` (disabled when no missed concept — mirrors mini-test disabled pattern), `Start another round`, `Open Grammar Bank`. One secondary: `Grown-up view` with `aria-label="Open adult report"`.

**Mini-test summary:** Score card + two primary actions — `Fix missed concepts` (product-suggested path, promoted to primary in follower) and `Review answers` (scroll-to-review secondary) + `Grown-up view`. The existing `GrammarMiniTestReview` from U4 renders below.

**`grammarMissedConceptFromUi(ui)`** — exported helper shared between the dispatch handler in `module.js` and the JSX `disabled` computation in `GrammarSummaryScene.jsx`. Single source of truth for the missed-concept resolver: mini-test path iterates `summary.miniTestReview.questions`; regular-practice path iterates `analytics.concepts` looking for `weak` → `due` priority. The shared export guarantees disabled state and dispatch outcome cannot diverge.

**Reviewer yield.** 1 design advisory (variant flip) + 1 correctness medium (silent no-op on perfect round) + 4 testing gaps. Follower closed all six in commit `0c520bd`:
- `Fix missed concepts` flipped to primary (plan called it the product-suggested path).
- `Practise missed` on regular-practice gained `disabled: !regularMissedConceptId`.
- T1–T5 tests added: weak-beats-due precedence, zero-missed silent no-op, close-analytics dashboard fallback, disabled render assertion, variant/order structural check.

**Side observation — this unit resolved the U4 BLK-2 deferral structurally.** U4's follower had explicitly carried forward "CTA hierarchy for mini-test summary" as a U5 concern. U5's mode-detection + variant-tier split dissolved the problem without reopening U4.

### U6b — Writing Try scene (PR [#220](https://github.com/fol2/ks2-mastery/pull/220))

**Files:** `src/subjects/grammar/components/GrammarTransferScene.jsx` (new, 482 lines), `src/subjects/grammar/components/grammar-view-model.js` (transfer UI normalisation, relative-time formatter, per-tick label resolver), `src/subjects/grammar/module.js` (4 new UI actions + post-save clear sequence), `src/subjects/grammar/metadata.js` (phase allowlist `'transfer'` + `normaliseGrammarTransferUi`), `src/subjects/grammar/components/GrammarPracticeSurface.jsx` (phase=transfer router), `tests/grammar-transfer-scene.test.js` (new, 23+ scenarios).

**What landed.** The non-scored Writing Try scene. Three modes keyed on UI state (`ui.transfer = { selectedPromptId, draft, ticks }`):
1. **Pick-prompt.** Prompt cards from `rm.transferLane.prompts` — each shows `title`, `brief`, `grammarTargets` as concept badges, `checklist` preview, `Start writing` button.
2. **Write.** Textarea with live `X / 2000` counter (warn style + role="alert" when over-cap, Save disabled). Self-check fieldset with child-framing hint `"Tick what you tried — it is just a reminder for you. Nothing is marked."` Each checklist item maps to `Array<{ key, checked }>` with stable `key = \`check-${index}\``. Save dispatches `grammar-save-transfer-evidence` with `{ promptId, writing, selfAssessment }` — the authoritative Worker contract.
3. **Saved-history.** Latest entry shows `selfAssessment` ticks with the original checklist text (not raw `check-0` keys — follower fixed by threading `activePrompt?.checklist` into SavedHistory). History items omit ticks (Worker archive redaction asymmetry, intentional).

**Orphaned evidence handling.** If a learner has saved writing for a promptId no longer in the catalogue, the scene renders it in a separate "Saved for a retired writing prompt" section. No blank state, no error.

**Pending-state race fix.** Follower disabled the textarea + Change prompt button + checklist fieldset uniformly while `pendingSave` is true. Without that, a user tapping Change prompt mid-save would hit a race where `module.js`'s `onResolved` callback force-restored `selectedPromptIdBefore` and dragged them back. Structural fix; race impossible now.

**Error-code translation via U6a's map.** All four Worker error codes (`grammar_transfer_unavailable_during_mini_test`, `grammar_transfer_prompt_not_found`, `grammar_transfer_writing_required`, `grammar_transfer_quota_exceeded`) route through `translateGrammarTransferError` to UK-English child copy in `rm.error` with `role="alert"`. Follower replaced a tautological test (seeded the expected copy then asserted it rendered) with a real translator invocation.

**Non-scored invariant test.** `snapshotNonScoredGrammarState` helper deep-clones engine state minus `transferEvidence` + 5 explicit timestamp keys; deep-equals before/after. Covers mastery, retryQueue, misconceptions, recentAttempts, aiEnrichment, prefs, feedback, session, summary. If any save path started mutating mastery or emitting `reward.monster` events, the test fails loudly.

**Reviewer yield.** 3 BLOCKING + 2 testing advisories. All closed in follower `92b2629`.

**Side observation — the `latest` vs `history` selfAssessment asymmetry is load-bearing.** The Worker redacts selfAssessment from archived entries (privacy + storage efficiency). The client's SavedHistory intentionally mirrors this — history entries show only writing + timestamp, never ticks. Documented with a block comment so a future reader doesn't "fix" the asymmetry.

### U7 — Child/adult analytics split + confidence chips (PR [#222](https://github.com/fol2/ks2-mastery/pull/222))

**Files:** `src/subjects/grammar/components/GrammarAnalyticsScene.jsx` (heading rename, intro copy, `AdultConfidenceChip`, Parent Summary Draft framing), `tests/react-grammar-surface.test.js` (+U7 SSR including phase routing + inverse presence).

**What landed.** Analytics Scene heading renamed from "Grammar analytics" to "Grown-up view" (matches the summary-screen button). Intro: "Detailed Grammar progress for parents and teachers. Nothing here is a grade." `AdultConfidenceChip` renders the internal 5-label taxonomy (`emerging | building | needs-repair | consolidating | secure`) + sample size on every concept and question-type row — adult-level detail, not child-friendly translation. Parent Summary Draft now carries "Draft for review — not a grade." framing.

**Routing model locked as dual-entry.** Summary → Grown-up view button → `phase: 'analytics'` is the canonical opt-in. Dashboard `<details class="grammar-grown-up-view">` (from U1) stays as a closed-by-default escape hatch for parents who want to peek without completing a round. Phase router early-returns on `'analytics'`, so no double-render when the phase is active. Tests verify both entry paths.

**Worker-client drift prevention.** `mergeConcepts` already spreads Worker fields via `...workerConcept`, so `confidence: { label, sampleSize, intervalDays, distinctTemplates, recentMisses }` passes through without touching `normaliseGrammarReadModel`. No plumbing work needed — Phase 2's Worker projection shape already covered the client need.

**Reviewer yield.** Both reviewers APPROVED first round, zero BLOCKING findings. Two low-confidence design advisories (plan said "3 of last 12" copy but ship says "3 attempts" — shipped copy is simpler for parents) and two correctness residual risks (out-of-taxonomy label fallback; zero-sample valid label edge case). Merged without follower.

**Side observation — U7 was the smallest Phase 3 diff.** 348 additions / 8 deletions. Because U1 had scaffolded the `<details>` gate, U5 had added the phase+action, and Phase 2 had shipped the confidence projection, U7 just had to enrich the adult scene. Good compounding.

### U9 — Visual + accessibility pass (PR [#226](https://github.com/fol2/ks2-mastery/pull/226))

**Files:** `src/subjects/grammar/components/GrammarTransferScene.jsx` (`data-autofocus="true"` on write-mode textarea), `src/subjects/grammar/components/GrammarConceptBankScene.jsx` + `GrammarTransferScene.jsx` + `GrammarPracticeSurface.jsx` (aria-label on back buttons), `tests/react-accessibility-contract.test.js` (+9 Grammar scenes).

**What landed.** A hygiene pass, not a rewrite. Audit finding was that most aria was already in place across U1–U7, with three gaps: Writing Try write-mode textarea lacked `data-autofocus` parity with the session branch; three icon+text back buttons (bank, transfer, analytics) had no explicit `aria-label` despite being the sole navigation affordance per scene.

**Test additions.** 9 new scene entries in the app-level accessibility contract covering: dashboard labels + single-primary contract, bank chip/search/modal/close semantics, session textarea autofocus + feedback live regions, session error `role="alert"`, mini-test nav `aria-current` / `aria-pressed`, Writing Try fieldset/legend + checklist `<label>` wrappers, summary Grown-up `aria-label="Open adult report"`, analytics labelled back button, and a `.btn.xl` CSS-rule assertion as SSR-safe tap-target proxy (`min-height: 48px ≥ 44px`).

**SSR blind-spot header** in each new test file explicitly documents what SSR cannot test: pointer capture, focus motion, IME, scrollIntoView, animation frames, `requestIdleCallback`, `MutationObserver`, timer drift. Mirrors Phase 2 U4's pattern — any future reader understands why these branches aren't asserted and shouldn't over-trust the coverage.

**Reviewer yield.** Both reviewers APPROVED first round. Three low-confidence advisories (redundant aria-label on analytics back button, untested text-input autofocus branch, single-primary coverage breadth gap) — none are bugs. Merged without follower.

**Side observation — the `.btn.xl` CSS-rule assertion is a clever SSR-safe proxy for touch-target size.** Regex-matches `min-height:\s*(\d+)px` inside the `.btn.xl {}` block, asserts ≥ 44px. Can't evaluate CSS without a DOM, but can assert the declared rule. Brittle to cascade-reordering refactors, but documented in the SSR blind-spot header so future readers know the limitation.

### U10 — Regression + absence + gate fixture (PR [#229](https://github.com/fol2/ks2-mastery/pull/229))

**Files:** `tests/fixtures/grammar-phase3-baseline.json` (12 unit rows + 3 invariant rows), `tests/grammar-phase3-child-copy.test.js` (23 tests, 9 phases × 18 terms + catch-all + R7 inverse), `tests/grammar-phase3-roster.test.js` (14 tests), `tests/grammar-phase3-non-scored.test.js` (2 tests, byte-equal snapshot invariants), `tests/helpers/grammar-phase3-renders.js` (helper with frozen 10-phase allowlist), `tests/grammar-functionality-completeness.test.js` (+4 gate validator tests).

**What landed.** The Phase 3 completeness gate. Every load-bearing UX invariant is now machine-enforced.

**Baseline fixture (`grammar-phase3-baseline.json`)** records each of the 12 units + 3 cross-cutting invariants (roster, child-copy gate, non-scored delta). Every row carries `resolutionStatus: "completed"`, `ownerUnit`, `landedIn: "PR #<number>"`, `supportingTests: [...paths on disk]`, `plannedReason`. The gate validator (extended in `grammar-functionality-completeness.test.js`) asserts zero `planned` rows, `PR #<number>` format, and that every cited supportingTests file exists. A regression PR that stomps a test file would fail the gate without any other assertion firing.

**Forbidden-terms sweep (`grammar-phase3-child-copy.test.js`).** Iterates `GRAMMAR_CHILD_FORBIDDEN_TERMS` (18 entries, imported from the frozen fixture) across 9 child phases (`dashboard`, `session-pre`, `session-post-correct`, `session-post-wrong`, `mini-test-before`, `mini-test-after`, `summary`, `bank`, `transfer`). Plus a whole-word `/\bWorker\b/i` catch-all. Plus inverse-presence on `analytics` — `Evidence snapshot`, `Stage 1`, `Bellstorm bridge`, `Reserved reward routes` MUST be present in the adult view (R7 preservation).

**Helper with frozen allowlist (`tests/helpers/grammar-phase3-renders.js`).** `renderGrammarChildPhaseFixture(phaseName, overrides)` throws on unknown phase name. Prevents silent typo-skip — a test author who passes `'dashbord'` gets a hard error, not a silent pass. Per-phase scopers exclude the adult grown-up-view disclosure from the child sweep (it's DOM-present via `<details>` but collapsed by default, so visible-by-default assertions filter it out).

**Non-scored invariant (`grammar-phase3-non-scored.test.js`).** Seeds a learner state with populated `mastery`, `retryQueue`, `misconceptions`, active `session`. Dispatches `grammar-save-transfer-evidence` end-to-end through the real Worker. Deep-equals state before/after via helper that strips `transferEvidence` + 5 timestamp keys. Asserts positive delta on `state.transferEvidence[promptId]`. Asserts Worker response events list contains zero `reward.monster`, `grammar.answer-submitted`, `grammar.concept-secured`, `grammar.misconception-seen`. Catches any future Worker code path that accidentally mutates scored state.

**Reviewer yield.** Single testing reviewer APPROVED with two advisory findings about scoper regex brittleness — both low-confidence, not bugs. Merged first round.

**Side observation — the gate fixture is its own durable record.** Any future review agent inspecting Grammar finds the U0–U10 completion table machine-readable, with PR numbers and supporting-test paths. The drift-hiding failure mode Phase 2 §4.5 warned about ("research agents can carry prior-document errors forward") is structurally prevented: the test asserts every path exists on disk.

---

## 3. SDLC cycle discipline

The Phase 2 report §3 documented the per-unit cycle. Phase 3 ran the same discipline at higher cadence (12 units in ~5h vs 8 units in Phase 2) without sacrificing rigour.

### Cycle structure

Every unit followed:

1. **Worker dispatched** with a focused brief: branch from latest `main`, read the plan's unit block + dependencies, implement, test, open PR. Never merge.
2. **2–3 reviewers dispatched in parallel** by unit type:
   - **Always-on:** `ce-correctness-reviewer`, `ce-testing-reviewer`.
   - **For UI/UX units (U1, U2, U3, U4, U5, U6b, U7, U9):** `ce-design-lens-reviewer`.
   - **For migration/data units (U0):** `ce-data-migration-expert`.
   - **For API-contract units (U6a):** `ce-api-contract-reviewer`.
3. **If any BLOCKING finding:** dispatch **a single review-follower worker** with the consolidated list of BLOCKING + meaningful advisories. Follower commits, pushes, posts PR comment, does NOT merge.
4. **Re-reviewer dispatched** to verify findings closed on the follower diff only. Returns APPROVE/REQUEST_CHANGES.
5. **Scrum-master (this session) merges via `gh api`** + deletes remote branch. Never edits code.
6. **Next unit** starts from updated `main`.

### Findings aggregate

| Severity | Count across 12 units | Resolved before merge |
|---|---|---|
| BLOCKING | 7 | Yes — in follower cycles |
| ADVISORY | ~35 across all review passes | Load-bearing ones addressed; cosmetic ones noted |
| NITPICK | ~18 | Applied when trivial, noted otherwise |

### Reviewer yield observations — what human reviewers would not have caught

- **U0 migration-safety agent traced the writer self-heal correctness across three layers.** The asymmetric cluster remap (Grammar) vs one-way collapse (Punctuation precedent) was a subtle difference — a human reviewer skimming the diff would likely have approved assuming the Punctuation pattern applied directly. The agent ran the event-emission trace and confirmed the seed path was silent on emission while persistent on state.
- **U6a API-contract agent caught three planning-document errors before code shipped.** The plan originally said `{ promptId, writing, checklist }` payload, `{ id, title, theme, checklist }` prompt shape, and only one error code. Agent read the Worker source and flagged all three as BLOCKING against the plan text. Fixed in the plan before U6a started implementation. This prevented a full round of silent data loss (`checklist` → `selfAssessment` rename alone would have produced saves with empty ticks).
- **U1 testing agent caught a stale env-gated browser smoke test.** `KS2_BROWSER_SMOKE=1 npm test` wasn't part of default CI, so the removed `Grammar retrieval practice` copy would have bit-rotted silently. Human reviewer reading the PR description ("1421 pass / 1 pre-existing failure") wouldn't have noticed.
- **U3 testing agent caught a tautological error-banner test.** First-round error-code test seeded `rm.error = GRAMMAR_TRANSFER_ERROR_COPY[code]` then asserted that same string rendered. Passed the test, didn't prove the mapping. Agent flagged the shape; follower switched to routing through the real `translateGrammarTransferError` function.
- **U4 design-lens agent caught two adult strings outside the forbidden-terms list.** `"Delayed feedback"` + `"Mini-set review"` were live in `GrammarMiniTestReview.jsx`, passed `GRAMMAR_CHILD_FORBIDDEN_TERMS` because the list didn't include them yet. Agent's kudo closed the gap: "add the strings to the frozen list rather than delete them from JSX and rely on vigilance."
- **U5 correctness agent caught a silent no-op on the regular-practice `Practise missed` button.** Perfect-round learner would see an actionable button that dispatched a no-op. Agent traced through `grammarMissedConceptFromUi` fallback to `analytics.concepts` and found the `|| fallback` branch had no test. Follower added `disabled: !regularMissedConceptId` mirroring the mini-test pattern, plus a test.
- **U6b correctness agent found a race condition in mid-save prompt switching.** `onResolved` force-restored `selectedPromptIdBefore` regardless of what the user did during the RTT. Agent traced the timing: user taps Change prompt → save resolves → `onResolved` drags them back. Fix was structural (disable the button during pending), not conditional logic.

### What the reviewer cycle still doesn't catch

- **Whether shipped copy matches the plan's suggested wording.** Plan said "3 of last 12" for confidence chip; implementation shipped "3 attempts" (simpler for parents). The plan prose and the implementation diverged — neither reviewer flagged it as wrong, just as an observation. Judgement call lives with the implementer and a final read-through.
- **Whether a deferred scope boundary is the right boundary.** U4 BLK-2 was explicitly deferred to U5. No reviewer said "don't defer" or "the deferral is unsafe." That was an implementer judgement call.
- **Whether the plan itself asserts the right invariant.** If the plan is wrong about a product decision, reviewers won't catch it — they check code against plan, not plan against reality. The product conversation with James (specifically the 7→4+3 roster decision superseding origin R10/R11) was the only way to course-correct on plan-level errors.

---

## 4. Side observations (cross-cutting)

### 4.1 Front-loading the view-model was the highest-leverage architectural call

U8 shipped as the second unit (after U0's platform foundation). Every subsequent JSX unit imported from `session-ui.js` and `components/grammar-view-model.js`. Five scattered visibility conditions in U3 collapsed to one `grammarSessionHelpVisibility` call. Nine child phases in U10's absence sweep iterate one frozen `GRAMMAR_CHILD_FORBIDDEN_TERMS` array. Adding a new forbidden term or a new child phase is a one-line change, not an N-file edit.

The trade-off is that U8 had to be comprehensive before any scene used it. Writing 13 view-model exports + 6 session-ui exports before any JSX existed felt premature. But the alternative — each JSX unit inventing its own helpers — would have led to drift within a week. **Punctuation P2 followed the same pattern and shipped; that precedent justified the upfront cost.**

### 4.2 The follower cycle paid for itself on 7 of 12 units

Every follower cycle closed BLOCKING findings that the first-round reviewers genuinely surfaced. None of the followers was busywork. U1's featured flag + empty-state + Concordium creature image were design blockers that would have shipped an OK-not-great dashboard. U2's hyphen_ambiguity example swap + search-aware empty state were real UX bugs. U3's child-copy error banner was a privacy/UX leak. U4's adult-string sweep was a forbidden-terms blind spot that would have survived multiple refactors. U5's Fix missed concepts variant flip was a load-bearing CTA hierarchy fix. U6b's mid-save race was a real bug.

**Five of seven follower cycles also included new test scenarios**, not just fixes. The testing reviewer's role in catching underspecified test coverage was disproportionately high-value: followers regularly added 3–5 new tests that closed silent-regression gaps.

### 4.3 Reviewer specialisation beats generalist review on complex diffs

U0 was the clearest case. Three specialist reviewers (migration-safety, correctness, testing) each surfaced different concerns. Migration-safety traced the writer self-heal invariant across layers — that's not correctness-reviewer territory. Correctness traced malformed-input paths through `normaliseGrammarRewardState` — that's not migration-safety's focus. Testing found two load-bearing coverage gaps (JSX boundary + cross-subject callsite) — neither specialist would have structured tests the same way.

U6a's API-contract reviewer caught contract-mismatch against the Worker source that the plan itself was wrong about — no other reviewer shape would have read the Worker as source-of-truth for field names and payload keys.

**Dispatching 3 parallel reviewers costs tokens but structurally produces better reviews.** The parallel dispatch means concerns don't cross-pollinate into consensus mush; each reviewer reports independently.

### 4.4 Worker+client drift is detectable only with fixture-driven contract tests

U6a's drift-detection test iterates every key the Worker emits under `transferLane` at every nesting level. If a future Worker change adds a field, the client test fails unless the normaliser passes it through or explicitly allow-lists. This is the *only* mechanism that catches silent drift between the two codebases. No human review process scales to cross-repo field-level drift detection.

U10's baseline-gate fixture is the same idea at the unit level: every Phase 3 unit's supporting tests and PR number are machine-readable. A regression PR that deletes a test file fails the gate; a plan change that renames a file fails the gate; a reviewer agent inspecting Grammar finds the resolved invariants in one JSON file.

### 4.5 The ContentReleaseId freeze held

No Phase 3 unit touched marking behaviour, `content.js` templates, per-template `answerSpec` declarations, or oracle fixtures. The `grammar-legacy-reviewed-2026-04-24` release id is unchanged on main. Oracle replay at `tests/fixtures/grammar-legacy-oracle/legacy-baseline.json` remains byte-identical. The Phase 2 U5 decision to defer per-template `answerSpec` to a content-release PR paid off again — every Phase 3 unit could check "does this change marking behaviour?" and answer "no" with confidence.

### 4.6 English Spelling parity held

AGENTS.md line 14: *"Do not regress English Spelling parity unless James explicitly accepts the trade-off."* Phase 3 touched two Spelling files: `src/platform/game/mastery/spelling.js` lines 148 and 177, where `monsterSummaryFromState` and `monsterSummaryFromSpellingAnalytics` now route through `normaliseGrammarRewardState` so pre-flip Glossbloom-caught learners still surface Concordium on the home meadow (U0 cross-subject audit). No Spelling JSX, no Spelling CSS, no Spelling module changes. All Spelling tests continue to pass. Parity preserved.

### 4.7 The "Grow Concordium" creature image was a U1 follower-cycle fix that doubled the visual-identity win

Original U1 dashboard rendered "Concordium progress 0/18" as a raw status line next to the Today cards. Design-lens reviewer flagged it as cognitive-load confusing for a 9-year-old who has no context for what Concordium is. Follower swapped the label to "Grow Concordium" and added a creature image via the existing `grammarMonsterAsset('concordium', 320)` helper. The fraction stayed, but now it's anchored to a visible creature the child is growing — not a disembodied metric. This was a one-liner in JSX that transformed the dashboard from "report card" feel to "pet you raise" feel.

### 4.8 U7's Parent Summary Draft "not a grade" framing is a small but important positioning bet

The Parent Summary Draft is adult-only copy that summarises the learner's progress for a parent to review. Pre-U7, it read as a report. U7 added the one-line framing: `"Draft for review — not a grade."`. This explicitly sets parent expectations that the system isn't grading their child — it's flagging patterns for a human adult to interpret. Aligns with the Phase 1 requirements doc R17: *"Learner-facing copy may celebrate creatures, but must not imply that monster progress is a substitute for secured Grammar evidence."* — extended in Phase 3 to apply to parent copy too.

### 4.9 Scoper regex brittleness is a latent risk across U10 tests

The Phase 3 absence tests use regex scopers to extract "dashboard HTML" vs "analytics HTML" vs "session HTML" from the full SSR render. The regexes rely on exact DOM sibling order (e.g., `<section class="grammar-dashboard">...</section><details class="grammar-grown-up-view">`). A future refactor that inserts a whitespace node or wrapper `<div>` between these siblings could silently fall through to a less-scoped match — potentially masking an adult-copy leak. The testing reviewer flagged this; the hard mitigation would be switching the scopers to throw on no-match rather than fall back to full HTML.

**Documented as a known risk. Future U11+ (or a hygiene PR) should harden the scopers** when a real refactor forces the issue.

### 4.10 The pre-existing `grammar-production-smoke` failure remained unaddressed through the phase

`tests/grammar-production-smoke.test.js` has a forbidden-keys-leak failure where `grammar.startModel.stats.templates` contains a server-only field that leaks to the client. Reproduced on every Phase 3 worker's `origin/main` baseline. Unrelated to any Phase 3 unit's scope. Phase 3 workers consistently flagged it as pre-existing in PR bodies.

**Belongs in a dedicated follow-up PR.** The production-smoke test asserts the client read-model doesn't carry server-only fields; fixing it requires either extending `normaliseGrammarReadModel` to strip the offending key or updating the Worker's projection to not emit it. Out of Phase 3 scope but worth surfacing for next-steps.

---

## 5. Deferred work (explicitly out of scope)

1. **Fix the pre-existing `tests/grammar-production-smoke.test.js` failure** — `grammar.startModel.stats.templates` forbidden-keys leak. Belongs in a small hygiene PR.
2. **Scoper hardening in `tests/helpers/grammar-phase3-renders.js`** — switch all five scoper functions to throw on no-match rather than fall back to full-HTML. Prevents silent degradation if future refactors change DOM sibling order. See §4.9.
3. **Parent/Admin hub rendering of Grammar confidence labels** — the Worker emits `confidence: { label, sampleSize, ... }` on every concept and question-type entry. The Grammar Analytics Scene surfaces them in the adult Grown-up view. Parent Hub / Admin surfaces that consume `buildGrammarLearnerReadModel` don't yet render the labels. Separate UI task.
4. **Content expansion for thin concept pools (Phase 2 I4)** — 6 concepts at the 2-template floor (`pronouns_cohesion`, `formality`, `active_passive`, `subject_object`, `modal_verbs`, `hyphen_ambiguity`). The `explain` question type at 2 templates is also thin. Content-release PR with paired `contentReleaseId` bump.
5. **Per-template `answerSpec` declarations** — 20 constructed-response templates still use the `markStringAnswer` adapter path. Content-release PR.
6. **Playwright / real-browser coverage for Grammar scenes** — SSR + `node:test` covers structure; interactive behaviours (focus motion, pointer capture, IME, scrollIntoView, animation frames, modal focus-trap tab cycle) remain manual QA gates. If the repo-wide decision to adopt Playwright lands, Grammar scenes are ready targets.
7. **U6b orphaned-evidence interaction** — child can currently see "Saved for a retired writing prompt" cards but can't delete them. Product decision pending.
8. **Out-of-taxonomy confidence-label fallback in `AdultConfidenceChip`** — if Worker adds a 6th confidence label before client updates, chip silently renders `emerging` for the unknown label. Low-risk because Worker and client constants are manually synchronised today. A shared constant in `shared/` would prevent drift.
9. **Browser-smoke test refresh** — `tests/browser-react-migration-smoke.test.js` runs only under `KS2_BROWSER_SMOKE=1`. Updated by U1 follower. If CI ever enables the flag, double-check no other stale assertion remains.
10. **Hero copy final sign-off** — `GRAMMAR_DASHBOARD_HERO.title = 'Grammar Garden'` and subtitle shipped. James may want to A/B or iterate with "Clause Conservatory" (the origin requirements region name) or another variant. Single-constant change.

---

## 6. Verification evidence (reproducible)

### Full Grammar test suite (post-U10)

```bash
node --test tests/grammar-*.test.js tests/worker-grammar-subject-runtime.test.js tests/react-grammar-surface.test.js tests/react-accessibility-contract.test.js
```

Grammar-scoped test count: **~450 tests across 15 files** (up from Phase 2's 201 across 12 files).

### Per-unit test files

| Unit | Primary test file | New/extended count |
|---|---|---|
| U0 | `tests/grammar-monster-roster.test.js` (new) + `tests/grammar-rewards.test.js` (ext) | 33 new + regression extensions |
| U8 | `tests/grammar-ui-model.test.js` (new) | 70 |
| U6a | `tests/grammar-transfer-lane.test.js` (ext) + `tests/react-grammar-surface.test.js` (ext) | 14 new |
| U1 | `tests/react-grammar-surface.test.js` (ext) + `tests/subject-expansion.test.js` (ext) + `tests/browser-react-migration-smoke.test.js` (updates) | +10 SSR + 1 matcher |
| U2 | `tests/react-grammar-surface.test.js` (ext) + `tests/grammar-ui-model.test.js` (ext) | +13 SSR + 8 view-model |
| U3 | `tests/react-grammar-surface.test.js` (ext) | +4 SSR + role=alert test + absence sweep |
| U4 | `tests/react-grammar-surface.test.js` (ext) | +6 SSR |
| U5 | `tests/react-grammar-surface.test.js` (ext) | +10 SSR + T1-T5 follower |
| U6b | `tests/grammar-transfer-scene.test.js` (new) | 23+ |
| U7 | `tests/react-grammar-surface.test.js` (ext) | +11 SSR |
| U9 | `tests/react-accessibility-contract.test.js` (ext) | +9 scene entries |
| U10 | `tests/grammar-phase3-child-copy.test.js` (new), `tests/grammar-phase3-roster.test.js` (new), `tests/grammar-phase3-non-scored.test.js` (new), `tests/helpers/grammar-phase3-renders.js` (new), `tests/grammar-functionality-completeness.test.js` (ext) | 54 total + gate validator |

### Full-suite result

```
ℹ tests 2196
ℹ pass 2194
ℹ skip 1
ℹ fail 1     ← tests/grammar-production-smoke.test.js (pre-existing on main, unrelated, see §4.10)
```

### Merged PR sequence

| PR | Unit | Title | Merge commit | Additions / Deletions |
|---|---|---|---|---|
| [#184](https://github.com/fol2/ks2-mastery/pull/184) | U0 | Roster 4+3 + writer self-heal + codex landmines | `4216c11` | +1965 / -71 |
| [#186](https://github.com/fol2/ks2-mastery/pull/186) | U8 | View-model layer (session-ui + grammar-view-model) | `ad72b8c` | +1331 / -0 |
| [#191](https://github.com/fol2/ks2-mastery/pull/191) | U6a | transferLane client plumbing + save-transfer-evidence dispatcher | `046d103` | +620 / -3 |
| [#192](https://github.com/fol2/ks2-mastery/pull/192) | U1 | Child dashboard (4 primary modes + Today cards + More practice) | `8335203` | +521 / -309 |
| [#195](https://github.com/fol2/ks2-mastery/pull/195) | U2 | Grammar Bank scene + concept detail modal | `fdf15d4` | +1345 / -34 |
| [#197](https://github.com/fol2/ks2-mastery/pull/197) | U3 | Session redesign (one task, post-answer help only) | `e4264a7` | +387 / -38 |
| [#200](https://github.com/fol2/ks2-mastery/pull/200) | U4 | Mini-test strictness + post-finish review | `88437fb` | +435 / -59 |
| [#205](https://github.com/fol2/ks2-mastery/pull/205) | U5 | Summary redesign (5 cards + mini-test score + Grown-up view) | `a06e431` | +788 / -53 |
| [#220](https://github.com/fol2/ks2-mastery/pull/220) | U6b | Writing Try scene (non-scored writing with saved history) | `69d205c` | +1471 / -29 |
| [#222](https://github.com/fol2/ks2-mastery/pull/222) | U7 | Child/adult analytics split with confidence chips | `8ef234c` | +348 / -8 |
| [#226](https://github.com/fol2/ks2-mastery/pull/226) | U9 | Visual + accessibility pass across Phase 3 scenes | `e519d96` | +243 / -0 |
| [#229](https://github.com/fol2/ks2-mastery/pull/229) | U10 | Phase 3 regression + absence + gate fixture | `576e00f` | +1127 / -0 |

**Total: +10,581 / -604 lines** across 12 PRs. ~91% net-new code.

### Phase 3 baseline gate state

```
tests/fixtures/grammar-phase3-baseline.json
  phase3[].resolutionStatus all === "completed"
  phase3[].landedIn all match /^PR #\d+$/
  phase3[].supportingTests all exist on disk
  gate: PASSED
```

---

## 7. Next steps

The immediate post-Phase-3 priorities, in order of value-per-effort:

1. **Fix the pre-existing `grammar-production-smoke` failure** (§4.10, §5 item 1). Small diff. Removes the one persistent red test on `main`.
2. **Harden U10 scopers** (§4.9, §5 item 2). Prevents silent degradation of the gate under future DOM refactors. Small, focused hygiene PR.
3. **Parent/Admin hub confidence labels** (§5 item 3). Surfaces Phase 2's projection work to adult hubs. Medium UI unit.
4. **Hero copy iteration** (§5 item 10). Potential A/B with James. Single-constant change, zero risk.
5. **Content expansion for thin concept pools** (§5 item 4). Requires `contentReleaseId` bump and paired oracle-fixture refresh. Dedicated content-release plan.
6. **Per-template `answerSpec` declarations** (§5 item 5). Content-release plan. May pair with item 5.
7. **Playwright adoption** (§5 item 6). Repo-wide decision — has already begun via `feat(playwright): U5 adopt @playwright/test + golden-path scenes (#224)` on `main`. Grammar scenes can join when the adoption broadens.

---

## 8. Closing note

Phase 2 made the Grammar engine credible. Phase 3 made the Grammar product usable.

A KS2 learner can now start Grammar without encountering a single adult/developer term. Smart Practice is the obvious default. Grammar Bank is as useful as Spelling Word Bank. Sessions show one task at a time with graduated support only after a genuine first attempt. Mini-tests feel like tests. Summaries feel like a celebration that points to what to do next. Writing Try ships the non-scored paragraph application that Phase 2 intentionally deferred. Adults get a separate, explicitly-framed diagnostic view that doesn't pretend to be a grade.

The Phase 3 gate (`tests/fixtures/grammar-phase3-baseline.json` + `tests/grammar-phase3-*.test.js`) now machine-enforces every load-bearing invariant. Any future regression — adult copy leaking into child screens, reserved monsters surfacing in learner UI, Writing Try accidentally mutating scored state, Worker-client read-model drift on the transfer lane — trips the gate at PR time, not in a child-facing production render.

The plan (`docs/plans/2026-04-25-004-feat-grammar-phase3-ux-reset-plan.md`) is now `status: completed` (to be flipped in a tiny follow-up PR). Twelve implementation units shipped, each with its own PR, review history, follower (where warranted), and merge commit. The SDLC discipline that Phase 2 established scaled cleanly to Phase 3's larger surface area.

Grammar Phase 3 is done.

---

**Report filed by:** autonomous scrum-master orchestration, 2026-04-26
**Plan author:** `/ce-plan` session 2026-04-25
**Implementation:** 12 independent workers, 30+ reviewer passes, 7 follower cycles
**Total end-to-end time:** ~5h 20min from U0 merge to U10 merge
