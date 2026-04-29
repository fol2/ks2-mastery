#!/usr/bin/env node
/**
 * Grammar QG P7 — Production Telemetry Export & Anonymisation
 *
 * CLI: node scripts/export-grammar-qg-events.mjs --input=<path> --output=<path> --expanded-output=<path>
 *       [--salt-file=<path>] [--release-id=<id>] [--date-from=<iso>] [--date-to=<iso>]
 *       [--template-id=<id>] [--concept-id=<id>] [--dry-run]
 *
 * Exports grammar answer events with:
 * - Filtering by subject (grammar), release IDs (grammar-qg-p6-2026-04-29 onward)
 * - HMAC-SHA-256 anonymisation of learner IDs (with salt) or 'anonymous' (without)
 * - Scrubbing learnerId from event.id field (production format: grammar.answer.{learnerId}.{requestId}.{itemId})
 * - Event expansion via expandEvents for downstream calibration
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandEvents } from './grammar-qg-expand-events.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Constants ─────────────────────────────────────────────────────────────

const VALID_SUBJECT = 'grammar';
const MIN_RELEASE_ID = 'grammar-qg-p6-2026-04-29';

// ─── Anonymisation ─────────────────────────────────────────────────────────

/**
 * Anonymise a learner ID using HMAC-SHA-256 with optional salt.
 * With salt: truncated 16-hex HMAC. Without salt: 'anonymous'.
 *
 * @param {string} learnerId - Raw learner ID
 * @param {string|null} salt - HMAC salt (null → 'anonymous')
 * @returns {string} Anonymised ID
 */
export function anonymiseLearnerId(learnerId, salt) {
  if (!salt) return 'anonymous';
  if (!learnerId || typeof learnerId !== 'string') return 'anonymous';
  const hmac = createHmac('sha256', salt);
  hmac.update(learnerId);
  return hmac.digest('hex').slice(0, 16);
}

/**
 * Scrub learnerId from an event.id field.
 * Production format: grammar.answer-submitted.{learnerId}.{requestId}.{itemId}
 * After scrub: grammar.answer-submitted.{anonymisedId}.{requestId}.{itemId}
 *
 * @param {string} eventId - Raw event ID
 * @param {string} learnerId - Raw learner ID to scrub
 * @param {string} anonymisedId - Replacement anonymised ID
 * @returns {string} Scrubbed event ID
 */
function scrubEventId(eventId, learnerId, anonymisedId) {
  if (!eventId || typeof eventId !== 'string') return eventId;
  if (!learnerId) return eventId;
  // Replace all occurrences of the raw learner ID in the event ID
  return eventId.split(learnerId).join(anonymisedId);
}

/**
 * Anonymise a single event — scrub learnerId from all fields.
 *
 * @param {Object} event - Raw event
 * @param {string|null} salt - HMAC salt
 * @returns {Object} Anonymised event (new object)
 */
export function anonymiseEvent(event, salt) {
  if (!event || typeof event !== 'object') return event;

  const rawLearnerId = event.learnerId || '';
  const anonymisedId = anonymiseLearnerId(rawLearnerId, salt);

  const result = { ...event };
  result.learnerId = anonymisedId;

  // Scrub learner ID from event.id field
  if (result.id && rawLearnerId) {
    result.id = scrubEventId(result.id, rawLearnerId, anonymisedId);
  }

  return result;
}

// ─── Filtering ─────────────────────────────────────────────────────────────

/**
 * Compare release IDs lexicographically to enforce minimum release.
 */
function releaseIdAtOrAfter(releaseId, minReleaseId) {
  if (!releaseId) return false;
  return releaseId >= minReleaseId;
}

/**
 * Filter events by subject, release ID, date range, template, and concept.
 *
 * @param {Object[]} events - Array of events
 * @param {Object} options - Filter options
 * @param {string} [options.releaseId] - Exact release ID filter
 * @param {string} [options.dateFrom] - ISO date lower bound (inclusive)
 * @param {string} [options.dateTo] - ISO date upper bound (inclusive)
 * @param {string} [options.templateId] - Filter to specific template
 * @param {string} [options.conceptId] - Filter to specific concept
 * @returns {Object[]} Filtered events
 */
