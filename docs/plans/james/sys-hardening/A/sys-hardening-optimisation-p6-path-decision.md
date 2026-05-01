---
title: "System Hardening Optimisation P6 — Path Decision"
type: decision-record
status: complete
date: 2026-05-01
phase: P6
exit_state: p6-continuation-required
certifying: false
language: en-GB
source_context:
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6-60-diagnostic-decision.md
  - reports/capacity/evidence/2026-04-30-p6-route-costs.json
  - reports/capacity/latest-1000-learner-budget.json
---

# System Hardening Optimisation P6 — Path Decision

## Evidence Boundary

Inputs:

- `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6-60-diagnostic-decision.md`
- `reports/capacity/evidence/2026-04-30-p6-60-tail-classification.md`
- `reports/capacity/evidence/2026-04-30-p6-route-costs.json`
- `reports/capacity/latest-1000-learner-budget.json`
- `docs/operations/capacity-1000-learner-free-tier-budget.md`

The budget remains `modellingOnly: true` and `certifying: false`. It is not production certification evidence.

## Required Questions

1. **Did the 60-learner diagnostic reach production app-load?**
   No. The P6 run did not start because the session manifest and raw Worker tail capture were absent.

2. **Did it pass the 60-learner diagnostic thresholds?**
   Not measured.

3. **Were Worker CPU/wall samples joined for top-tail requests?**
   No P6 samples were joined. Existing bootstrap CPU/wall coverage remains partial model input only.

4. **Were D1 statement maps complete enough to classify D1 cost?**
   No P6 60-learner statement map exists.

5. **Which route family dominates latency risk?**
   Not classifiable from P6 live telemetry. The route-cost model still shows full-bootstrap as the only measured route family with joined Worker CPU/wall and D1 duration.

6. **Which route family dominates D1 read risk?**
   The expected 1000-learner model points to command traffic, currently grammar-command, as a major lower-bound D1 read contributor. This remains incomplete because spelling, punctuation, parent/admin, not-modified bootstrap and Hero coverage are not measured.

7. **Which route family dominates D1 write risk?**
   The expected 1000-learner model points to command traffic, currently grammar-command, as the dominant lower-bound D1 write contributor. This is not sufficient to start write compaction because subject and admin route coverage is incomplete.

8. **Does the expected 1000-learner scenario still fail D1 rows written?**
   Yes. Expected 1000-learner D1 rows written are red and lower-bound: 1,134,000 rows/day against a 100,000 rows/day Free-tier limit.

9. **Does the expected 1000-learner scenario still fail D1 rows read?**
   Yes. Expected 1000-learner D1 rows read are red and lower-bound: 18,438,000 rows/day against a 5,000,000 rows/day Free-tier limit.

10. **Is Worker CPU still red, partial or unknown?**
    Red and partial. The expected model records max bootstrap Worker CPU at 21 ms against the 10 ms Free-tier limit, but non-bootstrap Worker CPU remains missing.

11. **Which optimisation path should be P7?**
    No P7 optimisation path should start yet. The selected path is `P6 continuation — diagnostic repair, not optimisation`.

## Selected Exit State

`p6-continuation-required`

P6 improved the route-cost model and gap classification, but the telemetry-complete 60-learner run remains incomplete.

## Rejected Alternatives

- **P7D — Command write-amplification and batching design:** rejected as the primary next phase because D1 writes are red but route coverage remains incomplete and no P6 live run classified the bottleneck.
- **P7A — Bootstrap/D1 query-shape and cache-contract optimisation:** rejected because D1 reads are red and bootstrap CPU is red/partial, but the decisive P6 telemetry is missing and command/admin route coverage remains incomplete.
- **P7B — Worker CPU, JSON construction and response rewrite reduction:** rejected because Worker CPU is partial, not route-complete; only bootstrap has joined CPU/wall coverage.
- **P7G — Repeat-policy governance for 60-learner certification candidate:** rejected because there is no positive telemetry-complete P6 diagnostic.

## Next Action

Continue P6 with an operator-gated live run:

1. Prepare `/tmp/ks2-p6-60-manifest.json`.
2. Start `npm run ops:tail:json > /tmp/ks2-p6-60-worker-tail.jsonl`.
3. Run the approved `capacity:classroom` production command.
4. Build redacted tail correlation and statement map artefacts.
5. Re-run the route-cost budget and select P7 from the completed evidence.
