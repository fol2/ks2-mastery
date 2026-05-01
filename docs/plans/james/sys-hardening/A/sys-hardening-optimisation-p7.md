---
title: "System Hardening Optimisation P7 — Bootstrap/D1 Query-Shape and Cache-Contract Optimisation"
type: plan
status: proposed
date: 2026-05-01
phase: P7
owner: james
route: system-hardening-optimisation
language: en-GB
source_context:
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6-completion-report.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6-60-approved-run-report.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6-path-decision.md
  - reports/capacity/evidence/2026-05-01-p6-60-diagnostic.json
  - reports/capacity/evidence/2026-05-01-p6-60-tail-correlation.json
  - reports/capacity/evidence/2026-05-01-p6-60-statement-map.json
  - reports/capacity/evidence/2026-05-01-p6-route-costs-after-60-diagnostic.json
  - reports/capacity/latest-1000-learner-budget.json
---

# System Hardening Optimisation P7 — Bootstrap/D1 Query-Shape and Cache-Contract Optimisation

## 0. Phase summary

P7 is the first targeted optimisation phase after the approved P6 60-learner production diagnostic.

P6 finally answered the main attribution question: the 60-learner production run reached app-load, produced joined Worker CPU/wall and D1 statement evidence, and failed only the bootstrap P95 gate. The top-tail samples were mostly D1-dominated, not command-path dominated.

Therefore P7 is deliberately narrow:

> Reduce full-bootstrap D1 latency and D1 statement pressure without weakening multi-learner correctness, revision invalidation, not-modified safety, capacity evidence, or the existing 30-learner beta boundary.

P7 is not a certification phase. A successful P7 creates new post-optimisation evidence and may create a 60-learner repeat-governance candidate. It must not directly promote 60 learners.

---

## 1. P6 truth carried into P7

## 1.1 Capacity status

The current public capacity status remains:

- 30 learners: `30-learner-beta-certified`.
- 60 learners: not certified.
- 1000 learners: modelling-only, non-certifying.

P7 must not broaden public wording beyond the existing 30-learner beta boundary.

## 1.2 Approved 60-learner diagnostic result

The approved P6 production diagnostic ran against `https://ks2.eugnel.uk` with:

- learners: 60;
- bootstrap burst: 20;
- rounds: 1;
- expected requests: 260;
- observed requests: 260;
- HTTP 200 responses: 260;
- 5xx responses: 0;
- network failures: 0;
- capacity signals: 0.

Threshold result:

| Metric | Limit | Observed | Result |
| --- | ---: | ---: | --- |
| Bootstrap P95 wall time | 750 ms | 1057.3 ms | failed |
| Command P95 wall time | 400 ms | 383.8 ms | passed |
| Max response bytes | 600000 bytes | 29602 bytes | passed |
| 5xx responses | 0 | 0 | passed |
| Network failures | 0 | 0 | passed |
| Capacity signals | 0 | 0 | passed |

This is a useful failure. It is narrow enough to optimise without rewriting the whole system.

## 1.3 Bootstrap shape from P6

For `GET /api/bootstrap` in the approved run:

| Metric | Observed |
| --- | ---: |
| Count | 80 |
| P50 wall | 244.8 ms |
| P95 wall | 1057.3 ms |
| Max wall | 1128.8 ms |
| Query count | 11 |
| Query count P95 | 11 |
| D1 rows read P95 | 9 |
| D1 rows written P95 | 0 |
| Server wall P95 | 903 ms |
| Response bytes P95 | 2449 bytes |
| Bootstrap mode | `selected-learner-bounded` |
| Bootstrap capacity mode | `public-bounded` |

The problem is not response size, learner history fan-out, 5xx, or failed command writes. The problem is bootstrap tail latency under a 60-learner burst.

## 1.4 Tail attribution from P6

The P6 tail correlation joined:

- 10/10 retained top-tail invocation samples;
- 10/10 retained top-tail statement-log samples;
- no warnings.

Classification:

| Classification | Count |
| --- | ---: |
| `d1-dominated` | 8 |
| `worker-cpu-dominated` | 2 |

This selects bootstrap/D1 as the primary path, while keeping Worker CPU/JSON as a secondary risk to watch.

## 1.5 Statement-map coverage from P6

The statement map was complete:

