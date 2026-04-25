import { spawnSync } from 'node:child_process';

const wranglerArgs = process.argv.slice(2);

if (!wranglerArgs.length) {
  console.error('Usage: node scripts/wrangler-oauth.mjs <wrangler args...>');
  process.exit(2);
}

const env = { ...process.env };
const isWorkersBuild = env.WORKERS_CI === '1';

if (!isWorkersBuild) {
  delete env.CLOUDFLARE_API_TOKEN;
}

// `shell: true` is required on Windows for Node >= 20 to spawn `.cmd`
// files: without it, spawnSync rejects with EINVAL (a security hardening
// introduced in the Node 20.x line against CVE-2024-27980). Shell-quoting
// wranglerArgs is safe here because they come from package.json scripts,
// not user input. On POSIX, `shell: true` keeps behaviour unchanged for
// our arg shape.
const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(npxBin, ['wrangler', ...wranglerArgs], {
  stdio: 'inherit',
  env,
  shell: true,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
