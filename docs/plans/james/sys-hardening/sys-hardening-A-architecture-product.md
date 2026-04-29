# System Hardening A — Architecture and Product Contract

Status: post-P6 source-of-truth handover draft  
Scope: KS2 Mastery system hardening, capacity certification, production safety, source lockdown, multi-learner correctness, and operator evidence  
Audience: product owner, engineering lead, next-session agent, release reviewer, and operations reviewer  
Language: UK English  
Baseline: P6 completion state on `main` after `docs/plans/james/sys-hardening/sys-hardening-p6-completion-report.md`

---

## 0. One-sentence summary

System hardening in KS2 Mastery is not a cosmetic security pass. It is the product architecture that keeps the platform trustworthy: one account can contain multiple learners, production learning state remains Worker-authoritative, private logic and learner data stay locked down, capacity claims are tied to dated evidence, and no optimisation is allowed to make the product less correct.

The current post-P6 truth is:

> The platform is safer, more observable, and more honest than it was at P1, but it is still **small-pilot-provisional**. The 30-learner classroom beta is **not certified**, the 60-learner stretch target is **not certified**, CSP remains **Report-Only**, and HSTS preload remains **operator-gated**.

P6 did not promote capacity. That is not a failure of the phase. It is the correct product posture because the strict certification evidence still fails the bootstrap P95 threshold.

---

## 1. Product intent

The hardening and optimisation programme exists because the product cannot become a useful KS2 learning platform if two learners can make the service return 503s, if optimisation silently breaks sibling learners, if public routes expose source or learner logic, or if release claims are based on hope rather than measurement.

The product intent is to make the system:

1. **Stable** — learner practice, parent views, account state, subject progress, and admin operations should fail visibly and recoverably rather than silently corrupting state.
2. **Expandable** — new subjects, Hero Mode, Admin surfaces, Parent Hub, marketing/live-ops, and future classroom features should not require rewriting the bootstrap or persistence model each time.
3. **Scalable** — the app should spend Worker CPU, D1 queries, payload bytes, and retries only where they produce user value.
4. **Correct for multi-learner accounts** — a Google login may have one, four, or more learners. Optimisation must never collapse that reality into a single child.
5. **Private by default** — learner answers, raw prompts, validators, source paths, generated answer logic, session hashes, debug bodies, and server-only details must not leak into public bundles, public routes, copied bundles, or child surfaces.
6. **Evidence-led** — capacity and security posture claims must be tied to dated repo evidence, not anecdote.
7. **Operationally honest** — Admin and docs must show failed, stale, diagnostic, and non-certifying states as exactly that.

---

## 2. The hardening product boundary

Hardening is not a new feature programme. It can produce new tools, tests, documents, and operator panels, but those artefacts exist to protect the learning product.

### In scope

- Capacity certification for `/api/bootstrap`, subject commands, Parent Hub, Classroom/Admin routes, and high-history learners.
- Multi-learner account correctness.
- Source lockdown and public bundle auditing.
- Security headers, CSP observation, HSTS preload decision gating, cache split, and safe route behaviour.
- Worker-owned write boundaries, idempotency, compare-and-swap, request receipts, and progress preservation.
- D1 query, row, payload, and wall-time budgets.
- Admin evidence surfaces that state operational truth without overclaiming.
- Safe copying, redaction, and role-gated admin/debug operations.
- Regression gates for bootstrap shape, subject command loops, dense-history learners, and post-phase drift.
- Documentation that prevents future agents from making false launch claims.

### Out of scope unless explicitly re-contracted

- Claiming classroom readiness without passing evidence.
- Relaxing thresholds inside a mitigation PR.
- Bypassing production rate limits by spoofing IP headers.
- Using shared-auth load tests as classroom certification.
- Treating manifest-based preflight evidence as certification without an approved equivalence record.
- Enabling HSTS preload without operator DNS enumeration and sign-off.
- Flipping CSP enforcement before the observation log and operator criteria are satisfied.
- Rewriting subject learning semantics as part of capacity work.
- Adding learner-visible game or subject features during a hardening slice.
- Reintroducing broad browser-owned persistent writes.

---

## 3. Current product truth after P6

### Certification status

