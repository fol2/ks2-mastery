# P2 Tail Classification Record

Date: 2026-04-29

Commit: `e5d03117bd7c46c269bf1d75cceca42b31452bc8`

Evidence files:

- `reports/capacity/evidence/2026-04-29-p2-t1-strict-post-p1.json`
- `reports/capacity/evidence/2026-04-29-p2-t5-strict-repeat-1.json`
- `reports/capacity/evidence/2026-04-29-p2-t1-tail-correlation.json`
- `reports/capacity/evidence/2026-04-29-p2-t5-tail-correlation.json`
- `reports/capacity/evidence/2026-04-29-p2-t1-statement-map.json`
- `reports/capacity/evidence/2026-04-29-p2-t5-statement-map.json`
- `reports/capacity/latest-1000-learner-budget.json`
- `reports/capacity/latest-evidence-summary.json`

Worker log source:

- Live package-script capture with `npm run ops:tail` to `/tmp/ks2-p2-t1-worker-logs.pretty.log` and `/tmp/ks2-p2-t5-worker-logs.pretty.log`.
- Raw pretty-tail logs are not committed because they are live operational output and may include unrelated traffic. The committed correlation files are bounded to retained capacity request ids.
- `npm run ops:tail -- --format json` was tested and is not a valid JSON export path because Wrangler receives duplicate `--format` values. P2 therefore selects a package-script JSON-tail repair.

Statement map:

- T1 statement coverage: complete, 144/144 requests with statement logs, 1968/1968 expected statements observed, no truncation.
- T5 statement coverage: complete, 171/171 requests with statement logs, 2629/2629 expected statements observed, no truncation.
- No query-plan recommendation was produced by either statement map.

Budget ledger:

- Refreshed in `reports/capacity/latest-1000-learner-budget.json` and `docs/operations/capacity-1000-learner-free-tier-budget.md`.
- Ledger remains `modellingOnly: true` and non-certifying.

## Strict 30 Result

### T1 Strict Post-P1

- Evidence: `reports/capacity/evidence/2026-04-29-p2-t1-strict-post-p1.json`
- Result: passed thresholds and was classified as a certification candidate, pending the normal capacity table verifier.
- Bootstrap P50/P95/P99/max: 204.1 ms / 814.6 ms / not emitted / 818.2 ms.
- Command P50/P95/P99/max: 258.1 ms / 309.7 ms / not emitted / 368.1 ms.
- Max response bytes: bootstrap 2449 bytes, command 29588 bytes.
- 5xx/network/signals: zero.
- Query count P95/max: bootstrap 11/11, command 22/23.
- D1 rows read P95/max: bootstrap 9/9, command 25/714.
- D1 rows written P95/max: bootstrap 0/0, command 32/32.

### T5 Repeated Strict

- Evidence: `reports/capacity/evidence/2026-04-29-p2-t5-strict-repeat-1.json`
- Result: failed the strict gate because bootstrap P95 exceeded the existing 1000 ms limit.
- Bootstrap P50/P95/P99/max: 233.8 ms / 1354.5 ms / not emitted / 2062.2 ms.
- Command P50/P95/P99/max: 305.4 ms / 418.0 ms / not emitted / 434.4 ms.
- Max response bytes: bootstrap 2449 bytes, command 29589 bytes.
- 5xx/network/signals: zero.
- Query count P95/max: bootstrap 11/11, command 22/23.
- D1 rows read P95/max: bootstrap 9/9, command 836/928.
- D1 rows written P95/max: bootstrap 0/0, command 32/32.

## Top-Tail Attribution

- Classification: `unclassified-insufficient-logs`.
- Request IDs: `ks2_req_b9099eab-d7f2-4c02-b8ae-839492c29477`, `ks2_req_9756b1f4-cd61-4c08-9868-a82c8d13fac0`, `ks2_req_da31a9d2-566c-452a-9119-de4dd131eadd`, `ks2_req_0a249677-fd09-42d6-8b6e-5cc52d535888`, `ks2_req_76455802-b0fd-42f7-8300-46888147cbfe`, `ks2_req_0649a1b6-dfb5-44a6-9bd8-134b8b0e2c1c`, `ks2_req_90ffc06b-39f4-4524-9c4e-7b17bd7bf0f9`, `ks2_req_b6147ffa-e7b2-4053-a4df-3a9d42e12fc6`, `ks2_req_8d36f59e-df52-4df5-8a39-24cc8f659714`, `ks2_req_cb696116-6a49-4166-9987-6318371d8114`.
- Cloudflare CPU: unavailable for 10/10 T5 top-tail samples.
- Worker wall: unavailable from invocation telemetry for 10/10 T5 top-tail samples. App-exposed `serverWallMs` for the T5 top-tail samples ranged from 115 ms to 507 ms.
- App/client wall: T5 top-tail sample range 826.3 ms to 2062.2 ms.
- D1 duration: sampled `capacity.request` logs matched 10/10 T5 top-tail samples, but invocation CPU/wall is missing, so the D1 share of Worker wall cannot be classified.
- Top statements: statement maps show complete sampled statement coverage. The largest repeated statement by count is the request-limit insert on `POST /api/subjects/grammar/command`; bootstrap top statements remain bounded and stable at 11 statements per bootstrap request.
- Top bootstrap phases: T5 `cold-bootstrap-burst` is the slow path, with P50 816.7 ms, P95 2043.3 ms, max 2062.2 ms, server wall P95 505 ms, query count P95/max 11/11, and D1 rows read P95/max 9/9.
- Response bytes: bootstrap response size is stable at 2449 bytes, far below the 600000-byte cap.

## Decision

- Primary Phase 2 path: U3 evidence-capture repair.
- Rationale: the repeated strict run failed, and the top-tail join lacks Cloudflare invocation CPU/wall telemetry. Statement logs are complete, but they are insufficient to distinguish D1 duration share, Worker CPU pressure, platform/client overhead, or launch-tail policy from the required invocation data.
- Non-chosen paths:
  - D1/query-shape reduction: not selected because bootstrap query count and D1 rows stayed stable at 11 queries and 9 rows read; no query-plan recommendation exists.
  - Worker CPU/serialisation reduction: not selected because Worker CPU is unknown without invocation CPU/wall logs.
  - Bootstrap payload reduction: not selected because bootstrap response bytes are 2449, far below the configured cap.
  - Burst/warm-up operational policy: not selected because T1/T5 diverged but the required CPU/wall attribution is incomplete.
  - Certification update: not selected because T5 failed the existing strict threshold.
- No-go conditions:
  - Do not promote public capacity wording.
  - Do not relax `maxBootstrapP95Ms`.
  - Do not implement D1, Worker CPU, payload, or launch-policy mitigations from this evidence alone.
  - Do not let diagnostic correlation or statement-map artefacts appear as capacity-run metrics in Admin Production Evidence.

## Residual Blockers

- The current pretty tail path can capture sampled statement logs but not machine-joinable invocation CPU/wall telemetry.
- A first strict attempt failed during demo-session setup for `learner-01` and wrote no evidence file because the load driver aborts before persisting setup-failure artefacts. A later retry succeeded after the demo-session bucket reset, so this is recorded as an evidence-capture limitation rather than a capacity finding.
