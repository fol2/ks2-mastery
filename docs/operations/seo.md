---
module: operations
tags:
  - seo
  - analytics
  - search-console
problem_type: runbook
---

# SEO Operations

KS2 Mastery SEO is a staged discovery layer: one crawlable public identity surface, focused practice-tool landing pages, valid discovery files, production audit coverage, and an operator path for measuring organic discovery. It does not guarantee ranking, search placement, or AI assistant recommendations.

## Public Surface

The canonical public URLs are:

- `https://ks2.eugnel.uk/`
- `https://ks2.eugnel.uk/ks2-spelling-practice/`
- `https://ks2.eugnel.uk/ks2-grammar-practice/`
- `https://ks2.eugnel.uk/ks2-punctuation-practice/`

The root page should describe KS2 Mastery as an online KS2 spelling, grammar, and punctuation practice product. The copy must stay aligned with the actual app experience and must not expose private learner state, admin surfaces, generated content stores, or internal analytics.

The practice-tool landing pages should stay focused on the product's real subject areas. Future subject/problem or parent-support pages should be added only after they exist as accurate public pages and there is measurement evidence to guide the next slice.

## Production Checks

After deployment, verify:

- `https://ks2.eugnel.uk/` returns public identity copy, meta description, canonical URL, share metadata, and JSON-LD product identity.
- `https://ks2.eugnel.uk/ks2-spelling-practice/`, `https://ks2.eugnel.uk/ks2-grammar-practice/`, and `https://ks2.eugnel.uk/ks2-punctuation-practice/` each return page-specific public HTML, not the root SPA shell.
- `https://ks2.eugnel.uk/robots.txt` returns a robots policy, not the SPA HTML fallback, and excludes `/api/`, `/admin`, and `/demo` from normal crawler discovery.
- `https://ks2.eugnel.uk/sitemap.xml` returns an XML sitemap with the root plus the three canonical practice-tool page URLs, and no `/api/`, `/admin`, `/demo`, local, or `.html` variants.
- `npm run audit:production -- --skip-local` passes against the live origin.

Search engines can still take time to crawl and index the site after these checks pass.

## Search Console

Use Google Search Console or equivalent search tooling to:

- Verify ownership for `https://ks2.eugnel.uk/`.
- Submit `https://ks2.eugnel.uk/sitemap.xml`.
- Inspect the canonical root URL and each practice-tool URL after deployment.
- Review indexing status, impressions, clicks, CTR, queries, and landing pages before choosing the next SEO content page.

The verification method depends on the external account setup. Do not add placeholder verification tokens to the repo.

## Analytics

Worker observability is infrastructure telemetry. It is useful for errors and runtime health, but it is not visitor analytics and does not answer organic acquisition questions.

For aggregate visitor analytics, prefer Cloudflare Web Analytics first because the site already runs on Cloudflare.

For a proxied Cloudflare hostname, enable Web Analytics from the Cloudflare dashboard by adding the hostname in Web Analytics and using automatic setup when available. If the dashboard requires manual snippet installation instead, treat that as a code change: use the real site token only, review CSP `script-src` and `connect-src`, and update production audit coverage in the same PR.

Cloudflare Web Analytics can track SPA interactions, but the V2 SEO landing pages are static pages and should first be measured as page views and landing pages.

GA4 or Zaraz can be added later if James chooses that stack and supplies the real property or site-token configuration.

Any analytics script must be reviewed against:

- CSP script and connect directives.
- Privacy expectations for an education product.
- Consent requirements for the chosen analytics provider.
- Existing security-header and production-audit gates.

Analytics is decision support. It is not a direct ranking mechanism.

## AI Search and Crawlers

AI-search visibility depends on crawlable public pages, external systems, and user queries. KS2 Mastery can improve clarity and access, but it cannot force recommendations.

Operational checks:

- Keep public SEO pages available under the generic `User-agent: *` robots policy.
- Do not add an `OAI-SearchBot`, `GPTBot`, or `ChatGPT-User` robots group unless the private-path disallows are repeated deliberately.
- Check Cloudflare security, bot, and WAF settings if AI-search crawler access looks blocked despite `robots.txt`.
- Treat `OAI-SearchBot` as search visibility related; do not assume `GPTBot` training access is required for ChatGPT search recommendations.
- Do not treat `llms.txt` or AI-only summary files as a replacement for normal crawlable pages and sitemap coverage.

## Next Content Choices

Preserve these acquisition lanes for later work:

- Practice-tool intent, such as extra subject pages only after the current spelling, grammar, and punctuation landing pages show useful signal.
- Subject/problem intent, such as practising apostrophes or Year 5 spelling words.
- Parent-support intent, such as helping a child with KS2 grammar at home.
- AI-readable product identity, where assistants can understand what KS2 Mastery is and when it is relevant.

Pick the next content slice from product fit, organic value, and observed measurement signals. Avoid broad keyword chasing or thin pages.
