// Phase 4 U12 — doc-gate for the Grammar content-expansion audit.
//
// The audit file at `docs/plans/james/grammar/grammar-content-expansion-audit.md`
// is the Phase 5 backlog. This gate asserts the doc exists, parses the concept
// table, and verifies the structural claims that drive Phase 5 prioritisation:
//
//   * Exactly 18 concept rows (one per member of GRAMMAR_AGGREGATE_CONCEPTS).
//   * Thin-pool flag is `true` for exactly the six ground-truth concepts
//     (pronouns_cohesion, formality, active_passive, subject_object,
//     modal_verbs, hyphen_ambiguity) and `false` for the other twelve.
//   * `active_passive` and `subject_object` are flagged as
//     single-question-type in the "Especially brittle" section with HIGHEST
//     priority.
//   * Each of the six thin-pool concepts has at least five new template
//     ideas listed in its dedicated new-template-ideas subsection.
//
// The gate deliberately does NOT inspect `content.js` — it characterises the
// doc alone. A Phase 5 migration that adds templates will update this doc in
// the same PR and the gate will continue to pass so long as the concept row
// count stays at 18 and the thin-pool list is refreshed to match the new
// template counts.
//
// UK English; no emojis.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC_PATH = path.resolve(
  __dirname,
  '..',
  'docs',
  'plans',
  'james',
  'grammar',
  'grammar-content-expansion-audit.md',
);

const EXPECTED_CONCEPTS = [
  'sentence_functions',
  'word_classes',
  'noun_phrases',
  'adverbials',
  'clauses',
  'relative_clauses',
  'tense_aspect',
  'standard_english',
  'pronouns_cohesion',
  'formality',
  'active_passive',
  'subject_object',
  'modal_verbs',
  'parenthesis_commas',
  'speech_punctuation',
  'apostrophes_possession',
  'boundary_punctuation',
  'hyphen_ambiguity',
];

const EXPECTED_THIN_POOL = new Set([
  'pronouns_cohesion',
  'formality',
  'active_passive',
  'subject_object',
  'modal_verbs',
  'hyphen_ambiguity',
]);

function readDoc() {
  return fs.readFileSync(DOC_PATH, 'utf8');
}

function parseConceptTable(source) {
  // The concept table lives under the `## Concept table` heading and ends at
  // the next `##` heading. It is a standard pipe-separated Markdown table.
  const start = source.indexOf('## Concept table');
  assert.ok(start !== -1, 'Concept table heading is missing from the audit doc.');
  const nextHeadingIndex = source.indexOf('\n## ', start + '## Concept table'.length);
  const body = nextHeadingIndex === -1 ? source.slice(start) : source.slice(start, nextHeadingIndex);
  const lines = body.split('\n');

  const rowLines = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) return false;
    // Header + separator + concept row all start with |. Skip the separator.
    if (/^\|\s*-+/.test(trimmed) || /^\|\s*:?-+/.test(trimmed)) return false;
    return true;
  });

  // First row is the header; everything else is a concept row.
  assert.ok(rowLines.length >= 2, 'Concept table has no rows.');
  const header = rowLines[0];
  const rows = rowLines.slice(1);

  const columns = header
    .split('|')
    .map((cell) => cell.trim())
    .filter(Boolean);
  const expectedColumns = [
    'Concept id',
    'Templates',
    'Types present',
    'Types absent',
    'Misconceptions covered',
    'SR / CR',
    'Thin-pool',
    'Priority',
  ];
  assert.deepEqual(columns, expectedColumns, 'Concept-table header does not match the expected column layout.');

  return rows.map((line) => {
    const cells = line
      .split('|')
      .map((cell) => cell.trim())
      .filter((cell, index, arr) => !(index === 0 && cell === '') && !(index === arr.length - 1 && cell === ''));
    return {
      conceptId: cells[0],
      templates: Number(cells[1]),
      typesPresent: cells[2]
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      typesAbsent: cells[3]
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      misconceptions: cells[4]
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      srCr: cells[5],
      thinPool: cells[6].toLowerCase() === 'true',
      priority: cells[7].toLowerCase(),
    };
  });
}

function countNewTemplateIdeas(source, conceptId) {
  // Each thin-pool subsection has a heading of the form
  // `### <conceptId> (currently ...)`. Ideas are numbered `1.` through `N.`.
  const headingRe = new RegExp(`### ${conceptId}[^\n]*`);
  const headingMatch = headingRe.exec(source);
  assert.ok(headingMatch, `Thin-pool subsection for ${conceptId} is missing.`);
  const start = headingMatch.index;
  const afterHeading = source.indexOf('\n', start) + 1;
  const nextSubheading = source.indexOf('\n### ', afterHeading);
  const nextHeading = source.indexOf('\n## ', afterHeading);
  let end = source.length;
  if (nextSubheading !== -1) end = Math.min(end, nextSubheading);
  if (nextHeading !== -1) end = Math.min(end, nextHeading);
  const block = source.slice(afterHeading, end);
  const numbered = block.match(/^\d+\.\s+\*\*/gm) || [];
  return numbered.length;
}

test('audit doc exists at the declared repo path', () => {
  assert.ok(fs.existsSync(DOC_PATH), `Expected audit doc at ${DOC_PATH}`);
});

