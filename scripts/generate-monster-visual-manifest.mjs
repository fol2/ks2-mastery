import { createHash } from 'node:crypto';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const assetsDir = path.join(rootDir, 'assets', 'monsters');
const outputFile = path.join(rootDir, 'src', 'platform', 'game', 'monster-asset-manifest.js');
const assetFilePattern = /^(.+)-(b[0-9]+)-([0-9]+)\.(320|640|1280)\.webp$/;

async function listDirectories(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function assetKey(monsterId, branch, stage) {
  return `${monsterId}-${branch}-${stage}`;
}

function assetSrc(monsterId, branch, stage, size) {
  return `./assets/monsters/${monsterId}/${branch}/${monsterId}-${branch}-${stage}.${size}.webp`;
}

const assets = [];
const monsters = [];

for (const monsterId of await listDirectories(assetsDir)) {
  const monsterDir = path.join(assetsDir, monsterId);
  const branches = [];
  for (const branch of await listDirectories(monsterDir)) {
    const branchDir = path.join(monsterDir, branch);
    const files = await readdir(branchDir);
    const byStage = new Map();
    for (const file of files) {
      const match = file.match(assetFilePattern);
      if (!match) continue;
      const [, fileMonsterId, fileBranch, rawStage, rawSize] = match;
      if (fileMonsterId !== monsterId || fileBranch !== branch) {
        throw new Error(`Unexpected monster asset filename ${path.relative(rootDir, path.join(branchDir, file))}`);
      }
      const stage = Number(rawStage);
      const size = Number(rawSize);
      if (!byStage.has(stage)) byStage.set(stage, new Set());
      byStage.get(stage).add(size);
    }

    const stages = Array.from(byStage.keys()).sort((left, right) => left - right).map((stage) => {
      const sizes = Array.from(byStage.get(stage)).sort((left, right) => left - right);
      const srcBySize = Object.fromEntries(sizes.map((size) => [String(size), assetSrc(monsterId, branch, stage, size)]));
      const entry = {
        key: assetKey(monsterId, branch, stage),
        monsterId,
        branch,
        stage,
        sizes,
        srcBySize,
      };
      assets.push(entry);
      return entry;
    });

    branches.push({
      id: branch,
      stages: stages.map(({ key, stage, sizes }) => ({ key, stage, sizes })),
    });
  }
  monsters.push({ id: monsterId, branches });
}

assets.sort((left, right) => left.key.localeCompare(right.key));

const manifestHash = createHash('sha256')
  .update(JSON.stringify({ assets, monsters }))
  .digest('hex')
  .slice(0, 24);

const manifest = {
  schemaVersion: 1,
  manifestHash,
  assetRoot: './assets/monsters',
  monsters,
  assets,
};

const source = `// Generated from assets/monsters via scripts/generate-monster-visual-manifest.mjs\n// Do not edit by hand. Regenerate when monster asset folders change.\n\nexport const MONSTER_ASSET_MANIFEST = Object.freeze(${JSON.stringify(manifest, null, 2)});\n\nexport const MONSTER_ASSET_MANIFEST_HASH = ${JSON.stringify(manifestHash)};\n`;

await mkdir(path.dirname(outputFile), { recursive: true });
await writeFile(outputFile, source, 'utf8');
console.log(`Generated ${path.relative(rootDir, outputFile)} with ${assets.length} monster assets.`);
