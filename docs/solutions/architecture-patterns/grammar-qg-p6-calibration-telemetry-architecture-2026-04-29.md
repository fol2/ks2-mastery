---
title: "Grammar QG P6 — Calibration Telemetry and Shadow-Mode Evidence Weights"
date: 2026-04-29
category: architecture-patterns
module: grammar-qg
problem_type: architecture_pattern
component: tooling
severity: medium
applies_when:
  - "Adding observability to a proven deterministic pipeline without destabilising it"
  - "Effectiveness metrics need accumulation time before they can be trusted"
  - "Privacy constraints forbid raw timing or behavioural telemetry"
  - "Mixed-transfer or cross-concept evidence weights need validation before production promotion"
tags:
  - grammar
  - question-generator
  - calibration
  - telemetry
  - shadow-mode
  - event-enrichment
  - mixed-transfer
  - retention
---

# Grammar QG P6 — Calibration Telemetry and Shadow-Mode Evidence Weights

## Context

Grammar Question Generator phases P1–P5 established deterministic correctness: reproducible question selection via seeded PRNG, strict repeat prevention via variant signatures, deep-seed expansion for small banks, and machine-verifiable release governance with frozen baselines. With correctness proven (132 frozen baseline tests, zero deep-seed repeats, zero signature collisions), P6 pivots to answering *effectiveness* questions:

- Which templates are too easy, too hard, ambiguous, or support-dependent?
- Do secure concepts stay retained after time passes?
- Are mixed-transfer templates genuinely measuring cross-concept transfer or over-inflating mastery nodes?

The challenge: add observability without introducing new pipelines, production mutations, privacy-eroding telemetry, or runtime overhead. The solution is **event enrichment** plus **script-only analytics in shadow mode**.

## Guidance

### 1. Enrich the existing event — never fork the pipeline

Rather than introducing new event types (`grammar.calibration-tick`, `grammar.telemetry-snapshot`) that require new consumers, schema registrations, and failure modes, extend the event that already flows through proven infrastructure.

The `grammar.answer-submitted` event already carried 15 fields (templateId, variantSignature, supportLevel, correct, etc.). P6 adds six calibration fields to the same event:

```js
{
  // ... existing fields unchanged ...
  tags: ['qg-p4', 'mixed-transfer'],
  answerSpecKind: 'multiField',
  elapsedMsBucket: '5-10s',
  wasRetry: false,
  conceptStatusBefore: { relative_clauses: 'secured', subordination: 'due' },
  conceptStatusAfter:  { relative_clauses: 'secured', subordination: 'secured' }
}
```

No new event types. No new D1 tables. No new worker routes. No new consumer deployments that can drift.

### 2. Script-only analytics — prove before promoting

All calibration analysis is Node.js scripts producing JSON/Markdown reports. None import mastery-write functions:

```
scripts/grammar-qg-health-report.mjs          → reports/grammar/health-report.json
scripts/grammar-qg-mixed-transfer-calibration.mjs → reports/grammar/mixed-transfer.json
scripts/grammar-qg-retention-monitor.mjs       → reports/grammar/retention.json
```

The mixed-transfer calibration computes suggested evidence weights but writes them only as report columns:

```js
function suggestEvidenceWeight({ localPrerequisitesMetRate, successRate, independentRate }) {
  if (localPrerequisitesMetRate <= 0.5) return 'none';
  if (successRate < 0.5) return 'light';
  if (successRate > 0.8 && independentRate > 0.7) return 'strong';
  return 'normal';
}
```

Promotion to production scoring requires a future phase with its own frozen baselines.

### 3. conceptStatusBefore as Object with graceful degradation

The engine emits per-concept status as an Object keyed by concept ID. Analytics scripts use a helper to handle both legacy string form and P6+ Object form:

```js
function getConceptStatus(csb, conceptId) {
  if (typeof csb === 'string') return csb;
  if (csb && typeof csb === 'object') return csb[conceptId] || 'new';
  return 'new';
}
```

This permits analytics to process the entire event history from P1 onwards without data migration.

### 4. Future-proof governance via regex predicate

Hard-coded tag lists silently exclude future phases from strict repeat detection. Replace with a regex:

```js
// Before: governance gap when P6 ships (missed qg-p5)
const isStrict = t => t.tags.some(tag =>
  ['qg-p1','qg-p3','qg-p4'].includes(tag));

// After: any qg-pN tag triggers strict detection automatically
const isStrict = t => t.tags.some(tag => /^qg-p\d+$/.test(tag));
```

### 5. Privacy-preserving elapsed-time bucketing

Five coarse bands instead of raw milliseconds — provides difficulty calibration signal without leaking device fingerprints:

```js
function bucketElapsedMs(ms) {
  if (ms == null || ms < 0) return null;
  if (ms < 2000) return '<2s';
  if (ms < 5000) return '2-5s';
  if (ms < 10000) return '5-10s';
  if (ms < 20000) return '10-20s';
  return '>20s';
}
```

Schema placeholder (null) permits phased rollout — P6 validates the schema, P7 plumbs the client timer.

### 6. Release ID bumps only for learner-facing content

Telemetry schema additions, analytics scripts, and validation logic do NOT bump the content release ID. Only learner-facing changes (feedback wording, question text) do:

```
grammar-qg-p5-2026-04-28  →  (no bump for telemetry schema)
                           →  (no bump for analytics scripts)
grammar-qg-p6-2026-04-29  →  bumped for feedback wording fixes only
```

### 7. Template triage classification system

Eight health categories drive operator recommendations without auto-retiring content:

