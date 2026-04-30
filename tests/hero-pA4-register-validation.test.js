import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const REGISTER_PATH = resolve(__dirname, '../docs/plans/james/hero-mode/A/hero-pA4-risk-register.md');
const ROLLBACK_PATH = resolve(__dirname, '../docs/plans/james/hero-mode/A/hero-pA4-rollback-evidence.md');

const register = readFileSync(REGISTER_PATH, 'utf-8');
const rollback = readFileSync(ROLLBACK_PATH, 'utf-8');

// ─── Risk Register: Stop Conditions ─────────────────────────────────────────

describe('Hero pA4 Risk Register — stop conditions (S1-S13)', () => {
  const stopConditions = [
    { id: 'S1', name: 'Raw child content in telemetry/logs' },
    { id: 'S2', name: 'Non-cohort accounts see Hero surfaces' },
    { id: 'S3', name: 'Hero command succeeds for non-enabled account' },
    { id: 'S4', name: 'Duplicate daily coin award' },
    { id: 'S5', name: 'Duplicate Camp debit' },
    { id: 'S6', name: 'Negative balance' },
    { id: 'S7', name: 'Claim without Worker-verified completion' },
    { id: 'S8', name: 'Hero mutates subject Stars/mastery' },
    { id: 'S9', name: 'Dead/unlaunchable primary CTA' },
    { id: 'S10', name: 'Rollback cannot hide while preserving state' },
    { id: 'S11', name: 'Repeated unexplained 500s on Hero routes' },
    { id: 'S12', name: 'Support cannot explain/triage issue' },
    { id: 'S13', name: 'Parent feedback indicates pressure/misleading' },
  ];

  it('contains exactly 13 stop conditions', () => {
    const matches = register.match(/\| S\d+ \|/g);
    assert.ok(matches, 'No stop condition rows found');
    assert.equal(matches.length, 13, `Expected 13 stop conditions, found ${matches.length}`);
  });

  for (const { id, name } of stopConditions) {
    it(`contains stop condition ${id}: ${name}`, () => {
      assert.ok(
        register.includes(`| ${id} |`),
        `Missing stop condition row: ${id}`
      );
      assert.ok(
        register.includes(name),
        `Missing stop condition name: "${name}"`
      );
    });
  }
});

describe('Hero pA4 Risk Register — stop condition fields', () => {
  const stopIds = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'S12', 'S13'];

  for (const id of stopIds) {
    it(`${id} has a detection method`, () => {
      const row = register.split('\n').find(line => line.includes(`| ${id} |`));
      assert.ok(row, `Row for ${id} not found`);
      assert.ok(
        row.includes('detect'),
        `${id} row missing detection method (expected "detect" keyword)`
      );
    });

    it(`${id} has a response action`, () => {
      const row = register.split('\n').find(line => line.includes(`| ${id} |`));
      assert.ok(row, `Row for ${id} not found`);
      assert.ok(
        row.includes('Immediate:') || row.includes('Urgent:') || row.includes('Hold:'),
        `${id} row missing response action (expected "Immediate:", "Urgent:", or "Hold:" prefix)`
      );
    });
  }
});

// ─── Risk Register: Warning Conditions ──────────────────────────────────────

describe('Hero pA4 Risk Register — warning conditions (W1-W9)', () => {
  const warningConditions = [
    { id: 'W1', name: 'Low Hero Quest start rate' },
    { id: 'W2', name: 'Low completion rate' },
    { id: 'W3', name: 'Repeated abandonment after first task' },
    { id: 'W4', name: 'Children open Camp but do not start learning' },
    { id: 'W5', name: 'Parents misunderstand Hero Coins' },
    { id: 'W6', name: 'Telemetry has blind spots for a non-critical signal' },
    { id: 'W7', name: 'One ready subject dominates the schedule more than expected' },
    { id: 'W8', name: 'Support questions cluster around copy or navigation' },
    { id: 'W9', name: 'Performance is slower than ideal but not failing' },
  ];

  it('contains exactly 9 warning conditions', () => {
    const matches = register.match(/\| W\d+ \|/g);
    assert.ok(matches, 'No warning condition rows found');
    assert.equal(matches.length, 9, `Expected 9 warning conditions, found ${matches.length}`);
  });

  for (const { id, name } of warningConditions) {
    it(`contains warning condition ${id}: ${name}`, () => {
      assert.ok(
        register.includes(`| ${id} |`),
        `Missing warning condition row: ${id}`
      );
      assert.ok(
        register.includes(name),
        `Missing warning condition name: "${name}"`
      );
    });
  }
});

