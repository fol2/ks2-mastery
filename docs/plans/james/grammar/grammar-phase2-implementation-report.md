# Grammar Perfection Pass — Implementation Report

**Date:** 2026-04-25
**Plan:** `docs/plans/2026-04-25-002-feat-grammar-perfection-pass-plan.md`
**Review input:** `docs/plans/james/grammar/grammar-phase2.md`
**Status:** Complete. All 8 units shipped to `main`.

---

## 1. Executive summary

The Grammar Phase 2 review (`grammar-phase2.md`) raised 9 concerns about fairness, depth, and behavioural proof after the Grammar Mastery Region (U1-U10) and Grammar Functionality Completeness (U1-U8) lines had already landed. The review explicitly noted it was a code-and-doc inspection, not a test run.

This implementation pass routed those 9 concerns into 8 focused implementation units (U1-U8), verified each issue against the live codebase during Phase 0 research, and landed each unit through a strict SDLC cycle: **PR → independent reviewer (pr-review-toolkit:code-reviewer subagent) → review-follower addresses findings → re-reviewer check → merge on approval → next unit.**

### Headline outcomes

- **8 PRs merged to `main`** (#144, #146, #148, #150, #153, #156, #158, #160).
- **7 of 9 review issues resolved** (I1, I2, I3, I5, I6, I8, I9). I7 was already-fixed in prior work (pre-existing `NO_STORED_FOCUS_MODES` / `NO_SESSION_FOCUS_MODES` plumbing — review agent had missed it because it had not run the tests). I4 (content expansion) was deferred to a separate content-release plan with per-QT and per-concept floors pinned in a baseline fixture.
- **No `contentReleaseId` bump** was required; marking behaviour preserved against the pinned legacy oracle fixtures.
- **Zero blocking findings at merge time** across 16 review passes; several blocking findings were caught during follower cycles and resolved before re-review.
- **201 grammar tests green** across engine, selection, attempt-support, answer-spec, confidence, transfer-lane, completeness, worker-runtime, and react-surface suites.

---

## 2. Unit-by-unit summary

### U1 — Perfection-pass baseline (PR [#144](https://github.com/fol2/ks2-mastery/pull/144))

**Files:** `tests/fixtures/grammar-functionality-completeness/perfection-pass-baseline.json` (new), `tests/grammar-functionality-completeness.test.js` (extended), `docs/grammar-functionality-completeness.md` (Perfection Pass section), mastery-region plan live-checklist pointer.

**What landed:** A durable baseline fixture recording the 9 review issues (I1-I9) with resolution status (`planned` / `completed` / `already-fixed` / `deferred`), owner unit, planning reason, and (where applicable) supporting-test references. The fixture also pinned the per-question-type distribution (`classify 1, identify 7, choose 17, fill 3, fix 11, rewrite 6, build 4, explain 2 = 51`) and per-concept template floors as hard invariants. The completeness test enforces that every `planned` row references its owner unit in the plan file, and that `already-fixed` rows cite existing test files on disk.

**Side observation:** The review doc had stated per-QT counts as `identify 6, choose 16` — incorrect. The research agent had also duplicated this miscount. Direct inspection of `content.js` via a Node one-liner showed the actual counts were `identify 7, choose 17`. The plan file was corrected during the U1 follower cycle (reviewer A1 finding) to match the live counts the fixture pins.

### U2 — `buildGrammarPracticeQueue` pure function (PR [#146](https://github.com/fol2/ks2-mastery/pull/146))

**Files:** `worker/src/subjects/grammar/selection.js` (new, ~290 lines), `worker/src/subjects/grammar/engine.js` (wiring), `tests/grammar-selection.test.js` (new, 12 tests).

**What landed:** Template selection extracted from `weightedTemplatePick` into an exported, seed-deterministic pure function with explicit weight constants. Fairness signals added: due (+3.0), weak (+2.2), recent-miss (×1.6), question-type weakness (×1.3), template freshness (÷1.15-2.2), concept freshness (÷1.1), focus (×1.8), generative (×1.15), new concept (+0.8). Sibling `buildGrammarMiniPack` adds quota-aware balancing for strict mini-tests (distinct-template-first + `ceil(size/3)` question-type cap + focus-saturation seed phase).

**Engine integration:** `weightedTemplatePick` now delegates to `buildGrammarPracticeQueue({ size: 1 })`. `buildGrammarMiniSet` and `buildStrictMiniTestItems` delegate to `buildGrammarMiniPack`. Outer signatures stable so every existing call site works unchanged.

**Side observation — test design lesson:** The first fairness test attempted `assert.ok(duePicks >= 2)` for a single seed, which turned out to be brittle (different weight tuning shifts which specific seed lands on adverbials). Rewrote to aggregate across 8 seeds comparing `due-now` vs `not-due` scenarios for the same concept, which tests the *principle* (due outranks equivalent non-due) rather than a specific seed outcome. This is a reusable pattern for testing seeded probabilistic selection.

**Side observation — API shape simplification:** Plan specified `buildGrammarPracticeQueue({ mode, focusConceptId, dueQueue, mastery, recentEvents, questionTypeStats, seed, now })`. Implementation simplified to `{ mode, focusConceptId, mastery, recentAttempts, seed, size, now }` because `dueQueue` and `questionTypeStats` are projectable from `mastery.concepts.dueAt` and `mastery.questionTypes.strength`. The reviewer explicitly approved this as a principled reduction aligned with the plan's own decision that `recentEvents` would come from `state.recentAttempts`.

### U3 — Item-level support contract + three-layer migration (PR [#148](https://github.com/fol2/ks2-mastery/pull/148))

**Files:** `worker/src/subjects/grammar/attempt-support.js` (new), `worker/src/subjects/grammar/engine.js` (wiring across start-session, submit-answer, normalisation, event emission), `worker/src/subjects/grammar/read-models.js` (`recentActivityFromAttempts` exposes new fields), 2 existing tests updated to match v2 contract, `tests/grammar-attempt-support.test.js` (new, 20 tests).

**What landed:** The single most consequential unit. Three-layer migration so state, events, and in-flight sessions stay consistent:

1. **State reload:** pre-U3 attempts in `state.recentAttempts` pass through `normaliseStoredAttempt` on load, which calls the shared `deriveAttemptSupport(mode, supportLevel, attempts)` function to synthesise the new fields (`firstAttemptIndependent`, `supportUsed`, `supportLevelAtScoring`) from the legacy fields.
2. **Event emission:** `grammar.answer-submitted` events dual-write both legacy (`supportLevel`, `attempts`) and new fields plus `supportContractVersion: 2`. An event-log replayer can project pre-U3 events through the same `deriveAttemptSupport` helper and get identical triples to post-U3 events.
3. **In-flight sessions:** `session.supportContractVersion` stamped at `start-session` time. `supportLevelForSession(mode, prefs, session)` reads the stamped version, not the current module behaviour. Pre-U3 sessions (v1) keep the old Smart + `allowTeachingItems` → level 1 promotion until they end; post-U3 sessions (v2) do not promote. A pre-deploy session cannot drift mid-flight.

**Contract v2 semantic fix:** Under v1, Smart Review + `allowTeachingItems: true` forced `session.supportLevel = 1` for every attempt regardless of whether the learner actually requested faded/worked support. An independent first-attempt correct answer got quality 3.4 instead of 5. U3 changes `supportLevelForSessionWithContract('smart', { allowTeachingItems: true })` to return `0` under v2. Mode-based promotion (`worked`→2, `faded`→1) is unchanged. In-session repair escalation via `useFadedSupport` / `showWorkedSolution` still bumps `session.supportLevel` mid-session.

**`supportUsed` values:** `'none' | 'nudge' | 'faded' | 'worked' | 'ai-explanation-after-marking'`. The `'ai-explanation-after-marking'` attribution is critical: post-marking AI enrichment never reduces mastery gain, but still records that an explanation was shown.

**Reviewer caught one blocking gap (B1):** The mini-test session (`satsset` branch at `engine.js:951`) constructs its own session object. Initial implementation forgot to stamp `supportContractVersion` on it, and `finishMiniTest` was calling `applyGrammarAttemptToState` without passing `mode`, so every mini-test attempt would have been emitted as modeless. Follower commit fixed both at the single call site.

**Side observation — replay-equivalence test strengthening:** First version of the replay test called `deriveAttemptSupport` on a pre-U3 shape and a post-U3 shape and asserted they produced the same triple — but that only proved derivation was self-consistent, not that a real projector would agree. Reviewer A1 called this out. Follower version runs both shapes through the real `normaliseServerGrammarData` (which is the actual load-time path) and deep-equals the projected fields. That is the load-bearing contract.

**Side observation — the "faded" fallback for legacy Smart + supportLevel=1:** Initially unclear whether a pre-U3 attempt stamped with `supportLevel: 1` under Smart + `allowTeachingItems` should map to `supportUsed: 'nudge'`, `'faded'`, or `'none'`. Chose `'faded'` because under v1 the UI actually showed faded content for every attempt in that session. Attributing `'none'` would fabricate an independent-correct signal that never existed; attributing `'nudge'` (the retry fallback) is wrong because the session was promoted pre-attempt, not retry-driven. Documented in the derivation function.

### U4 — Strict mini-test SSR behaviour coverage (PR [#150](https://github.com/fol2/ks2-mastery/pull/150))

**Files:** `tests/react-grammar-surface.test.js` (+142 lines — 4 new tests + 1 updated for U3 contract v2).

**What landed:** Behaviour-level React tests against the existing SSR harness proving: (1) answer preservation across navigation, (2) unanswered handling without invented correctness, (3) repair/AI/similar-problem commands fail closed during active mini-test, (4) timer expiry auto-finish.

**Scope note per plan:** Playwright was **intentionally not introduced**. The repo uses `node:test` + SSR harness by convention; adding a real-browser runner is a repo-wide test-tooling decision, not a fidelity-plan decision. The tests exercise state transitions and rendered-HTML invariants. Known SSR-harness limits (cannot observe pointer-capture, focus management, CSS overflow, scroll-into-view, or IME behaviour) were explicitly documented in a top-of-block comment so a future reader does not over-trust this coverage.

**Follower addressed one silent-no-op risk:** First version asserted mastery unchanged after the four repair commands, but a silently-failing command (not wired through the store) would pass the test without proving anything. Reviewer flagged this. Follower added `session.repair.workedSolutionShown` / `requestedFadedSupport` assertions — those are the session-level fields the commands mutate most visibly when they do fire, so asserting they stay unset closes the silent-no-op gap.

### U5 — Declarative `answerSpec` registry (PR [#153](https://github.com/fol2/ks2-mastery/pull/153))

**Files:** `worker/src/subjects/grammar/answer-spec.js` (new), `worker/src/subjects/grammar/content.js` (`markStringAnswer` rewrite + import), `tests/grammar-answer-spec.test.js` (new, 14 tests).

**What landed:** Declarative marking registry with six kinds — `exact`, `normalisedText`, `acceptedSet`, `punctuationPattern`, `multiField`, `manualReviewOnly` — fronted by the single `markByAnswerSpec(spec, response)` entry point. `content.js` `markStringAnswer` is rewritten as a thin adapter that constructs a transient `acceptedSet` spec from the caller's `accepted: [...]` array and delegates. Every marking call in Grammar therefore routes through the declarative code path even before per-template declarations land.

**Scope decision:** Per-template `answerSpec` declarations for all 20 constructed-response templates are **deferred to a content-release PR**. That's content work, not engine work, and changing `contentReleaseId` invalidates stored attempt evidence. Shipping the machinery now means the content PR can land answerSpec shapes one concept at a time.

**`minimalHint` preservation:** The legacy `mkResult` in `content.js` always added a `minimalHint` field from the `MINIMAL_HINTS` lookup. Oracle fixtures depended on that field being present. The adapter preserves this by overwriting `minimalHint` after `markByAnswerSpec` returns. `mkMarkResult` in the new module provides a `DEFAULT_MINIMAL_HINT` fallback so direct callers (U7 transfer lane, future per-template specs) inherit the same shape guarantee.

**No `contentReleaseId` bump:** oracle replay passed byte-for-byte against the shipped fixtures. The declarative code path is a refactor, not a marking-behaviour change. The content-release PR that adds per-template declarations will pair with a release-id bump per the U5 plan's policy when marking behaviour changes (new accepted variants, narrower near-miss rejection).

### U6 — Analytics confidence taxonomy (PR [#156](https://github.com/fol2/ks2-mastery/pull/156))

**Files:** `worker/src/subjects/grammar/read-models.js` (+~130 lines: new helpers + confidence projection on concept + question-type entries), `tests/grammar-confidence.test.js` (new, 9 tests).

**What landed:** Five-label derived taxonomy exposed on every concept and question-type read-model entry.

| Label | Condition |
|---|---|
| `emerging` | `attempts <= 2` (thin evidence) |
| `needs-repair` | weak status OR `>= 2 recent misses` in the last 12 attempts |
| `secure` | `strength >= 0.82 AND streak >= 3 AND intervalDays >= 7` |
| `consolidating` | `strength >= 0.82 AND streak >= 3 AND intervalDays < 7` |
| `building` | everything else |

The `consolidating` label closes the plan's canonical edge case: a learner who has drilled a concept to `{attempts: 100, streak: 10, strength: 0.95, intervalDays: 3}` was falling to `building` under the plan's initial four-label scheme — misleading given the sample size. Under the five-label scheme they read as "consolidating — heavy same-week practice, not yet spaced".

**Derived-only projection:** `deriveGrammarConfidence(input)` is a pure function; `strength`, `correctStreak`, `dueAt` underlying values are never mutated. The read-model emits `confidence: { label, sampleSize, intervalDays, distinctTemplates, recentMisses }` per entry so both learner analytics and the parent hub share the same vocabulary.

**Precedence rules tested explicitly:** `emerging` beats `needs-repair` when `attempts <= 2` (thin evidence is the more informative signal); `needs-repair` beats `secure` when `recentMisses >= 2` (nudge the learner back).

**Side observation — recent-window alignment:** Initial version mixed windows — `recentMissCount*` sliced the last 12 attempts but `distinctTemplatesFor` iterated the full 80-attempt buffer. Reviewer A3 caught this. Follower extracted `GRAMMAR_RECENT_ATTEMPT_HORIZON = 12` as a named exported constant and aligned both helpers via a shared `recentWindow` helper. Consumers (parent hubs) can now describe the signal consistently as "missed 2 of the last 12".

**Side observation — status-machine delegation:** Low-strength detection is delegated to `status === 'weak'`, not to a raw strength threshold. A learner whose strength drifts to 0.28 for 10 attempts but has not had 2 recent misses nor status-machine-escalated-to-weak reads as `building`, not `needs-repair`. Documented the reasoning above `GRAMMAR_CONFIDENCE_LABELS` — the `grammarConceptStatus` machine is the authoritative source for weak; raw strength alone does not trigger needs-repair because strength can drift below a threshold after a single wrong answer without the status machine escalating.

### U7 — Non-scored transfer writing lane (Worker-side) (PR [#158](https://github.com/fol2/ks2-mastery/pull/158))

**Files:** `worker/src/subjects/grammar/transfer-prompts.js` (new — 5 seed prompts + caps), `worker/src/subjects/grammar/engine.js` (`save-transfer-evidence` command + state slot + normalisation round-trip), `worker/src/subjects/grammar/read-models.js` (`transferLane` projection), `worker/src/subjects/grammar/commands.js` (GRAMMAR_COMMANDS), `tests/grammar-transfer-lane.test.js` (new, 12 tests).

**Scope decision:** This PR ships the **Worker-side contract and read-model plumbing**. A dedicated React `GrammarTransferScene.jsx` is a separate follow-up; all load-bearing invariants (non-scored isolation, per-promptId storage, caps, quota enforcement, fail-closed error codes, read-model redaction) live at the engine layer and are covered by the new test suite.

**Storage shape:** `state.transferEvidence` is a per-promptId map. Each prompt entry carries `{ latest, history, updatedAt }` with FIFO history capped at `GRAMMAR_TRANSFER_HISTORY_PER_PROMPT - 1 = 4` (plus the `latest` slot for 5 total per prompt). Global cap `GRAMMAR_TRANSFER_MAX_PROMPTS = 20`. Attempting to save for a 21st distinct prompt fails closed with `grammar_transfer_quota_exceeded`; a re-save for an existing prompt at the cap succeeds (tested explicitly).

**Non-scored invariants (enforced by regression tests):** `save-transfer-evidence` never touches `state.mastery`, `state.retryQueue`, `state.misconceptions`, reward projection, or any session state. The emitted `grammar.transfer-evidence-saved` event carries `nonScored: true` and is never of type `grammar.answer-submitted` / `grammar.concept-secured` / `grammar.misconception-seen`.

**Read-model redaction:** Prompt `reviewCopy` is adult-only and MUST NOT appear in the learner-facing read model. `grammarTransferPromptSummary` structurally omits `reviewCopy`; a test iterates every `rm.transferLane.prompts[*]` asserting `reviewCopy === undefined`.

**Side observation — error shape:** First test iteration asserted `caught.code` for thrown errors. Debugging revealed the HttpError class stores codes in `err.extra.code`, not `err.code`. Corrected via `caught.extra?.code`. A reusable note for future Worker error-path tests in this repo.

**Side observation — manualReviewOnly integration:** The plan mentioned using U5's `manualReviewOnly` answerSpec kind for transfer writing. In practice the transfer lane is fully isolated: saves go through a bespoke `save-transfer-evidence` command that never routes through `evaluateAnswer`. The `manualReviewOnly` kind remains available in the answer-spec registry but is not used by this lane. The `transfer-prompts.js` header comment was clarified to reflect this — the lane shares the **intent** of `manualReviewOnly` (no auto-marking) but does not produce `answerSpec` objects.

### U8 — Perfection-pass release gate (PR [#160](https://github.com/fol2/ks2-mastery/pull/160))

**Files:** `tests/fixtures/grammar-functionality-completeness/perfection-pass-baseline.json` (7 rows flipped), `tests/grammar-functionality-completeness.test.js` (extended validator + new gate test), `docs/grammar-functionality-completeness.md` (Perfection Pass section rewritten as shipped summary), `docs/plans/2026-04-24-001-feat-grammar-mastery-region-plan.md` (live-checklist row flipped), `docs/plans/2026-04-25-002-feat-grammar-perfection-pass-plan.md` (frontmatter `status: completed`).

**What landed:** The durable gate artefact. Every `planned` row in the baseline fixture was flipped to `completed` with `landedIn: "PR #N"` and `evidence: [...]` paths. The completeness test now accepts `completed` as a status, enforces that completed rows cite real evidence files on disk (except U1, which is self-referential — the baseline is its own evidence), and asserts the gate invariant: `planned.length === 0` at gate time.

**Bundle-audit claim verified:** `scripts/audit-client-bundle.mjs:19` already blocks `worker/src/subjects/grammar/*` via wildcard pattern. The new Worker-only modules (`selection.js`, `attempt-support.js`, `answer-spec.js`, `transfer-prompts.js`) are all covered without patching the audit script. Named-token additions would be cosmetic; the wildcard is load-bearing.

**No `contentReleaseId` bump across the entire pass:** every unit preserved marking behaviour. Oracle replay equivalence holds. Per-question-type floors and per-concept minimums remain pinned so future content expansion must **grow, not erode** the denominator.

---

## 3. SDLC cycle discipline

### Cycle structure

Every unit followed the same strict sequence:

1. **Research** — verify each plan claim against live code (did the reviewer actually find a bug, or did they miss an existing fix?)
2. **Implementation** — write tests first where the plan specified characterisation-first or test-first posture
3. **Targeted-suite run** — confirm green locally before pushing
4. **PR open** — structured body with scope, invariants, test plan, next-step notes
5. **Independent reviewer** — `pr-review-toolkit:code-reviewer` subagent with a 7-point question list specific to the unit
6. **Review-follower** — address every BLOCKING and ADVISORY finding, leave NITPICKs unless trivial
7. **Reviewer re-check** — second pass on the follower diff only
8. **Merge on approval** — squash-merge to `main`, sync local branch, advance to next unit

### Findings aggregate

| Severity | Count across 8 units | Resolved before merge |
|---|---|---|
| BLOCKING | 1 (U3 — mini-test session missing `supportContractVersion` stamp) | Yes — in follower cycle |
| ADVISORY | ~18 across all 16 review passes | All addressed or explicitly deferred |
| NITPICK | ~12 | Applied when trivial, noted otherwise |

### Review yield observations

Several reviewer findings caught genuine bugs the implementer would not have spotted:

- **U1 A1 (stale plan counts):** Plan prose at lines 27, 98, 240 said `identify 6, choose 16` — the fixture (correct) said `identify 7, choose 17`. The reviewer noticed the drift between *the same document* and its own fixture. Human reviewers do this routinely; encoding it into an automated review step via a subagent proved it scales.
- **U3 B1 (mini-test session gap):** The blocking finding described in §2.U3 above. I wired `supportContractVersion` into the non-mini-test `start-session` branch correctly but missed the separate mini-test construction branch. A reviewer fresh to the diff caught it within 30 seconds.
- **U4 A2 (silent-no-op):** The "commands fail closed" test would have passed whether the commands silently did nothing *or* were genuinely blocked. Reviewer asked the right question and the follower added the secondary assertion.
- **U6 A3 (window misalignment):** Two helpers used different windows for "recent". Not a bug today, but a future regression waiting to happen. Named constant extraction closes it.

### What the reviewer cycle did NOT catch

The reviewer could not catch: (a) whether an invariant the plan *itself* asserted was too strict — e.g., U5's plan said "module-load validation must throw", which would have broken the inline-`accepted` migration window; implementer made the call to defer validation to an opt-in flag. (b) whether a deferred scope was the right boundary — e.g., U5 deferring per-template declarations, U7 deferring the React scene. These were implementer judgement calls informed by the plan's own decisions.

---

## 4. Side observations (cross-cutting)

### 4.1 Test-first discipline works differently for selection weights

The plan's U2 execution note said "write fairness tests first". Doing this literally — writing a test that asserts "adverbials is picked at least 2 times with seed 1234" — produced a brittle test that broke on any weight tuning. The working pattern turned out to be: **write the test first, but have it aggregate across multiple seeds comparing equivalent scenarios** (e.g., "due concept outranks equivalent not-due concept") rather than asserting specific seed outcomes. Test-first on *principles*, not on *specific probabilistic realisations*.

### 4.2 Migration cost of field renaming

U3 renamed `supportLevel` → `supportLevelAtScoring` at the attempt shape level, but the legacy field had to stay for one release. That was straightforward. The non-obvious cost was:

- Event-log readers (anything that replays `grammar.answer-submitted` events to reconstruct mastery) needed the same derivation path.
- In-flight sessions at deploy time needed a versioned contract so they did not drift mid-flight.
- Existing tests asserting the old semantics had to be rewritten, not deleted — and the rewrite had to document *why* (contract v2) so a future reader does not revert.

Three layers: state + events + live sessions. The shared `deriveAttemptSupport` function made this tractable; without it, three divergent derivations would have drifted within months. This is a repeatable pattern for any field-rename migration on persisted state.

### 4.3 `contentReleaseId` bump policy as structural invariant

Every unit checked: did my change alter marking behaviour? The answer was always no (selection doesn't change marking; renaming attempt fields doesn't change marking; changing confidence-label derivation doesn't change marking; adding a non-scored transfer lane doesn't change marking). The oracle fixture at `tests/fixtures/grammar-legacy-oracle/legacy-baseline.json` — ~4000 lines pinning per-template correct responses byte-for-byte — was the load-bearing invariant. Any test that iterates `oracle.templates` calling `createGrammarQuestion` + `evaluateGrammarQuestion` and deep-equalling the result against the pinned `correctResult` would have caught a drift. The fact that no such drift showed up across 8 units is the highest-value signal that this pass preserved fidelity.

### 4.4 "Unlimited questions" is misleading but not wrong

A question that came up post-implementation: does Grammar have unlimited questions now? The honest answer is **bounded-but-deep**. 51 templates × per-template seed variance gives thousands of realisable question instances, and the U2 selection fairness ensures a learner doesn't see the same template repeatedly. But literal "unlimited" would require AI generation, which the architecture explicitly rejects (deterministic marking + seeded replay > AI-generated unbounded content, because the former is auditable). The I4 deferral documents this: content expansion is a separate reviewed plan, not a bolt-on AI feature.

### 4.5 Review-agent miscount propagation risk

The research agent in Phase 0 repeated the review doc's miscount of per-QT template distribution. Only when a Node one-liner actually counted the templates did the truth surface. **Research agents can carry prior-document errors forward** unless you prompt them to run live verification. Worth encoding as a standing instruction: "do not trust counts or paths cited in an input document without running a verification command against the live code."

### 4.6 Non-scored features as first-class

U7 proved non-scored features can be shipped as first-class without polluting the scored path. The clean architectural separation — bespoke command, isolated state slot, never-touches-mastery invariant asserted by regression tests — is the pattern. A similar shape would apply to future non-scored features: practice-with-self-assessment, peer-reviewed writing, teacher-annotated exemplars.

### 4.7 The "already-fixed" status is load-bearing

I7 (mode focus) was recorded as `already-fixed` — `NO_STORED_FOCUS_MODES` / `NO_SESSION_FOCUS_MODES` already encoded the intended table. Without the baseline row explicitly citing this and its supporting test (`tests/grammar-engine.test.js`), a future developer reading the review doc might re-implement the fix, potentially breaking the existing tests. The `already-fixed` status and its mandatory `resolvedBy` + `supportingTests` fields turn that institutional memory into an enforceable invariant.

### 4.8 Windows path-guard bug discovered incidentally

During U4's full-test-suite run, 7 pre-existing bundle-audit failures surfaced. Tracing them to `scripts/audit-client-bundle.mjs:208` showed a Unix-style `import.meta.url === \`file://${process.argv[1]}\`` guard that fails on Windows (`import.meta.url` uses `file:///C:/...` forward slashes while `process.argv[1]` uses Windows backslashes with no `file://` prefix). Not in scope for this pass, but worth flagging in a separate hygiene PR — currently the audit CLI exits 0 silently on Windows instead of running the audit.

---

## 5. Deferred work (explicitly out of scope)

1. **React `GrammarTransferScene.jsx`** — wires U7's Worker commands and `transferLane` read-model into a dedicated learner surface. Worker contract is ready; React scene is a UI-heavy follow-up.
2. **Per-template `answerSpec` declarations in `content.js`** — content-release PR. Will pair with a `contentReleaseId` bump when marking behaviour changes (new accepted variants, narrower near-miss rejection).
3. **Content expansion for thin concept pools (I4)** — separate reviewed content-release plan. The 6 concepts at the 2-template floor (`pronouns_cohesion`, `formality`, `active_passive`, `subject_object`, `modal_verbs`, `hyphen_ambiguity`) are priority candidates. The `explain` question type at 2 templates is also thin.
4. **Playwright / real-browser coverage for Grammar** — if ever introduced, lands via a repo-wide test-tooling decision, not within the fidelity line.
5. **Parent-hub UI rendering of U6 confidence labels** — the read model emits the labels; the hub HTML render is a separate UI task.
6. **Windows path-guard fix for `scripts/audit-client-bundle.mjs`** — incidentally discovered during U4.

---

## 6. Verification evidence (reproducible)

### Full grammar test suite

```
node --test tests/grammar-*.test.js tests/worker-grammar-subject-runtime.test.js tests/react-grammar-surface.test.js
ℹ tests 201
ℹ pass 201
ℹ fail 0
```

### Per-unit test files

| Unit | New test file | Test count |
|---|---|---|
| U1 | `tests/grammar-functionality-completeness.test.js` (extended) | +4 (now 10) |
| U2 | `tests/grammar-selection.test.js` (new) | 12 |
| U3 | `tests/grammar-attempt-support.test.js` (new) | 20 |
| U4 | `tests/react-grammar-surface.test.js` (extended) | +4 (now 33) |
| U5 | `tests/grammar-answer-spec.test.js` (new) | 14 |
| U6 | `tests/grammar-confidence.test.js` (new) | 9 |
| U7 | `tests/grammar-transfer-lane.test.js` (new) | 12 |
| U8 | `tests/grammar-functionality-completeness.test.js` (further extended) | +2 (now 10) |

### Merged PR sequence

All 8 PRs merged to `main` with the commit hashes:

| PR | Unit | Merge commit |
|---|---|---|
| [#144](https://github.com/fol2/ks2-mastery/pull/144) | U1 | `232a6d5` |
| [#146](https://github.com/fol2/ks2-mastery/pull/146) | U2 | `8c5456f` |
| [#148](https://github.com/fol2/ks2-mastery/pull/148) | U3 | `01344e7` |
| [#150](https://github.com/fol2/ks2-mastery/pull/150) | U4 | `1e82b32` |
| [#153](https://github.com/fol2/ks2-mastery/pull/153) | U5 | `00957e4` |
| [#156](https://github.com/fol2/ks2-mastery/pull/156) | U6 | `4f82190` |
| [#158](https://github.com/fol2/ks2-mastery/pull/158) | U7 | `b3f6ecd` |
| [#160](https://github.com/fol2/ks2-mastery/pull/160) | U8 | `00e4a5c` |

---

## 7. Closing note

The plan shipped its own completeness signal: the baseline fixture at `tests/fixtures/grammar-functionality-completeness/perfection-pass-baseline.json` and its guard test are now the durable record of what was done, why, and where the evidence lives. Any future review agent that inspects Grammar will find the I1-I9 resolution table already machine-readable, so the Phase 2 review's premise — that "complete" claims could drift — is structurally prevented going forward.

Grammar Phase 2 review is fully resolved at the Worker layer. The plan (`docs/plans/2026-04-25-002-feat-grammar-perfection-pass-plan.md`) is now `status: completed`.
