---
title: "P6 60-Learner Diagnostic Tail Classification"
type: capacity-tail-classification
date: 2026-05-01
run_id: 2026-04-30-p6-60-diagnostic
classification: 60-diagnostic-setup-blocked
certifying: false
modellingOnly: false
diagnosticOnly: true
---

# P6 60-Learner Diagnostic Tail Classification

## Source Boundary

This classification covers the P6 60-learner diagnostic command plan and readiness checks, not a completed production load run.

The planner dry-run validated successfully for:

- origin: `https://ks2.eugnel.uk`
- learners: 60
- bootstrap burst: 20
- rounds: 1
- threshold config: `reports/capacity/configs/60-learner-stretch.json`
- raw tail path: `/tmp/ks2-p6-60-worker-tail.jsonl`
- manifest path: `/tmp/ks2-p6-60-manifest.json`

## Classification

`60-diagnostic-setup-blocked`

The run did not start because the live-run readiness gates were not complete in this worktree session:

- `/tmp/ks2-p6-60-manifest.json` was absent;
- `/tmp/ks2-p6-60-worker-tail.jsonl` was absent;
- no Worker JSON tail capture was started before a load run;
- no telemetry-complete live run artefacts were produced.

James approved the P6 plan, but P6 still requires tail-capture readiness before production load starts. Starting load without the manifest and raw-tail capture would create unsafe or incomplete evidence.

## Expected Artefacts for a Future Approved Run

- `reports/capacity/evidence/2026-04-30-p6-60-diagnostic.json`
- `reports/capacity/evidence/2026-04-30-p6-60-tail-correlation.json`
- `reports/capacity/evidence/2026-04-30-p6-60-statement-map.json`
- `reports/capacity/evidence/2026-04-30-p6-60-tail-classification.md`

Only this blocked-run classification is committed for the P6 60-learner diagnostic. No raw Worker tail JSONL is committed.

## Certification Boundary

This artefact does not certify 60 learners. It records that the P6 diagnostic remains blocked on session-manifest preparation and Worker JSON tail capture readiness.
