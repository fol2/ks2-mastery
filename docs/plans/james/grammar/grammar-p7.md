---
title: "Grammar Phase 7 — QoL, Debuggability, Logic Correction & Refactor Hardening Contract"
type: product-engineering-contract
status: proposed
subject: grammar
date: 2026-04-27
inherits:
  - docs/plans/james/grammar/grammar-phase4-invariants.md
  - docs/plans/james/grammar/grammar-phase5-invariants.md
  - docs/plans/james/grammar/grammar-phase6-invariants.md
source_reports:
  - docs/plans/james/grammar/grammar-phase5-implementation-report.md
  - docs/plans/james/grammar/grammar-phase6-implementation-report.md
non_goal_marker: "Not an implementation-unit plan. The next agent must derive exact units, files, tests, sequencing, and PR breakdown from this contract."
---

# Grammar Phase 7 — QoL, Debuggability, Logic Correction & Refactor Hardening Contract

## 0. Contract summary

Grammar Phase 7 should be a **quality and trust consolidation phase**, not a content or feature-expansion phase.

Phase 5 made Grammar easier for children to understand: one main dashboard action, a compact 4-monster strip, and a universal 100-Star curve.

Phase 6 made Grammar Stars trustworthy: production-shaped attempts now feed Star derivation, wrong-only template exposure no longer grants varied-practice Stars, retained-after-secure requires temporal evidence, sub-secure Stars persist through `starHighWater`, 1-Star Egg is now persisted reward state, and dashboard live evidence uses the production `analytics.recentAttempts` path.

Phase 7 should now answer this question:

> Can a developer, adult reviewer, or future agent understand exactly why Grammar showed a child a given status, Star count, dashboard action, repair path, or reward event — and can the repo prove that those flows remain correct under refresh, concurrency, seeded browser state, legacy migration, and UI copy drift?

The answer after Phase 7 should be yes.

Phase 7 should focus on:

1. Quality-of-life polish for the child and adult Grammar surfaces.
2. Debugging and traceability for Star / reward / command / read-model flows.
3. Logic correction where current copy, availability, filters, or summary displays conflict with the Phase 5–6 contracts.
4. Hardening the untested edge cases explicitly deferred by Phase 6.
5. Refactoring brittle dependency and duplication patterns before new content or Hero expansion builds on them.

This contract intentionally avoids implementation sequencing. The next agent should read this file and produce its own implementation plan with units, files, tests, reviewer prompts, and ordering.

## 1. Product scope

Phase 7 is allowed to change how existing Grammar surfaces explain, debug, and display state. It is allowed to harden tests, add developer-only or adult/admin-only diagnostic views, add deterministic browser-test fixtures, and refactor shared modules.

Phase 7 is not allowed to expand the learning product with new content, new modes, new monsters, new economies, or new child-facing reward systems.

### 1.1 Product goals

The child experience should become calmer and more consistent.

The adult/debug experience should become more explainable.

The engineering system should become easier to trust and easier to refactor safely.

The reward layer should remain motivational but honest: Stars are evidence, not per-question XP; 1 Star finds the Egg; 100 Stars means retained mastery.

### 1.2 Product non-goals

Do not add new Grammar templates.

Do not migrate answer specs unless the work is a no-behaviour-change audit or drift guard. Behaviour-changing answer-spec migration belongs to a dedicated content/release-id phase.

Do not bump `GRAMMAR_CONTENT_RELEASE_ID` unless a later implementation plan deliberately changes marking/content behaviour.

Do not add new child learning modes.

Do not introduce Hero Coins, Hero Camp, Hero economy, or Hero reward writes in this phase.

Do not make any debug panel visible to children by default.

Do not make the Grammar engine aware of Stars. The Phase 6 boundary remains: the engine produces learning state and domain events; the command handler / projection bridge may derive Star-evidence events; reward projection persists high-water state.

Do not loosen Phase 4, Phase 5, or Phase 6 invariants silently. If an invariant must change, it must be changed in a dedicated PR with migration and test updates.

## 2. Current state inherited from Phase 6

Phase 6 reports that all nine trust units shipped to `main`, closing six confirmed Star pipeline defects:

- production attempt shape mismatch;
- wrong-only variedPractice inflation;
- retainedAfterSecure missing temporal proof;
- sub-secure Star loss after recentAttempts rollover;
- 1-Star Egg being display-only;
- dashboard live evidence using the wrong data path.

Phase 6 also reports these explicit deferred or residual risks:

- no Playwright state-seeding infrastructure for post-session Star-update visual tests;
- no production-scale concurrent answer-submission test;
- worktree stale-base hazards during autonomous SDLC;
- content expansion and answer-spec migration gated on separate product decision.

