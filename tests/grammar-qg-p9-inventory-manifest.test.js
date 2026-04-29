import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

import { GRAMMAR_TEMPLATE_METADATA } from '../worker/src/subjects/grammar/content.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const REPORTS_DIR = path.resolve(ROOT_DIR, 'reports', 'grammar');

const manifestPath = path.join(REPORTS_DIR, 'grammar-qg-p9-certification-manifest.json');
const inventoryPath = path.join(REPORTS_DIR, 'grammar-qg-p9-question-inventory.json');
const redactedMdPath = path.join(REPORTS_DIR, 'grammar-qg-p9-question-inventory-redacted.md');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const inventoryJson = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
const redactedMd = fs.readFileSync(redactedMdPath, 'utf8');

describe('P9 Inventory Manifest: item count', () => {
  it('committed inventory JSON item count equals manifest expectedItemCount (2340)', () => {
    assert.equal(inventoryJson.items.length, manifest.expectedItemCount);
    assert.equal(inventoryJson.items.length, 2340);
  });

  it('summary totalItems matches items array length', () => {
    assert.equal(inventoryJson.summary.totalItems, inventoryJson.items.length);
  });
});

describe('P9 Inventory Manifest: templateDenominator', () => {
  it('manifest templateDenominator matches actual GRAMMAR_TEMPLATE_METADATA length (78)', () => {
    assert.equal(manifest.templateDenominator, GRAMMAR_TEMPLATE_METADATA.length);
    assert.equal(manifest.templateDenominator, 78);
  });

  it('inventory uniqueTemplates matches templateDenominator', () => {
    assert.equal(inventoryJson.summary.uniqueTemplates, manifest.templateDenominator);
  });
});

describe('P9 Inventory Manifest: redacted inventory has no answerSpec internals', () => {
  const forbiddenFields = [
    'answerSpecKind',
    'expectedAnswerSummary',
    'variantSignature',
    'generatorFamilyId',
    'solutionLines',
  ];

  for (const field of forbiddenFields) {
    it(`redacted MD does not contain "${field}" column header`, () => {
      // The redacted markdown should not have these as column headers
      const headerLine = redactedMd.split('\n').find((line) => line.startsWith('|') && line.includes(' --- ') === false && line.includes('templateId'));
      assert.ok(headerLine, 'Expected a markdown table header line');
      assert.ok(!headerLine.includes(field), `Redacted MD header must not contain "${field}"`);
    });
  }

  it('golden field is not present in redacted MD content', () => {
    // Ensure no "golden" key leaks in the redacted output
    assert.ok(!redactedMd.includes('| golden |'), 'Redacted MD must not contain golden column');
  });

  it('nearMiss field is not present in redacted MD content', () => {
    assert.ok(!redactedMd.includes('| nearMiss |'), 'Redacted MD must not contain nearMiss column');
  });

  it('accepted field is not present in redacted MD content as column header', () => {
    assert.ok(!redactedMd.includes('| accepted |'), 'Redacted MD must not contain accepted column');
  });
});

describe('P9 Inventory Manifest: no reviewStatus pending', () => {
  it('no item has reviewStatus "pending" in the inventory', () => {
    const pendingItems = inventoryJson.items.filter((item) => item.reviewStatus === 'pending');
    assert.equal(pendingItems.length, 0, `Found ${pendingItems.length} items with reviewStatus "pending"`);
  });

  it('all items have a valid reviewStatus', () => {
    const validStatuses = new Set(['draft_only', 'accepted', 'watchlist', 'rejected']);
    const invalidItems = inventoryJson.items.filter((item) => !validStatuses.has(item.reviewStatus));
    assert.equal(invalidItems.length, 0, `Found ${invalidItems.length} items with invalid reviewStatus: ${invalidItems.slice(0, 3).map((i) => i.reviewStatus).join(', ')}`);
  });
});

describe('P9 Inventory Manifest: expectedOutputPaths all exist', () => {
  for (const relPath of manifest.expectedOutputPaths) {
    it(`output file exists: ${relPath}`, () => {
      const fullPath = path.resolve(ROOT_DIR, relPath);
      assert.ok(fs.existsSync(fullPath), `Expected file does not exist: ${fullPath}`);
    });
  }
});

describe('P9 Inventory Manifest: schema is valid', () => {
  const requiredFields = [
    'contentReleaseId',
    'templateDenominator',
    'seedWindow',
    'seedWindowPerEvidenceType',
    'expectedItemCount',
    'expectedOutputPaths',
    'generatorScript',
    'generatorScriptHash',
    'generationCommand',
    'generatedAt',
    'answerInternalsIncluded',
    'answerInternalsRedacted',
  ];

  for (const field of requiredFields) {
    it(`manifest has required field: ${field}`, () => {
      assert.ok(field in manifest, `Missing required field: ${field}`);
      assert.ok(manifest[field] !== undefined && manifest[field] !== null, `Field "${field}" is null/undefined`);
    });
  }

  it('generatedAt is a valid ISO timestamp', () => {
    const date = new Date(manifest.generatedAt);
    assert.ok(!isNaN(date.getTime()), `generatedAt is not a valid ISO date: ${manifest.generatedAt}`);
  });

  it('generatorScriptHash is a 64-character hex string (SHA-256)', () => {
    assert.match(manifest.generatorScriptHash, /^[a-f0-9]{64}$/);
  });

  it('expectedOutputPaths is a non-empty array', () => {
    assert.ok(Array.isArray(manifest.expectedOutputPaths));
    assert.ok(manifest.expectedOutputPaths.length > 0);
  });

  it('seedWindow.certification is "1..30"', () => {
    assert.equal(manifest.seedWindow.certification, '1..30');
  });

  it('answerInternalsIncluded is true', () => {
    assert.equal(manifest.answerInternalsIncluded, true);
  });

  it('answerInternalsRedacted is true', () => {
    assert.equal(manifest.answerInternalsRedacted, true);
  });
});
