# Reading Phase 6 Scale Expansion Validation Summary

## Verdict

Implemented, deployed, and production-smoked as a Reading-only follow-on patch after the completed post-hardening and stretch challenge work.

This package expands Reading from 2072 to 4112 questions and from 210 to 414 passages while keeping official Reading audit failures/advisories at zero.

## Final expected totals

```json
{
  "version": 6,
  "passageCount": 414,
  "questionCount": 4112,
  "paperCount": 143,
  "genres": {
    "fiction": 139,
    "non-fiction": 139,
    "poetry": 136
  },
  "longPassageCount": 370
}
```

## Phase 6 contribution

```json
{
  "passageCount": 204,
  "questionCount": 2040,
  "paperCount": 68,
  "genres": {
    "fiction": 68,
    "non-fiction": 68,
    "poetry": 68
  },
  "longPassageCount": 204,
  "paperMarkTotalsUnique": [50]
}
```

## Local validation

- `git apply --check`: passed on a clean extracted ZIP snapshot.
- `git apply`: passed.
- Current generated patch apply check: `git apply --check --cached --unidiff-zero` passed against the implementation base `origin/main`.
- `node --check shared/reading/phase6-expansion.js`: passed; see `validation/dependency-complete-node-check.log`.
- `npm run audit:reading-content`: passed; see `validation/reading-content-quality-audit.log`.
- Official Reading audit: 0 failures, 0 advisories.
- Case-label-normalised Phase 5/6 stem-shape probe: 0 duplicate groups.
- Focused Reading tests: 50 passed, 0 failed; see `validation/dependency-complete-focused-reading-tests.log`.
- Dependency-complete `node --test tests/reading-session-interface.test.js`: 14 passed, 0 failed; see `validation/dependency-complete-reading-session-interface.log`.
- Dependency-complete `npm test`: 111501 tests, 111489 passed, 0 failed, 12 skipped; see `validation/dependency-complete-npm-test-summary.log`.
- Final pre-push `npm test`: 111510 tests, 111498 passed, 0 failed, 12 skipped; see `validation/pre-push-npm-test-summary-2026-05-13.log`.
- Dependency-complete `npm run check`: passed Wrangler OAuth dry-run build/check; see `validation/dependency-complete-npm-run-check.log`.
- Fresh apply-check focused tests: 50 passed, 0 failed.
- Stretch probe after Phase 6: 386 eligible passages, 3106 engine-eligible stretch questions, and 3493 non-punctuation questions available in those passages.
- Sample stretch session: delayed feedback, non-strict, 6 questions, no punctuation-only items.
- Local stretch start-session P95 over 100 starts: about 1.9 ms.

## Local limitation

`tests/reading-session-interface.test.js` cannot run in the lean ZIP environment because `esbuild` is not installed. That environment limitation is recorded in `validation/lean-session-interface-env-limit.log` and is superseded for this implementation by the dependency-complete pass in `validation/dependency-complete-reading-session-interface.log`.

## Production validation

- Reading implementation commit: `c96f4f2e08b5ad4865e382a1f762dee9ef44e836`.
- Latest deployed runtime commit: `b16cb890508add84fff616bc737b5dbac9568aaf`; it includes the Reading implementation commit.
- `npm run deploy`: passed; Worker Version ID `dc1a65cc-2ebb-45f0-8e02-40fb9e4e2c1a`.
- Production bundle audit: passed for `https://ks2.eugnel.uk/`.
- Reading production smoke: passed against `https://ks2.eugnel.uk` with `--expected-content-version=6`; see `validation/production-reading-phase6-smoke-2026-05-13.json`.
- Production smoke confirmed content version 6, 414 passages, 4112 questions, 143 papers, 370 long passages, delayed-paper 50 marks, and stale-write protection.
