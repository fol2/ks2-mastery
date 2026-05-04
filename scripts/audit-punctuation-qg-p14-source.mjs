#!/usr/bin/env node

/**
 * P14 source audit — Gate 1 attestation for the post-expansion runtime.
 *
 * Produces a deterministic JSON report covering:
 *   - releaseId + format
 *   - per-source counts (fixed, generated, total)
 *   - generator family count split by mode (baseline vs transfer)
 *   - per-skill transfer coverage (Gate 4 floor check)
 *   - model self-marking pass count (must be 100% to certify)
 *
 * Usage:
 *   node scripts/audit-punctuation-qg-p14-source.mjs                 # stdout JSON
 *   node scripts/audit-punctuation-qg-p14-source.mjs --out FILE.json # writes file
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { PUNCTUATION_CONTENT_MANIFEST } from '../shared/punctuation/content.js';
import {
  PRODUCTION_DEPTH,
  GENERATED_TEMPLATE_BANK,
  createPunctuationRuntimeManifest,
} from '../shared/punctuation/generators.js';
import { PUNCTUATION_CURRENT_RELEASE_ID } from '../src/subjects/punctuation/service-contract.js';
import { markPunctuationAnswer } from '../shared/punctuation/marking.js';

// F9 build-time guard: the closed verb list inside
// `repairApostropheContractionGrammar`. Mirroring it here lets the audit
// fail loudly when a future bank entry adds a `<contracted-aux> ready to
// <verb>` pattern with a verb outside the list — which the runtime repair
// would silently leave untouched.
const APOSTROPHE_REPAIR_VERB_GROUP = new Set([
  'move', 'forget', 'leave', 'go', 'run', 'walk', 'come', 'start',
  'begin', 'do', 'see', 'talk', 'swim', 'read', 'write', 'sit',
  'stand', 'stop', 'finish', 'help', 'join', 'listen', 'return',
]);
const APOSTROPHE_REPAIR_TARGET_FAMILIES = new Set([
  'gen_apostrophe_contractions_fix',
  'gen_apostrophe_mix_paragraph',
]);
// The repair only targets `'ve` and `'ll` forms (and their apostropheless
// mirrors). `'re/'s/'m` are present-tense be-forms — `<pronoun>'re ready
// to <v>` is already grammatical (`"You're ready to check"` reads fine),
// so those forms should be excluded from the audit pattern lest the
// audit raise a false positive on a clean bank entry.
const REPAIR_TARGETED_AUX_PREFIXES = new Set([
  "I've", "i've", "you've", "You've", "we've", "We've", "they've", "They've",
  "Ive", "ive", "Youve", "youve", "Weve", "weve", "Theyve", "theyve",
  "I'll", "i'll", "you'll", "You'll", "we'll", "We'll", "they'll", "They'll",
  "he'll", "He'll", "she'll", "She'll", "it'll", "It'll",
  "that'll", "That'll", "there'll", "There'll",
  "Ill", "Youll", "youll", "Well", "Theyll", "theyll",
  "Hell", "Shell", "Itll", "itll", "Thatll", "thatll",
  "Therell", "therell",
]);
const READY_TO_VERB_PATTERN = /\b([A-Za-z]+(?:'[a-z]+)?)\s+ready\s+to\s+([A-Za-z]+)\b/g;

const PUBLISHED_SKILLS = [
  'sentence_endings',
  'list_commas',
  'apostrophe_contractions',
  'apostrophe_possession',
  'speech',
  'fronted_adverbial',
  'parenthesis',
  'comma_clarity',
  'colon_list',
  'semicolon',
  'dash_clause',
  'semicolon_list',
  'bullet_points',
  'hyphen',
];

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = { out: null };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--out' && args[i + 1]) {
      result.out = args[i + 1];
      i += 1;
    }
  }
  return result;
}

function answerForItem(item) {
  if (item.mode === 'choose' || item.inputKind === 'choice') {
    return { choiceIndex: item.correctIndex };
  }
  return { typed: item.model };
}

function audit() {
  const manifest = createPunctuationRuntimeManifest({
    manifest: PUNCTUATION_CONTENT_MANIFEST,
    generatedPerFamily: PRODUCTION_DEPTH,
  });

  const fixed = manifest.items.filter((item) => item.source !== 'generated');
  const generated = manifest.items.filter((item) => item.source === 'generated');
  const transfer = manifest.items.filter((item) => item.mode === 'transfer');

  const generatorFamilies = manifest.generatorFamilies || [];
  const baselineFamilies = generatorFamilies.filter((family) => family.mode !== 'transfer');
  const transferFamilies = generatorFamilies.filter((family) => family.mode === 'transfer');

  // Per-cluster transfer coverage (Gate 4 floor check).
  const transferBySkill = {};
  for (const skill of PUBLISHED_SKILLS) {
    const items = transfer.filter(
      (item) => Array.isArray(item.skillIds) && item.skillIds.includes(skill),
    );
    transferBySkill[skill] = items.length;
  }

  const transferCoverageOk = PUBLISHED_SKILLS.every((skill) => transferBySkill[skill] >= 12);

  // Model self-marking pass count.
  const failures = [];
  for (const item of manifest.items) {
    const result = markPunctuationAnswer({ item, answer: answerForItem(item) });
    if (!result.correct) {
      failures.push({ id: item.id, model: item.model, note: result.note });
    }
  }

  // Generator-family template counts (Gate 1 evidence).
  const familyTemplateCounts = Object.fromEntries(
    Object.entries(GENERATED_TEMPLATE_BANK)
      .map(([familyId, templates]) => [familyId, templates.length])
      .sort(([a], [b]) => a.localeCompare(b)),
  );

  // F9 build-time invariant: scan apostrophe quality-fix family stems +
  // models for `<contracted-aux> ready to <verb>` patterns where the
  // contracted aux belongs to the repair's targeted set (`'ve`/`'ll` and
  // mirrors) AND the verb falls outside the closed list. Any such entry
  // would silently slip through the runtime repair, leaving an
  // ungrammatical stem in the runtime pool. `'re/'s/'m` forms are
  // intentionally NOT in the targeted set — those are grammatical and
  // the repair correctly leaves them alone.
  const verbCoverageOffenders = [];
  for (const item of generated) {
    if (!APOSTROPHE_REPAIR_TARGET_FAMILIES.has(item.generatorFamilyId || '')) continue;
    for (const [field, value] of [['stem', item.stem], ['model', item.model]]) {
      const text = String(value || '');
      READY_TO_VERB_PATTERN.lastIndex = 0;
      let match;
      // eslint-disable-next-line no-cond-assign
      while ((match = READY_TO_VERB_PATTERN.exec(text)) !== null) {
        const aux = match[1];
        if (!REPAIR_TARGETED_AUX_PREFIXES.has(aux)) continue;
        const verb = (match[2] || '').toLowerCase();
        if (!APOSTROPHE_REPAIR_VERB_GROUP.has(verb)) {
          verbCoverageOffenders.push({ id: item.id, field, aux, verb, snippet: match[0] });
        }
      }
    }
  }

  return {
    schemaVersion: 1,
    phase: 'punctuation-qg-p14-source-audit',
    releaseId: PUNCTUATION_CURRENT_RELEASE_ID,
    generatedAt: new Date().toISOString(),
    productionDepth: PRODUCTION_DEPTH,
    counts: {
      fixed: fixed.length,
      generated: generated.length,
      total: manifest.items.length,
      transferItems: transfer.length,
      baselineFamilies: baselineFamilies.length,
      transferFamilies: transferFamilies.length,
      totalFamilies: generatorFamilies.length,
      bankFamilyCount: Object.keys(GENERATED_TEMPLATE_BANK).length,
    },
    transferBySkill,
    transferBySkillSum: Object.values(transferBySkill).reduce((a, b) => a + b, 0),
    _transferCountingNote:
      `transferBySkill values sum to ${Object.values(transferBySkill).reduce((a, b) => a + b, 0)}`
      + ` which exceeds counts.transferItems (${transfer.length}) because`
      + ` ${Object.values(transferBySkill).reduce((a, b) => a + b, 0) - transfer.length}`
      + ` items serve multiple skills and are counted under each.`,
    gates: {
      gate1SourceIdentity: {
        ok: manifest.items.length === fixed.length + generated.length
          && Object.keys(GENERATED_TEMPLATE_BANK).length === generatorFamilies.length,
        note: 'Runtime pool count is deterministic and family count matches the bank.',
      },
      gate4TransferDepth: {
        ok: transfer.length >= 250 && transferCoverageOk,
        threshold: { totalMin: 250, perSkillMin: 12 },
        note: transferCoverageOk
          ? 'Every published skill has at least 12 transfer items.'
          : 'One or more published skills fail the per-skill ≥12 floor.',
      },
      modelSelfMarking: {
        ok: failures.length === 0,
        failureCount: failures.length,
        sample: failures.slice(0, 10),
      },
      apostropheVerbCoverage: {
        ok: verbCoverageOffenders.length === 0,
        knownVerbs: [...APOSTROPHE_REPAIR_VERB_GROUP].sort(),
        offenders: verbCoverageOffenders.slice(0, 10),
        note: verbCoverageOffenders.length === 0
          ? 'Every `<aux> ready to <verb>` pattern in the apostrophe quality-fix bank uses a verb the repair function recognises.'
          : 'One or more apostrophe quality-fix bank entries use a verb outside the closed `VERB_GROUP` in `repairApostropheContractionGrammar` — the runtime repair will leave those entries ungrammatical.',
      },
    },
    familyTemplateCounts,
    schedulerVarietyPolicy: {
      // Read-pass conclusion: scheduler.js (lines 737–823) does not
      // filter weak/due/retry signals to fake variety. recentItemIds
      // penalisation (×0.12) and per-session variant signature
      // dedup (EXPOSURE_WEIGHT_BLOCKED ×0.01) are exposure-based, not
      // strength-based. Misconception retries are explicitly allowed
      // to bypass the dedup so weak items can win.
      ok: true,
      note: 'Recent-avoidance penalises exposure, never strength. Weak/due/retry candidates can still win via dedicated weights (see scheduler.js EXPOSURE_WEIGHT_*). No fake-variety hiding observed.',
    },
  };
}

function main() {
  const args = parseArgs(process.argv);
  const report = audit();
  const json = JSON.stringify(report, null, 2);
  if (args.out) {
    const outPath = resolve(args.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${json}\n`, 'utf8');
    console.error(`P14 source audit written to ${outPath}`);
  } else {
    process.stdout.write(`${json}\n`);
  }
  const allGatesOk =
    report.gates.gate1SourceIdentity.ok
    && report.gates.gate4TransferDepth.ok
    && report.gates.modelSelfMarking.ok
    && report.gates.apostropheVerbCoverage.ok;
  process.exitCode = allGatesOk ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
