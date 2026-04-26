// P2 U5 — Write-site inventory regression check.
//
// Per the plan's critical-constraints section: "Add a lint rule (ESLint custom
// rule or CI grep check) that fails build if a new raw storage-write appears
// outside lock-wrapped entry points."
//
// This test enumerates the approved write sites. The assertion fires whenever
// `localStorage.setItem` or `saveJson` appears OUTSIDE the allow-list, prompting
// the contributor to route the new site through the lock-wrapped entry point
// (`writeData` in `src/platform/core/repositories/local.js`).
//
// Allow-list rationale:
//   - `src/platform/core/storage.js` — the `saveJson` primitive itself. Wrapped
//     by platform repositories; bare-storage tests are expected to call it.
//   - `src/platform/core/repositories/local.js` — the authoritative entry
//     point (`persistAll`). Every subject-scoped save routes here; this IS
//     the lock-wrapped path.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = new URL('..', import.meta.url).pathname.replace(/^\//, '');

// Normalise Windows paths so the allow-list matches regardless of platform.
function normalise(path) {
  return path.replace(/\\/g, '/');
}

const SEARCH_ROOTS = [
  'src/platform',
  'src/subjects/spelling',
];

// Files allowed to contain raw `localStorage.setItem` / `saveJson` calls.
// Every entry is a path suffix — the exact repo-root-relative path that
// ends with the listed substring passes.
const ALLOWED_PATHS = new Set([
  'src/platform/core/storage.js', // saveJson / loadJson primitive
  'src/platform/core/repositories/local.js', // the authoritative entry point
]);

function walkJs(root) {
  const results = [];
  try {
    const entries = readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(root, entry.name);
      if (entry.isDirectory()) {
        results.push(...walkJs(full));
      } else if (entry.isFile() && /\.(js|jsx|mjs|ts|tsx)$/.test(entry.name)) {
        results.push(full);
      }
    }
  } catch (_error) {
    /* Ignore — surface only positive grep hits. */
  }
  return results;
}

function findWriteSiteHits() {
  const hits = [];
  for (const root of SEARCH_ROOTS) {
    const absolute = join(REPO_ROOT, root);
    try {
      statSync(absolute);
    } catch (_error) {
      continue;
    }
    for (const path of walkJs(absolute)) {
      const text = readFileSync(path, 'utf8');
      // saveJson or localStorage.setItem (raw). `storage.setItem` on a
      // method of an injected adapter is fine — only the raw global counts.
      const pattern = /(localStorage\.setItem|\bsaveJson\()/;
      if (!pattern.test(text)) continue;
      hits.push(normalise(path));
    }
  }
  return hits;
}

test('U5 write-site inventory: no raw localStorage.setItem / saveJson outside the lock-wrapped allow-list', () => {
  const hits = findWriteSiteHits();
  const offenders = hits.filter((path) => {
    // Match any allow-listed suffix.
    for (const allowed of ALLOWED_PATHS) {
      if (path.endsWith(allowed)) return false;
    }
    return true;
  });
  assert.deepEqual(
    offenders,
    [],
    `Unexpected raw storage-write site(s): ${offenders.join(', ')}. ` +
    'Route new writes through the lock-wrapped entry point (src/platform/core/repositories/local.js::writeData) ' +
    'or update the ALLOWED_PATHS list in this test if the new site is intentionally bare-storage.',
  );
});
