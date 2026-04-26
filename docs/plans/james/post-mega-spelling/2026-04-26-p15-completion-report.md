---
title: "Post-Mega Spelling P1.5 — Completion Report"
type: completion-report
status: completed
date: 2026-04-26
plan: docs/plans/2026-04-25-005-feat-post-mega-spelling-guardian-hardening-plan.md
mvp_report: docs/plans/james/post-mega-spelling/2026-04-25-completion-report.md
---

# Post-Mega Spelling P1.5 — Completion Report

## 1. Summary

All 12 planned units (U1–U11 + U8b) shipped to `origin/main` in one autonomous scrum-master run between 2026-04-25 evening and 2026-04-26 early hours. The plan (`docs/plans/2026-04-25-005-feat-post-mega-spelling-guardian-hardening-plan.md`) was flipped to `status: completed` in PR #243.

The plan's declared cut order was `U11 → U10 → U9`. **No cuts were required** — every unit landed on main, including the two lowest-priority "nice-to-have" units (Boss Dictation UI and reward subscriber). The MVP completion report's recommendation that Boss + reward subscriber were "the low-risk pair" was honoured by shipping U9 + U11 together.

The single load-bearing invariant carried from the MVP — **Mega is never revoked** — was tightened across every layer touched during P1.5 and is now asserted by a composite property test (U8b).

---

## 2. Shipped scope

All 12 units merged to `main` in the order below (sorted by merge commit date, not plan order).

| Unit | PR | Requirements | Commit | Description |
|------|-----|--------------|--------|-------------|
| U6 | #204 | R7 | `fe88199` | `resetLearner` zeros guardian map regardless of persistence adapter |
| U4 | #206 | R4, R11 | `5edfacd` | "I don't know" wobble replaces legacy skip in Guardian sessions |
| U5 | #212 | R5, R10 | `72b5da9` | Guardian cloze off, Boss/Guardian session-ui chips, Word Bank chip polish |
| U3 | #214 | R3, R11 | `18aaa7e` | Guardian-safe summary drill routes via `practiceOnly` (client + remote-sync parity) |
| U7 | #209 | R9 | `f19f79a` | `saveGuardianRecord` merge-save narrows same-process guardian write window |
| U2 | #218 | R6 | `1df11a8` | `isGuardianEligibleSlug` orphan sanitiser across selector, read-model, Word Bank |
| U1 | #223 | R1, R2 | `dd70f5f` | `guardianMissionState` 6-state enum + `computeGuardianMissionState` + `deriveGuardianAggregates` helper |
| U8 | #228 | R8, R11 | `392aa42` | `saveJson {ok, reason}` + `feedback.persistenceWarning` banner + `PersistenceSetItemError` proxy throw |
| U9 | #235 | R12, R11 | `39eef83` | Boss Dictation service path + `spelling.boss.completed` event + `overrideBossSummary` |
| U11 | #239 | R14 | `2286392` | Guardian + Boss reward subscriber (toasts only; no monster evolution) |
| U8b | #241 | R11 | `c2aa40a` | Mega-never-revoked composite property test (200 seeded + 6 named shapes + regression tripwire) |
| U10 | #240 | R13 | `3ba3cf5` | Boss Dictation UI + Alt+5 shortcut (resolver emits explicit `length`) |

---

## 3. Invariants held

