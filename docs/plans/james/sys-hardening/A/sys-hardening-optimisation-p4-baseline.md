---
title: "System Hardening Optimisation P4 — Baseline"
type: baseline
status: locked
date: 2026-04-30
phase: P4
source_boundary: "GitHub main full clone"
---

# System Hardening Optimisation P4 — Baseline

This document records post-P3 truth before any P4 changes are applied.

## 1. Source Boundary

| Field | Value |
|-------|-------|
| Origin | GitHub `main` full clone |
| Commit | `0f3f72ae` (HEAD at start of P4 work) |

## 2. P3 Terminal Outcome

**`strict-30-certified-candidate`**

## 3. P3 Terminal Evidence

### Strict + Repeat Runs

| Run | Bootstrap P95 | Command P95 | Result |
|-----|---------------|-------------|--------|
| P3-T1 strict | 701.3 ms | 292.7 ms | PASS |
| P3-T5 repeat 1 | 661.4 ms | 319.2 ms | PASS |
| P3-T5 repeat 2 | 715.2 ms | 279.7 ms | PASS (recommended promotion row) |

### P3 Tail Classification

| Category | Count |
|----------|-------|
| d1-dominated | 24/30 |
| worker-cpu-dominated | 3/30 |
| client-network-or-platform-overhead | 3/30 |

### Coverage

- 10/10 invocation CPU/wall and statement-log coverage per retained sample
- 0 join warnings across all runs

## 4. Latest Evidence Summary Status

**`evidence-not-in-verified-capacity-table`** (fail-closed)

## 5. Current Public/Admin Status

**`small-pilot-provisional`**

## 6. 60-Learner Status

**Unverified.** Latest preflight failed: 854.0 ms vs 750 ms ceiling.

## 7. 1000-Learner Status

- `modellingOnly: true`
- `certifying: false`
- D1 rows written RED at 1008% of free-tier.

## 8. P3 Telemetry Gate Report — Superseded

`sys-hardening-optimisation-p3-telemetry-gate-completion-report.md` is **NOT** the terminal P3 state — superseded by `sys-hardening-optimisation-p3-completion-report.md`.
