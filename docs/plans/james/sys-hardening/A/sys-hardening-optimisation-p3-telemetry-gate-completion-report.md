---
title: "System Hardening Optimisation P3 Telemetry Gate Completion Report"
type: completion-report
status: completed
language: en-GB
date: 2026-04-30
route: system-hardening-and-optimisation
owner: james / engineering agent
implementation_pr: https://github.com/fol2/ks2-mastery/pull/699
merge_result_commit: 32cd5a306f62245cbfb81893934a7aab6e5fc062
source_contract: docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p3.md
source_plan: docs/plans/2026-04-30-001-feat-sys-hardening-optimisation-p3-telemetry-gate-plan.md
source_baseline: docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p3-baseline.md
certification_status: non-certifying
recommended_next_path: p3-operator-smoke-and-strict-telemetry-capture
---

# System Hardening Optimisation P3 Telemetry Gate Completion Report

## Executive Summary

PR #699, `feat(capacity): harden P3 worker telemetry gate`, has completed the full SDLC loop and was merged to `main` on 2026-04-30 as squash merge result commit `32cd5a306f62245cbfb81893934a7aab6e5fc062`.

This was a repo-local P3 telemetry-gate delivery. It did not run production strict P3 capacity evidence, did not certify 30 learners, did not promote public capacity wording, and did not choose a D1, Worker CPU, payload, platform, or policy optimisation. That boundary is intentional. The merged work makes the next P3 evidence run decision-grade by forcing invocation CPU/wall telemetry, statement-log coverage, redaction, raw-log retention, and warning semantics to be explicit.

The current public capacity status remains:

> `small-pilot-provisional`

The most responsible next path is not a performance mitigation PR. It is a bounded P3 operator smoke and strict 30 rerun using the new canonical Worker/Tail JSONL capture flow. Only after that run has finite invocation CPU/wall coverage can the final P3 decision report classify the bottleneck or exit as `telemetry-repair-failed`.

## What Shipped

| Area | Outcome |
| --- | --- |
| Baseline lock | Added a P3 baseline document that preserves the P2 truth: T1 passed once, T5 failed repeat, and P2 remains non-certifying. |
| Canonical telemetry path | Extended the Worker log joiner to parse canonical `cf-worker-event` JSONL records with Cloudflare CPU, wall, outcome, timestamp, method, URL, and request-id material. |
| Warning semantics | Added machine-readable warnings for capture-window mismatch and insufficient invocation coverage. Semantic gate warnings are emitted before bounded malformed-line parser warnings. |
| Coverage separation | Kept invocation CPU/wall coverage separate from sampled `capacity.request` statement-log coverage, preventing a repeat of the P2 false-confidence shape. |
| Redaction posture | Preserved hashed `req_<hash>` and `stmt_<hash>` output for committed production-derived diagnostic artefacts. |
| Synthetic fixture boundary | Documented that raw-looking request IDs are acceptable only inside synthetic, production-free parser fixtures, not in production-derived committed evidence. |
| Raw log guardrails | Added `.gitignore` protection and tests so raw `worker-log`, `worker-tail`, `pretty-tail`, `raw-tail`, `tail-raw`, and plain `*-tail.jsonl` captures stay local. |
| Operations docs | Updated the operator capture flow, artefact matrix, warning interpretation, and `telemetry-repair-failed` exit path. |

The changed files in the merged implementation were:

- `docs/operations/capacity-cpu-d1-evidence.md`
- `docs/operations/capacity-tail-latency.md`
- `docs/plans/2026-04-30-001-feat-sys-hardening-optimisation-p3-telemetry-gate-plan.md`
- `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p3-baseline.md`
- `reports/capacity/.gitignore`
- `scripts/join-capacity-worker-logs.mjs`
- `tests/capacity-raw-log-gitignore.test.js`
- `tests/capacity-worker-log-join.test.js`
- `tests/fixtures/capacity-worker-logs/p3-invocation-export.jsonl`

## Evidence Baseline Preserved

The merged branch deliberately preserves the P2 completion truth:

