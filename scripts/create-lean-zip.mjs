import { mkdtemp, mkdir, rm, copyFile, writeFile, lstat, symlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const repoName = path.basename(repoRoot);
const REVIEW_INCLUDE_GLOBS = [
  '.gitattributes',
  '.gitignore',
  '.npmrc',
  '.nvmrc',
  'AGENTS.md',
  'README.md',
  '_headers',
  'favicon.ico',
  'index.html',
  'llms.txt',
  'manifest.webmanifest',
  'migration-plan.md',
  'package-lock.json',
  'package.json',
  'playwright.config.mjs',
  'robots.txt',
  'sitemap.xml',
  'skills-lock.json',
  'wrangler.jsonc',
  '.github/**',
  '.githooks/**',
  'content/**',
  'legacy/**',
  'scripts/**',
  'shared/**',
  'skills/**',
  'src/**',
  'styles/**',
  'tests/**',
  'worker/**',
];
const DEFAULT_EXCLUDES = [
  'assets/**',
  'worktrees/**',
  '.worktrees/**',
  // Generated validation artefacts are useful in-repo, but not required for code review bundles.
  'reports/**',
  'output/**',
  // Historical planning archives frequently contain heavy screenshots/log bundles.
  'docs/plans/**/archive/**',
  // Planning validation evidence can include very large logs/screenshots that are non-runtime.
  'docs/plans/**/validation/**',
  'docs/plans/**/*.log',
  'docs/plans/**/*.png',
  'docs/plans/**/*.jpg',
  'docs/plans/**/*.jpeg',
  'docs/plans/**/*.webp',
  'docs/plans/**/*.zip',
];
const TRACKED_PROFILE_EXCLUDES = [
  ...DEFAULT_EXCLUDES,
  // Planning packs frequently contain screenshots, logs, nested ZIPs, and historical patch bundles.
  'docs/plans/**',
];
const PROFILES = {
  review: {
    description: 'code review bundle: source, scripts, tests, fixtures, and repo config',
    includes: REVIEW_INCLUDE_GLOBS,
    excludes: DEFAULT_EXCLUDES,
    defaultMode: 'omit',
    defaultMaxMb: 25,
  },
  tracked: {
    description: 'broader tracked-file snapshot with bulky evidence and planning packs excluded',
    includes: [],
    excludes: TRACKED_PROFILE_EXCLUDES,
    defaultMode: 'omit',
    defaultMaxMb: 25,
  },
};

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
Create a lean code review ZIP from tracked files.

Usage:
  node scripts/create-lean-zip.mjs [options]

Options:
  --output <path>        ZIP output path (exact path, no auto suffix)
  --profile <profile>    Bundle profile:
                         - review  : source, scripts, tests, fixtures, repo config (default)
                         - tracked : broader tracked snapshot, still excluding bulky artefacts
  --include <glob>       Add an include glob to the review profile (repeatable)
  --exclude <glob>       Exclude glob (repeatable). Review default: ${PROFILES.review.excludes.join(', ')}
  --mode <mode>          How to treat excluded files:
                         - omit        : do not include excluded files
                         - placeholder : include 0-byte files at same paths
                         - symlink     : include symlinks to .lean-omitted (best-effort)
  --max-mb <number>      Target threshold in MB for reporting (default: ${PROFILES.review.defaultMaxMb})
  --name <filename>      Override generated ZIP filename (auto adds -MMDDHHMM before extension)
  --help                 Show this message

Examples:
  node scripts/create-lean-zip.mjs
  node scripts/create-lean-zip.mjs --profile tracked
  node scripts/create-lean-zip.mjs --mode omit
  node scripts/create-lean-zip.mjs --include "docs/operations/**"
  node scripts/create-lean-zip.mjs --exclude "assets/**" --exclude "tests/playwright/**"
  node scripts/create-lean-zip.mjs --name ks2-dev-share.zip
`.trim();

function parseArgs(argv) {
  const config = {
    output: defaultOutput,
    profile: 'review',
    includes: [],
    excludes: [],
    mode: null,
    maxMb: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help') return { help: true, config };
    if (arg === '--output') {
      config.output = path.resolve(repoRoot, argv[++i] || '');
      continue;
    }
    if (arg === '--profile') {
      const value = argv[++i];
      if (!Object.hasOwn(PROFILES, value)) {
        throw new Error(`Invalid --profile "${value}". Use ${Object.keys(PROFILES).join('|')}.`);
      }
      config.profile = value;
      continue;
    }
    if (arg === '--include') {
      const value = argv[++i];
      if (!value) throw new Error('Missing value for --include');
      config.includes.push(value);
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

  const profile = PROFILES[config.profile];
  config.includes = profile.includes.length === 0
    ? []
    : [...new Set([...profile.includes, ...config.includes])];
  config.excludes = [...new Set([...profile.excludes, ...config.excludes])];
  config.mode = config.mode || profile.defaultMode;
  config.maxMb = config.maxMb || profile.defaultMaxMb;
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
  let regex = '';
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    const next = glob[i + 1];
    const afterNext = glob[i + 2];

    if (char === '*' && next === '*') {
      if (afterNext === '/') {
        regex += '(?:.*/)?';
        i += 2;
      } else {
        regex += '.*';
        i += 1;
      }
      continue;
    }

    if (char === '*') {
      regex += '[^/]*';
      continue;
    }

    regex += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${regex}$`);
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
  const includes = config.includes.map((glob) => ({
    glob,
    regex: globToRegex(glob),
  }));
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
    selected: 0,
    copied: 0,
    omitted: 0,
    outsideProfile: 0,
    excluded: 0,
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
      const inProfile = includes.length === 0 || includes.some((rule) => rule.regex.test(relPath));
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

      if (inProfile && !shouldExclude) {
        await ensureParent(dest);
        await copyFile(src, dest);
        stats.selected += 1;
        stats.copied += 1;
        continue;
      }

      stats.omitted += 1;
      if (!inProfile) {
        stats.outsideProfile += 1;
        stats.omittedPaths.push({ path: relPath, reason: 'outside-profile' });
      } else {
        stats.selected += 1;
        stats.excluded += 1;
        stats.omittedPaths.push({ path: relPath, reason: 'excluded' });
      }

      if (config.mode === 'omit') {
        // No file written.
        continue;
      }

      await ensureParent(dest);

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
      `profile=${config.profile}`,
      `profile_description=${PROFILES[config.profile].description}`,
      `mode=${config.mode}`,
      `include_globs=${config.includes.length > 0 ? config.includes.join(',') : '(all tracked files)'}`,
      `exclude_globs=${config.excludes.join(',')}`,
      `tracked_total=${stats.totalTracked}`,
      `selected_by_profile=${stats.selected}`,
      `copied=${stats.copied}`,
      `omitted=${stats.omitted}`,
      `outside_profile=${stats.outsideProfile}`,
      `excluded=${stats.excluded}`,
      `placeholders=${stats.placeholders}`,
      `symlinks=${stats.symlinks}`,
      `missing=${stats.missing}`,
      '',
      'omitted_paths:',
      ...stats.omittedPaths.map((entry) => `- ${entry.path} [${entry.reason}]`),
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
    console.log(`Profile: ${config.profile} (${PROFILES[config.profile].description})`);
    console.log(`Tracked files: ${stats.totalTracked}`);
    console.log(`Selected by profile: ${stats.selected}`);
    console.log(`Copied files: ${stats.copied}`);
    console.log(`Omitted files: ${stats.omitted} (outside profile=${stats.outsideProfile}, excluded=${stats.excluded})`);
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

export async function main() {
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

export {
  DEFAULT_EXCLUDES,
  PROFILES,
  REVIEW_INCLUDE_GLOBS,
  globToRegex,
  parseArgs,
  packageLeanZip,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
