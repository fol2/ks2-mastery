---
title: "System Hardening Optimisation P6 — Operator-Gated 60-Learner Diagnostic and Bottleneck Selection"
type: plan
status: approved
date: 2026-04-30
phase: P6
owner: james
route: system-hardening-optimisation
language: en-GB
source_context:
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p5.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p5-completion-report.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p5-60-diagnostic-decision.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p5-1000-learner-path-decision.md
  - reports/capacity/configs/p4-60-diagnostic-checklist.md
  - reports/capacity/evidence/2026-04-30-p5-route-costs.json
  - reports/capacity/evidence/2026-04-30-p5-60-tail-classification.md
  - reports/capacity/latest-1000-learner-budget.json
---

# System Hardening Optimisation P6 — Operator-Gated 60-Learner Diagnostic and Bottleneck Selection

## 0. One-sentence summary

P6 executes the production-gated 60-learner diagnostic that P5 prepared, captures Cloudflare Worker tail telemetry safely, closes the highest-priority route-cost gaps, and selects the next engineering optimisation path from evidence rather than guesswork.

P6 is still not the 1000-learner optimisation phase. It is the phase that turns the repaired diagnostic harness into real production evidence and makes the next optimisation phase unavoidable and specific.

---

## 1. Starting truth from P5

P5 ended with a useful but deliberately incomplete state.

The project now has:

- a reviewed `30-learner-beta-certified` status from earlier P3/P4 evidence;
- a repaired 60-learner operator checklist;
- a dry-run-safe 60-learner diagnostic planner;
- route-cost diagnostic tooling;
- route-family coverage wired into the 1000-learner budget ledger;
- Admin/evidence lane separation for certifying, diagnostic, preflight, smoke and modelling-only artefacts;
- raw Worker tail guardrails; and
- P5 completion reports that keep 60 learners and 1000 learners non-certifying.

The project does **not** yet have:

- a completed P5/P6 live 60-learner production run;
- 60-learner certification;
- full Worker CPU coverage across hot route families;
- full route-cost coverage for not-modified bootstrap, demo/session setup, Spelling, Punctuation, parent/admin, or Hero routes;
- a safe claim that 1000 learners survive the Free tier; or
- an evidence-backed choice between D1/query work, Worker CPU/JSON work, payload work, platform investigation or write compaction.

Current route-cost coverage is intentionally incomplete: 12 required route families are tracked, 1 is measured, 2 are partial, and 9 are missing or blocked. The 1000-learner ledger remains `modellingOnly: true` and `certifying: false`.

The latest budget model flags red risk for D1 rows written and D1 rows read under the expected 1000-learner scenario. It also flags partial Worker CPU risk on bootstrap, with several route families still missing CPU data. These are warning lights, not final optimisation decisions.

---

## 2. Product contract

P6 should let the project owner say one of these, and only one:

1. “A telemetry-complete 60-learner diagnostic ran, passed or failed, and the top bottleneck is classified.”
2. “The diagnostic still could not run, but the remaining blocker is operationally precise: account access, tail capture, session manifest, raw-log handling, production approval, or load-driver behaviour.”
3. “The 60-learner diagnostic was positive enough to enter repeat-certification governance, but 60 learners are not publicly certified yet.”
4. “The 1000-learner route-cost model is materially stronger, but it remains modelling-only unless an explicit later certification route says otherwise.”

P6 must not say:

- “60 learners are certified” from a single diagnostic run.
- “1000 learners are supported” from the budget ledger.
- “Worker CPU is solved” when route CPU coverage is partial.
- “D1 writes are definitely the first engineering target” while route families are missing.
- “Hero route cost is cheap” when Hero read/command families are missing or feature-gated.
- “Bootstrap is fixed” unless repeated strict evidence says so.

---

## 3. Non-goals

P6 must not become a broad optimisation or product-feature phase.

Out of scope:

