---
title: "System Hardening Optimisation P7 — Path Decision"
type: decision-record
status: continuation-required
date: 2026-05-01
phase: P7
exit_state: p7-continuation-required
certifying: false
language: en-GB
source_context:
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-baseline.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-statement-family-summary.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-post-change-run-report.md
  - reports/capacity/evidence/2026-05-01-p7-statement-family-summary.json
---

# System Hardening Optimisation P7 — Path Decision

## Decision

Selected exit state: `p7-continuation-required`.

P7 has a reviewed narrow implementation candidate and local query-count proof, but it has not yet produced a post-change production 60-learner diagnostic. The next step is commit/PR/merge, deploy, then the approved 60-learner run shape.

## Required Questions

1. **Did P7 reduce full-bootstrap D1 statement count or D1 duration?**
   Locally, yes for statement count. The focused production/demo public bootstrap test reduced the observed full-bootstrap query count from the P6 production shape of 11 to 9. The broader three-learner bounded GET/POST bootstrap budget also ratcheted from the previous measured 11 to 10. Production D1 duration has not yet been measured post-change.

2. **Did the post-change 60-learner run pass the bootstrap P95 threshold?**
   Not measured. The post-change production run is operator-gated until the code is reviewed, committed, merged and deployed.

3. **Did Worker CPU become the new dominant blocker?**
   Unknown. No post-change production tail correlation exists yet.

4. **Did any route-cost/budget risk worsen?**
   No worsening is proven locally: the focused test keeps D1 rows written at 0 and preserves bootstrap capacity metadata, and the bounded bootstrap query-budget tests now pass at 10. The 1000-learner budget has not been regenerated from post-change production evidence because that evidence does not exist yet. The `not-modified-bootstrap` route family therefore remains explicitly gated as `requires-production-operator` until the deployed post-change route-cost refresh is run.

5. **Is 60 learners still uncertified?**
   Yes. 60 learners remain uncertified.

6. **What is the next phase?**
   Continue P7 through merge, deploy and an approved post-change 60-learner diagnostic. If that run passes once with complete telemetry, the next path is repeat-governance, not direct certification. If it still fails and remains D1-dominated, continue deeper bootstrap/D1 work.

## Rejected Decisions

- `p8g-60-repeat-governance-candidate`: rejected because no post-change production diagnostic has passed.
- `p8a-bootstrap-d1-continuation`: plausible but not yet selected because post-change production tail classification does not exist.
- `p8b-worker-cpu-json-selected`: rejected until post-change evidence shows Worker CPU/JSON dominance.
- Public 60-learner certification: rejected because P7 has no post-change production pass and one pass would still only enter repeat-governance.
