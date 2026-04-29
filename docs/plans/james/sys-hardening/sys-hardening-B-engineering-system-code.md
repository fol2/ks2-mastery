# System Hardening B — Engineering System and Code Contract

Status: post-P6 engineering handover draft  
Scope: KS2 Mastery hardening infrastructure, capacity tooling, Worker boundaries, evidence generation, Admin evidence, security headers, and regression gates  
Audience: next engineering agent, code reviewer, release operator, and capacity/security reviewer  
Language: UK English  
Baseline: P6 completion state on `main` after `docs/plans/james/sys-hardening/sys-hardening-p6-completion-report.md`

---

## 0. Executive engineering judgement

The engineering system is now much stronger than the original CPU-load/hardening split. The repo has real bounded bootstrap machinery, Worker-owned subject commands, D1 query budgets, capacity telemetry, multi-learner regression tests, security header gates, CSP/HSTS operator records, production bundle audits, session-manifest load infrastructure, schema-3 evidence summaries, and an Admin Production Evidence panel that fails closed.

However, the system is not yet capacity-certified beyond small-pilot-provisional.

The remaining engineering blocker is not a known unbounded query or obvious payload explosion. The evidence points to `/api/bootstrap` burst tail latency: bootstrap median is healthy, command latency is healthy, rows and query counts are bounded, but strict 30-learner P95 remains above the 1,000 ms gate. P6 deliberately did not ship a speculative bootstrap optimisation because the evidence system itself still needed to be made truthful first.

The next engineering move should be diagnostic-first, not rewrite-first.

---

## 1. Runtime architecture in one page

The production runtime has four main layers.

```txt
Browser React shell
  ↓ reads safe JSON read models
  ↓ sends command intents
Cloudflare Worker
  ↓ authenticates session / demo / role / same-origin
  ↓ validates learner access and command contract
  ↓ enforces idempotency / expected revision / CAS
D1-backed repository
  ↓ account, learner, subject state, game state, receipts, sessions, event log
Subject engines / read models
  ↓ deterministic scoring, scheduling, progress mutation, projection
```

The central engineering rule is:

> React may render, request, and recover. The Worker owns production authority.

That applies to:

- login/session state;
- account and learner access;
- bootstrap envelope;
- subject command validation;
- scoring and progress mutation;
- game/reward projection;
- read-model generation;
- admin mutations;
- capacity telemetry;
- redaction;
- security response wrapping.

---

## 2. Core Worker routes and their hardening role

### `/api/bootstrap`

This is the most important capacity and correctness route.

Responsibilities:

- authenticate session;
- ensure account exists;
- resolve selected learner;
- include all writable learner identities;
- include compact subject/game state for writable learners;
- include selected learner first-paint state;
- keep heavy histories bounded;
- support `notModified`;
- emit capacity metadata;
- remain within query and payload budgets.

Capacity concerns:

- P95 under burst currently blocks 30-learner certification.
- Query count and rows read are bounded in current evidence.
- Response bytes are tiny in demo-session load evidence.
- Top-tail request IDs are now captured for Worker-log correlation.

Correctness concerns:

- sibling learners must not disappear;
- selected learner switching must not show zero stats;
- viewer learners must not become writable;
- sibling subject-state writes must invalidate probes.

### `/api/subjects/:subjectId/command`

This is the subject write boundary.

Responsibilities:

- validate subject and command;
- verify learner access;
- enforce same-origin/session capability;
- require request IDs and idempotency;
- apply expected revision/CAS rules;
- persist subject state, practice sessions, event log, mutation receipts, and game projections;
- return bounded, redacted read models.

Capacity concerns:

- command P95 currently passes 30 and 60 diagnostic thresholds comfortably.
- Hot-path command projections must not read full `event_log`.
- Subject-specific expansion must not introduce unbounded command response work.

### `/api/hero/*`

Hero routes exist in the capacity surface. The hardening lesson is that any new route which launches learning or reads cross-subject status must be budgeted and role/access-checked like the older subject routes.

