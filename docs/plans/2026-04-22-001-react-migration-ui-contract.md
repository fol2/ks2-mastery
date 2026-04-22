---
title: "React Migration UI Contract"
date: 2026-04-22
status: active
parent_plan: "docs/plans/2026-04-22-001-refactor-full-stack-react-conversion-plan.md"
---

# React Migration UI Contract

This contract pins the user-facing behaviour that must survive the full React conversion. It is not a redesign brief. React ports should preserve current learning, adult, and operator flows first, then simplify implementation once parity is proven.

## Route Hierarchy

| Route | Primary user | Primary question | Primary action | Secondary diagnostics | Rescue path |
|---|---|---|---|---|---|
| Auth | Parent or operator | Can I get back into my synced account? | Sign in, register, or start social sign-in | Session-required and provider failure feedback | Stay on auth with live error feedback |
| Dashboard | Learner with adult nearby | What should I practise next? | Start Spelling or open a subject card | Learner switch, persistence state, Codex, Parent Hub entry | Retry sync, profile settings, local-only continuation |
| Profile settings | Parent or learner | Is the learner profile correct? | Add, edit, delete, reset, import, or export learner data | Current learner, storage trust, destructive confirmation | Back to dashboard without mutating data |
| Codex | Learner | What have I earned? | Inspect monsters and mastery | Creature lightbox, mastery stage, empty collection state | Back to dashboard |
| Parent Hub | Parent | How is this child doing? | Review focus, recent sessions, strengths, and export | Read-only membership label, selected readable learner, stale/partial hub data | Select another readable learner or return dashboard |
| Admin / Operations | Admin or operator | Is the platform healthy? | Review content status, audit, roles, and learner diagnostics | Role save state, content validation, selected learner diagnostics | Retry load, return dashboard, avoid changing writable learner by surprise |
| Subject route | Learner | What is this subject asking me to do now? | Follow the active subject scene | Subject runtime fallback, breadcrumb, persistence state | Retry subject tab or back to dashboard |
| Spelling setup | Learner | Which spelling round should I start? | Choose mode, year pool, and round length | Empty content, disabled trouble drill, word bank entry | Back to dashboard or browse word bank |
| Spelling session | Learner | What word did I hear? | Replay, type, submit, continue, skip where allowed | TTS in-flight/failure, shortcut hints, progress dots | Runtime fallback stays subject-local; answer input regains focus |
| Spelling summary | Learner | What happened in the round? | Start another round or drill mistakes | Monster rewards, mistake list, empty summary | Back to setup or dashboard |
| Word bank | Learner or parent | Which spellings need attention? | Search, filter, open explainer or drill | Status legend, year pool totals, no-match state | Clear filters or back to setup |
| Word detail modal | Learner | What does this word mean, or can I drill it safely? | Replay, switch tab, drill answer, close | Missing explanation/sentence, incorrect/correct drill state | Escape or close returns focus to the originating word |

## State Matrix

| Surface | Loading | Empty | Error | Disabled | Partial/degraded | Success |
|---|---|---|---|---|---|---|
| Boot/auth | Session check pending | No active session | Credential/provider failure with `role="alert"` | Busy form controls during submit | Remote unavailable falls back to local/degraded copy only through repository state | React auth or React app root owns the full screen |
| Persistence | Pending writes visible | Local-only with no pending writes | Degraded banner with debug details | Retry hidden when remote is unavailable | Local cache ahead of remote, stale write, idempotency reuse | Remote sync trusted and no banner needed |
| Dashboard | Learner model available before subject cards render | Zero writable learners shows honest no-learner state | Subject dashboard stats can degrade per subject | Parent Hub hidden when not permitted | Persistence chip shows local cache or degraded state | Subject cards, CTA, Codex, learner switcher render from React |
| Profile settings | Current learner read from controller snapshot | No learner disables edit/delete/reset/export | Import/export/reset failures surface as feedback or confirmation refusal | Destructive actions require confirmation | Memory-only storage keeps trust copy visible | Save, add, import, export, reset, delete flow through controller |
| Parent Hub | Worker payload loading | No readable learners | Route-level error card | Read-only learner blocks writes | Stale/partial payload keeps diagnostics labelled | Selected readable learner and export entry points render |
| Admin / Operations | Worker payload loading | Empty audit/accounts/content rows | Route-level error card or role save failure | Non-admin cannot save account roles | Partial content validation and selected learner diagnostics stay visible | Content status, account roles, and support summary render |
| Subject route | Active subject and service resolved | Placeholder subject foundation card | Subject-local runtime fallback | Non-live subjects cannot start a real engine | Persistence banner and runtime boundary can coexist | Breadcrumb, top nav, and active subject scene render |
| Spelling setup | Content snapshot read | No eligible words or no trouble words | Subject message feedback | SATs/options and trouble drill disabled when invalid | Published content count or degraded persistence still visible | Start modes, pools, round length, and word bank entry render |
| Spelling session | Audio can be warming or in flight | No session returns to setup | TTS/action failure is contained to subject fallback | Input disabled while awaiting advance | Replay failure does not break the shell | Answer stays hidden before submit, input autofocus, submit/continue works |
| Spelling summary | Monster celebration can be delayed | No mistakes still gives next action | Runtime fallback if render fails | Drill mistakes disabled when no mistakes | Reward/toast queues can appear after summary | Summary card, mistake drill, and next round affordances render |
| Word bank | Analytics snapshot read | No words match filters | Runtime fallback only for active subject | Unavailable drill/replay controls disabled by data | Search/year/status filters combine without mutating scheduler | Rows, legend, modal open, and counts match current render |
| Word detail modal | Replay can be in flight | Missing explanation/sentence has explicit copy | Drill incorrect feedback is local only | Correct drill disables submit until try again | Drill never writes scheduler progress | Focus trap, Escape close, return focus, no answer leak in drill prompt |

