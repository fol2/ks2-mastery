---
title: "System Hardening Optimisation P6 — 60-Learner Diagnostic Decision"
type: decision-record
status: complete
date: 2026-05-01
phase: P6
classification: 60-diagnostic-setup-blocked
certifying: false
language: en-GB
---

# System Hardening Optimisation P6 — 60-Learner Diagnostic Decision

## Source Boundary

This decision is bound to `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6.md` and the P6 dry-run planner output. It does not include a completed live production 60-learner run.

## Run ID and Evidence Artefacts

Run id: `2026-04-30-p6-60-diagnostic`

Validated dry-run command:

```sh
npm run capacity:plan-60-diagnostic -- --json \
  --run-id 2026-04-30-p6-60-diagnostic \
  --origin https://ks2.eugnel.uk \
  --manifest-path /tmp/ks2-p6-60-manifest.json \
  --raw-tail-path /tmp/ks2-p6-60-worker-tail.jsonl \
  --evidence reports/capacity/evidence/2026-04-30-p6-60-diagnostic.json \
  --tail-correlation reports/capacity/evidence/2026-04-30-p6-60-tail-correlation.json \
  --statement-map reports/capacity/evidence/2026-04-30-p6-60-statement-map.json \
  --tail-classification reports/capacity/evidence/2026-04-30-p6-60-tail-classification.md
```

Dry-run validation result: `ok: true`.

The planner resolves the run-specific decision path to:

- `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6-60-diagnostic-decision.md`

Committed blocked-run artefact:

- `reports/capacity/evidence/2026-04-30-p6-60-tail-classification.md`

The expected live-run artefacts were not created because the live run did not start.

## Did the Run Reach Application Load?

No. No P6 live application load started.

The readiness check found no prepared session manifest at `/tmp/ks2-p6-60-manifest.json` and no raw Worker tail capture at `/tmp/ks2-p6-60-worker-tail.jsonl`.

## Did Thresholds Pass?

Not measured. The 60-learner threshold config remains `reports/capacity/configs/60-learner-stretch.json`; P6 did not relax any threshold config.

## Tail Sample Classification

Classification: `60-diagnostic-setup-blocked`

No P6 Worker CPU/wall samples were joined because no live run and no raw tail capture existed for this run id.

## Query, Row, Write and Payload Summary

No P6 60-learner query, row, write, or payload measurements were produced by the live diagnostic path.

P6 did strengthen route-cost modelling separately by generating `reports/capacity/evidence/2026-04-30-p6-route-costs.json` from redacted aggregate inputs. That artefact is modelling-only and cannot substitute for a telemetry-complete P6 60-learner diagnostic.

## Worker CPU and Wall Summary

No P6 60-learner Worker CPU/wall samples were produced.

The 1000-learner model still carries partial Worker CPU evidence from existing bootstrap tail correlation, and records missing CPU coverage for non-bootstrap route families.

## Is 60-Learner Certification Still Blocked?

Yes. 60 learners are not certified.

Even a future positive P6 diagnostic would only create a candidate for repeat governance; it would not certify 60 learners by itself.

## Chosen Next Path

P6 continuation: prepare the session manifest, start JSON Worker tail capture outside the repository, run the approved 60-learner production diagnostic, then commit only redacted derived artefacts.

## Rejected Alternatives

- Claiming 60 learners are supported: rejected because no telemetry-complete P6 60-learner live run completed.
- Certifying 60 learners from the older 60-learner preflight file: rejected because it is not the P6 run id and has no P6 tail correlation or statement map.
- Moving straight to D1/write/payload optimisation: rejected because the P6 bottleneck is still not classified by a telemetry-complete run.
