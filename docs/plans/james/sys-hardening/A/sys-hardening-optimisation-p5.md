---
title: "System Hardening Optimisation P5 — 60-Learner Diagnostic Harness Repair and Route-Cost Evidence"
type: plan
status: proposed
date: 2026-04-30
phase: P5
owner: james
route: system-hardening-optimisation
language: en-GB
source_context:
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p4-capacity-status-report.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p4-completion-report.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p4-1000-learner-path-decision.md
  - reports/capacity/configs/p4-60-diagnostic-checklist.md
  - reports/capacity/latest-evidence-summary.json
  - reports/capacity/latest-1000-learner-budget.json
---

# System Hardening Optimisation P5 — 60-Learner Diagnostic Harness Repair and Route-Cost Evidence

## 0. One-sentence summary

P5 turns the P4 governance outcome into an operator-executable diagnostic: first repair the 60-learner checklist and command contracts, then run a telemetry-complete 60-learner production diagnostic, and finally extend the 1000-learner model with the missing measured route costs.

P5 is deliberately not an optimisation phase yet. It is the phase that decides which optimisation phase is justified.

---

## 1. P4 truth carried into P5

P4 ended with this state:

- 30-learner beta was promoted to `30-learner-beta-certified` through reviewed governance.
- The promoted row is `reports/capacity/evidence/2026-04-30-p3-t5-strict-r2.json`.
- The promoted evidence shows 30 learners, bootstrap burst 20, 1 round, bootstrap P95 715.2 ms, command P95 279.7 ms, max response bytes 29,597 B, zero 5xx, and no capacity signals.
- The latest evidence summary marks `certified_30_learner_beta` as certifying and passed.
- 60 learners remain unverified and not certified.
- The latest 60-learner historical preflight failed bootstrap P95 at 854.0 ms against the 750 ms stretch ceiling.
- The 1000-learner budget remains modelling-only and non-certifying.
- The latest 1000-learner expected scenario is red for D1 rows written and D1 rows read, but still has incomplete route-cost coverage and missing Worker CPU integration.
- Runtime code and threshold configs were not changed by P4.

This is a healthy governance outcome: 30 learners may now be claimed within the evidence boundary, while 60+ and 1000+ remain blocked.

---

## 2. Validation correction found after P4

The P4 completion report correctly says the 60-learner diagnostic is blocked on human production access. However, the operator checklist also contains command drift that would block a human operator even after credentials are available.

The checklist currently references:

```sh
node scripts/prepare-session-manifest.mjs \
  --bucket-reset-minutes 10
```

But the actual script accepts:

```sh
--delay-ms <ms>
```

and does not accept `--bucket-reset-minutes`.

The checklist also references non-existent post-run scripts:

```sh
node scripts/correlate-worker-tail.mjs
node scripts/build-statement-map.mjs
```

The actual checked-in scripts are:

```sh
node scripts/join-capacity-worker-logs.mjs
node scripts/build-capacity-statement-map.mjs
```

The join script uses `--logs`, not `--tail`.

This does not invalidate the 30-learner promotion. It does mean P5 must begin by repairing the operator checklist and locking it with tests before asking a human operator to run the 60-learner diagnostic.

---

## 3. Product contract

P5 should allow the project owner to say one of these, and only one of these:

1. “60 learners passed a diagnostic run, but certification still requires repeat policy and a separate reviewed status decision.”
2. “60 learners failed with a classified bottleneck, and we know whether the next phase should target D1, Worker CPU, payload/serialisation, platform/client overhead, setup harness, or write amplification.”
3. “60 learners are still blocked by setup or telemetry capture, but the blocker is now named and reproducible.”

P5 must not say:

- “60 learners are certified” from one diagnostic run.
- “1000 learners are possible” from a spreadsheet alone.
- “D1 writes are definitely the first ceiling” before missing route costs are measured.
- “Hero, parent/admin, or setup routes are cheap” without route-cost evidence.
- “Worker CPU is safe” while CPU values are still absent from the budget ledger.

