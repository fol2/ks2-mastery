# CPU Load Capacity Implementation Report

Date: 2026-04-25
Repository: `fol2/ks2-mastery`
Primary plan: `docs/plans/2026-04-25-001-fix-bootstrap-cpu-capacity-plan.md`
Origin note: `docs/plans/james/cpuload/cpuload.md`
CPU load delivery merge commit: `3978f59be64b6b9e5a9ed63cc105c5a2c9a0a5d2`
Report branch base before this document commit: `3def39a36d0f9b9bb1e28216c036e6da75a03195`

## Executive Summary

The CPU load capacity work moved KS2 Mastery from an unbounded historical-read shape towards a bounded, measurable, and operationally safer Worker/D1 runtime.

The original capacity risk was concentrated in `/api/bootstrap` and subject command projection. High-history learners could force the Worker to read, parse, project, redact, normalise, and serialise too much historical `practice_sessions` and `event_log` data in one request. That made classroom-style cold loads and retry storms unsafe on the Cloudflare Workers Free CPU target.

The implemented work now provides:

- Bounded production bootstrap history and explicit bootstrap capacity metadata.
- Lazy learner history APIs so historical sessions and activity can leave the startup path.
- Persistent read-model and public activity-feed storage foundations.
- A resumable local/preview backfill tool for those read models.
- Bounded command projection reads instead of full learner event scans on common paths.
- Client retry/backoff changes to reduce `/api/bootstrap` amplification.
- Stale command recovery that avoids full bootstrap where a smaller refresh is enough.
- Multi-tab bootstrap coordination.
- A classroom load certification driver and capacity operations runbook.
- Regression coverage for high-history bootstrap, read models, lazy history, command projection, retries, tab coordination, and load-driver safety.

This does not certify a 30, 60, or 100+ learner launch yet. The runbook deliberately keeps those tiers as `Not certified` until dated production or preview measurements exist.

## Delivery Timeline

| PR | Merge Commit | Purpose | Merge Time |
| --- | --- | --- | --- |
| #126 `Bound bootstrap history for CPU capacity` | `b133efafbf53786937dd08436b32e3e8f5c325f8` | U1 to U4 foundation: capacity plan, bounded bootstrap, production probe, lazy history APIs, read-model schema/helpers, backfill, tests | 2026-04-25 10:02 UTC |
| #127 `Bound command projection reads` | `bc19e7221067d35362e1e5b8c689bde1534a9e41` | U5: cap command projection event reads and add command projection read-model persistence | 2026-04-25 10:18 UTC |
| #129 `fix(client): back off bootstrap retries` | `cb3d25dd69823668ce4c7d3e5d6d72b0c67177e3` | U6: bootstrap retry backoff and degraded recovery behaviour | 2026-04-25 10:39 UTC |
| #133 `fix(spelling): tolerate pending capacity read-model migration` | `412a58d2f124bf531d3ec8a739d034b1bdf88de5` | Production hardening: keep spelling commands available if read-model tables are not present yet | 2026-04-25 10:46 UTC |
| #131 `fix(client): jitter subject command retries` | `3377fc59185d2dadbe822eed2482151ea5285c3a` | U6: jitter subject command retry timing to reduce coordinated retry pressure | 2026-04-25 10:55 UTC |
| #135 `fix(spelling): cache progress during smart session start` | `1a256a7f5cb693e53b26dd52328e580ade885085` | Production hot-path optimisation for dense-history spelling starts | 2026-04-25 11:02 UTC |
| #134 `fix(client): avoid bootstrap on stale command revision` | `5103d6010507dc93eec22bd4931f9026250e24dd` | U6: stale command revision recovery without defaulting to full bootstrap | 2026-04-25 11:10 UTC |
| #136 `fix(client): coordinate bootstrap across tabs` | `e7b5ea6d349d133164724b1789fdd2571a6da2a5` | U6: cross-tab bootstrap coordination to avoid duplicated cold reload pressure | 2026-04-25 11:45 UTC |
| #139 `test(capacity): add classroom load certification driver` | `3978f59be64b6b9e5a9ed63cc105c5a2c9a0a5d2` | U7: classroom load driver, runbook, and load-driver tests | 2026-04-25 12:22 UTC |