export function filterEvents(events, options = {}) {
  const { releaseId, dateFrom, dateTo, templateId, conceptId } = options;

  return events.filter((event) => {
    if (!event || typeof event !== 'object') return false;

    // Subject must be grammar
    if (event.subject && event.subject !== VALID_SUBJECT) return false;

    // Release ID must be at or after minimum
    const evtRelease = event.releaseId || event.release || '';
    if (!releaseIdAtOrAfter(evtRelease, MIN_RELEASE_ID)) return false;

    // Exact release ID filter
    if (releaseId && evtRelease !== releaseId) return false;

    // Date range filter
    const ts = event.timestamp || event.createdAt;
    if (dateFrom && ts && ts < dateFrom) return false;
    if (dateTo && ts && ts > dateTo) return false;

    // Template filter
    if (templateId && event.templateId !== templateId) return false;

    // Concept filter
    if (conceptId) {
      const conceptIds = Array.isArray(event.conceptIds) ? event.conceptIds : [];
      if (event.conceptId !== conceptId && !conceptIds.includes(conceptId)) return false;
    }

    return true;
  });
}

// ─── Main export function ──────────────────────────────────────────────────

/**
 * Full export pipeline: filter → anonymise → expand.
 *
 * @param {Object[]} events - Raw events
 * @param {Object} options
 * @param {string|null} options.salt - HMAC salt for anonymisation
 * @param {string} [options.releaseId] - Release ID filter
 * @param {string} [options.dateFrom] - ISO date lower bound
 * @param {string} [options.dateTo] - ISO date upper bound
 * @param {string} [options.templateId] - Template ID filter
 * @param {string} [options.conceptId] - Concept ID filter
 * @param {boolean} [options.dryRun=false] - If true, return summary only
 * @returns {{ filtered: Object[], anonymised: Object[], expanded: Object, summary: Object }}
 */
export function exportGrammarEvents(events, options = {}) {
  const { salt, releaseId, dateFrom, dateTo, templateId, conceptId, dryRun } = options;

  // Step 1: Filter
  const filtered = filterEvents(events, { releaseId, dateFrom, dateTo, templateId, conceptId });

  // Step 2: Anonymise
  const anonymised = filtered.map((evt) => anonymiseEvent(evt, salt));

  // Step 3: Expand (for calibration downstream)
  const expanded = expandEvents(anonymised);

  const summary = {
    inputCount: events.length,
    filteredCount: filtered.length,
    anonymisedCount: anonymised.length,
    expandedRowCount: expanded.totalOutput,
    malformedCount: expanded.malformedCount,
    dryRun: !!dryRun,
    salt: salt ? 'provided' : 'none',
  };

  if (dryRun) {
    return { filtered: [], anonymised: [], expanded: { rows: [], totalInput: 0, totalOutput: 0, malformedCount: 0 }, summary };
  }

  return { filtered, anonymised, expanded, summary };
}

// ─── CLI ───────────────────────────────────────────────────────────────────

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

  if (!args.input) {
    console.error(
      'Usage: export-grammar-qg-events.mjs --input=<path> --output=<path> --expanded-output=<path>\n' +
      '       [--salt-file=<path>] [--release-id=<id>] [--date-from=<iso>] [--date-to=<iso>]\n' +
      '       [--template-id=<id>] [--concept-id=<id>] [--dry-run]',
    );
    process.exit(1);
  }

  const inputPath = path.resolve(args.input);
  const raw = readFileSync(inputPath, 'utf-8');
  const events = JSON.parse(raw);

  if (!Array.isArray(events)) {
    console.error('Input must be a JSON array of events');
    process.exit(1);
  }

  // Load salt
  let salt = null;
  if (args['salt-file']) {
    salt = readFileSync(path.resolve(args['salt-file']), 'utf-8').trim();
  }

  const result = exportGrammarEvents(events, {
    salt,
    releaseId: args['release-id'] || undefined,
    dateFrom: args['date-from'] || undefined,
    dateTo: args['date-to'] || undefined,
    templateId: args['template-id'] || undefined,
    conceptId: args['concept-id'] || undefined,
    dryRun: !!args['dry-run'],
  });

  // Output summary to stdout
  console.log(JSON.stringify(result.summary, null, 2));

  if (!args['dry-run']) {
    if (args.output) {
      writeFileSync(path.resolve(args.output), JSON.stringify(result.anonymised, null, 2) + '\n', 'utf8');
      process.stderr.write(`Anonymised events written to ${args.output}\n`);
    }
    if (args['expanded-output']) {
      writeFileSync(path.resolve(args['expanded-output']), JSON.stringify(result.expanded.rows, null, 2) + '\n', 'utf8');
      process.stderr.write(`Expanded rows written to ${args['expanded-output']}\n`);
    }
  }
}
