# 1000-Learner Free-Tier Budget Ledger

> Non-certifying modelling worksheet. This document does not certify 30, 60, 100, 300, or 1000 learner capacity; certification still requires verifier-backed strict evidence.

Generated: 2026-05-01T10:42:18.460Z
Cloudflare limits retrieved: 2026-04-29

## Inputs

| Source | Kind | Used for certification |
| --- | --- | --- |
| reports/capacity/evidence/2026-04-30-p6-route-costs.json | route-cost-diagnostic | no |

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
| 30 | optimistic | 423 (0.42%, green) | 8160 (0.16%, unknown, lower-bound) | 6120 (6.12%, unknown, lower-bound) | 50.76 | red | d1RowsWrittenPerDay (unknown) |
| 30 | expected | 1080.45 (1.08%, green) | 553140 (11.06%, unknown, lower-bound) | 34020 (34.02%, unknown, lower-bound) | 216.09 | red | d1RowsWrittenPerDay (unknown) |
| 30 | pessimistic | 2576.25 (2.58%, green) | 4572750 (91.46%, red, lower-bound) | 1163250 (1163.25%, red, lower-bound) | 901.69 | red | d1RowsWrittenPerDay (red) |
| 60 | optimistic | 846 (0.85%, green) | 16320 (0.33%, unknown, lower-bound) | 12240 (12.24%, unknown, lower-bound) | 101.52 | red | d1RowsWrittenPerDay (unknown) |
| 60 | expected | 2160.9 (2.16%, green) | 1106280 (22.13%, unknown, lower-bound) | 68040 (68.04%, unknown, lower-bound) | 432.18 | red | d1RowsWrittenPerDay (unknown) |
| 60 | pessimistic | 5152.5 (5.15%, green) | 9145500 (182.91%, red, lower-bound) | 2326500 (2326.5%, red, lower-bound) | 1803.37 | red | d1RowsWrittenPerDay (red) |
| 100 | optimistic | 1410 (1.41%, green) | 27200 (0.54%, unknown, lower-bound) | 20400 (20.4%, unknown, lower-bound) | 169.2 | red | d1RowsWrittenPerDay (unknown) |
| 100 | expected | 3601.5 (3.6%, green) | 1843800 (36.88%, unknown, lower-bound) | 113400 (113.4%, red, lower-bound) | 720.3 | red | d1RowsWrittenPerDay (red) |
| 100 | pessimistic | 8587.5 (8.59%, green) | 15242500 (304.85%, red, lower-bound) | 3877500 (3877.5%, red, lower-bound) | 3005.63 | red | d1RowsWrittenPerDay (red) |
| 300 | optimistic | 4230 (4.23%, green) | 81600 (1.63%, unknown, lower-bound) | 61200 (61.2%, unknown, lower-bound) | 507.6 | red | d1RowsWrittenPerDay (unknown) |
| 300 | expected | 10804.5 (10.8%, green) | 5531400 (110.63%, red, lower-bound) | 340200 (340.2%, red, lower-bound) | 2160.9 | red | d1RowsWrittenPerDay (red) |
| 300 | pessimistic | 25762.5 (25.76%, green) | 45727500 (914.55%, red, lower-bound) | 11632500 (11632.5%, red, lower-bound) | 9016.88 | red | d1RowsWrittenPerDay (red) |
| 1000 | optimistic | 14100 (14.1%, green) | 272000 (5.44%, unknown, lower-bound) | 204000 (204%, red, lower-bound) | 1692 | red | d1RowsWrittenPerDay (red) |
| 1000 | expected | 36015 (36.02%, green) | 18438000 (368.76%, red, lower-bound) | 1134000 (1134%, red, lower-bound) | 7203 | red | d1RowsWrittenPerDay (red) |
| 1000 | pessimistic | 85875 (85.88%, red) | 152425000 (3048.5%, red, lower-bound) | 38775000 (38775%, red, lower-bound) | 30056.25 | red | d1RowsWrittenPerDay (red) |

## Phase 2 Paths Protected

