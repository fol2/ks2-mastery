---
title: "System Hardening Optimisation P7 — Statement-Family Summary"
type: diagnostic-summary
status: completed
date: 2026-05-01
phase: P7
language: en-GB
certifying: false
---

# System Hardening Optimisation P7 — Statement-Family Summary

## Scope

Run: `2026-05-01-p6-60-diagnostic`

Route: `GET /api/bootstrap`

This is a redacted engineering summary. It intentionally omits raw SQL, raw request ids, cookies, emails, account ids, learner ids and learner names.

## Coverage

- bootstrap requests analysed: 80
- top-tail samples analysed: 10
- bootstrap statements analysed: 880
- truncated statement-log requests: 0

## Statement Families

| Family | Count | Top-tail duration P95 ms | Rows read P95 | Rows written P95 | Candidate | Notes |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| account-row-selected-learner | 80 | 114 | 1 | n/a | yes | Bootstrap account row used for selected learner, account revision and role fields. |
| account-upsert | 80 | 178 | 1 | n/a | no | Authenticated account upsert/refresh before route handling; returns the account row. |
| demo-active-account-guard | 80 | 149 | 1 | n/a | yes | Demo-only active-account guard; can reuse a trusted account snapshot before falling back to D1. |
| auth-session-account-row | 80 | 174 | 1 | n/a | no | Session/account authentication lookup; already required before route handling. |
| learner-list-revision | 80 | 80 | 0 | n/a | no | Learner-list revision ingredient for bootstrap cache invalidation. |
| monster-visual-config-pointer | 80 | 79 | 1 | n/a | no | Compact monster visual runtime pointer. |
| membership-learner-rows | 80 | 0.504 | 4 | 0 | no | Writable learner membership rows and learner revisions. |
| child-game-state | 80 | 0.592 | 0 | 0 | no | Child game-state rows for selected and sibling learner correctness. |
| public-event-rows | 80 | 0.506 | 0 | 0 | no | Bounded public event rows for first paint. |
| public-session-rows | 80 | 0.314 | 0 | 0 | no | Bounded public practice-session rows for first paint. |
| child-subject-state | 80 | 0.226 | 0 | 0 | no | Child subject-state rows for selected and sibling learner correctness. |

## Ranked P7-U2 Candidates

1. `account-row-selected-learner` — The authenticated route already has an account row from ensureAccount; pass it into bootstrap instead of re-reading.
2. `demo-active-account-guard` — The authenticated route already has a trusted demo account snapshot; use it before falling back to the existing guard.

## Redaction Contract

- No raw SQL or raw statement names are persisted.
- No raw Worker tail request identifiers are persisted.
- No cookies, bearer tokens, emails, account ids, learner ids or learner names are persisted.
- This artefact is diagnostic-only and does not certify 60 learners.
