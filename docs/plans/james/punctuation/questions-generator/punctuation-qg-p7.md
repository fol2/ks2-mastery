# Punctuation QG P7 — Oracle Hardening, Reviewer Decisions, and Depth-6 Readiness

Date: 29 April 2026  
Owner: KS2 Mastery / Punctuation  
Phase type: production trust hardening and release-decision contract  
Recommended release posture: keep production generated depth at 4 until all P7 gates pass  
Current production release id: `punctuation-r4-full-14-skill-structure`  
Runtime AI generation: not allowed

## 1. Purpose

P6 closed the most serious content-quality gaps in the Punctuation question generator: fixed-bank self-marking, apostrophe normalisation, speech reporting-after acceptance, rule-specific generated explanations, feedback redaction, edge-case tests, and a reviewer QA pack.

P7 exists because the engine is now close enough to production maturity that the next risks are not obvious missing features. They are trust risks:

- the marking oracle must reject subtly wrong answers, not only accept newly valid ones;
- depth-6 activation must be reviewable with real tooling, not just mechanically possible;
- reviewer decisions must be durable and enforceable;
- explanations must be semantically right for the exact item, not merely non-generic;
- perceived variety must be judged at the learner-experience level, not only by same-mode duplicate checks;
- production depth must come from one canonical source, so a depth raise cannot be half-applied.

P7 is therefore not a volume phase. It is a production trust phase. A successful P7 may still keep production at depth 4.

## 2. Current baseline

As of P6:

| Metric | Current value |
|---|---:|
| Fixed items | 92 |
| Published generator families | 25 |
| Production generated depth | 4 per family |
| Production generated items | 100 |
| Production runtime pool | 192 items |
| Depth-6 inclusive candidate pool | 242 items |
| Depth-6 generated candidates | 150 items |
| Depth-8 capacity pool | 292 items |
| Published reward units | 14 |
| Runtime AI generation | none |
| Telemetry lifecycle | 10 emitted, 1 reserved |
| Telemetry test classification | 1 proof-tested, 9 smoke-tested |
| Human reviewer decisions | not populated |
| Production depth decision | remain at 4 |

P7 must preserve the learner-facing runtime shape unless it deliberately raises depth with a new release id and deployment evidence.

## 3. P6 validation findings driving P7

P6 is substantially real, but the validation found several gaps that must not be ignored.

First, the speech fairness fix accepts reporting-after answers, but the current oracle appears too permissive for `reportingPosition: 'any'`. A broad prompt should accept both `Mia asked, "Can we start now?"` and `"Can we start now?" asked Mia.`, but it should not accept a reporting-before answer with the reporting comma missing, such as `Mia asked "Can we start now?"`. P7 must make the speech validator direction-aware.

Second, the reviewer pack currently covers the production pool. It does not yet provide a working depth-6 candidate review mode, despite the P6 report recommending `--include-depth-6`. P7 must add proper depth/candidate review tooling.

Third, perceived-variety reporting is useful but not yet a human approval gate. Cross-mode overlap clusters are counted and reported, but reviewer decisions are empty. P7 must require decisions for clusters and items before any depth raise.

Fourth, explanation tests currently prove that the generic fallback is gone and internal ids are not leaked. They do not prove that every explanation is semantically matched to the exact rule, answer shape, and misconception. P7 must add a semantic explanation oracle.

Fifth, production depth must have one source of truth. P6 still leaves a risk that generator constants, service constants, smoke expected counts, and report counts can drift. P7 must remove that class of error.

Sixth, P6 verification wording must be precise. The P6 command has 9 top-level gates composing P5 and P6 checks; reports may describe 18 logical gates, but output and documentation must state both numbers clearly.

## 4. Non-goals

P7 must not:

- add runtime AI question generation;
- raise production depth merely because audits pass mechanically;
- create new quiz modes or cosmetic learner UI;
- change subject mastery or Star semantics;
- expose template ids, validator names, variant signatures, or raw misconception ids to children;
- treat empty reviewer-decision fixtures as proof of human approval;
- claim telemetry proof where tests can pass without the event firing;
- make depth 8 learner-facing.

## 5. Product contract

The learner promise after P7 is:

> Punctuation practice marks fair answers fairly, rejects real punctuation mistakes, explains the exact rule in child-readable language, and avoids repeated-looking questions unless a reviewer has approved the repetition as pedagogically useful.

The adult/reviewer promise after P7 is:

> Every production item and every proposed depth-6 candidate can be inspected with live marking results, accepted alternatives, negative cases, explanation text, validator summaries, perceived-variety clusters, and durable reviewer decisions.

The engineering promise after P7 is:

