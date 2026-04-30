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

  it('each result has per-option detail with required fields', () => {
    if (!fs.existsSync(auditPath)) return;
    const data = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
    const sample = data.results.slice(0, 30);
    for (const item of sample) {
      assert.ok(Array.isArray(item.options), `item.options must be array for ${item.templateId} seed ${item.seed}`);
      assert.equal(item.options.length, item.optionCount, 'options array length must match optionCount');
      for (const opt of item.options) {
        assert.ok(typeof opt.optionText === 'string', 'opt.optionText must be string');
        assert.ok(opt.optionText.length > 0, 'opt.optionText must not be empty');
        assert.ok(typeof opt.isCorrect === 'boolean', 'opt.isCorrect must be boolean');
        if (!opt.isCorrect) {
          assert.ok(typeof opt.misconceptionTag === 'string' || opt.misconceptionTag === null,
            'opt.misconceptionTag must be string or null for incorrect options');
          if (opt.misconceptionTag) {
            assert.ok(typeof opt.whyWrong === 'string', 'opt.whyWrong must be string when misconceptionTag is present');
            assert.ok(opt.whyWrong.length > 0, 'opt.whyWrong must not be empty');
          }
        } else {
          assert.equal(opt.misconceptionTag, null, 'correct option must have null misconceptionTag');
          assert.equal(opt.whyWrong, null, 'correct option must have null whyWrong');
        }
      }
    }
  });

  it('each result has ambiguousConceptArea and requiresAdultReview flags', () => {
    if (!fs.existsSync(auditPath)) return;
    const data = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
    for (const item of data.results) {
      assert.ok(typeof item.ambiguousConceptArea === 'boolean',
        `ambiguousConceptArea must be boolean for ${item.templateId}`);
      assert.ok(typeof item.requiresAdultReview === 'boolean',
        `requiresAdultReview must be boolean for ${item.templateId}`);
      assert.equal(item.ambiguousConceptArea, item.requiresAdultReview,
        'requiresAdultReview must mirror ambiguousConceptArea');
    }
  });

  it('report has ambiguousTemplates array at top level', () => {
    if (!fs.existsSync(auditPath)) return;
    const data = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
    assert.ok(Array.isArray(data.ambiguousTemplates), 'ambiguousTemplates must be array');
    assert.ok(data.ambiguousTemplates.length > 0, 'ambiguousTemplates must not be empty (known ambiguous areas exist)');
    // Verify every flagged template actually has results marked ambiguous
    for (const tid of data.ambiguousTemplates) {
      const matching = data.results.filter((r) => r.templateId === tid);
      assert.ok(matching.length > 0, `ambiguousTemplates entry ${tid} must have results`);
      assert.ok(matching.every((r) => r.ambiguousConceptArea === true),
        `all results for ${tid} must have ambiguousConceptArea=true`);
    }
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