Phase 7 should treat those as inherited obligations, not optional ideas.

## 3. Product contract for child surfaces

### 3.1 The child dashboard remains simple

The Grammar dashboard must keep the Phase 5 one-primary-action structure.

The child should see one obvious action: **Start Smart Practice**.

Grammar Bank, Mini Test, and Fix Trouble Spots remain secondary.

Learn, Sentence Surgery, Sentence Builder, Worked Examples, Faded Guidance, and Writing Try remain tucked under More practice.

No debug, adult, developer, evidence, projection, Worker, denominator, or read-model wording may appear on child surfaces.

### 3.2 Monster display must be Star-based everywhere children see monster progress

The dashboard already uses a 4-monster Star strip. Phase 7 must audit every remaining child-facing monster display and remove raw concept-count displays where they conflict with the 100-Star contract.

The child-facing standard is:

```text
Bracehart — Hatched — 18 / 100 Stars
```

The child-facing anti-pattern is:

```text
Bracehart 2/6
```

Raw concept counts may remain in adult/admin diagnostic surfaces, but not in the default child round summary, dashboard, Grammar Bank, or celebration UI.

### 3.3 Due means due

If a child sees a `Due` filter, card, or badge, it must reflect actual due/review scheduling, not a loose proxy for `building` or `needs-repair`.

If the product intentionally means "things worth reviewing soon" rather than truly due, rename the copy to **Review soon** or **Practise next**.

The child should not be told something is due simply because the internal confidence label is `building`.

### 3.4 Writing Try availability must not depend on AI

Writing Try is a non-scored transfer-writing lane. It is not an AI feature.

The dashboard must not hide Writing Try because AI enrichment is disabled. Writing Try availability should be based on transfer-lane readiness, prompt availability, runtime read-only state, or subject capability — not the `aiEnrichment.enabled` flag.

If Writing Try cannot be shown because the transfer lane is not loaded, the UI should explain the safe path or hide it consistently without implying AI is required.

### 3.5 Child confidence fallback must be honest

Unknown or out-of-taxonomy confidence labels must not silently display as `Learning` if that makes the status look real.

For child surfaces, acceptable fallback copy is something neutral such as **Check status** or **Practise next**, with a debug warning in tests. Adult/admin surfaces should surface an unknown-status diagnostic rather than pretending the label is valid.

### 3.6 Summary should match dashboard semantics

The round summary should use the same Star/monster vocabulary as the dashboard.

If the summary includes monster progress, it should show each active Grammar monster with stage label and Stars, not raw mastered concept counts.

Mini-test summary may keep score and review details, but any monster/progress element remains Star-based.

## 4. Product contract for adult/admin/debug surfaces

### 4.1 Adult surfaces may be detailed, but they must be clearly named

Adult surfaces may show live confidence, sample size, due status, concept counts, question-type evidence, and Star debug details.

They should not use stale labels like **Reserved reward routes** when the routes are active Grammar creature routes.

Adult copy should separate:

- child motivation progress: Stars and high-water stage;
- live diagnostic status: confidence, due, recent misses, weak concepts;
- content coverage status: template count, question-type variety, thin pools.

### 4.2 Add a Star explanation contract

An adult/admin/debug user should be able to answer:

> Why does this monster show 42 Stars?

The answer must be explainable without reading code.

A Star explanation should include, at minimum:

- monster id and name;
- display Stars and `starHighWater`;
- computed live Stars, if available;
- legacy floor, if applied;
- stage name and next milestone;
- concepts included in that monster;
- per-concept tier status: firstIndependentWin, repeatIndependentWin, variedPractice, secureConfidence, retainedAfterSecure;
- whether the Star total came from live derivation, persisted high-water, or legacy migration floor;
- whether some evidence is no longer explainable from the rolling recentAttempts window.

This surface must be adult/admin/debug only. It must not expose correct answers, accepted-answer lists, private generated content, AI internals, or raw server-only template closures.

### 4.3 Add a command/reward trace contract

A developer should be able to trace one Grammar command across:

1. client action;
2. subject command request;
3. engine mutation;
4. domain events;
5. `grammar.star-evidence-updated` events;
6. reward projection events;
7. read-model output;
8. child-visible state.

Every trace must be correlated by stable identifiers. `requestId`, session id, item id, learner id, subject id, command name, and event ids must be inspectable in a redacted debug context.

Event ids used only for debug/replay should be deterministic enough to reproduce a scenario. Avoid `Date.now()` as the only unique input when deterministic replay or idempotent debugging matters.

