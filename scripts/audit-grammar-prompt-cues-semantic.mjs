#!/usr/bin/env node
/**
 * Grammar QG P11 U4 — Semantic Prompt-Cue Audit
 *
 * Validates semantic correctness (not just structural presence) of prompt cues.
 * This audit MUST detect the exact bug classes that P10 shipped with:
 * - target-sentence resolving to grammar labels
 * - noun-phrase announced as "word"
 * - double terminal punctuation in read-aloud
 *
 * Usage:
 *   node scripts/audit-grammar-prompt-cues-semantic.mjs --seeds=1..30 --json
 */
import {
  createGrammarQuestion,
  GRAMMAR_TEMPLATE_METADATA,
} from '../worker/src/subjects/grammar/content.js';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let seedStart = 1;
let seedEnd = 30;
let jsonOutput = false;

for (const arg of args) {
  if (arg.startsWith('--seeds=')) {
    const range = arg.slice('--seeds='.length);
    const parts = range.split('..');
    seedStart = parseInt(parts[0], 10) || 1;
    seedEnd = parseInt(parts[1], 10) || seedStart;
  }
  if (arg === '--json') jsonOutput = true;
}

// ---------------------------------------------------------------------------
// Severity definitions
// ---------------------------------------------------------------------------

const SEVERITY = { S0: 'S0', S1: 'S1', S2: 'S2' };

// ---------------------------------------------------------------------------
// Audit checks — each returns an array of findings (empty = pass)
// ---------------------------------------------------------------------------

const GRAMMAR_LABEL_RE = /^(subject|object|adverbs?|determiners?|pronouns?|conjunctions?|nouns?|verbs?|adjectives?)$/i;
const DUPLICATE_PUNCT_RE = /[.!?]{2,}$/;
const KIND_PHRASE_MAP = {
  'noun-phrase': 'noun phrase',
  'group': 'group',
  'pair': 'pair',
};

/**
 * Check 1: target-sentence has no sentence-like target
 * (targetText is null or < 16 chars)
 */
function checkTargetSentenceResolution(q) {
  if (!q.focusCue || q.focusCue.type !== 'target-sentence') return [];
  const targetText = q.focusCue.targetText;
  if (!targetText || targetText.length < 16) {
    return [{
      check: 'target-sentence-no-real-sentence',
      severity: SEVERITY.S0,
      message: `target-sentence focusCue.targetText is ${targetText ? `too short (${targetText.length} chars): "${targetText}"` : 'null/missing'}`,
    }];
  }
  return [];
}

/**
 * Check 2: target-sentence targetText matches a grammar label
 */
function checkTargetTextIsGrammarLabel(q) {
  if (!q.focusCue || q.focusCue.type !== 'target-sentence') return [];
  const targetText = q.focusCue.targetText;
  if (targetText && GRAMMAR_LABEL_RE.test(targetText)) {
    return [{
      check: 'target-text-is-grammar-label',
      severity: SEVERITY.S0,
      message: `focusCue.targetText is a grammar label: "${targetText}"`,
    }];
  }
  return [];
}

/**
 * Check 3: screenReaderPromptText contains patterns like "Sentence: subject"
 */
function checkScreenReaderGrammarLabel(q) {
  if (!q.screenReaderPromptText) return [];
  const srText = q.screenReaderPromptText;
  const labelMatch = srText.match(/(?:sentence|The sentence) (?:is|below)[:\s]*(subject|object|adverbs?|determiners?|pronouns?|conjunctions?)\.?$/i);
  if (labelMatch) {
    return [{
      check: 'screen-reader-announces-grammar-label',
      severity: SEVERITY.S0,
      message: `screenReaderPromptText announces grammar label as sentence: "...${labelMatch[0]}"`,
    }];
  }
  return [];
}

/**
 * Check 4: readAloudText uses "underlined word" when targetKind is noun-phrase/group/pair
 */
function checkReadAloudKindMismatch(q) {
  if (!q.focusCue || !q.readAloudText) return [];
  const kind = q.focusCue.targetKind;
  if (!kind || !KIND_PHRASE_MAP[kind]) return [];
  // If it's noun-phrase, group, or pair — "underlined word" is wrong
  if (/\bunderlined\s+word\b/i.test(q.readAloudText)) {
    return [{
      check: 'read-aloud-kind-mismatch',
      severity: SEVERITY.S1,
      message: `readAloudText says "underlined word" but targetKind is "${kind}" — should say "underlined ${KIND_PHRASE_MAP[kind]}"`,
    }];
  }
  return [];
}

/**
 * Check 5: readAloudText ends with duplicated punctuation
 */
function checkDuplicatedPunctuation(q) {
  if (!q.readAloudText) return [];
  if (DUPLICATE_PUNCT_RE.test(q.readAloudText)) {
    return [{
      check: 'read-aloud-double-punctuation',
      severity: SEVERITY.S1,
      message: `readAloudText ends with duplicated punctuation: "...${q.readAloudText.slice(-30)}"`,
    }];
  }
  return [];
}

/**
 * Check 6: promptParts omit the sentence when resolveTargetSentence succeeded
 */
