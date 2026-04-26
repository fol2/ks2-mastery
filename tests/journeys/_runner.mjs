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
//   1. Probes for a browser driver (bb-browser -> agent-browser).
//   2. Starts the dev server once (or reuses an external one).
//   3. Ensures `tests/journeys/artifacts/` exists.
//   4. Invokes each selected journey's default export — a
//      `run({ driver, origin, artifacts, log, assert })` async function.
//   5. Prints a pass/fail tally. Exits non-zero on any failure.
//
// Windows-safe CLI entrypoint guard (see `project_windows_nodejs_pitfalls`
// memory): `pathToFileURL(process.argv[1]).href` is compared to
// `import.meta.url` — cross-platform, no `file://${argv[1]}` concat.

import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { probeDriver, openDriver } from './_driver.mjs';
import { startJourneyServer } from './_server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = path.join(HERE, 'artifacts');

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

async function runOne({ journey, driver, origin }) {
  const log = buildLog(journey.name);
  const assert = buildAssert(journey.name);
  const artifactFor = (step) =>
    path.join(ARTIFACTS_DIR, `${journey.name}-${step}.png`);

  const mod = await import(new URL(journey.module, import.meta.url));
  if (typeof mod.default !== 'function') {
    throw new Error(
      `Journey ${journey.name} must export a default async function.`,
    );
  }
  const session = await openDriver({ driver, origin });

  // Wrap the session's screenshot to make artifact capture non-fatal.
  // Chrome occasionally returns "Page.captureScreenshot: Internal error"
  // when the target is mid-navigation or has lost CDP — those are
  // artifact-layer problems, not journey-contract problems. We never
  // want a missing PNG to mask the real assertion outcome. Asserts stay
  // loud; screenshots whisper.
  const rawScreenshot = session.screenshot.bind(session);
  session.screenshot = async (filePath) => {
    try {
      await rawScreenshot(filePath);
    } catch (err) {
      log(`screenshot SKIPPED (${filePath}): ${err.message.trim().slice(0, 120)}`);
    }
  };

  try {
    await mod.default({
      driver: session,
      origin,
      artifacts: { path: artifactFor, dir: ARTIFACTS_DIR },
      log,
      assert,
    });
    log('PASS');
  } catch (err) {
    log(`FAIL: ${err.message}`);
    // Capture a final screenshot on failure if the driver is still alive.
    try {
      await rawScreenshot(artifactFor('_failure'));
      log(`Failure screenshot: ${artifactFor('_failure')}`);
    } catch {
      // ignore — driver may have died
    }
    throw err;
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

  const driver = await probeDriver();
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
    process.exit(2);
  }
  // eslint-disable-next-line no-console
  console.log(`[journey] driver: ${driver.name} (${driver.cli})`);

  await mkdir(ARTIFACTS_DIR, { recursive: true });

  const server = await startJourneyServer();
  // eslint-disable-next-line no-console
  console.log(`[journey] server: ${server.origin}`);

  const results = [];
  try {
    for (const journey of selected) {
      const start = Date.now();
      try {
        await runOne({ journey, driver, origin: server.origin });
        results.push({ name: journey.name, ok: true, ms: Date.now() - start });
      } catch (err) {
        results.push({
          name: journey.name,
          ok: false,
          ms: Date.now() - start,
          error: err.message,
        });
      }
    }
  } finally {
    await server.close();
  }

  // eslint-disable-next-line no-console
  console.log('\n[journey] summary:');
  for (const r of results) {
    const label = r.ok ? 'PASS' : 'FAIL';
    // eslint-disable-next-line no-console
    console.log(`  ${label}  ${r.name}  (${r.ms}ms)` + (r.error ? `  — ${r.error}` : ''));
  }
  const failed = results.filter((r) => !r.ok).length;
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
