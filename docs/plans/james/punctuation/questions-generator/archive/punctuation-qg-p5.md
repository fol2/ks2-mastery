# Punctuation QG P5 — Safe Production Capacity and Telemetry Attestation

Date: 2026-04-29  
Subject: Punctuation  
Area: Question generation, scheduler evidence, telemetry, and production release confidence  
Status: Proposed next phase after P4

## 1. Current validated baseline

P4 should be treated as a strong engineering phase, not as a full capacity release. The current production baseline should remain:

| Area | Current value |
|---|---:|
| Release id | `punctuation-r4-full-14-skill-structure` |
| Fixed evidence items | 92 |
| Generator families | 25 |
| DSL-backed generator families | 25 / 25 |
| Production generated variants per family | 4 |
| Production generated items | 100 |
| Production runtime items | 192 |
| Capacity-audit generated variants per family | 8 |
| Capacity-audit generated items | 200 |
| Capacity-audit runtime items | 292 |
| Published reward units | 14 |
| Runtime AI generation | None |

P4 converted the remaining legacy generator families to DSL-backed authoring and introduced better scheduler and Star-evidence mechanics. P5 should not undo that. P5 should turn the P4 capability into a release-grade capacity system.

## 2. Validation notes carried into P5

P4 is broadly credible, but P5 must explicitly close the following gaps before increasing generated volume in production.

### 2.1 Telemetry claim must be tightened

P4 declares 11 learning-health telemetry event names, but current source review indicates that not every declared event is emitted end to end by the Worker command path.

In particular, P5 must resolve these two events:

- `GENERATED_SIGNATURE_EXPOSED`
- `STAR_EVIDENCE_DEDUPED_BY_TEMPLATE`

For each telemetry event, P5 must decide whether it is:

1. emitted now,
2. reserved for a future phase, or
3. removed from the public Punctuation QG telemetry contract.

Do not report “11 emitted events” unless all 11 have an exercised command-path emission test.

### 2.2 Golden marking coverage must be exhaustive

P4 source review indicates that golden accept/reject marking tests do not currently cover every DSL-backed family. The test registry appears to cover 19 of 25 DSL families, while the generator bank is now 25 of 25 DSL-backed.

P5 must make golden marking coverage exhaustive and self-checking. A new DSL family must fail tests if it is not registered for golden accept/reject validation.

The likely missing families to verify and add are:

- `colon_list_combine`
- `semicolon_fix`
- `semicolon_combine`
- `colon_semicolon_paragraph`
- `bullet_points_fix`
- `bullet_points_paragraph`

Model-answer marking is not enough. P5 needs accept and reject cases that prove the validator accepts legitimate alternatives and rejects the target misconceptions.

### 2.3 Mixed-review scheduling needs a real path

P4 introduces a `MIXED_REVIEW` reason tag, but current scheduler logic depends on `session.recentModes`. If that field is not populated in normal sessions, mixed-review selection is effectively unreachable.

P5 must either wire `recentModes` end to end or remove/rename the mixed-review claim until it is real.

### 2.4 Misconception retry lifecycle is still not fully mature

P4 has sibling-retry selection logic and telemetry hooks, but P5 should prove the whole lifecycle:

- a misconception is detected,
- a sibling retry is selected,
- the retry is not the same visible item, signature, or template shape,
- the retry state is recorded,
- a later correct attempt emits a passed/repaired signal,
- the child is not trapped in a repeated retry loop.

### 2.5 Duplicate stems and models are still quality signals

P4 correctly gates duplicate generated signatures, not duplicate stems/models. However, duplicate stems and duplicate models still matter for learner-perceived variety.

P5 must not treat signature uniqueness as a complete content-quality proof. The reviewer report should require an explicit decision for each duplicate stem/model cluster:

- acceptable intentional overlap,
- needs rewrite before capacity raise,
- acceptable only at production depth 4,
- acceptable at depth 6,
- acceptable at depth 8.

### 2.6 Production smoke still needs stronger deployment attestation

Existing smoke coverage is useful, but P5 should distinguish:

- local source verification,
- CI verification,
- deployed Worker behaviour,
- authenticated Admin Hub behaviour,
- deployed commit/build attestation.

P5 should not overclaim production confidence unless the smoke result includes enough deployment metadata to prove which build was tested.

## 3. P5 objective

P5 should make Punctuation QG safe to operate at production scale and safe to increase capacity if the evidence supports it.

The goal is not “more questions”. The goal is:

> A fully DSL-backed, fully tested, telemetry-attested, release-safe Punctuation question engine that can keep production depth at 4 or raise selected/all families to 6 without weakening learning evidence or content quality.

## 4. Non-goals

P5 must not introduce runtime AI question generation.

P5 must not rewrite the whole Punctuation Star model. It may harden evidence gates, but the meaning of Stars should remain subject-owned learning evidence.

P5 must not create a second reward system inside Punctuation. Hero Coins, Hero Mode, or global reward economy work should stay outside the Punctuation subject engine.

P5 must not raise production generated volume before the telemetry, golden coverage, duplicate-review, and smoke gates are complete.