Hero must not bypass subject command authority.

### `/api/hubs/parent/*`

Parent surfaces are read-heavy and must remain bounded and paginated.

Responsibilities:

- show family learner state;
- show recent history without full-history bootstrap;
- preserve viewer/read-only distinction;
- degrade safely under breaker conditions.

### `/api/admin/*`

Admin routes are operator/support surfaces. They must be role-gated, redacted, and visible as capacity-relevant where they touch D1.

Responsibilities:

- evidence visibility;
- KPI views;
- debug bundles;
- error/denial logs;
- account search and support;
- marketing/live-ops safety;
- destructive action confirmation.

P6 specifically fixed debug-bundle capacity accounting by moving it through `requireDatabaseWithCapacity`.

### `/api/security/csp-report`

This route is public and unauthenticated by design because browsers send CSP reports without normal credentials.

It must stay:

- body-capped;
- JSON-shape validated;
- log-sanitised;
- rate-limited;
- no-store;
- non-crashing if rate-limit backing store fails.

---

## 3. Bootstrap engineering contract

Bootstrap is not “load all data”. Bootstrap is “load the minimum safe, correct account envelope for first paint”.

### Required shape

A valid production bootstrap must preserve:

- account metadata;
- session metadata;
- learner list;
- `selectedLearnerId`;
- `learners.allIds`;
- all writable learners;
- selected learner first-paint subject/read-model state;
- compact sibling subject/game state;
- bootstrap capacity metadata;
- public bounded mode metadata;
- no private answer-bearing fields;
- no raw source or server-only fields.

### Bounded heavy fields

The following must remain selected-only, bounded, paginated, or lazy:

- `practice_sessions`;
- `event_log`;
- activity feed;
- parent history;
- admin debug bundles;
- classroom summary;
- dense subject histories.

### `notModified`

`notModified` is an optimisation, not a permission shortcut.

It must invalidate when:

- selected learner relevant state changes;
- any writable sibling compact subject/game state changes;
- account revision changes in a way that affects the bootstrap envelope;
- bootstrap capacity version changes.

It must not hide sibling learner updates.

### Bootstrap capacity metadata

`meta.capacity.bootstrapCapacity` and related capacity metadata are not decorative. They are release-gate data.

If a bootstrap response is missing the required metadata, the system should fail closed in evidence and surface operator warnings rather than accepting the run.

---

## 4. Evidence system after P6

P6 changed the evidence system from “JSON summariser” to “positive proof classifier”.

### Schema-3 summary

`reports/capacity/latest-evidence-summary.json` is a schema-3 multi-source summary. It may include:

- capacity evidence;
- Admin smoke;
- bootstrap smoke;
- CSP status;
- D1 migrations;
- build version;
- KPI reconciliation.

Only capacity evidence can certify capacity. Auxiliary sources are operational context only.

### Certification requires positive proof

A row can only become certifying if all of this is true:

- evidence file passed;
- evidence is a capacity run, not dry-run/preflight;
- diagnostics classification says `certificationEligible === true`;
- tier metadata declares a certified target;
- run shape matches the target;
- production origin is exact-match;
- pinned config path and hash match;
- capacity table row verifies via `verifyEvidenceRow()`;
- `certifying === true` in the summary;
- Admin classifier sees `certifying === true`, not just a friendly tier key.

Missing `certifying`, missing diagnostics, wrong origin, dirty provenance, stale evidence, and diagnostic evidence must classify as non-certifying.

### Important P6 closure

P6 closed these false-pass routes:

- filename-only evidence named like a certified tier;
- external HTTPS origin pretending to be production;
- alternate or modified threshold config;
- manifest runs promoting without equivalence;
- shared-auth runs promoting isolated classroom load;
- reduced shape runs promoting strict 30/20/1;
- summary regeneration refreshing stale evidence;
- auxiliary source timestamps refreshing capacity evidence;
- Admin classifier treating legacy/missing certifying flag as certified.

This is a major engineering win.

---

