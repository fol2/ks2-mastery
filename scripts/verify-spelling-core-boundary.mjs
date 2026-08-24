import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifySpellingCoreBoundary } from './lib/spelling-core-boundary.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const report = await verifySpellingCoreBoundary({ repoRoot });

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
