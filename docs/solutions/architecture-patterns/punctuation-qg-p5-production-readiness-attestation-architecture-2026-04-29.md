---
title: Punctuation QG P5 production-readiness attestation architecture
date: 2026-04-29
category: architecture-patterns
module: punctuation-qg
problem_type: architecture_pattern
component: testing_framework
severity: medium
applies_when:
  - A content/question generator engine has reached feature-completeness and needs release-maturity proof
  - Multiple DSL-authored template banks must demonstrate coverage without gaps or silent regressions
  - Telemetry surface needs lifecycle governance (emitted vs reserved vs deprecated signals)
  - Scheduler or sequencing logic derives state from attempt history rather than persisted flags
  - A deployment artefact requires structured provenance metadata for audit traceability
  - Multi-phase projects accumulate verification gates across sprints
tags:
  - production-readiness
  - attestation
  - self-checking-registry
  - telemetry-manifest
  - derivation-over-persistence
  - loop-breaker
  - mode-scoped-dedup
  - deployment-attestation
---

# Punctuation QG P5 production-readiness attestation architecture

## Context

Punctuation QG P4 completed the authoring system — 25/25 DSL families, scheduler maturity, evidence dedup. But P4 was an engineering phase that left validation gaps making production confidence claims hollow:

- 6/25 families lacked golden marking test coverage (silent omission)
- 2/11 telemetry events had no emission proof (aspirational claims)
- Mixed-review scheduling was unreachable in normal sessions (dead code path)
- Sibling-retry lifecycle had no end-to-end test (untested lifecycle)
- No governance for duplicate stems/models before capacity expansion (unreviewed variety)
- Production smoke could not prove which build was tested (unattributed confidence)

P5's contribution is not "more questions" — it is a discipline for making honesty machine-verifiable. The phase establishes that every production-readiness claim must be backed by a structural artefact that CI can check, not by documentation or human memory. This pattern applies to any system transitioning from "feature-complete" to "production-certified".

## Guidance

Seven patterns together form a cohesive production-readiness attestation architecture:

### 1. Self-checking test registry

The test file itself enforces coverage completeness by importing the source-of-truth bank and asserting every entry has corresponding test coverage:

```javascript
// The test imports the production bank — a missing family fails CI
import { GENERATED_TEMPLATE_BANK } from '../generators.js';

const FAMILIES = [ /* ... all tested families ... */ ];

test('all generated families have golden marking tests', () => {
  const bankFamilies = Object.keys(GENERATED_TEMPLATE_BANK);
  const tested = new Set(FAMILIES.map(f => f.name));
  const untested = bankFamilies.filter(f => !tested.has(f));
  assert.deepStrictEqual(untested, [],
    `Missing golden marking for: ${untested.join(', ')}`);
});
```

A new family added to the bank without corresponding tests causes CI failure. The test IS the enforcement mechanism — no code review, documentation, or checklist required.

### 2. Telemetry manifest with lifecycle status

A separate leaf module (zero sibling imports) maps each event to its lifecycle state:

```javascript
// telemetry-manifest.js — ZERO imports (leaf module discipline)
export const PUNCTUATION_TELEMETRY_MANIFEST = Object.freeze({
  GENERATED_SIGNATURE_EXPOSED:       'emitted',
  SCHEDULER_REASON_SELECTED:         'emitted',
  MISCONCEPTION_RETRY_SCHEDULED:     'emitted',
  STAR_EVIDENCE_DEDUPED_BY_TEMPLATE: 'reserved',  // honest: not yet proven
});
```

Drift test bridges the manifest and event-names module without breaking leaf discipline:

```javascript
// test bridges two leaf modules — catches divergence at test time
test('manifest keys match telemetry-events keys', () => {
  const manifestKeys = Object.keys(PUNCTUATION_TELEMETRY_MANIFEST);
  const eventKeys = Object.keys(PUNCTUATION_TELEMETRY_EVENTS);
  assert.deepStrictEqual(manifestKeys.sort(), eventKeys.sort());
});
```

CI can gate on "all `emitted` events have command-path proof" without hardcoding event lists.

### 3. Derivation over persistence

When data exists in a nearby shape, transform at read time rather than persisting it twice:

```javascript
// Zero new storage — derive recentModes from existing attempts
export function deriveRecentModes(progress) {
  if (!Array.isArray(progress?.attempts)) return [];
  return progress.attempts
    .slice(-5)
    .map(a => a.itemMode || a.mode || '')
    .filter(m => m !== '');
}
```

Zero schema change, zero D1 migration, zero dual-write consistency risk. The pattern works because the data already exists in the attempt records — storing it separately would be a second source of truth that could drift.

### 4. Loop-breaker with every() semantics

Prevent infinite retry traps while being conservative about escape:

```javascript
const MISCONCEPTION_RETRY_MAX_ATTEMPTS = 3;

function shouldDemoteRetry(attempts, misconceptionTags) {
  // ALL tags must be exhausted — even one fresh tag allows another retry
  return misconceptionTags.every(tag =>
    consecutiveMisconceptionFailures(attempts, tag) >= MISCONCEPTION_RETRY_MAX_ATTEMPTS
  );
}
```

The `every()` guard maximises retry opportunity (one fresh tag keeps retrying) while guaranteeing eventual escape (all exhausted → demote).

### 5. Mode-scoped duplicate detection

Stems shared across modes (fix vs combine) are NOT duplicates from the learner's perspective:

```javascript
// Cluster ONLY within same mode — cross-mode overlap excluded
function groupDuplicatesByMode(items) {
  const clusters = new Map();
  for (const item of items) {
    const key = `${normaliseAuditText(item.stem)}::${item.mode}`;
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(item);
  }
  return [...clusters.entries()]
    .filter(([, group]) => group.length > 1);
}
```