describe('Hero pA4 Risk Register — warning condition fields', () => {
  const warningIds = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9'];

  for (const id of warningIds) {
    it(`${id} has a detection method`, () => {
      const row = register.split('\n').find(line => line.includes(`| ${id} |`));
      assert.ok(row, `Row for ${id} not found`);
      assert.ok(
        row.includes('detect'),
        `${id} row missing detection method (expected "detect" keyword)`
      );
    });

    it(`${id} has a response action`, () => {
      const row = register.split('\n').find(line => line.includes(`| ${id} |`));
      assert.ok(row, `Row for ${id} not found`);
      assert.ok(
        row.includes('Decision:'),
        `${id} row missing response action (expected "Decision:" prefix)`
      );
    });
  }
});

// ─── Rollback Evidence Note ─────────────────────────────────────────────────

describe('Hero pA4 Rollback Evidence — key assertions', () => {
  it('mentions "flags off" as the rollback mechanism', () => {
    assert.ok(
      rollback.toLowerCase().includes('flags off'),
      'Rollback evidence must mention "flags off"'
    );
  });

  it('mentions "state preserved" invariant', () => {
    assert.ok(
      rollback.toLowerCase().includes('state preserved'),
      'Rollback evidence must mention "state preserved"'
    );
  });

  it('mentions "never deleted" guarantee', () => {
    assert.ok(
      rollback.toLowerCase().includes('never deleted'),
      'Rollback evidence must mention "never deleted"'
    );
  });

  it('mentions re-enable test verification (hero-p6-rollback.test.js)', () => {
    assert.ok(
      rollback.includes('hero-p6-rollback.test.js'),
      'Rollback evidence must reference the re-enable test file'
    );
  });

  it('documents the three-step rollback procedure', () => {
    assert.ok(rollback.includes('Step 1'), 'Missing Step 1');
    assert.ok(rollback.includes('Step 2'), 'Missing Step 2');
    assert.ok(rollback.includes('Step 3'), 'Missing Step 3');
  });

  it('documents what is preserved: ledger entries', () => {
    assert.ok(
      rollback.toLowerCase().includes('ledger entries'),
      'Must document preservation of ledger entries'
    );
  });

  it('documents what is preserved: Camp ownership', () => {
    assert.ok(
      rollback.toLowerCase().includes('camp ownership'),
      'Must document preservation of Camp ownership'
    );
  });

  it('documents what is preserved: progress state', () => {
    assert.ok(
      rollback.toLowerCase().includes('progress state'),
      'Must document preservation of progress state'
    );
  });

  it('documents what is preserved: quest history', () => {
    assert.ok(
      rollback.toLowerCase().includes('quest history'),
      'Must document preservation of quest history'
    );
  });

  it('documents what changes: UI visibility hidden', () => {
    assert.ok(
      rollback.toLowerCase().includes('hidden'),
      'Must document that UI visibility becomes hidden'
    );
  });

  it('documents what changes: commands rejected', () => {
    assert.ok(
      rollback.toLowerCase().includes('rejected'),
      'Must document that commands become rejected'
    );
  });

  it('documents what changes: telemetry dormant', () => {
    assert.ok(
      rollback.toLowerCase().includes('dormant'),
      'Must document that telemetry becomes dormant'
    );
  });
});
