import test from 'node:test';
import assert from 'node:assert/strict';

import {
  definePunctuationTemplate,
  expandDslTemplates,
} from '../shared/punctuation/template-dsl.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeValidSpec(overrides = {}) {
  return {
    id: 'test_dsl_basic',
    familyId: 'gen_sentence_endings_insert',
    mode: 'insert',
    skillIds: ['sentence_endings'],
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    misconceptionTags: ['endmarks.terminal_missing'],
    readiness: ['insertion'],
    slots: {
      subject: ['the dog', 'the cat', 'the bird'],
      verb: ['runs', 'sits', 'flies'],
      ending: ['.', '!', '?'],
    },
    build: ({ subject, verb, ending }) => ({
      prompt: `Add the correct ending.`,
      stem: `${subject} ${verb}`,
      model: `${subject.charAt(0).toUpperCase() + subject.slice(1)} ${verb}${ending}`,
    }),
    tests: {
      accept: ['The dog runs.', 'The cat sits!'],
      reject: ['the dog runs', 'The cat sits'],
    },
    ...overrides,
  };
}

// ─── definePunctuationTemplate ─────────────────────────────────────────────────

test('definePunctuationTemplate: returns a frozen object for valid spec', () => {
  const spec = makeValidSpec();
  const result = definePunctuationTemplate(spec);
  assert.ok(Object.isFrozen(result));
  assert.equal(result.id, 'test_dsl_basic');
  assert.equal(result.familyId, 'gen_sentence_endings_insert');
});

test('definePunctuationTemplate: throws on missing required field', () => {
  for (const field of ['id', 'familyId', 'mode', 'skillIds', 'clusterId', 'rewardUnitId', 'misconceptionTags', 'readiness', 'slots', 'build', 'tests']) {
    const spec = makeValidSpec();
    delete spec[field];
    assert.throws(
      () => definePunctuationTemplate(spec),
      (err) => err.message.includes(field),
      `Expected throw mentioning "${field}"`,
    );
  }
});

test('definePunctuationTemplate: throws on empty slots object', () => {
  assert.throws(
    () => definePunctuationTemplate(makeValidSpec({ slots: {} })),
    /slots.*must have at least one key/,
  );
});

test('definePunctuationTemplate: throws on empty slot array', () => {
  assert.throws(
    () => definePunctuationTemplate(makeValidSpec({ slots: { subject: [] } })),
    /slot "subject" must be a non-empty array/,
  );
});

// ─── expandDslTemplates — 3 slots × 3 values = 27 expanded templates ──────────

test('expandDslTemplates: 3 slots × 3 values produces 27 distinct templates', () => {
  const spec = definePunctuationTemplate(makeValidSpec());
  const templates = expandDslTemplates([spec]);

  assert.equal(templates.length, 27);
  assert.ok(Object.isFrozen(templates));

  // All templateIds are unique
  const ids = templates.map((t) => t.templateId);
  assert.equal(new Set(ids).size, 27, 'All templateIds must be unique');

  // Each template has the correct shape
  for (const t of templates) {
    assert.ok(Object.isFrozen(t));
    assert.equal(typeof t.prompt, 'string');
    assert.equal(typeof t.stem, 'string');
    assert.equal(typeof t.model, 'string');
    assert.ok(t.model.length > 0);
    assert.ok(t.templateId.startsWith('test_dsl_basic_'));
    assert.deepEqual(t.skillIds, ['sentence_endings']);
    assert.equal(t.clusterId, 'endmarks');
    assert.deepEqual(t.misconceptionTags, ['endmarks.terminal_missing']);
    assert.deepEqual(t.readiness, ['insertion']);
    assert.deepEqual(t.tests, { accept: ['The dog runs.', 'The cat sits!'], reject: ['the dog runs', 'The cat sits'] });
  }
});

test('expandDslTemplates: build() receives correct slot values', () => {
  const received = [];
  const spec = definePunctuationTemplate(makeValidSpec({
    id: 'test_slot_passthrough',
    slots: { a: ['x', 'y'], b: ['1', '2'] },
    build: (slots) => {
      received.push({ ...slots });
      return { prompt: 'p', stem: 's', model: `M:${slots.a}${slots.b}` };
    },
  }));
  expandDslTemplates([spec]);

  // Alphabetical key sort means 'a' varies in outer loop, 'b' in inner
  assert.equal(received.length, 4);
  assert.deepEqual(received[0], { a: 'x', b: '1' });
  assert.deepEqual(received[1], { a: 'x', b: '2' });
  assert.deepEqual(received[2], { a: 'y', b: '1' });
  assert.deepEqual(received[3], { a: 'y', b: '2' });
});

test('expandDslTemplates: single slot value produces 1 template', () => {
  const spec = definePunctuationTemplate(makeValidSpec({
    id: 'test_single',
    slots: { word: ['hello'] },
    build: ({ word }) => ({ prompt: 'p', stem: word, model: `${word}.` }),
  }));
  const templates = expandDslTemplates([spec]);
  assert.equal(templates.length, 1);
  assert.equal(templates[0].stem, 'hello');
  assert.equal(templates[0].model, 'hello.');
});

// ─── Validation in expansion ───────────────────────────────────────────────────

test('expandDslTemplates: throws when build() returns object without model', () => {
  const spec = definePunctuationTemplate(makeValidSpec({
    id: 'test_no_model',
    slots: { x: ['a'] },
    build: () => ({ prompt: 'p', stem: 's' }),
  }));
  assert.throws(
    () => expandDslTemplates([spec]),
    /must return a "model" string.*test_no_model/,
  );
});

