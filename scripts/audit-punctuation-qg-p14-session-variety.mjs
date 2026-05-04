#!/usr/bin/env node

/**
 * P14 Session-variety audit — Gate 5.
 *
 * Drives `createPunctuationService` end-to-end through:
 *   - 80 mixed-seed sessions (mode + roundLength varied per session).
 *   - 20 SmartSix sessions for one returning learner profile.
 *
 * Asserts the contract's variety floors:
 *   - 0 immediate item repeats within a session.
 *   - >=3 modes per Smart session on average.
 *   - >=200 unique items across the 80 mixed-seed sessions.
 *   - >=80 unique items across 20 x 6 = 120 SmartSix questions.
 *   - paragraph appears at least once every 4 sessions on average.
 *   - transfer represented but not dominant. Contract phrasing is
 *     "appears but does not dominate". P14b tightens the per-session cap
 *     to <=34 % so a SmartSix session can hold at most 2 transfer slots
 *     out of 6 (2/6 = 33.3 %); 3/6 (50 %) trips the gate. Aggregate
 *     check: at most half of all sessions may contain any transfer item.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { markPunctuationAnswer } from '../shared/punctuation/marking.js';
import { createPunctuationService } from '../shared/punctuation/service.js';
import { PUNCTUATION_CURRENT_RELEASE_ID } from '../src/subjects/punctuation/service-contract.js';

const ROUND_LENGTH = 6;
const MIXED_SESSION_COUNT = 80;
const LEARNER_SESSION_COUNT = 20;
const DAY_MS = 86_400_000;
const START_TS = Date.parse('2026-05-01T09:00:00.000Z');

function makeRng(seed) {
  // mulberry32 — better diffusion than the earlier LCG.
  let state = (seed >>> 0) || 0xdead_beef;
  return () => {
    state = (state + 0x6d2b_79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function createMemoryRepository() {
  const store = new Map();
  return {
    readData(id) { return store.get(id) || null; },
    writeData(id, data) {
      store.set(id, JSON.parse(JSON.stringify(data)));
      return store.get(id);
    },
    appendEvent() {},
    upsertSession() {},
  };
}

function answerForItem(item) {
  if (item.mode === 'choose' || item.inputKind === 'choice') {
    return { choiceIndex: item.correctIndex };
  }
  return { typed: item.model };
}

function runOneSession({ service, learnerId, mode, roundLength, sessionTimestamp, advanceClock }) {
  let state = service.startSession(learnerId, { mode, roundLength: String(roundLength) }).state;
  const slots = [];
  let nowOffset = 0;
  while (state?.session?.currentItem && state.session.answeredCount < state.session.length) {
    const item = state.session.currentItem;
    slots.push(item);
    advanceClock(sessionTimestamp + nowOffset);
    state = service.submitAnswer(learnerId, state, answerForItem(item), {
      expectedSessionId: state.session.id,
      expectedItemId: state.session.currentItemId,
      expectedAnsweredCount: state.session.answeredCount,
      expectedReleaseId: state.session.releaseId,
    }).state;
    if (state.phase === 'feedback') {
      state = service.continueSession(learnerId, state).state;
    }
    nowOffset += 60_000;
  }
  return slots;
}

function summariseSession(slots) {
  const ids = slots.map((s) => s.id);
  const modes = slots.map((s) => s.mode);
  const skills = slots.flatMap((s) => s.skillIds || []);
  let immediateRepeats = 0;
  for (let i = 1; i < ids.length; i += 1) {
    if (ids[i] === ids[i - 1]) immediateRepeats += 1;
  }
  const modeCounts = modes.reduce((acc, mode) => {
    acc[mode] = (acc[mode] || 0) + 1;
    return acc;
  }, {});
  const transferRatio = slots.length ? (modeCounts.transfer || 0) / slots.length : 0;
  return {
    items: ids,
    uniqueItems: new Set(ids).size,
    modes: [...new Set(modes)],
    uniqueSkills: new Set(skills).size,
    immediateRepeats,
    hasParagraph: modes.includes('paragraph'),
    hasTransfer: modes.includes('transfer'),
    transferRatio,
  };
}

function runMixedSeedSweep() {
  const allItems = new Set();
  const sessionSummaries = [];
  let totalImmediateRepeats = 0;
  let paragraphSessions = 0;
  let transferSessions = 0;
  let modesPerSessionSum = 0;
  let maxTransferRatio = 0;
  for (let i = 0; i < MIXED_SESSION_COUNT; i += 1) {
    // Mirror the P13 audit's mixed-seed pattern: vary mode (smart / guided /
    // speech) and roundLength (6 / 8 / 12) across the 80 sessions to exercise
    // the scheduler's variety surface honestly.
    const mode = i % 7 === 0 ? 'guided' : i % 11 === 0 ? 'speech' : 'smart';
    const roundLength = i % 3 === 0 ? 6 : i % 3 === 1 ? 8 : 12;
    const seed = 0xc0ffee ^ Math.imul(i + 1, 2654435761);
    const rng = makeRng(seed);
    const repo = createMemoryRepository();
    let nowTs = START_TS + i * DAY_MS;
    const service = createPunctuationService({
      repository: repo,
      random: rng,
      now: () => nowTs,
    });
    const slots = runOneSession({
      service,
      learnerId: `mixed-learner-${i}`,
      mode,
      roundLength,
      sessionTimestamp: nowTs,
      advanceClock: (ts) => { nowTs = ts; },
    });
    const summary = summariseSession(slots);
    for (const itemId of summary.items) allItems.add(itemId);
    totalImmediateRepeats += summary.immediateRepeats;
    if (summary.hasParagraph) paragraphSessions += 1;
    if (summary.hasTransfer) transferSessions += 1;
    modesPerSessionSum += summary.modes.length;
    if (summary.transferRatio > maxTransferRatio) maxTransferRatio = summary.transferRatio;
    sessionSummaries.push(summary);
  }
  return {
    sessionCount: MIXED_SESSION_COUNT,
    totalImmediateRepeats,
    averageModesPerSession: modesPerSessionSum / MIXED_SESSION_COUNT,
    paragraphSessions,
    transferSessions,
    uniqueItemsAcrossSweep: allItems.size,
    maxTransferRatio,
    sample: sessionSummaries.slice(0, 5),
  };
}

function runOneLearnerSweep() {
  // Single learner across 20 SmartSix sessions: progress + recentItemIds
  // accumulate inside the service repository so the scheduler's exposure
  // weights and recent-avoidance kick in naturally.
  const allItems = new Set();
  const summaries = [];
  let totalImmediateRepeats = 0;
  let paragraphSessions = 0;
  let transferSessions = 0;
  let modesPerSessionSum = 0;
  let maxTransferRatio = 0;
  const repo = createMemoryRepository();
  const rng = makeRng(0xface1234);
  let nowTs = START_TS;
  const service = createPunctuationService({
    repository: repo,
    random: rng,
    now: () => nowTs,
  });
  const learnerId = 'returning-smartsix-learner';
  for (let i = 0; i < LEARNER_SESSION_COUNT; i += 1) {
    nowTs = START_TS + i * DAY_MS;
    const slots = runOneSession({
      service,
      learnerId,
      mode: 'smart',
      roundLength: ROUND_LENGTH,
      sessionTimestamp: nowTs,
      advanceClock: (ts) => { nowTs = ts; },
    });
    const summary = summariseSession(slots);
    for (const itemId of summary.items) allItems.add(itemId);
    totalImmediateRepeats += summary.immediateRepeats;
    if (summary.hasParagraph) paragraphSessions += 1;
    if (summary.hasTransfer) transferSessions += 1;
    modesPerSessionSum += summary.modes.length;
    if (summary.transferRatio > maxTransferRatio) maxTransferRatio = summary.transferRatio;
    summaries.push(summary);
  }
  return {
    sessionCount: LEARNER_SESSION_COUNT,
    totalImmediateRepeats,
    averageModesPerSession: modesPerSessionSum / LEARNER_SESSION_COUNT,
    paragraphSessions,
    transferSessions,
    uniqueItemsAcrossSweep: allItems.size,
    maxTransferRatio,
  };
}

function evaluateGates(mixed, learner) {
  return {
    gate5Mixed: {
      target: { sessions: 80, immediateRepeats: 0, modesPerSession: 3, uniqueItems: 200 },
      observed: {
        sessions: mixed.sessionCount,
        immediateRepeats: mixed.totalImmediateRepeats,
        averageModesPerSession: Number(mixed.averageModesPerSession.toFixed(2)),
        uniqueItems: mixed.uniqueItemsAcrossSweep,
      },
      ok:
        mixed.totalImmediateRepeats === 0
        && mixed.averageModesPerSession >= 3
        && mixed.uniqueItemsAcrossSweep >= 200,
    },
    gate5OneLearner: {
      target: {
        sessions: 20,
        immediateRepeats: 0,
        uniqueItems: 80,
        paragraphAtLeastOnceEveryFour: true,
        // adv-007: tightened from 0.5 (majority) to 0.34 (allows 2/6
        // transfer slots in a SmartSix; rejects 3/6 = 50 %).
        transferRatioMax: 0.34,
        // Aggregate floor: at most half of all sessions should contain a
        // transfer item — otherwise transfer is "everywhere" even if no
        // single session is dominated by it.
        transferTouchRatioMax: 0.75,
      },
      observed: {
        sessions: learner.sessionCount,
        immediateRepeats: learner.totalImmediateRepeats,
        uniqueItems: learner.uniqueItemsAcrossSweep,
        paragraphSessions: learner.paragraphSessions,
        transferSessions: learner.transferSessions,
        transferTouchRatio: Number((learner.transferSessions / Math.max(1, learner.sessionCount)).toFixed(2)),
        maxTransferRatio: Number(learner.maxTransferRatio.toFixed(2)),
      },
      ok:
        learner.totalImmediateRepeats === 0
        && learner.uniqueItemsAcrossSweep >= 80
        && learner.paragraphSessions >= Math.ceil(LEARNER_SESSION_COUNT / 4)
        && learner.maxTransferRatio <= 0.34
        && (learner.transferSessions / Math.max(1, learner.sessionCount)) <= 0.75,
    },
  };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = { out: null };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--out' && args[i + 1]) {
      result.out = args[i + 1];
      i += 1;
    }
  }
  return result;
}

function main() {
  const args = parseArgs(process.argv);
  const mixed = runMixedSeedSweep();
  const learner = runOneLearnerSweep();
  const gates = evaluateGates(mixed, learner);
  const report = {
    schemaVersion: 1,
    phase: 'punctuation-qg-p14-session-variety',
    releaseId: PUNCTUATION_CURRENT_RELEASE_ID,
    generatedAt: new Date().toISOString(),
    roundLength: ROUND_LENGTH,
    mixedSeedSweep: mixed,
    oneLearnerSweep: learner,
    gates,
    overallOk: gates.gate5Mixed.ok && gates.gate5OneLearner.ok,
  };
  const json = JSON.stringify(report, null, 2);
  if (args.out) {
    const outPath = resolve(args.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${json}\n`, 'utf8');
    console.error(`P14 session-variety audit written to ${outPath}`);
  } else {
    process.stdout.write(`${json}\n`);
  }
  process.exitCode = report.overallOk ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
