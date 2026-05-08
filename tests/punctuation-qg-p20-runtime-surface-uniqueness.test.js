import test from 'node:test';
import assert from 'node:assert/strict';

import { PUNCTUATION_CONTENT_MANIFEST } from '../shared/punctuation/content.js';
import { createPunctuationRuntimeManifest, PRODUCTION_DEPTH } from '../shared/punctuation/generators.js';

function normaliseText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJson(value[key])]));
}

function learnerSurfaceSignature(item) {
  const payload = {
    mode: item.mode || '',
    prompt: normaliseText(item.prompt),
    stem: normaliseText(item.stem),
    options: Array.isArray(item.options) ? item.options.map(normaliseText) : [],
    model: normaliseText(item.model),
    accepted: Array.isArray(item.accepted) ? item.accepted.map(normaliseText).sort() : [],
    skillIds: Array.isArray(item.skillIds) ? [...item.skillIds].sort() : [],
    validatorType: item.validator && typeof item.validator === 'object' ? item.validator.type || '' : '',
    rubricType: item.rubric && typeof item.rubric === 'object' ? item.rubric.type || '' : '',
  };
  return JSON.stringify(stableJson(payload));
}

test('P20 runtime pool has no duplicate learner-facing surfaces in fixed or generated items', () => {
  const manifest = createPunctuationRuntimeManifest(PUNCTUATION_CONTENT_MANIFEST, {
    productionDepth: PRODUCTION_DEPTH,
  });

  const groups = new Map();
  for (const item of manifest.items) {
    const signature = learnerSurfaceSignature(item);
    const group = groups.get(signature) || [];
    group.push(item.id);
    groups.set(signature, group);
  }

  const duplicates = [...groups.values()]
    .filter((ids) => ids.length > 1)
    .map((ids) => [...ids].sort())
    .sort((a, b) => a[0].localeCompare(b[0]));

  assert.deepEqual(duplicates, []);
});
