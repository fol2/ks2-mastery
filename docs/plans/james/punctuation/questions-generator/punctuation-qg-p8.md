# Punctuation QG P8 — Production Question QA, Preservation Oracles, and Human Acceptance

Date: 29 April 2026  
Owner: KS2 Mastery / Punctuation  
Phase type: production question-quality acceptance and release-readiness hardening  
Recommended release posture: keep production generated depth at 4 until every production item has passed human review and preservation-oracle checks

## 1. Why P8 exists

P1–P7 have effectively completed the engineering build-out of the deterministic Punctuation question-generation engine: DSL families exist, production generation is stable, marking is much stronger, explanations are no longer generic, depth is centrally controlled, and depth-6 activation is now blocked behind reviewer evidence.

P8 should not be another generator expansion phase. P8 is the phase that asks the first-principles question: **are the actual questions that children will see logical, fair, tightly marked, useful when wrong, and production-ready?**

The goal is not merely a larger pool. The goal is a higher-quality, deeper, wider, and proven pool, with production behaviour that parents, teachers, and children can trust.

P8 therefore focuses on:

- exact content preservation for closed questions;
- per-item negative examples, especially for fixed-bank questions;
- speech reporting-clause correctness;
- meaningful transfer answers rather than token-only fragments;
- reviewer-pack completeness;
- human reviewer execution;
- small UX improvements that support marking trust, not cosmetic redesign;
- a deliberate production/depth decision backed by evidence.

## 2. Current validated baseline

Use the P7 baseline as the starting point:

- Release id: `punctuation-r4-full-14-skill-structure`.
- Fixed items: 92.
- Published generator families: 25.
- Production generated depth: 4 per family.
- Production generated items: 100.
- Production runtime pool: 192 items.
- Depth-6 inclusive candidate pool: 242 items.
- Depth-6 candidate-only delta: 50 additional items beyond production depth 4.
- Depth-8 capacity pool: 292 items.
- Runtime AI generation: none.
- Reviewer decisions: not populated.
- Production depth decision after P7: remain at 4.

P7 materially improved the engine. The next phase should treat P7 as a strong technical baseline, not as final production content acceptance.

## 3. P8 validation findings to address

### 3.1 Closed questions can still accept changed content

Several marking oracles correctly check the target punctuation, but do not always preserve the whole original sentence for `insert`, `fix`, and `combine` questions.

Examples observed during P8 validation:

- `lc_insert_supplies` accepts `We needed pencils, rulers and glue in the cupboard.` even though the fixed stem is `We needed pencils rulers and glue.`
- `lc_fix_display` accepts `The display showed shells, pebbles and fossils in the cupboard.`
- `pa_insert_museum` accepts `The museum, a former station, was busy in the cupboard.`
- `pa_fix_author` accepts `The author, who won the prize, smiled in the cupboard.`
- Similar extra-tail acceptance appears in generated list-comma, fronted-adverbial, comma-clarity, semicolon, dash, hyphen, parenthesis, and apostrophe-possession items.

This is acceptable for open transfer writing only when the prompt invites original writing. It is not acceptable for closed repair questions where the child should only add or correct punctuation.

### 3.2 Speech reporting-clause content is not fully enforced

P7 fixed the missing reporting-comma bug for `reportingPosition: 'any'`. However, speech rubric fields such as `reportingClause` still need stronger semantic enforcement.

Observed examples:

- `sp_insert_question` has reporting clause `Ella asked`, but answers such as `Tom shouted, "Can we start now?"` can be marked correct.
- `sp_fix_question` has reporting clause `asked Zara`, but answers such as `"Where are we meeting?"`, `"Where are we meeting?" asked Mia.`, and `"Where are we meeting?" yelled Tom.` can be marked correct.

For broad transfer prompts, flexible reporting clauses are good. For repair or insertion prompts with a given reporting clause, the reporting clause must be preserved.

### 3.3 Token-only transfer answers can be technically correct but poor English

`requiresTokens` is useful, but it can be too permissive for open transfer if it only checks token presence, capitalisation, terminal punctuation, and single-sentence shape.

Observed examples:

- `ac_transfer_contractions` accepts `Can't we're.`
- `ap_transfer_possession` accepts `The children's teachers'.`

These contain the required forms, but they are not good KS2 model sentences. P8 must add a meaningfulness gate for transfer items without turning the marker into a brittle grammar parser.

