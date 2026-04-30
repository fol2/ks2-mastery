---
title: Grammar QG P11 — Production Readiness Certification Patterns
date: 2026-04-30
category: architecture-patterns
module: grammar-question-generator
problem_type: architecture_pattern
component: testing_framework
severity: high
applies_when:
  - content release ID bumps propagate across multiple test/evidence files
  - evidence validators must cross-reference multiple release phases
  - accessibility copy depends on question-kind metadata not yet propagated
  - generated output produces systematic punctuation bugs across templates
  - cumulative verify chains span more than three release phases
  - test assertions validate error messages that interpolate constant values
tags:
  - certification
  - evidence-validation
  - prompt-cue
  - semantic-resolver
  - conditional-punctuation
  - release-id-propagation
  - cumulative-verify-chain
  - accessibility-metadata
  - production-readiness
  - question-generator
---

# Grammar QG P11 — Production Readiness Certification Patterns

## Context

After Grammar QG P10 achieved `CERTIFIED_PRE_DEPLOY` with 78 templates and 659 tests, the move toward production deployment revealed 3 S1 learner-surface bugs and 5 S2 evidence-truth gaps. These were invisible to the P10 certification because the audit layer only checked *structural presence* of fields, not *semantic correctness* of values. A grammar label like "adverbs" passes a "field is non-empty string" check while being entirely wrong as a target sentence.

The fixes required 8 PRs with ~950 new tests and two rounds of 10-reviewer independent contract validation. Seven architectural patterns emerged that are transferable to any content-generation pipeline with versioned releases, accessibility contracts, and evidence-gated deployment.

## Guidance

### 1. Release ID Bump Propagation — Pin Evidence to Frozen Strings

Phase-specific evidence tests must never import the live release ID constant. When the constant bumps for the next phase, all prior evidence tests silently validate against the wrong baseline.

```javascript
// WRONG — breaks when the next phase bumps the constant
import { GRAMMAR_CONTENT_RELEASE_ID } from '../content.js';
assert.equal(manifest.releaseId, GRAMMAR_CONTENT_RELEASE_ID);

// CORRECT — pinned to the phase that produced this evidence
const P10_RELEASE_ID = 'grammar-qg-p10-2026-04-29';
assert.equal(manifest.releaseId, P10_RELEASE_ID);
```

The evidence validator CLI accepts `--expected-release=ID` for validating historical manifests after a bump has occurred. The `verify:grammar-qg-production-release` command passes the correct phase-specific ID.

### 2. Semantic vs Structural Audit Separation

Run both audit types. Structural audits confirm shape; semantic audits confirm meaning.

A structural audit checks "does `focusCue.targetText` exist and have length > 0?" — passes for "adverbs". A semantic audit checks "is `focusCue.targetText` a real sentence?" — catches the grammar-label-as-target bug class.

Seven semantic checks were added for P11:
- `target-sentence-no-real-sentence` — null or short targetText
- `target-text-is-grammar-label` — regex match against known labels
- `screen-reader-announces-grammar-label` — accessibility text contains raw labels
- `read-aloud-kind-mismatch` — says "word" when targetKind is "noun-phrase"
- `read-aloud-double-punctuation` — ends with `[.!?]{2,}`
- `prompt-parts-missing-sentence` — sentence resolved but not in promptParts
- `dead-check-detection` — any check matching zero templates is itself a bug

### 3. Conditional Punctuation — Class-Level Guard

Eliminate an entire defect class with a single guard at the generation boundary:

```javascript
const needsDot = !/[.!?]$/.test(word.trim());
const dot = needsDot ? '.' : '';
question.readAloudText = `${prefix} The sentence is: ${word}${dot}`;
```

Validated across 838 items over 100 seeds with zero failures. Future templates automatically inherit the protection without per-template fixes.

### 4. Paragraph-Block Resolver for Target Extraction

Replace heuristic extraction (first `<strong>` content) with semantic resolution using defence-in-depth filtering:

```javascript
function resolveTargetSentence(question) {
  // Explicit field check first
  if (question.targetSentence && isSentenceCueCandidate(question.targetSentence))
    return question.targetSentence;
  // Paragraph block scan — reverse for last qualifying candidate
  const blocks = extractParagraphTextBlocks(question.stemHtml);
  return [...blocks].reverse().find(isSentenceCueCandidate) || null;
}

function isSentenceCueCandidate(text) {
  if (text.length < 16) return false;          // Filter 1: minimum length
  if (!/\s/.test(text)) return false;          // Filter 2: must contain whitespace
  if (!/[.!?]/.test(text) && !text.includes('___')) return false; // Filter 3: punctuation
  if (/^(subject|object|adverbs?|determiners?|pronouns?|conjunctions?)$/i.test(text))
    return false;                               // Filter 4: reject grammar labels
  return true;
}
```

Grammar labels fail on Filter 1 (length < 16) before subsequent filters fire. Defence-in-depth means a bug must defeat all four filters to reach the learner — probability of escape is multiplicative.

### 5. Explicit targetKind Metadata for Accessibility

Make accessibility phrasing deterministic by serialising the target's semantic type:

```javascript
focusCue: {
  type: 'underline',
  targetKind: 'noun-phrase',  // 'word'|'noun-phrase'|'group'|'pair'|'sentence'
  targetText: 'The trophy',
  targetOccurrence: 1
}
```