| Learners | Mode | Path | Protects | Trigger |
| ---: | --- | --- | --- | --- |
| 30 | pessimistic | statement-map-backed query-plan read reduction | D1 rows read/day, D1 query duration, bootstrap wall-time tail | d1RowsReadPerDay |
| 30 | pessimistic | write-amplification review before new indexes | D1 rows written/day | d1RowsWrittenPerDay |
| 60 | pessimistic | statement-map-backed query-plan read reduction | D1 rows read/day, D1 query duration, bootstrap wall-time tail | d1RowsReadPerDay |
| 60 | pessimistic | write-amplification review before new indexes | D1 rows written/day | d1RowsWrittenPerDay |
| 100 | expected | write-amplification review before new indexes | D1 rows written/day | d1RowsWrittenPerDay |
| 100 | pessimistic | statement-map-backed query-plan read reduction | D1 rows read/day, D1 query duration, bootstrap wall-time tail | d1RowsReadPerDay |
| 100 | pessimistic | write-amplification review before new indexes | D1 rows written/day | d1RowsWrittenPerDay |
| 300 | expected | statement-map-backed query-plan read reduction | D1 rows read/day, D1 query duration, bootstrap wall-time tail | d1RowsReadPerDay |
| 300 | expected | write-amplification review before new indexes | D1 rows written/day | d1RowsWrittenPerDay |
| 300 | pessimistic | statement-map-backed query-plan read reduction | D1 rows read/day, D1 query duration, bootstrap wall-time tail | d1RowsReadPerDay |
| 300 | pessimistic | write-amplification review before new indexes | D1 rows written/day | d1RowsWrittenPerDay |
| 1000 | optimistic | write-amplification review before new indexes | D1 rows written/day | d1RowsWrittenPerDay |
| 1000 | expected | statement-map-backed query-plan read reduction | D1 rows read/day, D1 query duration, bootstrap wall-time tail | d1RowsReadPerDay |
| 1000 | expected | write-amplification review before new indexes | D1 rows written/day | d1RowsWrittenPerDay |
| 1000 | pessimistic | statement-map-backed query-plan read reduction | D1 rows read/day, D1 query duration, bootstrap wall-time tail | d1RowsReadPerDay |
| 1000 | pessimistic | burst pacing and retry/backoff shaping | Worker dynamic requests/day, 15-minute burst shape | dynamicRequestsPerDay |
| 1000 | pessimistic | write-amplification review before new indexes | D1 rows written/day | d1RowsWrittenPerDay |

## Required Route-Family Coverage

