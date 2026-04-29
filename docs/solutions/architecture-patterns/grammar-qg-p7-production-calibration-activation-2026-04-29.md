---
title: "Grammar QG P7 — Production Calibration Activation and Evidence-Led Actions"
date: 2026-04-29
category: architecture-patterns
module: grammar-qg
problem_type: architecture_pattern
component: calibration-pipeline
severity: high
applies_when:
  - "Shadow-mode calibration telemetry needs activation against real production evidence"
  - "Analytics pipelines require HMAC anonymisation to protect learner identity"
  - "Action candidates must be surfaced but never auto-actioned without human gate"
  - "Transfer-gap analysis requires minimum attempt thresholds to prevent false positives"
  - "Cross-report calibration runners need canonical per-concept expansion"
  - "Event export must scrub embedded identifiers (e.g. learnerId in event.id composite keys)"
tags:
  - grammar
  - question-generator
  - calibration
  - telemetry
  - analytics
  - production-evidence
  - anonymisation
  - mixed-transfer
  - retention
  - action-candidates
  - confidence-thresholds
  - decision-gates
related:
  - path: docs/solutions/architecture-patterns/grammar-qg-p6-calibration-telemetry-architecture-2026-04-29.md
    relationship: direct-predecessor
    note: P6 shadow-mode telemetry activated by P7
  - path: docs/solutions/architecture-patterns/grammar-qg-p5-machine-verifiable-content-release-process-2026-04-28.md
    relationship: foundation
    note: Release gate pattern extended with verify:grammar-qg-p7
  - path: docs/solutions/architecture-patterns/grammar-p7-quality-trust-consolidation-and-autonomous-sdlc-2026-04-27.md
    relationship: namesake-sibling
    note: Redacted debug model and deterministic event IDs inherited
  - path: docs/solutions/architecture-patterns/punctuation-qg-p4-autonomous-governance-phase-2026-04-29.md
    relationship: parallel-programme
    note: Characterisation-first governance and scheduler maturity patterns
---

# Grammar QG P7 — Production Calibration Activation and Evidence-Led Actions

## Context

P6 delivered learner calibration telemetry in shadow mode — six new fields on `grammar.answer-submitted` events, template health classification (8 categories), mixed-transfer shadow evidence weights, and retention-after-secure lapse detection. All of this operated exclusively on synthetic fixtures. The production event stream was accumulating real calibration data with no pipeline to activate it into actionable insights.

Three governance gaps remained from P6: placeholder tokens accepted in release report frontmatter (`final_report_commit: pending`), smoke evidence path mismatch between documentation and script output, and hand-written test totals that could not be machine-verified.

The core tension: production events contain learner PII (IDs embedded in multiple fields including compound event identifiers), the engine emits multi-concept events that analytics scripts expect as singular-concept rows, and any calibration output must be report-only — never auto-actioned in the same phase that generated it.

## Guidance

### Pipeline Architecture (5-stage offline)

```
Production D1 → Export (anonymise) → Expand (per-concept) → Calibrate (classify) → Report (action candidates + decision gates)
```

Each stage is a standalone ESM script in `scripts/`. Zero runtime overhead — nothing touches the production request hot path.

**Stage 1 — Export with anonymisation** (`export-grammar-qg-events.mjs`):
- HMAC-SHA-256 with external salt file (never committed to repo)
- Critical: scrub learnerId from ALL fields including compound IDs (`event.id` format: `grammar.answer-submitted.{learnerId}.{requestId}.{itemId}`)
- Dry-run mode for filter validation before real export
- Filter by release ID, date range, template, concept

**Stage 2 — Canonical event expansion** (`grammar-qg-expand-events.mjs`):
- Multi-concept events → N per-concept rows with deterministic `rowId = "${eventId}:${conceptId}"`
- Bridges engine's multi-concept emission with analytics' singular-concept expectation
- Handles both legacy string and P6 object `conceptStatusBefore`/`After` shapes
- Boolean enrichment flags: `isMixedTransfer`, `isExplanation`, `isSurgery`, `isManualReviewOnly`

**Stage 3 — Calibration runner** (`grammar-qg-calibrate.mjs`):
- Normalises numeric `createdAt` (production epoch ms) to ISO string (downstream `isValidEvent` checks require `typeof timestamp === 'string'`)
- Classification chain: health → mixed-transfer → retention → cross-report
- Cross-report classifications with minimum sample guarantees:
  - `transfer_gap`: requires ≥10 attempts in EACH modality (prevents false positives when mixed-transfer attempts = 0)
  - `retention_gap`: secure concepts lapse >25% with ≥30 secured attempts
  - `weakCorrectAttemptRate`: correct attempts where `conceptStatusBefore === 'weak'` / total weak attempts
  - `weakToSecureRecoveryRate`: status transitions `weak → secure/secured` / total weak attempts (not binary correctness)