### 4.4 Debug must be redacted by default

Debug output must never expose:

- accepted-answer sets;
- marking closures or generator functions;
- private AI prompt/output internals;
- adult review copy in child contexts;
- learner data across family/account boundaries;
- raw event-log data without access checks.

## 5. Engineering contract: logic corrections to verify first

The next implementation plan should begin by verifying and either fixing or explicitly rejecting these suspected contract gaps.

### 5.1 Child summary monster progress appears to use raw concept counts

The current summary view model still builds a `monster-progress` card from `mastered/total`, and the summary JSX renders entries as `monster.name monster.mastered/monster.total`.

This appears to conflict with the Phase 5 invariant that child monster progress uses `X / 100 Stars`, not raw concept counts.

Contract: child summary monster progress must use the Star display model or remove monster progress from the child summary.

### 5.2 Writing Try availability appears coupled to AI capability

The dashboard view model currently derives `writingTryAvailable` from `aiEnrichment.enabled`.

Contract: Writing Try must be available according to transfer-lane capability, not AI capability. AI disabled must not hide non-scored writing transfer if transfer prompts are otherwise available.

### 5.3 Grammar Bank `Due` filter appears to be confidence-label based

The current Grammar Bank filter helper treats `due` as `needs-repair` or `building` rather than actual `dueAt` / due-now status.

Contract: either make `Due` schedule-true, or rename the filter to a child-safe review label.

### 5.4 Adult route copy still says `Reserved reward routes`

The adult analytics scene appears to label active Grammar route progress as `Reserved reward routes`.

Contract: adult copy must reflect the current 3+1 active model and reserve-only model accurately. The child must never see reserve monster routes.

### 5.5 Shared Star module imports platform mastery data

The shared Grammar Star module is described as a pure shared module, but it imports concept mappings from the platform mastery module. The platform mastery module imports a thin re-export back to the shared Star module.

Even if tests currently pass, this is a brittle dependency direction.

Contract: shared pure modules should not depend on platform/game modules. The concept mapping needed by Star computation should live in a shared, pure, dependency-safe module, or be passed into Star computation as data.

### 5.6 Star evidence is persisted as high-water, not as a fully explainable tier ledger

Phase 6 made `starHighWater` durable. That is good. But a high-water integer alone may not explain why a child has 42 Stars after recentAttempts have rolled.

Contract: by the end of Phase 7, the system must either:

- persist enough tier-level Star evidence to explain high-water progress; or
- provide a clear debug statement that the high-water was earned earlier and the detailed tier evidence is no longer available from the bounded read model.

The preferred direction is a small, redacted, server-owned Star evidence ledger or projection that records tier unlocks by concept and monster without exposing answer content.

### 5.7 Retention timing still relies on an estimate

Phase 6 improved retainedAfterSecure by requiring a post-secure timestamp, but it estimates the secure time using `nowTs - intervalDays * dayMs`.

Contract: retainedAfterSecure should become easier to reason about. The preferred direction is to record the time a concept first became secure, or otherwise expose the estimate and its confidence in debug output. If the estimate remains, it must be documented as an approximation with explicit tests around regression and interval changes.

### 5.8 Stage/displayStage divergence must be controlled

The legacy monster system still has internal `stage` 0-4, while the child-facing Star model has display stages 0-5.

Contract: child-facing Grammar UI must consume Star fields (`stars`, `starMax`, `stageName`, `displayStage`) rather than legacy `stage` when showing Grammar monster progress. Legacy `stage` remains allowed for compatibility, not for new child UI.

## 6. Engineering contract: debugging and observability

### 6.1 Add a Grammar Star Debug Model

Phase 7 should specify and implement a redacted model that can be used by tests and adult/admin debug surfaces.

The debug model should be pure and serialisable. It should be safe to snapshot in tests.

It should answer:

- what was computed live;
- what was persisted;
- what came from legacy floor;
- what thresholds were crossed;
- what evidence tiers are unlocked per concept;
- what evidence was rejected and why, at least at a categorical level.

Rejected evidence categories should include:

- wrong answer;
- supported attempt for independent tier;
- pre-secure correct for retention tier;
- missing timestamp;
- wrong concept id;
- duplicate tier already earned;
- view-only / AI / Writing Try / non-scored event.

### 6.2 Add a Grammar Command Trace Model

A developer-only trace model should show how a command changed Grammar state.

This does not need to be a production child feature. It may be a test helper, admin-only endpoint, or structured debug payload behind a safe flag.

The trace model should make it possible to inspect:

- command name and request id;
- before/after learner revision;
- generated domain events;
- generated Star events;
- generated reward events;
- whether projection state changed;
- whether runtime state changed;
- whether the read model changed;
- whether the command was a no-op.

