# Capacity Tail-Latency Diagnostics

This note is an operator matrix for P6 `/api/bootstrap` P95 failures. It is diagnostic only. It does not certify the 30-learner classroom beta, relax thresholds, or replace the release gate in `docs/operations/capacity.md`.

Use the package scripts rather than raw `wrangler` commands. Production runs still require explicit confirmation flags and an operator-approved session source.

## Evidence Fields To Read

`scripts/classroom-load-test.mjs` now persists a bounded diagnostic block and richer endpoint summaries:

- `diagnostics.classification.kind`: `diagnostic` or `certification-candidate`. A candidate still needs passing thresholds and the normal evidence verifier before any claim can be made.
- `diagnostics.classification.certificationEligible`: true only when the run shape is eligible, bootstrap and command endpoint metrics are present, and no threshold violation is recorded.
- `diagnostics.classification.reasons`: why a run is diagnostic, such as `not-production-mode`, `origin-preview`, `session-manifest-requires-equivalence-record`, `non-p6-30-learner-gate-shape`, or `missing-pinned-threshold-config`.
- `diagnostics.thresholdConfig`: config path, tier, minimum schema version, and config hash provenance.
- `diagnostics.thresholdViolations[]`: machine-readable threshold failures with threshold name, configured limit, observed value, and message.
- `summary.endpoints["GET /api/bootstrap"]`: wall-time distribution, response-byte distribution, max/P95 query counts, D1 rows read/written, server wall-time where `meta.capacity` exposes it, bootstrap mode counts, bootstrap-capacity mode counts, and top-tail samples.
- `summary.endpoints[...].topTailSamples[]`: bounded slowest-request samples with client/server request ids, virtual learner, scenario, wall time, response bytes, query count, D1 rows, and bootstrap mode.
- `summary.phases` and `summary.scenarios`: bootstrap, command, setup, and named scenario splits, so an operator can separate initial bootstrap warm-up hints from burst behaviour.

Correlate a top-tail sample with Worker logs by searching the `serverRequestId` or echoed `x-ks2-request-id` in `capacity.request` structured logs. SQL duration and per-statement details live in the server log, not in public evidence JSON.

## P6 Diagnostic Matrix

Use dated output names under `reports/capacity/evidence/`. Replace `<date>` and `<suffix>` with the run date and a short label.

| Run | Purpose | Command Shape | Evidence Classification |
| --- | --- | --- | --- |
| T0 local smoke | Confirms driver, metadata, and threshold wiring without production traffic. | `npm run capacity:local-worker -- --learners 10 --bootstrap-burst 10 --rounds 1 --max-network-failures 0 --require-zero-signals --require-bootstrap-capacity --include-request-samples --output reports/capacity/evidence/10-learner-local-<date>-p6.json` | Diagnostic. Local data cannot certify production capacity. |
| T1 strict 30 baseline | Reproduces the failing classroom gate shape. | `npm run capacity:classroom -- --production --origin https://ks2.eugnel.uk --confirm-production-load --confirm-high-production-load --demo-sessions --learners 30 --bootstrap-burst 20 --rounds 1 --config reports/capacity/configs/30-learner-beta.json --include-request-samples --output reports/capacity/evidence/30-learner-beta-v2-<date>-p6-strict.json` | Certification candidate only if diagnostics show no diagnostic reasons, thresholds pass, provenance is clean, and verification passes. |
| T2 strict 30 after warm-up | Tests whether the same shape improves after the platform and D1 caches are warm. Run T1 once, wait briefly, then run the same command again with a new output path. | Same as T1, output `...-warm.json`. | Diagnostic unless a policy record explicitly treats the warm-up window as release-gate equivalent. |
| T3 reduced burst | Distinguishes burst concurrency from application query fan-out. | Same as T1 but `--bootstrap-burst 10 --rounds 2`, output `...-burst10-rounds2.json`. | Diagnostic because the gate shape changed. |
| T4 session manifest | Separates demo-session setup and per-run session creation from application load. | Same as T1 but replace `--demo-sessions` with `--session-manifest <path>`, output `...-manifest.json`. | Diagnostic until an equivalence record says the manifest source is valid for the release gate. |
| T5 repeated strict confidence | Checks whether T1 was a one-off platform tail or reproducible. | Repeat T1 at least twice with unique output paths. | Each run is evaluated on its own. Repetition supports diagnosis; it does not override a failing threshold. |

## Interpretation Matrix

