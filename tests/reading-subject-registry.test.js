import test from 'node:test';
import assert from 'node:assert/strict';
import { readingModule } from '../src/subjects/reading/module.js';
import { HERO_LOCKED_SUBJECT_IDS, HERO_READY_SUBJECT_IDS } from '../shared/hero/constants.js';
import { registeredSubjectIds } from '../worker/src/hero/providers/index.js';
import { mapHeroEnvelopeToSubjectPayload } from '../worker/src/hero/launch-adapters/index.js';
import { buildTaskEnvelope } from '../shared/hero/task-envelope.js';


test('reading module is ready and not a placeholder', () => {
  assert.equal(readingModule.id, 'reading');
  assert.equal(readingModule.available, true);
  assert.equal(readingModule.reactPractice, true);
  assert.equal(typeof readingModule.initState, 'function');
  assert.equal(readingModule.initState().subjectId, 'reading');
});

test('hero mode includes reading as a ready subject with provider and launch adapter', () => {
  assert.ok(HERO_READY_SUBJECT_IDS.includes('reading'));
  assert.ok(!HERO_LOCKED_SUBJECT_IDS.includes('reading'));
  assert.ok(registeredSubjectIds().includes('reading'));
  const envelope = buildTaskEnvelope({
    subjectId: 'reading',
    intent: 'starter-growth',
    launcher: 'smart-practice',
    effortTarget: 6,
    reasonTags: ['test'],
  });
  const payload = mapHeroEnvelopeToSubjectPayload(envelope);
  assert.equal(payload.launchable, true);
  assert.equal(payload.subjectId, 'reading');
  assert.equal(payload.payload.mode, 'smart');
});
