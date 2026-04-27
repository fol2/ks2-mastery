---
title: "Punctuation Phase 7 — QoL, Debuggability, Logic Correction, and Hardening Contract"
type: product-engineering-contract
status: proposed
date: 2026-04-27
scope: Punctuation subject only
audience: next implementation-planning agent
origin:
  - docs/plans/james/punctuation/punctuation-p6-completion-report.md
  - docs/plans/james/punctuation/punctuation-p6.md
  - current main repo review on 2026-04-27
---

# Punctuation Phase 7 — QoL, Debuggability, Logic Correction, and Hardening Contract

## 1. Purpose

Phase 7 is a stabilisation contract. It is not a new feature phase, not a content expansion phase, and not a root-level implementation ticket plan.

The next implementation agent should read this contract, inspect the repo again, and then write its own implementation plan with units, exact files, tests, PR sequencing, and reviewer assignments.

Phase 5 changed the Punctuation reward direction to a 100-Star evidence model and mission-dashboard landing. Phase 6 then made Star truth survive Worker/bootstrap round-trips, made child-facing stage display monotonic, aligned reward events with Star-derived stages, added Practice Star throttling, strengthened Curlune/Claspin Mega gates, and added Worker-side telemetry rate limiting.

Phase 7 should now make Punctuation easier to trust, easier to debug, harder to accidentally regress, and cheaper to maintain before any new curriculum or Hero-mode-facing expansion continues.

The headline outcome is:

> A learner, parent, operator, or future engineer should be able to understand why Punctuation shows the progress it shows, prove that the child-facing journey still works through the real Worker/D1 path, and change the system without updating six mirrored constants or shipping false-green tests.

## 2. Non-goals

Phase 7 must not add new Punctuation skills, new practice modes, new monsters, new learner reports, new AI learner explanations, new reward currencies, or a new content release id.

Phase 7 must not change deterministic marking behaviour unless a blocker is found that proves the current logic is wrong or unsafe.

Phase 7 must not make Hero Mode own, overwrite, or award Punctuation Stars. Hero Mode may later orchestrate subject tasks, but Punctuation Stars remain subject-owned learning evidence.

Phase 7 must not solve child engagement by adding more buttons or more explanatory text to the landing page. The Phase 7 landing work is strictly QoL clarification and consistency, not another redesign.

## 3. Current state after Phase 6

Punctuation is a rollout-gated, Worker-command-backed production subject slice with:

- 14 published Punctuation skills.
- Worker-owned Smart Review, Wobbly Spots, GPS Check, guided/focused practice, sentence combining, transfer, and paragraph repair.
- A Punctuation Map surface over the 14 skills.
- Active Punctuation monsters: Pealark, Claspin, Curlune, and Quoral.
- Reserved Punctuation monsters: Colisk, Hyphang, and Carillon.
- A 100-Star child-facing reward model for direct monsters and a Grand Star model for Quoral.
- A mission-dashboard landing page with one main CTA, compact stats, monster meters, map entry, and secondary practice controls.
- Worker/client/bootstrap Star parity tests.
- Monotonic child display via starHighWater / maxStageEver / mergeMonotonicDisplay.
- Worker-side telemetry validation and per-session rate limiting.

Phase 6 intentionally left four follow-on areas:

1. Punctuation lacks a Grammar-style star-evidence latch writer; starHighWater currently advances on reward-unit mastery events, not every live Star-evidence increase.
2. Star projection is recomputed from attempts/facets/rewardUnits on every Worker read-model path.
3. Browser/journey evidence exists, but the full Worker-backed D1 path and pending-command fault path still need stronger proof.
4. Sessionless telemetry kinds can still hit a lifetime per-learner cap, causing slow-burn telemetry loss.

A repo scan also shows several maintenance risks that should be treated as Phase 7 hardening:

- PunctuationSetupScene still performs migration dispatch and telemetry emission during render. This is a React/concurrent-mode footgun even if current useRef gates reduce obvious duplication.
- Several client-safe Punctuation constants are mirrored across star-projection, read-model, service-contract, and view-model. Comments say they must stay in lock-step. That is a refactor smell.
- Some tests and comments still describe old “primary mode card” semantics even though the landing is now a mission dashboard with one CTA.
- The production doc still contains stale reward-key text and does not fully describe the post-P5/P6 Star contract.
- The landing headline metric “Stars earned” can be ambiguous if it sums direct monster Stars and Quoral Grand Stars together.

## 4. Product principles for Phase 7

### 4.1 Trust before expansion

The subject should not move on to new content until the current learner journey and reward system are debuggable and defensible.

### 4.2 Stars are evidence, not currency

Stars must remain a subject-owned display of Punctuation learning evidence. They must not be conflated with Hero Coins, daily-login rewards, or generic engagement points.

### 4.3 Child surfaces stay simple

Debuggability must not leak into child UI. A child should see a mission, a monster, simple Stars, and clear next action. Operators and developers may see a full evidence breakdown in safe tooling.

### 4.4 False-green tests are worse than missing tests

Any test that passes against a detached component, stale selector, fake fixture shape, or non-production data path should be either rewritten or clearly marked as legacy-only. Phase 7 should prefer fewer accurate tests over many stale tests.

### 4.5 One canonical model, many consumers

Star projection, skill mapping, monster mapping, status labels, telemetry shape, and public read-model shape should each have one canonical source. Mirrored copies are allowed only where bundle isolation demands it, and then drift tests must pin them.

## 5. Phase 7 product outcomes

Phase 7 is complete only when all outcomes below are true.

### 5.1 A safe Punctuation Doctor exists for developers/operators

There must be a safe debugging view, helper, or CLI-style read model that explains Punctuation state without exposing answer banks, validators, rubrics, raw generated content, hidden queues, or typed learner answers.

The debugging output should be able to answer:

- Why does Pealark show this many Stars?
- Which evidence categories contributed Try / Practice / Secure / Mastery Stars?
- Which evidence gate is blocking Mega?
- Why did Quoral not advance?
- Which reward units are tracked, secured, and deep-secured?
- Which codex latch values are stored, and which live projection values are higher?
- Which session / attempt / facet classes influenced the projection?
- Which telemetry events were accepted, dropped, deduped, or rate-limited?

The output must be safe-by-default. It may show item ids, skill ids, reward-unit ids, counts, booleans, timestamps, session ids, and safe labels. It must not show raw answer text, prompt text beyond already-redacted child prompts, accepted answers, validators, or model solutions unless those are already phase-safe in the learner read model.

### 5.2 Star-evidence high-water writes are no longer tied only to unit-secured events

Child-facing display is already monotonic through live projection plus codex high-water merge. Phase 7 must close the remaining event/story gap: the persisted Star high-water latch should advance when live Star evidence advances, even if no new reward unit became secure in that exact command.

The system must preserve these invariants:

- Star high-water can only increase.
- Stored stage high-water can only increase.
- Reward/evolution/toast events must not contradict the visible Star meter.
- A retry, refresh, duplicate command, or two-tab replay must not duplicate the same Star-advance event.
- Lapses may reduce live evidence, but never reduce child-facing display or stored high-water.
- Admin/debug surfaces may show live evidence lower than high-water; child surfaces should not de-evolve.

The implementation plan may choose session-end writes, attempt-level writes, an event subscriber, or a projection reconciliation pass. The contract only requires the observable behaviour above.

### 5.3 Projection performance is measured and bounded

Phase 6 accepted O(n) Star projection as low urgency. Phase 7 should turn this into an explicit performance contract.

The projection must remain deterministic and byte-for-byte consistent across Worker and client paths. Any caching or incremental computation must be invalidated by all relevant progress changes: attempts, facets, rewardUnits, release id, and projection-version changes.

Minimum product expectation:

- A normal 4/8/12 item round should not visibly slow because of Star projection.
- A learner with long history should not make every Worker command response scan unbounded historical data.
- If caching is added, stale cache must fail safe by recomputing, not by showing old Stars.
- Debug output must identify whether a Star view came from fresh projection or cache.

### 5.4 Telemetry caps become time-windowed and auditable

Per-session telemetry caps are good. Sessionless lifetime caps are not. Phase 7 must replace lifetime per-learner caps for sessionless event kinds with a time-windowed or rolling-window policy so a learner is not permanently rate-limited after normal long-term use.

The telemetry query surface must also be auditable. Reading a learner's Punctuation event timeline is operationally useful, but it should leave an audit trail consistent with the rest of admin/ops conventions.

Product rule:

- Telemetry must help debug learner journeys without becoming a PII sink or an invisible surveillance surface.

Engineering rule:

- Event writes stay allowlisted and fail closed on unknown fields.
- Query reads are authorised, bounded, and audited.
- Rate-limited and deduped events remain distinguishable in operator/debug output.

### 5.5 Full Worker-backed journey proof exists

Unit parity is not enough. Phase 7 should provide a full journey proof using the real Worker-backed command path and D1-style persistence path.

The proof must cover:

- Home/dashboard to Punctuation landing.
- Start today’s round.
- First item render.
- Submit answer.
- Feedback or GPS delayed path.
- Summary.
- Return to landing.
- Refresh/bootstrap.
- Punctuation Map.
- Star meter consistency across landing, summary, map, and home/dashboard.
- Telemetry write path when enabled and no learner disruption when disabled.

This should not rely only on SSR or direct dispatch harnesses. Browser-level proof should exist, and skipped pending-state scaffolds should either become real executable tests or be explicitly removed from “done” claims.

### 5.6 Pending/degraded navigation is proven, not assumed

A child must never be trapped on Summary, Map, or modal surfaces because a mutation command is pending, stalled, degraded, or read-only.

Phase 7 should add the missing dev-only fault/stall hook or equivalent safe simulation so the pending-state navigation contract can be tested honestly.

Rules:

- Mutation buttons disable while pending/degraded/read-only.
- Navigation/escape buttons remain available unless the entire UI shape is missing.
- Summary Back, Map Back/Close, modal close, and dashboard escape are all tested during a real pending/stalled command state.
- Tests must not fake this by asserting Back is enabled on a clean, non-pending render.

### 5.7 Landing QoL is clarified without adding noise

The landing dashboard should remain the Phase 5/6 mission-dashboard shape, but Phase 7 should fix ambiguous or confusing presentation.

Required product clarifications:

- The top metric must not imply a single 0-100 score if it actually sums direct Stars plus Grand Stars.
- If the page shows “Stars earned”, it must be clear whether this means today’s delta, direct monster total, or Grand Stars.
- Quoral Grand Stars must not be visually confused with the direct monster Stars.
- Fresh learner, post-session, refresh, and return-from-map should all preserve the same page skeleton.
- Secondary actions must remain secondary. They should not re-create the old button wall.

Acceptable approaches include: renaming the aggregate, replacing it with “Grand Stars”, showing “Today’s progress” only when a session delta exists, or dropping the aggregate entirely and letting the monster meters carry the reward story.

### 5.8 Stale test and comment contracts are cleaned

The implementation should remove or rewrite tests, comments, and helper exports that still describe old UI semantics.

Specific contract:

- No production test should assert behaviour on a component that is exported only for backwards compatibility and is not rendered in the real learner tree, unless the test name states that explicitly.
- Keyboard/accessibility tests should describe the mission-dashboard CTA that exists now, not old primary mode cards if those are no longer the visible contract.
- Journey README and Playwright comments should match the current UI.
- If a legacy component export is kept only to avoid test churn, Phase 7 must either delete it or rename the tests to make the legacy status explicit.

### 5.9 Client-safe Punctuation manifest has one canonical source

Phase 7 should refactor the client-safe Punctuation metadata so that skill ids, reward-unit ids, cluster ids, cluster-to-monster mapping, active monster ids, and map filters do not drift across multiple modules.

