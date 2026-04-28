---
title: "feat: Add KS2 SEO Measurement Baseline and Intent Pages"
type: feat
status: completed
date: 2026-04-28
origin: docs/brainstorms/2026-04-28-ks2-seo-foundation-requirements.md
---

# feat: Add KS2 SEO Measurement Baseline and Intent Pages

## Summary

Build the V4 SEO slice by making measurement capture operationally concrete and adding the first small set of focused public intent pages: apostrophes practice, Year 5 spelling practice, and KS2 grammar help at home. The pages should extend the static SEO pattern from V2/V3, strengthen the AI-readable public graph, and stay tied to product capabilities without creating a broad content programme.

---

## Problem Frame

V1-V3 established the crawlable product identity, practice-tool pages, `/about/`, `llms.txt`, sitemap, robots policy, and production audit coverage. The next growth gap is actionability: James needs a way to record whether search and visitor signals are starting to appear, and the public site needs a small number of more specific pages that match realistic organic intent without drifting into thin or speculative content.

This V4 plan treats content and measurement as one slice. The implementation should add only a few carefully chosen pages, then make Search Console and Cloudflare Web Analytics baseline capture explicit enough that future SEO expansion can be chosen from evidence rather than keyword chasing.

---

## Assumptions

*This plan was authored without synchronous user confirmation for the V4 shape. The items below are agent inferences that should be reviewed before implementation proceeds.*

- V4 should move beyond foundation identity into the first subject/problem and parent-support pages, while keeping the slice deliberately small.
- Because Search Console evidence may not exist yet, the first pages should be selected from high product fit and the existing candidate list in `docs/operations/seo.md`, then future pages should wait for measured signal.
- Cloudflare Web Analytics should remain dashboard-first unless automatic setup is unavailable; manual snippet work remains a separate code and privacy review.
- Year 5 spelling copy should describe Year 5-appropriate practice, not publish or imply a complete statutory word list unless implementation verifies the source and product coverage.
- Parent-support copy should be public guidance into the practice product, not a public version of authenticated parent hub data or learner analytics.

---

## Requirements

- R1. Create an auditable measurement baseline process for Search Console and Cloudflare Web Analytics, including canonical URL coverage, indexing state, query metrics, page-view/referrer checks, and next-slice decision notes. Covers origin R12, R13, R14 and F3.
- R2. Add focused public intent pages for the first post-foundation slice: `/ks2-apostrophes-practice/`, `/year-5-spelling-practice/`, and `/help-child-ks2-grammar-at-home/`. Covers origin R1, R2, R3, R4, R16, R17, R18, R19 and F1.
- R3. Keep every new public page static, crawlable, JavaScript-free, canonical, and aligned with the existing folder-index page pattern. Covers origin R7, R8, R9, R10, R15 and F2.
- R4. Update the public discovery graph so root, about, practice pages, intent pages, sitemap, and `llms.txt` consistently advertise only canonical public URLs. Covers origin R4, R7, R8, R9 and AE3.
- R5. Preserve crawler and privacy boundaries: public pages must not expose private learner state, admin paths, API paths, generated content stores, internal analytics, secret names, or demo-session payloads. Covers origin R5, R11, R15 and AE2.
- R6. Extend local and production audit coverage so new pages cannot silently become Cloudflare SPA fallback HTML, disappear from the sitemap, miss headers, or leak forbidden implementation text. Covers origin R7, R10, R15 and AE3.
- R7. Keep analytics as decision support, not a ranking promise: do not add placeholder Search Console tags, GA4, Zaraz, or Cloudflare script tokens in this slice. Covers origin R12, R13, R14 and AE5.
- R8. Preserve the future lanes documented in the origin and V3 runbook: practice-tool intent, subject/problem intent, parent-support intent, and AI-readable product identity. Covers origin R16, R17, R18, R19 and AE6.

**Origin actors:** A1 prospective KS2 learner/supporting adult; A2 search crawler; A3 AI search or assistant system; A4 James/product operator; A5 KS2 Mastery app.

**Origin flows:** F1 public discovery and product understanding; F2 search engine discovery and validation; F3 organic measurement and next-slice selection.

**Origin acceptance examples:** AE1 product identity is understandable without sign-in; AE2 app/demo entry preserves private data boundaries; AE3 discovery files and metadata work in production; AE4 public site is understandable without authenticated app flow; AE5 measurement supports decisions; AE6 later content lanes remain open.