### 3.4 Fixed-bank negative examples are still underpowered

P7’s accepted-alternative and negative-case proof is a good start, but the negative examples in the reviewer pack currently come from generated DSL template tests. Fixed items have model/accepted-answer checks, but they do not yet have per-item negative vectors in the reviewer pack.

This means a fixed item can pass because its model answer marks correct, while still accepting learner-visible wrong answers that should fail.

### 3.5 Reviewer pack is not yet complete enough for human acceptance

The reviewer pack now supports depth-6 modes and live marking results, but P8 should close practical reviewer gaps:

- choice-item options and correct index must be visible;
- reviewer decisions must read and write the v2 `itemDecisions` and `clusterDecisions` schema, not only the legacy `decisions` object;
- stable cluster ids should be content-derived, not index-derived;
- fixed negative examples must be shown;
- closed-item preservation expectations must be visible;
- reviewer status must be actionable and machine-gated.

### 3.6 P7 local reproducibility depends on Node version

The lean ZIP declares `.nvmrc` as Node 22. Local Node 18 cannot run every P7 verifier test because some tests use `import.meta.dirname`. This is not necessarily a production bug if CI uses Node 22, but P8 should make the toolchain explicit and fail early with a clear message.

## 4. P8 objectives

P8 has seven objectives:

1. Make all closed questions preserve the intended source sentence, not merely the target punctuation token.
2. Make speech marking respect the required reporting clause when the prompt supplies one.
3. Make open transfer answers require meaningful sentence shape, not token-only fragments.
4. Add fixed-bank negative vectors and run them through production marking.
5. Upgrade the reviewer pack into a real human QA cockpit for all 192 production items and the 50 depth-6 candidates.
6. Populate reviewer decisions for production items and cross-mode clusters, or explicitly block release/depth changes.
7. Add only UX/UI changes that make marking and feedback trustworthy.

## 5. Work units

### P8-U1 — Closed-item preservation oracle

Add a preservation layer for `insert`, `fix`, and `combine` items so closed tasks cannot accept arbitrary extra words, missing context, changed reporter names, or changed non-punctuation content.

Required design:

- Introduce a closed-item preservation contract, for example:
  - `preserveText`: canonical text that must be preserved except punctuation/capitalisation changes;
  - `preserveTokens`: ordered lexical tokens that must appear exactly once, unless the item explicitly allows variation;
  - `allowExtraTail: false` by default for `insert`, `fix`, and `combine` modes;
  - `allowLexicalChange: true` only for transfer/open-writing items.
- Apply this contract to fixed items first, then generated DSL items.
- Make the contract explicit in the reviewer pack.

Required regression rejects:

- `We needed pencils, rulers and glue in the cupboard.` for `lc_insert_supplies`.
- `The display showed shells, pebbles and fossils in the cupboard.` for `lc_fix_display`.
- `The museum, a former station, was busy in the cupboard.` for `pa_insert_museum`.
- `The author, who won the prize, smiled in the cupboard.` for `pa_fix_author`.
- Generated list-comma/fronted-adverbial/semicolon/dash/hyphen/parenthesis fixes with arbitrary extra tails.

Acceptance criteria:

- Every closed fixed item has preservation metadata or an equivalent preservation test.
- Every generated closed template has preservation metadata generated from the DSL source.
- Production marking rejects arbitrary extra words for closed items.
- Transfer items remain flexible where the prompt invites original writing.

### P8-U2 — Speech reporting-clause enforcement

Strengthen `evaluateSpeechRubric()` so `reportingClause` is not ignored when the question supplies a required reporting clause.

Required design:

- Add a facet such as `reporting_clause_words` distinct from comma placement.
- For `reportingPosition: 'before'`, preserve the required clause before the opening quote when `reportingClause` is supplied.
- For `reportingPosition: 'after'`, preserve the required clause after the closing quote when `reportingClause` is supplied.
- For `reportingPosition: 'any'`, only enforce clause wording if the prompt supplies a fixed clause; otherwise allow child-created reporting clauses.
- Treat speech-only answers as valid only when the prompt explicitly permits speech-only direct speech.

Required regression rejects:

- `Tom shouted, "Can we start now?"` for `sp_insert_question`.
- `"Where are we meeting?"` for `sp_fix_question`.
- `"Where are we meeting?" asked Mia.` for `sp_fix_question`.
- `"Where are we meeting?" yelled Tom.` for `sp_fix_question`.

