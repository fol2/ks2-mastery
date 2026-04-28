---
date: 2026-04-28
topic: ks2-seo-foundation
---

# KS2 SEO Foundation

## Summary

Define a crawlable, AI-readable SEO foundation for KS2 Mastery that can attract organic users, explain the product clearly to search and answer engines, and support later content expansion across practice-tool, subject/problem, and parent-support search intent.

---

## Problem Frame

KS2 Mastery currently behaves like a production app first and a public discovery surface second. The live site has an app shell, product title, manifest, icons, and strong operational/security headers, but the public HTML does not yet give search engines or AI assistants enough plain-language product identity to understand what the site is for, who it helps, and which KS2 practice areas it covers.

This matters because James wants organic user growth and wants AI search or assistant systems to have enough trustworthy page content to consider KS2 Mastery when answering relevant KS2 practice queries. Without a clear crawlable identity layer, the site can work well for direct users while remaining weak as a discovery target.

Evidence used during the brainstorm:

- `index.html`
- `manifest.webmanifest`
- `wrangler.jsonc`
- `worker/src/security-headers.js`
- `docs/plans/2026-04-22-001-refactor-full-stack-react-conversion-plan.md`
- Production checks against `https://ks2.eugnel.uk/`, `/robots.txt`, and `/sitemap.xml`
- Google Search Central guidance on sitemaps, JavaScript SEO, and Search Console / Analytics measurement
- Cloudflare guidance on Web Analytics, Zaraz, and Google Analytics integration

---

## Actors

- A1. Prospective KS2 learner or supporting adult: Finds the site through organic search or AI-assisted discovery and decides whether to try it.
- A2. Search crawler: Discovers, fetches, and indexes public pages and metadata.
- A3. AI search or assistant system: Reads public pages and available metadata to understand whether KS2 Mastery is a relevant recommendation.
- A4. James / product operator: Reviews discoverability, indexing, and organic traffic signals to decide where to invest next.
- A5. KS2 Mastery app: Provides the existing authenticated and demo product experience that public SEO surfaces should introduce without exposing private learner data.

---

## Key Flows

- F1. Public discovery and product understanding
  - **Trigger:** A crawler, AI search system, or prospective user reaches the public site.
  - **Actors:** A1, A2, A3, A5
  - **Steps:** The visitor or crawler receives a crawlable public identity surface, sees clear UK English copy describing the product and KS2 subjects covered, can identify the canonical public URL, and can move into the app or demo experience.
  - **Outcome:** The site is understandable without requiring a private login or relying only on JavaScript-rendered app state.
  - **Covered by:** R1, R2, R3, R4, R5, R6

- F2. Search engine discovery and validation
  - **Trigger:** Google or another crawler requests discovery files or follows known URLs.
  - **Actors:** A2, A4
  - **Steps:** The crawler can fetch valid discovery files, identify the intended canonical public pages, avoid private or non-public app surfaces where appropriate, and report indexing status through search tooling.
  - **Outcome:** James can verify whether the core public pages are discoverable and indexable.
  - **Covered by:** R7, R8, R9, R10, R15

- F3. Organic measurement and next-slice selection
  - **Trigger:** Public SEO foundation is live and traffic begins to appear.
  - **Actors:** A1, A3, A4
  - **Steps:** Measurement tools capture aggregate visitor and organic search signals, James reviews which search intents or pages show promise, and the next content slice is chosen from the documented acquisition lanes.
  - **Outcome:** Future SEO work is guided by observed demand rather than speculative content volume.
  - **Covered by:** R11, R12, R13, R14

---

## Requirements

**Public Product Identity**

- R1. The first release must create a public, crawlable identity layer that explains KS2 Mastery in plain UK English without requiring sign-in.
- R2. The public identity layer must clearly state that KS2 Mastery supports KS2 practice and currently covers spelling, grammar, and punctuation.
- R3. The public copy must describe the product by learner value and practice outcome, not only by app features or internal module names.
- R4. The public identity layer must be useful to both humans and AI systems: it should contain enough direct text for an assistant to summarise what the product does, who it helps, and when it is relevant.
- R5. The public entry must provide a clear path into the existing product experience, such as the app home or demo flow, without exposing private learner state or authenticated content.
- R6. The first release should prioritise one strong public identity surface over many thin pages.

**Technical SEO Foundation**

- R7. The site must expose valid crawler discovery files for the public SEO surface, including a valid robots policy and sitemap discovery path.
- R8. The core public page or pages must have search-friendly metadata, including descriptive titles, descriptions, canonical identity, and social/share preview metadata where relevant.
- R9. The public SEO surface must avoid accidental duplicate identities for the same content.
- R10. The SEO foundation must account for the existing single-page app shape so crawlers are not forced to infer product identity from a sparse app shell alone.
- R11. The foundation must preserve existing app security, privacy, authentication, demo, and learner-state boundaries.

**Measurement and Validation**

- R12. The release must make Search Console-style validation possible for discovery, indexing, and organic query performance.
- R13. The release must include or prepare for privacy-conscious aggregate visitor analytics so James can distinguish organic traffic from other traffic sources.
- R14. Measurement must be treated as decision support for SEO, not as a ranking mechanism in itself.
- R15. Production validation must verify that the live site returns the intended public SEO files and metadata, not only that local build output looks correct.

