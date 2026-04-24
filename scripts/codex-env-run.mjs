import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

const args = process.argv.slice(2);
const commandIndex = args[0] === '--' ? 1 : 0;
const command = args[commandIndex];
const commandArgs = args.slice(commandIndex + 1);

if (!command) {
  console.error('Usage: node scripts/codex-env-run.mjs -- <command> [args...]');
  process.exit(2);
}

try {
  loadEnvFile(resolve(process.cwd(), '.env'));
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const result = spawnSync(command, commandArgs, {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
