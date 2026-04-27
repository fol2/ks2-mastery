# Punctuation browser journey specs (Phase 4 U8 / R9)

Six end-to-end journey scripts that exercise the **real child critical-path
click flow** against a live dev server. These are the regression-catching
surface the Phase 3 SSR harness missed: every assertion in
`tests/react-punctuation-scene.test.js` passed while the mission-dashboard
CTA `onClick` dispatched the wrong action. Journey specs here click with a
real browser — the wire cannot lie.

## Driver priority

Per user preference (`~/.claude/CLAUDE.md`): **bb-browser > agent-browser >
(Playwright deferred)**. The runner probes drivers in that order and the
first one that responds to `status` (bb-browser) or `--help` (agent-browser)
wins. Playwright is not loaded; the existing Playwright golden-path specs
under `tests/playwright/` are orthogonal and keep working.

## Six journeys (bb-browser driver)

| Script                              | Journey                                                  |
| ----------------------------------- | -------------------------------------------------------- |
| `smart-review.mjs`                  | Home -> Punctuation -> Smart Review CTA -> Q1 renders    |
| `wobbly-spots.mjs`                  | Home -> Punctuation -> Wobbly Spots CTA -> Q1 OR left-setup |
| `gps-check.mjs`                     | Home -> Punctuation -> GPS Check CTA -> Q1 with test banner |
| `map-guided-skill.mjs`              | Map -> skill card -> Practise this -> Guided Q1          |
| `summary-back-while-pending.mjs`    | Summary Back enabled + navigates from Summary (P7-U11)   |
| `reward-parity-visual.mjs`          | Map + Setup + Summary reward-state parity                |

## Playwright golden-path coverage (P7-U10)

The Playwright golden-path test at `tests/playwright/punctuation-golden-path.playwright.test.mjs`
exercises the **full Worker-backed journey** through the real Worker/D1 command
path in a Chromium browser. This is separate from the bb-browser journeys above
and runs via `npx playwright test`. Coverage added in P7-U10:

| Test name                                          | Journey                                                      |
| -------------------------------------------------- | ------------------------------------------------------------ |
| complete journey (star consistency)                 | Home -> landing -> session -> summary -> landing -> refresh -> map; star meter consistency across all surfaces |
| refresh after full journey (SH2-U2 regression)     | Full session -> summary -> reload -> clean setup; zombie-phase guard |
| map opens from landing and closes back to landing   | Landing -> open map -> map body visible -> close map -> landing CTA |
| telemetry disabled journey                          | Session to summary with telemetry rate-limited via route intercept; no console errors |

**Star consistency contract (§5.5):** After completing a round, Star counts
from the landing monster meters, the summary monster meters, and the map
monster-group headers must agree (within display rounding). The test reads
`.punctuation-monster-meter-count` elements on each surface and compares
parsed numeric values.

**Mobile-390 baseline:** All Playwright tests run against the `mobile-390`
project (390 x 844 viewport). Desktop/tablet matrix deferred to follow-up.

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

