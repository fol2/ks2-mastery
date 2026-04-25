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

## Capacity Telemetry Environment Variables (Phase 2 U3)

The Worker exposes per-request capacity telemetry on every response. Two surfaces render the same collector state: a `meta.capacity` block on capacity-relevant JSON responses (`/api/bootstrap`, `/api/subjects/:subject/command`, `/api/hubs/parent/*`, `/api/classroom/*`) and a structured `[ks2-worker] {event: "capacity.request", ...}` log line. Both shapes follow a closed allowlist; per-statement breakdown NEVER appears in `meta.capacity`.

- `CAPACITY_LOG_SAMPLE_RATE` — numeric string in `[0, 1]`. Default `1.0` for local and preview environments, `0.1` recommended for production. Sampling applies to the structured log line only: `meta.capacity` is always present on responses regardless of the rate. Two classes of request are always logged at rate `1.0` regardless of the configured value so operational tails never go silent: requests that end with `status >= 500` (server errors) and pre-route 401s (`phase: "pre-route"` — auth-storm observability for credential-stuffing bursts).
- `x-ks2-request-id` — every inbound request is checked against `/^ks2_req_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/` (prefix + UUID v4, max 48 chars). Non-matching, blank, or oversized values are rejected silently; the Worker generates a fresh id via `crypto.randomUUID()` and echoes that validated id on every response (including pre-route 401s). The rejected raw value never appears in logs, response headers, or response bodies.

### Known telemetry drift (U3 round 1 — P2 #07)

`responseBytes` values on the `meta.capacity` block (body) and the `capacity.request` structured log MAY differ by a small delta (typically <5 bytes). The body-embedded value is measured BEFORE the `meta.capacity` rewrite is stamped; the log value is measured AFTER the rewrite includes the capacity block. Operators comparing the two surfaces should expect the log value to be slightly larger. This drift is intentional — rewriting again to reconcile the two would force a double byte-encode per request at the cost of p95 latency. Capacity threshold gates read the LOG surface (post-rewrite) so the operator-facing gate remains honest.

### Signal allowlist (U3 round 1 — P0 #01)

`meta.capacity.signals[]` is bounded by a closed string allowlist — `addSignal(token)` on the server-side collector silently rejects any token outside the set. The allowed values today are: `exceededCpu`, `d1Overloaded`, `d1DailyLimit`, `rateLimited`, `networkFailure`, `server5xx`, `bootstrapFallback`, `projectionFallback`, `derivedWriteSkipped`, `breakerTransition`. Adding a new signal requires both a plan amendment and a corresponding allowlist edit in `worker/src/logger.js`.

Operators correlate a load-driver wall-time sample with a server-side structured log by looking up the echoed `x-ks2-request-id` on the response headers. `scripts/classroom-load-test.mjs` and `scripts/probe-production-bootstrap.mjs` capture both the client-generated id and the server echo on every measurement.

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
- `--confirm-high-production-load` — required by operators before running `--production` at classroom or stretch scale (learners ≥ 20 or bootstrap-burst ≥ 20). Enforced by `validateClassroomLoadOptions`: a production run that exceeds the high-load threshold and omits this flag is rejected with a clear error.

**Important safety interactions**

- **Threshold flags are incompatible with `--dry-run`.** Dry-run has no measurements, so every threshold would always pass silently. The script rejects the combination with a clear error; CI gates must choose `--local-fixture` or `--production`.
- **Mode flags are mutually exclusive.** Specifying more than one of `--dry-run`, `--local-fixture`, `--production` is rejected. The prior last-wins behaviour silently downgraded a `--production` run to `--dry-run` when both appeared.
- **Duplicate threshold flags are rejected.** Specifying `--max-5xx` twice (or any other threshold) is rejected. This prevents a release-gate wrapper from being silently weakened by a later argument repeating the flag with a looser value.

The `capacity:classroom:release-gate` package script bakes the recommended defaults:

```sh
npm run capacity:classroom:release-gate -- --production --origin https://ks2.eugnel.uk --confirm-production-load --confirm-high-production-load --demo-sessions --learners 30 --bootstrap-burst 20 --rounds 1
```

The release-gate script is equivalent to `capacity:classroom` with `--max-5xx 0 --max-network-failures 0 --max-bootstrap-p95-ms 1000 --max-command-p95-ms 750 --max-response-bytes 600000 --require-zero-signals` prepended. Any additional arguments you supply on the command line layer on top — but they cannot repeat a threshold already baked in (duplicate-flag rejection), and they cannot choose `--dry-run` (threshold-vs-dry-run rejection).

### Probe bootstrap flags

`npm run smoke:production:bootstrap` supports three hard gates:

- `--max-bytes <bytes>` — fail when the response body exceeds `<bytes>` (default 600 000).
- `--max-sessions <count>` — fail when `practiceSessions` length exceeds `<count>`.
- `--max-events <count>` — fail when `eventLog` length exceeds `<count>`.

