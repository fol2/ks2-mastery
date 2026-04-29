# 1000-Learner Free-Tier Budget Ledger

> Non-certifying modelling worksheet. This document does not certify 30, 60, 100, 300, or 1000 learner capacity; certification still requires verifier-backed strict evidence.

Generated: 2026-04-29T19:39:11.714Z
Cloudflare limits retrieved: 2026-04-29

## Inputs

| Source | Kind | Used for certification |
| --- | --- | --- |
| reports/capacity/evidence/2026-04-29-p2-t1-strict-post-p1.json | capacity-run | no |
| reports/capacity/evidence/2026-04-29-p2-t5-strict-repeat-1.json | capacity-run | no |

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
| 30 | optimistic | 423 (0.42%, green) | 8100 (0.16%, unknown, lower-bound) | 6120 (6.12%, unknown, lower-bound) | 50.76 | unknown | d1RowsWrittenPerDay (unknown) |
| 30 | expected | 1080.45 (1.08%, green) | 791154 (15.82%, unknown, lower-bound) | 30240 (30.24%, unknown, lower-bound) | 216.09 | unknown | d1RowsWrittenPerDay (unknown) |
| 30 | pessimistic | 2576.25 (2.58%, green) | 2090700 (41.81%, unknown, lower-bound) | 72000 (72%, unknown, lower-bound) | 901.69 | unknown | d1RowsWrittenPerDay (unknown) |
| 60 | optimistic | 846 (0.85%, green) | 16200 (0.32%, unknown, lower-bound) | 12240 (12.24%, unknown, lower-bound) | 101.52 | unknown | d1RowsWrittenPerDay (unknown) |
| 60 | expected | 2160.9 (2.16%, green) | 1582308 (31.65%, unknown, lower-bound) | 60480 (60.48%, unknown, lower-bound) | 432.18 | unknown | d1RowsWrittenPerDay (unknown) |
| 60 | pessimistic | 5152.5 (5.15%, green) | 4181400 (83.63%, red, lower-bound) | 144000 (144%, red, lower-bound) | 1803.37 | unknown | d1RowsWrittenPerDay (red) |
| 100 | optimistic | 1410 (1.41%, green) | 27000 (0.54%, unknown, lower-bound) | 20400 (20.4%, unknown, lower-bound) | 169.2 | unknown | d1RowsWrittenPerDay (unknown) |
| 100 | expected | 3601.5 (3.6%, green) | 2637180 (52.74%, unknown, lower-bound) | 100800 (100.8%, red, lower-bound) | 720.3 | unknown | d1RowsWrittenPerDay (red) |
| 100 | pessimistic | 8587.5 (8.59%, green) | 6969000 (139.38%, red, lower-bound) | 240000 (240%, red, lower-bound) | 3005.63 | unknown | d1RowsWrittenPerDay (red) |
| 300 | optimistic | 4230 (4.23%, green) | 81000 (1.62%, unknown, lower-bound) | 61200 (61.2%, unknown, lower-bound) | 507.6 | unknown | d1RowsWrittenPerDay (unknown) |
| 300 | expected | 10804.5 (10.8%, green) | 7911540 (158.23%, red, lower-bound) | 302400 (302.4%, red, lower-bound) | 2160.9 | unknown | d1RowsWrittenPerDay (red) |
| 300 | pessimistic | 25762.5 (25.76%, green) | 20907000 (418.14%, red, lower-bound) | 720000 (720%, red, lower-bound) | 9016.88 | unknown | d1RowsWrittenPerDay (red) |
| 1000 | optimistic | 14100 (14.1%, green) | 270000 (5.4%, unknown, lower-bound) | 204000 (204%, red, lower-bound) | 1692 | unknown | d1RowsWrittenPerDay (red) |
| 1000 | expected | 36015 (36.02%, green) | 26371800 (527.44%, red, lower-bound) | 1008000 (1008%, red, lower-bound) | 7203 | unknown | d1RowsWrittenPerDay (red) |
| 1000 | pessimistic | 85875 (85.88%, red) | 69690000 (1393.8%, red, lower-bound) | 2400000 (2400%, red, lower-bound) | 30056.25 | unknown | d1RowsWrittenPerDay (red) |

## Phase 2 Paths Protected

| Learners | Mode | Path | Protects | Trigger |
| ---: | --- | --- | --- | --- |
| 30 | optimistic | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |
| 30 | expected | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |
| 30 | pessimistic | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |
| 60 | optimistic | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |
| 60 | expected | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |
| 60 | pessimistic | statement-map-backed query-plan read reduction | D1 rows read/day, D1 query duration, bootstrap wall-time tail | d1RowsReadPerDay |
| 60 | pessimistic | write-amplification review before new indexes | D1 rows written/day | d1RowsWrittenPerDay |
| 60 | pessimistic | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |
| 100 | optimistic | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |
| 100 | expected | write-amplification review before new indexes | D1 rows written/day | d1RowsWrittenPerDay |
| 100 | expected | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |
| 100 | pessimistic | statement-map-backed query-plan read reduction | D1 rows read/day, D1 query duration, bootstrap wall-time tail | d1RowsReadPerDay |
| 100 | pessimistic | write-amplification review before new indexes | D1 rows written/day | d1RowsWrittenPerDay |
| 100 | pessimistic | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |
| 300 | optimistic | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |
| 300 | expected | statement-map-backed query-plan read reduction | D1 rows read/day, D1 query duration, bootstrap wall-time tail | d1RowsReadPerDay |
| 300 | expected | write-amplification review before new indexes | D1 rows written/day | d1RowsWrittenPerDay |
| 300 | expected | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |
| 300 | pessimistic | statement-map-backed query-plan read reduction | D1 rows read/day, D1 query duration, bootstrap wall-time tail | d1RowsReadPerDay |
| 300 | pessimistic | write-amplification review before new indexes | D1 rows written/day | d1RowsWrittenPerDay |
| 300 | pessimistic | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |
| 1000 | optimistic | write-amplification review before new indexes | D1 rows written/day | d1RowsWrittenPerDay |
| 1000 | optimistic | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |
| 1000 | expected | statement-map-backed query-plan read reduction | D1 rows read/day, D1 query duration, bootstrap wall-time tail | d1RowsReadPerDay |
| 1000 | expected | write-amplification review before new indexes | D1 rows written/day | d1RowsWrittenPerDay |
| 1000 | expected | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |
| 1000 | pessimistic | statement-map-backed query-plan read reduction | D1 rows read/day, D1 query duration, bootstrap wall-time tail | d1RowsReadPerDay |
| 1000 | pessimistic | burst pacing and retry/backoff shaping | Worker dynamic requests/day, 15-minute burst shape | dynamicRequestsPerDay |
| 1000 | pessimistic | write-amplification review before new indexes | D1 rows written/day | d1RowsWrittenPerDay |
| 1000 | pessimistic | complete Worker CPU join before CPU optimisation | Worker CPU ms/invocation attribution | missing-worker-cpu-join |

## Residual Gaps

- Worker CPU remains `unknown` wherever the input evidence has no joined Cloudflare CPU telemetry.
- Quota cells marked `lower-bound` have missing measured route or metric coverage; green/amber lower bounds stay `unknown` rather than becoming capacity claims.
- Parent/admin reads are modelled only when a measured parent/admin route summary is present; otherwise the ledger records a missing-route warning rather than inventing D1 cost.
- The worksheet uses measured route costs with modelled daily usage assumptions; it is an internal planning ledger, not a launch claim.
