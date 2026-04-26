# Sys-Hardening Phase 2 — Completion Report

**Sprint:** 2026-04-26 (single calendar day, agent-orchestrated scrum-master pattern)
**Origin brief:** [`sys-hardening-p2.md`](./sys-hardening-p2.md)
**Formal plan:** [`docs/plans/2026-04-26-001-feat-sys-hardening-p2-plan.md`](../../2026-04-26-001-feat-sys-hardening-p2-plan.md) — `status: active → completed`
**Charter:** [`docs/hardening/charter.md`](../../../hardening/charter.md)
**P2 Baseline:** [`docs/hardening/p2-baseline.md`](../../../hardening/p2-baseline.md)
**P1 Completion Report:** [`sys-hardening-p1-completion-report.md`](./sys-hardening-p1-completion-report.md)

---

## 1. What was shipped

All 13 implementation units (SH2-U0 through SH2-U12) landed on `main` via 13 squash-merged pull requests across a single calendar day. Every PR underwent full SDLC: worker subagent → 2–4 parallel ce-* reviewers → review-follower fix cycle → final re-review → merge.

| U-ID   | PR    | Merged (UTC)    | Scope | +/− | Files |
|--------|-------|-----------------|-------|-----|-------|
| SH2-U0 | #255  | 09:01 | Phase 2 baseline + plan document (scope-guard oracle) | +1 071/−0 | 3 |
| SH2-U1 | #271  | 10:28 | `useSubmitLock` hook + JSX belt-and-braces across Auth/Admin/Parent/3 subjects | +973/−69 | 13 |
| SH2-U2 | #272  | 10:41 | Phase-aware `sanitiseUiOnRehydrate` (summary/pendingCommand drop + live-setState preservation) | +1 088/−11 | 8 |
| SH2-U3 | #284  | 12:35 | DemoExpiryBanner + ForbiddenNotice + AuthTransientErrorNotice + 401 structural-parity contract | +1 695/−8 | 13 |
| SH2-U4 | #289  | 13:21 | TTS status channel + `abortPending()` + 15 s watchdog + `[ks2-tts-latency]` telemetry + 500-tts fault kind | +1 203/−6 | 12 |
| SH2-U5 | #296  | 14:59 | EmptyState / LoadingSkeleton / ErrorCard shared primitives + 6-surface re-skin + parity test | +1 342/−29 | 15 |
| SH2-U6 | #313  | 18:22 | 85 baseline PNGs across 17 surfaces × 5 viewports + target-bbox mask-coverage invariant | +1 353/−2 | 89 |
| SH2-U7 | #306  | 16:23 | Grammar + Punctuation keyboard-only accessibility-golden scenes + aria-describedby threading | +1 138/−18 | 6 |
| SH2-U8 | #327  | 20:51 | CSP inline-style inventory (282 sites → 257 post-migration) + enforcement-decision DEFER record | +865/−25 | 16 |
| SH2-U9 | #318  | 18:46 | HSTS preload audit document (operator-gated) | +142/−0 | 2 |
| SH2-U10 | #322 | 19:33 | esbuild code-split for 3 adult surfaces (−50 KB gzip) + bundle byte-budget gate + Worker allowlist prefix match + audit walk-all-chunks + clean-before-build guard | +1 033/−41 | 14 |
| SH2-U11 | #321 | 19:40 | GitHub Actions Playwright CI (4 workflows + isolated DB helper + per-project maxDiffPixelRatio override) | +933/−13 | 12 |
| SH2-U12 | #328 | 20:52 | Parser-level error-copy oracle (10 forbidden-token rules across 71 JSX files) + one-toast-per-action invariant | +1 232/−0 | 2 |

**Aggregate diff:** +14 068 additions, −222 deletions across 205 changed-file slots. Net new: ~14 000 lines. Sprint elapsed wall-time: ~12 hours (09:01 first merge → 20:52 last merge).

---

## 2. Requirements closure

All 13 plan-defined requirements (R1–R13) were closed by their mapped units:

