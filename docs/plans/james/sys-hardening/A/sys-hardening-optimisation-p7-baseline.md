---
title: "System Hardening Optimisation P7 — Baseline"
type: baseline
status: complete
date: 2026-05-01
phase: P7
owner: james
route: system-hardening-optimisation
language: en-GB
source_context:
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6-completion-report.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6-60-approved-run-report.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6-path-decision.md
  - reports/capacity/evidence/2026-05-01-p6-60-diagnostic.json
  - reports/capacity/evidence/2026-05-01-p6-60-tail-correlation.json
  - reports/capacity/evidence/2026-05-01-p6-60-statement-map.json
  - reports/capacity/evidence/2026-05-01-p6-60-tail-classification.md
  - reports/capacity/evidence/2026-05-01-p6-route-costs-after-60-diagnostic.json
  - reports/capacity/latest-1000-learner-budget.json
---

# System Hardening Optimisation P7 — Baseline

## Source Boundary

P7 starts from the `sys-hardening-optimisation-p7` worktree in a full git checkout.

Baseline evidence is the approved P6 60-learner production diagnostic from 2026-05-01, not the earlier setup-blocked P6 dry-run decision.

## Active Evidence Boundary

The controlling P6 handoff is:

- `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6-60-approved-run-report.md`
- `reports/capacity/evidence/2026-05-01-p6-60-diagnostic.json`
- `reports/capacity/evidence/2026-05-01-p6-60-tail-correlation.json`
- `reports/capacity/evidence/2026-05-01-p6-60-statement-map.json`
- `reports/capacity/evidence/2026-05-01-p6-60-tail-classification.md`
- `reports/capacity/evidence/2026-05-01-p6-route-costs-after-60-diagnostic.json`
- `reports/capacity/latest-1000-learner-budget.json`

The earlier `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6-60-diagnostic-decision.md` is historical pre-approval evidence only. It recorded a setup-blocked dry-run state before the approved production diagnostic existed.

## P6 Run Truth Carried Into P7

The approved P6 run reached production app-load:

- origin: `https://ks2.eugnel.uk`
- learners: 60
- bootstrap burst: 20
- rounds: 1
- expected requests: 260
- observed requests: 260
- HTTP 200 responses: 260
- 5xx responses: 0
- network failures: 0
- capacity signals: 0

Threshold outcome:

| Metric | Limit | Observed | Result |
| --- | ---: | ---: | --- |
| Bootstrap P95 wall time | 750 ms | 1057.3 ms | failed |
| Command P95 wall time | 400 ms | 383.8 ms | passed |
| Max response bytes | 600000 bytes | 29602 bytes | passed |
| 5xx responses | 0 | 0 | passed |
| Network failures | 0 | 0 | passed |
| Capacity signals | 0 | 0 | passed |

The P6 redacted Worker tail join matched 10/10 retained top-tail invocation samples and 10/10 retained statement-log samples. The statement map covered 260/260 requests and 4484/4484 expected statements with no truncation.

## Capacity Boundary

The public capacity boundary entering P7 is unchanged:

- 30 learners: `30-learner-beta-certified`
- 60 learners: not certified
- 1000 learners: modelling-only and non-certifying

P7 is an optimisation and evidence phase. It does not promote 60 learners, and it does not certify 1000 learners.

## P7 Target

P7 targets the D1-dominated full-bootstrap path selected by P6:

- current P6 bootstrap query count: 11
- current P6 bootstrap D1 rows read P95: 9
- current P6 bootstrap D1 rows written P95: 0
- current P6 bootstrap response bytes P95: 2449
- current P6 bootstrap mode: `selected-learner-bounded`

The allowed optimisation is narrow: reduce full-bootstrap D1 statement pressure or D1 duration without weakening multi-learner correctness, revision invalidation, not-modified safety, redaction, or the 30-learner beta public boundary.
