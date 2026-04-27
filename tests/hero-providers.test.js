import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getProvider,
  runProvider,
  registeredSubjectIds,
  grammarProvider,
  punctuationProvider,
  spellingProvider,
} from '../worker/src/hero/providers/index.js';

import { validateTaskEnvelope } from '../shared/hero/task-envelope.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
function loadFixture(name) {
  const raw = readFileSync(resolve(__dirname, 'fixtures', 'hero', `${name}.json`), 'utf8');
  return JSON.parse(raw);
}

// ── Provider registry ─────────────────────────────────────────────

test('registry: getProvider returns function for spelling/grammar/punctuation', () => {
  assert.equal(typeof getProvider('grammar'), 'function');
  assert.equal(typeof getProvider('punctuation'), 'function');
  assert.equal(typeof getProvider('spelling'), 'function');
});

test('registry: getProvider returns null for arithmetic/reasoning/reading', () => {
  assert.equal(getProvider('arithmetic'), null);
  assert.equal(getProvider('reasoning'), null);
  assert.equal(getProvider('reading'), null);
});

test('registry: runProvider returns null for unregistered subjects', () => {
  assert.equal(runProvider('arithmetic', {}), null);
  assert.equal(runProvider('reading', {}), null);
});

test('registry: registeredSubjectIds lists exactly three subjects', () => {
  const ids = registeredSubjectIds();
  assert.equal(ids.length, 3);
  assert.ok(ids.includes('grammar'));
  assert.ok(ids.includes('punctuation'));
  assert.ok(ids.includes('spelling'));
});

// ── Grammar provider ──────────────────────────────────────────────

test('grammar: weak concepts emit weak-repair envelope', () => {
  const fixture = loadFixture('fresh-three-subjects');
  const result = grammarProvider(fixture.grammar);
  assert.equal(result.subjectId, 'grammar');
  assert.equal(result.available, true);
  assert.ok(result.signals.weakCount > 0);
  const weakRepair = result.envelopes.find((e) => e.intent === 'weak-repair');
  assert.ok(weakRepair, 'should have a weak-repair envelope');
  assert.equal(weakRepair.launcher, 'trouble-practice');
  assert.equal(weakRepair.subjectId, 'grammar');
});

test('grammar: due concepts emit due-review envelope', () => {
  const fixture = loadFixture('fresh-three-subjects');
  const result = grammarProvider(fixture.grammar);
  assert.ok(result.signals.dueCount > 0);
  const dueReview = result.envelopes.find((e) => e.intent === 'due-review');
  assert.ok(dueReview, 'should have a due-review envelope');
  assert.equal(dueReview.launcher, 'smart-practice');
});

test('grammar: secured concepts with consolidating confidence emit retention-after-secure', () => {
  const fixture = loadFixture('fresh-three-subjects');
  const result = grammarProvider(fixture.grammar);
  // The fixture has adjective_comparative with status:secured, confidence:consolidating
  const retention = result.envelopes.find((e) => e.intent === 'retention-after-secure');
  assert.ok(retention, 'should have retention-after-secure envelope');
  assert.equal(retention.launcher, 'smart-practice');
  assert.ok(result.signals.retentionDueCount > 0);
});

test('grammar: absent signals falls back to generic smart-practice', () => {
  // Construct a read model with stats but no specific signals triggering envelopes
  const emptyReadModel = {
    stats: {
      concepts: { total: 10, new: 10, learning: 0, weak: 0, due: 0, secured: 0 },
    },
    analytics: { concepts: [] },
  };
  const result = grammarProvider(emptyReadModel);
  assert.equal(result.available, true);
  assert.equal(result.envelopes.length, 1);
  assert.equal(result.envelopes[0].intent, 'due-review');
  assert.equal(result.envelopes[0].launcher, 'smart-practice');
  assert.ok(result.envelopes[0].reasonTags.includes('generic-fallback'));
});

test('grammar: totally missing stats returns available:false', () => {
  const result = grammarProvider({});
  assert.equal(result.available, false);
  assert.equal(result.unavailableReason, 'missing-hero-readable-signals');
  assert.deepEqual(result.envelopes, []);
});

test('grammar: null input returns available:false', () => {
  const result = grammarProvider(null);
  assert.equal(result.available, false);
  assert.equal(result.unavailableReason, 'missing-hero-readable-signals');
});

test('grammar: breadth-maintenance mini-test when secured >= 3', () => {
  const fixture = loadFixture('all-ready-balanced');
  const result = grammarProvider(fixture.grammar);
  const breadth = result.envelopes.find((e) => e.intent === 'breadth-maintenance');
  assert.ok(breadth, 'should have breadth-maintenance envelope when secureCount >= 3');
  assert.equal(breadth.launcher, 'mini-test');
});

