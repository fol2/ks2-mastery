import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  generateStableClusterId,
  evaluateClusterGate,
  loadReviewerDecisions,
} from '../shared/punctuation/reviewer-decisions.js';
import {
  buildProductionPool,
  buildVarietyClusters,
  buildClusterMap,
} from '../scripts/review-punctuation-questions.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, 'fixtures', 'punctuation-reviewer-decisions.json');

// ─── Build real cluster data once ───────────────────────────────────────────

const pool = buildProductionPool();
const clusters = buildVarietyClusters(pool);
buildClusterMap(clusters); // assigns stableId

const crossModeClusters = clusters.filter((c) => c.classification === 'CROSS-MODE-OVERLAP');
const crossModeIds = crossModeClusters.map((c) => c.stableId);
const sameModeClusters = clusters.filter((c) => c.classification === 'SAME-MODE-DUPLICATE');

const { data: fixtureData } = loadReviewerDecisions(FIXTURE_PATH);
const fixtureClusterIds = fixtureData.clusterDecisions.map((d) => d.clusterId);

// ─── Alignment tests ────────────────────────────────────────────────────────

test('cross-mode cluster IDs from buildVarietyClusters match fixture clusterDecisions', () => {
  const realIds = new Set(crossModeIds);
  const fixtureIds = new Set(fixtureClusterIds);

  // Every fixture decision must correspond to a real cross-mode cluster
  for (const id of fixtureIds) {
    assert.ok(realIds.has(id), `Fixture clusterId "${id}" not found in buildVarietyClusters() cross-mode output`);
  }

  // Every real cross-mode cluster must have a fixture decision
  for (const id of realIds) {
    assert.ok(fixtureIds.has(id), `Cross-mode cluster "${id}" missing from fixture clusterDecisions`);
  }

  assert.equal(realIds.size, fixtureIds.size, 'Fixture and real cross-mode cluster counts must match');
});

test('evaluateClusterGate passes with all cross-mode clusters having valid decisions', () => {
  const result = evaluateClusterGate(fixtureData, crossModeIds);

  assert.equal(result.pass, true, `Gate should pass but has blockers: ${JSON.stringify(result.blockers)}`);
  assert.equal(result.stats.approved, crossModeIds.length);
  assert.equal(result.stats.missing, 0);
  assert.equal(result.stats.blocked, 0);
});

test('evaluateClusterGate fails if one cross-mode cluster is missing a decision', () => {
  // Remove the first cluster decision from the fixture data
  const mutatedData = {
    ...fixtureData,
    clusterDecisions: fixtureData.clusterDecisions.slice(1),
  };

  const result = evaluateClusterGate(mutatedData, crossModeIds);

  assert.equal(result.pass, false, 'Gate should fail when a cluster decision is missing');
  assert.ok(result.stats.missing >= 1, 'Should report at least one missing cluster');
  assert.ok(result.blockers.length >= 1, 'Should have at least one blocker');
});

test('evaluateClusterGate ignores same-mode-duplicate clusters (not review-required)', () => {
  // Pass cluster objects (with reviewRequired field) including same-mode clusters
  const allClustersWithIds = clusters.map((c) => ({
    stableId: c.stableId,
    reviewRequired: c.reviewRequired,
  }));

  const result = evaluateClusterGate(fixtureData, allClustersWithIds);

  // Should only check reviewRequired clusters (cross-mode), not same-mode
  assert.equal(result.stats.total, crossModeIds.length,
    'Should only count reviewRequired clusters');
  assert.equal(result.pass, true, 'Gate should pass — same-mode clusters are excluded');
});

test('required cross-mode clusters > 0 (guard against empty set)', () => {
  assert.ok(crossModeClusters.length > 0,
    'Production pool must produce at least one cross-mode cluster');
  assert.ok(fixtureClusterIds.length > 0,
    'Fixture must contain at least one cluster decision');
});

test('buildVarietyClusters returns reviewRequired field on every cluster', () => {
  for (const cluster of clusters) {
    assert.equal(typeof cluster.reviewRequired, 'boolean',
      `Cluster type="${cluster.type}" classification="${cluster.classification}" missing boolean reviewRequired`);
  }

  // Cross-mode clusters are review-required
  for (const cluster of crossModeClusters) {
    assert.equal(cluster.reviewRequired, true,
      `Cross-mode cluster ${cluster.stableId} must have reviewRequired=true`);
  }

  // Same-mode clusters are not review-required
  for (const cluster of sameModeClusters) {
    assert.equal(cluster.reviewRequired, false,
      `Same-mode cluster ${cluster.stableId} must have reviewRequired=false`);
  }
});

test('cluster IDs are stable and deterministic (re-running produces same IDs)', () => {
  // Re-build from scratch
  const pool2 = buildProductionPool();
  const clusters2 = buildVarietyClusters(pool2);
  buildClusterMap(clusters2);

  const crossMode2 = clusters2.filter((c) => c.classification === 'CROSS-MODE-OVERLAP');
  const ids2 = crossMode2.map((c) => c.stableId).sort();
  const ids1 = [...crossModeIds].sort();

  assert.deepEqual(ids1, ids2, 'Cluster IDs must be deterministic across runs');
});
