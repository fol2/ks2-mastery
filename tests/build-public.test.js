import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('public build emits the React app bundle entrypoint', () => {
  execFileSync(process.execPath, ['./scripts/build-bundles.mjs'], { stdio: 'ignore' });
  execFileSync(process.execPath, ['./scripts/build-public.mjs'], { stdio: 'ignore' });
  execFileSync(process.execPath, ['./scripts/assert-build-public.mjs'], { stdio: 'ignore' });
  execFileSync(process.execPath, ['./scripts/audit-client-bundle.mjs'], { stdio: 'ignore' });

  const indexHtml = readFileSync('dist/public/index.html', 'utf8');
  assert.match(indexHtml, /type="module" src="\.\/src\/bundles\/app\.bundle\.js"/);
  assert.doesNotMatch(indexHtml, /home\.bundle\.js/);
  assert.doesNotMatch(indexHtml, /src\/main\.js/);

  assert.equal(existsSync('dist/public/src/bundles/home.bundle.js'), false);
  assert.equal(existsSync('dist/public/src/main.js'), false);
  assert.equal(existsSync('dist/public/src/platform/ui/render.js'), false);
  assert.equal(existsSync('dist/public/src/surfaces/home/index.jsx'), false);
  assert.equal(existsSync('dist/public/src/subjects/spelling/data/content-data.js'), false);
  assert.equal(existsSync('dist/public/worker/src/app.js'), false);

  const appBundle = readFileSync('dist/public/src/bundles/app.bundle.js', 'utf8');
  assert.doesNotMatch(appBundle, /__ks2(HomeSurface|CodexSurface|SubjectTopNavSurface)/);
  assert.doesNotMatch(appBundle, /data-home-mount|data-subject-topnav-mount/);
  assert.doesNotMatch(appBundle, /SEEDED_SPELLING_CONTENT_BUNDLE|Legacy vendor seed for Pass 11 content model/);
});
