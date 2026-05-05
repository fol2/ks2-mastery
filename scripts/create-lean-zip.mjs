import { mkdtemp, mkdir, rm, copyFile, writeFile, lstat, symlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const repoName = path.basename(repoRoot);
const DEFAULT_EXCLUDES = ['assets/**', 'worktrees/**', '.worktrees/**'];

function pad2(value) {
  return String(value).padStart(2, '0');
}

function getTimestampSuffix(date = new Date()) {
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());
  return `${month}${day}${hour}${minute}`;
}

function appendTimestampSuffix(fileName, timestampSuffix) {
  const ext = path.extname(fileName);
  const base = ext ? fileName.slice(0, -ext.length) : fileName;
  return `${base}-${timestampSuffix}${ext}`;
}

const timestampSuffix = getTimestampSuffix();
const defaultOutput = path.resolve(
  repoRoot,
  '..',
  appendTimestampSuffix(`${repoName}-lean.zip`, timestampSuffix),
);

const HELP_TEXT = `
Create a lean development/share ZIP from tracked files.

Usage:
  node scripts/create-lean-zip.mjs [options]

Options:
  --output <path>        ZIP output path (exact path, no auto suffix)
  --exclude <glob>       Exclude glob (repeatable). Default: ${DEFAULT_EXCLUDES.join(', ')}
  --mode <mode>          How to treat excluded files:
                         - omit        : do not include excluded files
                         - placeholder : include 0-byte files at same paths (default)
                         - symlink     : include symlinks to .lean-omitted (best-effort)
  --max-mb <number>      Target threshold in MB for reporting (default: 100)
  --name <filename>      Override generated ZIP filename (auto adds -MMDDHHMM before extension)
  --help                 Show this message

Examples:
  node scripts/create-lean-zip.mjs
  node scripts/create-lean-zip.mjs --mode omit
  node scripts/create-lean-zip.mjs --exclude "assets/**" --exclude "tests/playwright/**"
  node scripts/create-lean-zip.mjs --name ks2-dev-share.zip
`.trim();

function parseArgs(argv) {
  const config = {
    output: defaultOutput,
    excludes: [...DEFAULT_EXCLUDES],
    mode: 'placeholder',
    maxMb: 100,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help') return { help: true, config };
    if (arg === '--output') {
      config.output = path.resolve(repoRoot, argv[++i] || '');
      continue;
    }
    if (arg === '--exclude') {
      const value = argv[++i];
      if (!value) throw new Error('Missing value for --exclude');
      config.excludes.push(value);
      continue;
    }
    if (arg === '--mode') {
      const value = argv[++i];
      if (!['omit', 'placeholder', 'symlink'].includes(value)) {
        throw new Error(`Invalid --mode "${value}". Use omit|placeholder|symlink.`);
      }
      config.mode = value;
      continue;
    }
    if (arg === '--max-mb') {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value <= 0) throw new Error('Invalid --max-mb value');
      config.maxMb = value;
      continue;
    }
    if (arg === '--name') {
      const name = argv[++i];
      if (!name) throw new Error('Missing value for --name');
      config.output = path.resolve(repoRoot, '..', appendTimestampSuffix(name, timestampSuffix));
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  // Deduplicate excludes while preserving order.
  config.excludes = [...new Set(config.excludes)];
  return { help: false, config };
}

function gitTrackedFiles() {
  const result = spawnSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`git ls-files failed: ${result.stderr || 'unknown error'}`);
  }
  return result.stdout.split('\0').filter(Boolean);
}

function globToRegex(glob) {
  // Minimal glob syntax support for share packaging:
  // ** => any path chars, * => segment chars except "/".
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__DOUBLE_STAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DOUBLE_STAR__/g, '.*');
  return new RegExp(`^${escaped}$`);
}