Without mode-scoping, legitimate cross-mode reuse looks like duplication and false-blocks capacity raises.

### 6. Deployment attestation as structured artefact

Production smoke outputs JSON with provenance metadata answering "which build was tested?":

```javascript
const attestation = {
  environment: 'production',
  releaseId: 'punctuation-r4-full-14-skill-structure',
  runtimeItemCount: 192,
  generatedDepth: 4,
  workerCommitSha: commitSha || null,
  timestamp: new Date().toISOString(),
  authenticatedCoverage: false,  // explicit, not silently omitted
  adminHubCoverage: false,
};
```

### 7. Verification as composable pipeline

Gates are additive across phases — later phases add gates, never remove them:

```javascript
// P5 adds 3 gates to P4's 7-gate pipeline = 10 total
const P5_GATES = [
  ...P4_GATES,  // preserved — never removed
  'telemetry-command-path',
  'learning-health-report',
  'deployment-attestation',
];
```

## Why This Matters

Engineering phases deliver functionality; certification phases deliver confidence. Without structural enforcement, claims rot:

1. **Self-checking registries** eliminate the "forgot to add a test" class of regression entirely. No human inspection needed.
2. **Telemetry manifests** separate "we intend to emit this" from "we have proof this fires" — health dashboards distinguish honest claims from aspirational ones programmatically.
3. **Derivation over persistence** avoids dual-write consistency bugs and schema migrations. If the data exists nearby, transforming it is cheaper and safer.
4. **Loop-breakers with conservative semantics** prevent learner traps while minimising false escapes. The `every()` pattern ensures maximum retry opportunity before giving up.
5. **Mode-scoped clustering** prevents false-positive capacity blocks. Without scope awareness, legitimate cross-mode reuse looks like duplication.
6. **Structured deployment attestation** makes "what did we actually test?" answerable by machines, not humans scrolling logs.
7. **Composable pipelines** let each phase contribute gates without awareness of all other gates. Confidence monotonically increases across phases.

## When to Apply

- A feature is "code-complete" but production confidence is unclear — add self-checking registries
- Adding new content families/categories where each must have corresponding validation — use the bank-import assertion pattern
- Telemetry events exist in code but emission proof is missing — introduce a lifecycle manifest
- Data needed for a decision exists in adjacent records — derive at read time, do not persist separately
- Retry/loop mechanics risk trapping users — add loop-breakers with conservative (`every()`) escape semantics
- Duplicate detection crosses logical boundaries (modes, subjects, tenants) — scope clustering to the relevant partition
- CI passes but nobody can say which build was deployed — add structured attestation artefacts
- Multi-phase projects accumulate verification gates — use additive-only composable pipelines
- Transitioning from "engineering sprint" to "production certification sprint" — apply all seven patterns as a cohesive discipline

## Examples

### Before: Silent coverage gap

```javascript
// generators.js adds new family
export const GENERATED_TEMPLATE_BANK = {
  'apostrophe-possession': [...],
  'comma-list': [...],
  'ellipsis-suspense': [...],  // NEW — no test exists
};

// golden-marking.test.js — tests only what developer remembered
test('apostrophe-possession marking', () => { /* ... */ });
test('comma-list marking', () => { /* ... */ });
// ellipsis-suspense silently untested — CI green
```

### After: Self-enforcing registry

```javascript
// golden-marking.test.js — structural enforcement
import { GENERATED_TEMPLATE_BANK } from '../generators.js';
const TESTED = new Set(['apostrophe-possession', 'comma-list']);

test('all families covered', () => {
  const untested = Object.keys(GENERATED_TEMPLATE_BANK)
    .filter(f => !TESTED.has(f));
  assert.deepStrictEqual(untested, []);
  // FAILS: ['ellipsis-suspense'] — must add test before merge
});
```

### Before: Aspirational telemetry

```javascript
// 11 events declared; only 9 actually emit. No way to tell which.
export const EVENT_NAMES = [
  'punctuation.generated_signature_exposed',  // listed but never emitted
  'punctuation.star_evidence_deduped_by_template',  // planned, not real
  // ...
];
// Report says "11 telemetry events" — misleading
```

### After: Manifest with lifecycle proof

```javascript
export const TELEMETRY_MANIFEST = Object.freeze({
  GENERATED_SIGNATURE_EXPOSED:       'emitted',   // command-path test proves it
  STAR_EVIDENCE_DEDUPED_BY_TEMPLATE: 'reserved',  // honest: not yet proven
});
// Report says "10 emitted (proven), 1 reserved" — truthful
```

## Related

- [Grammar QG P5 machine-verifiable content release](grammar-qg-p5-machine-verifiable-content-release-process-2026-04-28.md) — originator of the machine-verifiable release pattern that P5 attestation extends
- [Punctuation QG P4 autonomous governance phase](punctuation-qg-p4-autonomous-governance-phase-2026-04-29.md) — direct predecessor establishing full DSL, scheduler maturity, evidence dedup
- [Punctuation QG P3 DSL authoring-time normaliser](punctuation-qg-p3-dsl-authoring-time-normaliser-2026-04-28.md) — DSL foundation and golden marking test architecture
- [Grammar QG P6 calibration telemetry architecture](grammar-qg-p6-calibration-telemetry-architecture-2026-04-29.md) — parallel telemetry manifest lifecycle and self-healing governance
- [Sys-Hardening P5 certification closure](sys-hardening-p5-certification-closure-d1-latency-and-evidence-culture-2026-04-28.md) — evidence-driven certification gates and evidence culture enforcement
- [Autonomous certification phase wave execution](../workflow-issues/autonomous-certification-phase-wave-execution-2026-04-27.md) — production-readiness certification methodology
