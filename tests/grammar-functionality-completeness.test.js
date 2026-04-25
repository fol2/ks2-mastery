import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  GRAMMAR_CLIENT_CONCEPTS,
  GRAMMAR_ENABLED_MODES,
  GRAMMAR_LOCKED_MODES,
} from '../src/subjects/grammar/metadata.js';
import {
  GRAMMAR_CONCEPTS,
  GRAMMAR_CONTENT_RELEASE_ID,
  GRAMMAR_QUESTION_TYPES,
  GRAMMAR_TEMPLATE_METADATA,
} from '../worker/src/subjects/grammar/content.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(rootDir, 'tests/fixtures/grammar-functionality-completeness/legacy-baseline.json');
const livePlanPath = path.join(rootDir, 'docs/plans/2026-04-24-001-feat-grammar-mastery-region-plan.md');
const completenessPlanPath = path.join(rootDir, 'docs/plans/2026-04-25-001-feat-grammar-functionality-completeness-plan.md');
const completenessDocPath = path.join(rootDir, 'docs/grammar-functionality-completeness.md');
const transferDecisionPath = path.join(rootDir, 'docs/grammar-transfer-decision.md');

function readBaseline() {
  return JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
}

function capabilityById(baseline, id) {
  return baseline.capabilities.find((capability) => capability.id === id) || null;
}

test('Grammar functionality completeness baseline is internally owned', () => {
  const baseline = readBaseline();
  const validStatuses = new Set(['completed', 'planned', 'replaced', 'rejected']);
  const ids = new Set();

  assert.equal(baseline.id, 'grammar-functionality-completeness');
  assert.ok(Array.isArray(baseline.capabilities));

  for (const capability of baseline.capabilities) {
    assert.equal(typeof capability.id, 'string');
    assert.ok(capability.id, 'Capability id is required.');
    assert.equal(ids.has(capability.id), false, `Duplicate capability id: ${capability.id}`);
    ids.add(capability.id);
    assert.ok(validStatuses.has(capability.status), `${capability.id} has unsupported status ${capability.status}`);

    if (capability.status === 'planned') {
      assert.match(capability.ownerUnit || '', /^U[2-8]$/, `${capability.id} needs a valid owner unit.`);
      assert.ok(capability.reason, `${capability.id} needs a planning reason.`);
    }
    if (capability.status === 'completed') {
      assert.ok(Array.isArray(capability.evidence) && capability.evidence.length > 0, `${capability.id} needs evidence.`);
    }
    if (capability.status === 'replaced') {
      assert.ok(capability.replacement, `${capability.id} needs a replacement note.`);
    }
    if (capability.status === 'rejected') {
      assert.ok(capability.rationale, `${capability.id} needs a rejection rationale.`);
    }
  }
});

test('Grammar completeness baseline still matches the shipped content denominator', () => {
  const baseline = readBaseline();
  const content = baseline.contentBaseline;

  assert.equal(baseline.contentReleaseId, GRAMMAR_CONTENT_RELEASE_ID);
  assert.equal(content.conceptCount, 18);
  assert.equal(content.templateCount, 51);
  assert.equal(content.selectedResponseCount, 31);
  assert.equal(content.constructedResponseCount, 20);
  assert.equal(GRAMMAR_CONCEPTS.length, content.conceptCount);
  assert.equal(GRAMMAR_CLIENT_CONCEPTS.length, content.conceptCount);
  assert.equal(GRAMMAR_TEMPLATE_METADATA.length, content.templateCount);
  assert.equal(GRAMMAR_TEMPLATE_METADATA.filter((template) => template.isSelectedResponse).length, content.selectedResponseCount);
  assert.equal(GRAMMAR_TEMPLATE_METADATA.filter((template) => !template.isSelectedResponse).length, content.constructedResponseCount);
  assert.deepEqual(Object.keys(GRAMMAR_QUESTION_TYPES).sort(), content.questionTypes.slice().sort());
});

