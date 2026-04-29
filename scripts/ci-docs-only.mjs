import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function normaliseChangedFiles(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map((filePath) => filePath.trim())
    .filter(Boolean);
}

export function isDocumentationPath(filePath) {
  const normalised = String(filePath || '').replace(/\\/g, '/');
  return normalised.startsWith('docs/') || normalised.endsWith('.md');
}

export function isDocsOnlyChange(files) {
  const changedFiles = files.filter(Boolean);
  return changedFiles.length > 0 && changedFiles.every(isDocumentationPath);
}

export function collectChangedFiles(baseSha, headSha) {
  return normaliseChangedFiles(
    execFileSync('git', ['diff', '--name-only', baseSha, headSha], {
      encoding: 'utf8',
    }),
  );
}

export function writeGithubOutput(docsOnly) {
  const output = `docs_only=${docsOnly ? 'true' : 'false'}\n`;
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, output);
    return;
  }
  process.stdout.write(output);
}

export function run(argv = process.argv.slice(2)) {
  const [baseSha, headSha] = argv;
  if (!baseSha || !headSha) {
    console.log('Missing base/head SHA; treating change set as non-docs-only.');
    writeGithubOutput(false);
    return false;
  }

  const changedFiles = collectChangedFiles(baseSha, headSha);
  const docsOnly = isDocsOnlyChange(changedFiles);

  console.log(`Changed files: ${changedFiles.length}`);
  console.log(`Docs-only change set: ${docsOnly ? 'yes' : 'no'}`);
  writeGithubOutput(docsOnly);
  return docsOnly;
}

const isDirectInvocation = (() => {
  try {
    return fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '');
  } catch {
    return false;
  }
})();

if (isDirectInvocation) {
  run();
}
