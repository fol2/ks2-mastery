#!/usr/bin/env node

/**
 * Operator utility: prepare a session manifest ahead of a capacity test.
 *
 * Creates N demo sessions sequentially with delays to stay under the per-IP
 * rate limit (DEMO_LIMITS.createIp = 30 per 10-min window). The manifest can
 * then be fed to the classroom load driver via --session-manifest, bypassing
 * real-time session creation during the test itself.
 *
 * Usage:
 *   node scripts/prepare-session-manifest.mjs \
 *     --origin https://ks2.eugnel.uk \
 *     --learners 60 \
 *     --output manifests/60-learners.json
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Wait for the full per-IP demo-session window before starting the next batch.
// A shorter inter-batch delay can still exhaust DEMO_LIMITS.createIp on 60+
// learner manifests, which turns a capacity preflight into setup noise.
export const DEFAULT_DELAY_MS = 610_000;
export const BATCH_SIZE = 28; // safe margin under the 30 sessions / 10 min bucket

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    origin: '',
    learners: 0,
    output: '',
    delayMs: DEFAULT_DELAY_MS,
    batchSize: BATCH_SIZE,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--origin') {
      options.origin = argv[i + 1];
      i += 1;
    } else if (arg === '--learners') {
      options.learners = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--output') {
      options.output = argv[i + 1];
      i += 1;
    } else if (arg === '--delay-ms') {
      options.delayMs = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--batch-size') {
      options.batchSize = Number(argv[i + 1]);
      i += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

export function validate(options) {
  if (!options.origin) throw new Error('--origin is required.');
  if (!Number.isInteger(options.learners) || options.learners < 1) {
    throw new Error('--learners must be a positive integer.');
  }
  if (!options.output) throw new Error('--output is required.');
  if (!Number.isFinite(options.delayMs) || options.delayMs < 0) {
    throw new Error('--delay-ms must be a non-negative number.');
  }
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 30) {
    throw new Error('--batch-size must be an integer from 1 to 30.');
  }
}

function usage() {
  return [
    'Usage: node scripts/prepare-session-manifest.mjs [options]',
    '',
    'Options:',
    '  --origin <url>       Target origin (required)',
    '  --learners <n>       Number of demo sessions to create (required)',
    '  --output <path>      Output path for the manifest JSON (required)',
    '  --delay-ms <ms>      Delay between batches, default 610000',
    '  --batch-size <n>     Sessions per batch before pausing, default 28',
    '  --help               Show this help',
    '',
    'The manifest JSON is an array of:',
    '  { "learnerId": "...", "sessionCookie": "...", "createdAt": "...", "sourceIp": "..." }',
  ].join('\n');
}

async function wait(ms) {
  if (!ms) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function getSessionCookie(response) {
  const setCookie = response.headers.get?.('set-cookie') || '';
  const cookies = setCookie.split(/,\s*(?=ks2_)/);
  for (const cookie of cookies) {
    const pair = cookie.split(';')[0];
    if (pair.startsWith('ks2_session=')) return pair;
  }
  return '';
}

async function createOneSession(origin, index, total) {
  const response = await fetch(new URL('/api/demo/session', origin), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      origin,
    },
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Session ${index + 1}/${total}: non-JSON response (status ${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(
      `Session ${index + 1}/${total}: failed with status ${response.status}: ${payload.message || payload.error || text.slice(0, 200)}`,
    );
  }

  const cookie = getSessionCookie(response);
  const learnerId = payload.session?.learnerId;
  if (!cookie || !learnerId) {
    throw new Error(
      `Session ${index + 1}/${total}: missing cookie or learnerId in response.`,
    );
  }

  return {
    learnerId,
    sessionCookie: cookie,
    createdAt: new Date().toISOString(),
    sourceIp: 'operator-local',
  };
}

export async function prepareSessionManifest(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return { ok: true, help: true };
  }
  validate(options);

  const { origin, learners, output, delayMs, batchSize } = options;
  const entries = [];

  console.log(`Preparing session manifest: ${learners} sessions from ${origin}`);
  console.log(`Batch size: ${batchSize}, delay between batches: ${delayMs}ms`);

  for (let i = 0; i < learners; i += 1) {
    const entry = await createOneSession(origin, i, learners);
    entries.push(entry);
    console.log(`  Session ${i + 1}/${learners}: learnerId=${entry.learnerId}`);

    // Pause between batches to respect rate limits
    if ((i + 1) % batchSize === 0 && i + 1 < learners) {
      console.log(`  Pausing ${delayMs}ms to respect rate limits...`);
      await wait(delayMs);
    }
  }

  const absolutePath = resolve(process.cwd(), output);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, JSON.stringify(entries, null, 2));
  console.log(`Manifest written: ${absolutePath} (${entries.length} entries)`);

  return { ok: true, path: absolutePath, count: entries.length };
}

if (process.argv[1] && !process.env.NODE_TEST_CONTEXT && import.meta.url === pathToFileURL(process.argv[1]).href) {
  prepareSessionManifest().then((result) => {
    if (!result.ok) process.exitCode = 1;
  }).catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 2;
  });
}