---

## 4. Non-goals

Out of scope for P5:

- changing public subject learning semantics;
- changing Star, Mega, reward, or mastery logic;
- changing threshold limits;
- lowering the 60-learner bootstrap P95 target;
- shipping D1 index or query-shape changes before a classified 60-learner run;
- implementing command batching or write compaction;
- implementing Hero Mode child-facing features;
- promoting 60-learner certification automatically;
- claiming 1000+ learner readiness.

P5 may add scripts, docs, checklist tests, diagnostic artefacts, budget-ledger schema support, and route-cost probes. P5 may run production diagnostics with a human operator. P5 should not change runtime product behaviour unless the change is purely diagnostic and reviewed as non-user-facing.

---

## 5. Phase units

## P5-U0 — Repair the 60-learner operator checklist

### Purpose

Make the P4 60-learner diagnostic checklist executable as written.

### Required fixes

Update `reports/capacity/configs/p4-60-diagnostic-checklist.md` so it uses current script names and current CLI options.

Session manifest command should use either the default delay or an explicit millisecond delay:

```sh
node scripts/prepare-session-manifest.mjs \
  --origin https://ks2.eugnel.uk \
  --learners 60 \
  --batch-size 28 \
  --delay-ms 610000 \
  --output /tmp/ks2-p5-60-manifest.json
```

Tail join should use:

```sh
node scripts/join-capacity-worker-logs.mjs \
  --evidence reports/capacity/evidence/2026-04-30-p5-60-diagnostic.json \
  --logs "$RAW_LOG" \
  --output reports/capacity/evidence/2026-04-30-p5-60-tail-correlation.json
```

Statement map should use:

```sh
node scripts/build-capacity-statement-map.mjs \
  --input "$RAW_LOG" \
  --output reports/capacity/evidence/2026-04-30-p5-60-statement-map.json
```

If raw logs must stay local, the checklist must explain the safe alternative: build the statement map from the redacted correlation artefact if it contains the required structured records, or keep the statement map local and commit only the redacted derived artefact.

### Engineering acceptance

- A test checks every command in the operator checklist references an existing script path.
- A test checks every documented CLI option is accepted by the target script’s parser or help contract.
- The checklist no longer mentions `--bucket-reset-minutes`.
- The checklist no longer mentions `scripts/correlate-worker-tail.mjs` or `scripts/build-statement-map.mjs`.
- The checklist explicitly states that raw `*.jsonl` Worker tail captures must not be committed.

### Suggested tests

```sh
node --test tests/capacity-operator-checklist.test.js
node --test tests/capacity-worker-log-join.test.js
node --test tests/capacity-statement-map.test.js
node --test tests/capacity-session-manifest.test.js
```

---

## P5-U1 — Add a single operator wrapper for the 60-learner diagnostic

### Purpose

Reduce human error. The operator should not have to copy six loosely related command blocks.

### Contract

Add a wrapper script, or a documented npm script, that prints the exact run sequence with validated paths.

Possible script:

```text
scripts/plan-60-learner-diagnostic.mjs
```

Possible npm alias:

```json
{
  "capacity:plan-60-diagnostic": "node scripts/plan-60-learner-diagnostic.mjs"
}
```

This wrapper should not hide the human-required nature of the run. It should produce a run plan and validate local files. It should not start a 30-minute production session-manifest process unless the operator passes an explicit execution flag.

### Required output

The planner should print or write:

- run id;
- target origin;
- manifest path;
- raw tail path;
- diagnostic evidence path;
- tail-correlation output path;
- statement-map output path;
- exact commands;
- raw-log warning;
- expected duration;
- environment prerequisites.

### Acceptance

- Planner works in dry-run mode without Cloudflare credentials.
- Planner fails if a referenced script path does not exist.
- Planner fails if a documented option is unknown.
- Planner emits a machine-readable JSON plan when requested.
- Planner does not commit or stage raw logs.

---

## P5-U2 — Execute the telemetry-complete 60-learner diagnostic

### Purpose

