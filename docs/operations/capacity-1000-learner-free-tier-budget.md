# 1000-Learner Free-Tier Budget Ledger

> Non-certifying modelling worksheet. This document does not certify 30, 60, 100, 300, or 1000 learner capacity; certification still requires verifier-backed strict evidence.

Generated: 2026-04-29T15:41:04.556Z
Cloudflare limits retrieved: 2026-04-29

## Inputs

| Source | Kind | Used for certification |
| --- | --- | --- |
| reports/capacity/evidence/30-learner-beta-v2-20260428-p5-warm.json | capacity-run | no |

## Free-Tier Limits

| Quota | Free limit | Amber | Red |
| --- | ---: | ---: | ---: |
| Worker dynamic requests/day | 100000 | 60% | 80% |
| D1 rows read/day | 5000000 | 60% | 80% |
| D1 rows written/day | 100000 | 60% | 80% |
| Worker CPU/invocation | 10 ms | 60% | 80% |
| Worker subrequests/invocation | 50 | 60% | 80% |

## Scenario Totals

| Learners | Mode | Requests/day | D1 rows read/day | D1 rows written/day | Worst 15-minute requests | CPU judgement | Top bottleneck |
| ---: | --- | --- | --- | --- | ---: | --- | --- |
| 30 | optimistic | 423 (0.42%, green) | 130200 (2.6%, unknown, lower-bound) | 0 (0%, unknown, lower-bound) | 50.76 | unknown | d1RowsReadPerDay (unknown) |
| 30 | expected | 1080.45 (1.08%, green) | 341460 (6.83%, unknown, lower-bound) | 0 (0%, unknown, lower-bound) | 216.09 | unknown | d1RowsReadPerDay (unknown) |
| 30 | pessimistic | 2576.25 (2.58%, green) | 813000 (16.26%, unknown, lower-bound) | 0 (0%, unknown, lower-bound) | 901.69 | unknown | d1RowsReadPerDay (unknown) |
| 60 | optimistic | 846 (0.85%, green) | 260400 (5.21%, unknown, lower-bound) | 0 (0%, unknown, lower-bound) | 101.52 | unknown | d1RowsReadPerDay (unknown) |
| 60 | expected | 2160.9 (2.16%, green) | 682920 (13.66%, unknown, lower-bound) | 0 (0%, unknown, lower-bound) | 432.18 | unknown | d1RowsReadPerDay (unknown) |
| 60 | pessimistic | 5152.5 (5.15%, green) | 1626000 (32.52%, unknown, lower-bound) | 0 (0%, unknown, lower-bound) | 1803.37 | unknown | d1RowsReadPerDay (unknown) |
| 100 | optimistic | 1410 (1.41%, green) | 434000 (8.68%, unknown, lower-bound) | 0 (0%, unknown, lower-bound) | 169.2 | unknown | d1RowsReadPerDay (unknown) |
| 100 | expected | 3601.5 (3.6%, green) | 1138200 (22.76%, unknown, lower-bound) | 0 (0%, unknown, lower-bound) | 720.3 | unknown | d1RowsReadPerDay (unknown) |
| 100 | pessimistic | 8587.5 (8.59%, green) | 2710000 (54.2%, unknown, lower-bound) | 0 (0%, unknown, lower-bound) | 3005.63 | unknown | d1RowsReadPerDay (unknown) |
| 300 | optimistic | 4230 (4.23%, green) | 1302000 (26.04%, unknown, lower-bound) | 0 (0%, unknown, lower-bound) | 507.6 | unknown | d1RowsReadPerDay (unknown) |
| 300 | expected | 10804.5 (10.8%, green) | 3414600 (68.29%, unknown, lower-bound) | 0 (0%, unknown, lower-bound) | 2160.9 | unknown | d1RowsReadPerDay (unknown) |
| 300 | pessimistic | 25762.5 (25.76%, green) | 8130000 (162.6%, red, lower-bound) | 0 (0%, unknown, lower-bound) | 9016.88 | unknown | d1RowsReadPerDay (red) |
| 1000 | optimistic | 14100 (14.1%, green) | 4340000 (86.8%, red, lower-bound) | 0 (0%, unknown, lower-bound) | 1692 | unknown | d1RowsReadPerDay (red) |
| 1000 | expected | 36015 (36.02%, green) | 11382000 (227.64%, red, lower-bound) | 0 (0%, unknown, lower-bound) | 7203 | unknown | d1RowsReadPerDay (red) |
| 1000 | pessimistic | 85875 (85.88%, red) | 27100000 (542%, red, lower-bound) | 0 (0%, unknown, lower-bound) | 30056.25 | unknown | d1RowsReadPerDay (red) |

## Phase 2 Paths Protected

| Learners | Mode | Path | Protects | Trigger |
| ---: | --- | --- | --- | --- |
| 30 | optimistic | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |
| 30 | expected | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |
| 30 | pessimistic | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |
| 60 | optimistic | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |
| 60 | expected | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |
| 60 | pessimistic | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |
| 100 | optimistic | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |
| 100 | expected | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |
| 100 | pessimistic | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |
| 300 | optimistic | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |
| 300 | expected | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |
| 300 | pessimistic | statement-map-backed query-plan read reduction | D1 rows read/day, D1 query duration, bootstrap wall-time tail | d1RowsReadPerDay |
| 300 | pessimistic | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |
| 1000 | optimistic | statement-map-backed query-plan read reduction | D1 rows read/day, D1 query duration, bootstrap wall-time tail | d1RowsReadPerDay |
| 1000 | optimistic | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |
| 1000 | expected | statement-map-backed query-plan read reduction | D1 rows read/day, D1 query duration, bootstrap wall-time tail | d1RowsReadPerDay |
| 1000 | expected | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |
| 1000 | pessimistic | statement-map-backed query-plan read reduction | D1 rows read/day, D1 query duration, bootstrap wall-time tail | d1RowsReadPerDay |
| 1000 | pessimistic | burst pacing and retry/backoff shaping | Worker dynamic requests/day, 15-minute burst shape | dynamicRequestsPerDay |
| 1000 | pessimistic | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |

## Residual Gaps

- Worker CPU remains `unknown` wherever the input evidence has no joined Cloudflare CPU telemetry.
- Quota cells marked `lower-bound` have missing measured route or metric coverage; green/amber lower bounds stay `unknown` rather than becoming capacity claims.
- Parent/admin reads are modelled only when a measured parent/admin route summary is present; otherwise the ledger records a missing-route warning rather than inventing D1 cost.
- The worksheet uses measured route costs with modelled daily usage assumptions; it is an internal planning ledger, not a launch claim.
