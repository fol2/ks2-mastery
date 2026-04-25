# KS2 Mastery Hardening Pass 1 — Known-Faults Baseline

This document is a signed snapshot of known faults at the start of the hardening sprint. Every subsequent unit (U2 through U13) references this baseline as its "was this already broken?" oracle. Entries without a `(tracked in U?)` suffix are flagged as unaddressed and either picked up in follow-up plans or accepted as residual risk.

Entry format: one-line description + `(tracked in U?)` suffix when a hardening unit covers it.

## Visual faults

- Card clipping on narrow mobile viewports (360 px and below) in several learner hub surfaces, with content truncated rather than wrapping cleanly. (tracked in U5, U12)
- Horizontal overflow on learner activity rows at 360 px viewport when item titles exceed container width. (tracked in U12)
- Inconsistent spacing between session summary cards and adjacent reward tiles, causing uneven vertical rhythm on parent hub. (tracked in U12)
- Broken card states when session data is partially loaded, showing skeleton-card outline without the shimmer animation. (tracked in U12)
- Modal-body scroll trap on very tall content where the backdrop scrolls instead of the modal interior on some mobile browsers. (tracked in U5, U12)
- Toast overlap when multiple toasts fire within a short window, stacking visually rather than queueing. (tracked in U5, U12)
- Monster / effect sprite layering glitch where celebration sprites render behind the learner's current answer card on specific viewport widths. (tracked in U5, U12)
- Tiny mobile glitches: button-tap highlight persisting after navigation, focus ring flashing on route change. (tracked in U12)
- Dark-mode and low-contrast colour pairings on destructive-action buttons and secondary labels, not meeting WCAG 2.2 AA contrast ratio. (tracked in U12)
- Inconsistent empty-state copy and illustration usage across `WordBank`, `ActivityFeed`, and `RewardShelf` surfaces. (tracked in U12)

## Runtime faults

- Intermittent console errors from third-party library warnings that have not been triaged and suppressed. (tracked in U5, U9)
- Unhandled promise rejections observed in chaos scenarios (401 during refresh, 409 during retry burst). (tracked in U9)
- Double-submit on subject-command buttons when learners double-tap on touch devices, currently debounced by adapter retry but not by the UI. (tracked in U9, U12)
- Switching learner mid-session leaves stale queue state in memory for a brief window before bootstrap rehydrates. (tracked in U9, U10)
- Back-button behaviour after session completion returns to an intermediate state rather than the hub. (tracked in U9, U12)
- Stale state after refresh in rare multi-tab scenarios where the coordination lease arbitrates writes but the shell's local cache is from a previous tab. (tracked in U9, U10)
- Demo session expiry surfaces as a generic error toast rather than a bespoke expiry banner with convert-to-real-account call-to-action. (tracked in U9, U12)
- Degraded-sync banner occasionally flashes on fresh bootstraps when the initial `persistence` channel snapshot fires before steady-state. (tracked in U9)
- TTS failures (slow prompt-token resolution, 500 from prompt endpoint) degrade silently without retry transparency or a "tap to replay" affordance. (tracked in U9, U12)

## Server faults

Note: the bounded-bootstrap and command-projection work in PRs #126-#139 (see `docs/plans/2026-04-25-001-fix-bootstrap-cpu-capacity-plan.md`) addressed the large-payload / CPU-overrun surface that was the dominant pre-sprint server fault. The residual H1-H10 items from `docs/plans/james/cpuload/implementation-report.md` remain open.

- H1. Post-merge production validation — no dated production smoke exists for the bootstrap/CPU bounding work. (tracked in U2)
- H2. Capacity evidence artefacts — run output is terminal-only and not persisted. (tracked in U3)
- H3. Threshold-based load failure — `scripts/classroom-load-test.mjs` reports but does not fail on violation, so it cannot gate a release. (tracked in U2)
- H4. Production load safety guardrails — `--confirm-high-production-load` second-confirmation flag not yet wired. (tracked in U2)
- H5. Real Worker integration load test — local load runs exercise the adapter but not the full Worker route handling path. (tracked in U2, U11)
- H6. D1 row metrics and Worker tail correlation — `[ks2-capacity]` log fields not yet structured for correlation by request ID. (tracked in U4)
- H7. Consume `command.projection.v1` more directly — read-model direction of command projection is a refactor deferred to follow-up work. (not addressed this pass)
- H8. Dense-history subject smoke coverage — no production/preview smoke exists for dense-history spelling starts beyond `/api/bootstrap`. (tracked in U11)
- H9. Browser multi-tab validation — coordination lease behaviour is unit-tested but not validated end-to-end in a logged-in browser. (tracked in U10)
- H10. Launch evidence table — `docs/operations/capacity.md` has no dated evidence rows. (tracked in U3)