async function ensureParent(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function removeIfExists(targetPath) {
  try {
    await rm(targetPath, { force: true, recursive: true });
  } catch {
    // Intentionally ignore.
  }
}

function runZipWithFallback(stagingRoot, zipOutput) {
  const nativeZip = spawnSync('zip', ['-qr', zipOutput, '.'], {
    cwd: stagingRoot,
    encoding: 'utf8',
  });

  if (nativeZip.status === 0) {
    return;
  }

  if (nativeZip.error && nativeZip.error.code !== 'ENOENT') {
    throw new Error(`zip failed: ${nativeZip.error.message}`);
  }

  const tarZip = spawnSync('tar', ['-a', '-cf', zipOutput, '.'], {
    cwd: stagingRoot,
    encoding: 'utf8',
  });
  if (tarZip.status === 0) {
    return;
  }

  const escapedOutput = zipOutput.replace(/'/g, "''");
  const psCommand = `Get-ChildItem -Force | Compress-Archive -DestinationPath '${escapedOutput}' -Force`;
  const powershellZip = spawnSync('powershell', ['-NoProfile', '-Command', psCommand], {
    cwd: stagingRoot,
    encoding: 'utf8',
  });
  if (powershellZip.status === 0) {
    return;
  }

  const errors = [
    nativeZip.stderr || nativeZip.error?.message,
    tarZip.stderr || tarZip.error?.message,
    powershellZip.stderr || powershellZip.error?.message,
  ].filter(Boolean);
  throw new Error(`zip failed across zip/tar/Compress-Archive: ${errors.join(' | ') || 'unknown error'}`);
}

async function packageLeanZip(config) {
  const excludes = config.excludes.map((glob) => ({
    glob,
    regex: globToRegex(glob),
  }));
  const files = gitTrackedFiles();
  const stagingRoot = await mkdtemp(path.join(tmpdir(), `${repoName}-lean-`));
  const zipOutput = config.output;
  const markerFile = '.lean-omitted';

  const stats = {
    totalTracked: files.length,
    copied: 0,
    omitted: 0,
    placeholders: 0,
    symlinks: 0,
    missing: 0,
    omittedPaths: [],
    missingPaths: [],
  };

  try {
    if (config.mode === 'symlink') {
      const markerPath = path.join(stagingRoot, markerFile);
      await writeFile(markerPath, '', 'utf8');
    }

    for (const relPath of files) {
      const shouldExclude = excludes.some((rule) => rule.regex.test(relPath));
      const src = path.join(repoRoot, relPath);
      const dest = path.join(stagingRoot, relPath);
      let srcExists = true;

      try {
        await lstat(src);
      } catch (error) {
        if (error && error.code === 'ENOENT') {
          srcExists = false;
        } else {
          throw error;
        }
      }

      if (!srcExists) {
        stats.missing += 1;
        stats.missingPaths.push(relPath);
        continue;
      }

      if (!shouldExclude) {
        await ensureParent(dest);
        await copyFile(src, dest);
        stats.copied += 1;
        continue;
      }

      stats.omitted += 1;
      stats.omittedPaths.push(relPath);
      await ensureParent(dest);

      if (config.mode === 'omit') {
        // No file written.
        continue;
      }

      if (config.mode === 'placeholder') {
        await writeFile(dest, '');
        stats.placeholders += 1;
        continue;
      }

      // `symlink` mode is best-effort and less portable in extracted zips.
      // Use a relative symlink so extracted trees remain self-contained.
      const relMarker = path.relative(path.dirname(dest), path.join(stagingRoot, markerFile));
      await removeIfExists(dest);
      await symlink(relMarker, dest);
      stats.symlinks += 1;
    }

    const manifest = [
      `repo=${repoName}`,
      `mode=${config.mode}`,
      `exclude_globs=${config.excludes.join(',')}`,
      `tracked_total=${stats.totalTracked}`,
      `copied=${stats.copied}`,
      `omitted=${stats.omitted}`,
      `placeholders=${stats.placeholders}`,
      `symlinks=${stats.symlinks}`,
      `missing=${stats.missing}`,
      '',
      'omitted_paths:',
      ...stats.omittedPaths.map((p) => `- ${p}`),
      '',
      'missing_paths:',
      ...stats.missingPaths.map((p) => `- ${p}`),
      '',
    ].join('\n');
    await writeFile(path.join(stagingRoot, 'LEAN_ZIP_MANIFEST.txt'), manifest, 'utf8');

    await ensureParent(zipOutput);
    await removeIfExists(zipOutput);
    runZipWithFallback(stagingRoot, zipOutput);

    const zipInfo = await stat(zipOutput);
    const sizeMb = zipInfo.size / (1024 * 1024);
    const pass = sizeMb < config.maxMb;

    console.log(`Lean ZIP created: ${zipOutput}`);
    console.log(`Size: ${sizeMb.toFixed(2)} MB (target < ${config.maxMb} MB: ${pass ? 'PASS' : 'FAIL'})`);
    console.log(`Tracked files: ${stats.totalTracked}`);
    console.log(`Copied files: ${stats.copied}`);
    console.log(`Excluded files: ${stats.omitted}`);
    if (stats.missing > 0) {
      console.log(`Missing tracked files skipped: ${stats.missing}`);
    }
    if (config.mode !== 'omit') {
      console.log(`Excluded materialisation: placeholders=${stats.placeholders}, symlinks=${stats.symlinks}`);
    }
    console.log('Manifest: LEAN_ZIP_MANIFEST.txt inside ZIP root');

    if (config.mode === 'symlink') {
      console.log('Note: symlinks in ZIPs are not consistently supported across OS/tools.');
      console.log('For sharing reliability, prefer --mode placeholder (0-byte files).');
    }
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

async function main() {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed.help) {
      console.log(HELP_TEXT);
      return;
    }
    await packageLeanZip(parsed.config);
  } catch (error) {
    console.error(`create-lean-zip failed: ${error.message}`);
    process.exit(1);
  }
}

await main();