> The production runtime shape is derived from canonical constants, verified by one command, and safely deployable with exact release-id, runtime-count, and smoke-attestation evidence.

## 6. Work units

### P7-U1 — Direction-aware speech oracle

Fix speech validation so `reportingPosition: 'any'` means “accept valid reporting-before and valid reporting-after forms”, not “skip reporting-clause punctuation checks”.

Required behaviour:

- Reporting-before answer: `Mia asked, "Can we start now?"` marks correct.
- Reporting-before missing comma: `Mia asked "Can we start now?"` marks incorrect.
- Reporting-after answer: `"Can we start now?" asked Mia.` marks correct.
- Reporting-after answer must still keep the question mark or exclamation mark inside the closing inverted comma.
- Items with `reportingPosition: 'before'` still reject reporting-after answers.
- Items with `reportingPosition: 'after'` still reject reporting-before answers unless the prompt explicitly allows both.

Implementation guidance:

- Add a helper that detects the actual answer shape from the quote-pair position: `reporting-before`, `reporting-after`, `speech-only`, or `invalid`.
- Run comma-before-opening-quote checks only when the answer shape is reporting-before.
- Do not infer validity solely from the rubric’s allowed positions.
- Keep straight, curly, single, and double inverted commas supported.

Required tests:

- Add negative tests for reporting-before missing comma under `reportingPosition: 'any'`.
- Add tests using the real fixed item `sp_transfer_question`, not only synthetic items.
- Add generated-template tests for all speech DSL families that allow both orders.
- Add feedback tests proving a missing reporting comma produces a reporting-comma message, not a misleading capitalisation or sentence-boundary message.

Acceptance criteria:

- `Mia asked "Can we start now?"` is rejected.
- `"Can we start now?" asked Mia.` remains accepted.
- All existing P6 speech fairness tests still pass.
- Golden marking remains green across all 25 families.

### P7-U2 — Canonical production depth source

Unify production generated depth so service runtime, generator runtime, review tooling, smoke scripts, and reports cannot drift.

Required behaviour:

- There is one canonical exported production-depth value for Punctuation generated items.
- The service runtime imports and uses that value rather than maintaining a separate hardcoded `4`.
- Production smoke expected runtime is derived from fixed count + published family count × production depth, unless an override is explicitly passed for a deployment probe.
- Reports print both the configured production depth and the observed runtime count.

Acceptance criteria:

- A test fails if `createPunctuationRuntimeManifest()` and the Worker/service runtime produce different generated counts.
- A test fails if a hardcoded production generated depth is introduced outside the canonical config module.
- The documented depth-6 activation path is accurate and executable.

### P7-U3 — Depth-6 candidate reviewer pack

Extend `npm run review:punctuation-questions` so reviewers can inspect production items and depth-6 candidates deliberately.

Required CLI support:

```bash
npm run review:punctuation-questions
npm run review:punctuation-questions -- --json
npm run review:punctuation-questions -- --depth 6
npm run review:punctuation-questions -- --include-depth-6
npm run review:punctuation-questions -- --candidate-depth 6 --out punctuation-depth6-review.json
```

Required output modes:

- Production pool only: 192 items at depth 4.
- Inclusive depth-6 pool: 242 items, including fixed items and generated depth 1–6 variants.
- Depth-6 generated candidates only: 150 generated items.
- Delta view: the additional 50 generated items beyond production depth 4.

Each item entry must include:

- item id;
- source;
- skill ids;
- reward unit;
- mode;
- prompt;
- stem;
- model answer;
- accepted alternatives;
- live marking result for the model answer;
- live marking result for every accepted alternative;
- live marking result for configured negative examples, where available;
- explanation;
- validator/rubric summary in reviewer language;
- misconception tags for reviewer/admin only;
- readiness tags for reviewer/admin only;
- template id and variant signature for reviewer/admin only;
- production/candidate status;
- perceived-variety cluster ids;
- reviewer decision and notes, if present.

Acceptance criteria:

- The default command remains production-safe and outputs the 192-item production pack.
- `--include-depth-6` works and outputs the 242-item inclusive pack.
- The report clearly distinguishes current production items from candidate-only items.
- The P6 report’s depth-6 review instruction becomes true.

### P7-U4 — Durable reviewer-decision gate

Convert reviewer decisions from an empty fixture into a real gate.

Required decision schema:

```json
{
  "itemId": "...",
  "clusterId": "...",
  "decision": "approved | acceptable-cross-mode-overlap | needs-rewrite | needs-marking-fix | needs-prompt-tightening | retire | pending",
  "reviewer": "...",
  "reviewedAt": "YYYY-MM-DD",
  "rationale": "..."
}
```