The contract does not require a specific file name. The next implementation plan can choose the location.

The canonical manifest must:

- Be safe for the browser bundle.
- Not import server-only content, validators, generators, raw service, or answer banks.
- Avoid circular dependencies.
- Preserve existing bundle-audit guarantees.
- Provide stable exports for star projection, read model, service-contract validation, view-model, Map, and tests.
- Include drift tests against the Worker/shared content manifest where safe.

### 5.10 Production docs match current behaviour

The production documentation must stop describing stale reward semantics.

Required doc truth:

- Mastery key examples must show the real format: `punctuation:<releaseId>:<clusterId>:<rewardUnitId>`.
- The 100-Star evidence model must be described as the child-facing reward display.
- The distinction between secured reward units, deep-secured reward units, direct Stars, Grand Stars, and codex high-water must be clear.
- Operational telemetry docs must reflect the actual rate-limit and query-audit behaviour after Phase 7.
- Any aspirational warning-code/dashboard sections must be labelled as aspirational unless a real consumer exists.

## 6. Engineering contracts

### 6.1 Redaction contract

Every new debug, telemetry, journey, admin, or operator output must pass the existing forbidden-key discipline.

Forbidden examples include:

- accepted answers
- answer banks
- correctIndex
- raw rubric definitions
- validators
- generator seeds
- hidden queues
- unpublished content
- typed learner answer text in telemetry/debug streams
- raw prompt text beyond already-redacted learner-safe read-model fields

A recursive forbidden-key scan must cover any new debug/read model payload. Debuggability must not weaken the Worker read-model wall.

### 6.2 Idempotency contract

Any new write related to Star high-water, telemetry, debug snapshots, reconciliation, or fault injection must be idempotent under retry and safe under two tabs.

The implementation plan should explicitly account for:

- repeated requestId
- stale learner revision
- duplicate domain event replay
- repeated bootstrap
- two simultaneous commands
- tab refresh mid-session

### 6.3 Cache correctness contract

If Star projection caching lands, the cache is an optimisation, not a second source of truth.

A cached Star view is valid only when all relevant inputs match the cache key. On uncertainty, recompute from canonical progress.

The implementation must prove:

- cached and fresh projection are identical for the same progress
- cache invalidates on attempt append
- cache invalidates on rewardUnit write
- cache invalidates on facet/memory change
- cache invalidates on release or projection version change
- corrupted cache fails safe

### 6.4 Fault-injection contract

Any dev-only stall/fault hook must be impossible to trigger accidentally in production.

It must require explicit test/dev opt-in and must not be reachable from normal learner traffic.

The hook exists only to prove degraded/pending UI contracts. It must not become a hidden admin feature.

### 6.5 Refactor safety contract

Refactors in Phase 7 must be small, test-backed, and behaviour-preserving unless explicitly correcting a bug.

Priority refactors:

1. Extract client-safe manifest constants.
2. Move render-time dispatch/telemetry out of render paths.
3. Centralise Star/monster display labels and caps.
4. Update stale tests/comments to current UI semantics.
5. Isolate debug payload building from child read-model building.

Non-priority refactors:

- rewriting the Punctuation engine
- changing deterministic marking
- restructuring all subject modules
- unifying Grammar and Punctuation prematurely
- moving subject-owned Stars into Hero Mode

## 7. Product acceptance behaviours

After Phase 7, these statements must be true:

- A fresh learner sees a stable Punctuation landing skeleton before and after a short session.
- The landing page does not display an ambiguous aggregate Star number.
- A learner can refresh after summary and return to a clean safe state.
- A learner can open Map, close Map, and return to the correct prior surface.
- A learner cannot get stuck on Summary/Map/modal when a command stalls.
- Stars never de-evolve in child UI.
- Star/evolution toasts never contradict visible meters.
- Direct monsters and Quoral use different but clearly-labelled Star semantics.
- Reserved monsters never appear on child-facing active Punctuation surfaces.
- Debug output explains why a monster did or did not advance without leaking answers.
- Telemetry can be used for debugging without permanent lifetime caps on normal long-term usage.