| Invariant | Enforced by | Test anchor |
|-----------|-------------|-------------|
| **Mega-never-revoked** (terminal) | Every U1–U9 write path preserves `progress.stage >= 4`. `submitGuardianAnswer`, `submitBossAnswer`, `skipGuardianWord` never write `stage` / `dueDay` / `lastDay` / `lastResult`. | `tests/spelling-mega-invariant.test.js` (U8b composite) |
| **R1 first-patrol fresh graduate enabled** | `guardianMissionState: 'first-patrol'` + `guardianMissionAvailable: true` + dashboard copy. | `tests/spelling-guardian.test.js`, `tests/react-spelling-surface.test.js` |
| **R2 daily-patrol honest copy** | 6-state enum with `due > wobbling > optional-patrol > rested` priority. | `tests/spelling-guardian.test.js` mission-state cases |
| **R3 Guardian summary cannot demote Mega** | `module.js` + `remote-actions.js` force `practiceOnly: true` when `ui.summary?.mode === 'guardian'`. | `tests/spelling-remote-actions.test.js` parity case |
| **R4 "I don't know" = wobble** | `advanceGuardianOnWrong` + `session.guardianResults[slug] = 'wobbled'` + mission-completed count parity. | `tests/spelling-guardian.test.js` skip→wobble cases |
| **R5 Guardian clean retrieval** | `showCloze` mode-aware + "Guardian" session-ui chip. | `tests/react-spelling-surface.test.js` chip assertions |
| **R6 Content hot-swap no orphan leak** | `isGuardianEligibleSlug` applied in 4 selector buckets + read-model counts + Word Bank filters. | `tests/spelling-guardian.test.js` orphan-content cases |
| **R7 Reset zeros guardian regardless of adapter** | Explicit `saveGuardianMap(learnerId, {})` call inside `resetLearner`. | `tests/spelling-guardian.test.js` reset case |
| **R8 Storage failure surfaces without demoting Mega** | `saveJson {ok, reason, error}` + spelling proxy `setItem` throws `PersistenceSetItemError` on fresh `lastError` + `feedback.persistenceWarning` banner. | `tests/spelling-guardian.test.js` quota-exceeded path |
| **R9 Guardian writes narrow same-process race** | `saveGuardianRecord` reload-merge-save (cross-tab deferred to storage-CAS plan). | `tests/spelling-guardian.test.js` concurrent-submit case |
| **R10 Word Bank chip copy child-friendly + `wobbling` filter tightened** | `status === 'secure'` guard on the wobbling bucket. | `tests/react-spelling-surface.test.js` Word Bank tab |
| **R11 Mega-never-revoked property** | U8b composite test passes under seed 42 across 200 random sequences + 6 named shapes. | `tests/spelling-mega-invariant.test.js` |
| **R12 Boss is demotion-safe single-attempt** | `mode === 'boss'` dispatched BEFORE `type === 'test'` in `submitAnswer`. `submitBossAnswer` never writes stage/dueDay/lastDay/lastResult. Emits `spelling.boss.completed`. | `tests/spelling-boss.test.js` + `tests/spelling-mega-invariant.test.js` |
| **R13 Boss UI active + Alt+5** | `POST_MEGA_MODE_CARDS` Boss active, `SpellingSummaryScene` Boss branch (no drill-all), Alt+5 resolver emits `length: BOSS_DEFAULT_ROUND_LENGTH`. | `tests/react-spelling-surface.test.js` Boss scene + `tests/spelling-remote-actions.test.js` |
| **R14 Reward subscriber toasts Guardian + Boss events** | Additive on existing `rewardEventsFromSpellingEvents`; wobbled events intentionally silent (positive-events-only MVP). | `tests/spelling-reward-subscriber.test.js` |

No `SPELLING_SERVICE_STATE_VERSION` bump was required across P1.5 — all new fields are derived or session-scoped, not persisted. The plan invariant held.

---

## 4. Final verify

- **Composite property suite** — `tests/spelling-mega-invariant.test.js`: 8/8 pass (seed 42, 200 random sequences + 6 named shapes).
- **Spelling suite total** — ~240+ tests green across `spelling-guardian.test.js`, `spelling-boss.test.js`, `spelling-reward-subscriber.test.js`, `spelling-parity.test.js`, `spelling-view-model.test.js`, `spelling-remote-actions.test.js`, `spelling-mega-invariant.test.js`, `server-spelling-engine-parity.test.js`.
- **Full `npm test` after U10 merge** — ~2555 pass / 2 pre-existing failures (`grammar-production-smoke`, `punctuation-release-smoke`) / 1 skipped. Both failures are unrelated to spelling.
- **No `SPELLING_SERVICE_STATE_VERSION` bump** — plan invariant held.

---

## 5. Observations

Honest reflections from the session. The load-bearing section for next-plan design.

### 5.1 Adversarial-reviewer ROI confirmed on every state-machine unit

Bugs adversarial caught that no other reviewer would have:

