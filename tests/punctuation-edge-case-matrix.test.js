/**
 * Edge-case accept/reject matrix for all 14 punctuation skills.
 *
 * Each skill has a `describe` block with at least 3 accept cases and 2 reject
 * cases, all verified through the production markPunctuationAnswer function.
 *
 * House-style policies tested:
 *   - Oxford comma optional (accepted but not required)
 *   - Straight and curly quotes both accepted for speech
 *   - Terminal possessive apostrophe before noun preserved (teachers' notices)
 *   - Bullet lists accept consistent no-punctuation or full-stop styles
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { markPunctuationAnswer } from '../shared/punctuation/marking.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function accepts(item, typed, label) {
  test(`ACCEPT: ${label}`, () => {
    const result = markPunctuationAnswer({ item, answer: { typed } });
    assert.equal(result.correct, true, `Expected accept but was rejected. Tags: ${JSON.stringify(result.misconceptionTags)}`);
  });
}

function rejects(item, typed, label) {
  test(`REJECT: ${label}`, () => {
    const result = markPunctuationAnswer({ item, answer: { typed } });
    assert.equal(result.correct, false, `Expected reject but was accepted.`);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. SENTENCE ENDINGS
// ═══════════════════════════════════════════════════════════════════════════════

describe('sentence_endings', () => {
  const statementItem = {
    id: 'edge_se_1',
    mode: 'insert',
    skillIds: ['sentence_endings'],
    model: 'The lighthouse warned the ships.',
    accepted: ['The lighthouse warned the ships.'],
    misconceptionTags: ['endmarks.full_stop_missing', 'endmarks.capitalisation_missing'],
  };

  const questionItem = {
    id: 'edge_se_2',
    mode: 'insert',
    skillIds: ['sentence_endings'],
    model: 'Where is the tide bell?',
    accepted: ['Where is the tide bell?'],
    misconceptionTags: ['endmarks.question_mark_missing', 'endmarks.capitalisation_missing'],
  };

  const exclamationItem = {
    id: 'edge_se_3',
    mode: 'insert',
    skillIds: ['sentence_endings'],
    model: 'What a bright signal!',
    accepted: ['What a bright signal!'],
    misconceptionTags: ['endmarks.exclamation_mark_missing', 'endmarks.capitalisation_missing'],
  };

  accepts(statementItem, 'The lighthouse warned the ships.', 'statement with full stop');
  accepts(questionItem, 'Where is the tide bell?', 'question with question mark');
  accepts(exclamationItem, 'What a bright signal!', 'exclamation with exclamation mark');

  rejects(statementItem, 'the lighthouse warned the ships.', 'missing capital letter');
  rejects(questionItem, 'Where is the tide bell.', 'question terminated with full stop');
  rejects(exclamationItem, 'What a bright signal', 'missing terminal punctuation');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. LIST COMMAS
// ═══════════════════════════════════════════════════════════════════════════════

describe('list_commas', () => {
  const item = {
    id: 'edge_lc_1',
    mode: 'insert',
    skillIds: ['list_commas'],
    model: 'We packed ropes, maps and snacks.',
    validator: {
      type: 'requiresListCommas',
      items: ['ropes', 'maps', 'snacks'],
    },
    misconceptionTags: ['comma.list_separator_missing'],
  };

  accepts(item, 'We packed ropes, maps and snacks.', 'standard KS2 list (no Oxford comma)');
  accepts(item, 'We packed ropes, maps, and snacks.', 'Oxford comma optional — accepted');
  accepts(item, 'We packed ropes,maps and snacks.', 'no space after comma still accepted by normalisation');

  rejects(item, 'We packed ropes maps and snacks.', 'no commas at all');
  rejects(item, 'we packed ropes, maps and snacks.', 'missing capital letter');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. APOSTROPHE CONTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

describe('apostrophe_contraction', () => {
  const item = {
    id: 'edge_ac_1',
    mode: 'fix',
    skillIds: ['apostrophe_contraction'],
    model: "We can't start because it's raining.",
    accepted: ["We can't start because it's raining."],
    misconceptionTags: ['apostrophe.contraction_missing'],
  };

  accepts(item, "We can't start because it's raining.", 'straight apostrophes');
  accepts(item, "We can’t start because it’s raining.", 'curly apostrophes');
  accepts(item, "We can't start because it's raining.", 'mixed straight/curly');

  rejects(item, 'We cant start because its raining.', 'missing apostrophes entirely');
  rejects(item, "We can't start because its raining.", 'one contraction fixed but not the other');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. APOSTROPHE POSSESSION
// ═══════════════════════════════════════════════════════════════════════════════

describe('apostrophe_possession', () => {
  // Singular possession
  const singularItem = {
    id: 'edge_ap_singular',
    mode: 'insert',
    skillIds: ['apostrophe_possession'],
    model: "The cat's bowl was empty.",
    validator: { type: 'requiresTokens', tokens: ["cat's"] },
    misconceptionTags: ['apostrophe.possession_missing'],
  };

  // Irregular plural possession
  const irregularItem = {
    id: 'edge_ap_irregular',
    mode: 'insert',
    skillIds: ['apostrophe_possession'],
    model: "The children's sketches covered the teacher's desk.",
    validator: { type: 'requiresTokens', tokens: ["children's", "teacher's"] },
    misconceptionTags: ['apostrophe.possession_missing'],
  };

  // Regular plural possession
  const pluralItem = {
    id: 'edge_ap_plural',
    mode: 'insert',
    skillIds: ['apostrophe_possession'],
    model: "The teachers' notices were on the wall.",
    validator: { type: 'requiresTokens', tokens: ["teachers'"] },
    misconceptionTags: ['apostrophe.possession_missing'],
  };

  accepts(singularItem, "The cat's bowl was empty.", 'singular possessive (straight)');
  accepts(singularItem, "The cat’s bowl was empty.", 'singular possessive (curly)');
  accepts(irregularItem, "The children's sketches covered the teacher's desk.", 'irregular plural + singular');
  accepts(pluralItem, "The teachers' notices were on the wall.", 'regular plural possessive with terminal apostrophe');

  rejects(singularItem, 'The cats bowl was empty.', 'missing possessive apostrophe');
  rejects(irregularItem, "The childrens sketches covered the teachers desk.", 'no apostrophes at all');
  rejects(pluralItem, "The teacher's notices were on the wall.", 'singular form where plural required');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. SPEECH
// ═══════════════════════════════════════════════════════════════════════════════

describe('speech', () => {
  const questionItem = {
    id: 'edge_sp_q',
    mode: 'insert',
    skillIds: ['speech'],
    model: 'Maya asked, "Can we start now?"',
    rubric: {
      type: 'speech',
      reportingPosition: 'before',
      spokenWords: 'can we start now',
      requiredTerminal: '?',
    },
    misconceptionTags: ['speech.quote_missing', 'speech.punctuation_missing'],
  };

  const statementItem = {
    id: 'edge_sp_s',
    mode: 'insert',
    skillIds: ['speech'],
    model: 'Ravi said, "The bell is ringing."',
    rubric: {
      type: 'speech',
      reportingPosition: 'before',
      spokenWords: 'the bell is ringing',
      requiredTerminal: '.',
    },
    misconceptionTags: ['speech.quote_missing', 'speech.punctuation_missing'],
  };

  const exclamationItem = {
    id: 'edge_sp_e',
    mode: 'insert',
    skillIds: ['speech'],
    model: 'Ella shouted, "Watch out for the wave!"',
    rubric: {
      type: 'speech',
      reportingPosition: 'before',
      spokenWords: 'watch out for the wave',
      requiredTerminal: '!',
    },
    misconceptionTags: ['speech.quote_missing', 'speech.punctuation_missing'],
  };

  accepts(questionItem, 'Maya asked, "Can we start now?"', 'reporting-before with straight quotes');
  accepts(questionItem, 'Maya asked, “Can we start now?”', 'reporting-before with curly quotes');
  accepts(statementItem, 'Ravi said, "The bell is ringing."', 'statement inside speech marks');
  accepts(exclamationItem, 'Ella shouted, "Watch out for the wave!"', 'exclamation inside speech marks');

  rejects(questionItem, 'Maya asked, Can we start now?', 'missing inverted commas');
  rejects(questionItem, 'Maya asked, "Can we start now?".', 'duplicated punctuation outside quote');
  rejects(statementItem, 'Ravi said, "the bell is ringing."', 'missing capital on spoken words');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. FRONTED ADVERBIAL
// ═══════════════════════════════════════════════════════════════════════════════

describe('fronted_adverbial', () => {
  const shortItem = {
    id: 'edge_fa_short',
    mode: 'fix',
    skillIds: ['fronted_adverbial'],
    model: 'After the storm, the path was muddy.',
    validator: { type: 'startsWithPhraseComma', phrase: 'After the storm' },
    misconceptionTags: ['comma.fronted_adverbial_missing'],
  };

  const longItem = {
    id: 'edge_fa_long',
    mode: 'fix',
    skillIds: ['fronted_adverbial'],
    model: 'At the edge of the field, the coach waited.',
    validator: { type: 'startsWithPhraseComma', phrase: 'At the edge of the field' },
    misconceptionTags: ['comma.fronted_adverbial_missing'],
  };

  accepts(shortItem, 'After the storm, the path was muddy.', 'short fronted adverbial with comma');
  accepts(longItem, 'At the edge of the field, the coach waited.', 'longer phrase with comma');
  accepts(shortItem, 'After the storm,the path was muddy.', 'no space after comma (normalised)');

  rejects(shortItem, 'After the storm the path was muddy.', 'comma missing');
  rejects(longItem, 'At the edge, of the field the coach waited.', 'comma in wrong position');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. PARENTHESIS
// ═══════════════════════════════════════════════════════════════════════════════

describe('parenthesis', () => {
  const item = {
    id: 'edge_par_1',
    mode: 'fix',
    skillIds: ['parenthesis'],
    model: 'The harbour, an old fishing port, was busy.',
    validator: {
      type: 'requiresParentheticalPhrase',
      before: 'The harbour',
      phrase: 'an old fishing port',
      after: 'was busy',
    },
    misconceptionTags: ['structure.parenthesis_missing'],
  };

  accepts(item, 'The harbour, an old fishing port, was busy.', 'commas for parenthesis');
  accepts(item, 'The harbour (an old fishing port) was busy.', 'brackets for parenthesis');
  accepts(item, 'The harbour - an old fishing port - was busy.', 'dashes for parenthesis');
  accepts(item, 'The harbour – an old fishing port – was busy.', 'en-dashes for parenthesis');

  rejects(item, 'The harbour an old fishing port was busy.', 'no parenthesis punctuation');
  rejects(item, 'The harbour, an old fishing port was busy.', 'unbalanced — only opening comma');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. COMMA CLARITY
// ═══════════════════════════════════════════════════════════════════════════════

describe('comma_clarity', () => {
  const item = {
    id: 'edge_cc_1',
    mode: 'insert',
    skillIds: ['comma_clarity'],
    model: 'When the mist lifted, the tower appeared.',
    validator: { type: 'startsWithPhraseComma', phrase: 'When the mist lifted' },
    misconceptionTags: ['comma.clarity_missing'],
  };

  accepts(item, 'When the mist lifted, the tower appeared.', 'comma after subordinate clause');
  accepts(item, 'When the mist lifted,the tower appeared.', 'comma without trailing space (normalised)');
  accepts(item, 'When the mist lifted, the tower appeared!', 'alternative terminal mark accepted');

  rejects(item, 'When the mist lifted the tower appeared.', 'no comma — misread risk');
  rejects(item, 'when the mist lifted, the tower appeared.', 'missing capital letter');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. COLON LIST
// ═══════════════════════════════════════════════════════════════════════════════

describe('colon_list', () => {
  const item = {
    id: 'edge_cl_1',
    mode: 'insert',
    skillIds: ['colon_list'],
    model: 'We needed three tools: a torch, a rope and a map.',
    validator: {
      type: 'requiresColonBeforeList',
      opening: 'We needed three tools',
      items: ['a torch', 'a rope', 'a map'],
    },
    misconceptionTags: ['structure.colon_missing'],
  };

  accepts(item, 'We needed three tools: a torch, a rope and a map.', 'complete clause before colon, list after');
  accepts(item, 'We needed three tools: a torch, a rope, and a map.', 'Oxford comma variant accepted');
  accepts(item, 'We needed three tools:a torch, a rope and a map.', 'no space after colon (normalised)');

  rejects(item, 'We needed three tools a torch, a rope and a map.', 'missing colon');
  rejects(item, 'we needed three tools: a torch, a rope and a map.', 'missing capital letter');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. SEMICOLON (clause boundary)
// ═══════════════════════════════════════════════════════════════════════════════

describe('semicolon', () => {
  const item = {
    id: 'edge_semi_1',
    mode: 'fix',
    skillIds: ['semicolon'],
    model: 'The lighthouse was bright; the boats still waited.',
    validator: {
      type: 'requiresBoundaryBetweenClauses',
      left: 'The lighthouse was bright',
      right: 'the boats still waited',
      mark: ';',
    },
    misconceptionTags: ['boundary.semicolon_missing'],
  };

  accepts(item, 'The lighthouse was bright; the boats still waited.', 'semicolon between independent clauses');
  accepts(item, 'The lighthouse was bright;the boats still waited.', 'no space after semicolon (normalised)');
  accepts(item, 'The lighthouse was bright ; the boats still waited.', 'space before semicolon (normalised)');

  rejects(item, 'The lighthouse was bright, the boats still waited.', 'comma splice — not a semicolon');
  rejects(item, 'The lighthouse was bright the boats still waited.', 'no boundary mark at all');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. DASH CLAUSE
// ═══════════════════════════════════════════════════════════════════════════════

describe('dash_clause', () => {
  const item = {
    id: 'edge_dash_1',
    mode: 'combine',
    skillIds: ['dash_clause'],
    model: 'The gate was stuck – we found another path.',
    validator: {
      type: 'combineBoundaryBetweenClauses',
      left: 'The gate was stuck',
      right: 'we found another path',
      mark: '-',
    },
    misconceptionTags: ['boundary.dash_missing'],
  };

  accepts(item, 'The gate was stuck – we found another path.', 'en-dash between clauses');
  accepts(item, 'The gate was stuck — we found another path.', 'em-dash between clauses');
  accepts(item, 'The gate was stuck - we found another path.', 'spaced hyphen accepted as dash');

  rejects(item, 'The gate was stuck, we found another path.', 'comma instead of dash');
  rejects(item, 'The gate was stuck we found another path.', 'no boundary mark');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. SEMICOLON LIST
// ═══════════════════════════════════════════════════════════════════════════════

describe('semicolon_list', () => {
  const item = {
    id: 'edge_sl_1',
    mode: 'fix',
    skillIds: ['semicolon_list'],
    model: 'We visited Dover, England; Lyon, France; and Porto, Portugal.',
    validator: {
      type: 'requiresSemicolonList',
      items: ['Dover, England', 'Lyon, France', 'Porto, Portugal'],
    },
    misconceptionTags: ['structure.semicolon_list_missing'],
  };

  accepts(item, 'We visited Dover, England; Lyon, France; and Porto, Portugal.', 'complex items separated by semicolons');
  accepts(item, 'We visited Dover, England;Lyon, France;and Porto, Portugal.', 'no space after semicolons (normalised)');
  accepts(item, 'We visited Dover, England ; Lyon, France ; and Porto, Portugal.', 'space before semicolons (normalised)');

  rejects(item, 'We visited Dover, England, Lyon, France, and Porto, Portugal.', 'commas instead of semicolons');
  rejects(item, 'We visited Dover, England; Lyon, France and Porto, Portugal.', 'missing final semicolon before and');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 13. BULLET POINT
// ═══════════════════════════════════════════════════════════════════════════════

describe('bullet_point', () => {
  const itemNoPunct = {
    id: 'edge_bp_none',
    mode: 'fix',
    skillIds: ['bullet_points'],
    model: 'Pack:\n- pencils\n- rulers\n- glue sticks',
    validator: {
      type: 'requiresBulletStemAndItems',
      stem: 'Pack',
      items: ['pencils', 'rulers', 'glue sticks'],
    },
    misconceptionTags: ['structure.bullet_punctuation_inconsistent'],
  };

  const itemFullStop = {
    id: 'edge_bp_fs',
    mode: 'fix',
    skillIds: ['bullet_points'],
    model: 'Bring:\n- a coat.\n- a torch.\n- a notebook.',
    validator: {
      type: 'requiresBulletStemAndItems',
      stem: 'Bring',
      items: ['a coat', 'a torch', 'a notebook'],
    },
    misconceptionTags: ['structure.bullet_punctuation_inconsistent'],
  };

  accepts(itemNoPunct, 'Pack:\n- pencils\n- rulers\n- glue sticks', 'consistent no-punctuation style');
  accepts(itemFullStop, 'Bring:\n- a coat.\n- a torch.\n- a notebook.', 'consistent full-stop style');
  accepts(itemNoPunct, 'Pack:\n- pencils\n- rulers\n- glue sticks', 'colon/stem alignment correct');

  rejects(itemNoPunct, 'Pack:\n- pencils.\n- rulers\n- glue sticks', 'inconsistent — one full stop among bare items');
  rejects(itemFullStop, 'Bring:\n- a coat\n- a torch.\n- a notebook.', 'inconsistent — first item missing full stop');
  rejects(itemNoPunct, 'Pack\n- pencils\n- rulers\n- glue sticks', 'missing colon after stem');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 14. HYPHEN
// ═══════════════════════════════════════════════════════════════════════════════

describe('hyphen', () => {
  const wellKnown = {
    id: 'edge_hy_wk',
    mode: 'insert',
    skillIds: ['hyphen'],
    model: 'The well-known guide led us.',
    validator: { type: 'requiresHyphenatedPhrase', phrase: 'well-known guide' },
    misconceptionTags: ['boundary.hyphen_missing'],
  };

  const coldBlooded = {
    id: 'edge_hy_cb',
    mode: 'insert',
    skillIds: ['hyphen'],
    model: 'The cold-blooded reptile rested.',
    validator: { type: 'requiresHyphenatedPhrase', phrase: 'cold-blooded reptile' },
    misconceptionTags: ['boundary.hyphen_missing'],
  };

  accepts(wellKnown, 'The well-known guide led us.', 'ambiguity-avoiding compound (well-known)');
  accepts(coldBlooded, 'The cold-blooded reptile rested.', 'scientific compound (cold-blooded)');
  accepts(wellKnown, 'The well-known guide led us!', 'alternative terminal mark');

  rejects(wellKnown, 'The well known guide led us.', 'missing hyphen');
  rejects(coldBlooded, 'The cold blooded reptile rested.', 'no hyphen in compound');
  rejects(wellKnown, 'the well-known guide led us.', 'missing capital letter');
});