A threshold violation emits a `thresholdViolations` entry in the JSON report alongside the legacy `failures` list, and exits non-zero. Raw response bodies are never surfaced in the output even when a threshold trips — only the measured size, count, and the configured limit.

### Recommended CI wiring

1. On every pull request, run `npm run capacity:classroom -- --dry-run --learners 30 --bootstrap-burst 20 --rounds 1` (no threshold flags — dry-run cannot meaningfully evaluate thresholds). This validates the plan shape and argument parsing without network traffic.
2. For the production release gate, invoke `npm run capacity:classroom:release-gate -- --production --origin <origin> --confirm-production-load --confirm-high-production-load --demo-sessions --learners 30 --bootstrap-burst 20 --rounds 1` so isolated demo sessions carry the load and thresholds fire against real measurements.
3. Record the resulting `thresholds.violations` array, plan summary, and commit SHA alongside the run, per the `Evidence To Record` checklist.

## Evidence To Record

For each capacity run, record:

- Date, commit SHA, environment, and whether the run used demo or real authenticated sessions.
- Virtual learners, bootstrap burst size, command rounds, and pacing.
- Status distribution, endpoint/status grouping, P50/P95 wall time, max response bytes, and total requests.
- Any `exceededCpu`, `/api/bootstrap` 503, D1 overloaded, D1 daily-limit, auth failure, stale conflict, or retry amplification signal.
- Whether learner progress was preserved and whether the run left pending or blocked writes.

Evidence is persisted to `reports/capacity/` by `npm run capacity:classroom -- --output <path>` and by `npm run smoke:production:bootstrap -- --output <path>`. `latest-<env>.json` files and quarterly snapshots under `reports/capacity/snapshots/` are tracked in git; intermediate runs stay local.

## Capacity Evidence

Every row in this table must point to a persisted JSON file at `reports/capacity/latest-*.json` or `reports/capacity/snapshots/**`. `scripts/verify-capacity-evidence.mjs` (wired into `npm run verify`) cross-checks each claim and fails the build on drift.

`Decision` values are a closed enum: `fail`, `smoke-pass`, `small-pilot-provisional`, `30-learner-beta-certified`, `60-learner-stretch-certified`, `100-plus-certified`. Tier claims above `small-pilot-provisional` require `evidenceSchemaVersion >= 2` (U3 telemetry); until U3 merges only `smoke-pass` and `small-pilot-provisional` are available.

Certification-tier runs (learners >= 20) MUST be invoked with a pinned threshold config: `--config reports/capacity/configs/<tier>.json`. Threshold changes go through PR review; operators may not relax thresholds ad-hoc under deadline pressure.

| Date | Commit | Env | Plan | Learners | Burst | Rounds | P95 Bootstrap | P95 Command | Max Bytes | 5xx | Signals | Decision | Evidence |
| --- | --- | --- | --- | --: | --: | --: | --: | --: | --: | --: | --- | --- | --- |
| _pending first run_ | — | — | — | — | — | — | — | — | — | — | — | — | — |

When adding a row:

1. Run `npm run capacity:classroom -- ... --output reports/capacity/latest-<env>.json` (or a snapshot path under `snapshots/`).
2. Copy the values from the evidence JSON (`reportMeta.commit`, `summary.endpoints`, `summary.signals`) into the row.
3. The `Evidence` cell links to the persisted JSON (relative path).
4. The verify script runs automatically via `npm run verify`.

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

### Admin ops console KPI endpoint

`GET /api/admin/ops/kpi` runs 7 live `COUNT(*)` queries against `adult_accounts`, `learner_profiles`, `practice_sessions`, `event_log`, `mutation_receipts` plus 1 read against `admin_kpi_metrics`. Cost is bounded by the 3 new indexes added in migration `0010` (`idx_event_log_created`, `idx_practice_sessions_updated`, `idx_mutation_receipts_applied`); `EXPLAIN QUERY PLAN` verifies index usage.

The endpoint is manual-refresh only (no polling). Current KS2 scale keeps per-refresh cost well under the D1 Free-tier 10ms CPU budget. Re-evaluate if `event_log` exceeds ~500K rows — at that point consider a pre-aggregated `admin_kpi_metrics`-style counter for the windowed totals in place of live COUNTs.

**Telemetry (follow-up):** `capacity.admin_ops_kpi` timing + rows-read telemetry is not yet wired; adding it is a deferred operational hardening task.

## Evidence Verification Escape Hatches

`scripts/verify-capacity-evidence.mjs` honours a narrow set of documented escape hatches. Each one is intended for a specific CI shape only and must be justified in the PR that introduces it.