| Target | Current truth | Product wording |
| --- | --- | --- |
| Family demo | Ready for bounded-bootstrap smoke checks | “Family demo is supported subject to smoke checks and no redaction failures.” |
| Small pilot | Provisional | “Small-pilot-provisional.” |
| 30-learner classroom beta | Not certified | “30-learner certification is blocked by bootstrap P95 evidence.” |
| 60-learner stretch | Not certified | “A 60-learner manifest preflight reached application load, but failed bootstrap P95 and remains diagnostic.” |
| 100+ school-ready | Not certified | “Not measured. Requires repeated evidence and rollback/degrade drill.” |

### Exact evidence posture

The latest strict 30-learner evidence considered by P6 is still the P5 warm-cache run:

- 30 learners
- 20 bootstrap burst
- 1 command round
- production origin
- zero 5xx
- zero network failures
- zero capacity signals
- command P95 under threshold
- payload under cap
- bootstrap query count within budget
- bootstrap D1 rows within budget
- bootstrap P95 failed: 1,167.4 ms against a 1,000 ms ceiling

The latest 60-learner P6 manifest preflight is more useful than P5 because it reached real app load:

- 60 isolated demo sessions prepared by manifest
- 260 requests
- all returned 200
- zero 5xx
- zero signals
- command P95 passed
- bootstrap P95 failed: 854 ms against a 750 ms stretch ceiling
- evidence is diagnostic because session-manifest evidence is not certification evidence without an equivalence record

That is a good failure. It is specific, measurable, and harder to misread.

---

## 4. The most important product invariant: one account can have many learners

This is the load-bearing product truth behind the entire capacity story.

An account can contain several learners. A parent logging in with Google may have four children under one account. Each learner must remain independently visible, selectable, writable where authorised, and correctly hydrated.

The correct bootstrap balance is:

- selected learner gets first-paint data;
- every writable sibling learner must be present;
- compact subject/game state for writable siblings must be present;
- heavy histories such as `practice_sessions` and `event_log` stay selected-learner-bounded or lazy-loaded;
- viewer/read-only learners must not become writable;
- switching learner must not show zero stats or stale previous-child state;
- sibling writes must invalidate `notModified` probes correctly.

The product lesson from the earlier regression is simple:

> Do not make the system cheaper by deleting children from the account envelope.

The right optimisation is not “load one child only”. It is “load all learner identity and compact learner state, but keep expensive history bounded”.

Any future capacity work that touches `/api/bootstrap`, account membership, selected learner resolution, subject state, read models, or `notModified` must treat the multi-learner contract as a release blocker.

---

## 5. Capacity philosophy

The platform should not rely on a more expensive Cloudflare tier to hide waste. Paid infrastructure may become necessary later, but scaling the current design still matters. A wasteful Worker/D1 architecture will remain expensive and fragile even after an upgrade.

The capacity philosophy is:

1. **Bound first-paint data.** Bootstrap must carry enough to render and select the correct learner, not every historical row.
2. **Lazy-load heavy history.** Practice history, event logs, adult analytics, and debug bundles must be paginated or diagnostic.
3. **Use read models.** Parent/Admin summaries and subject dashboards should not recompute full histories on hot routes.
4. **Keep command projection bounded.** Subject command response should avoid full `event_log` scans.
5. **Instrument, then claim.** Query count, rows read, rows written, wall time, payload bytes, status codes, capacity signals, and request IDs must be captured before any tier claim.
6. **Separate certification from diagnostics.** A run can be useful but non-certifying.
7. **Fail closed.** Missing metadata, stale summary, dirty provenance, diagnostic source, wrong origin, wrong config, or shape mismatch must not render as certification.
8. **Do not relax thresholds under pressure.** Threshold policy changes need an owner-reviewed record.

### What counts as certification

A certification claim needs positive proof:

- production origin is exact and expected;
- threshold config path is pinned;
- threshold config hash matches;
- evidence schema is current enough;
- the run shape matches the tier;
- evidence is not dry-run, local-only, preview-only, shared-auth, or preflight unless explicitly approved for that lane;
- thresholds pass;
- the evidence row is present and verified in the capacity runbook;
- provenance is clean enough for the tier;
- Admin evidence summary marks it `certifying: true`.

