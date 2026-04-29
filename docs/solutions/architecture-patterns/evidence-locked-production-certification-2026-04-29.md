---
title: Evidence-Locked Production Certification Pattern
date: 2026-04-29
category: architecture-patterns
module: grammar-question-generator
problem_type: architecture_pattern
component: testing_framework
severity: high
applies_when:
  - Building multi-phase certification pipelines where claims must be machine-verifiable
  - Verifying production readiness from committed artefacts alone
  - Content systems with learner safety requirements
  - Any system where new entries must be explicitly approved before serving
  - Review workflows where auto-generation assists but must not replace genuine review
tags:
  - evidence-as-code
  - certification
  - fail-closed
  - production-quality
  - machine-verifiable
  - manifest-driven
  - additive-serialisation
  - cumulative-verify
---

# Evidence-Locked Production Certification Pattern

## Context

Grammar QG P8 achieved production certification with 3,148 tests, but "CERTIFIED" was a human declaration in a markdown report. Nothing in the committed codebase prevented a report from claiming certification while evidence artefacts were missing, incomplete, or contradictory. The review register contained auto-generated "adult review confirmed" notes. The inventory claimed 2,340 items but committed only 234. Oracle seed windows were reported as uniform when they were mixed.

The gap: claims lived in prose, proof lived (or did not live) in code, and no gate enforced correspondence between them.

P5 established machine-verifiable release gates (see `grammar-qg-p5-machine-verifiable-content-release-process-2026-04-28.md`). P9 extends that foundation with a manifest-driven, fail-closed architecture that makes it impossible for claims to exceed evidence.

## Guidance

### Core Principle

Certification is a **derivable property of committed artefacts**, not a declared status. A single manifest JSON is the source of truth. All other artefacts exist to satisfy the manifest's claims. A validator rejects any mismatch.

### Sub-Pattern 1: Manifest → Validator → Report Gate

The certification manifest declares what evidence must exist:

```json
{
  "contentReleaseId": "grammar-qg-p9-2026-04-29",
  "templateDenominator": 78,
  "seedWindowPerEvidenceType": {
    "selected-response-oracle": "1..15",
    "constructed-response-oracle": "1..10",
    "manual-review-oracle": "1..5",
    "content-quality-audit": "1..30"
  },
  "expectedItemCount": 2340,
  "expectedOutputPaths": [
    "reports/grammar/grammar-qg-p9-question-inventory.json",
    "reports/grammar/grammar-qg-p9-question-inventory-redacted.md"
  ]
}
```

The validator loads the manifest and cross-checks every claim:

```js
function validateReportAgainstManifest(reportContent, manifest) {
  // Reject uniform claims when windows differ
  if (reportClaimsUniformSeeds(reportContent, 30)) {
    for (const [family, window] of Object.entries(manifest.seedWindowPerEvidenceType)) {
      const actualMax = parseSeedWindow(window).max;
      if (actualMax < 30) return fail(`${family} only covers ${actualMax} seeds`);
    }
  }
  // Validate item count matches
  const inventory = loadJSON(manifest.expectedOutputPaths[0]);
  if (inventory.length !== manifest.expectedItemCount)
    return fail(`Inventory has ${inventory.length}, manifest claims ${manifest.expectedItemCount}`);
}
```

### Sub-Pattern 2: Fail-Closed Scheduler Safety

Unknown templates default to blocked. New content added to metadata without a certification map entry never reaches learners.

```js
function isTemplateBlocked(templateId) {
  const entry = CERTIFICATION_STATUS_MAP[templateId];
  // Unknown = blocked (fail-closed, not fail-open)
  if (!entry) return true;
  return entry.status === 'blocked';
}

// In scheduler
const candidates = templates.filter(t => !isTemplateBlocked(t.id));
```

### Sub-Pattern 3: Honest Over-Claiming Rejection

Rather than expanding all oracles to a uniform window (expensive), honestly report mixed windows and build a validator that catches dishonest uniformity claims.

```js
// "All 78 templates × 30 seeds pass" is rejected
// when selected-response only uses seeds 1-15
if (reportClaims("all 78 × 30 seeds pass automated oracles")) {
  for (const family of manifest.oracleFamilies) {
    if (family.actualMax < 30)
      return fail(`${family.name}: claims 30 but uses ${family.actualMax}`);
  }
}
// Per-family breakdown with honest numbers → passes
```

### Sub-Pattern 4: Draft/Finalise Review Evidence

Auto-generated review registers cannot pass certification. The generator produces drafts; finalisation validates real reviewer metadata.