## Plan Coverage

### U1. Capacity Harness and High-History Gate

Implemented in PR #126.

Delivered:

- `tests/worker-bootstrap-capacity.test.js`
  - High-history bootstrap fixtures.
  - Assertions around bounded public bootstrap payloads.
  - Redaction and authentication checks for production-mode bootstrap.
- `scripts/probe-production-bootstrap.mjs`
  - Production-safe bootstrap probe.
  - Supports authenticated request headers/cookies.
  - Reports status, response bytes, bounded counts, and redaction failures.
- Package script:
  - `npm run smoke:production:bootstrap`
- Test-helper updates in `tests/helpers/sqlite-d1.js` to support the new capacity/read-model tests.

Result:

- The repo now has deterministic local coverage for the high-history bootstrap failure mode.
- Production bootstrap can be probed without exposing private learner payloads in output.

Remaining hardening:

- Run and archive dated production smoke results after deployment.
- Add an evidence-output mode to persist probe JSON under an ignored `tmp/` or `reports/` path for release review.

### U2. Bound Production Bootstrap

Implemented in PR #126.

Delivered:

- Production public bootstrap no longer needs to serialise full learner history.
- Bootstrap response includes capacity metadata through `bootstrapCapacity`.
- Bounded recent `practice_sessions` and `event_log` behaviour is exercised by high-history tests.
- Public redaction remains part of the capacity gate.
- Existing account/session, selected learner, subject state, game state, sync state, and monster visual config behaviour remains in the bootstrap envelope.

Primary files:

- `worker/src/repository.js`
- `worker/src/app.js`
- `worker/src/http.js`
- `tests/worker-bootstrap-capacity.test.js`

Result:

- `/api/bootstrap` is no longer intended to grow with all historical practice sessions and all historical event rows in production public read-model mode.
- Bootstrap now has explicit metadata that lets probes and tests detect whether caps were applied.

Remaining hardening:

- Validate real production payload sizes and caps for representative high-history accounts.
- Add an operational threshold check that fails a production smoke if `bootstrapCapacity` metadata is missing.

### U3. Lazy Learner History APIs

Implemented in PR #126.

Delivered:

- Parent history routes for recent sessions and activity.
- Hub API support for lazy recent sessions.
- Parent Hub surface adjusted to consume lazy history without relying on full bootstrap history.

Primary files:

- `worker/src/app.js`
- `worker/src/repository.js`
- `src/platform/hubs/api.js`
- `src/surfaces/hubs/ParentHubSurface.jsx`
- `tests/worker-history-api.test.js`
- `tests/hub-api.test.js`

Result:

- Historical UI surfaces have an explicit path to fetch history separately from startup.
- This reduces the product pressure to keep all user history in `/api/bootstrap`.

Remaining hardening:

- Verify lazy history behaviour against a production or preview deployment with a logged-in browser session.
- Add UX-level smoke coverage for Parent Hub history pagination if this becomes a launch-critical surface.

### U4. Persistent Read-Model and Activity Feed Stores

Implemented in PR #126 and hardened in PR #133.

Delivered:

- Migration `worker/migrations/0009_capacity_read_models.sql` with:
  - `learner_read_models`
  - `learner_activity_feed`
  - indexes for model-key lookup and learner/activity cursor reads.
- `worker/src/read-models/learner-read-models.js`
  - Read-model key constants.
  - Public activity allowlist.
  - Safe row normalisers.
  - Public activity projection from event rows.
- Repository helpers for read-model/activity upserts and reads.
- Projection lifecycle fixes:
  - Normal event/runtime writes project public activity.
  - Reset/clear paths clear activity and read-model projections.
  - Missing table paths can fail soft for derived read-model writes.
- Backfill tool:
  - `scripts/backfill-learner-read-models.mjs`
  - Package script: `npm run read-models:backfill`
- Tests:
  - `tests/worker-read-model-capacity.test.js`
  - `tests/read-model-backfill.test.js`

Result:

- The database now has a generic, subject-neutral storage foundation for small learner summaries and public activity feed rows.
- Read-model writes are derived state. PR #133 prevents missing read-model tables from blocking the primary subject command path.

Remaining hardening:

- Confirm remote D1 migration state before each production rollout.
- Run a backfill on a verified local or preview database copy before considering production backfill.
- Add operational metrics around skipped derived writes when read-model tables are absent or unavailable.

### U5. Incremental Read Models and Command Projection Hardening

Implemented in PR #127, with additional production hot-path optimisation in PR #135.

Delivered:

- `readLearnerProjectionBundle()` no longer needs to scan all learner events for common projection paths.
- Projection reads use a bounded recent event-token window.
- Command projection read-model persistence was introduced through `command.projection.v1`.
- High-history and no-op command tests cover bounded event reads and non-mutating command paths.
- Dense-history spelling start was separately optimised by caching the learner progress map during Smart Review/Trouble Drill session setup.

Primary files:

- `worker/src/repository.js`
- `worker/src/read-models/learner-read-models.js`
- `tests/worker-projections.test.js`
- `shared/spelling/legacy-engine.js`
- `shared/spelling/service.js`
- `tests/spelling.test.js`

Result:

- Command projection no longer depends on unbounded full-history event scans in the common paths covered by tests.
- Spelling Smart Review start-session was reduced from a production benchmark of about 1.7s to about 12.5ms after caching the progress snapshot, per PR #135 evidence.

Remaining hardening:

- Use `command.projection.v1` directly in more handlers instead of only persisting it.
- Add production telemetry around projection read window size and fallback paths.
- Add a targeted production smoke for dense-history spelling `start-session`, not only bootstrap.

### U6. Client Sync and Retry Pressure Reduction

Implemented across PRs #129, #131, #134, and #136.

Delivered:

- Bootstrap retry backoff:
  - Degraded recovery can show cached state without hammering `/api/bootstrap`.
  - Tests cover deterministic bootstrap failure and bounded retries.
- Subject command retry jitter:
  - Retry timing is jittered to reduce herd effects after transient failures.
  - Tests cover retry timing and request preservation.
- Stale command revision recovery:
  - Stale command paths avoid defaulting to full bootstrap.
  - Client can refresh smaller remote state where possible.
- Multi-tab bootstrap coordination:
  - Tabs coordinate bootstrap so multiple tabs do not independently create repeated cold-load requests.
  - Tests cover coordination and fallback behaviour.

Primary files:

- `src/platform/core/repositories/api.js`
- `src/platform/runtime/subject-command-client.js`
- `src/main.js`
- `tests/persistence.test.js`
- `tests/subject-command-client.test.js`

Result:

- A single failure is less likely to become a retry storm against `/api/bootstrap`.
- Multi-tab reload pressure is reduced.
- Stale revision recovery is less dependent on full app rehydration.

Remaining hardening:

- Browser-level validation with two or more real tabs against a preview or production deployment.
- Add telemetry counters for bootstrap leader election, follower reuse, backoff scheduling, and stale-refresh fallback to full bootstrap.

### U7. Classroom Load Certification and Operational Runbook

Implemented in PR #139.

Delivered:

- `scripts/classroom-load-test.mjs`
  - Modes:
    - `--dry-run`
    - `--local-fixture`
    - `--production`
  - Scenarios:
    - Initial learner setup/bootstrap.
    - Cold bootstrap burst.
    - Human-paced Grammar command rounds.
  - Metrics:
    - Status counts.
    - Endpoint/status grouping.
    - P50/P95 wall time.
    - Max response bytes.
    - Operational signals.
    - Failure grouping.
  - Operational signals:
    - `exceededCpu`
    - `d1Overloaded`
    - `d1DailyLimit`
    - `authFailure`
    - `server5xx`
    - `rateLimited`
    - `networkFailure`
  - Safety controls:
    - Production requires `--confirm-production-load`.
    - Production requires non-empty explicit auth or `--demo-sessions`.
    - Local fixture requires localhost/loopback/`.test` origin and `--demo-sessions`.
    - Demo session setup strips operator auth/cookie headers.
    - Raw failure bodies and cookies are non-enumerable and do not appear in JSON output.
    - Non-JSON Worker Error 1102 bodies can still be classified internally without exposing raw HTML.
- Package script:
  - `npm run capacity:classroom`
