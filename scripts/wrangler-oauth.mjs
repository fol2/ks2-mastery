import { spawnSync } from 'node:child_process';

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

const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(npxBin, ['wrangler', ...wranglerArgs], {
  stdio: 'inherit',
  env,
  // Windows needs shell mode to launch npx.cmd. POSIX must keep argv intact
  // so wrangler flags such as `--command "SELECT ..."` are not split by /bin/sh.
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
