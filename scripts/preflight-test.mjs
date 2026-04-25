// Fresh-worktree preflight: fails fast with an actionable message when
// node_modules is missing. Git worktrees do not share node_modules with
// the primary checkout, so the first `npm test` in a new worktree would
// otherwise produce a cryptic ERR_MODULE_NOT_FOUND stack from deep inside
// a test file. Catching it here keeps the signal clear for anyone
// starting work in a fresh worktree.
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const REQUIRED_PACKAGES = ['react', 'esbuild'];

async function isInstalled(packageName) {
  const pkgJson = path.join('node_modules', packageName, 'package.json');
  try {
    await access(pkgJson, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

const missing = [];
for (const pkg of REQUIRED_PACKAGES) {
  if (!await isInstalled(pkg)) {
    missing.push(pkg);
  }
}

if (missing.length > 0) {
  console.error(
    `Missing node_modules (${missing.join(', ')}) — run "npm install" from this worktree root before "npm test". Git worktrees do not share node_modules with the primary checkout.`,
  );
  process.exit(1);
}