test('Grammar completeness baseline pins legacy mode coverage separately from behaviour gaps', () => {
  const baseline = readBaseline();
  const enabledModes = GRAMMAR_ENABLED_MODES.map((mode) => mode.id);

  assert.deepEqual(enabledModes.slice().sort(), baseline.legacyModes.slice().sort());
  assert.deepEqual(GRAMMAR_LOCKED_MODES, []);
  assert.equal(capabilityById(baseline, 'legacy-mode-ids-enabled')?.status, 'completed');
  assert.equal(capabilityById(baseline, 'strict-mini-test-flow')?.status, 'completed');
  assert.ok(capabilityById(baseline, 'strict-mini-test-flow')?.evidence.includes('worker/src/subjects/grammar/engine.js'));
  assert.equal(capabilityById(baseline, 'session-goals')?.status, 'completed');
  assert.equal(capabilityById(baseline, 'practice-settings')?.status, 'completed');
  assert.equal(capabilityById(baseline, 'in-session-repair-loop')?.status, 'completed');
  assert.equal(capabilityById(baseline, 'ai-visible-triggers')?.status, 'completed');
  assert.ok(capabilityById(baseline, 'ai-visible-triggers')?.evidence.includes('worker/src/subjects/grammar/ai-enrichment.js'));
  assert.equal(capabilityById(baseline, 'read-aloud-and-speech-rate')?.status, 'completed');
  assert.ok(capabilityById(baseline, 'read-aloud-and-speech-rate')?.evidence.includes('src/subjects/grammar/speech.js'));
  assert.equal(capabilityById(baseline, 'adult-data-replacement-parity')?.status, 'completed');
  assert.ok(capabilityById(baseline, 'adult-data-replacement-parity')?.evidence.includes('src/platform/hubs/parent-read-model.js'));
  assert.ok(capabilityById(baseline, 'adult-data-replacement-parity')?.evidence.includes('tests/persistence.test.js'));
  assert.equal(capabilityById(baseline, 'functionality-completeness-release-gate')?.status, 'completed');
  assert.ok(capabilityById(baseline, 'functionality-completeness-release-gate')?.evidence.includes('scripts/grammar-production-smoke.mjs'));
  assert.ok(capabilityById(baseline, 'functionality-completeness-release-gate')?.evidence.includes('tests/build-public.test.js'));
});

test('Grammar completeness baseline preserves legacy strict mini-test and repair targets', () => {
  const baseline = readBaseline();

  assert.deepEqual(baseline.legacySessionGoals, ['10m', '15q', 'due']);
  assert.deepEqual(baseline.legacyMiniTest.setSizes, [8, 12]);
  assert.equal(baseline.legacyMiniTest.minimumTimeLimitMs, 360000);
  assert.equal(baseline.legacyMiniTest.timeLimitMsPerMark, 54000);
  assert.equal(baseline.legacyMiniTest.delayedFeedback, true);
  assert.equal(baseline.legacyMiniTest.navigation, true);
  assert.equal(baseline.legacyMiniTest.finishAction, true);
  assert.equal(baseline.legacyMiniTest.endReview, true);
  assert.deepEqual(baseline.legacyRepairActions, [
    'retry-current-question',
    'show-worked-solution',
    'use-faded-support',
    'built-in-similar-problem',
  ]);
});

test('Grammar completeness documentation and live checklist point at the active follow-up plan', () => {
  const livePlan = fs.readFileSync(livePlanPath, 'utf8');
  const completenessPlan = fs.readFileSync(completenessPlanPath, 'utf8');
  const completenessDoc = fs.readFileSync(completenessDocPath, 'utf8');
  const transferDecision = fs.readFileSync(transferDecisionPath, 'utf8');

  assert.match(livePlan, /2026-04-25-001-feat-grammar-functionality-completeness-plan\.md/);
  assert.match(livePlan, /docs\/grammar-transfer-decision\.md/);
  assert.doesNotMatch(livePlan, /Decide later whether paragraph-level transfer becomes/);
  assert.match(completenessPlan, /## Implementation Units/);
  assert.match(completenessDoc, /strict mini-test/i);
  assert.match(completenessDoc, /browser-held AI keys/i);
  assert.match(transferDecision, /non-scored transfer lane first/);
  assert.match(transferDecision, /must not mark paragraph writing, mutate mastery, schedule retries, unlock monsters, or count towards Concordium/);
  assert.match(transferDecision, /AI-marked paragraph scoring is rejected/);
});
