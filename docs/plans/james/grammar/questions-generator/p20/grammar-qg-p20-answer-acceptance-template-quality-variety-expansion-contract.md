---
title: "Grammar QG P20 — Answer Acceptance, Template Quality, Pool Audit, Variety, and Expansion Gate Contract"
subject: grammar
phase: p20
status: patch-ready
baseRelease: grammar-qg-p19-2026-05-04
targetRelease: grammar-qg-p20-2026-05-05
created: 2026-05-05
scope: "Grammar question engine only"
---

# Grammar QG P20 — quality-recovery contract

This contract is for the Grammar subject only. It does not change punctuation subject code, punctuation content, punctuation audits, or punctuation learner surfaces.

P20 is based on the P19 Grammar QG release (`grammar-qg-p19-2026-05-04`) and the P18 full-scope review pack under `docs/plans/james/grammar/questions-generator/p18/grammar-p18-fullscope-review-pack`. P19 made the correct safety move by converting many open constructed-response items to `manualReviewOnly`; P20 keeps that fairness boundary, but recovers deterministic closed answers that can be safely auto-marked.

The target release id is `grammar-qg-p20-2026-05-05` because P20 changes learner-visible marking behaviour. Previously non-scored deterministic closed items can now score when the learner gives a valid answer, and normalised answers accept harmless learner variants.

## Product goal

Learners should not lose trust because a logically correct Grammar answer is refused. Heavy users should also see a broad, stable pool without obvious repetition or low-quality learner-facing wording.

P20 therefore does not expand the learner-facing pool first. It improves the trustworthiness of the current pool and blocks further expansion unless answer acceptance, fairness, template wording, pool quality, and smart-practice variety gates pass.

## Phase 1 — Answer acceptance repair

Problem: Some deterministic Grammar answers are valid in more than one learner form, but the marker previously treated only a narrow exact text as correct.

Implementation requirements:

1. Introduce a shared Grammar answer normaliser for constructed answers.
2. Accept harmless variants for `normalisedText` and `acceptedSet` answers:
   - trimmed and collapsed whitespace;
   - case differences;
   - harmless terminal sentence punctuation on a short answer;
   - wrapping straight or curly quotation marks;
   - optional `a`, `an`, or `the` before known grammar labels such as `adverb`, `noun`, `subject`, `relative clause`, and `modal verb`.
3. Do not loosen `punctuationPattern` into content-insensitive marking. Grammar-critical punctuation must still be required.
4. Add tests that prove examples such as `adverb`, `an adverb`, `ADVERB.`, and `"adverb"` are accepted while wrong labels remain rejected.

Acceptance evidence:

- `tests/grammar-qg-p20-answer-acceptance.test.js`
- `scripts/audit-grammar-qg-p20-quality-hardening.mjs`

## Phase 2 — Template quality and learner-surface repair

Problem: Some generated or serialised learner text exposed low-trust surface defects, especially spacing caused by stripped legacy HTML and awkward table-choice prompts such as `Classify the grammar feature shown in this row: X in: Sentence`.

Implementation requirements:

1. Strip legacy HTML without leaving spaces before punctuation.
2. Remove spaces just inside brackets after serialisation.
3. Rewrite table-choice manual-expansion prompts to a cleaner learner instruction: `Classify the target word or phrase by its grammar role.`
4. Rewrite table row labels from raw `X in: Sentence` style into a clear target/sentence surface.
5. Add a quality audit rule that fails on:
   - space before punctuation;
   - article-agreement defects such as `a adverb`;
   - awkward table-row copy.

Acceptance evidence:

- `tests/grammar-qg-p20-answer-acceptance.test.js`
- `tests/grammar-qg-p20-quality-hardening.test.js`
- `scripts/audit-grammar-qg-p20-quality-hardening.mjs`

## Phase 3 — 15k pool audit and safe quarantine boundary

Problem: A large pool is not automatically a trusted pool. P19 protected the riskiest open-response items by making them non-scored; P20 must avoid undoing that protection accidentally.

Implementation requirements:

1. Keep genuinely open writing as `manualReviewOnly` and `nonScored`.
2. Recover only closed deterministic P19 manual-expansion families where every case in the family matches the same safe auto-mark kind.
3. Tag recovered families with `p20-closed-auto-mark` and expose `p20ClosedAutoMarkKind` in Grammar template metadata.
4. Keep the open-response fairness audit strict, with an explicit exception only for `p20ClosedAutoMark` deterministic closed items.
5. Add a P20 audit that checks the full seed window and reports:
   - recovered closed auto-mark template count;
   - recovered case count;
   - answer-acceptance failures;
   - open-response fairness findings;
   - template-quality findings;
   - unsafe auto-marked open prompts.

Acceptance evidence from this patch:

