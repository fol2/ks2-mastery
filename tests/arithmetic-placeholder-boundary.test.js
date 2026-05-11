import test from 'node:test';
import assert from 'node:assert/strict';

import * as placeholders from '../src/subjects/placeholders/index.js';

test('reasoning is the only placeholder subject exported from the placeholder registry', () => {
  assert.deepEqual(Object.keys(placeholders).sort(), ['reasoningModule']);
  assert.equal(placeholders.reasoningModule.id, 'reasoning');
  assert.equal(placeholders.reasoningModule.available, false);
});