- `docs/operations/capacity.md`
  - Current certification status.
  - Standard commands.
  - Evidence to record.
  - Operational thresholds.
  - Degrade and rollback guidance.
  - Launch language guardrails.
- Tests:
  - `tests/capacity-scripts.test.js`

Result:

- The repo now has a repeatable driver for classroom-shaped capacity evidence.
- Capacity claims are explicitly tied to dated measurements rather than Cloudflare plan limits or estimates.

Remaining hardening:

- Run local fixture mode against a real dev Worker.
- Run production or preview mode with a controlled learner count after deployment.
- Add report persistence for run outputs.
- Add optional failure thresholds, for example `--max-5xx 0`, `--max-p95-bootstrap-ms 1000`, and `--max-response-bytes`.
- Consider a production maximum guard or `--i-know-this-is-high-load` second confirmation for large learner/burst counts.

## Verification Already Completed

The merged PRs recorded the following verification:

### PR #126

- `node --test tests/worker-bootstrap-capacity.test.js tests/worker-backend.test.js tests/worker-access.test.js tests/worker-monster-visual-config.test.js`
- `node --test tests/worker-history-api.test.js tests/hub-api.test.js tests/worker-hubs.test.js`
- `node --test tests/worker-read-model-capacity.test.js tests/read-model-backfill.test.js tests/worker-history-api.test.js`
- `node --test tests/worker-read-model-capacity.test.js tests/worker-bootstrap-capacity.test.js tests/worker-history-api.test.js`
- `npm test`
- `npm run check`

Independent review found two blockers in the first pass:

- Projection sync/clear lifecycle.
- Unbounded active bootstrap sessions.

Both were fixed before merge. The second reviewer pass found no blocker, critical, or major issues.

### PR #127

- `node --test tests/worker-projections.test.js tests/server-spelling-engine-parity.test.js tests/worker-read-model-capacity.test.js tests/worker-grammar-subject-runtime.test.js tests/worker-punctuation-runtime.test.js`
- `npm test`
- `npm run check`

Independent reviewer found no blockers.

### PR #129

- Bootstrap retry/backoff tests in `tests/persistence.test.js`.
- Full PR verification was completed before merge.

### PR #131

- Subject command client retry tests in `tests/subject-command-client.test.js`.
- Full PR verification was completed before merge.

### PR #133

- `node --test tests/bundle-audit.test.js tests/server-spelling-engine-parity.test.js`
- `npm test`
- `npm run check`
- Remote D1 migrations `0008_monster_visual_config.sql` and `0009_capacity_read_models.sql` were applied with `npm run db:migrate:remote` before that PR was opened, according to the PR note.

### PR #134

- Stale revision recovery tests in `tests/persistence.test.js`.
- Full PR verification was completed before merge.

### PR #135

- `node --test tests/spelling.test.js tests/server-spelling-engine-parity.test.js`
- Production runtime benchmark for Eugenia spelling start-session:
  - Before fix: about 1.7s.
  - After fix: about 12.5ms.
- `npm test`
- `npm run check`
- `git diff --check`

### PR #136

- Multi-tab bootstrap coordination tests in `tests/persistence.test.js`.
- Full PR verification was completed before merge.

### PR #139

- `npm test -- tests/capacity-scripts.test.js tests/worker-bootstrap-capacity.test.js tests/production-smoke-helpers.test.js`
  - 15 passed.
- `node --test scripts/classroom-load-test.mjs`
  - Passed.
- `npm run capacity:classroom -- --dry-run --learners 3 --bootstrap-burst 6 --rounds 1 --summary-only`
  - Passed.
- `npm test -- --test-concurrency=1`
  - 733 tests, 732 passed, 1 skipped.
- `npm run check`
  - Passed.
- `git diff --check`
  - Clean.
- Independent reviewer pass 1 found three blockers:
  - Non-JSON Worker 1102 parse path leaked raw body prefix via `parseError.message`.
  - Production auth guard accepted empty auth headers.
  - Demo session setup carried operator auth.
- All three were fixed before merge.
- Independent reviewer pass 2 found no blockers.

## Current Operational Commands

Dry-run a planned classroom load without network:

```sh
npm run capacity:classroom -- --dry-run --learners 30 --bootstrap-burst 20 --rounds 1
```

