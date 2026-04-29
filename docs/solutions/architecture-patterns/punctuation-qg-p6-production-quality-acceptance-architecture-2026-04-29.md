---
title: "Punctuation QG P6 — Production Question Quality Acceptance Architecture"
module: punctuation-qg
date: "2026-04-29"
problem_type: architecture_pattern
component: testing_framework
severity: high
tags:
  - "punctuation-qg"
  - "content-quality"
  - "self-marking"
  - "normalisation"
  - "speech-fairness"
  - "explanation-generation"
  - "reviewer-tooling"
  - "characterisation-testing"
applies_when: "Final content-quality acceptance phase for a question generator — proving fairness, explanations, and variety rather than adding volume"
---

# Punctuation QG P6 — Production Question Quality Acceptance Architecture

## Context

P1–P5 built the deterministic Punctuation question-generation engine (25/25 DSL families, 192 runtime items, telemetry manifest, duplicate governance). P6 is architecturally distinct: it asks whether every learner-visible question is *good enough to trust*. The challenge is proving fairness across 192 items without manual inspection of each one, while fixing two critical marking bugs that children would encounter.

The phase required a different engineering posture: characterisation-first (prove existing behaviour before modifying), CI-gated quality (every new assertion is a regression guard), and reviewer-tooling-as-code (human QA is enabled but not replaced by automation).

## Guidance

### 1. Canonicalisation must be context-aware

```js
// BEFORE (P5): strips space after ALL apostrophes — treats possessives as closing quotes
.replace(/([""''])\s+/g, '$1')    // teachers' notices → teachers'notices ❌

// AFTER (P6): callback inspects preceding character
.replace(/([""''])\s+/g, (match, quote, offset, str) => {
  if (/\w/.test(str[offset - 1] || '')) return match;  // possessive — preserve space
  return quote;                                         // closing quote — collapse
})
```

Key insight: A single regex cannot distinguish possessive apostrophes from closing speech marks without positional context. The fix uses a lookback at the preceding character — `\w` before `'` means possessive; punctuation or boundary means speech quote.

### 2. Hash isolation for optional fields

When adding a new field (like `explanation`) to a DSL template, strip it before computing identity hashes:

```js
function stripExplanationForHash(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'explanation') continue;
    out[k] = Array.isArray(v) ? v.map(stripExplanationForHash) : stripExplanationForHash(v);
  }
  return out;
}
```

Without this, adding explanations would change `templateId` and `variantSignature`, breaking star evidence continuity for existing learners.

### 3. Speech validator fairness via position flexibility

When a prompt asks generally for direct speech ("Write one sentence of direct speech using these exact spoken words"), the validator must accept both reporting-before (`Mia asked, "..."`) and reporting-after (`"..." asked Mia.`) forms. Constrain position only when the prompt explicitly requires it.

Implementation: add `reportingPosition: 'any'` to the rubric and branch the validator's capitalisation and comma checks accordingly.

### 4. Self-marking gates catch content drift

A test that runs every fixed item's model answer through production marking acts as a drift detector: if normalisation changes, validator logic shifts, or content is edited without updating the marking config, CI fails immediately with the exact item ID and failure note. The gate adds 206 assertions for 92 items with near-zero maintenance cost.

### 5. Explanation-as-DSL-constant, not runtime computation

Each template's `build()` function returns an `explanation` string. The generator picks it up via `template.explanation || fallback`. Zero runtime overhead, zero AI dependency, zero network call. The explanation is authored once per template family and shared across all variants.

### 6. Composable verification gates (additive, never subtractive)

P6 adds 8 gates to P5's 10, totalling 18. Each phase's gates are additive — no prior gate is ever removed. The verification command is a single entry point (`npm run verify:punctuation-qg:p6`) that composes ALL checks into one pass/fail.

## Why This Matters

Content-quality bugs are silent at runtime — a child gets marked wrong for a correct answer, and the only signal is frustration (no error log, no crash, no metric spike). Proof-level CI coverage converts these invisible failures into loud test failures. Without P6-style self-marking gates, content bugs accumulate over time as normalisation functions evolve and new items are added.

The characterisation-first posture prevents the "fix one thing, break another" trap: by snapshotting all golden test results BEFORE modifying normalisation, any unintended regression is caught instantly.

## When to Apply

- Finalising a question generator for production release
- Adding new fields to DSL templates that feed into identity hashes
- Modifying canonicalisation or normalisation functions that affect marking
- Building reviewer tooling for human QA without replacing CI gates
- Any content-quality phase where volume is already sufficient and the goal is fairness proof

## Examples

**Reviewer QA pack as code (not UI):**
```bash
npm run review:punctuation-questions          # markdown to stdout
npm run review:punctuation-questions -- --json  # JSON for filtering
```

The script generates a per-item report with live marking results, explanation text, variety clusters, and reviewer decision slots — all without an admin panel. Human QA is enabled through committed fixtures that CI gates on.

**Perceived-variety report clustering:**
```
Same sentence across modes: 47 clusters (intentional — fix/combine modes reuse sentences)
Same-mode duplicates: 0 (invariant — CI fails if this changes)
```

Cross-mode overlap is NOT automatically a bug — the reviewer decides. Same-mode overlap IS always a bug and fails CI.