| Req | Description | Closed by | Evidence |
|-----|------------|-----------|----------|
| R1 | Double-submit hardening (UI-layer) | SH2-U1 | `useSubmitLock` hook, 9 import sites, Playwright rapid-click scenes across 5 surfaces |
| R2 | Back-button / refresh / completion-session sanitised on rehydrate | SH2-U2 | Phase-aware `sanitiseUiOnRehydrate` + `pendingCommand` drop + F-05 live-setState preservation test |
| R3 | Demo-expired / auth-failure calm copy | SH2-U3 | DemoExpiryBanner (S-04 neutral), ForbiddenNotice (S-05 capability class), AuthTransientErrorNotice (500/network), 401 structural-parity contract |
| R4 | TTS failure / slow-audio / replay bounded | SH2-U4 | Status channel (`idle→loading→playing→failed`), 15 s watchdog, `abortPending()` + 16/16 stop/abortPending pairs in main.js |
| R5 | Empty/loading/error state parity | SH2-U5 | 3 shared primitives, 6 EmptyState + 2 ErrorCard consumers, canonical 3-part copy voice |
| R6 | Five-viewport visual regression baselines | SH2-U6 | 85 baselines (17 surfaces × 5 viewports), target-bbox mask-coverage invariant (≤ 30 %) |
| R7 | Grammar + punctuation keyboard-only flows | SH2-U7 | 2 Playwright accessibility-golden scenes, `aria-describedby` threaded into all input branches, `data-grammar-session-feedback-live` anchor |
| R8 | CSP enforcement materially closer | SH2-U8 | Inventory of 282 sites in 4 S-06 categories, 25 migrated, observation-decision DEFER record |
| R9 | HSTS preload evaluated honestly | SH2-U9 | Signed subdomain-audit artefact with operator-sign-off placeholders; `preload` NOT added |
| R10 | Client bundle hygienic | SH2-U10 | 3-surface code-split (−50 KB gzip), byte-budget 214 000, Worker prefix-match allowlist, audit walk-all-chunks + clean-before-build |
| R11 | Playwright runs in CI on every PR | SH2-U11 | 4 GitHub Actions workflows (`permissions: contents: read`), per-project tolerance override, isolated DB helper |
| R12 | Error copy humanised at the boundary | SH2-U12 | 10-rule oracle across 71 JSX files, allowlist size 2, one-toast-per-action invariant |
| R13 | Every P2 PR cites p2-baseline.md | SH2-U0 | Baseline document seeded; every subsequent PR cited a baseline row |

---

## 3. Reviewer-found blockers

The sprint's review cycle caught **25 unique blockers** (vs P1's 19 across a similar unit count). Every blocker was resolved pre-merge via review-follower subagents within the same PR.

