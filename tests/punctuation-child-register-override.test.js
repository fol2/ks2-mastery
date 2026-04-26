// Phase 4 U7 — child-register override layer unit tests.
//
// `punctuationChildRegisterOverride(atom, context)` is a pure helper that
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

test('U7: string override rewrites "main clauses" into "whole sentences"', () => {
  const result = punctuationChildRegisterOverrideString(
    'A semi-colon can join two closely related main clauses.',
  );
  assert.doesNotMatch(result, /main clause/i);
  assert.match(result, /whole sentence/i);
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
