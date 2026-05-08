# Grammar 05080102 validation and UI hotfix contract

## Source boundary

The uploaded ZIP is the primary source snapshot for this package. GitHub repository access was only treated as supplementary context. This package does not claim live production certification.

## Issue

In `GrammarSessionScene.jsx`, the main Grammar action buttons already respect `runtimeReadOnly`, but the normal-session secondary `End round` button only used `disabled={pending}`.

That creates a learner-facing affordance mismatch in degraded/read-only runtime state: the main mutation controls correctly appear unavailable, while `End round` still appears clickable.

## Required behaviour

When Grammar runtime is read-only, all learner-facing mutation actions in the question session must be visibly unavailable.

The normal-session `End round` button must therefore be disabled when either:

- `runtimeReadOnly` is true, or
- `pending` is true.

## Patch scope

Allowed changes:

- `src/subjects/grammar/components/GrammarSessionScene.jsx`
- `tests/ui-action-engine-contract.test.js`

Forbidden changes:

- Grammar content inventory
- Grammar answer marking
- Grammar question generation
- Smart-practice selection
- Subject mastery / Stars / rewards
- Hero Mode
- Monster projection
- Worker command semantics
- Other subjects

## Acceptance checks

From a fresh extraction of `ks2-mastery-lean-05080102.zip`:

```bash
patch --dry-run -p1 < patches/001-grammar-session-readonly-end-round.patch
patch -p1 < patches/001-grammar-session-readonly-end-round.patch
node --test tests/ui-action-engine-contract.test.js
node --test \
  tests/grammar-answer-spec.test.js \
  tests/grammar-answer-spec-audit.test.js \
  tests/grammar-question-generator-audit.test.js \
  tests/grammar-qg-p20-answer-acceptance.test.js \
  tests/grammar-qg-p20-quality-hardening.test.js
node scripts/generate-grammar-manual-expansion.mjs --check
node scripts/validate-grammar-qg-certification-evidence.mjs \
  reports/grammar/grammar-qg-p20-certification-manifest.json \
  --expected-release=grammar-qg-p20-2026-05-05
node scripts/audit-grammar-qg-p20-quality-hardening.mjs \
  --seeds=1..3 \
  --smart-seeds=1..3 \
  --out=/tmp/grammar-p20-quality-hardening-seeds-1-3.json
node scripts/audit-grammar-qg-p19-smart-practice.mjs \
  --seeds=1..3 \
  --json-out=/tmp/grammar-smart-practice-seeds-1-3.json \
  --md-out=/tmp/grammar-smart-practice-seeds-1-3.md
```

## Validation result in this recreated package

All acceptance checks above passed in the local ZIP environment.
