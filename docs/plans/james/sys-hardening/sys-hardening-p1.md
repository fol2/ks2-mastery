I’d treat this as a **stabilisation pass**, not a product pass. No new subjects, no new learning modes, no new reward mechanics, no dashboard expansion. The goal is: fewer crashes, fewer visual glitches, bounded server cost, faster reloads, safer production behaviour, and clearer failure states.

I’m assuming the target is the current `ks2-mastery` repo, not the old single-file maths prototype. The earlier KS2 maths reasoning brief is still useful as a product guardrail: keep the deterministic learning loop intact, preserve genuine first attempts, and keep AI optional/additive rather than central.  The repo itself now describes a React-owned shell, Worker-backed auth, demo sessions, API repositories, subject commands, server read models, protected audio, and D1-backed persistence, so hardening should focus on those boundaries rather than adding curriculum surface area. ([GitHub][1])

## 1. Set the hardening charter first

The charter should be blunt:

“During hardening, no new learner-visible feature is accepted unless it fixes an existing broken, confusing, unsafe, slow, or inaccessible behaviour.”

That means “yes” to: layout fixes, bug fixes, broken states, stale-write recovery, better loading/error affordances, server hot-path bounding, smaller bundles, safer headers, test coverage, production smoke checks, and rollback readiness.

That means “no” to: new question types, new game systems, new analytics panels, new subjects, new adult workflows, major art redesign, or expanding AI behaviour.

The repo already has a good release-gate culture: `npm test`, `npm run check`, `audit:client`, `audit:production`, production smoke scripts, capacity scripts, and deployment through package scripts are present in `package.json`. Use those as the backbone of the hardening cycle rather than inventing a new process. ([GitHub][2])

## 2. Baseline audit: know what is currently broken

Before fixing, create a short “known faults” log. I would split it into five buckets:

Visual faults: clipping, overflow, spacing, broken cards, modal scroll issues, toast overlap, monster/effect layering, tiny mobile glitches, dark/low-contrast spots, inconsistent empty states.

Runtime faults: console errors, unhandled promise rejections, double-submit bugs, switching learner mid-session, back-button weirdness, stale state after refresh, demo expiry behaviour, degraded-sync behaviour, TTS failures.

Server faults: slow `/api/bootstrap`, full-history reads, large response payloads, command projection scans, D1 query hotspots, retry storms, missing telemetry, unexpected 5xxs.

Access/privacy faults: raw source exposure, over-broad hub payloads, answer-bearing fields in read models, demo crossing into real account data, weak response headers, logs containing private content.

Test gaps: flows that are manually tested but not locked down, especially mobile, modals, practice submit, stale-write recovery, demo reset, TTS fallback, production bundle audit, and high-history accounts.

You already have useful test surfaces. The tests directory includes coverage for auth, worker access, bootstrap capacity, read-model capacity, subject commands, React surfaces, accessibility contracts, mutation policy, production smoke helpers, spelling/grammar/punctuation engines, and visual/effect rendering. ([GitHub][3]) The immediate hardening move is not “write tests everywhere”; it is “convert each recurring glitch into a small regression test.”

## 3. Highest-priority server hardening: bound bootstrap and command work

This is the big one. There is already an active plan in the repo called “Bound Bootstrap CPU and Capacity Surfaces.” I would make that the centrepiece of the hardening sprint.

The plan identifies `/api/bootstrap` and subject command projection as hot paths that can read, parse, redact, normalise, and serialise too much historical `practice_sessions` and `event_log` data. Its goal is to make bootstrap and command responses bounded, measurable, and safe under classroom-style concurrent use. ([GitHub][4])

Concrete work:

Cap `/api/bootstrap` hard. It should return account/session metadata, selected learner, current subject state, active/recent bounded sessions, published monster config, sync revision metadata, and nothing unbounded. Full historical sessions and event logs should not ride along with app startup.

Keep history lazy and redacted. Parent Hub and activity history can load via authorised paginated routes, but first paint and practice startup should not depend on history. This is not a new feature; it is moving existing historical data off the hot path.

Make command projection bounded. Subject commands should not scan an entire learner event history to decide rewards, dedupe events, or build read models. Use stored read models, request receipts, recent windows, or deterministic command output.