### 6.3 Improve event id determinism and correlation

`grammar.star-evidence-updated` events should be traceable across retries, logs, and replay. Event ids should incorporate stable data where possible: request id, session id, item id, monster id, concept id, and threshold/star value.

Contract: duplicate submission or same request replay must not produce duplicate durable reward transitions.

### 6.4 Add a debug-friendly state seeding contract for browser tests

Phase 6 explicitly deferred post-session Star-update Playwright tests because no state-seeding endpoint exists.

Phase 7 should add a test-only or demo-only seeding mechanism that can create deterministic Grammar states for browser tests without widening production attack surface.

The mechanism must be unavailable in production or guarded by a test/demo environment flag.

It should support at least:

- fresh learner;
- 1-Star Egg state;
- 14 Stars, one point before Hatch;
- 34 Stars, one point before Growing;
- 64 Stars, one point before Nearly Mega;
- 99 Stars, one point before Mega;
- 17/18 aggregate secured concepts for Concordium regression testing;
- Writing Try evidence state;
- weak/due concept state.

### 6.5 Add a concurrency test contract

Phase 6 reports that concurrent HTTP answer submission is theoretically safe through the monotonic max latch, but not production-scale tested.

Phase 7 should require tests for concurrent and replay-like cases:

- two tabs submit the same answer;
- two different answers for the same current item arrive close together;
- `star-evidence-updated` and `concept-secured` events occur in either order;
- reward projection sees duplicate events;
- command request replay returns the same result without extra reward toasts;
- stale learner revision is rejected or reconciled according to existing Worker command contracts.

The contract is not that every concurrent request succeeds. The contract is that the system cannot double-award, regress, corrupt, or show contradictory child state.

## 7. Engineering contract: refactor boundaries

### 7.1 Extract shared Grammar roster and concept mapping

Avoid circular or surprising dependency flows between `shared/grammar` and `src/platform/game`.

The canonical Grammar concept-to-monster mapping, active Grammar monster ids, reserved Grammar monster ids, and aggregate concept list should have a single dependency-safe source.

Possible acceptable outcomes:

- a new shared pure module used by both Worker and client; or
- passing the mapping into shared Star functions as an explicit parameter; or
- moving Star computation fully into a layer that already owns the mapping.

The next implementation agent should choose the least disruptive path, but the end state must be easier to reason about than shared code importing platform code while platform code re-exports shared code.

### 7.2 Centralise monster progress display model

Dashboard and summary should not build different monster progress shapes.

One child-facing helper should build Grammar monster display entries:

```ts
{
  monsterId,
  name,
  stageName,
  stars,
  starMax,
  displayStage,
  nextMilestoneLabel,
  nextMilestoneStars,
  accentColor
}
```

Child surfaces should use that shape.

Adult surfaces may use a richer shape that includes concept counts and live confidence, but it must be clearly separate.

### 7.3 Centralise status filter semantics

Grammar Bank filters, dashboard due/trouble cards, Adult diagnostics, and Hero provider reasoning should not each define their own meaning for due, trouble, weak, learning, and secure.

Phase 7 should define a small shared status/filter contract for Grammar UI:

- schedule-true due;
- needs-repair/trouble;
- building/learning;
- consolidating/nearly secure;
- secure;
- new.

If a label is child-copy only, make that explicit.

### 7.4 Keep Worker engine Star-unaware

Do not import Star modules into the engine.

The engine remains responsible for grammar learning state and answer processing.

The command handler / projection bridge may derive Star-evidence events from engine output, as Phase 6 established.

### 7.5 Keep Hero read-only relative to Grammar Stars

Hero code may read Grammar status and launch subject envelopes, but must not write Grammar subject state, Grammar reward state, Grammar Stars, or Grammar evidence tiers.

Grammar P7 may add debug fields or launch context passthrough tests if needed, but should not implement Hero Coins, Hero Camp, or Hero reward mechanics.

## 8. Learning-integrity contract

Phase 7 must preserve the learning model.

The child still receives a genuine independent attempt before help in score-bearing practice.

Wrong answer flow remains: short nudge, retry, optional support.

Worked/faded support remains helpful but cannot unlock independent-win or retention Stars.

AI remains post-marking enrichment and never score-bearing.

Writing Try remains non-scored and gives zero Stars.

Mini Test remains strict before finish.

Stars remain evidence-based and non-linear.

Mega remains retained mastery, not secure-only mastery.

No debug or QoL work may weaken these contracts.

## 9. Test contract for Phase 7

The implementation plan derived from this contract should include tests in these categories.

