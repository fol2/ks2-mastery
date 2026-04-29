/**
 * Semantic explanation lint — verifies that each generated explanation
 * is semantically consistent with its rule family, not merely non-generic.
 *
 * Admin/test-only utility. NEVER exposed to children.
 */

/**
 * Lint rule definitions keyed by ruleId prefix.
 * Each entry specifies keywords that MUST appear (case-insensitive substring).
 * At least one keyword from each `anyOf` group must be present.
 */
const LINT_RULES = Object.freeze({
  'speech': {
    anyOf: [['inverted comma', 'speech mark', 'quotation mark', 'inverted commas', 'speech marks']],
  },
  'apostrophe.possession-singular': {
    anyOf: [["apostrophe", "'s"]],
    description: 'Must mention apostrophe or possessive marker',
  },
  'apostrophe.possession-plural': {
    anyOf: [["apostrophe", "'s"]],
    description: 'Must mention apostrophe or possessive marker',
  },
  'apostrophe.possession-mixed': {
    anyOf: [['apostrophe']],
  },
  'apostrophe.contraction': {
    anyOf: [['apostrophe']],
  },
  'list.comma-separation': {
    anyOf: [['comma', 'commas']],
    allOf: [],
  },
  'colon.complete-introduction': {
    anyOf: [['colon']],
    requireAny: [['introduces', 'complete', 'opening', 'sets it up', 'sentence']],
  },
  'semicolon.independent-clauses': {
    anyOf: [['semicolon', 'semi-colon']],
    requireAny: [['complete sentence', 'closely related', 'main clause', 'independent', 'stand alone', 'related']],
  },
  'semicolon.complex-list': {
    anyOf: [['semicolon', 'semi-colon']],
    requireAny: [['list', 'complex', 'commas', 'group', 'items']],
  },
  'bullet.stem-consistency': {
    anyOf: [['consistent', 'consistency', 'punctuation pattern', 'same']],
  },
  'bullet.colon-and-consistency': {
    anyOf: [['colon', 'consistent', 'consistency', 'bullet', 'punctuation pattern']],
  },
  'fronted-adverbial.comma-after-opener': {
    anyOf: [['comma']],
    requireAny: [['opener', 'adverbial', 'fronted', 'opening', 'main clause', 'phrase']],
  },
  'hyphen.compound-modifier': {
    anyOf: [['hyphen']],
  },
  'parenthesis.additional-information': {
    anyOf: [['extra', 'removed', 'set off', 'parenthetical', 'bracket', 'parenthesis', 'additional']],
  },
  'dash.clause-separation': {
    anyOf: [['dash']],
    requireAny: [['independent', 'related', 'surprise', 'contrast', 'ideas', 'clauses']],
  },
  'sentence-ending.terminal-mark': {
    anyOf: [['capital', 'end', 'full stop', 'question', 'exclamation', 'statement']],
  },
  'comma.clarity': {
    anyOf: [['comma']],
    requireAny: [['opening', 'phrase', 'misreading', 'clear', 'main clause']],
  },
  'mixed.fronted-speech': {
    anyOf: [['comma', 'inverted comma', 'speech mark', 'inverted commas']],
  },
  'mixed.parenthesis-speech': {
    anyOf: [['parenthetical', 'extra', 'inverted comma', 'speech', 'removable', 'set off']],
  },
  'mixed.colon-semicolon': {
    anyOf: [['colon', 'semicolon', 'semi-colon']],
  },
});

/**
 * Check whether a text contains at least one keyword from a list (case-insensitive).
 */
function containsAny(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * Resolve the lint rule for a given ruleId.
 * Tries exact match first, then prefix match.
 */
function resolveRule(ruleId) {
  if (!ruleId) return null;
  // Exact match
  if (LINT_RULES[ruleId]) return LINT_RULES[ruleId];
  // Prefix match (e.g. 'speech.inverted-comma-enclosure' matches 'speech')
  for (const prefix of Object.keys(LINT_RULES)) {
    if (ruleId.startsWith(prefix)) return LINT_RULES[prefix];
  }
  return null;
}

/**
 * Lint a single explanation against its rule family.
 *
 * @param {string} explanation - The explanation text to lint
 * @param {string} ruleId - The explanationRuleId assigned to the template
 * @param {object} [itemContext] - Optional context (for future extensions)
 * @returns {{ pass: boolean, violations: string[] }}
 */
export function lintExplanation(explanation, ruleId, itemContext = {}) {
  const violations = [];

  if (!explanation || typeof explanation !== 'string') {
    violations.push('Explanation is empty or not a string');
    return { pass: false, violations };
  }

  if (!ruleId || typeof ruleId !== 'string') {
    violations.push('explanationRuleId is missing or not a string');
    return { pass: false, violations };
  }

  const rule = resolveRule(ruleId);
  if (!rule) {
    // Unknown ruleId — pass silently to allow future expansion
    return { pass: true, violations: [] };
  }

  // Check anyOf groups — at least one keyword from each group must appear
  if (rule.anyOf) {
    for (const group of rule.anyOf) {
      if (!containsAny(explanation, group)) {
        violations.push(
          `Explanation for rule "${ruleId}" must contain one of: ${group.join(', ')}`,
        );
      }
    }
  }

  // Check requireAny groups — at least one keyword from each group must appear
  if (rule.requireAny) {
    for (const group of rule.requireAny) {
      if (!containsAny(explanation, group)) {
        violations.push(
          `Explanation for rule "${ruleId}" must also contain one of: ${group.join(', ')}`,
        );
      }
    }
  }

  return { pass: violations.length === 0, violations };
}

/**
 * Lint all items in a batch. Returns summary with per-item results.
 *
 * @param {Array<{explanation: string, explanationRuleId: string}>} items
 * @returns {{ allPass: boolean, results: Array<{id: string, pass: boolean, violations: string[]}> }}
 */
export function lintExplanationBatch(items) {
  const results = [];
  for (const item of items) {
    const { pass, violations } = lintExplanation(
      item.explanation,
      item.explanationRuleId,
      { id: item.id, familyId: item.generatorFamilyId },
    );
    results.push({ id: item.id || '(unknown)', pass, violations });
  }
  return {
    allPass: results.every((r) => r.pass),
    results,
  };
}
