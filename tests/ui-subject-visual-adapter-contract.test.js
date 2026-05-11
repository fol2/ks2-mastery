import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SUBJECTS } from '../src/platform/core/subject-registry.js';
import {
  SUBJECT_VISUAL_ADAPTER_SECTIONS,
  isSubjectVisualAdapter,
} from '../src/platform/ui/subject-visual-adapter.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('ready subjects expose a complete SubjectVisualAdapter', () => {
  for (const subjectId of ['spelling', 'grammar', 'punctuation', 'reading', 'reasoning', 'arithmetic']) {
    const subject = SUBJECTS.find((entry) => entry.id === subjectId);
    assert.ok(subject, `${subjectId} must be registered`);
    assert.equal(isSubjectVisualAdapter(subject.visualAdapter), true);
    assert.equal(subject.visualAdapter.status, 'ready');
    assert.equal(subject.visualAdapter.productionPracticeAvailable, true);
    for (const section of SUBJECT_VISUAL_ADAPTER_SECTIONS) {
      assert.ok(subject.visualAdapter.sections[section], `${subjectId} missing ${section}`);
    }
    assert.equal(subject.visualAdapter.sections.summaryFrame.component, 'SessionSummaryFrame');
    assert.equal(subject.visualAdapter.sections.companionPanel.component, 'SubjectCompanionPanel');
  }
});

test('placeholder subjects expose unavailable adapters without production practice controls', () => {
  const placeholderSubjectIds = SUBJECTS
    .filter((entry) => entry.visualAdapter?.status === 'unavailable')
    .map((entry) => entry.id);
  assert.deepEqual(placeholderSubjectIds, []);
  for (const subjectId of placeholderSubjectIds) {
    const subject = SUBJECTS.find((entry) => entry.id === subjectId);
    assert.ok(subject, `${subjectId} must be registered`);
    assert.equal(isSubjectVisualAdapter(subject.visualAdapter), true);
    assert.equal(subject.visualAdapter.status, 'unavailable');
    assert.equal(subject.visualAdapter.productionPracticeAvailable, false);
    assert.equal(subject.visualAdapter.sections.setup.primaryAction, 'unavailable-info');
  }
});

test('placeholder adapter module does not import Worker command handlers or browser engines', () => {
  const source = readFileSync(path.join(rootDir, 'src/subjects/placeholders/module-factory.js'), 'utf8');
  const importLines = source.split('\n').filter((line) => line.trim().startsWith('import ')).join('\n');
  assert.doesNotMatch(importLines, /subject-command|worker\/src|startSession|submitAnswer/);
  assert.doesNotMatch(source, /handleAction\([^)]*\)\s*\{[\s\S]*dispatch|handleAction\([^)]*\)\s*\{[\s\S]*startSession/);
  assert.match(source, /createPlaceholderSubjectVisualAdapter/);
});

test('subject expansion documentation references the visual adapter contract', () => {
  const source = readFileSync(path.join(rootDir, 'docs/subject-visual-adapter-contract.md'), 'utf8');
  assert.match(source, /SubjectVisualAdapter/);
  assert.match(source, /Placeholder subjects/);
  assert.match(source, /must not expose production practice controls/);

  const expansion = readFileSync(path.join(rootDir, 'docs/subject-expansion.md'), 'utf8');
  const readiness = readFileSync(path.join(rootDir, 'docs/expansion-readiness.md'), 'utf8');
  assert.match(expansion, /SubjectVisualAdapter/);
  assert.match(expansion, /docs\/subject-visual-adapter-contract\.md/);
  assert.match(readiness, /SubjectVisualAdapter/);
});
