// Phase 4 U11 — Answer-spec migration audit doc gate.
//
// This test file is a pure documentation gate. It asserts that
// `docs/plans/james/grammar/grammar-answer-spec-audit.md` exists, has exactly
// one row per grammar template (51 rows total), every proposed
// `answerSpec.kind` belongs to `ANSWER_SPEC_KINDS`, every template id in the
// doc exists in `GRAMMAR_TEMPLATES`, the manual-review-only candidate list
// contains at least 5 entries, and all six thin-pool concepts are flagged
// high-priority. The test does NOT touch `content.js`, `answer-spec.js`, or
// any oracle fixture — the audit is inventory-only; Phase 5 executes the
// migration one template at a time.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ANSWER_SPEC_KINDS } from '../worker/src/subjects/grammar/answer-spec.js';
import { GRAMMAR_TEMPLATES } from '../worker/src/subjects/grammar/content.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const auditDocPath = path.join(rootDir, 'docs/plans/james/grammar/grammar-answer-spec-audit.md');

const THIN_POOL_CONCEPTS = [
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
  const sectionStart = doc.indexOf('## 4. Thin-pool concept priority');
  assert.notEqual(sectionStart, -1, 'Section 4 (thin-pool concept priority) not found.');
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

test('classification table has exactly 51 rows — one per template', () => {
  const doc = readAuditDoc();
  const rows = extractClassificationTableRows(doc);
  assert.equal(
    rows.length,
    51,
    `Expected 51 classification rows, got ${rows.length}.`
  );
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

test('audit lists all 6 thin-pool concepts as high-priority in section 4', () => {
  const doc = readAuditDoc();
  const listed = extractThinPoolConceptSection(doc);
  for (const concept of THIN_POOL_CONCEPTS) {
    assert.ok(
      listed.includes(concept),
      `Section 4 must list thin-pool concept "${concept}". ` +
        `Got: ${listed.join(', ')}`
    );
  }
  assert.equal(
    listed.length,
    THIN_POOL_CONCEPTS.length,
    `Section 4 must list exactly the 6 thin-pool concepts. ` +
      `Got ${listed.length}: ${listed.join(', ')}`
  );
});

test('every template carrying a thin-pool concept is priority=high', () => {
  // Cross-check: the narrative says templates tagged with any of the six
  // thin-pool concept ids inherit high priority. Catch drift between the
  // narrative and the table.
  const doc = readAuditDoc();
  const rows = extractClassificationTableRows(doc);
  const thinSet = new Set(THIN_POOL_CONCEPTS);
  for (const template of GRAMMAR_TEMPLATES) {
    const hasThin = template.skillIds.some((skill) => thinSet.has(skill));
    if (!hasThin) continue;
    const row = rows.find((candidate) => candidate.id === template.id);
    assert.ok(row, `Audit row missing for thin-pool template ${template.id}.`);
    assert.equal(
      row.priority,
      'high',
      `Template "${template.id}" carries thin-pool concept(s) ` +
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

test('audit table proposes exactly 31 exact and 20 non-exact specs', () => {
  // Sanity: 31 selected-response → `exact`; 20 constructed-response → one of
  // the other five declarative kinds. Catches a drift where a selected-
  // response row is proposed anything other than `exact`.
  const doc = readAuditDoc();
  const rows = extractClassificationTableRows(doc);
  const exactCount = rows.filter((row) => row.proposedKind === 'exact').length;
  const nonExactCount = rows.length - exactCount;
  assert.equal(exactCount, 31, `Expected 31 rows proposing 'exact', got ${exactCount}.`);
  assert.equal(nonExactCount, 20, `Expected 20 rows proposing a non-exact kind, got ${nonExactCount}.`);
});
