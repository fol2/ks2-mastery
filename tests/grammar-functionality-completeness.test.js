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
const qgP1BaselinePath = path.join(rootDir, 'tests/fixtures/grammar-functionality-completeness/grammar-qg-p1-baseline.json');
const qgP2BaselinePath = path.join(rootDir, 'tests/fixtures/grammar-functionality-completeness/grammar-qg-p2-baseline.json');
const qgP3BaselinePath = path.join(rootDir, 'tests/fixtures/grammar-functionality-completeness/grammar-qg-p3-baseline.json');
const qgP4BaselinePath = path.join(rootDir, 'tests/fixtures/grammar-functionality-completeness/grammar-qg-p4-baseline.json');
const qgP5BaselinePath = path.join(rootDir, 'tests/fixtures/grammar-functionality-completeness/grammar-qg-p5-baseline.json');
const perfectionPassBaselinePath = path.join(rootDir, 'tests/fixtures/grammar-functionality-completeness/perfection-pass-baseline.json');
const phase3BaselinePath = path.join(rootDir, 'tests/fixtures/grammar-phase3-baseline.json');
const phase4BaselinePath = path.join(rootDir, 'tests/fixtures/grammar-phase4-baseline.json');
const livePlanPath = path.join(rootDir, 'docs/plans/2026-04-24-001-feat-grammar-mastery-region-plan.md');
const completenessPlanPath = path.join(rootDir, 'docs/plans/2026-04-25-001-feat-grammar-functionality-completeness-plan.md');
const perfectionPassPlanPath = path.join(rootDir, 'docs/plans/2026-04-25-002-feat-grammar-perfection-pass-plan.md');
const completenessDocPath = path.join(rootDir, 'docs/grammar-functionality-completeness.md');
const transferDecisionPath = path.join(rootDir, 'docs/grammar-transfer-decision.md');
const aiProviderDecisionPath = path.join(rootDir, 'docs/grammar-ai-provider-decision.md');
const LEGACY_GRAMMAR_CONTENT_RELEASE_ID = 'grammar-legacy-reviewed-2026-04-24';

function readBaseline() {
  return JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
}

function readPerfectionPassBaseline() {
  return JSON.parse(fs.readFileSync(perfectionPassBaselinePath, 'utf8'));
}

function readQgP1Baseline() {
  return JSON.parse(fs.readFileSync(qgP1BaselinePath, 'utf8'));
}

function readQgP2Baseline() {
  return JSON.parse(fs.readFileSync(qgP2BaselinePath, 'utf8'));
}

function readQgP3Baseline() {
  return JSON.parse(fs.readFileSync(qgP3BaselinePath, 'utf8'));
}

function readQgP4Baseline() {
  return JSON.parse(fs.readFileSync(qgP4BaselinePath, 'utf8'));
}

function readQgP5Baseline() {
  return JSON.parse(fs.readFileSync(qgP5BaselinePath, 'utf8'));
}

function readPhase3Baseline() {
  return JSON.parse(fs.readFileSync(phase3BaselinePath, 'utf8'));
}