- `CAPACITY_VERIFY_SKIP_ANCESTRY=1` disables the git-ancestry cross-check between a committed tier config and the evidence commit SHA it backs. Justified ONLY for shallow-clone or detached-HEAD CI shards that cannot resolve evidence commits from their local object database. Any CI workflow that sets this env var must call it out in the PR that introduces the workflow change so reviewers can check the shallow-clone justification. When set, verify still emits a warning naming the env var; warnings are surfaced in the `--json` envelope (`warnings` array) and on stderr via `[capacity-verify]` prefixed lines. Grep CI stderr for `capacity-verify` or consume the `--json` envelope to catch accidental escape-hatch usage.

## Residual Risks (U1)

U1 ships with the adversarial-review routes narrowed but not eliminated. Tracked so the next hardening phase has a clean ledger:

- **Threshold value floor not code-enforced.** `scripts/verify-capacity-evidence.mjs` enforces that the required threshold keys are declared per tier but does NOT enforce a minimum value (for example, `max5xx: 999` still satisfies the "key present" check). PR review is the mitigation — config changes under `reports/capacity/configs/` go through the same review gate as code, and reviewers are expected to catch loosened values. See the Phase 2 plan for the PR-review-as-mitigation stance.
- **Zero-duration or physically-impossible timings not detected.** `checkStructuralCoherence` validates arithmetic identity (`totalRequests == sum(sampleCount)`) and timing ordering (`finishedAt >= startedAt`) but does not flag a run whose duration is zero, negative, or implausibly small given the claimed learner count. An operator who fabricates `startedAt == finishedAt` to minimise editing overhead still passes the structural check.
- **Self-consistent fabrication passes verify.** An operator who hand-writes an entirely internally-consistent payload (summary matches thresholds matches failures matches the capacity.md row) defeats every local static check. This route is closed only by a CI-signed provenance artefact, where the load-test writes a signed envelope and verify cross-checks the signature against the commit SHA. Planned for a future phase; explicitly out of scope for U1.
- **Warning visibility on happy-path stdout.** `npm run verify` success output does NOT echo the warning count. The `--json` envelope (`npm run verify -- --json`) always includes the `warnings` array. Operators should either grep stderr for `[capacity-verify]` lines or consume the `--json` envelope in CI to catch silent escape-hatch usage.
- **Orphan / dangling commits pass the existence probe (round 8 P2).** `git cat-file -e <sha>^{commit}` checks local-object-database PRESENCE, not ref-reachability. A commit produced via `git commit-tree` plumbing, or left dangling after a `git reset --hard`, resolves as "present" until `git gc` prunes it (default ~30 days). This is the same class as self-consistent fabrication: the route requires local git-state manipulation and is closed only by CI-signed provenance. Documented here so the comment string "does not exist in repo history" is not read more strongly than the `cat-file -e` call actually backs.
- **Row-cell vs evidence-cell case mismatch surfaces as "commit mismatch" (round 8 P3).** `COMMIT_SHA_REGEX` and `COMMIT_PREFIX_REGEX` use `/i`, so uppercase SHAs pass the format gate. But `evidenceCommitRaw.startsWith(rowCommitRaw)` is case-sensitive: an operator who pastes uppercase into one cell and lowercase into the other triggers a "commit mismatch" report rather than a clearer "case inconsistency" message. Cosmetic; does not affect security. Fixable by lowercasing both sides before `startsWith`; not required for U1.

## Security headers post-deploy check

After any production deploy that touches `worker/src/security-headers.js`, `_headers`, or
`worker/src/index.js`, confirm the live origin advertises the U6 header set before closing the
deploy ticket. `npm run audit:production -- --url https://ks2.eugnel.uk` now issues HEAD checks
against `/`, `/src/bundles/app.bundle.js`, and `/manifest.webmanifest` and fails the audit if any
path is missing the full set.

Manual spot-check (use when the audit script is unavailable):

```bash
curl -sI https://ks2.eugnel.uk/ | grep -iE 'strict-transport-security|x-content-type-options|referrer-policy|permissions-policy|x-frame-options|cross-origin-opener-policy|cross-origin-resource-policy'
curl -sI https://ks2.eugnel.uk/src/bundles/app.bundle.js | grep -iE 'cache-control|strict-transport-security'
curl -sI https://ks2.eugnel.uk/manifest.webmanifest | grep -iE 'cache-control|strict-transport-security'
```

Expected values on every path:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains` (no `preload` until the subdomain
  audit lands in a follow-up PR — F-03 deferral).
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy: ...; microphone=(); ...` (deny-by-default, F-09).
- `X-Frame-Options: DENY`.
- `Cross-Origin-Opener-Policy: same-origin-allow-popups`.
- `Cross-Origin-Resource-Policy: same-site`.

Path-specific cache expectations:

- `/src/bundles/app.bundle.js` — `Cache-Control: public, max-age=31536000, immutable` (Worker
  wrapper explicitly overrides the `no-store` that ASSETS applies from the `_headers` `/*` group).
- `/manifest.webmanifest` — `Cache-Control: public, max-age=86400`.
- `/` and `/index.html` — `Cache-Control: no-store`.
