---
module: operations
tags:
  - seo
  - analytics
  - search-console
  - baseline
problem_type: runbook
---

# SEO Measurement Baseline

Use this document to record the first organic discovery baseline for KS2 Mastery after each SEO release. The goal is decision support: indexing, query visibility, landing-page behaviour, and aggregate visitor signal. Analytics does not directly improve ranking.

## Canonical URLs

Record baseline observations for these public HTML URLs:

| URL | Lane | Search Console indexing state | Impressions | Clicks | CTR | Average position | Cloudflare page views | Referrers/source notes | Next decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `https://ks2.eugnel.uk/` | Product identity | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| `https://ks2.eugnel.uk/about/` | Product identity | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| `https://ks2.eugnel.uk/ks2-spelling-practice/` | Practice-tool intent | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| `https://ks2.eugnel.uk/ks2-grammar-practice/` | Practice-tool intent | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| `https://ks2.eugnel.uk/ks2-punctuation-practice/` | Practice-tool intent | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| `https://ks2.eugnel.uk/ks2-apostrophes-practice/` | Subject/problem intent | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| `https://ks2.eugnel.uk/year-5-spelling-practice/` | Year and subject intent | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| `https://ks2.eugnel.uk/help-child-ks2-grammar-at-home/` | Parent-support intent | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |

`https://ks2.eugnel.uk/llms.txt` is a supplementary AI-readable summary. Do not record it as a search-result landing page unless external tooling explicitly reports it.

## Search Console Checks

- Confirm the property for `https://ks2.eugnel.uk/` is verified in the chosen Google account.
- Submit `https://ks2.eugnel.uk/sitemap.xml`.
- Inspect each canonical HTML URL above after deployment.
- Record indexing state, query impressions, clicks, CTR, average position, and landing page.
- Note crawl errors, canonical conflicts, duplicate URL variants, or pages discovered but not indexed.

Do not commit placeholder verification tags, fake property IDs, or account-specific tokens to the repo.

## Cloudflare Web Analytics Checks

- Confirm whether Cloudflare Web Analytics automatic setup is active for `ks2.eugnel.uk`.
- Record aggregate page views for each canonical public URL.
- Record referrers, source notes, country/device trends when available, and whether the landing page matches the query intent.
- Keep Worker observability separate: Worker observability is infrastructure telemetry, not organic acquisition analytics.

If the dashboard requires a manual snippet, treat it as a separate code change with a real site token, CSP review, privacy review, and production-audit coverage.

## Review Cadence

Record the first baseline after deployment, then review again once Search Console and Cloudflare have enough data to show signal. External dashboards can lag; no immediate data after deployment is not proof that a page failed.

## Next-Slice Decision Table

| Candidate | Lane | Evidence needed | Action | Decision date |
| --- | --- | --- | --- | --- |
| Relative clauses KS2 practice | Subject/problem intent | Query impressions or support need tied to grammar practice | Defer until evidence | Pending |
| Commas in a list KS2 | Subject/problem intent | Query impressions or punctuation practice demand | Defer until evidence | Pending |
| Plural possession apostrophes | Subject/problem intent | Apostrophes page impressions or weak-click signal | Defer until evidence | Pending |
| Year 5 spelling words practice | Year and subject intent | Verified product content and source posture for word-list claims | Defer until evidence | Pending |
| More grammar help at home topics | Parent-support intent | Parent-support page impressions, clicks, or useful support demand | Defer until evidence | Pending |

Add a new page only when product fit and evidence support it. Improve an existing page first when it is indexed, receives impressions, but has weak clicks or unclear landing-page behaviour. Do not add pages that require unverified curriculum coverage, external source licensing, private product data, or broad keyword chasing.
