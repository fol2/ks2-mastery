#!/usr/bin/env node
/**
 * Grammar QG P7 — Canonical Event Expansion Pipeline
 *
 * Expands raw Grammar events with multi-concept conceptIds arrays into
 * per-concept rows for downstream calibration analysis.
 *
 * CLI: node scripts/grammar-qg-expand-events.mjs --input=<path> --output=<path>
 *
 * Input: JSON array of raw Grammar events
 * Output: JSON array of expanded per-concept rows
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Validate that an event has the minimum required fields for expansion.
 */
function isExpandableEvent(event) {
  if (!event || typeof event !== 'object') return false;
  if (typeof event.templateId !== 'string' || event.templateId === '') return false;
  if (!Array.isArray(event.conceptIds) || event.conceptIds.length === 0) return false;
  if (!event.timestamp && !event.createdAt) return false;
  return true;
}

/**
 * Extract concept status for a specific conceptId from the statusBefore field.
 * Handles both legacy string format and P6 per-concept object format.
 */
function extractConceptStatus(statusField, conceptId) {
  if (typeof statusField === 'string') return statusField;
  if (statusField && typeof statusField === 'object' && !Array.isArray(statusField)) {
    return statusField[conceptId] || 'new';
  }
  return 'new';
}

/**
 * Core expansion function: expand a single event into per-concept rows.
 *
 * @param {Object} event - A raw Grammar event
 * @returns {Object[]} Array of expanded rows (one per concept)
 */
export function expandEvent(event) {
  if (!isExpandableEvent(event)) return [];

  const conceptIds = event.conceptIds;
  const parentEventId = event.id || `${event.templateId}:${event.timestamp || event.createdAt}`;
  const tags = Array.isArray(event.tags) ? event.tags : [];

  return conceptIds.map((conceptId) => ({
    // Row identity
    rowId: `${parentEventId}:${conceptId}`,
    // Carry forward all parent fields
    ...event,
    // Per-concept fields (override the parent array)
    conceptId,
    conceptStatusBefore: extractConceptStatus(event.conceptStatusBefore, conceptId),
    conceptStatusAfter: extractConceptStatus(event.conceptStatusAfter, conceptId),
    isMixedTransfer: tags.includes('mixed-transfer'),
    isExplanation: tags.includes('explain') || tags.includes('explanation') || event.questionType === 'explain',
    isSurgery: event.mode === 'surgery',
    isManualReviewOnly: event.result?.manualReviewOnly === true,
  }));
}

/**
 * Expand an array of raw events into per-concept rows.
 *
 * @param {Object[]} events - Array of raw Grammar events
 * @returns {{ rows: Object[], totalInput: number, totalOutput: number, malformedCount: number }}
 */
export function expandEvents(events) {
  let malformedCount = 0;
  const rows = [];

  for (const event of events) {
    if (!isExpandableEvent(event)) {
      malformedCount++;
      continue;
    }
    const expanded = expandEvent(event);
    rows.push(...expanded);
  }

  return {
    rows,
    totalInput: events.length,
    totalOutput: rows.length,
    malformedCount,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        args[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else {
        args[arg.slice(2)] = true;
      }
    }
  }
  return args;
}

const isMainModule =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMainModule) {
  const args = parseArgs(process.argv.slice(2));

  if (!args.input || !args.output) {
    console.error('Usage: grammar-qg-expand-events.mjs --input=<path> --output=<path>');
    process.exit(1);
  }

  const inputPath = path.resolve(args.input);
  const outputPath = path.resolve(args.output);

  const raw = readFileSync(inputPath, 'utf-8');
  const events = JSON.parse(raw);

  if (!Array.isArray(events)) {
    console.error('Input must be a JSON array of events');
    process.exit(1);
  }

  const { rows, totalInput, totalOutput, malformedCount } = expandEvents(events);

  writeFileSync(outputPath, JSON.stringify(rows, null, 2) + '\n', 'utf8');

  // Summary to stderr
  process.stderr.write(`totalInput: ${totalInput}\n`);
  process.stderr.write(`totalOutput: ${totalOutput}\n`);
  process.stderr.write(`malformedCount: ${malformedCount}\n`);
}
