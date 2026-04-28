# Punctuation Question Generator P2 Completion Report

Date: 28 April 2026

Report status: final post-merge completion report

Source plan: `docs/plans/james/punctuation/questions-generator/punctuation-qg-p2.md`

Implementation plan: `docs/plans/2026-04-28-002-feat-punctuation-qg-p2-depth-release-gate-plan.md`

Current verification base: `origin/main` at `d1e0be77 docs(admin): add P5 completion report - operator readiness, evidence, and QoL (#537)`

Primary production target: `https://ks2.eugnel.uk`

## Executive Verdict

Punctuation QG P2 is complete.

P2 did not merely add more questions. It changed the release shape of the Punctuation subject from a larger deterministic bank with useful P1 guardrails into a release-gated subject slice with explicit evidence boundaries:

- content growth is audited before merge;
- learner Star evidence is scoped to the active release;
- generated metadata has a documented transport and redaction contract;
- dash and list-comma marking policies are visible and tested;
- deterministic generator capacity is deeper without raising production generated volume;
- live production smoke now verifies the Worker command path, generated attempts, review redaction, dash acceptance, Oxford-comma acceptance, and English Spelling parity.

The final P2 runtime remains deterministic. It does not introduce runtime AI question generation, browser-owned random generation, or AI-owned marking.

Final production-shape figures:

| Metric | Final P2 value | Why it matters |
| --- | ---: | --- |
| Release id | `punctuation-r4-full-14-skill-structure` | Anchors reward evidence and smoke validation to a named release. |
| Fixed items | 92 | P2 added human-authored anchor depth rather than only increasing generated volume. |
| Published generator families | 25 | Maintains the deterministic generator surface from P1. |
| Generated variants per family | 4 | Keeps production generated volume stable. |
| Generated runtime items | 100 | Preserves the P1 production generated volume. |
| Total runtime items | 192 | Moves the bank into the planned 190-215 P2 band. |
| Published reward units | 14 | Keeps the reward denominator stable. |
| Generated duplicate signatures | 0 | The hard generated-surface uniqueness gate is clean. |

The most important product conclusion is this: P2 increases practice depth without making Stars easier. More learner surfaces are available, but the 14 reward units still require secured evidence rather than raw item completion.

## Completion Ledger

