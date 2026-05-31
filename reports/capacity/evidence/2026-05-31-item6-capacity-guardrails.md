# Item 6 - Capacity Guardrails

Date: 2026-05-31

## Root cause

The release gate measured client-visible bootstrap and command P95, response size, 5xx, network failures, and product signals. That was useful, but it did not fail closed on the Worker-side metrics that most directly predict Cloudflare pressure:

- bootstrap server P95
- command server P95
- bootstrap D1 writes
- command D1 writes
- command response bytes

This meant a release could pass the capacity gate while still increasing server compute, D1 write amplification, or command payload pressure.

## Fix

`scripts/classroom-load-test.mjs` and `scripts/lib/capacity-evidence.mjs` now support these threshold keys and CLI flags:

- `maxBootstrapServerP95Ms` / `--max-bootstrap-server-p95-ms`
- `maxCommandServerP95Ms` / `--max-command-server-p95-ms`
- `maxBootstrapD1RowsWritten` / `--max-bootstrap-d1-rows-written`
- `maxCommandD1RowsWritten` / `--max-command-d1-rows-written`
- `maxCommandResponseBytes` / `--max-command-response-bytes`

`capacity:classroom:release-gate` now enforces:

- bootstrap client P95 <= 1,000 ms
- command client P95 <= 500 ms
- bootstrap server P95 <= 250 ms
- command server P95 <= 250 ms
- bootstrap D1 writes = 0
- command D1 writes <= 5
- response bytes <= 600,000
- command response bytes <= 20,000
- 5xx = 0
- network failures = 0
- product signals = 0

Missing server or D1 metric samples now fail closed when their corresponding threshold is configured.

## Evidence

Local validation:

- `node --test tests/capacity-evidence.test.js tests/capacity-thresholds.test.js tests/capacity-scripts.test.js`
  - 168 passed
- `node --test tests/verify-capacity-evidence-schema.test.js tests/verify-capacity-evidence-metrics.test.js tests/verify-capacity-evidence-certification.test.js`
  - 68 passed

Behaviour review:

- Existing threshold keys remain supported.
- Unknown threshold keys still fail validation.
- Duplicate CLI threshold flags still fail validation.
- Dry-run output only reports configured release thresholds.
- Configured server and D1 thresholds fail closed when the evidence payload is missing the required metric family.
