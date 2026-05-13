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
- Current generated patch apply check: `git apply --check --cached --unidiff-zero` passed against implementation base `85ac971f48516bdbf3b38400e73635b0cf630b77`.
- `node --check shared/reading/phase6-expansion.js`: passed; see `validation/dependency-complete-node-check.log`.
- `npm run audit:reading-content`: passed; see `validation/reading-content-quality-audit.log`.
- Official Reading audit: 0 failures, 0 advisories.
- Reviewer punctuation-skill blocker: fixed by making Phase 6 P1/P2/P3/P4 questions test comma/pausing, speech marks, dashes/parentheses, and colon/semicolon/list features respectively.
- Phase 6 punctuation feature probe: P1 51, P2 51, P3 51, P4 51, 0 mismatches; see `validation/blocker-punctuation-feature-probe-2026-05-13.json`.
- Post-blocker official Reading audit: 0 failures, 0 advisories, 0 repeated stem-shape advisories; see `validation/blocker-punctuation-reading-audit-2026-05-13.log`.
- Post-blocker focused Reading tests: 65 passed, 0 failed; see `validation/blocker-punctuation-focused-reading-tests-2026-05-13.log`.
- Post-blocker `npm run check`: passed Wrangler OAuth dry-run build/check; see `validation/blocker-punctuation-npm-run-check-2026-05-13.log`.
- Case-label-normalised Phase 5/6 stem-shape probe: 0 duplicate groups.
- Focused Reading tests: 50 passed, 0 failed; see `validation/dependency-complete-focused-reading-tests.log`.
- Dependency-complete `node --test tests/reading-session-interface.test.js`: 14 passed, 0 failed; see `validation/dependency-complete-reading-session-interface.log`.
- Dependency-complete `npm test`: 111501 tests, 111489 passed, 0 failed, 12 skipped; see `validation/dependency-complete-npm-test-summary.log`.
- Final pre-push `npm test`: 111519 tests, 111507 passed, 0 failed, 12 skipped; see `validation/pre-push-npm-test-summary-2026-05-13.log`.
- Dependency-complete `npm run check`: passed Wrangler OAuth dry-run build/check; see `validation/dependency-complete-npm-run-check.log`.
- Fresh apply-check focused tests: 50 passed, 0 failed.
- Stretch probe after Phase 6: 386 eligible passages, 3106 engine-eligible stretch questions, and 3493 non-punctuation questions available in those passages.
- Sample stretch session: delayed feedback, non-strict, 6 questions, no punctuation-only items.
- Local stretch start-session P95 over 100 starts: about 1.9 ms.

## Local limitation

`tests/reading-session-interface.test.js` cannot run in the lean ZIP environment because `esbuild` is not installed. That environment limitation is recorded in `validation/lean-session-interface-env-limit.log` and is superseded for this implementation by the dependency-complete pass in `validation/dependency-complete-reading-session-interface.log`.

## Production validation

- Reading implementation commit: `c96f4f2e08b5ad4865e382a1f762dee9ef44e836`.
- Latest deployed runtime commit: `56e2d15abffd21381a53361117fee3ff82292293`; it includes the Reading implementation commit and the reviewer-requested punctuation-skill fix.
- `npm run deploy`: passed; Worker Version ID `9834e571-8d7f-43fb-952f-68f01b28be33`.
- Production bundle audit: passed for `https://ks2.eugnel.uk/`.
- Reading production smoke: passed against `https://ks2.eugnel.uk` with `--expected-content-version=6`; see `validation/production-reading-phase6-smoke-2026-05-13.json`.
- Production smoke confirmed content version 6, 414 passages, 4112 questions, 143 papers, 370 long passages, delayed-paper 50 marks, and stale-write protection.