Anything else is smoke, diagnostic, or provisional.

---

## 6. Evidence lanes

The system now needs a clear vocabulary for evidence. These lanes should be used consistently in docs, Admin, runbooks, and PR descriptions.

| Lane | Purpose | Can certify classroom tier? |
| --- | --- | --- |
| Smoke | Quick structural or post-deploy checks | No |
| Capacity certification | Full production load run with pinned config and strict shape | Yes |
| Capacity preflight | Exploratory runs, manifest runs, reduced shape, next-scale probes | No |
| Security posture | CSP, HSTS, headers, redaction, bundle audit | No |
| Dense-history | High-history learner latency checks | No, but important context |
| Admin evidence | Operator visibility over evidence and failures | No by itself |
| Diagnostics | Request samples, top-tail request IDs, D1 timing correlation | No |

The product UI and Admin UI should never display a diagnostic as a certification.

---

## 7. Phase validation ledger, P1–P6

This section records what each hardening phase can honestly claim and what remains open.

### P1 — Foundation hardening

P1 shipped the first major hardening foundation:

- capacity threshold flags and release-gate defaults;
- Worker capacity telemetry;
- Playwright adoption;
- security header wrapper;
- CSP Report-Only endpoint;
- cache split and production audit;
- HTTP chaos suite;
- multi-tab bootstrap validation;
- dense-history Spelling smoke;
- redaction access matrix and session leak fix.

Honest reading:

- P1 materially improved stability, privacy, and test coverage.
- P1 did not certify classroom capacity.
- CSP enforcement and HSTS preload were explicitly deferred.
- Some evidence and smoke rows still required operator runs later.
- The report is generally honest because it names residuals and overclaim risks.

### P2 — UX, accessibility, CSP inventory, and CI hardening

P2 added:

- double-submit protection;
- rehydrate sanitisation;
- calm auth/demo error states;
- TTS status and watchdog;
- shared Empty/Loading/Error primitives;
- visual baselines;
- Grammar/Punctuation keyboard flows;
- CSP inline style inventory and partial migration;
- HSTS preload audit artefact;
- adult-surface code splitting;
- Playwright CI workflows;
- error-copy oracle.

Honest reading:

- P2 improved production usability and reduced public bundle pressure.
- It did not finish CSP enforcement.
- It did not finish HSTS preload.
- It did not clear all inline styles.
- It did not certify classroom scale.
- It created a lot of useful gates, but several remained operationally deferred.

### P3 — Stability, capacity evidence, and multi-learner correctness

P3 converged CPU optimisation and system hardening into one release-quality stream.

It added:

- 4-learner bootstrap regression matrix;
- first dated 30-learner evidence row;
- query budget tests;
- dense-history full command loop;
- circuit breaker follow-ups;
- initial repository module split;
- CSP observation start and chunk-load retry.

Honest reading:

- P3 correctly identified multi-learner correctness as a capacity blocker.
- The 30-learner run passed its then-current thresholds but remained `small-pilot-provisional` because the evidence schema did not yet carry the required capacity metadata.
- The line “the run itself does not need repeating” should now be treated as stale. Later schema-v2 runs failed the bootstrap P95 threshold, so that earlier v1 run cannot be used to certify 30 learners.
- P3 should be remembered as the phase that locked the contract, not the phase that certified the classroom.

### P4 — Production certification and post-P3 revalidation

P4 delivered:

- evidence schema v2;
- real `requireBootstrapCapacity`;
- post-P3 route budgets;
- Star View projection bounding;
- CSP enforcement decision gate;
- HSTS preload sign-off path;
- inline style ratchet;
- breaker reset and learner-fetch recovery;
- evidence provenance;
- local capacity harness unblocking;
- row-transform extraction;
- 30-learner cert attempt;
- 60-learner preflight attempt.

Honest reading:

- P4 successfully made the certification system more serious.
- It did not certify 30 learners. The v2 run failed bootstrap P95.
- It did not certify 60 learners. The preflight was blocked by single-IP demo session rate limiting.
- Its cold-D1-statement-cache hypothesis was plausible at the time but not settled.

### P5 — Certification closure and drift containment

P5 delivered:

