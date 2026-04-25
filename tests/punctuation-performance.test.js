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

test('mixed fixed, generated, combine, and paragraph scheduling stays bounded', () => {
  const modes = ['choose', 'insert', 'fix', 'transfer', 'combine', 'paragraph'];
  const generated = Array.from({ length: 1800 }, (_, index) => {
    const mode = modes[index % modes.length];
    return {
      id: `generated_mixed_${mode}_${index}`,
      mode,
      inputKind: mode === 'choose' ? 'choice' : 'text',
      skillIds: ['sentence_endings'],
      clusterId: 'endmarks',
      rewardUnitId: 'sentence-endings-core',
      prompt: `Generated ${mode} performance fixture.`,
      stem: `where is mixed item ${index}`,
      accepted: [`Where is mixed item ${index}?`],
      explanation: 'Generated performance fixture.',
      model: `Where is mixed item ${index}?`,
      options: mode === 'choose'
        ? [
            { text: `where is mixed item ${index}`, correct: false },
            { text: `Where is mixed item ${index}?`, correct: true },
          ]
        : undefined,
      correctIndex: mode === 'choose' ? 1 : undefined,
      readiness: [mode],
      source: 'generated',
    };
  });
  const indexes = createPunctuationContentIndexes({
    ...PUNCTUATION_CONTENT_MANIFEST,
    items: [...PUNCTUATION_CONTENT_MANIFEST.items, ...generated],
  });

  modes.forEach((mode, answeredCount) => {
    const result = selectPunctuationItem({
      indexes,
      progress: { items: {} },
      session: { mode: 'smart', answeredCount, recentItemIds: [] },
      prefs: { mode: 'smart' },
      now: 0,
      random: () => 0.4,
      candidateWindow: 40,
    });

    assert.equal(result.targetMode, mode);
    assert.equal(result.item.mode, mode);
    assert.ok(result.inspectedCount <= 40);
    assert.ok(result.candidateCount >= 300);
  });
});
