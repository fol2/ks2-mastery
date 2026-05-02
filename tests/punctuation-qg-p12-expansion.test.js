import test from 'node:test';
import assert from 'node:assert/strict';

import { PUNCTUATION_CONTENT_MANIFEST, PUNCTUATION_ITEMS, PUNCTUATION_MANIFEST_VALIDATION } from '../shared/punctuation/content.js';
import { GENERATED_TEMPLATE_BANK, PRODUCTION_DEPTH, createPunctuationRuntimeManifest } from '../shared/punctuation/generators.js';
import { markPunctuationAnswer } from '../shared/punctuation/marking.js';
import { createPunctuationService } from '../shared/punctuation/service.js';
import { PUNCTUATION_CURRENT_RELEASE_ID } from '../src/subjects/punctuation/service-contract.js';

function answerForItem(item) {
  if (item.mode === 'choose' || item.inputKind === 'choice') return { choiceIndex: item.correctIndex };
  return { typed: item.model };
}

function norm(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
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
  const service = createPunctuationService({ repository: createMemoryRepository(), random, now: () => now });
  const learnerId = `p12-test-learner-${seed}`;
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

test('P12 exposes a 3000+ Punctuation QG runtime pool', () => {
  const runtime = createPunctuationRuntimeManifest({ manifest: PUNCTUATION_CONTENT_MANIFEST, generatedPerFamily: PRODUCTION_DEPTH });
  const fixed = runtime.items.filter((item) => item.source !== 'generated');
  const generated = runtime.items.filter((item) => item.source === 'generated');

  assert.equal(PUNCTUATION_MANIFEST_VALIDATION.ok, true);
  assert.equal(PUNCTUATION_CURRENT_RELEASE_ID, 'punctuation-qg-p12-3000-2026-05-02');
  assert.equal(PRODUCTION_DEPTH, 100);
  assert.ok(fixed.length >= 500, `fixed=${fixed.length}`);
  assert.ok(generated.length >= 2500, `generated=${generated.length}`);
  assert.ok(runtime.items.length >= 3000, `runtime=${runtime.items.length}`);
});

test('P12 keeps one hundred unique templates in every generated family', () => {
  assert.equal(Object.keys(GENERATED_TEMPLATE_BANK).length, 28);
  for (const [familyId, templates] of Object.entries(GENERATED_TEMPLATE_BANK)) {
    assert.equal(templates.length, 100, `${familyId} template count`);
    assert.equal(new Set(templates.map((template) => norm(template.stem))).size, 100, `${familyId} stem variety`);
    assert.equal(new Set(templates.map((template) => norm(template.model))).size, 100, `${familyId} model variety`);
  }
});

test('P12 model answers and fixed-choice answers mark correctly', () => {
  const runtime = createPunctuationRuntimeManifest({ manifest: PUNCTUATION_CONTENT_MANIFEST, generatedPerFamily: PRODUCTION_DEPTH });
  for (const item of runtime.items) {
    const result = markPunctuationAnswer({ item, answer: answerForItem(item) });
    assert.equal(result.correct, true, `${item.id} should mark its model/correct choice as correct: ${result.note || ''}`);
  }
});

test('P12 adds at least 350 new fixed choice items across all published skills', () => {
  const additions = PUNCTUATION_ITEMS.filter((item) => item.id?.startsWith('fx12_'));
  assert.ok(additions.length >= 350, `fx12 additions=${additions.length}`);
  const skills = new Set(additions.flatMap((item) => item.skillIds || []));
  assert.equal(skills.size, 14);
});

test('P12 Smart sessions surface varied items without immediate repeats', () => {
  const sessions = Array.from({ length: 24 }, (_, seed) => simulateSession({ mode: seed % 5 === 0 ? 'guided' : 'smart', roundLength: seed % 2 ? '12' : '8', seed }));
  assert.equal(sessions.length, 24);
  assert.ok(sessions.every((rows) => rows.length >= 8), 'every sampled session should surface at least eight items');
  for (const rows of sessions) {
    for (let index = 1; index < rows.length; index += 1) {
      assert.notEqual(rows[index].id, rows[index - 1].id, `immediate repeat ${rows[index].id}`);
    }
    assert.ok(new Set(rows.map((row) => row.mode)).size >= 3, `mode variety too low: ${rows.map((row) => row.mode).join(',')}`);
  }
  assert.ok(new Set(sessions.flat().map((row) => row.id)).size >= 120, 'sampled sessions should show broad item variety');
});

test('P12 runtime items have complete learner answer surfaces', () => {
  const runtime = createPunctuationRuntimeManifest({ manifest: PUNCTUATION_CONTENT_MANIFEST, generatedPerFamily: PRODUCTION_DEPTH });
  for (const item of runtime.items) {
    assert.ok(item.id, 'item id required');
    assert.ok(item.prompt && item.prompt.trim().length >= 10, `${item.id} prompt too short`);
    assert.ok((item.stem && item.stem.trim().length >= 5) || (Array.isArray(item.options) && item.options.length >= 3) || (item.mode === 'transfer' && item.model && item.model.trim().length >= 5), `${item.id} learner surface missing`);
    assert.ok(Array.isArray(item.skillIds) && item.skillIds.length >= 1, `${item.id} skillIds missing`);
    assert.ok(item.explanation && item.explanation.trim().length >= 15, `${item.id} explanation too short`);
    if (item.mode === 'choose' || item.inputKind === 'choice') {
      assert.ok(Array.isArray(item.options) && item.options.length >= 3, `${item.id} choice options missing`);
      assert.ok(Number.isInteger(item.correctIndex), `${item.id} correctIndex missing`);
      assert.ok(item.correctIndex >= 0 && item.correctIndex < item.options.length, `${item.id} correctIndex out of range`);
    } else {
      assert.ok(item.model && item.model.trim().length >= 5, `${item.id} model missing`);
    }
  }
});
