---
title: "Grammar QG P7 — Production Calibration Activation and Evidence-Led Actions"
type: implementation-brief
status: proposed
subject: grammar
programme: grammar-question-generator
previous_phase: grammar-qg-p6-2026-04-29
created: 2026-04-29
language: en-GB
---

# Grammar QG P7 — Production Calibration Activation and Evidence-Led Actions

## 1. Purpose

Grammar QG P1–P5 established deterministic content quality, answer-spec governance, explanation coverage, mixed-transfer coverage, deep-seed depth, and machine-verifiable release checks. P6 added learner-safe calibration telemetry and script-only analytics.

P7 should now activate those calibration systems against real production evidence.

The goal is **not** to add more templates by default. The goal is to make Grammar QG measurable in production, identify which templates and concepts need action, and prepare evidence-led changes without quietly altering mastery, Star, Mega, monster, Concordium, or reward semantics.

## 2. Current state after P6

The shipped content denominator should remain:

| Measure | Expected P7 starting value |
|---|---:|
| Concepts | 18 |
| Templates | 78 |
| Selected-response templates | 58 |
| Constructed-response templates | 20 |
| Generated templates | 52 |
| Fixed templates | 26 |
| Answer-spec templates | 47 |
| Constructed-response answer-spec templates | 20 / 20 |
| Manual-review-only templates | 4 |
| Explanation templates | 17 |
| Concepts with explanation coverage | 18 / 18 |
| Mixed-transfer templates | 8 |
| Concepts with mixed-transfer coverage | 18 / 18 |
| Deep low-depth families | 0 |
| Default-window repeated variants | 0 |
| Cross-template signature collisions | 0 |
| Content-quality hard failures | 0 |
| Content-quality advisories | 0 |

P7 should not change this denominator unless a specific content-quality bug is discovered and fixed through a reviewed content release.

## 3. P6 validation findings that P7 must address first

P6 is broadly valid, but P7 should start by closing the remaining governance and data-shape gaps.

### 3.1 Report frontmatter must stop accepting placeholders

P6 introduced frontmatter fields such as `implementation_prs`, `final_content_release_commit`, `post_merge_fix_commits`, and `final_report_commit`. However, `final_report_commit: pending` is still present in the P6 report and the validator only checks for a minimum length. P7 must reject placeholder values such as `pending`, `todo`, `tbc`, `unknown`, and empty strings.

Acceptance:
- `validateReleaseFrontmatter()` rejects `pending` and other placeholder tokens.
- The P6 final report is either backfilled with a real final report commit, or the report status explicitly remains `pending-final-report-commit` and cannot be represented as fully final.
- The P7 final report includes separate fields for implementation PRs, final release commit, post-merge fix commits, final report commit, and post-deploy smoke evidence.

### 3.2 Production smoke evidence path must be standardised

P6 report text names `reports/grammar/grammar-qg-p6-production-smoke.json`, while the smoke script writes `reports/grammar/grammar-production-smoke-${GRAMMAR_CONTENT_RELEASE_ID}.json`.

P7 must choose one canonical format and make the report validator enforce it.

Recommended canonical path:

```text
reports/grammar/grammar-production-smoke-<contentReleaseId>.json
```

For P6 this would be:

```text
reports/grammar/grammar-production-smoke-grammar-qg-p6-2026-04-29.json
```

Acceptance:
- The production smoke script writes the canonical path.
- The completion report references the canonical path.
- The report validator checks that the named evidence file exists when post-deploy smoke is claimed as passed.
- Repository smoke, configured-origin smoke, and post-deploy smoke remain distinct.

### 3.3 Test-count reporting must be machine-derived

P6 report says `verify:grammar-qg-p6` ran 199 tests. The merged PR body reported 194 tests. P7 should stop hand-writing test totals.

Acceptance:
- A script captures the verification summary into a JSON artefact.
- The final report imports test totals from that artefact.
- The report validator fails if the claimed test totals differ from the artefact.

### 3.4 Analytics scripts need a canonical per-concept event row format

P6 engine events carry `conceptIds` and object-shaped `conceptStatusBefore` / `conceptStatusAfter`. P6 analytics scripts currently expect a singular `conceptId` event row. This is documented as a known risk, but P7 must formalise the expansion step.