// ── Punctuation provider ──────────────────────────────────────────

test('punctuation: due items emit due-review envelope', () => {
  const fixture = loadFixture('fresh-three-subjects');
  const result = punctuationProvider(fixture.punctuation);
  assert.equal(result.subjectId, 'punctuation');
  assert.equal(result.available, true);
  assert.ok(result.signals.dueCount > 0);
  const dueReview = result.envelopes.find((e) => e.intent === 'due-review');
  assert.ok(dueReview, 'should have a due-review envelope');
  assert.equal(dueReview.launcher, 'smart-practice');
});

test('punctuation: weak items emit weak-repair envelope', () => {
  const fixture = loadFixture('fresh-three-subjects');
  const result = punctuationProvider(fixture.punctuation);
  assert.ok(result.signals.weakCount > 0);
  const weakRepair = result.envelopes.find((e) => e.intent === 'weak-repair');
  assert.ok(weakRepair, 'should have a weak-repair envelope');
  assert.equal(weakRepair.launcher, 'trouble-practice');
});

test('punctuation: null read model returns available:false', () => {
  const result = punctuationProvider(null);
  assert.equal(result.available, false);
  assert.equal(result.unavailableReason, 'punctuation-not-available');
  assert.deepEqual(result.envelopes, []);
});

test('punctuation: availability not ready returns available:false', () => {
  const result = punctuationProvider({
    availability: { status: 'unavailable', code: 'content-not-loaded', message: 'Not ready' },
    stats: { total: 10, secure: 2, due: 3, fresh: 3, weak: 1, attempts: 20, correct: 15, accuracy: 75 },
  });
  assert.equal(result.available, false);
  assert.equal(result.unavailableReason, 'punctuation-not-available');
});

test('punctuation: absent signals falls back to generic', () => {
  const result = punctuationProvider({
    availability: { status: 'ready', code: null, message: '' },
    stats: { total: 10, secure: 0, due: 0, fresh: 10, weak: 0, attempts: 0, correct: 0, accuracy: 0 },
    analytics: { skillRows: [] },
  });
  assert.equal(result.available, true);
  assert.equal(result.envelopes.length, 1);
  assert.ok(result.envelopes[0].reasonTags.includes('generic-fallback'));
});

test('punctuation: breadth-maintenance gps-check when secured >= 3', () => {
  const fixture = loadFixture('all-ready-balanced');
  const result = punctuationProvider(fixture.punctuation);
  const breadth = result.envelopes.find((e) => e.intent === 'breadth-maintenance');
  assert.ok(breadth, 'should have breadth-maintenance envelope');
  assert.equal(breadth.launcher, 'gps-check');
});

// ── Spelling provider ─────────────────────────────────────────────

test('spelling: due words emit due-review envelope', () => {
  const fixture = loadFixture('fresh-three-subjects');
  const result = spellingProvider(fixture.spelling);
  assert.equal(result.subjectId, 'spelling');
  assert.equal(result.available, true);
  assert.ok(result.signals.dueCount > 0);
  const dueReview = result.envelopes.find((e) => e.intent === 'due-review');
  assert.ok(dueReview, 'should have a due-review envelope');
  assert.equal(dueReview.launcher, 'smart-practice');
});

test('spelling: trouble words emit weak-repair envelope', () => {
  const fixture = loadFixture('fresh-three-subjects');
  const result = spellingProvider(fixture.spelling);
  assert.ok(result.signals.weakCount > 0);
  const weakRepair = result.envelopes.find((e) => e.intent === 'weak-repair');
  assert.ok(weakRepair, 'should have a weak-repair envelope');
  assert.equal(weakRepair.launcher, 'trouble-practice');
});

test('spelling: post-mega signals emit post-mega-maintenance guardian-check', () => {
  const fixture = loadFixture('spelling-mega-grammar-weak');
  const result = spellingProvider(fixture.spelling);
  assert.equal(result.signals.megaLike, true);
  assert.equal(result.signals.postMegaAvailable, true);
  const maintenance = result.envelopes.find((e) => e.intent === 'post-mega-maintenance');
  assert.ok(maintenance, 'should have post-mega-maintenance envelope');
  assert.equal(maintenance.launcher, 'guardian-check');
});

