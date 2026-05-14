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

test('arithmetic operator glyphs render at one and a half times the numeric text size', () => {
  const inlineOperatorBlock = cssBlock('.arithmetic-operator');
  const longDivisionOperatorBlock = cssBlock('.arithmetic-long-division-operator');

  assert.match(inlineOperatorBlock, /font-size:\s*1\.5em\s*;/);
  assert.match(longDivisionOperatorBlock, /font-size:\s*1\.5em\s*;/);
  assert.match(inlineOperatorBlock, /transform:\s*translateY\(-0\.04em\)\s*;/);
  assert.match(longDivisionOperatorBlock, /transform:\s*translateY\(-0\.04em\)\s*;/);
});
