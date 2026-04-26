I rescanned the live repo and the linked plans. I also tried the clone route you suggested, but this runtime could not resolve `github.com`, so I used the live GitHub pages and raw files instead. The main correction for Phase 2 is clear: **system hardening should now avoid bootstrap CPU, command projection CPU, capacity certification, D1 query budgets, and public-endpoint rate-limit work unless it is only adding non-overlap tests or documentation.**

The repo has moved on materially since the first plan. P1 already landed the core “stabilisation platform”: charter/baseline, production/cache/security-header work, CSP report-only, Playwright adoption, chaos and multi-tab checks, dense-history spelling smoke, polish locks, and redaction/access tests. The P1 report also explicitly leaves a few non-CPU items open: double-submit handling for non-destructive command buttons, back-button behaviour after session completion, empty-state copy/illustration parity, CSP enforcement, HSTS preload, and some deferred Playwright/visual work. ([GitHub][1])

I would frame Phase 2 as:

**System Hardening Phase 2: UX-flow reliability, visual/accessibility polish, and security finalisation.**

Not “performance phase 2.” Not “capacity phase 2.” Not “Worker CPU phase 2.”

The current repo architecture supports that split well: React owns the browser shell and visible surfaces, while the Worker owns auth, demo sessions, API repositories, subject commands, server read models, prompt-token TTS, Parent Hub, and Admin/Ops routes. ([GitHub][2]) The original learning/product guardrail should still stand: protect independent first attempts, deterministic core behaviour, and AI as optional/additive rather than central. 

## Phase 2 scope boundary

I would explicitly write this at the top of the Phase 2 plan:

**Owned by this Phase 2 hardening stream**

Existing user-flow bugs, visual faults, accessibility defects, mobile layout problems, double-click/double-submit client behaviour, browser back/refresh glitches, empty/loading/error state parity, TTS failure handling, demo/auth failure messaging, CSP enforcement readiness, HSTS preload audit, Playwright visual coverage, Playwright CI adoption, and client-bundle hygiene.

**Not owned by this stream**

Bounded bootstrap v2, `command.projection.v1` direct hot-path consumption, ETag/not-modified bootstrap, D1 query budgets, production-safe backfills, load certification, classroom capacity evidence, and backend circuit breakers. Those are already described in the CPU-load plan and should stay there. ([GitHub][3])

Also avoid the currently open public-endpoint hardening work while PR #227 is active. That PR owns IPv6 `/64` rate-limit subject normalisation, unified `consumeRateLimit` routing, ops-error buckets, and admin-ops production smoke coverage. ([GitHub][4])

That boundary prevents another accidental overlap.

## Recommended Phase 2 units

### SH2-U0 — Phase 2 baseline and non-overlap lock

Start Phase 2 with a new short baseline doc rather than editing the Phase 1 baseline forever. Use the P1 residuals as seed items, then add only newly observed defects.

The doc should have four columns: defect, surface, acceptance test, owning stream. Anything marked CPU/load/rate-limit gets moved out of this plan immediately.

Done when every Phase 2 PR cites one baseline row or explicitly says “documentation/test-only non-overlap guard.”

This follows the P1 hardening charter discipline: fixes must target broken, confusing, unsafe, slow, or inaccessible behaviour, not add learner-visible product scope. ([GitHub][5])

### SH2-U1 — Double-submit hardening for non-destructive command buttons

This is one of the most concrete remaining bugs.

The goal is simple: a fast double-click, double-tap, Enter-key repeat, or impatient mobile tap must not create duplicate practice commands, duplicate toast states, duplicate rewards, duplicate completion transitions, or confusing pending UI.

Work should stay mostly client-side. Do not redesign Worker idempotency or CAS; just make the visible surfaces respect the existing mutation contract.

I would cover:

Practice submit buttons.

Continue/start buttons.

Retry buttons.

Finish/complete buttons.

TTS replay where it triggers command-like state.

Parent/Admin non-destructive save buttons, but only where not covered by PR #227.

Acceptance tests should include pointer double-click, keyboard repeat, and mobile tap at one or two Playwright viewport sizes. The pass condition is not just “one network call”; it is also “one visible transition, one toast, one final state.”