- total requests: 260;
- requests with statement logs: 260;
- missing statement-log requests: 0;
- truncated requests: 0;
- expected statements: 4484;
- observed statements: 4484;
- coverage ratio: 1.0.

The statement map is good enough to drive query-shape work. P7 should not optimise blindly.

## 1.6 1000-learner model truth

The 1000-learner model remains non-certifying and lower-bound.

Expected 1000-learner scenario:

| Resource | Observed model value | Limit | Status |
| --- | ---: | ---: | --- |
| Dynamic requests/day | 36015 | 100000 | green |
| D1 rows read/day | 18438000 | 5000000 | red, lower-bound |
| D1 rows written/day | 1134000 | 100000 | red, lower-bound |
| Worker CPU | max bootstrap 21 ms vs 10 ms line | partial | red/partial |

This does not make P7 a 1000-learner write-compression phase. It means every P7 bootstrap optimisation should preserve the data needed for the 1000 model, while the immediate certification blocker remains 60-learner bootstrap latency.

---

## 2. P7 product contract

P7 protects the learner and adult experience by making first-paint bootstrap less fragile under classroom-start load.

The product promise is:

> A 60-learner classroom start should not be blocked by repeated slow bootstrap reads when command execution, response size, network reliability and capacity signals are otherwise healthy.

P7 must keep these product invariants:

1. Selected learner first-paint remains available.
2. Writable sibling learner state remains represented compactly.
3. Learner switching must not show false zero-stats for sibling learners.
4. `notModified` must still invalidate when selected learner, sibling learner state, account revision, learner-list revision, or bootstrap capacity version changes.
5. Adult/admin/hub read-only learner separation must not be weakened.
6. No child-facing response should expose raw SQL, raw Worker tail request ids, cookies, emails, account ids, or learner names.
7. 30-learner beta remains the highest public status unless a separate governance PR changes it.
8. A single passing post-P7 60-learner diagnostic is not enough for public 60-learner certification.

---

## 3. P7 engineering contract

P7 should use the P6 statement map to select a small number of bootstrap query-shape changes.

Allowed work:

- map opaque statement ids to internal query families in developer-only notes;
- add a redacted statement-family summary that is safe to commit;
- run `EXPLAIN QUERY PLAN` locally or in safe non-production diagnostics;
- remove or combine redundant bootstrap statements;
- reduce sequential D1 round trips in full bootstrap;
- tighten selected-learner-bounded query shape;
- strengthen `notModified` and cache-contract evidence;
- ratchet query-budget tests only after a safe reduction is implemented;
- rerun approved 60-learner evidence after the change.

Disallowed work:

- lowering the 60-learner threshold;
- deleting sibling learner state from bootstrap to win latency;
- weakening revision hash ingredients;
- committing raw Worker tail JSONL;
- committing raw SQL text or raw production request ids in diagnostic artefacts;
- changing subject mastery, Stars, rewards, Hero Mode, or command semantics;
- command batching or write-amplification redesign;
- D1 partitioning or Durable Object migration;
- public 60-learner wording;
- using a warm-only run as certification evidence.

---

## 4. Phase units

## P7-U0 — Source and documentation boundary repair

### Purpose

Make the P6 handoff unambiguous before changing code.

### Tasks

1. Create `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-baseline.md`.
2. Record the P6 approved run as the controlling handoff:
   - `2026-05-01-p6-60-diagnostic.json`;
   - `2026-05-01-p6-60-tail-correlation.json`;
   - `2026-05-01-p6-60-statement-map.json`;
   - `2026-05-01-p6-60-tail-classification.md`;
   - `2026-05-01-p6-route-costs-after-60-diagnostic.json`.
3. Mark the earlier `sys-hardening-optimisation-p6-60-diagnostic-decision.md` setup-blocked decision as superseded by the approved run report, or add an explicit `superseded_by` / `historical_pre_approval` note.
4. Preserve the P6 statement that 60 learners remain uncertified.
5. Preserve the P6 statement that 1000 learners remain modelling-only and non-certifying.

### Acceptance criteria

- The P7 baseline identifies the approved 2026-05-01 run as the active evidence boundary.
- No reader can confuse the older setup-blocked decision with the final approved-run outcome.
- No public capacity status is promoted.

---

## P7-U1 — Bootstrap statement-family attribution

### Purpose

Turn the P6 opaque statement map into a safe engineering shortlist.