## Access / privacy faults

- Raw source exposure regression risk — `/src/*` is routed through `run_worker_first` and the production bundle audit (`scripts/production-bundle-audit.mjs`) enforces forbidden-token denial, but no extension exists for new source-path shapes introduced by future refactors. (tracked in U8)
- Over-broad hub payloads regression risk — Parent Hub and Admin Hub payload shapes are asserted by `tests/hub-payload-shape.test.js`, but no access-matrix oracle enforces that viewer membership learners do not appear in writable routes. (tracked in U13)
- Answer-bearing fields regression risk — `/api/bootstrap` and subject read-model responses are redacted, but no matrix test enforces the invariant across platform role × membership role × route combinations. (tracked in U13)
- Demo-crossing-real-account regression risk — demo sessions are isolated by design, but no access-matrix oracle asserts that a demo session cannot read or mutate a real account's state via route enumeration. (tracked in U13)
- Weak response headers — repo root `_headers` only sets `Cache-Control: no-store`; no CSP, no HSTS, no `X-Content-Type-Options`, no `Referrer-Policy`, no `Permissions-Policy`, no `frame-ancestors`, no cache split between HTML and hashed bundles. Worker-generated responses receive none of these headers. **This pass fixes.** (tracked in U6, U7, U8)
- Logs containing private content regression risk — Worker log hygiene in `docs/full-lockdown-runtime.md` forbids answer-bearing payloads and child-identifying content, but no automated assertion enforces that capacity telemetry (`[ks2-capacity]` emission) stays within the bounded-metadata contract. (tracked in U4)

## Test gaps

- No `*.playwright.test.*` files exist despite `playwright.config.mjs` configuration (five viewports wired: 360 / 390 / 768 / 1024 / 1440). `@playwright/test` is not installed as a devDependency. (tracked in U5)
- No CSP regression lock — neither the `_headers` file string nor the Worker response wrapper has a parser-level contract test asserting the policy shape. (tracked in U6, U7)
- No `_headers` content assertion — `scripts/assert-build-public.mjs` verifies the file is copied but does not verify its security-header block. (tracked in U6, U8)
- No chaos test matrix — expected failure modes (401 / 403 / 409 stale_write / 409 idempotency_reuse / 429 / 500 / timeout / malformed JSON / slow TTS / offline / refresh-during-submit) are documented in `docs/mutation-policy.md` and `docs/state-integrity.md` but not exercised at the HTTP boundary in a browser harness. (tracked in U9)
- No multi-tab browser validation — `tests/persistence.test.js` unit-tests the coordination lease; no Playwright scenario validates lease behaviour across real tabs within one browser context. (tracked in U10)
- No reduced-motion smoke — monster-effect library enforces `reducedMotion: 'omit' | 'simplify' | 'asis'` per effect, but no stage-level assertion verifies the app respects the OS-level `prefers-reduced-motion: reduce` preference. (tracked in U10)
- No keyboard-only e2e — accessibility primitives exist (`useFocusRestore`, `useModalFocusTrap`) and contract-tested in `tests/react-accessibility-contract.test.js`, but no end-to-end scene exercises a full learner flow via keyboard-only navigation. (tracked in U10)
- No dense-history Spelling smoke beyond bootstrap — `scripts/punctuation-production-smoke.mjs` and `scripts/grammar-production-smoke.mjs` cover those subjects, but dense-history Spelling Smart Review starts have no smoke equivalent. (tracked in U11)
- No access-matrix test driver — platform role × membership role × route × payload-shape combinations are documented in `docs/ownership-access.md` and `docs/operating-surfaces.md` but not machine-enforced. (tracked in U13)
- No security-header production HEAD audit — no script or test fetches production URLs with `HEAD` and asserts the expected header set. (tracked in U6, U8)

---

This baseline is a signed snapshot at sprint start. It is not auto-regenerated. Subsequent findings are tracked as commits/PRs on the relevant implementation unit.

Authored against repo HEAD at commit a7f9c10; PII redaction scan completed via ripgrep for `@`-pattern emails, UUID-like IDs, and real names before commit — zero findings.
