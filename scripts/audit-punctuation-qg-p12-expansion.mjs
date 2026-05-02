#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import { PUNCTUATION_CONTENT_MANIFEST, PUNCTUATION_ITEMS, PUNCTUATION_MANIFEST_VALIDATION } from '../shared/punctuation/content.js';
import { GENERATED_TEMPLATE_BANK, PRODUCTION_DEPTH, createPunctuationGeneratedItems, createPunctuationRuntimeManifest } from '../shared/punctuation/generators.js';
import { markPunctuationAnswer } from '../shared/punctuation/marking.js';
import { DEFAULT_PUNCTUATION_PREFS, PUNCTUATION_CURRENT_RELEASE_ID } from '../src/subjects/punctuation/service-contract.js';
import { createPunctuationService } from '../shared/punctuation/service.js';

const REQUIRED_FIXED = 500;
const REQUIRED_GENERATED = 2500;
const REQUIRED_TOTAL = 3000;
const REQUIRED_DEPTH = 100;
const REQUIRED_FAMILIES = 28;
const REQUIRED_FIXED_P12_PREFIX = 'fx12_';
const jsonMode = process.argv.includes('--json');
const outIndex = process.argv.indexOf('--out');
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : null;

function norm(value) {
  return String(value ?? '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function answerForItem(item) {
  if (item.mode === 'choose' || item.inputKind === 'choice') return { choiceIndex: item.correctIndex };
  return { typed: item.model };
}

function groupCounts(items, keyFn) {
  const out = {};
  for (const item of items) {
    const key = keyFn(item) || 'unknown';
    out[key] = (out[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function duplicateCount(values) {
  const seen = new Set();
  let duplicates = 0;
  for (const value of values.map(norm).filter(Boolean)) {
    if (seen.has(value)) duplicates += 1;
    else seen.add(value);
  }
  return duplicates;
}

function createMemoryRepository() {
  const store = new Map();
  return {
    readData(id) { return store.get(id) || null; },
    writeData(id, data) { store.set(id, JSON.parse(JSON.stringify(data))); return store.get(id); },
    appendEvent() {},
    upsertSession() {},
  };
}

function simulateSession({ mode = 'smart', roundLength = '12', seed = 0 } = {}) {
  let n = seed + 1;
  const random = () => {
    n = (n * 48271) % 2147483647;
    return (n % 100000) / 100000;
  };
  let now = 1760000000000 + seed * 100000;
  const repo = createMemoryRepository();
  const service = createPunctuationService({ repository: repo, random, now: () => now });
  const learnerId = `audit-learner-${seed}`;
  let state = service.startSession(learnerId, { mode, roundLength }).state;
  const surfaced = [];
  while (state?.session?.currentItem && state.session.answeredCount < state.session.length) {
    const item = state.session.currentItem;
    surfaced.push({ id: item.id, mode: item.mode, signature: item.variantSignature || item.id });
    state = service.submitAnswer(learnerId, state, answerForItem(item), {
      expectedSessionId: state.session.id,
      expectedItemId: state.session.currentItemId,
      expectedAnsweredCount: state.session.answeredCount,
      expectedReleaseId: state.session.releaseId,
    }).state;
    if (state.phase === 'feedback') {
      state = service.continueSession(learnerId, state).state;
    }
    now += 60_000;
  }
  return surfaced;
}

const generated = createPunctuationGeneratedItems({ manifest: PUNCTUATION_CONTENT_MANIFEST, perFamily: PRODUCTION_DEPTH });
const runtime = createPunctuationRuntimeManifest({ generatedPerFamily: PRODUCTION_DEPTH });
const fixed = runtime.items.filter((item) => item.source !== 'generated');
const generatedRuntime = runtime.items.filter((item) => item.source === 'generated');
const p12Fixed = PUNCTUATION_ITEMS.filter((item) => item.id?.startsWith(REQUIRED_FIXED_P12_PREFIX));

const templateStats = Object.entries(GENERATED_TEMPLATE_BANK).map(([familyId, templates]) => ({
  familyId,
  templates: templates.length,
  uniqueStems: new Set(templates.map((template) => norm(template.stem))).size,
  uniqueModels: new Set(templates.map((template) => norm(template.model))).size,
}));

const modelFailures = [];
for (const item of runtime.items) {
  const result = markPunctuationAnswer({ item, answer: answerForItem(item) });
  if (!result.correct) modelFailures.push({ itemId: item.id, mode: item.mode, familyId: item.generatorFamilyId || '', model: item.model, note: result.note });
}

const sessionSamples = [];
for (let seed = 0; seed < 24; seed += 1) {
  sessionSamples.push(simulateSession({ mode: seed % 5 === 0 ? 'guided' : 'smart', roundLength: seed % 2 ? '12' : '8', seed }));
}
const sessionSummary = {
  sessions: sessionSamples.length,
  totalSurfaced: sessionSamples.reduce((sum, rows) => sum + rows.length, 0),
  minSessionModes: Math.min(...sessionSamples.map((rows) => new Set(rows.map((row) => row.mode)).size)),
  maxImmediateRepeats: Math.max(...sessionSamples.map((rows) => rows.reduce((max, row, index) => index > 0 && rows[index - 1].id === row.id ? Math.max(max, 1) : max, 0))),
  uniqueSurfacedItems: new Set(sessionSamples.flat().map((row) => row.id)).size,
};

const byMode = groupCounts(runtime.items, (item) => item.mode);
const bySkill = groupCounts(runtime.items.flatMap((item) => (item.skillIds || []).map((skillId) => ({ skillId }))), (entry) => entry.skillId);
const byFamily = groupCounts(generatedRuntime, (item) => item.generatorFamilyId);
const failures = [];
if (!PUNCTUATION_MANIFEST_VALIDATION.ok) failures.push(`manifest errors: ${PUNCTUATION_MANIFEST_VALIDATION.errors.join('; ')}`);
if (PUNCTUATION_CURRENT_RELEASE_ID !== 'punctuation-qg-p12-3000-2026-05-02') failures.push(`releaseId=${PUNCTUATION_CURRENT_RELEASE_ID}`);
if (DEFAULT_PUNCTUATION_PREFS.roundLength !== '6') failures.push(`default roundLength=${DEFAULT_PUNCTUATION_PREFS.roundLength}`);
if (PRODUCTION_DEPTH !== REQUIRED_DEPTH) failures.push(`productionDepth=${PRODUCTION_DEPTH}, expected ${REQUIRED_DEPTH}`);
if (templateStats.length !== REQUIRED_FAMILIES) failures.push(`familyCount=${templateStats.length}`);
for (const row of templateStats) {
  if (row.templates !== REQUIRED_DEPTH) failures.push(`${row.familyId} templates=${row.templates}`);
  if (row.uniqueStems !== REQUIRED_DEPTH) failures.push(`${row.familyId} uniqueStems=${row.uniqueStems}`);
  if (row.uniqueModels !== REQUIRED_DEPTH) failures.push(`${row.familyId} uniqueModels=${row.uniqueModels}`);
}
if (fixed.length < REQUIRED_FIXED) failures.push(`fixed=${fixed.length} < ${REQUIRED_FIXED}`);
if (generatedRuntime.length < REQUIRED_GENERATED) failures.push(`generated=${generatedRuntime.length} < ${REQUIRED_GENERATED}`);
if (runtime.items.length < REQUIRED_TOTAL) failures.push(`total=${runtime.items.length} < ${REQUIRED_TOTAL}`);
if (generated.length !== generatedRuntime.length) failures.push(`generated direct/runtime mismatch ${generated.length}/${generatedRuntime.length}`);
if (p12Fixed.length < 350) failures.push(`p12 fixed additions=${p12Fixed.length} < 350`);
if (modelFailures.length) failures.push(`model marking failures=${modelFailures.length}`);
if (duplicateCount(generatedRuntime.map((item) => item.stem)) > 80) failures.push('too many generated stem duplicates');
if (duplicateCount(generatedRuntime.map((item) => item.model)) > 140) failures.push('too many generated model duplicates');
if (sessionSummary.minSessionModes < 3) failures.push(`session mode variety too low: minSessionModes=${sessionSummary.minSessionModes}`);
if (sessionSummary.maxImmediateRepeats > 0) failures.push('immediate item repeat detected in session simulation');

const summary = {
  status: failures.length ? 'FAIL' : 'PASS',
  releaseId: PUNCTUATION_CURRENT_RELEASE_ID,
  productionDepth: PRODUCTION_DEPTH,
  fixedItems: fixed.length,
  p12FixedItems: p12Fixed.length,
  generatedItems: generatedRuntime.length,
  totalRuntimeItems: runtime.items.length,
  generatedFamilies: templateStats.length,
  templatesPerFamilyMin: Math.min(...templateStats.map((row) => row.templates)),
  templatesPerFamilyMax: Math.max(...templateStats.map((row) => row.templates)),
  uniqueGeneratedStems: new Set(generatedRuntime.map((item) => norm(item.stem))).size,
  uniqueGeneratedModels: new Set(generatedRuntime.map((item) => norm(item.model))).size,
  generatedStemDuplicateCount: duplicateCount(generatedRuntime.map((item) => item.stem)),
  generatedModelDuplicateCount: duplicateCount(generatedRuntime.map((item) => item.model)),
  byMode,
  bySkill,
  byFamily,
  modelFailureCount: modelFailures.length,
  modelFailures: modelFailures.slice(0, 20),
  sessionSummary,
  failures,
};

if (outPath) writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
if (jsonMode) console.log(JSON.stringify(summary, null, 2));
else {
  console.log(`Punctuation QG P12 3000+ expansion audit: ${summary.status}`);
  console.log(`  fixed/generated/total: ${summary.fixedItems}/${summary.generatedItems}/${summary.totalRuntimeItems}`);
  console.log(`  depth/families: ${summary.productionDepth}/${summary.generatedFamilies}`);
  console.log(`  unique generated stems/models: ${summary.uniqueGeneratedStems}/${summary.uniqueGeneratedModels}`);
  console.log(`  session surfaced unique items: ${sessionSummary.uniqueSurfacedItems}/${sessionSummary.totalSurfaced}`);
  for (const failure of failures) console.log(`  - ${failure}`);
}
if (failures.length) process.exitCode = 1;
