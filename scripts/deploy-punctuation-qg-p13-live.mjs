#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const OUT = 'reports/punctuation/punctuation-qg-p13-production-smoke.json';
const DEPLOY_PREDEPLOY_OUT = '/tmp/ks2-punctuation-qg-p13-predeploy-evidence.json';

function argValue(argv, ...names) {
  for (const name of names) {
    const index = argv.indexOf(name);
    if (index !== -1 && index + 1 < argv.length) return argv[index + 1];
  }
  return '';
}

function run(command, env = {}) {
  console.log(`\n$ ${command}`);
  execSync(command, {
    cwd: ROOT,
    stdio: 'inherit',
    encoding: 'utf8',
    timeout: 600_000,
    env: { ...process.env, ...env },
  });
}

function outputOf(command) {
  return execSync(command, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' }).trim();
}

export function assertCleanGitTree(status = outputOf('git status --porcelain')) {
  if (String(status || '').trim()) {
    throw new Error('P13 live deploy requires a clean committed tree so the deployed source matches the recorded worker identity.');
  }
}

function gitSha() {
  try {
    return outputOf('git rev-parse HEAD');
  } catch {
    return '';
  }
}

export function assertCommitShaMatchesHead(commitSha, headSha = gitSha()) {
  if (commitSha && headSha && commitSha !== headSha) {
    throw new Error(`P13 live deploy commit SHA ${commitSha} does not match the current clean checkout HEAD ${headSha}.`);
  }
}

export function predeployCommandForDeploy() {
  return `npm run verify:punctuation-qg:p13-predeploy -- --out ${DEPLOY_PREDEPLOY_OUT}`;
}

function main(argv = process.argv) {
  const origin = argValue(argv, '--origin') || process.env.KS2_SMOKE_ORIGIN || 'https://ks2.eugnel.uk';
  const commitSha = argValue(argv, '--commit-sha') || process.env.GITHUB_SHA || process.env.WORKER_COMMIT_SHA || gitSha();
  const out = argValue(argv, '--out') || OUT;
  if (!commitSha) {
    throw new Error('P13 live deploy requires a commit SHA. Pass --commit-sha, set GITHUB_SHA/WORKER_COMMIT_SHA, or run from a git checkout.');
  }
  assertCleanGitTree();
  assertCommitShaMatchesHead(commitSha);

  run(predeployCommandForDeploy());
  assertCleanGitTree();
  run('npm run deploy');
  run(`node scripts/punctuation-qg-p13-live-smoke.mjs --env production --authenticated --origin ${origin} --commit-sha ${commitSha} --out ${out}`);
  if (!existsSync(resolve(ROOT, out))) throw new Error(`Expected smoke artefact was not written: ${out}`);
  run(`node scripts/validate-punctuation-qg-p13-live-evidence.mjs ${out} --origin ${origin}`);
  console.log('\nPunctuation QG P13 is live-serving certified for the deployed production origin.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`[deploy-punctuation-qg-p13-live] ${error?.stack || error?.message || error}`);
    process.exit(1);
  }
}