test('expandDslTemplates: throws on duplicate variant signatures', () => {
  // Two DSL definitions with the same id and same slot values → same templateId → collision
  const specA = definePunctuationTemplate(makeValidSpec({
    id: 'test_dup',
    slots: { x: ['val'] },
    build: () => ({ prompt: 'same', stem: 'same', model: 'Same.' }),
  }));
  const specB = definePunctuationTemplate(makeValidSpec({
    id: 'test_dup',
    slots: { x: ['val'] },
    build: () => ({ prompt: 'same', stem: 'same', model: 'Same.' }),
  }));

  // Same id + same slots → same templateId → duplicate variant signature
  assert.throws(
    () => expandDslTemplates([specA, specB]),
    /duplicate variant signature/,
  );
});

// ─── Integration: expanded template compatible with buildGeneratedItem ──────────

test('expanded template has fields compatible with GENERATED_TEMPLATE_BANK shape', () => {
  const spec = definePunctuationTemplate(makeValidSpec({
    id: 'test_compat',
    slots: { word: ['lighthouse'] },
    build: ({ word }) => ({
      prompt: 'Correct the sentence.',
      stem: `the ${word} shone brightly`,
      model: `The ${word} shone brightly.`,
      accepted: [`The ${word} shone brightly.`, `The ${word} shone brightly!`],
      validator: { type: 'exact' },
      rubric: { type: 'terminal_present' },
      explanation: 'Capitalise and add full stop.',
    }),
  }));

  const templates = expandDslTemplates([spec]);
  assert.equal(templates.length, 1);

  const t = templates[0];
  // Fields that buildGeneratedItem expects on template objects:
  assert.equal(t.prompt, 'Correct the sentence.');
  assert.equal(t.stem, 'the lighthouse shone brightly');
  assert.equal(t.model, 'The lighthouse shone brightly.');
  assert.deepEqual(t.accepted, ['The lighthouse shone brightly.', 'The lighthouse shone brightly!']);
  assert.deepEqual(t.validator, { type: 'exact' });
  assert.deepEqual(t.rubric, { type: 'terminal_present' });
  assert.equal(t.explanation, 'Capitalise and add full stop.');
  assert.deepEqual(t.skillIds, ['sentence_endings']);
  assert.equal(t.clusterId, 'endmarks');
  assert.deepEqual(t.misconceptionTags, ['endmarks.terminal_missing']);
  assert.deepEqual(t.readiness, ['insertion']);
  assert.ok(t.templateId.startsWith('test_compat_'));
});

// ─── Integration: expanded templates work with pickTemplate ─────────────────────

test('expanded templates fed to pickTemplate produce selection from pool', async () => {
  // Dynamically import pickTemplate logic equivalent: just verify the expanded
  // templates array works when indexed deterministically
  const spec = definePunctuationTemplate(makeValidSpec({
    id: 'test_pick',
    slots: { animal: ['fox', 'owl', 'bat'] },
    build: ({ animal }) => ({
      prompt: 'Capitalise and punctuate.',
      stem: `the ${animal} ran`,
      model: `The ${animal} ran.`,
    }),
  }));

  const templates = expandDslTemplates([spec]);
  assert.equal(templates.length, 3);

  // Simulate pickTemplate: given a seed, pick via modulo
  function simplePick(pool, seed, familyId, variantIndex) {
    let hash = 2166136261;
    const text = `${seed}:${familyId}`;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    hash = hash >>> 0;
    const offset = hash % pool.length;
    return pool[(offset + variantIndex) % pool.length];
  }

  const picked0 = simplePick(templates, 'seed42', 'gen_sentence_endings_insert', 0);
  const picked1 = simplePick(templates, 'seed42', 'gen_sentence_endings_insert', 1);
  const picked2 = simplePick(templates, 'seed42', 'gen_sentence_endings_insert', 2);

  // All picks are valid templates from the pool
  assert.ok(templates.includes(picked0));
  assert.ok(templates.includes(picked1));
  assert.ok(templates.includes(picked2));

  // At least verifies that different variantIndex gives coverage across pool
  const pickedSet = new Set([picked0.templateId, picked1.templateId, picked2.templateId]);
  assert.ok(pickedSet.size >= 2, 'Different variant indices should pick different templates (with high probability)');
});

test('expandDslTemplates: build() can override inherited fields', () => {
  const spec = definePunctuationTemplate(makeValidSpec({
    id: 'test_override',
    skillIds: ['sentence_endings'],
    clusterId: 'endmarks',
    misconceptionTags: ['endmarks.terminal_missing'],
    readiness: ['insertion'],
    slots: { x: ['a'] },
    build: () => ({
      prompt: 'p',
      stem: 's',
      model: 'M.',
      skillIds: ['custom_skill'],
      clusterId: 'custom_cluster',
      misconceptionTags: ['custom.tag'],
      readiness: ['transfer'],
    }),
  }));

  const templates = expandDslTemplates([spec]);
  assert.deepEqual(templates[0].skillIds, ['custom_skill']);
  assert.equal(templates[0].clusterId, 'custom_cluster');
  assert.deepEqual(templates[0].misconceptionTags, ['custom.tag']);
  assert.deepEqual(templates[0].readiness, ['transfer']);
});
