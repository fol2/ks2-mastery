import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const cwd = process.cwd();

function getPrimaryWorktree() {
  const result = spawnSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('git worktree list failed');
  // First block is always the primary worktree
  const firstBlock = result.stdout.trim().split('\n\n')[0];
  return firstBlock.split('\n')[0].replace(/^worktree\s+/, '').trim();
}

function fileHash(p) {
  if (!existsSync(p)) return null;
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

function npmInstall() {
  const result = spawnSync('npm', ['install'], { stdio: 'inherit' });
  process.exit(result.status ?? 0);
}

const primary = getPrimaryWorktree();

if (resolve(cwd) === resolve(primary)) {
  console.log('Primary worktree — running npm install normally.');
  npmInstall();
}

const localModules = resolve(cwd, 'node_modules');
const primaryModules = resolve(primary, 'node_modules');

// Already set up (real dir or existing symlink)
if (lstatSync(localModules, { throwIfNoEntry: false })) {
  console.log('node_modules already present — skipping.');
  process.exit(0);
}

// Fall back to real install if package files diverge from primary
const pkgSame = fileHash(`${cwd}/package.json`) === fileHash(`${primary}/package.json`);
const lockSame = fileHash(`${cwd}/package-lock.json`) === fileHash(`${primary}/package-lock.json`);

if (!pkgSame || !lockSame) {
  console.log('package files differ from primary worktree — running npm install.');
  npmInstall();
}

if (!existsSync(primaryModules)) {
  console.log('Primary node_modules not found — running npm install.');
  npmInstall();
}

symlinkSync(primaryModules, localModules);
console.log(`Symlinked node_modules → ${primaryModules}`);
