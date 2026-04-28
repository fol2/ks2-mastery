// Hero Mode P2 — Boundary, accessibility, and no-economy hardening tests.
//
// Structural scans (S-P2-*): verify P2 client code respects the import
// graph contract — no worker imports, no D1 write primitives, no economy
// vocabulary, no hero.* event emission, no Hero migration files.
//
// Accessibility (A-P2-*): SSR render of HeroQuestCard and HeroTaskBanner
// verifying accessible names, aria-busy, aria-live, and absence of
// inline animation styles.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { HERO_FORBIDDEN_VOCABULARY } from '../shared/hero/hero-copy.js';
import {
  renderHeroQuestCardFixture,
  renderHeroTaskBannerFixture,
} from './helpers/react-render.js';

// ── Helpers ──────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * True when node_modules/react is resolvable — false in worktrees that
 * share the git directory but lack their own node_modules symlink.
 * Accessibility tests that require SSR rendering skip when unavailable.
 */
const HAS_NODE_MODULES = fs.existsSync(path.join(REPO_ROOT, 'node_modules', 'react'));

/**
 * Attempt an SSR render; return the HTML string on success.
 * If esbuild cannot resolve react (worktree without node_modules),
 * return null so the calling test can skip gracefully.
 */
async function tryRender(renderFn, fixture) {
  try {
    return await renderFn(fixture);
  } catch (err) {
    if (err.message && err.message.includes('Could not resolve "react"')) {
      return null;
    }
    throw err;
  }
}

function collectJsFiles(dir) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJsFiles(full));
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.jsx'))) {
      results.push(full);
    }
  }
  return results;
}

function stripComments(source) {
  return source
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

const CLIENT_HERO_DIR = path.join(REPO_ROOT, 'src', 'platform', 'hero');
const HERO_QUEST_CARD_PATH = path.join(REPO_ROOT, 'src', 'surfaces', 'home', 'HeroQuestCard.jsx');
const HERO_TASK_BANNER_PATH = path.join(REPO_ROOT, 'src', 'surfaces', 'subject', 'HeroTaskBanner.jsx');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'worker', 'migrations');

// Collect client hero platform files
const CLIENT_HERO_FILES = collectJsFiles(CLIENT_HERO_DIR);

// Collect all P2 UI files (cards + banners)
const P2_UI_FILES = [HERO_QUEST_CARD_PATH, HERO_TASK_BANNER_PATH]
  .filter((f) => fs.existsSync(f));

// All P2 client files: platform + UI
const ALL_P2_CLIENT_FILES = [...CLIENT_HERO_FILES, ...P2_UI_FILES];

// Pre-read all P2 client sources (stripped of comments)
const P2_SOURCES = new Map();
for (const filePath of ALL_P2_CLIENT_FILES) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
  P2_SOURCES.set(rel, { raw, code: stripComments(raw) });
}

// ── S-P2-1: Client Hero files do not import from worker/src/ ────────

test('S-P2-1: src/platform/hero/ files do not import from worker/src/', () => {
  assert.ok(CLIENT_HERO_FILES.length > 0, 'Expected at least one file in src/platform/hero/');

  for (const filePath of CLIENT_HERO_FILES) {
    const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
    const { code } = P2_SOURCES.get(rel);
    assert.ok(
      !code.includes('worker/src/'),
      `${rel} imports from worker/src/ — client Hero code must not import worker modules`,
    );
  }
});

// ── S-P2-1b: UI files only import hero-copy from shared/hero/ ───────