---

## Scope Boundaries

- Do not build a blog, article library, curriculum content farm, or broad keyword programme.
- Do not add many variants of near-duplicate pages such as every year group, every punctuation concept, or every grammar term in this slice.
- Do not promise that Google, ChatGPT, or any AI assistant will recommend KS2 Mastery.
- Do not treat `llms.txt`, schema, or analytics as substitutes for useful public HTML and real product value.
- Do not commit fake verification tags, placeholder analytics tokens, hard-coded external property IDs, or speculative consent copy.
- Do not expose private learner progress, parent hub data, admin content, D1 rows, R2 objects, generated content stores, API responses, or internal analytics on public SEO pages.
- Do not weaken CSP, security headers, robots private-path exclusions, production audit gates, demo safeguards, auth boundaries, or Cloudflare deployment controls.
- Do not modify Cloudflare Workers Builds branch triggers or deployment routing as part of this SEO content slice.

### Deferred to Follow-Up Work

- GA4, Zaraz, or manual Cloudflare Web Analytics snippet support, once James chooses the stack and provides real configuration.
- Search Console ownership verification, if it requires an HTML tag, DNS record, or external account action outside the repo.
- Additional subject/problem pages such as relative clauses, commas in lists, plural possession, and spelling word list pages, after baseline data or product content evidence supports them.
- A public parent/tutor/school segmentation strategy, if organic data later shows the broad parent-support page is too general.
- Structured data beyond the existing product identity, unless a later page type clearly benefits and can be kept accurate.

---

## Context & Research

### Relevant Code and Patterns

- `scripts/lib/seo-practice-pages.mjs` defines the existing static practice-page registry, canonical root, HTML escaping, and page renderer.
- `scripts/lib/seo-identity-pages.mjs` defines the `/about/` identity page and shares escaping/canonical conventions with practice pages.
- `scripts/build-public.mjs` copies root assets, renders static SEO pages, copies `llms.txt`, versions bundles, and writes CSP hash artefacts.
- `scripts/assert-build-public.mjs` enforces public output presence, allowlist, sitemap contract, robots contract, JSON-LD expectations, and forbidden public SEO text.
- `_headers`, `scripts/lib/headers-drift.mjs`, and `tests/security-headers.test.js` define the cache and security-header contract for static public resources.
- `tests/build-public.test.js` is the main local contract for root SEO, practice pages, `/about/`, `llms.txt`, sitemap, robots, and public output safety.
- `scripts/production-bundle-audit.mjs` and `tests/bundle-audit.test.js` are the live-origin gate for proving public SEO URLs are not SPA fallback output.
- `index.html`, `src/surfaces/auth/AuthSurface.jsx`, and `tests/react-auth-boot.test.js` control the root public link graph and unauthenticated entry experience.
- `shared/punctuation/content.js`, `shared/punctuation/generators.js`, and `worker/src/subjects/grammar/content.js` show apostrophe capability exists in the product; V4 copy should stay at the public-practice level and avoid exposing internal content.
- `docs/operations/seo.md` already names likely next candidates, Search Console checks, Cloudflare Web Analytics posture, AI crawler checks, and the decision gate for later slices.

### Institutional Learnings

- `docs/solutions/workflow-issues/sys-hardening-p2-13-unit-autonomous-sprint-learnings-2026-04-26.md`: coupled public-output, allowlist, headers, and audit changes should land atomically because partial changes can leave production green locally but wrong live.
- `docs/solutions/architecture-patterns/admin-console-section-extraction-pattern-2026-04-27.md`: check existing Cloudflare/static routing before inventing Worker routes; public SEO pages should remain static assets unless evidence says otherwise.
- `docs/solutions/best-practices/p3-stability-capacity-multi-learner-patterns-2026-04-27.md`: prefer characterisation and measurement over assumptions, especially when the change affects observable user or operator state.
- `docs/solutions/architecture-patterns/punctuation-p7-stabilisation-contract-and-autonomous-sdlc-2026-04-28.md`: keep public contracts centralised enough that tests and implementation do not drift into false confidence.

### External References

