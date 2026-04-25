import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'dist', 'public');
const tmpDir = path.join(rootDir, 'dist', 'public.tmp');

const entries = [
  '_headers',
  'favicon.ico',
  'index.html',
  'manifest.webmanifest',
  'styles',
  'assets',
];

const filterPublicFiles = source => {
  const base = path.basename(source);
  const relative = path.relative(rootDir, source).split(path.sep).join('/');
  const retiredClientFiles = new Set([
    'src/bundles/home.bundle.js',
    'src/surfaces/home/index.jsx',
    'src/surfaces/home/TopNav.jsx',
  ]);

  if (base === '.DS_Store') {
    return false;
  }

  if (retiredClientFiles.has(relative)) {
    return false;
  }

  if (relative === 'src/generated' || relative.startsWith('src/generated/')) {
    return false;
  }

  const appIconPng = relative.startsWith('assets/app-icons/')
    && relative.endsWith('.png')
    && base !== 'app-icon-source.png';
  if (relative.startsWith('assets/') && relative.endsWith('.png') && !appIconPng) {
    return false;
  }

  return true;
};

// Wrap the public-mirror pipeline in try/catch + process.exit(1) for the
// same reason as build-bundles.mjs: under certain Windows + execFileSync
// stdio-ignore conditions, an unhandled async rejection from a chained
// step can settle after the entry's sync body finishes and let Node exit 0,
// hiding the failure from CI. The explicit guard keeps failures loud.
try {
  await rm(tmpDir, { recursive: true, force: true });
  await mkdir(tmpDir, { recursive: true });

  for (const entry of entries) {
    await cp(path.join(rootDir, entry), path.join(tmpDir, entry), {
      recursive: true,
      force: true,
      filter: filterPublicFiles,
    });
  }

  await mkdir(path.join(tmpDir, 'src', 'bundles'), { recursive: true });
  await cp(
    path.join(rootDir, 'src', 'bundles', 'app.bundle.js'),
    path.join(tmpDir, 'src', 'bundles', 'app.bundle.js'),
    { force: true },
  );

  // Render-effect CSS lives next to its effect modules so visual + behaviour
  // stay co-located. Mirror it into the public styles directory so the
  // existing single-link pattern in index.html continues to work without a
  // new module-aware loader.
  await cp(
    path.join(rootDir, 'src', 'platform', 'game', 'render', 'effects', 'effects.css'),
    path.join(tmpDir, 'styles', 'effects.css'),
    { force: true },
  );

  await rm(outputDir, { recursive: true, force: true });
  await cp(tmpDir, outputDir, { recursive: true, force: true });
  await rm(tmpDir, { recursive: true, force: true });
} catch (error) {
  console.error(error);
  process.exit(1);
}
