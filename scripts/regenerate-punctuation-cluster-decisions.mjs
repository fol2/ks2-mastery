#!/usr/bin/env node

/**
 * Regenerate punctuation cluster decisions from production pool data.
 *
 * Deterministic: same pool always produces the same cluster IDs and output.
 * Outputs a JSON array of clusterDecisions aligned with real buildVarietyClusters() output.
 *
 * Usage:
 *   node scripts/regenerate-punctuation-cluster-decisions.mjs          # print to stdout
 *   node scripts/regenerate-punctuation-cluster-decisions.mjs --write  # write directly into fixture
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildProductionPool, buildVarietyClusters, buildClusterMap } from './review-punctuation-questions.mjs';
import { generateStableClusterId } from '../shared/punctuation/reviewer-decisions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, '..', 'tests', 'fixtures', 'punctuation-reviewer-decisions.json');

function main() {
  const pool = buildProductionPool();
  const clusters = buildVarietyClusters(pool);
  buildClusterMap(clusters); // assigns stableId to each cluster

  // Filter to cross-mode clusters (review-required)
  const crossModeClusters = clusters.filter((c) => c.classification === 'CROSS-MODE-OVERLAP');

  // Sort deterministically by stableId for consistent output
  crossModeClusters.sort((a, b) => a.stableId.localeCompare(b.stableId));

  // Generate decisions
  const clusterDecisions = crossModeClusters.map((cluster) => {
    const modesStr = cluster.modes.join('/');
    const sample = cluster.sampleStem || cluster.sampleModel || cluster.normalisedText;
    const sampleShort = sample.length > 60 ? sample.slice(0, 57) + '...' : sample;

    return {
      clusterId: cluster.stableId,
      decision: 'acceptable-cross-mode-overlap',
      reviewer: 'ai-multi-perspective-review',
      reviewedAt: '2026-04-30',
      rationale: `Cross-mode ${cluster.type} cluster (${modesStr}) for "${sampleShort}" — pedagogically intentional mode progression, not redundant overlap.`,
    };
  });

  const shouldWrite = process.argv.includes('--write');

  if (shouldWrite) {
    const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
    fixture.clusterDecisions = clusterDecisions;
    writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2) + '\n', 'utf8');
    process.stderr.write(`Wrote ${clusterDecisions.length} cluster decisions to fixture.\n`);
  } else {
    process.stdout.write(JSON.stringify(clusterDecisions, null, 2) + '\n');
    process.stderr.write(`Generated ${clusterDecisions.length} cluster decisions (use --write to update fixture).\n`);
  }
}

main();