- Google Search Console overview: `https://search.google.com/search-console/about`
- Google sitemap guidance: `https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap`
- Google Analytics and Search Console guidance: `https://developers.google.com/search/docs/monitor-debug/google-analytics-search-console`
- Cloudflare Web Analytics overview: `https://developers.cloudflare.com/web-analytics/`
- Cloudflare Web Analytics setup: `https://developers.cloudflare.com/web-analytics/get-started/`
- Cloudflare Web Analytics SPA tracking: `https://developers.cloudflare.com/web-analytics/get-started/web-analytics-spa/`
- Cloudflare bot custom rules: `https://developers.cloudflare.com/bots/additional-configurations/custom-rules/`
- Cloudflare managed robots.txt: `https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/`
- Cloudflare verified bots: `https://developers.cloudflare.com/bots/concepts/bot/verified-bots/`
- OpenAI crawler guidance: `https://platform.openai.com/docs/bots`

---

## Key Technical Decisions

- Add a small intent-page registry rather than folding every new page into the practice-page registry. Practice pages describe broad product areas; V4 pages target narrower query intents and should have their own data shape while sharing rendering utilities.
- Keep V4 public pages static and script-free. This follows V2/V3, avoids new Worker routes, keeps CSP risk low, and lets production audit detect SPA fallback regressions.
- Ship exactly three first intent pages: apostrophes practice for subject/problem intent, Year 5 spelling practice for year/subject intent, and grammar-at-home for parent-support intent.
- Treat page content as product-introduction copy, not curriculum reference material. The pages should explain how KS2 Mastery helps practise the topic and offer a path to the demo or home page.
- Update `llms.txt` and `/about/` to mention the new canonical pages, but do not turn `llms.txt` into a full content index or a bot-only alternative to HTML.
- Keep sitemap scope to canonical public HTML pages only. `llms.txt`, API paths, admin paths, demo paths, local URLs, and `.html` variants remain excluded.
- Record measurement setup and baseline observations in operations documentation, not product code, unless a real analytics snippet becomes necessary.
- Keep deployment posture unchanged. The repo remains a Cloudflare Worker/Static Assets deployment with main-branch production flow; V4 should not reopen branch-build settings or raw Wrangler authentication choices.

---

## Open Questions

### Resolved During Planning

- V4 content scope: use one subject/problem page, one year/subject page, and one parent-support page instead of many pages.
- Route shape: use static folder-index pages under canonical trailing-slash URLs.
- Measurement stack posture: Search Console plus Cloudflare Web Analytics first; no GA4, Zaraz, or manual snippet without real configuration.
- AI-readable posture: update `llms.txt` and public HTML together; do not rely on AI-only files.
- Copy safety posture: describe actual product practice support and avoid guarantees, full-curriculum claims, or private data references.

### Deferred to Implementation

- Exact page copy and headings, subject to the forbidden-claim and product-capability checks in this plan.
- Exact shared renderer structure: implementation can create `scripts/lib/seo-intent-pages.mjs` or a clearer shared public-page module if it reduces duplication without a broad refactor.
- Whether the root unauthenticated UI links to all three V4 pages directly or only links to an "explore practice" section that contains them; the final choice should preserve root clarity.
- Whether Cloudflare Web Analytics automatic setup is already active for `ks2.eugnel.uk`; this depends on dashboard state and may need James or authenticated dashboard access.

---

## High-Level Technical Design

> This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.

```mermaid
flowchart TB
  baseline["Measurement baseline docs"] --> gate["Next content decision gate"]
  practice["Existing practice SEO pages"] --> graph["Public link graph"]
  identity["About page"] --> graph
  intent["New intent-page registry"] --> build["Public build"]
  graph --> build
  llms["llms.txt"] --> build
  sitemap["sitemap.xml"] --> build
  headers["_headers"] --> build
  build --> output["dist/public"]
  output --> pages["Root + about + practice + intent pages"]
  output --> discovery["robots.txt + sitemap.xml + llms.txt"]
  pages --> audit["assert-build-public + production-bundle-audit"]
  discovery --> audit
  audit --> gate
```

---

## Implementation Units

- U1. **Measurement Baseline Runbook**

**Goal:** Make SEO measurement operational before more content is added, so James can record indexing, queries, page views, referrers, and next-slice decisions in one place.

**Requirements:** R1, R7, R8; F3; AE5, AE6.

**Dependencies:** None.

**Files:**
- Create: `docs/operations/seo-measurement-baseline.md`
- Modify: `docs/operations/seo.md`
- Create: `tests/seo-operations-doc.test.js`