### 9.1 Invariant ratchets

Add a Phase 7 invariants document only if P7 adds new non-negotiables. Otherwise extend existing invariant tests with P7-specific pins.

Required pins:

- child summary monster progress is Star-based;
- Writing Try availability does not depend on AI;
- `Due` filter is schedule-true or renamed;
- debug surfaces are adult/admin/test-only;
- Star debug model redacts answer content;
- no child surface uses legacy `stage` for Grammar monster display;
- shared dependency direction is acyclic or explicitly justified.

### 9.2 Browser tests

Add seeded browser tests for:

- 0 → 1 Star Egg visual update;
- 14 → 15 Stars Hatch visual update;
- 34 → 35 Stars Growing visual update;
- 64 → 65 Stars Nearly Mega visual update;
- 99 → 100 Stars Mega visual update;
- summary displays Star-based monster progress;
- Writing Try remains visible when AI is disabled, if transfer is available;
- fresh learner dashboard remains calm and one-CTA.

### 9.3 Concurrency tests

Add command-level tests for simultaneous/replayed answer submissions and reward-event duplicate protection.

### 9.4 Debug model tests

Add snapshot-style tests for Star explanations and command traces using redacted fixtures.

Tests must verify both presence and absence:

- presence of tier flags and thresholds;
- absence of answer specs, correct answers, private prompt internals, and adult-only review copy on child/debug surfaces where inappropriate.

### 9.5 Drift guards

Add or strengthen drift guards for:

- active Grammar monster roster;
- concept-to-monster mapping;
- Star thresholds and weights;
- child forbidden terms;
- debug-only imports not leaking into production child bundles;
- shared/platform dependency direction.

## 10. Release and validation contract

A Phase 7 implementation should not be accepted without:

- full `npm test` passing;
- `npm run check` passing;
- `npm run audit:client` passing;
- `npm run audit:production` passing;
- Grammar production smoke passing;
- Grammar Playwright passing, including seeded Star transition cases if the seed harness lands;
- no `GRAMMAR_CONTENT_RELEASE_ID` bump unless explicitly justified by a separate content/marking PR;
- no new child-facing forbidden terms;
- no change to active Grammar monster roster;
- no Writing Try scoring/reward mutation;
- no Hero write boundary regression.

The implementation report should include a short evidence table mapping each P7 contract section to tests and screenshots/logs where relevant.

## 11. Content and answer-spec positioning

Phase 6 report inherited content expansion and answer-spec migration as future items.

They are important, but they should not be the main P7 work unless the product owner explicitly changes priority.

The recommended sequence is:

1. P7: QoL, debug, logic correction, hardening, refactor.
2. P8 or P7B: content expansion for thin-pool concepts and answer-spec migration.

If a P7 bug fix discovers a genuine marking flaw, it may trigger a small content/answer-spec correction, but that correction must follow content release discipline: release-id impact reviewed, oracle fixtures refreshed, and stored-attempt behaviour documented.

## 12. Highest-priority P7 acceptance statements

By the end of Phase 7, these statements should be true:

1. A child never sees raw `2/6` monster progress on the default Grammar child surfaces.
2. A child can still start Grammar from one obvious CTA.
3. A child can see Writing Try when transfer is available, even if AI is disabled.
4. `Due` means due, or it is renamed.
5. An adult/admin/debug user can explain any Grammar monster's Star count without reading code.
6. Star and reward events can be traced from command to child-visible state.
7. Browser tests can seed meaningful Grammar Star states and verify threshold transitions.
8. Concurrent or replayed answer submissions cannot double-award, regress, or corrupt Stars.
9. Shared Grammar Star code no longer depends awkwardly on platform/game code, or the dependency is explicitly isolated and tested.
10. No Phase 4, Phase 5, or Phase 6 invariant is weakened.

## 13. Suggested report title for the eventual implementation

When P7 is implemented, the completion report should be named something like:

```text
docs/plans/james/grammar/grammar-phase7-implementation-report.md
```

Suggested report subtitle:

```text
Grammar Phase 7 — QoL, Debuggability, Logic Correction & Refactor Hardening Implementation Report
```

The report should separate:

- child QoL fixes;
- adult/debug observability;
- engineering hardening;
- refactors;
- deliberately deferred content work.

## 14. Final contract sentence

Grammar Phase 7 should make the subject easier to use, easier to debug, and harder to accidentally corrupt: the child sees a calm one-action Grammar flow and honest 100-Star creature progress, while adults and engineers can trace every displayed Star back to safe, redacted, Worker-owned learning evidence without weakening the learning loop or expanding the feature set.
