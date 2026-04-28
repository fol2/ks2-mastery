---
title: "System Hardening P6 Completion Report"
type: report
status: completed
date: 2026-04-28
branch: codex/sys-hardening-p6-capacity
source_plan: docs/plans/2026-04-28-006-fix-p6-capacity-certification-handover-plan.md
---

# System Hardening P6 Completion Report

## Executive Summary

P6 completed as an evidence-hardening and operations-handover slice, not as a capacity promotion. The 30-learner classroom beta remains **not certified** because the latest committed production evidence still fails the strict bootstrap P95 gate: `/api/bootstrap` P95 is 1,167.4 ms against the 1,000 ms ceiling. The failure is narrow: command latency, payload size, 5xx count, network failures, capacity signals, query count, and D1 rows all remain healthy. That makes threshold relaxation tempting, but still unjustified without repeated diagnostic evidence and an owner-reviewed policy record.

The most important change in this PR is that the system now fails closed around capacity evidence. A stale summary refresh cannot make old evidence look fresh. A manifest, shared-auth, off-origin, reduced-shape, or filename-only diagnostic file cannot become certification just because it is named like a certification tier. Admin Production Evidence now shows failed, stale, and non-certifying states explicitly, with operator-readable reasons.

The security gates also remain deliberately closed. CSP enforcement is deferred until the observation window closes on 2026-05-04 and the daily log is populated. HSTS preload remains disabled until DNS-zone enumeration and operator sign-off exist. No learner-facing feature, subject engine, reward, Star, or state semantics were changed.

## Final Decision

| Gate | Final P6 result | Reason |
| --- | --- | --- |
| 30-learner classroom beta | **Not certified** | Latest committed production evidence fails `maxBootstrapP95Ms` only: 1,167.4 ms observed vs 1,000 ms configured. |
| 60-learner stretch | **Not certified** | P6 manifest setup succeeded and reached application load, but the 60-learner preflight failed bootstrap P95: 854 ms observed vs 750 ms configured. Manifest evidence is diagnostic unless an equivalence record is approved. |
| Public capacity wording | **Remain `small-pilot-provisional`** | No passing strict 30-learner certification evidence exists. |
| Admin Production Evidence | **Fail-closed** | Failed, stale, preflight, missing-diagnostics, and diagnostic evidence cannot render as certified. |
| CSP enforcement | **Deferred** | The observation window runs from 2026-04-27 to 2026-05-04; enforcement cannot honestly flip on 2026-04-28. |
| HSTS preload | **Deferred** | DNS-zone enumeration, apex/subdomain proof, third-party inventory, and operator sign-off remain incomplete. |

## What Shipped

### Evidence Summary Truth

`scripts/generate-evidence-summary.mjs` now treats certification as a positive proof problem. Certification-tier evidence needs all of the following before it can set `certifying: true`:

- a passed evidence file;
- schema-v2 report metadata;
- declared certified tier metadata;
- capacity-run evidence, not dry-run or preflight;
- `diagnostics.classification.certificationEligible === true`.

This closes the previous false-certification paths identified during independent review:

- filename-only files named like `30-learner-beta` cannot certify;
- local, preview, or otherwise off-origin runs cannot certify through naming alone;
- manifest runs remain diagnostic unless a later equivalence record explicitly changes policy;
- shared-auth runs cannot certify isolated classroom load;
- reduced learner/burst/round shapes cannot certify the strict 30/20/1 release gate.

The generated `reports/capacity/latest-evidence-summary.json` now carries `certificationEligible` and `certificationReasons` so downstream UI has enough context to explain non-certifying results.

### Admin Production Evidence

Admin evidence freshness is now based on the underlying evidence run's `finishedAt`, not the summary file's `generatedAt`. Regenerating the summary file can no longer turn a stale certification run into a fresh one. The panel frame uses the same 24-hour evidence freshness threshold as the evidence classifier, so it no longer shows "Data may be stale" and "(fresh)" at the same time for 5-minute-plus evidence.

The panel also now:

- renders human tier labels instead of raw snake_case identifiers;
- gives non-certifying diagnostic rows an explicit reason when no threshold violation exists;
- wraps long filenames and threshold messages to avoid narrow-viewport overflow;
- keeps failed certification-tier evidence visually prominent.

### Capacity Diagnostics

The load driver now persists richer diagnostics for future capacity runs:

- `diagnostics.classification` records whether a run is a certification candidate or diagnostic, and why;
- endpoint summaries include P95/max query counts, D1 rows, response-byte distributions, bootstrap mode counts, and bounded top-tail samples;
- top-tail samples retain server request IDs for Worker-log correlation without persisting learner-specific command request IDs in the evidence summary;
- zero-signal thresholding includes server-side capacity signals.

