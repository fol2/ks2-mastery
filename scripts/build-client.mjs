import { build } from 'esbuild';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'src', 'bundles');

await mkdir(outputDir, { recursive: true });

const result = await build({
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
  metafile: true,
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  logLevel: 'info',
});

await writeFile(
  path.join(outputDir, 'app.bundle.meta.json'),
  `${JSON.stringify(result.metafile, null, 2)}\n`,
);