Run the actual 60-learner diagnostic under production conditions, with enough telemetry to classify the result.

### Required shape

- Origin: `https://ks2.eugnel.uk`
- Learners: 60
- Bootstrap burst: 20
- Rounds: 1
- Threshold config: `reports/capacity/configs/60-learner-stretch.json`
- Session source: pre-created manifest
- Tail capture: JSON Worker logs started before the run
- Output: committed capacity evidence JSON only if redacted and policy-compliant
- Raw logs: local/private only

### Evidence files

Expected artefacts:

```text
reports/capacity/evidence/2026-04-30-p5-60-diagnostic.json
reports/capacity/evidence/2026-04-30-p5-60-tail-correlation.json
reports/capacity/evidence/2026-04-30-p5-60-statement-map.json
reports/capacity/evidence/2026-04-30-p5-60-tail-classification.md
```

Use the actual date if different.

### Acceptance

The run must end in exactly one of these states:

| State | Meaning |
| --- | --- |
| `60-diagnostic-positive` | All diagnostic thresholds passed, with CPU/wall and statement coverage. Not certification yet. |
| `60-diagnostic-d1-dominated` | Bootstrap or command tail failed and top-tail evidence points to D1 duration/queueing. |
| `60-diagnostic-worker-cpu-dominated` | Top-tail evidence points to Worker CPU/JSON/object construction. |
| `60-diagnostic-platform-overhead` | Worker/D1 counters are normal but client wall is high. |
| `60-diagnostic-payload-bound` | Payload size/serialisation is a credible contributor. |
| `60-diagnostic-query-fanout` | Query count or rows read grow unexpectedly. |
| `60-diagnostic-write-amplification-bound` | Writes dominate run safety or budget. |
| `60-diagnostic-setup-blocked` | Session creation, rate limits, credentials, or manifest preparation block app-load measurement. |
| `60-diagnostic-insufficient-logs` | Load ran, but CPU/wall or statement coverage is insufficient. |

If the result is positive, P5 must not automatically promote 60 learners. A separate repeat policy and status report are required.

---

## P5-U3 — Classify and write the 60-learner decision record

### Purpose

Convert the diagnostic into a phase decision.

Create:

```text
docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p5-60-diagnostic-decision.md
```

### Required sections

1. Source boundary.
2. Exact run id and evidence artefacts.
3. Whether the run reached application load.
4. Whether thresholds passed.
5. Tail sample classification.
6. Query/row/write/payload summary.
7. Worker CPU/wall summary.
8. Whether 60-learner certification is still blocked.
9. Chosen next path.
10. Rejected alternatives.

### Decision paths

| Diagnostic result | Next path |
| --- | --- |
| D1 dominated | P6A — Bootstrap/D1 query-shape and cache contract. |
| Worker CPU dominated | P6B — JSON construction, response rewriting, and object-shape reduction. |
| Platform/client overhead | P6C — operations/platform investigation and repeated runs. |
| Payload-bound | P6D — bootstrap payload envelope reduction. |
| Query fanout | P6E — query budget ratchet and statement consolidation. |
| Setup blocked | P5 continuation — harness/rate-limit repair. |
| Insufficient logs | P5 continuation — telemetry capture repair. |
| Positive | P6F — repeat policy and 60-learner certification governance. |

---

## P5-U4 — Complete missing route-cost coverage for the 1000-learner model

### Purpose

The 1000-learner budget is currently useful but incomplete. It must not drive write-amplification engineering until missing route costs are measured.

### Current known budget gaps

The latest model has measured route costs for:

- `GET /api/bootstrap`
- `POST /api/demo/session` response bytes only, with missing query/read/write costs
- `POST /api/subjects/grammar/command`

Known gaps:

- Worker CPU missing from the budget model.
- Demo/session setup query/read/write costs missing.
- Parent/admin route costs missing.
- Hero route costs missing.
- Spelling and Punctuation command costs under the same evidence shape are not yet modelled.
- Bootstrap not-modified refresh economics are not separately modelled.

