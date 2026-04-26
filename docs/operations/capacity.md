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

Dense-history Spelling Smart Review smoke (U11) for a high-history demo or learner session:

```sh
npm run smoke:production:spelling-dense -- --origin https://ks2.eugnel.uk --cookie "ks2_session=..." --max-p95-ms 750 --require-bootstrap-capacity --output reports/capacity/spelling-dense-latest.json
```

Use package scripts for Cloudflare operations. Normal deploy verification remains:

```sh
npm test
npm run check
npm run deploy
```

## Local-worker integration runs (U4)

`npm run capacity:local-worker` orchestrates a real `wrangler dev --local` subprocess and runs `scripts/classroom-load-test.mjs --local-fixture` against it, bridging the gap between mocked-fetch unit tests and a full production load run. The orchestrator is an optional pre-deploy gate; it is **not** wired into `npm run check` or `npm run verify` — release pipelines keep the faster mocked-fetch tests as the default gate and reach for this script when evaluating U3/U5/U6/U7 against a real Worker.

### Invocation

```sh
npm run capacity:local-worker -- --learners 5 --bootstrap-burst 5 --rounds 1 --require-zero-signals --max-network-failures 0
```

Every argument after the `--` separator is forwarded unchanged to `scripts/classroom-load-test.mjs`; the orchestrator itself only accepts `--fresh`, `--port-start <n>`, and `--readiness-timeout-ms <n>`.

### What the script does

1. Applies local D1 migrations via `npm run db:migrate:local` (equivalent to `wrangler d1 migrations apply ks2-mastery-db --local` routed through `scripts/wrangler-oauth.mjs`).
2. Picks a free port in the `8787 → 8788 → 8789` range and logs the chosen port to stdout AND into the evidence JSON `safety.originResolved` field.
3. Spawns `wrangler dev --local --port <chosen>` via `scripts/wrangler-oauth.mjs` so `CLOUDFLARE_API_TOKEN` never reaches the child-process env (a unit test asserts the child env does not contain the token).
4. Polls readiness with a two-stage check — first `GET /api/health` (or the `ASSETS` root), then `POST /api/demo/session` — to avoid the "auth-401 treated as ready" false positive. Readiness has a 30-second hard cap with exponential backoff (100 ms → 200 ms → 400 ms → capped at 1 s).
5. Runs the classroom load driver with `--local-fixture --origin http://localhost:<port> --demo-sessions --output reports/capacity/latest-local.json`, appending every operator-supplied passthrough arg. Operators may override `--output` in the passthrough; a warning is emitted and the operator path wins. The orchestrator owns `--origin`/`--url`/`--local-fixture`/`--demo-sessions` and rejects those in the passthrough upfront (before wrangler spawn) so a typo surfaces instantly.
6. Tears down the wrangler subprocess cleanly on the way out: `SIGINT` on POSIX, `taskkill /F /PID <pid> /T` on Windows.
7. After driver exit 0, asserts that the evidence file exists and is non-empty. A missing/empty evidence file returns exit code 3 with a clear error — this closes the gap where a driver claiming success could leave downstream verifiers reading stale evidence from a previous run.

### Evidence and logs

- Evidence JSON: `reports/capacity/latest-local.json` — the orchestrator forces `--output reports/capacity/latest-local.json` onto the driver's argv (operators can override with their own `--output <path>` which wins with a warning). The orchestrator asserts the chosen evidence path exists and is non-empty on driver exit 0 (exit 3 if missing).
- Redacted log: `reports/capacity/local-worker-stdout.log` — wrangler stdout/stderr scrubbed through the shared redaction filter (`scripts/lib/log-redaction.mjs`), which buffers partial lines across stream chunks so a secret value split between two `data` events cannot leak its trailing half. Patterns cover: cookies (`ks2_session=<value>`, incl. quote-delimited), `Bearer <token>` headers (incl. quote-delimited), named secret env assignments (`CLOUDFLARE_API_TOKEN`, `NPM_TOKEN`, `OPENAI_API_KEY`, `AWS_SECRET_ACCESS_KEY`, `DATABASE_PASSWORD`, `OAUTH_CLIENT_SECRET`, etc.), OAuth artefacts (`access_token`, `refresh_token`, `id_token`, `api_key`, `api_token`), and JSON-shape `"*_token"/"*_secret"/"*_password"/"*_key"` payloads. Values are replaced with `[redacted]`. The log file is gitignored. Migrations and driver subprocess output use `stdio: 'inherit'` and are NOT redacted — do not run this orchestrator with sensitive cookies or tokens already in your shell history.

