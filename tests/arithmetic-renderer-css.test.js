import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appCss = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

function cssBlock(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`).exec(appCss);
  assert.ok(match, `Expected ${selector} rule in styles/app.css.`);
  return match[1];
}

test('arithmetic operator glyphs render at twice the numeric text size', () => {
  assert.match(cssBlock('.arithmetic-operator'), /font-size:\s*2em\s*;/);
  assert.match(cssBlock('.arithmetic-long-division-operator'), /font-size:\s*2em\s*;/);
});