## Interaction Contract

- React components call controller actions or subject route callbacks; they do not write repositories, subject state, or learner state directly.
- Browser-owned compatibility handlers may remain only for legacy HTML adapters during Units 3-6.
- Spelling answer inputs are controlled by the browser form state in the legacy adapter until Unit 6, then by React state with the same form data shape.
- `Esc` replays in a live spelling session, `Shift+Esc` replays slowly, `Alt+S` skips only when the session allows it, and `Alt+K` focuses the answer box.
- In the word bank, `Esc` closes the word detail modal first; without a modal it returns from the word bank to setup.
- The word detail modal traps Tab, focuses the first drill input or control, and returns focus to the originating word pill on close.
- TTS replay failure must surface as contained feedback or subject runtime fallback. It must not break dashboard, learner switching, toasts, or other routes.
- The answer word must not be visible in the live question scene or drill prompt before the learner checks the answer.
- Monster celebration overlays remain delayed until the spelling session completes.

## Accessibility Acceptance

| Area | Required contract |
|---|---|
| Route focus | Primary scene inputs or headings are the first focus target after a route/scene change where practical. |
| Error feedback | Auth and app-level React failures use `role="alert"` and `aria-live="polite"`. |
| Subject failure | Runtime fallback names the subject/tab, labels the failure as contained, and offers retry plus dashboard exit. |
| Modal | Word detail modal uses `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, close label, tab roles, Escape close, and focus return. |
| Forms | Email/password use autocomplete. Learner and spelling drill inputs disable browser spellcheck/autocorrect where the answer itself is being assessed. |
| Keyboard | All current shortcuts remain owned by Spelling only while the spelling route is active. |
| Reduced motion | Celebration, replay glow, modal animation, and hover transitions remain usable when `prefers-reduced-motion` is set. |
| Live updates | Persistence, auth failures, TTS failure, and subject runtime fallback are announced without moving focus unexpectedly. |

## Responsive Matrix

| Viewport | Routes to check | Acceptance |
|---|---|---|
| `360x740` | Auth, dashboard, Spelling session, word modal | Primary action is reachable without horizontal scrolling; answer input and replay controls do not overlap. |
| `390x844` | Dashboard, Spelling setup/session, word bank | Subject cards, setup controls, and word filters wrap cleanly. |
| `768x1024` | Dashboard, profile, Parent Hub, Admin / Operations | Two-column/tablet layouts keep readable card order and learner controls reachable. |
| `1024` wide | Dashboard, Codex, Parent Hub, Admin / Operations | Route chrome, diagnostics, and cards fit without clipping or text overrun. |
| `1440` wide | Dashboard, Codex, Spelling setup/session, hubs | Wide layouts preserve hierarchy without stretching controls beyond useful scan width. |

## Unit 2.5 Evidence

- `tests/react-spelling-scene-spike.test.js` pins the Spelling session, modal drill, shortcut, answer-leak, and TTS-failure containment contract.
- `tests/react-accessibility-contract.test.js` pins route, auth, app error, and modal accessibility semantics.
- `tests/browser-react-migration-smoke.test.js` is an opt-in browser smoke using the gstack browser runner against built `dist/public`.
- `playwright.config.mjs` defines the target viewport matrix for future Playwright tests once `@playwright/test` is available in the workspace.
- Current local evidence favours continuing with esbuild for Units 3-7: the single React app bundle builds, public static asset assertions pass, and no Worker route or D1 contract had to change.

## Strategic Gate

The migration should continue to Units 3-7 because Units 1 and 2 produced a narrow controller seam plus a single React root without changing Worker APIs or repository semantics. Unit 2.5 adds concrete checks for the riskiest learner interactions before broad route porting. The remaining risk is Spelling focus/TTS/modal parity, so Unit 6 must keep the spike tests green and should add browser coverage as each scene moves from HTML adapter to React component.