| Route family | Status | Routes | Missing metrics |
| --- | --- | --- | --- |
| full-bootstrap | measured | GET /api/bootstrap | none |
| not-modified-bootstrap | requires-production-operator | POST /api/bootstrap | count, wallMsP50, wallMsP95, wallMsMax, workerCpuMsP50, workerCpuMsP95, workerCpuMsMax, workerWallMsP50, workerWallMsP95, workerWallMsMax, d1DurationMsP50, d1DurationMsP95, d1DurationMsMax, queryCountP50, queryCountP95, queryCountMax, d1RowsReadP50, d1RowsReadP95, d1RowsReadMax, d1RowsWrittenP50, d1RowsWrittenP95, d1RowsWrittenMax, responseBytesP50, responseBytesP95, responseBytesMax |
| demo-session-setup | partial | POST /api/demo/session | wallMsP50, wallMsP95, wallMsMax, workerCpuMsP50, workerCpuMsP95, workerCpuMsMax, workerWallMsP50, workerWallMsP95, workerWallMsMax, d1DurationMsP50, d1DurationMsP95, d1DurationMsMax, queryCountP50, queryCountP95, queryCountMax, d1RowsReadP50, d1RowsReadP95, d1RowsReadMax, d1RowsWrittenP50, d1RowsWrittenP95, d1RowsWrittenMax |
| spelling-command | requires-production-operator | POST /api/subjects/spelling/command | count, wallMsP50, wallMsP95, wallMsMax, workerCpuMsP50, workerCpuMsP95, workerCpuMsMax, workerWallMsP50, workerWallMsP95, workerWallMsMax, d1DurationMsP50, d1DurationMsP95, d1DurationMsMax, queryCountP50, queryCountP95, queryCountMax, d1RowsReadP50, d1RowsReadP95, d1RowsReadMax, d1RowsWrittenP50, d1RowsWrittenP95, d1RowsWrittenMax, responseBytesP50, responseBytesP95, responseBytesMax |
| grammar-command | partial | POST /api/subjects/grammar/command | workerCpuMsP50, workerCpuMsP95, workerCpuMsMax, workerWallMsP50, workerWallMsP95, workerWallMsMax, d1DurationMsP50, d1DurationMsP95, d1DurationMsMax |
| punctuation-command | requires-production-operator | POST /api/subjects/punctuation/command | count, wallMsP50, wallMsP95, wallMsMax, workerCpuMsP50, workerCpuMsP95, workerCpuMsMax, workerWallMsP50, workerWallMsP95, workerWallMsMax, d1DurationMsP50, d1DurationMsP95, d1DurationMsMax, queryCountP50, queryCountP95, queryCountMax, d1RowsReadP50, d1RowsReadP95, d1RowsReadMax, d1RowsWrittenP50, d1RowsWrittenP95, d1RowsWrittenMax, responseBytesP50, responseBytesP95, responseBytesMax |
| parent-summary-hub-read | auth-gated | GET /api/hubs/parent | count, wallMsP50, wallMsP95, wallMsMax, workerCpuMsP50, workerCpuMsP95, workerCpuMsMax, workerWallMsP50, workerWallMsP95, workerWallMsMax, d1DurationMsP50, d1DurationMsP95, d1DurationMsMax, queryCountP50, queryCountP95, queryCountMax, d1RowsReadP50, d1RowsReadP95, d1RowsReadMax, d1RowsWrittenP50, d1RowsWrittenP95, d1RowsWrittenMax, responseBytesP50, responseBytesP95, responseBytesMax |
| admin-production-evidence-overview | auth-gated | GET /api/admin/ops/production-evidence | count, wallMsP50, wallMsP95, wallMsMax, workerCpuMsP50, workerCpuMsP95, workerCpuMsMax, workerWallMsP50, workerWallMsP95, workerWallMsMax, d1DurationMsP50, d1DurationMsP95, d1DurationMsMax, queryCountP50, queryCountP95, queryCountMax, d1RowsReadP50, d1RowsReadP95, d1RowsReadMax, d1RowsWrittenP50, d1RowsWrittenP95, d1RowsWrittenMax, responseBytesP50, responseBytesP95, responseBytesMax |
| hero-read-model | feature-gated | GET /api/hero/read-model | count, wallMsP50, wallMsP95, wallMsMax, workerCpuMsP50, workerCpuMsP95, workerCpuMsMax, workerWallMsP50, workerWallMsP95, workerWallMsMax, d1DurationMsP50, d1DurationMsP95, d1DurationMsMax, queryCountP50, queryCountP95, queryCountMax, d1RowsReadP50, d1RowsReadP95, d1RowsReadMax, d1RowsWrittenP50, d1RowsWrittenP95, d1RowsWrittenMax, responseBytesP50, responseBytesP95, responseBytesMax |
| hero-command-start | feature-gated | POST /api/hero/command | count, wallMsP50, wallMsP95, wallMsMax, workerCpuMsP50, workerCpuMsP95, workerCpuMsMax, workerWallMsP50, workerWallMsP95, workerWallMsMax, d1DurationMsP50, d1DurationMsP95, d1DurationMsMax, queryCountP50, queryCountP95, queryCountMax, d1RowsReadP50, d1RowsReadP95, d1RowsReadMax, d1RowsWrittenP50, d1RowsWrittenP95, d1RowsWrittenMax, responseBytesP50, responseBytesP95, responseBytesMax |
| hero-command-claim | feature-gated | POST /api/hero/command | count, wallMsP50, wallMsP95, wallMsMax, workerCpuMsP50, workerCpuMsP95, workerCpuMsMax, workerWallMsP50, workerWallMsP95, workerWallMsMax, d1DurationMsP50, d1DurationMsP95, d1DurationMsMax, queryCountP50, queryCountP95, queryCountMax, d1RowsReadP50, d1RowsReadP95, d1RowsReadMax, d1RowsWrittenP50, d1RowsWrittenP95, d1RowsWrittenMax, responseBytesP50, responseBytesP95, responseBytesMax |
| hero-command-camp | feature-gated | POST /api/hero/command | count, wallMsP50, wallMsP95, wallMsMax, workerCpuMsP50, workerCpuMsP95, workerCpuMsMax, workerWallMsP50, workerWallMsP95, workerWallMsMax, d1DurationMsP50, d1DurationMsP95, d1DurationMsMax, queryCountP50, queryCountP95, queryCountMax, d1RowsReadP50, d1RowsReadP95, d1RowsReadMax, d1RowsWrittenP50, d1RowsWrittenP95, d1RowsWrittenMax, responseBytesP50, responseBytesP95, responseBytesMax |

## Residual Gaps

- Worker CPU remains `unknown` wherever the input evidence has no joined Cloudflare CPU telemetry.
- Quota cells marked `lower-bound` have missing measured route or metric coverage; green/amber lower bounds stay `unknown` rather than becoming capacity claims.
- Parent/admin reads are modelled only when a measured parent/admin route summary is present; otherwise the ledger records a missing-route warning rather than inventing D1 cost.
- The worksheet uses measured route costs with modelled daily usage assumptions; it is an internal planning ledger, not a launch claim.
