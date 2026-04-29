import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  loadSessionManifest,
  validateManifestEntry,
} from '../scripts/lib/session-manifest.mjs';
import {
  parseClassroomLoadArgs,
  FAILURE_CLASSES,
} from '../scripts/classroom-load-test.mjs';
import {
  BATCH_SIZE as SESSION_MANIFEST_BATCH_SIZE,
  DEFAULT_DELAY_MS as SESSION_MANIFEST_DEFAULT_DELAY_MS,
  parseArgs as parseSessionManifestArgs,
  validate as validateSessionManifestOptions,
} from '../scripts/prepare-session-manifest.mjs';

// ---------------------------------------------------------------------------
// loadSessionManifest — rejection cases
// ---------------------------------------------------------------------------

test('loadSessionManifest rejects empty array', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-manifest-'));
  const manifestPath = join(tempDir, 'empty.json');
  writeFileSync(manifestPath, JSON.stringify([]));
  try {
    assert.throws(
      () => loadSessionManifest(manifestPath),
      /empty.*at least one entry/i,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('loadSessionManifest rejects entries with missing fields', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-manifest-'));
  const manifestPath = join(tempDir, 'bad-fields.json');
  writeFileSync(manifestPath, JSON.stringify([
    { learnerId: 'l1', sessionCookie: 'ks2_session=abc' },
  ]));
  try {
    assert.throws(
      () => loadSessionManifest(manifestPath),
      /missing required field "createdAt"/i,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('loadSessionManifest rejects duplicate learnerIds', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-manifest-'));
  const manifestPath = join(tempDir, 'duplicates.json');
  const entry = {
    learnerId: 'l1',
    sessionCookie: 'ks2_session=abc',
    createdAt: '2026-04-28T00:00:00Z',
    sourceIp: '127.0.0.1',
  };
  writeFileSync(manifestPath, JSON.stringify([entry, entry]));
  try {
    assert.throws(
      () => loadSessionManifest(manifestPath),
      /duplicate learnerIds.*l1/i,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('loadSessionManifest accepts valid manifest and returns entries with count', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-manifest-'));
  const manifestPath = join(tempDir, 'valid.json');
  const entries = [
    {
      learnerId: 'l1',
      sessionCookie: 'ks2_session=abc',
      createdAt: '2026-04-28T00:00:00Z',
      sourceIp: '127.0.0.1',
    },
    {
      learnerId: 'l2',
      sessionCookie: 'ks2_session=def',
      createdAt: '2026-04-28T00:00:01Z',
      sourceIp: '127.0.0.1',
    },
  ];
  writeFileSync(manifestPath, JSON.stringify(entries));
  try {
    const result = loadSessionManifest(manifestPath);
    assert.equal(result.count, 2);
    assert.equal(result.entries.length, 2);
    assert.equal(result.entries[0].learnerId, 'l1');
    assert.equal(result.entries[1].learnerId, 'l2');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// loadSessionManifest — additional edge cases
// ---------------------------------------------------------------------------

test('loadSessionManifest rejects non-array JSON', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-manifest-'));
  const manifestPath = join(tempDir, 'object.json');
  writeFileSync(manifestPath, JSON.stringify({ entries: [] }));
  try {
    assert.throws(
      () => loadSessionManifest(manifestPath),
      /must be a JSON array/i,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('loadSessionManifest rejects entries with empty string fields', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-manifest-'));
  const manifestPath = join(tempDir, 'empty-string.json');
  writeFileSync(manifestPath, JSON.stringify([
    {
      learnerId: '',
      sessionCookie: 'ks2_session=abc',
      createdAt: '2026-04-28T00:00:00Z',
      sourceIp: '127.0.0.1',
    },
  ]));
  try {
    assert.throws(
      () => loadSessionManifest(manifestPath),
      /empty or non-string "learnerId"/i,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('loadSessionManifest rejects missing file with clear error', () => {
  assert.throws(
    () => loadSessionManifest('/nonexistent/path/manifest.json'),
    /Failed to read session manifest/,
  );
});

test('loadSessionManifest rejects invalid JSON', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-manifest-'));
  const manifestPath = join(tempDir, 'bad.json');
  writeFileSync(manifestPath, 'not valid json {');
  try {
    assert.throws(
      () => loadSessionManifest(manifestPath),
      /not valid JSON/,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// validateManifestEntry — unit-level checks
// ---------------------------------------------------------------------------

test('validateManifestEntry returns valid for complete entry', () => {
  const result = validateManifestEntry({
    learnerId: 'l1',
    sessionCookie: 'ks2_session=abc',
    createdAt: '2026-04-28T00:00:00Z',
    sourceIp: '127.0.0.1',
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('validateManifestEntry rejects null entry', () => {
  const result = validateManifestEntry(null, 0);
  assert.equal(result.valid, false);
  assert.ok(result.errors[0].includes('not a plain object'));
});

// ---------------------------------------------------------------------------
// parseClassroomLoadArgs — mutual exclusivity
// ---------------------------------------------------------------------------

test('parseClassroomLoadArgs throws when both --session-manifest and --demo-sessions are provided', () => {
  assert.throws(
    () => parseClassroomLoadArgs([
      '--demo-sessions',
      '--session-manifest', '/tmp/manifest.json',
    ]),
    /mutually exclusive/i,
  );
});

test('parseClassroomLoadArgs accepts --session-manifest alone', () => {
  const options = parseClassroomLoadArgs([
    '--dry-run',
    '--session-manifest', '/tmp/manifest.json',
  ]);
  assert.equal(options.sessionManifest, '/tmp/manifest.json');
  assert.equal(options.demoSessions, false);
});

// ---------------------------------------------------------------------------
// FAILURE_CLASSES taxonomy
// ---------------------------------------------------------------------------

test('FAILURE_CLASSES taxonomy covers all expected values', () => {
  const expected = ['setup', 'auth', 'bootstrap', 'command', 'threshold', 'transport', 'evidence-write'];
  assert.deepEqual([...FAILURE_CLASSES].sort(), [...expected].sort());
});

test('FAILURE_CLASSES is frozen (immutable)', () => {
  assert.ok(Object.isFrozen(FAILURE_CLASSES));
});

// ---------------------------------------------------------------------------
// prepare-session-manifest — rate-limit-safe defaults
// ---------------------------------------------------------------------------

test('prepare-session-manifest defaults span the full demo-session rate-limit window', () => {
  const options = parseSessionManifestArgs([
    '--origin', 'https://ks2.eugnel.uk',
    '--learners', '60',
    '--output', 'reports/capacity/manifests/60-learners.json',
  ]);

  assert.equal(options.delayMs, SESSION_MANIFEST_DEFAULT_DELAY_MS);
  assert.equal(options.delayMs, 610_000);
  assert.equal(options.batchSize, SESSION_MANIFEST_BATCH_SIZE);
  assert.equal(options.batchSize, 28);
});

test('prepare-session-manifest rejects batches above the production per-IP demo limit', () => {
  const options = parseSessionManifestArgs([
    '--origin', 'https://ks2.eugnel.uk',
    '--learners', '60',
    '--output', 'reports/capacity/manifests/60-learners.json',
    '--batch-size', '31',
  ]);

  assert.throws(
    () => validateSessionManifestOptions(options),
    /--batch-size must be an integer from 1 to 30/i,
  );
});
