import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPunctuationContentIndexes,
  PUNCTUATION_CONTENT_MANIFEST,
} from '../shared/punctuation/content.js';
import { selectPunctuationItem } from '../shared/punctuation/scheduler.js';

test('expanded-manifest start selection stays within the bounded scheduler window', () => {
  const generated = Array.from({ length: 1200 }, (_, index) => ({
    id: `generated_sentence_${index}`,
    mode: index % 4 === 0 ? 'choose' : 'insert',
    skillIds: ['sentence_endings'],
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    prompt: 'Punctuate the sentence accurately.',
    stem: `where is item ${index}`,
    accepted: [`Where is item ${index}?`],
    explanation: 'Generated performance fixture.',
    model: `Where is item ${index}?`,
    readiness: ['insertion'],
    source: 'generated',
  }));
  const indexes = createPunctuationContentIndexes({
    ...PUNCTUATION_CONTENT_MANIFEST,
    items: [...PUNCTUATION_CONTENT_MANIFEST.items, ...generated],
  });
  const result = selectPunctuationItem({
    indexes,
    progress: { items: {} },
    session: { answeredCount: 0, recentItemIds: [] },
    prefs: { mode: 'endmarks' },
    now: 0,
    random: () => 0.75,
    candidateWindow: 32,
  });
  assert.equal(result.inspectedCount, 32);
  assert.ok(result.candidateCount > 300);
});