Run against a local dev Worker with isolated demo sessions:

```sh
npm run capacity:classroom -- --local-fixture --origin http://localhost:8787 --demo-sessions --learners 10 --bootstrap-burst 10 --rounds 1
```

Run against production or preview with explicit confirmation and auth:

```sh
npm run capacity:classroom -- --production --origin https://ks2.eugnel.uk --confirm-production-load --demo-sessions --learners 10 --bootstrap-burst 10 --rounds 1
```

Probe production bootstrap for a logged-in session:

```sh
npm run smoke:production:bootstrap -- --url https://ks2.eugnel.uk --cookie "ks2_session=..." --max-bytes 600000 --max-sessions 12 --max-events 100
```

Backfill read models on a verified local or preview SQLite/D1 copy:

```sh
npm run read-models:backfill -- --sqlite <path>
```

Normal Cloudflare verification path remains:

```sh
npm test
npm run check
npm run deploy
```

## What We Can Claim Now

Supported claims:

- The repository has bounded-bootstrap regression coverage for high-history accounts.
- The repository has a production bootstrap probe.
- The repository has lazy history routes and read-model/activity-feed storage foundations.
- The repository has bounded command projection read tests.
- The client has retry/backoff and multi-tab coordination protections against bootstrap amplification.
- The repository has a classroom-shaped load driver and a capacity runbook.
- Family demo and small pilot readiness can be assessed with the new gates.

Claims we should not make yet:

- Do not claim 30-learner classroom beta readiness until a dated production or preview run passes.
- Do not claim 60-learner stretch readiness until repeated larger runs pass with acceptable P95 and zero 5xx.
- Do not claim 100+ school readiness until repeated high-load runs include D1 row metrics, Worker tail evidence, and a rollback/degrade drill.
- Do not claim Free-tier capacity from Cloudflare limits alone.

## Follow-Up Hardening Backlog

### H1. Post-Merge Production Validation

Goal:

- Prove that the merged code is live and behaves safely in production.

Suggested work:

- Deploy through `npm run deploy`.
- Run `npm run smoke:production:bootstrap` against a logged-in or demo session.
- Run a small `npm run capacity:classroom -- --production --confirm-production-load --demo-sessions` smoke, starting with a very small learner count.
- Record commit SHA, date, learner count, bootstrap burst size, status distribution, P95 wall times, response bytes, and any signals.

Exit criteria:

- No 5xx.
- No `exceededCpu`.
- No D1 overload.
- Bootstrap payload stays under configured caps.
- No redaction failure.

### H2. Capacity Evidence Artefacts

Goal:

- Make capacity results durable and reviewable.

Suggested work:

- Add `--output <path>` to `scripts/classroom-load-test.mjs`.
- Include run metadata:
  - Commit SHA.
  - Environment.
  - Origin.
  - Learner count.
  - Burst size.
  - Rounds.
  - Auth mode, without secret values.
- Save JSON reports under an ignored `reports/capacity/` path or CI artifact path.
- Add a short Markdown template for recording launch evidence.

Exit criteria:

- A capacity run can be attached to a release review without copying terminal output manually.

### H3. Threshold-Based Load Failure

Goal:

- Let load runs fail automatically when operational thresholds are violated.

Suggested work:

- Add options such as:
  - `--max-5xx 0`
  - `--max-network-failures 0`
  - `--max-bootstrap-p95-ms 1000`
  - `--max-command-p95-ms 750`
  - `--max-response-bytes 600000`
  - `--require-zero-signals`
- Make non-zero exit status reflect threshold failure.

Exit criteria:

- Release scripts can use the load driver as a real gate, not only as an observer.

### H4. Production Load Safety Guardrails

Goal:

- Reduce operator risk while preserving the ability to certify larger loads.

Suggested work:

- Add a second confirmation flag for large production runs, for example:
  - `--confirm-high-production-load`
- Require the second flag above a configured learner or bootstrap burst threshold.
- Emit a prominent JSON `safety` block showing:
  - Production mode.
  - Origin.
  - Learner count.
  - Bootstrap burst.
  - Whether demo sessions or real auth are being used.

Exit criteria:

- Accidental high-load production runs are harder to trigger.

### H5. Real Worker Integration Load Test

