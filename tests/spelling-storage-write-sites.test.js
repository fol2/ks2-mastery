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

// P2 U5 reviewer-feedback: broadened regex covers all raw storage-mutation
// sites — dot notation (`localStorage.setItem`), bracket notation
// (`localStorage['setItem']`, `sessionStorage["removeItem"]`), and both
// storage globals. Adds `removeItem` and `clear` so a contributor cannot
// sidestep the inventory by picking an under-matched verb. The previous
// regex missed both sessionStorage and bracket-notation access.
const RAW_WRITE_PATTERN = /\b(localStorage|sessionStorage)\s*(?:\.\s*(setItem|removeItem|clear)|\[\s*["'](setItem|removeItem|clear)["']\s*\])|\bsaveJson\s*\(/;

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
      // Raw storage writes: `.setItem` / `.removeItem` / `.clear` on
      // `localStorage` / `sessionStorage` (dot or bracket), or `saveJson`.
      // `storage.setItem` on an injected adapter remains fine — only the
      // raw global counts.
      if (!RAW_WRITE_PATTERN.test(text)) continue;
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

// P2 U5 reviewer-feedback: self-test the lint regex so a future edit that
// accidentally narrows the pattern is caught immediately. We run the
// RAW_WRITE_PATTERN against a fixture of known-bad and known-good sources
// and assert each matches / doesn't match as expected.
test('U5 write-site inventory: lint pattern self-test catches common bypass attempts', () => {
  const badFixtures = [
    'localStorage.setItem("k", "v")',
    'localStorage.removeItem("k")',
    'localStorage.clear()',
    'sessionStorage.setItem("k", "v")',
    'sessionStorage.removeItem("k")',
    'sessionStorage.clear()',
    "localStorage['setItem']('k', 'v')",
    'localStorage["removeItem"]("k")',
    'sessionStorage[\'clear\']()',
    'saveJson(storage, key, value)',
  ];
  for (const fixture of badFixtures) {
    assert.ok(
      RAW_WRITE_PATTERN.test(fixture),
      `RAW_WRITE_PATTERN should flag: ${fixture}`,
    );
  }
  const goodFixtures = [
    // Adapter-style access is fine: `storage.setItem` on an injected adapter
    // that routes through the lock-wrapped proxy.
    'storage.setItem(key, value)',
    'spellingStorage.setItem(key, value)',
    'this.storage.setItem(key, value)',
    // Reads and other non-mutation access are fine.
    'localStorage.getItem(key)',
    'localStorage.key(0)',
    'localStorage.length',
    'sessionStorage.getItem(key)',
  ];
  for (const fixture of goodFixtures) {
    assert.equal(
      RAW_WRITE_PATTERN.test(fixture),
      false,
      `RAW_WRITE_PATTERN should NOT flag: ${fixture}`,
    );
  }
});
