import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'dist', 'public');
const tmpDir = path.join(rootDir, 'dist', 'public.tmp');

const entries = [
  'index.html',
  'styles',
  'src',
  'assets',
];

await rm(tmpDir, { recursive: true, force: true });
await mkdir(tmpDir, { recursive: true });

for (const entry of entries) {
  await cp(path.join(rootDir, entry), path.join(tmpDir, entry), {
    recursive: true,
    force: true,
  });
}

await rm(outputDir, { recursive: true, force: true });
await cp(tmpDir, outputDir, { recursive: true, force: true });
await rm(tmpDir, { recursive: true, force: true });
