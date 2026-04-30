import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const MANIFEST_PATH = join(ROOT, 'LEAN_ZIP_MANIFEST.txt');

const manifest = readFileSync(MANIFEST_PATH, 'utf8');
const lines = manifest.split('\n');

/**
 * Parse file paths from a named section.
 * A section starts with "## <heading>" and ends at the next "##" or EOF.
 * File paths are non-empty lines that don't start with "#".
 */
function extractSection(heading) {
  const sectionStart = lines.findIndex((l) => l.startsWith(`## ${heading}`));
  if (sectionStart === -1) return [];
  const paths = [];
  for (let i = sectionStart + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('## ')) break; // next section
    if (line === '' || line.startsWith('#')) continue;
    paths.push(line);
  }
  return paths;
}

const artefacts = extractSection('Evidence Artefacts (tracked in repo)');
const scripts = extractSection('Evidence Scripts (tracked in repo)');
const smokeSection = extractSection('Production Smoke Evidence (generated post-deploy)');

describe('LEAN_ZIP_MANIFEST — Evidence Artefacts', () => {
  it('lists at least one artefact', () => {
    assert.ok(artefacts.length > 0, 'No artefact paths found in manifest');
  });

  for (const filePath of artefacts) {
    it(`exists: ${filePath}`, () => {
      const full = join(ROOT, filePath);
      assert.ok(existsSync(full), `Missing artefact: ${full}`);
    });
  }
});

describe('LEAN_ZIP_MANIFEST — Evidence Scripts', () => {
  it('lists at least one script', () => {
    assert.ok(scripts.length > 0, 'No script paths found in manifest');
  });

  for (const filePath of scripts) {
    it(`exists: ${filePath}`, () => {
      const full = join(ROOT, filePath);
      assert.ok(existsSync(full), `Missing script: ${full}`);
    });
  }
});

describe('LEAN_ZIP_MANIFEST — Production Smoke Evidence', () => {
  it('smoke file is listed in post-deploy section', () => {
    assert.ok(
      smokeSection.length > 0,
      'Production smoke file not found in manifest'
    );
  });

  it('section is explicitly marked as post-deploy', () => {
    const sectionIdx = lines.findIndex((l) =>
      l.includes('Production Smoke Evidence (generated post-deploy)')
    );
    assert.ok(sectionIdx !== -1, 'Post-deploy section heading missing');
    // Check the NOT tracked comment follows
    const commentLine = lines
      .slice(sectionIdx + 1, sectionIdx + 4)
      .find((l) => l.includes('NOT tracked until deployment'));
    assert.ok(commentLine, 'Missing NOT tracked until deployment comment');
  });
});

describe('LEAN_ZIP_MANIFEST — Regeneration Commands', () => {
  it('includes regeneration commands section', () => {
    const hasSection = lines.some((l) =>
      l.startsWith('## Regeneration Commands')
    );
    assert.ok(hasSection, 'Regeneration Commands section missing');
  });

  it('includes at least 5 generation commands', () => {
    const regenStart = lines.findIndex((l) =>
      l.startsWith('## Regeneration Commands')
    );
    const regenLines = lines.slice(regenStart + 1);
    const commandLines = regenLines.filter(
      (l) => l.trim().startsWith('# node ')
    );
    assert.ok(
      commandLines.length >= 5,
      `Expected >= 5 commands, found ${commandLines.length}`
    );
  });

  it('includes validation command section', () => {
    const hasValidation = lines.some((l) =>
      l.startsWith('## Validation Command')
    );
    assert.ok(hasValidation, 'Validation Command section missing');
  });
});