Add capacity telemetry. Every hot endpoint should log route, wall time, response bytes, bounded counts, capped/not-capped flag, rows read/written where available, and failure category. Do not log prompts, raw answers, full event JSON, or child-identifying content.

Set pass/fail targets. The existing plan proposes bounded payload targets, Worker CPU targets, submit-to-feedback latency targets, 5xx targets, and classroom-readiness tiers. Keep those as engineering evidence, not marketing claims. ([GitHub][4])

The specific first implementation units I’d prioritise are: capacity harness, bounded bootstrap, command projection hardening, client retry-pressure reduction, then load certification. The existing plan already maps these out clearly. ([GitHub][4])

## 4. Client hardening: stop small glitches becoming lost trust

The browser should feel boringly reliable.

Start with the existing Playwright viewport matrix: 360, 390, 768, 1024, and 1440 widths are already configured. Use that as the visual QA baseline for every exposed route and every critical state. ([GitHub][5])

The visual pass should cover:

Login/register/demo screens; dashboard; subject cards; spelling, grammar, and punctuation practice; feedback states; summary states; Parent Hub; Admin/Operations; Word Bank modal; toasts; monster/Codex surfaces; degraded sync; expired demo; empty state; loading state; error state; mobile landscape.

Specific visual bugs I would hunt aggressively:

Toasts appearing over active typing or submit controls. The CSS already recognises that toasts can appear mid-session and should be quiet corner status notes, so test that behaviour on mobile and during practice. ([GitHub][6])

Modal focus and scroll traps. The app has custom word-detail modal focus logic in `src/main.js`; that deserves browser regression coverage for open, tab, Escape, close, and focus restoration. ([GitHub][7])

Monster/effect layering. Celebration effects are fun, but they must never block answer input, cover important feedback, or break reduced-motion users.

Mobile card overflow. Check long words, long learner names, long email addresses, large numbers, narrow modals, and parent/admin tables.

Disabled/saving states. Every mutation action should show one clear pending state and prevent accidental double-submits.

Degraded/read-only mode. The app should not look broken when writes are blocked. It should clearly say what is unavailable and why.

## 5. Runtime reliability: races, retries, stale writes, multi-tab

The repo’s mutation policy is strong in concept: every write carries an expected revision and idempotency request id; stale writes are rejected rather than silently merged; retry/resync is explicit. ([GitHub][8]) The hardening task is making every user path honour that policy without confusing the user.

Practical fixes:

Use single-flight hydration. If three parts of the UI trigger refresh at once, they should share one in-flight hydrate rather than hit `/api/bootstrap` three times.

Bound stale-write recovery. A `409 stale_write` should cause one controlled rebase/hydrate/retry path, not repeated bootstraps.

Guard multi-tab behaviour. Use `BroadcastChannel` or storage events so one tab can tell another “state changed, refresh gently” instead of both fighting over revisions.

Make demo expiry calm. Expired demo sessions should fail closed, but the UI should explain it cleanly and offer a reset/sign-in path.

Centralise retry policy. GET read models can retry with backoff; writes should not blindly retry unless request idempotency and expected revision handling are correct.

Add chaos tests. Simulate 401, 403, 409, 429, 500, timeout, malformed JSON, slow TTS, offline, and refresh-during-submit. The user should never lose a completed answer because a toast, audio, or reward projection failed.

## 6. Security and privacy hardening

The Worker boundary is the right architecture: production practice is server-authoritative, and the browser renders returned read models rather than recomputing scoring, queue selection, progress mutation, or reward projection. ([GitHub][9]) The hardening pass should make that promise verifiable.

Immediate security backlog:

Add response security headers. The current `_headers` file appears to set only `Cache-Control: no-store` globally. ([GitHub][10]) Add a proper header set: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and `frame-ancestors`/`X-Frame-Options` as appropriate. Start CSP in report-only mode if needed. OWASP treats CSP as a defence-in-depth layer against XSS, and its HTTP header guidance covers clickjacking and related browser protections. ([OWASP Cheat Sheet Series][11])