| Unit | Blocker | Reviewer | Impact if shipped |
|------|---------|----------|-------------------|
| U0 | Codex scope drift — baseline listed Codex as adult surface but plan/U10 scope didn't include it | ce-coherence | Baseline row would remain permanently "open" |
| U1 | Playwright coverage only spelling — plan required 3 subjects + Auth + Parent Hub | ce-testing | 4 adoption sites unverified at integration level |
| U1 | `expect(delta).toBeLessThanOrEqual(1)` silently passes on delta=0 | ce-testing + ce-adversarial | Test green when hook never fires (silent-green defect) |
| U1 | ParentHub export sync handler — 1 µs lock window, 50 ms double-click slips through | ce-adversarial | Double JSON download on every double-click |
| U2 | Zombie `phase: 'summary'` on Grammar + Punctuation — sanitiser dropped `summary` but left phase intact | ce-correctness + ce-adversarial | "Start again" CTA clickable from a stale empty summary shell (exact R2 hazard) |
| U2 | `pendingCommand` stranding — crash mid-command locks Grammar/Punctuation setup "Starting…" permanently | ce-adversarial | Learner permanently stuck with no recovery path short of clearing storage |
| U2 | Branch 5 commits behind main — merge would clobber 5 other teams' PRs | ce-correctness | Destructive revert of isPostMasteryMode, Boss per-slug tests, mega-invariant CI, grammar-answer-spec audit, Punctuation U1 fix |
| U2 | Scenario 1 fixture used `phase: 'dashboard'` not plan-mandated `phase: 'summary'` | ce-correctness + ce-adversarial | R2 hazard untested; contract test exercised wrong path |
| U2 | Punctuation inline drop drift — hand-inlines SESSION_EPHEMERAL_FIELDS instead of importing | ce-adversarial | Future field additions silently skipped for Punctuation |
| U3 | Input preservation test is grep, not behaviour | ce-testing | Typed value survival unverified at render level |
| U3 | Plan scenario 8 (403 friendly card) zero coverage | ce-testing | Raw 403 leak untested |
| U3 | Plan scenario 11 (500 → human banner) zero coverage | ce-testing | Bootstrap 500 catch branch untested |
| U3 | Playwright uses `page.route()` not plan-mandated `/demo?force_expire=1` fault injection | ce-testing | Banner exercised against synthetic contract, not production path |
| U5 | WordBank EmptyState "Play a spelling round" has no `action` CTA button | ce-design-lens | Learner reads instruction with no button to follow it |
| U5 | Grammar EmptyState title "Grammar is ready" breaks neutral voice baseline | ce-design-lens | 1 of 6 surfaces uses upbeat promotional copy vs 5 using "No X yet" neutral |
| U6 | `SH2_U6_DEFAULT_DIFF_RATIO = 0.25` hardcoded — 12.5× the plan's 0.02 | 3-reviewer consensus | 25 % pixel drift silently accepted; defeats visual-regression purpose |
| U6 | Viewport-denominator flaw — mask coverage measured against viewport, not scoped target | ce-adversarial | 100 % mask on scoped capture passes 30 % viewport check (P1 U5 silent-green re-introduced) |
| U6 | Session layouts untested at 11/15 intended baselines | ce-adversarial | Grammar/Punctuation session at tablet/desktop completely unwatched |
| U6 | Reverse-case un-falsifiable — 0.25 ratio larger than test signal magnitude | ce-adversarial | Reverse-case asserts a tautology |
| U6 | `openSubject()` strict-mode break — dual `data-action` selectors on hero CTA + subject card | ce-correctness + ce-adversarial | 10+ existing Playwright scenes silently broken |
| U10 | Production-audit regex misses minified static imports — 4 shared chunks (~123 KB) ship un-audited | ce-adversarial | Forbidden tokens in shared chunks bypass production-deploy drift scan |
| U10 | Stale hashed chunks from prior builds leak un-audited (no rm-before-build) | ce-adversarial | `AdminHubSurface-AAAA.js` from a previous build ships to production alongside `AdminHubSurface-BBBB.js` |
| U11 | `audit.yml` fails on every PR — `src/bundles/` is `.gitignore`'d, fresh checkout has no bundle | ce-correctness | Workflow red from day 1 |
| U11 | Cross-process DB registry broken — in-process Map invisible to webServer child process | ce-correctness | Isolated test scenes silently fall back to shared DB (isolation contract defeated) |
| U4 (advisory) | 13 `abortPending()` calls in controller.js are dead code in production (main.js shadow handler intercepts first) | ce-adversarial | Production route-changes rely solely on `stop()` doing fetch abort; future stop/abortPending split would silently regress |

---

## 4. Key architectural discoveries

### 4.1 React shell has no browser History API
`pushState` / `replaceState` / `popstate` — zero occurrences in `src/`. SH2-U2 correctly extended `sanitiseUiOnRehydrate()` rather than introducing routing. Back-button / Refresh on completion screens is handled by dropping `phase: 'summary'` + `pendingCommand` at the rehydrate boundary.

### 4.2 `style={}` site count was 282, not charter's "93+"
Real grep returned 282 sites across 47 files — the charter's ≥ 93 was an underestimate by 3×. SH2-U8 inventoried all 282, migrated 25 in the highest-ROI shell surfaces, and set a budget gate for future regression prevention.

### 4.3 main.js shadows the controller for route-change handlers
Production dispatch path is `main.js::handleGlobalAction` → returns `true` before `controller.dispatch` fires. SH2-U4's `abortPending()` calls in `create-app-controller.js` are exercised only in the test harness. The review-follower mirrored all 16 pairings into `main.js` to close the gap.

