import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');
const lockDir = path.join(distDir, 'public-build.lock');

async function acquireBuildLock(timeoutMs = 120000) {
  const startedAt = Date.now();
  while (true) {
    try {
      await mkdir(lockDir);
      return async () => {
        await rm(lockDir, { recursive: true, force: true });
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Timed out waiting for build-bundles lock at ${lockDir}`);
      }
      await sleep(100);
    }
  }
}

// Awaited dynamic imports + process.exit(1) are deliberate: static top-level
// imports can let an async rejection in a chained script (e.g. esbuild
// failing inside build-client.mjs) settle after this entry's sync body
// finishes, leaving Node to exit 0 and hiding the failure from CI. The
// explicit await/catch guarantees a non-zero exit on any step failure.
let releaseBuildLock = async () => {};
try {
  // Node's test runner can execute build-facing tests concurrently.
  // Share the public-build lock so bundle generation cannot race the
  // public mirror step or another bundle generation process.
  await mkdir(distDir, { recursive: true });
  releaseBuildLock = await acquireBuildLock();
  await import('./generate-monster-visual-manifest.mjs');
  await import('./build-client.mjs');
  await releaseBuildLock();
  releaseBuildLock = async () => {};
} catch (error) {
  await releaseBuildLock().catch(() => {});
  console.error(error);
  process.exit(1);
}
