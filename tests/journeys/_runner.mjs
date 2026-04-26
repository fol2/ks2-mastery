// tests/journeys/_runner.mjs
//
// Phase 4 U8 / R9 — orchestrator for the six browser journey specs.
//
// Usage (wired via `npm run journey` — see package.json):
//   node tests/journeys/_runner.mjs                     -> run all six
//   node tests/journeys/_runner.mjs smart-review        -> run one
//   node tests/journeys/_runner.mjs smart-review gps-check -> run a subset
//
// The runner:
//   1. Probes for a browser driver (bb-browser -> agent-browser) with
//      wedge auto-recovery (FINDING G: if the daemon fails to start, we
//      delete `~/.bb-browser/browser/cdp-port` and retry ONCE).
//   2. Starts the dev server once (or reuses an external one).
//   3. Ensures `tests/journeys/artefacts/` exists + prunes files older
//      than 7 days (lightweight retention — no dependency on a cron).
//   4. Invokes each selected journey's default export — a
//      `run({ driver, origin, artefacts, log, assert })` async function.
//      A journey may return `{ status: 'SKIPPED', reason }` (FINDING B)
//      to signal deferred evidence — runner tags it SKIP, not PASS.
//   5. Prints a pass/fail/skip tally AND writes a structured JSON
//      manifest to `tests/journeys/artefacts/results.json` plus a final
//      stdout line `JOURNEY_RESULT_JSON {...}` for agent scrapers
//      (FINDING F).
//   6. Exits non-zero on any FAIL; SKIP never fails the run.
//
// Windows-safe CLI entrypoint guard (see `project_windows_nodejs_pitfalls`
// memory): `pathToFileURL(process.argv[1]).href` is compared to
// `import.meta.url` — cross-platform, no `file://${argv[1]}` concat.

import path from 'node:path';
import os from 'node:os';
import { mkdir, readdir, stat, unlink, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { probeDriver, openDriver } from './_driver.mjs';
import { startJourneyServer } from './_server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARTEFACTS_DIR = path.join(HERE, 'artefacts');
const SKIP_SENTINEL = Symbol.for('ks2.journey.skipped');

// The journey registry. Order matters for the default "run all" flow — we
// run the simplest happy path first so a failure there surfaces fast.
const JOURNEYS = [
  { name: 'smart-review', module: './smart-review.mjs' },
  { name: 'wobbly-spots', module: './wobbly-spots.mjs' },
  { name: 'gps-check', module: './gps-check.mjs' },
  { name: 'map-guided-skill', module: './map-guided-skill.mjs' },
  { name: 'summary-back-while-pending', module: './summary-back-while-pending.mjs' },
  { name: 'reward-parity-visual', module: './reward-parity-visual.mjs' },
];

function selectJourneys(argv) {
  if (argv.length === 0) return JOURNEYS.slice();
  const selected = [];
  for (const name of argv) {
    const j = JOURNEYS.find((x) => x.name === name);
    if (!j) {
      throw new Error(
        `Unknown journey: ${name}. Valid: ${JOURNEYS.map((x) => x.name).join(', ')}`,
      );
    }
    selected.push(j);
  }
  return selected;
}

function buildLog(journeyName) {
  return (message) => {
    const stamp = new Date().toISOString().slice(11, 19);
    // eslint-disable-next-line no-console
    console.log(`  [${stamp} ${journeyName}] ${message}`);
  };
}

function buildAssert(journeyName) {
  return (condition, message) => {
    if (!condition) {
      throw new Error(`[${journeyName}] assertion failed: ${message}`);
    }
  };
}

/**
 * Retention cleanup: remove artefact files older than 7 days. Keeps the
 * directory from silently growing without a cron dependency. Non-fatal —
 * a permissions glitch here never blocks a run.
 */
async function pruneOldArtefacts(dir, maxAgeDays = 7) {
  try {
    const now = Date.now();
    const cutoff = now - maxAgeDays * 24 * 60 * 60 * 1000;
    const entries = await readdir(dir);
    for (const name of entries) {
      const full = path.join(dir, name);
      try {
        const info = await stat(full);
        if (!info.isFile()) continue;
        if (info.mtimeMs < cutoff) {
          await unlink(full);
        }
      } catch {
        // per-file error — swallow; retention is best-effort.
      }
    }
  } catch {
    // directory may not exist on first run — fine.
  }
}

/**
 * FINDING G: detect a wedged bb-browser daemon and auto-recover ONCE.
 *
 * bb-browser's known failure mode: Chrome's CDP port is held by a prior
 * daemon's Chrome child that did not shut down cleanly. The recovery
 * documented in bb-browser's SKILL.md is to delete
 * `~/.bb-browser/browser/cdp-port` and retry. We encapsulate that here.
 *
 * Sequence:
 *   1. probeDriver() — best-case, driver is healthy.
 *   2. If probe reports unavailable AND we have a cdp-port file, remove
 *      it and probe again.
 *   3. If still unavailable, surface the original reason.
 */
async function probeDriverWithRecovery() {
  let driver = await probeDriver();
  if (driver.available) return driver;

  const cdpPortFile = path.join(os.homedir(), '.bb-browser', 'browser', 'cdp-port');
  if (existsSync(cdpPortFile)) {
    // eslint-disable-next-line no-console
    console.log('[journey] driver unavailable — attempting wedge recovery (rm cdp-port)');
    try {
      await rm(cdpPortFile, { force: true });
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({
        type: 'wedge-recovery',
        removed: 'cdp-port',
        retry: 1,
      }));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log(`[journey] wedge-recovery rm failed: ${err.message}`);
    }
    driver = await probeDriver();
  }
  return driver;
}

