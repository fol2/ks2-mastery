#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';

import {
  GRAMMAR_TEMPLATE_METADATA,
  GRAMMAR_CONTENT_RELEASE_ID,
} from '../worker/src/subjects/grammar/content.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const REPORTS_DIR = path.resolve(ROOT_DIR, 'reports', 'grammar');

async function computeFileHash(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return createHash('sha256').update(content).digest('hex');
}

function parseCli() {
  const { values } = parseArgs({
    options: {
      phase: { type: 'string' },
      release: { type: 'string' },
    },
    strict: false,
  });
  return values;
}

async function main() {
  const cliArgs = parseCli();

  const generatorScriptPath = path.resolve(__dirname, 'generate-grammar-qg-quality-inventory.mjs');
  const generatorScriptHash = await computeFileHash(generatorScriptPath);

  const contentReleaseId = cliArgs.release || GRAMMAR_CONTENT_RELEASE_ID;

  const templateDenominator = GRAMMAR_TEMPLATE_METADATA.length;
  const seedCount = 30;
  const expectedItemCount = templateDenominator * seedCount;

  // Derive phase prefix from the content release ID (e.g. "grammar-qg-p11-2026-04-30" → "p11")
  const phaseMatch = contentReleaseId.match(/grammar-qg-(p\d+)-/);
  const phase = phaseMatch ? phaseMatch[1] : 'p11';

  // certificationPhase: CLI --phase overrides; otherwise derive next phase from content release
  const certificationPhase = cliArgs.phase || `grammar-qg-${phase}`;

  const manifest = {
    contentReleaseId,
    certificationPhase,
    templateDenominator,
    seedWindow: { certification: '1..30' },
    seedWindowPerEvidenceType: {
      'selected-response-oracle': '1..15',
      'constructed-response-oracle': '1..10',
      'manual-review-oracle': '1..5',
      'redaction-oracle': '1..30',
      'content-quality-audit': '1..30',
      'semantic-prompt-cue-audit': '1..30',
    },
    expectedItemCount,
    expectedOutputPaths: [
      `reports/grammar/grammar-qg-${phase}-render-inventory.json`,
      `reports/grammar/grammar-qg-${phase}-render-inventory-redacted.md`,
    ],
    artefacts: {
      renderInventory: `reports/grammar/grammar-qg-${phase}-render-inventory.json`,
      renderInventoryRedacted: `reports/grammar/grammar-qg-${phase}-render-inventory-redacted.md`,
      qualityRegister: `reports/grammar/grammar-qg-${phase}-quality-register.json`,
      distractorAudit: `reports/grammar/grammar-qg-${phase}-distractor-audit.json`,
      markingMatrix: `reports/grammar/grammar-qg-${phase}-marking-matrix.json`,
      certificationStatusMap: `reports/grammar/grammar-qg-${phase}-certification-status-map.json`,
      semanticAuditScript: 'scripts/audit-grammar-prompt-cues-semantic.mjs',
      productionSmoke: `reports/grammar/grammar-production-smoke-${contentReleaseId}.json`,
    },
    generatorScript: 'scripts/generate-grammar-qg-quality-inventory.mjs',
    generatorScriptHash,
    generationCommand: `node scripts/generate-grammar-qg-quality-inventory.mjs --seeds=1..30 --release=${phase}`,
    generatedAt: new Date().toISOString(),
    answerInternalsIncluded: true,
    answerInternalsRedacted: true,
    postDeployRequiredForPostDeployCertification: true,
  };

  await fs.mkdir(REPORTS_DIR, { recursive: true });
  const manifestPath = path.join(REPORTS_DIR, `grammar-qg-${phase}-certification-manifest.json`);
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log(`Grammar QG ${phase.toUpperCase()} Certification Manifest generated:`);
  console.log(`  Content Release: ${manifest.contentReleaseId}`);
  console.log(`  Certification Phase: ${manifest.certificationPhase}`);
  console.log(`  Template Denominator: ${manifest.templateDenominator}`);
  console.log(`  Expected Item Count: ${manifest.expectedItemCount}`);
  console.log(`  Artefacts: ${Object.keys(manifest.artefacts).length} entries`);
  console.log(`  Output: ${manifestPath}`);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});
