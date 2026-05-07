import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const sceneSourcePath = fileURLToPath(
  new URL('../src/subjects/punctuation/components/PunctuationSessionScene.jsx', import.meta.url),
);

function sceneSource() {
  return readFileSync(sceneSourcePath, 'utf8');
}

test('Punctuation text session disables submit for blank or whitespace-only answers', () => {
  const source = sceneSource();

  assert.match(
    source,
    /const hasTextAnswer = typeof typed === 'string' && typed\.trim\(\)\.length > 0;/,
    'TextItem should derive a trimmed non-empty answer guard.',
  );
  assert.match(
    source,
    /disabled=\{disabled \|\| !hasTextAnswer\}/,
    'Primary text submit should be disabled until a real text answer exists.',
  );
});

test('Punctuation text session guards the submit handler against forged blank submits', () => {
  const source = sceneSource();

  assert.match(
    source,
    /event\.preventDefault\(\);\s*if \(!hasTextAnswer\) return;\s*onSubmit\(\{ typed \}\);/s,
    'The form handler should reject blank submits even if the button state is bypassed.',
  );
});
