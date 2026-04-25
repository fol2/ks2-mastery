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
const perfectionPassBaselinePath = path.join(rootDir, 'tests/fixtures/grammar-functionality-completeness/perfection-pass-baseline.json');
const livePlanPath = path.join(rootDir, 'docs/plans/2026-04-24-001-feat-grammar-mastery-region-plan.md');
const completenessPlanPath = path.join(rootDir, 'docs/plans/2026-04-25-001-feat-grammar-functionality-completeness-plan.md');
const perfectionPassPlanPath = path.join(rootDir, 'docs/plans/2026-04-25-002-feat-grammar-perfection-pass-plan.md');
const completenessDocPath = path.join(rootDir, 'docs/grammar-functionality-completeness.md');
const transferDecisionPath = path.join(rootDir, 'docs/grammar-transfer-decision.md');
const aiProviderDecisionPath = path.join(rootDir, 'docs/grammar-ai-provider-decision.md');

function readBaseline() {
  return JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
}

function readPerfectionPassBaseline() {
  return JSON.parse(fs.readFileSync(perfectionPassBaselinePath, 'utf8'));
}

function capabilityById(baseline, id) {
  return baseline.capabilities.find((capability) => capability.id === id) || null;
}

function issueById(baseline, id) {
  return baseline.reviewIssues.find((issue) => issue.id === id) || null;
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
  const aiProviderDecision = fs.readFileSync(aiProviderDecisionPath, 'utf8');

  assert.match(livePlan, /2026-04-25-001-feat-grammar-functionality-completeness-plan\.md/);
  assert.match(livePlan, /docs\/grammar-transfer-decision\.md/);
  assert.match(livePlan, /docs\/grammar-ai-provider-decision\.md/);
  assert.doesNotMatch(livePlan, /Decide later whether paragraph-level transfer becomes/);
  assert.doesNotMatch(livePlan, /Decide whether to connect a live AI provider/);
  assert.match(completenessPlan, /## Implementation Units/);
  assert.match(completenessDoc, /strict mini-test/i);
  assert.match(completenessDoc, /browser-held AI keys/i);
  assert.match(completenessDoc, /deterministic fallback as the production contract/);
  assert.match(transferDecision, /non-scored transfer lane first/);
  assert.match(transferDecision, /must not mark paragraph writing, mutate mastery, schedule retries, unlock monsters, or count towards Concordium/);
  assert.match(transferDecision, /AI-marked paragraph scoring is rejected/);
  assert.match(aiProviderDecision, /Do not connect a live third-party AI provider to Grammar in this slice/);
  assert.match(aiProviderDecision, /deterministic fallback remains the production contract/);
  assert.match(aiProviderDecision, /Provider keys must stay server-side/);
  assert.match(aiProviderDecision, /Browser-held keys and React provider calls remain rejected behaviours/);
  assert.match(aiProviderDecision, /existing Grammar AI enrichment validator/);
  assert.match(aiProviderDecision, /separate reviewed plan before implementation/);
});

test('Grammar perfection-pass baseline is internally owned and well-formed', () => {
  const baseline = readPerfectionPassBaseline();
  const validStatuses = new Set(['planned', 'completed', 'already-fixed', 'deferred']);
  const seenIds = new Set();

  assert.equal(baseline.id, 'grammar-perfection-pass');
  assert.equal(baseline.contentReleaseId, GRAMMAR_CONTENT_RELEASE_ID);
  assert.equal(baseline.ownerPlan, 'docs/plans/2026-04-25-002-feat-grammar-perfection-pass-plan.md');
  assert.ok(Array.isArray(baseline.reviewIssues));
  assert.equal(baseline.reviewIssues.length, 9, 'The Phase 2 review defines nine issues (I1-I9).');

  for (const issue of baseline.reviewIssues) {
    assert.match(issue.id, /^I[1-9]$/, `${issue.id} is not a valid Phase 2 issue id.`);
    assert.equal(seenIds.has(issue.id), false, `Duplicate issue id: ${issue.id}`);
    seenIds.add(issue.id);
    assert.ok(issue.label, `${issue.id} needs a label.`);
    assert.ok(validStatuses.has(issue.status), `${issue.id} has unsupported status ${issue.status}`);

    if (issue.status === 'planned') {
      assert.match(issue.ownerUnit || '', /^U[1-8]$/, `${issue.id} needs a valid owner unit U1-U8.`);
      assert.ok(issue.reason, `${issue.id} needs a planning reason.`);
      assert.equal(issue.ownerUnitAllowedByTest, true, `${issue.id} is planned; ownerUnitAllowedByTest must be true so the owner-unit cross-reference test covers it.`);
    }
    if (issue.status === 'completed') {
      assert.match(issue.ownerUnit || '', /^U[1-8]$/, `${issue.id} is completed but needs a valid owner unit U1-U8.`);
      assert.ok(issue.reason, `${issue.id} needs a planning reason.`);
      assert.ok(typeof issue.landedIn === 'string' && issue.landedIn.length > 0,
        `${issue.id} is completed; landedIn must reference the merged PR (e.g. "PR #123 (U2)").`);
      if (issue.ownerUnit !== 'U1') {
        // U1 is self-referential (the baseline) so evidence is intrinsic;
        // every other unit must cite at least one landed engine or test file.
        assert.ok(Array.isArray(issue.evidence) && issue.evidence.length > 0,
          `${issue.id} is completed; evidence[] must cite at least one landed file.`);
        for (const evidencePath of issue.evidence) {
          assert.ok(fs.existsSync(path.join(rootDir, evidencePath)),
            `${issue.id} cites missing evidence file ${evidencePath}`);
        }
      }
      assert.equal(issue.ownerUnitAllowedByTest, true,
        `${issue.id} is completed (owner unit landed); ownerUnitAllowedByTest must stay true so the cross-reference keeps pointing at the plan.`);
    }
    if (issue.status === 'already-fixed') {
      assert.ok(Array.isArray(issue.resolvedBy) && issue.resolvedBy.length > 0, `${issue.id} needs at least one resolvedBy reference.`);
      assert.ok(Array.isArray(issue.supportingTests) && issue.supportingTests.length > 0, `${issue.id} needs at least one supporting test.`);
      for (const testRef of issue.supportingTests) {
        assert.ok(fs.existsSync(path.join(rootDir, testRef)), `${issue.id} cites missing test file ${testRef}`);
      }
      assert.equal(issue.ownerUnitAllowedByTest, false, `${issue.id} is already-fixed; ownerUnitAllowedByTest must be false so the flag cannot drift into a false 'planned' status without a status flip.`);
    }
    if (issue.status === 'deferred') {
      assert.ok(issue.deferral, `${issue.id} needs a deferral justification.`);
      assert.equal(issue.ownerUnitAllowedByTest, false, `${issue.id} is deferred; ownerUnitAllowedByTest must be false.`);
    }
  }
});

