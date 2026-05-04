import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPORTS_DIR = path.resolve(import.meta.dirname, '..', 'reports', 'grammar');
const EXPECTED_RELEASE_ID = 'grammar-qg-p11-2026-04-30';

function readJSON(filename) {
  const filepath = path.join(REPORTS_DIR, filename);
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

describe('Grammar QG P12 — P11 artefact identity', () => {
  describe('Render inventory', () => {
    const inventory = readJSON('grammar-qg-p11-render-inventory.json');

    it('metadata.contentReleaseId equals grammar-qg-p11-2026-04-30', () => {
      assert.equal(inventory.metadata.contentReleaseId, EXPECTED_RELEASE_ID);
    });

    it('first item has correct contentReleaseId', () => {
      assert.equal(inventory.items[0].contentReleaseId, EXPECTED_RELEASE_ID);
    });

    it('middle item has correct contentReleaseId', () => {
      const mid = Math.floor(inventory.items.length / 2);
      assert.equal(inventory.items[mid].contentReleaseId, EXPECTED_RELEASE_ID);
    });

    it('last item has correct contentReleaseId', () => {
      const last = inventory.items[inventory.items.length - 1];
      assert.equal(last.contentReleaseId, EXPECTED_RELEASE_ID);
    });

    it('has exactly 2,340 items', () => {
      assert.equal(inventory.items.length, 2340);
    });

    it('has 78 unique templateIds', () => {
      const unique = new Set(inventory.items.map((i) => i.templateId));
      assert.equal(unique.size, 78);
    });
  });

  describe('Quality register', () => {
    const register = readJSON('grammar-qg-p11-quality-register.json');

    it('metadata.contentReleaseId matches P11', () => {
      assert.equal(register.metadata.contentReleaseId, EXPECTED_RELEASE_ID);
    });

    it('has 78 entries', () => {
      assert.equal(register.entries.length, 78);
    });
  });

  describe('Distractor audit', () => {
    const audit = readJSON('grammar-qg-p11-distractor-audit.json');

    it('metadata.contentReleaseId matches P11', () => {
      assert.equal(audit.metadata.contentReleaseId, EXPECTED_RELEASE_ID);
    });
  });

  describe('Marking matrix', () => {
    const matrix = readJSON('grammar-qg-p11-marking-matrix.json');

    it('metadata.contentReleaseId matches P11', () => {
      assert.equal(matrix.metadata.contentReleaseId, EXPECTED_RELEASE_ID);
    });
  });

  describe('Certification status map (live runtime authority)', () => {
    // P19 supersedes the P11 frozen baseline: grammar-qg-p11-certification-
    // status-map.json is now the live runtime authority that the generator
    // regenerates every release. The render inventory + quality register stay
    // frozen at P11 (those are historical evidence), but the cert-status-map
    // tracks the current 510-template runtime release.
    const statusMap = readJSON('grammar-qg-p11-certification-status-map.json');

    it('covers the live 510-template runtime inventory', () => {
      assert.equal(statusMap.entries.length, 510);
      assert.equal(statusMap.metadata.templateCount, 510);
    });

    it('metadata.contentReleaseId matches the current P19 runtime release', () => {
      assert.equal(statusMap.metadata.contentReleaseId, 'grammar-qg-p19-2026-05-04');
    });

    it('rejects unknown template ID (fail-closed assertion)', () => {
      const knownIds = new Set(statusMap.entries.map((e) => e.templateId));
      assert.equal(knownIds.has('FAKE_TEMPLATE_THAT_DOES_NOT_EXIST'), false);
      // The generator itself enforces fail-closed — verify no duplicates
      assert.equal(knownIds.size, 510);
    });

    it('every entry has valid decision field', () => {
      const validDecisions = new Set(['approved', 'approved_with_limitation', 'blocked']);
      for (const entry of statusMap.entries) {
        assert.ok(
          validDecisions.has(entry.decision),
          `${entry.templateId} has invalid decision: ${entry.decision}`,
        );
      }
    });

    it('every entry has evidence array with expected sources', () => {
      for (const entry of statusMap.entries) {
        assert.ok(Array.isArray(entry.evidence), `${entry.templateId} missing evidence array`);
        assert.ok(entry.evidence.includes('oracle'), `${entry.templateId} missing oracle evidence`);
        assert.ok(entry.evidence.includes('review'), `${entry.templateId} missing review evidence`);
      }
    });
  });
});