## 5. Implementation plan

### P5-U1 — Make golden marking coverage exhaustive

Create a single source of truth for all DSL-backed generator families used in production.

The golden marking test should fail if:

- a DSL-backed family is in `GENERATED_TEMPLATE_BANK` but missing from golden tests,
- a golden test references a family that is no longer published,
- a template has no accept cases,
- a template has no reject cases,
- a model answer fails marking,
- a target misconception is not rejected.

Add golden accept/reject coverage for the six likely missing families:

- colon-list combine,
- semicolon fix,
- semicolon combine,
- colon/semicolon paragraph repair,
- bullet-point fix,
- bullet-point paragraph repair.

Acceptance:

- Golden marking reports 25 / 25 families covered.
- A deliberately omitted family fails the test.
- All templates at production depth 4 have model-answer, accept-case, and reject-case coverage.
- Capacity depth 8 model answers are also checked.

### P5-U2 — Align telemetry declaration, emission, and tests

Create an explicit telemetry manifest with one of these statuses for each event:

- `emitted`,
- `reserved`,
- `deprecated`.

Every `emitted` event must have a command-path test proving it can be produced by normal Worker execution. Every `reserved` event must be excluded from “emitted telemetry” counts in reports.

Resolve at least:

- `GENERATED_SIGNATURE_EXPOSED`,
- `STAR_EVIDENCE_DEDUPED_BY_TEMPLATE`.

Recommended behaviour:

- Emit `GENERATED_SIGNATURE_EXPOSED` whenever a generated item is selected for a learner-facing active item, with an opaque signature only.
- Emit `STAR_EVIDENCE_DEDUPED_BY_TEMPLATE` only if Star projection can actually detect and report template-level deduplication. Otherwise mark it as reserved.

Acceptance:

- Reports distinguish declared, emitted, reserved, and deprecated events.
- No telemetry payload contains raw answers, accepted answers, full validator internals, or template internals.
- A test proves every emitted event is exercised through the Worker command path.
- P5 report does not count reserved events as emitted.

### P5-U3 — Add a Punctuation QG learning-health report

Create a safe report that can be run in CI and optionally in Admin/debug mode.

It should include:

- generated signature exposure count,
- generated signature repeat rate,
- scheduler reason distribution,
- misconception retry scheduled/pass rate,
- spaced-return scheduled/pass rate,
- retention-after-secure scheduled/pass rate,
- Star evidence dedupe by signature/template,
- production depth and capacity depth,
- duplicate signature count,
- duplicate stem/model clusters,
- unsupported/reserved telemetry events.

Acceptance:

- The report can run without exposing raw learner answers.
- The report works on synthetic fixtures.
- The report has a JSON mode for CI and a readable mode for humans.
- The report fails strict mode if emitted telemetry is missing command-path coverage.

### P5-U4 — Make mixed-review scheduling reachable or remove the claim

If mixed review is kept, persist recent mode history in normal sessions.

Implementation options:

1. Store `session.recentModes` when items are selected and answered.
2. Derive recent modes from recent attempt metadata.
3. Remove the `MIXED_REVIEW` reason tag until the session model can support it.

Acceptance:

- A deterministic test creates recent attempts/modes and proves `MIXED_REVIEW` can be selected.
- The scheduler does not overselect mixed review at the expense of due retention or weak-skill repair.
- If the feature is removed, documentation and telemetry no longer claim it.

### P5-U5 — Complete misconception sibling-retry lifecycle

Harden the sibling-retry behaviour introduced in P4.

A retry candidate must differ from the missed item by:

- item id,
- variant signature where present,
- visible stem where practical,
- template id where practical.

P5 should prevent loops where the same misconception repeatedly schedules near-identical retries.

Acceptance:

- A missed misconception schedules a sibling retry.
- The sibling retry is not a replay of the same item.
- A successful retry emits or records a repaired/pass signal.
- Repeated failures do not trap the learner in one narrow template shape.
- Retry behaviour is covered for both fixed and generated items.

### P5-U6 — Clarify support evidence

P4 carries support-aware Star projection fields, but support evidence should be either fully wired or clearly labelled as future-ready.

P5 must decide:

- Is Punctuation currently emitting supported/guided attempts?
- If yes, where is support kind captured?
- If no, reports must not imply supported evidence is an active production signal.

Acceptance:

- Supported attempts are either end-to-end tested or marked as reserved/future-ready.
- Supported attempts cannot unlock deep secure evidence unless the Star contract explicitly allows it.
- Documentation uses the same wording as code behaviour.

### P5-U7 — Review duplicate stems and models before any capacity raise

Extend the reviewer report so duplicate stem/model clusters require a decision.

Each cluster should show:

- family id,
- mode,
- template ids,
- variant signatures,
- visible stem/model summary,
- production-depth impact,
- capacity-depth impact,
- reviewer decision.

Acceptance:

- Duplicate generated signatures remain zero at production depth and capacity depth.
- Duplicate stems/models are not silently ignored.
- Production depth 6 is blocked if unreviewed duplicate clusters would become learner-visible in a way that reduces variety.