Goal:

- Cover the gap between mocked `fetch` unit tests and a real local Worker.

Suggested work:

- Start a local Worker through the existing package/dev-server path.
- Run `npm run capacity:classroom -- --local-fixture --origin http://localhost:8787 --demo-sessions`.
- Add a script or test wrapper that starts/stops the local Worker deterministically if the repo has a stable local Worker command.

Exit criteria:

- The load driver is proven against real route handling, cookies, and Worker response shapes, not only mocked fetch.

### H6. D1 Row Metrics and Worker Tail Correlation

Goal:

- Attribute capacity failures to CPU, D1 rows, D1 duration, queueing, or payload size.

Suggested work:

- Add structured log fields for capacity-relevant endpoints:
  - Endpoint.
  - Status.
  - Bounded counts.
  - Response bytes.
  - Query count.
  - Rows read/written where available.
  - Wall time.
  - Failure signal.
- Add a runbook step to correlate load-driver request IDs with Worker tail events.

Exit criteria:

- A failed capacity run points to the bottleneck without manual log archaeology.

### H7. Consume `command.projection.v1` More Directly

Goal:

- Finish the read-model direction for command projection.

Suggested work:

- Identify command handlers that still rebuild projection context when a read model would be enough.
- Use `command.projection.v1` directly where semantics are already covered by tests.
- Add parity tests for reward projection and replay/idempotency.

Exit criteria:

- Common command paths use read-model state as input, not only as derived output.

### H8. Dense-History Subject Smoke Coverage

Goal:

- Extend the production smoke model beyond bootstrap.

Suggested work:

- Add a production or preview smoke for dense-history subject starts, especially Spelling Smart Review.
- Include a safe demo or configured learner mode.
- Check P95 command wall time and absence of 5xx/CPU signals.

Exit criteria:

- The system can prove both startup and first command paths are safe under historical load.

### H9. Browser Multi-Tab Validation

Goal:

- Prove the tab coordination behaviour in a real browser, not only unit tests.

Suggested work:

- Use a logged-in browser session.
- Open two or three tabs against the same account.
- Force simultaneous refresh/bootstrap.
- Verify that only one tab performs the leading bootstrap while others reuse/follow/back off.

Exit criteria:

- Multi-tab behaviour is validated end to end with the real storage and browser APIs.

### H10. Launch Evidence Table

Goal:

- Keep product claims aligned with real measurements.

Suggested work:

- Extend `docs/operations/capacity.md` with a dated evidence table.
- Record:
  - Commit.
  - Environment.
  - Learners.
  - Bootstrap burst.
  - Rounds.
  - P95 bootstrap.
  - P95 command.
  - 5xx count.
  - Signals.
  - Decision.

Exit criteria:

- A future launch review can point to concrete evidence before changing any tier from `Not certified`.

## Recommended Next Cycle

The next hardening cycle should be post-merge production validation plus evidence persistence:

1. Deploy the current main commit.
2. Run production bootstrap smoke with a safe session.
3. Run a very small production classroom load with demo sessions.
4. Add `--output` and threshold options to the load driver.
5. Record the result in `docs/operations/capacity.md`.

This is the shortest path from "implemented safety gates" to "evidence we can use for a launch decision".

## Current Residual Risks

- No 30/60/100+ learner tier is certified yet.
- The classroom load driver is unit-tested with mocked fetch but still needs a real local Worker run.
- Production classroom load has no hard upper bound beyond explicit confirmation and auth.
- The load driver reports endpoint status and timing but does not yet persist evidence or enforce thresholds.
- D1 row metrics are not yet first-class in the classroom load output.
- `command.projection.v1` is persisted but should be consumed more directly in follow-up command hardening.
- Browser multi-tab coordination still needs end-to-end validation in a real browser session.
- Production smoke/deploy validation is still a separate operational step after code merge.

## Bottom Line

The implementation has materially reduced the original CPU load risk by bounding bootstrap, moving history off the startup path, adding read-model foundations, bounding command projection reads, and reducing client retry amplification. It also added the tooling and runbook needed to measure classroom capacity.

The next hardening work should not be another architectural rewrite. It should convert the new tooling into production evidence, automated thresholds, and telemetry-backed release gates.