/**
 * FINDING G (extension): probe succeeds cheaply, but the daemon may
 * still be wedged — `bb-browser status` returns "Daemon not running"
 * without starting anything, and the wedge only surfaces on the first
 * `bb-browser open`. Do a lightweight pre-flight `open about:blank`;
 * if it fails with the known wedge signature, delete cdp-port and
 * retry ONCE. If the second pre-flight also fails, let the caller
 * surface the failure via normal per-journey reporting.
 */
async function preflightFirstOpen(driver, origin) {
  if (!driver || driver.name !== 'bb-browser') return;
  const cdpPortFile = path.join(os.homedir(), '.bb-browser', 'browser', 'cdp-port');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let session;
    try {
      session = await openDriver({ driver, origin });
      await session.open('about:blank');
      try { await session.close(); } catch { /* noop */ }
      return;
    } catch (err) {
      try { await session?.close?.(); } catch { /* noop */ }
      const msg = String(err.message || err);
      const isWedge = /Daemon did not start in time|Chrome CDP is reachable|failed to initialize/i.test(msg);
      if (!isWedge || attempt > 0) {
        // eslint-disable-next-line no-console
        console.warn(`[journey] preflight open failed: ${msg.trim().slice(0, 160)}`);
        return; // let per-journey failure handling surface the real problem
      }
      // eslint-disable-next-line no-console
      console.log('[journey] preflight open detected wedge — recovering (rm cdp-port)');
      try {
        await rm(cdpPortFile, { force: true });
        // eslint-disable-next-line no-console
        console.log(JSON.stringify({
          type: 'wedge-recovery',
          removed: 'cdp-port',
          trigger: 'preflight-open',
          retry: 1,
        }));
      } catch (rmErr) {
        // eslint-disable-next-line no-console
        console.log(`[journey] wedge-recovery rm failed: ${rmErr.message}`);
      }
      // Small back-off so the daemon's exit handlers finalise before we
      // try to spawn it again.
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function runOne({ journey, driver, origin }) {
  const log = buildLog(journey.name);
  const assert = buildAssert(journey.name);
  const artifactFor = (step) =>
    path.join(ARTEFACTS_DIR, `${journey.name}-${step}.png`);

  const mod = await import(new URL(journey.module, import.meta.url));
  if (typeof mod.default !== 'function') {
    throw new Error(
      `Journey ${journey.name} must export a default async function.`,
    );
  }
  const session = await openDriver({ driver, origin });

  // Wrap the session's screenshot to make artefact capture non-fatal.
  // Chrome occasionally returns "Page.captureScreenshot: Internal error"
  // when the target is mid-navigation or has lost CDP — those are
  // artefact-layer problems, not journey-contract problems. We never
  // want a missing PNG to mask the real assertion outcome. Asserts stay
  // loud; screenshots whisper.
  const rawScreenshot = session.screenshot.bind(session);
  const screenshotsTaken = [];
  session.screenshot = async (filePath) => {
    try {
      await rawScreenshot(filePath);
      screenshotsTaken.push(path.basename(filePath));
    } catch (err) {
      log(`screenshot SKIPPED (${filePath}): ${err.message.trim().slice(0, 120)}`);
    }
  };

  try {
    // FINDING B: support journeys that return a SKIP sentinel (shape
    // `{ status: 'SKIPPED', reason }` OR `{ [SKIP_SENTINEL]: true, ... }`).
    // A SKIP is NOT a failure; the runner tags it distinct from PASS.
    // Provide BOTH keys during the artifacts→artefacts transition so any
    // spec still destructuring `artifacts` keeps working alongside the
    // new UK-English `artefacts` spelling. Both handles point at the
    // same path helper.
    const artefactHandle = { path: artifactFor, dir: ARTEFACTS_DIR };
    const result = await mod.default({
      driver: session,
      origin,
      artefacts: artefactHandle,
      artifacts: artefactHandle,
      log,
      assert,
    });
    if (result && (result[SKIP_SENTINEL] === true || result.status === 'SKIPPED')) {
      log(`SKIPPED: ${result.reason || '(no reason given)'}`);
      return { status: 'SKIPPED', reason: result.reason || null, screenshots: screenshotsTaken };
    }
    log('PASS');
    return { status: 'PASS', screenshots: screenshotsTaken };
  } catch (err) {
    log(`FAIL: ${err.message}`);
    // Capture a final screenshot on failure if the driver is still alive.
    try {
      await rawScreenshot(artifactFor('_failure'));
      log(`Failure screenshot: ${artifactFor('_failure')}`);
      screenshotsTaken.push(`${journey.name}-_failure.png`);
    } catch {
      // ignore — driver may have died
    }
    throw Object.assign(err, { screenshotsTaken });
  } finally {
    try { await session.close(); } catch { /* noop */ }
  }
}

export async function main(argv) {
  const selected = selectJourneys(argv);
  // eslint-disable-next-line no-console
  console.log(
    `[journey] preparing ${selected.length} journey${selected.length === 1 ? '' : 's'}: ` +
      selected.map((s) => s.name).join(', '),
  );

  // Ensure artefacts dir exists + prune old files (FINDING H note +
  // retention acknowledged-not-fix → just done).
  await mkdir(ARTEFACTS_DIR, { recursive: true });
  await pruneOldArtefacts(ARTEFACTS_DIR, 7);

  // FINDING G: probe with wedge auto-recovery.
  const driver = await probeDriverWithRecovery();
  if (!driver.available) {
    // eslint-disable-next-line no-console
    console.error('[journey] no browser driver available.');
    // eslint-disable-next-line no-console
    console.error(driver.reason);
    // eslint-disable-next-line no-console
    console.error(
      '\nThe six journey specs under tests/journeys/*.mjs are well-structured\n' +
      'scaffolds ready to run once a driver is installed. See\n' +
      'tests/journeys/README.md for install instructions.',
    );
    // Emit structured JSON so an agent scraper can still parse the
    // no-driver failure state (FINDING F: always emit results.json).
    const payload = {
      driver: null,
      reason: driver.reason,
      results: [],
    };
    try {
      await writeFile(
        path.join(ARTEFACTS_DIR, 'results.json'),
        JSON.stringify(payload, null, 2) + '\n',
      );
    } catch { /* best-effort */ }
    // eslint-disable-next-line no-console
    console.log('JOURNEY_RESULT_JSON ' + JSON.stringify(payload));
    process.exit(2);
  }
  // eslint-disable-next-line no-console
  console.log(`[journey] driver: ${driver.name} (${driver.cli})`);

  const server = await startJourneyServer();
  // eslint-disable-next-line no-console
  console.log(`[journey] server: ${server.origin}`);

  // FINDING G extension: pre-flight first-open to trip any wedged
  // daemon early so we can recover before the first journey's wall-
  // clock budget is spent on a doomed open. about:blank keeps the
  // side-effect minimal and needs no auth.
  await preflightFirstOpen(driver, server.origin);

  const results = [];
  try {
    for (const journey of selected) {
      const start = Date.now();
      try {
        const outcome = await runOne({ journey, driver, origin: server.origin });
        if (outcome.status === 'SKIPPED') {
          results.push({
            name: journey.name,
            ok: null,
            status: 'SKIPPED',
            reason: outcome.reason,
            ms: Date.now() - start,
            screenshots: outcome.screenshots || [],
          });
        } else {
          results.push({
            name: journey.name,
            ok: true,
            status: 'PASS',
            ms: Date.now() - start,
            screenshots: outcome.screenshots || [],
          });
        }
      } catch (err) {
        results.push({
          name: journey.name,
          ok: false,
          status: 'FAIL',
          ms: Date.now() - start,
          error: err.message,
          screenshots: err.screenshotsTaken || [],
        });
      }
    }
  } finally {
    await server.close();
  }

  // eslint-disable-next-line no-console
  console.log('\n[journey] summary:');
  for (const r of results) {
    const label = r.status || (r.ok ? 'PASS' : 'FAIL');
    const tail = r.status === 'SKIPPED' ? `  — ${r.reason}` : r.error ? `  — ${r.error}` : '';
    // eslint-disable-next-line no-console
    console.log(`  ${label}  ${r.name}  (${r.ms}ms)${tail}`);
  }

  // FINDING F: emit machine-readable JSON.
  const payload = {
    driver: driver.name,
    origin: server.origin,
    results,
    generatedAt: new Date().toISOString(),
  };
  try {
    await writeFile(
      path.join(ARTEFACTS_DIR, 'results.json'),
      JSON.stringify(payload, null, 2) + '\n',
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[journey] results.json write failed: ${err.message}`);
  }
  // eslint-disable-next-line no-console
  console.log('JOURNEY_RESULT_JSON ' + JSON.stringify(payload));

  const failed = results.filter((r) => r.status === 'FAIL').length;
  if (failed > 0) process.exit(1);
}

// Cross-platform CLI entrypoint guard.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  main(argv).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[journey] fatal:', err.stack || err.message);
    process.exit(1);
  });
}
