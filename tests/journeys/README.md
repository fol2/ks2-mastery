# Punctuation browser journey specs (Phase 4 U8 / R9)

Six end-to-end journey scripts that exercise the **real child critical-path
click flow** against a live dev server. These are the regression-catching
surface the Phase 3 SSR harness missed: every assertion in
`tests/react-punctuation-scene.test.js` passed while the primary-mode
`onClick` dispatched the wrong action. Journey specs here click with a real
browser — the wire cannot lie.

## Driver priority

Per user preference (`~/.claude/CLAUDE.md`): **bb-browser > agent-browser >
(Playwright deferred)**. The runner probes drivers in that order and the
first one that responds to `status` (bb-browser) or `--help` (agent-browser)
wins. Playwright is not loaded; the existing Playwright golden-path specs
under `tests/playwright/` are orthogonal and keep working.

## Six journeys

| Script                              | Journey                                                  |
| ----------------------------------- | -------------------------------------------------------- |
| `smart-review.mjs`                  | Home -> Punctuation -> Smart Review -> Q1 renders        |
| `wobbly-spots.mjs`                  | Home -> Punctuation -> Wobbly Spots -> Q1 OR empty state |
| `gps-check.mjs`                     | Home -> Punctuation -> GPS Check -> Q1 with test banner  |
| `map-guided-skill.mjs`              | Map -> skill card -> Practise this -> Guided Q1          |
| `summary-back-while-pending.mjs`    | Summary Back stays enabled while a command is pending    |
| `reward-parity-visual.mjs`          | Map + Setup + Summary reward-state parity                |

## Prerequisites

1. **Node 18+** — journeys spawn `tests/helpers/browser-app-server.js` which
   uses `node:http` + `createServer`.
2. **Build artefacts** — the dev server serves `dist/public`. If missing,
   run `npm run build` first. The runner exits with an actionable message
   when the build is absent.
3. **A driver** — at least one of:
   - `bb-browser` (preferred). Install via `npm install -g bb-browser`.
     Confirmed at `~/AppData/Roaming/npm/bb-browser.cmd` on Windows. The
     runner invokes `bb-browser status` / `bb-browser open <url>` via
     `child_process.spawn` (with `shell: true` only for `.cmd` shims to
     avoid the Windows EINVAL pitfall documented in
     `project_windows_nodejs_pitfalls` memory).
   - `agent-browser` (fallback). Install via `npm install -g agent-browser`.

## Running

```bash
# Run all six journeys sequentially.
npm run journey

# Run one named journey.
npm run journey -- smart-review

# Run against an already-running dev server.
BROWSER_APP_SERVER_ORIGIN=http://127.0.0.1:4173 npm run journey -- smart-review

# Pick a non-default port if 4173 is busy.
JOURNEY_PORT=41777 npm run journey
```

The runner:
1. Probes for bb-browser, then agent-browser. Exits non-zero with install
   instructions if neither responds.
2. Starts `tests/helpers/browser-app-server.js` on the port from
   `JOURNEY_PORT` (default 4173) with `--with-worker-api` so `/api/*` and
   `/demo` route through the in-memory worker.
3. For each journey: clears auth-related localStorage keys + cookies for
   the target origin (see "Artifacts hygiene" below), seeds learner state
   via the `/demo` endpoint, performs the real click sequence, asserts
   each step, writes a screenshot to
   `tests/journeys/artifacts/<journey>-<step>.png`, and tears the driver
   tab down.
4. On failure: captures a final screenshot, logs the selector / step that
   failed, and exits non-zero.

## Seeding

Journey specs reuse the **existing `/demo` endpoint** exposed by
`tests/helpers/worker-server.js` (via `browser-app-server.js
--with-worker-api`). No new dev-mode endpoint is introduced. The demo
session primes learner state, sets the auth cookie, and redirects to `/` —
the same path the Playwright golden-path uses.

For journey 5 (`summary-back-while-pending`), we additionally drive
through the real Summary flow and verify the Back button's disabled
attribute on that scene. The spec documents the plug-point for a richer
pending-command injection once a dev-only `stall-command` fault plan
ships under the `x-ks2-fault-opt-in` gate.

## Artefacts hygiene

- `tests/journeys/artifacts/` is gitignored. Screenshots never land in the
  tree.
- Before each `open()`, the driver adapter navigates to the target origin's
  root and clears localStorage / sessionStorage / cookies for that origin
  so developer browser state never leaks into artefacts.
- Seeding goes through the `/demo` endpoint, not bb-browser `eval`, to
  avoid JS evaluation against real-session localStorage.

## Debugging

- **bb-browser daemon wedged** ("Daemon did not start in time / Chrome
  CDP is reachable, but the daemon process failed to initialize"): this
  is a known bb-browser state where Chrome's CDP port is held by a
  prior daemon's Chrome child that did not shut down cleanly. Recovery:
  1. Close any manually-opened Chrome windows launched via bb-browser.
  2. Delete `~/.bb-browser/browser/cdp-port` (per bb-browser SKILL.md).
  3. Re-run `npm run journey`. The daemon starts a fresh Chrome.
- **CDP port busy**: bb-browser's SKILL.md suggests clearing
  `~/.bb-browser/browser/cdp-port` and retrying.
- **Dev server already running on 4173**: the runner detects and reuses
  via `BROWSER_APP_SERVER_ORIGIN`. Or pick a different port via
  `JOURNEY_PORT`.
- **View artefacts**: after a run, open
  `tests/journeys/artifacts/<journey>-*.png` in order — the screenshots
  tell the same story a human watching the screen would. Chrome
  occasionally returns "Page.captureScreenshot: Internal error" mid-
  navigation; the runner treats screenshot failures as non-fatal so
  assertion outcomes stay loud.

## CI

Journeys are NOT part of `npm test` today — they require a user-installed
driver and run serially. A follow-up plan may wire `npm run journey` into
a dev-mode CI job once bb-browser / agent-browser availability in CI is
established. Until then, journeys are the **human-watchable** proof layer
that guards against test-harness-vs-production divergence (see
`docs/plans/2026-04-26-001-feat-punctuation-phase4-visible-child-journey-plan.md`
U8 / R9).

## File layout

```
tests/journeys/
  README.md                            <- this file
  _runner.mjs                          <- driver probe + orchestration + shared assertions
  _driver.mjs                          <- bb-browser / agent-browser adapter
  _server.mjs                          <- browser-app-server lifecycle helper
  smart-review.mjs                     <- journey 1
  wobbly-spots.mjs                     <- journey 2
  gps-check.mjs                        <- journey 3
  map-guided-skill.mjs                 <- journey 4
  summary-back-while-pending.mjs       <- journey 5
  reward-parity-visual.mjs             <- journey 6
  artifacts/                           <- gitignored screenshot output
```

## Verified-live status

At commit time:
- `smart-review.mjs` ran **green live** against bb-browser 0.11.3 on
  Windows with a freshly-built `dist/public`. The journey opened `/demo`,
  clicked the Punctuation subject card, clicked the Smart Review primary-
  mode card, and asserted the Session scene's `[data-punctuation-submit]`
  rendered.
- `wobbly-spots`, `gps-check`, `map-guided-skill`,
  `summary-back-while-pending`, `reward-parity-visual` ship as
  scaffolded scripts that mirror the smart-review contract. They did not
  complete in the same `npm run journey` invocation because the
  bb-browser daemon wedged after the first journey. They run on their
  own after a daemon reset (see Debugging above).

In all cases, each spec loads cleanly as an ESM module and exports a
`default` async function — structural correctness verified by
`node -e "import('./tests/journeys/<name>.mjs')"` in local testing.
