# Validation summary

Source ZIP reviewed: `ks2-mastery-lean-05080102.zip`

Source ZIP SHA-256:

`b8f30cefff6178f7db18bfc47e53387b4ebd680d3ae35eee5aeba0ee4b91fe50`

## Recreated hotfix verdict

The recreated package contains the same narrow Grammar UI fix: make the normal-session `End round` button respect `runtimeReadOnly`.

The bug is UI/affordance-level, not a content, marking, mastery, Stars, reward, or question-generation bug.

## Patch

`patches/001-grammar-session-readonly-end-round.patch`

Changes:

```diff
-disabled={pending}
+disabled={runtimeReadOnly || pending}
```

Adds a regression test that requires the `grammar-end-early` button block to include `disabled={runtimeReadOnly || pending}`.

## Local validation results

Fresh patch dry-run: PASS

Fresh patch apply: PASS

UI action contract:

```bash
node --test tests/ui-action-engine-contract.test.js
```

Result: `17/17 pass`.

Grammar P20 targeted tests:

```bash
node --test \
  tests/grammar-answer-spec.test.js \
  tests/grammar-answer-spec-audit.test.js \
  tests/grammar-question-generator-audit.test.js \
  tests/grammar-qg-p20-answer-acceptance.test.js \
  tests/grammar-qg-p20-quality-hardening.test.js
```

Result: `54/54 pass`.

Manual expansion check:

```bash
node scripts/generate-grammar-manual-expansion.mjs --check
```

Result: PASS, manual expansion is up to date.

Certification evidence validator:

```bash
node scripts/validate-grammar-qg-certification-evidence.mjs \
  reports/grammar/grammar-qg-p20-certification-manifest.json \
  --expected-release=grammar-qg-p20-2026-05-05
```

Result: PASS.

Grammar content quality smoke:

```bash
node scripts/audit-grammar-content-quality.mjs --seeds=1,2,3 --json
```

Result: `1,530` template checks, `0` hard failures, `0` advisories.

P20 quality-hardening smoke:

```bash
node scripts/audit-grammar-qg-p20-quality-hardening.mjs \
  --seeds=1..3 \
  --smart-seeds=1..3
```

Result: PASS.

Summary:

- `510` templates
- `3` seeds checked
- `69` recovered closed auto-mark cases
- `0` answer-acceptance failures
- `0` fairness findings
- `0` template-quality findings
- `0` unsafe auto-marked open prompts
- `0` smart-practice failures
- `0` smart-practice advisories

Smart-practice repetition/variety smoke:

```bash
node scripts/audit-grammar-qg-p19-smart-practice.mjs --seeds=1..3
```

Result: PASS.

- `33` sessions
- `11` profiles
- `3` seeds
- `0` failures
- `0` advisories

## Limitation

This package does not independently certify live production. It validates the uploaded ZIP snapshot in the local environment.
