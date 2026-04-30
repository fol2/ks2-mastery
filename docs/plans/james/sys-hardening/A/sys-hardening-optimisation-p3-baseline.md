---
title: "System Hardening Optimisation P3 Baseline"
type: evidence-baseline
status: non-certifying
language: en-GB
date: 2026-04-30
route: system-hardening-and-optimisation
owner: james / engineering agent
source_contract: docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p3.md
source_report: docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p2-completion-report.md
---

# System Hardening Optimisation P3 Baseline

## Baseline Decision

P3 starts from the P2 completion truth, not from a certified 30-learner state.

The P2 final decision says:

> The post-P1 system can pass the strict 30-learner shape once, but the repeated strict run failed bootstrap P95, and current tail logs cannot attribute the failure to a specific resource. Public capacity remains `small-pilot-provisional`.

That remains the active baseline for P3. `reports/capacity/evidence/2026-04-29-p2-t5-strict-repeat-1.json` is the current strict 30 decision row. `reports/capacity/evidence/2026-04-29-p2-t1-strict-post-p1.json` is useful positive evidence, but it is not sufficient for certification because the repeated strict run failed.

This baseline is non-certifying. It does not promote public capacity wording, does not approve 30-learner beta certification, and does not choose D1, Worker CPU, payload, launch-policy, or threshold mitigation.

## Checkout Context

| Field | Value |
| --- | --- |
| Worktree | Full git worktree |
| Shallow repository | No |
| Baseline HEAD observed by this implementation branch | `e3ab6c3106c7` |
| Capacity wording at P3 start | `small-pilot-provisional` |
| Production load tests in this implementation branch | Not run |

No ZIP-safe ancestry bypass is required for this checkout. Any future certifying production evidence must use the normal full-clone verifier path.

## Required P2 Artefacts

| Artefact | Baseline status |
| --- | --- |
| `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p2-completion-report.md` | Present |
| `reports/capacity/evidence/2026-04-29-p2-t1-strict-post-p1.json` | Present |
| `reports/capacity/evidence/2026-04-29-p2-t5-strict-repeat-1.json` | Present |
| `reports/capacity/evidence/2026-04-29-p2-t1-tail-correlation.json` | Present |
| `reports/capacity/evidence/2026-04-29-p2-t5-tail-correlation.json` | Present |
| `reports/capacity/latest-1000-learner-budget.json` | Present |

## Strict 30 Evidence Truth

| Run | Result | Bootstrap P95 | Bootstrap max | Command P95 | Max response bytes | Hard signals | Interpretation |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| P2 T1 strict post-P1 | Pass | 814.6 ms | 818.2 ms | 309.7 ms | 29,588 B | none | Positive single-run evidence only. |
| P2 T5 strict repeat 1 | Fail | 1,354.5 ms | 2,062.2 ms | 418.0 ms | 29,589 B | none | Active strict 30 decision row; blocks certification. |

P2 T5 failed `maxBootstrapP95Ms`: observed 1,354.5 ms against the 1,000 ms ceiling.

## Tail-Correlation Truth

| Run | Top-tail samples | Invocation CPU/wall matched | Invocation partial | Statement logs matched | Classification |
| --- | ---: | ---: | ---: | ---: | --- |
| P2 T1 | 10 | 0 | 0 | 10 | `unclassified-insufficient-logs` |
| P2 T5 | 10 | 0 | 0 | 10 | `unclassified-insufficient-logs` |

Complete sampled `capacity.request` statement coverage does not imply Cloudflare invocation CPU/wall coverage. P3 must repair the invocation capture path before a D1, Worker CPU, payload, or platform-tail mitigation can be chosen.

## 1000-Learner Ledger Boundary

`reports/capacity/latest-1000-learner-budget.json` remains `modellingOnly: true` and `certifying: false`. It is not a public capacity claim and must not be used to infer 30-learner certification or 1000-learner readiness.

## Verification Boundary

This implementation branch is limited to repo-local telemetry capture hardening, parser fixtures, warning guardrails, raw-log ignore rules, and operations documentation. It deliberately does not run production load tests and does not generate P3 strict evidence artefacts.

Certification remains blocked until a later operator run proves all required P3 strict evidence, verifier, and invocation coverage gates.