**Approach:**
- Add a baseline document with a dated capture table for canonical URLs, Search Console indexing state, query metrics, landing page, clicks, CTR, average position, Cloudflare page views, referrer/source notes, and follow-up decision.
- Keep setup steps explicit enough for an operator, but do not include fake property IDs, verification tags, site tokens, or account-specific secrets.
- Update `docs/operations/seo.md` so the public surface list and production checks can grow with the V4 pages.
- Add a light documentation contract test that proves the baseline doc names the canonical public URLs, includes Search Console and Cloudflare Web Analytics fields, and does not contain placeholder token patterns.

**Test scenarios:**
- Happy path: `tests/seo-operations-doc.test.js` passes when the baseline doc includes root, about, three existing practice pages, and the three V4 intent-page URLs.
- Happy path: the baseline doc has fields for indexing state, impressions, clicks, CTR, average position, landing page, page views, referrers, and next decision.
- Error path: the doc test fails if placeholder analytics or verification tokens are introduced.
- Edge case: the runbook explicitly states that Worker observability is infrastructure telemetry, not organic acquisition analytics.

**Verification:** Operators have a durable place to record the first baseline and compare the next SEO slice against actual search and visitor signals.

---

- U2. **Intent Page Registry and Static Rendering**

**Goal:** Add a small generated static-page path for focused intent pages without bloating the existing practice-page registry or introducing Worker routes.

**Requirements:** R2, R3, R5, R6; F1, F2; AE1, AE2, AE3, AE4.

**Dependencies:** U1 can run independently, but U2 should be in place before link graph and audit work.

**Files:**
- Create: `scripts/lib/seo-intent-pages.mjs`
- Modify: `scripts/build-public.mjs`
- Modify: `scripts/assert-build-public.mjs`
- Modify: `_headers`
- Modify: `scripts/lib/headers-drift.mjs`
- Modify: `styles/app.css`
- Modify: `tests/build-public.test.js`
- Modify: `tests/security-headers.test.js`

**Approach:**
- Define one registry for V4 intent pages with slug, title, description, heading, intro, intent lane, proof points, CTA labels, and optional related public links.
- Render folder-index pages at `/ks2-apostrophes-practice/`, `/year-5-spelling-practice/`, and `/help-child-ks2-grammar-at-home/`.
- Reuse escaping, canonical root, metadata conventions, font/style imports, and static no-script page shape from V2/V3.
- Keep new styles additive and shared with the public SEO page layout; avoid a separate design system for these pages.
- Add public-output allowlist entries and header/cache coverage in the same unit as page generation.

**Test scenarios:**
- Happy path: the public build emits all three `index.html` files under the expected slugs.
- Happy path: each page has a unique title, meta description, canonical URL, Open Graph URL, H1, public explanatory copy, demo CTA, home/about links, and no JavaScript bundle.
- Error path: build assertions fail if any page includes `app.bundle.js`, `id="app"`, private paths, secret names, generated content tokens, or guaranteed ranking/recommendation claims.
- Edge case: header drift tests fail if the new HTML pages are missing the same no-store/static HTML header treatment as existing SEO pages.
- Integration: `tests/build-public.test.js` imports the intent registry rather than duplicating the slug list manually.

**Verification:** V4 intent pages are real static public HTML pages and are covered by the same local public-output guarantees as the existing SEO surface.

---

- U3. **First Intent Page Content and Public Link Graph**

**Goal:** Make the three V4 pages useful to humans and AI systems by connecting them from the existing public surface and keeping copy aligned with real product capability.

**Requirements:** R2, R4, R5, R8; F1, F2; AE1, AE2, AE4, AE6.

**Dependencies:** U2.

**Files:**
- Modify: `scripts/lib/seo-intent-pages.mjs`
- Modify: `scripts/lib/seo-practice-pages.mjs`
- Modify: `scripts/lib/seo-identity-pages.mjs`
- Modify: `index.html`
- Modify: `src/surfaces/auth/AuthSurface.jsx`
- Modify: `llms.txt`
- Modify: `tests/build-public.test.js`
- Modify: `tests/react-auth-boot.test.js`

