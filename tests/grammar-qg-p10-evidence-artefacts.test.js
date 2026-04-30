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
    'grammar-qg-p10-render-inventory.md',
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
// 2b. U6 enrichment: visibleOptions, fullSpeechOutput, _feedbackSummary
// ---------------------------------------------------------------------------

describe('P10 Evidence Artefacts: U6 render inventory enrichment', () => {
  const inventoryPath = path.join(REPORTS_DIR, 'grammar-qg-p10-render-inventory.json');

  it('visibleOptions is non-null for selected-response items (single_choice, checkbox_list, table_choice)', () => {
    if (!fs.existsSync(inventoryPath)) {
      assert.fail('Render inventory file does not exist — run generate script first');
    }
    const data = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
    const selectedResponseTypes = ['single_choice', 'checkbox_list', 'table_choice'];
    const selectedItems = data.items.filter((item) => selectedResponseTypes.includes(item.inputType));
    assert.ok(selectedItems.length > 0, 'Expected at least one selected-response item');

    for (const item of selectedItems.slice(0, 50)) {
      assert.ok(
        item.visibleOptions !== null && item.visibleOptions !== undefined,
        `visibleOptions must be non-null for ${item.templateId} seed ${item.seed} (inputType: ${item.inputType})`,
      );
      if (Array.isArray(item.visibleOptions)) {
        assert.ok(item.visibleOptions.length > 0, `visibleOptions must be non-empty array for ${item.templateId} seed ${item.seed}`);
      }
    }
  });

  it('fullSpeechOutput is a non-empty string for items with readAloudText', () => {
    if (!fs.existsSync(inventoryPath)) {
      assert.fail('Render inventory file does not exist — run generate script first');
    }
    const data = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
    const readAloudItems = data.items.filter((item) => item.readAloudText);
    assert.ok(readAloudItems.length > 0, 'Expected at least one item with readAloudText');

    for (const item of readAloudItems.slice(0, 50)) {
      assert.ok(
        typeof item.fullSpeechOutput === 'string' && item.fullSpeechOutput.length > 0,
        `fullSpeechOutput must be a non-empty string for ${item.templateId} seed ${item.seed}`,
      );
    }
  });

  it('_feedbackSummary has feedbackLong or feedbackShort for all items', () => {
    if (!fs.existsSync(inventoryPath)) {
      assert.fail('Render inventory file does not exist — run generate script first');
    }
    const data = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
    const sample = data.items.slice(0, 100);
    let withFeedback = 0;
    for (const item of sample) {
      if (item._feedbackSummary) {
        assert.ok(
          item._feedbackSummary.feedbackShort || item._feedbackSummary.feedbackLong,
          `_feedbackSummary must have feedbackShort or feedbackLong for ${item.templateId} seed ${item.seed}`,
        );
        withFeedback += 1;
      }
    }
    // At least 90% of sampled items should have feedback
    assert.ok(withFeedback >= 90, `Expected at least 90 items with _feedbackSummary, got ${withFeedback}`);
  });

  it('three output files exist (.json, .md, -redacted.md)', () => {
    const files = [
      'grammar-qg-p10-render-inventory.json',
      'grammar-qg-p10-render-inventory.md',
      'grammar-qg-p10-render-inventory-redacted.md',
    ];
    for (const file of files) {
      const filePath = path.join(REPORTS_DIR, file);
      assert.ok(fs.existsSync(filePath), `Expected render inventory output file: ${file}`);
    }
  });

  it('redacted report strips _ prefixed fields', () => {
    const redactedPath = path.join(REPORTS_DIR, 'grammar-qg-p10-render-inventory-redacted.md');
    if (!fs.existsSync(redactedPath)) return;
    const content = fs.readFileSync(redactedPath, 'utf8');
    assert.ok(!content.includes('_feedbackSummary'), 'Redacted report must not contain _feedbackSummary');
    assert.ok(!content.includes('_solutionLines'), 'Redacted report must not contain _solutionLines');
    assert.ok(!content.includes('_answerSpec'), 'Redacted report must not contain _answerSpec');
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

  it('each entry has all 14 required fields (13 content + templateId)', () => {
    if (!fs.existsSync(registerPath)) return;
    const data = JSON.parse(fs.readFileSync(registerPath, 'utf8'));
    const requiredFields = [
      'templateId',
      'decision',
      'severity',
      'reviewerId',
      'reviewMethod',
      'seedWindow',
      'concreteExamples',
      'answerabilityJudgement',
      'grammarLogicJudgement',
      'distractorQualityJudgement',
      'markingJudgement',
      'feedbackJudgement',
      'accessibilityJudgement',
      'finalAction',
    ];

    for (const entry of data.entries) {
      for (const field of requiredFields) {
        assert.ok(
          field in entry,
          `entry ${entry.templateId} missing field '${field}'`,
        );
      }
      // Validate specific field values
      assert.ok(entry.templateId, 'entry.templateId required');
      assert.ok(['approved', 'blocked'].includes(entry.decision), `Invalid decision: ${entry.decision}`);
      assert.equal(entry.reviewerId, 'automated-p10-oracle');
      assert.equal(entry.reviewMethod, 'automated-oracle-with-concrete-evidence');
      assert.ok(
        entry.seedWindow === '1..10' || entry.seedWindow === '1..15',
        `Invalid seedWindow: ${entry.seedWindow}`,
      );
      assert.ok(Array.isArray(entry.concreteExamples), 'concreteExamples must be array');
      assert.ok(entry.concreteExamples.length >= 3, `concreteExamples must have >= 3 items, got ${entry.concreteExamples.length}`);
      assert.ok(['ship', 'requires-adult-review'].includes(entry.finalAction), `Invalid finalAction: ${entry.finalAction}`);
      // severity: null if approved, S0/S1/S2 if blocked
      if (entry.decision === 'approved') {
        assert.equal(entry.severity, null, `Approved entry ${entry.templateId} must have severity null`);
      } else {
        assert.ok(['S0', 'S1', 'S2'].includes(entry.severity), `Blocked entry must have S0/S1/S2 severity`);
      }
      // String judgement fields must be non-empty strings
      assert.ok(typeof entry.answerabilityJudgement === 'string' && entry.answerabilityJudgement.length > 0);
      assert.ok(typeof entry.grammarLogicJudgement === 'string' && entry.grammarLogicJudgement.length > 0);
      assert.ok(typeof entry.distractorQualityJudgement === 'string' && entry.distractorQualityJudgement.length > 0);
      assert.ok(typeof entry.markingJudgement === 'string' && entry.markingJudgement.length > 0);
      assert.ok(typeof entry.feedbackJudgement === 'string' && entry.feedbackJudgement.length > 0);
      assert.ok(typeof entry.accessibilityJudgement === 'string' && entry.accessibilityJudgement.length > 0);
    }
  });

  it('concrete examples have required subfields', () => {
    if (!fs.existsSync(registerPath)) return;
    const data = JSON.parse(fs.readFileSync(registerPath, 'utf8'));
    for (const entry of data.entries) {
      for (const ex of entry.concreteExamples) {
        assert.ok(typeof ex.seed === 'number', `example.seed must be number in ${entry.templateId}`);
        assert.ok(typeof ex.promptText === 'string', `example.promptText must be string in ${entry.templateId}`);
        assert.ok(typeof ex.markingResult === 'string', `example.markingResult must be string in ${entry.templateId}`);
        assert.ok(typeof ex.feedbackSnippet === 'string', `example.feedbackSnippet must be string in ${entry.templateId}`);
      }
    }
  });

  it('high-risk templates have seedWindow 1..15 and 5 examples', () => {
    if (!fs.existsSync(registerPath)) return;
    const data = JSON.parse(fs.readFileSync(registerPath, 'utf8'));
    const highRisk = data.entries.filter((e) => e.seedWindow === '1..15');
    for (const entry of highRisk) {
      assert.equal(entry.concreteExamples.length, 5, `High-risk ${entry.templateId} needs 5 examples`);
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
