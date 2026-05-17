#!/usr/bin/env node

import { resolve } from 'node:path';
import { auditSecureVocabularySource, writeJson } from './spelling-secure-vocabulary-source.mjs';

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    sourceJsonlPath: null,
    approvalPath: null,
    outPath: null,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
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
    '  node scripts/audit-spelling-secure-vocabulary.mjs --source-jsonl <source.jsonl> --approval <owner-approval-record.json> [--json] [--out <audit.json>]',
  ].join('\n');
}

function main() {
  const options = parseArgs();
  if (!options.sourceJsonlPath || !options.approvalPath) {
    console.error(usage());
    process.exit(2);
  }

  const report = auditSecureVocabularySource({
    sourceJsonlPath: resolve(options.sourceJsonlPath),
    approvalPath: resolve(options.approvalPath),
  });

  if (options.outPath) {
    writeJson(resolve(options.outPath), report);
  }
  if (options.json || !options.outPath) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Secure vocabulary source audit ${report.ok ? 'passed' : 'failed'}: ${report.errorCount} error(s), ${report.issueCount} issue(s)`);
  }

  process.exit(report.ok ? 0 : 1);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/audit-spelling-secure-vocabulary.mjs')) {
  main();
}
