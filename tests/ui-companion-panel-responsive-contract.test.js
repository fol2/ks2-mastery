import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('companion panel CSS is mobile-safe and cannot force fixed-width overflow', () => {
  const css = readFileSync(path.join(rootDir, 'styles/app.css'), 'utf8');
  const companionBlock = css.slice(css.indexOf('.companion-panel {'), css.indexOf('.home-hero-scene {'));

  assert.match(companionBlock, /\.companion-panel\s*\{[\s\S]*min-width:\s*0;/);
  assert.match(companionBlock, /\.companion-panel-monster-list\s*\{[\s\S]*min-width:\s*0;/);
  assert.match(companionBlock, /\.companion-panel-stat\s*\{[\s\S]*min-width:\s*0;/);
  assert.match(css, /@media\s*\(max-width:\s*820px\)\s*\{[\s\S]*\.companion-panel-stat\s*\{[\s\S]*flex-direction:\s*column;/);
  assert.doesNotMatch(companionBlock, /width:\s*\d+px|min-width:\s*\d+px/);
});
