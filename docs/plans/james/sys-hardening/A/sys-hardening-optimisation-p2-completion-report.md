---
title: "System Hardening Optimisation P2 Completion Report"
type: completion-report
status: implementation-merged
date: 2026-04-29
route: system-hardening-and-optimisation
owner: james / engineering agent
source_plan: docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p2.md
implementation_plan: docs/plans/2026-04-29-012-feat-sys-hardening-optimisation-p2-bootstrap-tail-plan.md
implementation_pr: https://github.com/fol2/ks2-mastery/pull/652
implementation_merge_commit: aa4e69070dab53281a7342cc1ed19b0a01fda0fa
implementation_merged_at: 2026-04-29T21:06:22Z
evidence_commit: e5d03117bd7c46c269bf1d75cceca42b31452bc8
terminal_path: P2-U3 evidence-capture repair
---

# System Hardening Optimisation P2 Completion Report

## Executive Summary

System Hardening Optimisation P2 completed as a merged evidence-capture and hardening slice. It did not certify a new classroom capacity tier, and that is the correct outcome.

The core result is a sharper truth boundary around `/api/bootstrap` tail latency after P1:

- A post-P1 strict 30-learner run, T1, passed the existing 30-learner beta threshold shape.
- A repeated strict 30-learner run, T5, failed the same threshold shape on bootstrap P95.
- The failed repeated run supersedes the single passed run for certification confidence.
- Tail statement coverage was complete, but Cloudflare invocation CPU/wall telemetry was unavailable for the top-tail samples.
- The selected terminal path is therefore P2-U3 evidence-capture repair, not D1 tuning, Worker CPU optimisation, payload reduction, launch policy, or certification.

Public capacity status remains `small-pilot-provisional`. The Admin Production Evidence summary remains fail-closed. No public or admin wording should claim 30-learner beta certification from this P2 evidence.

The most valuable P2 outcome is not a speed improvement. It is the prevention of a false promotion. The evidence now shows that a single passing strict run is not stable enough, and that the current tail-correlation path cannot yet attribute the failed repeat to D1, Worker CPU, platform variance, client/network overhead, or launch policy with enough confidence to justify a code mitigation.

## Completion Boundary

This report uses "completion" in the SDLC-delivery sense: the implementation PR was built, independently reviewed, corrected, re-reviewed, verified by CI, merged, and its remote branch was cleaned up.

It does not mean P2 certified the 30-learner classroom beta target. It also does not mean the bootstrap-tail root cause has been isolated. P2 ended with a deliberate non-certifying outcome because the repeated strict run failed and the required invocation telemetry was absent.

| Area | Final status | Notes |
| --- | --- | --- |
| Implementation PR | Merged | PR #652 merged to `main` at `aa4e69070dab53281a7342cc1ed19b0a01fda0fa`. |
| Remote implementation branch | Cleaned | `codex/sys-hardening-p2-bootstrap-tail` was deleted after merge. |
| Evidence lock | Complete | T1, T5, tail-correlation, statement-map, evidence summary, and budget artefacts are committed. |
| Capacity certification | Not promoted | T5 failed bootstrap P95 at 1,354.5 ms vs 1,000 ms. |
| Tail attribution | Incomplete by design | Statement logs matched, invocation CPU/wall logs did not. |
| Security/privacy hardening | Strengthened | Raw request IDs and SQL/table shapes are redacted from committed artefacts; setup-failure messages are sanitised. |
| Provenance hardening | Strengthened | Verifier now rejects locally-present but HEAD-unreachable evidence commits. |
| UI/UX impact | None | No user-facing UI was changed, so no `/frontend-designer` involvement was required. |

## SDLC Record

The requested SDLC loop was completed for the implementation PR:

| Phase | Outcome |
| --- | --- |
| Independent worker implementation | The implementation branch added P2 evidence artefacts, tail-script contracts, evidence-summary handling, setup-failure persistence, diagnostic redaction, provenance hardening, docs, and tests. |
| Independent review round 1 | Reviewers found valid issues in diagnostic classification, generated-test churn, setup-failure persistence, diagnostic artefact leakage, and stale capacity docs. |
| Review follower fixes | The branch corrected evidence-summary classification, temp-output tests, setup-failure evidence persistence, diagnostic request/statement redaction, and capacity status docs. |
| Independent review round 2 | Reviewers found raw request IDs still persisted in strict evidence and a dangling local evidence commit that passed the older object-existence probe. |
| Review follower fixes round 2 | Persisted evidence request IDs are now redacted by default; verifier now requires evidence commits to be reachable from HEAD; the original evidence commit is preserved in main history by merge commit. |
| Final QA/review | Final QA reported no blockers/P1/P2. Focused review reported only a PR-body metadata P2, which was resolved by adding an explicit completion-report follow-up section. |
| CI gate | GitHub checks were green: `npm test + npm run check`, `npm run audit:client`, `npm run audit:punctuation-content`, path classification, and GitGuardian. |
| Merge | PR #652 was merged with a merge commit, not squash, so the evidence commit remains reachable. |
| Branch cleanup | The remote feature branch was deleted. |