**Stage 4 — Action candidates** (`grammar-qg-action-candidates.mjs`):
9 categories: `keep | warm_up_only | review_wording | add_bridge_practice | expand_case_bank | rewrite_distractors | reduce_scheduler_weight | retire_candidate | increase_maintenance`

Confidence threshold: non-keep requires ≥30 attempts. Below → `insufficient_data`. Candidates include rationale string and source metrics. NEVER auto-actioned in the generating phase.

**Stage 5 — Decision gates** (`grammar-qg-mixed-transfer-decision.mjs`, `grammar-qg-retention-decision.mjs`):
- Mixed-transfer maturity: ≥6/8 templates at medium (≥30 attempts) AND ≥3 at high (≥100) → `prepare_scoring_experiment`
- Retention maintenance: average lapse >20% across concepts with ≥30 secured attempts → `recommend_maintenance_experiment`
- Template-family clustering for lapse concentration detection
- All decisions reference "separate future plan" — never auto-ship

### Client Elapsed Timing

`clientElapsedMs` added as optional field on `submit-answer` payload. Validated: finite number in [0, 180000]. Bucketed via `bucketElapsedMs()`: `<2s`, `2-5s`, `5-10s`, `10-20s`, `>20s`. Invalid/missing → null. Never exposed in read models — analytics-only.

### Governance Hardening

`validateReleaseFrontmatter()` rejects placeholder tokens via `/^(pending|todo|tbc|unknown|n\/a|tbd)$/i`. Machine-derived test counts via `capture-verification-summary.mjs`. Canonical smoke evidence path: `reports/grammar/grammar-production-smoke-${contentReleaseId}.json`.

### Security: Compound-ID Scrubbing

P0 finding caught during autonomous SDLC review: `anonymiseEvent()` stripped `learnerId` from its dedicated field but the raw ID was embedded inside `event.id`. Fix: replace the learnerId substring within event.id with the HMAC-hashed value before any downstream processing (including expansion, which derives rowId from event.id).

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Analytics schema version (not content release bump) | No learner-facing change — P7 is entirely infrastructure |
| Event expansion as offline script | Zero runtime overhead on production request path |
| Characterisation-first testing | Snapshot current output before modifying report scripts — proves no regression |
| Report-only action candidates | P6 precedent: never auto-action in the same phase that introduces them |
| Decision gates reference "separate future plan" | Decouples observation from intervention |
| HMAC with external salt | Salt never in repo; .gitignore entries for *.salt, salt.txt, .hmac-salt |
| ≥10 attempts per modality for transfer_gap | Prevents false positives where safeRate(0,0)=0 flags healthy concepts |
| Numeric createdAt → ISO normalisation | D1 stores epoch ms; sub-reports' isValidEvent checks require string |

## Why This Matters

1. **Safe activation of shadow telemetry** — P6's investment in telemetry collection only pays off when a pipeline can derive insights. This pattern converts raw events into actionable recommendations without risking learner privacy or destabilising the live experience.

2. **Separation of observation from intervention** — By mandating that action candidates are never auto-actioned in the generating phase, the pipeline creates a deliberate human-review checkpoint. This prevents feedback loops where a miscalibrated metric could cascade into unreviewed content changes.

3. **Minimum-sample confidence** — The 30-attempt threshold for non-keep actions and 10-per-modality for transfer gaps means recommendations only emerge from statistically meaningful evidence. Early noise does not produce premature retirement or rewrite signals.

4. **Reproducibility and auditability** — Deterministic rowIds, external salt HMAC, dry-run mode, and characterisation snapshots mean any calibration run can be reproduced and its outputs verified against known baselines.

5. **PII-safe analytics** — The compound-ID scrubbing pattern ensures that even accidental data exposure cannot reveal learner identity. Correct posture for any system processing children's educational data.

6. **Cross-subject reusability** — The 5-stage architecture (export → expand → calibrate → report → gate) is domain-agnostic. Punctuation QG and future subject QG systems can adopt it by changing only the classification metrics and category definitions.

## When to Apply

