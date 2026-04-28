import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Static checks for stale patterns in Punctuation production documentation.
//
// These tests grep `docs/punctuation-production.md` for known-bad patterns
// that indicate stale or incorrect documentation.  Each check must find zero
// matches to pass.
//
// P7-U12  |  R10 (production docs match current behaviour)
// ---------------------------------------------------------------------------

const DOC_PATH = resolve(import.meta.dirname, '..', 'docs', 'punctuation-production.md');
const docContent = readFileSync(DOC_PATH, 'utf8');
const docLines = docContent.split('\n');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns an array of `{ lineNumber, text }` for every line matching `regex`.
 * `lineNumber` is 1-based for human-readable output.
 */
function grepLines(regex) {
  const hits = [];
  for (let i = 0; i < docLines.length; i++) {
    if (regex.test(docLines[i])) {
      hits.push({ lineNumber: i + 1, text: docLines[i].trim() });
    }
  }
  return hits;
}

/**
 * Returns lines matching `regex` but ONLY in learner-facing sections
 * (i.e. NOT inside "Reserved for future", "Migration from the pre-Phase-2
 * roster", or "Rollback" subsections).
 *
 * A section is considered non-learner-facing if:
 * - Its heading (any `#` level) contains one of the exclusion keywords, OR
 * - A standalone paragraph line matches an inline exclusion marker (e.g.
 *   "Reserved for future Punctuation expansions:").
 *
 * Heading-excluded sections extend until the next heading of equal or higher
 * level. Inline-excluded blocks extend until the next blank line followed by
 * a non-list, non-blank line (i.e. the next paragraph or heading).
 */
function grepLearnerFacingLines(regex) {
  const EXCLUDED_HEADING_PATTERNS = [
    /reserved/i,
    /migration/i,
    /rollback/i,
    /legacy.*parity/i,
  ];

  // Inline markers that start a non-learner-facing block (not headings).
  const EXCLUDED_INLINE_MARKERS = [
    /^reserved\s+for\s+future/i,
    /^reserved\s+creatures/i,
  ];

  let inExcludedHeading = false;
  let excludedLevel = 0;
  let inExcludedInline = false;
  const hits = [];

  for (let i = 0; i < docLines.length; i++) {
    const line = docLines[i];
    const trimmed = line.trim();
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);

    // --- Heading-based exclusion ---
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2];

      // Any heading ends an inline-excluded block.
      inExcludedInline = false;

      if (inExcludedHeading && level <= excludedLevel) {
        inExcludedHeading = false;
      }

      if (EXCLUDED_HEADING_PATTERNS.some((p) => p.test(title))) {
        inExcludedHeading = true;
        excludedLevel = level;
      }
    }

    // --- Inline marker exclusion ---
    if (!headingMatch && !inExcludedHeading && !inExcludedInline) {
      if (EXCLUDED_INLINE_MARKERS.some((p) => p.test(trimmed))) {
        inExcludedInline = true;
      }
    }

    // End inline-excluded block at a blank line followed by a non-list line,
    // or at the start of a new heading (handled above).
    if (inExcludedInline && trimmed === '') {
      // Peek ahead: if the next non-blank line is not a list item, end block.
      let j = i + 1;
      while (j < docLines.length && docLines[j].trim() === '') j++;
      if (j >= docLines.length || !docLines[j].trim().startsWith('-')) {
        inExcludedInline = false;
      }
    }

    const excluded = inExcludedHeading || inExcludedInline;
    if (!excluded && regex.test(line)) {
      hits.push({ lineNumber: i + 1, text: trimmed });
    }
  }

  return hits;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('punctuation-production.md has no triple-colon mastery key (punctuation:::)', () => {
  const hits = grepLines(/punctuation:::/);
  assert.equal(
    hits.length,
    0,
    `Found ${hits.length} triple-colon mastery key(s):\n${hits
      .map((h) => `  L${h.lineNumber}: ${h.text}`)
      .join('\n')}`,
  );
});

test('punctuation-production.md has no "Stage X of N" stale wording', () => {
  // Matches "Stage 1 of 4", "Stage 3 of 5", etc.
  const hits = grepLines(/Stage\s+\d+\s+of\s+\d+/i);
  assert.equal(
    hits.length,
    0,
    `Found ${hits.length} "Stage X of N" pattern(s):\n${hits
      .map((h) => `  L${h.lineNumber}: ${h.text}`)
      .join('\n')}`,
  );
});

test('punctuation-production.md does not use "XP" as a reward label', () => {
  // \bXP\b matches standalone "XP" but not "EXPO" or "XPath".
  const hits = grepLines(/\bXP\b/);
  assert.equal(
    hits.length,
    0,
    `Found ${hits.length} "XP" reward label(s):\n${hits
      .map((h) => `  L${h.lineNumber}: ${h.text}`)
      .join('\n')}`,
  );
});

test('punctuation-production.md has no reserved monster names in learner-facing sections', () => {
  // Reserved monster names: colisk, hyphang, carillon.
  // These may appear in migration/reserved/rollback/legacy-parity sections — that is OK.
  // They must NOT appear in learner-facing documentation sections.
  const hits = grepLearnerFacingLines(/\b(colisk|hyphang|carillon)\b/i);
  assert.equal(
    hits.length,
    0,
    `Found ${hits.length} reserved monster name(s) in learner-facing sections:\n${hits
      .map((h) => `  L${h.lineNumber}: ${h.text}`)
      .join('\n')}`,
  );
});

test('punctuation-production.md mastery key example uses real format', () => {
  // The doc must contain the real mastery key format with all 4 components.
  // Format: punctuation:<releaseId>:<clusterId>:<rewardUnitId>
  const hasRealFormat = /punctuation:<releaseId>:<clusterId>:<rewardUnitId>/.test(docContent);
  assert.ok(
    hasRealFormat,
    'Expected the document to contain "punctuation:<releaseId>:<clusterId>:<rewardUnitId>" as the mastery key example',
  );
});

test('punctuation-production.md documents the star-evidence-updated domain event', () => {
  const hits = grepLines(/punctuation\.star-evidence-updated/);
  assert.ok(
    hits.length > 0,
    'Expected the document to mention the punctuation.star-evidence-updated domain event (P7-U4)',
  );
});

test('punctuation-production.md documents the Punctuation Doctor diagnostic', () => {
  const hits = grepLines(/punctuation-diagnostic/);
  assert.ok(
    hits.length > 0,
    'Expected the document to mention the punctuation-diagnostic admin command (P7-U8)',
  );
});

test('punctuation-production.md documents generated practice guardrails', () => {
  for (const pattern of [
    /generatedPerFamily:\s*1/,
    /templateId/,
    /variantSignature/,
    /runtime AI/,
    /audit:punctuation-content/,
    /generated-per-family 4/,
  ]) {
    assert.match(docContent, pattern);
  }
});

test('punctuation-production.md documents time-windowed telemetry caps', () => {
  const hits = grepLines(/rolling.*7-day|7-day.*window|time-windowed/i);
  assert.ok(
    hits.length > 0,
    'Expected the document to mention the rolling 7-day telemetry window (P7-U6)',
  );
});

test('punctuation-production.md labels aspirational sections explicitly', () => {
  // The aspirational telemetry section heading must contain [ASPIRATIONAL]
  const hits = grepLines(/aspirational.*\[ASPIRATIONAL\]|\[ASPIRATIONAL\].*aspirational/i);
  assert.ok(
    hits.length > 0,
    'Expected the aspirational telemetry section heading to be labelled [ASPIRATIONAL]',
  );
});