## 5. Capacity tooling and scripts

### `scripts/classroom-load-test.mjs`

The load driver is the main capacity measurement tool.

It supports:

- dry-run plan validation;
- local fixture;
- production;
- demo sessions;
- session manifest;
- threshold gates;
- pinned config;
- response byte checks;
- zero signal gate;
- bootstrap capacity requirement;
- diagnostics classification;
- endpoint/phase/scenario summaries;
- top-tail request samples.

Risk to avoid:

- never combine threshold flags with dry-run;
- never use shared auth for classroom certification;
- never spoof client IPs;
- never overwrite failing evidence;
- never rely on filenames for tier classification.

### `scripts/prepare-session-manifest.mjs`

This tool prepares isolated demo sessions before a load test so app-load measurement can be separated from demo-session rate-limit setup.

After P6 it defaults to safer batching:

- 28-session batch;
- long inter-batch delay;
- no production rate-limit weakening.

Manifest evidence remains diagnostic unless an equivalence policy is approved.

### `scripts/generate-evidence-summary.mjs`

This is now a safety-critical operator/Admin input.

It must:

- read capacity evidence files;
- build a verified certification index from `docs/operations/capacity.md`;
- classify tiers cautiously;
- separate preflight from certification;
- preserve failed states;
- use underlying `finishedAt` for freshness;
- include CSP/migration/build context without promoting capacity.

### `scripts/verify-capacity-evidence.mjs`

This script protects runbook truth.

It must reject:

- drift between markdown row and JSON;
- wrong thresholds;
- dirty or unknown provenance where disallowed;
- mismatched config hash;
- invalid decision/tier shapes;
- missing or stale evidence rows;
- limits block disagreement with per-threshold `configured` values.

### `docs/operations/capacity-tail-latency.md`

This is the current diagnostic runbook for the `/api/bootstrap` P95 blocker.

The main matrix:

- T0 local smoke;
- T1 strict 30 baseline;
- T2 strict 30 after warm-up;
- T3 reduced burst;
- T4 session manifest;
- T5 repeated strict confidence.

Minimum before mitigation:

- at least one strict T1;
- at least one repeated strict T5;
- top-tail request IDs;
- pinned 30 config;
- unique output paths.

The note explicitly says not to change thresholds inside a mitigation PR.

---

## 6. Security header and source-lockdown system

### `worker/src/security-headers.js`

This is the response security header source of truth.

Current important constants:

- `HSTS_PRELOAD_ENABLED = false`;
- `CSP_ENFORCEMENT_MODE = 'report-only'`;
- HSTS value without `preload`;
- CSP shipped as `Content-Security-Policy-Report-Only`;
- Report-To and Reporting-Endpoints for CSP reports;
- Permissions-Policy deny-by-default;
- frame ancestors blocked;
- cache policy split for source bundles and immutable chunks.

### CSP enforcement contract

CSP enforcement is a gated follow-up, not a casual one-line change.

Before flip:

- observation window must be complete;
- daily log must be populated;
- unexpected first-party violations must be zero;
- third-party allowlist entries, if any, need adversarial sign-off;
- inline style budget must not regress;
- operator sign-off must be dated;
- tests must confirm mode/header key alignment.

If not satisfied, keep Report-Only and record a dated deferral.

### HSTS preload contract

HSTS preload is operator-gated.

Before enabling preload:

- enumerate full `eugnel.uk` DNS zone;
- verify apex HTTPS/HSTS posture;
- verify `ks2.eugnel.uk` and `dev-ks2.eugnel.uk`;
- verify all HTTP-serving subdomains;
- verify third-party CNAME subdomains;
- accept rollback implications;
- update code and `_headers`;
- update anti-preload assertions;
- attach submission evidence.

No engineering agent should enable preload without this record.

### Public source lockdown

Public routes must deny source and internal paths:

- `/src/*`, except allowed built JS chunks;
- `/shared/*`;
- `/worker/*`;
- `/tests/*`;
- `/docs/*`;
- `/legacy/*`;
- migration artefacts.

