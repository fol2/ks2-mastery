---
title: "Punctuation QG P7 — Production Trust Hardening Architecture"
date: 2026-04-29
module: punctuation-qg
problem_type: architecture_pattern
component: testing_framework
severity: high
applies_when:
  - Building deterministic question generators that require production trust certification
  - Adding verification gates to learner-facing content pipelines
  - Extending depth/difficulty tiers beyond previously certified levels
  - Validating speech-synthesis oracle correctness for multi-form answers
  - Composing multi-phase verification cascades where each phase must be additive-only
  - Preventing QA bypass by omission in reviewer workflows
tags:
  - punctuation-qg
  - production-trust
  - verification-cascade
  - speech-oracle
  - depth-activation
  - reviewer-decisions
  - semantic-lint
  - gate-as-pure-function
---

# Punctuation QG P7 — Production Trust Hardening Architecture

## Context

P6 certified the punctuation question generator at production depth 4 with 18 verification gates, 192 production items, and 347+ tests. But P6 validation surfaced five systemic trust risks that would block safe depth-6 activation:

1. **Silent validation bypass** — `reportingCommaOk()` returned `true` for `reportingPosition: 'any'`, meaning templates with flexible positioning never had comma placement validated. This allowed incorrectly-punctuated answers to pass marking.

2. **Drift-prone depth constants** — Production depth was hardcoded independently in `generators.js` (canonical) and `service.js` (duplicate). These could silently drift.

3. **QA bypass by omission** — The reviewer decision fixture allowed empty `decisions: {}` to pass validation. A depth raise could technically happen without any human review.

4. **Shallow explanation checks** — Explanations passed only "not generic" and "no internal IDs" checks, but could be semantically mismatched to their actual rule.

5. **Variety normalisation collision** — `well-known` collapsed into `wellknown` after dash stripping, artificially deflating perceived-variety scores and allowing near-duplicates through.

These gaps collectively meant depth-6 activation was unsafe without human ceremony at every step. P7 established six architectural patterns to make depth raises mechanically verifiable.

## Guidance

### Pattern 1: Direction-Aware Validation

**Problem**: Validation logic that branches on rubric permissions (what is *allowed*) rather than actual answer shape (what is *present*) silently skips checks when permissions are broad.

**Before** (broken — `shared/punctuation/marking.js:191`):
```javascript
function reportingCommaOk(text, pair, rubric) {
  if (rubric?.reportingPosition === 'after' || rubric?.reportingPosition === 'any') return true;
  const before = beforeOpeningQuote(text, pair);
  if (!before) return true;
  return /,\s*$/.test(before);
}
```

**After** (fixed):
```javascript
function detectReportingShape(text, pair) {
  const before = beforeOpeningQuote(text, pair);
  const after = afterClosingQuote(text, pair);
  const hasBefore = before && /[a-zA-Z]{2,}/.test(before);
  const hasAfter = after && /[a-zA-Z]{2,}/.test(after);
  if (hasBefore) return 'reporting-before';
  if (hasAfter) return 'reporting-after';
  return 'speech-only';
}

function reportingCommaOk(text, pair, rubric, detectedShape) {
  if (detectedShape === 'reporting-after' || detectedShape === 'speech-only') return true;
  // reporting-before: ALWAYS check comma regardless of rubric
  const before = beforeOpeningQuote(text, pair);
  if (!before) return true;
  return /,\s*$/.test(before);
}
```

**Principle**: Separate "what the rubric allows" from "what the answer actually does". Detect the concrete shape first, then dispatch validation rules per shape.

---

### Pattern 2: Gate-as-Pure-Function

**Design**: Activation gates return a decision record without mutating state.

