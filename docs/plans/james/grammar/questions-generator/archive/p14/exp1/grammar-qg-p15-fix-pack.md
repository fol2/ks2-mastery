# Grammar QG P15 Fix Pack

**Status:** proposed alongside the manual 1000+ expansion pack.  
**Base release inspected:** `grammar-qg-p14-2026-05-01`.

## Fix 1 — content-quality audit seed-range parser

During local inspection, this command silently checked zero templates:

```bash
node scripts/audit-grammar-content-quality.mjs --seeds=1..30 --json
```

The current parser splits only on commas and converts each token with `Number()`, so `Number('1..30')` becomes `NaN`; the seed list becomes empty and the audit reports `totalTemplatesChecked: 0`, `hardFailCount: 0`.

This is a tooling safety problem. A release gate must never pass with zero checked items.

The proposed patch `grammar-qg-p15-fix-content-quality-seed-range.patch` adds:

- inclusive range parsing (`1..30`),
- comma-list support (`1,2,3`),
- invalid-seed rejection,
- a hard failure if the final audit checks zero templates.

## Fix 2 — do not schedule the P15 expansion pack directly

The new 1000+ pack must be imported as `draft_for_review` only. It should not enter learner scheduling until each promoted case has:

- answerability review,
- grammar logic review,
- selected-response distractor rationale,
- constructed-response marking matrix where applicable,
- read-aloud / prompt-cue pass,
- release artefact regeneration,
- production smoke after deployment.

## Fix 3 — exposure controls after expansion

Even with more content, children can still feel repetition if scheduling is not exposure-aware. Keep or strengthen:

- no same-template duplicate in ordinary 5-question sessions,
- no same learner-visible surface inside a recent-window cap,
- prefer different concepts within short rounds,
- reserve deliberate repeats for retry, trouble, or spaced retrieval modes.