### SH2-U2 — Back-button, refresh, and completed-session flow cleanup

The P1 report calls out back-button behaviour after session completion as still open. This is a good Phase 2 target because it is flow hardening, not feature work. ([GitHub][1])

The desired behaviour:

After a learner completes a practice/session step, browser Back should not resurrect a stale answer form that can be resubmitted.

Refresh on a completion/summary screen should show a stable completed/read-only state or return to the subject route cleanly.

Changing learner or subject should clear transient practice state.

Route changes should stop audio, close transient overlays, and prevent old toasts from firing late.

Acceptance tests should exercise spelling, grammar, and punctuation where currently available. Grammar and punctuation are still newer server-command surfaces, so this will catch integration drift without stepping into CPU optimisation. The README says grammar and punctuation have crossed the Worker-command boundary but are not as mature as spelling, so they deserve extra flow verification. ([GitHub][2])

### SH2-U3 — Demo expiry and auth-failure UX polish

This should not add account-conversion features. It should only make existing failure states calm and understandable.

Current target behaviour:

Expired demo gives a clear expired-demo state, not a generic crash or raw API error.

Signed-out state gives one clear action.

Forbidden/read-only learner access says what is unavailable and does not show writable controls.

Auth failure during a practice command does not lose the visible answer immediately.

The important part is consistency. A child or parent should not see a technical error when the session simply expired. Add tests for 401, 403, expired demo, viewer/read-only learner, and “demo cannot access real account data.”

This fits the repo’s existing role/access split, where adult surfaces distinguish writable learners from read-only hub learners. ([GitHub][2])

### SH2-U4 — TTS failure, slow-audio, and replay hardening

TTS is a trust surface. If audio fails, the practice should continue.

Hardening target:

Slow TTS shows a small pending state, not a frozen button.

TTS 500/timeout shows “Audio unavailable. You can keep practising.”

Replay cannot be spammed into overlapping playback.

Changing route, learner, or subject stops audio.

Reduced-motion and keyboard-only users can still use or ignore audio affordances.

Do not change provider architecture. Do not add new voice features. This is just failure-state polish for an existing capability.

Acceptance tests should use the existing chaos HTTP boundary style and one browser-flow test: start audio, navigate away, confirm audio UI is reset.

### SH2-U5 — Empty, loading, and error state parity

P1 left empty-state copy/illustration parity open across Word Bank, Activity Feed, and Reward Shelf. ([GitHub][1]) This is perfect Phase 2 work because it makes the product feel finished without adding new capability.

The rule should be:

Every visible panel has a loading state, empty state, error state, and read-only/degraded state.

Each state uses the same language pattern: what happened, whether progress is safe, and what action is available.

No panel should collapse to a blank box.

No illustration should cause mobile overflow.

No error state should leak raw JSON, stack text, request ids, or answer-bearing data.

I would implement this through a small shared UI pattern if one already exists; otherwise keep it boring and local. The point is parity, not a design-system expansion.

### SH2-U6 — Full five-viewport visual regression pass

P1 adopted Playwright and the config already defines five projects: mobile 360, mobile 390, tablet, desktop 1024, and desktop 1440. ([GitHub][6]) Phase 2 should turn that into a real visual safety net.

Target surfaces:

Auth/login/demo.

Dashboard/home.

Spelling practice golden path.

Grammar practice golden path.

Punctuation practice golden path.

Subject completion/summary.

Parent Hub.

Admin/Ops surface, excluding areas actively touched by PR #227.

Word Bank modal.

Reward/monster/codex surfaces.

Toast shelf and persistence/degraded banner.

Acceptance checks:

No horizontal overflow at 360px or 390px.

No modal body trapped off-screen.

No toast blocking active answer controls.

No monster/celebration overlay blocking submit, retry, or feedback.

No layout shift caused by missing asset dimensions.

No “screenshot mask hides the defect” anti-pattern.

This should close the “full 5-viewport baselines” deferral from P1 without becoming a redesign.

### SH2-U7 — Accessibility golden expansion for grammar and punctuation

P1 added keyboard/reduced-motion coverage, but the baseline notes that grammar and punctuation keyboard flows were deferred. ([GitHub][7]) Phase 2 should finish that.

Minimum acceptance:

Keyboard-only start, answer, submit, retry, continue.

Focus moves to feedback after submit without trapping the user.

Modal open/close restores focus.

Toast announcements do not spam screen readers.

Read-only learner notices are announced or discoverable.

Error messages are tied to controls.

Reduced motion disables non-essential celebration movement.

The existing test suite already has Playwright accessibility-golden coverage and golden-path subject tests, so this is extending a pattern rather than inventing one. ([GitHub][8])

### SH2-U8 — CSP enforcement readiness and inline-style reduction

P1 added CSP report-only and left enforcement for later observation. The current security wrapper still allows inline styles because React surfaces have many inline style sites, and the charter explicitly says a full style migration is multi-week work. ([GitHub][5])

Do not treat this as a one-PR “flip CSP and pray” task.

I would split it:

First, create an inline-style inventory with counts by file/surface.

Second, migrate the safest shared shell/polish surfaces to classes or CSS variables.

Third, keep visual snapshots proving no redesign happened.

Fourth, after at least seven clean days of CSP report-only data, flip enforcement only if reports are actually clean. P1’s security header code already documents the report-only state and the observation requirement. ([GitHub][9])

Done means either CSP is safely enforced, or the repo has a clear, measured reason why enforcement remains deferred. That is still hardening progress.

### SH2-U9 — HSTS preload audit, not automatic preload submission

P1 deferred HSTS preload. I would not rush it.

Phase 2 should produce a preload-readiness checklist:

All required subdomains identified.

No legacy HTTP-only surfaces.

No local/dev host conflict.

Rollback implications understood.

`includeSubDomains` impact accepted.

Cloudflare/Pages/Worker routing checked.

Only after that should the header be changed or a preload submission considered. This is security hardening, but it has operational blast radius, so treat the audit as the Phase 2 deliverable unless the subdomain map is already unquestionably safe.

### SH2-U10 — Client-bundle and route-load hygiene

This is the cleanest optimisation work left for this stream because it avoids Worker CPU.

The current build/test scripts already include client audit, production audit, bundle build, Playwright, capacity scripts, smoke scripts, and verification scripts. ([GitHub][10]) Phase 2 can add client-side budget discipline without touching backend hot paths.

Targets:

Adult/Admin surfaces should not inflate the first learner-practice load more than necessary.

Monster visual config and heavy hub panels should be loaded only when the user enters those surfaces.

Static assets should have stable dimensions to avoid layout shift.

Practice route should not import debug/admin-only code.

Bundle audit should fail on accidental large imports.

No new UX feature. Just faster initial route load and less accidental client weight.

This is especially useful because P1 already split cache policy and added production audit gates; Phase 2 can make those gates stricter rather than adding new infrastructure.

### SH2-U11 — Playwright CI hardening and test isolation

The Playwright config currently pins workers to 1 because of shared in-memory SQLite/rate-limit/concurrency state. It even notes that later work can redesign isolation and raise workers again. ([GitHub][6])

This is not CPU optimisation. It is test reliability work.

Phase 2 goals:

Add a stable Playwright CI job if it is not already required.

Upload screenshot/trace artifacts on failure.

Keep the default PR job small enough to be trusted.

Add a separate nightly/full matrix for all five viewport projects.

Improve test isolation enough that selected suites can run with more than one worker.

Document which tests must remain serial and why.

This reduces false confidence. A hardening plan is only as good as the tests people actually run before merging.

### SH2-U12 — Error copy and toast discipline

This can be folded into U3/U5, but I would keep it visible because inconsistent error copy is one of the fastest ways to make a stable app feel unstable.

Rules:

No raw `500`, `409`, `TypeError`, stack, JSON blob, or internal route name in user-facing copy.

Every save failure says whether progress is safe.

Every stale-write message says what happened in human terms.

Only one toast per user action.

Long-lived issues use banners, not repeated toasts.

Toast shelf must not cover active practice controls on mobile.

This should be backed by parser-style tests where possible and Playwright checks for the most important flows.

## Suggested Phase 2 order

I would not start with CSP or bundle splitting. Start with user-visible reliability bugs.

First batch:

