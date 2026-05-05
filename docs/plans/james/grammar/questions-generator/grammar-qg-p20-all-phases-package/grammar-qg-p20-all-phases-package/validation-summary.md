# Grammar QG P20 validation summary

Primary snapshot: `/mnt/data/ks2-mastery-lean-05051051.zip`

Uploaded ZIP SHA-256: `bab57cf65863dab6a6ba8d618778cbff2eb1087993993288e393c4045e92ac52`

Source boundary: this package is validated against the uploaded lean ZIP extracted locally. It does not certify live production.

## Patch outcome

- Target release: `grammar-qg-p20-2026-05-05`.
- Template count: `510`.
- Manual-review-only templates after P20: `157`.
- P20 recovered closed auto-mark templates: `23`.
- P20 recovered generated cases in the 30-seed audit: `690`.
- Answer-acceptance failures: `0`.
- Open-response fairness findings: `0`.
- Template-quality findings: `0`.
- Unsafe auto-marked open prompts: `0`.
- Content-quality check: `15300` generated template/seed checks, `0` hard fails, `0` advisories.
- Open-response fairness audit passed: `True`.
- Smart-practice smoke: `66` sessions, `0` failures, `0` advisories.

## Commands run successfully

```bash
npm run verify:grammar-qg-p20
node scripts/audit-grammar-question-generator.mjs --json
node scripts/audit-grammar-question-generator.mjs --deep --json
node scripts/audit-grammar-content-quality.mjs --seeds=1..30 --json
node scripts/audit-grammar-open-response-fairness.mjs --seeds=1..30 --out=/mnt/data/p20-final-open-response-fairness.json
node scripts/audit-grammar-qg-p20-quality-hardening.mjs --seeds=1..30 --smart-seeds=1..6 --out=/mnt/data/p20-final-quality-hardening.json
node scripts/audit-grammar-qg-p19-smart-practice.mjs --seeds=1..6 --json-out=/mnt/data/p20-final-smart-practice-6.json --md-out=/mnt/data/p20-final-smart-practice-6.md
node --test tests/grammar-answer-spec.test.js tests/grammar-answer-spec-audit.test.js tests/grammar-question-generator-audit.test.js tests/grammar-qg-p20-answer-acceptance.test.js tests/grammar-qg-p20-quality-hardening.test.js
```

## Patch application checks

- Split patches: `patch --dry-run -p1` passed on a fresh extraction of the uploaded ZIP.
- Split patches applied cleanly on a fresh extraction.
- Fresh patched copy: 40 targeted tests passed.
- Monolithic all-phases patch: `patch --dry-run -p1` passed on a fresh extraction.

## Limitations

- Live production was not inspected or certified.
- The full smart-practice `--seeds=1..30` release window timed out in this local environment. The patch adds `--seeds` so CI/release can run the full window; local 6-seed smart-practice smoke passed.
- No new learner-facing Grammar families were added in P20. Expansion is gated until the current pool stays clean under the P20 gates.