The bundle audit must keep walking all emitted chunks, not only the HTML entrypoint.

---

## 7. Admin evidence engineering contract

Admin Production Evidence is not a decorative panel. It is an operator truth renderer.

It should display:

- failed capacity evidence;
- non-certifying diagnostic evidence;
- stale evidence;
- missing evidence;
- CSP report-only state;
- D1/build context;
- unavailable smoke/KPI sources as unavailable, not green;
- human-readable tier labels;
- threshold violations.

It must not display:

- certification from missing `certifying: true`;
- certification from filename or tier string alone;
- stale evidence as fresh because the summary was regenerated;
- auxiliary-source freshness as capacity freshness;
- diagnostic manifest evidence as classroom support.

P6 wired the Admin Hub payload, narrow refresh route client, dispatcher, and patch helper so the panel is no longer detached test-only UI.

---

## 8. Query and capacity budgets

The engineering posture is “measure, then pin”.

Known budgets and gates include:

- bootstrap query budget;
- `notModified` query budget;
- subject command hot path;
- Parent Hub recent sessions;
- Hero read-model;
- Hero command;
- Admin KPI;
- Admin accounts;
- Admin debug bundle;
- Admin errors;
- Punctuation Star View projection performance.

The budget pattern is:

1. create fixture;
2. measure route;
3. pin budget at measured plus small margin or strict threshold;
4. fail tests on unreviewed expansion;
5. update budget only with explicit explanation.

Do not use budgets as decoration. If a future route adds a new query, the PR should explain why and what scale assumption changed.

---

## 9. Multi-learner tests that must never be removed

The multi-learner regression suite is one of the most valuable hardening artefacts.

It protects:

- 4-learner account contract;
- sibling compact state presence;
- single-learner regression guard;
- viewer exclusion;
- preferred learner switching;
- fallback selection;
- `notModified` invalidation;
- subject state markers;
- heavy history bounding.

Future agents may refactor the code, but must not weaken the assertions.

Any PR that touches these areas must run the suite:

```sh
node --test tests/worker-bootstrap-multi-learner-regression.test.js
```

---

## 10. Subject command and mutation safety

Subject commands must preserve:

- request idempotency;
- expected revision checks;
- compare-and-swap mutation boundaries;
- receipt replay semantics;
- same-origin / capability enforcement;
- learner scope checks;
- account role checks;
- primary state writes before derived projection;
- no “synced” display for failed writes;
- redacted response models;
- no browser-owned production persistence.

The priority order remains:

```txt
student answer write
  > reward / event projection
  > parent analytics
```

If a derived read-model write is skipped or breaker-open, the primary learner write must remain correct and visible as the source of truth.

---

## 11. Current bottleneck reading

The most useful evidence pattern after P6:

- bootstrap P50 healthy;
- bootstrap P95 high under burst;
- bootstrap query count flat;
- bootstrap D1 rows flat;
- payload small;
- command P95 passes;
- zero 5xx;
- zero capacity signals;
- 60-learner manifest reaches app load but bootstrap P95 fails stricter stretch gate.

This points away from a simple payload or query fan-out regression. It points towards burst/platform/D1 tail behaviour, but that is not fully proven until top-tail request IDs are correlated with Worker logs and D1 timing.

The next engineering step should be to run the tail-latency diagnostic matrix and inspect the slowest samples.

---

## 12. Known engineering gaps

### 12.1 Strict 30-learner certification still fails

No later P6 run replaced the P5 strict 30 failure with a passing strict 30. The capacity table remains honest.

Next work:

- run T1 strict 30 when demo setup bucket is clean;
- run T5 repeated strict confidence;
- include request samples;
- correlate top-tail IDs;
- only then choose code or policy.

### 12.2 Strict 30 setup is tight around demo-session limits

P6 notes a direct strict 30 setup attempt failed closed at learner 30. That is a setup reliability problem, not a reason to weaken isolation.

Possible future options:

- prepare setup in a safer window;
- use better operator scheduling;
- design approved fixture/manifest equivalence if product owners accept it;
- do not reuse global auth.

### 12.3 D1 tail-latency cause is not fully proven

P5’s “root cause is D1 tail latency” is too strong as final language. P6 correctly lowers the confidence.

Need:

- top-tail Worker logs;
- D1 duration checks;
- per-statement timings;
- repeated strict runs;
- compare strict versus reduced burst;
- compare strict versus manifest.

### 12.4 Potential one-statement bootstrap reduction

Explorer C found a plausible low-risk optimisation:

- `bootstrapBundle()` already reads `child_subject_state`;
- `listPublicBootstrapActiveSessionIds()` rereads it to parse active session IDs.

This could reduce one D1 statement in the selected bootstrap path. It was not shipped in P6 because evidence did not yet prove one fewer statement would fix the tail.

If implemented later:

- keep behaviour identical;
- add regression tests;
- ratchet query budget only if measured;
- do not pair with threshold changes.

### 12.5 Admin budget coverage remains incomplete

Debug-bundle capacity accounting improved. Some Admin endpoints still have observability but not hard budget ceilings.

Future work:

- add budget ceilings for all major Admin Ops routes;
- pre-aggregate KPI counters if scale grows;
- keep admin load separate from learner-route certification.

### 12.6 CSP remains Report-Only

This is not an engineering bug. It is a pending security rollout gate.

Future work after the observation window:

- populate daily log;
- choose flip or dated deferral;
- if flip, update header key, policy, tests, and docs together.

### 12.7 HSTS preload remains operator-gated

No code change should enable it without the DNS audit.

### 12.8 Repository decomposition is unfinished

`repository.js` has been partially split, but core impure functions still depend on many internal transforms.

Future decomposition should extract:

- pure row transforms;
- mapper pipelines;
- bootstrap envelope helpers;
- history repository;
- read-model repository;
- subject command repository;
- capacity metadata helpers.

Do not split while changing behaviour unless the contract explicitly says so.

---

## 13. Test and verification command map

Use targeted commands for changed surfaces.

### Baseline hardening characterisation

```sh
node --test   tests/worker-bootstrap-multi-learner-regression.test.js   tests/worker-query-budget.test.js   tests/worker-bootstrap-capacity.test.js   tests/capacity-evidence-schema.test.js   tests/security-headers.test.js
```

### Full local gate

```sh
npm test
npm run check
npm run capacity:verify-evidence
git diff --check
```

### Evidence summary

```sh
node scripts/generate-evidence-summary.mjs --verbose
npm run capacity:verify-evidence
```

### Strict 30 candidate

```sh
npm run capacity:classroom:release-gate --   --production   --origin https://ks2.eugnel.uk   --confirm-production-load   --confirm-high-production-load   --demo-sessions   --learners 30   --bootstrap-burst 20   --rounds 1   --config reports/capacity/configs/30-learner-beta.json   --include-request-samples   --output reports/capacity/evidence/30-learner-beta-v2-<date>-strict.json
```

### 60-learner diagnostic manifest

```sh
node scripts/prepare-session-manifest.mjs   --origin https://ks2.eugnel.uk   --learners 60   --output reports/capacity/manifests/60-learner-<date>.json

npm run capacity:classroom --   --production   --origin https://ks2.eugnel.uk   --confirm-production-load   --confirm-high-production-load   --session-manifest reports/capacity/manifests/60-learner-<date>.json   --learners 60   --bootstrap-burst 20   --rounds 1   --config reports/capacity/configs/60-learner-stretch.json   --include-request-samples   --output reports/capacity/evidence/60-learner-stretch-preflight-<date>.json
```

### Security posture

```sh
npm run audit:client
npm run audit:production -- --skip-local
node --test tests/security-headers.test.js
```

### Production smoke families