| Run | Result | Bootstrap P95 | Bootstrap max | Command P95 | Max response bytes | Interpretation |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| P2 T1 strict post-P1 | Pass | 814.6 ms | 818.2 ms | 309.7 ms | 29,588 B | Positive single-run evidence only. |
| P2 T5 strict repeat 1 | Fail | 1,354.5 ms | 2,062.2 ms | 418.0 ms | 29,589 B | Active strict 30 decision row; blocks certification. |

The P2 tail-correlation truth also remains unchanged:

| Run | Top-tail samples | Invocation CPU/wall matched | Statement logs matched | Classification |
| --- | ---: | ---: | ---: | --- |
| P2 T1 | 10 | 0 | 10 | `unclassified-insufficient-logs` |
| P2 T5 | 10 | 0 | 10 | `unclassified-insufficient-logs` |

This distinction matters. P2 already had complete sampled statement logs for top-tail requests, but it had zero finite invocation CPU/wall matches. Without the merged P3 gate, it was too easy to misread "statement coverage matched" as "Worker execution attribution complete". PR #699 closes that specific false-pass route.

## Review Cycle and Fixes

The implementation followed the requested independent SDLC loop:

1. A worker implementation delivered PR #699.
2. Independent reviewers inspected the PR.
3. Review-follower fixes were applied to the same PR branch.
4. A second independent review rechecked the fixes.
5. The branch was rebased onto latest `origin/main`.
6. Remote PR CI was re-run and passed before merge.
7. The implementation PR was merged and its remote branch was deleted.

The first review round found valid issues:

| Finding | Resolution |
| --- | --- |
| Semantic P3 warnings could be displaced by malformed-line parser warnings under the 20-warning cap. | `buildJoinWarnings` now emits gate warnings first, then parser warnings. A regression test verifies both semantic warnings survive noisy malformed input. |
| Raw log guardrails did not cover the documented `/tmp/ks2-${P3_RUN}-worker-tail.jsonl` naming pattern or plain `*-tail.jsonl`. | `.gitignore`, docs, and tests now cover `worker-tail` and plain `*-tail` raw log names while preserving redacted `*-tail-correlation.json` and `*-statement-map.json`. |
| The execution plan frontmatter overstated completion scope. | The plan now says `status: tooling-complete` and explicitly states that production strict evidence, classification, and final P3 decision remain follow-up. |
| "Redacted fixture" wording conflicted with a synthetic fixture containing raw-looking IDs. | The plan now distinguishes committed production-derived evidence artefacts from synthetic parser fixtures. |
| Initial remote Node CI failed on a punctuation reviewer-pack fixture unrelated to the branch. | The branch was later rebased onto updated `main`, which included the upstream fixture fix, then remote PR CI passed on the rebased head. |

The second independent review found no P0/P1/P2 blockers in `origin/main...HEAD`. It verified the gate-warning ordering, raw-log ignore behaviour, completion-scope wording, synthetic fixture boundary, focused tests, full `npm test`, and whitespace checks. Release review separately confirmed the PR-head checks were green, then correctly identified that the branch needed latest-`main` integration before merge. That freshness issue was resolved by rebasing to `origin/main` and re-running remote CI.

## Verification Performed

Local verification before the final rebase included:

- `node --test tests/capacity-worker-log-join.test.js tests/capacity-raw-log-gitignore.test.js` - 12/12 passed.
- `npm test` - 14,063 total, 14,057 passed, 0 failed, 6 skipped.
- `npm run check` - passed, including build, public build assertion, client bundle audit, and Wrangler dry-run.
- `npm run capacity:verify-evidence` - passed, 4 capacity rows checked.
- `git diff --check` - passed.

After rebasing onto latest `origin/main`, local integration verification included:

- `node --test tests/capacity-worker-log-join.test.js tests/capacity-raw-log-gitignore.test.js` - 12/12 passed.
- `npm run capacity:verify-evidence` - passed, 4 capacity rows checked.
- `npm run check` - passed, including client bundle audit with main bundle 227,070 / 227,500 bytes gzip.
- `git diff --check origin/main...HEAD` - passed.

Remote PR CI on the rebased head `97ef43c56d968692331c7083ab99835e96952cd5` passed before merge:

| Check | Result |
| --- | --- |
| `npm test + npm run check` | Pass, 3m11s |
| `npm run audit:client` | Pass |
| `npm run audit:punctuation-content` | Pass |
| `Classify changed paths` | Pass |
| `GitGuardian Security Checks` | Pass |
| `Chromium + mobile-390 golden paths` | Skipped by path classifier |

## Security and Privacy Posture

The merged work improves the evidence pipeline without increasing the committed-data surface.

Raw Cloudflare Worker/Tail captures remain operator-held and outside git. If an operator temporarily places a raw capture under `reports/capacity/evidence/`, the new ignore rules keep common raw naming patterns local-only. Committed diagnostic artefacts remain redacted and diagnostic-only.

The important security distinction is:

- Synthetic parser fixtures can contain raw-looking IDs to prove parser behaviour.
- Production-derived committed artefacts must not contain raw `ks2_req_*`, SQL text, table or column names, cookies, bearer tokens, learner names, answers, request bodies, or response bodies.

This keeps the repo useful for deterministic tests while preserving the fail-closed redaction stance for live evidence.

## Product and Operations Impact

There is no learner-facing UX change and no adult-facing product copy change. No frontend UI was altered, so no frontend design review was needed for this slice.

Admin and Operations evidence semantics remain conservative:

- Diagnostic Worker-log joins cannot certify a run.
- A passing single strict run cannot displace the failed P2 T5 repeat.
- Public capacity wording remains `small-pilot-provisional`.
- `reports/capacity/latest-1000-learner-budget.json` remains modelling-only and non-certifying.

The operational improvement is that the next P3 run now has a concrete capture checklist and a deterministic way to reject three common bad evidence states:

- The raw log capture window does not overlap the capacity run.
- Statement logs match but invocation CPU/wall coverage is still zero.
- Parser noise would otherwise hide the semantic gate warning.

## What This Does Not Prove

This report should not be read as a production capacity certification.

The merged PR does not prove:

- that 30 learners are now certified;
- that P2 T5 was caused by D1;
- that P2 T5 was caused by Worker CPU;
- that P2 T5 was caused by payload size;
- that platform/client overhead was the cause;
- that a paid-tier migration is required;
- that a threshold relaxation is safe;
- that 60, 100, 300, or 1000 learners are supportable.

Those claims require a later P3 strict production evidence run with finite invocation CPU/wall joins and verifier-backed evidence.

## Recommended Next Path

The recommended next path is `p3-operator-smoke-and-strict-telemetry-capture`.

That should be a separate PR or tightly tracked evidence run with this sequence:

1. Run a bounded non-certifying P3 smoke capture against production using `npm run ops:tail:json` and a local raw path such as `/tmp/ks2-<run>-worker-tail.jsonl`.
2. Join the smoke evidence to the raw JSONL capture and confirm finite invocation CPU/wall matches.
3. If the smoke capture cannot produce finite invocation CPU/wall, exit as `telemetry-repair-failed` and do not start optimisation work.
4. If the smoke capture is healthy, run strict 30 evidence using `reports/capacity/configs/30-learner-beta.json`.
5. Produce redacted `*-tail-correlation.json`, `*-statement-map.json`, and classification output.
6. Run the verifier and keep Admin/public capacity wording unchanged unless repeated strict evidence passes.
7. Write the final P3 decision report selecting exactly one next path: capacity-status promotion candidate, classified mitigation, unclassified continuation, or telemetry-repair failure.

The key product decision remains deliberately deferred. This merged PR makes the decision safer; it does not replace the decision.

## Final SDLC State

| Item | State |
| --- | --- |
| Implementation PR | Merged: https://github.com/fol2/ks2-mastery/pull/699 |
| Squash merge result commit | `32cd5a306f62245cbfb81893934a7aab6e5fc062` |
| Remote implementation branch | Deleted: `codex/sys-hardening-p3-telemetry` |
| Local gate | Passed |
| Remote PR CI | Passed before merge |
| Public capacity status | Unchanged: `small-pilot-provisional` |
| Certification status | Non-certifying |
| Next recommended action | P3 operator smoke and strict telemetry capture |