function checkPromptPartsContainSentence(q) {
  if (!q.focusCue || q.focusCue.type !== 'target-sentence') return [];
  if (!q.promptParts || q.promptParts.length === 0) return [];
  const hasSentencePart = q.promptParts.some(p => p.kind === 'sentence');
  if (!hasSentencePart) {
    return [{
      check: 'prompt-parts-missing-sentence',
      severity: SEVERITY.S1,
      message: `focusCue is target-sentence and promptParts exist, but no kind:"sentence" part present`,
    }];
  }
  return [];
}

// All checks in order
const ALL_CHECKS = [
  { name: 'target-sentence-no-real-sentence', fn: checkTargetSentenceResolution },
  { name: 'target-text-is-grammar-label', fn: checkTargetTextIsGrammarLabel },
  { name: 'screen-reader-announces-grammar-label', fn: checkScreenReaderGrammarLabel },
  { name: 'read-aloud-kind-mismatch', fn: checkReadAloudKindMismatch },
  { name: 'read-aloud-double-punctuation', fn: checkDuplicatedPunctuation },
  { name: 'prompt-parts-missing-sentence', fn: checkPromptPartsContainSentence },
];

// ---------------------------------------------------------------------------
// Main audit loop
// ---------------------------------------------------------------------------

export function runSemanticAudit({ seedStart: sStart = 1, seedEnd: sEnd = 30 } = {}) {
  const findings = [];
  const checkCoverage = Object.fromEntries(ALL_CHECKS.map(c => [c.name, 0]));
  let totalChecked = 0;

  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    for (let seed = sStart; seed <= sEnd; seed++) {
      const q = createGrammarQuestion({ templateId: template.id, seed });
      if (!q) continue;
      totalChecked++;

      for (const check of ALL_CHECKS) {
        const issues = check.fn(q);
        if (issues.length > 0) {
          checkCoverage[check.name]++;
          for (const issue of issues) {
            findings.push({
              templateId: template.id,
              seed,
              ...issue,
            });
          }
        }
      }
    }
  }

  // Check 7: Dead-check detection — each check must match at least 1 template
  // across ALL templates × ALL seeds to be considered "alive".
  // We verify this by running a targeted scan of the template space.
  const deadChecks = [];
  for (const check of ALL_CHECKS) {
    let matchedAnyTemplate = false;
    for (const template of GRAMMAR_TEMPLATE_METADATA) {
      const q = createGrammarQuestion({ templateId: template.id, seed: 1 });
      if (!q) continue;
      // A check is "alive" if it COULD fire on at least one template's structure
      // (i.e. the template produces the fields the check inspects)
      if (check.name === 'target-sentence-no-real-sentence' || check.name === 'target-text-is-grammar-label' || check.name === 'prompt-parts-missing-sentence') {
        if (q.focusCue && q.focusCue.type === 'target-sentence') { matchedAnyTemplate = true; break; }
      } else if (check.name === 'screen-reader-announces-grammar-label') {
        if (q.screenReaderPromptText) { matchedAnyTemplate = true; break; }
      } else if (check.name === 'read-aloud-kind-mismatch') {
        if (q.focusCue && q.focusCue.targetKind && KIND_PHRASE_MAP[q.focusCue.targetKind] && q.readAloudText) { matchedAnyTemplate = true; break; }
      } else if (check.name === 'read-aloud-double-punctuation') {
        if (q.readAloudText) { matchedAnyTemplate = true; break; }
      }
    }
    if (!matchedAnyTemplate) {
      deadChecks.push(check.name);
    }
  }

  if (deadChecks.length > 0) {
    for (const dc of deadChecks) {
      findings.push({
        templateId: '__meta__',
        seed: 0,
        check: 'dead-check-detection',
        severity: SEVERITY.S1,
        message: `Check "${dc}" applies to zero templates — dead check`,
      });
    }
  }

  const passed = findings.length === 0;
  return { totalChecked, passed, findings, checkCoverage };
}

// ---------------------------------------------------------------------------
// CLI execution (only when run directly, not when imported)
// ---------------------------------------------------------------------------

const isMainModule = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').replace(/^[A-Z]:/, m => m.toLowerCase()));
const isDirectRun = process.argv[1] && (
  isMainModule ||
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/').replace(/^([A-Z]):/, (_, d) => d.toLowerCase() + ':')}`
);

if (isDirectRun || process.argv[1]?.endsWith('audit-grammar-prompt-cues-semantic.mjs')) {
  const result = runSemanticAudit({ seedStart, seedEnd });

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('Grammar Semantic Prompt-Cue Audit');
    console.log('==================================');
    console.log(`Seeds: ${seedStart}..${seedEnd}`);
    console.log(`Templates: ${GRAMMAR_TEMPLATE_METADATA.length}`);
    console.log(`Total checked: ${result.totalChecked}`);
    console.log(`Passed: ${result.passed}`);
    console.log('');
    console.log('Check coverage (templates triggering each check):');
    for (const [name, count] of Object.entries(result.checkCoverage)) {
      console.log(`  ${name}: ${count}`);
    }
    if (result.findings.length > 0) {
      console.log('');
      console.log(`Findings (${result.findings.length}):`);
      for (const f of result.findings.slice(0, 20)) {
        console.log(`  [${f.severity}] ${f.templateId} seed ${f.seed}: [${f.check}] ${f.message}`);
      }
      if (result.findings.length > 20) {
        console.log(`  ... and ${result.findings.length - 20} more`);
      }
    }
    console.log('');
    console.log(result.passed ? 'PASS' : 'FAIL');
  }

  process.exit(result.passed ? 0 : 1);
}
