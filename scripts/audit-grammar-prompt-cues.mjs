#!/usr/bin/env node
/**
 * Grammar QG P10 U2 — Prompt Cue Audit
 *
 * For seeds 1..N, generate all templates and check:
 * 1. No whole-sentence underline when prompt asks for word/phrase
 * 2. No duplicate content in promptParts
 * 3. If prompt contains cue language, focusCue must exist (or explicit fallback)
 * 4. Screen-reader/read-aloud alignment — both mention focusCue.text
 * 5. cueNotRequiredReason present when promptParts exist without focusCue
 *
 * Usage:
 *   node scripts/audit-grammar-prompt-cues.mjs --seeds=1..30 --json
 *   node scripts/audit-grammar-prompt-cues.mjs --seeds=1..5
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
// Audit checks
// ---------------------------------------------------------------------------

const CUE_LANGUAGE_RE = /underlined|in\s+bold|shown\s+in\s+brackets|sentence\s+below/i;
const UNDERLINE_WORD_RE = /\bunderlined\s+word\b/i;
const UNDERLINE_PHRASE_RE = /\bunderlined\s+(noun\s+phrase|group|pair)\b/i;

function wordCount(text) {
  return text.trim().split(/\s+/).length;
}

function auditQuestion(templateId, seed) {
  const failures = [];
  const q = createGrammarQuestion({ templateId, seed });
  if (!q) return { templateId, seed, pass: true, failures };

  const plainPrompt = (q.stemHtml || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  // Check 1: No whole-sentence underline when prompt asks for word/phrase
  if (q.focusCue && q.focusCue.type === 'underline') {
    const wc = wordCount(q.focusCue.text);
    if (UNDERLINE_WORD_RE.test(plainPrompt) && wc > 3) {
      failures.push({
        check: 'whole-sentence-underline-word',
        message: `Prompt asks for "underlined word" but focusCue.text has ${wc} words: "${q.focusCue.text}"`
      });
    }
    if (UNDERLINE_PHRASE_RE.test(plainPrompt) && wc > 8) {
      failures.push({
        check: 'whole-sentence-underline-phrase',
        message: `Prompt asks for "underlined phrase/group" but focusCue.text has ${wc} words: "${q.focusCue.text}"`
      });
    }
  }

  // Check 2: No duplicate content in promptParts
  if (q.promptParts && q.promptParts.length > 1) {
    const textPart = q.promptParts.find(p => p.kind === 'text');
    const sentenceParts = q.promptParts.filter(p =>
      p.kind === 'sentence' || p.kind === 'underline' || p.kind === 'emphasis'
    );
    if (textPart && sentenceParts.length > 0) {
      const fullSentence = sentenceParts.map(p => p.text).join('').trim();
      if (fullSentence.length >= 10 && textPart.text.includes(fullSentence)) {
        failures.push({
          check: 'duplicate-content',
          message: `Instruction text duplicates the sentence content: "${fullSentence.substring(0, 60)}..."`
        });
      }
    }
  }

  // Check 3: If prompt contains cue language, focusCue or promptParts must exist
  if (CUE_LANGUAGE_RE.test(plainPrompt)) {
    if (!q.focusCue && !q.promptParts) {
      failures.push({
        check: 'missing-cue-data',
        message: `Prompt contains cue language but no focusCue or promptParts`
      });
    }
  }

  // Check 4: Screen-reader/read-aloud alignment — both must mention focusCue.text
  if (q.focusCue && q.focusCue.text) {
    const cueTextLower = q.focusCue.text.toLowerCase();
    if (q.screenReaderPromptText && !q.screenReaderPromptText.toLowerCase().includes(cueTextLower)) {
      failures.push({
        check: 'screen-reader-misaligned',
        message: `screenReaderPromptText does not mention focusCue.text "${q.focusCue.text}"`
      });
    }
    if (q.readAloudText && !q.readAloudText.toLowerCase().includes(cueTextLower)) {
      failures.push({
        check: 'read-aloud-misaligned',
        message: `readAloudText does not mention focusCue.text "${q.focusCue.text}"`
      });
    }
  }

  // Check 5: cueNotRequiredReason for promptParts without focusCue
  if (q.promptParts && q.promptParts.length > 0 && !q.focusCue) {
    if (!q.cueNotRequiredReason || typeof q.cueNotRequiredReason !== 'string' || q.cueNotRequiredReason.trim() === '') {
      failures.push({
        check: 'missing-cue-not-required-reason',
        message: `Has promptParts but no focusCue and missing cueNotRequiredReason`
      });
    }
  }

  return {
    templateId,
    seed,
    pass: failures.length === 0,
    failures
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const results = [];
let totalPass = 0;
let totalFail = 0;
const failedTemplates = new Set();

for (const template of GRAMMAR_TEMPLATE_METADATA) {
  for (let seed = seedStart; seed <= seedEnd; seed++) {
    const result = auditQuestion(template.id, seed);
    results.push(result);
    if (result.pass) {
      totalPass++;
    } else {
      totalFail++;
      failedTemplates.add(template.id);
    }
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const summary = {
  seeds: `${seedStart}..${seedEnd}`,
  templates: GRAMMAR_TEMPLATE_METADATA.length,
  totalChecked: results.length,
  totalPass,
  totalFail,
  failedTemplates: [...failedTemplates].sort(),
  allPass: totalFail === 0
};

if (jsonOutput) {
  const failedResults = results.filter(r => !r.pass);
  console.log(JSON.stringify({ summary, failures: failedResults }, null, 2));
} else {
  console.log('Grammar Prompt Cue Audit');
  console.log('========================');
  console.log(`Seeds: ${summary.seeds}`);
  console.log(`Templates: ${summary.templates}`);
  console.log(`Checks: ${summary.totalChecked}`);
  console.log(`Pass: ${summary.totalPass}`);
  console.log(`Fail: ${summary.totalFail}`);
  if (summary.failedTemplates.length > 0) {
    console.log(`\nFailed templates:`);
    for (const t of summary.failedTemplates) {
      const tFailures = results.filter(r => r.templateId === t && !r.pass);
      console.log(`  - ${t} (${tFailures.length} failures)`);
      for (const f of tFailures.slice(0, 3)) {
        for (const issue of f.failures) {
          console.log(`      seed ${f.seed}: [${issue.check}] ${issue.message}`);
        }
      }
      if (tFailures.length > 3) {
        console.log(`      ... and ${tFailures.length - 3} more`);
      }
    }
  }
  console.log(`\n${summary.allPass ? 'PASS' : 'FAIL'}`);
}

process.exit(summary.allPass ? 0 : 1);
