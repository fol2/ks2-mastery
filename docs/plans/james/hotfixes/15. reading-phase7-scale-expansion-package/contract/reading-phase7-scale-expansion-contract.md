# Reading Phase 7 Scale Expansion Contract

## Scope

Reading-only patch. It must not change Spelling, Grammar, Punctuation, Arithmetic, Reasoning, Hero Mode, rewards, monsters, platform auth, capacity, account management or the application shell.

## Intent

Move Reading from a strong but still-small 4K bank toward the long-term >10K target in staged audited waves. Reading question generation is harder than closed-form subjects, but the product target remains the same: a broad, high-quality, KS2-focused and KS2-plus Reading bank with strict quality gates.

## Baseline before this patch

Reading content version: 6.

- Passages: 414
- Questions: 4112
- Strict papers: 143
- Genres: 139 fiction, 139 non-fiction, 136 poetry
- Long passages: 370
- Stretch mode: present

## Required post-patch state

Reading content version: 7.

- Passages: 714
- Questions: 7112
- Strict papers: 243
- Genres: 239 fiction, 239 non-fiction, 236 poetry
- Long passages: 670
- Stretch mode remains present and answer-safe browser metadata remains summary-only.

## Phase 7 contribution

- 300 long passages
- 3000 questions
- 100 strict 50-mark papers
- 100 fiction passages
- 100 non-fiction passages
- 100 poetry passages

## Quality requirements

The implementation must keep:

- duplicate passage IDs: 0
- duplicate question IDs: 0
- duplicate normalised stems: 0
- duplicate model answers: 0
- repeated recent-expansion stem-shape advisories: 0
- unresolved learner-facing template copy: 0
- missing evidence snippets: 0
- unmarkable evidence snippets: 0
- model-answer markability/rubric drift: 0
- paper mark-total failures: 0

Phase 7 generated passages must be long, difficulty 4/5, balanced across genres, and include a mixture of retrieval, vocabulary, summary, evidence, prediction, structure, author choice/comparison and punctuation-support work.

## Paper contract

Each Phase 7 paper must contain three sections in this order:

1. fiction
2. non-fiction
3. poetry

Each paper must declare 60 minutes, 50 total marks and exactly three sections. Referenced question IDs must exist in the referenced passage.

## Production requirement after implementation

Local validation proves only the implementation snapshot. After merge/deploy, run a fresh Reading production smoke with `--expected-content-version=7` and record production evidence separately.