## Evidence Outcome

### Strict 30 T1

Artefact: `reports/capacity/evidence/2026-04-29-p2-t1-strict-post-p1.json`

T1 passed the strict 30-learner threshold shape:

| Metric | Result |
| --- | ---: |
| Learners | 30 |
| Bootstrap burst | 20 |
| Rounds | 1 |
| Total requests | 170 |
| Bootstrap P50 | 204.1 ms |
| Bootstrap P95 | 814.6 ms |
| Bootstrap max | 818.2 ms |
| Command P95 | 309.7 ms |
| Max response bytes | 29,588 |
| 5xx | 0 |
| Network failures | 0 |
| Hard capacity signals | 0 |
| Bootstrap query count P95/max | 11 / 11 |
| Bootstrap D1 rows read P95/max | 9 / 9 |
| Bootstrap D1 rows written P95/max | 0 / 0 |

T1 is useful evidence because it proves the P1 post-change system can pass the strict shape once. It is not sufficient for certification because P2 required repeated strict evidence.

### Strict 30 T5

Artefact: `reports/capacity/evidence/2026-04-29-p2-t5-strict-repeat-1.json`

T5 failed the repeated strict 30-learner threshold shape:

| Metric | Result |
| --- | ---: |
| Learners | 30 |
| Bootstrap burst | 20 |
| Rounds | 1 |
| Total requests | 170 |
| Bootstrap P50 | 233.8 ms |
| Bootstrap P95 | 1,354.5 ms |
| Bootstrap max | 2,062.2 ms |
| Command P95 | 418.0 ms |
| Max response bytes | 29,589 |
| 5xx | 0 |
| Network failures | 0 |
| Hard capacity signals | 0 |
| Bootstrap query count P95/max | 11 / 11 |
| Bootstrap D1 rows read P95/max | 9 / 9 |
| Bootstrap D1 rows written P95/max | 0 / 0 |
| Failed threshold | `maxBootstrapP95Ms` |

This is the decisive capacity outcome for P2. The failed repeat blocks any 30-learner beta certification claim.

## Tail Attribution

P2 captured diagnostic tail-correlation and statement-map artefacts:

- `reports/capacity/evidence/2026-04-29-p2-t1-tail-correlation.json`
- `reports/capacity/evidence/2026-04-29-p2-t5-tail-correlation.json`
- `reports/capacity/evidence/2026-04-29-p2-t1-statement-map.json`
- `reports/capacity/evidence/2026-04-29-p2-t5-statement-map.json`
- `reports/capacity/evidence/2026-04-29-p2-tail-classification.md`

The statement maps were complete:

| Run | Statement coverage | Expected statements | Truncation |
| --- | ---: | ---: | --- |
| T1 | 144/144 requests | 1,968/1,968 | none |
| T5 | 171/171 requests | 2,629/2,629 | none |

But invocation CPU/wall telemetry was absent for the top-tail bootstrap samples:

| Run | Top-tail invocation CPU/wall matches | Statement-log matches | Classification |
| --- | ---: | ---: | --- |
| T1 | 0/10 | 10/10 | diagnostic-only |
| T5 | 0/10 | 10/10 | `unclassified-insufficient-logs` |

That distinction is the central technical lesson. Complete statement logs can prove the query shape stayed bounded, but they cannot prove whether the remaining tail came from D1 duration share, Worker CPU, platform/client overhead, launch variance, or a missing telemetry layer. P2 therefore correctly stopped at evidence-capture repair.

## What Changed

### Evidence and Documentation

P2 added or updated the committed evidence set for the strict 30-learner attempt:

- strict T1 production evidence;
- strict repeated T5 production evidence;
- T1/T5 tail-correlation diagnostics;
- T1/T5 statement maps;
- P2 tail-classification markdown;
- latest evidence summary;
- refreshed 1000-learner budget ledger and operations docs.

The capacity operations docs now make T5 the current 30-learner evidence row and explicitly keep public status non-certified.

### Tail Script Contract

P2 added `npm run ops:tail:json` behind the OAuth-safe Wrangler wrapper. This matters because the earlier attempt to pass `--format json` through `npm run ops:tail -- --format json` produced duplicate `--format` values. The package script gives operators a stable, reviewed path rather than relying on ad-hoc CLI argument stacking.