```sh
npm run smoke:production:bootstrap -- --url https://ks2.eugnel.uk --cookie "ks2_session=..."
npm run smoke:production:spelling-dense -- --origin https://ks2.eugnel.uk --cookie "ks2_session=..."
npm run smoke:production:grammar -- --origin https://ks2.eugnel.uk --cookie "ks2_session=..."
npm run smoke:production:punctuation -- --origin https://ks2.eugnel.uk --cookie "ks2_session=..."
npm run smoke:production:admin-ops -- --origin https://ks2.eugnel.uk --cookie "ks2_session=..."
```

Do not claim any command ran unless it actually ran in that session.

---

## 14. Review checklist for future PRs

A hardening/capacity/security PR should answer:

### Correctness

- Does it preserve multi-learner account behaviour?
- Does it preserve selected-learner switching?
- Does it preserve viewer versus writable distinction?
- Does it preserve subject command idempotency and CAS?
- Does it avoid hidden browser-owned writes?

### Capacity

- Which route is affected?
- Does query count change?
- Do rows read/written change?
- Do response bytes change?
- Does command P95 or bootstrap P95 risk change?
- Is evidence certification, smoke, preflight, or diagnostic?
- Is threshold config pinned?
- Does `meta.capacity` still appear where expected?

### Security

- Does it widen public bundle exposure?
- Does it leak answer-bearing or server-only fields?
- Does it add raw clipboard copy?
- Does it bypass same-origin/session/role checks?
- Does it alter CSP/HSTS/cache/security headers?
- Does it change source lockdown paths?

### Evidence

- Is there a committed evidence file where needed?
- Does capacity.md row match the JSON?
- Does `capacity:verify-evidence` pass?
- Does Admin Production Evidence classify it correctly?
- Does stale/diagnostic evidence stay non-certifying?

### Operations

- Is the runbook updated?
- Is launch wording clear?
- Is there a rollback/degrade path?
- Are known residuals named rather than hidden?

---

## 15. Anti-patterns already found in past phases

These bugs happened or almost happened. Future reviewers should actively look for them.

- Silent-green dry-run with thresholds.
- Duplicate threshold flag weakening a gate.
- Last-wins mode parsing downgrading production to dry-run.
- Vacuous `Array.every()` assertions passing on empty arrays.
- Tests asserting body visible rather than degraded copy.
- Evidence consumer correct but producer missing fields.
- NaN/false/negative values passing nullish checks.
- Filename-only tier classification.
- `Object.freeze(new Set())` treated as immutable.
- Regenerated summary making old evidence look fresh.
- Auxiliary status making capacity evidence look fresh.
- Admin classifier certifying missing `certifying`.
- Preflight filename matching certified tier regex.
- `generatedAt` used as proof of run freshness.
- Global/shared auth used to simplify classroom load tests.
- Over-broad route allowlists for source bundles.
- Stale hashed chunks copied after build.
- Public route logging unsanitised report values.
- Debug bundle using raw DB outside capacity collector.
- “Every successful bootstrap clears stale guards” without checking state transition.
- Hardening PR accidentally adding learner-visible product scope.

---

## 16. How to read the current evidence files

### `30-learner-beta-v2-20260428-p5-warm.json`

Read as:

- strict 30 shape;
- production;
- demo sessions;
- failed only bootstrap P95;
- not certified;
- useful as current blocker evidence.

Do not read as:

- certified 30;
- proof that threshold should be relaxed;
- final proof that D1 is solely responsible.

### `60-learner-stretch-preflight-20260428-p6.json`

Read as:

- diagnostic manifest preflight;
- 60 isolated learners;
- application load reached;
- zero 5xx/signals;
- command path healthy;
- bootstrap P95 fails stricter stretch cap;
- not certification evidence.

Do not read as:

- certified 60;
- proof of real classroom stretch readiness;
- replacement for strict 30 certification.

### `latest-evidence-summary.json`

Read as:

- current Admin evidence input;
- schema-3 summary;
- failed/non-certifying state carrier;
- auxiliary context carrier.

Do not read as:

- a source of truth stronger than raw evidence and capacity table;
- a certification artefact by itself.