test('Grammar perfection-pass owner-unit cross-reference: every planned or completed issue references its unit in the plan file', () => {
  const baseline = readPerfectionPassBaseline();
  const planText = fs.readFileSync(perfectionPassPlanPath, 'utf8');
  const trackedIssues = baseline.reviewIssues.filter((issue) => issue.status === 'planned' || issue.status === 'completed');
  const ownerUnits = new Map();

  for (const issue of trackedIssues) {
    const existing = ownerUnits.get(issue.ownerUnit) || [];
    existing.push(issue.id);
    ownerUnits.set(issue.ownerUnit, existing);
  }

  for (const [unit, issues] of ownerUnits.entries()) {
    const headingPattern = new RegExp(`- ${unit}\\. \\*\\*`);
    assert.match(planText, headingPattern, `Owner unit ${unit} (referenced by ${issues.join(', ')}) is missing from the perfection-pass plan.`);
  }

  assert.equal(issueById(baseline, 'I7')?.status, 'already-fixed');
  assert.equal(issueById(baseline, 'I4')?.status, 'deferred');
  assert.equal(capabilityById(readBaseline(), 'I7'), null, 'Perfection-pass issue ids do not leak into the legacy capability fixture.');
});

test('Grammar perfection-pass content floor matches the shipped content distribution', () => {
  const baseline = readPerfectionPassBaseline();
  const floor = baseline.contentFloor;
  const actualPerQT = {};
  const actualPerConcept = {};

  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    actualPerQT[template.questionType] = (actualPerQT[template.questionType] || 0) + 1;
    for (const conceptId of (template.skillIds || [])) {
      actualPerConcept[conceptId] = (actualPerConcept[conceptId] || 0) + 1;
    }
  }

  assert.equal(floor.templateCount, GRAMMAR_TEMPLATE_METADATA.length, 'Floor templateCount must match live content.');

  const registeredQuestionTypes = Object.keys(GRAMMAR_QUESTION_TYPES);
  for (const questionType of registeredQuestionTypes) {
    const declaredFloor = floor.perQuestionType[questionType];
    assert.equal(typeof declaredFloor, 'number', `Floor missing entry for question type ${questionType}.`);
    assert.ok(
      (actualPerQT[questionType] || 0) >= declaredFloor,
      `Question type ${questionType} dropped below floor ${declaredFloor}; actual ${actualPerQT[questionType] || 0}.`,
    );
  }

  for (const concept of GRAMMAR_CONCEPTS) {
    const declaredFloor = floor.perConcept[concept.id];
    assert.equal(typeof declaredFloor, 'number', `Floor missing entry for concept ${concept.id}.`);
    assert.ok(
      (actualPerConcept[concept.id] || 0) >= declaredFloor,
      `Concept ${concept.id} dropped below floor ${declaredFloor}; actual ${actualPerConcept[concept.id] || 0}.`,
    );
    assert.ok(
      declaredFloor >= floor.perConceptMinimum,
      `Concept ${concept.id} floor ${declaredFloor} is below the documented minimum ${floor.perConceptMinimum}.`,
    );
  }
});

test('Grammar perfection-pass plan is linked from the completeness doc and mastery live checklist', () => {
  const completenessDoc = fs.readFileSync(completenessDocPath, 'utf8');
  const livePlan = fs.readFileSync(livePlanPath, 'utf8');

  assert.match(completenessDoc, /2026-04-25-002-feat-grammar-perfection-pass-plan\.md/);
  assert.match(completenessDoc, /## Perfection Pass/);
  assert.match(completenessDoc, /perfection-pass-baseline\.json/);
  assert.match(livePlan, /2026-04-25-002-feat-grammar-perfection-pass-plan\.md/);
});

test('Grammar perfection-pass release gate is recorded and no issue rows remain planned', () => {
  const baseline = readPerfectionPassBaseline();
  const planned = baseline.reviewIssues.filter((issue) => issue.status === 'planned');
  assert.equal(planned.length, 0,
    `All issue rows must be completed, already-fixed, or deferred at release-gate time; ${planned.length} still planned: ${planned.map((i) => i.id).join(', ')}.`);

  const gate = baseline.perfectionPassReleaseGate;
  assert.equal(gate.ownerUnit, 'U8');
  assert.equal(gate.status, 'completed');
  assert.ok(Array.isArray(gate.evidence) && gate.evidence.length > 0, 'release-gate evidence must cite the landed files');
  for (const evidencePath of gate.evidence) {
    assert.ok(fs.existsSync(path.join(rootDir, evidencePath)),
      `release gate cites missing evidence file ${evidencePath}`);
  }
});