### 4.4 DemoExpiryBanner is unreachable in production today
The Worker's SQL filter at `auth.js:493–503` strips expired demos before any handler runs — the `/api/auth/session` endpoint returns HTTP 200 with null session, not a 401 with `code: demo_session_expired`. The banner is future-proofing + dev-stub surface. Security reviewer confirmed no oracle risk.

### 4.5 esbuild minified output breaks naive import-walking regex
`import{X as Y}from"./chunk.js"` has zero whitespace. The production-bundle-audit walker's `/import\s+/` regex matched nothing. SH2-U10 review-follower widened to `/import\s*/` and verified against real minified output.

### 4.6 Code-splitting introduces stale-chunk leak hazard
With `outdir` + `chunkNames: '[name]-[hash]'`, esbuild does NOT clean the output directory. Prior hash's file persists, gets copied to `dist/public/`, ships to production un-audited. SH2-U10 review-follower added `rm -rf` clean-before-build guard.

---

## 5. New surfaces that did not exist before the sprint

### New production modules
- `src/platform/react/use-submit-lock.js` — shared double-submit guard hook (9 consumer sites).
- `src/platform/react/use-tts-status.js` — React hook wrapping TTS status channel subscription.
- `src/platform/ui/EmptyState.jsx` / `LoadingSkeleton.jsx` / `ErrorCard.jsx` — shared UI state primitives.
- `src/surfaces/auth/DemoExpiryBanner.jsx` — expired-demo calm-copy banner with S-04 neutrality.

### New test surfaces (13 files)
- Node: `react-use-submit-lock`, `subject-rehydrate-contract`, `demo-expiry-banner`, `worker-auth-401-contract`, `tts-status-contract`, `empty-state-primitive`, `empty-state-parity`, `empty-state-consumer-integration`, `csp-inline-style-budget`, `bundle-byte-budget`, `error-copy-oracle`.
- Playwright: `double-submit-guard`, `tts-failure`, `demo-expiry`, `visual-baselines`, `grammar-accessibility-golden`, `punctuation-accessibility-golden`, `adult-surface-lazy-load`.

### New scripts + CI
- `scripts/inventory-inline-styles.mjs` — CSP inline-style inventory walker + markdown generator.
- `.github/workflows/playwright.yml` — PR-time Chromium + mobile-390 golden paths.
- `.github/workflows/playwright-nightly.yml` — full 5-viewport nightly matrix.
- `.github/workflows/node-test.yml` — `npm test` + `npm run check` on every PR.
- `.github/workflows/audit.yml` — `npm run audit:client` on every PR.
- `tests/helpers/playwright-isolated-db.js` — per-test SQLite handle for future `workers > 1` scenes.
- `.nvmrc` — pins Node 22 for local/CI parity.

### New operations/hardening docs
- `docs/hardening/p2-baseline.md` — 6-bucket signed snapshot (visual + runtime + copy & UX parity + access/privacy + test gaps + not-owned-by-P2).
- `docs/hardening/csp-inline-style-inventory.md` — 282-site inventory with 4-category S-06 classification.
- `docs/hardening/csp-enforcement-decision.md` — 7-day observation DEFER decision record.
- `docs/hardening/hsts-preload-audit.md` — subdomain enumeration with operator sign-off placeholders.
- `.github/workflows/README.md` — CI policy document (minimum permissions, no CF secrets, no baseline auto-commit).

---

## 6. Measurable outcomes

