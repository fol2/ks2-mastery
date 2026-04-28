// Hero Mode P4 U7 — Vocabulary boundary tests.
//
// Proves the P4 economy vocabulary scope split:
// - Pressure/gambling terms remain forbidden EVERYWHERE.
// - Economy terms ('coin', 'balance', etc.) are permitted ONLY in economy-scoped files.
// - Subject surfaces, HeroTaskBanner, and worker scheduler remain economy-free.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HERO_FORBIDDEN_PRESSURE_VOCABULARY,
  HERO_ECONOMY_ALLOWED_VOCABULARY,
  HERO_ECONOMY_ALLOWED_FILES,
} from '../shared/hero/hero-copy.js';

// ── Helpers ──────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

function collectJsFiles(dir) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJsFiles(full));
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.jsx'))) {
      results.push(full);
    }
  }
  return results;
}

function stripComments(source) {
  return source
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Strip vocabulary/boundary definition arrays so that tokens inside
 * defining array literals do not trigger their own scan.
 * Covers: HERO_FORBIDDEN_*, HERO_ECONOMY_*, FORBIDDEN_CLAIM_FIELDS, etc.
 */
function stripVocabDefinitions(source) {
  // Strip exported const arrays that define vocabulary or forbidden-field lists
  return source
    .replace(
      /export\s+const\s+(?:HERO_(?:FORBIDDEN_PRESSURE_VOCABULARY|ECONOMY_ALLOWED_VOCABULARY|FORBIDDEN_VOCABULARY|ECONOMY_ALLOWED_FILES)|FORBIDDEN_CLAIM_FIELDS)\s*=\s*(?:Object\.freeze\()?\[[\s\S]*?\]\)?;/g,
      '',
    );
}

function relPath(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
}

// ── Directories scanned ──────────────────────────────────────────────

const HERO_SOURCE_DIRS = [
  path.join(REPO_ROOT, 'shared', 'hero'),
  path.join(REPO_ROOT, 'worker', 'src', 'hero'),
  path.join(REPO_ROOT, 'src', 'platform', 'hero'),
];

const HERO_SURFACE_FILES = [
  path.join(REPO_ROOT, 'src', 'surfaces', 'home', 'HeroQuestCard.jsx'),
  path.join(REPO_ROOT, 'src', 'surfaces', 'subject', 'HeroTaskBanner.jsx'),
];

const ECONOMY_FREE_WORKER_FILES = [
  path.join(REPO_ROOT, 'worker', 'src', 'hero', 'launch.js'),
  // read-model.js is economy-allowed since P4 added the economy block
];

const SUBJECT_DIR = path.join(REPO_ROOT, 'src', 'subjects');

// Collect all Hero source files
const ALL_HERO_FILES = [
  ...HERO_SOURCE_DIRS.flatMap((dir) => collectJsFiles(dir)),
  ...HERO_SURFACE_FILES.filter((f) => fs.existsSync(f)),
];

// Resolve economy-allowed files to absolute paths
const ECONOMY_ALLOWED_ABSOLUTE = HERO_ECONOMY_ALLOWED_FILES.map(
  (rel) => path.join(REPO_ROOT, rel.replace(/\//g, path.sep)),
);

function isEconomyAllowed(filePath) {
  const rel = relPath(filePath);
  return HERO_ECONOMY_ALLOWED_FILES.includes(rel);
}

// ══════════════════════════════════════════════════════════════════════
// Test 1: Pressure vocabulary forbidden in ALL Hero source files
// ══════════════════════════════════════════════════════════════════════

test('P4 Vocabulary: pressure/gambling terms are absent from ALL Hero source files', () => {
  assert.ok(ALL_HERO_FILES.length > 0, 'Expected Hero source files to scan');
  assert.ok(HERO_FORBIDDEN_PRESSURE_VOCABULARY.length > 0, 'Pressure vocabulary must be non-empty');

  const patterns = HERO_FORBIDDEN_PRESSURE_VOCABULARY.map((token) => ({
    token,
    regex: new RegExp(
      token.includes(' ')
        ? token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        : `\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
      'i',
    ),
  }));

  for (const filePath of ALL_HERO_FILES) {
    const rel = relPath(filePath);
    const raw = fs.readFileSync(filePath, 'utf8');
    const code = stripVocabDefinitions(stripComments(raw));

    for (const { token, regex } of patterns) {
      assert.ok(
        !regex.test(code),
        `${rel} contains pressure vocabulary "${token}" — pressure terms are ALWAYS forbidden`,
      );
    }
  }
});

// ══════════════════════════════════════════════════════════════════════
// Test 2: Economy vocabulary present in economy-allowed files (sanity)
// ══════════════════════════════════════════════════════════════════════

test('P4 Vocabulary: economy terms appear in at least one economy-allowed file', () => {
  // 'coin' must appear in at least one allowed file (hero-copy.js has HERO_ECONOMY_COPY)
  const coinRegex = /\bcoin\b/i;
  let found = false;
  for (const absPath of ECONOMY_ALLOWED_ABSOLUTE) {
    if (!fs.existsSync(absPath)) continue;
    const code = stripComments(fs.readFileSync(absPath, 'utf8'));
    if (coinRegex.test(code)) {
      found = true;
      break;
    }
  }
  assert.ok(found, 'Economy term "coin" must appear in at least one economy-allowed file');
});

// ══════════════════════════════════════════════════════════════════════
// Test 3: Economy vocabulary NOT in HeroTaskBanner
// ══════════════════════════════════════════════════════════════════════

test('P4 Vocabulary: economy terms do NOT appear in HeroTaskBanner', () => {
  const bannerPath = path.join(REPO_ROOT, 'src', 'surfaces', 'subject', 'HeroTaskBanner.jsx');
  if (!fs.existsSync(bannerPath)) return; // skip if file does not exist yet

  const raw = fs.readFileSync(bannerPath, 'utf8');
  const code = stripVocabDefinitions(stripComments(raw));

  for (const token of HERO_ECONOMY_ALLOWED_VOCABULARY) {
    const regex = new RegExp(
      token.includes(' ')
        ? token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        : `\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
      'i',
    );
    assert.ok(
      !regex.test(code),
      `HeroTaskBanner.jsx contains economy vocabulary "${token}" — economy terms must not leak into subject banner`,
    );
  }
});

// ══════════════════════════════════════════════════════════════════════
// Test 4: Economy vocabulary NOT in any subject engine file
// ══════════════════════════════════════════════════════════════════════

test('P4 Vocabulary: economy terms do NOT appear in src/subjects/ (excluding content data)', () => {
  const subjectFiles = collectJsFiles(SUBJECT_DIR).filter((f) => {
    const rel = relPath(f);
    // Exclude raw content/data files — they contain curriculum sentences, not Hero UI
    return !rel.includes('/data/') && !rel.includes('/content/');
  });
  if (subjectFiles.length === 0) return; // skip if no subject files

  const patterns = HERO_ECONOMY_ALLOWED_VOCABULARY.map((token) => ({
    token,
    regex: new RegExp(
      token.includes(' ')
        ? token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        : `\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
      'i',
    ),
  }));

  for (const filePath of subjectFiles) {
    const rel = relPath(filePath);
    const code = stripComments(fs.readFileSync(filePath, 'utf8'));

    for (const { token, regex } of patterns) {
      assert.ok(
        !regex.test(code),
        `${rel} contains economy vocabulary "${token}" — economy terms must not appear in subject engine files`,
      );
    }
  }
});

// ══════════════════════════════════════════════════════════════════════
// Test 5: Economy vocabulary NOT in economy-free worker files
// ══════════════════════════════════════════════════════════════════════

test('P4 Vocabulary: economy terms do NOT appear in worker/src/hero/launch.js', () => {
  const patterns = HERO_ECONOMY_ALLOWED_VOCABULARY.map((token) => ({
    token,
    regex: new RegExp(
      token.includes(' ')
        ? token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        : `\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
      'i',
    ),
  }));

  for (const filePath of ECONOMY_FREE_WORKER_FILES) {
    if (!fs.existsSync(filePath)) continue;
    const rel = relPath(filePath);
    const code = stripVocabDefinitions(stripComments(fs.readFileSync(filePath, 'utf8')));

    for (const { token, regex } of patterns) {
      assert.ok(
        !regex.test(code),
        `${rel} contains economy vocabulary "${token}" — launch must be economy-free`,
      );
    }
  }
});

// ══════════════════════════════════════════════════════════════════════
// Test 6: 'claim your reward' is still in pressure list
// ══════════════════════════════════════════════════════════════════════

test('P4 Vocabulary: "claim your reward" remains in pressure-forbidden list', () => {
  assert.ok(
    HERO_FORBIDDEN_PRESSURE_VOCABULARY.includes('claim your reward'),
    '"claim your reward" must remain forbidden as pressure vocabulary',
  );
});

// ══════════════════════════════════════════════════════════════════════
// Test 7: HERO_ECONOMY_ALLOWED_FILES all exist on disk
// ══════════════════════════════════════════════════════════════════════

test('P4 Vocabulary: every file in HERO_ECONOMY_ALLOWED_FILES exists', () => {
  for (const relFile of HERO_ECONOMY_ALLOWED_FILES) {
    const absPath = path.join(REPO_ROOT, relFile.replace(/\//g, path.sep));
    assert.ok(
      fs.existsSync(absPath),
      `HERO_ECONOMY_ALLOWED_FILES references "${relFile}" but it does not exist`,
    );
  }
});

// ══════════════════════════════════════════════════════════════════════
// Test 8: Economy vocabulary in non-allowed Hero files is forbidden
// ══════════════════════════════════════════════════════════════════════

test('P4 Vocabulary: economy terms do NOT appear in Hero files outside HERO_ECONOMY_ALLOWED_FILES', () => {
  const nonAllowedFiles = ALL_HERO_FILES.filter((f) => !isEconomyAllowed(f));
  assert.ok(nonAllowedFiles.length > 0, 'Expected non-allowed Hero files to scan');

  const patterns = HERO_ECONOMY_ALLOWED_VOCABULARY.map((token) => ({
    token,
    regex: new RegExp(
      token.includes(' ')
        ? token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        : `\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
      'i',
    ),
  }));

  for (const filePath of nonAllowedFiles) {
    const rel = relPath(filePath);
    const raw = fs.readFileSync(filePath, 'utf8');
    const code = stripVocabDefinitions(stripComments(raw));

    for (const { token, regex } of patterns) {
      assert.ok(
        !regex.test(code),
        `${rel} contains economy vocabulary "${token}" — economy terms only permitted in HERO_ECONOMY_ALLOWED_FILES`,
      );
    }
  }
});
