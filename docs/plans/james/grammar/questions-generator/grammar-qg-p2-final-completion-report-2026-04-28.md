---
title: "Grammar QG P2 final completion report"
type: final-completion-report
status: merged
date: 2026-04-28
subject: grammar
plan: docs/plans/james/grammar/questions-generator/grammar-qg-p2.md
implementation_report: docs/plans/james/grammar/questions-generator/grammar-qg-p2-completion-report.md
contentReleaseId: grammar-qg-p2-2026-04-28
implemented_pr: https://github.com/fol2/ks2-mastery/pull/499
implementation_merge_commit: 09aca0c4a6767a796600f42c3c77f85b5caae2a8
---

# Grammar QG P2 Final Completion Report

Date: 28 April 2026

Status: Completed, reviewed, and merged to remote `main`

Source plan: `docs/plans/james/grammar/questions-generator/grammar-qg-p2.md`

Implementation report: `docs/plans/james/grammar/questions-generator/grammar-qg-p2-completion-report.md`

Implemented PR:

- [PR #499](https://github.com/fol2/ks2-mastery/pull/499) - `feat(grammar): migrate constructed responses to answer specs`

Implementation merge commit:

- `09aca0c4a6767a796600f42c3c77f85b5caae2a8`

## Executive Summary

Grammar QG P2 is complete. It migrated the Grammar subject's constructed-response marking from legacy inline adapters to explicit, validated, Worker-private `answerSpec` contracts. This is a marking-governance release, not a catalogue-expansion release. It preserves the QG P1 denominator while making every constructed-response item auditable, release-scoped, redaction-safe, and honest about what the system can mark deterministically.

The central product decision is that open creative writing prompts are now `manualReviewOnly` rather than pretend-scoreable. That matters. A KS2 learning product should not infer mastery from a free-form answer that the deterministic marker cannot judge reliably. P2 chooses truthful collection and replay over false confidence. Manual-review responses are saved, shown back neutrally, and excluded from mastery, retries, misconceptions, Star evidence, reward progress, Parent Hub mistake counters, and confidence analytics.

The shipped release moves Grammar to:

```text
Content release id:                          grammar-qg-p2-2026-04-28
Concepts:                                    18
Templates:                                   57
Selected-response templates:                  37
Constructed-response templates:               20
Generated templates:                          31
Fixed templates:                              26
Answer-spec templates:                        26
Constructed-response answer-spec templates:   20
Legacy constructed-response adapter templates: 0
Manual-review-only templates:                  4
Thin-pool concepts:                            0
Single-question-type concepts:                 0
Invalid answer specs:                          0
Templates missing answer specs:                0
P2 migration complete:                         true
```

The deeper outcome is that Grammar now has a stable two-phase governance foundation:

- QG P1 expanded and governed the deterministic question bank.
- QG P2 governed the marking contract for the older constructed-response surface.

Together, these phases turn Grammar from a functional in-code question pool into a release-managed subject with executable evidence around content, marking, redaction, selector freshness, and reward safety.

## Final Outcome

### What Shipped

PR #499 shipped one cohesive Grammar content-release migration:

| Area | Outcome |
| --- | --- |
| Release identity | Bumped Grammar to `grammar-qg-p2-2026-04-28` while preserving the QG P1 fixture as historical evidence. |
| Marking contract | Added explicit `answerSpec` declarations and generated hidden specs for every constructed-response template. |
| Adapter retirement | Reduced legacy constructed-response adapter coverage to zero. |
| Answer-spec coverage | Landed 26 answer-spec templates across `exact`, `multiField`, `normalisedText`, `acceptedSet`, `punctuationPattern`, and `manualReviewOnly`. |
| Manual review | Treated creative open-response templates as non-scored manual-review saves, not wrong answers and not mastery evidence. |
| Engine semantics | Split scored from non-scored attempts across submission, session state, summaries, events, and mini-test scoring. |
| SATS safety | Excluded manual-review-only templates from SATS mini-tests, including the strict forced-template path. |
| Stale-release recovery | Cleared active sessions from an older Grammar content release so learners are not stranded after the release id bump. |
| Reward safety | Prevented manual-review saves from emitting concept-secured events, Star evidence, or reward progression. |
| Read models | Preserved non-scored markers where needed while excluding manual-review attempts from recent misses, distinct-template confidence, and Parent Hub mistake counts. |
| Child UI | Rendered manual-review feedback neutrally and hid repair or AI-enrichment actions for non-scored saves. |
| Production smoke | Added visible-data probes for every answer-spec family and kept redaction scanning across later read-model phases. |
| Audit and fixtures | Added P2 baselines and audit fields proving the migration is complete. |
| Documentation | Completed the source plan and implementation report; this final report records the full release retrospective. |

### What Did Not Change

P2 did not add new Grammar concepts, new reward mechanics, new monster thresholds, or new child-facing dashboard features.

It did not introduce runtime AI marking. Score-bearing Grammar answers remain deterministic. AI enrichment remains a support or explanation surface, not a scoring authority.

It did not broaden open creative prompts into permissive auto-marking. The release explicitly rejected that path. A permissive matcher would have been easier to demo, but it would have created false mastery and false Parent Hub confidence.

It did not automate the production Grammar smoke into the deploy pipeline. The smoke is stronger, but still an operational gate that must be run after deployment.

It did not solve catalogue depth. QG P3 remains the natural next content slice, especially for explanation depth.

## Baseline vs Final State

### Starting Point After QG P1

QG P1 left Grammar in a much stronger content position, but it deliberately left a marking migration gap:

```text
Content release id:                         grammar-qg-p1-2026-04-28
Templates:                                  57
Selected-response templates:                 37
Constructed-response templates:              20
Answer-spec templates:                        6
Constructed-response answer-spec templates:   partial
Legacy constructed-response adapter path:     still active
```

This was acceptable for QG P1 because P1's goal was catalogue governance and generated-template safety. It was not acceptable as a long-term foundation because constructed-response marking remained harder to audit, harder to reason about, and easier to accidentally widen.

The main risks at the start of P2 were:

- legacy inline accepted-answer arrays could drift outside the shared marker contract
- creative prompts could be misread as ordinary wrong answers
- manual-review attempts could accidentally mutate mastery, retries, or rewards
- SATS mini-tests could include content that cannot be auto-scored
- release-id bumps could strand active sessions
- Parent Hub and confidence read models could inflate mistakes from non-scored saves
- production smoke could miss answer-key or server-only-field leaks outside the initial item

### Final State After QG P2

The final audit now reports:

```text
Content release id:                         grammar-qg-p2-2026-04-28
Answer-spec templates:                       26
Constructed-response answer-spec templates:  20 / 20
Legacy adapter templates:                     0
Manual-review-only templates:                 4
P2 migration complete:                        true
Invalid answer specs:                         0
Templates missing answer specs:               0
```

Answer-spec distribution:

| Kind | Count | Template ids |
| --- | ---: | --- |
| `acceptedSet` | 2 | `combine_clauses_rewrite`, `proc3_clause_join_rewrite` |
| `exact` | 4 | `qg_active_passive_choice`, `qg_pronoun_referent_identify`, `qg_modal_verb_explain`, `qg_hyphen_ambiguity_explain` |
| `manualReviewOnly` | 4 | `build_noun_phrase`, `standard_fix_sentence`, `proc2_fronted_adverbial_build`, `proc3_noun_phrase_build` |
| `multiField` | 2 | `qg_subject_object_classify_table`, `qg_formality_classify_table` |
| `normalisedText` | 5 | `tense_rewrite`, `active_passive_rewrite`, `proc2_standard_english_fix`, `proc2_passive_to_active`, `proc3_apostrophe_rewrite` |
| `punctuationPattern` | 9 | `fix_fronted_adverbial`, `parenthesis_fix_sentence`, `speech_punctuation_fix`, `proc_fronted_adverbial_fix`, `proc_colon_list_fix`, `proc_dash_boundary_fix`, `proc_speech_punctuation_fix`, `proc3_parenthesis_commas_fix`, `proc3_hyphen_fix_meaning` |

The release keeps the P1 content denominator:

| Measure | Count |
| --- | ---: |
| Concepts | 18 |
| Templates | 57 |
| Selected-response templates | 37 |
| Constructed-response templates | 20 |
| Generated templates | 31 |
| Fixed templates | 26 |
| Thin-pool concepts | 0 |
| Single-question-type concepts | 0 |

## Workstream 1: Declarative Marking Migration

The core implementation moved constructed-response marking into shared answer-spec data.

Before P2, older constructed-response templates had local marking behaviour embedded in the template layer. That made each item understandable in isolation, but weaker as a release surface. P2 standardised the contract:

- each migrated constructed-response template declares `requiresAnswerSpec`
- each migrated template declares `answerSpecKind`
- generated question objects carry Worker-private `answerSpec`
- `markByAnswerSpec` remains the shared scoring entry point
- `validateAnswerSpec` gates malformed hidden marking data
- audit fixtures record the migration state

The important engineering move was not just adding data. It was making the data executable. The audit can now prove that every constructed-response template participates in the explicit marking contract.

### Normalised Text

`normalisedText` covers answer shapes where the learner must supply a deterministic phrase or rewrite, but where harmless spacing and case variation should not fail the answer.

The migrated templates are:

- `tense_rewrite`
- `active_passive_rewrite`
- `proc2_standard_english_fix`
- `proc2_passive_to_active`
- `proc3_apostrophe_rewrite`

P2 also added multi-golden support so legitimate deterministic alternatives can be represented inside the spec rather than through local ad hoc comparison.

### Accepted Set

`acceptedSet` covers finite rewrite cases where a small, teacher-reviewable set of alternatives is acceptable.

The migrated templates are:

- `combine_clauses_rewrite`
- `proc3_clause_join_rewrite`

This is intentionally narrow. It avoids making clause-joining too permissive while still allowing known correct alternatives.

### Punctuation Pattern

`punctuationPattern` covers the largest constructed-response migration family.

The migrated templates are:

- `fix_fronted_adverbial`
- `parenthesis_fix_sentence`
- `speech_punctuation_fix`
- `proc_fronted_adverbial_fix`
- `proc_colon_list_fix`
- `proc_dash_boundary_fix`
- `proc_speech_punctuation_fix`
- `proc3_parenthesis_commas_fix`
- `proc3_hyphen_fix_meaning`

The key design principle is strictness by default. A punctuation item should not pass merely because the learner supplied broadly similar wording. The spec family preserves explicit punctuation targets and near-miss rejections.

### Manual Review Only

`manualReviewOnly` covers genuinely open creative responses where deterministic scoring would be misleading.

The migrated templates are:

- `build_noun_phrase`
- `standard_fix_sentence`
- `proc2_fronted_adverbial_build`
- `proc3_noun_phrase_build`

This is the most important product-quality decision in P2. These prompts still have learning value, but they no longer pretend to be score-bearing if the system cannot judge them with enough confidence.

The result shape is deliberately explicit:

```text
correct: false
score: 0
maxScore: 0
nonScored: true
manualReviewOnly: true
feedbackShort: Saved for review.
```

That shape is safe because downstream code no longer treats it as an ordinary wrong answer.

## Workstream 2: Non-Scored Runtime Semantics

P2 had to make `manualReviewOnly` true at the engine boundary, not only inside the marker.

A marker returning `correct: false` and `score: 0` would not be enough. If the engine still counted the attempt as an incorrect answer, the product would create false remediation, false Parent Hub warnings, and false reward consequences.

The final runtime behaviour is:

- manual-review responses are saved
- `grammar.manual-review-saved` is emitted
- `grammar.answer-submitted` is not emitted for non-scored saves
- concept mastery is not changed
- template mastery is not changed
- question-type mastery is not changed
- retry queues are not changed
- misconception counts are not changed
- `grammar.concept-secured` is not emitted
- Star evidence is not emitted
- reward progress is not emitted
- session summaries track `answered`, `scoredAnswered`, and `nonScoredAnswered`

This preserves learner evidence without corrupting assessment evidence.

## Workstream 3: SATS Mini-Test Safety

The first independent review found a serious release-risk class: strict mini-tests could still include manual-review-only templates. That would have made a timed or test-like context contain content the system could not score.

P2 fixed this by excluding `manualReviewOnly` templates from SATS mini-test selection and by adding a forced-template rejection path.

This matters because mini-tests are interpreted differently by learners and adults. A non-scored creative prompt in casual practice can be useful. A non-scored creative prompt in a score-bearing mini-test is confusing at best and misleading at worst.

## Workstream 4: Stale Release Recovery

The content release id changed from QG P1 to QG P2. That is production-sensitive because a learner can have an active Grammar session created under the previous release.

An independent review surfaced the risk that active P1 sessions could become stranded by the P2 release-id check. The final implementation clears stale active content sessions for non-start commands and returns the learner to a safe dashboard state instead of leaving them in a persistent mismatch error.

This was a critical usability fix. Release-id correctness should protect marking evidence, not trap the learner.

## Workstream 5: Read Models, Parent Hub, and Confidence

The second major review discovery was that non-scored attempts could still leak into analytics even if the engine did not mutate mastery directly.

P2 fixed the downstream read-model paths:

- recent misses exclude manual-review attempts
- distinct-template confidence evidence excludes manual-review attempts
- worker Parent Hub projections exclude non-scored saves from mistake counts
- client Parent Hub fallback projections match the worker behaviour
- recent sessions show `Saved for review` instead of `1 mistake`
- summary accuracy uses `scoredAnswered` as the denominator
- non-scored-only sessions do not render as `0% accuracy`

This is one of the more important insights from the work: "non-scored" has to be a system-wide invariant. It is not enough to stop mastery mutation at submit time if history, confidence, summaries, or Parent Hub later reinterpret the saved response as a miss.

## Workstream 6: Child UI and UX Behaviour

P2 made the learner-facing result neutral for manual-review saves.

The child session UI now:

- renders manual-review feedback as neutral
- falls back to `Saved for review`
- hides repair actions for non-scored saves
- hides AI-enrichment actions for non-scored saves
- keeps ordinary wrong-answer repair behaviour unchanged

This avoids telling a child they were wrong when the system did not actually mark the answer. It also avoids offering repair paths that depend on a scored misconception.

The final bundle-gate follow-up also consolidated UI tone logic so the first-paint client bundle stayed under budget without changing the Worker-authoritative non-scored contract.

## Workstream 7: Audit, Fixtures, and Production Smoke

P2 extended the existing Grammar audit rather than creating a parallel inventory.

The audit now reports:

- constructed-response template count
- constructed-response answer-spec count
- legacy adapter template count
- manual-review-only template count
- answer-spec kind counts
- templates missing answer specs
- invalid answer specs
- `p2MigrationComplete`

The P2 fixtures sit alongside the QG P1 baselines:

- `tests/fixtures/grammar-legacy-oracle/grammar-qg-p2-baseline.json`
- `tests/fixtures/grammar-functionality-completeness/grammar-qg-p2-baseline.json`

The production smoke now has visible-data probes for all answer-spec families:

- `exact`
- `multiField`
- `normalisedText`
- `punctuationPattern`
- `acceptedSet`
- `manualReviewOnly`

This preserves the important release-gate principle: production smoke should behave like an API contract. It should prove that the production-visible model is sufficient for the intended interaction and should not silently rely on hidden answer keys.

## Workstream 8: Reward and Release-Id Alignment

P2 kept the active content release id attached to Grammar command and reward evidence.

New concept-secured and Star-evidence paths now use `grammar-qg-p2-2026-04-28`. Manual-review-only responses do not enter those paths at all.

This preserves two boundaries at once:

- old release data remains readable as historical evidence
- current release evidence cannot be confused with stale release evidence

For reward systems, this distinction is not cosmetic. Monster and Star progress are user-visible outcomes, so the evidence that drives them must be release-scoped and score-bearing.

## Review Cycle and Blocker Resolution

The implementation went through an independent review cycle with several real blockers. These were not style issues; they were release-quality risks.

### Blocker 1: Manual Review in SATS Mini-Tests

Risk: manual-review-only templates could appear in SATS mini-tests, creating score-bearing rounds with non-scoreable content.

Resolution: exclude manual-review-only templates from SATS mini-test selection and reject forced manual-review mini-test starts.

Evidence: `tests/grammar-engine.test.js` covers both ordinary mini-pack exclusion and strict forced-template rejection.

### Blocker 2: Stale P1 Active Sessions

Risk: the P2 content-release bump could strand learners with active QG P1 sessions.

Resolution: detect stale active content sessions and clear them back to dashboard state for non-start commands.

Evidence: `tests/grammar-engine.test.js` covers stale content release recovery.

### Blocker 3: Non-Scored Attempts in Confidence Analytics

Risk: manual-review saves could be excluded from mastery mutation but still counted as recent misses or distinct templates.

Resolution: worker and client read models now filter non-scored/manual-review attempts before miss and confidence calculations.

Evidence: `tests/grammar-parent-hub-confidence.test.js` covers both worker and client behaviour.

### Blocker 4: Non-Scored Summaries Rendered as Failure

Risk: a manual-review-only practice session could show `0% accuracy`.

Resolution: session summaries and summary cards use `scoredAnswered` as the accuracy denominator and surface `Saved for review` for non-scored-only sessions.

Evidence: `tests/grammar-ui-model.test.js` covers the summary card behaviour.

### Blocker 5: Parent Hub Recent Sessions Showed a Mistake

Risk: Parent Hub recent sessions could show a manual-review-only session as `1 mistake`.

Resolution: worker and client recent-session projections now calculate mistakes from the scored denominator and show `Saved for review` for non-scored-only Grammar sessions.

Evidence: `tests/worker-history-api.test.js` and `tests/react-parent-hub-grammar.test.js`.

### Blocker 6: Client Bundle Budget

Risk: the PR merge ref exceeded the client bundle gzip budget by one byte after rebase and merge-ref hashing differences.

Resolution: consolidate UI tone checks and trim redundant first-paint marker logic while preserving the Worker/read-model non-scored contract.

Evidence: final CI `npm run audit:client` passed; local final audit reported `216477 / 216500` bytes gzip.

## Verification Evidence

### Final Local Evidence

The final implementation PR recorded:

```text
npm test: 5831 pass, 0 fail, 6 skipped
npm run check: pass
npm run build && npm run audit:client: pass
Final client bundle: 216477 / 216500 bytes gzip
Targeted UI tests after final trim: 245 pass, 0 fail
git diff --check origin/main...HEAD: pass
git diff --check: pass
```

The full test run produced expected test-path console output for deliberately exercised error cases, but no failing tests.

### Final GitHub CI Evidence

PR #499 passed:

| Check | Result |
| --- | --- |
| `npm test + npm run check` | Pass |
| `npm run audit:client` | Pass |
| `npm run audit:punctuation-content` | Pass |
| GitGuardian Security Checks | Pass |
| Playwright PR job | Skipped by workflow rules |

### Final Audit Evidence

Current audit command:

```bash
node scripts/audit-grammar-question-generator.mjs --json
```

Key output:

```text
releaseId: grammar-qg-p2-2026-04-28
templateCount: 57
constructedResponseCount: 20
answerSpecTemplateCount: 26
constructedResponseAnswerSpecTemplateCount: 20
legacyAdapterTemplateCount: 0
manualReviewOnlyTemplateCount: 4
p2MigrationComplete: true
templatesMissingAnswerSpecs: []
invalidAnswerSpecs: []
```

## Product Interpretation

P2 makes Grammar more honest.

Before P2, a constructed-response prompt could look like a normal scored interaction even when its marking semantics were local and harder to audit. After P2, every constructed response has an explicit contract. The platform now knows which prompts are score-bearing and which prompts are practice evidence only.

This distinction improves four user-facing experiences:

- Learners are not told that creative saved responses are wrong.
- Adults are not shown inflated mistakes for non-scored practice.
- Rewards are not granted from unmarked evidence.
- Future content expansion can rely on a cleaner marking taxonomy.

It also improves operational trust. If production smoke fails, the failure can be interpreted against answer-spec families and read-model phases rather than an unstructured collection of template-specific logic.

## Engineering Interpretation

P2 is a good example of a governance release whose value is larger than the visible code diff.

The user-facing surface barely changes. The reliability surface changes a lot.

The durable technical improvements are:

- one shared marking entry point for score-bearing specs
- explicit family counts and migration-complete audit fields
- content-release-scoped evidence
- non-scored attempt semantics that survive projection into read models
- stronger production smoke around visible-data answer derivation
- clearer future migration boundaries

The biggest lesson is that "manual review" is not a marker option. It is an invariant that must be respected by submission handling, session summaries, analytics, Parent Hub, UI actions, reward projection, and production smoke.

## Operational Handoff

### Post-Deploy Validation

Run the Grammar production smoke against production after deployment:

```bash
npm run smoke:production:grammar
```

Healthy production signals:

- the smoke passes for all answer-spec families
- manual-review fixtures return saved/non-scored feedback
- no hidden `answerSpec` or answer-oracle fields appear in child-facing payloads
- Parent Hub recent sessions show `Saved for review` for manual-review-only sessions
- SATS mini-tests do not include manual-review-only templates
- Grammar command error rate stays normal
- no persistent `grammar_content_release_mismatch` loop appears after refresh

Suggested log or search terms:

```text
grammar.manual-review-saved
grammar.session-completed
grammar_content_release_mismatch
grammar_session_stale
manualReviewOnly
/api/subjects/grammar/command
```

Rollback trigger:

- production smoke detects answer leakage
- stale-session lockout persists after refresh
- manual-review attempts create mastery, reward, or Star evidence
- Parent Hub mistake counters inflate from non-scored saves
- SATS mini-tests include manual-review-only content

Rollback path:

- revert PR #499 or redeploy the previous Worker build, then re-run production Grammar smoke and spot-check Grammar command routes.

### Known Operational Caveat

The Grammar production smoke is still a manual release gate. It has been strengthened, but it is not wired into `npm run check`, `npm run deploy`, or a post-deploy CI gate.

This is now the main remaining release-process gap for Grammar. The smoke is strong enough to catch meaningful redaction or answer-derivation failures, but only if an operator runs it.

## Residual Risks

| Risk | Current status | Mitigation |
| --- | --- | --- |
| Production smoke remains manual | Open process risk | Run `npm run smoke:production:grammar` after deploy; automate in a later release-gate hardening slice. |
| Legacy generated families still have advisory repeated variants | Known and unchanged from P1 | Keep QG P1 strict variants as the hard gate; treat legacy repeats as backlog for future catalogue depth. |
| Manual-review responses are saved but not scored | Intentional product choice | Redesign individual prompts into constrained deterministic forms only when the content value justifies a separate reviewed release. |
| Client bundle budget remains tight | Managed but still close | Keep first-paint Grammar UI additions small; prefer lazy-loaded adult surfaces and shared helpers that do not pull content into the client. |
| P2 does not expand explanation depth | Deferred | QG P3 should target explanation-template coverage and weaker concept depth. |
| Production Parent Hub behaviour depends on projected non-scored fields | Covered by tests, still worth monitoring | Watch recent-session headlines and mistake counts after deploy. |

## Future Work

### QG P3: Explanation Depth

The next sensible content slice is QG P3. It should focus on explanation-template depth for concepts that still need stronger reasoning coverage.

P3 should use P2's marking foundation rather than bypass it:

- every new constructed response should declare an answer spec at authoring time
- open creative prompts should start as manual-review-only unless deliberately constrained
- production smoke should add or update visible-data probes when a new answer family is introduced
- the QG fixture should be separate from P2 if the release id changes

### Redesign Manual-Review Templates Selectively

Some manual-review-only templates may be worth redesigning later into constrained deterministic prompts.

Candidates:

- `build_noun_phrase`
- `standard_fix_sentence`
- `proc2_fronted_adverbial_build`
- `proc3_noun_phrase_build`

The standard should be high. Redesign only if the prompt can produce a small, teacher-reviewable scoring contract without flattening the learning objective.

### Automate Production Smoke

Grammar now has the right smoke shape. The next release-process improvement is to wire it into a dependable post-deploy validation path.

Recommended future target:

- deploy completes
- production Grammar smoke runs with a logged-in production-visible session
- forbidden-key scan covers start, feedback, summary, mini-test, support, and AI-enrichment read models
- failure blocks release sign-off or pages the release owner

### Keep Bundle Governance Tight

The P2 final PR had to trim a small client-bundle overage. Future Grammar UI changes should keep this in mind:

- do not import Worker content or marking modules client-side
- do not mirror content metadata into the main bundle unless it is essential
- keep adult/admin analysis surfaces lazy-loaded
- prefer compact helper reuse over duplicated first-paint checks

## Lessons Learned

1. Declarative marking is only useful when it reaches the audit layer.

   P2 would have been weaker if it merely added specs to templates. The release became trustworthy because the audit can prove migration completeness.

2. Manual-review-only must be treated as a whole-system state.

   The first marker implementation was not enough. The meaningful work was making non-scored evidence survive submission, history, summary, Parent Hub, confidence, UI, and reward projection without being reinterpreted as failure.

3. Release-id changes need active-session behaviour.

   Correct stale-evidence rejection is necessary, but learner recovery is equally important. A content release should not trap an active learner.

4. Production smoke should test the API contract, not local implementation knowledge.

   P2 preserved the principle that smoke answers must come from production-visible data or a production-visible prompt fixture, not hidden answer keys.

5. Bundle margins matter even for backend-heavy work.

   A Worker/content migration can still affect first-paint code through UI feedback handling. Tight bundle gates are useful precisely because they catch that drift before merge.

6. Independent review found real product risks.

   The blockers around SATS selection, stale sessions, Parent Hub mistake counts, and non-scored confidence analytics were release-significant. They were not cosmetic comments.

## Final Assessment

Grammar QG P2 is complete and healthy.

It does not make Grammar look dramatically different on the surface. It makes Grammar much harder to lie by accident.

The release closes the constructed-response marking gap left after QG P1, preserves the 57-template denominator, proves all constructed responses now have explicit marking or manual-review contracts, protects child-facing read models, prevents non-scored responses from corrupting learning analytics, and keeps reward evidence tied to the active content release.

The best next step is not another marking refactor. The marking foundation is now in place. The next product-value slice should be QG P3: more explanation depth and better concept coverage, built on the answer-spec discipline P2 just finished.