### P5-U8 — Controlled production capacity decision

P5 may raise production generated depth, but only after P5-U1 to P5-U7 pass.

Recommended release policy:

- Keep default production depth at 4 until all P5 gates are green.
- First consider raising selected low-risk families from 4 to 6.
- Consider all-family depth 6 only after duplicate review and telemetry alignment.
- Keep all-family depth 8 as a release candidate or canary, not the default first raise.

Counts:

| Production decision | Runtime count |
|---|---:|
| Keep current depth 4 | 92 + 25 × 4 = 192 |
| Raise all families to depth 6 | 92 + 25 × 6 = 242 |
| Raise all families to depth 8 | 92 + 25 × 8 = 292 |

If only selected families are raised, the formula is:

```text
runtime = 92 + (familiesAt4 × 4) + (familiesAt6 × 6) + (familiesAt8 × 8)
```

Any production volume change must use a new release id. Suggested pattern:

```text
punctuation-r5-qg-capacity-<depth-or-mixed-depth>
```

Acceptance:

- Release id changes if production item count changes.
- Star evidence remains release-scoped.
- Old release evidence does not inflate new release Stars.
- High-water Stars are preserved safely.
- Production smoke asserts the new runtime count.

### P5-U9 — Strengthen production smoke and deployment attestation

Improve smoke tests so they can prove what was tested.

Add to smoke output:

- deployed environment,
- subject release id,
- runtime item count,
- generated depth,
- Worker build id or commit sha where available,
- timestamp,
- authenticated/unauthed coverage status,
- Admin Hub coverage status.

Acceptance:

- Smoke fails on runtime count mismatch.
- Smoke fails if generated metadata leaks beyond approved opaque fields.
- Smoke reports whether Admin Hub authenticated checks were run or skipped.
- If Admin credentials are not available, the report says so clearly instead of implying full Admin coverage.

### P5-U10 — Tighten completion-report language

The P5 completion report must distinguish:

- declared telemetry vs emitted telemetry,
- manifest coverage vs command-path coverage,
- model-answer validation vs golden accept/reject validation,
- production depth vs capacity depth,
- source validation vs deployed production validation,
- current behaviour vs future-ready fields.

Acceptance:

- No phase-completion claim depends only on a manifest export when actual command-path behaviour matters.
- Known residual risks are listed with owner, severity, and next action.
- Runtime counts are shown with formulae.

## 6. Proposed verification command

Add a P5 verification command rather than relying only on the P4 aggregate command.

Suggested script:

```json
{
  "verify:punctuation-qg:p5": "node scripts/verify-punctuation-qg-p5.mjs"
}
```

The command should run:

```bash
npm run audit:punctuation-content -- --strict --generated-per-family 4 --require-all-dsl
npm run audit:punctuation-content -- --strict --generated-per-family 8 --min-signatures-per-family 8 --require-all-dsl
npm test -- --runTestsByPath tests/punctuation-golden-marking.test.js
npm test -- --runTestsByPath tests/punctuation-dsl-conversion-parity.test.js
npm test -- --runTestsByPath tests/punctuation-scheduler.test.js
npm test -- --runTestsByPath tests/punctuation-star-projection.test.js
npm test -- --runTestsByPath tests/punctuation-telemetry.test.js
node scripts/audit-punctuation-content.mjs --reviewer-report --require-all-dsl
node scripts/punctuation-qg-health-report.mjs --strict --fixture synthetic
```

If production depth is changed, the verification command must also assert the new runtime total and release id.

## 7. Suggested implementation order

1. Fix golden coverage first. This is the clearest hard gap.
2. Align telemetry declaration/emission/tests.
3. Make mixed review reachable or remove the claim.
4. Complete misconception retry lifecycle.
5. Add the learning-health report.
6. Review duplicate stems/models.
7. Decide whether to raise production depth to 6.
8. Update smoke and deployment attestation.
9. Write a completion report with exact emitted-vs-declared wording.

## 8. Definition of done

P5 is complete when:

- all 25 DSL families have exhaustive golden accept/reject coverage,
- all emitted telemetry events have command-path tests,
- reserved telemetry events are not counted as emitted,
- mixed-review behaviour is either real or not claimed,
- misconception sibling retry works end to end,
- duplicate stem/model clusters are reviewed,
- strict production audit and capacity audit pass,
- production smoke can prove the deployed runtime shape,
- no runtime AI generation is introduced,
- production generated depth is either deliberately kept at 4 or safely raised with a new release id and clear evidence.

A successful P5 does not have to raise production depth. Keeping depth 4 is acceptable if the evidence says quality is better protected that way.

## 9. After P5

If P5 closes these gates, the Punctuation QG engine should be considered release-mature.

A later optional P6 should not be another question-generation phase unless monitoring shows a problem. P6 should focus on broader product integration, such as:

- long-term monitoring dashboards,
- cross-subject Hero Mode task envelopes,
- subject landing-page alignment,
- adult-facing learning health explanations,
- content portfolio expansion based on real learner data.
