---
module: operations
tags:
  - seo
  - analytics
  - search-console
problem_type: runbook
---

# SEO Operations

KS2 Mastery SEO is a staged discovery layer: crawlable public product identity, focused practice-tool landing pages, valid discovery files, production audit coverage, and an operator path for measuring organic discovery. It does not guarantee ranking, search placement, or AI assistant recommendations.

## Public Surface

The canonical public HTML URLs intended for search results are:

- `https://ks2.eugnel.uk/`
- `https://ks2.eugnel.uk/about/`
- `https://ks2.eugnel.uk/ks2-spelling-practice/`
- `https://ks2.eugnel.uk/ks2-grammar-practice/`
- `https://ks2.eugnel.uk/ks2-punctuation-practice/`
- `https://ks2.eugnel.uk/ks2-apostrophes-practice/`
- `https://ks2.eugnel.uk/year-5-spelling-practice/`
- `https://ks2.eugnel.uk/help-child-ks2-grammar-at-home/`

The supplementary AI-readable summary is:

- `https://ks2.eugnel.uk/llms.txt`

The root and about pages should describe KS2 Mastery as an online KS2 spelling, grammar, and punctuation practice product. The copy must stay aligned with the actual app experience and must not expose private learner state, admin surfaces, generated content stores, or internal analytics.

The practice-tool landing pages should stay focused on the product's real subject areas. The focused V4 intent pages are the first small post-foundation slice: apostrophes practice, Year 5 spelling practice, and grammar help at home. They should stay aligned with actual product capability and should not become a broad blog or curriculum library.

`llms.txt` is a short factual summary for AI agents, not a replacement for crawlable HTML, sitemap coverage, robots access, or Search Console validation.

Future subject/problem or parent-support pages should be added only after there is measurement evidence or a clear product-support reason to guide the next slice.

## Production Checks

After deployment, verify:

- `https://ks2.eugnel.uk/` returns public identity copy, meta description, canonical URL, share metadata, and JSON-LD product identity.
- `https://ks2.eugnel.uk/about/` returns page-specific static public HTML, not the root SPA shell.
- `https://ks2.eugnel.uk/ks2-spelling-practice/`, `https://ks2.eugnel.uk/ks2-grammar-practice/`, and `https://ks2.eugnel.uk/ks2-punctuation-practice/` each return page-specific public HTML, not the root SPA shell.
- `https://ks2.eugnel.uk/ks2-apostrophes-practice/`, `https://ks2.eugnel.uk/year-5-spelling-practice/`, and `https://ks2.eugnel.uk/help-child-ks2-grammar-at-home/` each return page-specific public HTML, not the root SPA shell.
- `https://ks2.eugnel.uk/llms.txt` returns plain text with the product identity, canonical public pages, subject coverage, and privacy boundary. It must not include private paths, internal implementation tokens, secret names, or recommendation guarantees.
- `https://ks2.eugnel.uk/robots.txt` returns a robots policy, not the SPA HTML fallback, and excludes `/api/`, `/admin`, and `/demo` from normal crawler discovery.
- `https://ks2.eugnel.uk/sitemap.xml` returns an XML sitemap with exactly the root, about page, three canonical practice-tool page URLs, and three V4 intent-page URLs. It must not list `llms.txt`, `/api/`, `/admin`, `/demo`, local, or `.html` variants.
- `npm run audit:production -- --skip-local` passes against the live origin.

Search engines can still take time to crawl and index the site after these checks pass.

## Search Console

Use Google Search Console or equivalent search tooling to:

- Verify ownership for `https://ks2.eugnel.uk/`.
- Submit `https://ks2.eugnel.uk/sitemap.xml`.
- Inspect all eight canonical public HTML URLs after deployment: root, about, spelling practice, grammar practice, punctuation practice, apostrophes practice, Year 5 spelling practice, and grammar help at home.
- Review indexing status, impressions, clicks, CTR, average position, queries, and landing pages before choosing the next SEO content page.

The verification method depends on the external account setup. Do not add placeholder verification tokens to the repo.

Track the first baseline after deployment in `docs/operations/seo-measurement-baseline.md`, then review again once Search Console has enough crawl and query data to show signal. Record:

- Which canonical URLs are indexed.
- Which queries produce impressions.
- Clicks, CTR, average position, and landing page per query.
- Pages with impressions but no clicks.
- Pages with no indexing or crawl errors.

## Analytics

Worker observability is infrastructure telemetry. It is useful for errors and runtime health, but it is not visitor analytics and does not answer organic acquisition questions.

For aggregate visitor analytics, prefer Cloudflare Web Analytics first because the site already runs on Cloudflare.

For a proxied Cloudflare hostname, enable Web Analytics from the Cloudflare dashboard by adding the hostname in Web Analytics and using automatic setup when available. Record whether the dashboard shows automatic setup as active for `ks2.eugnel.uk`.

If the dashboard requires manual snippet installation instead, treat that as a code change: use the real site token only, review CSP `script-src` and `connect-src`, and update production audit coverage in the same PR. Do not commit placeholder analytics tokens.

Cloudflare Web Analytics can track SPA interactions, but the SEO landing pages are static pages and should first be measured as page views, landing pages, referrers, and search traffic trends.

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
- Do not add an `OAI-SearchBot`, `GPTBot`, or `ChatGPT-User` robots group unless the private-path disallows are repeated deliberately in that specific group.
- Treat `OAI-SearchBot` as search visibility related. The production audit fails if effective robots policy blocks it from the public HTML URLs.
- Treat `GPTBot` as a separate training-crawler policy choice. Disallowing `GPTBot` is not, by itself, a failed search-visibility audit if `OAI-SearchBot` remains able to fetch public SEO pages.
- Check Cloudflare security, bot, and WAF settings if AI-search crawler access looks blocked despite the repo `robots.txt`.
- In Cloudflare, check `Block AI bots`, managed `robots.txt`, AI Crawl Control, verified bot handling, and custom WAF rules before changing repo robots policy.
- Do not treat `llms.txt` or AI-only summary files as a replacement for normal crawlable pages and sitemap coverage.

## Next Content Choices

Preserve these acquisition lanes for later work:

- Practice-tool intent, such as extra subject pages only after the current spelling, grammar, and punctuation landing pages show useful signal.
- Subject/problem intent, such as practising apostrophes or Year 5 spelling words.
- Parent-support intent, such as helping a child with KS2 grammar at home.
- AI-readable product identity, where assistants can understand what KS2 Mastery is and when it is relevant.

Pick the next content slice from product fit, organic value, and observed measurement signals. Avoid broad keyword chasing or thin pages.

Use one of these gates before adding the next public content slice:

- Search Console shows impressions or queries that map cleanly to a subject/problem page.
- Existing indexed pages show impressions but weak clicks, suggesting copy or page intent needs refinement before expansion.
- Existing public pages are indexed but have no meaningful impressions after a reasonable observation window, suggesting a more specific intent page is needed.
- Product direction needs a durable support page that can also serve organic intent.

Likely next candidates after the V4 intent pages have measurable signal:

- `relative clauses KS2 practice`
- `commas in a list KS2`
- `plural possession apostrophes`
- `Year 5 spelling words practice`
- additional parent-support grammar topics

Use the decision table in `docs/operations/seo-measurement-baseline.md` before adding another page. Add a new page when product fit and evidence support it; improve an existing page first when it is indexed and receives impressions but weak clicks. Do not add pages that require unverified curriculum coverage, external source licensing, private product data, or broad keyword chasing.
