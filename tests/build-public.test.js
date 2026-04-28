import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PRACTICE_SEO_PAGES, canonicalPracticePageUrl } from '../scripts/lib/seo-practice-pages.mjs';
import { INTENT_SEO_PAGES, canonicalIntentPageUrl } from '../scripts/lib/seo-intent-pages.mjs';

test('public build emits the React app bundle entrypoint', () => {
  execFileSync(process.execPath, ['./scripts/build-bundles.mjs'], { stdio: 'ignore' });
  execFileSync(process.execPath, ['./scripts/build-public.mjs'], { stdio: 'ignore' });
  execFileSync(process.execPath, ['./scripts/assert-build-public.mjs'], { stdio: 'ignore' });
  execFileSync(process.execPath, ['./scripts/audit-client-bundle.mjs'], { stdio: 'ignore' });

  const indexHtml = readFileSync('dist/public/index.html', 'utf8');
  const llmsTxt = readFileSync('dist/public/llms.txt', 'utf8');
  const robotsTxt = readFileSync('dist/public/robots.txt', 'utf8');
  const sitemapXml = readFileSync('dist/public/sitemap.xml', 'utf8');
  const aboutHtml = readFileSync('dist/public/about/index.html', 'utf8');
  const practicePages = new Map(PRACTICE_SEO_PAGES.map((page) => [
    page.slug,
    readFileSync(`dist/public/${page.slug}/index.html`, 'utf8'),
  ]));
  const intentPages = new Map(INTENT_SEO_PAGES.map((page) => [
    page.slug,
    readFileSync(`dist/public/${page.slug}/index.html`, 'utf8'),
  ]));
  const cspHashArtefact = readFileSync('dist/public/.csp-theme-hash', 'utf8');
  const appBundle = readFileSync('dist/public/src/bundles/app.bundle.js', 'utf8');
  const expectedAppBundleVersion = createHash('sha256').update(appBundle).digest('hex').slice(0, 12);
  assert.match(
    indexHtml,
    new RegExp(`type="module" src="\\.\\/src\\/bundles\\/app\\.bundle\\.js\\?v=${expectedAppBundleVersion}"`),
  );
  assert.doesNotMatch(indexHtml, /home\.bundle\.js/);
  assert.doesNotMatch(indexHtml, /src\/main\.js/);
  assert.match(indexHtml, /KS2 Mastery \| KS2 Spelling, Grammar and Punctuation Practice/);
  assert.match(indexHtml, /<link rel="canonical" href="https:\/\/ks2\.eugnel\.uk\/" \/>/);
  assert.match(indexHtml, /<link rel="alternate" type="text\/plain" href="\/llms\.txt"/);
  assert.match(indexHtml, /application\/ld\+json/);
  assert.match(indexHtml, /KS2 spelling, grammar and punctuation practice/);
  assert.match(indexHtml, /href="\/ks2-spelling-practice\/"/);
  assert.match(indexHtml, /href="\/ks2-grammar-practice\/"/);
  assert.match(indexHtml, /href="\/ks2-punctuation-practice\/"/);
  assert.match(indexHtml, /href="\/ks2-apostrophes-practice\/"/);
  assert.match(indexHtml, /href="\/year-5-spelling-practice\/"/);
  assert.match(indexHtml, /href="\/help-child-ks2-grammar-at-home\/"/);
  assert.match(indexHtml, /href="\/about\/"/);
  assert.match(robotsTxt, /Disallow: \/api\//);
  assert.match(robotsTxt, /Disallow: \/admin/);
  assert.match(robotsTxt, /Disallow: \/demo/);
  assert.doesNotMatch(robotsTxt, /User-agent:\s*OAI-SearchBot[\s\S]*?Disallow:\s*\//i);
  assert.match(robotsTxt, /Sitemap: https:\/\/ks2\.eugnel\.uk\/sitemap\.xml/);
  assert.doesNotMatch(robotsTxt, /<!doctype html|<html/i);
  assert.match(sitemapXml, /<loc>https:\/\/ks2\.eugnel\.uk\/<\/loc>/);
  const sitemapLocs = Array.from(sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/giu), (match) => match[1]);
  assert.deepEqual(sitemapLocs, [
    'https://ks2.eugnel.uk/',
    ...PRACTICE_SEO_PAGES.map((page) => canonicalPracticePageUrl(page)),
    'https://ks2.eugnel.uk/about/',
    ...INTENT_SEO_PAGES.map((page) => canonicalIntentPageUrl(page)),
  ]);
  for (const page of PRACTICE_SEO_PAGES) {
    assert.match(sitemapXml, new RegExp(`<loc>${canonicalPracticePageUrl(page).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>`));
  }
  assert.doesNotMatch(sitemapXml, /\/api\/|\/admin|\/demo|\.html|localhost|127\.0\.0\.1/);
  assert.doesNotMatch(sitemapXml, /llms\.txt/);
  assert.match(llmsTxt, /KS2 Mastery/);
  assert.match(llmsTxt, /https:\/\/ks2\.eugnel\.uk\//);
  assert.match(llmsTxt, /https:\/\/ks2\.eugnel\.uk\/about\//);
  assert.match(llmsTxt, /https:\/\/ks2\.eugnel\.uk\/ks2-spelling-practice\//);
  assert.match(llmsTxt, /https:\/\/ks2\.eugnel\.uk\/ks2-grammar-practice\//);
  assert.match(llmsTxt, /https:\/\/ks2\.eugnel\.uk\/ks2-punctuation-practice\//);
  assert.match(llmsTxt, /https:\/\/ks2\.eugnel\.uk\/ks2-apostrophes-practice\//);
  assert.match(llmsTxt, /https:\/\/ks2\.eugnel\.uk\/year-5-spelling-practice\//);
  assert.match(llmsTxt, /https:\/\/ks2\.eugnel\.uk\/help-child-ks2-grammar-at-home\//);
  assert.match(llmsTxt, /KS2 spelling/);
  assert.match(llmsTxt, /KS2 grammar/);
  assert.match(llmsTxt, /KS2 punctuation/);
  assert.match(llmsTxt, /KS2 apostrophes practice/);
  assert.match(llmsTxt, /Year 5 spelling practice/);
  assert.match(llmsTxt, /KS2 grammar help at home/);
  assert.match(llmsTxt, /Private learner progress, account state, operator tools and generated content stores are not public SEO content/);
  assert.doesNotMatch(
    llmsTxt,
    /\/api\/|\/admin|OPENAI_API_KEY|GEMINI_API_KEY|ANTHROPIC_API_KEY|SEEDED_SPELLING_CONTENT_BUNDLE|PUNCTUATION_CONTENT_MANIFEST|generativelanguage\.googleapis\.com|api\.openai\.com\/v1|guaranteed|full curriculum|AI tutor|exam results/i,
  );
  for (const page of PRACTICE_SEO_PAGES) {
    const html = practicePages.get(page.slug);
    assert.ok(html, `${page.slug} should be emitted as a static page`);
    assert.match(html, new RegExp(`<title>${page.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</title>`));
    assert.match(html, new RegExp(`<link rel="canonical" href="${canonicalPracticePageUrl(page).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" \\/>`));
    assert.match(html, new RegExp(`<h1>${page.heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</h1>`));
    assert.match(html, /href="\/demo"/);
    assert.match(html, /KS2 Mastery home/);
    for (const point of page.points) {
      assert.match(html, new RegExp(point.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.doesNotMatch(html, /app\.bundle\.js|id="app"|application\/ld\+json|<script/i);
    assert.match(html, /href="\/about\/"/);
    for (const link of page.relatedLinks || []) {
      assert.match(html, new RegExp(`href="${link.href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
      assert.match(html, new RegExp(link.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  }
  assert.match(aboutHtml, /<title>About KS2 Mastery \| KS2 Spelling, Grammar and Punctuation Practice<\/title>/);
  assert.match(aboutHtml, /<link rel="canonical" href="https:\/\/ks2\.eugnel\.uk\/about\/" \/>/);
  assert.match(aboutHtml, /<h1>About KS2 Mastery<\/h1>/);
  assert.match(aboutHtml, /KS2 spelling, grammar and punctuation practice/);
  assert.match(aboutHtml, /Learners can try a demo before signing in/);
  assert.match(aboutHtml, /Signing in saves learner profiles and progress/);
  assert.match(aboutHtml, /Private learner progress, admin tools and generated content stores are not public SEO content/);
  assert.match(aboutHtml, /href="\/ks2-spelling-practice\/"/);
  assert.match(aboutHtml, /href="\/ks2-grammar-practice\/"/);
  assert.match(aboutHtml, /href="\/ks2-punctuation-practice\/"/);
  assert.match(aboutHtml, /href="\/ks2-apostrophes-practice\/"/);
  assert.match(aboutHtml, /href="\/year-5-spelling-practice\/"/);
  assert.match(aboutHtml, /href="\/help-child-ks2-grammar-at-home\/"/);
  assert.match(aboutHtml, /href="\/demo"/);
  assert.doesNotMatch(aboutHtml, /app\.bundle\.js|id="app"|application\/ld\+json|<script/i);
  assert.doesNotMatch(aboutHtml, /guaranteed|full curriculum|AI tutor|exam results/i);
  for (const page of INTENT_SEO_PAGES) {
    const html = intentPages.get(page.slug);
    assert.ok(html, `${page.slug} should be emitted as a static page`);
    assert.match(html, new RegExp(`<title>${page.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</title>`));
    assert.match(html, new RegExp(`<link rel="canonical" href="${canonicalIntentPageUrl(page).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" \\/>`));
    assert.match(html, new RegExp(`<h1>${page.heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</h1>`));
    assert.match(html, new RegExp(page.intro.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(html, new RegExp(page.lane.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(html, /href="\/demo"/);
    assert.match(html, /KS2 Mastery home/);
    for (const point of page.points) {
      assert.match(html, new RegExp(point.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    for (const link of page.relatedLinks || []) {
      assert.match(html, new RegExp(`href="${link.href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
      assert.match(html, new RegExp(link.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.doesNotMatch(html, /app\.bundle\.js|id="app"|application\/ld\+json|<script/i);
    assert.doesNotMatch(html, /guaranteed|full curriculum|AI tutor|exam results/i);
  }
  assert.match(intentPages.get('ks2-apostrophes-practice'), /contractions/);
  assert.match(intentPages.get('ks2-apostrophes-practice'), /possession/);
  assert.doesNotMatch(intentPages.get('ks2-apostrophes-practice'), /apostrophe_contractions|apostrophe_possession|generator/);
  assert.doesNotMatch(intentPages.get('year-5-spelling-practice'), /complete official word list|statutory word list|complete word list/i);
  assert.match(intentPages.get('help-child-ks2-grammar-at-home'), /supporting adults/);
  assert.match(intentPages.get('help-child-ks2-grammar-at-home'), /at home/);
  assert.doesNotMatch(intentPages.get('help-child-ks2-grammar-at-home'), /parent hub|learner records|analytics/i);
  assert.ok(
    cspHashArtefact.split(/\r?\n/u).filter(Boolean).length >= 2,
    'CSP hash artefact should list both theme and JSON-LD inline script hashes',
  );

  assert.equal(existsSync('dist/public/src/bundles/home.bundle.js'), false);
  assert.equal(existsSync('dist/public/src/main.js'), false);
  assert.equal(existsSync('dist/public/src/platform/ui/render.js'), false);
  assert.equal(existsSync('dist/public/src/surfaces/home/index.jsx'), false);
  assert.equal(existsSync('dist/public/src/subjects/spelling/data/content-data.js'), false);
  assert.equal(existsSync('dist/public/worker/src/app.js'), false);

  const visualManifest = readFileSync('src/platform/game/monster-asset-manifest.js', 'utf8');
  const manifestHash = visualManifest.match(/"manifestHash": "([^"]+)"/)?.[1] || '';
  assert.ok(manifestHash, 'expected generated monster visual manifest hash');
  // manifestHash can live in any chunk after SH2-U10 code-split (#322).
  // Walk every .js chunk and assert (a) one contains it AND (b) app.bundle.js
  // imports that chunk by filename, so the manifest is reachable at runtime.
  const bundlesDir = 'dist/public/src/bundles';
  assert.ok(existsSync(bundlesDir), 'bundles dir must exist after npm run build');
  const chunkNames = readdirSync(bundlesDir).filter((f) => f.endsWith('.js'));
  const chunksWithHash = chunkNames.filter((name) => {
    const content = readFileSync(`${bundlesDir}/${name}`, 'utf8');
    return content.includes(manifestHash);
  });
  assert.ok(
    chunksWithHash.length > 0,
    'manifestHash must be present in at least one production bundle chunk',
  );
  // Entry bundle must reference (by filename) at least one chunk that contains the hash,
  // so the manifest is actually reachable from app.bundle.js at runtime.
  assert.ok(
    chunksWithHash.some((name) => appBundle.includes(name)),
    'app.bundle.js must import a chunk that contains manifestHash (orphan-chunk guard)',
  );
  assert.match(appBundle, /\/api\/admin\/monster-visual-config\/draft/);
  assert.doesNotMatch(appBundle, /__ks2(HomeSurface|CodexSurface|SubjectTopNavSurface)/);
  assert.doesNotMatch(appBundle, /data-home-mount|data-subject-topnav-mount/);
  assert.doesNotMatch(appBundle, /SEEDED_SPELLING_CONTENT_BUNDLE|Legacy vendor seed for Pass 11 content model/);
  assert.doesNotMatch(appBundle, /createGrammarQuestion|evaluateGrammarQuestion|GRAMMAR_TEMPLATES/);
  assert.doesNotMatch(appBundle, /correctResponse|grammar-legacy-oracle|extract-grammar-legacy-oracle/);
});
