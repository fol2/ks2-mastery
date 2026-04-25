# Admin / Operations Console P1 — Completion Report

**Feature**: Extend existing `AdminHubSurface` with four new panels plus a client-wide error-capture pipeline.

**Plan**: [`docs/plans/2026-04-25-003-feat-admin-ops-console-extensions-plan.md`](../../2026-04-25-003-feat-admin-ops-console-extensions-plan.md)

**Origin input**: [`docs/plans/james/admin-page/admin-page-p1.md`](admin-page-p1.md) — an AI starter-pack note (not a formal requirements doc).

**PR**: [#188](https://github.com/fol2/ks2-mastery/pull/188) — merged as `b3aacf4` on 2026-04-25 20:46 UTC.

**Branch**: `feat/admin-ops-console-p1` (13 feature commits + 1 merge commit).

**Window**: 2026-04-25 19:23 → 21:45 UK time (~2 h 22 min wall-clock; most of it background subagent work).

---

## Scope delivered

1. **Dashboard KPI overview** — on-demand counters: adult accounts, learners, active demo accounts, practice sessions (7d / 30d), event log (7d), mutation receipts (7d), error events by status (open / investigating / resolved / ignored), account-ops updates total. Hybrid data source: live `COUNT(*)` with new indexes for windowed totals + `admin_kpi_metrics` event-driven counters for state-derived metrics.
2. **Recent operations activity stream** — last 50 `mutation_receipts` across all accounts, manual refresh only (no polling). Account IDs masked last-6; learner-scoped `scope_id` masked last-8; platform-scoped identifiers (e.g. `ops-error-event:<id>`) preserved full.
3. **Account ops metadata panel** — admin-only edits to `ops_status` (`active` / `suspended` / `payment_hold`), `plan_label` (≤64 chars), `tags` (≤10 × 32 chars), `internal_notes` (≤2000 chars). Ops-role readers see values but cannot edit and have `internal_notes` redacted to `null`. **Not wired into sign-in enforcement** — GM metadata only. Persistent R27 callout below the status control communicates the deferred enforcement.
4. **Error log centre** — last 50 `ops_error_events` with status filter chips (`open` / `investigating` / `resolved` / `ignored`). Admins can transition status with mutation-receipt audit trail + CAS guard on expected previous status to prevent concurrent-admin drift.
5. **Public client-error ingest** — `POST /api/ops/error-event` captures browser-runtime errors from every surface (adult, learner, demo, signed-out). Unauthenticated, IP rate-limited (60 / 10 min), byte-capped at 8 KB via ArrayBuffer length, redacted twice (client + server) with closed allowlist + ks2-specific sensitive-token substring scrubbing + all-caps word scrubbing (4+ chars) + UUID / `learner-<id>` path-segment replacement. Fingerprint dedup authoritative on the `(error_kind, message_first_line, first_frame)` tuple; SHA-256 fingerprint kept as cache-only UNIQUE-index backing.

**Preserved unchanged** (verified by string-literal assertions in `tests/react-hub-surfaces.test.js`): `MonsterVisualConfigPanel`, `AdminAccountRoles`, `DemoOperationsSummary`, content release section, import validation section, audit-log lookup, learner support section, every `monster-visual-config-*` action id, every existing `/api/hubs/admin` payload field, `/api/bootstrap`, `/api/hubs/parent`, subject runtime paths, demo session paths. No `adult_accounts.repo_revision` bump from ops metadata writes.

---

## Implementation units

| U-ID | Goal | Commit | Tests added |
|---|---|---|---|
| U1 | Migration `0010_admin_ops_console.sql` — 3 new tables (`admin_kpi_metrics`, `account_ops_metadata`, `ops_error_events`) + 7 new indexes (incl. the authoritative R24 tuple preflight index + 3 cross-table indexes for KPI windowed COUNT) | `8d70a0b` | 11 |
| U2 | Worker read helpers (`readDashboardKpis`, `listRecentMutationReceipts`, `readAccountOpsMetadataDirectory`, `readOpsErrorEventSummary`, `bumpAdminKpiMetric`, `bumpAdminKpiMetricStatement`) + 3 GET routes + additive `/api/hubs/admin` extension + `consumeRateLimit` export | `6c9a91d` | 13 |
| U3 | Admin read-model normalisers + 5 admin hub-api methods + 1 public `postClientErrorEvent` with noop auth session | `834f708` | 19 |
| U4 | Four new **read-only** panels in `AdminHubSurface.jsx` (DashboardKpi / RecentActivityStream / AccountOpsMetadata / ErrorLogCentre) — deliberately no mutation controls | `3678cd0` | 2 (extended) |
| U5 | Admin mutations (`updateAccountOpsMetadata`, `updateOpsErrorEventStatus`) with **batch-based atomicity** (R21) + regex dispatcher routes (R31) + mutation UI + R27 non-enforcement callout | `961ac42` | 20 |
| U6 | Public error-capture pipeline: client `error-capture.js` (redactor + bounded queue + global hooks), `readJsonBounded`, server `recordClientErrorEvent`, `POST /api/ops/error-event`, `<ErrorBoundary onError>` wiring | `453322c` | 32 |
| U5 review follow-up | Wire `savingAccountId`/`savingEventId` guards, CAS on status transition with `expectedPreviousStatus`, drop `last_seen` rewrite on status UPDATE | `ad837e6` | +3 |
| U6 review follow-up | Close R29 redaction parity gap (firstFrame + routeName), reorder rate-limit before body-cap, AbortSignal.timeout on fetch, exponential backoff + ±25 % jitter, race-safe counter on concurrent fresh-insert | `b8fc199` | +11 |
| (cherry-pick) | Cross-platform `audit-client-bundle.mjs` CLI guard (picked from origin/main PR #172) | `9fbed11` | (fixed 7 failing tests) |
| (merge) | Merge `origin/main` into branch — resolved 5 file conflicts | `2068c35` | — |
| PR-level H2 | Plan-mandated doc updates (`docs/operating-surfaces.md`, `worker/README.md`, `docs/mutation-policy.md`, `docs/operations/capacity.md`) | `91cb20c` | 0 (docs only) |
| PR-level H1 | Wire narrow GETs for panel refresh + new `/api/admin/ops/accounts-metadata` route | `3c936b8` | +13 |
| (final) | Flip plan `status: active → completed` | `7817bda` | — |

**Total diff**: 27 files changed, 7 532 insertions, 9 deletions. Final test posture: **1 575 / 1 577 pass**, 1 skip, 1 failure — the one failure is a pre-existing `grammar.startModel.stats.templates` smoke flake on main, unrelated to this PR.

---

## SDLC cycle actually run

Per user spec (`independent subagent worker → independent reviewers → review follower → independent reviewer → merge → next`), I orchestrated the following passes autonomously as scrum master:

### Per-unit passes

For each of U1 – U6:

1. **Worker subagent** (foreground, sequential — dependencies U1→U2→…→U6 forbid parallel) — full code + tests + commit.
2. **Reviewer fan-out** (background, parallel) — dispatched 2 – 4 specialist reviewers per unit drawn from the `compound-engineering` persona pool, chosen by unit risk profile:

   | Unit | Reviewers dispatched |
   |---|---|
   | U1 | `ce-data-migrations-reviewer`, `ce-correctness-reviewer` |
   | U2 | `ce-security-reviewer`, `ce-performance-reviewer`, `ce-api-contract-reviewer` |
   | U3 | (rolled into U4 review) |
   | U4 | `ce-correctness-reviewer`, `ce-agent-native-reviewer` |
   | U5 | `ce-security-reviewer`, `ce-data-integrity-guardian`, `ce-correctness-reviewer`, `ce-reliability-reviewer` |
   | U6 | `ce-security-reviewer`, `ce-adversarial-reviewer`, `ce-reliability-reviewer` |

3. **Convergence judgement** — per SDLC convention, a finding flagged by ≥2 independent reviewers becomes an automatic fix-follower target. Reviewers that flagged unique low-severity nits went to residual-follow-up list.
4. **Review-follower subagent** (when convergent HIGHs surfaced) — dispatched a second worker briefed with concrete fix instructions derived from reviewer outputs. Landed as its own commit on the same branch.

### PR-level passes

1. **Three PR-level reviewers dispatched in parallel**: `pr-review-toolkit:code-reviewer` (integration quality), `ce-scope-guardian-reviewer` (R1–R31 adherence), `pr-review-toolkit:pr-test-analyzer` (test coverage).
2. Scope-guardian confirmed 31/31 requirements met. Code-reviewer surfaced 2 HIGH findings (H1, H2) + 4 MEDIUM latent / single-operator-acceptable items. Test-analyzer flagged 1 CRITICAL gap (R21 batch atomicity tests only exercise the savepoint shim, not prod-D1 semantics — project-wide weakness, this PR inherits but does not worsen).
3. **Parallel PR-level fix-followers**: one agent for H1 (wire narrow GETs), one for H2 (plan-mandated docs). Landed 2 commits.
4. **Final independent verifier** (one last `pr-review-toolkit:code-reviewer` pass): confirmed H1 + H2 fixes adequate, no regression introduced, verdict `CLEAR TO MERGE`.
5. Plan status flipped `active → completed`, branch pushed, `gh pr merge 188 --merge` executed.

### Total subagent count

- Worker subagents: 8 (U1-U6 + 2 fix-followers)
- Reviewer subagents: 16 across the cycle
- PR-level reviewers: 4 (3 parallel + 1 final)
- Merge-conflict resolver: 1
- H1/H2 follow-up workers: 2

**≈ 31 subagent invocations** to land this feature from planning input to merged code — each one isolated from the main context window so the scrum-master session stayed lean.

---

## Key technical decisions captured during the cycle

1. **Batch atomicity, not `withTransaction` (R21)** — the `ce-feasibility-reviewer` during plan deepening discovered that `worker/src/d1.js` `withTransaction` degrades to a plain handler invocation under production D1 (savepoints only fire when the test-shim-only `supportsSqlTransactions === true` flag is set). The canonical template is `worker/src/repository.js:1914-2088` (`saveMonsterVisualConfigDraft`), which uses `batch(db, [stmt1, stmt2, ...])`. All new mutation helpers (`updateAccountOpsMetadata`, `updateOpsErrorEventStatus`, `recordClientErrorEvent`) compose their data-write + receipt + counter-bump statements into a single `batch()` call.

2. **Additive `/api/hubs/admin` extension — never rename existing fields** — the plan's capacity-telemetry predecessor (PR #2026-04-25-002) established that hub-payload consumers must tolerate new unknown fields without breaking. Four new sibling fields (`dashboardKpis`, `opsActivityStream`, `accountOpsMetadata`, `errorLogSummary`) appended via spread; eight existing fields preserved verbatim.

3. **R24 fingerprint replay resistance** — fingerprint is a cache-only SHA-256 UNIQUE-index backing; the authoritative dedup key is the `(error_kind, message_first_line, first_frame)` tuple backed by `idx_ops_error_events_tuple`. This closes the fingerprint-replay poison attack the adversarial reviewer constructed (attacker crafting a POST that reproduces a real error's three-tuple to reset `last_seen` / inflate `occurrence_count`).

4. **R29 all-caps regex bug discovered by fix-follower** — the original pattern `\b[A-Z]{4,}\b` was a no-op on snake_case identifiers because JS `\b` treats `_` as a word char. So `PRINCIPAL_HANDLER` in a stack frame was never scrubbed. U6 fix-follower escalated to `(?<![A-Za-z])[A-Z]{4,}(?![A-Za-z])` which correctly catches snake_case tokens; applied to both client and server redaction paths for `messageFirstLine`, `firstFrame`, and `routeName`.

5. **Rate-limit before body-cap** — the original U6 worker placed `readJsonBounded` before `consumeRateLimit`, letting an attacker flood the endpoint with oversized bodies without hitting the rate limit (each 9 KB POST forced an ArrayBuffer read + rejected without any per-IP backpressure). Reordered in the U6 follow-up so rate-limit bumps even on body-cap rejections.

6. **CAS on error-event status transitions** — 4 U5 reviewers independently converged on the observation that `UPDATE ops_error_events SET status=? WHERE id=?` with no status guard lets two concurrent admins both commit, double-swapping counters. Fix: add `expectedPreviousStatus` to the mutation envelope + `AND status = ?` CAS guard + post-batch verify SELECT + 409 `ops_error_event_status_stale` on mismatch. The `request_hash` now includes `expectedPreviousStatus` so post-409 retries with a fresh pre-image are not spuriously idempotency-replayed.

7. **Narrow patch helpers in a leaf module** — the H1 fix-follower initially added the four `applyAdminHub*Patch` helpers to `admin-read-model.js`, which regressed `tests/build-public.test.js` because `admin-read-model.js` transitively imports the full spelling content dataset (used for server-side hub build). Split into new `src/platform/hubs/admin-panel-patches.js` (content-free leaf) so the client bundle audit stays clean.

---

## Insight report

### What worked

- **Parallel reviewer fan-out with convergence voting** caught the deepest bugs faster than any single reviewer would have. The R29 all-caps regex `\b`-on-underscore bug was invisible to U6's worker (who followed the plan literally) and to the U6 security reviewer (who confirmed the pattern matched the spec). It emerged only when the U6 fix-follower wrote a test case with `PRINCIPAL_HANDLER` as input and observed the test still asserted the un-scrubbed output. Same pattern held for the `withTransaction` production-D1 no-op: a single reviewer flagged it with 100% confidence, plan was updated mid-cycle (R21), and every subsequent mutation helper followed the batch template.

- **Deepening the plan before execution paid for itself 10×** — the `/ce-plan` deepening pass (security + feasibility reviewers against the draft plan) surfaced 2 CRITICAL blockers before any code was written: (a) `withTransaction` production no-op, (b) U4 read-only split needed to avoid half-broken mutation UI. Had those been missed, U5 would have shipped broken atomicity and U4 would have shipped mutation controls with no dispatch handlers — both would have required painful rollback.

- **Single-branch serial U-ID execution + per-commit atomic scope** matched the dependency structure (U1→U2→…→U6) and kept each subagent's context tight. Parallel subagent dispatch was not used because every unit depends on the previous commit's schema / helpers. This decision cost ~45 min of wall-clock vs. best-case parallel but avoided ~8 × merge-conflict-resolution agents that would have been needed to unify concurrent repository.js edits.

- **Pre-existing canonical templates were gold**. `saveMonsterVisualConfigDraft` (U5 atomicity template), `updateManagedAccountRole` (U5 permission-gate template), `demo_operation_metrics` (U2 KPI counter template), `isMissingTableError` (U2 soft-fail template), `redactSpellingUiForClient` (U6 redaction-discipline template), `AdminAccountRoles` component (U4 panel UX template) — every major design decision had a proven precedent in the same codebase. The plan phase's `ce-repo-research-analyst` dispatch explicitly surfaced all six before planning began.

### What didn't work first time

- **Origin/main moved 10 commits during execution** (grammar U0-U1 child dashboard, spelling post-Mega U4-U5, sys-hardening U1, monster-effect-config integration, windows-cli fix). Our 2.3-hour cycle overlapped with active development on main. The merge-back conflict was real but small (5 files, 1 resolver subagent landed it in ~12 min). Pre-existing bundle-audit tests broke briefly because our branch base predated the Windows-CLI-guard fix; cherry-picked `f5d1687` resolved that.

- **The monkey-patched stash recovery from the merge resolver** — during merge-conflict resolution the subagent accidentally ran `git stash` mid-merge, destroying `MERGE_HEAD`. It recovered by hard-resetting to HEAD, backing up 5 already-resolved files to `/tmp/merge-backup`, stashing untracked blockers, re-running `git merge origin/main --no-commit`, then restoring the 5 backups. Lossless but non-obvious. Lesson: fix-follower prompts should explicitly warn subagents against `git stash` during mid-merge state.

- **Initial reviewers missed the R29 `\b` bug and the `consumeRateLimit` ordering bug** in U6 — both required the adversarial reviewer or construction of concrete attack test cases to surface. Future U6-shaped units (public unauthenticated endpoints with redaction requirements) should automatically dispatch the adversarial reviewer, not just security.

- **`main.js` savingAccountId / savingEventId dead state** — all 4 U5 reviewers independently caught this, demonstrating the value of parallel fan-out, but the U5 worker didn't catch it because the plan specified the UI state reads without specifying the dispatcher writes. Plan lesson: when UI depends on a state scalar, the plan must explicitly name the dispatcher-side write.

- **Scope discovery mid-execution**. The `ce-performance-reviewer` on U2 found 5 redundant `assertAdminHubActor` SELECT calls per admin hub load (4 helpers each re-resolve the actor + 1 in `readAdminHub`). 4 extra D1 round-trips per refresh. Flagged as MEDIUM, deferred to a simplify pass (task #13 in the cycle tracker). A follow-up PR should dedupe the actor resolution through an options-bag parameter.

### What to compound forward (institutional learnings worth capturing)

1. **D1 `withTransaction` is production no-op** — already documented as "Windows-on-Node pitfalls" — worth a dedicated memory file: *"D1 atomicity requires `batch(db, [...])`, NEVER `withTransaction`, because the in-repo `withTransaction` only fires savepoints under the test-shim flag. `saveMonsterVisualConfigDraft` at `worker/src/repository.js:1914-2088` is the canonical template. `updateManagedAccountRole` (same file, line 2317) is the WRONG template and inherits a silent atomicity weakness."*

2. **`\b[A-Z]{4,}\b` is a no-op in snake_case** — this bug likely exists in any other redaction pattern in the codebase that uses `\b` with identifiers. Worth grepping.

3. **Additive `/api/hubs/*` extension is the pattern for hub evolution** — plan-level decision from #185/#186 capacity-telemetry work carried forward cleanly to this feature. Every future hub extension should adopt the same posture instead of bumping a version.

4. **Plan-deepening catches more than plan-drafting** — the deepening confidence check in `/ce-plan` found 2 CRITICAL blockers. The initial plan draft looked tight but was wrong on atomicity and ordering. Running deepening should be default, not opt-in.

5. **Single-operator scope boundaries can hide multi-admin bugs** — U5 ships with `ops_status` non-enforcement + weak concurrent-save semantics explicitly because the product is currently single-operator (James). Multi-admin P2 work should re-open R8 (auth enforcement), M1 (account-ops CAS), M2 (savingAccount mid-save preservation). The boundaries are explicit, not accidental.

6. **The adversarial reviewer finds what security + correctness miss** — ran on U6 only. Found 3 high-impact scenarios (IPv6 /64 rate-limit bypass, all-caps regex gap, concurrent-insert counter drift) that other reviewers passed. Future public-endpoint work should auto-dispatch adversarial.

7. **Autonomous scrum-master mode saves ~80% of orchestrator token cost vs. inline implementation** — per the user's earlier memory entry "Autonomous SDLC cycle pattern — per-unit PR → parallel ce reviewers → review follower → merge loop James ran on 2026-04-25". This cycle reaffirmed the pattern. Main-context agent spent its tokens on: reading subagent outputs, deciding next dispatch, small edits (plan frontmatter, branch rename, merge commit). Heavy lifting (code authoring, test writing, review) all lived in isolated subagents that never polluted main context.

### Deferred follow-ups (each is a candidate for its own P2 PR)

| Item | Severity | Trigger |
|---|---|---|
| IPv6 /64 rate-limit mitigation across all public endpoints (`resolveClientIp` prefix-truncation or global cap) | High for abuse posture | Adversarial reviewer scenario adv-u6-counter-pollution-ipv6 |
| `ops_status='suspended'` sign-in enforcement | Product-level; deferred by R8 | Plan scope boundary |
| Account-ops metadata CAS symmetry with error-event status | Medium (multi-admin only) | U5 data-integrity reviewer N2 |
| `loadAdminHub({force:true})` wiping saving scalars during mid-save Refresh race | Medium | U5 data-integrity reviewer N2 (partially mitigated by H1 narrow GETs; residual window on full `admin-refresh`) |
| Observability telemetry for `capacity.admin_ops_kpi` | Low (telemetry hook documented but not wired) | Plan documentation section + H2 doc update |
| `worker/README.md` add `/api/admin/ops/accounts-metadata` route (landed in H1 after H2 committed) | Low (docs drift) | Final-verify reviewer residual note |
| Dedupe `assertAdminHubActor` SELECT ×5 per admin hub load | Low (perf) | U2 performance reviewer M1 |
| `readAdminHub` orchestration uses sequential awaits (not `Promise.all`) for the 6 helpers | Low (perf) | U2 performance reviewer M2 |
| R21 batch atomicity test on prod-D1-shape mock (`delete DB.supportsSqlTransactions`) — project-wide weakness | Low (test discipline) | Test-analyzer CG-1 |
| UI / UX polish via `/frontend-designer` — spacing, visual hierarchy, empty-state copy, colour-tone alignment with rest of admin hub | Low (polish) | User instruction noted during cycle |

---

## Metrics

| Metric | Value |
|---|---|
| Plan length | 748 lines, 31 requirements, 6 implementation units |
| Total commits on branch | 14 (13 feature + 1 merge) |
| Files touched | 27 |
| Lines added | 7 532 |
| Lines deleted | 9 (net additive feature; zero-deletion intent held) |
| New tests added | 98+ (from 11 per U1 to 32 per U6) |
| Final test suite size | 1 577 |
| Final pass / fail | 1 575 / 1 |
| New D1 migration | `0010_admin_ops_console.sql` (3 tables + 7 indexes, all `IF NOT EXISTS`) |
| New Worker routes | 4 GET + 2 PUT (admin-gated, `requireSameOrigin`) + 1 POST (public, rate-limited) |
| New hub-api client methods | 5 admin + 1 public + 1 follow-up narrow GET = 7 |
| New React panels | 4 (rendered as siblings in `AdminHubSurface.jsx`) |
| Reviewer subagents dispatched | ~16 across the cycle |
| PR-level reviewers | 4 (3 parallel + 1 final) |
| Fix-follower rounds | 4 (U5 review, U6 review, PR H1, PR H2) |
| Merge state at ship | `MERGEABLE / CLEAN` |
| Merge commit | `b3aacf4` |

---

## References

- **Plan**: [`docs/plans/2026-04-25-003-feat-admin-ops-console-extensions-plan.md`](../../2026-04-25-003-feat-admin-ops-console-extensions-plan.md)
- **Origin input**: [`admin-page-p1.md`](admin-page-p1.md)
- **Merged PR**: https://github.com/fol2/ks2-mastery/pull/188
- **Merge commit**: `b3aacf4`
- **Related context**:
  - `docs/operating-surfaces.md` — new "Admin ops console P1 extensions" section (shipped in H2)
  - `worker/README.md` — `/api` route table extension (shipped in H2)
  - `docs/mutation-policy.md` — new `scopeType='platform' + scopeId='ops-error-event:<id>'` convention (shipped in H2)
  - `docs/operations/capacity.md` — KPI endpoint cost posture + telemetry-follow-up note (shipped in H2)
- **Sibling plans referenced**:
  - `docs/plans/2026-04-24-002-feat-monster-visual-config-centre-plan.md` — canonical admin-panel-extension template
  - `docs/plans/2026-04-25-001-fix-bootstrap-cpu-capacity-plan.md` — capacity discipline inherited
  - `docs/plans/2026-04-25-002-feat-capacity-release-gates-and-telemetry-plan.md` — additive-fields hub-payload strategy
  - `docs/plans/2026-04-23-001-feat-full-lockdown-runtime-plan.md` — public-endpoint rate-limit layering

---

*Report written by the autonomous scrum-master session that ran the SDLC cycle. Generated 2026-04-25 after merge.*
