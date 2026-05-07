---
title: "Grammar QG P20b Validation Hotfix Contract"
subject: grammar
scope: grammar-question-generator-answer-acceptance-and-template-quality
baseZip: ks2-mastery-lean-05060131.zip
baseContentReleaseId: grammar-qg-p20-2026-05-05
patchName: grammar-qg-p20b-validation-hotfix
status: proposed-patch
created: 2026-05-06
---

# Grammar QG P20b Validation Hotfix Contract

## Source boundary

The uploaded lean ZIP `ks2-mastery-lean-05060131.zip` is the source of truth for this review. Local runs prove behaviour for the extracted ZIP snapshot only. This contract and patch do not certify live production.

This patch is Grammar-only. It changes Grammar QG marking, Grammar QG prompt rendering, the Grammar P20 quality audit, and Grammar QG tests. It does not touch the separate Punctuation subject, rewards/mastery, Stars, Hero Mode, monsters, or subject progression.

## Problem statement

The bundled P20 verifier passed, and the current Grammar QG baseline is strong. The follow-up audit found three learner-facing gaps that were outside the current bundled gates.

First, punctuation-label prompts ask learners to write the punctuation mark used, but a learner typing the mark itself was rejected. For example, `;`, `:`, and `—` were rejected even when the expected labels were `semicolon`, `colon`, and `dash`.

Second, recovered P20 manual-expansion punctuation rewrites accept omission of only an incidental final full stop, but older Grammar punctuationPattern templates still rejected the same harmless variant. For example, a fronted-adverbial comma answer with the required comma but without the final full stop was rejected.

Third, some possessive scenario prompts were awkward: `Write the possessive phrase for one dog owns a bowl.` The scenario needs a visible boundary: `Write the possessive phrase for: one dog owns a bowl.`

## Required implementation

### 1. Punctuation-mark symbol answer acceptance

For deterministic normalised Grammar label answers, accept the typed punctuation mark when the golden answer is the matching punctuation label.

Required accepted examples:

- `;` for `semicolon`
- `:` for `colon`
- `,` for `comma`
- `—`, `–`, or `-` for `dash`
- `-` for `hyphen`
- `'` for `apostrophe`

Required rejection example:

- `;` must not be accepted for `colon`.

The implementation must not globally rewrite `dash` to `hyphen` or `hyphen` to `dash`. The mark alias is valid only when the expected golden label matches the mark family.

### 2. Incidental terminal full-stop tolerance for internal-punctuation rewrites

For Grammar punctuationPattern questions where the target is internal punctuation, accept the learner answer when the only difference from the accepted sentence is omission of the final full stop.

Covered legacy templates:

- `fix_fronted_adverbial`
- `parenthesis_fix_sentence`
- `proc_fronted_adverbial_fix`
- `proc_colon_list_fix`
- `proc_dash_boundary_fix`
- `proc3_parenthesis_commas_fix`
- `proc3_hyphen_fix_meaning`

Keep strict marking for tasks where the final/ending punctuation or direct-speech punctuation is the target.

### 3. Possessive scenario prompt copy

For manual-expansion prompts containing `for one ... owns ...` or `for several ... own ...`, insert a colon after `for` in the learner-facing prompt.

Examples:

- `Which phrase correctly shows possession for: one dog owns a bowl?`
- `Write the possessive phrase for: one dog owns a bowl.`
- `Why is 'the dog's bowl' correct for: one dog owns a bowl?`

### 4. Audit hardening

Extend `scripts/audit-grammar-qg-p20-quality-hardening.mjs` so it detects:

- possessive scenario prompt copy without the colon boundary;
- internal-punctuation rewrite templates that still reject omission of only an incidental final full stop.

The audit must still pass across the 30-seed Grammar template window after the patch.

## Acceptance tests

The patch must pass:

```bash
npm run verify:grammar-qg-p20
node --test tests/grammar-answer-spec.test.js tests/grammar-answer-spec-audit.test.js tests/grammar-qg-p20-answer-acceptance.test.js tests/grammar-qg-p20-quality-hardening.test.js
node scripts/audit-grammar-question-generator.mjs --json
node scripts/audit-grammar-question-generator.mjs --deep --json
node scripts/audit-grammar-content-quality.mjs --seeds=1..30 --json
node scripts/audit-grammar-open-response-fairness.mjs --seeds=1..30 --out=<path>
node scripts/audit-grammar-qg-p20-quality-hardening.mjs --seeds=1..30 --smart-seeds=1..6 --out=<path>
```

Recommended release/staging gate, where runtime allows:

```bash
node scripts/audit-grammar-qg-p19-smart-practice.mjs --seeds=1..30 --json-out=<path> --md-out=<path>
```

## Non-goals

This contract does not expand the Grammar question count. It does not alter manual-review-only open writing. It does not change the separate Punctuation subject. It does not modify mastery, reward, Stars, Hero Mode, or monster state.

## Rollout notes

The active source still reports `GRAMMAR_CONTENT_RELEASE_ID = grammar-qg-p20-2026-05-05`. This patch is written as a P20b hotfix against that baseline to avoid broad report/regression churn. A production release should either regenerate certification/smoke evidence under a new hotfix evidence origin or explicitly record this as `grammar-qg-p20b-validation-hotfix` in release notes.
