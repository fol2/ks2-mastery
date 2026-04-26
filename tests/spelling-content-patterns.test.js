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
  SPELLING_SERVICE_STATE_VERSION,
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
    // exception-word is a catch-all tag with empty promptTypes (non-promptable);
    // every other pattern ships with the full set of four prompt types pre-U11.
    if (id === 'exception-word') {
      assert.deepEqual([...pattern.promptTypes], []);
    } else {
      assert.deepEqual([...pattern.promptTypes].sort(), ['classify', 'detect-error', 'explain', 'spell']);
    }
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
  // `accidentally` is a legitimate multi-pattern core word in the seed:
  // it carries BOTH `double-consonant` (cc) AND `suffix-ly`. This test
  // asserts that normalisation preserves both registered patterns rather
  // than collapsing to a single id — a regression here would hide the
  // double-consonant clue from U11 Pattern Quest for this word.
  const bundle = cloneSerialisable(SEEDED_SPELLING_CONTENT_BUNDLE);
  const target = bundle.draft.words.find((word) => word.slug === 'accidentally');
  assert.ok(target, 'Fixture must include the accidentally word.');
  assert.deepEqual(
    [...target.patternIds].sort(),
    ['double-consonant', 'suffix-ly'],
    'accidentally must ship as a genuine multi-pattern word in the seed.',
  );
  const validation = validateSpellingContentBundle(bundle);
  assert.equal(validation.ok, true);
  const normalised = validation.bundle.draft.words.find((word) => word.slug === 'accidentally');
  assert.deepEqual([...normalised.patternIds].sort(), ['double-consonant', 'suffix-ly']);
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
  // exception-word is a registry-only catch-all with empty promptTypes
  // (F5) and is never launched, so the expected launched list is the
  // registry minus that entry.
  const expected = [...SPELLING_PATTERN_IDS].filter((id) => {
    const pattern = SPELLING_PATTERNS[id];
    return Array.isArray(pattern.promptTypes) && pattern.promptTypes.length > 0;
  });
  assert.deepEqual(launched, expected);
});

test('isPatternEligibleSlug guards against missing pattern, extra-pool, and orphan slugs', () => {
  const wordBySlug = {
    nation: { slug: 'nation', spellingPool: 'core', patternIds: ['suffix-tion'] },
    mollusc: { slug: 'mollusc', spellingPool: 'extra', patternIds: ['suffix-tion'] },
  };
  // Happy path — registered pattern, core-pool slug present, patternIds carries it.
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

test('isPatternEligibleSlug rejects words whose patternIds do not include the requested pattern', () => {
  // F3 fix: a word whose `patternIds` does NOT include the requested pattern
  // must not be eligible. Otherwise a content hot-swap that retags a word
  // (say, drops `suffix-tion` from `nation` but leaves the slug and the
  // registry pattern alive) would still pass as eligible and feed the
  // learner a mismatched quest.
  const wordBySlug = {
    nation: { slug: 'nation', spellingPool: 'core', patternIds: ['suffix-tion'] },
    retagged: { slug: 'retagged', spellingPool: 'core', patternIds: ['suffix-ous'] },
    empty: { slug: 'empty', spellingPool: 'core', patternIds: [] },
    missing: { slug: 'missing', spellingPool: 'core' },
    malformed: { slug: 'malformed', spellingPool: 'core', patternIds: 'suffix-tion' },
  };
  assert.equal(isPatternEligibleSlug('nation', 'suffix-tion', wordBySlug), true);
  // Requested pattern not among the slug's patternIds.
  assert.equal(isPatternEligibleSlug('retagged', 'suffix-tion', wordBySlug), false);
  // Empty patternIds array.
  assert.equal(isPatternEligibleSlug('empty', 'suffix-tion', wordBySlug), false);
  // patternIds field missing entirely.
  assert.equal(isPatternEligibleSlug('missing', 'suffix-tion', wordBySlug), false);
  // patternIds not an array (malformed persisted blob).
  assert.equal(isPatternEligibleSlug('malformed', 'suffix-tion', wordBySlug), false);
});

test('computeLaunchedPatternIds excludes empty-promptTypes catch-alls even above threshold', () => {
  // F5: exception-word ships with empty promptTypes — it must never appear
  // in the launched subset regardless of how many core words carry the tag.
  const patternIdsBySlug = Object.fromEntries(
    Array.from({ length: 10 }, (_, index) => [`slug-${index}`, ['exception-word']]),
  );
  const launched = computeLaunchedPatternIds(patternIdsBySlug);
  assert.ok(!launched.includes('exception-word'));
});

test('validator suppresses pattern_below_launch_threshold warnings for empty-promptTypes catch-alls', () => {
  // F5: exception-word has empty promptTypes. It is registry-only and must
  // never trip the below-threshold warning — that would be permanent noise.
  const validation = validateSpellingContentBundle(SEEDED_SPELLING_CONTENT_BUNDLE);
  const warningIds = validation.warnings
    .filter((warning) => warning.code === 'pattern_below_launch_threshold')
    .map((warning) => warning.path);
  assert.ok(!warningIds.includes('patterns.exception-word'));
});

test('H7 convention: content model even, service state odd', () => {
  // The even/odd split (content-model EVEN, service-state ODD) rules out
  // accidental collisions by construction. See U10 adversarial synthesis
  // in the P2 plan (§U10). A regression here means a future bump pushed
  // both counters onto the same parity lane and the triage cost blows a
  // whole day re-establishing which counter moved.
  assert.equal(SPELLING_CONTENT_MODEL_VERSION % 2, 0, 'content model must be even');
  assert.equal(SPELLING_SERVICE_STATE_VERSION % 2, 1, 'service state must be odd');
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