### Required route families

At minimum, P5 should produce route-cost evidence for:

| Route family | Reason |
| --- | --- |
| Full bootstrap | First-paint and class-start pressure. |
| Not-modified bootstrap | Refresh and multi-tab economics. |
| Demo/session setup | Needed for diagnostics and demo-heavy usage modelling. |
| Spelling command | Existing production subject. |
| Grammar command | Existing production subject and current command model source. |
| Punctuation command | Existing production subject. |
| Parent summary / hub read | Adult route cost. |
| Admin production evidence / overview | Admin route cost and evidence-surface safety. |
| Hero read model | Existing/future default-route pressure. |
| Hero command start/claim/camp, if enabled | Known future query/write risk. |

### Required fields

For every route family, collect:

- count;
- wall P50/P95/max;
- Worker CPU P50/P95/max when available;
- Worker wall P50/P95/max when available;
- D1 duration P50/P95/max;
- query count P50/P95/max;
- D1 rows read P50/P95/max;
- D1 rows written P50/P95/max;
- response bytes P50/P95/max;
- redaction status;
- evidence source path;
- whether the evidence is certifying, diagnostic-only, or modelling-only.

### Acceptance

- `reports/capacity/latest-1000-learner-budget.json` still has `modellingOnly: true` and `certifying: false`.
- Worker CPU is no longer globally `unknown` if tail-correlation CPU is available.
- Missing route costs are explicitly listed.
- Parent/admin and demo/session costs are no longer silently absent from the scenario totals.
- The model identifies whether D1 writes remain the first ceiling after route-cost coverage improves.

---

## P5-U5 — Refresh the 1000-learner path decision

### Purpose

Decide whether the next route should attack latency, write amplification, request volume, or telemetry gaps.

Create:

```text
docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p5-1000-learner-path-decision.md
```

### Required decision questions

1. After route-cost coverage, what is the first Free-tier ceiling likely to fail?
2. Are D1 rows written still the dominant red surface?
3. Are D1 rows read red under realistic assumptions?
4. Are Worker requests still green with safe headroom?
5. Is Worker CPU now measurable enough to reason about?
6. Do parent/admin, demo/session, or Hero routes materially change the budget?
7. Should the next engineering phase be write compaction, query/cache work, payload/CPU work, or continued diagnostic repair?

### Acceptance

- The decision is evidence-bound.
- The decision does not rely on a single extrapolated route if route-cost coverage is incomplete.
- The decision names rejected alternatives.
- The decision includes a “do not optimise yet” outcome if evidence is still insufficient.

---

## P5-U6 — Completion report and public status guardrail

### Purpose

End P5 with clean governance.

Create:

```text
docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p5-completion-report.md
```

### Required statements

The completion report must explicitly state:

- 30-learner status remains `30-learner-beta-certified` unless evidence invalidates it.
- 60 learners are not certified unless a separate reviewed certification policy and repeated evidence say so.
- 1000 learners remain non-certifying modelling only.
- The 60-learner diagnostic result and classification.
- Whether the operator checklist is now executable.
- Which next phase path is recommended.
- Which work is still human/operator-gated.

### Acceptance

- No false promotion wording.
- No threshold relaxation.
- No raw tail logs committed.
- All committed diagnostic artefacts are redacted.
- The Admin evidence surface still separates certifying, diagnostic, preflight, smoke, and modelling-only artefacts.

---

## 6. Testing and verification matrix

P5 should use focused checks before broad checks.

### Checklist and CLI contract

```sh
node --test tests/capacity-operator-checklist.test.js
node --test tests/capacity-session-manifest.test.js
node --test tests/capacity-worker-log-join.test.js
node --test tests/capacity-statement-map.test.js
```

### Evidence and budget

```sh
node --test tests/capacity-evidence.test.js
node --test tests/capacity-evidence-schema.test.js
node --test tests/generate-evidence-summary.test.js
node --test tests/verify-capacity-evidence.test.js
node --test tests/capacity-budget-ledger.test.js
npm run capacity:verify-evidence
```