The committed P6 statement map redacts statement identifiers correctly. P7 needs a developer-safe bridge from those opaque ids to query families, without committing sensitive SQL or raw request ids.

### Tasks

1. For the top-tail bootstrap samples, classify each bootstrap D1 statement into a safe family label:
   - account row / selected learner;
   - membership / learner rows;
   - learner-list revision;
   - monster visual config pointer;
   - child subject state;
   - child game state;
   - public session rows;
   - public event rows;
   - spelling content bundle / release pointer;
   - spelling codex merge;
   - capacity/revision helper.
2. Produce a redacted statement-family summary:

```json
{
  "runId": "2026-05-01-p6-60-diagnostic",
  "route": "GET /api/bootstrap",
  "statementFamilies": [
    {
      "family": "membership-learner-rows",
      "count": 80,
      "topTailDurationMsP95": 143,
      "rowsReadP95": 1,
      "candidate": true,
      "notes": "safe family label only; no raw SQL"
    }
  ]
}
```

3. Add tests proving the summary does not leak:
   - raw SQL;
   - table names if the redaction policy forbids them;
   - raw `ks2_req_*` ids;
   - cookies, emails, learner names, bearer tokens.
4. Select no more than two candidate query families for P7-U2.

### Acceptance criteria

- A safe statement-family summary exists.
- The summary can explain which bootstrap statement families dominate top-tail D1 duration.
- The summary remains redacted and commit-safe.
- P7-U2 has a ranked candidate list.

---

## P7-U2 — One narrow bootstrap/D1 query-shape reduction

### Purpose

Ship one safe bootstrap optimisation, not a broad rewrite.

The starting target is the selected-learner-bounded public bootstrap path that failed P6. Current approved-run shape is approximately 11 statements, 9 rows read P95, 0 rows written P95, and small response bytes. Reducing sequential D1 round trips is the most plausible way to reduce D1-dominated tail latency.

### Candidate classes

Pick the best candidate from P7-U1 evidence. Likely classes include:

1. **Revision/account consolidation**
   - Avoid re-reading account/list revision ingredients where already available from the membership/account phase.
   - Must preserve sibling learner invalidation.

2. **Static/pointer read caching**
   - Avoid a D1 pointer read on every full bootstrap if the pointer is stable and safely cached inside the Worker isolate or request-independent cache boundary.
   - Must not cache learner-specific data across users.

3. **Spelling content/codex conditional read tightening**
   - Only read spelling runtime content if the returned subject/game state actually needs it for selected first-paint data.
   - Must not break Word Bank / spelling setup stats.

4. **Session/event compact-row tightening**
   - Keep selected learner first-paint but avoid any unnecessary order/scan cost.
   - Must preserve active-session display and event summary correctness.

5. **Query fusion where safe**
   - Combine tiny sequential point reads only when the resulting SQL stays indexed, explainable, and row-bounded.
   - Do not create a wide join that reads more rows just to reduce statement count.

### Explicit cautions

- Do not blindly parallelise D1 reads. D1 serialises database work, and parallel calls can increase queue pressure without reducing true latency.
- Do not add indexes before proving `EXPLAIN QUERY PLAN` and rows-read improvement.
- Do not reduce query count by increasing rows scanned.
- Do not replace a bounded correctness query with client trust.

### Acceptance criteria

Minimum acceptable optimisation:

- public bounded full-bootstrap query count decreases by at least one statement in the target path, or D1 duration P95 improves in a controlled diagnostic with no query-count increase;
- D1 rows read do not increase materially;
- D1 rows written remain zero for full bootstrap;
- response bytes do not increase materially;
- bootstrap capacity metadata remains present;
- multi-learner sibling stats remain correct;
- not-modified invalidation still works.

Recommended ratchet after implementation:

- current query count budget stays documented as 11;
- if implementation reduces observed count to 10 or below, ratchet the test budget to the observed safe value plus no hidden slack;
- if duration improves without count reduction, document why count ratchet is not appropriate.

---

## P7-U3 — Bootstrap cache and `notModified` contract proof

### Purpose

P6 failed on full bootstrap. P7 should reduce full-bootstrap D1 pain, but it should also make sure the app avoids unnecessary full bootstraps where the revision contract already allows a cheap not-modified path.

### Tasks

1. Reconfirm the actual client first-paint route mix:
   - `GET /api/bootstrap` full public-bounded path;
   - `POST /api/bootstrap` v2 full path;
   - `POST /api/bootstrap` v2 `notModified` path.
