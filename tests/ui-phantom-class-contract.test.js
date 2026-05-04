// UI Refactor P4 U1: classes emitted by Visual Engine primitives must
// have a stylesheet home. Parser-only adoption is not enough.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(path.join(rootDir, 'styles/app.css'), 'utf8');

const REQUIRED_CLASSES = Object.freeze([
  'action-row',
  'action-row-start',
  'action-row-end',
  'session-hud',
  'session-hud-title',
  'session-hud-mode',
  'session-hud-meter',
  'session-hud-status',
  'session-hud-answered',
  'session-hud-remaining',
  'practice-stage',
  'ps-scene-setup',
  'ps-scene-session',
  'ps-scene-summary',
  'ps-backdrop-default',
  'ps-backdrop-meadow',
  'ps-backdrop-library',
  'ps-backdrop-punctuation-map',
  'ps-motion-calm',
  'ps-motion-active',
  'ps-motion-celebration',
  'ps-reduced-motion-safe',
  'session-summary-frame',
  'session-summary-frame-header',
  'session-summary-frame-section-head',
  'session-summary-frame-highlights',
  'session-summary-frame-misconceptions',
  'session-summary-frame-progress',
  'session-summary-frame-details',
  'session-summary-frame-list',
  'session-summary-frame-progress-list',
  'session-summary-frame-progress-item',
  'session-summary-frame-progress-label',
  'session-summary-frame-progress-change',
  'session-summary-frame-secondary-group',
  'session-summary-frame-actions',
  'companion-panel',
  'companion-panel-empty',
  'companion-panel-monsters',
  'companion-panel-monster-list',
  'companion-panel-focus',
  'home-hero-scene',
  'home-hero-scene-focus',
  'home-hero-scene-creatures',
  'home-hero-scene-actions',
]);

function classSelectorPattern(className) {
  return new RegExp(`\\.${className}(?:[\\s\\[{:#.,>]|$)`);
}

function p4PrimitiveCssBlock() {
  const start = css.indexOf('/* --- P4 U1');
  const end = css.indexOf('/* StatCard primitive', start);
  assert.ok(start >= 0, 'P4 U1 CSS block must exist');
  assert.ok(end > start, 'P4 U1 CSS block must end before the StatCard block');
  return css.slice(start, end);
}

test('P4 U1 primitive classes have CSS definitions', () => {
  for (const className of REQUIRED_CLASSES) {
    assert.match(
      css,
      classSelectorPattern(className),
      `.${className} is emitted by a Visual Engine primitive but has no CSS selector`,
    );
  }
});

test('P4 U1 reduced-motion CSS disables stage and HUD progress animation', () => {
  const block = p4PrimitiveCssBlock();
  assert.match(block, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(block, /\.ps-motion-calm::before[\s\S]*animation:\s*none\s*!important/);
  assert.match(block, /\.ps-motion-active::before[\s\S]*animation:\s*none\s*!important/);
  assert.match(block, /\.ps-motion-celebration::before[\s\S]*animation:\s*none\s*!important/);
  assert.match(block, /\.session-hud-meter\s+\.progress-meter-fill[\s\S]*transition:\s*none\s*!important/);
});

test('P4 U1 practice-stage backdrops stay CSS-only and do not depend on image assets', () => {
  const block = p4PrimitiveCssBlock();
  assert.doesNotMatch(block, /\.ps-backdrop-[^{]+\{[^}]*url\(/);
  assert.match(block, /\.practice-stage\s*>\s*\*/);
  assert.match(block, /z-index:\s*1/);
  assert.match(block, /pointer-events:\s*none/);
});

test('P4 U1 responsive CSS avoids fixed-width primitive overflow', () => {
  const block = p4PrimitiveCssBlock();
  assert.doesNotMatch(block, /^\s*(?:min-)?width:\s*\d+px/m);
  assert.match(block, /min-width:\s*0/);
  assert.match(block, /@media\s*\(max-width:\s*820px\)/);
  assert.match(block, /width:\s*100%/);
});
