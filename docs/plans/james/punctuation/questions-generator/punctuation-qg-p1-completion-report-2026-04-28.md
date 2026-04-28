# Punctuation Question Generator P1 Completion Report

Date: 28 April 2026

Status: Completed and merged to remote `main`

Source plan: `docs/plans/james/punctuation/questions-generator/punctuation-qg-p1.md`

Merged PRs:

- [PR #482](https://github.com/fol2/ks2-mastery/pull/482) - `feat(punctuation): add generator guardrails audit`
- [PR #485](https://github.com/fol2/ks2-mastery/pull/485) - `feat(punctuation): raise runtime generated bank`
- [PR #486](https://github.com/fol2/ks2-mastery/pull/486) - `fix(punctuation): accept dash variants in exact items`

## Executive Summary

The Punctuation question-generator work is now complete as a production-ready first pass.

The subject still does **not** use AI to generate learner questions at runtime. It now uses a stronger deterministic content system: a human-authored fixed bank, published generator families, template identifiers, variant signatures, release audits, and marking tests. This is the right direction for a KS2 learning product because it gives the system more practice volume without surrendering answer quality, child safety, or evidence integrity to unbounded generation.

The practical runtime bank has moved from the original audit baseline of **96 items** to **171 runtime items**:

```text
Fixed evidence items:       71
Published generator families: 25
Generated variants per family: 4
Generated runtime items:    100
Total runtime items:        171
Published reward units:      14
```

The biggest improvement is not just the increase from 96 to 171 items. The larger win is that the generated bank is now governed by guardrails that make future expansion safer:

- generated items carry stable `templateId` and opaque `variantSignature` fields
- the audit can prove generated family coverage, validator coverage, distinct generated signatures, and generated model-answer marking
- scheduler repeat-avoidance can reason about equivalent generated surfaces, not just item IDs
- Star evidence avoids signature-based over-credit
- stale runtime documentation is now guarded by tests
- fixed dash-clause exact items now accept valid dash variants rather than only a spaced hyphen

This closes the P0 priority set from the original question-generator plan: count and quality guardrails, template signatures, duplicate detection, golden marking tests, dash acceptance, and Oxford comma policy clarification.

## Final Outcome

### What shipped

The completed work shipped in three deliberately small PRs:

| PR | Merge commit | Merged at | Purpose |
| --- | --- | --- | --- |
| #482 | `9071a7c7ae3bad23c1437b64c1b99280123c5f1d` | 2026-04-28 15:01:01 UTC | Add generator guardrails, audit coverage, template IDs, variant signatures, scheduler/signature evidence handling, and GPS redaction fixes. |
| #485 | `1959b794d024e7e9dabcf516183cd291ee4240af` | 2026-04-28 15:20:17 UTC | Raise production runtime generation from 1 to 4 generated items per family, reaching 171 runtime items while keeping reward units at 14. |
| #486 | `e688ba9b1840081f628e930416998c36112cb428` | 2026-04-28 15:34:21 UTC | Accept spaced hyphen, en dash, and em dash in fixed exact dash-clause items; document the marking policy. |

All three feature branches were merged into remote `main`. The remote feature branches were also deleted after merge.

### What did not change

The work intentionally did **not** add runtime AI question generation. It also did not redesign the Punctuation UI. No frontend or UX surface changed in these PRs, so a frontend-design pass was not needed.

The reward denominator did not increase. The release still exposes **14 published reward units**, and the runtime item increase does not inflate the reward model by itself.

## Baseline vs Final State

### Original baseline

The original audit described this runtime shape:

```text
Fixed evidence items:       71
Generator families:         25
Generated per family:        1
Generated runtime items:    25
Runtime total:              96
Published reward units:     14
```

That was directionally sound but shallow. It gave the product a deterministic generator, but it did not provide enough surface variation for regular practice or spaced retrieval. It also lacked enough guardrails to safely raise `generatedPerFamily` without accidentally producing repeated learner-visible items, hidden answer drift, or reward evidence inflation.

### Final runtime state

The final strict audit now reports:

```text
Fixed items:                71
Generator families:         25
Generated items:           100
Runtime items:             171
Published reward units:     14
```

Per-skill coverage from the final strict audit:

| Skill | Fixed | Generated | Distinct signatures | Modes | Validators |
| --- | ---: | ---: | ---: | --- | ---: |
| sentence_endings | 4 | 4 | 4 | choose, fix, insert, transfer | 2 |
| list_commas | 7 | 8 | 8 | choose, combine, fix, insert, transfer | 13 |
| apostrophe_contractions | 5 | 8 | 8 | choose, fix, insert, paragraph, transfer | 7 |
| apostrophe_possession | 5 | 8 | 8 | choose, fix, insert, paragraph, transfer | 11 |
| speech | 7 | 12 | 12 | choose, fix, insert, paragraph, transfer | 19 |
| fronted_adverbial | 7 | 12 | 12 | choose, combine, fix, insert, paragraph, transfer | 17 |
| parenthesis | 6 | 12 | 12 | choose, combine, fix, insert, paragraph, transfer | 18 |
| comma_clarity | 4 | 4 | 4 | choose, fix, insert, transfer | 6 |
| colon_list | 7 | 12 | 12 | choose, combine, fix, insert, paragraph, transfer | 17 |
| semicolon | 6 | 12 | 12 | choose, combine, fix, insert, paragraph, transfer | 16 |
| dash_clause | 5 | 8 | 8 | choose, combine, fix, insert, transfer | 11 |
| semicolon_list | 4 | 4 | 4 | choose, fix, insert, transfer | 6 |
| bullet_points | 5 | 8 | 8 | choose, fix, insert, paragraph, transfer | 13 |
| hyphen | 5 | 4 | 4 | choose, fix, insert, transfer | 7 |

This now meets the near-term target of **150-200 runtime items**. It does not yet meet the stronger long-term target of **280-420 runtime items**, but the system is now in a safer position to expand towards that target.

## Workstream 1: Generator Guardrails and Audit

PR #482 established the safety layer needed before increasing runtime generation.

### Repo-native audit command

The work added a Punctuation content audit that can be run as:

```bash
npm run audit:punctuation-content -- --strict --generated-per-family 4
```

The strict audit now checks the important surfaces for generated practice:

- fixed item count
- generator family count
- generated item count
- runtime item count
- published reward-unit count
- per-skill fixed coverage
- per-skill generated coverage
- generated signature count
- mode coverage
- readiness coverage
- validator coverage
- duplicate generated signatures
- generated model-answer marking

This matters because generated content quality cannot be proven by item count alone. A runtime bank can be large and still poor if the learner sees repeated shapes, if generated answers do not pass deterministic marking, or if generated variants produce hidden evidence side effects. The audit gives the release process a concrete way to detect these failure modes.

### Template IDs and variant signatures

Generated items now carry:

- `templateId`: identifies the template shape used to construct the item
- `variantSignature`: an opaque signature for the learner-visible generated surface

This is a deeper improvement than a simple count increase. It means the system can distinguish "different IDs" from "meaningfully different learner experience". Without that, a generator can produce many unique item IDs that are pedagogically equivalent. The signature layer lets scheduler and Star evidence logic treat equivalent surfaces as equivalent.

### Duplicate and over-capacity detection

The audit now passes with four generated variants per family. It also intentionally fails when generated variants exceed the unique bank capacity. In review, `--generated-per-family 5` failed as an over-capacity tripwire.

That is exactly the posture this subject needs: the release process should prevent the system from pretending that repeated generated surfaces are genuinely new practice.

### Scheduler repeat avoidance

The scheduler now uses recent variant signatures to avoid equivalent generated retries when alternatives exist. This is stronger than avoiding only recent item IDs because generated IDs can differ while still asking the same learner-visible question.

The review follow-up also tightened same-signature handling from a soft weight penalty to a hard avoid-when-alternative-exists rule. This reduces the risk that generated practice feels repetitive even as the runtime pool grows.

### Star evidence integrity

Generated item signatures are now carried through the internal attempt and event evidence path. Review follow-up closed two important evidence risks:

- mixed legacy and new evidence can no longer bypass Star caps by combining unsigned and signed forms of the same generated item
- Secure Star evidence is deduped by signature where available

This keeps the larger generated bank from accidentally inflating reward progression.

### Learner read-model redaction

Internal generated metadata is not exposed where it does not belong. GPS delayed-review rows no longer leak `variantSignature`. The browser-facing read models remain allowlisted and child-safe.

## Workstream 2: Runtime Bank Increase

PR #485 changed the production runtime default from:

```js
const GENERATED_ITEMS_PER_FAMILY = 1;
```

to:

```js
const GENERATED_ITEMS_PER_FAMILY = 4;
```

The runtime result is:

```text
71 fixed + (25 families x 4 generated variants) = 171 runtime items
```

### Why this is safe now

This change would have been riskier before PR #482. The reason it is now acceptable is that the generator bank can prove four distinct signatures per published family, and generated model answers pass deterministic marking.

The increase is therefore not just "turning up a number". It is backed by:

- strict generated-bank audit
- duplicate-signature checks
- validator coverage checks
- generated answer marking checks
- service stats tests
- static documentation guards
- independent review of reward denominator behaviour

### Reward denominator stays fixed

The service regression test added in PR #485 asserts:

```text
stats.total = 171
stats.fresh = 171
stats.publishedRewardUnits = 14
```

That is the important product contract. More runtime practice should give more learning opportunities, not more reward units. Reward progression remains tied to the published skill/reward-unit map.

### Documentation stale-claim fix

An independent reviewer caught a genuine release blocker: the original plan still made current-runtime claims that production was `generatedPerFamily: 1` and 96 items. That was accurate for the original audit, but stale after the runtime increase.

The fix did two things:

- updated the generator plan to say the current runtime is `generatedPerFamily: 4` and 171 items
- added a static documentation guard so the stale "1 current / 96 current" claim cannot quietly return

This is a useful lesson: for a content-system release, stale evidence can be as harmful as stale code. The completion state now treats documentation as part of the release surface.

## Workstream 3: Dash and Oxford Comma Marking Policy

The original plan called out two marking-policy concerns:

- dash-clause answers should not unfairly reject proper dash variants
- otherwise-correct Oxford commas should not be marked wrong unless the item explicitly forbids the final comma

### Oxford comma policy

The final system accepts both standard KS2 no-Oxford list forms and otherwise-correct Oxford comma forms for list-comma transfer/combine cases, unless an item explicitly sets `allowFinalComma: false`.

The tests also preserve the strict path: when `allowFinalComma: false` is set, an Oxford comma is still rejected with the expected `comma.unnecessary_final_comma` misconception tag.

This is the right compromise. It preserves the KS2 house style while avoiding unfair rejection of a grammatically valid answer.

### Dash-clause policy

Validator-backed transfer and combine dash items already accepted:

- spaced hyphen: ` - `
- en dash: ` – `
- em dash: ` — `

The remaining gap was subtler. An independent worker found that two fixed exact-marking dash items were still using accepted-answer exact matching only:

- `dc_insert_door_froze`
- `dc_fix_signal_team`

Those exact items accepted the spaced hyphen form but rejected en dash and em dash answers.

PR #486 fixed that by adding all three accepted variants to those exact items and adding regression tests that prove each accepted answer is correct and returns no misconception tags.

The marking engine itself was not loosened. This is important:

- semicolon boundary marking was not changed
- hyphenated-phrase marking was not changed
- unspaced dash answers are not accepted by this change
- semicolon answers are not accepted for dash exact items

The production documentation now distinguishes dash-clause boundary marks from exact hyphenated phrases.

## Verification Evidence

### Local verification

PR #482 local verification:

```text
node --test tests/punctuation-generators.test.js tests/punctuation-content-audit.test.js tests/punctuation-scheduler.test.js tests/punctuation-star-projection.test.js tests/punctuation-gps.test.js tests/punctuation-service.test.js tests/worker-punctuation-runtime.test.js
Result: 135 pass

npm run audit:punctuation-content -- --strict --generated-per-family 4
Result: pass

npm test
Result: 5765 pass, 0 fail, 6 skipped

npm run check
Result: pass
```

PR #485 local verification:

```text
node --test tests/punctuation-service.test.js tests/punctuation-generators.test.js tests/punctuation-content-audit.test.js tests/punctuation-doc-static-checks.test.js
Result: 39 pass

npm run audit:punctuation-content -- --strict --generated-per-family 4
Result: pass

npm test
Result: 5773 tests, 5767 pass, 6 skipped, 0 fail

npm run check
Result: pass
```

PR #486 local verification:

```text
node --test tests/punctuation-marking.test.js tests/punctuation-generators.test.js tests/punctuation-doc-static-checks.test.js
Result: 33 pass

npm run audit:punctuation-content -- --strict --generated-per-family 4
Result: pass

reviewer targeted Punctuation surface/Worker checks
Result: 322 pass

npm test
Result: 5774 tests, 5768 pass, 6 skipped, 0 fail

npm run check
Result: pass
```

Final report branch verification:

```text
npm run audit:punctuation-content -- --strict --generated-per-family 4
Result: pass
```

Final audit output:

```text
fixed items: 71
generator families: 25
generated items: 100
runtime items: 171
published reward units: 14
```

### GitHub checks

Every shipped PR had the same remote check posture:

| PR | Node Tests | Client Bundle Audit | GitGuardian | Playwright |
| --- | --- | --- | --- | --- |
| #482 | Success | Success | Success | Skipped |
| #485 | Success | Success | Success | Skipped |
| #486 | Success | Success | Success | Skipped |

The Playwright check was skipped by the PR workflow condition. This work did not change UI/UX surfaces.

### Independent review

The autonomous review loop was not ceremonial. It caught real issues:

- a stale current-runtime documentation claim in the plan after the runtime increase
- an exact-marking dash gap that the validator-backed tests did not cover

Both findings were fixed before merge.

Independent reviewers also confirmed:

- generated bank increase did not inflate reward units
- GPS read models did not expose internal signatures
- semicolon and hyphenated-phrase marking were not loosened by the dash policy fix
- exact dash tests covered both insert and fix items
- PRs were merge-ready after GitHub checks completed

## Product Impact

### Better practice volume

The learner-facing runtime bank is now materially larger:

```text
Before:  96 runtime items
After:  171 runtime items
Delta:  +75 runtime items
```

This reduces memorisation pressure and gives Smart review, weak spots, guided learning, GPS, transfer, combine, and paragraph modes more room to breathe.

### Safer generation posture

The system can now expand deterministically without pretending to be an AI author. The teacher-authored template approach remains the right fit for this subject:

- deterministic validators
- known answer shapes
- bounded misconception tags
- child-safe explanations
- stable release evidence
- auditability

For KS2 punctuation, that is more valuable than open-ended runtime generation.

### Better evidence quality

The variant-signature work protects the learning model from a common generated-content failure: counting superficial variation as independent mastery evidence.

The work now distinguishes:

- a genuinely different generated practice surface
- a repeated template surface with a different ID
- a fixed evidence item
- a generated item with a reusable signature

That is the right foundation for mastery and spaced retrieval.

### Less unfair marking

The marking-policy fixes reduce false negatives:

- valid Oxford comma forms are accepted unless explicitly disallowed
- valid dash variants are accepted for both validator-backed and fixed exact dash-clause items

This is important for trust. A child should not lose credit for using an en dash or em dash where the learning objective is "mark a clause boundary with a dash".

## Engineering Insights

### 1. Item count is not content quality

The headline number moved to 171 runtime items, but the meaningful engineering work was the audit layer. Without signature checks and model-answer marking checks, a larger generated bank could be a false improvement.

The right metric is not simply "how many items exist". The better metric is:

```text
runtime item count
+ distinct learner-visible signatures
+ validator coverage
+ marking pass rate
+ scheduler non-repeat behaviour
+ reward evidence integrity
```

### 2. Exact-answer paths and validator paths need separate coverage

The dash variant issue is a good example. Transfer validators already accepted dash variants, but fixed exact items did not. A broad "dash variants pass" test could look green while exact insert/fix items still reject valid answers.

Future marking policy work should always ask:

- Does this item use a validator?
- Does this item fall through to exact accepted-answer matching?
- Does the policy need to be represented in content, marking code, or both?

### 3. Documentation can become a release blocker

The stale `generatedPerFamily: 1` / 96-item claim was not a code bug, but it was still a blocker because it contradicted the release state. Static documentation checks were the right response.

For content systems, documentation is operational evidence. If it goes stale, future release decisions become less reliable.

### 4. Reward safety matters more as content volume grows

The more generated items exist, the easier it is to accidentally over-credit repeated evidence. Carrying signatures into attempt/event evidence and deduping secure evidence by signature are therefore core safety work, not polish.

### 5. The right future is richer deterministic templates, not runtime AI

The current implementation confirms the original judgement: Punctuation should grow through deterministic, teacher-authored template variety with validators and golden tests.

Runtime AI would make it harder to guarantee:

- valid model answers
- age-appropriate wording
- stable misconception tags
- repeatable audit output
- reward evidence integrity
- browser redaction safety

The product can still benefit from tooling that helps authors create context packs or templates, but the learner runtime should remain deterministic.

## Residual Risks and Follow-Up Recommendations

### R1: Long-term variety is not finished

The near-term runtime target is met, but the strong product target is still 280-420 runtime items. The next content expansion should add deeper template variety before raising `generatedPerFamily` again.

Recommended next target:

```text
8-12 genuinely distinct templates or slot combinations per generator family
```

Priority skills:

- sentence_endings
- apostrophe_contractions
- comma_clarity
- semicolon_list
- hyphen
- dash_clause

These are the places where fixed anchors and generated family count are still thinnest.

### R2: Fixed anchor depth still matters

Generated items improve practice volume, but fixed evidence items still matter because they provide stable, human-authored anchors for key skill boundaries. Several skills still have only four or five fixed items.

Recommended follow-up:

- add fixed transfer items for the thinnest skills
- add one paragraph or multi-skill repair item only where it genuinely tests transfer
- avoid letting one multi-skill paragraph count too heavily towards deep secure evidence

### R3: Release-id hardening remains a worthwhile follow-up

An independent review noted a pre-existing risk around release-id filtering in star projection. The runtime generated-bank work did not introduce that risk, and current service stats/read-model denominator behaviour remains anchored to current published keys. However, release-id hardening would still be a good future slice.

Recommended follow-up:

- add targeted tests proving old-release reward-unit evidence cannot inflate current secure/grand Star calculations
- verify `projectPunctuationStars()` applies release scope consistently wherever it receives release-aware inputs

### R4: Audit command should become an explicit release gate if it is not already

The audit is now strong enough to act as a release gate. If it is not wired into the normal CI path, it should be considered for inclusion.

Candidate gate:

```bash
npm run audit:punctuation-content -- --strict --generated-per-family 4
```

This would prevent future generated-bank changes from bypassing the audit accidentally.

### R5: Context packs should be expanded carefully

Context packs are useful, but they should remain constrained. The next step is not to expose AI-generated learner content. It is to improve teacher-authored context variation while keeping the punctuation rule, validator, model answer, and marking deterministic.

Recommended direction:

- context packs across all 25 generator families
- no browser exposure of hidden validators or accepted-answer lists
- signature checks for context-pack generated variants
- model-answer marking in the audit

### R6: Live production smoke was not part of this completion report

The PRs were merged to remote `main` with local and GitHub verification. This report does not claim a separate live production UI smoke on `https://ks2.eugnel.uk`.

Recommended deployment gate for a production release:

- confirm the deployed build includes the merged commits
- complete one Worker-backed Punctuation Smart review item
- complete one GPS delayed-review item
- inspect Parent/Admin evidence redaction for hidden generated metadata
- confirm runtime stats still show 171 items and 14 published reward units

## Final Acceptance Status

The Punctuation question-generator P1 work is complete for the agreed near-term scope.

Accepted:

- deterministic generated practice remains the runtime model
- generated item guardrails exist and pass strict audit
- generated variants carry stable template and signature metadata
- scheduler and Star evidence use signatures to avoid repeat and over-credit risks
- production runtime uses four generated variants per family
- runtime bank is 171 items
- reward denominator remains 14 published reward units
- stale runtime documentation claims are guarded
- Oxford comma policy is explicit and tested
- dash variants are accepted in both validator-backed and fixed exact dash-clause items
- all three implementation PRs are merged to remote `main`

Not accepted as "done forever":

- long-term 280-420 item target
- deeper fixed anchor coverage
- release-id hardening
- context-pack expansion across all families
- production post-deploy smoke

That distinction matters. The P1 work has made the system safe enough for the current runtime expansion and materially better for learners. The next phase should now focus on depth, not merely count.
