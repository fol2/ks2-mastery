import { build } from 'esbuild';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'src', 'bundles');

await mkdir(outputDir, { recursive: true });

await build({
  entryPoints: [path.join(rootDir, 'src/app/entry.jsx')],
  outfile: path.join(outputDir, 'app.bundle.js'),
  bundle: true,
  format: 'esm',
  target: ['es2022'],
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