test('spelling: absent post-mega signals emit only generic Smart Review envelopes', () => {
  // Create a read model with stats but no postMega, no due, no trouble
  const result = spellingProvider({
    stats: {
      core: { total: 100, secure: 40, due: 0, fresh: 50, trouble: 0, attempts: 200, correct: 180, accuracy: 90 },
    },
    postMega: null,
  });
  assert.equal(result.available, true);
  assert.equal(result.signals.megaLike, false);
  assert.equal(result.signals.postMegaAvailable, false);
  // Should only have generic fallback
  assert.equal(result.envelopes.length, 1);
  assert.equal(result.envelopes[0].intent, 'due-review');
  assert.equal(result.envelopes[0].launcher, 'smart-practice');
  assert.ok(result.envelopes[0].reasonTags.includes('generic-fallback'));
});

test('spelling: Mega fixture produces only maintenance envelopes for spelling', () => {
  const fixture = loadFixture('spelling-mega-grammar-weak');
  const result = spellingProvider(fixture.spelling);
  // All envelopes should be post-mega related (since postMegaAvailable is true)
  // The spelling-mega fixture has allWordsMega: true, due: 2, trouble: 1
  assert.ok(result.envelopes.length > 0, 'should have envelopes');
  const maintenanceEnvelopes = result.envelopes.filter(
    (e) => e.intent === 'post-mega-maintenance'
  );
  assert.ok(maintenanceEnvelopes.length > 0, 'should have at least one maintenance envelope');
  // All envelopes should be in the post-mega branch
  for (const env of result.envelopes) {
    assert.ok(
      env.reasonTags.some((t) => t.includes('post-mega') || t.includes('guardian')),
      `envelope ${env.intent} should have post-mega tag, got: ${JSON.stringify(env.reasonTags)}`
    );
  }
});

test('spelling: null stats returns available:false', () => {
  const result = spellingProvider({});
  assert.equal(result.available, false);
  assert.equal(result.unavailableReason, 'missing-hero-readable-signals');
});

// ── Cross-cutting: provider does not mutate input ─────────────────

test('providers do not mutate input read-model objects', () => {
  const fixture = loadFixture('fresh-three-subjects');
  const grammarBefore = JSON.stringify(fixture.grammar);
  const punctuationBefore = JSON.stringify(fixture.punctuation);
  const spellingBefore = JSON.stringify(fixture.spelling);

  grammarProvider(fixture.grammar);
  punctuationProvider(fixture.punctuation);
  spellingProvider(fixture.spelling);

  assert.equal(JSON.stringify(fixture.grammar), grammarBefore, 'grammar read model was mutated');
  assert.equal(JSON.stringify(fixture.punctuation), punctuationBefore, 'punctuation read model was mutated');
  assert.equal(JSON.stringify(fixture.spelling), spellingBefore, 'spelling read model was mutated');
});

// ── Cross-cutting: returns available:false instead of throwing ────

test('providers return available:false with reason instead of throwing on missing fields', () => {
  // Grammar with undefined
  const grammarResult = grammarProvider(undefined);
  assert.equal(grammarResult.available, false);
  assert.equal(typeof grammarResult.unavailableReason, 'string');
  assert.ok(grammarResult.unavailableReason.length > 0);

  // Punctuation with empty object
  const punctuationResult = punctuationProvider({});
  assert.equal(punctuationResult.available, false);

  // Spelling with empty stats
  const spellingResult = spellingProvider({ stats: {} });
  assert.equal(spellingResult.available, false);
});

// ── Cross-cutting: no runtime.js imports ──────────────────────────

