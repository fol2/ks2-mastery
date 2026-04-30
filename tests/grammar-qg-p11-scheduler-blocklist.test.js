/**
 * Grammar QG P11 U8 — Scheduler Blocklist Verification
 *
 * After U1-U7 remediated all S0/S1 issues, this test suite verifies:
 * 1. All 78 templates have entries in the P10 certification status map
 * 2. No template is currently marked 'blocked' (all issues resolved)
 * 3. Unknown template IDs are blocked by the fail-closed guard
 * 4. The active template denominator equals 78
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
const STATUS_MAP_PATH = path.resolve(ROOT_DIR, 'reports', 'grammar', 'grammar-qg-p10-certification-status-map.json');

const statusMapJson = JSON.parse(fs.readFileSync(STATUS_MAP_PATH, 'utf8'));

// ---------------------------------------------------------------------------
// 1. Completeness — all 78 templates are in the certification map
// ---------------------------------------------------------------------------

describe('P11 U8 Scheduler Blocklist: completeness', () => {
  it('certification status map has exactly 78 entries', () => {
    assert.equal(Object.keys(statusMapJson).length, 78);
  });

  it('every GRAMMAR_TEMPLATE_METADATA template exists in the certification map', () => {
    const mapKeys = new Set(Object.keys(statusMapJson));
    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      assert.ok(mapKeys.has(template.id), `Template ${template.id} is missing from the certification status map — would be blocked by fail-closed guard`);
    }
  });

  it('no unknown templates exist in the map (no stale entries)', () => {
    const knownIds = new Set(GRAMMAR_TEMPLATE_METADATA.map((t) => t.id));
    for (const id of Object.keys(statusMapJson)) {
      assert.ok(knownIds.has(id), `Certification map contains unknown template: ${id}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. All S0/S1 issues resolved — no blocked templates
// ---------------------------------------------------------------------------

describe('P11 U8 Scheduler Blocklist: zero blocked templates', () => {
  it('no template has status "blocked" in the JSON artefact', () => {
    const blocked = Object.entries(statusMapJson)
      .filter(([, entry]) => entry.status === 'blocked')
      .map(([id]) => id);
    assert.equal(blocked.length, 0, `Blocked templates found: ${blocked.join(', ')}`);
  });

  it('no template has status "blocked" in the runtime module', () => {
    const blocked = Object.entries(CERTIFICATION_STATUS_MAP)
      .filter(([, entry]) => entry.status === 'blocked')
      .map(([id]) => id);
    assert.equal(blocked.length, 0, `Module reports blocked templates: ${blocked.join(', ')}`);
  });

  it('all templates are approved (no watchlist either)', () => {
    for (const [id, entry] of Object.entries(statusMapJson)) {
      assert.equal(entry.status, 'approved', `Template ${id} has non-approved status: ${entry.status}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Fail-closed guard — unknown IDs are blocked
// ---------------------------------------------------------------------------

describe('P11 U8 Scheduler Blocklist: fail-closed behaviour', () => {
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

describe('P11 U8 Scheduler Blocklist: active denominator', () => {
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