The accessibility layer reads `targetKind` directly to select phrasing ("The underlined noun phrase is:" vs "The underlined word is:") rather than inferring from the cue type. This prevents regression when new cue targets are added.

### 6. Evidence-Gated Status Enforcement

Define production smoke evidence as a fixed-field schema and enforce that certification status is forbidden when evidence is absent — as a TEST, not a documented constraint:

```javascript
it('CERTIFIED_POST_DEPLOY is forbidden when smoke evidence file is absent', () => {
  const fileExists = fs.existsSync(expectedPath);
  const reportContent = fs.readFileSync(reportPath, 'utf8');
  const statusMatch = reportContent.match(/^status:\s*(.+)$/m);
  const reportStatus = statusMatch ? statusMatch[1].trim() : '';
  if (!fileExists) {
    assert.notEqual(reportStatus, 'CERTIFIED_POST_DEPLOY');
  }
});
```

Without test enforcement, humans can manually set `CERTIFIED_POST_DEPLOY` before evidence exists, creating a certification gap.

### 7. Assertion Identity Matching — Match Values, Not Identifiers

When a validator interpolates a constant's VALUE into an error message, test assertions must match the runtime output:

```javascript
// WRONG — matches the constant's identifier name (never appears in output)
assert.match(result.message, /GRAMMAR_CONTENT_RELEASE_ID/);

// CORRECT — matches the interpolated value the user/system actually sees
assert.match(result.message, /grammar-qg-p11-2026-04-30/);
```

## Why This Matters

- **Release ID propagation**: Without pinning, a single version bump silently invalidates all historical evidence — the certification trail becomes meaningless.
- **Semantic audits**: Structural-only checks create false confidence. P10's audit passed 78/78 templates while 3 had learner-visible bugs (children heard "Sentence: adverbs" instead of the actual sentence).
- **Class-level fixes**: Fixing N templates individually creates N+1 regression surfaces; a single guard at the generation boundary eliminates the class permanently.
- **Defence-in-depth extraction**: Multiple independent filters mean a new bug must defeat all four to reach the learner.
- **Explicit metadata**: Inference-based accessibility breaks silently when the inference premise changes; explicit typing makes breakage loud and immediate.
- **Evidence-gated status**: Without enforcement, status can drift from truth. A test is a gate; a comment is a suggestion.
- **Value-matching assertions**: Tests that match identifier names instead of runtime values are dead checks — they pass regardless of the validator's actual output.

## When to Apply

- **Release ID pinning**: Any test validating evidence from a specific phase/release. Apply when writing the evidence test, not retroactively.
- **Dual audit layers**: Any content pipeline where fields are machine-generated. If you only have structural checks, add semantic checks before promoting to production.
- **Class-level guards**: When you find the same defect pattern in 3+ templates. Stop fixing individually; place one guard at the generation boundary.
- **Semantic target resolution**: Any template system extracting display text from rich HTML. Heuristic extraction (first regex match) always eventually breaks.
- **Explicit targetKind**: Any system where downstream consumers need to know the semantic type of a value, not just its string content.
- **Evidence-gated status**: Any project using certification milestones. The gate must be a test, not a documented constraint.
- **Value-matching assertions**: Any test validating error messages or logs that interpolate constants. Match what the system produces, not what the source code says.

## Examples

### Before/After: Grammar Label as Target (P10 → P11)

**Before** — heuristic extraction, structural audit passes:
```
HTML: <p><strong>adverbs</strong></p><p>Nina carefully packed the glass vase.</p>
Extraction: first <strong> → "adverbs"
Learner hears: "The sentence is: adverbs."
Structural audit: ✓ (targetText is non-empty)
```

**After** — paragraph-block resolver, semantic audit:
```
Resolver: "adverbs" fails length filter (7 < 16) → scan continues
          "Nina carefully packed the glass vase." passes all 4 filters → selected
Learner hears: "The sentence is: Nina carefully packed the glass vase."
Semantic audit: ✓ (no grammar labels, no double punctuation)
```

### Before/After: Evidence Test Breakage on Bump

**Before** — imports live constant:
```
P11 deploys → constant = 'grammar-qg-p11-2026-04-30'
P12 starts  → constant = 'grammar-qg-p12-2026-05-01'
P11 test: imports constant → expects p12 in p11 manifest → FAILS
```

**After** — frozen string:
```
P11 test: pins P11_RELEASE_ID = 'grammar-qg-p11-2026-04-30'
P12 bumps constant, but P11 test unaffected → PASSES forever
```

## Related

- [Evidence Quality over Evidence Existence (P10)](grammar-qg-p10-evidence-quality-over-existence-2026-04-29.md) — predecessor pattern; P11 extends with semantic audits
- [Evidence-Locked Production Certification](evidence-locked-production-certification-2026-04-29.md) — manifest-driven certification framework P11 inherits
- [Machine-Verifiable Content Release (P5)](grammar-qg-p5-machine-verifiable-content-release-process-2026-04-28.md) — deep-seed expansion and production smoke evidence patterns
- [Production Marker as Test Oracle (P8)](grammar-qg-p8-production-marker-as-test-oracle-2026-04-29.md) — using markByAnswerSpec() as quality oracle
- [Punctuation QG P8 Production Certification](punctuation-qg-p8-production-quality-certification-2026-04-30.md) — parallel QG with transferable patterns