- **Shadow telemetry has accumulated sufficient volume** — Minimum 30 attempts per template for meaningful classification; pipeline produces only `keep` below threshold
- **A question-generation domain reaches P6+ maturity** — Punctuation QG, any future subject. The pipeline architecture transfers directly
- **Content teams need evidence-backed template triage** — "Which templates are working, which need intervention?" with confidence bounds
- **Multi-entity events need normalising to per-entity analytics** — The canonical expansion pattern applies anywhere compound events exist
- **Production PII data requires safe analytics export** — The HMAC + compound-ID scrubbing pattern applies wherever identifiers are embedded in multiple fields
- **You need to bridge numeric epoch timestamps to string-expecting consumers** — Common when D1/production stores epoch ms but downstream validation checks typeof

Do NOT apply when:
- Real-time learner-facing decisions are needed (this is strictly offline)
- Sample sizes are below threshold (produces meaningless keep-all output)
- You intend to auto-action results in the same release cycle (violates observation/intervention separation)
- The telemetry infrastructure itself hasn't been validated (requires a P6-equivalent shadow-mode phase first)

## Examples

### Running the full pipeline

```bash
# Export with anonymisation (dry-run first)
node scripts/export-grammar-qg-events.mjs \
  --input production-dump.json \
  --output reports/grammar/raw-events.json \
  --expanded-output reports/grammar/expanded-events.json \
  --salt-file ~/.secrets/calibration-salt \
  --release-id grammar-qg-p6-2026-04-29 \
  --dry-run

# Expand multi-concept events
node scripts/grammar-qg-expand-events.mjs \
  --input reports/grammar/raw-events.json \
  --output reports/grammar/expanded-events.json

# Run calibration (all reports + action candidates)
npm run grammar:qg:calibrate -- --input=reports/grammar/expanded-events.json
```

### Compound-ID anonymisation pattern

```javascript
// P0 vulnerability: event.id contained raw learnerId
// "grammar.answer-submitted.learner_abc123.req_456.item_789"

function anonymiseEvent(event, salt) {
  const originalLearnerId = event.learnerId;
  const copy = { ...event };
  copy.learnerId = salt
    ? createHmac('sha256', salt).update(originalLearnerId).digest('hex').slice(0, 16)
    : 'anonymous';
  // Critical: also scrub from compound ID
  if (copy.id && originalLearnerId) {
    copy.id = copy.id.replace(originalLearnerId, copy.learnerId);
  }
  return copy;
}
```

### Transfer-gap confidence gate

```javascript
// Template with 45 local attempts (82% success) but only 8 mixed-transfer attempts:
// transfer_gap NOT computed — mixed attempts < 10 threshold
// Action: "keep" (insufficient evidence for non-keep)

// After accumulating data: 67 local (84%) + 14 mixed (57%):
// transfer_gap = 0.27 — qualifies with >=10 in each modality
// Action: "add_bridge_practice" (medium confidence)
```

### Decision gate output

```javascript
// Mixed-transfer maturity assessment:
// Templates at HIGH confidence (>=100): 4/8
// Templates at MEDIUM confidence (>=30): 7/8
// Gate: >=6/8 medium AND >=3 high → PASSED
// Decision: "prepare_scoring_experiment"
// futureActionRef: "Requires separate reviewed scoring plan"
```

### Autonomous SDLC delivery pattern

5 waves, 6 PRs. Each wave followed the cycle:
1. Worker agent implements units in isolated worktree
2. Parallel reviewers dispatched (correctness + testing/security)
3. Review follower fixes blocking findings
4. Merge → advance to next wave

Security review caught the P0 (learnerId in event.id). Correctness review caught a critical bug (numeric createdAt causing all production events to be skipped). Both fixed pre-merge — exactly the value of autonomous multi-reviewer cycles.

## Related

- [Grammar QG P6 — Calibration Telemetry Architecture](grammar-qg-p6-calibration-telemetry-architecture-2026-04-29.md) — direct predecessor; shadow-mode design that P7 activates
- [Grammar QG P5 — Machine-Verifiable Content Release Process](grammar-qg-p5-machine-verifiable-content-release-process-2026-04-28.md) — release gate foundation extended by P7
- [Grammar P7 — Quality/Trust Consolidation](grammar-p7-quality-trust-consolidation-and-autonomous-sdlc-2026-04-27.md) — redacted debug model and deterministic event IDs
- [Punctuation QG P4 — Autonomous Governance Phase](punctuation-qg-p4-autonomous-governance-phase-2026-04-29.md) — parallel programme; characterisation-first discipline
- [Punctuation QG P5 — Production Readiness Attestation](punctuation-qg-p5-production-readiness-attestation-architecture-2026-04-29.md) — telemetry manifest lifecycle
