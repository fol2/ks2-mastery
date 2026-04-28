---
title: "Grammar QG P1 final completion report"
type: final-completion-report
status: merged
date: 2026-04-28
subject: grammar
plan: docs/plans/james/grammar/questions-generator/grammar-qg-p1.md
implementation_report: docs/plans/james/grammar/questions-generator/grammar-qg-p1-completion-report.md
contentReleaseId: grammar-qg-p1-2026-04-28
merged_pr: https://github.com/fol2/ks2-mastery/pull/489
merge_commit: a54849beebdbe8b8bfd3d2120b1326aba0131d30
---

# Grammar QG P1 Final Completion Report

Date: 28 April 2026

Status: Completed and merged to remote `main`

Source plan: `docs/plans/james/grammar/questions-generator/grammar-qg-p1.md`

Implementation report: `docs/plans/james/grammar/questions-generator/grammar-qg-p1-completion-report.md`

Merged PR:

- [PR #489](https://github.com/fol2/ks2-mastery/pull/489) - `Ship Grammar QG P1 release`

Merge commit:

- `a54849beebdbe8b8bfd3d2120b1326aba0131d30`

## Executive Summary

Grammar QG P1 is complete and merged. It turns the Grammar subject's question bank from a lightly governed legacy pool into an auditable deterministic content release with explicit release identity, generated-template metadata, answer-safe variant signatures, redaction gates, selector freshness, and production smoke coverage.

This is not runtime AI generation. That is a deliberate product and safety decision. The release expands Grammar through deterministic, teacher-authored generator families and fixed templates rather than unbounded live generation. For a KS2 learner-facing product, that is the right trade-off: more practice variety without giving up answer quality, marking determinism, child-facing copy control, or auditability.

The shipped release moves Grammar to:

```text
Content release id:            grammar-qg-p1-2026-04-28
Concepts:                      18
Templates:                     57
Selected-response templates:    37
Constructed-response templates: 20
Generated templates:            31
Fixed templates:                26
QG P1 answer-spec templates:     6
Thin-pool concepts:              0
Single-question-type concepts:   0
Strict repeated QG P1 variants:  0
Duplicate template ids:          0
Generated signature collisions:  0
```

The most important outcome is not only the increase from 51 to 57 templates. The larger win is that Grammar now has a release discipline for future expansion. The repo can now answer questions that previously depended on manual inspection:

- Which concepts are covered?
- Which templates are selected-response versus constructed-response?
- Which templates are generated versus fixed?
- Which generated variants are meaningfully distinct at the learner-visible surface?
- Which hidden answer contracts are typed and validated?
- Which server-only fields are safe to persist internally but must never leak into child-facing read models?
- Whether production smoke derives answers from the visible option set rather than hidden answer keys?

That changes Grammar QG from "content exists in code" to "content is governed by executable evidence".

## Final Outcome

### What shipped

PR #489 shipped one cohesive Grammar release:

| Area | Outcome |
| --- | --- |
| Content release | Introduced `grammar-qg-p1-2026-04-28` as the current Grammar content release id. |
| Audit gate | Added `scripts/audit-grammar-question-generator.mjs` with JSON output, fixture generation, seed sampling, strict QG P1 duplicate checks, and advisory legacy-repeat reporting. |
| Template expansion | Added six focused `qg_*` generated template families across active/passive voice, subject/object classification, pronoun referents, formality, modal verbs, and hyphen ambiguity. |
| Answer contracts | Added hidden, opt-in `answerSpec` data for the new QG P1 templates using `exact` and `multiField` contracts. |
| Variant signatures | Added generator family ids and answer-safe visible-variant signatures for generated questions. |
| Selection freshness | Taught the Grammar selector to avoid recently seen generated variants and to preserve concept urgency without repeating equivalent generated surfaces. |
| Engine persistence | Persisted server-only `generatorFamilyId` and `variantSignature` on attempts and events while keeping `session.currentItem` child-safe. |
| Read-model redaction | Stripped `answerSpec`, `generatorFamilyId`, `variantSignature`, raw recent-attempt responses, and hidden answer text from child-facing read models. |
| Production smoke | Updated Grammar production smoke to exercise a current QG P1 generated template and derive answers from production-visible options. |
| Reward alignment | Aligned Grammar monster reward progress with the new content release id so display-state and persisted mastery keys stay consistent. |
| Release fixtures | Added current-release QG P1 fixtures while keeping legacy oracle fixtures frozen for compatibility checks. |
| Documentation | Completed the plan and added an implementation completion report. This final report captures the full SDLC outcome. |

### What did not change

The release intentionally did not add runtime AI-generated Grammar questions. All shipped content remains deterministic and auditable.

It did not redesign the Grammar UI. No user-facing visual layout was introduced or changed, so no frontend-design pass was needed for this doc-only completion step. The learner-facing safety surface still matters, but the work was concentrated in Worker content, selector logic, read models, tests, and release documentation.

It did not migrate every legacy constructed-response template to declarative `answerSpec`. The new QG P1 templates use explicit answer specs; older adapter-marked templates remain a future migration target.

It did not claim that legacy generated families have infinite unique surfaces. Legacy repeated generated variants remain advisory because some older procedural families intentionally have finite or non-varying surfaces. QG P1 strict templates are the hard-gated release boundary.

## Baseline vs Final State

### Starting point

Before QG P1, Grammar had a usable but less governed bank:

```text
Legacy release id:             grammar-legacy-reviewed-2026-04-24
Templates:                     51
Audit coverage:                partial
Generated variant signatures:  not release-grade
Strict QG duplicate gate:      absent
Production smoke target:       older Grammar content surface
Selector freshness:            template-recency oriented, not generated-surface aware
```

The old state was functional, but it had several release risks:

- generated variety could be counted without proving learner-visible uniqueness
- hidden answer contracts were not consistently typed for new generated templates
- child-facing redaction had to protect more server-only fields as generator metadata grew
- production smoke could pass while using hidden or local answer data if it was not kept honest
- selector behaviour could avoid recent template ids without avoiding equivalent generated variants

### Final state

QG P1 ends with a stronger release shape:

```text
Current release id:            grammar-qg-p1-2026-04-28
Templates:                     57
Generated templates:           31
Fixed templates:               26
Answer-spec QG P1 templates:   6
Strict repeated QG P1 variants: 0
Thin-pool concepts:            0
Single-question-type concepts: 0
```

Question-type coverage:

| Type | Count |
| --- | ---: |
| build | 4 |
| choose | 18 |
| classify | 3 |
| explain | 4 |
| fill | 3 |
| fix | 11 |
| identify | 8 |
| rewrite | 6 |

The release is still a P1 lift rather than the final Grammar catalogue. It is now much safer to expand because the repo has executable checks for the content and runtime contracts that future work will depend on.

## Workstream 1: Inventory and Audit Gate

The new audit script is the backbone of the release.

Command:

```bash
node scripts/audit-grammar-question-generator.mjs --json
```

The audit reports:

- release id
- concept count
- template count
- selected-response versus constructed-response split
- generated versus fixed split
- question-type coverage
- duplicate template ids
- thin-pool concepts
- single-question-type concepts
- concept-by-concept coverage
- missing generator metadata
- generated variant signatures across sampled seeds
- strict repeated QG P1 generated variants
- advisory legacy repeated generated variants
- answer-spec template count

The important design choice was to split strict QG P1 failures from advisory legacy observations. That avoided either of two bad outcomes:

- blocking the release on known finite legacy generator surfaces that were outside the P1 promise
- silently allowing new QG P1 generated templates to repeat the same visible surface across sampled release seeds

The final audit reports zero strict repeated QG P1 variants, zero duplicate template ids, and zero generated signature collisions.

## Workstream 2: Typed Answer Contracts

The six new QG P1 templates use hidden `answerSpec` contracts. These are not learner-facing content fields; they are server-side marking and validation data.

Two answer-spec forms were used:

- `exact`: for deterministic single-answer surfaces
- `multiField`: for table/classification surfaces where multiple cells or labels must be checked

This matters because generated content is only safe when the answer contract is as deterministic as the prompt. A generated question without a reliable hidden answer contract can look polished while still being difficult to mark, explain, or audit.

The answer-spec work also fixed preservation behaviour for spec-owned `answerText` and `minimalHint`, so typed contracts can carry the marking and support text they need without being flattened by adapter logic.

## Workstream 3: Thin-Pool Template Expansion

QG P1 added six focused generated template families:

| Template id | Concept | Response shape | Why it matters |
| --- | --- | --- | --- |
| `qg_active_passive_choice` | Active and passive voice | Selected response | Adds generated recognition practice alongside rewrite work. |
| `qg_subject_object_classify_table` | Subject and object | Multi-field classification | Gives a richer diagnostic surface than a single-choice item. |
| `qg_pronoun_referent_identify` | Pronouns and referents | Selected response | Adds varied referent tracking, a common comprehension and grammar stumbling point. |
| `qg_formality_classify_table` | Formality | Multi-field classification | Makes register decisions explicit and repeatable. |
| `qg_modal_verb_explain` | Modal verbs | Selected response | Adds reasoning about strength, likelihood, and obligation. |
| `qg_hyphen_ambiguity_explain` | Hyphen ambiguity | Constructed/selected explanation surface | Connects punctuation choice to meaning, not just symbol placement. |

This was intentionally not a broad template explosion. The work targeted places where generated variety would reduce repetition and improve diagnostic coverage without creating open-ended marking risk.

## Workstream 4: Variant Signatures and Selector Freshness

The most subtle part of QG P1 was not content authoring. It was teaching the selector what "fresh practice" actually means for generated content.

Template ids are not enough. A generated template can produce many item instances, but some instances may be equivalent at the learner-visible surface. The release therefore introduced:

- `generatorFamilyId`: stable identity for the generator family
- `variantSignature`: answer-safe identity for the visible generated variant

The signature deliberately ignores shuffle-only option order. Review caught this risk early: if option order alone changed the signature, the selector could treat the same question as fresh simply because the choices were rearranged.

The selector now uses recent generated variant signatures to avoid equivalent repeats when alternatives exist. It also adds planned generated variants to a separate freshness index while constructing queues and mini-packs. That second point is important: a final independent review found that using synthetic planned attempts in the same structure as real attempts could age real recent variants out of the freshness window during full mini-pack construction. The fix kept planned generated variants separate and pinned planned `lastDistance` to a fresh value.

The selector also keeps concept urgency:

- recent misses now track actual miss distance
- urgent concept slots prioritise weak or recently missed concepts
- generated variant freshness prevents "urgent" from becoming "repeat the same generated surface"

This is the core product balance: learners should see weak concepts again soon, but not as a disguised duplicate of the question they just saw.

## Workstream 5: Engine Persistence and Read-Model Redaction

The Worker now persists generator metadata internally:

- attempts can carry `generatorFamilyId`
- attempts can carry `variantSignature`
- event evidence can retain the same metadata

That internal metadata is necessary for scheduling and auditability. It is not appropriate child-facing content.

The release therefore strengthened read-model redaction:

- `answerSpec` is forbidden in child-facing models
- `generatorFamilyId` is forbidden in child-facing models
- `variantSignature` is forbidden in child-facing models
- hidden answer data remains server-side
- recent-attempt raw responses are stripped from the child-facing recent activity model

The forbidden-key helper was extended with Grammar-specific server-only fields, and production-smoke tests now scan start, feedback, and summary models. This is important because a leak can appear after the first item, not only at session start.

## Workstream 6: Safe Diagnostics and Production Smoke

Adult/operator diagnostics now receive safe Grammar content counts through Worker read models. The browser client fallback keeps only compact summary diagnostics so the main bundle stays under budget and does not mirror unnecessary content metadata.

The production smoke was updated to exercise `qg_modal_verb_explain`, a current QG P1 generated template. It also keeps the answer derivation honest: answers must come from the production-visible option set, not a hidden key or local-only object.

This follows the earlier Grammar release-gate lesson: production smoke is valuable only if it catches both false failures and false passes.

## Workstream 7: Reward Alignment

QG P1 changed the Grammar content release id. That matters for mastery and monster reward state because display progress and persisted mastery evidence must agree on the release key.

The release fixed the Grammar reward path so `recordGrammarConceptMastery()` passes the active content release id through the progress and high-water logic. This avoids a subtle class of bugs where the learner's visible star state can diverge from persisted release-scoped mastery.

## Independent Review Loop

The work followed an independent SDLC loop rather than a single-pass implementation.

### Review finding 1: Shuffle-only signature freshness

Initial review found that `grammarQuestionVariantSignature()` could treat option shuffle order as a new signature. That would weaken generated variant freshness because the same prompt and answer set could appear "fresh" after reordering choices.

Fix:

- canonicalised options, columns, rows, and answer-safe input fields for signature purposes
- preserved learner-visible distinction while ignoring shuffle-only noise
- added tests proving shuffle-only option order does not create a new signature

### Review finding 2: Selector and engine seed mismatch

Review found that mini-pack selection calculated candidate seeds differently from engine materialisation. That meant the selector could penalise one generated variant while the engine displayed another.

Fix:

- aligned mini-set materialisation with selector candidate seeds
- added tests so mini-set seeds match selector formula

### Review finding 3: Strict repeated generated variants were detected but not gated

QA found that the audit reported repeated generated variants but tests did not fail the release gate. That could have allowed the audit to become informational rather than protective.

Fix:

- split strict QG P1 repeated variants from advisory legacy repeats
- changed default sampled release seeds
- asserted zero strict repeated QG P1 variants in tests

### Review finding 4: Focus saturation bypassed generated variant avoidance

Review found that focus-saturation prefill could directly push narrow-focus generated templates into queues and mini-packs without applying the recent-variant hard filter.

Fix:

- reused the generated variant freshness filter in focus prefill
- broadened/fell back only when necessary
- added queue and mini-pack regression coverage

### Review finding 5: Planned attempts aged out real recent attempts

Final review found a full-size mini-pack bug: synthetic planned attempts could push real recent attempts beyond the freshness horizon, allowing a recent generated variant to repeat late in the pack.

Fix:

- introduced a separate `workingRecentVariants` index
- added planned generated variants directly to that index with fresh distance
- covered size-8 modal-verb queue and mini-pack cases

### Final review result

The final independent re-review reported no blockers. The branch then moved through final verification, PR creation, GitHub checks, and merge.

## Verification Evidence

### Targeted local verification

Command:

```bash
node --test tests/grammar-question-generator-audit.test.js tests/grammar-selection.test.js tests/grammar-engine.test.js tests/grammar-functionality-completeness.test.js tests/grammar-answer-spec.test.js tests/grammar-answer-spec-audit.test.js tests/grammar-production-smoke.test.js tests/grammar-stats-rename.test.js tests/hub-read-models.test.js tests/worker-grammar-subject-runtime.test.js
```

Result:

```text
177 passed
0 failed
```

### Full local repository verification

Command:

```bash
npm test
```

Result on latest `origin/main` before PR:

```text
5,783 passed
0 failed
6 skipped
```

### Build and bundle verification

Command:

```bash
npm run check
```

Result:

```text
Passed
Client bundle audit: 215960 / 216000 bytes gzip
```

The bundle budget was tight after rebasing over nearby Punctuation work. The fix was to avoid mirroring full Grammar content stats in the client fallback and keep the Worker read model as the authoritative diagnostics source.

### Whitespace hygiene

Command:

```bash
git diff --check
```

Result:

```text
Passed
```

### GitHub checks

PR #489 checks:

| Check | Result |
| --- | --- |
| `npm run audit:client` | Passed |
| `npm test + npm run check` | Passed |
| GitGuardian Security Checks | Passed |
| Chromium + mobile-390 golden paths | Skipped by PR workflow configuration |

### Known verification note

One post-rebase full-suite run had a single unrelated `react-admin-hub-refresh` ordering assertion fail once. The isolated rerun of that file passed, and the final full-suite rerun on the latest base passed cleanly. The failure was treated as a timing flake, not ignored as a product regression.

## Key Technical Decisions

### 1. Deterministic generation over runtime AI

The release expands generated practice without introducing runtime AI-generated questions. That keeps Grammar inside a deterministic, reviewable, child-safe content model.

This is especially important for Grammar because learner questions often require precise marking, acceptable variants, and carefully worded explanations. Runtime AI would increase content volume, but it would also increase the risk of unreviewed phrasing, hidden answer drift, and inconsistent marking.

### 2. Variant signatures represent learner-visible freshness

`variantSignature` is not just an implementation detail. It is the selector's approximation of whether the learner is seeing the same generated question again.

The signature must therefore be answer-safe and stable, but not over-sensitive to irrelevant ordering noise. Ignoring shuffle-only option order was a critical correction.

### 3. Hidden answer contracts must stay hidden

The release makes answer contracts more explicit while keeping them server-side. That is the right separation:

- the Worker needs hidden answer specs for deterministic marking and audit
- the child-facing read model needs only safe question and feedback state

The forbidden-key checks now encode that separation.

### 4. Content diagnostics belong primarily in Worker read models

The client does not need a full mirror of Grammar content stats. Keeping the client fallback compact reduced bundle pressure and preserved the Worker as the authoritative read-model source.

This was a useful late-stage lesson: diagnostics can be safe and still be too heavy for the main bundle if mirrored in the wrong place.

### 5. Freshness must account for planning, not only history

It is not enough to avoid recent variants from past attempts. Queue construction must also avoid repeating generated variants that were planned earlier in the same queue or mini-pack.

The separate planned-variant index is the durable shape here. It keeps selection honest inside a single generated set.

## Product and Pedagogy Impact

The release improves Grammar practice in three practical ways.

First, it adds more varied generated surfaces in thin areas without sacrificing deterministic marking. Learners get more ways to practise the same concept, and the system gets clearer evidence about which concepts are weak.

Second, it makes equivalent generated practice detectable. A child should not get credit or freshness simply because the same underlying prompt was shuffled. The signature layer moves the product closer to measuring meaningful practice rather than item-instance churn.

Third, it improves adult/operator confidence. Safe content stats and release reports make it easier to answer what shipped, how it was checked, and where the remaining gaps are.

## Risk Register

| Risk | Current status | Mitigation |
| --- | --- | --- |
| QG P1 generated templates repeat learner-visible variants | Closed for QG P1 sampled release seeds | Strict repeated-variant gate and selector regression tests. |
| Legacy generated families report repeated variants | Accepted advisory risk | Kept separate from strict QG P1 gate; future legacy migration can reduce this. |
| Hidden answer data leaks to child-facing models | Mitigated | Forbidden-key helper, read-model redaction, production-smoke scans across start, feedback, and summary. |
| Selector repeats generated variants during focus saturation | Closed | Freshness filter now applies to focus prefill and fallback paths. |
| Mini-pack planning ages out real recent attempts | Closed | Separate planned-variant index with regression tests. |
| Bundle budget pressure from client diagnostics | Closed for this release | Compact client fallback; Worker remains authoritative for full `contentStats`. |
| Reward progress diverges after content release id change | Closed | Grammar reward path now passes the active content release id through mastery progress. |
| Legacy constructed-response templates remain adapter-marked | Open follow-up | Migrate legacy templates to declarative `answerSpec` in a later release. |
| Explain-type coverage remains shallow | Open follow-up | Fourteen concepts still lack explain templates; this is the highest-value content expansion seam. |

## Residual Gaps

### Legacy answer-spec migration

The new QG P1 templates have typed answer specs, but older constructed-response templates still rely on adapter marking paths. That is acceptable for this release because QG P1 did not promise a full declarative migration. It remains the next structural improvement for Grammar marking governance.

### Explain-template depth

The release includes four `explain` templates, but fourteen concepts still lack explain coverage. This matters because explain items are often the best way to test whether a learner understands the reason behind a grammar choice rather than simply recognising a pattern.

### Broader generated catalogue

P1 added six targeted families. A later phase should expand every concept towards a deeper mixed pool, with the same audit and signature standards.

### Production smoke remains a manual release gate

The production smoke is stronger and safer, but the live post-deploy smoke still depends on running the production script deliberately. A later CI or release-orchestration step could make that gate harder to forget.

## Recommended Next Phase

### Phase 2: Declarative marking migration

Move legacy constructed-response templates towards explicit `answerSpec` contracts.

Recommended order:

1. Pick the highest-volume or highest-risk constructed-response concepts.
2. Add declarative specs without changing learner copy.
3. Add oracle tests for old adapter parity.
4. Refresh fixtures only when the spec migration is proven equivalent or intentionally improved.

### Phase 3: Explain coverage expansion

Add explain templates across the concepts that currently lack them.

Priority concepts should be chosen by a mix of:

- learner error frequency
- concepts where surface recognition is easy but reasoning is hard
- concepts that benefit from adult/parent explanation evidence

### Phase 4: Generated-bank depth

Use the QG P1 audit as the release gate for a broader generated catalogue.

Every new generated family should include:

- deterministic seeded variants
- answer-safe variant signatures
- strict repeated-variant checks
- marking tests
- read-model redaction checks if new server-only metadata is introduced

### Phase 5: Production gate automation

Consider turning the Grammar production smoke into a more explicit release checklist or CI-adjacent manual gate. The important contract is that production-visible options remain the answer source.

## Operational Notes

### How to rerun the audit

```bash
node scripts/audit-grammar-question-generator.mjs --json
```

### How to refresh the QG P1 audit fixture

```bash
node scripts/audit-grammar-question-generator.mjs --write-fixture
```

Only refresh fixtures when the content release intentionally changes. Do not overwrite legacy oracle fixtures as a shortcut.

### How to rerun targeted Grammar verification

```bash
node --test tests/grammar-question-generator-audit.test.js tests/grammar-selection.test.js tests/grammar-engine.test.js tests/grammar-functionality-completeness.test.js tests/grammar-answer-spec.test.js tests/grammar-answer-spec-audit.test.js tests/grammar-production-smoke.test.js tests/grammar-stats-rename.test.js tests/hub-read-models.test.js tests/worker-grammar-subject-runtime.test.js
```

### How to run the full local gate

```bash
npm test
npm run check
git diff --check
```

Do not run `npm test` and `npm run check` in parallel in this repo. Build artefacts can collide.

## Files Most Important to Future Maintainers

| File | Why it matters |
| --- | --- |
| `scripts/audit-grammar-question-generator.mjs` | Executable content inventory and QG P1 audit gate. |
| `worker/src/subjects/grammar/content.js` | Source of Grammar templates, generated families, answer-safe variant signatures, and release metadata. |
| `worker/src/subjects/grammar/selection.js` | Freshness, concept urgency, and generated-variant selection logic. |
| `worker/src/subjects/grammar/engine.js` | Attempt/event persistence and child-safe current item serialisation. |
| `worker/src/subjects/grammar/read-models.js` | Worker read-model stats and redaction boundary. |
| `worker/src/subjects/grammar/answer-spec.js` | Hidden answer contract validation and marking support. |
| `tests/grammar-question-generator-audit.test.js` | Release gate for counts, metadata, strict generated repeats, and signature stability. |
| `tests/grammar-selection.test.js` | Regression coverage for concept urgency and generated variant freshness. |
| `tests/grammar-engine.test.js` | Attempt/event metadata persistence and redaction coverage. |
| `tests/grammar-production-smoke.test.js` | Contract tests for production-visible answers and forbidden-key scanning. |
| `tests/helpers/forbidden-keys.mjs` | Shared forbidden-key source of truth. |
| `src/platform/game/mastery/grammar.js` | Grammar monster reward alignment with content release ids. |

## Completion Assessment

QG P1 achieved its intended release goal. It did not attempt to finish every Grammar content ambition, but it established the governance layer needed to expand safely.

The release is production-credible because it combines:

- deterministic generated content
- explicit answer contracts for new templates
- strict audit gates for new generated variants
- selector freshness that understands generated equivalence
- child-facing redaction
- production-smoke hardening
- reward release-id alignment
- independent review and blocker resolution
- local and GitHub verification

The strongest insight from the work is that generated educational content should not be judged by volume alone. The meaningful unit is a learner-visible, markable, answer-safe practice surface. QG P1 adds the machinery to measure and protect that unit.

That machinery is now merged to `main`.