Acceptance criteria:

- P7’s comma-direction fix remains intact.
- Reporting-before and reporting-after alternatives remain accepted when the prompt is genuinely broad.
- Fixed reporter names and clauses are preserved when the stem supplies them.
- Feedback says what is wrong: missing/changed reporting clause, not just generic speech punctuation.

### P8-U3 — Meaningful transfer-sentence gate

Make transfer validators reject token-only fragments while keeping legitimate child variation.

Required design:

- Add a `meaningfulSentence` option for transfer validators.
- Default minimum for `requiresTokens` transfer items should be at least 4–6 words unless the prompt explicitly asks for a short sentence.
- Add a light predicate check: require a plausible subject + verb frame outside the required tokens, or a supplied item-specific phrase pattern.
- Add item-specific examples rather than relying on a broad grammar parser.

Required regression rejects:

- `Can't we're.` for `ac_transfer_contractions`.
- `The children's teachers'.` for `ap_transfer_possession`.
- Any answer that is only the required tokens plus a full stop.

Acceptance criteria:

- Good child-written transfer answers still pass.
- Token-only or fragment-like answers fail with a child-readable explanation.
- The reviewer pack shows each transfer item’s minimum meaningfulness rule.

### P8-U4 — Fixed-bank negative vector pack

Create a durable negative-example fixture for every fixed open item.

Required coverage:

- model answer: must pass;
- accepted alternatives: must pass;
- missing target punctuation: must fail;
- wrong punctuation position: must fail;
- changed required words: must fail for closed items;
- arbitrary extra words: must fail for closed items;
- wrong reporting clause: must fail for speech closed items;
- token-only fragment: must fail for open transfer where applicable.

Acceptance criteria:

- Every non-choice fixed item has at least two negative vectors.
- Every fixed choice item has all options marked and exactly one correct option.
- The fixed-bank negative fixture is shown in the reviewer pack.
- `npm run verify:punctuation-qg:p8` fails if any fixed negative example marks correct.

### P8-U5 — Reviewer pack v3 and decision-schema alignment

Upgrade `review:punctuation-questions` from a report to an operational QA cockpit.

Required changes:

- Show choice options and correct index for choice items.
- Show fixed negative examples and their live marking result.
- Show preservation contract summary.
- Show semantic explanation lint result for fixed and generated items.
- Read reviewer decisions from `itemDecisions` and `clusterDecisions` v2 schema.
- Stop relying on the legacy `decisions` object for current reviewer state.
- Generate stable cluster ids from normalised cluster content, not array index.
- Include `reviewStatus`, `reviewer`, `reviewedAt`, and `rationale` fields per item and per cluster.
- Add `--only-blocked`, `--only-candidates`, `--only-unreviewed`, and `--summary` flags.

Acceptance criteria:

- Default production pack still covers 192 items.
- `--include-depth-6` covers 242 items.
- `--candidate-depth 6` covers 50 candidate-only items.
- All production items show either a reviewer decision or explicit `unreviewed` state.
- CI and reviewer pack use the same decision schema.

### P8-U6 — Human production QA execution gate

Run the actual human QA pass for production depth 4.

Required reviewer decisions:

- All 192 production items must have one of:
  - `approved`;
  - `needs-rewrite`;
  - `needs-marking-fix`;
  - `needs-prompt-tightening`;
  - `retire`.
- No production item may remain `pending` or missing.
- Every cross-mode overlap cluster must be approved with rationale or remediated.
- Every repeated-explanation and character-overuse cluster must either be accepted with rationale or receive a rewrite ticket.

Recommended process:

- First pass: product/teacher review for question sense and age fit.
- Second pass: engineer review for oracle and preservation risk.
- Third pass: targeted regression tests for every `needs-*` decision that is fixed.

Acceptance criteria:

- Production gate fails when decisions are empty.
- Production gate passes only when every production item is explicitly reviewed and no blocking decision remains.
- Depth-6 gate can remain blocked if candidate review is not finished.

### P8-U7 — Fixed and generated explanation QA

Extend semantic explanation checking beyond generated DSL items.

Required checks:

- Every fixed item explanation is child-readable and rule-specific.
- Every generated item explanation is still rule-specific at depths 4, 6, and 8.
- Explanation matches the exact task policy, including Oxford comma policy, speech reporting position, plural vs singular possession, and closed-vs-transfer nature.
- Explanation should help after an incorrect answer, not merely describe the correct answer.