test('S-P2-1b: HeroQuestCard and HeroTaskBanner import only hero-copy from shared/hero/', () => {
  assert.ok(P2_UI_FILES.length > 0, 'Expected at least one P2 UI file (HeroQuestCard or HeroTaskBanner)');

  // These are the only allowed shared/hero/ imports for UI files.
  const ALLOWED_SHARED_HERO_MODULES = new Set(['hero-copy']);

  // Forbidden shared/hero/ modules — scheduler, eligibility, seed, etc.
  const FORBIDDEN_SHARED_HERO_FRAGMENTS = [
    'shared/hero/scheduler',
    'shared/hero/eligibility',
    'shared/hero/seed',
    'shared/hero/launch-context',
    'shared/hero/launch-status',
  ];

  for (const filePath of P2_UI_FILES) {
    const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
    const { code } = P2_SOURCES.get(rel);

    // Must not import from worker/src/
    assert.ok(
      !code.includes('worker/src/'),
      `${rel} imports from worker/src/ — P2 UI files must not import worker modules`,
    );

    // Check forbidden shared/hero/ modules explicitly
    for (const fragment of FORBIDDEN_SHARED_HERO_FRAGMENTS) {
      assert.ok(
        !code.includes(fragment),
        `${rel} imports from ${fragment} — P2 UI files may only import from shared/hero/hero-copy`,
      );
    }

    // Verify any shared/hero/ import only references hero-copy
    const sharedHeroImports = code.match(/shared\/hero\/([a-z0-9-]+)/g) || [];
    for (const match of sharedHeroImports) {
      const moduleName = match.replace('shared/hero/', '');
      assert.ok(
        ALLOWED_SHARED_HERO_MODULES.has(moduleName),
        `${rel} imports shared/hero/${moduleName} — only hero-copy is allowed for P2 UI files`,
      );
    }
  }
});

// ── S-P2-2: Economy vocabulary scan ─────────────────────────────────

test('S-P2-2: no P2 client file contains HERO_FORBIDDEN_VOCABULARY tokens', () => {
  assert.ok(HERO_FORBIDDEN_VOCABULARY.length > 0, 'HERO_FORBIDDEN_VOCABULARY must be non-empty');

  // Build case-insensitive regex patterns from the canonical forbidden list.
  const patterns = HERO_FORBIDDEN_VOCABULARY.map((token) => ({
    token,
    regex: new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
  }));

  // hero-copy.js defines the list — exclude it from the scan.
  // hero-client.js: P3 U9 introduces claimTask (economy-vocabulary is
  // legitimate in the API transport layer, not exposed to children).
  // hero-ui-model.js: P3 U10 introduces claim state derivation (canClaim,
  // lastClaim, claiming) — internal state management, not child-facing copy.
  const EXCLUDED_BASENAMES = new Set(['hero-copy.js', 'hero-client.js', 'hero-ui-model.js']);

  // Scan client hero platform files + UI files
  for (const [rel, { code }] of P2_SOURCES) {
    if (EXCLUDED_BASENAMES.has(path.basename(rel))) continue;
    for (const { token, regex } of patterns) {
      assert.ok(
        !regex.test(code),
        `${rel} contains forbidden economy vocabulary "${token}" — P2 Hero surfaces must not use economy language`,
      );
    }
  }
});

// ── S-P2-3: No Hero module writes D1 directly ──────────────────────

test('S-P2-3: src/platform/hero/ files do not use D1 write primitives', () => {
  assert.ok(CLIENT_HERO_FILES.length > 0, 'Expected at least one file in src/platform/hero/');

  const FORBIDDEN = ['.run(', '.batch(', 'bindStatement', 'createWorkerRepository'];

  for (const filePath of CLIENT_HERO_FILES) {
    const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
    const { code } = P2_SOURCES.get(rel);

    for (const token of FORBIDDEN) {
      assert.ok(
        !code.includes(token),
        `${rel} contains D1 write primitive "${token}" — client Hero code must not write to D1 directly`,
      );
    }
  }
});

// ── S-P2-4: No hero.* event emission ───────────────────────────────

