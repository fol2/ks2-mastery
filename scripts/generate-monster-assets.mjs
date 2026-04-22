import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, 'assets', 'monsters');
const monsters = ['inklet', 'glimmerbug', 'phaeton'];
const branches = ['b1', 'b2'];
const stages = [0, 1, 2, 3, 4];
const sizes = [320, 640, 1280];
const webpQuality = '88';

// Two background-removal modes:
//   connectivity: floodfill from the four corners. Safe default — only removes
//                 background pixels reachable from the edges, so enclosed areas
//                 inside the character stay opaque.
//   color:        sample the top-left pixel and make every similar-coloured
//                 pixel transparent. Also clears hollow/enclosed bg regions,
//                 but may eat into the character if its palette overlaps the bg.
const MODES = {
  connectivity: { fuzz: '8%' },
  color: { fuzz: '10%' },
};
const DEFAULT_MODE = 'connectivity';

const cli = parseArgs(process.argv.slice(2));
const mode = cli.mode ?? DEFAULT_MODE;
if (!MODES[mode]) {
  throw new Error(`Unknown --mode="${mode}". Use one of: ${Object.keys(MODES).join(', ')}`);
}
const { fuzz } = MODES[mode];
const only = cli.only ? parseOnly(cli.only) : null;

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const m = arg.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    out[m[1]] = m[2] ?? true;
  }
  return out;
}

// Accepts "inklet-b1-3" or "inklet/b1/3" to target a single asset.
function parseOnly(value) {
  const parts = value.split(/[-/]/).filter(Boolean);
  if (parts.length !== 3) {
    throw new Error(`--only expects "monster-branch-stage" (e.g. inklet-b1-3), got "${value}"`);
  }
  const [monsterId, branch, stageStr] = parts;
  const stage = Number(stageStr);
  if (!monsters.includes(monsterId)) throw new Error(`Unknown monster "${monsterId}"`);
  if (!branches.includes(branch)) throw new Error(`Unknown branch "${branch}"`);
  if (!stages.includes(stage)) throw new Error(`Unknown stage "${stage}"`);
  return { monsterId, branch, stage };
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}\n${stderr || stdout}`));
    });
  });
}

async function imageDimensions(filePath) {
  const { stdout } = await run('magick', [filePath, '-format', '%w %h', 'info:']);
  const [width, height] = stdout.trim().split(/\s+/).map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`Could not read image dimensions for ${filePath}`);
  }
  return { width, height };
}

async function sampleCornerColor(filePath) {
  const { stdout } = await run('magick', [filePath, '-format', '%[pixel:p{10,10}]', 'info:']);
  return stdout.trim();
}

async function makeTransparentConnectivity(sourcePath, targetPath) {
  const { width, height } = await imageDimensions(sourcePath);
  const maxX = width - 1;
  const maxY = height - 1;

  await run('magick', [
    sourcePath,
    '-alpha', 'set',
    '-fuzz', fuzz,
    '-fill', 'none',
    '-draw', 'color 0,0 floodfill',
    '-draw', `color ${maxX},0 floodfill`,
    '-draw', `color 0,${maxY} floodfill`,
    '-draw', `color ${maxX},${maxY} floodfill`,
    'PNG32:' + targetPath,
  ]);
}

async function makeTransparentColor(sourcePath, targetPath) {
  const bg = await sampleCornerColor(sourcePath);
  await run('magick', [
    sourcePath,
    '-alpha', 'set',
    '-fuzz', fuzz,
    '-transparent', bg,
    'PNG32:' + targetPath,
  ]);
}

const makeTransparentPng = mode === 'color' ? makeTransparentColor : makeTransparentConnectivity;

async function writeWebp(sourcePath, targetPath, size, scratchDir) {
  const resizedPath = path.join(scratchDir, `${path.basename(targetPath, '.webp')}.${size}.png`);
  await run('magick', [
    sourcePath,
    '-resize', `${size}x${size}!`,
    'PNG32:' + resizedPath,
  ]);
  await run('cwebp', [
    '-quiet',
    '-q', webpQuality,
    '-alpha_q', '100',
    '-m', '6',
    '-metadata', 'none',
    resizedPath,
    '-o', targetPath,
  ]);

  const { stdout } = await run('magick', [targetPath, '-format', '%m %w %h %[channels]', 'info:']);
  const expected = `WEBP ${size} ${size}`;
  if (!stdout.startsWith(expected) || !stdout.includes('a')) {
    throw new Error(`Unexpected generated asset metadata for ${targetPath}: ${stdout.trim()}`);
  }
}

async function generateAsset(monsterId, branch, stage, scratchDir) {
  const sourcePath = path.join(sourceDir, monsterId, branch, `${monsterId}-${branch}-${stage}.png`);
  const transparentPath = path.join(scratchDir, `${monsterId}-${branch}-${stage}.transparent.png`);
  await makeTransparentPng(sourcePath, transparentPath);

  for (const size of sizes) {
    const targetPath = path.join(sourceDir, monsterId, branch, `${monsterId}-${branch}-${stage}.${size}.webp`);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeWebp(transparentPath, targetPath, size, scratchDir);
  }
}

const scratchDir = await mkdtemp(path.join(os.tmpdir(), 'ks2-monster-assets-'));
let generated = 0;

console.log(`Mode: ${mode} (fuzz ${fuzz})${only ? `, only ${only.monsterId}-${only.branch}-${only.stage}` : ''}`);

try {
  if (only) {
    await generateAsset(only.monsterId, only.branch, only.stage, scratchDir);
    generated += sizes.length;
  } else {
    for (const monsterId of monsters) {
      for (const branch of branches) {
        for (const stage of stages) {
          await generateAsset(monsterId, branch, stage, scratchDir);
          generated += sizes.length;
        }
      }
    }
  }
} finally {
  await rm(scratchDir, { recursive: true, force: true });
}

console.log(`Generated ${generated} monster webp assets.`);
