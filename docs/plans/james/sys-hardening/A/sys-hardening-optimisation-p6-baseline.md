---
title: "System Hardening Optimisation P6 — Baseline"
type: baseline
status: complete
date: 2026-05-01
phase: P6
owner: james
route: system-hardening-optimisation
language: en-GB
source_context:
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p5-completion-report.md
  - reports/capacity/evidence/2026-04-30-p5-route-costs.json
  - reports/capacity/latest-1000-learner-budget.json
---

# System Hardening Optimisation P6 — Baseline

## Source Boundary

P6 starts from the `sys-hardening-p6` worktree in a full clone, not a lean ZIP.

Baseline ref:

- Branch: `sys-hardening-p6`
- Starting commit: `8a7c3311a1427b445041bd777376ec3309434d47`
- Base: `origin/main`
- Checkout type: full git worktree

James explicitly approved `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6.md` and the P1-P5 plan chain before this work. That approval authorises this P6 implementation pass, but it does not remove P6's own live-run safety gates.

## P5 Artefact Lock

The required P5 artefacts are present:

- `scripts/plan-60-learner-diagnostic.mjs`
- `scripts/plan-route-cost-diagnostic.mjs`
- `reports/capacity/configs/p4-60-diagnostic-checklist.md`
- `reports/capacity/evidence/2026-04-30-p5-route-costs.json`
- `reports/capacity/latest-1000-learner-budget.json`

P6 begins from the P5 terminal outcomes:

- `60-diagnostic-setup-blocked`
- `1000-route-costs-still-incomplete`

## Capacity Status Entering P6

The capacity boundary entering P6 is unchanged:

- 30 learners: `30-learner-beta-certified`
- 60 learners: not certified
- 1000 learners: modelling-only and non-certifying

No capacity status is changed by this baseline.

## Raw-Log and Redaction Guardrails

Raw Worker/Tail captures remain local-only. `git check-ignore` confirms these P6-shaped raw paths are ignored:

- `reports/capacity/evidence/2026-04-30-p6-worker-tail.jsonl`
- `reports/capacity/evidence/2026-04-30-p6-raw-tail.jsonl`
- `reports/capacity/evidence/2026-04-30-p6-tail-raw.log`

Redacted derived artefact paths remain commit-eligible:

- `reports/capacity/evidence/2026-04-30-p6-tail-correlation.json`
- `reports/capacity/evidence/2026-04-30-p6-statement-map.json`

P6-generated route-cost evidence is aggregate-only and records:

- `rawRequestIdsPersisted: false`
- `rawTailPathsPersisted: false`
- `rawStatementNamesPersisted: false`
- `aggregateOnly: true`

The P6 route-cost artefact was scanned for raw `ks2_req_*` request ids, raw tail path tokens, SQL verbs, account ids and learner ids; no matches were found.
