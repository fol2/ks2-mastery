// Phase 4 U7 — child-register override layer unit tests.
//
// `punctuationChildRegisterOverride(atom)` is a pure helper that
// intercepts Worker-sourced teach-box atoms (or stand-alone strings) and
// rewrites adult grammar terminology into child-register equivalents at
// display time. The engine files `shared/punctuation/marking.js` and
// `shared/punctuation/generators.js` are scope-locked by the oracle replay
// (`tests/punctuation-legacy-parity.test.js`) and ship the adult terms
// `fronted adverbial`, `main clause`, `complete clause`, `subordinate
// clause`, `compound sentence`, `complex sentence` in their `note` /
// `prompt` output. The client-side override layer is R8's only edit-safe
// knob: take the Worker payload, run every user-visible string through
// this helper, and return a version fit for a KS2 reader.
//
// The override table itself is `PUNCTUATION_CHILD_REGISTER_OVERRIDES` — a
// frozen Map<adultPhrase, childPhrase>. The helper applies longest-match
// first so multi-word phrases (`complex sentence`) win over shorter
// overlapping ones (`sentence`) and so the replacement is stable across
// call sites. Case is preserved: a capitalised adult term ("Fronted
// adverbial") returns the capitalised child term ("Starter phrase").

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PUNCTUATION_ATOM_OVERRIDE_FIELDS,
  PUNCTUATION_CHILD_FORBIDDEN_TERMS,
  PUNCTUATION_CHILD_REGISTER_OVERRIDES,
  punctuationChildRegisterOverride,
  punctuationChildRegisterOverrideString,
} from '../src/subjects/punctuation/components/punctuation-view-model.js';

// --- Override table fixture integrity ---------------------------------------

test('U7: PUNCTUATION_CHILD_REGISTER_OVERRIDES is frozen + non-empty', () => {
  assert.ok(
    PUNCTUATION_CHILD_REGISTER_OVERRIDES,
    'override table must be exported',
  );
  // Frozen so a rogue consumer cannot mutate the mapping at runtime.
  assert.equal(
    Object.isFrozen(PUNCTUATION_CHILD_REGISTER_OVERRIDES),
    true,
    'PUNCTUATION_CHILD_REGISTER_OVERRIDES must stay frozen',
  );
  const entries = Object.entries(PUNCTUATION_CHILD_REGISTER_OVERRIDES);
  assert.ok(
    entries.length >= 4,
    `override table must cover at least 4 adult phrases, saw ${entries.length}`,
  );
});

test('U7: override table covers every forbidden adult phrase', () => {
  // R8 requires: fronted adverbial, main clause, complete clause,
  // subordinate (clause). Each of these must appear as a key in the
  // override table so the helper can rewrite them. Any future additions
  // land here first.
  const keys = Object.keys(PUNCTUATION_CHILD_REGISTER_OVERRIDES)
    .map((key) => key.toLowerCase());
  assert.ok(keys.includes('fronted adverbial'), 'fronted adverbial missing');
  assert.ok(keys.includes('main clause'), 'main clause missing');
  assert.ok(keys.includes('complete clause') || keys.includes('opening clause'),
    'complete / opening clause missing');
  assert.ok(
    keys.some((k) => k.startsWith('subordinate')),
    'subordinate family missing',
  );
});

test('U7: PUNCTUATION_CHILD_FORBIDDEN_TERMS includes the new adult grammar terms', () => {
  // Fixture extension — the cross-boundary sweep is only as strong as the
  // terms it iterates. The four adult phrases R8 calls out must be in the
  // frozen list so `isPunctuationChildCopy` and every scene test catches
  // a leak.
  const terms = PUNCTUATION_CHILD_FORBIDDEN_TERMS
    .filter((t) => typeof t === 'string')
    .map((t) => t.toLowerCase());
  assert.ok(terms.includes('fronted adverbial'), '`fronted adverbial` missing from forbidden list');
  assert.ok(terms.includes('main clause'), '`main clause` missing from forbidden list');
  assert.ok(terms.includes('complete clause'), '`complete clause` missing from forbidden list');
  assert.ok(terms.includes('subordinate'), '`subordinate` missing from forbidden list');
});

// --- punctuationChildRegisterOverrideString ---------------------------------

test('U7: string override rewrites a "fronted adverbial" phrase into "starter phrase"', () => {
  const result = punctuationChildRegisterOverrideString('The fronted adverbial needs a comma.');
  assert.doesNotMatch(result, /fronted adverbial/i);
  assert.match(result, /starter phrase/i);
});