- capacity language lock;
- post-P4 drift audit;
- session-manifest mode;
- failureClass taxonomy;
- second strict 30-learner attempt;
- 60-learner manifest preparation status;
- CSP cross-assertion guard;
- HSTS deferral update;
- Admin residual triage.

Honest reading:

- P5 did not certify 30 learners. It confirmed the P95 failure persisted.
- P5 did not measure 60-learner app load. It moved the blocker to manifest preparation.
- P5’s phrase “root cause is D1 tail latency variance” should be softened to “evidence points towards D1/platform tail variance”. P6 correctly notes that Worker-log correlation is still needed before treating that as proven.
- P5 was still successful as an honesty phase: it refused to relax thresholds.

### P6 — Evidence truth, diagnostics, and operations handover

P6 delivered:

- schema-3 multi-source evidence summary;
- fail-closed Admin Production Evidence;
- certification eligibility rules;
- verified-capacity-table gating;
- evidence freshness based on underlying run time, not summary generation time;
- richer capacity diagnostics and top-tail request samples;
- safer session-manifest preparation;
- 60-learner manifest preflight that reached application load;
- debug-bundle capacity accounting;
- dated CSP/HSTS deferrals;
- updated capacity-tail diagnostic runbook.

Honest reading:

- P6 did not certify 30 learners.
- P6 did not certify 60 learners.
- P6 did close several false-pass routes.
- P6 improved the evidence system more than it improved raw capacity.
- P6 is complete as a hardening and handover phase, not as a capacity promotion.

---

## 8. Product architecture surfaces

### Learner-facing surfaces

The learner should not experience hardening directly. The result should feel like:

- the app loads reliably;
- the correct learner appears;
- switching children works;
- subject progress is preserved;
- failed refresh or degraded history is explained calmly;
- learning practice remains the priority;
- rewards and game surfaces react to learning evidence, not to system hacks.

### Parent-facing surfaces

Parent and family surfaces should:

- show the right learners under the account;
- preserve read-only versus writable distinction;
- paginate recent history;
- avoid overfetching full event logs;
- show stale/empty/error states explicitly;
- never expose raw answer or server-only fields;
- remain unaffected by Admin-heavy queries.

### Admin and Operations surfaces

Admin is a truth surface, not a marketing surface.

It should show:

- capacity posture;
- failed and stale evidence;
- CSP/HSTS status;
- D1 migration/build context;
- debug bundle and error/denial evidence;
- freshness and failure states;
- risky action confirmation;
- safe copied bundles;
- role-gated access.

It must not show:

- failed evidence as certified;
- diagnostic evidence as certified;
- stale evidence as fresh just because the summary regenerated;
- ops-only or admin-only data to parent/demo users;
- raw cookies, session hashes, request bodies, prompt answers, validators, or source logic.

### Operator surfaces

The operator needs runbooks more than dashboards when the system is under load. Good operator documentation answers:

- What command do I run?
- What evidence file does it produce?
- What threshold failed?
- Is this evidence certifying or diagnostic?
- What exact launch wording is allowed?
- Which route is slow?
- Which request IDs should be tailed in Worker logs?
- Is a security gate blocked by engineering or by operator sign-off?

P6 moves the system closer to that standard.

---

## 9. Security and privacy posture

### What is already strong

- A single security header source of truth exists.
- HSTS ships with a long max-age and includeSubDomains.
- CSP exists in Report-Only mode with a report endpoint.
- CSP report body size, shape, sanitisation, and rate-limit handling are bounded.
- Public source lockdown denies `/src/*`, `/shared/*`, `/worker/*`, `/tests/*`, `/docs/*`, `/legacy/*`, except the narrowly allowed built bundle path.
- Production bundle audits scan client chunks.
- Cache policy splits stable entry bundles from immutable hashed chunks.
- Redaction/access matrix tests exist.
- Admin safe-copy and destructive confirmation work exist.
- TTS and error surfaces have bounded failure behaviour.
- Session hash leaks were fixed early.

### What remains intentionally open

