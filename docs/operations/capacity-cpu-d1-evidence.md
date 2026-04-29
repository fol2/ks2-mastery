---
module: operations
tags:
  - capacity
  - sys-hardening
  - cloudflare-workers
problem_type: evidence-attribution
---

# Capacity CPU and D1 Evidence Attribution

This guide covers the P1 evidence-attribution lane for joining Cloudflare Worker invocation telemetry to KS2 Mastery capacity evidence. The output is diagnostic only: joined CPU, Worker wall time, invocation outcome, and sampled `capacity.request` statement details must never certify or promote a classroom capacity claim.

## Evidence Lanes

- Strict capacity evidence remains the release gate. It still depends on the existing threshold config, evidence table row, provenance, and `scripts/verify-capacity-evidence.mjs` checks.
- Worker log joins explain top-tail `/api/bootstrap` samples. They can support an optimisation decision, but they do not change `small-pilot-provisional`, `30-learner-beta-certified`, or any public wording.
- Missing Worker logs are fail-closed as `unclassified-insufficient-logs`. A missing invocation log, missing CPU/wall fields, or malformed export cannot be reinterpreted as a pass.
- Invocation coverage and sampled `capacity.request` statement coverage are separate. Invocation CPU/wall can be present while statement logs are sampled out.

## Collection Flow

1. Run the relevant capacity matrix command with a unique output path and top-tail samples retained.
2. Export a bounded Cloudflare Workers Logs, Tail Workers, or Logpush JSON/JSONL slice for the same time window.
3. Join the exported logs to the evidence by request id:

```bash
node ./scripts/join-capacity-worker-logs.mjs \
  --evidence reports/capacity/evidence/30-learner-beta-v2-2026-04-29-p1-strict.json \
  --logs reports/capacity/evidence/worker-logs-2026-04-29.jsonl \
  --output reports/capacity/evidence/2026-04-29-p1-tail-correlation.json
```

The join script matches `serverRequestId` first. It only falls back to the echoed `clientRequestId` when the evidence proves the Worker accepted that id by echoing the same value.

Use package scripts for tail capture. `npm run ops:tail` is the human-readable pretty stream and is useful for watching sampled `capacity.request` lines, but it does not provide invocation CPU/wall telemetry in a machine-joinable shape. For CPU/wall attribution, start a JSON tail before the capacity run and stop it after the run finishes:

```bash
npm run ops:tail:json > /tmp/ks2-capacity-worker-logs.jsonl
```

Do not append `--format json` to `npm run ops:tail`; Wrangler receives duplicate `--format` values and rejects the command. If historical Cloudflare Logs or Trace export is used instead of live tail, keep the export bounded to the run window and join only by the retained request ids. Do not commit raw tail output when it may include unrelated live traffic; commit the bounded correlation and statement-map artefacts instead.

## Accepted Log Shapes

The join script accepts:

- JSON arrays of Workers Trace or Logpush-style records.
- JSON objects with `records`, `events`, `data`, or `result` arrays.
- JSONL records from Tail Workers or Workers Logs exports.
- `[ks2-worker] {"event":"capacity.request", ...}` console lines.

Pretty-tail console lines can prove sampled statement coverage, but they cannot fill `diagnostics.workerLogJoin.coverage.invocation`. Missing invocation CPU/wall coverage must remain `unclassified-insufficient-logs`.

Unknown fields are ignored. Malformed JSONL lines are skipped with bounded warnings. The correlation output persists only bounded route, timing, D1, opaque statement IDs, and classification fields. Committed diagnostic artefacts hash retained request IDs and replace SQL/table/column statement names with stable opaque statement IDs; they must not persist request bodies, cookies, learner names, raw SQL parameters, child answers, or free-form log messages.

## Output Contract

Correlation output is written as a diagnostic artefact with:

- `diagnostics.workerLogJoin.diagnosticOnly: true`
- `diagnostics.workerLogJoin.certification.contributesToCertification: false`
- `diagnostics.workerLogJoin.coverage.invocation`: top-tail samples with matched Cloudflare CPU/wall invocation logs.
- `diagnostics.workerLogJoin.coverage.statementLogs`: top-tail samples with matched sampled `capacity.request` statement breakdowns.
- `diagnostics.workerLogJoin.samples[]`: per-request hashed request ID, app wall time, response bytes, D1 counts, Cloudflare CPU/wall, outcome, capacity-request D1 duration, bounded opaque statement IDs/counts, join status, and classification.

Classification values are intentionally conservative:

| Classification | Meaning |
| --- | --- |
| `unclassified-insufficient-logs` | Required invocation CPU/wall telemetry is missing or incomplete. |
| `partial-invocation-only` | Invocation CPU/wall joined, but sampled statement details are absent. |
| `d1-dominated` | D1 duration accounts for at least half of joined Worker wall time. |
| `worker-cpu-dominated` | Worker CPU is near the Free-plan budget or dominates Worker wall time. |
| `payload-size-pressure` | Bootstrap response bytes are close to the classroom evidence cap. |
| `client-network-or-platform-overhead` | Client-observed wall time materially exceeds joined Worker wall time. |
| `mixed-no-single-dominant-resource` | No single joined resource explains the tail sample. |

## Verification Rules

`scripts/verify-capacity-evidence.mjs` treats `diagnostics.workerLogJoin` as optional. When present, it enforces the non-certifying boundary:

- Worker log diagnostics cannot declare `contributesToCertification`, `certifying`, or `promotesCertification` as true.
- Samples missing invocation CPU/wall data must be classified as `unclassified-insufficient-logs`.
- Joined diagnostics never override failed thresholds, missing capacity-table proof, stale evidence, manifest-only evidence, or non-production run shape.

Use the correlation file to decide what to investigate next. Do not copy its numbers into capacity claims unless a separate strict evidence run passes the existing verifier-backed gate.

## 1000-Learner Budget Ledger

After route-cost evidence is available, build the modelling ledger with:

```bash
node ./scripts/build-capacity-budget-ledger.mjs \
  --input reports/capacity/evidence/30-learner-beta-v2-20260428-p5-warm.json
```

The default outputs are:

- `reports/capacity/latest-1000-learner-budget.json`
- `docs/operations/capacity-1000-learner-free-tier-budget.md`

The ledger is intentionally labelled `modellingOnly: true` and `certifying: false`. It may recommend Phase 2 directions such as D1 read reduction, burst shaping, write-amplification review, or completing the Worker CPU join, but it is not production evidence.
