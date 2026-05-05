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

describe('Grammar QG P14 learner surface and telemetry contract (part C)', () => {
  it('projects session depth and variety telemetry without answer internals', () => {
    const nowTs = Date.parse('2026-05-01T09:30:00.000Z');
    const engine = createServerGrammarEngine({ now: () => nowTs });
    const result = engine.apply({
      learnerId: 'learner-p14',
      command: 'start-session',
      requestId: 'p14-depth',
      payload: { mode: 'smart', roundLength: 10, seed: 87 },
    });
    const model = buildGrammarReadModel({
      learnerId: 'learner-p14',
      state: result.state,
      now: nowTs,
    });

    assert.equal(model.content.releaseId, GRAMMAR_CONTENT_RELEASE_ID);
    assert.equal(model.session.sessionDepthClassification, 'deep-practice');
    assert.equal(model.session.varietyTelemetry.sessionUniqueTemplateCount, 1);
    assert.equal(model.session.varietyTelemetry.sessionUniqueConceptCount >= 1, true);
    assert.equal(model.session.varietyTelemetry.sessionTemplateDuplicateCount, 0);
    assert.equal(Object.hasOwn(model.session.varietyTelemetry, '_templateCounts'), false);
    assert.equal(Object.hasOwn(model.session.varietyTelemetry, '_conceptCounts'), false);
    assert.equal(Object.hasOwn(model.session.currentItem, 'answerSpec'), false);
    assert.equal(Object.hasOwn(model.session.currentItem, 'solutionLines'), false);
    assert.equal(Object.hasOwn(model.session.currentItem, '_feedbackSummary'), false);
  });

  it('preserves abandonment rate by template/input type in safe read models', () => {
    const nowTs = Date.parse('2026-05-01T09:45:00.000Z');
    const model = buildGrammarReadModel({
      learnerId: 'learner-p14',
      now: nowTs,
      state: {
        contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
        phase: 'session',
        session: {
          id: 'grammar-abandoned-p14',
          type: 'practice',
          mode: 'smart',
          startedAt: nowTs - 30000,
          targetCount: 5,
          answered: 0,
          currentIndex: 0,
          currentItem: null,
          varietyTelemetry: {
            sessionDepthClassification: 'quick-practice',
            templateExposureCount: 1,
            sessionTemplateDuplicateCount: 0,
            sessionUniqueTemplateCount: 1,
            sessionUniqueConceptCount: 1,
            lowDiversityTemplateExposureCount: 0,
            inputTypeExposureCounts: { single_choice: 1 },
            templateInputTypeExposureCounts: { 'qg_p14_standard_english_diagnostic_choice|single_choice': 1 },
            elapsedByDepthType: { 'quick-practice': { attempts: 0, totalElapsedMs: 0 } },
            abandonRateByTemplateInputType: {
              'qg_p14_standard_english_diagnostic_choice|single_choice': {
                exposedItems: 1,
                abandonedSessions: 1,
                observedSessions: 1,
                abandonRate: 1,
              },
            },
            _templateCounts: { qg_p14_standard_english_diagnostic_choice: 1 },
            _conceptCounts: { standard_english: 1 },
          },
        },
      },
    });

    const telemetry = model.session.varietyTelemetry;
    assert.deepEqual(
      telemetry.abandonRateByTemplateInputType['qg_p14_standard_english_diagnostic_choice|single_choice'],
      {
        exposedItems: 1,
        abandonedSessions: 1,
        observedSessions: 1,
        abandonRate: 1,
      },
    );
    assert.equal(Object.hasOwn(telemetry, '_templateCounts'), false);
    assert.equal(Object.hasOwn(telemetry, '_conceptCounts'), false);
  });
});
