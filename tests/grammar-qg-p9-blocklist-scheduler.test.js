import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

import {
  buildGrammarMiniPack,
  buildGrammarPracticeQueue,
} from '../worker/src/subjects/grammar/selection.js';
import {
  GRAMMAR_TEMPLATE_METADATA,
} from '../worker/src/subjects/grammar/content.js';
import {
  isTemplateBlocked,
  CERTIFICATION_STATUS_MAP,
  _testBlockOverride,
} from '../worker/src/subjects/grammar/certification-status.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const STATUS_MAP_PATH = path.resolve(ROOT_DIR, 'reports', 'grammar', 'grammar-qg-p9-certification-status-map.json');
const INVENTORY_PATH = path.resolve(ROOT_DIR, 'reports', 'grammar', 'grammar-qg-p9-question-inventory.json');

const statusMapJson = JSON.parse(fs.readFileSync(STATUS_MAP_PATH, 'utf8'));
const inventoryJson = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
const P9_TEMPLATE_IDS = Array.from(new Set(inventoryJson.items.map((item) => item.templateId))).sort();

// --- Status map structural tests ---

describe('P9 Certification Status Map: completeness', () => {
  it('has entries for all 78 templates', () => {
    assert.equal(Object.keys(statusMapJson).length, 78);
  });

  it('every frozen P9 inventory template exists in the status map', () => {
    const mapKeys = new Set(Object.keys(statusMapJson));
    for (const templateId of P9_TEMPLATE_IDS) {
      assert.ok(mapKeys.has(templateId), `Missing template in status map: ${templateId}`);
    }
  });

  it('has no entries with status pending or unknown', () => {
    for (const [id, entry] of Object.entries(statusMapJson)) {
      assert.notEqual(entry.status, 'pending', `Template ${id} has forbidden status "pending"`);
      assert.notEqual(entry.status, 'unknown', `Template ${id} has forbidden status "unknown"`);
    }
  });

  it('all entries have a valid status value', () => {
    const validStatuses = new Set(['approved', 'blocked', 'watchlist']);
    for (const [id, entry] of Object.entries(statusMapJson)) {
      assert.ok(validStatuses.has(entry.status), `Template ${id} has invalid status: ${entry.status}`);
    }
  });

  it('all entries have a non-empty evidence array', () => {
    for (const [id, entry] of Object.entries(statusMapJson)) {
      assert.ok(Array.isArray(entry.evidence), `Template ${id} evidence is not an array`);
      assert.ok(entry.evidence.length > 0, `Template ${id} has empty evidence array`);
    }
  });
});

describe('P9 historical status map and active runtime coverage', () => {
  it('active CERTIFICATION_STATUS_MAP covers the live template denominator', () => {
    assert.equal(Object.keys(CERTIFICATION_STATUS_MAP).length, GRAMMAR_TEMPLATE_METADATA.length);
  });

  it('active runtime map covers every live template ID', () => {
    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      const moduleEntry = CERTIFICATION_STATUS_MAP[template.id];
      assert.ok(moduleEntry, `Module missing template: ${template.id}`);
    }
  });

  it('active runtime map still covers every historical P9 template ID', () => {
    for (const templateId of P9_TEMPLATE_IDS) {
      const moduleEntry = CERTIFICATION_STATUS_MAP[templateId];
      assert.ok(moduleEntry, `Module missing historical P9 template: ${templateId}`);
    }
  });

  it('historical P9 JSON is not treated as the active production runtime authority', () => {
    // P19 + P19a Contract A.2 fairness conversion grew the live count well
    // beyond the historical P9 figure of 4. Property check (≥100) keeps the
    // test robust to future fairness predicate refinements.
    const limitedRuntimeTemplates = Object.values(CERTIFICATION_STATUS_MAP)
      .filter((entry) => entry.status === 'approved_with_limitation');
    assert.ok(
      limitedRuntimeTemplates.length >= 100,
      `Expected ≥100 limited runtime templates, got ${limitedRuntimeTemplates.length}`,
    );
  });
});

// --- isTemplateBlocked helper tests ---

describe('P9 isTemplateBlocked helper', () => {
  it('returns false for an approved template', () => {
    assert.equal(isTemplateBlocked('sentence_type_table'), false);
  });

  it('returns true for an unknown templateId (fail-closed)', () => {
    assert.equal(isTemplateBlocked('nonexistent_template_xyz'), true);
  });
});

// --- Scheduler blocklist integration tests ---