Acceptance criteria:

- Fixed explanations have rule ids or equivalent lint metadata.
- No explanation says a flexible policy is mandatory unless the item policy makes it mandatory.
- Feedback copy uses explanation plus specific facet failure where available.

### P8-U8 — Feedback and UI trust support

Make only UI/UX changes that support answer trust.

Required UX improvements:

- For closed questions, feedback should say if the learner changed the sentence instead of only fixing punctuation.
- For speech questions, feedback should distinguish:
  - missing inverted commas;
  - punctuation outside speech marks;
  - missing reporting comma;
  - changed/missing reporting clause;
  - changed spoken words.
- For transfer questions, feedback should explain if the answer includes the required forms but is not a complete meaningful sentence.
- Review/admin metadata remains hidden from children.
- No cosmetic redesign, no extra primary CTA, no new quiz mode.

Acceptance criteria:

- Child feedback never surfaces raw validator names or dotted internal ids.
- The learner screen remains one-primary-action aligned.
- The feedback body is actionable enough for a child to know what to change.

### P8-U9 — Depth-6 quality-readiness gate

Do not activate depth 6 inside P8 unless production QA and candidate QA both pass.

Allowed outcomes:

1. Keep production depth at 4 with production pool fully QA-approved.
2. Keep depth 4 and open rewrite tickets for blocked production items.
3. Raise only after all 192 production items, all 50 depth-6 candidate-only items, and all relevant clusters have reviewer approval.

Depth-6 activation criteria:

- All P8 production gates pass.
- All 50 candidate-only depth-6 items have decisions.
- Candidate-only preservation/negative/semantic tests pass.
- Stable cluster decisions exist for candidate clusters.
- Release id changes to `punctuation-r5-qg-depth-6` or a clearer equivalent.
- Production smoke expected runtime updates to 242.
- Star evidence remains release-scoped.
- Deployment evidence includes commit SHA and runtime count.

### P8-U10 — P8 verification command and completion report

Add:

`npm run verify:punctuation-qg:p8`

It should run P7 plus:

- closed-item preservation tests;
- speech reporting-clause enforcement tests;
- meaningful transfer-sentence tests;
- fixed-bank negative vector tests;
- reviewer pack v3 schema tests;
- fixed explanation semantic lint;
- production human QA gate;
- candidate-depth QA gate, if depth 6 activation is proposed;
- UI/feedback trust tests.

Completion report path:

`docs/plans/james/punctuation/questions-generator/punctuation-qg-p8-completion-report.md`

The report must include:

- exact production and candidate counts;
- number of fixed negative vectors;
- number of closed-item preservation rejects;
- number of speech reporting-clause rejects;
- number of transfer-fragment rejects;
- reviewer decision counts by state;
- cluster decision counts by type;
- rewrite/retire/prompt-tightening decisions;
- production depth decision;
- production smoke/deployment evidence if anything changes.

## 6. Definition of Done

P8 is complete only when all of the following are true:

- All 192 production items are present in reviewer pack v3.
- Choice items show all options and correct index in the reviewer pack.
- Every fixed open item has negative vectors.
- Every closed item rejects arbitrary extra words and changed required content.
- Speech items preserve required reporting clauses when supplied.
- Transfer items reject token-only fragments.
- Fixed and generated explanations pass semantic checks.
- Human reviewer decisions are populated for all production items.
- Cross-mode overlap clusters have stable ids and explicit decisions.
- Production depth remains at 4 unless depth-6 candidate QA is also complete.
- `npm run verify:punctuation-qg:p8` gives a reliable pass/fail answer.

## 7. Do not do in P8

- Do not add runtime AI question generation.
- Do not add more generator families.
- Do not raise depth merely because mechanical audits pass.
- Do not treat reviewer tooling as equivalent to completed human review.
- Do not let closed questions accept rewritten sentences.
- Do not rely only on keyword lint for final explanation quality.
- Do not make cosmetic UI changes unless they directly improve feedback trust or reviewer workflow.

## 8. Recommended final posture

The best P8 outcome is not necessarily depth 6. The best outcome is that production depth 4 becomes genuinely production-certified: every item reviewed, every closed question preservation-locked, every fixed item covered by negative vectors, and every learner-facing explanation trustworthy.

After that, depth 6 can be a clean release decision rather than a gamble.
