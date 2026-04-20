import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'dist', 'public');
const tmpDir = path.join(rootDir, 'dist', 'public.tmp');

const entries = [
  'index.html',
  'styles',
  'assets',
];

const sourceFiles = [
  'src/main.js',
];

const filterPublicFiles = source => {
  const base = path.basename(source);

  if (base === '.DS_Store') {
    return false;
  }

  if (source.includes(`${path.sep}src${path.sep}generated${path.sep}`)) {
    return false;
  }

  return true;
};

await rm(tmpDir, { recursive: true, force: true });
await mkdir(tmpDir, { recursive: true });

for (const entry of entries) {
  await cp(path.join(rootDir, entry), path.join(tmpDir, entry), {
    recursive: true,
    force: true,
    filter: filterPublicFiles,
  });
}

for (const file of sourceFiles) {
  await mkdir(path.dirname(path.join(tmpDir, file)), { recursive: true });
  await cp(path.join(rootDir, file), path.join(tmpDir, file), {
    force: true,
    filter: filterPublicFiles,
  });
}

await rm(outputDir, { recursive: true, force: true });
await cp(tmpDir, outputDir, { recursive: true, force: true });
await rm(tmpDir, { recursive: true, force: true });