```javascript
function evaluateDepthActivationGate(options) {
  const blockers = [];

  if (!options.speechOraclePass) blockers.push({ code: 'SPEECH_ORACLE', detail: '...' });
  if (!options.semanticLintPass) blockers.push({ code: 'SEMANTIC_LINT', detail: '...' });
  if (options.reviewerDecisions.itemDecisions.length === 0)
    blockers.push({ code: 'NO_DECISIONS', detail: 'Empty decisions array' });

  return Object.freeze({
    pass: blockers.length === 0,
    outcome: blockers.length === 0 ? 'raise-all-to-6' : 'keep-depth-4',
    blockers: Object.freeze(blockers),
  });
}
```

**Principle**: Gates report readiness from evidence. They never side-effect production configuration. This makes depth-raise decisions safe to re-run, log, audit, and automate.

---

### Pattern 3: Empty-Fails Invariant

**Design**: Schema v2 treats empty collections as explicit failure, not vacuous truth.

```javascript
function evaluateProductionGate(decisions, productionItemIds) {
  if (!decisions.itemDecisions || decisions.itemDecisions.length === 0) {
    return { pass: false, reason: 'EMPTY_DECISIONS', detail: 'No reviewer decisions populated' };
  }
  // ... remaining checks
}
```

**Principle**: You cannot reach a higher trust level by doing nothing. The gate forces human action — omission is failure.

---

### Pattern 4: Hierarchical Verification Cascade

**Design**: Each phase's verify script imports the prior phase as Gate 1. Test count grows monotonically.

```
verify:punctuation-qg:p7  (10 top-level → 27 logical gates)
├── Gate 1:  verify-punctuation-qg-p6.mjs  (18 logical gates)
│   ├── Gate 1.1: verify-punctuation-qg-p5.mjs  (10 gates)
│   │   └── Gate 1.1.1: verify-punctuation-qg.mjs  (8 components)
│   └── Gates 1.2–1.9: P6-specific
├── Gate 2:  Direction-aware speech oracle
├── Gate 3:  Canonical depth-source drift
├── Gate 4:  Depth-6 reviewer-pack CLI
├── Gate 5:  Reviewer-decision production gate
├── Gate 6:  Accepted-alternative + negative-case proof
├── Gate 7:  Semantic explanation oracle
├── Gate 8:  Child-facing feedback trust
├── Gate 9:  Perceived-variety second pass
└── Gate 10: Depth-decision attestation
```

**Growth**: P4 (8) → P5 (10) → P6 (18) → P7 (27). Gates are additive, never subtractive. Regression is structurally impossible.

---

### Pattern 5: Semantic Lint via Rule-ID Metadata

**Design**: Each DSL template carries `explanationRuleId` mapped to keyword-based lint rules. The field is stripped before identity hash computation.

```javascript
// DSL template carries rule-ID
const EXPLANATION_RULE_ID = 'speech.inverted-comma-enclosure';
build(slotValues) {
  return { ..., explanation: EXPLANATION, explanationRuleId: EXPLANATION_RULE_ID };
}

// Hash computation strips lint metadata (zero drift)
function buildGeneratedItem({ template, ... }) {
  const { explanationRuleId, ...hashableFields } = template;
  const variantSignature = computeHash(hashableFields);
  return { ...item, explanationRuleId, variantSignature };
}

// Lint rules keyed by rule-ID (test-only, zero runtime cost)
const LINT_RULES = {
  'speech.inverted-comma-enclosure': { required: ['inverted comma', 'speech mark'] },
  'semicolon.independent-clauses': { required: ['independent clause', 'stand alone'] },
};
```

**Principle**: Lint metadata travels with the template but is invisible to identity. This enables semantic quality checks without hash drift or production overhead.

---

### Pattern 6: Dash-as-Word-Boundary in Normalisation

**Before** (broken):
```javascript
function normaliseForVariety(value) {
  return String(value ?? '')
    .replace(/[–—]/g, '-')           // en/em-dash → hyphen
    .replace(/[^a-z0-9\s]/gi, '')    // strips hyphen too → words GLUED
    .trim().toLowerCase();
}
// "well-known" → "wellknown" (false collision)
```

**After** (fixed):
```javascript
function normaliseForVariety(value) {
  return String(value ?? '')
    .replace(/[–—-]/g, ' ')          // ALL dashes → word boundary
    .replace(/[^a-z0-9\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim().toLowerCase();
}
// "well-known" → "well known" (correct separation)
```

