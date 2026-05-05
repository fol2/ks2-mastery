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

describe('Grammar QG P14 combined freshness and simulation cross-check (part B3-2)', () => {
  it('fresh simulation conclusion passes', () => {
    const fresh = buildStarPacingSimulation();
    assert.equal(fresh.conclusion.pass, true);
  });
});
