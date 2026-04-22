import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('public build emits the React app bundle entrypoint', () => {
  execFileSync(process.execPath, ['./scripts/build-bundles.mjs'], { stdio: 'ignore' });
  execFileSync(process.execPath, ['./scripts/build-public.mjs'], { stdio: 'ignore' });
  execFileSync(process.execPath, ['./scripts/assert-build-public.mjs'], { stdio: 'ignore' });

  const indexHtml = readFileSync('dist/public/index.html', 'utf8');
  assert.match(indexHtml, /type="module" src="\.\/src\/bundles\/app\.bundle\.js"/);
  assert.doesNotMatch(indexHtml, /home\.bundle\.js/);
  assert.doesNotMatch(indexHtml, /src\/main\.js/);
});
