# Post-Mega Spelling Guardian MVP — Completion Report

- **Feature**: Post-Mega Spelling Guardian MVP (Spelling subject)
- **Plan**: [`2026-04-25-003-feat-post-mega-spelling-mvp-plan.md`](./2026-04-25-003-feat-post-mega-spelling-mvp-plan.md)
- **Origin brainstorm**: [`post-mega-spelling-p1.md`](./post-mega-spelling-p1.md)
- **Shipped**: 2026-04-25 (single session, ce-plan → ce-work end-to-end)
- **Status**: All 6 implementation units + Phase 3 verify + Phase 4 docs **merged to `main`**

---

## TL;DR

Once a learner secures every core-pool word, we now treat that as a **role change**, not a ceiling. The new "Spelling Guardian" layer runs spaced retrieval on already-mastered words using a dedicated per-word maintenance record — **without ever revoking Mega**. Eight PRs, ~4,986 additions, 195/195 spelling tests green, zero behavioural regression on existing modes.

The core invariant enforced through every layer:

> **Mega is permanent.** A wrong answer in a Guardian Mission marks the word `wobbling: true` on a parallel `guardian` record; `progress.stage` never demotes, Codex monster state never demotes.

---

## Shipped scope

### PRs merged in order

| # | Unit | PR | Commit | Add / Del | Subject |
|---|------|------|--------|-----------|---------|
| 1 | U0 | [#162](https://github.com/fol2/ks2-mastery/pull/162) | `976b016` | +546 / −0 | Plan document (6 implementation units, mermaid diagrams, test scenarios, risk matrix) |
| 2 | U1 | [#167](https://github.com/fol2/ks2-mastery/pull/167) | `653629e` | +271 / −10 | Service contract: `'guardian'` mode, state v1→v2, `GUARDIAN_INTERVALS`, `normaliseGuardianRecord`/`Map`, Worker-side back-fill |
| 3 | U2 | [#170](https://github.com/fol2/ks2-mastery/pull/170) | `34d89c5` | +293 / −0 | 4 new kebab-case event types + factories mirroring existing `createSpelling*Event` shape |
| 4 | U3 | [#178](https://github.com/fol2/ks2-mastery/pull/178) | `f45c6d8` | +1213 / −34 | Pure scheduler (`advanceGuardianOn{Correct,Wrong}`, `ensureGuardianRecord`, `selectGuardianWords`) + full `startSession`/`submitAnswer`/finalisation wiring + client + Worker persistence plumbing |
| 5 | U4 | [#181](https://github.com/fol2/ks2-mastery/pull/181) | `4087313` | +474 / −1 | `getSpellingPostMasteryState` selector + `buildSpellingLearnerReadModel` extension with `postMastery` field |
| 6 | U5 | [#185](https://github.com/fol2/ks2-mastery/pull/185) | `bcda926` | +1095 / −74 | Post-Mega setup dashboard (`POST_MEGA_MODE_CARDS`, graduation lede, 3-state card UX) + Alt+4 shortcut with module-level gate |
| 7 | U6 | [#187](https://github.com/fol2/ks2-mastery/pull/187) | `e7eef43` | +1078 / −32 | Summary scene "Vault status" band + 4 new Word Bank filter chips (`guardianDue`/`wobbling`/`renewedRecently`/`neverRenewed`) |
| 8 | Phase 4 | [#190](https://github.com/fol2/ks2-mastery/pull/190) | `270a795` | +16 / −1 | `docs/events.md` + `docs/spelling-service.md` document the 4 guardian events; plan frontmatter `status: active → completed` |

**Totals**: +4,986 / −152 across 8 PRs.

### Requirements coverage

All R-IDs from the plan landed. Each is traced to a specific unit:

| R-ID | Requirement | Landed in |
|------|-------------|-----------|
| R1 | Post-Mega dashboard with Guardian card + disabled P2+ placeholders | U5 |
| R2 | `getSpellingPostMasteryState` selector with `allWordsMega` / `guardianDueCount` / `wobblingCount` / `recommendedWords` / `nextGuardianDueDay` | U4 |
| R3 | Per-word sibling `guardian` record alongside `progress`, lazy-created | U1 (shape) + U3 (creation) |
| R4 | `guardian` mode with wobbling-first selection, 5–8 word rounds | U3 |
| R5 | 4 new `spelling.guardian.*` events carried through platform runtime | U2 (types) + U3 (emission) |
| R6 | Summary scene guardian-specific cards | U6 |
| R7 | Word Bank filters `guardianDue` / `wobbling` / `renewedRecently` / `neverRenewed` | U6 |
| R8 | Schedule `3 → 7 → 14 → 30 → 60 → 90` days; miss flags wobbling without touching `progress.stage` | U3 |
| R9 | Guardian Mission emits both `SESSION_COMPLETED` and `GUARDIAN_MISSION_COMPLETED` | U3 |
| R10 | Alt+4 gated on `allWordsMega`; Alt+1/2/3 parity preserved | U5 |

### Non-regression guarantees

| Invariant | Evidence |
|-----------|----------|
| `SECURE_STAGE === 4`, legacy `STAGE_INTERVALS` unchanged | `shared/spelling/legacy-engine.js` untouched |
| `progress.stage` / `progress.dueDay` / `progress.lastDay` / `progress.lastResult` never mutated by any guardian path | Explicit test in `tests/spelling-guardian.test.js`: *"Guardian round does not mutate progress.stage/dueDay/lastDay/lastResult even on wrong answers"* |
| Codex monster projection unchanged (still sourced from `stage >= 4`) | `src/subjects/spelling/event-hooks.js` still filters `event.type === WORD_SECURED` |
| Alt+1/2/3 shortcut parity | `spelling-parity.test.js` passes |
| SATs Test stays core-only | `spelling-parity.test.js` passes |
| Smart / Trouble / Test / Single modes behave byte-identically | All parity tests + 25/25 `spelling.test.js` pass |

### Final verify (on fresh `origin/main` after all merges)

- **Spelling-surface targeted suite** (`spelling-guardian`, `spelling`, `spelling-parity`, `server-spelling-engine-parity`, `spelling-view-model`, `spelling-optimistic-prefs`, `react-spelling-surface`, `persistence`, `mutation-policy`): **195/195 pass**.
- **Full `npm test`**: 1405 pass / 1 pre-existing grammar-production-smoke failure unrelated to this work / 1 skipped.

---

## Deferred explicitly (to `post-mega-spelling-p2+`)

Scope-gated out of MVP on purpose — the plan's Scope Boundaries section gated every one of these to a later plan:

- **Pattern Quests** — word-pattern metadata, prefix/suffix/silent-letter tags, Pattern Mastery badges.
- **Boss Dictation** — one-shot 8–12 word challenges. Card shell shipped in MVP as a disabled placeholder so the post-Mega dashboard communicates the full roadmap.
- **Word Detective** — "what went wrong?" misspelling analysis.
- **Story Missions** — writing transfer.
- **Teach-the-Monster mode** — learner corrects a monster's misspelling.
- **Seasonal expeditions** — Space / Dragon / Ancient Egypt cosmetic wrappers.
- **Guardian-specific reward subscriber** — no toasts react to `spelling.guardian.*` events in MVP. The events travel through the platform runtime and land in the event log, but trigger no Codex change, no monster evolve, no mega-tier.
- **Extra-pool graduation** — Extra words don't block `allWordsMega`. A learner who has secured every core word but no Extra words still graduates to Guardian.

---

## Deferred with explicit rationale (review-surface follow-ups)

Findings surfaced by reviewers (correctness / adversarial / reliability / design / project-standards) across PRs #167, #178, #185, #187 that the team chose to defer rather than block-merge:

1. **Client-side concurrent-tab guardianMap last-writer-wins**  
   *Surfaced in U3 adversarial review.* Two tabs submitting guardian answers race on the full-map `setItem`. Pre-existing pattern shared with the legacy `progress` map; Worker CAS fully protects the server-authoritative path. Scope belongs with a future storage-layer refactor (same as the existing multi-tab `progress` behaviour).

2. **Content-bundle hot-swap orphaning**  
   Removing a core word from `WORDS` while a `guardianMap` entry references it silently drops the word from selected rounds. Low likelihood (content releases are operator-controlled); deferred until Pattern Quest (P2) which will touch content-metadata handling anyway.

3. **`todayDay = 0` sentinel edge case**  
   Mocked clock returning 0 collapses the schedule to "all due". Not reachable from production (`Date.now()` is never 0). Defensible corner; not blocking.

4. **Progress lazy-fallback to `stage: 0`**  
   Defensive path in `submitGuardianAnswer` could theoretically write `stage: 0` if a slug disappears mid-submit. Unreachable under normal flow (selector requires `stage >= 4` + lazy candidates only come from `progressMap`). Worker CAS `stale_write` covers the cross-device reset scenario.

5. **LocalStorage QuotaExceededError partial-write**  
   `saveJson` swallows throw; if storage hits quota between `saveProgressToStorage` and `saveGuardianMap`, progress bumps but guardian advance is lost. Pre-existing pattern for all spelling writes; self-heals on next correct answer (Mega never demoted).

6. **`VALID_SPELLING_WORD_BANK_FILTERS` dual source of truth**  
   The platform-layer sanitiser Set and the subject-layer `WORD_BANK_FILTER_IDS` Set now need lockstep maintenance. Called out with a lockstep comment in the platform file; a shared constants module is a layer-boundary refactor beyond U6.

7. **`currentDay` recomputed twice in `buildSpellingLearnerReadModel`**  
   Once for the main path, once inside `getSpellingPostMasteryState`. Deterministic under identical inputs so correctness unaffected; hoist when the UI layer first needs the shared value.

---

## Architectural decisions worth remembering

1. **Sibling map vs. per-word field extension**  
   Guardian state lives in `data.guardian`, a sibling to `data.progress`. It does **not** extend each `progress[slug]` record. This kept the legacy SRS shape 100% intact (zero risk to Codex projection, zero churn for Word Bank aggregates that read `progress.stage`), made rollback trivial, and let `normaliseServerSpellingData` back-fill `guardian: {}` for legacy learners with no touch of the existing progress back-fill path.

2. **Integer day arithmetic, not ISO strings**  
   The origin brainstorm sketched `lastReviewedAt: string | null` (ISO timestamp). We translated to integer day numbers on the way in to match `legacy-engine.js` (`dueDay: todayDay()`) and `read-model.js` conventions. Every scheduler operation is `Math.floor(ts / DAY_MS)`.

3. **Lazy guardian creation**  
   No retroactive migration for existing learners with 170 secure words. A guardian record is created the first time a word is selected for a Guardian Mission round, through an idempotent `ensureGuardianRecord(guardianMap, slug, todayDay)`. Forward-compat by construction.

4. **Worker + client share `shared/spelling/service.js`**  
   Because `worker/src/subjects/spelling/engine.js::createServerSpellingEngine` wraps `createSpellingService(...)` from `shared/`, Guardian logic only needed to be written **once**. This was a DHH-style "no framework pretending" moment — the Worker and the browser aren't two engines, they're one engine with two persistence proxies.

5. **Single-attempt Guardian grading**  
   Guardian Mission has no retry or correction phase — unlike Smart Review. A wrong answer wobbles the word, the round moves on. Matches the origin spec ("one clean attempt") and keeps the UX coherent with the "you're the expert now" framing.

6. **`allWordsMega` = core-pool only**  
   Formally: `coreSecureCount === corePublishedCount`. Extra pool is enrichment, not a statutory gate. User-confirmed during planning. This is the single definition used by `isAllWordsMega()` in the service, `getSpellingPostMasteryState` in the read model, and the module-level shortcut gate.

7. **Kebab-case event naming**  
   The plan originally wrote `spelling.guardian.missionCompleted` (camelCase), caught by the very first review (PR #162). Fixed to `mission-completed` to match every other event type in `SPELLING_EVENT_TYPES`. Convention-first naming saved re-work in U2.

8. **Storage prefix `ks2-spell-guardian-*`**  
   New dedicated prefix, mirroring `ks2-spell-progress-*`. Both client `createSpellingPersistence` and Worker `createServerPersistence` recognise the prefix and route it through `subjectStates.data.guardian`. The normaliser layer (`normaliseGuardianMap`) owns shape integrity; storage layers stay transport-only.

---

# Observations

Honest, specific reflections on the session. Meant to be useful next time — not a victory lap.

### 1. The plan was worth writing

The initial plan document (U0, 546 lines) was the most important artifact. Six implementation units, mermaid diagrams for data flow + guardian lifecycle, explicit test scenarios per unit, an unchanged-invariants table, and a follow-up-work section. Writing it took ~45 minutes; it paid for itself by the end of U1 when the first reviewer flagged two real issues that would have cascaded through all six units (camelCase event name, U3 scope ambiguity). A plan is not the code — it's a contract reviewers can argue about before code costs exist.

### 2. Review feedback had the highest ROI on U3

U3 drew three reviewers (correctness, reliability, adversarial). Correctness found a user-facing bug: feedback body said "next check in 7 days" while the scheduler actually scheduled +3. Adversarial found a priority-violation in the top-up bucket when a recent wobble's `nextDueDay` fell one day in the future. Both were plausible "ship it anyway" findings — if I'd been in a hurry, they would have landed as silent defects. The correctness bug alone would have been noticeable within a week of a real learner using Guardian Mission. The adversarial finding would have been invisible except to a careful QA pass that counted which words surfaced. **Adversarial reviewers pay disproportionately well on any state-machine logic.**

### 3. Environment noise stole more time than bugs

Two separate environment issues cost ~20% of the session:
- **Missing `node_modules`** on the worktree — `npm test` failed on Grammar/punctuation/bundle-audit tests because `react` wasn't installed. Symptom looked like regressions. Fix was `npm install`, not code.
- **Windows `spawnSync npx.cmd EINVAL`** on `npm run check`. Environment-specific; CI Linux passes. Required a judgment call to ship without local pre-merge `check` confirmation.

Baseline tests on a fresh branch exposed both. Without running baseline first, I would have assumed my changes broke 30+ tests. **Always run baseline before diagnosing "your changes broke X".**

### 4. The subagent-driven SDLC worked — but only after the model was explicit

U0–U3 I drove inline. The work was fine but context consumption was heavy. The user's mid-session directive to act as scrum master and delegate both implementation AND reviews to subagents unlocked U4/U5/U6 at ~3× the previous throughput. Each subagent got ~200k tokens of focused context, I kept ~20k for orchestration. The pattern that worked:

1. Main context: plan reading, directive reception, branch creation, task tracking, final verify.
2. Subagent: full implementation + PR + reviewers + review-feedback loop + merge.
3. Main context resumes only when the subagent reports "MERGED".

A subagent driving its own reviews lost some rigour vs. dispatched parallel reviewers (U4/U5/U6 subagents reported that the `Agent` tool for dispatching `ce-*` reviewers wasn't exposed in their environment). They ran self-reviews against the three explicit lenses as a fallback. This was **good enough for MVP**, but a dedicated `ce-*` reviewer would have caught more adversarial scenarios. If I did it again, I'd pre-specify the review-dispatch protocol and require the subagent to fail loudly if it couldn't run them, rather than silently fall back to self-review.

### 5. The `/frontend-design` skill mattered more than expected

U5 and U6 both invoked `/frontend-design` before writing JSX, and both subagents reported iterating at least once against its critique perspective. The output was measurably different from default React-component slop:
- Three real card states (active / rested / placeholder) with distinct borders + badges, not "one state with opacity 0.6".
- Microcopy landed grounded ("The Word Vault is yours", "Come back for the next check") instead of emoji-laden "Great work!" slop.
- Filter chips got flat-bottom pill shapes to signal a different mental model from the round legacy chips.

The invisible win is what didn't ship: no trophy imagery, no exclamation-mark celebration toast, no em-dash comma-splice microcopy. Design skills compound with implementation skills in a way that pure code review doesn't catch.

### 6. The storage-boundary confusion in U3 was real and preventable

The subagent driving U3 initially introduced a `guardianMemory Map` + `globalThis.localStorage` three-layer fallback because neither client `repository.js` nor Worker `engine.js` parsed the new `ks2-spell-guardian-*` prefix yet. I caught it on review and reverted to a clean single-storage-proxy approach, but only after the subagent had already shipped the fallback scaffolding. Root cause: the plan said "sibling `data.guardian` map" without specifying the exact storage-prefix contract. The subagent reasonably inferred a new layer when the simpler plumbing wasn't obvious.

**Lesson**: for units that touch a persistence boundary, the plan's "Files" section should enumerate the storage-contract changes explicitly (e.g. "Client `repository.js::parseStorageKey` gains `ks2-spell-guardian-` branch; Worker `engine.js::parseStorageKey` matches"), not just name the files.

### 7. The version bump was the silent load-bearer

`SPELLING_SERVICE_STATE_VERSION: 1 → 2` in U1 broke exactly two assertions in `spelling.test.js` (`assert.equal(transition.state.version, 1)`), plus three fixture objects in `persistence.test.js`, `react-spelling-surface.test.js`, `spelling-optimistic-prefs.test.js`. Four line-edits total, but until I found them, 30+ tests appeared to fail. The lesson isn't "don't bump versions" — it's **bump the version in a PR where the breakage is visible and obviously scoped**, not buried in a larger refactor where reviewers might miss the blast radius.

In this work the bump had its own PR (U1) and the downstream fixture edits lived in the same commit, which made the change easy to review and easy to revert if we'd needed to.

### 8. `ce-plan`'s deepening pass didn't trigger — and probably shouldn't have

The plan didn't trigger Phase 5.3 deepening because I classified it as Standard (not Deep) and didn't hit the high-risk signals (no auth, no payments, no external APIs). In retrospect the plan was **correctly sized**. A Deep plan would have been wasted ceremony — the implementation units were short, the blast radius was contained to the spelling subject, and the review surface was ~200 lines at most per unit. The plan depth heuristic worked.

### 9. U5 and U6 should have been one unit

Looking at the finished system, the setup-scene changes and the summary/Word Bank changes share the same `postMastery` prop drilling, the same `showGuardian` gating, the same `allWordsMega` awareness. Splitting them into two units meant:
- Duplicated prop-threading setup.
- Two separate `/frontend-design` invocations with overlapping microcopy concerns.
- Two independent rounds of accessibility / design-lens review.

The split was **convenient for plan structure** (one file per scene) but not for cognitive locality. Next time I'd consider a single "UI shell" unit for a feature where the prop contract is the real complexity.

### 10. The "Mega is never revoked" invariant shaped everything

Every layer tests this invariant, and every layer could have violated it. The choice to keep `guardian` as a sibling map rather than extend `progress` was because of this rule. The decision to bump `progress.correct/wrong/attempts` but never `progress.stage` in guardian grading was because of this rule. The fact that `spelling-guardian.test.js` has an explicit test asserting `progress.stage === 4` after a wrong answer in Guardian mode is because of this rule.

**One strong invariant, clearly stated, and defended across every unit is more valuable than a dozen soft guidelines.** When the rule is "Mega is never revoked", every design tradeoff gets simpler.

---

## Next plan recommendation

The MVP is solid. The natural next plan (`post-mega-spelling-p2`) should pick two of the following:

1. **Boss Dictation mode** — mixed 8–12 Mega words, single attempt, occasional spaced challenge. Shortest path to a second post-Mega surface.
2. **Guardian reward subscriber** — celebrate `renewed` / `recovered` events with short toasts, maybe a small cosmetic Vault badge for 30-day streaks. Complements what's already there without new content work.
3. **Pattern Quest metadata** — add `patternIds` to word content, build a minimal pattern registry. This is content-heavy but pays off if a third surface (Pattern Mastery) is also on the table.

Boss Dictation + Guardian reward subscriber are the low-risk pair. Pattern Quests alone is the higher-commitment path.

---

*Compiled 2026-04-25 at the close of the implementation session. Single ce-plan → ce-work cycle, scrum-master-delegated for U4–U6. All reviewers' findings resolved or explicitly deferred with rationale in PR threads.*