- changing subject learning semantics;
- changing Stars, Mega, mastery, reward projection, Hero Coins or Hero Camp behaviour;
- adding Hero child-facing features;
- changing Cloudflare threshold configs;
- relaxing the 60-learner bootstrap P95 target;
- adding speculative D1 indexes before classification;
- implementing command batching or write compaction;
- changing public marketing wording beyond evidence-bound status reporting;
- committing raw Worker tail JSONL, cookies, tokens, learner names or unredacted SQL-like statement text.

P6 may add diagnostic scripts, runbooks, tests, redacted evidence artefacts, route-cost probes, decision records and capacity documentation. Runtime product changes should be avoided unless they are narrow diagnostic-only changes with no learner-facing behaviour change.

---

## 4. Phase units

## P6-U0 — Source and evidence lock

### Purpose

Lock the source boundary before any production diagnostic is attempted.

### Tasks

1. Record the exact Git commit/ref used for the P6 run.
2. Record whether the operator is using a full clone, a lean ZIP, or both.
3. Confirm the P5 artefacts exist:
   - `scripts/plan-60-learner-diagnostic.mjs`
   - `scripts/plan-route-cost-diagnostic.mjs`
   - `reports/capacity/configs/p4-60-diagnostic-checklist.md`
   - `reports/capacity/evidence/2026-04-30-p5-route-costs.json`
   - `reports/capacity/latest-1000-learner-budget.json`
4. Confirm capacity status entering P6:
   - 30 learners: `30-learner-beta-certified`
   - 60 learners: not certified
   - 1000 learners: modelling-only, non-certifying
5. Confirm raw-log exclusions are still active:
   - `*.jsonl` raw tail captures are ignored;
   - raw request IDs are not persisted in committed evidence;
   - redacted derived artefacts use opaque identifiers.

### Acceptance

- A P6 baseline note exists at `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6-baseline.md`.
- The baseline clearly states that P6 begins from P5’s `60-diagnostic-setup-blocked` and `1000-route-costs-still-incomplete` outcomes.
- No capacity status is changed in U0.

---

## P6-U1 — Production run approval and dry-run validation

### Purpose

Make the operator-run sequence safe before live traffic starts.

### Tasks

Run the planner in JSON/dry-run mode and store or paste the plan into the operator ticket:

```sh
npm run capacity:plan-60-diagnostic -- --json \
  --run-id 2026-04-30-p6-60-diagnostic \
  --origin https://ks2.eugnel.uk \
  --manifest-path /tmp/ks2-p6-60-manifest.json \
  --raw-tail-path /tmp/ks2-p6-60-worker-tail.jsonl \
  --evidence reports/capacity/evidence/2026-04-30-p6-60-diagnostic.json \
  --tail-correlation reports/capacity/evidence/2026-04-30-p6-60-tail-correlation.json \
  --statement-map reports/capacity/evidence/2026-04-30-p6-60-statement-map.json \
  --tail-classification reports/capacity/evidence/2026-04-30-p6-60-tail-classification.md
```

Before approving execution, verify:

- the operator has Cloudflare account access;
- `wrangler tail` / `npm run ops:tail:json` can emit JSON logs;
- raw logs are written outside the repository;
- the load command includes `--production`, `--confirm-production-load`, and `--confirm-high-production-load`;
- the run uses `reports/capacity/configs/60-learner-stretch.json`;
- session-manifest preparation will not start unless the operator accepts the 28/28/4 timing and rate-limit window.

### Acceptance

- Dry-run planner output validates successfully.
- The production operator explicitly approves the run in the issue/PR/checklist.
- No live load starts without tail-capture readiness.
- No raw log path points into the repository.

---

## P6-U2 — Execute the telemetry-complete 60-learner production diagnostic

### Purpose

Produce the missing live 60-learner evidence.

### Required run shape

| Field | Value |
| --- | --- |
| Origin | `https://ks2.eugnel.uk` |
| Learners | 60 |
| Bootstrap burst | 20 |
| Rounds | 1 |
| Session source | Pre-created session manifest |
| Threshold config | `reports/capacity/configs/60-learner-stretch.json` |
| Tail capture | JSON Worker logs started before load |
| Raw log handling | Local/private only |

### Expected artefacts

Use the actual date/run id, but preserve this shape:

```text
reports/capacity/evidence/2026-04-30-p6-60-diagnostic.json
reports/capacity/evidence/2026-04-30-p6-60-tail-correlation.json
reports/capacity/evidence/2026-04-30-p6-60-statement-map.json
reports/capacity/evidence/2026-04-30-p6-60-tail-classification.md
docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6-60-diagnostic-decision.md
```

### Minimum telemetry coverage

The diagnostic is only useful if it captures enough evidence to classify the run:

- application load evidence exists;
- bootstrap and command endpoint samples are present;
- capacity request IDs can be joined to Worker logs or explicitly reported as unjoined;
- Worker CPU/wall samples exist for the top-tail bootstrap samples, or the run is classified as telemetry-insufficient;
- statement coverage is present for D1-heavy samples;
- response bytes are present;
- query count and rows read/written are present;
- redaction checks pass.

### Acceptance

The run ends in exactly one state:

| State | Meaning |
| --- | --- |
| `60-diagnostic-positive` | Diagnostic thresholds passed with sufficient telemetry. Not certification yet. |
| `60-diagnostic-d1-dominated` | Tail is mainly D1 duration, D1 queueing, rows read or statement shape. |
| `60-diagnostic-worker-cpu-dominated` | Tail is mainly Worker CPU, JSON construction, response rewriting or object churn. |
| `60-diagnostic-payload-bound` | Payload size or serialisation is a credible contributor. |
| `60-diagnostic-platform-overhead` | Worker/D1 counters are normal but client wall is high. |
| `60-diagnostic-query-fanout` | Query count or rows read grow unexpectedly. |
| `60-diagnostic-write-amplification-bound` | Writes dominate safety or quota risk. |
| `60-diagnostic-setup-blocked` | Manifest, credential, rate-limit or production approval blocked the run. |
| `60-diagnostic-insufficient-logs` | Load ran but CPU/wall/statement coverage is inadequate. |

---

## P6-U3 — Close high-priority route-cost gaps

### Purpose

Strengthen the 1000-learner model enough that P7 can choose the right optimisation class.

### Required route-cost additions

P6 should prioritise route families that are both hot and currently missing or partial:

1. `not-modified-bootstrap` — `POST /api/bootstrap` with a valid `lastKnownRevision`.
2. `demo-session-setup` — query/read/write/CPU cost, not just response bytes.
3. `spelling-command` — production subject command cost.
4. `punctuation-command` — production subject command cost.
5. `grammar-command` — add missing wall/CPU/D1 duration fields.
6. `parent-summary-hub-read` — adult route cost.
7. `admin-production-evidence-overview` — Admin evidence route cost.
8. `hero-read-model` — if enabled; otherwise record as feature-gated, not zero-cost.
9. Hero command start/claim/camp — if enabled; otherwise record as feature-gated and exclude from certifying assumptions.

### Contract

Every route-family row must be one of:

- `measured`;
- `partial` with named missing metrics;
- `requires-production-operator`;
- `auth-gated`;
- `feature-gated`;
- `not-present-in-current-runtime`.

It must never be silently omitted or treated as zero.

### Acceptance

- `reports/capacity/latest-1000-learner-budget.json` is regenerated.
- `docs/operations/capacity-1000-learner-free-tier-budget.md` is regenerated.
- Route coverage improves from P5, or every remaining gap is explicitly justified.
- The budget still says `modellingOnly: true` and `certifying: false` unless a separate certification process is created later.
- Worker CPU coverage is no longer limited to bootstrap if route-level CPU telemetry is available.

---

## P6-U4 — Bottleneck classification and P7 path selection

### Purpose

Turn the P6 diagnostic into an engineering decision.

Create:

```text
docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6-path-decision.md
```

### Required questions

1. Did the 60-learner diagnostic reach production app-load?
2. Did it pass the 60-learner diagnostic thresholds?
3. Were Worker CPU/wall samples joined for top-tail requests?
4. Were D1 statement maps complete enough to classify D1 cost?
5. Which route family dominates latency risk?
6. Which route family dominates D1 read risk?
7. Which route family dominates D1 write risk?
8. Does the expected 1000-learner scenario still fail D1 rows written?
9. Does the expected 1000-learner scenario still fail D1 rows read?
10. Is Worker CPU still red, partial or unknown?
11. Which optimisation path should be P7?

