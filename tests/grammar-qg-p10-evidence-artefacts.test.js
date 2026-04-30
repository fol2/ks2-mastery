/**
 * Grammar QG P10 — Evidence Artefacts Integration Test
 *
 * Verifies all P10 report files exist and have correct structure:
 * - Render inventory has 2,340 items
 * - Quality register has 78 entries
 * - Distractor audit has 0 S0 failures
 * - Certification status map matches quality register
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const REPORTS_DIR = path.resolve(ROOT_DIR, 'reports', 'grammar');

// ---------------------------------------------------------------------------
// 1. Report files exist
// ---------------------------------------------------------------------------

describe('P10 Evidence Artefacts: file existence', () => {
  const expectedFiles = [
    'grammar-qg-p10-render-inventory.json',
    'grammar-qg-p10-render-inventory-redacted.md',
    'grammar-qg-p10-quality-register.json',
    'grammar-qg-p10-distractor-audit.json',
    'grammar-qg-p10-marking-matrix.json',
    'grammar-qg-p10-marking-matrix.md',
    'grammar-qg-p10-certification-status-map.json',
  ];

  for (const file of expectedFiles) {
    it(`${file} exists`, () => {
      const filePath = path.join(REPORTS_DIR, file);
      assert.ok(fs.existsSync(filePath), `Expected report file: ${filePath}`);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Render inventory structure
// ---------------------------------------------------------------------------

describe('P10 Evidence Artefacts: render inventory', () => {
  const inventoryPath = path.join(REPORTS_DIR, 'grammar-qg-p10-render-inventory.json');

  it('has 2,340 items (78 templates x 30 seeds)', () => {
    if (!fs.existsSync(inventoryPath)) {
      assert.fail('Render inventory file does not exist — run generate script first');
    }
    const data = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
    assert.equal(data.metadata.totalItems, 2340, `Expected 2340 items, got ${data.metadata.totalItems}`);
    assert.equal(data.items.length, 2340, `Expected 2340 items array length, got ${data.items.length}`);
  });

  it('has correct metadata fields', () => {
    if (!fs.existsSync(inventoryPath)) return;
    const data = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
    assert.equal(data.metadata.templateCount, 78);
    assert.equal(data.metadata.seedRange, '1..30');
    assert.ok(data.metadata.contentReleaseId.startsWith('grammar-qg-p10'));
  });

  it('each item has required render fields', () => {
    if (!fs.existsSync(inventoryPath)) return;
    const data = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
    const sample = data.items.slice(0, 20);
    for (const item of sample) {
      assert.ok(item.templateId, 'item.templateId required');
      assert.ok(typeof item.seed === 'number', 'item.seed must be number');
      assert.ok(item.inputType, 'item.inputType required');
      assert.ok(typeof item.promptText === 'string', 'item.promptText must be string');
      assert.ok(item.contentReleaseId, 'item.contentReleaseId required');
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Quality register structure
// ---------------------------------------------------------------------------

describe('P10 Evidence Artefacts: quality register', () => {
  const registerPath = path.join(REPORTS_DIR, 'grammar-qg-p10-quality-register.json');

  it('has 78 entries (one per template)', () => {
    if (!fs.existsSync(registerPath)) {
      assert.fail('Quality register file does not exist — run generate script first');
    }
    const data = JSON.parse(fs.readFileSync(registerPath, 'utf8'));
    assert.equal(data.entries.length, 78, `Expected 78 entries, got ${data.entries.length}`);
  });

  it('each entry has required fields', () => {
    if (!fs.existsSync(registerPath)) return;
    const data = JSON.parse(fs.readFileSync(registerPath, 'utf8'));
    for (const entry of data.entries) {
      assert.ok(entry.templateId, 'entry.templateId required');
      assert.ok(['approved', 'blocked'].includes(entry.decision), `Invalid decision: ${entry.decision}`);
      assert.equal(entry.reviewMethod, 'automated-oracle');
      assert.equal(entry.seedWindow, '1..10');
      assert.ok(Array.isArray(entry.evidence), 'entry.evidence must be array');
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Distractor audit: 0 S0 failures
// ---------------------------------------------------------------------------

describe('P10 Evidence Artefacts: distractor audit', () => {
  const auditPath = path.join(REPORTS_DIR, 'grammar-qg-p10-distractor-audit.json');

  it('has 0 S0 failures', () => {
    if (!fs.existsSync(auditPath)) {
      assert.fail('Distractor audit file does not exist — run audit script first');
    }
    const data = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
    assert.equal(data.metadata.s0Count, 0, `Expected 0 S0 failures, got ${data.metadata.s0Count}`);
  });

  it('has 0 S1 failures', () => {
    if (!fs.existsSync(auditPath)) return;
    const data = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
    assert.equal(data.metadata.s1Count, 0, `Expected 0 S1 failures, got ${data.metadata.s1Count}`);
  });

  it('pass flag is true', () => {
    if (!fs.existsSync(auditPath)) return;
    const data = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
    assert.equal(data.metadata.pass, true);
  });
});

// ---------------------------------------------------------------------------
// 5. Certification status map matches quality register
// ---------------------------------------------------------------------------

describe('P10 Evidence Artefacts: status map vs quality register consistency', () => {
  const statusMapPath = path.join(REPORTS_DIR, 'grammar-qg-p10-certification-status-map.json');
  const registerPath = path.join(REPORTS_DIR, 'grammar-qg-p10-quality-register.json');

  it('every blocked entry in quality register is blocked in status map', () => {
    if (!fs.existsSync(statusMapPath) || !fs.existsSync(registerPath)) {
      assert.fail('Required files do not exist');
    }
    const statusMap = JSON.parse(fs.readFileSync(statusMapPath, 'utf8'));
    const register = JSON.parse(fs.readFileSync(registerPath, 'utf8'));

    const blockedInRegister = register.entries.filter((e) => e.decision === 'blocked');
    for (const entry of blockedInRegister) {
      assert.equal(
        statusMap[entry.templateId]?.status,
        'blocked',
        `Template ${entry.templateId} is blocked in register but not in status map`,
      );
    }
  });

  it('status map has 78 entries', () => {
    if (!fs.existsSync(statusMapPath)) return;
    const statusMap = JSON.parse(fs.readFileSync(statusMapPath, 'utf8'));
    assert.equal(Object.keys(statusMap).length, 78);
  });
});

// ---------------------------------------------------------------------------
// 6. Marking matrix: 9 variant categories per entry
// ---------------------------------------------------------------------------

describe('P10 Evidence Artefacts: marking matrix full variant expansion', () => {
  const matrixPath = path.join(REPORTS_DIR, 'grammar-qg-p10-marking-matrix.json');

  it('marking matrix JSON exists and is parseable', () => {
    assert.ok(fs.existsSync(matrixPath), `Missing: ${matrixPath}`);
    JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
  });

  it('metadata declares variantCategories = 9', () => {
    if (!fs.existsSync(matrixPath)) return;
    const data = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
    assert.equal(data.metadata.variantCategories, 9);
  });

  it('every entry has all 9 variant categories', () => {
    if (!fs.existsSync(matrixPath)) return;
    const data = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
    assert.ok(data.entries.length > 0, 'matrix must have at least one entry');

    const requiredKeys = [
      'goldenAnswers',
      'acceptedVariants',
      'nearMisses',
      'rawPromptProbes',
      'smartPunctuationVariants',
      'caseVariants',
      'commonChildMistakes',
      'expectedScore',
      'misconceptionTag',
    ];

    for (const entry of data.entries) {
      for (const key of requiredKeys) {
        assert.ok(
          key in entry,
          `Entry ${entry.templateId}:${entry.seed} missing category '${key}'`,
        );
      }
    }
  });

  it('goldenAnswers is a non-empty array with pass/fail results', () => {
    if (!fs.existsSync(matrixPath)) return;
    const data = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
    for (const entry of data.entries) {
      assert.ok(Array.isArray(entry.goldenAnswers), 'goldenAnswers must be array');
      assert.ok(entry.goldenAnswers.length >= 1, 'goldenAnswers must have at least one entry');
      for (const g of entry.goldenAnswers) {
        assert.ok(typeof g.answer === 'string', 'goldenAnswers[].answer must be string');
        assert.ok(typeof g.passed === 'boolean', 'goldenAnswers[].passed must be boolean');
      }
    }
  });

  it('acceptedVariants is an array with pass/fail results', () => {
    if (!fs.existsSync(matrixPath)) return;
    const data = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
    for (const entry of data.entries) {
      assert.ok(Array.isArray(entry.acceptedVariants), 'acceptedVariants must be array');
      for (const v of entry.acceptedVariants) {
        assert.ok(typeof v.answer === 'string', 'acceptedVariants[].answer must be string');
        assert.ok(typeof v.passed === 'boolean', 'acceptedVariants[].passed must be boolean');
        assert.ok(typeof v.reason === 'string', 'acceptedVariants[].reason must be string');
      }
    }
  });

  it('nearMisses is an array with pass/fail results', () => {
    if (!fs.existsSync(matrixPath)) return;
    const data = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
    for (const entry of data.entries) {
      assert.ok(Array.isArray(entry.nearMisses), 'nearMisses must be array');
      for (const nm of entry.nearMisses) {
        assert.ok(typeof nm.answer === 'string', 'nearMisses[].answer must be string');
        assert.ok(typeof nm.passed === 'boolean', 'nearMisses[].passed must be boolean');
      }
    }
  });

  it('rawPromptProbes has 4 probes per entry, all marked incorrect', () => {
    if (!fs.existsSync(matrixPath)) return;
    const data = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
    for (const entry of data.entries) {
      assert.ok(Array.isArray(entry.rawPromptProbes), 'rawPromptProbes must be array');
      assert.equal(entry.rawPromptProbes.length, 4, `Expected 4 probes for ${entry.templateId}:${entry.seed}`);
      for (const p of entry.rawPromptProbes) {
        assert.ok(typeof p.answer === 'string', 'rawPromptProbes[].answer must be string');
        assert.equal(p.passed, false, `Probe "${p.reason}" must mark incorrect for ${entry.templateId}:${entry.seed}`);
      }
    }
  });

  it('smartPunctuationVariants is a non-empty array with pass/fail results', () => {
    if (!fs.existsSync(matrixPath)) return;
    const data = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
    for (const entry of data.entries) {
      assert.ok(Array.isArray(entry.smartPunctuationVariants), 'smartPunctuationVariants must be array');
      assert.ok(entry.smartPunctuationVariants.length >= 1, 'smartPunctuationVariants must have at least one entry');
      for (const sp of entry.smartPunctuationVariants) {
        assert.ok(typeof sp.answer === 'string', 'smartPunctuationVariants[].answer must be string');
        assert.ok(typeof sp.passed === 'boolean', 'smartPunctuationVariants[].passed must be boolean');
        assert.ok(typeof sp.transform === 'string', 'smartPunctuationVariants[].transform must be string');
      }
    }
  });

  it('caseVariants has 3 entries per entry', () => {
    if (!fs.existsSync(matrixPath)) return;
    const data = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
    for (const entry of data.entries) {
      assert.ok(Array.isArray(entry.caseVariants), 'caseVariants must be array');
      assert.equal(entry.caseVariants.length, 3, `Expected 3 case variants for ${entry.templateId}:${entry.seed}`);
      for (const cv of entry.caseVariants) {
        assert.ok(typeof cv.answer === 'string', 'caseVariants[].answer must be string');
        assert.ok(typeof cv.passed === 'boolean', 'caseVariants[].passed must be boolean');
        assert.ok(typeof cv.transform === 'string', 'caseVariants[].transform must be string');
      }
    }
  });

  it('commonChildMistakes is an array with pass/fail results', () => {
    if (!fs.existsSync(matrixPath)) return;
    const data = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
    for (const entry of data.entries) {
      assert.ok(Array.isArray(entry.commonChildMistakes), 'commonChildMistakes must be array');
      for (const cm of entry.commonChildMistakes) {
        assert.ok(typeof cm.answer === 'string', 'commonChildMistakes[].answer must be string');
        assert.ok(typeof cm.passed === 'boolean', 'commonChildMistakes[].passed must be boolean');
      }
    }
  });

  it('expectedScore has correct/incorrect classification', () => {
    if (!fs.existsSync(matrixPath)) return;
    const data = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
    for (const entry of data.entries) {
      assert.ok(typeof entry.expectedScore === 'object', 'expectedScore must be object');
      assert.equal(entry.expectedScore.golden, 'correct');
      assert.equal(entry.expectedScore.acceptedVariants, 'correct');
      assert.equal(entry.expectedScore.nearMisses, 'incorrect');
      assert.equal(entry.expectedScore.rawPromptProbes, 'incorrect');
    }
  });

  it('misconceptionTag is a string or null', () => {
    if (!fs.existsSync(matrixPath)) return;
    const data = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
    for (const entry of data.entries) {
      assert.ok(
        entry.misconceptionTag === null || typeof entry.misconceptionTag === 'string',
        `misconceptionTag must be string|null for ${entry.templateId}:${entry.seed}`,
      );
    }
  });

  it('marking matrix markdown report exists', () => {
    const mdPath = path.join(REPORTS_DIR, 'grammar-qg-p10-marking-matrix.md');
    assert.ok(fs.existsSync(mdPath), `Missing: ${mdPath}`);
  });
});
