// U2 (refactor ui-consolidation): canonical hero welcome-line copy helper.
//
// Grammar's `GrammarSetupScene` and Punctuation's `PunctuationSetupScene`
// both render the same hero welcome line —
// `"Hi {name} — ready for a short round?"` — inline. The duplication
// means that any future change to the phrase (tone, internationalisation,
// punctuation) silently skips one subject. This helper centralises the
// string contract in a single pure function so the `HeroWelcome` component
// (and any future subject that adopts the same line) shares one source of
// truth.
//
// Behaviour pinned by `tests/platform-hero-copy.test.js`:
//   - Non-empty, non-whitespace names render the full line.
//   - Names are trimmed before interpolation (leading / trailing spaces
//     are stripped, matching the intent of the inline callers that pass
//     `learner.name` / `learnerName` directly — both of which are user-
//     entered and can carry stray whitespace).
//   - Empty / whitespace-only / null / undefined return `''`, which the
//     component renders as `null` (line collapsed — no orphan
//     `"Hi  — ready for a short round?"` or `"Hi friend"` fallback).
//
// The em-dash is U+2014 copied byte-for-byte from the Grammar /
// Punctuation source files (both confirmed as codepoint 0x2014 prior to
// extraction). Do NOT replace with an ASCII hyphen or a U+2013 en-dash —
// CSS / typography elsewhere assumes em-dash spacing, and the characterisation
// discipline for this refactor pins the exact glyph.

/* eslint-disable */

export function heroWelcomeLine(name) {
  if (typeof name !== 'string') return '';
  const trimmed = name.trim();
  if (trimmed === '') return '';
  return `Hi ${trimmed} — ready for a short round?`;
}
