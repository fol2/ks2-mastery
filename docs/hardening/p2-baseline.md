# KS2 Mastery Hardening Pass 2 — Known-Faults Baseline

This document is a signed snapshot of known faults at the start of the Phase 2 hardening sprint. It mirrors the shape of `docs/hardening/p1-baseline.md` and adds a sixth bucket — **Copy & UX parity** — to record visible-language and state-parity defects that fell outside the P1 5-bucket structure.

Every subsequent Phase 2 unit (SH2-U1 through SH2-U12) references this baseline as its "was this already broken?" oracle. The charter's rule is unchanged: **a PR that frames itself as a fix must cite the specific `p2-baseline.md` entry it addresses. Work that cannot cite a baseline entry is out of scope.**

Entry format: one-line description + `(tracked in SH2-U?)` suffix when a hardening unit covers it. Rows that a unit closes fully have no open marker; rows that a unit only partially closes are flagged with residual notes so follow-up work is discoverable.

Every row carries five facts: short description, subject surface, acceptance-test pointer (existing or planned path), owning unit, and status (open or tracked in SH2-U?). Paths are repo-relative.

## Visual faults

- Horizontal overflow / card clipping regression risk across full 5-viewport matrix — P1 U5 landed Playwright golden-path scenes with a single `mobile-390` baseline only; full `360 / 390 / 768 / 1024 / 1440` visual baselines, toast-vs-submit layering at every viewport, and monster/celebration overlay non-occlusion of practice controls remain open. Surface: every learner-visible route (auth, home, spelling/grammar/punctuation practice, subject summary, Parent Hub, Admin Hub excluding PR #227 surfaces, Word Bank modal, reward/codex). Acceptance test: new `tests/playwright/*-viewport-matrix.playwright.test.mjs` scenes covering the five viewports + mask-coverage invariant. (tracked in SH2-U6)
- "Mask-the-whole-card with magenta" anti-pattern risk — P1 U5 review-follower caught `.spelling-hero-backdrop` mask covering 90% of the card so the stable screenshot equalled the magenta screenshot; no parser-level invariant today prevents future screenshot masks from hiding the defect they are supposed to guard. Surface: `tests/playwright/shared.mjs` mask configuration + every Playwright scene that passes a `masks` argument. Acceptance test: `tests/playwright-mask-coverage.test.js` asserting total masked area ≤ N% of page bounding box per scene. (tracked in SH2-U6)
- Empty-state copy and illustration drift across `WordBank`, `ActivityFeed`, `RewardShelf` — P1 U12 button-label test covered verbs only; the empty-state illustration + copy parity was left open. Surface: `src/surfaces/**/EmptyState*.jsx`, `src/subjects/**` empty panels. Acceptance test: parser-level contract in `tests/empty-state-copy-contract.test.js` + Playwright snapshot of each empty panel at `mobile-390`. (tracked in SH2-U5)
- Toast shelf overlap with active practice controls on mobile — P1 U12 toast-positioning contract locked z-index / keyframe allowlist / reduced-motion, but did not lock "toast shelf does not cover the active answer input or submit button at `mobile-360`". Surface: `src/surfaces/shell/ToastShelf.jsx` + every subject practice surface. Acceptance test: extend `tests/playwright/spelling-golden-path.playwright.test.mjs` + add grammar / punctuation equivalents asserting `toastBox.top >= submitBox.bottom` or mutual-exclusion. (tracked in SH2-U12)

## Runtime faults

- Double-submit on non-destructive command buttons — P1 closed destructive-action confirm contract (`tests/destructive-action-confirm-contract.test.js`) but left fast-double-click / double-tap / Enter-repeat / impatient-mobile-tap on practice submit, continue, start, retry, finish, TTS-replay, and parent/admin non-destructive save buttons producing duplicate toasts / duplicate pending transitions / duplicate completion visuals. Surface: `src/surfaces/**/*.jsx` interactive buttons outside the three danger-zone commands already covered by U12's destructive-action contract. Acceptance test: `tests/use-submit-lock.test.js` for the hook + Playwright `tests/playwright/double-submit-hardening.playwright.test.mjs` covering pointer + keyboard + touch paths across spelling / grammar / punctuation. (tracked in SH2-U1)
- Back-button / refresh / completed-session flow glitches — P1 completion report flagged this residual explicitly. Browser Back after completion can resurrect a stale answer form, refresh on a summary screen can return an unstable half-loaded state, and switching learner or subject mid-session does not always clear transient practice state. Route changes also sometimes fire late toasts after navigation. Surface: `src/app/router.js`, `src/subjects/**` session surfaces, `src/surfaces/shell/**` route-transition hooks. Acceptance test: `tests/ui-rehydrate-sanitiser.test.js` pure-module contract + `tests/playwright/back-button-flow.playwright.test.mjs` exercising spelling / grammar / punctuation completed-session back-button and refresh. (tracked in SH2-U2)
- TTS slow / failure / replay affordances are silent — P1 baseline Runtime bucket entry "TTS failures degrade silently without retry transparency or a `tap to replay` affordance" remains open beyond the chaos slow-TTS scene (which asserts practice reachability only). Slow prompt-token resolution shows a frozen button, 500 / timeout from prompt endpoint shows no "Audio unavailable. You can keep practising." message, replay is spammable into overlapping playback, and route / learner / subject change does not always cancel in-flight audio. Surface: `src/surfaces/**/TtsButton.jsx` (and subject equivalents), `src/platform/tts/*`. Acceptance test: `tests/tts-failure-hardening.test.js` unit + extend `tests/playwright/chaos-http-boundary.playwright.test.mjs` with an explicit TTS 500 + TTS-timeout + TTS-replay-cancellation scene. (tracked in SH2-U4)
- Demo expiry and auth-failure surfaces leak generic errors — P1 baseline Runtime bucket entry "Demo session expiry surfaces as a generic error toast rather than a bespoke expiry banner" remains open beyond the 401 chaos scene (which asserts shell survives, not that copy is calm). Signed-out state, forbidden / viewer read-only learner access, auth failure during a practice command all surface generic toasts or raw API text. Surface: `src/surfaces/shell/**` auth-failure banners, `src/subjects/**` command error copy, `src/app/session/**` demo-expiry detection. Acceptance test: new `tests/demo-expiry-banner-contract.test.js` + Playwright scene covering 401, 403, expired demo, viewer read-only learner, and "demo cannot access real account data" through chaos fault-injection. (tracked in SH2-U3)
- Route-change does not always stop overlays / late toasts — P1 U12 landed route-change audio cleanup (`tests/route-change-audio-cleanup.test.js`) on the seven adult-surface routes, but transient overlays (celebration sprite, modals opened during session) and late toasts fired after navigation remain open. Surface: `src/surfaces/**` overlay portals, `src/app/router.js` route-change lifecycle. Acceptance test: extend `tests/route-change-audio-cleanup.test.js` or add sibling `tests/route-change-overlay-cleanup.test.js` + Playwright coverage in the back-button flow scene. (tracked in SH2-U2)

## Copy & UX parity

*(New Phase 2 bucket. Derived from SH2-U1 / U3 / U5 / U12 gaps that fell outside the P1 5-bucket structure.)*

- Error copy inconsistency — raw `500`, `409`, `TypeError`, stack frames, JSON blobs, and internal route names surface in user-facing toasts on failure paths. Every save failure should state whether progress is safe; every stale-write message should use human terms; every demo-expiry / auth-expiry message should suggest a next step. No parser-level oracle enforces this today. Surface: every mutation-bearing surface in `src/subjects/**` and `src/surfaces/**`, plus Parent/Admin hub save paths outside PR #227's scope. Acceptance test: `tests/error-copy-oracle.test.js` parser-level lint covering forbidden tokens (`Error:`, `500`, `TypeError`, `stack`, `undefined is not`, `NaN`) in any string literal reachable from `*.jsx` error-rendering paths. (tracked in SH2-U12)
- One-toast-per-action discipline missing — a single user action that fails can produce 2–3 stacked toasts (transport retry toast + stale-write toast + completion toast), violating the "one toast per action" rule. Long-lived issues are also not promoted to banners. Surface: `src/surfaces/shell/ToastShelf.jsx` + every mutation path. Acceptance test: extend `tests/toast-positioning-contract.test.js` with a `one-toast-per-action` invariant + Playwright check on chaos scenes. (tracked in SH2-U12)
- Empty / loading / error / read-only-degraded state parity — every visible panel should carry all four states with the same language pattern (what happened, whether progress is safe, what action is available). Today panels can collapse to blank boxes, illustrations can overflow mobile, and error states can leak raw JSON / request IDs / answer-bearing data. Surface: `src/surfaces/**/*.jsx` + `src/subjects/**/*.jsx` panel primitives. Acceptance test: parser-level contract in `tests/panel-state-parity.test.js` asserting every panel component exports all four states (or cites an allowlist entry) + Playwright snapshot per panel at `mobile-390`. (tracked in SH2-U5)
- Auth-failure copy is technical — P1 baseline Runtime entry partially covers this; the full copy-parity rule ("a child or parent should not see a technical error when the session simply expired") needs its own oracle so regressions cannot reintroduce `401 Unauthorized` raw-text leakage. Surface: `src/app/session/**` + `src/surfaces/shell/**` auth error paths. Acceptance test: covered by the demo-expiry banner contract in SH2-U3 combined with the error-copy oracle in SH2-U12. (tracked in SH2-U3, SH2-U12)

## Access / privacy faults

- CSP Report-Only → Enforced flip is open — P1 U7 shipped `Content-Security-Policy-Report-Only` + `/api/security/csp-report`; the enforcement flip is charter-deferred pending ≥ 7 days of production observation with zero unexpected violations. Phase 2 should produce the observation decision record, the highest-ROI inline-style slice, and the enforcement flip when evidence allows. Surface: `worker/src/security-headers.js` (header-name flip), `src/**/*.jsx` inline-style sites, `docs/operations/capacity.md` (CSP Report-Only row). Acceptance test: `tests/csp-policy.test.js` + new `tests/csp-inline-style-inventory.test.js` + a dated observation decision record referenced from the baseline row. (tracked in SH2-U8)
- HSTS `preload` directive is not set — P1 charter-deferred pending a signed `eugnel.uk` subdomain-tree audit confirming every existing and planned subdomain can meet a two-year HTTPS-only commitment. Phase 2 should produce the audit document only; the actual `preload` flip remains a separate PR gated on operator credentials. Surface: `worker/src/security-headers.js` HSTS string, `docs/hardening/hsts-preload-audit.md` (new). Acceptance test: the audit document itself is the deliverable; a follow-up test `tests/hsts-preload-readiness.test.js` gates `preload` addition on the audit file existing + all checklist boxes ticked. (tracked in SH2-U9)
- Adult surface bundle weight inflates the first learner-practice load — P1 U8 cache-split landed hashed-immutable headers, but no byte-budget gate exists to prevent debug / admin-only code from being imported into the practice route, and no code-split discipline separates adult surfaces (Parent Hub, Admin Hub, Monster Visual Config) from the child practice path. Surface: `src/surfaces/**/*.jsx`, `src/subjects/**/*.jsx`, `scripts/audit-client-bundle.mjs`. Acceptance test: extend `scripts/audit-client-bundle.mjs` with a per-chunk byte budget + Worker-side `run_worker_first` allowlist walking every chunk + `tests/bundle-audit.test.js` budget assertion. (tracked in SH2-U10)

## Test gaps

- No CI job for the Playwright suite — P1 completion report flagged this explicitly ("no `.github/workflows/` exists"). Today Playwright runs locally only, so chaos / multi-tab / accessibility-golden coverage has no remote gate. Surface: `.github/workflows/` (new directory). Acceptance test: new `.github/workflows/playwright.yml` + `tests/playwright-ci-workflow-contract.test.js` asserting the workflow uses `contents: read` only, injects no CF secrets, uploads screenshot / trace artefacts on failure, and pins the Playwright project list. (tracked in SH2-U11)
- Grammar + punctuation keyboard-only e2e coverage is deferred — P1 U10 shipped the keyboard-only spelling round-trip but documented grammar + punctuation keyboard flows as deferred. Reduced-motion + `aria-live` announcement coverage on grammar + punctuation is also open. Surface: `tests/playwright/grammar-golden-path.playwright.test.mjs`, `tests/playwright/punctuation-golden-path.playwright.test.mjs`, plus new `tests/playwright/accessibility-golden-grammar.playwright.test.mjs` + `tests/playwright/accessibility-golden-punctuation.playwright.test.mjs` scenes. Acceptance test: new accessibility-golden scenes cover start / answer / submit / retry / continue keyboard paths, focus-after-submit, modal focus restore, toast non-spam on screen readers, read-only learner notices announced, error-to-control association, and reduced-motion disable on non-essential celebration movement. (tracked in SH2-U7)
- No parser-level error-copy oracle — the Copy & UX parity bucket entry above has no existing test; today any subject surface can reintroduce `Error:` / `500` / stack text / JSON into user copy without an automated gate. Surface: `tests/error-copy-oracle.test.js` (new). Acceptance test: the file itself; runs under `npm test`. (tracked in SH2-U12)
- Full 5-viewport visual baselines are not stored — P1 U5 stored only `mobile-390` baselines; adding `360 / 768 / 1024 / 1440` bases requires per-viewport PNG storage + the mask-coverage invariant described in SH2-U6 above. Surface: `tests/playwright/__screenshots__/` (new baselines). Acceptance test: new matrix scenes in SH2-U6. (tracked in SH2-U6)
- Bundle-audit byte budget is not enforced — SH2-U10 surface entry above has no current gate; `scripts/audit-client-bundle.mjs` checks forbidden tokens and direct-import shapes but does not fail on per-chunk size regressions. Surface: `scripts/audit-client-bundle.mjs` + `tests/bundle-audit.test.js`. Acceptance test: SH2-U10 deliverable. (tracked in SH2-U10)
- UI-rehydrate sanitiser is not contracted — SH2-U2 acceptance test pointer `tests/ui-rehydrate-sanitiser.test.js` does not exist today; the sanitiser itself also does not exist today and must be authored alongside the contract so back-button / refresh flows cannot resurrect stale state silently. Surface: new `src/app/ui-rehydrate-sanitiser.js` + `tests/ui-rehydrate-sanitiser.test.js`. Acceptance test: SH2-U2 deliverable. (tracked in SH2-U2)

---

## Not owned by Phase 2

*(Reproduced verbatim from the plan's Scope Boundaries — `docs/plans/2026-04-26-001-feat-sys-hardening-p2-plan.md` lines 62-86. Any item in this list is out of scope for SH2-U0 through SH2-U12 and is owned by another active stream. A Phase 2 PR that touches any of these files or subjects without explicit owner approval from that stream is out of scope even if it cites a baseline row above.)*

### PR #227 overlap items (public-endpoint rate-limit hardening stream)

- IPv6 `/64` rate-limit subject normalisation (`worker/src/rate-limit.js::normaliseRateLimitSubject`).
- Unified `consumeRateLimit` routing across `worker/src/auth.js`, `worker/src/demo/sessions.js`, `worker/src/tts.js`.
- Ops-error fresh-insert cap and global budget buckets (`ops-error-fresh-insert:<subject>`, `ops-error-capture-global`).
- Admin-ops production smoke (`scripts/admin-ops-production-smoke.mjs`, `tests/admin-ops-production-smoke.test.js`, `docs/hardening/admin-ops-smoke-setup.md`).
- Worker rate-limit test globs (`tests/worker-rate-limit-*.test.js`) — owned by PR #227; no-touch during Phase 2.
- Worker ops-error test globs (`tests/worker-ops-error-*.test.js`) — owned by PR #227; no-touch during Phase 2.
- Turnstile remote IP extraction (`worker/src/auth.js::turnstileRemoteIp`).
- Row-version CAS + reconciliation cron (PR #227 Phase C follow-up).
- `ops_status` enforcement at auth boundary (PR #227 Phase D follow-up).
- Error-centre drawer + auto-reopen + build-hash (PR #227 Phase E follow-up).

### cpuload-p2 overlap items (server-capacity stream — `docs/plans/james/cpuload/cpuload-p2.md`)

- Bounded bootstrap v2 / selected-learner minimal bootstrap (`/api/bootstrap` shape refactor).
- `command.projection.v1` direct hot-path consumption (read-model as input, bounded fallback only).
- ETag / revision-based `If-None-Match` / `304 Not Modified` bootstrap.
- D1 query budgets and `EXPLAIN QUERY PLAN` audit (`npm run db:query-plan:capacity`).
- Production-safe backfill resumability (`--dry-run`, `--resume-from`, `--max-rows`, `--sleep-ms`, `capacity_backfill_runs` table).
- Classroom load certification thresholds (30-learner beta, 60-learner stretch, 100+ school-ready gates).
- Backend circuit breakers and graceful-degradation rules (Parent Hub history degrade, activity-feed degrade, read-model derived-write skip, bootstrap capacity metadata missing release-blocker).
- Worker CPU telemetry schema extensions beyond P1 U4 (`[ks2-worker] capacity.request` log surface is P1-owned; further field additions are cpuload-p2).
- Real Worker integration load test (`npm run capacity:local-worker` wrangler-dev harness).
- Production load safety guardrails beyond `--confirm-high-production-load` (e.g. `--confirm-school-load` tier-60 gate).

### Charter-disallowed scope (unchanged from `docs/hardening/charter.md`)

- New question types in any subject.
- New game systems, reward mechanics, or monster behaviours.
- New analytics panels, dashboards, or reporting surfaces.
- New subjects, new adult workflows, or new learner-account types.
- Major art redesign or visual identity change.
- Expanding AI behaviour (new prompt flows, new model providers, new AI-driven features).
- Browser-owned runtime re-entry (production scoring, queue selection, progress mutation, reward projection stay Worker-owned).
- Third-party analytics or tag-manager integrations.
- Migration of Cloudflare Workers assets to Cloudflare Pages.

---

## Sign-off

Signed at sprint start by James To — 2026-04-26.

Authored against repo HEAD at sprint start; no PII, no answer-bearing content, no child-identifying content committed.