This gives the next operator a practical way to distinguish application query fan-out from platform/D1 tail variance before considering any code or policy change.

### Session-Manifest Safety

`scripts/prepare-session-manifest.mjs` now defaults to a safer 28-session batch size and a 610,000 ms inter-batch delay. That separates demo-session setup limits from application capacity measurement without weakening production rate limits or spoofing client IPs.

The direct strict 30-learner production setup attempt still failed closed at learner 30 on 2026-04-28, proving why the manifest path is necessary for diagnostic stretch preflights. The driver refused to reuse global auth, which is the correct safety behaviour.

The P6 manifest preflight then created 60 isolated demo sessions in 28/28/4 batches and reached application load. That is meaningful progress over the P5 setup blocker, even though the resulting stretch preflight still failed its bootstrap P95 threshold.

### Debug-Bundle Capacity Accounting

The Admin debug-bundle route now passes through `requireDatabaseWithCapacity`, so its D1 statements are counted in route capacity telemetry. The query-budget test now asserts the route has a real tracked query floor, preventing future raw-DB bypasses from silently dropping capacity accounting.

### CSP and HSTS Gate Records

The CSP and HSTS documents now contain dated P6 deferrals. They preserve the existing security posture while making the reason explicit:

- CSP report-only observation cannot close before 2026-05-04 and still needs a populated daily log.
- HSTS preload remains disabled until DNS inventory and operator sign-off exist.

## Evidence Ledger

### Local Verification

| Command | Result |
| --- | --- |
| `npm test` | Passed: 6,478 pass, 0 fail, 6 skipped. |
| `npm run check` | Passed: Wrangler dry-run build, public assert, and client bundle audit. Main bundle gzip remained under budget. |
| `npm run capacity:verify-evidence` | Passed: 2 capacity evidence rows checked. |
| Focused reviewer-follower suite | Passed: 155/155 across evidence summary, Admin evidence, capacity diagnostics, thresholds, and query-budget tests. |
| `git diff --check` | Passed after removing baseline trailing whitespace. |

### Production Evidence Considered

| Evidence | Outcome | Interpretation |
| --- | --- | --- |
| `30-learner-beta-v2-20260428-p5-warm.json` | Fail | Strict 30/20/1 production run failed only bootstrap P95: 1,167.4 ms vs 1,000 ms. |
| `30-learner-beta-v2-20260428.json` | Fail | Earlier schema-v2 30/20/1 production run failed only bootstrap P95: 1,126.3 ms vs 1,000 ms. |
| `60-learner-stretch-preflight-20260428-p5.json` | Non-certifying setup blocker | Did not reach application load; root cause recorded as `session-manifest-preparation-rate-limited`. |
| P6 strict 30 direct setup attempt | Setup failed closed | Direct demo-session creation again failed at learner 30; no evidence file was created and no global auth fallback occurred. |
| P6 60-learner manifest preflight | Fail | Setup succeeded for 60/60 isolated demo sessions and the run reached application load. All 260 requests returned 200 with zero signals, but bootstrap P95 was 854 ms against the 750 ms stretch ceiling. |

## Independent Review Cycle

The branch followed the requested independent SDLC pattern.

| Role | Scope | Result |
| --- | --- | --- |
| Worker A | Evidence summary, Admin evidence truth, documentation. | Implemented fail-closed summary/Admin evidence updates and tests. |
| Worker B | Capacity diagnostics and manifest setup hardening. | Implemented richer diagnostics, signal aggregation, manifest batching, and tests. |
| Explorer C | Bootstrap hot path analysis. | Found one low-risk future query reduction: avoid rereading `child_subject_state` for active-session IDs after it is already loaded. This was not shipped because P6 evidence did not yet justify a bootstrap behaviour change. |
| Reviewer 1 | Capacity evidence correctness. | Found certification-eligibility and stale-freshness blockers. Both were fixed. |
| Reviewer 2 | Security/release posture. | Confirmed no committed session cookies/API tokens in changed reports; found the same certification-eligibility blocker and baseline hygiene issues. Fixed. |
| Reviewer 3 | Admin evidence UI/UX. | Found stale/fresh contradiction in the frame plus non-blocking detail/wrapping issues. Fixed. |

The reviewer-follower commit closed all P1/P2 findings before the branch was rebased onto the latest `origin/main`.

## Why No Bootstrap Mitigation Shipped

The P5 evidence points at tail variance rather than a clear application query regression:

- bootstrap query count remains 12;
- D1 rows read remain low;
- response bytes remain far below the configured cap;
- command P95 passes comfortably;
- no 5xx, network failures, or hard capacity signals are present.

