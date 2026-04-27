#!/usr/bin/env node
// Hero Mode P0 — Shadow quest simulation script.
//
// Loads the five test fixtures, runs providers -> eligibility -> scheduler
// for each, and reports effort distribution, subject mix, reason tag
// breakdown, invalid task count, and Mega maintenance count.
//
// QA / debug aid only — NOT integrated into `npm test`.
//
// Usage:
//   node scripts/hero-shadow-simulate.mjs

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runProvider, registeredSubjectIds } from '../worker/src/hero/providers/index.js';
import { resolveEligibility } from '../shared/hero/eligibility.js';
import { scheduleShadowQuest } from '../shared/hero/scheduler.js';
import { generateHeroSeed, deriveDateKey } from '../shared/hero/seed.js';
import { validateTaskEnvelope } from '../shared/hero/task-envelope.js';
import {
  HERO_DEFAULT_EFFORT_TARGET,
  HERO_DEFAULT_TIMEZONE,
  HERO_SCHEDULER_VERSION,
  HERO_MAINTENANCE_INTENTS,
} from '../shared/hero/constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(__dirname, '..', 'tests', 'fixtures', 'hero');

const FIXTURES = [
  'all-ready-balanced.json',
  'fresh-three-subjects.json',
  'punctuation-disabled.json',
  'spelling-mega-grammar-weak.json',
  'zero-eligible-subjects.json',
];

const NOW = Date.now();
const DATE_KEY = deriveDateKey(NOW, HERO_DEFAULT_TIMEZONE);