| Unit | PR | Merge commit | Merged at | Purpose |
| --- | --- | --- | --- | --- |
| U1 | [#492](https://github.com/fol2/ks2-mastery/pull/492) | `ac7bf726badc83d60ac52c92a45212a66de6bb55` | 2026-04-28 18:05:57 UTC | Add the dedicated Punctuation content-audit CI gate. |
| U2 | [#495](https://github.com/fol2/ks2-mastery/pull/495) | `74a605183b99ab2aa880673a0494612f35ba0072` | 2026-04-28 18:33:21 UTC | Scope Punctuation Stars to current-release evidence. |
| U3 | [#498](https://github.com/fol2/ks2-mastery/pull/498) | `670855d260ab0a967390fcc1ca883752356831ed` | 2026-04-28 19:17:10 UTC | Add P2 fixed anchor depth for priority skills. |
| U4 | [#502](https://github.com/fol2/ks2-mastery/pull/502) | `fe70dc9b63175d9c921dbafc7603b5c289ad7922` | 2026-04-28 19:49:44 UTC | Codify generated metadata transport and redaction policy. |
| U5 | [#506](https://github.com/fol2/ks2-mastery/pull/506) | `4ab2525a6fd87d7a0cd68098bfec713e5cb21409` | 2026-04-28 20:22:31 UTC | Clarify dash display and list-comma marking policy. |
| U6 | [#508](https://github.com/fol2/ks2-mastery/pull/508) | `d6cc3887b69f751b3c8fab1dc8926fcbd82de2d3` | 2026-04-28 20:58:13 UTC | Expand deterministic generator and context-pack capacity. |
| U7 | [#514](https://github.com/fol2/ks2-mastery/pull/514) | `058a8f728748c2bee4d29406e9a26477838dd71a` | 2026-04-28 22:17:14 UTC | Extend production smoke and record final P2 evidence. |

## What P2 Changed

### U1 - Content Audit Release Gate

U1 made the Punctuation content audit a first-class PR gate instead of a useful local script.

The important shift is that generated-family count, distinct template count, distinct signature count, duplicate generated signatures, fixed-anchor depth, validator coverage, and generated model-answer marking are now part of the normal merge path.

Files and surfaces involved:

- `.github/workflows/punctuation-content-audit.yml`
- `scripts/audit-punctuation-content.mjs`
- `tests/punctuation-content-audit.test.js`
- `package.json`

Risk closed:

- content can no longer grow quietly without the release gate noticing missing generated families, weak signature coverage, or generated model answers that fail marking.

Evidence:

- PR #492 merged.
- `npm run audit:punctuation-content -- --strict --generated-per-family 4` is now a PR check.

### U2 - Release-Scoped Stars

U2 fixed the most serious release-safety risk in the plan: old-release reward-unit evidence inflating current-release Stars.

The projection now filters reward-unit evidence to the active release before projecting Secure, Mastery, and Grand Stars. It preserves generated attempt coalescing and legacy compatibility for signed/unsigned generated attempts, but it stops retired or mismatched release evidence from counting as current release mastery.

Files and surfaces involved:

- `src/subjects/punctuation/star-projection.js`
- `tests/punctuation-star-projection.test.js`
- `tests/punctuation-read-model.test.js`

Risk closed:

- learners with older Punctuation evidence should not receive inflated current-release Star totals only because a previous release had compatible-looking reward-unit rows.

Evidence:

- PR #495 merged.
- Red-first tests were added for old-release, mixed-release, and missing-release cases before implementation.
- The PR full suite passed with `5797` passing tests and `0` failures.

### U3 - Fixed Anchor Depth

U3 added 21 human-authored fixed anchors across the priority thin skills:

- `sentence_endings`
- `apostrophe_contractions`
- `comma_clarity`
- `semicolon_list`
- `hyphen`
- `dash_clause`

This is the correct product move because fixed anchors are teacher-authored evidence points. They make skill boundaries, misconception coverage, transfer prompts, and model answers more deliberate. P2 deliberately did not raise `generatedPerFamily` to chase a bigger runtime number.

Files and surfaces involved:

- `shared/punctuation/content.js`
- `tests/punctuation-marking.test.js`
- `tests/punctuation-content.test.js`
- `tests/punctuation-content-audit.test.js`
- `tests/punctuation-service.test.js`

Risk closed:

- the P1 bank had useful generated volume, but several priority skills still had thin fixed anchors. P2 strengthens the manually reviewed content base.

Evidence:

- PR #498 merged.
- The final production audit now reports `fixed items: 92`.
- The final runtime total is `92 fixed + 100 generated = 192`.

### U4 - Generated Metadata Transport Policy

U4 made the generated metadata boundary explicit.

The chosen policy is pragmatic:

- active generated `session.currentItem` may carry an opaque `variantSignature`;
- `templateId`, validators, accepted answers, raw generated internals, and server-only marking details remain server-side;
- Smart Review feedback, summary branches, analytics-like nested payloads, GPS delayed review rows, Parent Hub, Admin evidence, and adult evidence must not expose generated internals.

Files and surfaces involved:

- `docs/punctuation-production.md`
- `src/subjects/punctuation/client-read-models.js`
- `src/subjects/punctuation/read-model.js`
- `worker/src/subjects/punctuation/read-models.js`
- `tests/punctuation-read-models.test.js`
- `tests/punctuation-gps.test.js`
- `tests/punctuation-map-redaction.test.js`
- `tests/punctuation-release-smoke.test.js`

Risk closed:

- generated attempts need a stable evidence binding key, but review and adult surfaces must not leak hidden generated metadata.

Evidence:

- PR #502 merged.
- Targeted read-model, GPS, map-redaction, service, and React scene tests passed.

### U5 - Dash And List-Comma Policy

U5 cleaned up two learner-facing punctuation-policy traps.

Dash policy:

- learner marking accepts spaced hyphen, en dash, and em dash variants where the item is testing dash clauses;
- model answers display a spaced en dash for dash teaching instead of teaching a spaced hyphen as the canonical dash form.

List-comma policy:

- default free-text list-comma content accepts an otherwise-correct Oxford comma;
- strict no-final-comma items must make that house-style rule visible in the prompt, explanation, rejection note, and audit guard.

Files and surfaces involved:

- `shared/punctuation/content.js`
- `shared/punctuation/generators.js`
- `shared/punctuation/marking.js`
- `tests/punctuation-marking.test.js`
- `tests/punctuation-generators.test.js`
- `tests/punctuation-content-audit.test.js`
- `tests/punctuation-view-model.test.js`

Risk closed:

- children should not be penalised for sensible dash variants or for an Oxford comma unless the task explicitly teaches a no-final-comma convention.

Evidence:

- PR #506 merged.
- `156/156` targeted tests passed.
- `npm run audit:punctuation-content -- --strict --generated-per-family 4` passed.

### U6 - Deterministic Capacity Without Runtime Expansion

U6 expanded spare deterministic generator capacity while keeping production `generatedPerFamily` at 4.

The priority capacity target was achieved for:

- `gen_sentence_endings_insert`
- `gen_apostrophe_contractions_fix`
- `gen_comma_clarity_insert`
- `gen_dash_clause_fix`
- `gen_dash_clause_combine`
- `gen_hyphen_insert`
- `gen_semicolon_list_fix`

Each of these priority families can now produce eight generated items, eight distinct templates, and eight distinct variant signatures in capacity mode. Production still takes the stable four-variant runtime window.

Files and surfaces involved:

- `shared/punctuation/generators.js`
- `shared/punctuation/context-packs.js`
- `tests/punctuation-generators.test.js`
- `tests/punctuation-ai-context-pack.test.js`
- `tests/punctuation-content-audit.test.js`

Risk closed:

- future growth should come from real deterministic template variety, not from reusing the same cognitive surface with different nouns.

Evidence:

- PR #508 merged.
- Production audit stayed at `generated=100`, `runtime=192`, `reward units=14`.
- Capacity audit demonstrated `generatedPerFamily=8` with `generated=200` and `runtime=292` in audit-only mode.
- Expected non-priority duplicate residuals are pinned by tests rather than silently accepted.

### U7 - Production Smoke And Final Evidence

U7 turned P2 from source-level confidence into production-observed confidence.

The live smoke intentionally uses the Worker command boundary and demo-accessible production flows. It does not introduce a new browser framework or admin-only requirement.

Files and surfaces involved:

- `scripts/punctuation-production-smoke.mjs`
- `tests/punctuation-release-smoke.test.js`
- `docs/plans/james/punctuation/questions-generator/punctuation-qg-p2-completion-report-2026-04-28.md`

Risk closed:

- P2 now has a repeatable smoke that verifies production runtime behaviour, not just local source assumptions.

Evidence:

- PR #514 merged.
- GitHub checks on the final U7 PR passed:
  - `npm run audit:client`
  - `npm run audit:punctuation-content`
  - `npm test + npm run check`
  - GitGuardian Security Checks
- The Playwright PR job was skipped by configuration, not failed.

## Acceptance Criteria Review

| Original P2 acceptance criterion | Final status | Evidence |
| --- | --- | --- |
| Punctuation content audit is a CI-backed PR gate. | Done | PR #492 added `.github/workflows/punctuation-content-audit.yml`; PR #514 check passed. |
| Audit enforces per-family generated count, signature, and template coverage. | Done | Final audit reports every family at `generated=4`, `templates=4`, `signatures=4`. |
| Runtime production `generatedPerFamily` remains 4 unless separately approved. | Done | Final audit and smoke both show `generatedPerFamily: 4` expectation and `runtimeItems: 192`. |
| Fixed anchor count improves materially for the six priority skills. | Done | PR #498 added 21 fixed anchors; final audit reports 92 fixed items. |
| Runtime item total reaches approximately 190-215, mostly through fixed anchors. | Done | Final runtime is 192; the increase from P1 came from fixed anchors. |
| 14 published reward units remain unchanged. | Done | Audit and production smoke both report 14 published reward units. |
| Old-release reward-unit evidence cannot inflate current-release Stars. | Done | PR #495 added release-scoped projection tests and implementation. |
| Active/current-item generated metadata policy is explicit and tested. | Done | PR #502 documents and tests the opaque active-item `variantSignature` allowance. |
| GPS delayed-review redaction remains clean. | Done | PR #502 and PR #514 cover delayed-review redaction. |
| Dash and Oxford-comma policies are tested across exact and validator paths. | Done | PR #506 covers dash display, dash acceptance, and list-comma final-comma policy. |
| Production smoke is completed and attached to the P2 completion report. | Done | PR #514 added smoke coverage; this report records a current-main smoke pass. |
| No runtime AI-generated learner questions are introduced. | Done | Runtime remains deterministic; context-pack capacity remains teacher-authored and audit-backed. |

## Final Current-Main Audit Evidence

Command run from the isolated report worktree:

```bash
npm run audit:punctuation-content -- --strict --generated-per-family 4
```

Result: passed.

Headline output:

```text
fixed items: 92
generator families: 25
generated items: 100
runtime items: 192
published reward units: 14
generated duplicate signatures: 0
generated duplicate stems: 3
generated duplicate models: 22
```

The duplicate stems and models are content-review signals. The hard generated identity gate is duplicate signatures, which is clean.

Per-skill final audit summary:

| Skill | Fixed | Generated | Signatures | Validators | Modes |
| --- | ---: | ---: | ---: | ---: | --- |
| `sentence_endings` | 8 | 4 | 4 | 2 | choose, fix, insert, transfer |
| `list_commas` | 7 | 8 | 8 | 14 | choose, combine, fix, insert, transfer |
| `apostrophe_contractions` | 8 | 8 | 8 | 7 | choose, fix, insert, paragraph, transfer |
| `apostrophe_possession` | 5 | 8 | 8 | 10 | choose, fix, insert, paragraph, transfer |
| `speech` | 7 | 12 | 12 | 18 | choose, fix, insert, paragraph, transfer |
| `fronted_adverbial` | 7 | 12 | 12 | 16 | choose, combine, fix, insert, paragraph, transfer |
| `parenthesis` | 6 | 12 | 12 | 17 | choose, combine, fix, insert, paragraph, transfer |
| `comma_clarity` | 8 | 4 | 4 | 6 | choose, fix, insert, transfer |
| `colon_list` | 7 | 12 | 12 | 16 | choose, combine, fix, insert, paragraph, transfer |
| `semicolon` | 6 | 12 | 12 | 15 | choose, combine, fix, insert, paragraph, transfer |
| `dash_clause` | 8 | 8 | 8 | 11 | choose, combine, fix, insert, transfer |
| `semicolon_list` | 8 | 4 | 4 | 6 | choose, fix, insert, transfer |
| `bullet_points` | 5 | 8 | 8 | 12 | choose, fix, insert, paragraph, transfer |
| `hyphen` | 8 | 4 | 4 | 7 | choose, fix, insert, transfer |

Per-family generated coverage:

```text
gen_sentence_endings_insert: generated=4, templates=4, signatures=4
gen_apostrophe_contractions_fix: generated=4, templates=4, signatures=4
gen_apostrophe_possession_insert: generated=4, templates=4, signatures=4
gen_apostrophe_mix_paragraph: generated=4, templates=4, signatures=4
gen_speech_insert: generated=4, templates=4, signatures=4
gen_list_commas_insert: generated=4, templates=4, signatures=4
gen_list_commas_combine: generated=4, templates=4, signatures=4
gen_fronted_adverbial_fix: generated=4, templates=4, signatures=4
gen_fronted_adverbial_combine: generated=4, templates=4, signatures=4
gen_fronted_speech_paragraph: generated=4, templates=4, signatures=4
gen_comma_clarity_insert: generated=4, templates=4, signatures=4
gen_semicolon_fix: generated=4, templates=4, signatures=4
gen_semicolon_combine: generated=4, templates=4, signatures=4
gen_colon_semicolon_paragraph: generated=4, templates=4, signatures=4
gen_dash_clause_fix: generated=4, templates=4, signatures=4
gen_dash_clause_combine: generated=4, templates=4, signatures=4
gen_hyphen_insert: generated=4, templates=4, signatures=4
gen_parenthesis_fix: generated=4, templates=4, signatures=4
gen_parenthesis_combine: generated=4, templates=4, signatures=4
gen_parenthesis_speech_paragraph: generated=4, templates=4, signatures=4
gen_colon_list_insert: generated=4, templates=4, signatures=4
gen_colon_list_combine: generated=4, templates=4, signatures=4
gen_semicolon_list_fix: generated=4, templates=4, signatures=4
gen_bullet_points_fix: generated=4, templates=4, signatures=4
gen_bullet_points_paragraph: generated=4, templates=4, signatures=4
```

## Final Current-Main Production Smoke Evidence

Command run from the isolated report worktree:

```bash
npm run smoke:production:punctuation
```

Result: passed against `https://ks2.eugnel.uk`.

Headline output:

```text
ok: true
releaseId: punctuation-r4-full-14-skill-structure
runtimeItems: 192
publishedRewardUnits: 14
fixedItems expectation: 92
generatedItems expectation: 100
generatedPerFamily expectation: 4
```

Generated command-path probe:

```text
itemId: gen_speech_insert_1shvsd2_4
mode: insert
skillIds: speech
feedbackKind: error
misconceptionTags: speech.quote_missing
```

Other smoke probes:

```text
smartItemId: sl_choose_clubs
smartSummaryTotal: 1
generatedIncorrectItemId: gen_speech_insert_1shvsd2_4
generatedIncorrectMisconceptionTags: speech.quote_missing
advancedMode: gps
advancedItemId: dc_choose_flooded_route
advancedReviewItems: 1
parentHubAttempts: 24
spelling.progressTotal: 1
spelling.hasPromptToken: true
```

Dash acceptance through the live Worker command path:

| Variant | Item id | Mode | Skill |
| --- | --- | --- | --- |
| spaced hyphen | `gen_dash_clause_combine_4v5txn_1` | combine | `dash_clause` |
| en dash | `dc_insert_door_froze` | insert | `dash_clause` |
| em dash | `dc_insert_door_froze` | insert | `dash_clause` |

Oxford-comma probe:

```text
oxfordCommaItemId: gen_list_commas_combine_p4l027_4
```

## Verification History

The strongest verification signals are the final U7 GitHub checks and the current-main smoke/audit reruns.

U7 PR #514 final GitHub checks:

| Check | Result |
| --- | --- |
| `npm run audit:client` | success |
| `npm run audit:punctuation-content` | success |
| `npm test + npm run check` | success |
| GitGuardian Security Checks | success |
| Chromium + mobile-390 golden paths | skipped by workflow configuration |

U7 local verification before merge:

```text
node --test tests/button-label-consistency.test.js tests/csp-inline-style-budget.test.js
node scripts/inventory-inline-styles.mjs
git diff --check
node --test tests/worker-capacity-overhead.test.js
npm test
npm run check
npm run smoke:production:punctuation
```

Important nuance:

- one timing-sensitive full-suite run saw a transient `tests/worker-capacity-overhead.test.js` p95 overhead outlier;
- the focused worker-capacity rerun passed;
- the clean full-suite rerun passed with `6059` passing tests, `0` failures, and `6` skipped tests;
- the final GitHub `npm test + npm run check` check passed.

## Review Outcome

The final P2 slice was reviewed with release-gate sensitivity rather than style-only review.

Review focus included:

- whether the U7 branch had drifted into runtime Punctuation changes;
- whether latest `origin/main` merge commits introduced release-gate failures;
- whether button-label classification and CSP inline-style budget changes were unrelated hygiene or product-risk changes;
- whether the final branch delta touched `src/subjects/punctuation/**`, `shared/punctuation/**`, or `worker/src/subjects/punctuation/**` after the latest base merge;
- whether production smoke evidence matched the intended P2 release contract.

Final review outcome:

- no P0-P3 blockers were found;
- the final branch delta was limited to smoke/reporting and release-gate hygiene;
- the production runtime path was not regressed by the final documentation/smoke slice.

## Product Interpretation

P2 is best understood as a release-safety phase, not a content-count phase.

P1 proved that deterministic generation could safely broaden the runtime bank. P2 proves that the broader bank can be governed:

- content additions are now release-gated;
- generated surfaces have identity and redaction rules;
- Star projections know which release they are counting;
- marking policies reflect sensible learner inputs rather than brittle exact strings;
- production smoke exercises the deployed Worker command boundary.

This is why the unchanged `publishedRewardUnits: 14` number is a success rather than a limitation. It means P2 increased practice opportunity while preserving the meaning of mastery.

## Engineering Interpretation

Three decisions are especially important for future work.

### 1. Audit must own the release contract

Tests can prove examples. The audit proves the content portfolio.

The Punctuation bank is now large enough that relying only on hand-picked unit tests would miss portfolio-level failures: missing generator families, duplicate generated signatures, generated model answers that do not mark, and thin fixed-anchor coverage. Keeping the audit as a PR gate is the right long-term shape.

### 2. Runtime volume and authoring capacity should remain separate

U6 adds spare deterministic capacity without changing production `generatedPerFamily`.

That separation is valuable. It allows authors and reviewers to build depth ahead of release, prove capacity in audit-only mode, and raise production volume later only when the template portfolio is genuinely varied.

### 3. Generated metadata must be useful but boring

The opaque active-item `variantSignature` is useful because it binds attempts, scheduling, and Star evidence to a generated surface. It must remain boring: not answer-bearing, not teacher-facing, and not exposed in review or adult evidence.

U4's policy is a practical compromise. It should remain explicit because future generated-bank work will be tempted to pass more metadata through the browser. That should not happen without a deliberate review.

## Residual Risks

P2 is complete, but there are still risks worth keeping visible.

| Risk | Status | Recommended handling |
| --- | --- | --- |
| Production smoke does not prove deployed commit hash. | Residual | The demo-accessible APIs expose release/runtime behaviour, not build identity. Use Cloudflare/GitHub deployment evidence when commit-level attestation is required. |
| Live smoke does not exercise Admin Hub evidence with real admin credentials. | Residual | Local release-smoke covers Admin evidence redaction; use an authenticated admin smoke only when an admin session is available. |
| Audit reports duplicate generated stems/models. | Known non-blocker | Duplicate signatures are the hard gate. Stems/models remain useful content-review signals. |
| `generatedPerFamily=8` still has expected non-priority duplicate residuals. | Known capacity-mode risk | Keep residual expectations pinned by tests until future phases expand non-priority families. |
| Production generated volume is still 4 per family. | Deliberate | Do not raise it until P3/P4/P5 evidence shows enough varied surfaces and monitoring. |
| Demo-session smoke depends on bounded search for suitable generated/dash/list items. | Acceptable | The script fails loudly with observed item ids if routing drifts; it avoids test-only item injection. |
| `npm` warns about `playwright_skip_browser_download`. | Existing tooling warning | Not a P2 blocker, but worth cleaning in a tooling-hardening pass before the next npm major. |
| Old-release compatibility remains intentionally permissive in some legacy paths. | Managed | Keep release-scoped Star projection tests when changing mastery keys or reward-unit storage. |

## Post-Deploy Monitoring

Healthy signals:

- `npm run audit:punctuation-content -- --strict --generated-per-family 4` stays green.
- `npm run smoke:production:punctuation` reports release `punctuation-r4-full-14-skill-structure`.
- Production command responses still report `runtimeItems: 192` and `publishedRewardUnits: 14`.
- Generated incorrect-answer smoke still emits a stable misconception tag.
- GPS delayed review, Parent Hub evidence, and progress snapshots remain free of forbidden generated metadata.
- Dash variants remain accepted through the Worker command path.
- Default list-comma items still accept an otherwise-correct Oxford comma.
- English Spelling startup parity remains intact through the same production smoke.

Failure signals:

- generated duplicate signatures become non-zero;
- `publishedRewardUnits` changes without an explicit reward-model PR;
- production runtime item count drifts without a matching content/audit PR;
- Parent Hub, GPS, or summary payloads expose `variantSignature`, `templateId`, accepted answers, validators, or raw responses;
- current-release Star totals include old-release reward-unit rows;
- dash-clause model answers regress to teaching a spaced hyphen as canonical;
- strict no-final-comma items reject final commas without visible child-facing context.

Suggested regular commands:

```bash
npm run audit:punctuation-content -- --strict --generated-per-family 4
npm run smoke:production:punctuation
```

## Recommendations For P3-P5

### P3 - Generator DSL and authoring tools

Next priority should be authoring quality, not runtime quantity.

Recommended focus:

- slot-based deterministic template builders;
- automatic model-answer construction from the same slots as validators;
- golden accept/reject tests per template family;
- content-author preview tooling;
- safer expansion of context-pack atoms;
- clearer audit output for teachers and reviewers.

The aim is to make authoring faster without making runtime generation less deterministic.

### P4 - Evidence and scheduler maturity

P4 should answer whether children are transferring punctuation skill, not just seeing more surfaces.

Recommended focus:

- spaced-return requirements by skill;
- varied-evidence requirements before deep secure;
- sibling-template retry after misconception;
- per-signature exposure limits;
- generated-repeat-rate telemetry;
- analytics for weak-skill recovery.

This phase should be judged by evidence quality, not runtime count.

### P5 - Mature content portfolio and monitoring

Only after P3 and P4 should the team consider increasing production `generatedPerFamily` above 4.

Recommended prerequisites:

- most generator families have 8-12 genuinely distinct templates or slot combinations;
- fixed anchors are healthy across reward units where sensible;
- duplicate stems/models are understood or reduced;
- production dashboards can show audit status, repeat rate, marking failures, Star inflation risk, and generated-family coverage;
- there is a go/no-go checklist for larger generated volumes.

## Final Handover

P2 is complete and merged.

The current release is not perfect, but it is meaningfully safer than P1. The key improvement is that the system now treats deterministic content expansion as a governed production surface: audited, release-scoped, redacted, smoke-tested, and deliberately separated from reward inflation.

Do not raise production `generatedPerFamily` yet. The next good move is to improve authoring depth, evidence maturity, and monitoring before increasing learner-facing generated volume again.
