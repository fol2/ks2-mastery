/**
 * Grammar QG P13 — Scheduler Blocklist Verification
 *
 * Verifies that the active runtime scheduler is governed by the P11/P12
 * certification status source, not the historical P10 status map.
 *
 * 1. All 78 templates have entries in the P11 certification status map
 * 2. No template is currently blocked or retired
 * 3. Unknown template IDs are blocked by the fail-closed guard
 * 4. The active template denominator equals 78
 * 5. approved_with_limitation decisions are preserved at runtime
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
} from '../worker/src/subjects/grammar/certification-status.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const STATUS_MAP_PATH = path.resolve(ROOT_DIR, 'reports', 'grammar', 'grammar-qg-p11-certification-status-map.json');

const statusMapJson = JSON.parse(fs.readFileSync(STATUS_MAP_PATH, 'utf8'));
const statusMapById = new Map(statusMapJson.entries.map((entry) => [entry.templateId, entry]));

// ---------------------------------------------------------------------------
// 1. Completeness — all 78 templates are in the certification map
// ---------------------------------------------------------------------------

describe('P13 Scheduler Blocklist: completeness', () => {
  it('certification status map has exactly 78 entries', () => {
    assert.equal(statusMapJson.entries.length, 78);
  });

  it('every GRAMMAR_TEMPLATE_METADATA template exists in the certification map', () => {
    const mapKeys = new Set(statusMapJson.entries.map((entry) => entry.templateId));
    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      assert.ok(mapKeys.has(template.id), `Template ${template.id} is missing from the certification status map — would be blocked by fail-closed guard`);
    }
  });

  it('no unknown templates exist in the map (no stale entries)', () => {
    const knownIds = new Set(GRAMMAR_TEMPLATE_METADATA.map((t) => t.id));
    for (const id of statusMapById.keys()) {
      assert.ok(knownIds.has(id), `Certification map contains unknown template: ${id}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. All S0/S1 issues resolved — no blocked templates
// ---------------------------------------------------------------------------

describe('P13 Scheduler Blocklist: zero blocked templates', () => {
  it('no template has blocked or retire_candidate decision in the JSON artefact', () => {
    const blocked = statusMapJson.entries
      .filter((entry) => entry.decision === 'blocked' || entry.decision === 'retire_candidate')
      .map((entry) => entry.templateId);
    assert.equal(blocked.length, 0, `Blocked templates found: ${blocked.join(', ')}`);
  });

  it('no template has blocked or retire_candidate status in the runtime module', () => {
    const blocked = Object.entries(CERTIFICATION_STATUS_MAP)
      .filter(([, entry]) => entry.status === 'blocked' || entry.status === 'retire_candidate')
      .map(([id]) => id);
    assert.equal(blocked.length, 0, `Module reports blocked templates: ${blocked.join(', ')}`);
  });

  it('approved_with_limitation decisions are preserved and still schedulable', () => {
    const limitedEntries = statusMapJson.entries.filter((entry) => entry.decision === 'approved_with_limitation');
    assert.equal(limitedEntries.length, 4);
    for (const entry of limitedEntries) {
      assert.equal(
        CERTIFICATION_STATUS_MAP[entry.templateId].status,
        'approved_with_limitation',
        `Template ${entry.templateId} limitation decision must be preserved at runtime`,
      );
      assert.equal(isTemplateBlocked(entry.templateId), false, `${entry.templateId} should remain schedulable`);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Fail-closed guard — unknown IDs are blocked
// ---------------------------------------------------------------------------

describe('P13 Scheduler Blocklist: fail-closed behaviour', () => {
  it('isTemplateBlocked returns true for an unknown template ID', () => {
    assert.equal(isTemplateBlocked('__nonexistent_phantom_id__'), true);
  });

  it('isTemplateBlocked returns true for an empty string', () => {
    assert.equal(isTemplateBlocked(''), true);
  });

  it('isTemplateBlocked returns true for undefined', () => {
    assert.equal(isTemplateBlocked(undefined), true);
  });

  it('isTemplateBlocked returns false for every known approved template', () => {
    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      assert.equal(
        isTemplateBlocked(template.id),
        false,
        `isTemplateBlocked(${template.id}) returned true — should be unblocked after S0/S1 fixes`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Active template denominator
// ---------------------------------------------------------------------------

describe('P13 Scheduler Blocklist: active denominator', () => {
  it('active template count equals 78', () => {
    const activeCount = GRAMMAR_TEMPLATE_METADATA.filter((t) => !isTemplateBlocked(t.id)).length;
    assert.equal(activeCount, 78);
  });

  it('GRAMMAR_TEMPLATE_METADATA length equals 78', () => {
    assert.equal(GRAMMAR_TEMPLATE_METADATA.length, 78);
  });

  it('CERTIFICATION_STATUS_MAP key count equals GRAMMAR_TEMPLATE_METADATA length', () => {
    assert.equal(Object.keys(CERTIFICATION_STATUS_MAP).length, GRAMMAR_TEMPLATE_METADATA.length);
  });
});