### Env sanitisation (allowlist)

`scripts/capacity-local-worker.mjs` runs an allowlist-based env sanitiser before handing env to the wrangler subprocess: only `PATH`, `HOME`/`USERPROFILE`/`APPDATA`/`LOCALAPPDATA`, `USER`/`USERNAME`, `SHELL`, `LANG`/`LC_*`, `TZ`, `TMPDIR`/`TEMP`/`TMP`, `NODE_ENV`, `CLOUDFLARE_ACCOUNT_ID`, `CF_ACCOUNT_ID`, `WRANGLER_LOG`, `WRANGLER_SEND_METRICS`, `FORCE_COLOR`/`NO_COLOR`, `CI`, `TERM`, `WORKERS_CI`, plus any `WRANGLER_*` prefixed variable, are passed through. Any key matching `/TOKEN|SECRET|PASSWORD|KEY$/i` is dropped even if it would otherwise be allowlisted (a rogue `WRANGLER_TOKEN` cannot slip through the prefix pass). The `CLOUDFLARE_API_TOKEN` survives only when `WORKERS_CI=1` so the Cloudflare Workers CI build path keeps working; everywhere else it is stripped. This is a strict allowlist rather than a denylist so a future third-party secret named `FOOBAR_TOKEN` is dropped by default instead of leaking.

### Windows pre-step

Windows CI runners leak wrangler subprocesses after a previous `SIGKILL` because `taskkill /F` is not always cascaded. Before invoking `npm run capacity:local-worker` on Windows, run:

```powershell
taskkill /F /IM wrangler.exe
```

This is a safety pass, not a prerequisite; the orchestrator's own teardown still uses `taskkill /F /PID <pid> /T` on exit.

### Operator checklist

- No other wrangler process bound to 8787–8789 (otherwise the orchestrator will pick the next free port and record it in the evidence JSON — not an error, but worth noticing).
- `reports/capacity/latest-local.json` exists after a clean run.
- No dangling `wrangler.exe` / `wrangler` process after exit.

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

### Dense-history Spelling smoke (U11)

`scripts/spelling-dense-history-smoke.mjs` (`npm run smoke:production:spelling-dense`) is the dated evidence row for PR #135's Smart Review start-session caching optimisation. PR #135 reduced dense-history Smart Review starts from ~1.7 s to ~12.5 ms by caching the learner progress map for the duration of `startSession`, eliminating a per-slug `getProgress` fan-out during the initial `advanceCard` hop. Because the optimisation only matters when the learner has several hundred active progress rows, the gate is only meaningful against a live account with dense practice history.

**`--cookie` is required for the dense-history latency check.** Without `--cookie`, the smoke creates a fresh demo session which has zero progress rows — the caching optimisation has nothing to cache, so the `--max-p95-ms` gate degrades to a structural contract check (session phase + read-model redaction + `bootstrapCapacity` present) rather than a dense-history latency measurement. To produce a meaningful P95 wall-time row in the launch-evidence table, pass `--cookie "ks2_session=..."` pointing at a learner with 200+ practice sessions.

Expected behaviour:

