import test from 'node:test';
import assert from 'node:assert/strict';
import { SUBJECTS, getSubject } from '../src/platform/core/subject-registry.js';
import { reasoningModule } from '../src/subjects/reasoning/module.js';

test('reasoning module is live and not a placeholder', () => {
  assert.equal(reasoningModule.id, 'reasoning');
  assert.equal(reasoningModule.available, true);
  assert.equal(reasoningModule.reactPractice, true);
  assert.equal(typeof reasoningModule.initState, 'function');
  assert.equal(reasoningModule.initState().subjectId, 'reasoning');
  assert.equal(getSubject('reasoning').available, true);
  assert.ok(SUBJECTS.map((subject) => subject.id).includes('reasoning'));
});
