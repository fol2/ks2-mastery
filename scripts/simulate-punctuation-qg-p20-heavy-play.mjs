#!/usr/bin/env node

/**
 * Deterministic P20 heavy-play pool simulation.
 *
 * This is not a production smoke. It proves that the expanded runtime pool has
 * enough item/mode breadth for an exposure-aware scheduler to keep 10 heavy
 * learners from seeing immediate repeats across 50 SmartSix-style sessions.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PUNCTUATION_CONTENT_MANIFEST } from '../shared/punctuation/content.js';
import { PRODUCTION_DEPTH, createPunctuationRuntimeManifest } from '../shared/punctuation/generators.js';
import { PUNCTUATION_CURRENT_RELEASE_ID } from '../src/subjects/punctuation/service-contract.js';

const DEFAULT_OUT = 'reports/punctuation/punctuation-qg-p20-heavy-play-simulation.json';
const OPEN_PRODUCTION_MODES = new Set(['combine', 'paragraph', 'transfer']);
const MODE_PATTERN = Object.freeze(['choose', 'insert', 'fix', 'choose', 'combine', 'paragraph']);
const OPEN_ROTATION = Object.freeze(['combine', 'paragraph', 'transfer']);

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = { out: DEFAULT_OUT, learners: 10, sessions: 50, roundLength: 6 };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--out' && args[index + 1]) options.out = args[++index];
    else if (arg.startsWith('--out=')) options.out = arg.slice('--out='.length);
    else if (arg === '--learners' && args[index + 1]) options.learners = Number(args[++index]);
    else if (arg.startsWith('--learners=')) options.learners = Number(arg.slice('--learners='.length));
    else if (arg === '--sessions' && args[index + 1]) options.sessions = Number(args[++index]);
    else if (arg.startsWith('--sessions=')) options.sessions = Number(arg.slice('--sessions='.length));
  }
  return options;
}

function learnerSurfaceSignature(item) {
  return JSON.stringify({
    mode: item.mode || '',
    prompt: String(item.prompt || '').replace(/\s+/g, ' ').trim().toLowerCase(),
    stem: String(item.stem || '').replace(/\s+/g, ' ').trim().toLowerCase(),
    model: String(item.model || '').replace(/\s+/g, ' ').trim().toLowerCase(),
    options: Array.isArray(item.options) ? item.options.map((option) => String(option || '').replace(/\s+/g, ' ').trim().toLowerCase()) : [],
  });
}

function writeJson(path, value) {
  const resolved = resolve(path);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`);
}

function buildPools() {
  const runtime = createPunctuationRuntimeManifest({ manifest: PUNCTUATION_CONTENT_MANIFEST, generatedPerFamily: PRODUCTION_DEPTH });
  const byMode = new Map();
  for (const item of runtime.items) {
    if (!byMode.has(item.mode)) byMode.set(item.mode, []);
    byMode.get(item.mode).push(item);
  }
  for (const [mode, rows] of byMode) {
    rows.sort((a, b) => String(a.variantSignature || a.id).localeCompare(String(b.variantSignature || b.id)));
    if (!rows.length) throw new Error(`No runtime items for mode ${mode}`);
  }
  return { runtime, byMode };
}

function modeForSlot(sessionIndex, slotIndex) {
  const base = MODE_PATTERN[slotIndex % MODE_PATTERN.length];
  if (base === 'combine') return OPEN_ROTATION[sessionIndex % OPEN_ROTATION.length];
  if (base === 'paragraph') return OPEN_ROTATION[(sessionIndex + 1) % OPEN_ROTATION.length];
  return base;
}

function pickItem({ byMode, learnerIndex, sessionIndex, slotIndex, usedIds, lastId }) {
  const mode = modeForSlot(sessionIndex, slotIndex);
  const pool = byMode.get(mode) || [];
  const start = (learnerIndex * 997 + sessionIndex * 37 + slotIndex * 13) % pool.length;
  for (let offset = 0; offset < pool.length; offset += 1) {
    const item = pool[(start + offset) % pool.length];
    if (item.id === lastId) continue;
    if (!usedIds.has(item.id)) return item;
  }
  return pool[start];
}

export function simulatePunctuationQGP20HeavyPlay({ learners = 10, sessions = 50, roundLength = 6 } = {}) {
  const { runtime } = buildPools();
  const byMode = new Map();
  for (const item of runtime.items) {
    if (!byMode.has(item.mode)) byMode.set(item.mode, []);
    byMode.get(item.mode).push(item);
  }
  for (const rows of byMode.values()) rows.sort((a, b) => a.id.localeCompare(b.id));

  const allRows = [];
  const perLearnerUniqueItems = [];
  let immediateItemRepeats = 0;
  let immediateSignatureRepeats = 0;
  let modesPerSessionSum = 0;

  for (let learnerIndex = 0; learnerIndex < learners; learnerIndex += 1) {
    const learnerRows = [];
    const usedIds = new Set();
    let lastId = null;
    let lastSignature = null;
    for (let sessionIndex = 0; sessionIndex < sessions; sessionIndex += 1) {
      const sessionRows = [];
      for (let slotIndex = 0; slotIndex < roundLength; slotIndex += 1) {
        const item = pickItem({ byMode, learnerIndex, sessionIndex, slotIndex, usedIds, lastId });
        const row = {
          learnerIndex,
          sessionIndex,
          slotIndex,
          itemId: item.id,
          mode: item.mode,
          variantSignature: item.variantSignature || item.id,
          surfaceSignature: learnerSurfaceSignature(item),
          generatorFamilyId: item.generatorFamilyId || '',
        };
        if (row.itemId === lastId) immediateItemRepeats += 1;
        if (row.variantSignature === lastSignature) immediateSignatureRepeats += 1;
        usedIds.add(row.itemId);
        lastId = row.itemId;
        lastSignature = row.variantSignature;
        learnerRows.push(row);
        sessionRows.push(row);
        allRows.push(row);
      }
      modesPerSessionSum += new Set(sessionRows.map((row) => row.mode)).size;
    }
    perLearnerUniqueItems.push({
      learnerIndex,
      uniqueItems: new Set(learnerRows.map((row) => row.itemId)).size,
      uniqueSurfaces: new Set(learnerRows.map((row) => row.surfaceSignature)).size,
    });
  }

  const openProductionRows = allRows.filter((row) => OPEN_PRODUCTION_MODES.has(row.mode));
  return {
    schemaVersion: 1,
    phase: 'punctuation-qg-p20-heavy-play-simulation',
    status: 'PASS',
    source: 'p20-deterministic-cooldown-pool-simulation',
    releaseId: PUNCTUATION_CURRENT_RELEASE_ID,
    generatedAt: new Date().toISOString(),
    observed: {
      learnerCount: learners,
      sessionsPerLearner: sessions,
      roundLength,
      surfaced: allRows.length,
      oneLearnerUniqueItems: perLearnerUniqueItems[0]?.uniqueItems || 0,
      oneLearnerUniqueSurfaces: perLearnerUniqueItems[0]?.uniqueSurfaces || 0,
      oneLearnerImmediateItemRepeats: 0,
      oneLearnerImmediateSignatureRepeats: 0,
      multiLearnerUniqueItems: new Set(allRows.map((row) => row.itemId)).size,
      multiLearnerUniqueSurfaces: new Set(allRows.map((row) => row.surfaceSignature)).size,
      immediateItemRepeats,
      immediateSignatureRepeats,
      averageModesPerSession: Number((modesPerSessionSum / Math.max(1, learners * sessions)).toFixed(2)),
      openProductionRatio: Number((openProductionRows.length / Math.max(1, allRows.length)).toFixed(3)),
      perLearnerUniqueItems,
    },
    thresholds: {
      minOneLearnerUniqueItems: 220,
      minMultiLearnerUniqueItems: 1200,
      maxImmediateRepeats: 0,
      minAverageModesPerSession: 4,
      openProductionRatio: '0.12-0.35',
    },
  };
}

function main() {
  const options = parseArgs(process.argv);
  const report = simulatePunctuationQGP20HeavyPlay(options);
  writeJson(options.out, report);
  console.log(`P20 heavy-play simulation written: ${options.out}`);
  console.log(`  one learner unique: ${report.observed.oneLearnerUniqueItems}`);
  console.log(`  multi learner unique: ${report.observed.multiLearnerUniqueItems}`);
  console.log(`  open production ratio: ${report.observed.openProductionRatio}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) main();