---

## 17. Recommended next engineering slice

The next engineering slice should be called something narrow, such as:

> Bootstrap Tail-Latency Diagnostics and One-Statement Reduction Evaluation

Suggested order:

1. Run T1 strict 30 with request samples.
2. Run T5 repeated strict 30.
3. Run T3 reduced burst.
4. Run T4 manifest diagnostic.
5. Correlate top-tail request IDs with Worker logs.
6. Decide whether one-statement reduction is worth shipping.
7. If shipping code, keep threshold policy unchanged.
8. Rerun strict 30.
9. Only promote if evidence passes and verifier/Admin agree.

Do not start with:

- 100+ learner run;
- broad repository rewrite;
- CSP/HSTS flip;
- large Admin feature;
- threshold relaxation;
- paid-tier migration argument.

---

## 18. Engineering acceptance criteria for “ready to claim 30 learner beta”

All must be true:

- strict 30/20/1 production run passes;
- pinned `30-learner-beta.json` used;
- zero 5xx;
- zero network failures;
- zero hard capacity signals;
- bootstrap P95 ≤ 1,000 ms;
- command P95 ≤ 750 ms;
- max bytes ≤ 600,000;
- bootstrap capacity metadata present;
- multi-learner suite passes;
- capacity.md row is added with `30-learner-beta-certified`;
- `npm run capacity:verify-evidence` passes;
- `latest-evidence-summary.json` marks the row `certifying: true`;
- Admin Production Evidence shows certified only from that positive proof;
- completion report names commit, date, environment, and evidence path.

If any of those fail, keep `small-pilot-provisional`.

---

## 19. Engineering acceptance criteria for “ready to claim 60 learner stretch”

All 30-learner criteria must already be met, plus:

- real 60 learner run reaches app load;
- certification policy for session source is explicit;
- no session-manifest diagnostic is promoted unless equivalence policy is signed;
- 60 config thresholds pass;
- repeated runs are available or the completion report clearly states confidence limits;
- no 5xx/signals;
- command and bootstrap thresholds pass;
- evidence row verifies;
- Admin displays certification only from positive proof.

---

## 20. References reviewed

Hardening and capacity reports:

- `docs/plans/james/sys-hardening/sys-hardening-p1-completion-report.md`
- `docs/plans/james/sys-hardening/sys-hardening-p2-completion-report.md`
- `docs/plans/james/sys-hardening/sys-hardening-p3-completion-report.md`
- `docs/plans/james/sys-hardening/sys-hardening-p4-completion-report.md`
- `docs/plans/james/sys-hardening/sys-hardening-p5-baseline.md`
- `docs/plans/james/sys-hardening/sys-hardening-p5-completion-report.md`
- `docs/plans/james/sys-hardening/sys-hardening-p6-baseline.md`
- `docs/plans/james/sys-hardening/sys-hardening-p6-completion-report.md`

Operational runbooks:

- `docs/operations/capacity.md`
- `docs/operations/capacity-tail-latency.md`
- `docs/hardening/csp-enforcement-decision.md`
- `docs/hardening/hsts-preload-audit.md`

Source and artefacts:

- `worker/src/app.js`
- `worker/src/security-headers.js`
- `scripts/classroom-load-test.mjs`
- `scripts/prepare-session-manifest.mjs`
- `scripts/generate-evidence-summary.mjs`
- `scripts/verify-capacity-evidence.mjs`
- `reports/capacity/latest-evidence-summary.json`
- `reports/capacity/evidence/30-learner-beta-v2-20260428-p5-warm.json`
- `reports/capacity/evidence/60-learner-stretch-preflight-20260428-p6.json`

Reference document formats:

- `docs/plans/james/punctuation/punctuation-A-architecture-product.md`
- `docs/plans/james/punctuation/punctuation-B-engineering-system-code.md`
- `docs/plans/james/grammar/grammar-A-product-architecture.md`
- `docs/plans/james/grammar/grammar-B-engineering-system.md`