| Metric | Before P2 | After P2 | Delta |
|--------|-----------|----------|-------|
| Main bundle gzip | 253 181 bytes | 203 227 bytes | **−50 KB (−19.7 %)** |
| Playwright baseline PNGs | 0 (P1 golden paths existed but no baselines) | 85 (17 surfaces × 5 viewports) | +85 |
| `style={}` inline sites | 282 | 257 | −25 (budget gate prevents regression) |
| Double-submit guard sites | 0 | 9 (hook) + 2 (module-scope export guard) | +11 |
| `sanitiseUiOnRehydrate` subjects | 1 (Punctuation mapUi only) | 3 (all subjects, phase-aware) | +2 subjects |
| Error-copy oracle coverage | 0 | 71 JSX files, 10 forbidden-token rules | +71 files |
| CI workflow files | 1 (`mega-invariant-nightly.yml`) | 5 (+4 new) | +4 |
| Shared UI state primitives | 0 | 3 (EmptyState, LoadingSkeleton, ErrorCard) | +3 |
| TTS status observability | 0 (silent failure) | status channel + 15 s watchdog + latency telemetry | full lifecycle |
| Keyboard-only a11y scenes | 1 (spelling only, P1 U10) | 3 (+ grammar + punctuation) | +2 subjects |
| Node test count (approximate) | ~3 400 | ~4 000 | +600 |

---

## 7. Gated follow-ups (plan-anticipated, not blockers)

These items were explicitly deferred in the plan and documented in their respective decision records:

| Item | Gate | Owner | Document |
|------|------|-------|----------|
| CSP `Content-Security-Policy-Report-Only` → enforced flip | ≥ 7-day clean observation window | Operator | `docs/hardening/csp-enforcement-decision.md` |
| HSTS `preload` submission to hstspreload.org | Operator sign-off on subdomain audit | Operator | `docs/hardening/hsts-preload-audit.md` |
| Full 224-site `style={}` → stylesheet migration | Multi-week; SH2-U8 inventoried + sliced ≥ 20 | Engineering | `docs/hardening/csp-inline-style-inventory.md` |
| Linux-CI Playwright baseline regeneration | 2–3 PRs after SH2-U11 first CI run stabilises | Engineering | plan F-04 |
| `audit.yml` `continue-on-error` removal for audit:client | `src/subjects/spelling/data/*` forbidden-import fix | Spelling team | `.github/workflows/audit.yml` inline comment |
| Dark-mode visual baselines for auth surfaces | SH2-U6 baseline scaffold extension | Engineering | SH2-U8 PR body |

---

## 8. What the sprint taught us

### 8.1 Scrum-master orchestration scales to 13 units under high concurrency

The repo merged **81 commits to main** on 2026-04-26 — 13 SH2 units plus ~68 from other concurrent streams (spelling P2, grammar Phase 4, punctuation Phase 4, capacity, admin P1.5, bootstrap hotfixes). The pattern held: per-unit worktree isolation, per-unit PR, parallel ce-* reviewers, one review-follower cycle budget. Zero merge-clobber incidents despite 6+ rebases needed across the sprint.

### 8.2 Adversarial reviewers found the highest-severity blockers

