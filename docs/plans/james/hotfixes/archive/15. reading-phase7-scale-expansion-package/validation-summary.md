# Reading Phase 7 Scale Expansion Validation Summary

## Verdict

Implemented in a dependency-complete worktree as the next Reading-only scale patch after the completed Phase 6 / Stretch hardening state.

## Post-patch counts

```json
{
  "version": 7,
  "passageCount": 714,
  "questionCount": 7112,
  "paperCount": 243,
  "genres": {
    "fiction": 239,
    "non-fiction": 239,
    "poetry": 236
  },
  "longPassageCount": 670
}
```

## Phase 7 contribution

```json
{
  "passages": 300,
  "questions": 3000,
  "papers": 100,
  "genres": {
    "fiction": 100,
    "non-fiction": 100,
    "poetry": 100
  },
  "longPassages": 300
}
```

## Validation results

- `git apply --check --cached`: passed against base `585e8ebd` using `patches/001-reading-phase7-scale-expansion.patch`.
- Official Reading content audit: 0 failures, 0 advisories.
- Duplicate normalised stem groups: 0.
- Duplicate model answer groups: 0.
- Repeated recent-expansion stem-shape advisories: 0.
- Focused Reading tests: 72 passed, 0 failed.
- Dependency-complete `tests/reading-session-interface.test.js`: 14 passed, 0 failed.
- Full `npm test`: 111,525 passed, 0 failed, 12 skipped.
- `npm run check`: passed.
- Phase 7 strict paper mark totals: all 50.
- Stretch eligible pool after Phase 7: 686 passages and 6,193 non-punctuation questions.
- Local stretch start-session P95 over 100 starts: about 10.3 ms.

## Production validation

- Production Reading smoke on `https://ks2.eugnel.uk`: passed.
- Production content version: 7.
- Production content counts: 714 passages, 7,112 questions, 243 papers.
- Phase 7 production delayed-feedback paper: `phase7_paper_001`, 28 questions, 50 marks.
- Stale write guard: passed with no stale response persisted.
- Evidence: `validation/production-reading-smoke-2026-05-13.json`.
- Production Reading browser smoke on `/demo`: passed on desktop 1280x800 and mobile 390x844.
- Browser smoke checked the Reading landing, Reading setup controls, desktop session start, horizontal overflow, screenshots, console errors, request failures, and HTTP failures.
- Browser evidence: `validation/production-reading-landing-browser-smoke-2026-05-13.json`.
- Browser screenshots: `validation/production-reading-landing-screenshots-2026-05-13/`.

## Evidence commit chain

- Runtime implementation and deploy target: `fb8cd61e46ec795ab3cea06a99726c46d954e21c`.
- API production smoke evidence commit: `ad8f8ecf18414af30072a82e9ef3e39e42f0817c`.
- Browser production smoke evidence commit: `bef9c3addde3d14bf164d12a8328f660020d332b`.
- Later commits in this package are evidence-only or line-ending/checksum fixes. They do not change Reading runtime content or the production smoke target.
- The package is pinned to LF line endings through `.gitattributes` so `SHA256SUMS.txt` verifies consistently on Windows and Linux checkouts.
