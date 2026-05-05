import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { buildLearnerSurfaceAudit } from '../scripts/audit-grammar-qg-p14-learner-surface.mjs';
import { buildStarPacingSimulation } from '../scripts/simulate-grammar-qg-p14-star-pacing.mjs';
import { createServerGrammarEngine } from '../worker/src/subjects/grammar/engine.js';
import { buildGrammarReadModel } from '../worker/src/subjects/grammar/read-models.js';
import { GRAMMAR_CONTENT_RELEASE_ID } from '../worker/src/subjects/grammar/content.js';

const REPORTS_DIR = path.resolve(import.meta.dirname, '..', 'reports', 'grammar');

function readReport(filename) {
  return JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, filename), 'utf8'));
}

describe('Grammar QG P14 learner surface and telemetry contract (part A)', () => {
  it('keeps the click-path learner surface audit clean', () => {
    const fresh = buildLearnerSurfaceAudit();
    const committed = readReport('grammar-qg-p14-learner-surface-audit.json');
    const committedP18 = readReport('grammar-qg-p18-learner-surface-audit.json');

    assert.equal(fresh.contentReleaseId, GRAMMAR_CONTENT_RELEASE_ID);
    assert.equal(fresh.pass, true);
    assert.equal(committed.pass, true);
    assert.equal(committed.pathCount, 8);
    assert.deepEqual(committed.failures, []);
    // committedP18 is a frozen historical artefact from the P18 cycle. It is
    // pinned to its own release ID and should not track the live constant.
    assert.equal(committedP18.contentReleaseId, 'grammar-qg-p18-2026-05-02');
    assert.equal(committedP18.pass, true);
    assert.equal(committedP18.pathCount, 8);
    assert.deepEqual(committedP18.failures, []);
  });
});
