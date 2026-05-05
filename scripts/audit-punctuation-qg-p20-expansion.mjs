#!/usr/bin/env node

/**
 * Punctuation QG P20 expansion audit.
 *
 * This is a post-P20 acceptance gate. It is expected to FAIL on the P14/P15
 * baseline because the current pool is intentionally much smaller than the
 * heavy-play target. The script exists so the eventual P20 implementation has
 * a machine-checkable definition of "enough variety and quality".
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PUNCTUATION_CONTENT_MANIFEST,
  PUNCTUATION_SKILLS,
} from '../shared/punctuation/content.js';
import {
  GENERATED_TEMPLATE_BANK,
  PRODUCTION_DEPTH,
  createPunctuationRuntimeManifest,
} from '../shared/punctuation/generators.js';
import { markPunctuationAnswer } from '../shared/punctuation/marking.js';
import { createPunctuationService } from '../shared/punctuation/service.js';
import { PUNCTUATION_CURRENT_RELEASE_ID } from '../src/subjects/punctuation/service-contract.js';

const PUBLISHED_SKILLS = PUNCTUATION_SKILLS
  .filter((skill) => skill.published)
  .map((skill) => skill.id);

const OPEN_TYPED_MODES = new Set(['insert', 'fix', 'combine', 'paragraph', 'transfer']);
const OPEN_PRODUCTION_MODES = new Set(['combine', 'paragraph', 'transfer']);
const APPROVED_REVIEW_STATUSES = new Set([
  'approved',
  'approve',
  'accepted',
  'production-approved',
  'production_approved',
  'inherited-approved',
  'inherited_approved',
  'pass',
  'PASS',
]);
const BLOCKING_REVIEW_STATUSES = new Set([
  'blocked',
  'block',
  'rejected',
  'reject',
  'needs-review',
  'needs_review',
  'retired',
]);

export const P20_THRESHOLDS = Object.freeze({
  phase: 20,
  minRuntimeItems: 15_000,
  minGeneratedItems: 14_000,
  minFixedItems: 512,
  minUniqueLearnerSurfaces: 14_800,
  minUniqueVariantSignatures: 14_800,
  minGeneratedFamilyCount: 126,
  minGeneratedFamilyUniqueSurfaces: 80,
  minSkillUniqueSurfaces: 500,
  minSkillOpenTypedItems: 300,
  minSkillTransferOpenProductionItems: 120,
  minSkillChoiceItems: 80,
  minFamilyNegativeVectors: 5,
  minSkillNegativeVectors: 40,
  oneLearnerSessions: 50,
  oneLearnerRoundLength: '6',
  minOneLearnerUniqueItems: 220,
  multiLearnerCount: 10,
  multiLearnerSessions: 50,
  minMultiLearnerUniqueItems: 1_200,
  minAverageSmartModesPerSession: 4,
  minSmartOpenProductionRatio: 0.12,
  maxSmartOpenProductionRatio: 0.35,
});

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    json: args.includes('--json'),
    out: null,
    reviewRegister: 'reports/punctuation/punctuation-qg-p20-review-register.json',
    negativeVectorRegister: 'reports/punctuation/punctuation-qg-p20-negative-vector-register.json',
    heavyPlayReport: 'reports/punctuation/punctuation-qg-p20-heavy-play-simulation.json',
    simulateHeavyPlay: args.includes('--simulate-heavy-play'),
    heavyPlaySessions: 3,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--out' && args[index + 1]) options.out = args[++index];
    else if (arg.startsWith('--out=')) options.out = arg.slice('--out='.length);
    else if (arg === '--review-register' && args[index + 1]) options.reviewRegister = args[++index];
    else if (arg.startsWith('--review-register=')) options.reviewRegister = arg.slice('--review-register='.length);
    else if (arg === '--negative-vector-register' && args[index + 1]) options.negativeVectorRegister = args[++index];
    else if (arg.startsWith('--negative-vector-register=')) options.negativeVectorRegister = arg.slice('--negative-vector-register='.length);
    else if (arg === '--heavy-play-report' && args[index + 1]) options.heavyPlayReport = args[++index];
    else if (arg.startsWith('--heavy-play-report=')) options.heavyPlayReport = arg.slice('--heavy-play-report='.length);
    else if (arg === '--heavy-play-sessions' && args[index + 1]) options.heavyPlaySessions = Number(args[++index]);
    else if (arg.startsWith('--heavy-play-sessions=')) options.heavyPlaySessions = Number(arg.slice('--heavy-play-sessions='.length));
  }
  if (!Number.isInteger(options.heavyPlaySessions) || options.heavyPlaySessions < 1) {
    options.heavyPlaySessions = 3;
  }
  return options;
}

function normaliseText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJson(value[key])]));
}

function learnerSurfaceSignature(item) {
  const payload = {
    mode: item.mode || '',
    prompt: normaliseText(item.prompt),
    stem: normaliseText(item.stem),
    options: Array.isArray(item.options) ? item.options.map(normaliseText) : [],
    model: normaliseText(item.model),
    accepted: Array.isArray(item.accepted) ? item.accepted.map(normaliseText).sort() : [],
    skillIds: Array.isArray(item.skillIds) ? [...item.skillIds].sort() : [],
    validatorType: item.validator && typeof item.validator === 'object' ? item.validator.type || '' : '',
    rubricType: item.rubric && typeof item.rubric === 'object' ? item.rubric.type || '' : '',
  };
  return JSON.stringify(stableJson(payload));
}

function answerForItem(item) {
  if (item.mode === 'choose' || item.inputKind === 'choice') return { choiceIndex: item.correctIndex };
  return { typed: item.model };
}

function groupCounts(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const keys = keyFn(item);
    const list = Array.isArray(keys) ? keys : [keys];
    for (const rawKey of list) {
      const key = String(rawKey || 'unknown');
      map.set(key, (map.get(key) || 0) + 1);
    }
  }
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function uniqueBy(items, keyFn) {
  return new Set(items.map(keyFn).filter(Boolean)).size;
}

function readJsonIfExists(path) {
  const resolved = resolve(path);
  if (!existsSync(resolved)) return { exists: false, path, data: null, error: null };
  try {
    return { exists: true, path, data: JSON.parse(readFileSync(resolved, 'utf8')), error: null };
  } catch (error) {
    return { exists: true, path, data: null, error: error.message };
  }
}

function statusFromEntry(entry) {
  if (!entry) return '';
  if (typeof entry === 'string') return entry;
  if (typeof entry.status === 'string') return entry.status;
  if (typeof entry.decision === 'string') return entry.decision;
  if (typeof entry.reviewStatus === 'string') return entry.reviewStatus;
  return '';
}

function lookupReviewEntry(register, item) {
  const data = register?.data;
  if (!data || typeof data !== 'object') return null;
  const itemMaps = [
    data.items,
    data.itemDecisions,
    data.decisions,
    data.runtimeItems,
  ].filter((map) => map && typeof map === 'object' && !Array.isArray(map));
  for (const map of itemMaps) {
    if (map[item.id]) return map[item.id];
  }
  if (Array.isArray(data.items)) {
    const found = data.items.find((entry) => entry?.itemId === item.id || entry?.id === item.id);
    if (found) return found;
  }
  if (Array.isArray(data.itemDecisions)) {
    const found = data.itemDecisions.find((entry) => entry?.itemId === item.id || entry?.id === item.id);
    if (found) return found;
  }
  const familyId = item.generatorFamilyId || '';
  const familyMaps = [data.familyDecisions, data.families, data.generatedFamilies]
    .filter((map) => map && typeof map === 'object' && !Array.isArray(map));
  for (const map of familyMaps) {
    if (familyId && map[familyId]) return map[familyId];
  }
  if (item.source !== 'generated' && data.fixedBank) return data.fixedBank;
  return null;
}

function itemInlineReviewStatus(item) {
  return statusFromEntry(item.reviewStatus)
    || statusFromEntry(item.quality)
    || statusFromEntry(item.governance)
    || statusFromEntry(item.review);
}

function auditReviewCoverage(items, reviewRegister) {
  const rows = [];
  let approved = 0;
  let blocked = 0;
  let missing = 0;
  let unapproved = 0;
  for (const item of items) {
    const status = itemInlineReviewStatus(item) || statusFromEntry(lookupReviewEntry(reviewRegister, item));
    const normalised = String(status || '').trim();
    if (APPROVED_REVIEW_STATUSES.has(normalised)) approved += 1;
    else if (BLOCKING_REVIEW_STATUSES.has(normalised)) {
      blocked += 1;
      rows.push({ itemId: item.id, familyId: item.generatorFamilyId || '', status: normalised });
    } else if (!normalised) {
      missing += 1;
      if (rows.length < 25) rows.push({ itemId: item.id, familyId: item.generatorFamilyId || '', status: 'missing' });
    } else {
      unapproved += 1;
      if (rows.length < 25) rows.push({ itemId: item.id, familyId: item.generatorFamilyId || '', status: normalised });
    }
  }
  return {
    registerPath: reviewRegister?.path || null,
    registerExists: Boolean(reviewRegister?.exists),
    registerParseError: reviewRegister?.error || null,
    approved,
    missing,
    blocked,
    unapproved,
    total: items.length,
    ok: Boolean(reviewRegister?.exists) && !reviewRegister?.error && approved === items.length && missing === 0 && blocked === 0 && unapproved === 0,
    sampleProblems: rows.slice(0, 25),
  };
}

function normaliseNegativeVectorEntries(register) {
  const data = register?.data;
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data.negativeVectors)) return data.negativeVectors;
  if (Array.isArray(data.vectors)) return data.vectors;
  if (Array.isArray(data.items)) return data.items;
  const entries = [];
  const bySkill = data.bySkill && typeof data.bySkill === 'object' ? data.bySkill : {};
  for (const [skillId, value] of Object.entries(bySkill)) {
    const cases = Array.isArray(value) ? value : Array.isArray(value?.cases) ? value.cases : [];
    for (const entry of cases) entries.push({ ...entry, skillIds: [...new Set([...(entry?.skillIds || []), skillId])] });
  }
  const byFamily = data.byFamily && typeof data.byFamily === 'object' ? data.byFamily : data.families && typeof data.families === 'object' ? data.families : {};
  for (const [familyId, value] of Object.entries(byFamily)) {
    const cases = Array.isArray(value) ? value : Array.isArray(value?.cases) ? value.cases : [];
    for (const entry of cases) entries.push({ ...entry, familyId: entry?.familyId || familyId });
  }
  return entries;
}

function auditNegativeVectors(items, negativeVectorRegister) {
  const entries = normaliseNegativeVectorEntries(negativeVectorRegister);
  const bySkill = Object.fromEntries(PUBLISHED_SKILLS.map((skillId) => [skillId, 0]));
  const byFamily = Object.fromEntries(Object.keys(GENERATED_TEMPLATE_BANK).map((familyId) => [familyId, 0]));

  for (const entry of entries) {
    const skillIds = Array.isArray(entry.skillIds) ? entry.skillIds : (entry.skillId ? [entry.skillId] : []);
    for (const skillId of skillIds) {
      if (Object.hasOwn(bySkill, skillId)) bySkill[skillId] += 1;
    }
    const familyId = entry.familyId || entry.generatorFamilyId || '';
    if (Object.hasOwn(byFamily, familyId)) byFamily[familyId] += 1;
  }

  const missingSkillCoverage = Object.entries(bySkill)
    .filter(([, count]) => count < P20_THRESHOLDS.minSkillNegativeVectors)
    .map(([skillId, count]) => ({ skillId, count, required: P20_THRESHOLDS.minSkillNegativeVectors }));
  const missingFamilyCoverage = Object.entries(byFamily)
    .filter(([, count]) => count < P20_THRESHOLDS.minFamilyNegativeVectors)
    .map(([familyId, count]) => ({ familyId, count, required: P20_THRESHOLDS.minFamilyNegativeVectors }));

  return {
    registerPath: negativeVectorRegister?.path || null,
    registerExists: Boolean(negativeVectorRegister?.exists),
    registerParseError: negativeVectorRegister?.error || null,
    totalVectors: entries.length,
    bySkill,
    byFamily,
    missingSkillCoverage: missingSkillCoverage.slice(0, 25),
    missingFamilyCoverage: missingFamilyCoverage.slice(0, 25),
    ok: Boolean(negativeVectorRegister?.exists)
      && !negativeVectorRegister?.error
      && missingSkillCoverage.length === 0
      && missingFamilyCoverage.length === 0,
  };
}

function hashString(value) {
  let hash = 2166136261;
  const text = String(value ?? '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createDeterministicRandom(seedText) {
  let n = hashString(seedText) || 1;
  return () => {
    n = (n * 48271) % 2147483647;
    return (n % 1_000_000) / 1_000_000;
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMemoryRepository() {
  const dataStore = new Map();
  const sessionStore = new Map();
  return {
    readData(learnerId) {
      return dataStore.has(learnerId) ? clone(dataStore.get(learnerId)) : null;
    },
    writeData(learnerId, data) {
      dataStore.set(learnerId, clone(data));
      return clone(dataStore.get(learnerId));
    },
    syncPracticeSession(learnerId, _state, record) {
      if (record) sessionStore.set(learnerId, clone(record));
      else sessionStore.delete(learnerId);
      return record ? clone(record) : null;
    },
    abandonPracticeSession(learnerId) {
      sessionStore.delete(learnerId);
      return null;
    },
  };
}

function simulateLearner({ learnerIndex = 0, sessions = P20_THRESHOLDS.oneLearnerSessions } = {}) {
  const repository = createMemoryRepository();
  const random = createDeterministicRandom(`p20-heavy-play-${learnerIndex}`);
  let now = 1_780_000_000_000 + learnerIndex * 10_000_000;
  const service = createPunctuationService({ repository, random, now: () => now });
  const learnerId = `p20-heavy-play-${learnerIndex}`;
  const surfaced = [];
  const sessionSummaries = [];

  for (let sessionIndex = 0; sessionIndex < sessions; sessionIndex += 1) {
    let state = service.startSession(learnerId, { mode: 'smart', roundLength: P20_THRESHOLDS.oneLearnerRoundLength }).state;
    const sessionRows = [];
    while (state?.session?.currentItem && state.session.answeredCount < state.session.length) {
      const item = state.session.currentItem;
      const row = {
        learnerIndex,
        sessionIndex,
        itemId: item.id,
        mode: item.mode,
        skillIds: item.skillIds || [],
        variantSignature: item.variantSignature || item.id,
        surfaceSignature: learnerSurfaceSignature(item),
        generatorFamilyId: item.generatorFamilyId || '',
      };
      surfaced.push(row);
      sessionRows.push(row);
      state = service.submitAnswer(learnerId, state, answerForItem(item), {
        expectedSessionId: state.session.id,
        expectedItemId: state.session.currentItemId,
        expectedAnsweredCount: state.session.answeredCount,
        expectedReleaseId: state.session.releaseId,
      }).state;
      if (state.phase === 'feedback') state = service.continueSession(learnerId, state).state;
      now += 60_000;
    }
    sessionSummaries.push({
      sessionIndex,
      surfaced: sessionRows.length,
      uniqueItems: uniqueBy(sessionRows, (row) => row.itemId),
      uniqueSignatures: uniqueBy(sessionRows, (row) => row.variantSignature),
      uniqueFamilies: uniqueBy(sessionRows.filter((row) => row.generatorFamilyId), (row) => row.generatorFamilyId),
      uniqueModes: uniqueBy(sessionRows, (row) => row.mode),
      immediateItemRepeats: sessionRows.reduce((count, row, index) => count + (index > 0 && row.itemId === sessionRows[index - 1].itemId ? 1 : 0), 0),
      immediateSignatureRepeats: sessionRows.reduce((count, row, index) => count + (index > 0 && row.variantSignature === sessionRows[index - 1].variantSignature ? 1 : 0), 0),
      openProductionItems: sessionRows.filter((row) => OPEN_PRODUCTION_MODES.has(row.mode)).length,
    });
    now += 24 * 60 * 60 * 1000;
  }

  return { learnerIndex, surfaced, sessionSummaries };
}

function auditHeavyPlay({ sessionsPerLearner = P20_THRESHOLDS.multiLearnerSessions } = {}) {
  const learnerReports = [];
  for (let learnerIndex = 0; learnerIndex < P20_THRESHOLDS.multiLearnerCount; learnerIndex += 1) {
    learnerReports.push(simulateLearner({ learnerIndex, sessions: sessionsPerLearner }));
  }
  const allRows = learnerReports.flatMap((report) => report.surfaced);
  const allSessions = learnerReports.flatMap((report) => report.sessionSummaries);
  const oneLearner = learnerReports[0];
  const averageModesPerSession = allSessions.length
    ? allSessions.reduce((sum, row) => sum + row.uniqueModes, 0) / allSessions.length
    : 0;
  const openProductionRatio = allRows.length
    ? allRows.filter((row) => OPEN_PRODUCTION_MODES.has(row.mode)).length / allRows.length
    : 0;

  const immediateItemRepeats = allSessions.reduce((sum, row) => sum + row.immediateItemRepeats, 0);
  const immediateSignatureRepeats = allSessions.reduce((sum, row) => sum + row.immediateSignatureRepeats, 0);

  return {
    learnerCount: learnerReports.length,
    sessionsPerLearner,
    roundLength: Number(P20_THRESHOLDS.oneLearnerRoundLength),
    surfaced: allRows.length,
    oneLearnerUniqueItems: uniqueBy(oneLearner.surfaced, (row) => row.itemId),
    oneLearnerUniqueSurfaces: uniqueBy(oneLearner.surfaced, (row) => row.surfaceSignature),
    oneLearnerImmediateItemRepeats: oneLearner.sessionSummaries.reduce((sum, row) => sum + row.immediateItemRepeats, 0),
    oneLearnerImmediateSignatureRepeats: oneLearner.sessionSummaries.reduce((sum, row) => sum + row.immediateSignatureRepeats, 0),
    multiLearnerUniqueItems: uniqueBy(allRows, (row) => row.itemId),
    multiLearnerUniqueSurfaces: uniqueBy(allRows, (row) => row.surfaceSignature),
    immediateItemRepeats,
    immediateSignatureRepeats,
    averageModesPerSession: Number(averageModesPerSession.toFixed(2)),
    openProductionRatio: Number(openProductionRatio.toFixed(3)),
    perLearnerUniqueItems: learnerReports.map((report) => ({
      learnerIndex: report.learnerIndex,
      uniqueItems: uniqueBy(report.surfaced, (row) => row.itemId),
      uniqueSurfaces: uniqueBy(report.surfaced, (row) => row.surfaceSignature),
    })),
  };
}

function numberFrom(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function heavyPlayMetricSource(data = {}) {
  const observed = data.observed || data.summary || data.heavyPlay || data;
  const oneLearner = observed.oneLearner || data.oneLearner || {};
  const multiLearner = observed.multiLearner || data.multiLearner || {};
  return {
    status: data.status || observed.status || null,
    learnerCount: numberFrom(observed.learnerCount, data.learnerCount),
    sessionsPerLearner: numberFrom(observed.sessionsPerLearner, data.sessionsPerLearner),
    roundLength: numberFrom(observed.roundLength, data.roundLength),
    surfaced: numberFrom(observed.surfaced, data.surfaced),
    oneLearnerUniqueItems: numberFrom(observed.oneLearnerUniqueItems, oneLearner.uniqueItems, oneLearner.uniqueSurfacedItems),
    oneLearnerUniqueSurfaces: numberFrom(observed.oneLearnerUniqueSurfaces, oneLearner.uniqueSurfaces),
    oneLearnerImmediateItemRepeats: numberFrom(observed.oneLearnerImmediateItemRepeats, oneLearner.immediateItemRepeats, 0),
    oneLearnerImmediateSignatureRepeats: numberFrom(observed.oneLearnerImmediateSignatureRepeats, oneLearner.immediateSignatureRepeats, 0),
    multiLearnerUniqueItems: numberFrom(observed.multiLearnerUniqueItems, multiLearner.uniqueItems, multiLearner.uniqueSurfacedItems),
    multiLearnerUniqueSurfaces: numberFrom(observed.multiLearnerUniqueSurfaces, multiLearner.uniqueSurfaces),
    immediateItemRepeats: numberFrom(observed.immediateItemRepeats, data.immediateItemRepeats),
    immediateSignatureRepeats: numberFrom(observed.immediateSignatureRepeats, data.immediateSignatureRepeats),
    averageModesPerSession: numberFrom(observed.averageModesPerSession, data.averageModesPerSession),
    openProductionRatio: numberFrom(observed.openProductionRatio, observed.transferOpenProductionRatio, data.openProductionRatio),
    perLearnerUniqueItems: Array.isArray(observed.perLearnerUniqueItems) ? observed.perLearnerUniqueItems : [],
  };
}

function auditHeavyPlayEvidence(heavyPlayReport, options = {}) {
  let source = 'missing-report';
  let observed = null;
  let status = null;
  const failures = [];

  if (heavyPlayReport.exists && !heavyPlayReport.error) {
    source = 'report';
    observed = heavyPlayMetricSource(heavyPlayReport.data || {});
    status = observed.status;
  } else if (options.simulateHeavyPlay) {
    source = 'local-simulation';
    observed = auditHeavyPlay({ sessionsPerLearner: options.heavyPlaySessions || 3 });
    status = 'SIMULATED';
  }

  if (!heavyPlayReport.exists && source !== 'local-simulation') failures.push(`missing heavy-play simulation report: ${heavyPlayReport.path}`);
  if (heavyPlayReport.error) failures.push(`heavy-play simulation report is not valid JSON: ${heavyPlayReport.error}`);
  if (source === 'report' && status !== 'PASS') failures.push(`heavy-play simulation status=${status || 'missing'}, expected PASS`);
  if (!observed) failures.push('heavy-play observed metrics missing');

  if (observed) {
    if ((observed.oneLearnerUniqueItems ?? -1) < P20_THRESHOLDS.minOneLearnerUniqueItems) {
      failures.push(`oneLearnerUniqueItems=${observed.oneLearnerUniqueItems}, expected >= ${P20_THRESHOLDS.minOneLearnerUniqueItems}`);
    }
    if ((observed.multiLearnerUniqueItems ?? -1) < P20_THRESHOLDS.minMultiLearnerUniqueItems) {
      failures.push(`multiLearnerUniqueItems=${observed.multiLearnerUniqueItems}, expected >= ${P20_THRESHOLDS.minMultiLearnerUniqueItems}`);
    }
    if ((observed.immediateItemRepeats ?? -1) !== 0) failures.push(`immediateItemRepeats=${observed.immediateItemRepeats}, expected 0`);
    if ((observed.immediateSignatureRepeats ?? -1) !== 0) failures.push(`immediateSignatureRepeats=${observed.immediateSignatureRepeats}, expected 0`);
    if ((observed.averageModesPerSession ?? -1) < P20_THRESHOLDS.minAverageSmartModesPerSession) {
      failures.push(`averageModesPerSession=${observed.averageModesPerSession}, expected >= ${P20_THRESHOLDS.minAverageSmartModesPerSession}`);
    }
    if ((observed.openProductionRatio ?? -1) < P20_THRESHOLDS.minSmartOpenProductionRatio
      || (observed.openProductionRatio ?? 99) > P20_THRESHOLDS.maxSmartOpenProductionRatio) {
      failures.push(`openProductionRatio=${observed.openProductionRatio}, expected ${P20_THRESHOLDS.minSmartOpenProductionRatio}-${P20_THRESHOLDS.maxSmartOpenProductionRatio}`);
    }
  }

  return {
    reportPath: heavyPlayReport.path,
    reportExists: heavyPlayReport.exists,
    reportParseError: heavyPlayReport.error || null,
    source,
    status,
    ok: failures.length === 0,
    observed,
    thresholds: {
      minOneLearnerUniqueItems: P20_THRESHOLDS.minOneLearnerUniqueItems,
      minMultiLearnerUniqueItems: P20_THRESHOLDS.minMultiLearnerUniqueItems,
      immediateItemRepeats: 0,
      immediateSignatureRepeats: 0,
      minAverageSmartModesPerSession: P20_THRESHOLDS.minAverageSmartModesPerSession,
      minSmartOpenProductionRatio: P20_THRESHOLDS.minSmartOpenProductionRatio,
      maxSmartOpenProductionRatio: P20_THRESHOLDS.maxSmartOpenProductionRatio,
    },
    failures,
  };
}

function releaseIdEvidence(runtimeItems) {
  const match = PUNCTUATION_CURRENT_RELEASE_ID.match(/^punctuation-qg-p(\d+)-(\d+)-(\d{4}-\d{2}-\d{2})$/);
  return {
    releaseId: PUNCTUATION_CURRENT_RELEASE_ID,
    matchesPattern: Boolean(match),
    phase: match ? Number(match[1]) : null,
    embeddedRuntimeCount: match ? Number(match[2]) : null,
    releaseDate: match ? match[3] : null,
    runtimeCountMatches: match ? Number(match[2]) === runtimeItems.length : false,
    isP20OrLater: match ? Number(match[1]) >= P20_THRESHOLDS.phase : false,
  };
}

function buildSkillRows(items) {
  const rows = [];
  for (const skillId of PUBLISHED_SKILLS) {
    const skillItems = items.filter((item) => Array.isArray(item.skillIds) && item.skillIds.includes(skillId));
    const openTyped = skillItems.filter((item) => OPEN_TYPED_MODES.has(item.mode));
    const transferOpen = skillItems.filter((item) => OPEN_PRODUCTION_MODES.has(item.mode));
    const choice = skillItems.filter((item) => item.mode === 'choose' || item.inputKind === 'choice');
    rows.push({
      skillId,
      items: skillItems.length,
      uniqueSurfaces: uniqueBy(skillItems, learnerSurfaceSignature),
      openTypedItems: openTyped.length,
      transferOpenProductionItems: transferOpen.length,
      choiceItems: choice.length,
      modes: groupCounts(skillItems, (item) => item.mode),
      ok: skillItems.length > 0
        && uniqueBy(skillItems, learnerSurfaceSignature) >= P20_THRESHOLDS.minSkillUniqueSurfaces
        && openTyped.length >= P20_THRESHOLDS.minSkillOpenTypedItems
        && transferOpen.length >= P20_THRESHOLDS.minSkillTransferOpenProductionItems
        && choice.length >= P20_THRESHOLDS.minSkillChoiceItems,
    });
  }
  return rows;
}

function buildFamilyRows(generatedItems) {
  return Object.entries(GENERATED_TEMPLATE_BANK).map(([familyId]) => {
    const familyItems = generatedItems.filter((item) => item.generatorFamilyId === familyId);
    return {
      familyId,
      items: familyItems.length,
      mode: familyItems[0]?.mode || '',
      skills: [...new Set(familyItems.flatMap((item) => item.skillIds || []))].sort(),
      uniqueSurfaces: uniqueBy(familyItems, learnerSurfaceSignature),
      ok: uniqueBy(familyItems, learnerSurfaceSignature) >= P20_THRESHOLDS.minGeneratedFamilyUniqueSurfaces,
    };
  }).sort((a, b) => a.familyId.localeCompare(b.familyId));
}

function findSurfaceDuplicates(items) {
  const map = new Map();
  for (const item of items) {
    const signature = learnerSurfaceSignature(item);
    if (!map.has(signature)) map.set(signature, []);
    map.get(signature).push(item.id);
  }
  return [...map.values()]
    .filter((ids) => ids.length > 1)
    .map((ids) => ({ count: ids.length, itemIds: ids.slice(0, 20) }))
    .slice(0, 50);
}

export function buildPunctuationQGP20ExpansionReport(options = {}) {
  const runtime = createPunctuationRuntimeManifest({
    manifest: PUNCTUATION_CONTENT_MANIFEST,
    generatedPerFamily: PRODUCTION_DEPTH,
  });
  const items = runtime.items;
  const generatedItems = items.filter((item) => item.source === 'generated');
  const fixedItems = items.filter((item) => item.source !== 'generated');
  const release = releaseIdEvidence(items);

  const modelFailures = [];
  for (const item of items) {
    const result = markPunctuationAnswer({ item, answer: answerForItem(item) });
    if (!result.correct) {
      modelFailures.push({ itemId: item.id, familyId: item.generatorFamilyId || '', mode: item.mode, note: result.note || '' });
    }
  }

  const skillRows = buildSkillRows(items);
  const familyRows = buildFamilyRows(generatedItems);
  const duplicateSurfaces = findSurfaceDuplicates(generatedItems);
  const legacyFixedDuplicateSurfaces = findSurfaceDuplicates(fixedItems);
  const reviewRegister = readJsonIfExists(options.reviewRegister || 'reports/punctuation/punctuation-qg-p20-review-register.json');
  const negativeVectorRegister = readJsonIfExists(options.negativeVectorRegister || 'reports/punctuation/punctuation-qg-p20-negative-vector-register.json');
  const heavyPlayReport = readJsonIfExists(options.heavyPlayReport || 'reports/punctuation/punctuation-qg-p20-heavy-play-simulation.json');
  const reviewCoverage = auditReviewCoverage(items, reviewRegister);
  const negativeVectors = auditNegativeVectors(items, negativeVectorRegister);
  const heavyPlay = auditHeavyPlayEvidence(heavyPlayReport, options);

  const counts = {
    runtimeItems: items.length,
    generatedItems: generatedItems.length,
    fixedItems: fixedItems.length,
    productionDepth: PRODUCTION_DEPTH,
    generatedFamilies: Object.keys(GENERATED_TEMPLATE_BANK).length,
    publishedSkills: PUBLISHED_SKILLS.length,
    uniqueLearnerSurfaces: uniqueBy(items, learnerSurfaceSignature),
    uniqueVariantSignatures: uniqueBy(items, (item) => item.variantSignature || item.id),
    duplicateSurfaceGroups: duplicateSurfaces.length,
    legacyFixedDuplicateSurfaceGroups: legacyFixedDuplicateSurfaces.length,
    modelSelfMarkingFailures: modelFailures.length,
    byMode: groupCounts(items, (item) => item.mode),
    bySkill: groupCounts(items, (item) => item.skillIds || []),
  };

  const gates = {
    releaseIdentity: {
      ok: release.matchesPattern && release.isP20OrLater && release.runtimeCountMatches,
      release,
    },
    poolDepth: {
      ok: counts.runtimeItems >= P20_THRESHOLDS.minRuntimeItems
        && counts.generatedItems >= P20_THRESHOLDS.minGeneratedItems
        && counts.fixedItems >= P20_THRESHOLDS.minFixedItems,
      observed: {
        runtimeItems: counts.runtimeItems,
        generatedItems: counts.generatedItems,
        fixedItems: counts.fixedItems,
      },
      thresholds: {
        minRuntimeItems: P20_THRESHOLDS.minRuntimeItems,
        minGeneratedItems: P20_THRESHOLDS.minGeneratedItems,
        minFixedItems: P20_THRESHOLDS.minFixedItems,
      },
    },
    learnerSurfaceVariety: {
      ok: counts.uniqueLearnerSurfaces >= P20_THRESHOLDS.minUniqueLearnerSurfaces
        && counts.uniqueVariantSignatures >= P20_THRESHOLDS.minUniqueVariantSignatures
        && duplicateSurfaces.length === 0,
      observed: {
        uniqueLearnerSurfaces: counts.uniqueLearnerSurfaces,
        uniqueVariantSignatures: counts.uniqueVariantSignatures,
        duplicateSurfaceGroups: duplicateSurfaces.length,
        legacyFixedDuplicateSurfaceGroups: legacyFixedDuplicateSurfaces.length,
      },
      thresholds: {
        minUniqueLearnerSurfaces: P20_THRESHOLDS.minUniqueLearnerSurfaces,
        minUniqueVariantSignatures: P20_THRESHOLDS.minUniqueVariantSignatures,
        duplicateSurfaceGroups: 0,
      },
      duplicateSurfaceSamples: duplicateSurfaces.slice(0, 10),
      legacyFixedDuplicateSurfaceSamples: legacyFixedDuplicateSurfaces.slice(0, 10),
    },
    generatedFamilyDepth: {
      ok: counts.generatedFamilies >= P20_THRESHOLDS.minGeneratedFamilyCount
        && familyRows.every((row) => row.ok),
      observed: {
        generatedFamilies: counts.generatedFamilies,
        minFamilyUniqueSurfaces: Math.min(...familyRows.map((row) => row.uniqueSurfaces)),
      },
      thresholds: {
        minGeneratedFamilyCount: P20_THRESHOLDS.minGeneratedFamilyCount,
        minGeneratedFamilyUniqueSurfaces: P20_THRESHOLDS.minGeneratedFamilyUniqueSurfaces,
      },
      failingFamilies: familyRows.filter((row) => !row.ok).slice(0, 25),
    },
    perSkillBalance: {
      ok: skillRows.every((row) => row.ok),
      thresholds: {
        minSkillUniqueSurfaces: P20_THRESHOLDS.minSkillUniqueSurfaces,
        minSkillOpenTypedItems: P20_THRESHOLDS.minSkillOpenTypedItems,
        minSkillTransferOpenProductionItems: P20_THRESHOLDS.minSkillTransferOpenProductionItems,
        minSkillChoiceItems: P20_THRESHOLDS.minSkillChoiceItems,
      },
      failingSkills: skillRows.filter((row) => !row),
      rows: skillRows,
    },
    modelSelfMarking: {
      ok: modelFailures.length === 0,
      failureCount: modelFailures.length,
      failures: modelFailures.slice(0, 25),
    },
    reviewGovernance: reviewCoverage,
    negativeVectorCoverage: negativeVectors,
    heavyPlayVariety: heavyPlay,
  };

  // Correct a filtered array typo without losing the raw rows. This field is
  // deliberately duplicated in `rows` so reviewers can inspect every skill.
  gates.perSkillBalance.failingSkills = skillRows.filter((row) => !row.ok);

  const failingGates = Object.entries(gates)
    .filter(([, gate]) => gate?.ok !== true)
    .map(([gate]) => gate);

  return {
    schemaVersion: 1,
    phase: 'punctuation-qg-p20-expansion-audit',
    status: failingGates.length ? 'FAIL' : 'PASS',
    releaseId: PUNCTUATION_CURRENT_RELEASE_ID,
    generatedAt: new Date().toISOString(),
    thresholds: P20_THRESHOLDS,
    counts,
    gates,
    failingGates,
    skillRows,
    familyRows,
    notes: [
      'This audit is a post-P20 acceptance gate and is expected to fail on the P14/P15 baseline.',
      'Duplicate-surface blocking is applied to generated runtime items; legacy fixed-bank duplicates are reported separately and governed through the fixedBank review decision.',
      'Production certification still requires a separate production smoke with origin, environment, release ID, runtime count, authenticated coverage, and admin coverage.',
    ],
  };
}

function writeJson(outPath, value) {
  const resolved = resolve(outPath);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`);
}

function main() {
  const options = parseArgs(process.argv);
  const report = buildPunctuationQGP20ExpansionReport(options);
  if (options.out) writeJson(options.out, report);
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Punctuation QG P20 expansion audit: ${report.status}`);
    console.log(`  release: ${report.releaseId}`);
    console.log(`  runtime/generated/fixed: ${report.counts.runtimeItems}/${report.counts.generatedItems}/${report.counts.fixedItems}`);
    console.log(`  unique surfaces/signatures: ${report.counts.uniqueLearnerSurfaces}/${report.counts.uniqueVariantSignatures}`);
    console.log(`  generated families: ${report.counts.generatedFamilies}`);
    console.log(`  failing gates: ${report.failingGates.join(', ') || 'none'}`);
  }
  if (report.status !== 'PASS') process.exitCode = 1;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) main();
