// SH2-U10: adult-surface lazy-load Playwright scene.
//
// Asserts that a learner-first practice flow does NOT download the
// adult-only Admin Hub / Parent Hub / Monster Visual Config chunks.
// The split is driven by `React.lazy()` in `src/app/App.jsx`, which
// `esbuild --splitting` emits as separate `.js` chunks under
// `src/bundles/` (see `scripts/build-client.mjs`).
//
// Contract (plan lines 730-736):
//   - Happy path (split): a demo learner navigating the practice
//     flow only requests the main `app.bundle.js` + any eagerly-
//     imported shared chunks. The adult-surface lazy-entry chunks
//     are NOT fetched.
//   - Regression oracle: if a future refactor accidentally static-
//     imports AdminHubSurface / ParentHubSurface from a learner-first
//     module (e.g., HomeSurface picks one up through a utility re-
//     export), esbuild folds the adult surface back into the main
//     chunk. In that case the split chunks either disappear from
//     `dist/public/src/bundles/` OR the initial request list no
//     longer contains a distinct adult-surface chunk name. We fail
//     with a pointed message so the audit tells the reviewer which
//     chunk collapsed.
//
// Demo learners cannot open the Parent/Admin hubs today (demo
// accounts lack `canViewParentHub`, and Admin has no URL route — see
// `tests/playwright/visual-baselines.playwright.test.mjs` review
// blocker-5 for the deferral rationale). We therefore assert only
// the learner-first half of the contract: the adult chunks are ON
// DISK after build but NOT in the initial bundle request list.
// SH2-U11's demo-seed harness is the natural place to extend this
// scene with a real Parent/Admin navigation hop.

import { test, expect } from '@playwright/test';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BUNDLES_DIR = path.join(REPO_ROOT, 'dist', 'public', 'src', 'bundles');

test.describe('SH2-U10 adult-surface lazy-load', () => {
  test('learner-first navigation does not download Admin Hub / Parent Hub chunks', async ({ page }) => {
    // ---- Preconditions: the split chunks must exist on disk ----
    // If `splitting: true` in `scripts/build-client.mjs` was reverted,
    // the adult-surface chunks collapse back into `app.bundle.js` and
    // the disk-level check below fails with a pointed message.
    let bundleFiles;
    try {
      bundleFiles = await readdir(BUNDLES_DIR);
    } catch (err) {
      test.skip(true, `SH2-U10 preconditions unmet: could not list ${BUNDLES_DIR} (${err?.message || err}). Run \`npm run build\` first.`);
      return;
    }
    const jsChunks = bundleFiles.filter((file) => file.endsWith('.js'));
    const adminChunks = jsChunks.filter((file) => /AdminHubSurface/.test(file));
    const parentChunks = jsChunks.filter((file) => /ParentHubSurface/.test(file));
    expect(adminChunks.length, `expected at least one AdminHubSurface-*.js chunk in ${BUNDLES_DIR}; got: ${jsChunks.join(', ')}`).toBeGreaterThan(0);
    expect(parentChunks.length, `expected at least one ParentHubSurface-*.js chunk in ${BUNDLES_DIR}; got: ${jsChunks.join(', ')}`).toBeGreaterThan(0);

    // ---- Observe the initial bundle requests during a learner-first flow ----
    const requestedBundlePaths = new Set();
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/src/bundles/') && url.pathname.endsWith('.js')) {
        requestedBundlePaths.add(url.pathname);
      }
    });

    await page.goto('/demo', { waitUntil: 'networkidle' });
    // The subject grid is the first surface a demo learner sees on
    // `/demo` — if it is not visible the bootstrap failed and the
    // rest of the assertion would be meaningless.
    await expect(page.locator('.subject-grid')).toBeVisible({ timeout: 15_000 });

    // ---- Assertion 1: the main entry bundle was loaded ----
    const mainRequested = Array.from(requestedBundlePaths).some((path) => path === '/src/bundles/app.bundle.js');
    expect(
      mainRequested,
      `expected /src/bundles/app.bundle.js to be fetched; got: ${Array.from(requestedBundlePaths).sort().join(', ')}`,
    ).toBe(true);

    // ---- Assertion 2: neither adult-only chunk was fetched ----
    // Chunk names contain `AdminHubSurface` / `ParentHubSurface` (esbuild
    // uses the dynamic-import source filename as the chunk stem).
    const adultRequests = Array.from(requestedBundlePaths).filter((path) => (
      /AdminHubSurface/.test(path) || /ParentHubSurface/.test(path)
    ));
    expect(
      adultRequests,
      `learner-first flow unexpectedly fetched adult-surface chunks: ${adultRequests.join(', ')}. `
      + 'If this regresses, check that src/app/App.jsx still uses React.lazy for Admin/Parent hubs '
      + 'and that no learner-first module static-imports them.',
    ).toEqual([]);
  });
});
