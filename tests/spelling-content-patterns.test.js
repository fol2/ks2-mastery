import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PATTERN_LAUNCH_THRESHOLD,
  SPELLING_PATTERN_IDS,
  SPELLING_PATTERNS,
  computeLaunchedPatternIds,
  isPatternEligibleSlug,
} from '../src/subjects/spelling/content/patterns.js';
import {
  SPELLING_CONTENT_MODEL_VERSION,
  validateSpellingContentBundle,
} from '../src/subjects/spelling/content/model.js';
import {
  SPELLING_PATTERN_IDS as SERVICE_CONTRACT_PATTERN_IDS,
  SPELLING_PATTERNS as SERVICE_CONTRACT_PATTERNS,
  computeLaunchedPatternIds as SERVICE_CONTRACT_COMPUTE,
  isPatternEligibleSlug as SERVICE_CONTRACT_IS_PATTERN_ELIGIBLE,
} from '../src/subjects/spelling/service-contract.js';
import { SEEDED_SPELLING_CONTENT_BUNDLE } from '../src/subjects/spelling/data/content-data.js';
import { cloneSerialisable } from '../src/platform/core/repositories/helpers.js';

test('SPELLING_PATTERNS exports exactly 15 patterns with the required shape', () => {
  const ids = Object.keys(SPELLING_PATTERNS);
  assert.equal(ids.length, 15);
  assert.deepEqual(ids, [...SPELLING_PATTERN_IDS]);

  for (const id of ids) {
    const pattern = SPELLING_PATTERNS[id];
    assert.equal(pattern.id, id, `Pattern "${id}" id field must match the key.`);
    assert.equal(typeof pattern.title, 'string');
    assert.ok(pattern.title.length > 0);
    assert.equal(typeof pattern.rule, 'string');
    assert.ok(pattern.rule.length > 0);
    assert.ok(Array.isArray(pattern.examples));
    assert.ok(pattern.examples.length >= 3, `Pattern "${id}" must include at least 3 examples.`);
    assert.ok(Array.isArray(pattern.traps));
    assert.ok(pattern.traps.length >= 1, `Pattern "${id}" must include at least 1 trap.`);
    assert.ok(['y3-4', 'y5-6'].includes(pattern.curriculumBand), `Pattern "${id}" uses an invalid curriculumBand.`);
    assert.ok(Array.isArray(pattern.promptTypes));
    assert.deepEqual([...pattern.promptTypes].sort(), ['classify', 'detect-error', 'explain', 'spell']);
  }
});

test('SPELLING_PATTERNS covers the 15 canonical KS2 patterns called out in the plan', () => {
  const expected = [
    'suffix-tion',
    'suffix-sion',
    'suffix-cian',
    'suffix-ous',
    'suffix-ly',
    'suffix-able-ible',
    'silent-letter',
    'i-before-e',
    'double-consonant',
    'prefix-un-in-im',
    'prefix-pre-re-de',
    'homophone',
    'root-graph-scribe',
    'root-port-spect',
    'exception-word',
  ];
  assert.deepEqual([...SPELLING_PATTERN_IDS].sort(), [...expected].sort());
});

test('SPELLING_PATTERNS is frozen so consumers cannot mutate a shared record', () => {
  assert.ok(Object.isFrozen(SPELLING_PATTERNS));
  assert.ok(Object.isFrozen(SPELLING_PATTERNS['suffix-tion']));
  assert.ok(Object.isFrozen(SPELLING_PATTERNS['suffix-tion'].examples));
});

test('service-contract re-exports reach the same registry', () => {
  assert.equal(SERVICE_CONTRACT_PATTERNS, SPELLING_PATTERNS);
  assert.equal(SERVICE_CONTRACT_PATTERN_IDS, SPELLING_PATTERN_IDS);
  assert.equal(SERVICE_CONTRACT_COMPUTE, computeLaunchedPatternIds);
  assert.equal(SERVICE_CONTRACT_IS_PATTERN_ELIGIBLE, isPatternEligibleSlug);
});

