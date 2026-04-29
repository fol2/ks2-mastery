import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('deploy script gives the production audit enough Cloudflare propagation time', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const deployScript = pkg.scripts?.deploy || '';

  assert.match(deployScript, /node \.\/scripts\/wrangler-oauth\.mjs deploy/);
  assert.match(deployScript, /npm run audit:production -- --skip-local/);

  const retries = Number(deployScript.match(/--retries\s+(\d+)/)?.[1] || 0);
  const retryDelayMs = Number(deployScript.match(/--retry-delay-ms\s+(\d+)/)?.[1] || 0);

  // Cloudflare Workers Assets can serve the previous SEO/static asset view for
  // a short period after Wrangler reports a successful deploy. Keep this gate
  // strict, but give the edge enough time to converge before failing the build.
  assert.ok(retries >= 30, `expected at least 30 production-audit retries, got ${retries}`);
  assert.ok(retryDelayMs >= 5000, `expected at least 5000 ms retry delay, got ${retryDelayMs}`);
});
