#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_APPROVAL_DECISION = 'APPROVED_FOR_SECURE_EXTENSION_IMPORT';

export const RELEASE_INPUT_TEMPLATE_COLUMNS = Object.freeze([
  'sourceRecordId',
  'word',
  'taxonomyTier',
  'yearBand',
  'sourceBucket',
  'existingPatternTags',
  'existingAdvisories',
  'currentSourceReviewStatus',
  'secureImportReviewStatus',
  'acceptedSpellings',
  'rejectedVariants',
  'explanation',
  'exampleSentence1',
  'exampleSentence2',
  'exampleSentence3',
  'ukSpellingDecision',
  'patternTags',
  'morphologyTags',
  'familyRoot',
  'safetyNotes',
  'audioStatus',
  'ttsStatus',
  'reviewerName',
  'reviewedAt',
  'secureImportApprovalDecision',
]);

const FIELD_GUIDANCE = Object.freeze({
  secureImportReviewStatus: 'Use adult_approved_for_secure_extension_import only after the word is approved for live secure-extension import. Use rejected_needs_source_revision when it must not ship.',
  acceptedSpellings: 'Pipe-separated spellings accepted by the marker. Include the canonical word when approved.',
  rejectedVariants: 'Pipe-separated common confusions or variants that must not be accepted, where useful.',
  explanation: 'One child-safe KS2 explanation of the word or spelling point.',
  exampleSentence1: 'A KS2-suitable sentence using the word naturally.',
  exampleSentence2: 'Optional second KS2-suitable sentence.',
  exampleSentence3: 'Optional third KS2-suitable sentence.',
  ukSpellingDecision: 'Explicit UK spelling policy decision, including whether US variants are rejected or absent.',
  patternTags: 'Pipe-separated spelling pattern tags, if applicable.',
  morphologyTags: 'Pipe-separated morphology tags, if applicable.',
  familyRoot: 'Word family/root relation used for grouping and teaching.',
  safetyNotes: 'Safety, exclusion, age-suitability, or advisory-resolution notes.',
  audioStatus: 'Audio requirement or availability status, for example tts_required, audio_available, or not_required.',
  ttsStatus: 'TTS plan/status, for example planned, verified, not_required, or blocked.',
  secureImportApprovalDecision: `Use ${REQUIRED_APPROVAL_DECISION} only when the row is approved for live secure-extension import.`,
});

function wordsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.words)) return payload.words;
  return [];
}

function sourceSummaryFrom(payload) {
  return payload?.source && typeof payload.source === 'object' ? payload.source : {};
}

function normaliseString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function listValue(value) {
  return Array.isArray(value)
    ? value.map((entry) => normaliseString(entry)).filter(Boolean).join('|')
    : '';
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function renderCsv(rows, columns = RELEASE_INPUT_TEMPLATE_COLUMNS) {
  const lines = [
    columns.map(csvEscape).join(','),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(',')),
  ];
  return `${lines.join('\n')}\n`;
}

function templateRowFromWord(word) {
  return {
    sourceRecordId: normaliseString(word?.sourceRecordId),
    word: normaliseString(word?.word || word?.slug),
    taxonomyTier: normaliseString(word?.taxonomyTier),
    yearBand: normaliseString(word?.yearBand),
    sourceBucket: normaliseString(word?.sourceBucket || word?.provenance?.sourceBucket),
    existingPatternTags: listValue(word?.patternTags),
    existingAdvisories: listValue(word?.advisories),
    currentSourceReviewStatus: normaliseString(word?.sourceReviewStatus || word?.review?.status),
    secureImportReviewStatus: '',
    acceptedSpellings: '',
    rejectedVariants: '',
    explanation: '',
    exampleSentence1: '',
    exampleSentence2: '',
    exampleSentence3: '',
    ukSpellingDecision: '',
    patternTags: '',
    morphologyTags: '',
    familyRoot: '',
    safetyNotes: '',
    audioStatus: '',
    ttsStatus: '',
    reviewerName: '',
    reviewedAt: '',
    secureImportApprovalDecision: '',
  };
}

export function buildSecureVocabularyReleaseInputTemplate({ auditedSource } = {}) {
  const source = sourceSummaryFrom(auditedSource);
  const allWords = wordsFromPayload(auditedSource);
  const rows = allWords
    .filter((word) => word?.taxonomyTier === 'secure-extension')
    .map(templateRowFromWord);

  const advisoryRows = rows.filter((row) => row.existingAdvisories).length;
  const currentReviewStatusCounts = {};
  for (const row of rows) {
    const key = row.currentSourceReviewStatus || 'missing';
    currentReviewStatusCounts[key] = (currentReviewStatusCounts[key] || 0) + 1;
  }

  const manifest = {
    kind: 'ks2-spelling-secure-vocabulary-release-input-template',
    version: 1,
    generatedAt: new Date().toISOString(),
    source: {
      artifactId: source.artifactId || null,
      sourceJsonlSha256: source.sourceJsonlSha256 || null,
      approvalDecision: source.approvalDecision || null,
      securePromotionAllowed: source.securePromotionAllowed === true,
    },
    requiredApprovalDecision: REQUIRED_APPROVAL_DECISION,
    counts: {
      secureExtensionRows: rows.length,
      advisoryRows,
      currentReviewStatus: currentReviewStatusCounts,
    },
    columns: RELEASE_INPUT_TEMPLATE_COLUMNS,
    fieldGuidance: FIELD_GUIDANCE,
    safety: {
      writesLiveContent: false,
      grantsApproval: false,
      purpose: 'Data collection template for a future release-approved secure-extension source artefact.',
    },
  };

  return {
    rows,
    csv: renderCsv(rows),
    manifest,
    markdown: renderTemplateReadme(manifest),
  };
}

