# KS2 Mastery Capacity Operations

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

## Evidence Verification Escape Hatches

`scripts/verify-capacity-evidence.mjs` honours a narrow set of documented escape hatches. Each one is intended for a specific CI shape only and must be justified in the PR that introduces it.

- `CAPACITY_VERIFY_SKIP_ANCESTRY=1` disables the git-ancestry cross-check between a committed tier config and the evidence commit SHA it backs. Justified ONLY for shallow-clone or detached-HEAD CI shards that cannot resolve evidence commits from their local object database. Any CI workflow that sets this env var must call it out in the PR that introduces the workflow change so reviewers can check the shallow-clone justification. When set, verify still emits a warning naming the env var; warnings are surfaced in the `--json` envelope (`warnings` array) and on stderr via `[capacity-verify]` prefixed lines. Grep CI stderr for `capacity-verify` or consume the `--json` envelope to catch accidental escape-hatch usage.

## Residual Risks (U1)

U1 ships with the adversarial-review routes narrowed but not eliminated. Tracked so the next hardening phase has a clean ledger:

- **Threshold value floor not code-enforced.** `scripts/verify-capacity-evidence.mjs` enforces that the required threshold keys are declared per tier but does NOT enforce a minimum value (for example, `max5xx: 999` still satisfies the "key present" check). PR review is the mitigation — config changes under `reports/capacity/configs/` go through the same review gate as code, and reviewers are expected to catch loosened values. See the Phase 2 plan for the PR-review-as-mitigation stance.
- **Zero-duration or physically-impossible timings not detected.** `checkStructuralCoherence` validates arithmetic identity (`totalRequests == sum(sampleCount)`) and timing ordering (`finishedAt >= startedAt`) but does not flag a run whose duration is zero, negative, or implausibly small given the claimed learner count. An operator who fabricates `startedAt == finishedAt` to minimise editing overhead still passes the structural check.
- **Self-consistent fabrication passes verify.** An operator who hand-writes an entirely internally-consistent payload (summary matches thresholds matches failures matches the capacity.md row) defeats every local static check. This route is closed only by a CI-signed provenance artefact, where the load-test writes a signed envelope and verify cross-checks the signature against the commit SHA. Planned for a future phase; explicitly out of scope for U1.
- **Warning visibility on happy-path stdout.** `npm run verify` success output does NOT echo the warning count. The `--json` envelope (`npm run verify -- --json`) always includes the `warnings` array. Operators should either grep stderr for `[capacity-verify]` lines or consume the `--json` envelope in CI to catch silent escape-hatch usage.