Keep public source lockdown in the release gate. The Worker README says raw source-shaped paths such as `/src/*`, `/shared/*`, `/worker/*`, `/tests/*`, `/docs/*`, `/legacy/*`, and `/migration-plan.md` should be denied in production while the app bundle remains available. Keep this as a production audit blocker. ([GitHub][12])

Redaction tests should be brutal. No answer-bearing session state, private spelling prompt text, raw engine state, account-scoped draft content, or private event JSON should appear in public bootstrap, hub payloads, activity routes, browser cache, localStorage, or logs.

Harden cookies and auth. Confirm `Secure`, `HttpOnly`, `SameSite`, expiry, rotation, logout invalidation, demo conversion, social-login callback validation, and bearer-token handling.

Keep TTS private. The repo already describes Worker-side TTS and prompt-token audio boundaries. Keep provider keys and prompt resolution server-side, never in browser settings or logs. ([GitHub][12])

## 7. Client performance: make reloads cheap

There is a very likely quick win around caching. Right now `_headers` has a global `Cache-Control: no-store`, which is safe but expensive for static assets. ([GitHub][10]) For production, split caching:

HTML/app shell: `no-store` or short revalidation.

Hashed JS/CSS/assets: long-lived `public, max-age=31536000, immutable`.

API responses: explicit `no-store`, unless a route is deliberately cacheable and safe.

Cloudflare’s Workers static assets docs say static assets get default headers such as `Content-Type` and `Cache-Control: public, max-age=0, must-revalidate`; custom headers can improve or override this depending on deployment needs. ([Cloudflare Docs][13])

Other performance work:

Lazy-load adult surfaces. Parent Hub, Admin/Operations, monster visual config, and heavy read-model views should not inflate the first learner practice load.

Cut bootstrap payload size. This is also server hardening. Large JSON is both CPU and UX cost.

Measure Core Web Vitals. Track LCP, INP, and CLS on the production app. Web.dev’s current thresholds are LCP within 2.5s, INP at 200ms or less, and CLS at 0.1 or less. ([web.dev][14])

Reduce render churn. Check global store patches and route-level renders. Avoid rerendering the whole app because audio state, toast state, or adult hub state changes.

Compress and size art. Monster assets should have fixed width/height to prevent layout shift, use modern formats where practical, and honour `prefers-reduced-motion`.

Avoid blocking practice on non-practice data. A learner should be able to start or continue practice even if Parent Hub history, admin panels, or visual config diagnostics are slow.

## 8. Server-side optimisation plan

The Worker README says the backend is now the production authority for sessions, learner access, subject commands, read models, protected audio, Parent Hub/Admin, and mutation safety. ([GitHub][12]) So optimise the Worker, not the browser, for canonical operations.

Server backlog:

Profile `/api/bootstrap`, `/api/subjects/:subjectId/command`, `/api/hubs/parent`, `/api/hubs/admin`, TTS routes, demo reset, and auth callback routes separately.

Index around real query shapes. Especially learner + subject + created_at/recent, event feed pagination, practice session lookup, mutation receipts, account memberships, and published content release lookup.

Stop parsing large JSON unless necessary. Summary read models should be small, denormalised, and safe.

Minimise transaction work. Subject command transactions should mutate state, append events, update read models, and return the read model, but avoid extra full scans.

Protect against retry amplification. A slow D1 path plus impatient clients can turn into a storm. Add client-side backoff, server-side clear status codes, and request idempotency.

Make capacity scripts part of regular verification. The repo already has capacity and smoke scripts in `package.json`; hardening should make them routine, not emergency tools. ([GitHub][2])

## 9. Testing hardening: the missing layer is flow confidence

You already have a lot of Node tests. What I’d add is more “this must never break again” coverage.

Must-have regression suites:

Golden path per subject: start/resume session, submit correct, submit wrong, see feedback, finish, reload, progress preserved.

Access matrix: parent/admin/ops/demo/signed-out/viewer/member/owner, across hub reads and writes.

Stale-write matrix: two tabs, same learner, same action; two tabs, different learners; refresh between answer and feedback.

Visual smoke: screenshot compare at the Playwright viewport sizes already configured.

Accessibility smoke: keyboard-only practice, modal focus restore, screen-reader labels for feedback, buttons, forms, toasts, and loading states.

