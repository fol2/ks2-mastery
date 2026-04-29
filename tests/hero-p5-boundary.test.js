import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Helpers ──────────────────────────────────────────────────────────────────

const ROOT = resolve(import.meta.dirname, '..');

function readSource(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), 'utf-8');
}

function extractImports(source) {
  // Match both static import and dynamic import()
  const staticImports = [...source.matchAll(/(?:^|\n)\s*import\s+.*?from\s+['"]([^'"]+)['"]/g)].map(m => m[1]);
  const dynamicImports = [...source.matchAll(/import\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);
  return [...staticImports, ...dynamicImports];
}

// ── Section 1: Structural import boundary tests ─────────────────────────────

test('worker/src/hero/camp.js has zero imports from subject runtime (worker/src/subjects/)', () => {
  const source = readSource('worker/src/hero/camp.js');
  const imports = extractImports(source);
  const subjectImports = imports.filter(i => i.includes('subjects/') || i.includes('subjects\\'));
  assert.deepEqual(subjectImports, [], `camp.js must NOT import from worker/src/subjects/; found: ${subjectImports.join(', ')}`);
});

test('shared/hero/hero-pool.js has zero imports from worker/ or src/', () => {
  const source = readSource('shared/hero/hero-pool.js');
  const imports = extractImports(source);
  const forbidden = imports.filter(i =>
    i.includes('worker/') || i.includes('worker\\') ||
    i.includes('src/') || i.includes('src\\') ||
    i.includes('../worker') || i.includes('../src'),
  );
  assert.deepEqual(forbidden, [], `hero-pool.js must NOT import from worker/ or src/; found: ${forbidden.join(', ')}`);
});

test('shared/hero/monster-economy.js has zero imports from worker/ or src/', () => {
  const source = readSource('shared/hero/monster-economy.js');
  const imports = extractImports(source);
  const forbidden = imports.filter(i =>
    i.includes('worker/') || i.includes('worker\\') ||
    i.includes('src/') || i.includes('src\\') ||
    i.includes('../worker') || i.includes('../src'),
  );
  assert.deepEqual(forbidden, [], `monster-economy.js must NOT import from worker/ or src/; found: ${forbidden.join(', ')}`);
});

test('worker/src/hero/camp.js does not import repository.js or D1', () => {
  const source = readSource('worker/src/hero/camp.js');
  const imports = extractImports(source);
  const forbidden = imports.filter(i => i.includes('repository') || i.includes('d1') || i.includes('D1'));
  assert.deepEqual(forbidden, [], `camp.js must NOT import repository.js or D1; found: ${forbidden.join(', ')}`);
  // Also check for direct D1 usage patterns
  assert.ok(!source.includes('.prepare('), 'camp.js must NOT use D1 .prepare()');
  assert.ok(!source.includes('.batch('), 'camp.js must NOT use D1 .batch()');
});

test('src/platform/hero/hero-camp-model.js does not import from shared/hero/ or worker/', () => {
  const source = readSource('src/platform/hero/hero-camp-model.js');
  const imports = extractImports(source);
  const forbidden = imports.filter(i =>
    i.includes('shared/hero') || i.includes('shared\\hero') ||
    i.includes('worker/') || i.includes('worker\\') ||
    i.includes('../../../shared') || i.includes('../../../../worker'),
  );
  assert.deepEqual(forbidden, [], `hero-camp-model.js must NOT import from shared/hero/ or worker/; found: ${forbidden.join(', ')}`);
});

test('src/platform/hero/hero-monster-assets.js does not import from shared/ or worker/', () => {
  const source = readSource('src/platform/hero/hero-monster-assets.js');
  const imports = extractImports(source);
  const forbidden = imports.filter(i =>
    i.includes('shared/') || i.includes('shared\\') ||
    i.includes('worker/') || i.includes('worker\\') ||
    i.includes('../../../shared') || i.includes('../../../../worker'),
  );
  assert.deepEqual(forbidden, [], `hero-monster-assets.js must NOT import from shared/ or worker/; found: ${forbidden.join(', ')}`);
});

test('Worker/shared Camp code does not import src/platform/game/monsters.js', () => {
  const campFiles = [
    'worker/src/hero/camp.js',
    'shared/hero/hero-pool.js',
    'shared/hero/monster-economy.js',
  ];
  for (const file of campFiles) {
    const source = readSource(file);
    const imports = extractImports(source);
    const forbidden = imports.filter(i => i.includes('platform/game/monsters') || i.includes('game/monsters'));
    assert.deepEqual(forbidden, [], `${file} must NOT import src/platform/game/monsters.js; found: ${forbidden.join(', ')}`);
  }
});

// ── Section 2: Vocabulary boundary tests — forbidden pressure words ──────────

import { HERO_FORBIDDEN_PRESSURE_VOCABULARY } from '../shared/hero/hero-copy.js';

const CAMP_UI_FILES = [
  'src/surfaces/home/HeroCampPanel.jsx',
  'src/surfaces/home/HeroCampMonsterCard.jsx',
  'src/surfaces/home/HeroCampConfirmation.jsx',
  'src/platform/hero/hero-camp-model.js',
];

function stripComments(source) {
  // Remove block comments (/* ... */) and line comments (// ...)
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

for (const filePath of CAMP_UI_FILES) {
  test(`${filePath} contains zero forbidden pressure vocabulary`, () => {
    const source = readSource(filePath);
    const stripped = stripComments(source);
    const lower = stripped.toLowerCase();
    const found = [];
    for (const token of HERO_FORBIDDEN_PRESSURE_VOCABULARY) {
      const tokenLower = token.toLowerCase();
      // Multi-word tokens use simple includes;
      // Single-word tokens use word-boundary regex to avoid false positives
      const hit = tokenLower.includes(' ')
        ? lower.includes(tokenLower)
        : new RegExp(`\\b${tokenLower}\\b`).test(lower);
      if (hit) found.push(token);
    }
    assert.deepEqual(found, [], `${filePath} contains forbidden vocabulary: ${found.join(', ')}`);
  });
}

// ── Section 3: No subject mutation in Camp section ───────────────────────────

test('Camp section of worker/src/app.js does NOT write to child_subject_state', () => {
  const source = readSource('worker/src/app.js');
  // Camp section is delimited by the comment marker and the subsequent section start
  const campStart = source.indexOf("// P5 U6: Camp spending commands");
  const campEnd = source.indexOf("// U10: outer try wraps the full resolve", campStart);
  assert.ok(campStart > -1, 'Camp section marker not found in app.js');
  assert.ok(campEnd > -1, 'Camp section end marker not found in app.js');
  const campSection = source.slice(campStart, campEnd);
  assert.ok(!campSection.includes('child_subject_state'), 'Camp section must NOT reference child_subject_state');
});

test('Camp section of worker/src/app.js does NOT write to practice_sessions', () => {
  const source = readSource('worker/src/app.js');
  const campStart = source.indexOf("// P5 U6: Camp spending commands");
  const campEnd = source.indexOf("// U10: outer try wraps the full resolve", campStart);
  const campSection = source.slice(campStart, campEnd);
  assert.ok(!campSection.includes('practice_sessions'), 'Camp section must NOT reference practice_sessions');
});

test('Camp section of worker/src/app.js does NOT dispatch to subject runtime', () => {
  const source = readSource('worker/src/app.js');
  const campStart = source.indexOf("// P5 U6: Camp spending commands");
  const campEnd = source.indexOf("// U10: outer try wraps the full resolve", campStart);
  const campSection = source.slice(campStart, campEnd);
  // Subject runtime dispatch patterns
  assert.ok(!campSection.includes('subjectRuntime'), 'Camp section must NOT call subjectRuntime');
  assert.ok(!campSection.includes('dispatchSubject'), 'Camp section must NOT call dispatchSubject');
  assert.ok(!campSection.includes('subjectCommand'), 'Camp section must NOT reference subjectCommand');
  assert.ok(!campSection.includes('resolveSubject'), 'Camp section must NOT call resolveSubject');
});

// ── Section 4: Schema stability ──────────────────────────────────────────────

test('No new D1 migration tables for hero/camp/monster in P5', () => {
  // Check all migration files for CREATE TABLE with hero camp or monster-pool naming
  const migrationsDir = resolve(ROOT, 'worker/migrations');
  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

  const heroPoolTablePattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(hero_camp|hero_pool|hero_monster|camp_monster)/gi;
  for (const file of files) {
    const sql = readFileSync(resolve(migrationsDir, file), 'utf-8');
    const matches = [...sql.matchAll(heroPoolTablePattern)];
    assert.deepEqual(
      matches.map(m => m[1]),
      [],
      `Migration ${file} must NOT create hero_camp/hero_pool/hero_monster tables (Camp state lives in JSON column)`,
    );
  }
});

test('Camp event_log entries use INSERT with ON CONFLICT DO NOTHING', () => {
  const source = readSource('worker/src/app.js');
  const campStart = source.indexOf("// P5 U6: Camp spending commands");
  const campEnd = source.indexOf("// U10: outer try wraps the full resolve", campStart);
  const campSection = source.slice(campStart, campEnd);

  // Any INSERT in camp section must have ON CONFLICT DO NOTHING
  const insertStatements = [...campSection.matchAll(/INSERT\s+INTO\s+(\w+)/gi)];
  for (const match of insertStatements) {
    const afterInsert = campSection.slice(match.index, match.index + 500);
    assert.ok(
      afterInsert.includes('ON CONFLICT') && afterInsert.includes('DO NOTHING'),
      `INSERT INTO ${match[1]} in Camp section must use ON CONFLICT DO NOTHING (non-authoritative mirror)`,
    );
  }
});

// ── Section 5: Structured telemetry presence ─────────────────────────────────

test('Camp handler emits hero_camp_disabled_attempt telemetry', () => {
  const source = readSource('worker/src/app.js');
  assert.ok(source.includes("event: 'hero_camp_disabled_attempt'"), 'hero_camp_disabled_attempt telemetry missing');
});

test('Camp handler emits hero_camp_command_rejected telemetry', () => {
  const source = readSource('worker/src/app.js');
  assert.ok(source.includes("event: 'hero_camp_command_rejected'"), 'hero_camp_command_rejected telemetry missing');
});

test('Camp handler emits hero_camp_command_idempotent or hero_monster_duplicate_prevented telemetry', () => {
  const source = readSource('worker/src/app.js');
  const hasIdempotent = source.includes("event: 'hero_camp_command_idempotent'") ||
                        source.includes("event: 'hero_monster_duplicate_prevented'");
  assert.ok(hasIdempotent, 'idempotent camp telemetry missing');
});

test('Camp handler emits hero_camp_command_succeeded telemetry', () => {
  const source = readSource('worker/src/app.js');
  assert.ok(source.includes("event: 'hero_camp_command_succeeded'"), 'hero_camp_command_succeeded telemetry missing');
});