- The smoke creates (or reuses) a demo session, loads `/api/bootstrap`, starts a Smart Review spelling session with `mode: 'smart'`, submits one deliberately-wrong answer, and captures the client-observed wall time for the `start-session` command.
- `--max-p95-ms 750` is the default production gate and matches the classroom-tier command P95 threshold in `capacity:classroom:release-gate`. The dense-history ceiling is deliberately generous (PR #135 typically reports ~12.5 ms post-optimisation) so expected transient latency does not produce false fails. The gate is meaningful only with `--cookie` (see above).
- `--require-bootstrap-capacity` asserts `/api/bootstrap` carries `bootstrapCapacity` metadata (mirrors the probe gate).
- `--output reports/capacity/spelling-dense-*.json` persists a U3 schema-shaped envelope (`reportMeta`, `summary.endpoints[<endpoint>]`, `thresholds.maxP95Ms.{configured, observed, passed}`, `safety`) that `scripts/verify-capacity-evidence.mjs` accepts verbatim — the launch-evidence table can cite the JSON directly and `npm run verify` will cross-check the row against it. `summary.commands[]` is retained alongside `summary.endpoints` for post-mortem readability (server-capacity digest, requestId trail) but is informational; verify reads the endpoints map.
- The smoke exits 1 (EXIT_VALIDATION) for any product-contract breach: forbidden read-model key, raw-word or raw-sentence leak on start-session or submit-answer, `meta.capacity.signals[]` carrying `exceededCpu`, `start-session` wall time exceeding `--max-p95-ms`, missing `bootstrapCapacity` under `--require-bootstrap-capacity`, or an HTTP status outside 200 and 500+. It exits 3 (EXIT_TRANSPORT) for fetch failure, timeout, or upstream 5xx.
- Structural plan-note: against a local worker-server harness the 12.5 ms claim is not reproducible because the local SQLite double does not carry dense production progress rows. The smoke falls back to a structural contract check (session phase + redaction pass + `bootstrapCapacity` present) in CI and the latency gate fires only against a live production run with `--cookie`.

Record dense-history runs by appending a row to the launch-evidence table above with `summary.endpoints['POST /api/subjects/spelling/command'].p95WallMs` populating the P95 Command column and the persisted JSON in the Evidence column. Only rows produced with `--cookie` are meaningful dense-history evidence; demo-mode runs satisfy the contract check only.

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

`[ks2-worker] {event: "capacity.request", ...}` telemetry (U3) covers
`/api/admin/ops/kpi` alongside every other Worker route; the admin
console KPI endpoint inherits the generic emission path and does not
require bespoke wiring.

## `[ks2-worker] event: capacity.request` structured telemetry (U3)

Every Worker response now emits (subject to the emission-level sampler)
a single `[ks2-worker]` JSON log line carrying bounded metadata for
capacity attribution. The line shares the `[ks2-worker]` prefix with
`logMutation()` in `worker/src/repository.js` so existing log
aggregators treat every Worker-emitted event line identically — the
discriminator is the `event` field on the JSON payload.

### Shape

```json
[ks2-worker] {
  "event": "capacity.request",
  "requestId": "ks2_req_<uuid-v4>",
  "endpoint": "/api/bootstrap",
  "method": "GET",
  "status": 200,
  "phase": null,
  "queryCount": 3,
  "d1RowsRead": 42,
  "d1RowsWritten": 0,
  "d1DurationMs": 4.1,
  "wallMs": 123.4,
  "responseBytes": 12345,
  "statements": [ { "name": "selectLearners", "rowsRead": 2, "rowsWritten": null, "durationMs": 1.2 } ],
  "statementsTruncated": false,
  "bootstrapCapacity": { "version": 12, "mode": "rehydrated" },
  "projectionFallback": false,
  "derivedWriteSkipped": false,
  "bootstrapMode": "rehydrated",
  "signals": [],
  "at": "2026-04-25T23:40:00.000Z"
}
```

The `meta.capacity` surface returned to clients on
`/api/bootstrap`, `/api/subjects/:subject/command`, `/api/hubs/parent/*`,
and `/api/classroom/*` is a narrower closed allowlist (`requestId`,
`queryCount`, `d1RowsRead`, `d1RowsWritten`, `wallMs`, `responseBytes`,
plus the optional bootstrap/projection/derived-write/mode fields and
`signals`). Per-statement breakdown is NEVER returned to clients.

### Redaction contract

Only bounded metadata is recorded: request ID, endpoint, method, HTTP
status, phase (`pre-route` on unauthenticated path), per-statement
short names (derived from SQL keyword only, never the full query text),
per-request D1 query count, `rows_read` / `rows_written`,
`bootstrapCapacity` shape (closed allowlist of keys), and the
`signals[]` closed-allowlist set. The telemetry path NEVER records any
of:

- answer-bearing payloads or private spelling prompts;
- child-identifying content (learner names, emails, UUID-embedded
  strings);
- session cookie values (`ks2_session=...`);
- any key from `tests/helpers/forbidden-keys.mjs::FORBIDDEN_KEYS_EVERYWHERE`.

`tests/worker-capacity-telemetry.test.js` exercises a full bootstrap +
parent-hub read with sentinel tokens seeded into the fixture data and
asserts that every emitted `[ks2-worker] event: capacity.request`
line is free of those sentinels, forbidden keys, and cookie values.

### Signals closed allowlist

Signals are short-lived, bounded tokens appended to `meta.capacity.signals[]`
and the structured log. Tokens outside the closed allowlist are silently
rejected and counted via the internal `signalsRejected` counter — raw
error messages, learner names, and any free-form string CANNOT reach the
public surface.

| Token                  | Dimension captured                                                   |
| ---------------------- | -------------------------------------------------------------------- |
| `exceededCpu`          | HTTP 1102 / Worker CPU budget exhaustion                             |
| `d1Overloaded`         | D1 overload (transient backend pressure)                             |
| `d1DailyLimit`         | D1 daily quota exhaustion                                            |
| `rateLimited`          | Rate-limit bucket trip                                               |
| `networkFailure`       | Transport failure between Worker and dependency                      |
| `server5xx`            | Uncategorised 5xx                                                    |
| `bootstrapFallback`    | Bootstrap took the fallback path                                     |
| `projectionFallback`   | Projection read fell back from public read-model to live query       |
| `derivedWriteSkipped`  | Derived-write path skipped a projection update                       |
| `breakerTransition`    | Circuit-breaker state change                                         |
| `redactionFailure`     | Redaction pipeline emitted a silent-fail (no status change)          |
| `staleWrite`           | Mutation CAS rejected a stale write (distinct from arbitrary 409)    |
| `idempotencyReuse`     | 200-OK replay served from the request-receipt cache                  |

HTTP status already carries `authFailure` (401/403), `badRequest` (400),
`notFound` (404), and `backendUnavailable` (503); those dimensions are
NOT duplicated as signal tokens.

### Sampling

- `CAPACITY_LOG_SAMPLE_RATE` env var (float in `[0, 1]`, default 1.0)
  controls the happy-path emission rate. Local and preview keep the
  default 1.0 so every request is observable during development;
  production sets `CAPACITY_LOG_SAMPLE_RATE = 0.1` so 10 % of happy-path
  rows emit.
- Failure rows with `status >= 500` **bypass** the sampler and emit at
  100 %.
- Pre-route 401s (the `phase: "pre-route"` marker — credential-stuffing
  bursts before any route handler ran) also **bypass** the sampler and
  emit at 100 %, so auth-storm observability survives a low sample rate
  in production.
- `head_sampling_rate: 1` in `wrangler.jsonc` is a
  Cloudflare-observability-level knob that remains enabled and is
  orthogonal to the emission-level sampler — the two filters compose.
- Scaling the emission rate up from 0.1 happens only after a week of
  production data shows quota headroom. Production first, tuning
  second.

### D1 row metrics

`requireDatabaseWithCapacity(env, capacity)` returns a
telemetry-aware wrapper that routes `.prepare().bind().first/run/all()`
terminal calls through `withCapacityCollector(db, collector)` in
`worker/src/d1.js`. The proxy reads `meta.rows_read` /
`meta.rows_written` when D1 surfaces them and accumulates per-request
counts on the collector. Constructor injection rather than env-attach:
the collector is threaded explicitly through `createWorkerRepository({
env, now, capacity })`, the auth boundary
(`createSessionAuthBoundary({ env, capacity })`), the demo protect
helpers, and the ops-error-event rate-limit query. Threading is
explicit so cross-request collector leakage is architecturally
impossible.

For tests, `tests/helpers/sqlite-d1.js` simulates `meta.rows_read` /
`meta.rows_written` on the local SQLite double so the telemetry
contract can be asserted without a live D1 binding. The local helper
is **shape-only** — the absolute numbers are approximations; production
D1 remains the source of truth for performance claims.

### Tailing telemetry in production

```sh
npm run ops:tail -- --search '"event":"capacity.request"'
```

Correlate a failing `npm run smoke:production:bootstrap --output ...`
run with the Worker log by grepping for the `requestId`. The probe
also echoes its `x-ks2-request-id` in `--output` mode so the same
identifier lands in the structured log, the response body (`meta.capacity.requestId`),
and the evidence snapshot.

### Emission failure handling

JSON serialisation of the structured log is wrapped in a try/catch so
a cyclic or exotic object in the collector state cannot crash the user
response. On failure the Worker falls back to a non-stringified
`console.log(prefix, payload)` emission so the line is still
discoverable in Workers tail; the user response is unaffected.

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
- `/manifest.webmanifest` — `Cache-Control: public, max-age=3600` (1-hour cache updated in U8
  so app-manifest churn is visible to installed PWAs within the hour).
- `/favicon.ico` — `Cache-Control: public, max-age=86400`.
- `/` and `/index.html` — `Cache-Control: no-store`.

### Cache-split post-deploy check (U8)

`scripts/production-bundle-audit.mjs` also issues HEAD checks against the cache lanes after
U8; run `npm run audit:production -- --url https://ks2.eugnel.uk` to verify the split is live
before closing a deploy ticket. The script fails with a pointed message if any path returns
an unexpected `Cache-Control` value (for example, a rewrite that flips `/manifest.webmanifest`
to `no-store` or drops `immutable` from the hashed-bundle rule).

Manual spot-check (use when the audit script is unavailable):

```bash
curl -sI https://ks2.eugnel.uk/                                  | grep -i cache-control   # expect: no-store
curl -sI https://ks2.eugnel.uk/src/bundles/app.bundle.js         | grep -i cache-control   # expect: public, max-age=31536000, immutable
curl -sI https://ks2.eugnel.uk/assets/app-icons/favicon-32.png   | grep -i cache-control   # expect: public, max-age=31536000, immutable
curl -sI https://ks2.eugnel.uk/api/bootstrap                     | grep -i cache-control   # expect: no-store
curl -sI https://ks2.eugnel.uk/manifest.webmanifest              | grep -i cache-control   # expect: public, max-age=3600
```

## CSP Report-Only rollout

U7 ships a strict Content-Security-Policy as `Content-Security-Policy-Report-Only` so the
browser reports violations without blocking the page. Enforcement (flipping to
`Content-Security-Policy`) is a follow-up PR that lands only after a >= 7-day observation
window with zero blocking violations.

Start date: record the production deploy SHA below on the day the U7 PR merges. The
7-day observation window is measured from that date.

| Rollout milestone | Date | Commit SHA | Notes |
| --- | --- | --- | --- |
| U7 Report-Only shipped | TBD on merge | TBD on merge | Baseline violations expected from Google Fonts, Turnstile. |
| Midpoint check-in (day 3-4) | TBD | TBD | Tail recent violations; triage any unexpected origins. |
| Enforcement decision gate (day 7+) | TBD | TBD | Zero unexpected origins => open enforcement-flip PR. |

### Monitoring

Tail CSP violations with Workers observability:

```sh
npm run ops:tail -- --search "[ks2-csp-report]"
```

Each log line is a structured JSON object carrying the sanitised `blockedUri`,
`documentUri`, `sourceFile`, `violatedDirective`, `lineNumber`, and `statusCode`. Fields
are stripped of newline/control characters before emission to prevent log-line spoofing
(security F-02).

During the observation window, expect violations from:

- Google Fonts connect/style (allowed in the policy but browsers sometimes double-fire).
- Turnstile iframe (only if a future sign-in page loads the widget before the policy caches).
- Browser extensions injecting inline scripts or styles on the page.

### When to flip to enforcing

Open the enforcement-flip PR only when all of the following are true:

1. 7+ days have elapsed since U7 merge, with production traffic throughout.
2. No blocking violations from origins the policy does not already allowlist.
3. `[ks2-csp-report]` volume is steady (no new directives spiking after app changes).
4. `scripts/production-bundle-audit.mjs` HEAD check on `/` still shows
   `Content-Security-Policy-Report-Only` with the current inline-script hash.

The flip PR swaps the header name from `Content-Security-Policy-Report-Only` to
`Content-Security-Policy` in `worker/src/security-headers.js` and `_headers`, and bumps
the corresponding tests. No policy directives change between the two passes.

### CSP inline-script hash refresh

The inline theme-bootstrap script at `index.html:25-34` is pinned to the CSP via its
SHA-256 hash. Any byte-level change to the script (including whitespace) invalidates the
deployed hash; the build step (`scripts/build-public.mjs`) recomputes the hash on every
build so a change to the script body automatically propagates to
`worker/src/generated-csp-hash.js` and `dist/public/_headers`.

To inspect the current hash without deploying:

```sh
node ./scripts/compute-inline-script-hash.mjs
```

## Playwright test suite

U5 (sys-hardening p1) added `@playwright/test` and three golden-path scenes
under `tests/playwright/*.playwright.test.mjs`. The suite is additive — it
does NOT run under `npm test` (node --test) because `scripts/run-node-tests.mjs`
skips the `tests/playwright/` folder so the two runners stay independent.

### Running locally

```sh
npm run test:playwright                           # all scenes, all five viewports
npm run test:playwright -- --project=mobile-390   # single viewport
npm run test:playwright -- tests/playwright/spelling-golden-path.playwright.test.mjs
```

The config spins up `tests/helpers/browser-app-server.js --with-worker-api`
automatically, so `/api/*` routes respond during scenes. Chromium is the only
browser wired up in U5; Firefox / WebKit land in a follow-up.

### First-time setup

Fresh clones must download the Chromium binary once:

```sh
npx playwright install chromium
```

The repo root `.npmrc` enforces the skip by default:

```
playwright_skip_browser_download=true
```

Playwright honours that key as equivalent to the
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` environment variable, so every
`npm install` — including the one Cloudflare Wrangler remote builds run —
automatically skips the ~300 MB Chromium download. The deployed Worker never
uses the Playwright browser, and developers who want it locally opt in with
the `npx playwright install chromium` command above.

### Updating screenshot baselines

U5 commits a single `mobile-390` baseline for `spelling-golden-path` under
`tests/playwright/__screenshots__/`. Grammar and punctuation baselines plus the
full five-viewport matrix are landed in follow-up units (U9 / U10 / U12).

When an intentional visual change ships, regenerate the baselines locally:

```sh
npm run test:playwright -- --update-snapshots
```

Commit the updated PNGs in the same PR as the visual change. Review the diff
alongside the code change so an accidental regression never sneaks in behind a
baseline refresh.

## Browser Validation (U8)

U8 (capacity release gates and telemetry) introduces browser-native proof that
the Phase 1 `localStorage`-lease multi-tab bootstrap coordination holds under
simultaneous load. The scene lives at
`tests/playwright/bootstrap-multi-tab.playwright.test.mjs` and drives a real
Chromium instance against five coordination scenarios (A through E).

### What the multi-tab test proves

The lease-arbitration contract inside
`src/platform/core/repositories/api.js`: when several tabs in the same
browser window reload, they observe one another's coordination lease via
shared `localStorage` and defer to a single leader. Only the leader's tab
actually hits `/api/bootstrap`; the followers rehydrate from the
warmed-in-cache bundle.

The scene asserts this via two independent signals:

1. Network: `page.on('request')` counts every outbound
   `/api/bootstrap` call. Three coordinated tabs reloading within a
   ~1.5 s window must produce no more than two bootstrap hits (leader
   plus one natural follower retry); five tabs stress must stay
   strictly below the naive fan-out of five.
2. Counter: `globalThis.__ks2_capacityMeta__` exposes per-tab
   totals — `bootstrapLeaderAcquired`, `bootstrapFollowerWaited`,
   `bootstrapFollowerUsedCache`, `bootstrapFollowerTimedOut`,
   `bootstrapFallbackFullRefresh`, `staleCommandSmallRefresh`,
   `staleCommandFullBootstrapFallback`,
   `bootstrapCoordinationStorageUnavailable`. The counters are installed
   only when `process.env.NODE_ENV !== 'production'`; esbuild's
   `define` block in `scripts/build-client.mjs` dead-code eliminates
   them in shipped bundles (verified by the
   `__ks2_capacityMeta__` entry in
   `scripts/audit-client-bundle.mjs` `FORBIDDEN_TEXT`).
   `bootstrapCoordinationStorageUnavailable` fires when
   `localStorage.setItem` throws during lease acquisition (quota
   exhausted, Safari Private Browsing, managed-profile Chromebook with
   site storage disabled); the tab falls through to independent
   bootstrap without error. U9 circuit breakers should treat a
   non-zero rate of this counter as the classroom-scale signal for
   the coordination-bypass path.

### What failure means operationally

- Scenario A or B failing with `bootstrapTotal > 2` (or > 4 for the
  5-tab variant) means lease arbitration broke. In production this
  surfaces as classroom-scale fan-out storms at morning sign-in,
  multiplying the bootstrap cost by the number of open tabs per pupil.
  Treat as a release blocker.
- Scenario C or E failing with `bootstrapFollowerTimedOut === 0`
  means the expired-lease takeover path no longer fires. Ghost leases
  (a tab closed mid-bootstrap without releasing) would then block
  every subsequent tab for the remainder of the session. Treat as a
  release blocker.
- Scenario D failing means the "no coordination possible" path
  (incognito / school managed profiles with `localStorage` disabled)
  is no longer gracefully degrading.

### Fallback behaviour when `localStorage` is unavailable

Incognito windows and UK school Chromebooks with managed profiles that
deny site-scoped storage cannot observe the lease. Scenario D confirms
each such tab independently issues its own bootstrap — no hard error,
no shared lease — which at classroom scale reproduces the pre-Phase-1
fan-out shape. This is an accepted residual risk for v2 and is
tracked for the U9 circuit breakers work: if breaker telemetry shows
the incognito / managed-profile surface materially dominates classroom
load, the escalation is a Durable-Object-backed coordination layer
(see `worker/README.md` coordination deferral note).

### How to invoke locally

```sh
npm run test:playwright -- tests/playwright/bootstrap-multi-tab.playwright.test.mjs
```

The scene is `desktop-1024`-only (gated via
`test.beforeEach(testInfo => test.skip(testInfo.project.name !== 'desktop-1024'))`);
coordination is viewport-independent, so running across all five
projects would only saturate the demo-session rate limit without
adding coverage. If a regression specifically needs viewport
verification (e.g. a touch-emulation interaction with the follower
deferral loop), remove the skip and scope the new scene accordingly.

The Playwright webServer passes `KS2_BUILD_MODE=test` so the bundle
served under test keeps the counter object alive
(`scripts/build-client.mjs` swaps the esbuild `NODE_ENV` define from
`"production"` to `"test"`). Production builds use the default
`production` mode and the counter identifier is stripped — verified by
both `scripts/audit-client-bundle.mjs` (local bundle) and
`scripts/production-bundle-audit.mjs` (post-deploy).