Required gate behaviour:

- Production items with `needs-rewrite`, `needs-marking-fix`, `needs-prompt-tightening`, `retire`, or `pending` fail the production gate.
- Depth-6 candidate items with blocking decisions fail the depth-6 activation gate but do not fail current depth-4 production if they are not learner-facing.
- Cross-mode overlap clusters require `acceptable-cross-mode-overlap` with a rationale, or the affected items must be rewritten/retired.
- Same-mode duplicates remain a hard failure unless explicitly whitelisted with a short-term expiry and a reason.

Acceptance criteria:

- Empty reviewer decisions no longer count as human QA.
- The fixture records item decisions and cluster decisions separately.
- CI can run in `production-only` and `depth-6-candidate` modes.
- The P7 completion report states exactly how many items and clusters were approved, rewritten, retired, or blocked.

### P7-U5 — Accepted-alternative and negative-case review proof

The P6 fixed-bank self-marking test proves fixed models and accepted alternatives. P7 must make the reviewer pack equally useful.

Required behaviour:

- Reviewer pack shows live marking for each accepted alternative, not only the model answer.
- Choice items show every option, the correct index, and proof that exactly one option marks correct.
- Open-transfer items include at least one intended reject case where practical.
- Generated DSL families expose their golden accept/reject vectors in a reviewer-friendly summary.

Acceptance criteria:

- A reviewer can see why each item accepts what it accepts and rejects what it rejects.
- Any accepted alternative that fails marking blocks verification.
- Any negative example that unexpectedly marks correct blocks verification.

### P7-U6 — Semantic explanation oracle

Strengthen explanation quality beyond “not generic”.

Required behaviour:

- Every generated explanation must be mapped to a rule family and item-specific rule features.
- Speech explanations must mention that punctuation belonging to the spoken words stays inside the closing inverted comma where relevant.
- Plural possessive explanations must distinguish apostrophe-after-plural-noun cases from singular possession cases.
- List-comma explanations must match the item’s Oxford-comma policy.
- Bullet-point explanations must mention consistency and colon/stem alignment where the item tests those features.
- Colon-list explanations must say that the colon follows a complete opening idea where the item tests that rule.
- Semicolon explanations must mention that the joined clauses can stand alone where the item tests clause boundaries.

Implementation guidance:

- Add `explanationRuleId` or equivalent metadata at the template/DSL level.
- Add explanation lint rules keyed by validator/rubric type and skill id.
- Keep this metadata admin/test-only; do not expose it to children.

Acceptance criteria:

- The generic fallback remains blocked at depths 4, 6, and 8.
- Explanations that are true but too vague fail semantic lint.
- Explanations that contradict item policy fail semantic lint.
- The reviewer pack shows explanation rule id and lint result for admin/reviewer use.

### P7-U7 — Feedback trust and child-facing copy

Make learner feedback trustworthy without adding a new UI surface.

Required behaviour:

- Correct feedback shows the rule-specific explanation or a short success message plus the rule.
- Incorrect feedback identifies the specific missing punctuation behaviour where available.
- Speech feedback distinguishes missing inverted commas, missing reporting comma, punctuation outside quotes, changed spoken words, and capitalisation.
- House-style notes are plain English: for example, “This question accepts the Oxford comma, but it is not required.”
- Raw dotted misconception ids are not rendered directly to children. If misconception tags are included in state, the UI must translate them or hide them.
- Sibling-retry copy explains that the next item is a similar question for the same skill, not a replay.

Acceptance criteria:

- The existing feedback redaction tests remain green.
- The `feedback.body` fallback to explanation is tested deterministically, not with a no-op assertion.
- UI tests prove raw ids such as `speech.reporting_comma_missing` are not visible to children.
- No new competing primary CTA is added to the learner screen.

### P7-U8 — Perceived-variety second pass

Improve perceived-variety checks so they reflect learner experience in mixed and GPS sessions.

Required grouping dimensions:

- normalised stem;
- normalised model answer;
- semantic sentence overlap across modes;
- same character/topic context repeated too often;
- same correction pattern repeated too often inside a skill;
- repeated explanation text within a short session window;
- punctuation-normalised text where dashes and hyphens do not accidentally glue words together.

Acceptance criteria:

- The variety normaliser treats a dash as a boundary, not as word-glue.
- Cross-mode clusters are either approved with rationale or rewritten.
- A mixed-session simulation reports how often the same sentence/context could appear within 12 items.
- Depth 6 cannot be activated if candidate-only variety clusters remain unresolved.

### P7-U9 — Depth-6 activation gate

P7 may recommend a depth raise only after all production trust gates pass.