### Admin/evidence safety

```sh
node --test tests/admin-production-evidence.test.js
node --test tests/capacity-raw-log-gitignore.test.js
```

### Optional full repo gates, after focused checks pass

```sh
npm test
npm run check
```

In ZIP-only review environments without `.git`, `CAPACITY_VERIFY_SKIP_ANCESTRY=1` may be used for local shape checking only. It must not be used as the final P5 full-clone verifier claim.

---

## 7. Evidence artefact policy

P5 must preserve the evidence boundary from P1-P4.

Allowed to commit:

- strict or diagnostic capacity evidence JSON produced by the load driver;
- redacted tail-correlation JSON;
- redacted statement-map JSON;
- classification markdown;
- route-cost budget JSON;
- operator checklist and decision reports;
- tests and scripts.

Not allowed to commit:

- raw Worker tail JSONL;
- cookies;
- bearer tokens;
- raw `ks2_req_*` IDs;
- learner names;
- raw answers;
- full SQL statements, table names, or column names if the diagnostic redaction contract forbids them;
- personal account data.

---

## 8. Exit states

P5 must end in one of these states:

| Exit state | Meaning | Recommended next phase |
| --- | --- | --- |
| `60-diagnostic-positive-repeat-needed` | 60 diagnostic passed but is not certified. | P6F repeat policy and 60 governance. |
| `60-diagnostic-d1-dominated` | D1 dominates 60 top-tail samples. | P6A D1/query/cache mitigation. |
| `60-diagnostic-worker-cpu-dominated` | Worker CPU dominates top-tail samples. | P6B CPU/JSON/object-shape mitigation. |
| `60-diagnostic-platform-overhead` | App and D1 counters normal; client/platform overhead high. | P6C operations/platform investigation. |
| `60-diagnostic-payload-bound` | Payload or serialisation pressure is credible. | P6D payload-envelope mitigation. |
| `60-diagnostic-query-fanout` | Query/row counts grow with shape. | P6E query budget and consolidation. |
| `60-diagnostic-setup-blocked` | Harness/session/rate-limit issue still blocks load. | Continue P5 harness repair. |
| `60-diagnostic-insufficient-logs` | Load ran but telemetry is insufficient. | Continue P5 telemetry repair. |
| `1000-route-costs-still-incomplete` | Route-cost coverage remains too weak for a 1000 decision. | Continue P5 route-cost coverage. |
| `1000-write-amplification-confirmed` | Route-cost coverage confirms writes are first ceiling. | P6G command batching/write compaction. |

---

## 9. Product copy boundary

Allowed public/internal wording after P5 depends on the result.

If only the checklist is repaired:

> “30-learner beta is certified. 60-learner diagnostics are now operator-ready but not yet run.”

If the 60 diagnostic runs and fails:

> “30-learner beta remains certified. The 60-learner diagnostic reached production app-load and identified the next bottleneck; 60 learners are not certified.”

If the 60 diagnostic passes once:

> “30-learner beta remains certified. A 60-learner diagnostic passed once; 60-learner certification still requires repeated evidence and reviewed governance.”

Never say:

> “60 learners are supported.”

unless a separate certification decision has been made.

Never say:

> “1000 learners are supported.”

unless live or otherwise accepted evidence exists for that claim.

---

## 10. Why P5 is the right next step

P4 changed the status boundary, not the runtime. It correctly promoted 30 learners and kept 60/1000 blocked. The next bottleneck is not yet an engineering fix; it is the absence of an executable, telemetry-complete 60-learner diagnostic and incomplete route-cost coverage for the 1000-learner model.

P5 therefore focuses on the narrowest responsible work:

1. make the 60 diagnostic runnable;
2. run it with CPU/wall and statement coverage;
3. classify the result;
4. complete enough route-cost coverage to stop guessing about the 1000-learner path;
5. choose the next optimisation phase from evidence.

That keeps the route honest and prevents the team from prematurely optimising the wrong resource.