**Approach:**
- Write `/ks2-apostrophes-practice/` as a subject/problem page covering contractions and possession at a public level, with a CTA into punctuation or demo practice.
- Write `/year-5-spelling-practice/` as a year/subject page for Year 5-appropriate spelling practice, word confidence, and online sessions, without claiming to publish a complete statutory list.
- Write `/help-child-ks2-grammar-at-home/` as a parent-support page that explains how a supporting adult can use short KS2 grammar practice at home, without exposing parent hub data or learner progress.
- Add related links from the broad practice pages and about page where natural, keeping the root page focused and not crowded.
- Update `llms.txt` to list the three new canonical intent pages and describe their role briefly.
- Keep all copy in UK English and avoid product claims that implementation cannot prove from current app behaviour.

**Test scenarios:**
- Happy path: each page includes its target intent phrase naturally and includes enough direct text for an AI assistant to identify what the page is for.
- Happy path: apostrophes page copy mentions contractions and possession while avoiding internal skill IDs or generator names.
- Happy path: Year 5 spelling page copy mentions Year 5 practice but does not claim a complete official word list, exam outcome, or full curriculum coverage.
- Happy path: grammar-at-home page copy speaks to supporting adults and at-home practice without exposing parent hub, learner records, or analytics.
- Integration: root/about/practice pages expose crawlable links to the new pages through canonical relative paths.
- Integration: `tests/react-auth-boot.test.js` verifies the unauthenticated app surface still renders the expected public links without changing sign-in/demo behaviour.
- Error path: forbidden-claim assertions reject `guaranteed`, `AI tutor`, `exam results`, `full curriculum`, and similar overclaims.

**Verification:** The V4 pages are discoverable from the public site, useful as standalone pages, and still funnel visitors into the existing product experience rather than inventing new app flows.

---

- U4. **Discovery Files, AI Summary, and Production Audit**

**Goal:** Extend the discovery and audit contracts so the live origin proves the new pages are canonical, listed, crawlable, and not replaced by SPA fallback output.

**Requirements:** R3, R4, R5, R6; F2, F3; AE3, AE4, AE5, AE6.

**Dependencies:** U2, U3.

**Files:**
- Modify: `sitemap.xml`
- Modify: `llms.txt`
- Modify: `scripts/assert-build-public.mjs`
- Modify: `scripts/production-bundle-audit.mjs`
- Modify: `scripts/lib/seo-crawler-policy.mjs`
- Modify: `tests/build-public.test.js`
- Modify: `tests/bundle-audit.test.js`

**Approach:**
- Add the three intent pages to the canonical sitemap and public-path audit set.
- Keep `llms.txt` out of the sitemap while listing it as a supplementary AI-readable resource from root HTML and operations docs.
- Extend production audit helpers so root, about, three broad practice pages, and three V4 intent pages all require page-specific metadata and visible page copy.
- Preserve current robots private-path exclusions for `/api/`, `/admin`, and `/demo`.
- Keep OAI-SearchBot visibility checks for public pages while treating GPTBot training access as a separate policy choice.
- Make tests assert exact sitemap membership rather than loose contains checks, so accidental duplicate or local URLs are caught.

**Test scenarios:**
- Happy path: sitemap contains exactly root, about, three practice pages, and three V4 intent-page canonical URLs.
- Happy path: production audit requires each V4 page to return `text/html`, a page-specific title, a canonical URL, H1, public copy token, demo/home path, and no root SPA shell markers.
- Error path: audit fails if any V4 page returns the root title, root canonical URL, `app.bundle.js`, `id="app"`, local URLs, `.html` variants, private paths, or forbidden implementation text.
- Edge case: robots policy still disallows private paths and does not block OAI-SearchBot from public SEO pages.
- Integration: bundle-audit tests use a local stub server that serves the expanded public graph, so production-audit logic is tested without relying on live network state.

**Verification:** Local and live-origin audits cover the expanded public SEO surface with exact canonical discovery contracts.

---

- U5. **Next-Slice Decision Gate**

**Goal:** Prevent V4 from becoming the start of uncontrolled page expansion by defining how James chooses the next SEO page after measurement has signal.

**Requirements:** R1, R7, R8; F3; AE5, AE6.

**Dependencies:** U1, U4.

**Files:**
- Modify: `docs/operations/seo.md`
- Modify: `docs/operations/seo-measurement-baseline.md`
- Modify: `tests/seo-operations-doc.test.js`