```js
// Draft mode → pending_review entries
function buildDraft(templates) {
  return templates.map(t => ({
    templateId: t.id, status: 'pending_review',
    reviewer: null, method: null, notes: null
  }));
}

// Finalise mode → rejects auto-fill
function validateFinalised(register) {
  const allNotes = register.map(e => e.notes);
  if (new Set(allNotes).size === 1 && register.length > 10)
    fail('All entries have identical notes — likely auto-generated');
  for (const entry of register) {
    if (entry.status === 'accepted' && (!entry.reviewer || !entry.method))
      fail(`${entry.templateId}: accepted without reviewer metadata`);
  }
}
```

### Sub-Pattern 5: Additive Serialisation Contract

Content release ID bumps when serialisation changes, but changes are additive. Existing fields preserved; clients that don't understand new fields ignore them.

```js
// Before (release P8): { promptText: "Choose the underlined word." }
// After  (release P9): {
//   promptText: "Choose the underlined word.",  ← preserved
//   promptParts: [{ kind: 'text', text: 'Choose the ' },
//                 { kind: 'underline', text: 'underlined word' }],
//   focusCue: { type: 'underline', text: 'underlined word' }
// }
```

### Sub-Pattern 6: Cumulative Verify Chain

Each phase chains its predecessor. Regression at any depth fails the entire gate.

```bash
# verify:grammar-qg-p9 → verify:grammar-qg-p8 → verify:grammar-qg-p7 → verify:grammar-qg-p6
# Total: 4,141 tests across 4 phases
npm run verify:grammar-qg-p9
```

## Why This Matters

Without evidence-as-code:

- **Certification claims rot silently** — a report says "CERTIFIED" months after templates changed, with no gate catching drift
- **Reports contradict code** — "all 78 templates reviewed" while register has 72 entries
- **Uncertified content reaches learners** — new template lands without certification entry; scheduler serves it immediately
- **Review evidence is fabricated** — auto-generated registers pass because nobody checks for identical boilerplate
- **Regression hides** — P9 passes while P7 invariants are broken, because each phase checks itself rather than chaining
- **Seed coverage is dishonest** — claiming "30 seeds tested" across all families when some only support 15

## When to Apply

- Building multi-phase certification pipelines for content quality (each phase must chain and not regress prior phases)
- Any system where "production ready" needs to be machine-verifiable from committed artefacts alone
- Question generators or content systems with learner safety requirements (wrong content reaching a child is S0)
- Content catalogues where new entries arrive continuously and must be explicitly approved before serving
- Review workflows where auto-generation assists humans but must not replace genuine review
- Systems that need honest reporting about partial coverage (mixed seed windows, incomplete evidence)

## Examples

### Complete Certification Flow

```
1. Generate manifest (single source of truth)
2. Generate inventory (78 templates × 30 seeds = 2,340 items)
3. Run oracles (per-family seed windows, honestly reported)
4. Generate draft review register → human reviews → finalise
5. Build certification status map (all approved, or specific blocks)
6. Run cumulative verify chain (P6→P7→P8→P9)
7. Write report (validator rejects claims exceeding evidence)
8. Scheduler reads status map (fail-closed for unknown templates)
```

### Certification Decision States

```
NOT_CERTIFIED           ← S0/S1 issues remain or evidence missing
CERTIFIED_WITH_LIMITATIONS ← gates pass but deployment smoke or manual UX gaps exist
CERTIFIED_PRE_DEPLOY    ← all repo-local evidence valid; smoke not yet run
CERTIFIED_POST_DEPLOY   ← pre-deploy + attached production smoke evidence
```

### CI Integration

```json
{
  "verify:grammar-qg-p9": "npm run verify:grammar-qg-p8 && node --test tests/grammar-qg-p9-*.test.js"
}
```

## Related

- `docs/solutions/architecture-patterns/grammar-qg-p5-machine-verifiable-content-release-process-2026-04-28.md` — P5 established machine-verifiable release gates; P9 adds manifest-driven evidence locking
- `docs/solutions/architecture-patterns/grammar-qg-p8-production-marker-as-test-oracle-2026-04-29.md` — P8 quality oracle pattern that P9 extends with honest seed-window reporting
- `docs/solutions/architecture-patterns/punctuation-qg-p5-production-readiness-attestation-architecture-2026-04-29.md` — Seven-pattern attestation discipline; P9's evidence-locking is the logical successor
- `docs/solutions/architecture-patterns/sys-hardening-p5-certification-closure-d1-latency-and-evidence-culture-2026-04-28.md` — Evidence schema v2 and honest failure recording
- `docs/solutions/workflow-issues/autonomous-certification-phase-wave-execution-2026-04-27.md` — Parallel execution governance used during P9 implementation