Explorer analysis identified a plausible small optimisation: `bootstrapBundle()` already reads `child_subject_state`, while `listPublicBootstrapActiveSessionIds()` rereads it to parse active session IDs. That could reduce one D1 statement in the selected bootstrap path. P6 did not ship it because the immediate blocker was evidence truth and diagnostic reliability, and because there was not yet a production diagnostic run proving that one fewer statement would move the P95 tail below 1,000 ms.

This is intentional restraint. A mitigation PR should follow the diagnostic matrix in `docs/operations/capacity-tail-latency.md`, correlate top-tail request IDs with Worker logs, and only then decide whether code, policy, or operational warm-up is the right response.

## Operational Reading Guide

When reading Admin Production Evidence:

- **Certified** means the evidence file passed and `diagnostics.classification.certificationEligible` was true.
- **Failed** means a real evidence file exists but thresholds, failures, or `ok` failed.
- **Non-certifying** means the file may be useful diagnostically, but cannot promote capacity support.
- **Stale** means the underlying evidence run is older than the freshness window, even if the summary was regenerated recently.
- **Not available** means no usable summary metrics exist.

When producing new evidence:

```sh
node scripts/generate-evidence-summary.mjs --verbose
npm run capacity:verify-evidence
```

For a strict 30-learner certification candidate:

```sh
npm run capacity:classroom:release-gate -- \
  --production \
  --origin https://ks2.eugnel.uk \
  --confirm-production-load \
  --confirm-high-production-load \
  --demo-sessions \
  --learners 30 \
  --bootstrap-burst 20 \
  --rounds 1 \
  --config reports/capacity/configs/30-learner-beta.json \
  --output reports/capacity/evidence/30-learner-beta-v2-<date>-strict.json
```

For a setup-isolated 60-learner diagnostic preflight:

```sh
node scripts/prepare-session-manifest.mjs \
  --origin https://ks2.eugnel.uk \
  --learners 60 \
  --output reports/capacity/manifests/60-learner-<date>.json

npm run capacity:classroom -- \
  --production \
  --origin https://ks2.eugnel.uk \
  --confirm-production-load \
  --confirm-high-production-load \
  --session-manifest reports/capacity/manifests/60-learner-<date>.json \
  --learners 60 \
  --bootstrap-burst 20 \
  --rounds 1 \
  --config reports/capacity/configs/60-learner-stretch.json \
  --output reports/capacity/evidence/60-learner-stretch-preflight-<date>.json
```

Manifest-based evidence is diagnostic unless a separate equivalence record approves it for certification.

## Residual Risks

1. The strict 30-learner gate still depends on demo-session creation succeeding for 30 isolated learners in one run. The current endpoint limit is tight enough that learner 30 can fail setup. That is a setup reliability problem, not a reason to weaken isolation.
2. The bootstrap P95 tail has not yet been reduced below 1,000 ms. Existing evidence suggests platform or D1 tail variance, but that is not proven without top-tail Worker-log correlation.
3. Old evidence files before P6 do not carry diagnostics classification. The new summary therefore records `missing-certification-diagnostics` and refuses to certify them. This is safer than backfilling optimism.
4. CSP and HSTS remain operationally gated. The codebase now records the deferrals, but an operator still needs to complete the observation log and DNS/sign-off work.
5. A future manifest-equivalence policy decision would need careful review. It could improve repeatability, but it must not hide a real production session-source bottleneck.
6. The P6 60-learner diagnostic evidence records `dirtyTreeFlag: true` because it was collected while the completion report was still being drafted. It is not certifying evidence, and the dirty flag should remain visible rather than being edited after the fact.

## Recommended Next Slice

The next PR should be a narrow diagnostic/mitigation slice, not a broad capacity redesign:

1. Run T1/T5 strict 30 candidates when the demo-create setup bucket is known clean.
2. Run the T4 manifest preflight and compare bootstrap top-tail request IDs with Worker logs.
3. If top-tail samples show stable query count but high D1 duration, document platform-tail evidence before changing code.
4. If top-tail samples show avoidable query fan-out, implement the one-statement bootstrap reduction found during exploration and ratchet `tests/worker-query-budget.test.js`.
5. Only after repeated passing strict evidence should public wording move beyond `small-pilot-provisional`.

## Completion Status

P6 is complete as a hardening, evidence-truth, and handover phase. It did not certify a larger classroom target, and it should not be represented as doing so. The value shipped is a safer certification system: operators can now see the real state, understand why evidence does or does not certify, and continue the capacity work without stale or diagnostic data being promoted by accident. The 60-learner stretch path also moved from setup-blocked to measured application-load failure, which is a better and more actionable failure mode.
