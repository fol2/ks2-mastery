// Fresh-worktree preflight: fails fast with an actionable message when
// node_modules is missing. Git worktrees do not share node_modules with
// the primary checkout, so the first `npm test` in a new worktree would
// otherwise produce a cryptic ERR_MODULE_NOT_FOUND stack from deep inside
// a test file. Catching it here keeps the signal clear for anyone
// starting work in a fresh worktree.
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

// Sentinel set, not exhaustive. Pick devDependencies that (a) are imported
// during `npm test` (directly or transitively via a bundler step) and (b)
// have zero same-repo fallbacks -- so a missing install produces an
// actionable, non-cryptic failure instead of a deep stacktrace. Adding more
// packages here is cheap (one `access` call each); keep the list small
// enough that a contributor can eyeball it against package.json. Iterating
// devDependencies dynamically was considered and rejected: it couples this
// script to package.json parsing and would flag pure build-only deps that
// `npm test` does not need.
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