export function renderTemplateReadme(manifest) {
  const lines = [
    '# Spelling Secure Vocabulary Release Input Template',
    '',
    'This folder is a data-collection template for the next secure-extension source artefact. It does not approve or import any word into live secure vocabulary.',
    '',
    '## Source',
    '',
    `- Source JSONL SHA-256: ${manifest.source.sourceJsonlSha256}`,
    `- Current approval decision: ${manifest.source.approvalDecision}`,
    `- Required live-import approval decision: ${manifest.requiredApprovalDecision}`,
    `- Secure-extension rows: ${manifest.counts.secureExtensionRows}`,
    `- Advisory rows: ${manifest.counts.advisoryRows}`,
    '',
    '## Files',
    '',
    '- `secure-vocabulary-release-input-template.csv` - one row per secure-extension candidate word.',
    '- `secure-vocabulary-release-input-template-manifest.json` - source hash, counts, required columns, and field guidance.',
    '',
    '## Required Filled Fields',
    '',
  ];

  for (const [field, guidance] of Object.entries(FIELD_GUIDANCE)) {
    lines.push(`- \`${field}\`: ${guidance}`);
  }

  lines.push('');
  lines.push('## Review Rule');
  lines.push('');
  lines.push(`Only rows with \`secureImportApprovalDecision=${REQUIRED_APPROVAL_DECISION}\`, adult-approved secure import status, and complete release-quality fields can be considered by a future import/release gate.`);
  lines.push('');
  lines.push('Rows with unresolved advisories must either be rejected, downgraded out of secure-extension import, or resolved with explicit safety notes before live promotion.');
  lines.push('');

  return lines.join('\n');
}

function parseArgs(argv) {
  const options = {
    auditedSourcePath: null,
    outDir: null,
    json: false,
    help: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--json') options.json = true;
    else if ((arg === '--audited-source' || arg === '--source') && argv[index + 1]) {
      options.auditedSourcePath = argv[++index];
    } else if (arg.startsWith('--audited-source=')) {
      options.auditedSourcePath = arg.slice('--audited-source='.length);
    } else if (arg.startsWith('--source=')) {
      options.auditedSourcePath = arg.slice('--source='.length);
    } else if (arg === '--out-dir' && argv[index + 1]) {
      options.outDir = argv[++index];
    } else if (arg.startsWith('--out-dir=')) {
      options.outDir = arg.slice('--out-dir='.length);
    }
  }

  return options;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/build-spelling-secure-vocabulary-release-input-template.mjs --audited-source <audited-source.json> --out-dir <output-dir> [--json]',
    '',
    'Builds a non-importing CSV template for the release-quality fields needed before secure-extension live promotion.',
  ].join('\n');
}

function readJsonFile(filePath) {
  const resolved = resolve(filePath);
  if (!existsSync(resolved)) {
    throw new Error(`JSON file not found: ${filePath}`);
  }
  return JSON.parse(readFileSync(resolved, 'utf8'));
}

function writeTemplateFiles(outDir, template) {
  const resolvedOutDir = resolve(outDir);
  mkdirSync(resolvedOutDir, { recursive: true });
  writeFileSync(
    resolve(resolvedOutDir, 'secure-vocabulary-release-input-template.csv'),
    template.csv,
    'utf8'
  );
  writeFileSync(
    resolve(resolvedOutDir, 'secure-vocabulary-release-input-template-manifest.json'),
    `${JSON.stringify(template.manifest, null, 2)}\n`,
    'utf8'
  );
  writeFileSync(
    resolve(resolvedOutDir, 'README.md'),
    template.markdown,
    'utf8'
  );
}

function isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  try {
    const options = parseArgs(process.argv);
    if (options.help) {
      console.log(usage());
      process.exit(0);
    }
    if (!options.auditedSourcePath || !options.outDir) {
      console.error(usage());
      process.exit(2);
    }

    const template = buildSecureVocabularyReleaseInputTemplate({
      auditedSource: readJsonFile(options.auditedSourcePath),
    });
    writeTemplateFiles(options.outDir, template);

    const output = {
      ok: true,
      outDir: resolve(options.outDir),
      secureExtensionRows: template.manifest.counts.secureExtensionRows,
      advisoryRows: template.manifest.counts.advisoryRows,
      sourceJsonlSha256: template.manifest.source.sourceJsonlSha256,
    };

    if (options.json) {
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.log(`Secure vocabulary release input template written: ${output.secureExtensionRows} row(s)`);
    }
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2));
    process.exit(1);
  }
}
