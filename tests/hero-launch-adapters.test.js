import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { mapHeroEnvelopeToSubjectPayload } from '../worker/src/hero/launch-adapters/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// ── Spelling happy paths ───────────────────────────────────────────

test('Spelling smart-practice maps to { mode: "smart" }', () => {
  const envelope = { subjectId: 'spelling', launcher: 'smart-practice' };
  const result = mapHeroEnvelopeToSubjectPayload(envelope);
  assert.equal(result.launchable, true);
  assert.equal(result.subjectId, 'spelling');
  assert.deepStrictEqual(result.payload, { mode: 'smart' });
});

test('Spelling trouble-practice maps to { mode: "trouble" }', () => {
  const envelope = { subjectId: 'spelling', launcher: 'trouble-practice' };
  const result = mapHeroEnvelopeToSubjectPayload(envelope);
  assert.equal(result.launchable, true);
  assert.equal(result.subjectId, 'spelling');
  assert.deepStrictEqual(result.payload, { mode: 'trouble' });
});

test('Spelling guardian-check maps to { mode: "guardian" }', () => {
  const envelope = { subjectId: 'spelling', launcher: 'guardian-check' };
  const result = mapHeroEnvelopeToSubjectPayload(envelope);
  assert.equal(result.launchable, true);
  assert.equal(result.subjectId, 'spelling');
  assert.deepStrictEqual(result.payload, { mode: 'guardian' });
});

// ── Grammar happy paths ────────────────────────────────────────────

test('Grammar smart-practice maps to { mode: "smart" }', () => {
  const envelope = { subjectId: 'grammar', launcher: 'smart-practice' };
  const result = mapHeroEnvelopeToSubjectPayload(envelope);
  assert.equal(result.launchable, true);
  assert.equal(result.subjectId, 'grammar');
  assert.deepStrictEqual(result.payload, { mode: 'smart' });
});

test('Grammar trouble-practice maps to { mode: "trouble" }', () => {
  const envelope = { subjectId: 'grammar', launcher: 'trouble-practice' };
  const result = mapHeroEnvelopeToSubjectPayload(envelope);
  assert.equal(result.launchable, true);
  assert.equal(result.subjectId, 'grammar');
  assert.deepStrictEqual(result.payload, { mode: 'trouble' });
});

test('Grammar mini-test maps to { mode: "satsset" } (pA2 U3)', () => {
  const envelope = { subjectId: 'grammar', launcher: 'mini-test' };
  const result = mapHeroEnvelopeToSubjectPayload(envelope);
  assert.equal(result.launchable, true);
  assert.equal(result.subjectId, 'grammar');
  assert.deepStrictEqual(result.payload, { mode: 'satsset' });
});

// ── Punctuation happy paths ────────────────────────────────────────

test('Punctuation smart-practice maps to { mode: "smart" }', () => {
  const envelope = { subjectId: 'punctuation', launcher: 'smart-practice' };
  const result = mapHeroEnvelopeToSubjectPayload(envelope);
  assert.equal(result.launchable, true);
  assert.equal(result.subjectId, 'punctuation');
  assert.deepStrictEqual(result.payload, { mode: 'smart' });
});

test('Punctuation trouble-practice maps to { mode: "weak" }', () => {
  const envelope = { subjectId: 'punctuation', launcher: 'trouble-practice' };
  const result = mapHeroEnvelopeToSubjectPayload(envelope);
  assert.equal(result.launchable, true);
  assert.equal(result.subjectId, 'punctuation');
  assert.deepStrictEqual(result.payload, { mode: 'weak' });
});

test('Punctuation gps-check maps to { mode: "gps" }', () => {
  const envelope = { subjectId: 'punctuation', launcher: 'gps-check' };
  const result = mapHeroEnvelopeToSubjectPayload(envelope);
  assert.equal(result.launchable, true);
  assert.equal(result.subjectId, 'punctuation');
  assert.deepStrictEqual(result.payload, { mode: 'gps' });
});

// ── Edge case: unsupported launcher ────────────────────────────────

test('unsupported launcher returns not-launchable with reason', () => {
  const envelope = { subjectId: 'spelling', launcher: 'mini-test' };
  const result = mapHeroEnvelopeToSubjectPayload(envelope);
  assert.equal(result.launchable, false);
  assert.equal(result.reason, 'launcher-not-supported-for-subject');
});

// ── Edge case: unknown subjectId ───────────────────────────────────

test('unknown subjectId returns not-launchable with subject-adapter-not-found', () => {
  const envelope = { subjectId: 'arithmetic', launcher: 'smart-practice' };
  const result = mapHeroEnvelopeToSubjectPayload(envelope);
  assert.equal(result.launchable, false);
  assert.equal(result.reason, 'subject-adapter-not-found');
});

// ── Edge case: adapters do not mutate input ────────────────────────

test('adapters do not mutate the input envelope', () => {
  const envelope = Object.freeze({
    subjectId: 'spelling',
    launcher: 'smart-practice',
    intent: 'due-review',
    effortTarget: 10,
    reasonTags: Object.freeze(['due-words']),
    debugReason: 'test',
  });
  const result = mapHeroEnvelopeToSubjectPayload(envelope);
  assert.equal(result.launchable, true);
  assert.deepStrictEqual(result.payload, { mode: 'smart' });
});

// ── Structural: no adapter imports subjects/runtime ────────────────

test('no launch adapter file contains subjects/runtime import', () => {
  const adapterDir = path.join(REPO_ROOT, 'worker', 'src', 'hero', 'launch-adapters');
  const files = fs.readdirSync(adapterDir)
    .filter(f => f.endsWith('.js'))
    .map(f => path.join(adapterDir, f));

  for (const filePath of files) {
    const code = fs.readFileSync(filePath, 'utf8');
    const rel = path.relative(REPO_ROOT, filePath);
    assert.ok(
      !code.includes('subjects/runtime'),
      `${rel} imports from subjects/runtime — launch adapters must not depend on subject runtime`,
    );
  }
});