Acceptance:
- Add `scripts/grammar-qg-expand-events.mjs` or equivalent.
- Input: raw Grammar event stream.
- Output: one canonical row per `(eventId, conceptId)`.
- Preserve parent event fields: `eventId`, `templateId`, `generatorFamilyId`, `variantSignature`, `questionType`, `tags`, `answerSpecKind`, `score`, `maxScore`, `correct`, `supportLevel`, `firstAttemptIndependent`, `supportUsed`, `wasRetry`, `elapsedMsBucket`, `mode`, `createdAt`.
- Add per-concept fields: `conceptId`, `conceptStatusBefore`, `conceptStatusAfter`, `isMixedTransfer`, `isExplanation`, `isSurgery`, `isManualReviewOnly`.
- Health, mixed-transfer, and retention scripts consume canonical rows, not raw events.

### 3.5 Health classifications must match the documented taxonomy

P6 report describes `transfer_gap` and `retention_gap`, but the current health report script does not classify templates into those categories. P7 must either implement them or remove them from the documented taxonomy.

Recommended: implement them as cross-report classifications after concept-local, mixed-transfer, and retention metrics are available.

Acceptance:
- `transfer_gap` is emitted only when local-practice success is healthy but mixed-transfer success is low with sufficient confidence.
- `retention_gap` is emitted only when secure concepts later lapse at a high rate with sufficient confidence.
- Tests cover `transfer_gap` and `retention_gap` using canonical rows.

### 3.6 `weakToSecureRecoveryRate` must be renamed or corrected

P6 health report currently counts correct attempts that started from `weak`; it does not prove that the concept moved to `secure`. P7 must either rename this to `weakCorrectAttemptRate` or compute true `weakToSecureRecoveryRate` by comparing `conceptStatusBefore === 'weak'` and `conceptStatusAfter === 'secure'` or `secured`.

Recommended: compute both.

Acceptance:
- `weakCorrectAttemptRate` is available.
- `weakToSecureRecoveryRate` means actual transition from weak to secure/secured.
- Tests prove the distinction.

## 4. Non-goals

P7 must not:

- Use AI to generate production questions.
- Auto-retire templates without review.
- Change Star, Mega, monster, Concordium, or reward semantics.
- Change mastery thresholds or mixed-transfer scoring based only on synthetic data.
- Demote learners or show child-facing “you lost secure” copy.
- Expose calibration telemetry in learner read models.
- Add a D1 schema migration unless the implementation proves script-only exports are insufficient.

## 5. Implementation units

### U0. Governance closure and release evidence hardening

Fix the remaining P6 governance issues before adding new analytics behaviour.

Deliverables:
- Harden `validateReleaseFrontmatter()` so placeholders fail.
- Validate the actual P6 final report path in CI or the release command.
- Standardise the production smoke evidence path.
- Add a verification-summary artefact, for example:

```text
reports/grammar/grammar-qg-p7-verify-summary.json
```

The summary should include command, commit SHA, content release ID, test files, test count, pass count, fail count, and timestamp.

Acceptance:
- `npm run verify:grammar-qg-p7` runs the P7 gate.
- The P7 gate validates the actual completion report, not only mock reports.
- Report validation fails on placeholder commit values.
- Report validation fails if post-deploy smoke is claimed without evidence.

### U1. Client elapsed timing plumbing

P6 added `elapsedMsBucket` but leaves it as `null` because client timing is not yet plumbed. P7 should add safe timing capture.

Recommended contract:

```ts
payload: {
  response,
  clientElapsedMs?: number
}
```

Server rules:
- Accept only finite numbers.
- Clamp to a safe range, for example `0..180000` ms.
- Store only the bucket, not the raw value, unless raw value is needed in private analytics export.
- Ignore missing or invalid values.
- Never use elapsed time for scoring in P7.

Acceptance:
- `elapsedMsBucket` is populated for normal submitted answers when `clientElapsedMs` is present.
- Missing timing still yields `null`.
- Negative, non-finite, and extreme values do not crash the engine.
- Learner read models do not expose `elapsedMsBucket`.
- The health report can use real buckets.

### U2. Canonical event expansion pipeline

Create a reliable bridge from raw Grammar events to analytics rows.

Suggested script:

```bash
node scripts/grammar-qg-expand-events.mjs \
  --input=reports/grammar/raw-events.json \
  --output=reports/grammar/grammar-qg-expanded-events.json
```

Output row shape:

```ts
{
  rowId: string,
  parentEventId: string,
  learnerHash?: string,
  contentReleaseId: string,
  templateId: string,
  generatorFamilyId: string | null,
  variantSignature: string | null,
  questionType: string,
  conceptId: string,
  allConceptIds: string[],
  tags: string[],
  answerSpecKind: string | null,
  score: number,
  maxScore: number,
  correct: boolean,
  supportLevel: number,
  firstAttemptIndependent: boolean,
  supportUsed: boolean,
  wasRetry: boolean,
  elapsedMsBucket: string | null,
  mode: string,
  conceptStatusBefore: string,
  conceptStatusAfter: string,
  createdAt: string | number
}
```

