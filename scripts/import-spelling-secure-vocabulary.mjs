#!/usr/bin/env node

import { resolve } from 'node:path';
import { buildSecureVocabularyArtifacts, writeJson } from './spelling-secure-vocabulary-source.mjs';

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    sourceJsonlPath: null,
    approvalPath: null,
    outPath: null,
    check: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') options.check = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--source-jsonl' && argv[index + 1]) options.sourceJsonlPath = argv[++index];
    else if (arg.startsWith('--source-jsonl=')) options.sourceJsonlPath = arg.slice('--source-jsonl='.length);
    else if (arg === '--approval' && argv[index + 1]) options.approvalPath = argv[++index];
    else if (arg.startsWith('--approval=')) options.approvalPath = arg.slice('--approval='.length);
    else if (arg === '--out' && argv[index + 1]) options.outPath = argv[++index];
    else if (arg.startsWith('--out=')) options.outPath = arg.slice('--out='.length);
  }

  return options;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/import-spelling-secure-vocabulary.mjs --check --source-jsonl <source.jsonl> --approval <owner-approval-record.json> [--json] [--out <import-plan.json>]',
    '',
    'This command currently produces a check-mode import plan only. It does not mutate spelling content or production data.',
  ].join('\n');
}

function main() {
  const options = parseArgs();
  if (!options.check || !options.sourceJsonlPath || !options.approvalPath) {
    console.error(usage());
    process.exit(2);
  }

  const { importPlan } = buildSecureVocabularyArtifacts({
    sourceJsonlPath: resolve(options.sourceJsonlPath),
    approvalPath: resolve(options.approvalPath),
  });

  if (options.outPath) {
    writeJson(resolve(options.outPath), importPlan);
  }
  if (options.json || !options.outPath) {
    console.log(JSON.stringify(importPlan, null, 2));
  } else {
    console.log(`Secure vocabulary import plan generated: ${importPlan.source.recordCount} record(s), writes=${importPlan.writes}`);
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/import-spelling-secure-vocabulary.mjs')) {
  main();
}
