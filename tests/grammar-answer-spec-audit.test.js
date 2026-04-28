// Phase 4 U11 — Answer-spec migration audit doc gate.
//
// This test file is a pure documentation gate. It asserts that
// `docs/plans/james/grammar/grammar-answer-spec-audit.md` exists, has exactly
// one row per grammar template, every proposed
// `answerSpec.kind` belongs to `ANSWER_SPEC_KINDS`, every template id in the
// doc exists in `GRAMMAR_TEMPLATES`, the manual-review-only candidate list
// contains at least 5 entries, and all six P1 focus concepts are flagged
// high-priority. The test does NOT touch `content.js`, `answer-spec.js`, or
// any oracle fixture — the audit is inventory-only; Phase 5 executes the
// migration one template at a time.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ANSWER_SPEC_KINDS } from '../worker/src/subjects/grammar/answer-spec.js';
import {
  GRAMMAR_TEMPLATE_METADATA,
  GRAMMAR_TEMPLATES,
  createGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const auditDocPath = path.join(rootDir, 'docs/plans/james/grammar/grammar-answer-spec-audit.md');

const P1_FOCUS_CONCEPTS = [
  'pronouns_cohesion',
  'formality',
  'active_passive',
  'subject_object',
  'modal_verbs',
  'hyphen_ambiguity',
];

function readAuditDoc() {
  return fs.readFileSync(auditDocPath, 'utf8');
}

function extractClassificationTableRows(doc) {
  // Locate the classification table by its pipe header. The header row starts
  // with `| Template id`. The table ends at the first line that does not
  // begin with `|`. The first two lines after the header are the column
  // separator row and the actual data rows.
  const lines = doc.split(/\r?\n/);
  const headerIdx = lines.findIndex((line) => line.startsWith('| Template id'));
  assert.notEqual(headerIdx, -1, 'Classification table header not found in audit doc.');
  const startIdx = headerIdx + 2; // skip header + separator row
  let endIdx = startIdx;
  while (endIdx < lines.length && lines[endIdx].startsWith('|')) {
    endIdx += 1;
  }
  return lines.slice(startIdx, endIdx).map((line) => {
    const cells = line.split('|').map((cell) => cell.trim());
    // Pipe-delimited Markdown tables have a leading and trailing empty cell.
    return {
      id: cells[1].replace(/`/g, ''),
      concepts: cells[2],
      questionType: cells[3].replace(/`/g, ''),
      currentMarkingPath: cells[4],
      proposedKind: cells[5].replace(/`/g, ''),
      golden: cells[6],
      nearMiss: cells[7],
      priority: cells[8].toLowerCase(),
      releaseBump: cells[9],
    };
  });
}

function extractManualReviewCandidatesSection(doc) {
  // Section 3 title: "## 3. Manual-review-only candidates (≥ 5)".
  // Candidate list items start with a digit + dot and carry a backtick-wrapped
  // template id at the head. Stop at the next `## ` heading.
  const sectionStart = doc.indexOf('## 3. Manual-review-only candidates');
  assert.notEqual(sectionStart, -1, 'Section 3 (manual-review-only candidates) not found.');
  const after = doc.slice(sectionStart);
  const sectionEnd = after.indexOf('\n## ');
  const section = sectionEnd === -1 ? after : after.slice(0, sectionEnd);
  const items = [];
  for (const line of section.split(/\r?\n/)) {
    const match = line.match(/^\d+\.\s+`([a-z0-9_]+)`/i);
    if (match) items.push(match[1]);
  }
  return items;
}

function extractThinPoolConceptSection(doc) {
  const sectionStart = doc.indexOf('## 4. P1 focus concept priority');
  assert.notEqual(sectionStart, -1, 'Section 4 (P1 focus concept priority) not found.');
  const after = doc.slice(sectionStart);
  const sectionEnd = after.indexOf('\n## ');
  const section = sectionEnd === -1 ? after : after.slice(0, sectionEnd);
  const concepts = [];
  for (const line of section.split(/\r?\n/)) {
    const match = line.match(/^\d+\.\s+`([a-z_]+)`/i);
    if (match) concepts.push(match[1]);
  }
  return concepts;
}

test('audit doc exists on disk', () => {
  assert.ok(
    fs.existsSync(auditDocPath),
    `audit doc should exist at ${path.relative(rootDir, auditDocPath)}`
  );
});

test('classification table has one row per template', () => {
  const doc = readAuditDoc();
  const rows = extractClassificationTableRows(doc);
  assert.equal(
    rows.length,
    GRAMMAR_TEMPLATES.length,
    'Audit row count must equal GRAMMAR_TEMPLATES.length.'
  );
});

test('every proposed answerSpec.kind is in ANSWER_SPEC_KINDS', () => {
  const doc = readAuditDoc();
  const rows = extractClassificationTableRows(doc);
  const validKinds = new Set(ANSWER_SPEC_KINDS);
  for (const row of rows) {
    assert.ok(
      validKinds.has(row.proposedKind),
      `Template ${row.id} proposes unknown kind: ${row.proposedKind}. ` +
        `Valid kinds: ${ANSWER_SPEC_KINDS.join(', ')}.`
    );
  }
});

test('new opt-in generated templates must emit validated answerSpec data', async () => {
  const { validateAnswerSpec } = await import('../worker/src/subjects/grammar/answer-spec.js');
  const validKinds = new Set(ANSWER_SPEC_KINDS);
  const templates = GRAMMAR_TEMPLATE_METADATA.filter((template) => template.requiresAnswerSpec);
  for (const template of templates) {
    assert.ok(validKinds.has(template.answerSpecKind), `${template.id} has invalid answerSpecKind.`);
    for (const seed of [1, 7, 19]) {
      const question = createGrammarQuestion({ templateId: template.id, seed });
      assert.ok(question?.answerSpec, `${template.id}:${seed} must emit question.answerSpec.`);
      assert.equal(question.answerSpec.kind, template.answerSpecKind, `${template.id}:${seed} answerSpec kind drifted.`);
      assert.equal(validateAnswerSpec(question.answerSpec), true, `${template.id}:${seed} answerSpec failed validation.`);
    }
  }
});

test('every template id in the audit doc exists in GRAMMAR_TEMPLATES', () => {
  const doc = readAuditDoc();
  const rows = extractClassificationTableRows(doc);
  const templateIds = new Set(GRAMMAR_TEMPLATES.map((template) => template.id));
  for (const row of rows) {
    assert.ok(
      templateIds.has(row.id),
      `Audit row id "${row.id}" does not exist in GRAMMAR_TEMPLATES.`
    );
  }
  // And reverse: no template is missing from the audit.
  const auditIds = new Set(rows.map((row) => row.id));
  for (const template of GRAMMAR_TEMPLATES) {
    assert.ok(
      auditIds.has(template.id),
      `Template "${template.id}" from GRAMMAR_TEMPLATES is missing from the audit doc.`
    );
  }
});

test('no duplicate template ids in the audit doc', () => {
  const doc = readAuditDoc();
  const rows = extractClassificationTableRows(doc);
  const seen = new Set();
  for (const row of rows) {
    assert.equal(
      seen.has(row.id),
      false,
      `Duplicate audit row for template "${row.id}".`
    );
    seen.add(row.id);
  }
});

test('audit lists at least 5 manual-review-only candidates in section 3', () => {
  const doc = readAuditDoc();
  const candidates = extractManualReviewCandidatesSection(doc);
  assert.ok(
    candidates.length >= 5,
    `Section 3 must list at least 5 manual-review-only candidates, ` +
      `got ${candidates.length}: ${candidates.join(', ')}`
  );
  // Every candidate in §3 must be a real template id.
  const templateIds = new Set(GRAMMAR_TEMPLATES.map((template) => template.id));
  for (const candidate of candidates) {
    assert.ok(
      templateIds.has(candidate),
      `Manual-review candidate "${candidate}" is not a real template id.`
    );
  }
});

test('audit lists all 6 P1 focus concepts as high-priority in section 4', () => {
  const doc = readAuditDoc();
  const listed = extractThinPoolConceptSection(doc);
  for (const concept of P1_FOCUS_CONCEPTS) {
    assert.ok(
      listed.includes(concept),
      `Section 4 must list P1 focus concept "${concept}". ` +
        `Got: ${listed.join(', ')}`
    );
  }
  assert.equal(
    listed.length,
    P1_FOCUS_CONCEPTS.length,
    `Section 4 must list exactly the 6 P1 focus concepts. ` +
      `Got ${listed.length}: ${listed.join(', ')}`
  );
});

test('every template carrying a P1 focus concept is priority=high', () => {
  // Cross-check: the narrative says templates tagged with any of the six
  // P1 focus concept ids inherit high priority. Catch drift between the
  // narrative and the table.
  const doc = readAuditDoc();
  const rows = extractClassificationTableRows(doc);
  const thinSet = new Set(P1_FOCUS_CONCEPTS);
  for (const template of GRAMMAR_TEMPLATES) {
    const hasThin = template.skillIds.some((skill) => thinSet.has(skill));
    if (!hasThin) continue;
    const row = rows.find((candidate) => candidate.id === template.id);
    assert.ok(row, `Audit row missing for P1 focus template ${template.id}.`);
    assert.equal(
      row.priority,
      'high',
      `Template "${template.id}" carries P1 focus concept(s) ` +
        `${template.skillIds.filter((skill) => thinSet.has(skill)).join(', ')} ` +
        `but audit priority is "${row.priority}" — expected "high".`
    );
  }
});

test('release-id bump is YES for every constructed-response row', () => {
  // Every template with isSelectedResponse=false is routed through
  // markStringAnswer today. Migrating to a declarative kind changes the mark
  // result shape (manualReviewOnly) or narrows near-miss acceptance
  // (punctuationPattern tightens vs. the acceptedSet adapter's bare-strip
  // partial-credit path). Every such migration must bump contentReleaseId.
  const doc = readAuditDoc();
  const rows = extractClassificationTableRows(doc);
  for (const template of GRAMMAR_TEMPLATES) {
    if (template.isSelectedResponse) continue;
    const row = rows.find((candidate) => candidate.id === template.id);
    assert.ok(row, `Audit row missing for constructed-response template ${template.id}.`);
    assert.equal(
      row.releaseBump,
      'YES',
      `Constructed-response template "${template.id}" must have release-id bump = YES ` +
        `(got "${row.releaseBump}") — every marking-behaviour change invalidates stored evidence.`
    );
  }
});

test('release-id bump is NO for every selected-response row', () => {
  // Selected-response templates marked today by index-equality migrate to
  // `exact` on option-value. Byte-identical mark result for every stored
  // attempt, so no release-id bump is required.
  const doc = readAuditDoc();
  const rows = extractClassificationTableRows(doc);
  for (const template of GRAMMAR_TEMPLATES) {
    if (!template.isSelectedResponse) continue;
    const row = rows.find((candidate) => candidate.id === template.id);
    assert.ok(row, `Audit row missing for selected-response template ${template.id}.`);
    assert.equal(
      row.releaseBump,
      'NO',
      `Selected-response template "${template.id}" must have release-id bump = NO ` +
        `(got "${row.releaseBump}") — additive migration preserves mark result.`
    );
  }
});

test('audit table proposes the expected P1 answer-spec distribution', () => {
  // Sanity: legacy selected-response rows use `exact`, while two new P1
  // classify-table templates use `multiField` from day one. The 20 legacy
  // constructed-response rows remain one of the other declarative kinds.
  const doc = readAuditDoc();
  const rows = extractClassificationTableRows(doc);
  const exactCount = rows.filter((row) => row.proposedKind === 'exact').length;
  const multiFieldCount = rows.filter((row) => row.proposedKind === 'multiField').length;
  const nonExactCount = rows.length - exactCount;
  assert.equal(exactCount, 35, `Expected 35 rows proposing 'exact', got ${exactCount}.`);
  assert.equal(multiFieldCount, 2, `Expected 2 rows proposing 'multiField', got ${multiFieldCount}.`);
  assert.equal(nonExactCount, 22, `Expected 22 rows proposing a non-exact kind, got ${nonExactCount}.`);
});