**Principle**: When normalising for perceived variety, hyphens are word boundaries, not joiners. Decide whether punctuation is a joiner or separator BEFORE stripping it.

## Why This Matters

1. **No silent bypasses** — Direction-aware validation ensures every answer is validated against its actual shape, not just its permission class.
2. **Safe automation** — Gate-as-pure-function means depth decisions can be evaluated in CI, dry-run mode, or monitoring without accidental mutation.
3. **Structural regression immunity** — The cascade guarantees P7 cannot pass if P6 fails. A change breaking a P5 invariant surfaces as a P7 failure.
4. **Honest metrics** — Variety normalisation fix ensures diversity scores reflect genuine linguistic variation, not normalisation artefacts.
5. **Auditable decisions** — Every gate returns structured evidence (blockers, timestamps, outcomes) without external logging infrastructure.
6. **Human-in-the-loop without ceremony** — Reviewer decisions force meaningful action without complex process — the gate evaluates mechanically once decisions exist.

## When to Apply

| Pattern | Apply when... |
|---------|--------------|
| Direction-aware validation | A validator branches on "what is allowed" rather than "what is present" — any time a permission like `position: 'any'` exists alongside concrete answer data |
| Gate-as-pure-function | Any go/no-go decision that could be re-run or automated — particularly when controlling production config changes |
| Empty-fails invariant | Any approval workflow where empty submission could be interpreted as approval — review systems, QA gates, sign-off checklists |
| Hierarchical verification cascade | Multi-phase projects where later work must not regress earlier guarantees — database migrations, API versioning, feature flag graduation |
| Semantic lint via rule-ID | Content systems with identity-critical data alongside quality metadata — lint fields must be stripped before hash computation |
| Dash-as-word-boundary | Any normalisation pipeline measuring textual diversity — decide if punctuation is joiner or separator before stripping |

## Examples

**Delivery metrics:**
- 10 PRs merged across 6 dependency waves (#623, #625, #636, #640, #641, #644, #645, #646, #647, #648)
- ~350+ new test assertions across 8 new test files
- 3 new shared modules: `reviewer-decisions.js`, `explanation-lint.js`, `depth-activation-gate.js`
- 27 logical verification gates, 31.7s runtime
- Production depth remains at 4 (empty-fails invariant working as designed)

**Key files:**
- `shared/punctuation/marking.js` — direction-aware speech oracle (Patterns 1)
- `shared/punctuation/depth-activation-gate.js` — gate-as-pure-function (Pattern 2)
- `shared/punctuation/reviewer-decisions.js` — empty-fails invariant (Pattern 3)
- `scripts/verify-punctuation-qg-p7.mjs` — hierarchical cascade (Pattern 4)
- `shared/punctuation/explanation-lint.js` — semantic lint (Pattern 5)
- `scripts/review-punctuation-questions.mjs` — dash-boundary fix (Pattern 6)

## Related

- [Punctuation QG P6 — Production Quality Acceptance Architecture](punctuation-qg-p6-production-quality-acceptance-architecture-2026-04-29.md) — direct predecessor, established self-marking, speech fairness, explanation-as-constant, composable verification
- [Punctuation QG P5 — Production Readiness Attestation](punctuation-qg-p5-production-readiness-attestation-architecture-2026-04-29.md) — originated composable pipeline pattern
- [Punctuation QG P4 — Autonomous Governance](punctuation-qg-p4-autonomous-governance-phase-2026-04-29.md) — established one-command release gate, depth management
- [Punctuation QG P3 — DSL Authoring-Time Normaliser](punctuation-qg-p3-dsl-authoring-time-normaliser-2026-04-28.md) — foundational DSL pattern
- [Grammar QG P8 — Production Marker as Test Oracle](grammar-qg-p8-production-marker-as-test-oracle-2026-04-29.md) — parallel "oracle validation" pattern in grammar domain
