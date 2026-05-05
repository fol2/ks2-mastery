#!/usr/bin/env node
/**
 * Grammar QG — Runtime certification status source generator.
 *
 * Converts the certified status-map artefact into a Worker-safe ES module.
 * The generated module is the runtime scheduling authority; it must be kept in
 * byte-for-byte sync with the manifest status-map artefact.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { parseArgs } from 'node:util';

import {
  GRAMMAR_CONTENT_RELEASE_ID,
  GRAMMAR_TEMPLATE_METADATA,
} from '../worker/src/subjects/grammar/content.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_STATUS_MAP_PATH = path.join(ROOT_DIR, 'reports', 'grammar', 'grammar-qg-p11-certification-status-map.json');
const DEFAULT_OUTPUT_PATH = path.join(ROOT_DIR, 'worker', 'src', 'subjects', 'grammar', 'certification-status.generated.js');

function repoRelativePath(filePath) {
  return path.relative(ROOT_DIR, filePath).replaceAll('\\', '/');
}

const VALID_RUNTIME_STATUSES = new Set([
  'approved',
  'approved_with_limitation',
  'approved_with_review',
  'blocked',
  'retire_candidate',
]);

function releasePhaseLabel(releaseId) {
  const match = String(releaseId || '').match(/grammar-qg-p(\d+)-/i);
  return match ? `P${match[1]}` : 'release';
}

function normaliseEntry(rawEntry, source) {
  const templateId = rawEntry?.templateId || source?.templateId;
  const status = rawEntry?.status || rawEntry?.decision;
  const retired = rawEntry?.retired === true
    || rawEntry?.historical === true
    || rawEntry?.runtime === false
    || rawEntry?.scheduling === 'retired';

  return {
    templateId,
    status,
    severity: rawEntry?.severity || 'none',
    evidence: Array.isArray(rawEntry?.evidence) ? rawEntry.evidence : [],
    retired,
  };
}

function extractStatusEntries(statusMap) {
  if (Array.isArray(statusMap?.entries)) {
    return statusMap.entries.map((entry) => normaliseEntry(entry));
  }

  return Object.entries(statusMap || {})
    .filter(([key]) => key !== 'metadata')
    .map(([templateId, entry]) => normaliseEntry(entry, { templateId }));
}

function assertValidStatusMap(statusMap, statusMapPath) {
  const metadataRelease = statusMap?.metadata?.contentReleaseId;
  if (metadataRelease !== GRAMMAR_CONTENT_RELEASE_ID) {
    throw new Error(
      `Status map release ID mismatch: ${metadataRelease || 'missing'} in ${path.relative(ROOT_DIR, statusMapPath)}; expected ${GRAMMAR_CONTENT_RELEASE_ID}`,
    );
  }

  const metadataTemplateCount = statusMap?.metadata?.templateCount;
  if (metadataTemplateCount != null && metadataTemplateCount !== GRAMMAR_TEMPLATE_METADATA.length) {
    throw new Error(
      `Status map templateCount mismatch: ${metadataTemplateCount}; expected ${GRAMMAR_TEMPLATE_METADATA.length}`,
    );
  }
}

export function buildRuntimeCertificationStatus(statusMap, opts = {}) {
  const statusMapPath = opts.statusMapPath || DEFAULT_STATUS_MAP_PATH;
  assertValidStatusMap(statusMap, statusMapPath);

  const currentTemplateIds = new Set(GRAMMAR_TEMPLATE_METADATA.map((template) => template.id));
  const byTemplateId = new Map();
  const duplicateIds = [];
  const unknownIds = [];

  for (const rawEntry of extractStatusEntries(statusMap)) {
    const entry = normaliseEntry(rawEntry);
    if (!entry.templateId || typeof entry.templateId !== 'string') {
      throw new Error(`Status map has an entry without a string templateId in ${path.relative(ROOT_DIR, statusMapPath)}`);
    }
    if (!entry.status || !VALID_RUNTIME_STATUSES.has(entry.status)) {
      throw new Error(`Status map entry ${entry.templateId} has invalid status: ${entry.status || 'missing'}`);
    }
    if (!Array.isArray(entry.evidence) || entry.evidence.length === 0) {
      throw new Error(`Status map entry ${entry.templateId} has no evidence array`);
    }
    if (byTemplateId.has(entry.templateId)) {
      duplicateIds.push(entry.templateId);
      continue;
    }
    if (!currentTemplateIds.has(entry.templateId)) {
      if (entry.retired) continue;
      unknownIds.push(entry.templateId);
      continue;
    }
    byTemplateId.set(entry.templateId, {
      status: entry.status,
      severity: entry.severity,
      evidence: [...entry.evidence],
    });
  }

  if (duplicateIds.length > 0) {
    throw new Error(`Status map has duplicate template IDs: ${duplicateIds.join(', ')}`);
  }
  if (unknownIds.length > 0) {
    throw new Error(
      `Status map has unknown active template IDs not present in GRAMMAR_TEMPLATE_METADATA: ${unknownIds.join(', ')}`,
    );
  }

  const missingIds = [];
  for (const templateId of currentTemplateIds) {
    if (!byTemplateId.has(templateId)) missingIds.push(templateId);
  }
  if (missingIds.length > 0) {
    throw new Error(`Fail-closed: ${missingIds.length} template(s) missing from status map: ${missingIds.join(', ')}`);
  }

  const orderedEntries = {};
  for (const template of GRAMMAR_TEMPLATE_METADATA) {
    orderedEntries[template.id] = byTemplateId.get(template.id);
  }

  return {
    releaseId: GRAMMAR_CONTENT_RELEASE_ID,
    sourcePath: repoRelativePath(statusMapPath),
    sourceGeneratedAt: statusMap.metadata.generatedAt || null,
    templateCount: Object.keys(orderedEntries).length,
    statusCounts: Object.values(orderedEntries).reduce((counts, entry) => {
      counts[entry.status] = (counts[entry.status] || 0) + 1;
      return counts;
    }, {}),
    entries: orderedEntries,
  };
}

export function buildGeneratedSource(runtimeStatus) {
  const rawEntriesJson = JSON.stringify(runtimeStatus.entries, null, 2);
  const statusCountsJson = JSON.stringify(runtimeStatus.statusCounts, null, 2);
  const phaseLabel = releasePhaseLabel(runtimeStatus.releaseId);

  return `/**
 * Grammar QG ${phaseLabel} — generated runtime certification status.
 *
 * Source artefact: ${runtimeStatus.sourcePath}
 * Content release: ${runtimeStatus.releaseId}
 * Template entries: ${runtimeStatus.templateCount}
 *
 * Do not edit manually. Regenerate with:
 * node scripts/generate-grammar-qg-runtime-certification-status.mjs --status-map=${runtimeStatus.sourcePath} --out=worker/src/subjects/grammar/certification-status.generated.js
 */