- CSP is not enforced yet.
- Inline style debt still requires a longer migration path.
- HSTS preload remains blocked by operator DNS audit and sign-off.
- Some Admin endpoint budget coverage remains partial.
- Debug bundle capacity accounting was improved, but Admin route budgets are not uniformly complete.
- CSP daily log and operator sign-off still decide enforcement.
- HSTS preload cannot be treated as an engineering-only change.

---

## 10. How the product should talk about capacity

Allowed wording while current evidence stays unchanged:

> “Small-pilot-provisional. The platform has bounded bootstrap, capacity telemetry, multi-learner regression locks, and fail-closed evidence tooling. It is not yet certified for 30 simultaneous active learners because the strict bootstrap P95 gate has not passed.”

Allowed technical wording:

> “Median bootstrap and command performance are healthy in the latest evidence, with zero 5xx and zero capacity signals. The blocker is the tail of `/api/bootstrap` under burst load.”

Not allowed:

- “30 learners supported.”
- “Classroom ready.”
- “60 learners ready.”
- “School ready.”
- “The failure is definitely only Cloudflare/D1.”
- “Just use manifest evidence as certification.”
- “Raise the P95 ceiling because everything else is green.”

---

## 11. What to do in a future session

The next session should not start by inventing a P7. It should start by reading this pair of architecture files, the P6 report, the capacity runbook, and the tail-latency diagnostic note.

The right next unit is narrow and evidence-led:

1. collect strict 30 diagnostic evidence;
2. correlate bootstrap top-tail request IDs with Worker logs;
3. decide whether the tail is D1/platform, bootstrap query fan-out, cold-start, demo-session setup, or measurement shape;
4. only then implement a code mitigation or a policy decision;
5. preserve current fail-closed evidence semantics.

If a broader product phase starts elsewhere, every product PR should inherit these release gates rather than waiting for another hardening sprint to clean up afterwards.

---

## 12. Red-line rules for future agents

Never do these without a signed plan:

- collapse multi-learner account state into a single selected child;
- remove sibling compact state from bootstrap;
- load full history into bootstrap;
- bypass subject command routes for production writes;
- let browser-side code own production scoring or persistence;
- relax capacity thresholds in the same PR as a code mitigation;
- certify from preflight evidence;
- certify from dirty, stale, local, preview, shared-auth, or manifest evidence without explicit equivalence policy;
- treat `generatedAt` as evidence freshness;
- flip CSP enforcement without the observation record;
- enable HSTS preload without DNS sign-off;
- expose raw debug bundles or request bodies to unsafe audiences;
- ship source files or generated-answer logic publicly;
- use game/reward state as the authority for learning state.

---

## 13. Product acceptance criteria for any future hardening work

A future hardening change is acceptable only if it can answer all of these:

1. Does it preserve the 4-learner account contract?
2. Does it keep learner writes Worker-authoritative?
3. Does it avoid widening public source or answer leakage?
4. Does it keep bootstrap selected-learner-bounded and sibling-state-correct?
5. Does it preserve or improve query and payload budgets?
6. Does it generate evidence that is clearly classed as certification, preflight, smoke, or diagnostic?
7. Does Admin show the evidence truthfully?
8. Does it keep CSP/HSTS gate semantics honest?
9. Does it avoid claiming a higher capacity tier unless the capacity table verifies it?
10. Does it leave a better runbook for the next operator?

---

## 14. References reviewed

Core hardening reports and runbooks:

- `docs/plans/james/sys-hardening/sys-hardening-p1-completion-report.md`
- `docs/plans/james/sys-hardening/sys-hardening-p2-completion-report.md`
- `docs/plans/james/sys-hardening/sys-hardening-p3-completion-report.md`
- `docs/plans/james/sys-hardening/sys-hardening-p4-completion-report.md`
- `docs/plans/james/sys-hardening/sys-hardening-p5-baseline.md`
- `docs/plans/james/sys-hardening/sys-hardening-p5-completion-report.md`
- `docs/plans/james/sys-hardening/sys-hardening-p6-baseline.md`
- `docs/plans/james/sys-hardening/sys-hardening-p6-completion-report.md`
- `docs/operations/capacity.md`
- `docs/operations/capacity-tail-latency.md`
- `docs/hardening/csp-enforcement-decision.md`
- `docs/hardening/hsts-preload-audit.md`

Engineering source references:

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