- Manual-review-only count reduces from 180 to 157.
- 23 deterministic closed manual-expansion families are recovered to safe auto-marking.
- 690 recovered generated cases pass the 30-seed P20 audit window.
- Genuinely open clause-combine writing remains manual-review-only.

## Phase 4 — Variety and anti-repetition hardening

Problem: Session variety must be reviewable without requiring every reviewer to run a long release audit locally.

Implementation requirements:

1. Extend the Grammar smart-practice audit CLI with `--seeds` so reviewers can run a small smoke window and release can run the full window.
2. Preserve the existing smart-practice checks for concept balancing, manual-review-only exclusion from auto-scored lanes, recent-miss routing, spaced retrieval, and repeated-template/session risks.
3. Emit seed-window metadata in JSON/Markdown output so evidence is reproducible.

Acceptance evidence:

- `node scripts/audit-grammar-qg-p19-smart-practice.mjs --seeds=1..6 --json-out=/tmp/grammar-smart.json --md-out=/tmp/grammar-smart.md`
- Full release command should use `--seeds=1..30` where the CI/release environment can run the longer audit.

## Phase 5 — Expansion gate

Problem: Expanding beyond the current pool before trust gates are stable would increase the number of possible learner challenges.

Implementation requirements:

1. Add no new learner-facing Grammar template families in P20.
2. Treat expansion as blocked unless all P20 gates pass:
   - answer-acceptance audit;
   - template-quality audit;
   - open-response fairness audit;
   - smart-practice variety audit;
   - existing Grammar QG audit/deep audit.
3. Record the expansion stance in the P20 audit output.
4. Expand only in the next phase, after P20 stays green under the full release seed window.

The P20 expansion gate deliberately reports `newLearnerFacingFamiliesAdded: 0`.

## Files changed by the patch

Core implementation:

- `worker/src/subjects/grammar/answer-spec.js`
- `worker/src/subjects/grammar/content.js`
- `scripts/audit-grammar-open-response-fairness.mjs`
- `scripts/audit-grammar-qg-p19-smart-practice.mjs`
- `scripts/audit-grammar-qg-p20-quality-hardening.mjs`

Tests and gates:

- `tests/grammar-qg-p20-answer-acceptance.test.js`
- `tests/grammar-qg-p20-quality-hardening.test.js`
- `tests/grammar-question-generator-audit.test.js`
- `tests/grammar-answer-spec-audit.test.js`
- `docs/plans/james/grammar/grammar-answer-spec-audit.md`
- `package.json`

## Required post-patch commands

Reviewer smoke:

```bash
npm run audit:grammar-qg
npm run audit:grammar-qg:deep
node scripts/audit-grammar-content-quality.mjs --seeds=1..30 --json
npm run audit:grammar-qg:open-response-fairness
node scripts/audit-grammar-qg-p20-quality-hardening.mjs --seeds=1..30 --smart-seeds=1..6 --out=reports/grammar/grammar-qg-p20-quality-hardening.json
node --test tests/grammar-answer-spec.test.js tests/grammar-answer-spec-audit.test.js tests/grammar-question-generator-audit.test.js tests/grammar-qg-p20-answer-acceptance.test.js tests/grammar-qg-p20-quality-hardening.test.js
```

Convenience command added by the patch:

```bash
npm run verify:grammar-qg-p20
```

Release variety gate, where runtime permits the longer audit:

```bash
node scripts/audit-grammar-qg-p19-smart-practice.mjs --seeds=1..30 --json-out=reports/grammar/grammar-qg-p20-smart-practice-full.json --md-out=reports/grammar/grammar-qg-p20-smart-practice-full.md
```

## Acceptance criteria

P20 is accepted only when all of the following are true:

1. `GRAMMAR_CONTENT_RELEASE_ID` reports `grammar-qg-p20-2026-05-05`.
2. Grammar QG audit and deep audit pass with 510 templates.
3. Manual-review-only count is 157.
4. `answerSpecKindCounts` are:
   - `exact`: 234
   - `manualReviewOnly`: 157
   - `multiField`: 56
   - `normalisedText`: 12
   - `punctuationPattern`: 20
5. P20 quality-hardening audit passes with zero answer-acceptance failures, zero fairness findings, zero template-quality findings, and zero unsafe auto-marked open prompts.
6. Open-response fairness audit passes.
7. Existing answer-spec audit documentation matches runtime metadata.
8. The P20 test files pass.
9. No punctuation subject files are changed.

## Explicit non-goals

- No punctuation subject work.
- No Stars, mastery, rewards, Hero Mode, Hero Coins, monster progression, or dashboard reward changes.
- No new learner-facing Grammar expansion in P20.
- No claim of live production certification without live smoke evidence.

## Follow-up phase after P20

The next phase may expand the Grammar pool, but only after P20 has passed the full release seed window and any adult review/quarantine decisions are recorded. Expansion should prioritise concepts with low variety after the P20 denominator is stable, and each new family must ship with answer acceptance tests from day one.