test('U7: string override rewrites "main clauses" into child-register equivalent ("ideas")', () => {
  // Review follow-on FINDING B: pedagogy fix — the prior mapping
  // produced "two closely related whole sentences" which reinforces the
  // comma-splicing mental model ("whole sentence" = "complete standalone
  // sentence ending in a full stop"). The new mapping collapses
  // "main clause" → "idea" so the rendered copy reads as "two closely
  // related ideas" which is the correct semicolon pedagogy.
  const result = punctuationChildRegisterOverrideString(
    'A semi-colon can join two closely related main clauses.',
  );
  assert.doesNotMatch(result, /main clause/i);
  assert.doesNotMatch(result, /whole sentence/i);
  assert.match(result, /\bideas\b/i);
});

test('U7: string override rewrites "complete clause" into child register', () => {
  const result = punctuationChildRegisterOverrideString(
    'A colon can introduce a list after a complete clause.',
  );
  assert.doesNotMatch(result, /complete clause/i);
});

test('U7: string override rewrites "subordinate clause" into child register', () => {
  const result = punctuationChildRegisterOverrideString(
    'A subordinate clause adds extra information.',
  );
  assert.doesNotMatch(result, /subordinate clause/i);
  assert.doesNotMatch(result, /subordinate/i);
});

test('U7: string override preserves capitalisation (Fronted adverbial → Starter phrase)', () => {
  const result = punctuationChildRegisterOverrideString('Fronted adverbial rule.');
  // Capitalised input → capitalised output.
  assert.match(result, /^Starter phrase/);
});

test('U7: string override is idempotent (running twice = running once)', () => {
  const once = punctuationChildRegisterOverrideString(
    'Two related main clauses joined by a semi-colon.',
  );
  const twice = punctuationChildRegisterOverrideString(once);
  assert.equal(once, twice);
});

test('U7: string override passes through text with no forbidden terms unchanged', () => {
  const input = 'Put a comma after the opening phrase like At last.';
  const result = punctuationChildRegisterOverrideString(input);
  assert.equal(result, input);
});

test('U7: string override handles empty / null / undefined input safely', () => {
  assert.equal(punctuationChildRegisterOverrideString(''), '');
  assert.equal(punctuationChildRegisterOverrideString(null), '');
  assert.equal(punctuationChildRegisterOverrideString(undefined), '');
  assert.equal(punctuationChildRegisterOverrideString(42), '');
});

// --- punctuationChildRegisterOverride (atom) --------------------------------

test('U7: atom override rewrites rule / note / prompt text field', () => {
  const atom = {
    rule: 'Put a comma after a fronted adverbial.',
    note: 'A main clause follows the comma.',
    prompt: 'Correct the comma after the fronted adverbial.',
  };
  const out = punctuationChildRegisterOverride(atom);
  assert.doesNotMatch(out.rule, /fronted adverbial/i);
  assert.doesNotMatch(out.note, /main clause/i);
  assert.doesNotMatch(out.prompt, /fronted adverbial/i);
});

test('U7: atom override leaves unrelated fields untouched', () => {
  const atom = {
    rule: 'Put a comma after a fronted adverbial.',
    id: 'fronted_adverbial',
    inputKind: 'text',
  };
  const out = punctuationChildRegisterOverride(atom);
  assert.equal(out.id, 'fronted_adverbial');
  assert.equal(out.inputKind, 'text');
});

test('U7: atom override rewrites nested teachBox rule field', () => {
  const atom = {
    teachBox: {
      name: 'Comma after the opener',
      rule: 'Put a comma after a fronted adverbial.',
    },
  };
  const out = punctuationChildRegisterOverride(atom);
  assert.doesNotMatch(out.teachBox.rule, /fronted adverbial/i);
});

test('U7: atom override is safe on null / undefined input', () => {
  // Defence: a rogue payload or an undefined upstream branch should not
  // crash the render; the helper passes nullish through unchanged.
  assert.equal(punctuationChildRegisterOverride(null), null);
  assert.equal(punctuationChildRegisterOverride(undefined), undefined);
});

test('U7: atom override returns an object when input is an object with no rule field', () => {
  const atom = { id: 'fa_item', inputKind: 'text' };
  const out = punctuationChildRegisterOverride(atom);
  // Same shape, nothing thrown, nothing lost.
  assert.equal(out.id, 'fa_item');
  assert.equal(out.inputKind, 'text');
});

test('U7: atom override accepts a plain string (convenience path)', () => {
  // Some display call sites only have a string handy (a feedback body
  // line, a scalar rule) — the helper accepts string input and delegates
  // to the string override so a caller never has to remember which
  // variant to use.
  const out = punctuationChildRegisterOverride('The fronted adverbial needs a comma.');
  assert.doesNotMatch(out, /fronted adverbial/i);
});