### P7 path map

| Evidence outcome | P7 path |
| --- | --- |
| Bootstrap D1 duration / rows read dominates | P7A — Bootstrap/D1 query-shape and cache-contract optimisation. |
| Worker CPU / JSON dominates | P7B — Worker CPU, JSON construction and response rewrite reduction. |
| Payload dominates | P7C — Bootstrap envelope and payload diet. |
| Write budget dominates | P7D — Command write-amplification and batching design. |
| Requests dominate | P7E — Request coalescing, not-modified refresh and client single-flight behaviour. |
| Platform/client overhead dominates | P7F — Operations, repeated windows, Cloudflare/D1 platform investigation. |
| Evidence remains incomplete | P6 continuation — diagnostic repair, not optimisation. |
| 60 diagnostic positive | P7G — Repeat-policy governance for 60-learner certification candidate. |

### Acceptance

- One primary P7 path is selected.
- At least two tempting alternatives are explicitly rejected with evidence.
- The decision does not overrule missing telemetry.
- If evidence is still incomplete, the selected path is “P6 continuation”, not speculative optimisation.

---

## P6-U5 — 60-learner repeat policy if the diagnostic is positive

### Purpose

Prevent accidental certification from one good run.

If the P6 diagnostic is positive, P6 may create a 60-learner certification-candidate policy. It must not promote public status automatically.

### Minimum repeat policy proposal

A 60-learner certification candidate should require at least:

- one strict diagnostic pass with telemetry-complete top-tail classification;
- one strict repeat pass from a separate window;
- no 5xx/network/capacity hard-signal failures;
- bootstrap P95 within the configured 60-learner threshold;
- command P95 within threshold;
- raw-log redaction checks;
- capacity verifier pass;
- Admin evidence lane separation;
- a reviewed status PR.

### Acceptance

- A positive diagnostic is labelled `candidate`, not certified.
- Any status promotion is explicitly deferred to a reviewed governance phase unless the phase is formally extended.
- Public wording remains 30-learner beta until the governance step lands.

---

## P6-U6 — Completion report

### Purpose

End P6 with a clear, evidence-bound hand-off.

Create:

```text
docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6-completion-report.md
```

### Required sections

1. Source boundary.
2. ZIP/GitHub/ref identity if applicable.
3. Starting P5 truth.
4. Production approval status.
5. 60-learner run outcome.
6. Tail-correlation outcome.
7. Statement-map outcome.
8. Route-cost coverage before/after.
9. 1000-learner budget outcome.
10. Raw-log/redaction scan result.
11. Test/verifier result.
12. Certification boundary.
13. P7 selected path.
14. Rejected alternatives.
15. Residual risks.

### Required wording

The completion report must explicitly state:

- whether 30-learner beta remains the highest public status;
- whether 60 learners are still not certified;
- whether 1000 learners remain modelling-only;
- whether any route-cost gaps remain;
- whether Worker CPU is measured, partial or unknown;
- whether raw Worker logs were kept out of the repository.

---

## 5. Testing and verification matrix

Use focused checks first, then broader checks.

### P6 planner and checklist checks

```sh
node --test tests/capacity-operator-checklist.test.js
node --test tests/capacity-plan-60-diagnostic.test.js
node --test tests/capacity-route-cost-diagnostic.test.js
node --test tests/capacity-session-manifest.test.js
```

### Tail, statement and evidence checks

```sh
node --test tests/capacity-worker-log-join.test.js
node --test tests/capacity-statement-map.test.js
node --test tests/capacity-evidence.test.js
node --test tests/capacity-evidence-schema.test.js
node --test tests/generate-evidence-summary.test.js
node --test tests/verify-capacity-evidence.test.js
node --test tests/capacity-raw-log-gitignore.test.js
npm run capacity:verify-evidence
```

### Budget checks

