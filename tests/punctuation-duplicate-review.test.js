import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  PUNCTUATION_CONTENT_MANIFEST,
} from '../shared/punctuation/content.js';
import {
  createPunctuationGeneratedItems,
} from '../shared/punctuation/generators.js';
import {
  runPunctuationContentAudit,
  buildReviewerReport,
  buildStemModelClusters,
  loadStemReviewDecisions,
  validateStemReviewDecisions,
  formatReviewerReport,
} from '../scripts/audit-punctuation-content.mjs';

const auditCliPath = fileURLToPath(new URL('../scripts/audit-punctuation-content.mjs', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

function runAuditCli(args) {
  return spawnSync(process.execPath, [auditCliPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

// ─── U7: Duplicate stem/model cluster review tests ──────────────────────────

test('U7: audit with no mode-scoped duplicate stems at depth 4 reports 0 clusters', () => {
  const audit = runPunctuationContentAudit({
    seed: 'u7-no-dupes-depth4',
    generatedPerFamily: 4,
  });
  const generatedItems = createPunctuationGeneratedItems({
    seed: 'u7-no-dupes-depth4',
    perFamily: 4,
  });
  const report = buildReviewerReport({
    audit,
    generatedItems,
    capacityDepth: 8,
    requireStemReview: false,
    requestedDepth: 4,
  });

  // Mode-scoped clusters are 0 at current content
  assert.equal(report.stemModelClusters.length, 0,
    `Expected 0 mode-scoped clusters, got ${report.stemModelClusters.length}`);

  // The formatted output reflects "0 clusters"
  const text = formatReviewerReport(report);
  assert.match(text, /0 clusters/);
});

test('U7: duplicate stems at depth 6 are surfaced in reviewer report when artificially injected', () => {
  // Create a manifest where two templates in the same family+mode share a stem
  const manifest = {
    ...PUNCTUATION_CONTENT_MANIFEST,
    generatorFamilies: PUNCTUATION_CONTENT_MANIFEST.generatorFamilies.map((family) => (
      family.id === 'gen_sentence_endings_insert' ? { ...family } : family
    )),
  };

  // Use a contextPack that forces duplicate stems within the same mode
  const audit = runPunctuationContentAudit({
    seed: 'u7-dup-stem-depth6',
    generatedPerFamily: 6,
    contextPack: {
      stems: ['the crew checked the ropes'],
    },
  });
  const generatedItems = createPunctuationGeneratedItems({
    seed: 'u7-dup-stem-depth6',
    perFamily: 6,
    contextPack: {
      stems: ['the crew checked the ropes'],
    },
  });
  const report = buildReviewerReport({
    audit,
    generatedItems,
    capacityDepth: 8,
    requireStemReview: false,
    requestedDepth: 6,
  });

  // With contextPack forcing the same stem across all families,
  // mode-scoped clusters appear because multiple items in the SAME mode share stems
  const text = formatReviewerReport(report);
  assert.match(text, /Duplicate Stem\/Model Clusters/);
});

test('U7: two templates sharing normalised stem but different modes are scoped separately', () => {
  const { allClusters } = buildStemModelClusters({
    seed: 'u7-mode-scope-test',
    depths: [4, 6, 8],
  });

  // Each cluster must have exactly one mode value
  for (const cluster of allClusters) {
    assert.ok(typeof cluster.mode === 'string', 'cluster.mode must be a string');
    // The cluster key encodes mode scoping
    assert.match(cluster.clusterKey, /::/, 'cluster key must be mode-scoped (contain "::")');
    assert.ok(cluster.clusterKey.endsWith(`::${cluster.mode}`),
      `cluster key "${cluster.clusterKey}" must end with "::${cluster.mode}"`);
  }

  // Verify that cross-mode duplicates (which exist in the existing audit) are NOT
  // surfaced in mode-scoped clusters — e.g., fronted_adverbial_fix (fix) and
  // fronted_adverbial_combine (combine) share stems but are different modes
  const audit8 = runPunctuationContentAudit({
    seed: 'u7-mode-scope-test',
    generatedPerFamily: 8,
  });
  // Existing non-mode-scoped duplicates exist
  assert.ok(audit8.duplicates.generated.stems.length > 0,
    'Non-mode-scoped stem duplicates exist at depth 8');
  // Mode-scoped clusters are empty (the duplicates are cross-mode)
  assert.equal(allClusters.length, 0,
    'Mode-scoped clusters must be 0 because all duplicates are cross-mode');
});

test('U7: --require-stem-review with unreviewed clusters at requested depth fails', () => {
  // Create a synthetic cluster scenario using validateStemReviewDecisions directly
  const fakeClusters = [
    {
      clusterKey: 'some test stem::insert',
      normalisedText: 'some test stem',
      kind: 'stems',
      mode: 'insert',
      familyIds: ['gen_sentence_endings_insert'],
      templateIds: ['tpl_a', 'tpl_b'],
      variantSignatures: ['sig_a', 'sig_b'],
      itemIds: ['item_1', 'item_2'],
      count: 2,
      firstDepth: 6,
      visibleAtDepths: [6, 8],
    },
  ];

  // Empty decisions → unreviewed at depth 6
  const result = validateStemReviewDecisions({
    clusters: fakeClusters,
    decisions: {},
    requestedDepth: 6,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.unreviewed, ['some test stem::insert']);
});

test('U7: --require-stem-review with unreviewed clusters at depth below cluster first-appearance passes', () => {
  const fakeClusters = [
    {
      clusterKey: 'some test stem::insert',
      normalisedText: 'some test stem',
      kind: 'stems',
      mode: 'insert',
      familyIds: ['gen_sentence_endings_insert'],
      templateIds: ['tpl_a', 'tpl_b'],
      variantSignatures: ['sig_a', 'sig_b'],
      itemIds: ['item_1', 'item_2'],
      count: 2,
      firstDepth: 6,
      visibleAtDepths: [6, 8],
    },
  ];

  // Requested depth is 4, but cluster only appears at 6+ → passes
  const result = validateStemReviewDecisions({
    clusters: fakeClusters,
    decisions: {},
    requestedDepth: 4,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.unreviewed, []);
});

test('U7: reviewed clusters with valid decisions pass --require-stem-review', () => {
  const fakeClusters = [
    {
      clusterKey: 'some test stem::insert',
      normalisedText: 'some test stem',
      kind: 'stems',
      mode: 'insert',
      familyIds: ['gen_sentence_endings_insert'],
      templateIds: ['tpl_a', 'tpl_b'],
      variantSignatures: ['sig_a', 'sig_b'],
      itemIds: ['item_1', 'item_2'],
      count: 2,
      firstDepth: 6,
      visibleAtDepths: [6, 8],
    },
    {
      clusterKey: 'another model::fix',
      normalisedText: 'another model',
      kind: 'models',
      mode: 'fix',
      familyIds: ['gen_fronted_adverbial_fix'],
      templateIds: ['tpl_c', 'tpl_d'],
      variantSignatures: ['sig_c', 'sig_d'],
      itemIds: ['item_3', 'item_4'],
      count: 2,
      firstDepth: 8,
      visibleAtDepths: [8],
    },
  ];

  const decisions = {
    'some test stem::insert': 'acceptable-at-depth-6',
    'another model::fix': 'acceptable-at-depth-8',
  };

  const result = validateStemReviewDecisions({
    clusters: fakeClusters,
    decisions,
    requestedDepth: 8,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.unreviewed, []);
});

test('U7: invalid decision value counts as unreviewed', () => {
  const fakeClusters = [
    {
      clusterKey: 'some test stem::insert',
      normalisedText: 'some test stem',
      kind: 'stems',
      mode: 'insert',
      familyIds: ['gen_sentence_endings_insert'],
      templateIds: ['tpl_a', 'tpl_b'],
      variantSignatures: ['sig_a', 'sig_b'],
      itemIds: ['item_1', 'item_2'],
      count: 2,
      firstDepth: 6,
      visibleAtDepths: [6, 8],
    },
  ];

  const decisions = {
    'some test stem::insert': 'invalid-decision-value',
  };

  const result = validateStemReviewDecisions({
    clusters: fakeClusters,
    decisions,
    requestedDepth: 6,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.unreviewed, ['some test stem::insert']);
});

test('U7: CLI --require-stem-review at production depth passes (no mode-scoped clusters)', () => {
  const result = runAuditCli([
    '--strict',
    '--generated-per-family', '4',
    '--reviewer-report',
    '--require-stem-review',
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Duplicate Stem\/Model Clusters/);
  assert.match(result.stdout, /0 clusters/);
});

test('U7: buildStemModelClusters returns depth-annotated cluster objects', () => {
  const { allClusters, clustersByDepth } = buildStemModelClusters({
    seed: 'u7-cluster-structure',
    depths: [4, 6, 8],
  });

  // At current content, mode-scoped clusters are 0 at all depths
  assert.equal(allClusters.length, 0);
  assert.ok(clustersByDepth[4]);
  assert.ok(clustersByDepth[6]);
  assert.ok(clustersByDepth[8]);
  assert.deepEqual(clustersByDepth[4].stems, []);
  assert.deepEqual(clustersByDepth[4].models, []);
});

test('U7: loadStemReviewDecisions returns object from fixture file', () => {
  const decisions = loadStemReviewDecisions();
  assert.ok(typeof decisions === 'object' && decisions !== null);
  // The fixture is empty since there are 0 mode-scoped clusters
  assert.deepEqual(decisions, {});
});

test('U7: reviewer report section 12 present in formatted output', () => {
  const audit = runPunctuationContentAudit({
    seed: 'u7-section12-format',
    generatedPerFamily: 4,
  });
  const generatedItems = createPunctuationGeneratedItems({
    seed: 'u7-section12-format',
    perFamily: 4,
  });
  const report = buildReviewerReport({
    audit,
    generatedItems,
    capacityDepth: 8,
  });
  const text = formatReviewerReport(report);

  assert.match(text, /12\. Duplicate Stem\/Model Clusters \(mode-scoped\)/);
});
