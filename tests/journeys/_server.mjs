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

  const app = await startBrowserAppServer({
    publicDir: DEFAULT_PUBLIC_DIR,
    port,
    withWorkerApi: true,
  });
  return app;
}