**Approach:**
- Add a short decision gate that ranks future pages by product fit, observed impressions, weak-click pages, crawl/indexing gaps, and support value.
- Keep likely follow-ups visible but deferred: relative clauses, commas in a list, plural possession, Year 5 spelling words/list pages, and additional parent-support topics.
- Define what is enough evidence to add a page versus improve an existing page: impressions with low CTR, indexed pages with no impressions, page views without conversion, or crawler/indexing errors.
- Add a "do not add yet" rule for pages that require unverified curriculum coverage, external source licensing, or private product data.

**Test scenarios:**
- Happy path: documentation includes a decision table for candidate, lane, evidence, action, and decision date.
- Happy path: the runbook preserves all four lanes from the origin document.
- Error path: doc test fails if the runbook says analytics directly improves ranking or if it encourages broad keyword chasing.
- Edge case: the runbook notes that external dashboards may lag after deployment and that absence of immediate data is not proof the page failed.

**Verification:** The next SEO slice can be chosen from recorded evidence and product fit, not from a growing list of speculative keywords.

---

## System-Wide Impact

- **Public output:** Adds three static HTML routes and updates exact output allowlists, headers, sitemap, and AI summary coverage.
- **Runtime app:** Only unauthenticated public links should change. Authenticated learner state, demo flow behaviour, admin, D1, R2, and subject runtimes should remain untouched.
- **Security/privacy:** Maintains CSP and private-path boundaries. No analytics script or verification token should be introduced without real configuration and privacy review.
- **SEO operations:** Adds baseline capture and decision gates so future work can be measured.
- **Deployment:** No change to Worker deployment scripts, Cloudflare Workers Builds triggers, or branch-build posture.

---

## Risks & Dependencies

- **Thin content risk:** The new pages may look like SEO filler if copy is too generic. Mitigation: anchor every page to a real product practice route, include specific but accurate subject framing, and cap the slice at three pages.
- **Overclaim risk:** Year 5 and parent-support copy could imply complete curriculum coverage or guaranteed outcomes. Mitigation: add forbidden-claim assertions and keep wording to practice support.
- **Drift risk:** Adding page slugs in several places can lead to sitemap, `llms.txt`, audit, and link graph mismatch. Mitigation: use an intent-page registry and import it into build/audit/test paths where practical.
- **Analytics uncertainty:** Cloudflare Web Analytics and Search Console setup depend on external dashboards and may not be verifiable from code alone. Mitigation: document setup state and leave code snippets deferred until real configuration exists.
- **Crawler policy uncertainty:** Cloudflare dashboard bot controls can override repo intent. Mitigation: keep production audit and operations checks explicit about managed robots, WAF, AI Crawl Control, and verified bot settings.
- **Deployment sensitivity:** The site runs through Cloudflare Worker/Static Assets production flow. Mitigation: avoid route rewrites, raw Wrangler changes, and branch-build setting changes in this content slice.

---

## Documentation / Operational Notes

- Update `docs/operations/seo.md` with the expanded canonical public surface, production checks, AI summary notes, and next-slice decision gate.
- Add `docs/operations/seo-measurement-baseline.md` as the operator-owned place to record first baseline and follow-up reviews.
- Record that Cloudflare Web Analytics automatic setup is preferred for `ks2.eugnel.uk`; manual snippet installation remains a later code slice if automatic setup is unavailable.
- Record that Search Console ownership verification and sitemap submission are external account actions and should not be represented by placeholder repo tokens.
- Keep all product copy in UK English.

---

## Sources & References

- Origin requirements: `docs/brainstorms/2026-04-28-ks2-seo-foundation-requirements.md`
- Prior V2 plan: `docs/plans/2026-04-28-003-feat-ks2-seo-measurement-practice-pages-plan.md`
- Prior V3 plan: `docs/plans/2026-04-28-004-feat-ks2-seo-ai-measurement-plan.md`
- Operations runbook: `docs/operations/seo.md`
- Existing public page registry: `scripts/lib/seo-practice-pages.mjs`
- Existing identity page registry: `scripts/lib/seo-identity-pages.mjs`
- Public build contract: `scripts/assert-build-public.mjs`
- Production audit: `scripts/production-bundle-audit.mjs`
- Google Search Console: `https://search.google.com/search-console/about`
- Google sitemap guidance: `https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap`
- Cloudflare Web Analytics: `https://developers.cloudflare.com/web-analytics/`
- Cloudflare bot controls: `https://developers.cloudflare.com/bots/additional-configurations/custom-rules/`
- OpenAI crawlers: `https://platform.openai.com/docs/bots`
