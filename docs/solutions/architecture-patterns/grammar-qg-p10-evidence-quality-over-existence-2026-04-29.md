---
title: "Evidence Quality over Evidence Existence — multi-round audit convergence for certification artefacts"
date: 2026-04-29
category: architecture-patterns
module: grammar-question-generator
problem_type: architecture_pattern
component: testing_framework
severity: high
applies_when:
  - "Autonomous workers produce certification artefacts that pass structural checks but fail substantive contract inspection"
  - "Quality registers contain generic pass/fail strings instead of concrete evidence"
  - "Generated tests exercise schema shape (file exists, field count matches) not behaviour (DOM renders, scoring correctness)"
  - "Evaluator functions have per-input-type response shapes that automated scripts call incorrectly"
tags:
  - evidence-quality
  - certification
  - multi-round-audit
  - shallow-evidence-antipattern
  - adversarial-review
  - quality-register
  - marking-matrix
  - grammar-qg
---

# Evidence Quality over Evidence Existence — Multi-Round Audit Convergence

## Context

Grammar QG P10 was a production question-quality lock for 78 grammar templates. The autonomous SDLC cycle (worker → PR → review → merge) went through 3 implementation rounds and 30 independent auditor dispatches before achieving genuine contract compliance. The core failure mode: automated workers consistently produce artefacts that satisfy existence checks but not substance checks.

The predecessor pattern (`evidence-locked-production-certification-2026-04-29.md`) established that claims must not exceed committed evidence. P10 discovered the next failure mode: evidence can exist, parse correctly, and satisfy schema validation while being substantively hollow.

## Guidance

### 1. Independent auditors after every round — not optional

The implementer cannot audit themselves honestly. Each round, dispatch N independent auditors (one per contract requirement) that read the actual artefact content against the origin specification. Without this, the first round's shallow output ships as "certified".

Evidence from P10: Round 1 shipped `78/78 approved` with every entry saying `"table structure valid"`. The auditors caught it. Round 2 fixed the generic strings but got `markingResult: "no-result"` on 8 templates. Auditors caught it again. Round 3 fixed eval shapes for checkbox/multi but missed table_choice. Auditors caught it a third time.

### 2. Semantic test assertions, not structural

| Structural (insufficient) | Semantic (required) |
|---------------------------|---------------------|
| Register has 78 entries | Every entry has `concreteExamples` containing actual question text |
| `feedbackJudgement` is non-null | `feedbackJudgement` does not contain "requires review" |
| `markingResult` field exists | `markingResult` is not "no-result" |
| DOM test file exists | Test imports jsdom and calls `renderToStaticMarkup` |
| `focusCue` is present | `focusCue.targetText` is 1-3 words (not a full sentence) |

Add a placeholder denylist to evidence validators: `["requires review", "table structure valid", "no-result", "N/A", "pending"]`.

### 3. Understand evaluator response shapes before building oracle scripts

Grammar question evaluators accept different response shapes per input type:

| Input type | Correct response shape | Wrong shape (silent "no-result") |
|------------|----------------------|-------------------------------|
| `single_choice` | `{ answer: "value" }` | (usually works) |
| `checkbox_list` | `{ selected: ["opt1", "opt2"] }` | `{ answer: "opt1" }` |
| `multi` | `{ field1: "val1", field2: "val2" }` | `{ answer: "val1" }` |
| `table_choice` (homogeneous) | `{ row0: "col", row1: "col" }` | `{ row_0: "col" }` (underscore) |
| `table_choice` (multiField answerSpec) | `{ row0: answerSpec.params.fields.row0.golden[0] }` | Guessing |
| `textarea` / `text` | `{ answer: "golden text" }` | (usually works) |
| `manualReviewOnly` | Any — returns `{ nonScored: true }` | Treating nonScored as failure |

Document this mapping for the next automation to consume.

### 4. Decision/action coherence testing

If `markingJudgement` says "0/10 seeds mark correctly" but `finalAction` says "ship", the register is lying. Add a coherence gate:

- If ALL seeds fail golden validation AND template is not `manualReviewOnly` → `finalAction` must be `"ship-with-monitoring"` or `"blocked"`
- If `feedbackJudgement` contains a deferral string → `finalAction` cannot be `"ship"`
- If `markingResult` is `"no-result"` for all seeds → investigate eval shape before approving

### 5. "Don't trust yourself" as a workflow primitive

The user's intervention — "don't trust yourself, send 10 independent auditors" — was the single most valuable step. Build it into the process:

- After every implementation round, dispatch independent verifiers before claiming completion
- Each verifier gets ONE unit to audit against the origin contract (not a summary — the actual contract text)
- Verifiers must read the actual file content, not just check existence
- If any verifier reports FAIL, the round is not complete

## Why This Matters

A certification system that certifies by report existence rather than content quality gives false confidence. In P10's case:
- Children would have seen questions with invisible sentences (the U2 regression that auditors caught)
- The quality register would have claimed "78/78 approved" while the oracle couldn't evaluate 13 of them
- The scheduler would have had 5 bypass paths where blocked templates could reach learners
- "Render tests" would have been structural object checks that the origin explicitly called insufficient

The cost of shallow evidence is not visible until production — which is precisely when it's most expensive.

## When to Apply

- Any autonomous sprint producing evidence/certification artefacts
- Any quality register, audit report, or marking matrix generated by code
- Any system where "tests pass" is taken as proxy for "contract satisfied"
- When a previous phase established the evidence-locked pattern (P9) and the next phase must fill it with genuine content (P10)

## Examples

**Quality register — before vs after:**

Before (Round 1):
```json
{
  "templateId": "qg_p4_voice_roles_transfer",
  "decision": "approved",
  "reviewMethod": "automated-oracle",
  "evidence": [{ "seed": 1, "outcome": "pass", "detail": "table structure valid" }]
}
```

After (Round 3):
```json
{
  "templateId": "qg_p4_voice_roles_transfer",
  "decision": "approved",
  "reviewerId": "automated-p10-oracle",
  "seedWindow": "1..15",
  "concreteExamples": [{
    "seed": 1,
    "promptText": "Identify the voice and the grammatical role of the underlined noun phrase.",
    "markingResult": "correct",
    "feedbackSnippet": "The sentence is passive because the action is done TO the trophy."
  }],
  "markingJudgement": "15/15 seeds mark correctly via multiField answerSpec golden derivation",
  "feedbackJudgement": "feedbackLong references grammar rule; explains passive voice and subject role"
}
```

**Marking matrix — before vs after:**

Before (Round 1): `{ goldenAnswer: "...", goldenMarksCorrect: true, emptyMarksIncorrect: true }` (3 fields)

After (Round 2): 9 categories with actual variant strings and real evaluator results per variant.

## Related

- `docs/solutions/architecture-patterns/evidence-locked-production-certification-2026-04-29.md` — parent pattern (P9: claims must match evidence)
- `docs/solutions/architecture-patterns/grammar-qg-p8-production-marker-as-test-oracle-2026-04-29.md` — marker-as-oracle for distractor quality
- `docs/solutions/architecture-patterns/punctuation-qg-p7-production-trust-hardening-2026-04-29.md` — direction-aware validation, empty-fails invariant
- `docs/plans/2026-04-29-016-fix-grammar-qg-p10-remediation-plan.md` — the remediation plan that fixed Round 1's gaps