2. Measure or produce route-cost evidence for `not-modified-bootstrap`, currently missing/gated from the 1000 model.
3. Add a post-P7 scenario that separates:
   - cold full bootstrap;
   - warm full bootstrap;
   - not-modified refresh;
   - multi-tab follower cache hit;
   - bootstrap retry/backoff path.
4. Preserve these invalidation cases:
   - selected learner changed;
   - sibling learner subject state changed;
   - learner-list membership changed;
   - account revision changed;
   - bootstrap capacity version changed;
   - stale/corrupt local revision envelope.
5. Ensure stale local cache cannot cause false child-facing state.

### Acceptance criteria

- `not-modified-bootstrap` is no longer a missing route family in the route-cost ledger, unless explicitly blocked with a new reason.
- Not-modified evidence is diagnostic-only unless produced by a certifying run shape.
- Multi-tab coordination counters still work.
- Any cache addition is account-scoped, revision-scoped, and privacy-safe.

---

## P7-U4 — Post-optimisation focused tests and local verification

### Purpose

Protect correctness while optimising a fragile path.

### Required test coverage

At minimum, P7 should run and/or add focused coverage for:

- selected-learner-bounded bootstrap shape;
- sibling learner compact state;
- sibling write invalidates not-modified;
- selected learner switch invalidates not-modified;
- account learner-list revision invalidates not-modified;
- bootstrap capacity metadata presence;
- raw log redaction;
- statement-family summary redaction;
- query-budget ratchet;
- D1 rows read/written regression;
- empty account bootstrap;
- degraded fallback path for subject state query failure;
- Worker CPU field preservation in route-cost evidence.

Suggested commands:

```sh
node --test \
  tests/worker-bootstrap-capacity.test.js \
  tests/worker-bootstrap-v2.test.js \
  tests/worker-bootstrap-multi-learner-regression.test.js \
  tests/capacity-statement-map.test.js \
  tests/capacity-worker-log-join.test.js \
  tests/capacity-budget-ledger.test.js \
  tests/capacity-evidence.test.js \
  tests/capacity-evidence-schema.test.js \
  tests/verify-capacity-evidence.test.js \
  tests/admin-production-evidence.test.js

npm run capacity:verify-evidence
npm run check
```

### Acceptance criteria

- Focused tests pass.
- `npm run check` passes.
- `capacity:verify-evidence` passes without weakening evidence rules.
- Any full-suite failure is either fixed or explicitly proven unrelated and pre-existing; do not hide it in the completion report.

---

## P7-U5 — Approved post-change 60-learner diagnostic

### Purpose

Measure whether the optimisation actually improves the failed gate.

### Required run shape

Use the same shape as P6 unless the decision record explicitly explains the difference:

- origin: production `https://ks2.eugnel.uk`;
- learners: 60;
- bootstrap burst: 20;
- rounds: 1;
- threshold config: `reports/capacity/configs/60-learner-stretch.json`;
- raw Worker tail captured outside the repo;
- redacted tail correlation committed;
- redacted statement map committed;
- route-cost/budget regenerated.

### Success outcome

The best P7 outcome is:

- bootstrap P95 <= 750 ms;
- command P95 <= 400 ms;
- max response bytes <= 600000;
- 5xx = 0;
- network failures = 0;
- capacity signals = 0;
- top-tail join has invocation and statement coverage;
- statement map has no truncation;
- no new raw-log leak.

Even then, do not certify 60 learners directly. Move to repeat-governance.

### Failure outcome

If the post-change run still fails, classify it:

| Classification | Meaning | Next likely phase |
| --- | --- | --- |
| `d1-dominated-bootstrap-still-failing` | D1 remains dominant after one query-shape reduction | P7 continuation or P8A deeper bootstrap/D1 |
| `worker-cpu-dominated-bootstrap` | CPU becomes dominant after D1 reduction | P8B Worker CPU / JSON |
| `payload-bound-bootstrap` | response size or serialisation becomes dominant | P8C payload reduction |
| `platform-tail` | app/D1/CPU normal but client wall high | P8F operations/platform |
| `positive-single-run` | run passes once | P8G repeat-governance, not certification |
| `evidence-incomplete` | tail or statement join missing | repair evidence before optimisation |

---

