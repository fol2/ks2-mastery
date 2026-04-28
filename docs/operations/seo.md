---
module: operations
tags:
  - seo
  - analytics
  - search-console
problem_type: runbook
---

# SEO Operations

KS2 Mastery V1 SEO is a foundation layer: one crawlable public identity surface, valid discovery files, production audit coverage, and an operator path for measuring organic discovery. It does not guarantee ranking, search placement, or AI assistant recommendations.

## Public Surface

The canonical public URL is:

- `https://ks2.eugnel.uk/`

The root page should describe KS2 Mastery as an online KS2 spelling, grammar, and punctuation practice product. The copy must stay aligned with the actual app experience and must not expose private learner state, admin surfaces, generated content stores, or internal analytics.

The first sitemap intentionally lists only the canonical root URL. Future practice-tool, subject/problem, or parent-support pages should be added only after they exist as accurate public pages.

## Production Checks

After deployment, verify:

- `https://ks2.eugnel.uk/` returns public identity copy, meta description, canonical URL, share metadata, and JSON-LD product identity.
- `https://ks2.eugnel.uk/robots.txt` returns a robots policy, not the SPA HTML fallback, and excludes `/api/`, `/admin`, and `/demo` from normal crawler discovery.
- `https://ks2.eugnel.uk/sitemap.xml` returns an XML sitemap with only the canonical root URL.
- `npm run audit:production -- --skip-local` passes against the live origin.

Search engines can still take time to crawl and index the site after these checks pass.

## Search Console

Use Google Search Console or equivalent search tooling to:

- Verify ownership for `https://ks2.eugnel.uk/`.
- Submit `https://ks2.eugnel.uk/sitemap.xml`.
- Inspect the canonical root URL after deployment.
- Review indexing status and organic queries before choosing the next SEO content page.

The verification method depends on the external account setup. Do not add placeholder verification tokens to the repo.

## Analytics

Worker observability is infrastructure telemetry. It is useful for errors and runtime health, but it is not visitor analytics and does not answer organic acquisition questions.

For aggregate visitor analytics, prefer Cloudflare Web Analytics first because the site already runs on Cloudflare. GA4 or Zaraz can be added later if James chooses that stack and supplies the real property or site-token configuration.

Any analytics script must be reviewed against:

- CSP script and connect directives.
- Privacy expectations for an education product.
- Consent requirements for the chosen analytics provider.
- Existing security-header and production-audit gates.

Analytics is decision support. It is not a direct ranking mechanism.

## Next Content Choices

Preserve these acquisition lanes for later work:

- Practice-tool intent, such as KS2 spelling practice online or KS2 grammar practice.
- Subject/problem intent, such as practising apostrophes or Year 5 spelling words.
- Parent-support intent, such as helping a child with KS2 grammar at home.
- AI-readable product identity, where assistants can understand what KS2 Mastery is and when it is relevant.

Pick the next content slice from product fit, organic value, and observed measurement signals. Avoid broad keyword chasing or thin pages.