- **U3** — `module.js` Guardian `practiceOnly` gate missed `remote-actions.js`'s parallel dispatcher. Remote-sync learners would have demoted Mega on practice drills.
- **U4** — "I don't know" double-tap wobbled 2 consecutive slugs. Root cause: in-line advance; fix mirrors `submitGuardianAnswer` wrong-path (set `awaitingAdvance`, let `continueSession` own FIFO).
- **U7** — cross-tab merge-save was dead code for the cross-tab claim because `createLocalPlatformRepositories` has a per-tab `collections` cache with no `storage`-event invalidation. Honest docs + acceptance-of-limitation test shipped; full fix deferred to the storage-CAS plan.
- **U8** — `persistBundle` catches its own throw and returns the error (does not re-throw). The entire warning path was structurally dead code in production. Fix: proxy `setItem` diffs `lastError` before/after, throws `PersistenceSetItemError` on fresh error. Smart Review also needed a mid-submit `lastError` snapshot because the probe is non-idempotent.
- **U9** — `session.type = 'test'` override cascaded into (a) `testSummary` emitting "pushed back into due queue" copy, (b) `sessionKind: session.type` routing Boss Resume to SATs scene, (c) session-ui helpers needing Boss branches. Each caught in separate adversarial passes.
- **U10** — Alt+5 resolver omitted `length`, so prefs fallback produced 12-card rounds instead of the spec-mandated 10. Also `remote-actions.js` ignored `data.length` and had pre-fix `savePrefs` ordering.

### 5.2 Plan-template learnings worth compounding

- **Rule**: any unit touching `module.js` handlers MUST audit `remote-actions.js` for parity. U3 / U9 / U10 all surfaced this finding. Add to plan boilerplate.
- **Rule**: any unit overriding `session.type` or `session.mode` MUST audit every consumer. U9 had four-plus leak sites across multiple adversarial rounds before converging.
- **Rule**: storage-error tests MUST exercise `createLocalPlatformRepositories`, not bare `MemoryStorage` helpers. U8's dead-code ship was caused by test-vs-production path divergence.
- **Property tests at a fixed seed are characterisation traces, not property proofs.** U8b's canonical + nightly variable-seed pattern is the honest structure.

### 5.3 Scrum-master orchestration pattern telemetry

- Orchestrator context stayed under 40% of window across the full run. Main context owned plan reading, subagent dispatch, reviewer dispatch, merge decisions, memory updates — nothing else.
- Worker subagents opened PRs then stopped. Reviewer subagents (`ce-*`) ran from orchestrator root (confirmed: subagents cannot spawn `ce-reviewers` — see `feedback_subagent_tool_availability.md`).
- Parallel wave depth: 6 concurrent workers at peak (U2 / U3 / U4 / U5 / U6 / U7), dropped to 2–3 as dependency-heavy units (U1, U8) became bottlenecks.
- Rebase hazard: U2, U7, U8, U8b each needed post-review rebase as main moved during review. Resolution pattern: additive merge, keep both sides. The `git stash` mid-merge hazard was re-confirmed and written up in memory.

### 5.4 Cut-line commitment held

The plan declared `U11 → U10 → U9` as cut order with U1–U8 + U8b load-bearing. No cut needed. The discipline of declaring cuts upfront removed mid-sprint negotiation overhead — the team never had to argue about what to drop because the answer was pre-agreed and never triggered.

### 5.5 Session-type override cascade is an architectural trap

U9 reused `session.type === 'test'` to inherit single-attempt UI behaviour for free. That saved significant UI-branch work, but every consumer reading `session.type` for routing / labelling / copy became a potential Mega-demotion vector. Adversarial caught 4 sites across 3 review rounds.

**Next time a plan proposes type reuse across modes, the plan's risk table must enumerate every downstream `session.type` reader** — not as a TODO, as a checked-off audit.

### 5.6 Worker-self-reported U9 bug caught by U10

U10's worker discovered `deriveSummaryTotals` in `service-contract.js` didn't parse Boss as test-mode score ("7/10" was read as `total=7`). U9's tests only asserted event fields, not summary totals. Fix landed inside U10's PR.

**Compound insight**: downstream-unit workers are an informal reviewer layer for upstream-unit test gaps. Worth keeping parallel waves deliberately partial-overlap so each unit's consumer can catch the prior unit's blind spots.

---

## 6. Deferred items

### 6.1 `post-mega-spelling-storage-cas` plan (named carry-forward from U7)

