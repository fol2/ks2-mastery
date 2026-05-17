#!/usr/bin/env node

import { resolve } from 'node:path';
import { verifySecureVocabularyRelease } from './verify-spelling-secure-vocabulary-release.mjs';
import {
  buildSecureVocabularyArtifacts,
  renderSecureVocabularyReviewPackMarkdown,
  writeJson,
  writeText,
} from './spelling-secure-vocabulary-source.mjs';

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    sourceJsonlPath: null,
    approvalPath: null,
    outDir: 'reports/spelling/secure-vocabulary',
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--source-jsonl' && argv[index + 1]) options.sourceJsonlPath = argv[++index];
    else if (arg.startsWith('--source-jsonl=')) options.sourceJsonlPath = arg.slice('--source-jsonl='.length);
    else if (arg === '--approval' && argv[index + 1]) options.approvalPath = argv[++index];
    else if (arg.startsWith('--approval=')) options.approvalPath = arg.slice('--approval='.length);
    else if (arg === '--out-dir' && argv[index + 1]) options.outDir = argv[++index];
    else if (arg.startsWith('--out-dir=')) options.outDir = arg.slice('--out-dir='.length);
  }

  return options;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/build-spelling-secure-vocabulary-review-pack.mjs --source-jsonl <source.jsonl> --approval <owner-approval-record.json> [--out-dir <dir>] [--json]',
  ].join('\n');
}

function main() {
  const options = parseArgs();
  if (!options.sourceJsonlPath || !options.approvalPath) {
    console.error(usage());
    process.exit(2);
  }

  const outDir = resolve(options.outDir);
  const artifacts = buildSecureVocabularyArtifacts({
    sourceJsonlPath: resolve(options.sourceJsonlPath),
    approvalPath: resolve(options.approvalPath),
  });
  const verificationReport = verifySecureVocabularyRelease({
    auditedSource: artifacts.auditedSource,
    reviewPack: artifacts.reviewPack,
  });
  const markdown = renderSecureVocabularyReviewPackMarkdown(artifacts.reviewPack);

  const outputs = {
    auditReport: resolve(outDir, 'audit-report.json'),
    importPlan: resolve(outDir, 'import-plan.json'),
    auditedSource: resolve(outDir, 'audited-source.json'),
    reviewPack: resolve(outDir, 'review-pack.json'),
    reviewPackMarkdown: resolve(outDir, 'review-pack.md'),
    verificationReport: resolve(outDir, 'verification-report.json'),
  };

  writeJson(outputs.auditReport, artifacts.audit);
  writeJson(outputs.importPlan, artifacts.importPlan);
  writeJson(outputs.auditedSource, artifacts.auditedSource);
  writeJson(outputs.reviewPack, artifacts.reviewPack);
  writeText(outputs.reviewPackMarkdown, markdown);
  writeJson(outputs.verificationReport, verificationReport);

  const summary = {
    ok: artifacts.audit.ok && verificationReport.ok,
    status: artifacts.audit.status,
    sourceJsonlSha256: artifacts.audit.source.sourceJsonlSha256,
    recordCount: artifacts.audit.source.recordCount,
    uniqueWordCount: artifacts.audit.source.uniqueWordCount,
    approvalDecision: artifacts.audit.approval.decision,
    reviewerName: artifacts.audit.approval.reviewerName,
    reviewTimestamp: artifacts.audit.approval.reviewTimestamp,
    checkedReviewPackWords: verificationReport.checkedReviewPackWords,
    checkedAuditedSourceWords: verificationReport.checkedAuditedSourceWords,
    issueCount: verificationReport.issueCount,
    outputs,
  };

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Secure vocabulary reviewer pack ${summary.ok ? 'generated' : 'failed'}: ${summary.checkedReviewPackWords} word(s), ${summary.issueCount} release issue(s)`);
  }

  process.exit(summary.ok ? 0 : 1);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/build-spelling-secure-vocabulary-review-pack.mjs')) {
  main();
}
