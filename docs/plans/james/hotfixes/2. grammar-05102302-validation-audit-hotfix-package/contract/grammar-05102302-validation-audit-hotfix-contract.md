# Grammar 05102302 validation audit + P20d hotfix contract

## Source boundary

Primary validation snapshot: uploaded lean ZIP `ks2-mastery-lean-05102302.zip`.

Supplementary implementation evidence: GitHub recent Grammar commits/PRs, especially PR #896 (`[codex] Fix Grammar Bank confidence labels`), which is newer than the uploaded ZIP and fixes the nested `confidence.label` precedence bug on `main`.

Production boundary: this package proves local ZIP/fresh-applied behavior only. It does not certify live production, Cloudflare, D1, or real deployed assets. The lean ZIP intentionally uses placeholder assets.

## Scope

Patch file:

`patches/001-grammar-05102302-session-bank-and-anti-repetition.patch`

Touched files:

- `src/subjects/grammar/components/GrammarSessionScene.jsx`
- `src/subjects/grammar/components/grammar-view-model.js`
- `src/subjects/grammar/session-ui.js`
- `worker/src/subjects/grammar/content.js`
- `tests/grammar-ui-model.test.js`
- `tests/grammar-qg-p20-answer-acceptance.test.js`
- `tests/grammar-qg-p20-quality-hardening.test.js`

No changes to rewards, Stars, mastery writes, Hero Mode, monsters, learner progression, spelling, punctuation, or reading.

## Bugs / glitches fixed

### 1. Grammar Bank confidence label precedence

Observed ZIP behavior:

A concept with canonical nested confidence `{ confidence: { label: 'secure' } }` and coarse `status: 'due'` was filtered/displayed as `needs-repair` / `Trouble spot`. This can show a secure concept as due/trouble in the Grammar Bank.

Expected behavior:

`confidence.label` is canonical and must win over legacy `confidenceLabel` and coarse `status`. `status` is only a last-resort first-boot fallback.

Patch:

Backports GitHub PR #896 logic into the uploaded ZIP snapshot.

Acceptance:

- Secure nested confidence remains in the secure filter even when coarse status is `due`.
- Due filter no longer captures that secure concept.
- Regression test added in `tests/grammar-ui-model.test.js`.

### 2. Question-session feedback next step is too implicit

Observed UX issue:

The feedback panel showed the result and answer, but the next action was implicit. For children, post-marking needs a small cue without creating another primary CTA or breaking the existing frame.

Expected behavior:

The existing feedback panel remains the frame. It adds one short next-step line:

- Correct: `Great — move to the next question.`
- Incorrect: `Fix it now: retry, see a worked solution, or try a similar question.`
- Non-scored/manual review: `Saved — keep going when you are ready.`

Patch:

Adds `grammarFeedbackNextStepCopy()` in `session-ui.js`, renders it in `GrammarSessionScene.jsx`, and changes generic `Answer:` copy to clearer `Correct answer:`.

Acceptance:

- No new primary action is introduced.
- Existing repair actions remain controlled by `grammarSessionHelpVisibility()`.
- Child copy avoids internal/engine terms.
- Regression tests added in `tests/grammar-ui-model.test.js`.

### 3. Cross-template learner-facing prompt repetition

Observed ZIP behavior:

The existing content/fairness audits passed, but a separate learner-surface repetition audit over `510` templates × `30` seeds found cross-template prompt collisions. Examples included:

- `qg_p18_p15_apostrophes_possession_possessive_rewrite` vs `qg_p18_p18_apostrophes_possession_precision_repair_or_rewrite`
- generic table-classification prompts shared across many P18 table families
- manual expansion prompt surfaces duplicated with older/proc templates for relative clauses, Standard English, fronted adverbials, subject/object, modal verbs, and noun phrases

Expected behavior:

Same-template finite cycling is allowed, but different templates should not present identical learner-facing prompt surfaces in the release seed window. If two templates ask for the same skill, their wording should signal the different task intent.

Patch:

- Adds concept-specific table-classification prompt copy.
- Makes P18 possessive precision rewrite prompt distinct: `Rewrite as a precise possessive phrase: ...`.
- Makes P15/P16 manual expansion prompt surfaces distinct for noun phrases, adverbials, sentence functions, subordinate clauses, modal verbs, Standard English, subject/object.
- Makes proc2 relative-clause and Standard English prompts distinct from legacy/fixed templates.
- Adds a cross-template no-collision regression gate across all Grammar templates and seeds `1..30` in `tests/grammar-qg-p20-quality-hardening.test.js`.

Acceptance:

- Baseline cross-template duplicate event count: `43` over `15,300` generated surfaces.
- Fresh-applied patched cross-template duplicate event count: `0` over the same `15,300` surfaces.
- Existing content quality/fairness/answer-spec checks remain green.

## Validation commands

Run from a clean patched extraction:

```bash
node --test tests/grammar-ui-model.test.js
node --test tests/grammar-qg-p20-quality-hardening.test.js
node --test tests/grammar-qg-p20-answer-acceptance.test.js
node --test tests/grammar-answer-spec.test.js
node --test tests/grammar-answer-spec-audit.test.js
node --test tests/grammar-question-generator-audit.test.js
node scripts/generate-grammar-manual-expansion.mjs --check
node scripts/audit-grammar-question-generator.mjs --json
node scripts/audit-grammar-question-generator.mjs --deep --json
node scripts/audit-grammar-content-quality.mjs --seeds=1,2,3 --json
node scripts/audit-grammar-open-response-fairness.mjs --seeds=1,2,3 --out=/tmp/open-response-fairness.json
node scripts/audit-grammar-qg-p20-quality-hardening.mjs --seeds=1,2,3 --smart-seeds=1 --out=/tmp/p20-quality.json
```

Additional package audit:

```bash
node validation/audit-grammar-cross-template-surface-repetition.mjs <repo-root> 30
```

## Rollout notes

- Apply after/alongside GitHub PR #896 if the target branch does not already contain it.
- This patch changes learner-facing prompt copy only; answer specs and accepted answers stay intact.
- Because prompt copy changed, any committed generated inventories/reports that snapshot prompt text may need regeneration if your release process requires artefact freshness.
- Production smoke still needs live origin, release ID, timestamp, and pass/fail result before claiming production certification.
