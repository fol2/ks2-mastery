# KS2 Mastery Capacity Operations

> **Related:** For hardening charter and baseline audit, see [`docs/hardening/charter.md`](../hardening/charter.md) and [`docs/hardening/p1-baseline.md`](../hardening/p1-baseline.md).

This runbook records how capacity is certified for `/api/bootstrap`, subject commands, D1-backed read models, and client recovery paths. Capacity claims must be based on dated measurements from this repository, not planning estimates.

## Current Certification Status

| Target | Status | Evidence Required Before Claiming Support |
| --- | --- | --- |
| Family demo | Ready for bounded-bootstrap smoke checks | `npm run smoke:production:bootstrap` passes with a logged-in or demo session and no redaction failures. |
| Small pilot | Provisional | High-history bootstrap fixture passes, production bootstrap probe stays below the configured byte/count caps, and no `exceededCpu` or D1 overload appears during a small load run. |
| 30-learner classroom beta | Not certified | `npm run capacity:classroom -- --production --confirm-production-load ...` passes for 30 active learners, including cold-bootstrap burst and human-paced Grammar command rounds. |
| 60-learner stretch | Not certified | Same evidence as classroom beta, with acceptable P95 wall time and zero 5xx across repeated runs. |
| 100+ school-ready target | Not certified | Requires repeated 100+ learner runs, D1 row metrics, operational tail evidence, and a rollback/degrade drill. |

## Standard Commands

Local dry-run, no network:

```sh
npm run capacity:classroom -- --dry-run --learners 30 --bootstrap-burst 20 --rounds 1
```

Local fixture against a dev Worker using isolated demo sessions:

```sh
npm run capacity:classroom -- --local-fixture --origin http://localhost:8787 --demo-sessions --learners 10 --bootstrap-burst 10 --rounds 1
```

Production or preview run, fail-closed unless confirmation and auth are explicit:

```sh
npm run capacity:classroom -- --production --origin https://ks2.eugnel.uk --confirm-production-load --demo-sessions --learners 10 --bootstrap-burst 10 --rounds 1
```

Production bootstrap probe for a logged-in session:

```sh
npm run smoke:production:bootstrap -- --url https://ks2.eugnel.uk --cookie "ks2_session=..." --max-bytes 600000 --max-sessions 12 --max-events 100
```

Use package scripts for Cloudflare operations. Normal deploy verification remains:

```sh
npm test
npm run check
npm run deploy
```

## Threshold-Run Procedure

The classroom load driver and production bootstrap probe both support hard threshold gates so a CI step can fail purely on threshold violation. No threshold flag is set by default — absent flags preserve the existing reporting behaviour exactly.

### Classroom load driver flags

Add any combination of the following to `npm run capacity:classroom`. Each flag is an optional hard gate; if absent the gate is not enforced. When any gate is violated the script exits non-zero and prints a `thresholds.violations` block in the JSON report.

- `--max-5xx <count>` — fail if total HTTP 5xx responses exceed `<count>`.
- `--max-network-failures <count>` — fail if network-level failures exceed `<count>`.
- `--max-bootstrap-p95-ms <ms>` — fail if `/api/bootstrap` P95 wall time exceeds `<ms>`.
- `--max-command-p95-ms <ms>` — fail if subject-command P95 wall time exceeds `<ms>`.
- `--max-response-bytes <bytes>` — fail if any endpoint's maximum response bytes exceed `<bytes>`.
- `--require-zero-signals` — fail if any `exceededCpu`, `d1Overloaded`, `d1DailyLimit`, `rateLimited`, `networkFailure`, or `server5xx` signal is observed.
- `--confirm-high-production-load` — additional acknowledgement for larger production load shapes; required by operators before running at classroom or stretch scale.

The `capacity:classroom:release-gate` package script bakes the recommended defaults:

```sh
npm run capacity:classroom:release-gate -- --production --origin https://ks2.eugnel.uk --confirm-production-load --confirm-high-production-load --demo-sessions --learners 30 --bootstrap-burst 20 --rounds 1
```

