import test from 'node:test';
import assert from 'node:assert/strict';
import { HERO_LOCKED_SUBJECT_IDS, HERO_READY_SUBJECT_IDS } from '../shared/hero/constants.js';
import { registeredSubjectIds, runProvider } from '../worker/src/hero/providers/index.js';
import { mapHeroEnvelopeToSubjectPayload } from '../worker/src/hero/launch-adapters/index.js';
import { buildTaskEnvelope } from '../shared/hero/task-envelope.js';

test('hero mode treats reasoning as a ready subject with provider and launch adapter', () => {
  assert.ok(HERO_READY_SUBJECT_IDS.includes('reasoning'));
  assert.ok(!HERO_LOCKED_SUBJECT_IDS.includes('reasoning'));
  assert.ok(registeredSubjectIds().includes('reasoning'));
  const envelope = buildTaskEnvelope({
    subjectId: 'reasoning',
    intent: 'starter-growth',
    launcher: 'smart-practice',
    effortTarget: 6,
    reasonTags: ['test'],
  });
  const payload = mapHeroEnvelopeToSubjectPayload(envelope);
  assert.equal(payload.launchable, true);
  assert.equal(payload.subjectId, 'reasoning');
  assert.equal(payload.payload.mode, 'smart');
});

test('hero reasoning provider returns task envelopes from the reasoning read model', () => {
  const result = runProvider('reasoning', {
    content: { templateCount: 110 },
    stats: { overview: { totalQuestions: 0, weak: 0, due: 0, securedSkills: 0, accuracy: 0 } },
    analytics: { skills: [] },
  });
  assert.equal(result.available, true);
  assert.equal(result.subjectId, 'reasoning');
  assert.ok(result.envelopes.length >= 1);
  assert.equal(result.envelopes[0].subjectId, 'reasoning');
});