test('every core word in the seeded bundle has at least one patternId or exception tag', () => {
  const validation = validateSpellingContentBundle(SEEDED_SPELLING_CONTENT_BUNDLE);
  assert.equal(validation.ok, true, `validation errors: ${JSON.stringify(validation.errors, null, 2)}`);

  const coreWords = validation.bundle.draft.words.filter((word) => word.spellingPool === 'core');
  assert.ok(coreWords.length > 0);
  for (const word of coreWords) {
    const hasPatternId = Array.isArray(word.patternIds) && word.patternIds.length > 0;
    const exceptionTag = word.tags.includes('exception-word') || word.tags.includes('statutory-exception');
    assert.ok(
      hasPatternId || exceptionTag,
      `Core word "${word.slug}" must carry a patternId or exception-word tag.`,
    );
  }
});

test('every patternId on a core word resolves to a registered pattern', () => {
  const validation = validateSpellingContentBundle(SEEDED_SPELLING_CONTENT_BUNDLE);
  const coreWords = validation.bundle.draft.words.filter((word) => word.spellingPool === 'core');
  for (const word of coreWords) {
    for (const patternId of word.patternIds) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(SPELLING_PATTERNS, patternId),
        `Word "${word.slug}" carries unknown patternId "${patternId}".`,
      );
    }
  }
});

test('a multi-pattern word retains all registered patternIds through normalisation', () => {
  // Simulate a multi-pattern tag explicitly (e.g., `competition` → both
  // suffix-tion and a future root-compete pattern). We use two registered
  // ids to stay within the current registry.
  const broken = cloneSerialisable(SEEDED_SPELLING_CONTENT_BUNDLE);
  const target = broken.draft.words.find((word) => word.slug === 'competition');
  assert.ok(target, 'Fixture must include the competition word.');
  target.patternIds = ['suffix-tion', 'double-consonant'];
  const validation = validateSpellingContentBundle(broken);
  assert.equal(validation.ok, true);
  const normalised = validation.bundle.draft.words.find((word) => word.slug === 'competition');
  assert.deepEqual([...normalised.patternIds].sort(), ['double-consonant', 'suffix-tion']);
});

test('validation fails when a core word has empty patternIds and no exception-word tag', () => {
  const broken = cloneSerialisable(SEEDED_SPELLING_CONTENT_BUNDLE);
  const target = broken.draft.words.find((word) => word.slug === 'nation' || word.slug === 'mention');
  assert.ok(target, 'Fixture must include at least one pattern-tagged word.');
  target.patternIds = [];
  target.tags = target.tags.filter((tag) => tag !== 'exception-word' && tag !== 'statutory-exception');

  const validation = validateSpellingContentBundle(broken);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.code === 'missing_pattern_coverage'));
});

test('exception-word tag satisfies the coverage validator without a patternId', () => {
  const broken = cloneSerialisable(SEEDED_SPELLING_CONTENT_BUNDLE);
  const target = broken.draft.words.find((word) => word.slug === 'mention');
  assert.ok(target);
  target.patternIds = [];
  target.tags = [...target.tags.filter((tag) => tag !== 'exception-word' && tag !== 'statutory-exception'), 'exception-word'];

  const validation = validateSpellingContentBundle(broken);
  assert.equal(validation.ok, true, `errors: ${JSON.stringify(validation.errors)}`);
});

test('statutory-exception tag also satisfies the coverage validator', () => {
  const broken = cloneSerialisable(SEEDED_SPELLING_CONTENT_BUNDLE);
  const target = broken.draft.words.find((word) => word.slug === 'mention');
  target.patternIds = [];
  target.tags = [...target.tags.filter((tag) => tag !== 'exception-word' && tag !== 'statutory-exception'), 'statutory-exception'];

  const validation = validateSpellingContentBundle(broken);
  assert.equal(validation.ok, true);
});

test('validator emits a warning (not a failure) for patterns below the launch threshold', () => {
  const validation = validateSpellingContentBundle(SEEDED_SPELLING_CONTENT_BUNDLE);
  assert.equal(validation.ok, true);
  const belowThreshold = validation.warnings.filter((warning) => warning.code === 'pattern_below_launch_threshold');
  assert.ok(belowThreshold.length > 0, 'Expected some patterns to trip the ≥4 warning on the seed.');
  for (const warning of belowThreshold) {
    assert.equal(warning.severity, 'warn');
    assert.match(warning.path, /^patterns\./);
    assert.match(warning.message, /below the launch threshold of 4/);
  }
});

