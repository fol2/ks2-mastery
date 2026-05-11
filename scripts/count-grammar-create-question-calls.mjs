#!/usr/bin/env node
// R6.AC5 — instrumented createGrammarQuestion call-counter. Emits JSON to
// stdout with { calls, templateCount, node, config }. Intended to be spawned
// by tests/grammar-selection-perf-tripwire.test.js so the main test suite
// does not have to run with --experimental-test-module-mocks.
//
// Requires node --experimental-test-module-mocks to intercept the ESM
// namespace. See docs/contracts/ci-shard-balance.md R6.AC5.

import { mock } from 'node:test';

const contentUrl = new URL('../worker/src/subjects/grammar/content.js', import.meta.url).href;
const orig = await import(contentUrl);

let calls = 0;
mock.module(contentUrl, {
  namedExports: {
    ...orig,
    createGrammarQuestion: (...args) => {
      calls += 1;
      return orig.createGrammarQuestion(...args);
    },
  },
});

// Dynamic import AFTER the mock so selection.js resolves to the wrapped
// createGrammarQuestion binding.
const selection = await import('../worker/src/subjects/grammar/selection.js');
const { SIM_NOW_MS } = await import('../tests/helpers/grammar-simulation.js');
const { GRAMMAR_TEMPLATE_METADATA } = orig;

function buildFortyEntryRecent() {
  const attempts = [];
  const templateCount = GRAMMAR_TEMPLATE_METADATA.length;
  for (let i = 0; i < 40; i += 1) {
    const template = GRAMMAR_TEMPLATE_METADATA[(i * 37) % templateCount];
    const isRecentMiss = i === 38;
    attempts.push({
      contentReleaseId: 'grammar-legacy-reviewed-2026-04-24',
      templateId: template.id,
      itemId: `${template.id}::count-probe-${i}`,
      seed: i,
      questionType: template.questionType,
      conceptIds: template.skillIds.slice(),
      response: {},
      result: { correct: !isRecentMiss },
      supportLevel: 0,
      attempts: 1,
      createdAt: SIM_NOW_MS - (40 - i) * 60_000,
    });
  }
  return attempts;
}

const recentAttempts = buildFortyEntryRecent();

const weakMastery = {
  concepts: {
    adverbials: {
      attempts: 10,
      correct: 2,
      wrong: 8,
      strength: 0.15,
      intervalDays: 0,
      dueAt: 0,
      correctStreak: 0,
    },
  },
};

function countQueueBuild(config) {
  selection.buildGrammarPracticeQueue(config);
  calls = 0;
  selection.buildGrammarPracticeQueue(config);
  return calls;
}

const defaultConfig = {
  mode: 'smart',
  mastery: null,
  recentAttempts,
  seed: 1,
  size: 10,
  now: SIM_NOW_MS,
};

const priorityRecentMissConfig = {
  ...defaultConfig,
  mastery: weakMastery,
};

const defaultCalls = countQueueBuild(defaultConfig);
const priorityRecentMissCalls = countQueueBuild(priorityRecentMissConfig);

process.stdout.write(`${JSON.stringify({
  calls: defaultCalls,
  priorityRecentMissCalls,
  templateCount: GRAMMAR_TEMPLATE_METADATA.length,
  node: process.version,
  config: { mode: 'smart', seed: 1, size: 10 },
})}\n`);