const RAW_CERTIFICATION_STATUS_MAP = ${rawEntriesJson};

export const GRAMMAR_RUNTIME_CERTIFICATION_RELEASE_ID = ${JSON.stringify(runtimeStatus.releaseId)};
export const GRAMMAR_RUNTIME_CERTIFICATION_SOURCE = ${JSON.stringify(runtimeStatus.sourcePath)};
export const GRAMMAR_RUNTIME_CERTIFICATION_SOURCE_GENERATED_AT = ${JSON.stringify(runtimeStatus.sourceGeneratedAt)};
export const GRAMMAR_RUNTIME_CERTIFICATION_TEMPLATE_COUNT = ${runtimeStatus.templateCount};
export const GRAMMAR_RUNTIME_CERTIFICATION_STATUS_COUNTS = Object.freeze(${statusCountsJson});

export const CERTIFICATION_STATUS_MAP = Object.freeze(
  Object.fromEntries(
    Object.entries(RAW_CERTIFICATION_STATUS_MAP).map(([templateId, entry]) => [
      templateId,
      Object.freeze({
        status: entry.status,
        severity: entry.severity,
        evidence: Object.freeze([...entry.evidence]),
      }),
    ]),
  ),
);
`;
}

export async function generateRuntimeCertificationStatus(opts = {}) {
  const statusMapPath = path.resolve(opts.statusMapPath || DEFAULT_STATUS_MAP_PATH);
  const outPath = path.resolve(opts.outPath || DEFAULT_OUTPUT_PATH);
  const statusMap = JSON.parse(await fs.readFile(statusMapPath, 'utf8'));
  const runtimeStatus = buildRuntimeCertificationStatus(statusMap, { statusMapPath });
  const source = buildGeneratedSource(runtimeStatus);

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, source, 'utf8');

  return { runtimeStatus, outPath, source };
}

function parseCli() {
  const { values } = parseArgs({
    options: {
      'status-map': { type: 'string', default: DEFAULT_STATUS_MAP_PATH },
      out: { type: 'string', default: DEFAULT_OUTPUT_PATH },
    },
    strict: false,
  });

  return {
    statusMapPath: values['status-map'],
    outPath: values.out,
  };
}

async function main() {
  const result = await generateRuntimeCertificationStatus(parseCli());
  console.log('Grammar QG runtime certification status generated:');
  console.log(`  Content release: ${result.runtimeStatus.releaseId}`);
  console.log(`  Templates: ${result.runtimeStatus.templateCount}`);
  console.log(`  Status counts: ${JSON.stringify(result.runtimeStatus.statusCounts)}`);
  console.log(`  Output: ${result.outPath}`);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main().catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  });
}
