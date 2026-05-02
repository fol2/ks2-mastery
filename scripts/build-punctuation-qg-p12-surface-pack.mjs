#!/usr/bin/env node

/**
 * Build the P12 learner-surface audit pack for the 3,312-item pool.
 *
 * This is evidence, not full human acceptance. It joins the reviewer
 * catalogue with product-service journey traces so reviewers can inspect the
 * exact P12 pool and the service paths that surfaced representative items.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  PUNCTUATION_CONTENT_MANIFEST,
  PUNCTUATION_RELEASE_ID,
} from '../shared/punctuation/content.js';
import { PRODUCTION_DEPTH } from '../shared/punctuation/generators.js';
import {
  buildPool,
  buildItemEntry,
  buildVarietyClusters,
  buildClusterMap,
} from './review-punctuation-questions.mjs';
import { buildP11ProductAudit } from './audit-punctuation-qg-p11-product.mjs';

const ROOT = process.cwd();
const DEFAULT_OUT = resolve(ROOT, 'reports/punctuation/punctuation-qg-p12-surface-pack.json');
const GENERATED_AT = '2026-05-02T00:00:00.000Z';

function surfaceEvidenceMapFromJourneys(journeys = []) {
  const map = new Map();
  for (const journey of journeys) {
    for (const event of journey.events || []) {
      const rows = map.get(event.id) || [];
      rows.push({
        journeyId: journey.journeyId,
        journeyType: journey.type,
        sessionId: event.sessionId,
        sessionMode: event.sessionMode,
        sessionSlot: event.slot,
        selectionReason: event.reason,
        surfaceKinds: event.surfaceKinds || [],
        answeredCorrectly: event.answeredCorrectly,
        supportLevel: event.supportLevel,
        guidedSkillId: event.guidedSkillId,
        weakFocusSource: event.weakFocusSource,
        gpsAnsweredCount: event.gpsAnsweredCount,
      });
      map.set(event.id, rows);
    }
  }
  return map;
}

export function buildPunctuationQGP12SurfacePack() {
  const audit = buildP11ProductAudit();
  const { pool, productionIds } = buildPool();
  const clusters = buildVarietyClusters(pool);
  const clusterMap = buildClusterMap(clusters);
  const surfaceEvidenceByItem = surfaceEvidenceMapFromJourneys(audit.findings.contractJourneys.journeys);

  const items = pool.map((item) => {
    const entry = buildItemEntry(item, {
      productionIds,
      clusterMap,
      itemDecisionMap: new Map(),
      negativeVectorMap: new Map(),
    });
    const surfaceEvidence = surfaceEvidenceByItem.get(item.id) || [];
    return {
      ...entry,
      surfacedByProductService: surfaceEvidence.length > 0,
      surfaceEvidence,
    };
  });

  const fixedCount = items.filter((item) => item.source === 'fixed').length;
  const generatedCount = items.filter((item) => item.source === 'generated').length;
  const productServiceSurfacedItemCount = items.filter((item) => item.surfacedByProductService).length;

  return {
    schemaVersion: 1,
    phase: 'punctuation-qg-p12',
    releaseId: PUNCTUATION_RELEASE_ID,
    generatedSeed: PUNCTUATION_CONTENT_MANIFEST.generatedSeed || PUNCTUATION_CONTENT_MANIFEST.releaseId,
    generatedAt: GENERATED_AT,
    humanReviewStatus: {
      complete: false,
      reason: 'P12 regenerates reviewer evidence for the full source pool; it does not claim adult review of all 3,312 displayed items.',
    },
    summary: {
      productionDepth: PRODUCTION_DEPTH,
      totalItems: items.length,
      fixedCount,
      generatedCount,
      productServiceSurfacedItemCount,
      journeyCount: audit.findings.contractJourneys.totalJourneys,
      journeyTypes: audit.findings.contractJourneys.byType,
      surfaceKinds: audit.findings.contractJourneys.surfaceKinds,
      eventCount: audit.findings.contractJourneys.eventCount,
      productAuditStatus: audit.status,
      productAuditFailures: audit.failures,
    },
    items,
    journeys: audit.findings.contractJourneys.journeys,
  };
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parseArgs(argv) {
  const outIndex = argv.indexOf('--out');
  return {
    check: argv.includes('--check'),
    outPath: outIndex >= 0 && outIndex + 1 < argv.length ? resolve(ROOT, argv[outIndex + 1]) : DEFAULT_OUT,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const pack = buildPunctuationQGP12SurfacePack();
  const next = stableJson(pack);

  if (args.check) {
    if (!existsSync(args.outPath)) {
      console.error(`P12 surface pack missing: ${args.outPath}`);
      process.exitCode = 1;
      return;
    }
    const current = readFileSync(args.outPath, 'utf8');
    if (current !== next) {
      console.error(`P12 surface pack is stale: ${args.outPath}`);
      process.exitCode = 1;
      return;
    }
    console.log(`P12 surface pack current: ${args.outPath}`);
    return;
  }

  writeFileSync(args.outPath, next, 'utf8');
  console.log(`P12 surface pack written: ${args.outPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