test('provider modules do not import runtime.js or any command handler (structural grep)', () => {
  const providerFiles = [
    resolve(__dirname, '..', 'worker', 'src', 'hero', 'providers', 'index.js'),
    resolve(__dirname, '..', 'worker', 'src', 'hero', 'providers', 'grammar.js'),
    resolve(__dirname, '..', 'worker', 'src', 'hero', 'providers', 'punctuation.js'),
    resolve(__dirname, '..', 'worker', 'src', 'hero', 'providers', 'spelling.js'),
  ];
  // Only match actual import statements (lines starting with import), not comments.
  const forbiddenPatterns = [
    /^import\b.*runtime\.js/m,
    /^import\b.*commands\.js/m,
    /^import\b.*engine\.js/m,
    /^import\b.*from\s+['"].*subjects\/.*\/commands/m,
    /^import\b.*from\s+['"].*subjects\/.*\/runtime/m,
    /^import\b.*from\s+['"].*subjects\/.*\/engine/m,
  ];
  for (const filePath of providerFiles) {
    const content = readFileSync(filePath, 'utf8');
    for (const pattern of forbiddenPatterns) {
      assert.ok(
        !pattern.test(content),
        `${filePath} matches forbidden import pattern: ${pattern}`
      );
    }
  }
});

// ── Cross-cutting: all envelopes validate ─────────────────────────

test('each fixture produces valid provider output with valid envelopes', () => {
  const fixtureNames = [
    'fresh-three-subjects',
    'spelling-mega-grammar-weak',
    'all-ready-balanced',
    'punctuation-disabled',
    'zero-eligible-subjects',
  ];

  for (const name of fixtureNames) {
    const fixture = loadFixture(name);
    for (const subjectId of ['grammar', 'punctuation', 'spelling']) {
      const readModel = fixture[subjectId];
      const result = runProvider(subjectId, readModel);
      assert.ok(result, `runProvider('${subjectId}') returned null for fixture ${name}`);
      assert.equal(typeof result.subjectId, 'string', `${name}/${subjectId}: subjectId should be string`);
      assert.equal(typeof result.available, 'boolean', `${name}/${subjectId}: available should be boolean`);
      assert.ok(Array.isArray(result.envelopes), `${name}/${subjectId}: envelopes should be array`);
      assert.ok(result.signals && typeof result.signals === 'object', `${name}/${subjectId}: signals should be object`);

      // Validate each envelope
      for (const envelope of result.envelopes) {
        const { valid, errors } = validateTaskEnvelope(envelope);
        assert.ok(valid, `${name}/${subjectId}: envelope validation failed: ${errors.join(', ')}`);
      }
    }
  }
});

// ── Zero-eligible fixture: all providers return available:false ───

test('zero-eligible fixture: all providers return available:false', () => {
  const fixture = loadFixture('zero-eligible-subjects');

  const grammarResult = grammarProvider(fixture.grammar);
  assert.equal(grammarResult.available, false, 'grammar should be unavailable');
  assert.deepEqual(grammarResult.envelopes, []);

  const punctuationResult = punctuationProvider(fixture.punctuation);
  assert.equal(punctuationResult.available, false, 'punctuation should be unavailable');
  assert.deepEqual(punctuationResult.envelopes, []);

  const spellingResult = spellingProvider(fixture.spelling);
  assert.equal(spellingResult.available, false, 'spelling should be unavailable');
  assert.deepEqual(spellingResult.envelopes, []);
});

// ── Punctuation-disabled fixture ──────────────────────────────────

test('punctuation-disabled fixture: punctuation returns available:false, others work', () => {
  const fixture = loadFixture('punctuation-disabled');

  const punctuationResult = punctuationProvider(fixture.punctuation);
  assert.equal(punctuationResult.available, false);

  const grammarResult = grammarProvider(fixture.grammar);
  assert.equal(grammarResult.available, true);
  assert.ok(grammarResult.envelopes.length > 0);

  const spellingResult = spellingProvider(fixture.spelling);
  assert.equal(spellingResult.available, true);
  assert.ok(spellingResult.envelopes.length > 0);
});

// ── Signal shape completeness ─────────────────────────────────────

test('provider signals always contain all required fields', () => {
  const requiredSignalKeys = ['dueCount', 'weakCount', 'secureCount', 'megaLike', 'postMegaAvailable', 'retentionDueCount'];
  const fixture = loadFixture('fresh-three-subjects');
  for (const subjectId of ['grammar', 'punctuation', 'spelling']) {
    const result = runProvider(subjectId, fixture[subjectId]);
    for (const key of requiredSignalKeys) {
      assert.ok(
        key in result.signals,
        `${subjectId}: signals missing required key '${key}'`
      );
    }
  }
});

// ── Providers use actual read-model field names ───────────────────

test('grammar provider reads stats.concepts counts (actual read-model field)', () => {
  const fixture = loadFixture('fresh-three-subjects');
  const result = grammarProvider(fixture.grammar);
  // stats.concepts has the actual field names: total, new, learning, weak, due, secured
  assert.equal(result.signals.weakCount, fixture.grammar.stats.concepts.weak);
  assert.equal(result.signals.dueCount, fixture.grammar.stats.concepts.due);
  assert.equal(result.signals.secureCount, fixture.grammar.stats.concepts.secured);
});

test('punctuation provider reads stats.due/weak/secure (actual read-model field)', () => {
  const fixture = loadFixture('fresh-three-subjects');
  const result = punctuationProvider(fixture.punctuation);
  assert.equal(result.signals.dueCount, fixture.punctuation.stats.due);
  assert.equal(result.signals.weakCount, fixture.punctuation.stats.weak);
  assert.equal(result.signals.secureCount, fixture.punctuation.stats.secure);
});

test('spelling provider reads stats.core pool (actual read-model field)', () => {
  const fixture = loadFixture('fresh-three-subjects');
  const result = spellingProvider(fixture.spelling);
  assert.equal(result.signals.dueCount, fixture.spelling.stats.core.due);
  assert.equal(result.signals.weakCount, fixture.spelling.stats.core.trouble);
  assert.equal(result.signals.secureCount, fixture.spelling.stats.core.secure);
});
