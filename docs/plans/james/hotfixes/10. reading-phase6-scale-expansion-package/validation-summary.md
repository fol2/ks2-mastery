# Reading Phase 6 Scale Expansion Validation Summary

## Verdict

Ready as a Reading-only follow-on patch after the completed post-hardening and stretch challenge work.

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
- Current generated patch apply check: `git apply --check --cached --unidiff-zero` passed against current `origin/main`.
- `node --check shared/reading/phase6-expansion.js`: passed; see `validation/dependency-complete-node-check.log`.
- `npm run audit:reading-content`: passed; see `validation/reading-content-quality-audit.log`.
- Official Reading audit: 0 failures, 0 advisories.
- Case-label-normalised Phase 5/6 stem-shape probe: 0 duplicate groups.
- Focused Reading tests: 50 passed, 0 failed; see `validation/dependency-complete-focused-reading-tests.log`.
- Dependency-complete `node --test tests/reading-session-interface.test.js`: 14 passed, 0 failed; see `validation/dependency-complete-reading-session-interface.log`.
- Dependency-complete `npm test`: 111501 tests, 111489 passed, 0 failed, 12 skipped; see `validation/dependency-complete-npm-test-summary.log`.
- Dependency-complete `npm run check`: passed Wrangler OAuth dry-run build/check; see `validation/dependency-complete-npm-run-check.log`.
- Fresh apply-check focused tests: 50 passed, 0 failed.
- Stretch probe after Phase 6: 386 eligible passages, 3106 engine-eligible stretch questions, and 3493 non-punctuation questions available in those passages.
- Sample stretch session: delayed feedback, non-strict, 6 questions, no punctuation-only items.
- Local stretch start-session P95 over 100 starts: about 1.9 ms.

## Local limitation

`tests/reading-session-interface.test.js` cannot run in the lean ZIP environment because `esbuild` is not installed. That environment limitation is recorded in `validation/lean-session-interface-env-limit.log` and is superseded for this implementation by the dependency-complete pass in `validation/dependency-complete-reading-session-interface.log`.

## Production limitation

No production claim is made for this patch. After implementation, deploy and run a fresh Reading production smoke for content version 6.