function readPhase4Baseline() {
  return JSON.parse(fs.readFileSync(phase4BaselinePath, 'utf8'));
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

test('Grammar QG P1 baseline remains frozen for the previous question-generator release', () => {
  const baseline = readQgP1Baseline();
  const content = baseline.contentBaseline;

  assert.equal(baseline.contentReleaseId, 'grammar-qg-p1-2026-04-28');
  assert.equal(content.conceptCount, 18);
  assert.equal(content.templateCount, 57);
  assert.equal(content.selectedResponseCount, 37);
  assert.equal(content.constructedResponseCount, 20);
  assert.equal(content.generatedTemplateCount, 31);
  assert.equal(content.fixedTemplateCount, 26);
  assert.equal(content.answerSpecTemplateCount, 6);
  assert.deepEqual(content.thinPoolConcepts, []);
});

test('Grammar QG P2 baseline matches the shipped declarative marking denominator', () => {
  const baseline = readQgP2Baseline();
  const content = baseline.contentBaseline;

  assert.equal(baseline.contentReleaseId, 'grammar-qg-p2-2026-04-28');
  assert.equal(content.conceptCount, 18);
  assert.equal(content.templateCount, 57);
  assert.equal(content.selectedResponseCount, 37);
  assert.equal(content.constructedResponseCount, 20);
  assert.equal(content.generatedTemplateCount, 31);
  assert.equal(content.fixedTemplateCount, 26);
  assert.equal(content.answerSpecTemplateCount, 26);
  assert.equal(content.constructedResponseAnswerSpecTemplateCount, 20);
  assert.equal(content.legacyAdapterTemplateCount, 0);
  assert.equal(content.manualReviewOnlyTemplateCount, 4);
  assert.equal(content.p2MigrationComplete, true);
  assert.deepEqual(content.thinPoolConcepts, []);
});

test('Grammar QG P3 baseline matches the active explanation-depth denominator', () => {
  const baseline = readQgP3Baseline();
  const content = baseline.contentBaseline;

  assert.equal(baseline.contentReleaseId, 'grammar-qg-p3-2026-04-28');
  assert.equal(content.conceptCount, 18);
  assert.equal(content.templateCount, 70);
  assert.equal(content.selectedResponseCount, 50);
  assert.equal(content.constructedResponseCount, 20);
  assert.equal(content.generatedTemplateCount, 44);
  assert.equal(content.fixedTemplateCount, 26);
  assert.equal(content.answerSpecTemplateCount, 39);
  assert.equal(content.constructedResponseAnswerSpecTemplateCount, 20);
  assert.equal(content.legacyAdapterTemplateCount, 0);
  assert.equal(content.manualReviewOnlyTemplateCount, 4);
  assert.equal(content.p2MigrationComplete, true);
  assert.equal(content.explainTemplateCount, 17);
  assert.deepEqual(content.conceptsMissingExplainCoverage, []);
  assert.equal(content.p3ExplanationComplete, true);
  assert.deepEqual(content.thinPoolConcepts, []);
  // P3 fixture is historical — concept count is stable but template count is superseded by P4
  assert.equal(GRAMMAR_CONCEPTS.length, content.conceptCount);
  assert.equal(GRAMMAR_CLIENT_CONCEPTS.length, content.conceptCount);
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
  assert.equal(baseline.contentReleaseId, LEGACY_GRAMMAR_CONTENT_RELEASE_ID);
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

test('Grammar perfection-pass content floor does not exceed the shipped content distribution', () => {
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

  assert.ok(
    floor.templateCount <= GRAMMAR_TEMPLATE_METADATA.length,
    `Floor templateCount ${floor.templateCount} must not exceed live content ${GRAMMAR_TEMPLATE_METADATA.length}.`,
  );

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

// -----------------------------------------------------------------------------
// Phase 3 gate — U10 regression + absence + fixture-driven invariants
// -----------------------------------------------------------------------------

test('Grammar Phase 3 baseline is internally owned and well-formed', () => {
  const baseline = readPhase3Baseline();
  assert.equal(baseline.id, 'grammar-phase3-ux-reset');
  assert.equal(baseline.ownerPlan, 'docs/plans/2026-04-25-004-feat-grammar-phase3-ux-reset-plan.md');
  assert.equal(baseline.contentReleaseId, LEGACY_GRAMMAR_CONTENT_RELEASE_ID,
    'Phase 3 must not touch contentReleaseId (hard rule from the plan).');

  const phaseRows = baseline.phase3;
  assert.ok(Array.isArray(phaseRows) && phaseRows.length > 0,
    'Phase 3 baseline must list at least one unit row.');

  const expectedUnits = new Set(['U0', 'U1', 'U2', 'U3', 'U4', 'U5', 'U6a', 'U6b', 'U7', 'U8', 'U9', 'U10']);
  const seenIds = new Set();
  const seenUnits = new Set();

  for (const row of phaseRows) {
    assert.match(row.id, /^P3-U(?:0|1|2|3|4|5|6a|6b|7|8|9|10)$/,
      `${row.id} is not a valid Phase 3 row id.`);
    assert.equal(seenIds.has(row.id), false, `Duplicate Phase 3 row id: ${row.id}`);
    seenIds.add(row.id);
    assert.ok(expectedUnits.has(row.ownerUnit),
      `${row.id} owner unit "${row.ownerUnit}" is not in the Phase 3 unit allowlist.`);
    seenUnits.add(row.ownerUnit);
    assert.ok(row.topic, `${row.id} needs a topic.`);
    assert.ok(['planned', 'completed'].includes(row.resolutionStatus),
      `${row.id} has unsupported resolutionStatus ${row.resolutionStatus}`);
    assert.ok(row.plannedReason, `${row.id} needs a plannedReason.`);
    assert.ok(Array.isArray(row.supportingTests) && row.supportingTests.length > 0,
      `${row.id} needs at least one supportingTests entry.`);
    for (const testPath of row.supportingTests) {
      assert.ok(fs.existsSync(path.join(rootDir, testPath)),
        `${row.id} cites missing supporting test ${testPath}`);
    }
  }

  assert.equal(seenUnits.size, expectedUnits.size,
    `Phase 3 baseline must cover every unit U0..U10; saw ${[...seenUnits].sort().join(', ')}`);
});

test('Grammar Phase 3 gate: every phase3[] row is completed (no planned rows remain)', () => {
  const baseline = readPhase3Baseline();
  const planned = baseline.phase3.filter((row) => row.resolutionStatus === 'planned');
  assert.equal(planned.length, 0,
    `All Phase 3 unit rows must be completed at gate time; ${planned.length} still planned: ${planned.map((r) => r.id).join(', ')}.`);
});

test('Grammar Phase 3 gate: every completed row cites a landedIn PR number and existing supporting tests', () => {
  const baseline = readPhase3Baseline();
  for (const row of baseline.phase3) {
    if (row.resolutionStatus !== 'completed') continue;
    assert.ok(typeof row.landedIn === 'string' && row.landedIn.length > 0,
      `${row.id} is completed; landedIn must reference the merged PR.`);
    assert.match(row.landedIn, /^PR #\d+$/,
      `${row.id} landedIn must match "PR #<number>"; saw "${row.landedIn}"`);
    for (const testPath of row.supportingTests) {
      assert.ok(fs.existsSync(path.join(rootDir, testPath)),
        `${row.id} cites missing supporting test ${testPath}`);
    }
  }
});

test('Grammar Phase 3 gate: invariants[] rows are completed + cite existing tests', () => {
  const baseline = readPhase3Baseline();
  assert.ok(Array.isArray(baseline.invariants) && baseline.invariants.length >= 3,
    'Phase 3 baseline must list the three load-bearing invariants (forbidden-terms, roster, non-scored).');
  for (const row of baseline.invariants) {
    assert.match(row.id, /^P3-INV-[a-z-]+$/, `${row.id} is not a valid invariant id.`);
    assert.equal(row.resolutionStatus, 'completed',
      `${row.id} must be completed at gate time; saw ${row.resolutionStatus}`);
    assert.match(row.landedIn || '', /^PR #\d+$/,
      `${row.id} landedIn must match "PR #<number>"`);
    assert.ok(Array.isArray(row.supportingTests) && row.supportingTests.length > 0,
      `${row.id} needs supportingTests entries.`);
    for (const testPath of row.supportingTests) {
      assert.ok(fs.existsSync(path.join(rootDir, testPath)),
        `${row.id} cites missing supporting test ${testPath}`);
    }
  }
});

test('Grammar Phase 3 release gate is recorded with existing evidence files', () => {
  const baseline = readPhase3Baseline();
  const gate = baseline.phase3ReleaseGate;
  assert.ok(gate, 'Phase 3 baseline must record a release gate block.');
  assert.equal(gate.ownerUnit, 'U10');
  assert.equal(gate.status, 'completed');
  assert.ok(Array.isArray(gate.evidence) && gate.evidence.length > 0,
    'Phase 3 release-gate evidence must cite the landed files.');
  for (const evidencePath of gate.evidence) {
    assert.ok(fs.existsSync(path.join(rootDir, evidencePath)),
      `Phase 3 release gate cites missing evidence file ${evidencePath}`);
  }
});

// -----------------------------------------------------------------------------
// Phase 4 gate — U13 completeness fixture + validator
// -----------------------------------------------------------------------------

test('Grammar Phase 4 baseline is internally owned and well-formed', () => {
  const baseline = readPhase4Baseline();
  assert.equal(baseline.id, 'grammar-phase4-learning-hardening');
  assert.equal(baseline.ownerPlan, 'docs/plans/2026-04-26-001-feat-grammar-phase4-learning-hardening-plan.md');
  assert.equal(baseline.contentReleaseId, LEGACY_GRAMMAR_CONTENT_RELEASE_ID,
    'Phase 4 must not touch contentReleaseId (hard rule from the plan).');

  const phaseRows = baseline.phase4;
  assert.ok(Array.isArray(phaseRows) && phaseRows.length === 13,
    'Phase 4 baseline must list exactly 13 unit rows (U0..U12).');

  const expectedUnits = new Set(['U0', 'U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7', 'U8', 'U9', 'U10', 'U11', 'U12']);
  const seenUnits = new Set();

  for (const row of phaseRows) {
    assert.match(row.unit, /^U(?:0|1|2|3|4|5|6|7|8|9|10|11|12)$/,
      `${row.unit} is not a valid Phase 4 unit id.`);
    assert.equal(seenUnits.has(row.unit), false, `Duplicate Phase 4 unit row: ${row.unit}`);
    seenUnits.add(row.unit);
    assert.ok(expectedUnits.has(row.ownerUnit),
      `${row.unit} ownerUnit "${row.ownerUnit}" is not in the Phase 4 unit allowlist.`);
    assert.ok(row.topic, `${row.unit} needs a topic.`);
    assert.ok(['planned', 'completed'].includes(row.resolutionStatus),
      `${row.unit} has unsupported resolutionStatus ${row.resolutionStatus}`);
    assert.ok(row.plannedReason, `${row.unit} needs a plannedReason.`);
    assert.ok(Array.isArray(row.supportingTests) && row.supportingTests.length > 0,
      `${row.unit} needs at least one supportingTests entry.`);
    for (const testPath of row.supportingTests) {
      assert.ok(fs.existsSync(path.join(rootDir, testPath)),
        `${row.unit} cites missing supporting test ${testPath}`);
    }
  }

  assert.equal(seenUnits.size, expectedUnits.size,
    `Phase 4 baseline must cover every unit U0..U12; saw ${[...seenUnits].sort().join(', ')}`);
});

test('Grammar Phase 4 gate: every phase4[] row is completed (no planned rows remain)', () => {
  const baseline = readPhase4Baseline();
  const planned = baseline.phase4.filter((row) => row.resolutionStatus === 'planned');
  assert.equal(planned.length, 0,
    `All Phase 4 unit rows must be completed at gate time; ${planned.length} still planned: ${planned.map((r) => r.unit).join(', ')}.`);
});

test('Grammar Phase 4 gate: every completed row cites a landedIn PR number and existing supporting tests', () => {
  const baseline = readPhase4Baseline();
  for (const row of baseline.phase4) {
    if (row.resolutionStatus !== 'completed') continue;
    assert.ok(typeof row.landedIn === 'string' && row.landedIn.length > 0,
      `${row.unit} is completed; landedIn must reference the merged PR.`);
    assert.match(row.landedIn, /^PR #\d+$/,
      `${row.unit} landedIn must match "PR #<number>"; saw "${row.landedIn}"`);
    for (const testPath of row.supportingTests) {
      assert.ok(fs.existsSync(path.join(rootDir, testPath)),
        `${row.unit} cites missing supporting test ${testPath}`);
    }
  }
});

test('Grammar Phase 4 gate: invariants[] rows are completed + cite existing tests', () => {
  const baseline = readPhase4Baseline();
  assert.ok(Array.isArray(baseline.invariants) && baseline.invariants.length === 3,
    'Phase 4 baseline must list exactly three cross-cutting invariants (concordium-never-revoked, confidence-label-shared-module, release-id-impact-none).');

  const expectedNames = new Set(['concordium-never-revoked', 'confidence-label-shared-module', 'release-id-impact-none']);
  const seenNames = new Set();

  for (const row of baseline.invariants) {
    assert.equal(row.unit, 'invariant', `${row.name} must have unit: "invariant"`);
    assert.ok(expectedNames.has(row.name), `${row.name} is not a recognised Phase 4 invariant name.`);
    assert.equal(seenNames.has(row.name), false, `Duplicate Phase 4 invariant: ${row.name}`);
    seenNames.add(row.name);
    assert.equal(row.resolutionStatus, 'completed',
      `${row.name} must be completed at gate time; saw ${row.resolutionStatus}`);
    assert.match(row.landedIn || '', /^PR #\d+$/,
      `${row.name} landedIn must match "PR #<number>"`);
    assert.ok(Array.isArray(row.supportingTests) && row.supportingTests.length > 0,
      `${row.name} needs supportingTests entries.`);
    for (const testPath of row.supportingTests) {
      assert.ok(fs.existsSync(path.join(rootDir, testPath)),
        `${row.name} cites missing supporting test ${testPath}`);
    }
  }

  assert.equal(seenNames.size, expectedNames.size,
    `Phase 4 baseline must cover every invariant; saw ${[...seenNames].sort().join(', ')}`);
});

test('Grammar Phase 4 release gate is recorded with existing evidence files', () => {
  const baseline = readPhase4Baseline();
  const gate = baseline.phase4ReleaseGate;
  assert.ok(gate, 'Phase 4 baseline must record a release gate block.');
  assert.equal(gate.ownerUnit, 'U13');
  assert.equal(gate.status, 'completed');
  assert.ok(Array.isArray(gate.evidence) && gate.evidence.length > 0,
    'Phase 4 release-gate evidence must cite the landed files.');
  for (const evidencePath of gate.evidence) {
    assert.ok(fs.existsSync(path.join(rootDir, evidencePath)),
      `Phase 4 release gate cites missing evidence file ${evidencePath}`);
  }
});

// -----------------------------------------------------------------------------
// QG P4 — mixed-transfer and depth scaffold baseline
// -----------------------------------------------------------------------------

test('Grammar QG P4 baseline captures the final mixed-transfer denominator', () => {
  const baseline = readQgP4Baseline();
  const content = baseline.contentBaseline;

  assert.equal(baseline.contentReleaseId, GRAMMAR_CONTENT_RELEASE_ID);
  assert.equal(content.conceptCount, 18);
  assert.equal(content.templateCount, 78);
  assert.equal(content.selectedResponseCount, 58);
  assert.equal(content.constructedResponseCount, 20);
  assert.equal(content.generatedTemplateCount, 52);
  assert.equal(content.fixedTemplateCount, 26);
  assert.equal(content.answerSpecTemplateCount, 47);
  assert.equal(content.constructedResponseAnswerSpecTemplateCount, 20);
  assert.equal(content.legacyAdapterTemplateCount, 0);
  assert.equal(content.manualReviewOnlyTemplateCount, 4);
  assert.equal(content.p2MigrationComplete, true);
  assert.equal(content.explainTemplateCount, 17);
  assert.deepEqual(content.conceptsMissingExplainCoverage, []);
  assert.equal(content.p3ExplanationComplete, true);

  // P4-specific fields
  assert.equal(content.mixedTransferTemplateCount, 8);
  assert.ok(Array.isArray(content.conceptsWithMixedTransferCoverage));
  assert.equal(content.conceptsWithMixedTransferCoverage.length, 18);
  assert.ok(Array.isArray(content.conceptsMissingMixedTransferCoverage));
  assert.equal(content.conceptsMissingMixedTransferCoverage.length, 0);
  assert.equal(content.p4MixedTransferComplete, true);

  // Distribution matches live content
  assert.equal(GRAMMAR_CONCEPTS.length, content.conceptCount);
  assert.equal(GRAMMAR_CLIENT_CONCEPTS.length, content.conceptCount);
  assert.equal(GRAMMAR_TEMPLATE_METADATA.length, content.templateCount);
  assert.equal(GRAMMAR_TEMPLATE_METADATA.filter((t) => t.isSelectedResponse).length, content.selectedResponseCount);
  assert.equal(GRAMMAR_TEMPLATE_METADATA.filter((t) => !t.isSelectedResponse).length, content.constructedResponseCount);
  assert.deepEqual(Object.keys(GRAMMAR_QUESTION_TYPES).sort(), content.questionTypes.slice().sort());

  const actualPerQT = {};
  const actualPerConcept = {};
  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    actualPerQT[template.questionType] = (actualPerQT[template.questionType] || 0) + 1;
    for (const conceptId of (template.skillIds || [])) {
      actualPerConcept[conceptId] = (actualPerConcept[conceptId] || 0) + 1;
    }
  }
  assert.deepEqual(actualPerQT, content.perQuestionType);
  assert.deepEqual(actualPerConcept, content.perConcept);
});

// -----------------------------------------------------------------------------
// QG P5 — denominator drift detection baseline
// -----------------------------------------------------------------------------

test('Grammar QG P5 baseline captures the depth and stability denominator', () => {
  const baseline = readQgP5Baseline();
  const content = baseline.contentBaseline;

  assert.equal(baseline.contentReleaseId, 'grammar-qg-p5-2026-04-28');
  assert.equal(content.conceptCount, 18);
  assert.equal(content.templateCount, 78);
  assert.equal(content.selectedResponseCount, 58);
  assert.equal(content.constructedResponseCount, 20);
  assert.equal(content.generatedTemplateCount, 52);
  assert.equal(content.fixedTemplateCount, 26);
  assert.equal(content.answerSpecTemplateCount, 47);
  assert.equal(content.constructedResponseAnswerSpecTemplateCount, 20);
  assert.equal(content.legacyAdapterTemplateCount, 0);
  assert.equal(content.manualReviewOnlyTemplateCount, 4);
  assert.equal(content.p2MigrationComplete, true);
  assert.equal(content.explainTemplateCount, 17);
  assert.deepEqual(content.conceptsMissingExplainCoverage, []);
  assert.equal(content.p3ExplanationComplete, true);

  // P4 carryover fields
  assert.equal(content.mixedTransferTemplateCount, 8);
  assert.equal(content.conceptsWithMixedTransferCoverage.length, 18);
  assert.equal(content.conceptsMissingMixedTransferCoverage.length, 0);
  assert.equal(content.p4MixedTransferComplete, true);

  // P5-specific stability denominators
  assert.equal(content.defaultWindowRepeatedVariants, 0);
  assert.equal(content.crossTemplateCollisions, 0);
  assert.equal(content.deepLowDepthFamilyCount, 0);
  assert.deepEqual(content.thinPoolConcepts, []);

  // Distribution matches live content
  assert.equal(GRAMMAR_CONCEPTS.length, content.conceptCount);
  assert.equal(GRAMMAR_CLIENT_CONCEPTS.length, content.conceptCount);
  assert.equal(GRAMMAR_TEMPLATE_METADATA.length, content.templateCount);
  assert.equal(GRAMMAR_TEMPLATE_METADATA.filter((t) => t.isSelectedResponse).length, content.selectedResponseCount);
  assert.equal(GRAMMAR_TEMPLATE_METADATA.filter((t) => !t.isSelectedResponse).length, content.constructedResponseCount);
  assert.deepEqual(Object.keys(GRAMMAR_QUESTION_TYPES).sort(), content.questionTypes.slice().sort());

  const actualPerQT = {};
  const actualPerConcept = {};
  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    actualPerQT[template.questionType] = (actualPerQT[template.questionType] || 0) + 1;
    for (const conceptId of (template.skillIds || [])) {
      actualPerConcept[conceptId] = (actualPerConcept[conceptId] || 0) + 1;
    }
  }
  assert.deepEqual(actualPerQT, content.perQuestionType);
  assert.deepEqual(actualPerConcept, content.perConcept);
});
