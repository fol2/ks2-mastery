---
title: "Production Marker as Test Oracle — using the scoring function itself to verify content correctness"
date: 2026-04-29
category: architecture-patterns
module: grammar-question-generator
problem_type: architecture_pattern
component: testing_framework
severity: medium
applies_when:
  - "Authoring audit tests for any question generator (Grammar, Punctuation, Spelling)"
  - "Need closed-loop verification that generated questions are answerable and non-trivial"
  - "Audit rules must detect no-op items where raw prompt already matches the golden answer"
  - "Any system with a validation/marking function that should be used as its own oracle"
tags:
  - question-generator
  - test-oracle
  - closed-loop-quality
  - markbyanswerspec
  - grammar-qg
  - audit-rule
  - defence-in-depth
  - regression-cascade
related_components:
  - service_object
---

# Production Marker as Test Oracle — using the scoring function itself to verify content correctness

## Context

The Grammar question generator produces ~2,340 items across 78 templates × 30 seeds. P1–P7 built the infrastructure (templates, answer specs, mixed-transfer, calibration), but no mechanism existed to prove the generated questions themselves were sound.

A structural scan found one S0 defect: the `speech_punctuation_fix` template at seeds 2, 5, 8, 11, 14, 17, 20, 23, 26, 29 presented a "fix the punctuation" item where the raw sentence `"Sit down!" said the coach.` already matched the golden answer. Learners saw nothing to fix.

The existing audit rule (`fix-task-noop`) compared full `stemHtml` (including instruction text like "Punctuate the direct speech correctly.") against the golden answer, so string equality never triggered. The bug class was invisible to string-comparison approaches.

Root cause: direct index selection (`seed % 3 === 2`) selects `SPEECH_FIX_ITEMS[2]`, which was authored with already-correct punctuation as the raw prompt. (auto memory [claude]: This does NOT use the `pickBySeed` PRNG pattern — it is simple modulo indexing into a 3-item array.)

## Guidance

**Core pattern:** Use `markByAnswerSpec()` — the production marking function — as the quality oracle for content verification.

```javascript
// The oracle loop:
// Template fixture → createGrammarQuestion({ templateId, seed }) → answerSpec
//                                                                    ↓
//               markByAnswerSpec(spec, golden)    → must return correct: true
//               markByAnswerSpec(spec, nearMiss)  → must return correct: false
//               markByAnswerSpec(spec, rawPrompt) → must NOT pass
```

This is stronger than string comparison because it tests the actual normalisation (curly↔straight quotes, whitespace, case), pattern matching (punctuation patterns), and scoring logic that learners encounter. If the marker has a leniency bug, the oracle catches it.

**Defence in depth via layered detection rules:**

Three audit rules catch the same class of defect through different detection surfaces:

| Rule | What it detects | Why it's needed |
|------|----------------|-----------------|
| `near-miss-marks-correct` | Any nearMiss value that `markByAnswerSpec` accepts | Catches marker leniency |
| `near-miss-equals-golden` | String equality after normalisation | Catches authoring errors |
| `raw-prompt-passes` | Raw/nearMiss text passes marking | Catches the "nothing to fix" class |

The redundancy is intentional. Different defect presentations escape different rules. The overlap means the system catches the bug regardless of how it manifests.

**Verify chain as regression insurance:**

The cascading pattern (`verify:grammar-qg-p8` → `p7` → `p6` → ... → `p1`) means every future phase re-runs all prior assertions. Test count grows monotonically:

| Phase | Own tests | Chain total |
|-------|----------:|------------:|
| P1–P4 | ~199 | 199 |
| P5 | +47 | ~246 |
| P6 | +137 | ~383 |
| P7 | +184 | ~567 |
| P8 | +3,148 | 3,531 |

The 3,531-test suite runs in ~12 seconds (pure computation — no I/O, no network).

## Why This Matters

String comparison audits are fragile — they break on whitespace differences, quote normalisation, or instruction text mixed into HTML. Using the production marker as oracle creates a **self-verifying system**: if the marker is too lenient, the oracle detects it. If the marker is too strict, golden-answer assertions fail.

