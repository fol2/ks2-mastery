import { build } from 'esbuild';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'src', 'bundles');

await mkdir(outputDir, { recursive: true });

await build({
  entryPoints: [path.join(rootDir, 'src/surfaces/home/index.jsx')],
  outfile: path.join(outputDir, 'home.bundle.js'),
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  jsx: 'automatic',
  jsxImportSource: 'react',
  loader: { '.js': 'jsx' },
  minify: true,
  sourcemap: false,
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  logLevel: 'info',
});