```sh
node --test tests/capacity-budget-ledger.test.js
node scripts/build-capacity-budget-ledger.mjs \
  --input reports/capacity/evidence/<p6-route-costs>.json \
  --learners 30,60,100,300,1000
```

### Broad gates after focused checks pass

```sh
npm test
npm run check
```

If a full-suite failure is unrelated to P6, document it separately and do not use it to certify P6. But do not hide it: P6 must say whether the final PR CI passed, failed or passed with path-specific skips.

---

## 6. Evidence and redaction policy

Allowed to commit:

- strict or diagnostic capacity evidence JSON;
- redacted tail-correlation JSON;
- redacted statement-map JSON;
- route-cost evidence JSON;
- tail classification markdown;
- decision records;
- planner output without raw log content;
- tests and docs.

Not allowed to commit:

- raw Worker tail JSONL;
- cookies;
- bearer tokens;
- account email addresses;
- learner names;
- raw request bodies;
- raw answers;
- raw `ks2_req_*` IDs;
- unredacted SQL/table/column names from diagnostic logs.

Raw artefacts should stay in bounded private storage or local `/tmp` only. Committed artefacts should use opaque request and statement identifiers.

---

## 7. Success criteria

P6 is successful if all of these are true:

1. The P5 diagnostic harness is used in an approved production-safe way, or the remaining blocker is named precisely.
2. The 60-learner outcome is classified.
3. Raw Worker tail captures are not committed.
4. Redacted tail and statement artefacts are committed when available.
5. Route-cost coverage improves or remaining gaps are explicitly classified.
6. The 1000-learner model remains honest and non-certifying.
7. A single P7 path is selected from evidence.
8. No public 60-learner or 1000-learner claim is made without governance evidence.
9. Threshold configs are not weakened.
10. Product learning semantics are unchanged.

---

## 8. Exit states

P6 must exit in one of these states:

| Exit state | Meaning | Next action |
| --- | --- | --- |
| `p7a-bootstrap-d1-selected` | 60/run-cost evidence points to D1 query shape, rows read or queueing. | Start P7A. |
| `p7b-worker-cpu-selected` | Evidence points to Worker CPU, JSON construction or response rewriting. | Start P7B. |
| `p7c-payload-selected` | Evidence points to payload/serialisation size. | Start P7C. |
| `p7d-write-amplification-selected` | Evidence points to D1 write budget as first ceiling. | Start P7D. |
| `p7e-request-coalescing-selected` | Evidence points to request volume, refreshes or retry behaviour. | Start P7E. |
| `p7f-platform-investigation-selected` | Evidence points to platform/client overhead or repeated-window variance. | Start P7F. |
| `p7g-60-repeat-governance-selected` | 60 diagnostic is positive and ready for repeat certification policy. | Start P7G. |
| `p6-continuation-required` | Production execution or telemetry is still incomplete. | Continue diagnostic repair; do not optimise yet. |

---

## 9. Recommended P7 naming after P6

Do not pre-commit to one optimisation before P6 evidence lands. Use one of these names after the path decision:

- `sys-hardening-optimisation-p7A-bootstrap-d1-cache.md`
- `sys-hardening-optimisation-p7B-worker-cpu-json.md`
- `sys-hardening-optimisation-p7C-bootstrap-payload.md`
- `sys-hardening-optimisation-p7D-command-write-amplification.md`
- `sys-hardening-optimisation-p7E-request-coalescing-refresh.md`
- `sys-hardening-optimisation-p7F-platform-tail-investigation.md`
- `sys-hardening-optimisation-p7G-60-learner-certification-governance.md`

This avoids the main failure mode of the route: doing clever optimisation before the bottleneck is actually classified.

---

## 10. Product wording during P6

Use:

> “We have 30-learner beta capacity evidence. We are now running the operator-gated 60-learner diagnostic and closing route-cost gaps before selecting the next optimisation path.”

Do not use:

> “We support 60 learners.”

Do not use:

> “We are working on 1000 learners now.”

Do not use:

> “D1 writes are definitely the next fix.”

The honest position is stronger: P6 is where the team earns the right to pick the next optimisation with evidence.
