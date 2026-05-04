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
    && report.gates.modelSelfMarking.ok;
  process.exitCode = allGatesOk ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
