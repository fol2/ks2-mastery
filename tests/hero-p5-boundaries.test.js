import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { HERO_FORBIDDEN_PRESSURE_VOCABULARY } from '../shared/hero/hero-copy.js';

const ROOT = join(import.meta.dirname, '..');

function readFile(relPath) {
  return readFileSync(join(ROOT, relPath), 'utf8');
}

// ── Import boundary tests ─────────────────────────────────────────────

describe('Hero P5 — import boundaries', () => {
  it('worker/src/hero/camp.js has zero imports from subjects/runtime or subjects/', () => {
    const src = readFile('worker/src/hero/camp.js');
    const lines = src.split('\n').filter(l => /^\s*(import|require)/.test(l));
    const forbidden = lines.filter(l => /subjects\/runtime|subjects\//.test(l));
    assert.equal(forbidden.length, 0, `camp.js imports from subjects/: ${forbidden.join(', ')}`);
  });

  it('shared/hero/hero-pool.js has zero imports from worker/ or src/', () => {
    const src = readFile('shared/hero/hero-pool.js');
    const lines = src.split('\n').filter(l => /^\s*(import|require)/.test(l));
    const forbidden = lines.filter(l => /['"].*(?:worker\/|src\/)/.test(l));
    assert.equal(forbidden.length, 0, `hero-pool.js imports from worker/ or src/: ${forbidden.join(', ')}`);
  });

  it('shared/hero/monster-economy.js has zero imports from worker/ or src/', () => {
    const src = readFile('shared/hero/monster-economy.js');
    const lines = src.split('\n').filter(l => /^\s*(import|require)/.test(l));
    const forbidden = lines.filter(l => /['"].*(?:worker\/|src\/)/.test(l));
    assert.equal(forbidden.length, 0, `monster-economy.js imports from worker/ or src/: ${forbidden.join(', ')}`);
  });

  it('Worker/shared Hero code does not import src/platform/game/monsters.js', () => {
    const filesToCheck = [
      'worker/src/hero/camp.js',
      'shared/hero/hero-pool.js',
      'shared/hero/monster-economy.js',
    ];
    for (const relPath of filesToCheck) {
      const src = readFile(relPath);
      assert.ok(
        !src.includes('platform/game/monsters'),
        `${relPath} imports from platform/game/monsters.js`
      );
    }
  });

  it('src/platform/hero/hero-monster-assets.js does not import from shared/ or worker/', () => {
    const src = readFile('src/platform/hero/hero-monster-assets.js');
    const lines = src.split('\n').filter(l => /^\s*(import|require)/.test(l));
    const forbidden = lines.filter(l => /['"].*(?:shared\/|worker\/)/.test(l));
    assert.equal(forbidden.length, 0, `hero-monster-assets.js imports from shared/ or worker/: ${forbidden.join(', ')}`);
  });
});

// ── Vocabulary boundary tests ─────────────────────────────────────────

describe('Hero P5 — vocabulary boundaries', () => {
  const CAMP_FILES = [
    'src/surfaces/home/HeroCampPanel.jsx',
    'src/surfaces/home/HeroCampMonsterCard.jsx',
    'src/platform/hero/hero-camp-model.js',
    'shared/hero/hero-pool.js',
  ];

  it('Hero Camp files contain zero HERO_FORBIDDEN_PRESSURE_VOCABULARY terms in string literals', () => {
    const violations = [];
    for (const relPath of CAMP_FILES) {
      const src = readFile(relPath);
      // Strip comment lines (// and /* */ and * lines) to avoid false positives from documentation
      const nonCommentLines = src.split('\n').filter(line => {
        const trimmed = line.trim();
        return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
      }).join('\n').toLowerCase();
      for (const word of HERO_FORBIDDEN_PRESSURE_VOCABULARY) {
        if (nonCommentLines.includes(word.toLowerCase())) {
          violations.push(`${relPath} contains forbidden term: "${word}"`);
        }
      }
    }
    assert.equal(violations.length, 0, `Vocabulary violations:\n${violations.join('\n')}`);
  });

  it('Economy vocabulary (coin, balance, Hero Coins) does NOT appear in subject surfaces', () => {
    // Quick check of a few subject surface files if they exist
    const subjectSurfaces = [
      'src/surfaces/subjects/grammar/GrammarMapScreen.jsx',
      'src/surfaces/subjects/spelling/SpellingMapScreen.jsx',
      'src/surfaces/subjects/punctuation/PunctuationMapScreen.jsx',
    ];
    const economyTerms = ['coin', 'balance', 'Hero Coins'];
    const violations = [];
    for (const relPath of subjectSurfaces) {
      try {
        const src = readFile(relPath).toLowerCase();
        for (const term of economyTerms) {
          if (src.includes(term.toLowerCase())) {
            violations.push(`${relPath} contains economy term: "${term}"`);
          }
        }
      } catch {
        // File may not exist — that is fine, skip
      }
    }
    assert.equal(violations.length, 0, `Economy vocabulary in subject surfaces:\n${violations.join('\n')}`);
  });
});

// ── Structural boundary tests ────────────────────────────────────────

describe('Hero P5 — structural boundaries', () => {
  it('No new D1 migration files were added for P5 camp', () => {
    // P5 camp must NOT add new migration files — it stores state in existing hero_progress JSON
    const migrationsDir = join(ROOT, 'worker', 'migrations');
    let files;
    try {
      files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
    } catch {
      // No migrations directory — that is acceptable
      files = [];
    }
    // The highest known pre-P5 migration is 0015 (Admin Console P7 incidents).
    // Anything above means Hero Camp specifically added new tables.
    const p5Migrations = files.filter(f => {
      const match = f.match(/^(\d+)/);
      return match && parseInt(match[1], 10) > 15;
    });
    assert.equal(p5Migrations.length, 0, `P5 added new migrations: ${p5Migrations.join(', ')}`);
  });

  it('camp.js does not read from event_log table (event mirror is not authority)', () => {
    const src = readFile('worker/src/hero/camp.js');
    assert.ok(
      !src.includes('event_log'),
      'camp.js references event_log — it must not read from the event mirror'
    );
    assert.ok(
      !src.includes('SELECT'),
      'camp.js contains SQL SELECT — it must not read from any table'
    );
  });
});

// ── State safety tests ───────────────────────────────────────────────

describe('Hero P5 — state safety', () => {
  it('camp.js does NOT write to child_subject_state', () => {
    const src = readFile('worker/src/hero/camp.js');
    assert.ok(
      !src.includes('child_subject_state'),
      'camp.js references child_subject_state — camp commands must not touch subject state'
    );
  });

  it('camp.js does NOT write to practice_sessions', () => {
    const src = readFile('worker/src/hero/camp.js');
    assert.ok(
      !src.includes('practice_sessions'),
      'camp.js references practice_sessions — camp commands must not touch practice sessions'
    );
  });
});
