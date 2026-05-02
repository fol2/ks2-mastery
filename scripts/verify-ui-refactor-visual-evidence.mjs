#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MANIFEST = path.join(
  rootDir,
  'reports/ui-refactor/ui-refactor-p4-production-visual-evidence-2026-05-01.json',
);

function hasDurableReason(entry) {
  return typeof entry.reason === 'string' && entry.reason.trim().length >= 12;
}

function validateExternal(entry) {
  const failures = [];

  if (!hasDurableReason(entry)) {
    failures.push('external screenshot entries require a durable reason');
  }

  if (
    typeof entry.url !== 'string'
    && typeof entry.externalUrl !== 'string'
    && typeof entry.evidenceUrl !== 'string'
  ) {
    failures.push('external screenshot entries require url, externalUrl, or evidenceUrl');
  }

  return failures;
}

function validateOmitted(entry) {
  return hasDurableReason(entry)
    ? []
    : ['omitted screenshot entries require a durable reason'];
}

export function verifyUiRefactorVisualEvidence(manifestPath = DEFAULT_MANIFEST, options = {}) {
  const baseDir = options.baseDir ?? rootDir;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const screenshots = Array.isArray(manifest.screenshots) ? manifest.screenshots : [];
  const failures = [];

  if (screenshots.length === 0) {
    failures.push('manifest must contain screenshots[] entries');
  }

  screenshots.forEach((entry, index) => {
    const label = entry.name ?? `screenshots[${index}]`;
    const status = String(entry.status ?? '').toLowerCase();

    if (status === 'external') {
      validateExternal(entry).forEach((failure) => failures.push(`${label}: ${failure}`));
      return;
    }

    if (status === 'omitted') {
      validateOmitted(entry).forEach((failure) => failures.push(`${label}: ${failure}`));
      return;
    }

    if (typeof entry.path !== 'string' || entry.path.trim().length === 0) {
      failures.push(`${label}: captured screenshot entries require path`);
      return;
    }

    const screenshotPath = path.isAbsolute(entry.path)
      ? entry.path
      : path.join(baseDir, entry.path);

    if (!existsSync(screenshotPath)) {
      failures.push(`${label}: missing screenshot file ${entry.path}`);
    }
  });

  return {
    ok: failures.length === 0,
    manifestPath,
    screenshotCount: screenshots.length,
    failures,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const manifestPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_MANIFEST;
  const result = verifyUiRefactorVisualEvidence(manifestPath);

  if (!result.ok) {
    console.error(`UI refactor visual evidence verification failed for ${manifestPath}`);
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
  } else {
    console.log(
      `UI refactor visual evidence verified: ${result.screenshotCount} screenshot entries checked.`,
    );
  }
}
