import { runClientBundleAudit } from './audit-client-bundle.mjs';

const DEFAULT_ORIGIN = 'https://ks2.eugnel.uk';
const DIRECT_DENIAL_PATHS = [
  '/src/main.js',
  '/src/subjects/spelling/data/content-data.js',
  '/src/subjects/spelling/data/word-data.js',
  '/src/subjects/spelling/engine/legacy-engine.js',
  '/src/subjects/spelling/service.js',
  '/src/subjects/spelling/content/model.js',
  '/src/platform/core/local-review-profile.js',
  '/worker/src/app.js',
  '/tests/build-public.test.js',
];

const FORBIDDEN_DEPLOYED_TEXT = [
  'SEEDED_SPELLING_CONTENT_BUNDLE',
  'SEEDED_SPELLING_PUBLISHED_SNAPSHOT',
  'Legacy vendor seed for Pass 11 content model',
  'createLegacySpellingEngine',
  'KS2_WORDS_ENRICHED',
  '?local=1',
  'data-home-mount',
  'home.bundle.js',
];

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function argInteger(name, fallback) {
  const value = Number(argValue(name, fallback));
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scriptSources(html) {
  const sources = [];
  const pattern = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match = pattern.exec(html);
  while (match) {
    sources.push(match[1]);
    match = pattern.exec(html);
  }
  return sources;
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { accept: 'text/html,application/javascript,*/*' } });
  const text = await response.text().catch(() => '');
  return {
    url,
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    text,
  };
}

function assertNoForbiddenText(label, text, failures) {
  for (const token of FORBIDDEN_DEPLOYED_TEXT) {
    if (text.includes(token)) {
      failures.push(`${label} includes forbidden deployed token: ${token}`);
    }
  }
}

async function auditProduction(origin) {
  const failures = [];
  const base = new URL(origin);
  const index = await fetchText(base.href);
  if (index.status < 200 || index.status >= 300) {
    failures.push(`Production HTML fetch failed: ${index.status} ${base.href}`);
  }
  assertNoForbiddenText('Production HTML', index.text, failures);

  const scripts = scriptSources(index.text)
    .filter((src) => !/^https?:\/\//i.test(src) || new URL(src, base).origin === base.origin);
  if (!scripts.length) failures.push('Production HTML did not reference any same-origin script bundle.');

  for (const src of scripts) {
    const bundleUrl = new URL(src, base);
    const bundle = await fetchText(bundleUrl.href);
    if (bundle.status < 200 || bundle.status >= 300) {
      failures.push(`Production bundle fetch failed: ${bundle.status} ${bundleUrl.href}`);
      continue;
    }
    assertNoForbiddenText(`Production bundle ${bundleUrl.pathname}`, bundle.text, failures);
  }

  for (const path of DIRECT_DENIAL_PATHS) {
    const target = new URL(path, base);
    const response = await fetchText(target.href);
    if (response.status >= 400) continue;
    assertNoForbiddenText(`Direct URL ${path}`, response.text, failures);
    const looksLikeRawJs = response.contentType.includes('javascript') || /^\s*(import|export)\s/m.test(response.text);
    if (looksLikeRawJs) {
      failures.push(`Direct URL unexpectedly served raw source-like JavaScript: ${path}`);
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    checked: {
      origin: base.href,
      scriptCount: scripts.length,
      directPathCount: DIRECT_DENIAL_PATHS.length,
    },
  };
}

const origin = argValue('--url', DEFAULT_ORIGIN);
const skipLocal = process.argv.includes('--skip-local');
const retries = argInteger('--retries', 0);
const retryDelayMs = argInteger('--retry-delay-ms', 1000);
if (!skipLocal) {
  const local = await runClientBundleAudit();
  if (!local.ok) {
    console.error(local.failures.join('\n'));
    process.exit(1);
  }
}

let result = null;
for (let attempt = 0; attempt <= retries; attempt += 1) {
  result = await auditProduction(origin);
  if (result.ok) break;
  if (attempt < retries) {
    console.warn(`Production bundle audit failed; retrying in ${retryDelayMs} ms (${attempt + 1}/${retries}).`);
    await wait(retryDelayMs);
  }
}

if (!result?.ok) {
  console.error(result?.failures?.join('\n') || 'Production bundle audit failed.');
  process.exit(1);
}
console.log(`Production bundle audit passed for ${result.checked.origin} (${result.checked.scriptCount} bundle(s), ${result.checked.directPathCount} direct paths).`);
