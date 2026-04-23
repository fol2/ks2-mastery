import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSubjectRegistry } from '../src/platform/core/subject-registry.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import { createStore } from '../src/platform/core/store.js';
import { spellingModule } from '../src/subjects/spelling/module.js';
import { renderSpellingSurfaceFixture } from './helpers/react-render.js';

function completeSubjectModule(overrides = {}) {
  return {
    id: 'demo',
    name: 'Demo',
    blurb: 'Demo module',
    initState() {
      return { phase: 'dashboard' };
    },
    getDashboardStats() {
      return { pct: 0, due: 0, streak: 0, nextUp: 'Planned' };
    },
    renderPractice() {
      return '<div>practice</div>';
    },
    handleAction() {
      return false;
    },
    ...overrides,
  };
}

test('subject registry rejects modules missing required contract functions', () => {
  const broken = completeSubjectModule();
  delete broken.handleAction;

  assert.throws(
    () => buildSubjectRegistry([broken]),
    /missing required function "handleAction\(\)"/i,
  );
});

test('subject registry accepts a React practice component during subject migration', () => {
  const subject = completeSubjectModule({
    renderPractice: undefined,
    PracticeComponent() {
      return null;
    },
  });

  const registry = buildSubjectRegistry([subject]);

  assert.equal(registry[0].id, 'demo');
  assert.equal(typeof registry[0].PracticeComponent, 'function');
});

test('subject registry accepts a mapped React practice surface without importing JSX in the module', () => {
  const subject = completeSubjectModule({
    renderPractice: undefined,
    reactPractice: true,
  });

  const registry = buildSubjectRegistry([subject]);

  assert.equal(registry[0].id, 'demo');
  assert.equal(registry[0].reactPractice, true);
});

test('subject registry rejects modules without React or legacy practice rendering', () => {
  const broken = completeSubjectModule({ renderPractice: undefined });

  assert.throws(
    () => buildSubjectRegistry([broken]),
    /missing required React practice component or legacy "renderPractice\(\)" renderer/i,
  );
});

test('subject registry rejects duplicate subject ids', () => {
  const one = completeSubjectModule({ id: 'shared' });
  const two = completeSubjectModule({ id: 'shared', name: 'Second' });

  assert.throws(
    () => buildSubjectRegistry([one, two]),
    /duplicate id "shared"/i,
  );
});

test('store rejects subject modules whose initState does not return an object', () => {
  installMemoryStorage();
  const broken = completeSubjectModule({
    id: 'broken',
    initState() {
      return null;
    },
  });

  assert.throws(
    () => createStore([broken]),
    /initState\(\) must return an object/i,
  );
});

test('spelling practice dashboard renders without service UI metadata', async () => {
  assert.equal(spellingModule.reactPractice, true);
  assert.equal(spellingModule.renderPractice, undefined);

  const html = await renderSpellingSurfaceFixture({ phase: 'setup' });

  assert.match(html, /Round setup/);
  assert.match(html, /#3E6FA8/i);
});
