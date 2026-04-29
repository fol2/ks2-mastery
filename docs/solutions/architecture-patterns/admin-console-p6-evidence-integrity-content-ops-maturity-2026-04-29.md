---
title: Admin Console P6 — Evidence Integrity, Defence-in-Depth Redaction, and Content Operations Maturity
date: 2026-04-29
category: architecture-patterns
module: admin-ops-console
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - Extending the Admin Console with new evidence, content, or asset surfaces
  - Adding new copy/export buttons that must redact sensitive data
  - Onboarding new asset types to the registry
  - Modifying panel freshness or state contracts
  - Executing hardening phases with no-regression constraints
tags:
  - admin-console
  - evidence-integrity
  - safe-copy
  - redaction
  - panel-freshness
  - content-operations
  - asset-registry
  - characterisation-first
  - defence-in-depth
---

# Admin Console P6 — Evidence Integrity, Defence-in-Depth Redaction, and Content Operations Maturity

## Context

P5 established the Admin Console's infrastructure modules (AdminPanelFrame, safe-copy, action classification, evidence taxonomy) but left truth gaps: the evidence summary was empty, string inputs bypassed redaction, ops-role browser proof was a fixme, and Content/Asset sections were shells without operational depth. P6 was contracted to close these gaps without expanding into billing, permissions, or reward/live-ops bloat.

The "no regression" constraint required characterisation-first execution throughout — 237 tests pinning existing behaviour before any production code changed.

## Guidance

### 1. Defence-in-Depth Redaction Architecture

The safe-copy framework now applies **two independent redaction layers** for object inputs:

1. **Object-level key walkers** — recursive traversal that catches canonical key names (`email`, `accountId`, `learnerId`, `internalNotes`, `stack`, `requestBody`)
2. **String-level regex final pass** — `redactString()` applied to the serialised JSON output catches PII in non-canonical keys (e.g. `contactEmail`, `creatorAccountId`)

The string path caps at OPS_SAFE-level patterns (emails, IDs, auth tokens) for the object path because PARENT_SAFE patterns like stack-trace detection false-positive on JSON-serialised content (e.g. `"at this interesting result"` matches stack-trace regex).

**Key pattern:** when adding new copy buttons, always route through `prepareSafeCopy(data, audience)` — the CI gate structurally prevents bypass. For string inputs (human summaries, diagnostic text), the framework now handles them defensively without the caller needing to know.

### 2. Evidence Overclaiming is Structurally Impossible

The closed 9-state taxonomy (`EVIDENCE_STATES`) with `NOT_AVAILABLE` as the default means:
- Missing source files → `NOT_AVAILABLE` (generator never crashes)
- Stale data (>24h) → `STALE`
- Failing runs → `FAILING` (never softened to green)
- Unknown metric keys → `UNKNOWN` (cannot accidentally classify as certified)

New evidence dimensions register in the generator's source-reader list. The UI never needs to change — it renders whatever the taxonomy produces.

### 3. Asset Registry Generalisation Pattern

New assets register by adding an entry to `ASSET_HANDLERS` in `worker/src/app.js`:

```javascript
const ASSET_HANDLERS = {
  'monster-visual-config': { save, publish, restore },
  // Future: 'audio-pack': { save, publish, restore },
};
```

Generic routes (`/api/admin/assets/:assetId/draft|publish|restore`) delegate to the handler. The existing specific routes remain as backward-compatible aliases. CAS uses `expectedDraftRevision` for publish and `expectedPublishedVersion` for restore.

### 4. Content Operations: Truthful Drilldowns

The `isClickable` flag is derived from `hasRealDiagnostics && drilldownAction !== 'none'`. Placeholder subjects render as non-interactive rows with "No drilldown available" text. This prevents the anti-pattern where UI elements imply interactivity that doesn't exist.

### 5. Stack-Trace Regex Must Require Parentheses

The initial `RE_STACK_TRACE` pattern (`/^[^\n]*\n?\s+at\s.+$/gm`) consumed the error message line before frames and false-positived on natural language ("at approximately 3pm"). The correct pattern is:

```javascript
const RE_STACK_TRACE = /^\s+at\s+\S+.*[()]/gm;
```

Real stack frames always have parenthesised file:line:col references. This avoids false positives on English text containing "at".

## Why This Matters

- **Evidence overclaiming** is the highest-risk Admin failure mode. A pretty panel that hides empty data is worse than no panel.
- **Copy/export leakage** affects real parents seeing support summaries. The string passthrough gap in P5 meant a Debug Bundle human summary containing an email would pass through to parent-safe clipboard unchanged.
- **Panel freshness** inconsistency erodes operator trust — if some panels show "2 min ago" and others silently serve stale data, the operator can't distinguish fresh from stale.
- **Characterisation-first** discipline has consistently proven its value across P2/P3/P4/P5/P6: 8 minutes of test writing catches 10+ regressions that would otherwise ship.

## When to Apply

- Adding any new Admin panel with server-backed data — use AdminPanelFrame or expose equivalent freshness semantics
- Adding any clipboard/export action — route through `prepareSafeCopy` with correct audience
- Extending evidence pipeline — add source reader to `generate-evidence-summary.mjs`, never to the client
- Adding new asset types — register in `ASSET_HANDLERS`, reuse generic CAS routes
- Refactoring Admin sections — characterisation tests BEFORE structural changes, no exceptions
- Tightening regex patterns for security — always require specific structural markers (parentheses, prefixes) to avoid natural-language false positives

## Examples

### Adding a New Evidence Source

```javascript
// In generate-evidence-summary.mjs — add to source readers:
const kpiReconcile = safeReadJson('reports/kpi-reconcile/latest.json');
if (kpiReconcile) {
  sources.kpi_reconcile = { file: 'reports/kpi-reconcile/latest.json', found: true };
  metrics.kpi_reconcile = classifySourceMetric(kpiReconcile);
} else {
  sources.kpi_reconcile = { file: 'reports/kpi-reconcile/latest.json', found: false };
  // NOT_AVAILABLE — honest, not an error
}
```

### Adding a New Asset to the Registry

```javascript
// 1. Worker handler (worker/src/app.js)
ASSET_HANDLERS['audio-pack'] = {
  save: saveAudioPackDraft,
  publish: publishAudioPack,
  restore: restoreAudioPackVersion,
};

// 2. Register confirmation level (admin-action-classification.js)
ACTIONS.set('asset-publish', { level: 'high', label: 'Publish asset' });

// 3. Dispatch handler (main.js)
if (action === 'asset-publish') {
  if (data?.assetId === 'audio-pack') publishAudioPack(data);
}
```

### Defence-in-Depth Copy Button

```javascript
// The framework handles both objects and strings defensively:
const { ok, text } = prepareSafeCopy(debugBundle.humanSummary, COPY_AUDIENCE.PARENT_SAFE);
// Even if humanSummary accidentally contains "james@example.com",
// the string-level regex catches and masks it: "****le.com"
```

## Related

- `docs/solutions/architecture-patterns/admin-console-p5-operator-readiness-parallel-sdlc-2026-04-28.md` — P5 infrastructure this composes upon
- `docs/solutions/architecture-patterns/admin-console-p4-hardening-truthfulness-adversarial-review-2026-04-27.md` — CAS patterns and characterisation-first methodology
- `docs/solutions/architecture-patterns/admin-console-section-extraction-pattern-2026-04-27.md` — no-regression refactoring protocol
- `docs/plans/james/admin-page/admin-page-p6-completion-report.md` — full P6 completion report with test evidence