| Evidence Pattern | Likely Direction | Next Operator Action |
| --- | --- | --- |
| Bootstrap P50 is healthy, P95/max are high, query count and D1 rows stay flat, payload size is stable, command P95 passes. | Platform or D1 tail variance is more likely than application query fan-out. | Compare T1/T2/T5 request ids in Worker logs. Check `d1DurationMs` and statement durations for the top-tail samples before changing code or policy. |
| Bootstrap query count, D1 rows read, or server wall time rises with learner count or burst. | Application-side bootstrap cost or query fan-out. | Investigate `bootstrapBundle`, bounded subject state reads, and D1 round trips before any threshold discussion. |
| Bootstrap response bytes rise towards the configured cap. | Payload or envelope growth. | Inspect bootstrap envelope shape and bounded history limits; do not raise `maxResponseBytes` without a separate policy record. |
| T3 passes but T1 fails with otherwise similar query and row counts. | Burst sensitivity. | Treat reduced burst as mitigation evidence only. Keep the release gate failing until strict shape passes or policy is reviewed separately. |
| T2 passes but T1 fails. | Warm-up or cold-ish platform behaviour. | Keep the result diagnostic. Record whether launch operations can safely pre-warm, then re-run strict shape without hiding the initial-tail risk. |
| T4 passes but T1 fails during setup or early bootstrap. | Session source or demo-session setup path may be the bottleneck. | Keep manifest evidence diagnostic until equivalence is approved. Do not reuse shared auth as a shortcut for certification. |
| Any 5xx, network failure, `exceededCpu`, D1 overload, or missing bootstrap capacity metadata appears. | Release blocker. | Preserve the evidence file and classify the blocker before retrying. |

## P1 Evidence Attribution Matrix

P1 adds Worker CPU/wall attribution to the existing P6 matrix. It does not relax thresholds and it does not make manifest, warm-up, or reduced-burst runs certifying. Each run must use a unique output path so a repeated strict run cannot overwrite an earlier failure.

| Run | Purpose | Evidence Path Rule | Worker Log Join | Classification |
| --- | --- | --- | --- | --- |
| T0 local smoke | Confirms the load driver, request ids, top-tail sample retention, and join tooling against local or fixture data. | `reports/capacity/evidence/<date>-p1-t0-local.json` | Optional fixture join. Missing logs are `unclassified-insufficient-logs`. | Diagnostic. |
| T1 strict 30 baseline | Measures the current release-gate shape before optimisation. | `reports/capacity/evidence/<date>-p1-t1-strict.json` | Required for P1 attribution: join exported Worker logs by `serverRequestId`. | Certification candidate only if the existing strict gate and verifier pass; joined CPU/wall data cannot promote it. |
| T3 reduced burst | Distinguishes burst sensitivity from application query fan-out. | `reports/capacity/evidence/<date>-p1-t3-burst10-rounds2.json` | Join logs for top-tail bootstrap request ids. | Diagnostic because the run shape differs from the release gate. |
| T4 session manifest | Separates demo-session setup effects from steady-state route costs. | `reports/capacity/evidence/<date>-p1-t4-manifest.json` | Join logs if an approved manifest window exists. | Diagnostic unless a separate equivalence record exists. |
| T5 repeated strict confidence | Checks whether T1 tail behaviour is reproducible. | `reports/capacity/evidence/<date>-p1-t5-strict-r1.json`, `...-r2.json`, etc. | Join each strict run separately; never merge logs across runs before preserving per-run output. | Each run stands on its own; repetition explains variance but does not mask threshold failure. |

Run the join after collecting a bounded Cloudflare export:

```bash
node ./scripts/join-capacity-worker-logs.mjs \
  --evidence reports/capacity/evidence/<date>-p1-t1-strict.json \
  --logs reports/capacity/evidence/<date>-p1-t1-worker-logs.jsonl \
  --output reports/capacity/evidence/<date>-p1-t1-tail-correlation.json
```

Read `diagnostics.workerLogJoin.coverage.invocation` separately from `diagnostics.workerLogJoin.coverage.statementLogs`. Invocation CPU/wall coverage can be complete while sampled `capacity.request` statement detail is incomplete; that state supports only partial attribution.

## Minimum Evidence Set Before Mitigation

Before changing bootstrap behaviour or debating thresholds, collect at least three dated diagnostic runs from the matrix, including one strict T1 run and one repeated strict T5 run. Each evidence file should retain:

- `--config reports/capacity/configs/30-learner-beta.json` for strict 30-learner candidates.
- `--include-request-samples` when the operator needs first/last request samples; top-tail request ids are retained even without the full sample set.
- `--require-bootstrap-capacity` through the pinned config, so missing `queryCount` or `d1RowsRead` fails closed.
- Unique output paths. Never overwrite a previous failing run during diagnosis.

Do not change `maxBootstrapP95Ms`, `maxCommandP95Ms`, response-byte caps, or signal gates inside a mitigation PR. Threshold policy changes need a separate owner-reviewed record.