Of the 25 blockers, adversarial reviewers surfaced 12 — including the 4 highest-impact finds:
- U2 zombie-phase + pendingCommand stranding (would have caused permanent learner lockout)
- U6 viewport-denominator flaw (re-introduced P1 U5 silent-green defect at scale)
- U10 minified-import regex miss (123 KB of shared chunks un-audited in production)
- U10 stale-chunk leak (prior build's files ship to production un-audited)

The "construct failure scenarios first, then check if the code handles them" mandate was load-bearing — these blockers were invisible to pattern-match review.

### 8.3 Plan scope estimates are systematically low on real-world counts

| Item | Plan estimate | Actual | Ratio |
|------|--------------|--------|-------|
| `style={}` sites | ~224 (charter ~93+) | 282 | 1.26× (plan) / 3.03× (charter) |
| Visual baseline PNGs | ≥ 60 | 85 | 1.42× |
| Reviewer blockers | ~19 (P1 benchmark) | 25 | 1.32× |
| Sprint duration | 1–3 days | 1 day (12 h wall) | — |

Lesson: inventory-first units (SH2-U8) should always grep before committing to thresholds. The F-03 deepening that lowered the migration target from 30–50 to ≥ 20 was correct and prevented a missed-target scenario.

### 8.4 Worker stalls are recoverable via fresh dispatch, not resume

SH2-U4's first worker stalled after 600 s with an incomplete scope (wrote a wrapper hook but never modified `tts.js`). Fresh dispatch with explicit "DO NOT repeat prior worker's mistake" instructions produced correct output. Resume-from-transcript is fragile; clean restart with clear anti-pattern documentation is more reliable.

### 8.5 Pre-existing test failures surface on first CI deployment

SH2-U11's `audit.yml` immediately went red due to `src/subjects/spelling/data/*` forbidden-imports that predate Phase 2 entirely. The `npm run check` failure also surfaced (OAuth-gated `wrangler-oauth.mjs`). Temporary `continue-on-error` was the correct call — it preserves signal without blocking every PR until a cross-team fix lands. The pattern should be: first CI PR ships with temporary allowances for known pre-existing failures, accompanied by a tracking issue for each.

### 8.6 The "same-PR atomicity" constraint for code-splitting is non-negotiable

SH2-U10's plan deepening (F-01 + S-01) required Worker allowlist, audit walk-all-chunks, and `splitting: true` to ship in the SAME commit. Had the Worker allowlist landed separately (even one commit later), every split chunk would 404 in production. This constraint was correctly enforced by the plan, verified by the worker, and double-checked by the adversarial reviewer — three independent gates. Future splitting changes must follow the same atomic pattern.

### 8.7 Design-lens reviewers catch user-experience defects that correctness reviewers miss

SH2-U5's "WordBank says 'Play a spelling round' with no CTA button" and "Grammar 'is ready' breaks the neutral voice" were both invisible to correctness/testing reviewers — the code was technically correct, the tests passed. Design review added a user-experience quality gate that the functional pipeline lacked.

---

## 9. Residual risks carried forward

| Risk | Mitigation in place | Recommended next action |
|------|-------------------|------------------------|
| CSP still Report-Only (`style-src 'unsafe-inline'` concession active) | Budget gate + inventory + 7-day observation record | Complete observation window → flip or extend |
| HSTS without `preload` | Audit artefact seeded | Operator completes DNS audit → separate submission PR |
| 232 remaining `style={}` sites (257 total − 25 migrated) | Budget gate at ≤ 257 | Next migration slice targets AdminHubSurface.jsx (85 sites) |
| Linux-CI font-hinting drift on narrow viewports | Per-project `maxDiffPixelRatio: 0.035` on mobile-360/390 | 2–3 baseline-regen PRs after first nightly |
| `spelling/data/*` forbidden-import audit failure | `audit.yml` `continue-on-error: true` | Spelling team decouple `events.js` / `read-model.js` from data modules |
| Isolated Playwright subset untested (no scenes authored yet) | Helper + README + convention seeded | First isolated scene PR validates the cross-process pattern |
| `React.lazy()` chunk-load failure → full-app ErrorBoundary, no reset | ErrorBoundary catches; user must reload | Wrap each Suspense in inner ErrorBoundary with retry CTA |
| Dark-mode visual baselines absent | Light-mode baselines locked; dark-mode change documented as intentional | Extend visual-baselines.playwright.test.mjs with `colorScheme: 'dark'` |

---

## 10. Sprint metrics

- **Total SH2 PRs merged:** 13
- **Total lines added:** +14 068
- **Total lines removed:** −222
- **Net new code:** ~13 846 lines
- **Total files touched:** 205 (including 85 baseline PNGs)
- **Wall-clock time:** ~12 hours (09:01 UTC first merge → 20:52 UTC last merge)
- **Reviewer cycles consumed:** ~35 parallel reviewer dispatches, 10 review-follower dispatches
- **Blockers caught pre-merge:** 25
- **Blockers that would have caused user-visible regression:** 8 (U2 zombie-phase × 2, U2 pendingCommand stranding, U1 ParentHub export, U6 viewport-denominator, U10 regex miss, U10 stale-chunk, U11 audit.yml ENOENT)
- **Worker stalls / restarts:** 1 (SH2-U4)
- **Merge-clobber incidents:** 0 (6 rebases required, all clean)
- **Upstream PRs merged concurrently during sprint:** ~68

---

## 11. Plan frontmatter update

The formal plan document at `docs/plans/2026-04-26-001-feat-sys-hardening-p2-plan.md` should receive a frontmatter update:

```yaml
status: completed
completed: 2026-04-26
```

---

Signed at sprint close by James To — 2026-04-26.
