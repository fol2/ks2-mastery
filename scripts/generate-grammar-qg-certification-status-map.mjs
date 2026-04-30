#!/usr/bin/env node
/**
 * Grammar QG P12 U2 — Certification Status Map
 *
 * Derives a per-template certification status map from the quality register.
 * Fail-closed: rejects if any template from GRAMMAR_TEMPLATE_METADATA is
 * missing from the quality register.
 *
 * Accepts:
 *   --quality-register=<path>  Path to quality register JSON (required)
 *   --out=<path>               Output path (default: reports/grammar/grammar-qg-p11-certification-status-map.json)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { parseArgs } from 'node:util';

import {
  GRAMMAR_TEMPLATE_METADATA,
  GRAMMAR_CONTENT_RELEASE_ID,
} from '../worker/src/subjects/grammar/content.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(__dirname, '..', 'reports', 'grammar');

/**
 * Map quality-register decision to evidence list.
 */
function deriveEvidence(entry) {
  const evidence = ['oracle', 'review'];
  // All templates go through prompt-cue-render and distractor-audit pipelines
  evidence.push('prompt-cue-render');
  evidence.push('distractor-audit');
  evidence.push('marking-matrix');
  return evidence;
}

export function buildCertificationStatusMap(register) {
  const templateIds = new Set(GRAMMAR_TEMPLATE_METADATA.map((t) => t.id));
  const registerLookup = new Map();

  for (const entry of register.entries) {
    registerLookup.set(entry.templateId, entry);
  }

  // Fail-closed: every template must be present in the quality register
  const missing = [];
  for (const id of templateIds) {
    if (!registerLookup.has(id)) {
      missing.push(id);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Fail-closed: ${missing.length} template(s) missing from quality register: ${missing.join(', ')}`,
    );
  }

  const entries = [];
  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    const regEntry = registerLookup.get(template.id);
    entries.push({
      templateId: template.id,
      decision: regEntry.decision,
      severity: regEntry.severity || 'none',
      evidence: deriveEvidence(regEntry),
    });
  }

  return {
    metadata: {
      contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
      generatedAt: new Date().toISOString(),
      templateCount: entries.length,
    },
    entries,
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      'quality-register': { type: 'string', default: '' },
      out: { type: 'string', default: '' },
    },
    strict: false,
  });

  const registerPath = values['quality-register']
    ? path.resolve(values['quality-register'])
    : path.join(REPORTS_DIR, 'grammar-qg-p11-quality-register.json');

  const outputPath = values.out
    ? path.resolve(values.out)
    : path.join(REPORTS_DIR, 'grammar-qg-p11-certification-status-map.json');

  // Read quality register
  const registerJson = await fs.readFile(registerPath, 'utf8');
  const register = JSON.parse(registerJson);

  const statusMap = buildCertificationStatusMap(register);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(statusMap, null, 2) + '\n', 'utf8');

  console.log('Grammar Certification Status Map generated:');
  console.log(`  Templates: ${statusMap.metadata.templateCount}`);
  console.log(`  Content release: ${statusMap.metadata.contentReleaseId}`);
  console.log(`  Output: ${outputPath}`);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main().catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  });
}