| Classification | Trigger | Action |
|---|---|---|
| `healthy` | 60–95% independent success | Keep |
| `too_easy` | >95% success AND <2s timing | Reserve for warm-up |
| `too_hard` | <40% independent success | Improve or lower placement |
| `ambiguous` | >40% wrong-after-support | Review wording |
| `support_dependent` | >80% supported, <50% independent | Improve teaching bridge |
| `retry_effective` | >70% retry success | Keep as repair candidate |
| `retry_ineffective` | <30% retry success | Rewrite or retire |
| `transfer_gap` | High local, low transfer | Add bridge practice |

Confidence gating: `high` (>100 attempts), `medium` (30–100), `low` (10–30), `insufficient_data` (<10). Recommendations are never auto-actioned in the same phase that introduces them.

## Why This Matters

1. **Zero new failure modes** — No new event types means no new dead-letter queues, no new consumer deployments, no new schema validation paths that can drift.

2. **Prove before promoting** — Shadow-mode evidence weights accumulate confidence without risking learner mastery state. A bad formula costs nothing when it lives in a JSON report.

3. **Backward-compatible analytics** — The `getConceptStatus` helper means P6 analytics can reprocess the entire event history without data migration or backfill jobs.

4. **Self-healing governance** — The regex predicate means P7, P8, and beyond automatically inherit strict repeat detection without human remembering to update a list.

5. **Privacy by design** — Coarse time bands and null placeholders mean the schema is safe to ship before the client timer exists, and safe to analyse without leaking device fingerprints.

6. **Additive regression safety** — Stacking frozen baselines (P5: 132 tests + P6: 199 tests) means every phase proves it does not regress any prior phase.

## When to Apply

**Apply when:**
- You have a proven deterministic pipeline and want observability without destabilisation
- Effectiveness metrics need weeks of accumulation before they can be trusted
- Privacy constraints forbid raw timing or behavioural telemetry in analytics
- Multiple stakeholders need different report views from the same event data
- The system distinguishes content changes from tooling changes in its release model

**Do NOT apply when:**
- The pipeline is not yet proven correct (fix correctness first, measure effectiveness second)
- Real-time alerting is required (script-only analytics are batch, not streaming)
- The event payload is near platform size limits (D1 row size, KV value limits)
- You need production mutations from calibration data (that requires a promotion phase with its own baselines)

## Examples

### Anti-pattern: Forked telemetry pipeline with immediate mutation

```js
// NEW event type — new consumer, new schema, new failure mode
await emitEvent('grammar.calibration-tick', {
  templateId, difficulty: computeDifficulty(stats),
  evidenceWeight: computeWeight(transfer)
});

// Mutates mastery based on unproven formula
router.post('/calibration/ingest', async (ctx) => {
  await updateMasteryWeight(row.conceptId, row.evidenceWeight);
});
```

Problems: new pipeline to monitor, unproven formula mutating production, no shadow period, no regression baseline.

### P6 pattern: Event enrichment + shadow analytics

```js
// EXISTING event type — proven consumer, proven schema path
events.push({
  ...existingFields,
  tags: template.tags,
  answerSpecKind: template.answerSpecKind,
  elapsedMsBucket: bucketElapsedMs(clientMs),
  wasRetry: attempts > 1,
  conceptStatusBefore: statusMap,
  conceptStatusAfter: updatedStatusMap
});

// Script-only analysis — runs offline, produces reports
const report = events
  .filter(e => e.tags?.some(t => /^qg-p\d+$/.test(t)))
  .reduce(buildTransferMatrix, new Map());

writeFileSync('reports/grammar/transfer-evidence.json', JSON.stringify(report));
```

The formula earns trust in reports. Promotion happens in a future phase with its own baselines.

## Related

- **Direct predecessor:** `docs/solutions/architecture-patterns/grammar-qg-p5-machine-verifiable-content-release-process-2026-04-28.md` — P5's one-command release gate, frozen fixture strategy, and content-quality linting extended by P6 with `verify:grammar-qg-p6`
- **Event architecture foundation:** `docs/solutions/architecture-patterns/grammar-p6-star-derivation-trust-and-server-owned-persistence-2026-04-27.md` — P6 telemetry enriches the `grammar.answer-submitted` event established by Grammar Phase 6's command-handler boundary
- **Redaction and debug model:** `docs/solutions/architecture-patterns/grammar-p7-quality-trust-consolidation-and-autonomous-sdlc-2026-04-27.md` — P7's redacted debug model and deterministic event IDs inform P6's telemetry redaction contract
- **Evidence culture:** `docs/solutions/architecture-patterns/sys-hardening-p5-certification-closure-d1-latency-and-evidence-culture-2026-04-28.md` — D1 tail latency awareness and evidence-artefact provenance for telemetry write tolerance
- **Cross-module sibling:** `docs/solutions/architecture-patterns/punctuation-qg-p3-dsl-authoring-time-normaliser-2026-04-28.md` — characterisation-first testing discipline applied by both Punctuation QG P3 and Grammar QG P6
- **pickBySeed preservation:** `docs/solutions/logic-errors/seeded-prng-index-collision-pickbyseed-2026-04-28.md` — double-modulo selection pattern preserved; P6 does not modify selection logic
- **Same-day parallel:** `docs/solutions/architecture-patterns/admin-console-p6-evidence-integrity-content-ops-maturity-2026-04-29.md` — evidence overclaiming structural impossibility parallels P6's "no scoring mutations" boundary
- **Implementation PR:** https://github.com/fol2/ks2-mastery/pull/562
