import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const wranglerArgs = process.argv.slice(2);

if (!wranglerArgs.length) {
  console.error('Usage: node scripts/wrangler-oauth.mjs <wrangler args...>');
  process.exit(2);
}

const env = { ...process.env };
const isWorkersBuild = env.WORKERS_CI === '1';

// Keep deploy/check installs and Wrangler custom builds from downloading
// Playwright browser binaries. This replaces the old `.npmrc`
// `playwright_skip_browser_download=true` project config, which newer npm
// versions warn about as an unknown key.
env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD || '1';

if (!isWorkersBuild) {
  delete env.CLOUDFLARE_API_TOKEN;
}

const configuredWranglerBin = env.WRANGLER_OAUTH_WRANGLER_JS
  ? path.resolve(env.WRANGLER_OAUTH_WRANGLER_JS)
  : '';
const localWranglerBin = configuredWranglerBin || path.resolve('node_modules', 'wrangler', 'bin', 'wrangler.js');
const hasLocalWrangler = existsSync(localWranglerBin);
const command = hasLocalWrangler
  ? process.execPath
  : (process.platform === 'win32' ? 'npx.cmd' : 'npx');
const args = hasLocalWrangler
  ? [localWranglerBin, ...wranglerArgs]
  : ['wrangler', ...wranglerArgs];

const result = spawnSync(command, args, {
  stdio: 'inherit',
  env,
  // Prefer the local Wrangler JS entrypoint so Windows preserves argv for
  // flags such as `--command "SELECT ..."` instead of shell-splitting SQL.
  shell: !hasLocalWrangler && process.platform === 'win32',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
