// tests/journeys/_server.mjs
//
// Phase 4 U8 / R9 — dev-server lifecycle helper for the six journey specs.
//
// Reuses the existing `tests/helpers/browser-app-server.js` which already
// binds `127.0.0.1:<port>` and (with `withWorkerApi: true`) routes
// `/api/*` + `/demo` through an in-memory worker — the same harness the
// Playwright golden-path scenes use.
//
// The runner starts the server once per `npm run journey` invocation and
// passes the origin into every journey spec's `run({ driver, origin })`.
// If `BROWSER_APP_SERVER_ORIGIN` is set, the helper skips spawning and
// reuses the existing server — useful when a developer is already running
// the dev server in another terminal.
//
// FINDING E fix (review follow-on): port auto-probe. The default port
// 4173 collides with `playwright.config.mjs` webServer (also on 4173).
// If the default is busy we increment until we find a free port or hit
// a sensible ceiling. The selected port is logged so an agent scraper
// can correlate it with the /demo host. `JOURNEY_PORT=<n>` still takes
// precedence — auto-probe only kicks in when the explicit port EADDRs.

import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startBrowserAppServer } from '../helpers/browser-app-server.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const DEFAULT_PUBLIC_DIR = path.join(ROOT, 'dist', 'public');

/**
 * Start the dev server or reuse an externally-managed one. Returns
 * `{ origin, close }`. `close` is a no-op if we didn't spawn.
 *
 * Port auto-probe: if `port` EADDRINUSEs (e.g. the Playwright webServer
 * on 4173 is up), we try port+1, port+2, ... up to `port + MAX_PROBE`.
 * Each attempt is logged so the agent log trail records which port won.
 */
export async function startJourneyServer({
  port = Number(process.env.JOURNEY_PORT) || 4173,
  reuse = process.env.BROWSER_APP_SERVER_ORIGIN,
} = {}) {
  if (reuse) {
    return { origin: reuse, close: async () => {} };
  }

  if (!existsSync(path.join(DEFAULT_PUBLIC_DIR, 'index.html'))) {
    throw new Error(
      `Journey server needs a built app at ${DEFAULT_PUBLIC_DIR}.\n` +
        '  Run `npm run build` first, or export BROWSER_APP_SERVER_ORIGIN to ' +
        'point at an already-running dev server.',
    );
  }

  const MAX_PROBE = 10;
  const tried = [];
  let lastErr = null;
  for (let offset = 0; offset < MAX_PROBE; offset += 1) {
    const attemptPort = port + offset;
    tried.push(attemptPort);
    try {
      const app = await startBrowserAppServer({
        publicDir: DEFAULT_PUBLIC_DIR,
        port: attemptPort,
        withWorkerApi: true,
      });
      if (offset > 0) {
        // eslint-disable-next-line no-console
        console.log(
          `[journey] port ${port} busy — auto-probed and bound ${attemptPort} ` +
          `(tried: ${tried.join(', ')})`,
        );
      }
      return app;
    } catch (err) {
      lastErr = err;
      const msg = err && (err.code || err.message || '');
      if (/EADDRINUSE/i.test(msg) || err?.code === 'EADDRINUSE') {
        // try next port
        continue;
      }
      // non-address error — re-throw.
      throw err;
    }
  }
  throw new Error(
    `Journey server: could not bind any of [${tried.join(', ')}]. ` +
    `Last error: ${lastErr && (lastErr.message || lastErr.code) || 'unknown'}. ` +
    'Set JOURNEY_PORT to a known-free port or kill the process holding 4173.',
  );
}