Bundles `navigator.locks.request`, `BroadcastChannel` cache invalidation, `writeVersion` stale detection, soft second-tab lock-out banner, and online-first Worker command routing. Cascades async through every dispatch handler — deliberately scoped out of P1.5.

### 6.2 Nightly variable-seed probe for U8b

`.github/workflows/mega-invariant-nightly.yml` that runs `tests/spelling-mega-invariant.test.js` with `FC_SEED=$(random)`. On failure, the seed gets promoted into the canonical suite. Deferred because the repo has no `.github/workflows/` directory yet.

### 6.3 Sticky-bit `allWordsMega`

Content rollback can flip `allWordsMega: true → false` silently, pausing the post-Mega dashboard. Current `'locked'` copy covers both "never-reached" and "rollback-paused". A sticky bit that latches once achieved would preserve the graduation contract.

### 6.4 Durable cross-session `persistenceWarning`

Close-tab-before-next-submit loses the warning. Deferred; requires a sibling storage key or prefs entry. Documented in U8 code comments.

### 6.5 `GUARDIAN_MISSION_COPY` table extraction

U1 review flagged the 8-branch if / else ladder in `PostMegaSetupContent` for a future refactor. Deferred by U1 fix-follower — documented in the commit body.

### 6.6 Shared `isPostMasteryMode(mode)` predicate

`module.js` and `remote-actions.js` both carry `mode === 'guardian' || mode === 'boss'` gates. U10 adversarial flagged: when the next post-Mega mode lands (Pattern Quests? Word Detective?), the change will need to hit both spots. Extract to a contract helper.

### 6.7 Alt+4 remote-sync `savePrefs` ordering

U10 fixed the race for Alt+5 Boss. Alt+4 Guardian on remote-sync has the same pre-existing ordering issue — not regressed, flagged as a follow-up.

### 6.8 Boss session-type readers audit

Adversarial U9 rounds 2 and 3 caught four `session.type === 'test'` sites. A full grep + audit of every `type === 'test'` reader in the codebase would lock this down. Outside P1.5 scope.

### 6.9 Reward subscriber expansion

U11 ships toasts only. Monster evolution on guardian events, 30-day Guardian streak badge, Mega-tier celebration, per-skill Pattern-Mastery celebration — all stay deferred to post-P2 plans per the low-risk-pair framing.

### 6.10 Per-slug progress counter assertions in U9 tests

U9 testing review flagged that `progress.attempts +10`, `correct +10`, `wrong +3` are only indirectly asserted via `BOSS_COMPLETED` event aggregates. A future hardening pass should add per-slug persistence assertions across a full 10-card round.

---

## 7. Plan recommendations for the next increment

P1.5 is done; the surface is stable and hardened. The MVP completion report recommended Boss + reward subscriber as "the low-risk pair" — both shipped. P2 candidates from the brainstorm doc:

- **Pattern Quests** — prefix / suffix / silent-letter metadata + Pattern Mastery badges. Heavier commitment, requires content-model work.
- **Word Detective** — "what went wrong?" misspelling analysis. Analytical, needs a misspelling corpus.
- **Story Missions / Use-It / Teach-the-Monster** — engagement layer, UX-heavy.
- **Storage-CAS plan** (see 6.1) — risk-driven, earns nothing user-visible but hardens cross-tab. Load-bearing invariant fix.

**Recommended sequencing**: storage-CAS first (load-bearing invariant fix for cross-tab, unblocks everything that follows), then Pattern Quests (highest learning value, bounded scope). Word Detective can layer on Pattern Quests's metadata later.

---

## 8. Sources

- Plan: [`docs/plans/2026-04-25-005-feat-post-mega-spelling-guardian-hardening-plan.md`](../../2026-04-25-005-feat-post-mega-spelling-guardian-hardening-plan.md)
- MVP report: [`docs/plans/james/post-mega-spelling/2026-04-25-completion-report.md`](./2026-04-25-completion-report.md)
- Brainstorm: [`docs/plans/james/post-mega-spelling/post-mega-spelling-p1.md`](./post-mega-spelling-p1.md)
- Hardening brief: [`docs/plans/james/post-mega-spelling/post-mega-spelling-p2.md`](./post-mega-spelling-p2.md)

---

*Compiled 2026-04-26 at the close of the autonomous scrum-master run. All 12 units merged, cut-line untouched, every review finding resolved or deferred with rationale.*