# Pick a non-default port if 4173 is busy. The runner ALSO auto-probes
# for the next free port from `JOURNEY_PORT` upward if the given port
# EADDRINUSEs (FINDING E review fix), so collisions with the Playwright
# `webServer` on 4173 no longer block a local journey run.
JOURNEY_PORT=41777 npm run journey
```

### Parallel safety

`npm run journey` is **serial-only**. A single bb-browser daemon + single
dev server port back the run, so two concurrent invocations in the same
shell profile will step on each other's CDP. If you must run two journey
flights side-by-side, set distinct `JOURNEY_PORT` values and use separate
bb-browser profiles — that's a future-unit exercise, not something today's
scaffold supports.

The runner:
1. Probes for bb-browser, then agent-browser. If the probe fails AND a
   stale `~/.bb-browser/browser/cdp-port` exists, the runner deletes it
   and probes once more (FINDING G auto-recovery). Exits non-zero with
   install instructions if neither driver responds.
2. Starts `tests/helpers/browser-app-server.js` on the port from
   `JOURNEY_PORT` (default 4173) with `--with-worker-api` so `/api/*` and
   `/demo` route through the in-memory worker. Auto-increments on
   EADDRINUSE up to `port + 10` (FINDING E).
3. For each journey: invokes the journey's default export which
   (per FINDING A fix) calls `clearStorage()` FIRST, THEN `open('/demo')`
   so the fresh auth cookie survives downstream API calls.
4. Writes a screenshot to
   `tests/journeys/artefacts/<journey>-<step>.png` per asserted step.
5. On failure: captures a final screenshot, logs the selector / step that
   failed, records the failure in the structured JSON manifest, and
   exits non-zero.

### Structured output

At the end of every run the runner writes
`tests/journeys/artefacts/results.json` AND emits a final stdout line
starting with `JOURNEY_RESULT_JSON ` followed by the same payload. Agent
scrapers can parse either. Shape:

```json
{
  "driver": "bb-browser",
  "origin": "http://127.0.0.1:4173",
  "generatedAt": "2026-04-26T12:34:56.000Z",
  "results": [
    { "name": "smart-review", "ok": true,  "status": "PASS", "ms": 4321, "screenshots": ["smart-review-01-home.png", "smart-review-02-setup.png", "smart-review-03-session-q1.png"] },
    { "name": "summary-back-while-pending", "ok": null, "status": "SKIPPED", "reason": "pending-command injection requires dev-only stall endpoint; deferred to follow-on unit", "ms": 12, "screenshots": [] },
    { "name": "wobbly-spots", "ok": false, "status": "FAIL", "ms": 7890, "error": "selector timeout: .subject-grid", "screenshots": ["wobbly-spots-_failure.png"] }
  ]
}
```

`ok` is `true` for PASS, `false` for FAIL, `null` for SKIP. Exit code is
non-zero only when at least one FAIL is present.

## Seeding

Journey specs reuse the **existing `/demo` endpoint** exposed by
`tests/helpers/worker-server.js` (via `browser-app-server.js
--with-worker-api`). No new dev-mode endpoint is introduced. The demo
session primes learner state, sets the auth cookie, and redirects to `/` —
the same path the Playwright golden-path uses.

## Summary-Back-while-pending (P7-U11 — now ACTIVE)

`summary-back-while-pending.mjs` is now **ACTIVE** (was SKIPPED per P4-U8
fix B). The dev-only stall endpoint shipped in P7-U9
(`stall-punctuation-command` in `tests/helpers/fault-injection.mjs`).

The journey drives a real Punctuation session to Summary via the
Worker-backed dev server and asserts:

1. The Back button is present, not `disabled`, not `aria-disabled="true"`.
2. The "Start again" and "Open Map" mutation buttons exist.
3. Clicking Back navigates to Setup or home grid (Summary disappears).

The deeper pending-state proof — injecting a stall fault so a command is
genuinely in flight while asserting button states — lives in the Playwright
suite at `tests/playwright/punctuation-pending-navigation.playwright.test.mjs`.
Playwright supports per-request header interception via `page.route()` which
is required to attach the `x-ks2-fault-opt-in` header that activates the
fault hook. The bb-browser / agent-browser drivers used by journeys do not
support request interception, so the journey exercises the wiring invariant
while Playwright exercises the full pending-state contract.

## Artefacts hygiene

- `tests/journeys/artefacts/` is gitignored (both `artefacts/` and the
  historical `artifacts/` spelling). Screenshots never land in the tree.
- The driver adapter's `clearStorage()` primes a page on the target
  origin, then wipes cookies + localStorage + sessionStorage. Callers
  invoke it BEFORE `open('/demo')` (FINDING A order).
- Retention: the runner prunes files older than 7 days at start so the
  directory does not grow unbounded without a cron dependency.
- Seeding goes through the `/demo` endpoint, not bb-browser `eval`, to
  avoid JS evaluation against real-session localStorage.

## Debugging

- **bb-browser daemon wedged** ("Daemon did not start in time / Chrome
  CDP is reachable, but the daemon process failed to initialize"): the
  runner now detects the startup failure, deletes
  `~/.bb-browser/browser/cdp-port`, and retries once (FINDING G). If
  that doesn't clear it, close any manually-opened Chrome windows
  launched via bb-browser and re-run.
- **CDP port busy**: see above — auto-recovery handles the common case.
- **Dev server already running on 4173**: the runner auto-probes the
  next port (4174, 4175 ...) up to +10. You can also reuse via
  `BROWSER_APP_SERVER_ORIGIN` or pick a specific `JOURNEY_PORT`.
- **View artefacts**: after a run, open
  `tests/journeys/artefacts/<journey>-*.png` in order — the screenshots
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
  _runner.mjs                          <- driver probe + orchestration + JSON results
  _driver.mjs                          <- bb-browser / agent-browser adapter
  _server.mjs                          <- browser-app-server lifecycle + port auto-probe
  smart-review.mjs                     <- journey 1
  wobbly-spots.mjs                     <- journey 2
  gps-check.mjs                        <- journey 3
  map-guided-skill.mjs                 <- journey 4
  summary-back-while-pending.mjs       <- journey 5 (ACTIVE; P7-U11 pending navigation proof)
  reward-parity-visual.mjs             <- journey 6
  artefacts/                           <- gitignored screenshot + results.json output
```

## Review follow-on (2026-04-26)

The four-reviewer convergent pass surfaced eight findings; all convergent
items were addressed in the follow-on commit:

- **A (BLOCKER-tier)**: Reorder journey pre-amble — `clearStorage` FIRST,
  `open('/demo')` SECOND — plus removal of the implicit wipe from
  `_driver.mjs open()`. This was the root cause of the "daemon wedged
  mid-run" the worker attributed to bb-browser flakiness.
- **B (HIGH)**: `summary-back-while-pending` emits `SKIPPED` instead of
  false-green PASS on a tautological assertion.
- **C (HIGH)**: `reward-parity-visual` strict-asserts mastered count
  equality between Setup and Map (was log-only).
- **D (MEDIUM)**: GPS chip gained `punctuation-test-mode-banner` +
  `data-gps-banner` hooks (1-line src edit). Dead-branch selectors
  dropped from `wobbly-spots` + `summary-back-while-pending`.
- **E (HIGH)**: `_server.mjs` auto-probes ports on EADDRINUSE.
- **F (HIGH)**: Runner emits structured JSON (`results.json` +
  `JOURNEY_RESULT_JSON` stdout line).
- **G (MEDIUM)**: Wedge auto-recovery (remove `cdp-port` + retry once).
- **H (MEDIUM)**: Serial-only documented; `JOURNEY_PORT` override
  clarified.

Deferred (acknowledged, not fixed):

- Driver probe cache invalidation (re-runs per invocation — acceptable).
- Single-journey `--list` mode (nice-to-have).
- ~~Dev-only stall endpoint for `summary-back-while-pending` real
  assertion (future unit).~~ — Shipped in P7-U9; journey activated in
  P7-U11. Full pending-state proof in Playwright suite.
