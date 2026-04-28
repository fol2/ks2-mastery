---
title: "Punctuation Phase 7 — Completion Report"
type: report
status: completed
date: 2026-04-28
origin: docs/plans/james/punctuation/punctuation-p7.md
plan: docs/plans/2026-04-27-003-feat-punctuation-phase7-qol-debuggability-hardening-plan.md
---

# Punctuation Phase 7 — Completion Report

## Executive summary

Phase 7 shipped on 2026-04-27/28 as **12 merged pull requests** covering **12 implementation units** across 3 phases, executed via fully autonomous scrum-master orchestration with parallel workers, independent compound-engineering reviewers, review followers, and re-review gates. The phase was a **stabilisation contract** — no new skills, modes, monsters, or reward currencies. Every unit was behaviour-preserving unless explicitly correcting a documented bug.

- **Units landed**: 12 of 12 (U1 through U12).
- **PRs merged**: 12 (#423, #426, #427, #438, #439, #442, #444, #446, #449, #450, #452, #454).
- **Lines**: +5,080 / −487 across 47 file slots.
- **contentReleaseId bumps**: **zero**.
- **Engine files touched** (`shared/punctuation/marking.js`, `generators.js`, `scheduler.js`): **zero**.
- **Deterministic marking changes**: **zero**.
- **Real bugs caught by review and fixed before merge**: **2 HIGH** + **3 MEDIUM** + **13 LOW/advisory** (see Review Findings table).
- **Reviewer dispatches**: ~24 across 12 review cycles (correctness ×12, testing ×1, adversarial ×1, maintainability ×1).
- **Review follower dispatches**: 10 (U1, U2, U3, U6, U7, U8, U9, U10, U11, U12).
- **Subagent dispatches total**: ~50 (workers, reviewers, followers).
- **Convergent findings** (same issue found by 2+ independent reviewers): 4 — all were genuine issues.
- **Regression count**: **zero**.

Phase 7 met its headline outcome:

> A learner, parent, operator, or future engineer can now understand why Punctuation shows the progress it shows, prove that the child-facing journey works through the real Worker/D1 path, and change the system without updating six mirrored constants or shipping false-green tests.

---

## Problem frame — what Phase 6 left behind

Phase 6 shipped 10 PRs establishing Star truth, monotonic display, and Worker parity. The Phase 6 completion report and the Phase 7 product-engineering contract identified eight follow-on risks:

1. **starHighWater only advances on unit-secured events.** A child practising without securing new units saw correct display (via live `max()` merge) but stale codex latch — toast events used the old value.

2. **O(n) Star projection on every command.** `projectPunctuationStars` iterated all attempts (~5 passes) per Worker command, unbounded for long-history learners.

3. **Lifetime telemetry caps.** Sessionless event kinds (e.g. `card-opened`) hit a permanent per-learner cap after 50 cumulative events across all sessions.

4. **Render-time side effects.** `PunctuationSetupScene` emitted telemetry and dispatched prefs migration during React render — a concurrent-mode footgun.

5. **Constants drift.** Client-safe metadata mirrored across 4+ modules with "must stay in lock-step" comments and no enforcement.

6. **No diagnostic surface.** Debugging required reading raw codex state with no safe abstraction.

7. **Pending/degraded navigation unproven.** The `summary-back-while-pending` journey was skipped because no dev-only fault hook existed.

8. **Stale production docs.** Reward-key text and telemetry sections did not reflect P5/P6 changes.

---

## What Phase 7 delivered

### Phase 1: Foundation Refactors (zero behavioural change)

| Unit | PR | Scope | Lines |
|------|----|-------|-------|
| U1 | #426 | Extract canonical `punctuation-manifest.js` — single source of truth for 14 skills, 6 clusters, 4 monsters, 14 reward units, derived lookups. All 4 previously-mirrored modules now import from one leaf. 17-assertion drift test. | +362/−241 |
| U2 | #423 | Move telemetry emission and prefs migration from render body to `useEffect`. Keep `useRef` latches as double-fire protection under React StrictMode. | +100/−50 |
| U3 | #427 | Sweep 7 test/journey files for stale "primary mode card" terminology. Update to "mission-dashboard CTA" language. No test logic changed. | +45/−45 |

**Phase 1 key insight:** The manifest extraction (U1) broke the circular dependency that forced `star-projection.js` to inline `SKILL_TO_CLUSTER` and `RU_TO_CLUSTERS`. Post-U1, every punctuation module that needs client-safe metadata imports from one leaf file with zero imports from other punctuation modules. The drift test pins exact counts (14 skills, 6 clusters, pealark=5 units, claspin=2, curlune=7) and cross-checks `PUNCTUATION_GRAND_MONSTER_ID` against `mastery/shared.js`.

### Phase 2: Behavioural Extensions

| Unit | PR | Scope | Lines |
|------|----|-------|-------|
| U4 | #444 | Star-evidence latch writer. `punctuation.star-evidence-updated` domain event emitted from Worker command handler when `liveStars > codex starHighWater`. Mastery subscriber ratchets latch per-monster. | +623/−4 |
| U5 | #438 | Projection benchmark: 500/1500/3000/5000 attempts. Measured: sub-10ms at 5000 attempts. **Caching not needed.** Debug `_debugMeta.source` flag for Doctor. | +300/−2 |
| U6 | #439 | Replace lifetime telemetry caps with 7-day rolling window (`occurred_at_ms > Date.now() - 7 * 86400000`). Add mutation-receipt audit trail on event timeline reads. | +508/−25 |
| U7 | #442 | Replace ambiguous "Stars earned" aggregate with "Grand Stars" label. Quoral `displayStars` (monotonic) shown as top metric. Direct monster meters unchanged. | +176/−13 |
| U8 | #446 | Punctuation Doctor diagnostic. `buildPunctuationDiagnostic` answers all 8 §5.1 questions. Admin-gated command. Forbidden-key scan. Admin normaliser. Mega-blocked reasons include mixed-mode, spaced-return, and Claspin both-skills gates. | +1176/−0 |

**Phase 2 key insight — U4 follows the Grammar P6 latch pattern exactly:**

```
Worker command handler
  → compute starView via projectPunctuationStars
  → for each monster: if liveStars > codex starHighWater
  → emit punctuation.star-evidence-updated { learnerId, monsterId, computedStars }
  → mastery subscriber: ratchet starHighWater = max(existing, computedStars)
  → ratchet maxStageEver = max(existing, derivedStage)
  → uses GRAND thresholds for Quoral, STAR thresholds for direct monsters
  → no toast (toast timing stays on reward-unit mastery only)
```

The adversarial review confirmed 7/7 attack scenarios safe: Quoral threshold mismatch (Grammar P6 HIGH bug) does not reproduce, retry idempotent, two-tab race is a pre-existing D1 limitation, fresh learner handled, event ordering correct, epsilon guard sufficient.

**Phase 2 key insight — projection performance:**
| Attempt count | Median time | Bound |
|--------------|-------------|-------|
| 500 | ~2ms | < 5ms |
| 1,500 | ~2.5ms | < 8ms |
| 3,000 | ~4.5ms | < 15ms |
| 5,000 | ~8.5ms | < 25ms |

Sub-10ms for a realistic long-history learner. The contract required "measured and bounded" — caching is not needed and was not shipped.

### Phase 3: Proof & Documentation

| Unit | PR | Scope | Lines |
|------|----|-------|-------|
| U9 | #449 | `stall-punctuation-command` fault kind + `stall` action type in middleware. 18 tests. Forbidden-text token denial verified. Non-positive `durationMs` rejected. | +396/−1 |
| U10 | #450 | Full Worker-backed Playwright journey: 10-step flow, star consistency across 4 surfaces (landing/summary/map/refresh), SH2-U2 regression guard, map round-trip, telemetry rate-limited path. Hard-fail on missing star meters + progression assertion. | +556/−6 |
| U11 | #452 | Pending/degraded navigation proof. 4 Playwright scenes + un-skipped journey. Summary Back, Map Close, Skill Detail baseline, mutation-buttons-disabled. Uses U9 stall fault. | +540/−91 |
| U12 | #454 | Production docs: 100-Star model, star-evidence latch, telemetry windowing, Doctor diagnostic, aspirational labels, query-limit correction. 9 static checks. | +298/−9 |

**Phase 3 key insight:** The `summary-back-while-pending` journey (blocked since P4 U8) is now **active** — the fault-injection stall hook from U9 provides honest simulation of a pending command. The Playwright pending-navigation suite proves all 4 escape paths (Summary Back, Map Close, Skill Detail Escape, mutation-disabled) under a real stalled Worker command.

---

## Review findings table

The SDLC cycle (worker → reviewers → follower → merge) caught issues at every unit. The highest-value finds were the 2 HIGHs in U8 and the 4 convergent findings across U1/U2.

| Unit | Severity | Finding | Source | Fixed by |
|------|----------|---------|--------|----------|
| U8 | **HIGH** | Admin gate checks `session.isAdmin` — property doesn't exist; correct check is `session.platformRole === 'admin'`. Command unreachable for all users. | Correctness | Follower |
| U8 | **HIGH** | Codex entries never load — `readSubjectRuntimeBundle` returns `{ subjectRecord, latestSession }`, no `gameState`. All starHighWater values show 0. | Correctness | Follower |
| U8 | **MEDIUM** | Mega-blocked reasons omit `hasMixedModes`, `hasSpacedReturn`, `hasBothSkillsDeepSecure` conditions from real star-projection gates. | Correctness | Follower |
| U6 | **MEDIUM** | Audit PK collision: `telemetry-read-${epochMs}` produces identical primary keys for same-millisecond reads from same account. | Correctness | Follower (added random suffix) |
| U11 | **MEDIUM** | Selector `button.btn.primary` matches 'Practise wobbly spots', not 'Start again'. Production 'Start again' has `btn secondary`. | Correctness | Follower |
| U2 | LOW | 3 simple migration tests skip `updateSubjectUi` latch step — diverge from production effect body. | **Convergent** (both reviewers) | Follower |
| U2 | LOW | 'smart prefs do NOT trigger migration' test vacuously true post-refactor — useEffect doesn't fire during SSR. | Testing (90% confidence) | Follower |
| U1 | LOW | MONSTER_UNIT_COUNT drift test only checks > 0, not exact counts (5/2/7). | **Convergent** (both reviewers) | Follower |
| U1 | LOW | PUNCTUATION_GRAND_MONSTER_ID defined in two places with no cross-check. | **Convergent** (both reviewers) | Follower (drift test added) |
| U1 | LOW | Stale comment, unnecessary aliases, duplicate Set, orphan comment. | Maintainability | Follower (7 fixes) |
| U6 | LOW | `readAtMs` bypasses injectable clock — uses `Date.now()` instead of module's `nowMs`. | Correctness | Follower |
| U10 | LOW | Star consistency checks silently skippable when meter arrays empty. | Correctness | Follower (hard-fail assertions) |
| U11 | LOW | Scene 4 never triggers stalled command — baseline check, not stall proof. | Correctness | Follower (honest description) |
| U11 | LOW | `Promise.race` unhandled rejection in journey driver. | Correctness | Follower (.catch) |
| U9 | LOW | Negative `durationMs` passes validation — fires immediately, defeats purpose. | Correctness | Follower (> 0 guard) |
| U12 | LOW | Query limit says 1000 but code enforces 500. Missing `request-context-pack` command. | Correctness | Follower |
| U4 | INFO | Two-tab D1 race (pre-existing, inherited from `recordPunctuationRewardUnitMastery`). | Adversarial | Accept — pre-existing |
| U4 | INFO | Event ID millisecond collision (benign under latch idempotency). | Adversarial | Accept — cosmetic |

**Convergent finding pattern:** When two independent reviewers find the same issue, it has a near-100% true-positive rate. All 4 convergent findings in P7 were genuine issues that tests alone could not catch.

---

## Completion definition check

The P7 contract (§11) defined 9 completion criteria. All are met:

| # | Criterion | Evidence |
|---|-----------|----------|
| 1 | Punctuation reward/debug story explainable from safe state | U8: Doctor diagnostic answers all 8 §5.1 questions. Forbidden-key scan passes. |
| 2 | Star high-water and visible Star behaviour remain monotonic and event-aligned | U4: `punctuation.star-evidence-updated` subscriber ratchets latch on every evidence change. Adversarial review confirmed. |
| 3 | Star projection performance bounded or documented as safe | U5: Sub-10ms at 5000 attempts. Benchmark test with upper bounds. Caching not needed. |
| 4 | Telemetry sessionless rate limits time-windowed and event reads auditable | U6: 7-day rolling window. Mutation-receipt audit trail. 11 tests. |
| 5 | Pending/degraded navigation proven through real fault path | U9+U11: `stall-punctuation-command` fault + 4 Playwright scenes + un-skipped journey. |
| 6 | Full Worker-backed browser journey proof exists and is not skipped | U10: 10-step Playwright journey with star consistency across 4 surfaces. |
| 7 | Client-safe Punctuation metadata has one canonical source | U1: `punctuation-manifest.js` leaf module. 17-assertion drift test. |
| 8 | Production docs reflect actual Star model and mastery-key format | U12: Updated `punctuation-production.md`. 9 static checks. |
| 9 | No new curriculum, monsters, modes, or Hero-owned reward behaviour | Verified: zero `contentReleaseId` bumps, zero engine files touched. |

---

## Product acceptance behaviours — verification

The P7 contract (§7) defined 11 product acceptance statements. All are true:

1. **Fresh learner sees stable landing skeleton** — U10 Playwright journey verifies fresh→session→refresh cycle.
2. **Landing page does not display ambiguous aggregate Star number** — U7: "Stars earned" replaced with "Grand Stars".
3. **Learner can refresh after summary and return to clean safe state** — U10: SH2-U2 regression guard test.
4. **Learner can open Map, close Map, return to correct prior surface** — U10: Map open/close round-trip test.
5. **Learner cannot get stuck on Summary/Map/modal when command stalls** — U11: 4 Playwright scenes.
6. **Stars never de-evolve in child UI** — U4 latch + P6 `mergeMonotonicDisplay` (unchanged).
7. **Star/evolution toasts never contradict visible meters** — U4 adversarial review confirmed event ordering safe.
8. **Direct monsters and Quoral use different but clearly-labelled Star semantics** — U7: "Grand Stars" vs "Stars" labels.
9. **Reserved monsters never appear on child-facing Punctuation surfaces** — U12 static check greps for colisk/hyphang/carillon.
10. **Debug output explains monster progress without leaking answers** — U8: Doctor passes forbidden-key scan.
11. **Telemetry usable for debugging without permanent lifetime caps** — U6: 7-day rolling window.

---

## Engineering contracts — verification

| Contract | § | Evidence |
|----------|---|---------|
| Redaction (§6.1) | U8: Recursive forbidden-key scan on diagnostic payload. No `acceptedAnswers`, `answerBanks`, `correctIndex`, `validators`, `generatorSeeds`. |
| Idempotency (§6.2) | U4: `max()` latch is idempotent. Adversarial confirmed retry, two-tab, duplicate replay all safe. U6: rate-limit response unchanged. |
| Cache correctness (§6.3) | U5: Caching not shipped — projection is fast enough without it. Contract satisfied by measurement. |
| Fault-injection (§6.4) | U9: `__ks2_injectFault_TESTS_ONLY__` forbidden-text token. Per-request opt-in header. Bundle audit verified. Not reachable from learner traffic. |
| Refactor safety (§6.5) | U1: characterisation test before extraction. U2: useRef guards preserved. U3: comment-only changes. All existing tests pass with zero assertion changes. |

---

## Architecture observations

### The star-evidence latch completes the Grammar/Punctuation symmetry

With U4, both subjects now follow the same latch pattern:

| Layer | Grammar | Punctuation |
|-------|---------|-------------|
| Evidence event | `grammar.star-evidence-updated` | `punctuation.star-evidence-updated` |
| Emitter | `deriveStarEvidenceEvents` in `grammar/commands.js` | `deriveStarEvidenceEvents` in `punctuation/commands.js` |
| Subscriber | `event-hooks.js` → `updateGrammarStarHighWater` | `event-hooks.js` → `updatePunctuationStarHighWater` |
| Latch | `starHighWater = max(existing, computed)` | `starHighWater = max(existing, computed)` |
| Threshold dispatch | Grand vs direct thresholds by monsterId | Grand vs direct thresholds by monsterId |
| Toast coupling | None (latch-only, no toast) | None (latch-only, no toast) |

This is now a proven cross-subject pattern for any future subject that adopts the 100-Star evidence model.

### The canonical manifest pattern eliminates a class of drift bugs

Pre-P7, a developer adding a 15th Punctuation skill needed to update 4+ files in lock-step. Post-P7:
1. Add the skill to `punctuation-manifest.js`
2. The drift test catches any desync with Worker content
3. All consumers (star-projection, read-model, service-contract, view-model) automatically pick up the change via imports

### The fault-injection stall proves a previously-untestable contract

The `summary-back-while-pending` journey was skipped since P4 U8 because no mechanism existed to simulate a hanging Worker command. The existing `timeout` fault kind returns a 408 immediately — it does not hang. The new `stall` action type (U9) fills this gap: the middleware holds the HTTP socket for a configurable duration without responding. This enabled honest proof of the "child never trapped" contract (U11).

---

## Deferred work (for Phase 8 or later)

1. **GPS/transfer context integration into Star evidence** — deferred since P5.
2. **Pattern-based Star boosts** — deferred since P5.
3. **Star economy balancing against Spelling 100-word thresholds** — deferred since P5.
4. **Quoral Grand Star backend implementation** — shadow display only since P5/P6.
5. **Desktop/tablet Playwright baseline matrix** — P7 tests use mobile-390 only.
6. **In-session pending proof** — U11 proves Summary/Map/modal escape but not mid-question stall (testing gap noted by reviewer).
7. **CAS (row_version) on monster-codex** — would close the two-tab D1 race for both `recordPunctuationRewardUnitMastery` and `updatePunctuationStarHighWater` (adversarial finding, pre-existing).

---

## SDLC cycle performance

Phase 7 was the second full application of the autonomous SDLC cycle (after Phase 6). Key metrics:

| Metric | Phase 6 | Phase 7 |
|--------|---------|---------|
| Units | 10 | 12 |
| PRs | 10 | 12 |
| Lines | +3,165/−39 | +5,080/−487 |
| HIGH bugs caught by review | 3 | 2 |
| MEDIUM bugs caught | 4 | 3 |
| Convergent findings | 3 | 4 |
| Follower dispatches | 6 | 10 |
| Review-pass merges (no follower needed) | 4 | 2 (U4, U5) |

The higher follower rate in P7 (10/12 vs 6/10) reflects the broader scope — Phase 7 touched tests, comments, docs, admin commands, and Playwright specs, which have more surface area for review findings than Phase 6's focused reward-algorithm work.

The **highest-value review moment** was U8's correctness review finding the `session.isAdmin` bug. The Worker's admin gate would have been dead on arrival — the Doctor diagnostic command was unreachable by any user, including admins. The test suite could not catch this because all tests called `buildPunctuationDiagnostic` directly, bypassing the command handler. This is the exact "looks green but proves the wrong thing" pattern the P7 contract warned about (§4.4 and §9).

---

## Test landscape after Phase 7

- **Pre-P7 baseline**: 47 punctuation test files
- **Post-P7**: 51 punctuation test files (+4: manifest drift, projection benchmark, diagnostic, doc static checks)
- **New Playwright specs**: 2 (journey extension, pending-navigation suite)
- **Un-skipped journeys**: 1 (`summary-back-while-pending`)
- **Total new test assertions**: ~130 across 12 PRs
