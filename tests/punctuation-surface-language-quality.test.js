import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDashTypographyQualityEvidence,
  buildRedundantPhraseQualityEvidence,
} from '../scripts/audit-punctuation-qg-p20-expansion.mjs';
import {
  PRODUCTION_DEPTH,
  createPunctuationRuntimeManifest,
} from '../shared/punctuation/generators.js';

function runtimeItems() {
  return createPunctuationRuntimeManifest({ generatedPerFamily: PRODUCTION_DEPTH }).items;
}

test('P20 runtime blocks accidental repeated list entries and repeated parenthesis descriptors', () => {
  const evidence = buildRedundantPhraseQualityEvidence(runtimeItems());

  assert.equal(evidence.findingCount, 0, JSON.stringify(evidence.findings, null, 2));
  assert.equal(evidence.ok, true);
});

test('redundant phrase quality gate catches learner-facing self-repetition', () => {
  const evidence = buildRedundantPhraseQualityEvidence([
    {
      id: 'fixture_list_repeat',
      mode: 'insert',
      skillIds: ['list_commas'],
      stem: 'The tray held keys, scripts and scripts.',
      model: 'The tray held keys, scripts and scripts.',
      accepted: ['The tray held keys, scripts and scripts.'],
    },
    {
      id: 'fixture_parenthesis_repeat',
      mode: 'choose',
      skillIds: ['parenthesis'],
      options: ['Jude (focused and focused) updated the planning sheet.'],
      model: 'Jude (focused and focused) updated the planning sheet.',
    },
  ]);

  assert.equal(evidence.ok, false);
  assert.equal(evidence.findingCount, 2, JSON.stringify(evidence.findings, null, 2));
  assert.match(evidence.findings.map((finding) => finding.phrase).join('\n'), /scripts and scripts/);
  assert.match(evidence.findings.map((finding) => finding.phrase).join('\n'), /focused and focused/);
});

test('P20 runtime models dash clauses with real dash typography', () => {
  const evidence = buildDashTypographyQualityEvidence(runtimeItems());

  assert.equal(evidence.findingCount, 0, JSON.stringify(evidence.findings, null, 2));
  assert.equal(evidence.ok, true);
});

test('dash typography gate catches learner-facing spaced hyphen-minus but keeps accepted-answer keyboard tolerance', () => {
  const bad = buildDashTypographyQualityEvidence([
    {
      id: 'fixture_dash_bad',
      mode: 'choose',
      skillIds: ['dash_clause'],
      stem: 'Choose the sentence with the dash.',
      options: ['Maya opened the map - the room fell silent - and read the note.'],
      model: 'Maya opened the map - the room fell silent - and read the note.',
      accepted: ['Maya opened the map – the room fell silent – and read the note.'],
    },
  ]);

  assert.equal(bad.ok, false);
  assert.ok(bad.findingCount >= 1, JSON.stringify(bad.findings, null, 2));

  const accessible = buildDashTypographyQualityEvidence([
    {
      id: 'fixture_dash_accessible',
      mode: 'fix',
      skillIds: ['dash_clause'],
      stem: 'Add a dash between the related clauses.',
      model: 'Maya opened the map – the room fell silent – and read the note.',
      accepted: ['Maya opened the map - the room fell silent - and read the note.'],
      tests: {
        accept: ['Maya opened the map - the room fell silent - and read the note.'],
      },
    },
  ]);

  assert.equal(accessible.findingCount, 0, JSON.stringify(accessible.findings, null, 2));
  assert.equal(accessible.ok, true);
});