This eliminates the gap between "the audit passes" and "the learner experience is correct." The audit tests the same code path the learner encounters.

The defence-in-depth approach means a single authoring error triggers multiple alarms rather than slipping through a single check. This matters for educational content where a single no-op item can erode learner trust.

## When to Apply

- Any content generation system with a validation/marking engine
- Quiz/assessment systems where answers have acceptance criteria
- Template-based systems where fixtures define input/output pairs
- Anywhere you have `validate(input) → boolean` — that validator IS your oracle
- When existing string-comparison audits have blind spots due to mixed content (instructions + answer text)

## Examples

### Before: Audit that missed the defect

```javascript
// HARD FAIL 5: Fix-task where prompt equals accepted answer
if (template.questionType === 'fix') {
  const rawPrompt = stripHtml(question.stemHtml || ''); // includes instruction text!
  const acceptedAnswers = question.answerSpec?.golden || [];
  for (const accepted of acceptedAnswers) {
    if (accepted && rawPrompt === accepted.trim()) { // never matches — instruction prefix
      hardFailures.push({ rule: 'fix-task-noop', templateId: template.id, seed, detail: '...' });
    }
  }
}
```

Problem: `stemHtml` is `<p>Punctuate the direct speech correctly.</p><p><strong>"Sit down!" said the coach.</strong></p>`. After `stripHtml`, it becomes `Punctuate the direct speech correctly. "Sit down!" said the coach.` — which never equals the golden `"Sit down!" said the coach.` because of the instruction prefix.

### After: Oracle that catches it

```javascript
import { markByAnswerSpec } from '../worker/src/subjects/grammar/answer-spec.js';

// HARD FAIL 6: Near-miss passes marking (uses production marker as oracle)
const constructedKinds = ['normalisedText', 'acceptedSet', 'punctuationPattern'];
if (constructedKinds.includes(question.answerSpec?.kind)) {
  const nearMiss = question.answerSpec?.nearMiss || [];
  for (const nm of nearMiss) {
    const result = markByAnswerSpec(question.answerSpec, nm);
    if (result.correct) {
      hardFailures.push({
        rule: 'near-miss-marks-correct',
        templateId: template.id,
        seed,
        detail: `Near-miss "${nm}" is accepted by markByAnswerSpec`,
      });
    }
  }
}
```

This works because `nearMiss` contains the raw/incorrect forms. Running them through the same marker that learners use proves they would NOT be accepted. If one passes, the item is defective.

### The specific fixture fix

```javascript
// Before (bug): raw already correct — nothing to fix
{ raw: "“Sit down!” said the coach.", accepted: ["“Sit down!” said the coach."] }

// After (fixed): raw genuinely incorrect — exclamation mark missing
{ raw: "“Sit down” said the coach.", accepted: ["“Sit down!” said the coach."] }
```

## Related

- [Grammar QG P7 — Production Calibration Activation](docs/solutions/architecture-patterns/grammar-qg-p7-production-calibration-activation-2026-04-29.md) — direct predecessor; P8 extends the verify chain
- [Grammar QG P5 — Machine-Verifiable Content Release](docs/solutions/architecture-patterns/grammar-qg-p5-machine-verifiable-content-release-process-2026-04-28.md) — introduced hard-fail audit rules; P8 adds 3 new rules using the oracle pattern
- [Punctuation QG P5 — Production Readiness Attestation](docs/solutions/architecture-patterns/punctuation-qg-p5-production-readiness-attestation-architecture-2026-04-29.md) — analogous certification for Punctuation; self-checking registry pattern
- [Autonomous Certification Phase Wave Execution](docs/solutions/workflow-issues/autonomous-certification-phase-wave-execution-2026-04-27.md) — execution methodology (wave-based parallel dispatch)
- Origin plan: `docs/plans/2026-04-29-009-feat-grammar-qg-p8-production-question-quality-certification-plan.md`
- PR: [#604](https://github.com/fol2/ks2-mastery/pull/604)