test('PATTERN_LAUNCH_THRESHOLD is the documented ≥4 floor', () => {
  assert.equal(PATTERN_LAUNCH_THRESHOLD, 4);
});

test('computeLaunchedPatternIds includes patterns with at least 4 tagged core words', () => {
  const patternIdsBySlug = {
    a: ['suffix-tion'],
    b: ['suffix-tion'],
    c: ['suffix-tion'],
    d: ['suffix-tion'],
    e: ['suffix-sion'],
  };
  const launched = computeLaunchedPatternIds(patternIdsBySlug);
  assert.ok(launched.includes('suffix-tion'));
  assert.ok(!launched.includes('suffix-sion'));
});

test('computeLaunchedPatternIds tolerates garbage input and returns an empty array', () => {
  assert.deepEqual(computeLaunchedPatternIds(null), []);
  assert.deepEqual(computeLaunchedPatternIds(undefined), []);
  assert.deepEqual(computeLaunchedPatternIds({}), []);
  assert.deepEqual(computeLaunchedPatternIds({ a: 'not an array' }), []);
  assert.deepEqual(computeLaunchedPatternIds({ a: [null, 42, ''] }), []);
});

test('computeLaunchedPatternIds honours a custom threshold', () => {
  const patternIdsBySlug = {
    a: ['suffix-tion'],
    b: ['suffix-tion'],
  };
  assert.deepEqual(computeLaunchedPatternIds(patternIdsBySlug, 2), ['suffix-tion']);
  assert.deepEqual(computeLaunchedPatternIds(patternIdsBySlug, 3), []);
});

test('computeLaunchedPatternIds preserves registry order', () => {
  const allSlugs = {};
  for (const [i, id] of SPELLING_PATTERN_IDS.entries()) {
    // 4 words per pattern so every pattern qualifies.
    for (let k = 0; k < 4; k += 1) {
      allSlugs[`${id}-slug-${k}`] = [id];
    }
  }
  const launched = computeLaunchedPatternIds(allSlugs);
  assert.deepEqual(launched, [...SPELLING_PATTERN_IDS]);
});

test('isPatternEligibleSlug guards against missing pattern, extra-pool, and orphan slugs', () => {
  const wordBySlug = {
    nation: { slug: 'nation', spellingPool: 'core' },
    mollusc: { slug: 'mollusc', spellingPool: 'extra' },
  };
  // Happy path — registered pattern, core-pool slug present.
  assert.equal(isPatternEligibleSlug('nation', 'suffix-tion', wordBySlug), true);
  // Extra-pool never qualifies.
  assert.equal(isPatternEligibleSlug('mollusc', 'suffix-tion', wordBySlug), false);
  // Orphan slug — not in wordBySlug.
  assert.equal(isPatternEligibleSlug('unknown', 'suffix-tion', wordBySlug), false);
  // Missing pattern id.
  assert.equal(isPatternEligibleSlug('nation', 'no-such-pattern', wordBySlug), false);
  // Garbage inputs.
  assert.equal(isPatternEligibleSlug(null, 'suffix-tion', wordBySlug), false);
  assert.equal(isPatternEligibleSlug('nation', null, wordBySlug), false);
  assert.equal(isPatternEligibleSlug('nation', 'suffix-tion', null), false);
});

test('SPELLING_CONTENT_MODEL_VERSION skips 3 per H7 synthesis', () => {
  assert.equal(SPELLING_CONTENT_MODEL_VERSION, 4);
});

test('normaliser drops unknown patternIds without crashing', () => {
  const broken = cloneSerialisable(SEEDED_SPELLING_CONTENT_BUNDLE);
  const target = broken.draft.words.find((word) => word.slug === 'mention');
  target.patternIds = ['suffix-tion', 'no-such-pattern', ''];

  const validation = validateSpellingContentBundle(broken);
  assert.equal(validation.ok, true);
  const normalised = validation.bundle.draft.words.find((word) => word.slug === 'mention');
  assert.deepEqual(normalised.patternIds, ['suffix-tion']);
});