Allowed outcomes:

1. Keep production depth at 4.
2. Raise selected families to depth 6.
3. Raise all families to depth 6.

Depth 8 remains capacity-only.

Required evidence for any depth raise:

- P7 verification passes.
- Depth-6 reviewer pack generated and reviewed.
- Reviewer decisions for depth-6 candidate-only items are populated.
- No blocking reviewer decisions remain in learner-facing content.
- No unresolved cross-mode overlap clusters remain for learner-facing content.
- Speech oracle hardening passes.
- Semantic explanation lint passes.
- Production runtime count is updated and smoke-tested.
- Release id is changed; recommended shape: `punctuation-r5-qg-depth-6`.
- Star evidence remains release-scoped and no old evidence is silently reinterpreted.

Acceptance criteria if depth remains 4:

- The report states why depth remains 4.
- Candidate blockers are listed by item/cluster/family.
- The current production pool remains verified at 192 items.

Acceptance criteria if depth rises to 6:

- Runtime pool becomes 242 items.
- Production smoke expects and observes 242 items.
- Release id changes from `punctuation-r4-full-14-skill-structure`.
- Deployment evidence includes environment, commit SHA, runtime count, generated depth, timestamp, and authenticated coverage status.

### P7-U10 — Verification command and completion report

Add:

```bash
npm run verify:punctuation-qg:p7
```

The command must compose P6 plus P7 gates:

- P6 verification;
- direction-aware speech oracle tests;
- canonical depth-source drift test;
- depth-6 reviewer-pack CLI tests;
- reviewer-decision production gate;
- accepted-alternative and negative-case reviewer-pack proof;
- semantic explanation oracle;
- child-facing feedback copy/redaction tests;
- perceived-variety second-pass report;
- depth-decision smoke/attestation gate.

The command output must distinguish:

- top-level gates;
- composed logical gates;
- production-only gates;
- depth-6 candidate gates;
- warnings and accepted risks.

Create:

`docs/plans/james/punctuation/questions-generator/punctuation-qg-p7-completion-report.md`

The completion report must include:

- exact runtime counts;
- exact production depth and capacity depth;
- exact generated candidate counts;
- number of fixed models tested;
- number of accepted alternatives tested;
- number of negative examples tested;
- number of reviewer item decisions;
- number of reviewer cluster decisions;
- unresolved blocker count;
- speech oracle before/after summary;
- explanation semantic-lint summary;
- perceived-variety summary;
- telemetry proof/smoke wording;
- depth decision and rationale;
- deployment/smoke evidence if depth changes.

## 7. Recommended implementation order

1. Fix speech oracle permissiveness first. This is a correctness issue and should not wait for reviewer workflow.
2. Unify production depth constants next. This reduces release risk before any more review tooling depends on counts.
3. Extend the reviewer pack to support depth-6 and accepted-alternative results.
4. Add durable reviewer decisions and cluster approval gates.
5. Add semantic explanation lint and feedback-copy tests.
6. Run perceived-variety second pass and populate reviewer decisions.
7. Make the depth decision only after the above work is complete.
8. Write the completion report with exact counts and honest residual risks.

## 8. Definition of Done

P7 is complete only when all of the following are true:

- `reportingPosition: 'any'` accepts both valid reporting orders but rejects reporting-before answers missing the reporting comma.
- The real `sp_transfer_question` item has positive and negative tests for both fairness and punctuation correctness.
- Production depth has one canonical source used by generator, service, review tooling, and smoke scripts.
- `npm run review:punctuation-questions -- --include-depth-6` works and produces the expected depth-6 review artefact.
- The reviewer pack includes live marking results for model answers, accepted alternatives, choice options, and negative examples where available.
- Reviewer decisions are populated and enforceable for production items and perceived-variety clusters.
- Empty reviewer decisions no longer count as approval.
- Cross-mode overlap clusters are explicitly approved with rationale or remediated.
- Generated explanations pass semantic lint, not only fallback/length checks.
- Child-facing feedback does not display raw internal ids.
- The feedback body fallback to explanation has a real deterministic test.
- The perceived-variety normaliser handles dashes/hyphens without gluing words together.
- `npm run verify:punctuation-qg:p7` passes.
- The P7 completion report states a depth decision with evidence.

## 9. Final decision posture

The recommended default is to keep production depth at 4 until P7 proves three things together:

1. the marking oracle is strict and fair;
2. human reviewer decisions are real and enforceable;
3. the deployment/runtime count is controlled by one canonical depth source.

If those are proven, raising all or selected families to depth 6 is reasonable. If any of them remains unresolved, depth 4 is the correct production decision.