### Generated Summary Classification

The evidence-summary generator was corrected so standalone diagnostic artefacts are excluded from certification metrics, while valid capacity-run payloads that embed `diagnostics.workerLogJoin` remain eligible for normal capacity-run interpretation.

This closed a false-negative path where real capacity evidence could be ignored just because it carried diagnostic context.

### Setup-Failure Evidence

The classroom load driver now persists non-certifying setup-failure evidence when `--output` is supplied before rejecting. This prevents a setup-phase failure from disappearing from the evidence trail.

The review process then tightened that change: persisted setup-failure evidence no longer stores backend free-form response messages. It records safe code-based/generic messages instead, preventing SQL/table names, request IDs, secrets, or debug text from being committed through error bodies.

### Request ID and Statement Redaction

P2 introduced a persistence-boundary redaction layer for capacity evidence:

- raw `ks2_req_*` request IDs are replaced with deterministic opaque `req_<hash>` identifiers;
- committed diagnostic files use opaque request IDs;
- statement-map output uses opaque `stmt_<hash>` identifiers;
- SQL/table/column names are not committed in P2 diagnostic artefacts;
- tail joins can still match redacted persisted evidence back to raw local logs without committing the raw IDs.

This is a meaningful hardening improvement. The privacy boundary now lives in code and tests, not in operator memory.

### Evidence Provenance

The verifier previously checked whether an evidence commit existed in the local git object database. A dangling commit can satisfy that check locally while still being unreachable from a clean clone.

P2 closed that route:

- `scripts/verify-capacity-evidence.mjs` now requires the evidence commit to be reachable from `HEAD` in full clones.
- A regression test creates a dangling commit with `git commit-tree` and proves verification fails closed.
- PR #652 was merged with a merge commit, not squash, so evidence commit `e5d03117bd7c46c269bf1d75cceca42b31452bc8` remains reachable from `origin/main`.

This turned a reviewer-discovered provenance weakness into a durable verifier rule.

## Capacity Interpretation

P2 makes several things clear:

1. The P1 bootstrap query reduction helped enough for one strict pass, but not enough for stable repeated certification.
2. The failed T5 repeat did not show query-count growth, bootstrap row growth, response-byte pressure, 5xx errors, network failures, or hard capacity signals.
3. The failure was concentrated in bootstrap P95 wall time.
4. App-exposed server wall for top-tail T5 samples ranged below the largest client-observed bootstrap walls, but without Cloudflare invocation CPU/wall telemetry the gap cannot be classified responsibly.
5. The current evidence does not justify a D1/index change because bootstrap query count and D1 rows read stayed stable and the statement map made no query-plan recommendation.
6. The current evidence does not justify Worker CPU or JSON serialisation optimisation because Worker CPU is unknown.
7. The current evidence does not justify payload reduction because bootstrap response size stayed around 2,449 bytes, far below the configured cap.
8. The current evidence does not justify a launch/warm-up policy as a certification workaround because the repeated strict run still failed the gate.

The practical conclusion: P2 narrowed the problem from "maybe optimise bootstrap" to "repair invocation telemetry and repeat strict evidence before selecting a mitigation".

## Certification Decision

No capacity certification was promoted.

| Target | Final P2 decision | Reason |
| --- | --- | --- |
| Family demo | No change | Not the P2 certification target. |
| Small pilot | Remains provisional | Public status stays `small-pilot-provisional`. |
| 30-learner classroom beta | Not certified | T5 repeated strict run failed bootstrap P95. |
| 60-learner stretch | Not certified | Latest 60-learner evidence remains diagnostic and previously failed bootstrap P95. |
| 100+ school-ready | Not certified | Requires separate repeated higher-scale runs and operational evidence. |
| 1000+ free-tier lighthouse | Not certified | Ledger remains modelling-only; D1 rows read are still the first obvious pressure point and Worker CPU remains unknown. |

The P2 terminal outcome is evidence-capture repair, not optimisation or certification.

## Review Findings Closed

The review process materially improved the final state. The main issues found and closed were:

