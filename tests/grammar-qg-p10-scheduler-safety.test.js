/**
 * Grammar QG P10 U8 — Scheduler Safety
 *
 * Proves that the P10 certification status map is consistent with the quality
 * register and that blocked templates are excluded from scheduling.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  GRAMMAR_TEMPLATE_METADATA,
} from '../worker/src/subjects/grammar/content.js';
import {
  isTemplateBlocked,
  CERTIFICATION_STATUS_MAP,
  _testBlockOverride,
} from '../worker/src/subjects/grammar/certification-status.js';
import {
  buildGrammarMiniPack,
} from '../worker/src/subjects/grammar/selection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const STATUS_MAP_PATH = path.resolve(ROOT_DIR, 'reports', 'grammar', 'grammar-qg-p10-certification-status-map.json');

// ---------------------------------------------------------------------------
// 1. P10 Status Map structural validity
// ---------------------------------------------------------------------------

describe('P10 Scheduler Safety: status map structure', () => {
  it('P10 certification-status-map.json exists', () => {
    assert.ok(fs.existsSync(STATUS_MAP_PATH), 'P10 status map file must exist');
  });

  const statusMap = JSON.parse(fs.readFileSync(STATUS_MAP_PATH, 'utf8'));

  it('has entries for all 78 templates', () => {
    assert.equal(Object.keys(statusMap).length, 78);
  });

  it('every template in GRAMMAR_TEMPLATE_METADATA exists in the P10 map', () => {
    const mapKeys = new Set(Object.keys(statusMap));
    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      assert.ok(mapKeys.has(template.id), `Missing template in P10 status map: ${template.id}`);
    }
  });

  it('every entry has a valid status (approved | blocked | watchlist)', () => {
    const validStatuses = new Set(['approved', 'blocked', 'watchlist']);
    for (const [id, entry] of Object.entries(statusMap)) {
      assert.ok(validStatuses.has(entry.status), `Template ${id} has invalid status: ${entry.status}`);
    }
  });

  it('every entry has a non-empty evidence array', () => {
    for (const [id, entry] of Object.entries(statusMap)) {
      assert.ok(Array.isArray(entry.evidence), `Template ${id} evidence is not an array`);
      assert.ok(entry.evidence.length > 0, `Template ${id} has empty evidence array`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Module parity with JSON artefact
// ---------------------------------------------------------------------------

describe('P10 Scheduler Safety: module vs JSON parity', () => {
  const statusMap = JSON.parse(fs.readFileSync(STATUS_MAP_PATH, 'utf8'));

  it('CERTIFICATION_STATUS_MAP matches P10 JSON artefact for every template', () => {
    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      const jsonEntry = statusMap[template.id];
      const moduleEntry = CERTIFICATION_STATUS_MAP[template.id];
      assert.ok(moduleEntry, `Module missing template: ${template.id}`);
      assert.equal(moduleEntry.status, jsonEntry.status, `Status mismatch for ${template.id}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Blocked template exclusion proof
// ---------------------------------------------------------------------------

describe('P10 Scheduler Safety: blocked template exclusion', () => {
  const satsFriendlyTemplate = GRAMMAR_TEMPLATE_METADATA.find((t) => t.satsFriendly);
  const blockedId = satsFriendlyTemplate?.id || GRAMMAR_TEMPLATE_METADATA[0].id;

  it('test-blocked template is excluded from mini-pack scheduling', () => {
    _testBlockOverride.add(blockedId);
    try {
      for (let s = 1; s <= 30; s++) {
        const pack = buildGrammarMiniPack({ seed: s, size: 8 });
        const ids = pack.map((e) => e.templateId);
        assert.ok(!ids.includes(blockedId), `Blocked template ${blockedId} appeared in seed ${s}`);
      }
    } finally {
      _testBlockOverride.delete(blockedId);
    }
  });

  it('approved templates are NOT blocked by isTemplateBlocked', () => {
    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      assert.equal(
        isTemplateBlocked(template.id),
        false,
        `Template ${template.id} should not be blocked (all P10 templates are approved)`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Quality register consistency
// ---------------------------------------------------------------------------

describe('P10 Scheduler Safety: quality register consistency', () => {
  const qualityRegisterPath = path.resolve(ROOT_DIR, 'reports', 'grammar', 'grammar-qg-p10-quality-register.json');

  it('quality register exists', () => {
    assert.ok(fs.existsSync(qualityRegisterPath), 'Quality register file must exist');
  });

  it('status map reflects quality register decisions', () => {
    if (!fs.existsSync(qualityRegisterPath)) return;
    const register = JSON.parse(fs.readFileSync(qualityRegisterPath, 'utf8'));
    const statusMap = JSON.parse(fs.readFileSync(STATUS_MAP_PATH, 'utf8'));

    for (const entry of register.entries) {
      const mapEntry = statusMap[entry.templateId];
      assert.ok(mapEntry, `Status map missing template from quality register: ${entry.templateId}`);
      if (entry.decision === 'blocked') {
        assert.equal(mapEntry.status, 'blocked', `Template ${entry.templateId} is blocked in register but not in status map`);
      }
    }
  });
});
