---
title: "Nelson Free-tier Spelling Error 1102 — locked RCA and post-H4 debug handoff"
date: 2026-07-24
category: debugging
module: spelling-capacity
problem_type: root_cause_analysis
component: worker_spelling_commands
severity: high
applies_when:
  - "Spelling commands return Cloudflare HTML Error 1102 / exceededCpu on Workers Free"
  - "Nelson (fat history) wrong→correct hammers fail under burst or after isolate stress"
  - "Multiplayer concurrent spelling streams fail while single thin demos look fine"
  - "Debugging Free-tier CPU after catalogue-scan (FC1) was already fixed"
tags:
  - free-tier
  - exceededCpu
  - error-1102
  - nelson
  - spelling
  - isolate-flexibility
  - capacity-evidence
related_components:
  - worker
  - d1
  - spelling
---

# Nelson Free-tier Spelling Error 1102 — locked RCA and post-H4 debug handoff

Machine-readable twin: `reports/capacity/evidence/2026-07-24-nelson-free-tier-cpu-debug-handoff.json`.

## Locked root cause

**ID:** `RC-FREE-10MS-FLEXIBILITY` (confidence: very high; locked 2026-07-23)

Workers Free allows **10ms CPU per request**. Nelson Spelling commands under rapid successive submits typically cost **near/above that budget** and rely on **isolate flexibility**. Sustained burst (or overlapping concurrent streams) withdraws flexibility → Cloudflare outcome `exceededCpu` / HTML **Error 1102**, even when the failing invocation only records ~11–17ms CF CPU while peer OK requests on the same `scriptVersion` show much higher CPU.

Confirmed plan: Free, `cpu_ms=10`, no `wrangler.jsonc` `limits.cpu_ms` override (James, 2026-07-23).

Primary evidence: `reports/capacity/evidence/2026-07-23-nelson-wrong-correct-rca-verdict.json`.

### What this is not

| Falsified | Why |
|-----------|-----|
| Hard ~50ms budget / single runaway request | Fail cpuTime often 11–17ms; OK peers 64–270ms |
| CPU climbs until fail | Burst averages did not climb |
| CAS / stale-write race → 503 | Same-revision concurrency → `409`; prod fail is `exceededCpu` |
| App `projection_unavailable` | Body is Cloudflare HTML 1102, not JSON |
| Catalogue scan alone (FC1) | After fix, Nelson still failed with `d1RowsRead` p50≈60–62, not ~1512 |

## Failure classes (2026-07-24)

Index: `reports/capacity/evidence/2026-07-24-free-tier-5-player-failure-classes.json`.

| ID | Status | Meaning for debug |
|----|--------|-------------------|
| **FC1** catalogue stale-stats | Fixed + verified | Do not reopen unless `d1RowsRead` returns to ~1500 |
| **FC2** Nelson single-player Free 10ms | Conditionally fixed on `9c5533ea` (H2–H4) | HTTP gate independently re-verified 2026-07-24; CPU join still needs a fresh wrangler-tail capture |
| **FC3** multiplayer concurrent 1102 | **Still open** (short pass only) | Overall goal blocker |
| **FC4** `demo_rate_limited` | Expected | Not a Worker crash |
| **FC5** post-storm isolate exhaustion | Transient | Cool down ≥2 minutes before remeasure |

### Load contributors cut on FC2 (not the platform ceiling)

1. **H2** `e8e51055` — release-bound catalogue walks / pool cache → paced CPU 18→16ms (insufficient alone).
2. **H3** `d3a4e77b` — submit working-set = active card only. **Caveat:** post-H3 Nelson join still showed `itemRows` p50=51 and CPU p50=18ms; do not treat H3 as the paced-Nelson breakthrough.
3. **H4** `f02dac6a` — memoize learner-visible snapshot per isolate → agent-reported paced/burst CF CPU p50=**8ms**.

Acceptance gate used by the fix agents:

- Nelson paced500: ≥40 rounds, 0×1102, CF cpuTime p50 &lt;10ms
- Nelson burst: ideally 0×1102
- concurrent5 short: 0×1102 after cooldown

## Overall goal vs gates

**Goal:** Free-tier full game for **5 fat Nelson-like** players playing freely.

**Verdict:** **Not met.** FC2 single-player is conditionally green; FC3 longer soak is still pending. Short concurrent-5 r4 on thin demos must not be read as goal completion.

## Independent QA notes (for the next debugger)

- Nelson paced500 HTTP re-run (correct revision): 40 rounds, 160×200, 0×1102, `d1RowsRead` p50=60 → `/tmp/qa-nelson-reverify/paced500-correct-rev.json`.
- Committed `scripts/spelling-wrong-correct-hammer.mjs` + `loadBootstrap()` reads `learners.byId[id].stateRevision`, which is **absent** on real adult accounts → revision `0` → **all 409**. Use `bootstrap.revision.selectedLearnerRevision` instead.
- Agent evidence method label `nelson-api-client-sim-gap` is **not** the committed hammer method string — treat agent CPU joins as unreproducible until the hammer/bootstrap revision path is fixed or a one-off script is checked in.
- `/api/version` currently returns `buildHash: null` — pin Worker `versionId` via wrangler/deploy metadata when claiming a build.
- H4 paced CPU join still shows **p95=12 / max=52** — Free budget is not cleared on the tail; flexibility still matters.
- Bugbot open risk: `RELEASE_CATALOGUE_POOL_CACHE` may stale pool totals within the same release when scheduled/rollout visibility changes (`worker/src/subjects/spelling/gameplay-state.js`).

## Debug playbook (minimum)

1. Confirm cool isolate (no recent multiplayer storm; wait ≥2 minutes).
2. Capture Nelson cookie; resolve revision from `selectedLearnerRevision`.
3. Paced500 HTTP gate first (40 rounds / 0×1102).
4. Parallel `node scripts/wrangler-oauth.mjs tail --format json` + join via `scripts/join-capacity-worker-logs.mjs` for CF `cpuTimeMs` / `exceededCpu`.
5. Only then reopen FC3: longer concurrent-5 / staggered soak with cooldown discipline.
6. Keep Free-tier hammers short — stress testing can degrade real users (FC5).

### Hot paths

- `worker/src/subjects/spelling/commands.js` — working-set binding
- `worker/src/subjects/spelling/gameplay-state.js` — release pool cache / stats currency
- `src/subjects/spelling/content/model.js` — learner-visible snapshot memo
- UI pace lock: `SUBJECT_COMMAND_MIN_GAP_MS` (~100ms) in subject/spelling remote actions

### Guard tests

- `tests/spelling-gameplay-stats-catalogue-cpu.test.js`
- `tests/spelling-learner-visible-snapshot-cpu.test.js`
- `tests/worker-spelling-stale-stats-working-set.test.js`
- `tests/worker-spelling-submit-answer-working-set-cpu.test.js`

## Suggested next debug tickets

1. Fresh wrangler-tail CPU join on current prod for Nelson paced500 + burst (close the conditional on FC2 CPU).
2. Fix hammer/bootstrap revision extraction for real accounts so COOKIE_FILE runs are reproducible.
3. FC3 longer concurrent / fat-Nelson-like soak with evidence schema matching the acceptance gate.
4. Decide whether pool-cache invalidation on schedule/rollout visibility is in scope before merging.
