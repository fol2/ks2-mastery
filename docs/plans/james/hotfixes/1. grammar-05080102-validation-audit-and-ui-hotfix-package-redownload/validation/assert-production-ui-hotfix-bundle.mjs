import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const origin = 'https://ks2.eugnel.uk';
const outPath = path.resolve(
  'docs/plans/james/hotfixes/1. grammar-05080102-validation-audit-and-ui-hotfix-package-redownload/validation/production-ui-hotfix-bundle-assertion-2026-05-08.json',
);

const htmlResponse = await fetch(`${origin}/`, {
  headers: { 'cache-control': 'no-cache' },
});
const html = await htmlResponse.text();
const bundlePath = [...html.matchAll(/<script[^>]+src="([^"]+app\.bundle\.js[^"]*)"/g)]
  .map((match) => match[1])[0] || '/src/bundles/app.bundle.js';
const bundleUrl = new URL(bundlePath, origin).toString();
const bundleResponse = await fetch(bundleUrl, {
  headers: { 'cache-control': 'no-cache' },
});
const bundle = await bundleResponse.text();
const index = bundle.indexOf('grammar-end-early');
const observedSnippet = index >= 0 ? bundle.slice(Math.max(0, index - 140), index + 120) : '';
const ok = bundleResponse.ok
  && observedSnippet.includes('disabled:n||h')
  && observedSnippet.includes('grammar-end-early')
  && observedSnippet.includes('End round');

const evidence = {
  ok,
  timestamp: new Date().toISOString(),
  origin,
  bundleUrl,
  htmlStatus: htmlResponse.status,
  bundleStatus: bundleResponse.status,
  bundleBytes: bundle.length,
  bundleSha256: createHash('sha256').update(bundle).digest('hex'),
  assertion: 'Live app bundle keeps Grammar normal-session End round disabled when runtimeReadOnly or pending.',
  expectedMinifiedSignal: 'disabled:n||h,onClick:()=>t.dispatch("grammar-end-early"),children:"End round"',
  observedSnippet,
};

mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(evidence, null, 2));

if (!ok) {
  process.exit(1);
}