1. SH2-U0 baseline and ownership map.
2. SH2-U1 double-submit lock.
3. SH2-U2 back/refresh/completed-session flow.
4. SH2-U3 demo/auth expiry UX.
5. SH2-U4 TTS failure/replay hardening.

Second batch:

6. SH2-U5 empty/loading/error state parity.
7. SH2-U7 grammar/punctuation accessibility goldens.
8. SH2-U6 five-viewport visual regression expansion.

Third batch:

9. SH2-U8 CSP enforcement readiness and inline-style reduction.
10. SH2-U9 HSTS preload audit.
11. SH2-U10 client-bundle hygiene.
12. SH2-U11 Playwright CI/isolation.

That order fixes the “users feel glitches” layer before the deeper security/tooling clean-up.

## Hard no-touch list for this stream

To avoid overlap, Phase 2 system hardening should not own these unless the CPU/rate-limit owner explicitly hands them over:

`/api/bootstrap` shape or selected-learner bootstrap v2.

Command projection hot-path rewrites.

`command.projection.v1` direct consumption.

ETag/not-modified bootstrap.

D1 query budget enforcement.

Production-safe backfill infrastructure.

Classroom load certification thresholds.

Worker CPU telemetry schema.

Backend circuit breakers.

Rate-limit subject normalisation and public endpoint hardening while PR #227 is active.

It is fine to add client tests that reveal bugs in those areas. It is not fine for this stream to fix those backend paths directly without coordination.

## Release gates for Phase 2

For every Phase 2 PR:

Run `npm test`.

Run `npm run check`.

Run `npm run audit:client`.

Run `npm run audit:production`.

Run the relevant Playwright project or full `npm run test:playwright` for browser-flow work.

Add or update a regression test for the exact bug being fixed.

Confirm no new learner-visible feature was added.

Confirm no CPU-load-owned file/path was materially changed, or record the owner approval.

The repo already has the scripts needed for most of this, including test, check, client audit, production audit, Playwright, production smoke, and capacity-related commands. ([GitHub][10])

## My strongest recommendation

Make Phase 2 boring and sharp.

Do not call it “optimisation” unless it is client-bundle, asset, or visual-load optimisation. The CPU team has the server optimisation lane. Your hardening lane should make the existing app feel impossible to break from the child/parent/browser side: no duplicate submits, no stale back-button ghosts, no mystery auth errors, no broken empty states, no inaccessible grammar/punctuation flow, no mobile visual embarrassment, and no half-finished CSP story.

That gives you a clean division of labour: CPU team makes the platform scale; this stream makes the already-scaled product feel trustworthy.

[1]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/james/sys-hardening/sys-hardening-p1-completion-report.md "raw.githubusercontent.com"
[2]: https://github.com/fol2/ks2-mastery "GitHub - fol2/ks2-mastery: KS2 Unified — browser-side React prototype of a KS2 (UK Year 5/6) study app · GitHub"
[3]: https://github.com/fol2/ks2-mastery/blob/main/docs/plans/james/cpuload/cpuload-p2.md "ks2-mastery/docs/plans/james/cpuload/cpuload-p2.md at main · fol2/ks2-mastery · GitHub"
[4]: https://github.com/fol2/ks2-mastery/pull/227 "feat(rate-limit): P1.5 Phase B — public endpoint hardening (IPv6 /64 + global budget + smoke) by fol2 · Pull Request #227 · fol2/ks2-mastery · GitHub"
[5]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/hardening/charter.md "raw.githubusercontent.com"
[6]: https://github.com/fol2/ks2-mastery/blob/main/playwright.config.mjs "ks2-mastery/playwright.config.mjs at main · fol2/ks2-mastery · GitHub"
[7]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/hardening/p1-baseline.md "raw.githubusercontent.com"
[8]: https://github.com/fol2/ks2-mastery/tree/main/tests/playwright "ks2-mastery/tests/playwright at main · fol2/ks2-mastery · GitHub"
[9]: https://github.com/fol2/ks2-mastery/blob/main/worker/src/security-headers.js "ks2-mastery/worker/src/security-headers.js at main · fol2/ks2-mastery · GitHub"
[10]: https://github.com/fol2/ks2-mastery/blob/main/package.json "ks2-mastery/package.json at main · fol2/ks2-mastery · GitHub"