## P7-U6 — Budget and route-cost refresh

### Purpose

Keep the 1000-learner model honest even though P7 is not primarily a 1000-learner phase.

### Tasks

1. Regenerate the route-cost artefact from post-P7 evidence.
2. Regenerate `reports/capacity/latest-1000-learner-budget.json`.
3. Regenerate `docs/operations/capacity-1000-learner-free-tier-budget.md`.
4. Report whether P7 changed:
   - dynamic request pressure;
   - D1 query pressure;
   - D1 rows read;
   - D1 rows written;
   - Worker CPU max route;
   - route-family coverage.
5. Keep missing/gated route families explicit.

### Acceptance criteria

- The model remains `modellingOnly: true` and `certifying: false`.
- If D1 rows read/written remain red for expected 1000 learners, say so plainly.
- P7 must not claim 1000 learner support.

---

## P7-U7 — Decision record and completion report

### Purpose

End P7 with a decision, not just an implementation.

### Required artefacts

Create:

```text
docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-baseline.md
docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-statement-family-summary.md
docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-post-change-run-report.md
docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-path-decision.md
docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-completion-report.md
```

The path decision must answer:

1. Did P7 reduce full-bootstrap D1 statement count or D1 duration?
2. Did the post-change 60-learner run pass the bootstrap P95 threshold?
3. Did Worker CPU become the new dominant blocker?
4. Did any route-cost/budget risk worsen?
5. Is 60 learners still uncertified?
6. Is the next phase repeat-governance, deeper bootstrap/D1 work, Worker CPU/JSON work, payload reduction, platform investigation, or write-amplification work?

### Acceptance criteria

- Completion report includes exact evidence paths.
- Completion report distinguishes implementation, diagnostic evidence, and certification.
- No public status is promoted without a separate governance step.

---

## 5. P7 success criteria

P7 is successful if it achieves all of these:

1. P6 handoff ambiguity is cleaned up.
2. Bootstrap statement-family attribution exists and is safe to commit.
3. At least one narrow bootstrap/D1 optimisation is implemented or a clear evidence-backed refusal is recorded.
4. Multi-learner correctness is preserved.
5. Not-modified and revision invalidation are preserved.
6. Focused bootstrap/capacity tests pass.
7. A post-change 60-learner production diagnostic is run with tail and statement coverage, or the absence of such a run is explicitly operator-gated.
8. The 1000-learner budget is regenerated and remains non-certifying unless evidence genuinely changes.
9. P7 exits with a clear P8 path.

---

## 6. Expected P7 exit states

| Exit state | Meaning | Next action |
| --- | --- | --- |
| `p8g-60-repeat-governance-candidate` | Post-P7 60 diagnostic passed once with complete telemetry | Run repeat policy; do not certify from one run. |
| `p8a-bootstrap-d1-continuation` | D1 still dominates bootstrap after one reduction | Deeper query/index/cache work. |
| `p8b-worker-cpu-json-selected` | D1 improves but Worker CPU/JSON dominates | Optimise response construction / serialisation. |
| `p8c-payload-selected` | Payload or serialisation size becomes the limiter | Trim envelope or revise payload contract. |
| `p8f-platform-ops-selected` | App/D1/CPU normal but client/platform tail remains | Investigate Cloudflare/platform/load-driver behaviour. |
| `p8d-write-amplification-selected` | 60 no longer blocked, 1000 write budget becomes next priority | Command batching/write compaction phase. |
| `p7-continuation-required` | Evidence incomplete or mitigation inconclusive | Continue P7; do not jump phases. |

---

## 7. Recommended implementation posture

P7 should be conservative and measurable.

Do not aim to make bootstrap clever. Aim to make it boring, bounded and less chatty with D1.

The highest-value engineering behaviour is:

1. identify the two slowest bootstrap statement families;
2. choose one safe reduction;
3. prove the query count or D1 duration improvement;
4. rerun the same 60-learner shape;
5. decide the next phase from evidence.

The wrong behaviour is to add broad caching, widen SQL, lower thresholds, or start 1000-learner write batching before the failed 60-learner bootstrap gate is addressed.

---

## 8. Final P7 product sentence

> P7 optimises the failed 60-learner first-paint path by reducing D1-dominated bootstrap tail latency while preserving learner correctness, revision safety, redacted evidence, and the existing 30-learner beta capacity boundary.