// --- Review follow-on FINDING D — longest-match invariant computed, not
// comment-enforced. We cannot directly iterate the internal ordered
// array (it's module-private), but we can verify the property via an
// end-to-end probe: a longer phrase + its shorter substring both seeded
// in the same input should still produce the longer replacement first.
// If the longest-match invariant broke, "complex sentences" would see
// "sentence" swap first and leave "complex sentence-with-an-added-idea".

test('U7 FINDING D: longest-match invariant holds regardless of author order', () => {
  // Override table contains both "complex sentence" (longer) and
  // implicitly matches shorter overlapping families. The longest-match
  // pass must swap "complex sentence" WHOLE, not leave "complex " +
  // shorter replacement fragments.
  const out = punctuationChildRegisterOverrideString(
    'Two complex sentences joined with and.',
  );
  assert.doesNotMatch(out, /complex sentences?/i, 'longer phrase must be swapped whole');
  // And the specific authored child phrase must appear.
  assert.match(out, /sentences with an added idea/i);
});

test('U7 FINDING D: PUNCTUATION_CHILD_REGISTER_OVERRIDES is stable under a frozen schema probe', () => {
  // The entry array is not exported, but the frozen object view is.
  // Probe that the longer "main clauses" entry ends up winning over the
  // shorter "subordinate" single-word entry when both could theoretically
  // match a sample input.
  const out = punctuationChildRegisterOverrideString(
    'Main clauses follow the subordinate opener.',
  );
  assert.doesNotMatch(out, /main clauses?/i);
  assert.doesNotMatch(out, /\bsubordinate\b/i);
});

// --- Review follow-on FINDING E — table-driven coverage. Every entry in
// PUNCTUATION_CHILD_REGISTER_OVERRIDES must be exercised in isolation
// and every atom-walker field must be covered.

test('U7 FINDING E: every PUNCTUATION_CHILD_REGISTER_OVERRIDES entry rewrites in isolation', () => {
  const entries = Object.entries(PUNCTUATION_CHILD_REGISTER_OVERRIDES);
  assert.ok(entries.length >= 10, `expected >= 10 entries, saw ${entries.length}`);
  for (const [adult, child] of entries) {
    // Seed the adult phrase inside a natural sentence so the `\b`
    // word-boundary regex triggers correctly.
    const input = `Before we look at ${adult} in this rule.`;
    const out = punctuationChildRegisterOverrideString(input);
    assert.doesNotMatch(
      out,
      new RegExp(`\\b${adult}\\b`, 'i'),
      `adult phrase "${adult}" must be rewritten`,
    );
    // The emitted child phrase should appear case-insensitively. The
    // emitted text uses the case-preserving helper so lower-case input
    // stays lower-case — no capitalisation adjustment needed.
    assert.ok(
      out.toLowerCase().includes(child.toLowerCase()),
      `rewritten output must contain "${child}" for "${adult}" — got ${JSON.stringify(out)}`,
    );
  }
});

test('U7 FINDING E: every PUNCTUATION_ATOM_OVERRIDE_FIELDS entry is walked by the atom override', () => {
  assert.ok(Array.isArray(PUNCTUATION_ATOM_OVERRIDE_FIELDS));
  assert.ok(
    PUNCTUATION_ATOM_OVERRIDE_FIELDS.length >= 6,
    `expected >= 6 walker fields, saw ${PUNCTUATION_ATOM_OVERRIDE_FIELDS.length}`,
  );
  // Build a single atom that seeds EVERY walker field with an adult
  // term, run the override, then assert every field was rewritten.
  const seed = 'The fronted adverbial needs a comma.';
  const atom = {};
  for (const field of PUNCTUATION_ATOM_OVERRIDE_FIELDS) atom[field] = seed;
  const out = punctuationChildRegisterOverride(atom);
  for (const field of PUNCTUATION_ATOM_OVERRIDE_FIELDS) {
    assert.doesNotMatch(
      out[field],
      /fronted adverbial/i,
      `field "${field}" must be walked by the atom override`,
    );
  }
});

// --- Review follow-on FINDING F — `\b` word-boundary anchors.

test('U7 FINDING F: override pattern does not match inside a compound word (insubordinate)', () => {
  // Without `\b` anchors, the entry ['subordinate', 'added idea'] would
  // rewrite "insubordinate" into "inadded idea" — a latent trap. The
  // word-boundary wrap keeps the rewrite scoped to whole-word matches.
  const input = 'The insubordinate pupil stood up.';
  const out = punctuationChildRegisterOverrideString(input);
  assert.match(out, /\binsubordinate\b/i, 'insubordinate must remain intact');
  assert.doesNotMatch(out, /inadded idea/i, 'must not produce "inadded idea"');
});

