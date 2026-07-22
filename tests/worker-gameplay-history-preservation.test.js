import test from 'node:test';
import assert from 'node:assert/strict';

import { changedGrammarGameplayItems } from '../worker/src/subjects/grammar/gameplay-state.js';
import { changedPunctuationGameplayItems } from '../worker/src/subjects/punctuation/gameplay-persistence.js';
import { changedReadingGameplayQuestions } from '../worker/src/subjects/reading/gameplay-state.js';
import { changedSpellingGameplayItems } from '../worker/src/subjects/spelling/gameplay-state.js';

test('bounded gameplay diffs never translate an omitted retired row into a delete', () => {
  assert.deepEqual(changedSpellingGameplayItems({
    progress: { retired: { attempts: 4 } },
  }, {
    progress: {},
  }), []);

  assert.deepEqual(changedGrammarGameplayItems({
    mastery: { items: { retired: { attempts: 4 } } },
  }, {
    mastery: { items: {} },
  }), []);

  assert.deepEqual(changedReadingGameplayQuestions({
    questions: { retired: { attempts: 4 } },
  }, {
    questions: {},
  }), []);

  assert.deepEqual(changedPunctuationGameplayItems({
    progress: { items: { retired: { attempts: 4 } } },
  }, {
    progress: { items: {} },
  }), []);
});

test('bounded gameplay diffs still persist changed rows in the active working set', () => {
  assert.deepEqual(changedSpellingGameplayItems({
    progress: { current: { attempts: 1 } },
  }, {
    progress: { current: { attempts: 2 } },
  }), [{
    slug: 'current',
    progress: { attempts: 2 },
    guardian: null,
    pattern: null,
  }]);

  assert.deepEqual(changedGrammarGameplayItems({
    mastery: { items: { current: { attempts: 1 } } },
  }, {
    mastery: { items: { current: { attempts: 2 } } },
  }), [{ itemId: 'current', mastery: { attempts: 2 } }]);

  assert.deepEqual(changedReadingGameplayQuestions({
    questions: { current: { attempts: 1 } },
  }, {
    questions: { current: { attempts: 2 } },
  }), [{ questionId: 'current', mastery: { attempts: 2 } }]);

  assert.deepEqual(changedPunctuationGameplayItems({
    progress: { items: { current: { attempts: 1 } } },
  }, {
    progress: { items: { current: { attempts: 2 } } },
  }), [{ itemId: 'current', state: { attempts: 2 } }]);
});
