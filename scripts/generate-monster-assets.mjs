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
const backgroundFuzz = '8%';
const webpQuality = '88';

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

async function makeTransparentPng(sourcePath, targetPath) {
  const { width, height } = await imageDimensions(sourcePath);
  const maxX = width - 1;
  const maxY = height - 1;

  await run('magick', [
    sourcePath,
    '-alpha', 'set',
    '-fuzz', backgroundFuzz,
    '-fill', 'none',
    '-draw', 'color 0,0 floodfill',
    '-draw', `color ${maxX},0 floodfill`,
    '-draw', `color 0,${maxY} floodfill`,
    '-draw', `color ${maxX},${maxY} floodfill`,
    'PNG32:' + targetPath,
  ]);
}

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

try {
  for (const monsterId of monsters) {
    for (const branch of branches) {
      for (const stage of stages) {
        await generateAsset(monsterId, branch, stage, scratchDir);
        generated += sizes.length;
      }
    }
  }
} finally {
  await rm(scratchDir, { recursive: true, force: true });
}

console.log(`Generated ${generated} monster webp assets.`);