describe('P9 Blocklist: buildGrammarMiniPack with all approved', () => {
  it('returns results when all templates are approved', () => {
    const pack = buildGrammarMiniPack({ seed: 42, size: 8 });
    assert.equal(pack.length, 8);
  });

  it('behaves identically to P8 (selection returns results with default options)', () => {
    const pack = buildGrammarMiniPack({ seed: 123, size: 6 });
    assert.equal(pack.length, 6);
    for (const entry of pack) {
      assert.ok(entry.templateId, 'each entry has a templateId');
      assert.ok(Array.isArray(entry.skillIds), 'each entry has skillIds');
    }
  });
});

describe('P9 Blocklist: buildGrammarPracticeQueue with all approved', () => {
  it('returns results when all templates are approved', () => {
    const queue = buildGrammarPracticeQueue({ seed: 42, size: 5 });
    assert.equal(queue.length, 5);
  });

  it('behaves identically to P8 (selection returns results with default options)', () => {
    const queue = buildGrammarPracticeQueue({ seed: 99, size: 3 });
    assert.equal(queue.length, 3);
    for (const entry of queue) {
      assert.ok(entry.templateId, 'each entry has a templateId');
      assert.ok(Array.isArray(entry.skillIds), 'each entry has skillIds');
    }
  });
});

// --- Blocked template exclusion tests ---
// These tests use the _testBlockOverride set exported from certification-status.js
// to simulate a blocked template without needing to mutate frozen objects.

describe('P9 Blocklist: blocked template exclusion in miniPack', () => {
  // Pick a template that is satsFriendly so it would normally appear in mini-pack
  const blockedId = GRAMMAR_TEMPLATE_METADATA.find((t) => t.satsFriendly)?.id || GRAMMAR_TEMPLATE_METADATA[0].id;

  it('blocked template never appears in mini-pack across many seeds', () => {
    _testBlockOverride.add(blockedId);
    try {
      for (let s = 1; s <= 50; s++) {
        const pack = buildGrammarMiniPack({ seed: s, size: 8 });
        const ids = pack.map((e) => e.templateId);
        assert.ok(!ids.includes(blockedId), `Blocked template ${blockedId} appeared in mini-pack with seed ${s}`);
      }
    } finally {
      _testBlockOverride.delete(blockedId);
    }
  });

  it('blocked template CAN appear with includeBlocked: true', () => {
    _testBlockOverride.add(blockedId);
    try {
      // With includeBlocked, the template is eligible. Run enough seeds to verify
      // it appears at least once (probabilistic but with 200 packs of 8, this is
      // near-certain for any template in the pool).
      let appeared = false;
      for (let s = 1; s <= 200; s++) {
        const pack = buildGrammarMiniPack({ seed: s, size: 8, includeBlocked: true });
        if (pack.some((e) => e.templateId === blockedId)) {
          appeared = true;
          break;
        }
      }
      assert.ok(appeared, `Blocked template ${blockedId} never appeared even with includeBlocked: true`);
    } finally {
      _testBlockOverride.delete(blockedId);
    }
  });
});

describe('P9 Blocklist: blocked template exclusion in practiceQueue', () => {
  const blockedId = GRAMMAR_TEMPLATE_METADATA.find((t) => t.satsFriendly)?.id || GRAMMAR_TEMPLATE_METADATA[0].id;

  it('blocked template never appears in practice queue across many seeds', () => {
    _testBlockOverride.add(blockedId);
    try {
      for (let s = 1; s <= 50; s++) {
        const queue = buildGrammarPracticeQueue({ seed: s, size: 5 });
        const ids = queue.map((e) => e.templateId);
        assert.ok(!ids.includes(blockedId), `Blocked template ${blockedId} appeared in practice queue with seed ${s}`);
      }
    } finally {
      _testBlockOverride.delete(blockedId);
    }
  });

  it('blocked template CAN appear in practice queue with includeBlocked: true', () => {
    _testBlockOverride.add(blockedId);
    try {
      let appeared = false;
      for (let s = 1; s <= 200; s++) {
        const queue = buildGrammarPracticeQueue({ seed: s, size: 5, includeBlocked: true });
        if (queue.some((e) => e.templateId === blockedId)) {
          appeared = true;
          break;
        }
      }
      assert.ok(appeared, `Blocked template ${blockedId} never appeared even with includeBlocked: true`);
    } finally {
      _testBlockOverride.delete(blockedId);
    }
  });
});