test('audit doc declares zero contentReleaseId bump in its frontmatter', () => {
  const source = readDoc();
  // Strict match on the frontmatter key=value pair. If the doc is rewritten to
  // accompany a Phase 5 migration, the implementer must change this line.
  assert.match(source, /contentReleaseBump:\s*none/, 'contentReleaseBump must be declared as `none`.');
  assert.match(
    source,
    /contentReleaseId:\s*grammar-legacy-reviewed-2026-04-24/,
    'contentReleaseId must still be the Phase 4 legacy-reviewed id.',
  );
});

test('concept table has exactly 18 rows, one per GRAMMAR_AGGREGATE_CONCEPTS entry', () => {
  const rows = parseConceptTable(readDoc());
  assert.equal(rows.length, 18, 'Expected 18 concept rows.');
  const ids = rows.map((row) => row.conceptId);
  assert.deepEqual(
    ids.slice().sort(),
    EXPECTED_CONCEPTS.slice().sort(),
    'Concept ids in the audit doc must match GRAMMAR_AGGREGATE_CONCEPTS exactly.',
  );
});

test('thin-pool flag is true for exactly the six ground-truth concepts, false for the other twelve', () => {
  const rows = parseConceptTable(readDoc());
  const trueSet = new Set(rows.filter((row) => row.thinPool).map((row) => row.conceptId));
  const falseSet = new Set(rows.filter((row) => !row.thinPool).map((row) => row.conceptId));
  assert.equal(trueSet.size, 6, 'Thin-pool should fire for exactly six concepts.');
  assert.equal(falseSet.size, 12, 'Non-thin-pool should cover the other twelve concepts.');
  for (const id of EXPECTED_THIN_POOL) {
    assert.ok(trueSet.has(id), `${id} is missing from the thin-pool set.`);
  }
  for (const id of EXPECTED_CONCEPTS) {
    if (EXPECTED_THIN_POOL.has(id)) continue;
    assert.ok(falseSet.has(id), `${id} must be marked thin-pool=false.`);
  }
});

test('thin-pool concepts all carry the `high` priority label', () => {
  const rows = parseConceptTable(readDoc());
  for (const row of rows) {
    if (EXPECTED_THIN_POOL.has(row.conceptId)) {
      assert.equal(row.priority, 'high', `${row.conceptId} must be priority=high because it is thin-pool.`);
    }
  }
});

test('audit flags active_passive and subject_object as single-question-type (HIGHEST priority)', () => {
  const source = readDoc();
  // The "Especially brittle" section must exist, must name both concepts, and
  // must mark them as HIGHEST priority in the heading.
  const sectionStart = source.indexOf('## Especially brittle');
  assert.ok(sectionStart !== -1, 'Missing "Especially brittle" section.');
  const sectionEnd = source.indexOf('\n## ', sectionStart + 1);
  const section = sectionEnd === -1 ? source.slice(sectionStart) : source.slice(sectionStart, sectionEnd);

  assert.match(section, /### `active_passive` — both templates are `rewrite` \(HIGHEST priority\)/);
  assert.match(section, /### `subject_object` — both templates are `identify` \(HIGHEST priority\)/);

  // Double-check the concept table agrees: both concepts should have exactly
  // one entry in "Types present".
  const rows = parseConceptTable(source);
  const ap = rows.find((row) => row.conceptId === 'active_passive');
  const so = rows.find((row) => row.conceptId === 'subject_object');
  assert.ok(ap, 'active_passive row missing.');
  assert.ok(so, 'subject_object row missing.');
  assert.equal(ap.typesPresent.length, 1, 'active_passive must have exactly one question type present.');
  assert.equal(ap.typesPresent[0], 'rewrite');
  assert.equal(so.typesPresent.length, 1, 'subject_object must have exactly one question type present.');
  assert.equal(so.typesPresent[0], 'identify');
});

test('each thin-pool concept lists at least five new template ideas', () => {
  const source = readDoc();
  for (const conceptId of EXPECTED_THIN_POOL) {
    const count = countNewTemplateIdeas(source, conceptId);
    assert.ok(
      count >= 5,
      `${conceptId} must propose at least five new template ideas (found ${count}).`,
    );
  }
});

test('expanded `explain` question-type backlog is called out with high priority', () => {
  const source = readDoc();
  // The doc must carry a dedicated "Expanded `explain` question type" section
  // and must declare its priority as high.
  const sectionStart = source.indexOf('## Expanded `explain` question type');
  assert.ok(sectionStart !== -1, 'Missing expanded-explain section.');
  const sectionEnd = source.indexOf('\n## ', sectionStart + 1);
  const section = sectionEnd === -1 ? source.slice(sectionStart) : source.slice(sectionStart, sectionEnd);
  assert.match(section, /Priority: \*\*high\*\*/);
  // It must also name the two existing explain templates so the baseline is
  // explicit.
  assert.match(section, /explain_reason_choice/);
  assert.match(section, /proc2_boundary_punctuation_explain/);
});

test('Phase 5 release-id discipline is documented explicitly', () => {
  const source = readDoc();
  assert.match(
    source,
    /Bump `GRAMMAR_CONTENT_RELEASE_ID`/,
    'The release-id bump instruction must be documented for Phase 5.',
  );
  assert.match(
    source,
    /Adding a new template to `TEMPLATES` — \*\*bump required\*\*/,
    'Add-template bump trigger must be listed.',
  );
  assert.match(
    source,
    /Removing a template from `TEMPLATES` — \*\*bump required\*\*/,
    'Remove-template bump trigger must be listed.',
  );
});