test('S-P2-4: no P2 client file emits hero.* events', () => {
  // Match patterns like 'hero.started', 'hero.completed', `hero.${x}`, etc.
  const HERO_EVENT_PATTERN = /['"`]hero\./;

  for (const [rel, { code }] of P2_SOURCES) {
    assert.ok(
      !HERO_EVENT_PATTERN.test(code),
      `${rel} contains a hero.* event string — P2 Hero code must not emit hero-owned events`,
    );
  }
});

// ── S-P2-5: No Hero D1 migration ───────────────────────────────────

test('S-P2-5: no D1 migration file mentions hero table names', () => {
  let migrationFiles;
  try {
    migrationFiles = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  } catch {
    // No migrations directory — pass (no hero tables possible)
    return;
  }

  const HERO_TABLE_PATTERNS = [
    /\bhero_quests?\b/i,
    /\bhero_tasks?\b/i,
    /\bhero_sessions?\b/i,
    /\bhero_launches?\b/i,
    /\bhero_state\b/i,
  ];

  for (const fileName of migrationFiles) {
    const filePath = path.join(MIGRATIONS_DIR, fileName);
    const content = fs.readFileSync(filePath, 'utf8');

    for (const pattern of HERO_TABLE_PATTERNS) {
      assert.ok(
        !pattern.test(content),
        `Migration ${fileName} contains hero table reference matching ${pattern} — Hero Mode must not create D1 tables`,
      );
    }
  }
});

// ── A-P2-1: HeroQuestCard — CTA has accessible name ────────────────

test('A-P2-1: HeroQuestCard ready state CTA has type="button" and accessible text', { skip: !HAS_NODE_MODULES && 'node_modules unavailable (worktree)' }, async () => {
  const html = await tryRender(renderHeroQuestCardFixture, {
    hero: {
      enabled: true,
      status: 'ready',
      canStart: true,
      canContinue: false,
      nextTask: { taskId: 'task-a', subjectId: 'spelling', childLabel: 'Practise something tricky', childReason: 'Helps with tricky words.' },
      activeHeroSession: null,
      error: '',
      effortPlanned: 3,
      eligibleSubjects: ['spelling'],
      lockedSubjects: [],
    },
  });
  assert.ok(html, 'SSR render must produce output');

  // CTA must be a <button type="button">
  assert.ok(
    html.includes('type="button"'),
    'Primary CTA must have type="button" for accessibility',
  );

  // Button must contain the CTA text
  assert.ok(
    html.includes('Start Hero Quest'),
    'Primary CTA must contain "Start Hero Quest" text as accessible name',
  );
});

// ── A-P2-2: HeroQuestCard — Launching state has aria-busy ──────────

test('A-P2-2: HeroQuestCard launching state has aria-busy="true"', { skip: !HAS_NODE_MODULES && 'node_modules unavailable (worktree)' }, async () => {
  const html = await tryRender(renderHeroQuestCardFixture, {
    hero: {
      enabled: true,
      status: 'launching',
      canStart: true,
      canContinue: false,
      nextTask: { taskId: 'task-a', subjectId: 'spelling', childLabel: 'Practise something tricky' },
      activeHeroSession: null,
      error: '',
      effortPlanned: 0,
      eligibleSubjects: ['spelling'],
      lockedSubjects: [],
    },
  });
  assert.ok(html, 'SSR render must produce output');

  assert.ok(
    html.includes('aria-busy="true"'),
    'CTA button must have aria-busy="true" when launching',
  );

  assert.ok(
    html.includes('Starting'),
    'CTA must show "Starting…" text when launching',
  );
});

// ── A-P2-3: HeroQuestCard — Error region has aria-live="polite" ─────

test('A-P2-3: HeroQuestCard error state has aria-live="polite" region', { skip: !HAS_NODE_MODULES && 'node_modules unavailable (worktree)' }, async () => {
  const html = await tryRender(renderHeroQuestCardFixture, {
    hero: {
      enabled: true,
      status: 'ready',
      canStart: false,
      canContinue: false,
      nextTask: null,
      activeHeroSession: null,
      error: 'hero_quest_stale',
      effortPlanned: 0,
      eligibleSubjects: [],
      lockedSubjects: [],
    },
  });
  assert.ok(html, 'SSR render must produce output');

  assert.ok(
    html.includes('aria-live="polite"'),
    'Error/stale message region must have aria-live="polite"',
  );
});

// ── A-P2-4: HeroQuestCard — No inline animation styles ─────────────

test('A-P2-4: HeroQuestCard does not use inline animation or transition styles', { skip: !HAS_NODE_MODULES && 'node_modules unavailable (worktree)' }, async () => {
  // Render all card states and verify none contain inline animation styles
  const states = [
    // Ready state
    {
      hero: {
        enabled: true, status: 'ready', canStart: true, canContinue: false,
        nextTask: { taskId: 'task-a', subjectId: 'spelling', childLabel: 'Test' },
        activeHeroSession: null, error: '', effortPlanned: 0,
        eligibleSubjects: ['spelling'], lockedSubjects: [],
      },
    },
    // Continue state
    {
      hero: {
        enabled: true, status: 'ready', canStart: false, canContinue: true,
        nextTask: null,
        activeHeroSession: { subjectId: 'spelling', taskId: 'task-a' },
        error: '', effortPlanned: 0, eligibleSubjects: [], lockedSubjects: [],
      },
    },
    // Error state
    {
      hero: {
        enabled: true, status: 'ready', canStart: false, canContinue: false,
        nextTask: null, activeHeroSession: null, error: 'hero_quest_stale',
        effortPlanned: 0, eligibleSubjects: [], lockedSubjects: [],
      },
    },
  ];

  const INLINE_ANIMATION_PATTERNS = [
    /style="[^"]*animation/i,
    /style="[^"]*transition/i,
    /style="[^"]*transform/i,
    /className="[^"]*animate-/i,
    /className="[^"]*spin/i,
    /className="[^"]*pulse/i,
    /className="[^"]*bounce/i,
  ];

  for (const fixture of states) {
    const html = await tryRender(renderHeroQuestCardFixture, fixture);
    assert.ok(html, 'SSR render must produce output');

    for (const pattern of INLINE_ANIMATION_PATTERNS) {
      assert.ok(
        !pattern.test(html),
        `HeroQuestCard contains inline animation pattern matching ${pattern} — use CSS @media (prefers-reduced-motion) instead`,
      );
    }
  }
});

