---
title: "P5 60-Learner Diagnostic Tail Classification"
type: capacity-tail-classification
date: 2026-04-30
run_id: 2026-04-30-p5-60-diagnostic
classification: 60-diagnostic-setup-blocked
certifying: false
modellingOnly: false
diagnosticOnly: true
---

# P5 60-Learner Diagnostic Tail Classification

## Source Boundary

This classification covers the P5 60-learner diagnostic command plan, not a completed production load run.

The production run was not started because P5 requires explicit production-run approval, Cloudflare tail access, and a raw Worker tail capture window before app-load measurements can be collected. Starting a partial run without those conditions would produce unsafe or incomplete evidence.

## Classification

`60-diagnostic-setup-blocked`

The blocker is named and reproducible: a validated diagnostic command plan exists, but no approved production execution gate and raw tail capture were available in this run.

## Evidence Artefacts

Expected artefacts for an approved run:

- `reports/capacity/evidence/2026-04-30-p5-60-diagnostic.json`
- `reports/capacity/evidence/2026-04-30-p5-60-tail-correlation.json`
- `reports/capacity/evidence/2026-04-30-p5-60-statement-map.json`
- `reports/capacity/evidence/2026-04-30-p5-60-tail-classification.md`

Only this classification artefact is committed for the blocked run. No raw Worker tail JSONL is committed.

## Certification Boundary

This artefact does not certify 60 learners. It records that the P5 diagnostic harness command plan is validated, but the diagnostic is still blocked on an approved production run and telemetry capture.