function loadFixture(name) {
  const path = resolve(FIXTURE_DIR, name);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function simulateFixture(name, fixture) {
  const registeredIds = registeredSubjectIds();

  // 1. Run providers for each subject in the fixture
  const subjectSnapshots = {};
  for (const subjectId of registeredIds) {
    const readModel = fixture[subjectId] || null;
    const snapshot = runProvider(subjectId, readModel);
    if (snapshot) {
      subjectSnapshots[subjectId] = snapshot;
    }
  }

  // 2. Resolve eligibility
  const eligibility = resolveEligibility(subjectSnapshots);

  // 3. Build eligible snapshots for the scheduler
  const eligibleSnapshots = eligibility.eligible.map((entry) => {
    return subjectSnapshots[entry.subjectId] || null;
  }).filter(Boolean);

  // 4. Generate seed
  const seed = generateHeroSeed({
    learnerId: `simulate-${name}`,
    dateKey: DATE_KEY,
    timezone: HERO_DEFAULT_TIMEZONE,
    schedulerVersion: HERO_SCHEDULER_VERSION,
    contentReleaseFingerprint: null,
  });

  // 5. Schedule
  const quest = scheduleShadowQuest({
    eligibleSnapshots,
    effortTarget: HERO_DEFAULT_EFFORT_TARGET,
    seed,
    schedulerVersion: HERO_SCHEDULER_VERSION,
    dateKey: DATE_KEY,
  });

  return { eligibility, quest, subjectSnapshots };
}

function printHeader(text) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${text}`);
  console.log('='.repeat(60));
}

function printSection(text) {
  console.log(`\n  --- ${text} ---`);
}

// ── Main ──────────────────────────────────────────────────────────────

console.log('Hero Mode P0 — Shadow Quest Simulation');
console.log(`Date key: ${DATE_KEY}`);
console.log(`Effort target: ${HERO_DEFAULT_EFFORT_TARGET}`);
console.log(`Scheduler version: ${HERO_SCHEDULER_VERSION}`);
console.log(`Fixtures: ${FIXTURES.length}`);

const aggregated = {
  totalTasks: 0,
  totalEffort: 0,
  invalidTaskCount: 0,
  megaMaintenanceCount: 0,
  subjectEffort: {},
  reasonTags: {},
  intents: {},
};

for (const fixtureName of FIXTURES) {
  const fixture = loadFixture(fixtureName);
  const { eligibility, quest } = simulateFixture(fixtureName, fixture);

  printHeader(fixtureName);

  printSection('Eligibility');
  console.log(`  Eligible: ${eligibility.eligible.map((e) => `${e.subjectId} (${e.reason})`).join(', ') || '(none)'}`);
  console.log(`  Locked:   ${eligibility.locked.map((e) => `${e.subjectId} (${e.reason})`).join(', ') || '(none)'}`);

  printSection('Quest');
  console.log(`  Quest ID:       ${quest.questId}`);
  console.log(`  Status:         ${quest.status}`);
  console.log(`  Effort target:  ${quest.effortTarget}`);
  console.log(`  Effort planned: ${quest.effortPlanned}`);
  console.log(`  Tasks:          ${quest.tasks.length}`);

  printSection('Tasks');
  let fixtureInvalid = 0;
  let fixtureMegaMaintenance = 0;
  for (const task of quest.tasks) {
    const validation = validateTaskEnvelope(task);
    const valid = validation.valid ? 'VALID' : `INVALID (${validation.errors.join('; ')})`;
    console.log(`    [${task.subjectId}] ${task.intent} / ${task.launcher} — effort ${task.effortTarget} — ${valid}`);
    if (task.reasonTags?.length) {
      console.log(`      tags: ${task.reasonTags.join(', ')}`);
    }
    if (!validation.valid) fixtureInvalid += 1;
    if (HERO_MAINTENANCE_INTENTS.has(task.intent)) fixtureMegaMaintenance += 1;

    // Aggregate
    aggregated.totalTasks += 1;
    aggregated.totalEffort += Number(task.effortTarget) || 0;
    aggregated.subjectEffort[task.subjectId] = (aggregated.subjectEffort[task.subjectId] || 0) + (Number(task.effortTarget) || 0);
    aggregated.intents[task.intent] = (aggregated.intents[task.intent] || 0) + 1;
    for (const tag of (task.reasonTags || [])) {
      aggregated.reasonTags[tag] = (aggregated.reasonTags[tag] || 0) + 1;
    }
  }
  aggregated.invalidTaskCount += fixtureInvalid;
  aggregated.megaMaintenanceCount += fixtureMegaMaintenance;

  if (fixtureInvalid > 0) {
    console.log(`  ** ${fixtureInvalid} INVALID task(s) **`);
  }

  printSection('Debug');
  console.log(`  Candidate count:      ${quest.debug.candidateCount}`);
  console.log(`  Rejected candidates:  ${quest.debug.rejectedCandidates.length}`);
  console.log(`  Subject mix:          ${JSON.stringify(quest.debug.subjectMix)}`);
  if (quest.debug.reason) {
    console.log(`  Reason:               ${quest.debug.reason}`);
  }
}

// ── Aggregated Report ─────────────────────────────────────────────────

printHeader('AGGREGATED REPORT');

printSection('Effort Distribution');
console.log(`  Total tasks:    ${aggregated.totalTasks}`);
console.log(`  Total effort:   ${aggregated.totalEffort}`);
for (const [subjectId, effort] of Object.entries(aggregated.subjectEffort).sort()) {
  const pct = aggregated.totalEffort > 0
    ? ((effort / aggregated.totalEffort) * 100).toFixed(1)
    : '0.0';
  console.log(`    ${subjectId}: ${effort} (${pct}%)`);
}

printSection('Subject Mix %');
for (const [subjectId, effort] of Object.entries(aggregated.subjectEffort).sort()) {
  const pct = aggregated.totalEffort > 0
    ? ((effort / aggregated.totalEffort) * 100).toFixed(1)
    : '0.0';
  console.log(`    ${subjectId}: ${pct}%`);
}

printSection('Intent Breakdown');
for (const [intent, count] of Object.entries(aggregated.intents).sort()) {
  console.log(`    ${intent}: ${count}`);
}

printSection('Reason Tag Breakdown');
for (const [tag, count] of Object.entries(aggregated.reasonTags).sort()) {
  console.log(`    ${tag}: ${count}`);
}

printSection('Quality Metrics');
console.log(`  Invalid task count:      ${aggregated.invalidTaskCount}`);
console.log(`  Mega maintenance count:  ${aggregated.megaMaintenanceCount}`);

if (aggregated.invalidTaskCount > 0) {
  console.log('\n  !! WARNING: Some tasks failed validation. Review fixture data. !!');
}

console.log(`\n${'='.repeat(60)}`);
console.log('  Simulation complete.');
console.log('='.repeat(60));