## 8. Verification expectations

The next implementation plan should include proof at these levels:

### 8.1 Pure projection tests

- Star projection remains deterministic.
- Cache/fresh output equality if caching is implemented.
- High-water updates are monotonic.
- Mega gates still require broad/deep evidence.
- Same-day grinding remains capped.

### 8.2 Worker/read-model tests

- Worker payload and client payload still produce identical starView.
- Debug payload passes forbidden-key scan.
- Star high-water write path is idempotent.
- Telemetry time-window caps behave correctly.
- Query audit fires on event timeline reads.

### 8.3 Browser/journey tests

- Full Worker-backed Punctuation journey with D1 persistence.
- Refresh/bootstrap after summary.
- Star consistency across Home, Setup, Summary, Map.
- Pending/stalled command navigation escape.
- Accessibility path uses the actual mission CTA.

### 8.4 Documentation tests or static checks

- No stale `punctuation:::` example remains in production docs.
- No child-facing `Stage X of 4` or `XP` wording.
- No reserved monster names in learner-facing Punctuation output.
- No test comments or README claims that contradict the current UI contract.

## 9. Suggested review posture

Phase 7 should use adversarial review for:

- Star high-water writes and event emission.
- Cache/incremental projection correctness.
- Telemetry cap/query/audit changes.
- Fault-injection hooks.
- Debug payload redaction.

The highest-risk class is “looks green but proves the wrong thing”. Reviewers should actively search for fixture-only paths, stale selectors, detached component tests, and local-only paths that bypass Worker/D1 behaviour.

## 10. Out of scope but related: Hero Mode boundary

Hero Mode may later launch Punctuation tasks, but it must not own Punctuation Stars. Hero Mode should operate as an orchestrator over ready subjects and may carry its own daily contract/currency. Punctuation Stars remain the evidence-backed subject reward view.

If Phase 7 touches Hero launch adapters, it should only ensure that Hero context passes through safely to Punctuation commands without mutating Punctuation mastery or changing Star semantics.

## 11. Completion definition

Phase 7 is complete when:

1. The Punctuation reward/debug story is explainable from safe state alone.
2. Star high-water and visible Star behaviour remain monotonic and event-aligned.
3. Star projection performance is either bounded by cache/incremental design or measured and documented as safe.
4. Telemetry sessionless rate limits are time-windowed and event reads are auditable.
5. Pending/degraded navigation is proven through a real fault path.
6. Full Worker-backed browser journey proof exists and is not skipped.
7. Client-safe Punctuation metadata has one canonical source or a drift-proofed mirror.
8. Production docs reflect the actual Star model and mastery-key format.
9. No new curriculum, new monsters, new modes, or Hero-owned Punctuation reward behaviour shipped.

## 12. Source notes for the next agent

Review these before writing the implementation plan:

- `docs/plans/james/punctuation/punctuation-p6-completion-report.md`
- `docs/plans/james/punctuation/punctuation-p6.md`
- `src/subjects/punctuation/star-projection.js`
- `src/platform/game/mastery/punctuation.js`
- `src/subjects/punctuation/components/PunctuationSetupScene.jsx`
- `src/subjects/punctuation/components/punctuation-view-model.js`
- `src/subjects/punctuation/read-model.js`
- `worker/src/subjects/punctuation/read-models.js`
- `worker/src/subjects/punctuation/events.js`
- `src/subjects/punctuation/telemetry.js`
- `src/subjects/punctuation/module.js`
- `src/subjects/punctuation/service-contract.js`
- `tests/punctuation-star-parity-worker-backed.test.js`
- `tests/journeys/README.md`
- `tests/playwright/punctuation-golden-path.playwright.test.mjs`
- `tests/playwright/punctuation-accessibility-golden.playwright.test.mjs`
- `docs/punctuation-production.md`

