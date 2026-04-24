import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const rootDir = process.cwd();
const sourceIcon = path.join(rootDir, 'assets', 'app-icons', 'app-icon-source.png');
const outputDir = path.join(rootDir, 'assets', 'app-icons');
const faviconPath = path.join(rootDir, 'favicon.ico');

const regularIcons = [
  { file: 'favicon-16.png', size: 16, source: 'favicon' },
  { file: 'favicon-32.png', size: 32, source: 'favicon' },
  { file: 'favicon-48.png', size: 48, source: 'favicon' },
  { file: 'apple-touch-icon.png', size: 180, source: 'regular' },
  { file: 'app-icon-192.png', size: 192, source: 'regular' },
  { file: 'app-icon-512.png', size: 512, source: 'regular' },
];

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

async function assertReferenceExists() {
  try {
    await access(sourceIcon);
  } catch {
    throw new Error(`App icon source is missing: ${path.relative(rootDir, sourceIcon)}`);
  }
}

async function generateMaster(targetPath, { subjectSize = 1024, verticalOffset = 0 } = {}) {
  await run('magick', [
    '-size', '1024x1024',
    'xc:none',
    '(',
      sourceIcon,
      '-resize', `${subjectSize}x${subjectSize}`,
    ')',
    '-gravity', 'center',
    '-geometry', `+0+${verticalOffset}`,
    '-composite',
    '-strip',
    '-depth', '8',
    `PNG32:${targetPath}`,
  ]);
}

async function resizeIcon(sourcePath, targetPath, size) {
  await run('magick', [
    sourcePath,
    '-resize', `${size}x${size}!`,
    '-strip',
    '-depth', '8',
    `PNG32:${targetPath}`,
  ]);

  const { stdout } = await run('magick', [
    targetPath,
    '-format', '%m %w %h %[channels]',
    'info:',
  ]);
  const expected = `PNG ${size} ${size}`;
  if (!stdout.startsWith(expected)) {
    throw new Error(`Unexpected app icon metadata for ${targetPath}: ${stdout.trim()}`);
  }

  const { stdout: alpha } = await run('magick', [
    targetPath,
    '-format', '%[fx:p{0,0}.a]',
    'info:',
  ]);
  if (Number.parseFloat(alpha.trim()) > 0.05) {
    throw new Error(`Expected a transparent app icon background for ${targetPath}.`);
  }
}

async function generateIco() {
  await run('magick', [
    path.join(outputDir, 'favicon-16.png'),
    path.join(outputDir, 'favicon-32.png'),
    path.join(outputDir, 'favicon-48.png'),
    faviconPath,
  ]);
}

await assertReferenceExists();
await mkdir(outputDir, { recursive: true });

const scratchDir = await mkdtemp(path.join(os.tmpdir(), 'ks2-app-icons-'));

try {
  const regularMaster = path.join(scratchDir, 'app-icon-master.png');
  const faviconMaster = path.join(scratchDir, 'app-icon-favicon-master.png');
  const maskableMaster = path.join(scratchDir, 'app-icon-maskable-master.png');

  await generateMaster(regularMaster, { subjectSize: 1024 });
  await generateMaster(faviconMaster, { subjectSize: 1180, verticalOffset: 28 });
  await generateMaster(maskableMaster, { subjectSize: 820 });

  for (const icon of regularIcons) {
    const sourcePath = icon.source === 'favicon' ? faviconMaster : regularMaster;
    await resizeIcon(sourcePath, path.join(outputDir, icon.file), icon.size);
  }
  await resizeIcon(maskableMaster, path.join(outputDir, 'app-icon-maskable-512.png'), 512);
  await generateIco();
} finally {
  await rm(scratchDir, { recursive: true, force: true });
}

console.log(`Generated ${regularIcons.length + 2} app icon artefacts.`);