// ── A-P2-5: HeroQuestCard continue state CTA is accessible ─────────

test('A-P2-5: HeroQuestCard continue state CTA has type="button" and accessible text', { skip: !HAS_NODE_MODULES && 'node_modules unavailable (worktree)' }, async () => {
  const html = await tryRender(renderHeroQuestCardFixture, {
    hero: {
      enabled: true,
      status: 'ready',
      canStart: false,
      canContinue: true,
      nextTask: null,
      activeHeroSession: { subjectId: 'spelling', taskId: 'task-a' },
      error: '',
      effortPlanned: 0,
      eligibleSubjects: [],
      lockedSubjects: [],
    },
  });
  assert.ok(html, 'SSR render must produce output');

  assert.ok(html.includes('type="button"'), 'Continue CTA must have type="button"');
  assert.ok(html.includes('Continue Hero task'), 'Continue CTA must contain "Continue Hero task" text');
});

// ── A-P2-6: HeroTaskBanner — accessible text present ────────────────

test('A-P2-6: HeroTaskBanner renders accessible text without inline animation', { skip: !HAS_NODE_MODULES && 'node_modules unavailable (worktree)' }, async () => {
  const html = await tryRender(renderHeroTaskBannerFixture, {
    lastLaunch: { subjectId: 'spelling', intent: 'weak-repair', taskId: 'task-a' },
    subjectName: 'Spelling',
  });
  assert.ok(html, 'SSR render must produce output');

  assert.ok(
    html.includes('Hero Quest task'),
    'HeroTaskBanner must include "Hero Quest task" label text',
  );
  assert.ok(
    html.includes('Spelling'),
    'HeroTaskBanner must include the subject name',
  );

  // No inline animation on the banner either
  assert.ok(
    !/style="[^"]*animation/i.test(html),
    'HeroTaskBanner must not use inline animation styles',
  );
  assert.ok(
    !/style="[^"]*transition/i.test(html),
    'HeroTaskBanner must not use inline transition styles',
  );
});