The release-gate script is equivalent to `capacity:classroom` with `--max-5xx 0 --max-network-failures 0 --max-bootstrap-p95-ms 1000 --max-command-p95-ms 750 --max-response-bytes 600000 --require-zero-signals` prepended. Any additional arguments you supply on the command line layer on top.

### Probe bootstrap flags

`npm run smoke:production:bootstrap` supports three hard gates:

- `--max-bytes <bytes>` — fail when the response body exceeds `<bytes>` (default 600 000).
- `--max-sessions <count>` — fail when `practiceSessions` length exceeds `<count>`.
- `--max-events <count>` — fail when `eventLog` length exceeds `<count>`.

A threshold violation emits a `thresholdViolations` entry in the JSON report alongside the legacy `failures` list, and exits non-zero. Raw response bodies are never surfaced in the output even when a threshold trips — only the measured size, count, and the configured limit.

### Recommended CI wiring

1. Run `npm run capacity:classroom:release-gate -- --dry-run` as a deterministic smoke on every pull request. The dry-run still reports the `thresholds` block so the JSON shape is stable.
2. For production release gates, invoke the same script with `--production --origin <origin> --confirm-production-load --confirm-high-production-load --demo-sessions` so isolated demo sessions carry the load.
3. Record the resulting `thresholds.violations` array, plan summary, and commit SHA alongside the run, per the `Evidence To Record` checklist.

## Evidence To Record

For each capacity run, record:

- Date, commit SHA, environment, and whether the run used demo or real authenticated sessions.
- Virtual learners, bootstrap burst size, command rounds, and pacing.
- Status distribution, endpoint/status grouping, P50/P95 wall time, max response bytes, and total requests.
- Any `exceededCpu`, `/api/bootstrap` 503, D1 overloaded, D1 daily-limit, auth failure, stale conflict, or retry amplification signal.
- Whether learner progress was preserved and whether the run left pending or blocked writes.

## Operational Thresholds

Treat any of these as release blockers until investigated:

- Any Worker Error 1102 or `exceededCpu` signal.
- Any `/api/bootstrap` 503 during the high-history probe or classroom load run.
- Any D1 overloaded or D1 daily-limit response.
- P95 bootstrap wall time above 1,000 ms in a synthetic run.
- P95 subject-command wall time above 750 ms in a human-paced synthetic run.
- Bootstrap payload above the configured byte cap or missing `bootstrapCapacity` metadata.
- Any redaction failure exposing private spelling prompts, raw answers, or server-only runtime fields.

## Degrade And Rollback Guidance

If `/api/bootstrap` starts returning CPU or 503 failures:

1. Confirm whether the failure is deterministic by running `npm run smoke:production:bootstrap` against the affected account/session.
2. Check Worker tail output with `npm run ops:tail` and group failures by endpoint and status.
3. If bounded bootstrap metadata is absent, stop deployment and roll back to the last commit with passing high-history bootstrap evidence.
4. If bounded metadata is present but D1 is overloaded, reduce load, avoid classroom launch claims, and investigate query duration/row counts before retrying.
5. Keep learner-facing writes on the subject command boundary; do not re-enable broad browser-owned runtime writes as a workaround.

If subject commands show high latency or 5xx:

1. Separate stale revision conflicts from server failures.
2. Check whether retries are preserving request ids and expected revisions.
3. Verify command projection is using read models or bounded recent windows rather than full `event_log` scans.
4. Roll back the command-path change if progress preservation or idempotency is at risk.

## Launch Language

Use evidence-tied language:

- "Measured on commit `<sha>` with `<n>` virtual learners and `<m>` cold bootstraps."
- "No 5xx, no `exceededCpu`, no D1 overload, P95 bootstrap `<x>` ms, P95 command `<y>` ms."
- "Not certified for a full-class simultaneous reload" when those measurements are missing.

Do not claim classroom or school readiness from Free-tier limits alone.
