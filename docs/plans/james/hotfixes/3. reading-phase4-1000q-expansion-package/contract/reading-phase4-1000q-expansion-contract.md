# Reading Phase 4 — 1000+ Question Expansion Contract

## Goal

Expand Reading from the current version-3 production package into a next-stage version-4 package with at least 1000 questions, while preserving the existing Worker-owned marking model, answer-safety boundary, paper contract, and question-quality audit gate.

## Baseline

The version-3 baseline used for this patch has:

- 24 passages
- 212 questions
- 13 strict 50-mark papers
- 12 Reading skills
- 9 fiction, 9 non-fiction, 6 poetry passages
- 8 long passages

## Patch target

The version-4 patch raises Reading to:

- 108 passages
- 1052 questions
- 41 strict 50-mark papers
- 12 Reading skills covered
- 37 fiction, 37 non-fiction, 34 poetry passages
- 64 long passages

## Content expansion shape

The patch adds `shared/reading/phase4-expansion.js`, a deterministic structured expansion module containing answer keys and marking checks. It is imported by `shared/reading/content.js`, not by browser-safe metadata. The browser metadata file is updated only with safe summary counts.

The new material adds 84 passages:

- 28 fiction passages
- 28 non-fiction passages
- 28 poetry passages

Each new passage has 10 questions. The question mix covers short answers, multiple choice, evidence-short answers, open explanations, matching, ordering, multi-select, and punctuation-support items. Each generated strict paper uses one fiction, one non-fiction, and one poetry section for a 50-mark total.

## Quality guardrails

The patch must satisfy the existing Reading content quality audit. That audit checks duplicate IDs, unknown skills, missing or unmarkable evidence snippets, duplicate normalised stems, duplicate model answers, repeated stem-shape advisories, valid paper references, 50-mark paper totals, 60-minute paper limits, and skill coverage.

The patch also raises the Reading content contract thresholds so future regressions below the 1000-question stage fail fast.

## Non-goals

This patch does not change Reading runtime marking logic, reward projection, Stars, Hero Mode, monsters, Cloudflare bindings, production deployment settings, or browser-side answer visibility.

## Required validation before merge

Minimum local validation:

1. `git apply --check patches/001-reading-phase4-1000q-expansion.patch` against the current Reading version-3 baseline.
2. `node --check shared/reading/phase4-expansion.js`.
3. `node scripts/audit-reading-content-quality.mjs --out <evidence>.json` with 0 failures and 0 advisories.
4. `node --test tests/reading-content-contract.test.js tests/worker-reading-runtime.test.js` with 0 failures.
5. Dependency-complete CI should also run `tests/reading-session-interface.test.js`, because the lean ZIP used here does not include `esbuild`.

## Production gate

Do not call this production-certified until a deployed version-4 Reading smoke records origin, timestamp, content version, content summary, immediate-round result, delayed-paper result, and stale-write guard status.