Acceptance:
- Multi-concept mixed-transfer events expand into multiple rows.
- Single-concept events expand into one row.
- Malformed events are skipped with a summary count.
- Expansion is deterministic and idempotent.
- Scripts no longer require callers to hand-shape `conceptId` rows.

### U3. Production telemetry export and anonymisation

P7 should add a safe way to export Grammar QG calibration events from the production event source.

If direct D1/event-log export exists already, wrap it in a Grammar-specific script. If not, create an offline input contract first and do not add a database migration until needed.

Deliverables:
- `scripts/export-grammar-qg-events.mjs` or equivalent.
- Filter by subject `grammar` and release IDs `grammar-qg-p6-2026-04-29` onward.
- Optional filters: date range, learner cohort, template ID, concept ID.
- Anonymise learner identifiers by hashing or omitting them.
- Output raw events and expanded rows separately.

Acceptance:
- No raw child names, emails, or account identifiers in exported artefacts.
- Export can run locally against a fixture.
- Export has a dry-run mode.
- Export summary includes event count, learner count if safely hashed, date range, malformed count, and release IDs.

### U4. Calibration report runner

Create a single command that runs all calibration reports from canonical expanded rows.

Suggested command:

```bash
npm run grammar:qg:calibrate -- --input=reports/grammar/grammar-qg-expanded-events.json
```

Outputs:

```text
reports/grammar/grammar-qg-p7-health-report.json
reports/grammar/grammar-qg-p7-health-report.md
reports/grammar/grammar-qg-p7-mixed-transfer-calibration.json
reports/grammar/grammar-qg-p7-mixed-transfer-calibration.md
reports/grammar/grammar-qg-p7-retention-report.json
reports/grammar/grammar-qg-p7-retention-report.md
reports/grammar/grammar-qg-p7-action-candidates.json
```

Acceptance:
- Reports include confidence levels and minimum sample warnings.
- Reports separate synthetic fixtures from production exports.
- Reports include release ID and source artefact hashes.
- Reports do not make production scoring recommendations when confidence is insufficient.

### U5. Evidence-led action candidate generation

P7 should not automatically change content or scoring. It should produce reviewed action candidates.

Candidate categories:

| Candidate | Trigger |
|---|---|
| `keep` | Healthy and stable |
| `warm_up_only` | Too easy, high confidence |
| `review_wording` | Ambiguous or wrong-after-support high |
| `add_bridge_practice` | Local success high but mixed-transfer weak |
| `expand_case_bank` | High use plus rising repeat exposure or timing collapse |
| `rewrite_distractors` | Many wrong answers cluster around one distractor |
| `reduce_scheduler_weight` | Too hard or support-dependent with high confidence |
| `retire_candidate` | Persistently poor after revision/support, high confidence |
| `increase_maintenance` | Retention gap after secure |

Acceptance:
- Candidates require confidence thresholds.
- Candidates are output to JSON and Markdown.
- No candidate mutates `content.js`, scheduler weights, mastery, or reward state automatically.
- Every candidate includes evidence counts and a human-readable rationale.

### U6. Mixed-transfer evidence decision gate

P6 created a shadow weight model. P7 should decide whether it is mature enough to influence mastery in a later phase.

P7 should still remain analytics-first. If production data is insufficient, the correct outcome is “keep shadow mode”.

Decision outputs:
- `keep_shadow_only`
- `prepare_scoring_experiment`
- `do_not_promote`

Acceptance:
- Decision is based on real production events, not synthetic fixtures.
- At least 30 attempts per mixed-transfer template are required for medium confidence; at least 100 for high confidence.
- Any proposal to alter mastery scoring is written as a separate future plan, not shipped silently in P7.

### U7. Retention-after-secure maintenance decision gate

Use production data to decide whether secure concepts need additional maintenance scheduling.

P7 should measure:
- Retained-after-secure rate by concept.
- Lapse-after-secure rate by concept.
- Difference between mixed review and local review retention.
- Time to first lapse.
- Whether lapses cluster by template family.

Acceptance:
- If data is insufficient, reports say `insufficient_data` rather than overclaiming.
- No child-facing demotion copy is introduced.
- Any scheduler change is written as a separate future plan unless P7 explicitly includes and tests it.

### U8. Adult-facing calibration view, optional but recommended

If time allows, create a lightweight internal/adult view that reads generated report artefacts.

Recommended file:

```text
src/subjects/grammar/GrammarAnalyticsScene.jsx
```

Minimum view:
- Release ID.
- Date range.
- Template classification table.
- Concept retention table.
- Mixed-transfer evidence table.
- Action candidates.
- Confidence warnings.