Production audit: raw source denied, forbidden tokens absent from bundle, answer-bearing fields absent from bootstrap/read models, headers present.

Capacity smoke: high-history bootstrap, command submit, parent hub recent sessions, admin hub audit lookup.

TTS smoke: remote provider success, provider failure fallback, slow loading state, stop/replay, browser-provider explicit mode, no key leakage.

## 10. Polish backlog: small fixes that matter

These are the kinds of small tasks that make the app feel finished:

Make all loading states skeletons or quiet cards, not blank jumps.

Give every empty state one plain sentence and one available action.

Audit every button label for consistency: “Start”, “Continue”, “Try again”, “Finish”, “Back to dashboard”.

Make destructive actions require clear confirmation and show what will be deleted.

Make saving states optimistic only where rollback is safe; otherwise show “Saving…” and disable repeated clicks.

Ensure route changes stop audio and clear subject-local transient state.

Make error messages human: “We couldn’t save that answer. Your progress is safe; try again.” Not raw `500` or JSON.

Standardise cards, spacing, border radius, shadows, and mobile paddings. Do not redesign, just remove inconsistency.

Add reduced-motion alternatives for monster animations and toast transitions.

Check all colour contrast, especially muted text on soft panels.

## 11. Suggested first hardening sprint

I’d start with this order:

1. Run and document baseline: `npm test`, `npm run check`, `npm run audit:client`, `npm run audit:production`, browser smoke, and current production payload sizes.

2. Implement or finish the high-history bootstrap capacity harness.

3. Bound `/api/bootstrap` and prove it no longer scales with full history.

4. Add request telemetry for bootstrap and subject commands.

5. Fix client retry pressure: single-flight hydrate, bounded stale-write recovery, no retry storms.

6. Add security headers, initially CSP report-only if enforcement breaks current scripts.

7. Split cache policy so hashed static assets cache long-term while HTML/API remain safe.

8. Add Playwright visual smoke for the five configured viewport sizes.

9. Do a mobile-first UI polish pass on practice, modals, toasts, dashboard, Parent Hub, and Admin/Operations.

10. Lock every fixed bug with a small regression test or production audit assertion.

The centre of gravity should be reliability. The app already has ambitious architecture; now it needs the boring work that makes it trustworthy.

[1]: https://github.com/fol2/ks2-mastery "GitHub - fol2/ks2-mastery: KS2 Unified — browser-side React prototype of a KS2 (UK Year 5/6) study app · GitHub"
[2]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/package.json "raw.githubusercontent.com"
[3]: https://github.com/fol2/ks2-mastery/tree/main/tests "ks2-mastery/tests at main · fol2/ks2-mastery · GitHub"
[4]: https://github.com/fol2/ks2-mastery/blob/main/docs/plans/2026-04-25-001-fix-bootstrap-cpu-capacity-plan.md "ks2-mastery/docs/plans/2026-04-25-001-fix-bootstrap-cpu-capacity-plan.md at main · fol2/ks2-mastery · GitHub"
[5]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/playwright.config.mjs "raw.githubusercontent.com"
[6]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/styles/app.css "raw.githubusercontent.com"
[7]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/main.js "raw.githubusercontent.com"
[8]: https://github.com/fol2/ks2-mastery/blob/main/docs/mutation-policy.md "ks2-mastery/docs/mutation-policy.md at main · fol2/ks2-mastery · GitHub"
[9]: https://github.com/fol2/ks2-mastery/blob/main/docs/full-lockdown-runtime.md "ks2-mastery/docs/full-lockdown-runtime.md at main · fol2/ks2-mastery · GitHub"
[10]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/_headers "raw.githubusercontent.com"
[11]: https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html?utm_source=chatgpt.com "Content Security Policy - OWASP Cheat Sheet Series"
[12]: https://github.com/fol2/ks2-mastery/tree/main/worker "ks2-mastery/worker at main · fol2/ks2-mastery · GitHub"
[13]: https://developers.cloudflare.com/workers/static-assets/headers/?utm_source=chatgpt.com "Headers - Workers"
[14]: https://web.dev/articles/vitals?utm_source=chatgpt.com "Web Vitals | Articles"