**Future Content Lanes**

- R16. The requirements must preserve four future acquisition lanes: practice-tool intent, subject/problem intent, parent-support intent, and AI-readable product identity.
- R17. The first release must not commit to a large content programme, but it must leave a clear path for adding focused content pages later.
- R18. Later content pages should be selected based on likely organic value, product fit, and observed measurement signals rather than broad keyword coverage alone.
- R19. Future SEO content must stay aligned with the product's actual capabilities and avoid overstating coverage, outcomes, or recommendation guarantees.

---

## Acceptance Examples

- AE1. **Covers R1, R2, R3, R4.** Given a user or AI assistant opens the public site without signing in, when it reads the public page content, it can identify KS2 Mastery as a KS2 spelling, grammar, and punctuation practice product and explain who it is for.
- AE2. **Covers R5, R11.** Given a prospective visitor reaches the public identity surface, when they choose to try the product, they can move into the existing app or demo path without seeing private learner data.
- AE3. **Covers R7, R8, R9, R15.** Given a crawler requests the site's discovery and core public pages in production, when the responses are inspected, they return valid SEO resources and metadata rather than only the generic app shell.
- AE4. **Covers R10.** Given a crawler does not rely on completing an authenticated app flow, when it fetches the public site, it still receives enough crawlable text to understand the product's purpose.
- AE5. **Covers R12, R13, R14.** Given the SEO foundation is live, when James reviews search and visitor data, he can see whether organic discovery is beginning to work without treating analytics installation as an SEO ranking factor.
- AE6. **Covers R16, R17, R18, R19.** Given the first release is complete, when the next SEO slice is planned, the team can choose a focused practice-tool, subject/problem, or parent-support page without rewriting the identity foundation.

---

## Success Criteria

- Search engines can fetch and understand the site's core public SEO surface without relying only on the private or interactive app experience.
- AI search and assistant systems have enough public, direct, accurate text to understand when KS2 Mastery may be relevant.
- James can submit or inspect the site in search tooling and see a clean foundation for discovery, indexing, and organic query measurement.
- The first release increases SEO readiness without creating a high-maintenance content backlog.
- Planning can proceed without inventing the audience, first-release priority, intent lanes, measurement goal, or scope exclusions.

---

## Scope Boundaries

- Do not build a large blog or content farm in the first release.
- Do not promise that Google, AI search, or assistants will recommend the site; the goal is to improve discoverability and understandability.
- Do not build paid advertising, school sales funnels, CRM flows, or conversion automation in this release.
- Do not create separate first-release funnels for parents, tutors, and schools.
- Do not expose private learner data, authenticated read models, admin surfaces, or internal analytics as public SEO content.
- Do not treat Google Analytics or any analytics tag as a direct ranking improvement.
- Do not weaken existing security headers, privacy posture, demo safeguards, learner-state boundaries, or deployment controls for SEO convenience.
- Do not chase every KS2 keyword in V1; establish the foundation first.

---

## Key Decisions

- Start with AI-readable product identity: This is the highest-leverage first slice because search and AI systems need a clear public explanation before later content pages can compound.
- Keep the initial audience broad: The first release should support broad KS2 learner support rather than separate parent, tutor, and school funnels.
- Preserve four acquisition lanes for later: Practice-tool, subject/problem, parent-support, and product-identity intent should all remain future options.
- Treat technical SEO and measurement as foundation work: Discovery files, metadata, canonical identity, production validation, and search/visitor measurement support growth but do not replace useful content.
- Prefer one strong public identity surface in V1: A focused, accurate identity layer is more valuable than many thin pages that increase maintenance and quality risk.
- Keep privacy central: Because the product is education and learner-facing, analytics and public content should be aggregate, cautious, and aligned with the existing production-sensitive boundaries.

---

## Dependencies / Assumptions

- The existing product experience, including demo entry, remains the destination behind the public SEO surface.
- Google Search Console or equivalent search tooling will be available to validate indexing and query performance after release.
- Cloudflare-hosted measurement options may be preferable for the first aggregate visitor analytics layer because they can reduce third-party script and privacy overhead, but the exact choice belongs in planning.
- Any Google Analytics or tag-management setup must be assessed against privacy, consent, and existing CSP/security constraints during planning.
- Search and AI recommendations depend on external systems; the product can improve crawlability, clarity, and evidence, but cannot guarantee recommendation placement.

---

## Outstanding Questions

### Resolve Before Planning

- None.

### Deferred to Planning

- [Affects R1, R5, R10][Technical] Decide whether the first public identity surface should be integrated into the current root experience, served as a distinct public page, or handled through another route shape that preserves the existing app flow.
- [Affects R7, R8, R9, R15][Technical] Define the exact production validation checks for discovery files, metadata, canonical identity, and crawler-visible text.
- [Affects R12, R13, R14][Needs research] Choose the first measurement stack and consent/privacy posture, comparing Search Console, Cloudflare Web Analytics, Zaraz, and Google Analytics.
- [Affects R16, R17, R18][Needs research] Select the first post-foundation content slice using keyword opportunity, product fit, and early measurement evidence.

---

## Next Steps

-> /ce-plan for structured implementation planning.