| Finding | Final resolution |
| --- | --- |
| Diagnostic-only artefacts could be confused with capacity-run metrics | Generator now excludes standalone diagnostics while preserving embedded diagnostics in real capacity runs. |
| Evidence-summary tests churned tracked generated JSON | Tests now write to deterministic temp output. |
| Setup failures could vanish before evidence persistence | Setup-failure evidence is now written when `--output` is supplied. |
| Setup-failure evidence could persist backend free-form messages | Persisted messages are now generic/code-based and covered by hostile-message tests. |
| Diagnostic artefacts leaked raw request IDs and SQL/table names | Request IDs and statements are deterministically redacted in committed artefacts. |
| Strict capacity evidence still contained raw request IDs | Persistence-boundary redaction now hashes raw request IDs by default. |
| Capacity status docs pointed at stale evidence | `docs/operations/capacity.md` now names the P2 T5 strict-repeat failure as current. |
| Evidence commit provenance depended on a dangling local object | Verifier now requires HEAD reachability, and the implementation PR preserved the original evidence commit in main history. |
| PR metadata blurred implementation completion and report follow-up | PR body and source docs now state that the final completion report is a dedicated post-merge PR. |

## Validation

Local validation before PR #652 merge included:

- `node --test tests/bundle-audit.test.js`
- `node --test tests/build-public.test.js`
- `node --test tests/capacity-scripts.test.js tests/capacity-worker-log-join.test.js tests/capacity-evidence.test.js tests/capacity-statement-map.test.js tests/generate-evidence-summary.test.js tests/verify-capacity-evidence.test.js` - 223 tests, 0 failed
- `npm test` - 13,367 tests, 0 failed, 6 skipped
- `npm run capacity:verify-evidence` - passed, 4 rows checked
- `npm run check` - passed, including custom build dry-run and client bundle audit
- `git diff --check`
- raw request-ID scan across the seven P2 strict/diagnostic artefacts - no matches
- SQL/table/secret-shape scan across the seven P2 strict/diagnostic artefacts - no matches
- `git merge-base --is-ancestor e5d03117bd7c46c269bf1d75cceca42b31452bc8 HEAD` - exit 0 before merge

GitHub checks before merge were green:

- `npm test + npm run check` - pass
- `npm run audit:client` - pass
- `npm run audit:punctuation-content` - pass
- path classification checks - pass
- GitGuardian - pass
- Chromium/mobile golden paths - skipped by path classification, because this PR did not touch UI flow code

The report branch is expected to run its own CI gate as a documentation-only follow-up.

## Operational Handoff

Operators should treat the following as the P2 operating stance:

- Do not promote 30-learner beta certification.
- Do not use the passed T1 run alone as a capacity claim.
- Treat T5 as the current strict 30 decision row.
- Keep tail-correlation and statement-map artefacts diagnostic-only.
- Use `npm run capacity:verify-evidence` after any evidence/doc change.
- Use `npm run ops:tail` or `npm run ops:tail:json` for future bounded tail captures.
- Keep raw tail exports out of git.
- Commit only opaque request and statement identifiers.
- Preserve merge commits for evidence branches when evidence files cite intermediate run commits.

## Residual Blockers

P2 leaves these blockers open by design:

1. The pretty-tail capture path did not provide machine-joinable Cloudflare invocation CPU/wall telemetry for top-tail bootstrap samples.
2. T5 failed `maxBootstrapP95Ms`, so 30-learner beta certification remains blocked.
3. The available statement evidence is complete but not sufficient to choose D1/query-shape work without invocation CPU/wall attribution.
4. Worker CPU and outer JSON serialisation cost remain unknown for the failed repeat.
5. The 60-learner stretch remains diagnostic and non-certified.
6. 1000-learner work remains modelling-only; D1 read economics remain the first obvious pressure point, but CPU is still unknown.

## Recommended Next Step

The next slice should be a narrow evidence-capture repair, not a performance optimisation.

Recommended scope:

1. Produce a machine-joinable Cloudflare invocation log export for the strict 30 top-tail window, or add a documented private capture route that reliably records invocation CPU/wall for retained top-tail request IDs.
2. Keep committed artefacts redacted with the same `req_<hash>` and `stmt_<hash>` boundary.
3. Re-run strict 30 T1/T5 after telemetry capture is proven.
4. Only choose D1, Worker CPU, payload, or launch-policy mitigation after the new evidence classifies the failed tail.
5. Keep 60-learner and 1000-learner evidence diagnostic until separate policy and thresholds are approved.

The most tempting wrong next move is to optimise the route that feels likely. P2's evidence says not to do that yet. The right next move is to make the missing telemetry impossible to miss.

## Final Decision

P2 is complete as an SDLC delivery slice and merged into `main`.

P2 is not complete as a capacity-certification phase. It ended with an honest blocker:

> The post-P1 system can pass the strict 30-learner shape once, but the repeated strict run failed bootstrap P95, and current tail logs cannot attribute the failure to a specific resource. Public capacity remains `small-pilot-provisional`.

That is a useful result. It protects users and operators from a false claim, and it gives the next engineering slice a precise target: repair invocation-level tail telemetry, then re-run the strict evidence gate.