Acceptance:
- Adult/admin/internal only.
- No child-facing demotion or fear copy.
- Does not expose answer keys.
- Does not expose raw learner identifiers.

### U9. Post-deploy smoke evidence

After the P7 release is deployed, run Grammar production smoke against the deployed Worker.

Acceptance:
- Evidence artefact exists at the canonical path.
- Artefact includes `ok: true`, deployed origin, content release ID, commit SHA, tested template IDs, answer-spec families covered, and timestamp.
- Completion report distinguishes repository verification from post-deploy verification.

## 6. Tests to add or update

Required tests:
- `grammar-qg-p7-governance.test.js`
- `grammar-qg-p7-elapsed-timing.test.js`
- `grammar-qg-p7-event-expansion.test.js`
- `grammar-qg-p7-health-report.test.js`
- `grammar-qg-p7-action-candidates.test.js`
- `grammar-qg-p7-production-evidence.test.js`

Existing tests to preserve:
- P1–P6 baseline tests.
- `verify:grammar-qg` P5 backward compatibility.
- `verify:grammar-qg-p6` P6 compatibility.
- Production smoke read-model redaction tests.
- Engine and selection regression tests.

Suggested verification command:

```json
{
  "verify:grammar-qg-p7": "npm run verify:grammar-qg-p6 && node --test tests/grammar-qg-p7-governance.test.js tests/grammar-qg-p7-elapsed-timing.test.js tests/grammar-qg-p7-event-expansion.test.js tests/grammar-qg-p7-health-report.test.js tests/grammar-qg-p7-action-candidates.test.js tests/grammar-qg-p7-production-evidence.test.js"
}
```

## 7. Data safety and privacy rules

P7 calibration artefacts must be safe for adult/internal use.

Rules:
- Do not export raw child names, emails, account IDs, or household identifiers.
- Use hashed learner IDs only if cohort-level repeated measures are necessary.
- Keep answer keys out of learner-facing output.
- Keep telemetry fields out of learner read models.
- Keep raw response text out of general calibration reports unless a specific reviewed diagnostic report requires it.
- Treat manual-review-only writing/build responses as non-scored and exclude them from mastery calibration.

## 8. Release and content ID rules

Do not bump `GRAMMAR_CONTENT_RELEASE_ID` for analytics-only changes.

Bump the content release ID only if P7 changes:
- Grammar templates.
- Case banks.
- Answer specs.
- Marking behaviour.
- Learner-visible feedback text.
- Scheduler/content-selection semantics in a way that affects learner-facing practice.

If P7 only adds event export, expansion, reports, elapsed timing, and adult analytics, keep the existing content release ID and add a separate analytics schema version, for example:

```ts
grammarQGCalibrationSchemaVersion: 'grammar-qg-p7-calibration-v1'
```

## 9. P7 completion report requirements

The P7 final report must include:
- Exact implementation PRs.
- Final content release ID and whether it changed.
- Final analytics schema version.
- Final verification command and machine-derived test summary.
- Repository smoke status.
- Post-deploy smoke status and evidence path, or explicit `not-run`.
- Production telemetry source status: fixture-only, staging, or production.
- Whether any real production calibration conclusions were made.
- Whether any scoring or mastery change was made. Expected default: no.
- Action candidates produced, if enough data exists.
- Remaining risks.
- P8 recommendations.

The report must not claim learner calibration findings from synthetic fixtures. It may claim that infrastructure is ready, or that fixture/staging/production reports were generated, depending on the actual evidence available.

## 10. Expected P8 direction

P8 should be evidence-led content and scheduler adjustment.

Possible P8 work, depending on P7 evidence:
- Rewrite or retire high-confidence ambiguous templates.
- Add bridge templates where mixed-transfer gaps are proven.
- Adjust scheduler weighting for maintenance if retention gaps are proven.
- Promote mixed-transfer shadow evidence into mastery scoring only if production data is strong and a separate scoring plan is reviewed.
- Build a durable adult analytics dashboard if script reports prove useful.

P7 should prepare these decisions; it should not rush them.

## 11. Definition of done

P7 is complete when:
- P6 governance gaps are closed.
- Client elapsed timing is safely bucketed or explicitly deferred with a tested placeholder.
- Raw Grammar events can be expanded into canonical per-concept analytics rows.
- Health, mixed-transfer, and retention reports run from canonical rows.
- Action candidates are generated with confidence thresholds.
- No reward/mastery/Star/Mega/monster semantics are changed silently.
- Post-deploy smoke is either run with evidence or explicitly marked not-run.
- The final report is validated against live audit output and evidence artefacts.