test('U7 FINDING F: override still rewrites the whole-word adult phrase when present', () => {
  // Paired positive assertion: the boundary anchor still fires on the
  // real adult phrase, so the fix does not accidentally de-fang the
  // override.
  const input = 'The subordinate ideas follow the main idea.';
  const out = punctuationChildRegisterOverrideString(input);
  assert.doesNotMatch(out, /\bsubordinate\b/i);
});

test('U7 FINDING F: override does not match adult phrase fragments across hyphens', () => {
  // `main-clause-joined` (hyphenated) must still match because `\b`
  // treats a hyphen as a word boundary. The `main clause` pattern only
  // targets the space-separated phrase, so the hyphenated form stays
  // as-is (the author's choice).
  const input = 'The main-clause joiner was listed.';
  const out = punctuationChildRegisterOverrideString(input);
  // The hyphenated `main-clause` should survive — no space-separated
  // "main clause" phrase is present to match.
  assert.match(out, /main-clause/i);
});

// --- Review follow-on FINDING G — atom-walker recurses workedExample /
// contrastExample nested string fields.

test('U7 FINDING G: atom override recurses workedExample.before / after string fields', () => {
  const atom = {
    rule: 'Use a semi-colon.',
    workedExample: {
      before: 'Two main clauses without a semi-colon.',
      after: 'Two main clauses joined by a semi-colon.',
    },
  };
  const out = punctuationChildRegisterOverride(atom);
  assert.doesNotMatch(out.workedExample.before, /main clause/i);
  assert.doesNotMatch(out.workedExample.after, /main clause/i);
  // Preservation: the comma + semi-colon punctuation is untouched.
  assert.match(out.workedExample.after, /joined by a semi-colon/i);
});

test('U7 FINDING G: atom override recurses contrastExample.before / after string fields', () => {
  const atom = {
    contrastExample: {
      before: 'A fronted adverbial without a comma.',
      after: 'A fronted adverbial, with a comma.',
    },
  };
  const out = punctuationChildRegisterOverride(atom);
  assert.doesNotMatch(out.contrastExample.before, /fronted adverbial/i);
  assert.doesNotMatch(out.contrastExample.after, /fronted adverbial/i);
});

test('U7 FINDING G: atom override recurses teachBox.workedExample + teachBox.contrastExample', () => {
  // Worker guided-mode payloads put workedExample + contrastExample
  // INSIDE the teachBox wrapper. The walker must recurse both levels.
  const atom = {
    teachBox: {
      name: 'Semi-colons between related clauses',
      rule: 'A semi-colon can join two closely related main clauses.',
      workedExample: {
        before: 'Two main clauses without a semi-colon.',
        after: 'Two main clauses joined by a semi-colon.',
      },
      contrastExample: {
        before: 'A fronted adverbial without a comma.',
        after: 'A fronted adverbial, with a comma.',
      },
    },
  };
  const out = punctuationChildRegisterOverride(atom);
  assert.doesNotMatch(out.teachBox.rule, /main clause/i);
  assert.doesNotMatch(out.teachBox.workedExample.before, /main clause/i);
  assert.doesNotMatch(out.teachBox.workedExample.after, /main clause/i);
  assert.doesNotMatch(out.teachBox.contrastExample.before, /fronted adverbial/i);
  assert.doesNotMatch(out.teachBox.contrastExample.after, /fronted adverbial/i);
});

test('U7 FINDING G: PUNCTUATION_ATOM_OVERRIDE_FIELDS is exported + frozen', () => {
  assert.ok(Array.isArray(PUNCTUATION_ATOM_OVERRIDE_FIELDS));
  assert.equal(Object.isFrozen(PUNCTUATION_ATOM_OVERRIDE_FIELDS), true);
  // Baseline fields must remain covered — removing one is a regression.
  assert.ok(PUNCTUATION_ATOM_OVERRIDE_FIELDS.includes('rule'));
  assert.ok(PUNCTUATION_ATOM_OVERRIDE_FIELDS.includes('note'));
  assert.ok(PUNCTUATION_ATOM_OVERRIDE_FIELDS.includes('prompt'));
  assert.ok(PUNCTUATION_ATOM_OVERRIDE_FIELDS.includes('body'));
  assert.ok(PUNCTUATION_ATOM_OVERRIDE_FIELDS.includes('headline'));
  assert.ok(PUNCTUATION_ATOM_OVERRIDE_FIELDS.includes('displayCorrection'));
});
