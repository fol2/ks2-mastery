# Reading Phase 5 — Next 1000-Question Expansion Contract

Date: 2026-05-11

## Source boundary

Primary local workout snapshot: uploaded lean ZIP `ks2-mastery-lean-05102302.zip`.

Applied prerequisite layers for this package:

1. Reading validation hotfix + v3 expansion package (`reading-validation-hotfix-expansion-package.zip`).
2. Reading Phase 4 1000-question expansion package (`reading-phase4-1000q-expansion-package.zip`).

This package is a follow-on patch that assumes Phase 4 has already landed. It does not replace the Phase 4 package. GitHub production evidence currently proves the v3 Reading package only; this Phase 5 package is locally validated next-stage work until merged, tested in CI, deployed, and production-smoked.

## Product goal

Add the second massive Reading expansion wave without lowering content quality or weakening the Reading architecture.

The package must:

- add at least 1000 additional Reading questions after the Phase 4 1000-question expansion;
- correspondingly increase passages and strict 50-mark Reading papers;
- preserve subject-owned Reading marking, scheduling, and reward projection;
- keep answer keys and marking checks out of browser-safe metadata;
- maintain genre variety across fiction, non-fiction, and poetry;
- include all KS2 Reading domains plus punctuation-support strands;
- avoid noticeable question repetition, duplicate stems, duplicate model answers, missing evidence snippets, and unmarkable evidence snippets.

## Patch scope

Patch file:

`patches/001-reading-phase5-next-1000q-expansion.patch`

Files changed:

- `shared/reading/content.js`
- `shared/reading/metadata.js`
- `shared/reading/phase5-expansion.js`
- `tests/reading-phase5-next1000-contract.test.js`

No changes are made to:

- Reading marking engine logic;
- Reading reward or monster projection logic;
- Hero Mode economy or scheduler logic;
- Grammar, Punctuation, Spelling, Arithmetic, or Reasoning engines;
- browser-safe metadata answer-key surfaces.

## Expected counts after Phase 5

Assuming Reading v3 + Phase 4 are applied first, this package should lift Reading to:

- content version: 5;
- total passages: 210;
- total questions: 2072;
- total strict papers: 75;
- genre split: 71 fiction, 71 non-fiction, 68 poetry;
- long passages: 166.

Phase 5 alone contributes:

- 102 passages;
- 1020 questions;
- 34 strict 50-mark papers;
- 34 fiction, 34 non-fiction, 34 poetry;
- 102 long passages.

## Quality gates

Required gates before merge:

```bash
git apply --check patches/001-reading-phase5-next-1000q-expansion.patch
node --check shared/reading/phase5-expansion.js
node scripts/audit-reading-content-quality.mjs --out=reports/reading/reading-content-quality-audit.json
node --test \
  tests/reading-content-contract.test.js \
  tests/worker-reading-runtime.test.js \
  tests/reading-reward-events.test.js \
  tests/hero-reading-provider.test.js \
  tests/reading-phase5-next1000-contract.test.js
```

Required CI/release gates after merge:

```bash
npm test
npm run check
npm run audit:reading-content
node scripts/reading-production-smoke.mjs --expected-content-version=5
```

A production-ready claim requires live smoke evidence with origin, timestamp, commit SHA, content release ID, content version 5, and pass/fail result.

## Acceptance criteria

The package is acceptable if:

- the patch applies cleanly after the v3 and Phase 4 prerequisite patches;
- the Reading content quality audit reports 0 failures and 0 advisories;
- duplicate normalised stem groups = 0;
- duplicate model answer groups = 0;
- repeated stem-shape advisories = 0;
- all Phase 5 evidence snippets exist in their source passages and are markable by the Reading matcher;
- every Phase 5 paper has 3 sections, 60-minute limit, declared total 50, and actual total 50;
- focused Reading runtime/content/reward/Hero-provider tests pass;
- browser-safe Reading metadata exactly matches `readingContentSummary()` without importing answer-key content.
