import test from 'node:test';
import assert from 'node:assert/strict';

import { CONTEXT_PACK_POLICY } from '../shared/punctuation/context-packs.js';
import { createPunctuationRuntimeManifest } from '../shared/punctuation/generators.js';

test('CONTEXT_PACK_POLICY is exported and equals teacher_admin_only', () => {
  assert.equal(CONTEXT_PACK_POLICY, 'teacher_admin_only');
});

test('production manifest creation with no context pack succeeds', () => {
  const manifest = createPunctuationRuntimeManifest({
    generatedPerFamily: 4,
  });
  assert.ok(manifest);
  assert.ok(Array.isArray(manifest.items));
  assert.ok(manifest.items.length > 0);
});

test('passing a context pack without allowContextPacks throws', () => {
  const pack = {
    names: ['Aisha', 'Ben', 'Cara'],
    listNouns: ['apples', 'bananas', 'cherries'],
  };
  assert.throws(
    () => createPunctuationRuntimeManifest({
      generatedPerFamily: 4,
      contextPack: pack,
    }),
    {
      message: 'Context packs are teacher/admin-only in P3. Pass allowContextPacks: true for preview/admin paths.',
    },
  );
});

test('passing allowContextPacks: true with a valid pack succeeds', () => {
  const pack = {
    names: ['Aisha', 'Ben', 'Cara'],
    listNouns: ['apples', 'bananas', 'cherries'],
    stems: ['the crew checked the ropes', 'we found another path'],
  };
  const manifest = createPunctuationRuntimeManifest({
    generatedPerFamily: 4,
    contextPack: pack,
    allowContextPacks: true,
  });
  assert.ok(manifest);
  assert.ok(Array.isArray(manifest.items));
  assert.ok(manifest.items.length > 0);
});
